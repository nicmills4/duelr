import { redis, queueKey, matchChannel } from "./redis";
import { prisma } from "./prisma";
export type { EloBracket } from "./constants";
import type { EloBracket } from "./constants";

export interface MatchResult {
  matchId: string;
  opponent: {
    riotId: string;
    region: string;
    champion: string; // opponent's champion
  };
  myChampion: string;
}

/**
 * Attempts to find a match for the given queue entry.
 * On success: creates a Match record, removes both users from the queue,
 * publishes to both users' match channels, and returns the MatchResult.
 * On no match: adds the user to the Redis queue and returns null.
 */
export async function joinQueueAndMatch(
  userId: string,
  myChampion: string,
  vsChampion: string,
  eloBracket: EloBracket
): Promise<MatchResult | null> {
  const mirrorKey = queueKey(eloBracket, vsChampion, myChampion);
  const myKey     = queueKey(eloBracket, myChampion, vsChampion);

  // Before upserting, evict from any previous Redis queue slot so the
  // old key doesn't accumulate ghost entries when the user changes their
  // champion selection.
  const existingEntry = await prisma.queueEntry.findUnique({ where: { userId } });
  if (existingEntry) {
    const oldKey = queueKey(
      existingEntry.eloBracket,
      existingEntry.myChampion,
      existingEntry.vsChampion
    );
    if (oldKey !== myKey) {
      await redis.srem(oldKey, userId);
    }
  }

  // Persist / update the queue entry in Postgres
  await prisma.queueEntry.upsert({
    where:  { userId },
    create: { userId, myChampion, vsChampion, eloBracket },
    update: { myChampion, vsChampion, eloBracket },
  });

  // SRANDMEMBER returns one random userId from the mirror set
  const opponentId = await redis.srandmember(mirrorKey);

  if (!opponentId || opponentId === userId) {
    // No compatible opponent — add self to queue
    await redis.sadd(myKey, userId);
    return null;
  }

  // Atomically claim the opponent — if another request got there first,
  // SREM returns 0 and we fall back to waiting in queue.
  const removed = await redis.srem(mirrorKey, opponentId);
  if (removed === 0) {
    await redis.sadd(myKey, userId);
    return null;
  }

  // Remove the current user from their own key in case they were already
  // sitting there from a previous (unchanged) queue attempt.
  await redis.srem(myKey, userId);

  // Load both users — wrap in try/catch so a DB hiccup doesn't leave
  // the opponent permanently removed from the queue with no match.
  let me, opponent;
  try {
    [me, opponent] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: opponentId } }),
    ]);
  } catch {
    // DB error — restore both to the queue and bail
    await Promise.all([
      redis.sadd(myKey, userId),
      redis.sadd(mirrorKey, opponentId),
    ]);
    return null;
  }

  if (!me || !opponent) {
    // Data inconsistency — restore whoever is valid, re-queue self
    if (opponent) await redis.sadd(mirrorKey, opponentId);
    await redis.sadd(myKey, userId);
    return null;
  }

  // Remove queue entries from Postgres and create the match record.
  // If this throws, both users are already out of Redis — they'll need
  // to re-queue, which is acceptable (far better than a silent hang).
  await prisma.queueEntry.deleteMany({
    where: { userId: { in: [userId, opponentId] } },
  });

  const match = await prisma.match.create({
    data: {
      playerAId: userId,
      playerBId: opponentId,
      champA: myChampion,
      champB: vsChampion,
      eloBracket,
    },
  });

  const resultForMe: MatchResult = {
    matchId: match.id,
    opponent: { riotId: opponent.riotId, region: opponent.region, champion: vsChampion },
    myChampion,
  };

  const resultForOpponent: MatchResult = {
    matchId: match.id,
    opponent: { riotId: me.riotId, region: me.region, champion: myChampion },
    myChampion: vsChampion,
  };

  // Notify both users via Redis pub/sub
  await Promise.all([
    redis.publish(matchChannel(userId),     JSON.stringify(resultForMe)),
    redis.publish(matchChannel(opponentId), JSON.stringify(resultForOpponent)),
  ]);

  return resultForMe;
}

export async function leaveQueue(userId: string): Promise<void> {
  const entry = await prisma.queueEntry.findUnique({ where: { userId } });
  if (!entry) return;

  const key = queueKey(entry.eloBracket, entry.myChampion, entry.vsChampion);
  await Promise.all([
    redis.srem(key, userId),
    prisma.queueEntry.delete({ where: { userId } }),
  ]);
}
