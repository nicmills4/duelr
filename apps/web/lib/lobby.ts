/**
 * Server-only lobby utilities.
 * Stores availability and challenge state in Redis with TTL-based expiry.
 */
import { redis } from "./redis";
import { prisma } from "./prisma";
import type {
  LobbyEntry, LobbyPlayer, ChallengePayload, AcceptsType,
  LobbyGroup, GroupSlot, SlotKey,
} from "./lobby-types";
import { ALL_SLOTS, groupIsFull } from "./lobby-types";

export type { AcceptsType, LobbyPlayer, LobbyEntry, ChallengePayload };
export type { LobbyGroup, GroupSlot, SlotKey };

export const LOBBY_TTL    = 60 * 60; // 1 hour
const        CHALLENGE_TTL = 45;     // 45 seconds

const MEMBERS_KEY  = "lobby:members";
const GROUPS_KEY   = "lobby:groups";
export const lobbyKey     = (uid: string)   => `lobby:player:${uid}`;
const riotIdKey    = (riotId: string) => `lobby:riotid:${riotId}`;
const groupKey     = (gid: string)   => `lobby:group:${gid}`;
const userGroupKey = (uid: string)   => `lobby:user:group:${uid}`;
const challengeKey = (id: string)    => `lobby:challenge:${id}`;

// ── 1v1 Availability ──────────────────────────────────────────────────────────

export async function setLobbyAvailable(
  userId: string,
  riotId: string,
  entry: Omit<LobbyEntry, "userId" | "joinedAt">
): Promise<void> {
  // Evict any existing lobby posted under the same Riot ID (different userId).
  // This prevents duplicate rows when the same player posts from both the
  // web app and the desktop app simultaneously.
  const existingUserId = await redis.get(riotIdKey(riotId));
  if (existingUserId && existingUserId !== userId) {
    await Promise.all([
      redis.del(lobbyKey(existingUserId)),
      redis.srem(MEMBERS_KEY, existingUserId),
    ]);
  }

  const full: LobbyEntry = { ...entry, userId, joinedAt: Date.now() };
  await Promise.all([
    redis.setex(lobbyKey(userId), LOBBY_TTL, JSON.stringify(full)),
    redis.sadd(MEMBERS_KEY, userId),
    redis.setex(riotIdKey(riotId), LOBBY_TTL, userId),
  ]);
}

export async function leaveLobby(userId: string, riotId?: string): Promise<void> {
  const ops: Promise<unknown>[] = [
    redis.del(lobbyKey(userId)),
    redis.srem(MEMBERS_KEY, userId),
  ];
  if (riotId) ops.push(redis.del(riotIdKey(riotId)));
  await Promise.all(ops);
}

export async function isInLobby(userId: string): Promise<boolean> {
  const ttl = await redis.ttl(lobbyKey(userId));
  return ttl > 0;
}

