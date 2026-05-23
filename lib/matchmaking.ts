import { redis, queueKey, matchChannel } from "./redis";
import { prisma } from "./prisma";
import { isWildcard, wildcardKeysFor } from "./champion-types";
import { getChampionType } from "./champion-cache";
export type { EloBracket } from "./constants";
import { BRACKET_ORDER } from "./constants";
import type { EloBracket } from "./constants";

export interface MatchResult {
  matchId: string;
  opponent: {
    riotId: string;
    region: string;
    champion: string;
  };
  myChampion: string;
}

/**
 * Attempts to find a match for the given queue entry.
 *
 * Wildcard vsChampion values (_any, _any_melee, _any_ranged) are supported:
 *   - Wildcard players just add themselves to the queue; they are found by
 *     non-wildcard players who check the relevant wildcard key.
 *   - Non-wildcard players check: exact mirror → _any → _any_{their type}.
 *
 * On success: creates a Match record, clears both queue slots, publishes to
 * both users' match channels, and returns the MatchResult for the caller.
 * On no match: adds the caller to the queue and returns null.
 */
/** Returns the bracket one step above the given one, or null if already apex. */
function nextEloBracket(bracket: EloBracket): EloBracket | null {
  const idx = BRACKET_ORDER.indexOf(bracket);
  return idx >= 0 && idx < BRACKET_ORDER.length - 1
    ? BRACKET_ORDER[idx + 1]
    : null;
}

/**
 * @param counterBonus  When true and vsChampion is a concrete champion (not a
 *                      wildcard), the search is expanded to also include the
 *                      next elo bracket up. Use when myChampion has a >51%
 *                      win-rate advantage into vsChampion.
 */
export async function joinQueueAndMatch(
  userId: string,
  myChampion: string,
  vsChampion: string,
  eloBracket: EloBracket,
  counterBonus = false
): Promise<MatchResult | null> {
  const myKey = queueKey(eloBracket, myChampion, vsChampion);

  // ── Clear stale Redis slot from any previous queue entry ─────────────────
  const existingEntry = await prisma.queueEntry.findUnique({ where: { userId } });
  if (existingEntry) {
    const oldKey = queueKey(
      existingEntry.eloBracket,
      existingEntry.myChampion,
      existingEntry.vsChampion
    );
    if (oldKey !== myKey) await redis.srem(oldKey, userId);
  }

  // ── Persist / update queue entry ──────────────────────────────────────────
  await prisma.queueEntry.upsert({
    where:  { userId },
    create: { userId, myChampion, vsChampion, eloBracket },
    update: { myChampion, vsChampion, eloBracket },
  });

  // ── Wildcard players just wait — they are claimed by non-wildcard joiners ─
  if (isWildcard(vsChampion)) {
    await redis.sadd(myKey, userId);
    return null;
  }

  // ── Build the list of keys to scan for a compatible opponent ─────────────
  // Key pattern: queue:{elo}:{vsChampion}:{theirVsChampion}
  //   - exact:    they play vsChampion, they want myChampion
  //   - _any:     they play vsChampion, they want any opponent
  //   - _any_X:   they play vsChampion, they want any opponent of my attack type
  const exactKey  = queueKey(eloBracket, vsChampion, myChampion);
  const myType    = await getChampionType(myChampion); // null on DDragon error
  const wildcards = myType ? wildcardKeysFor(myType) : ["_any" as const];
  const extraKeys = wildcards.map((w) => queueKey(eloBracket, vsChampion, w));

  // Counter-bonus: also scan the next bracket up for concrete matchups only
  const bonusKeys: string[] = [];
  if (counterBonus && !isWildcard(vsChampion)) {
    const nextBracket = nextEloBracket(eloBracket);
    if (nextBracket) {
      bonusKeys.push(
        queueKey(nextBracket, vsChampion, myChampion),
        ...wildcards.map((w) => queueKey(nextBracket, vsChampion, w))
      );
    }
  }

  const keysToCheck = [exactKey, ...extraKeys, ...bonusKeys];

  // ── Try each key; first atomic claim wins ─────────────────────────────────
  for (const checkKey of keysToCheck) {
    const opponentId = await redis.srandmember(checkKey);
    if (!opponentId || opponentId === userId) continue;

    const removed = await redis.srem(checkKey, opponentId);
    if (removed === 0) continue; // race — someone else claimed them first

    // Clean up caller from their own slot (no-op if not present yet)
    await redis.srem(myKey, userId);

    // ── Load both users ───────────────────────────────────────────────────
    let me, opponent;
    try {
      [me, opponent] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.user.findUnique({ where: { id: opponentId } }),
      ]);
    } catch {
      // DB error — restore both so neither is lost
      await Promise.all([
        redis.sadd(myKey, userId),
        redis.sadd(checkKey, opponentId),
      ]);
      return null;
    }

    if (!me || !opponent) {
      if (opponent) await redis.sadd(checkKey, opponentId);
      await redis.sadd(myKey, userId);
      return null;
    }

    // ── Resolve the opponent's actual champion (handles wildcard entries) ──
    // The checkKey format is queue:{elo}:{opponentMyChamp}:{opponentVsChamp}.
    // The first variable segment after elo IS the opponent's myChampion.
    // Since vsChampion (caller's side) equals that, it's already correct.
    // For wildcard entries the opponent's QueueEntry holds their real champion.
    const opponentEntry = await prisma.queueEntry.findUnique({ where: { userId: opponentId } });
    const opponentChampion = opponentEntry?.myChampion ?? vsChampion;

    // ── Persist match ─────────────────────────────────────────────────────
    await prisma.queueEntry.deleteMany({
      where: { userId: { in: [userId, opponentId] } },
    });

    const match = await prisma.match.create({
      data: {
        playerAId: userId,
        playerBId: opponentId,
        champA:    myChampion,
        champB:    opponentChampion,
        eloBracket,
      },
    });

    const resultForMe: MatchResult = {
      matchId: match.id,
      opponent: { riotId: opponent.riotId, region: opponent.region, champion: opponentChampion },
      myChampion,
    };

    const resultForOpponent: MatchResult = {
      matchId: match.id,
      opponent: { riotId: me.riotId, region: me.region, champion: myChampion },
      myChampion: opponentChampion,
    };

    await Promise.all([
      redis.publish(matchChannel(userId),     JSON.stringify(resultForMe)),
      redis.publish(matchChannel(opponentId), JSON.stringify(resultForOpponent)),
    ]);

    return resultForMe;
  }

  // ── No opponent found — wait in queue ─────────────────────────────────────
  await redis.sadd(myKey, userId);
  return null;
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
