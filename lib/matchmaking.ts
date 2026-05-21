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
  // Persist the queue entry in Postgres (upsert in case they re-queue)
  await prisma.queueEntry.upsert({
    where: { userId },
    create: { userId, myChampion, vsChampion, eloBracket },
    update: { myChampion, vsChampion, eloBracket },
  });

  // The mirror key: someone who wants to play vsChampion vs myChampion
  const mirrorKey = queueKey(eloBracket, vsChampion, myChampion);
  const myKey = queueKey(eloBracket, myChampion, vsChampion);

  // SRANDMEMBER returns one random userId from the mirror set
  const opponentId = await redis.srandmember(mirrorKey);

  if (!opponentId || opponentId === userId) {
    // No compatible opponent — add self to queue
    await redis.sadd(myKey, userId);
    return null;
  }

  // Atomically remove both from their keys
  const removed = await redis.srem(mirrorKey, opponentId);
  if (removed === 0) {
    // Someone else snagged the opponent first — add self to queue
    await redis.sadd(myKey, userId);
    return null;
  }
  await redis.srem(myKey, userId);

  // Load both users
  const [me, opponent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.user.findUnique({ where: { id: opponentId } }),
  ]);

  if (!me || !opponent) {
    // Data inconsistency — re-queue self
    await redis.sadd(myKey, userId);
    return null;
  }

  // Remove queue entries from Postgres
  await prisma.queueEntry.deleteMany({
    where: { userId: { in: [userId, opponentId] } },
  });

  // Create a Match record
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
    redis.publish(matchChannel(userId), JSON.stringify(resultForMe)),
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
