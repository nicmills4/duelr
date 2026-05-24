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
const groupKey     = (gid: string)   => `lobby:group:${gid}`;
const userGroupKey = (uid: string)   => `lobby:user:group:${uid}`;
const challengeKey = (id: string)    => `lobby:challenge:${id}`;

// ── 1v1 Availability ──────────────────────────────────────────────────────────

export async function setLobbyAvailable(
  userId: string,
  entry: Omit<LobbyEntry, "userId" | "joinedAt">
): Promise<void> {
  const full: LobbyEntry = { ...entry, userId, joinedAt: Date.now() };
  await Promise.all([
    redis.setex(lobbyKey(userId), LOBBY_TTL, JSON.stringify(full)),
    redis.sadd(MEMBERS_KEY, userId),
  ]);
}

export async function leaveLobby(userId: string): Promise<void> {
  await Promise.all([
    redis.del(lobbyKey(userId)),
    redis.srem(MEMBERS_KEY, userId),
  ]);
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
      select: { id: true, riotId: true, region: true },
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
    });
  });

  if (stale.length > 0) redis.srem(MEMBERS_KEY, ...stale).catch(() => {});

  return players.sort((a, b) => b.joinedAt - a.joinedAt);
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
 * Fills a slot in a group. Returns the updated group and whether it is now full.
 * If full, removes the group from the joinable set and cleans up all user-group keys.
 */
export async function joinLobbyGroup(
  userId:  string,
  groupId: string,
  slotKey: SlotKey,
  slot:    Omit<GroupSlot, "isHost">
): Promise<{ group: LobbyGroup; isFull: boolean }> {
  const raw = await redis.get(groupKey(groupId));
  if (!raw) throw new Error("Group not found or expired");

  const group = JSON.parse(raw) as LobbyGroup;
  if (group[slotKey] !== null) throw new Error("That slot is already taken");

  // Check user isn't already in this group
  for (const k of ALL_SLOTS) {
    if (group[k]?.userId === userId) throw new Error("You are already in this group");
  }

  group[slotKey] = { ...slot, isHost: false };
  const isFull = groupIsFull(group);

  const pipeline = redis.pipeline();
  if (isFull) {
    // Remove from joinable set; keep data briefly for match-result storage
    pipeline.srem(GROUPS_KEY, groupId);
    pipeline.del(groupKey(groupId));
    for (const k of ALL_SLOTS) {
      const m = group[k];
      if (m) pipeline.del(userGroupKey(m.userId));
    }
  } else {
    pipeline.setex(groupKey(groupId), LOBBY_TTL, JSON.stringify(group));
    pipeline.setex(userGroupKey(userId), LOBBY_TTL, groupId);
  }
  await pipeline.exec();

  return { group, isFull };
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
