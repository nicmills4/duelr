/**
 * Server-only lobby utilities.
 * Stores availability and challenge state in Redis with TTL-based expiry.
 */
import { redis } from "./redis";
import { prisma } from "./prisma";
import type { LobbyEntry, LobbyPlayer, ChallengePayload, AcceptsType } from "./lobby-types";

export type { AcceptsType, LobbyPlayer, LobbyEntry, ChallengePayload };

export const LOBBY_TTL    = 60 * 60; // 1 hour
const        CHALLENGE_TTL = 45;    // 45 seconds

const MEMBERS_KEY = "lobby:members";
export const lobbyKey = (uid: string) => `lobby:player:${uid}`;
const challengeKey = (id: string) => `lobby:challenge:${id}`;

// ── Availability ──────────────────────────────────────────────────────────────

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
      where: { id: { in: userIds } },
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

  // Lazily prune expired entries from the members set
  if (stale.length > 0) redis.srem(MEMBERS_KEY, ...stale).catch(() => {});

  return players.sort((a, b) => b.joinedAt - a.joinedAt); // newest first
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