export async function getLobbyPlayers(): Promise<LobbyPlayer[]> {
  const userIds = await redis.smembers(MEMBERS_KEY);
  if (userIds.length === 0) return [];

  const [rawEntries, users] = await Promise.all([
    redis.mget(...userIds.map(lobbyKey)),
    prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, riotId: true, region: true, isPremium: true },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const stale: string[] = [];
  const players: LobbyPlayer[] = [];

  rawEntries.forEach((raw, i) => {
    const uid = userIds[i];
    if (!raw) { stale.push(uid); return; }
    const user = userMap.get(uid);
    if (!user) { stale.push(uid); return; }
    players.push({
      ...(JSON.parse(raw) as LobbyEntry),
      riotId: user.riotId,
      region: user.region,
      isPremium: user.isPremium,
    });
  });

  if (stale.length > 0) redis.srem(MEMBERS_KEY, ...stale).catch(() => {});

  // Featured lobby: premium players are served first (sorted to the top),
  // then most-recently-available within each tier.
  return players.sort((a, b) => {
    if (!!a.isPremium !== !!b.isPremium) return a.isPremium ? -1 : 1;
    return b.joinedAt - a.joinedAt;
  });
}

// ── 2v2 Groups ────────────────────────────────────────────────────────────────

export async function createLobbyGroup(
  userId:     string,
  slotKey:    SlotKey,
  slot:       Omit<GroupSlot, "isHost">,
  eloBracket: string
): Promise<LobbyGroup> {
  const groupId = crypto.randomUUID();
  const group: LobbyGroup = {
    groupId,
    eloBracket,
    createdAt:     Date.now(),
    team1_adc:     null,
    team1_support: null,
    team2_adc:     null,
    team2_support: null,
  };
  group[slotKey] = { ...slot, isHost: true };

  await Promise.all([
    redis.setex(groupKey(groupId), LOBBY_TTL, JSON.stringify(group)),
    redis.sadd(GROUPS_KEY, groupId),
    redis.setex(userGroupKey(userId), LOBBY_TTL, groupId),
  ]);

  return group;
}

/**
 * Lua script that atomically reads, validates, and writes a group slot.
 *
 * Using a Lua script makes the entire read-check-write a single atomic Redis
 * operation, eliminating the race condition where two users could both see a
 * slot as empty and both write themselves into it.
 *
 * KEYS[1] = groupKey(groupId)      — the group hash
 * KEYS[2] = GROUPS_KEY             — the joinable-groups set
 * KEYS[3] = userGroupKey(userId)   — reverse-lookup for the joining user
 *
 * ARGV[1] = slotKey                — which slot to fill
 * ARGV[2] = slot JSON              — GroupSlot object (serialised)
 * ARGV[3] = userId                 — the joining user's ID
 * ARGV[4] = groupId                — needed when removing from GROUPS_KEY
 * ARGV[5] = ttl (seconds)          — for SETEX
 *
 * Returns: JSON string { group: LobbyGroup, isFull: 0|1 }
 * Errors:  NOT_FOUND | SLOT_TAKEN | ALREADY_IN_GROUP
 */
const JOIN_GROUP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return redis.error_reply('NOT_FOUND') end

local group   = cjson.decode(raw)
local slotKey = ARGV[1]

local existing = group[slotKey]
if existing ~= nil and existing ~= cjson.null then
  return redis.error_reply('SLOT_TAKEN')
end

local userId   = ARGV[3]
local allSlots = {'team1_adc', 'team1_support', 'team2_adc', 'team2_support'}

for _, k in ipairs(allSlots) do
  local s = group[k]
  if type(s) == 'table' and s.userId == userId then
    return redis.error_reply('ALREADY_IN_GROUP')
  end
end

group[slotKey] = cjson.decode(ARGV[2])

local isFull = true
for _, k in ipairs(allSlots) do
  local s = group[k]
  if s == nil or s == cjson.null then isFull = false; break end
end

local groupId = ARGV[4]
local ttl     = tonumber(ARGV[5])

if isFull then
  redis.call('SREM', KEYS[2], groupId)
  redis.call('DEL',  KEYS[1])
  for _, k in ipairs(allSlots) do
    local s = group[k]
    if type(s) == 'table' and s.userId then
      redis.call('DEL', 'lobby:user:group:' .. tostring(s.userId))
    end
  end
else
  redis.call('SETEX', KEYS[1], ttl, cjson.encode(group))
  redis.call('SETEX', KEYS[3], ttl, groupId)
end

return cjson.encode({group = group, isFull = isFull and 1 or 0})
`;

/**
 * Fills a slot in a group. The entire read-check-write is performed as a
 * single atomic Lua script so two concurrent requests cannot claim the same
 * slot. Returns the updated group and whether it is now full.
 */
export async function joinLobbyGroup(
  userId:  string,
  groupId: string,
  slotKey: SlotKey,
  slot:    Omit<GroupSlot, "isHost">
): Promise<{ group: LobbyGroup; isFull: boolean }> {
  const slotData: GroupSlot = { ...slot, isHost: false };

  let raw: string;
  try {
    raw = await redis.eval(
      JOIN_GROUP_SCRIPT,
      3,
      groupKey(groupId),    // KEYS[1]
      GROUPS_KEY,           // KEYS[2]
      userGroupKey(userId), // KEYS[3]
      slotKey,              // ARGV[1]
      JSON.stringify(slotData), // ARGV[2]
      userId,               // ARGV[3]
      groupId,              // ARGV[4]
      String(LOBBY_TTL),    // ARGV[5]
    ) as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NOT_FOUND"))       throw new Error("Group not found or expired");
    if (msg.includes("SLOT_TAKEN"))      throw new Error("That slot is already taken");
    if (msg.includes("ALREADY_IN_GROUP")) throw new Error("You are already in this group");
    throw err;
  }

  const parsed = JSON.parse(raw) as { group: LobbyGroup; isFull: 0 | 1 };
  return { group: parsed.group, isFull: parsed.isFull === 1 };
}

/**
 * Removes a user from their current group.
 * If they were the host, the group is disbanded and remaining members are returned.
 * Returns { disbanded, remainingMembers, group }.
 */
export async function leaveLobbyGroup(userId: string): Promise<{
  disbanded:        boolean;
  remainingMembers: GroupSlot[];
  group:            LobbyGroup | null;
}> {
  const groupId = await redis.get(userGroupKey(userId));
  if (!groupId) return { disbanded: false, remainingMembers: [], group: null };

  const raw = await redis.get(groupKey(groupId));
  if (!raw) {
    await redis.del(userGroupKey(userId));
    return { disbanded: false, remainingMembers: [], group: null };
  }

  const group = JSON.parse(raw) as LobbyGroup;
  const isHost = ALL_SLOTS.some((k) => group[k]?.userId === userId && group[k]?.isHost);

  // Remove this user's slot
  for (const k of ALL_SLOTS) {
    if (group[k]?.userId === userId) group[k] = null;
  }

  const remaining = ALL_SLOTS.map((k) => group[k]).filter(Boolean) as GroupSlot[];

  if (isHost || remaining.length === 0) {
    // Disband
    const pipeline = redis.pipeline();
    pipeline.srem(GROUPS_KEY, groupId);
    pipeline.del(groupKey(groupId));
    pipeline.del(userGroupKey(userId));
    for (const m of remaining) pipeline.del(userGroupKey(m.userId));
    await pipeline.exec();
    return { disbanded: true, remainingMembers: remaining, group };
  }

  // Just remove the user
  await Promise.all([
    redis.setex(groupKey(groupId), LOBBY_TTL, JSON.stringify(group)),
    redis.del(userGroupKey(userId)),
  ]);
  return { disbanded: false, remainingMembers: remaining, group };
}

export async function getUserLobbyGroup(userId: string): Promise<LobbyGroup | null> {
  const groupId = await redis.get(userGroupKey(userId));
  if (!groupId) return null;
  const raw = await redis.get(groupKey(groupId));
  return raw ? (JSON.parse(raw) as LobbyGroup) : null;
}

export async function getLobbyGroups(): Promise<LobbyGroup[]> {
  const groupIds = await redis.smembers(GROUPS_KEY);
  if (groupIds.length === 0) return [];

  const raws  = await redis.mget(...groupIds.map(groupKey));
  const stale: string[] = [];
  const groups: LobbyGroup[] = [];

  raws.forEach((raw, i) => {
    if (!raw) { stale.push(groupIds[i]); return; }
    groups.push(JSON.parse(raw) as LobbyGroup);
  });

  if (stale.length > 0) redis.srem(GROUPS_KEY, ...stale).catch(() => {});

  return groups.sort((a, b) => b.createdAt - a.createdAt);
}

// ── Ready groups (post-fill) ────────────────────────────────────────────────────
// A 2v2 group is deleted from Redis the moment it fills (see JOIN_GROUP_SCRIPT),
// so there is no durable record to hang a custom-game invite link on. We persist
// a lightweight "ready group" keyed by its own id: the host (group creator)
// generates the League join URL via the desktop LCU bridge and posts it here,
// and the server fans it out to the other members over SSE.

const readyGroupKey = (id: string) => `lobby:readygroup:${id}`;

export interface ReadyGroup {
  readyGroupId:     string;
  hostUserId:       string;
  memberUserIds:    string[];
  joinUrl:          string | null;
  voiceChannelUrl?: string;
  createdAt:        number;
}

export async function createReadyGroup(
  hostUserId:    string,
  memberUserIds: string[],
  voiceChannelUrl?: string
): Promise<ReadyGroup> {
  const readyGroupId = crypto.randomUUID();
  const rg: ReadyGroup = {
    readyGroupId, hostUserId, memberUserIds,
    joinUrl: null, voiceChannelUrl, createdAt: Date.now(),
  };
  await redis.setex(readyGroupKey(readyGroupId), LOBBY_TTL, JSON.stringify(rg));
  return rg;
}

export async function getReadyGroup(id: string): Promise<ReadyGroup | null> {
  const raw = await redis.get(readyGroupKey(id));
  return raw ? (JSON.parse(raw) as ReadyGroup) : null;
}

/** Sets the join URL once (first write wins). Returns the updated record, or null if missing. */
export async function setReadyGroupJoinUrl(id: string, joinUrl: string): Promise<ReadyGroup | null> {
  const rg = await getReadyGroup(id);
  if (!rg) return null;
  if (rg.joinUrl) return rg; // already set — don't overwrite
  rg.joinUrl = joinUrl;
  await redis.setex(readyGroupKey(id), LOBBY_TTL, JSON.stringify(rg));
  return rg;
}

// ── Challenges ────────────────────────────────────────────────────────────────

export async function createChallenge(
  data: Omit<ChallengePayload, "challengeId">
): Promise<string> {
  const challengeId = crypto.randomUUID();
  const full: ChallengePayload = { ...data, challengeId };
  await redis.setex(challengeKey(challengeId), CHALLENGE_TTL, JSON.stringify(full));
  return challengeId;
}

export async function getChallenge(id: string): Promise<ChallengePayload | null> {
  const raw = await redis.get(challengeKey(id));
  return raw ? (JSON.parse(raw) as ChallengePayload) : null;
}

export async function deleteChallenge(id: string): Promise<void> {
  await redis.del(challengeKey(id));
}
