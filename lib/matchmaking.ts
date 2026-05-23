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

/** Returns the bracket one step above the given one, or null if already apex. */
function nextEloBracket(bracket: EloBracket): EloBracket | null {
  const idx = BRACKET_ORDER.indexOf(bracket);
  return idx >= 0 && idx < BRACKET_ORDER.length - 1
    ? BRACKET_ORDER[idx + 1]
    : null;
}

/** Parse vsChampions from a QueueEntry (handles legacy single-string entries). */
function parseVsChampions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {}
  // Legacy: bare string stored directly
  return [raw];
}

/**
 * Attempts to find a match for the given queue entry.
 *
 * vsChampions is an array of champion IDs or wildcards. Typical cases:
 *   ["_any"]             — accept any opponent
 *   ["Darius"]           — specific 1-champion queue
 *   ["Darius", "Garen"]  — multi-champion queue (matches whichever is available first)
 *
 * Wildcard players add themselves to their key and wait to be claimed.
 * Non-wildcard players scan the relevant opponent keys for an instant match.
 *
 * counterBonusFor: a set of vsChampion IDs where the caller has a >51% WR
 * advantage; for those, the search is extended to include the next elo bracket.
 */
export async function joinQueueAndMatch(
  userId: string,
  myChampion: string,
  vsChampions: string[],
  eloBracket: EloBracket,
  counterBonusFor: Set<string> = new Set()
): Promise<MatchResult | null> {
  const vsJson = JSON.stringify(vsChampions);
  const myKeys = vsChampions.map((vs) => queueKey(eloBracket, myChampion, vs));

  // ── Clear stale Redis slots from any previous queue entry ─────────────────
  const existingEntry = await prisma.queueEntry.findUnique({ where: { userId } });
  if (existingEntry) {
    const oldVs  = parseVsChampions(existingEntry.vsChampions);
    const newSet = new Set(myKeys);
    const oldKeys = oldVs.map((vs) =>
      queueKey(existingEntry.eloBracket, existingEntry.myChampion, vs)
    );
    const toRemove = oldKeys.filter((k) => !newSet.has(k));
    if (toRemove.length > 0) {
      await Promise.all(toRemove.map((k) => redis.srem(k, userId)));
    }
  }

  // ── Persist / update queue entry ──────────────────────────────────────────
  await prisma.queueEntry.upsert({
    where:  { userId },
    create: { userId, myChampion, vsChampions: vsJson, eloBracket },
    update: { myChampion, vsChampions: vsJson, eloBracket },
  });

  // ── Wildcard-only players just wait in their key ───────────────────────────
  const allWildcard = vsChampions.every((vs) => isWildcard(vs));
  if (allWildcard) {
    await Promise.all(myKeys.map((k) => redis.sadd(k, userId)));
    return null;
  }

  // ── Build the complete list of opponent keys to scan ──────────────────────
  // For each specific vsChampion, we look for:
  //   - exact:    queue:{elo}:{vsChamp}:{myChamp}
  //   - wildcard: queue:{elo}:{vsChamp}:{_any|_any_melee|_any_ranged}
  //   - counter:  same keys one bracket higher
  const myType   = await getChampionType(myChampion);
  const wildcards = myType ? wildcardKeysFor(myType) : ["_any" as const];

  interface KeyToCheck { key: string; vsChampion: string }
  const keysToCheck: KeyToCheck[] = [];

  for (const vs of vsChampions) {
    if (isWildcard(vs)) continue; // wildcards just wait passively

    keysToCheck.push(
      { key: queueKey(eloBracket, vs, myChampion), vsChampion: vs },
      ...wildcards.map((w) => ({ key: queueKey(eloBracket, vs, w), vsChampion: vs }))
    );

    if (counterBonusFor.has(vs)) {
      const nextBracket = nextEloBracket(eloBracket);
      if (nextBracket) {
        keysToCheck.push(
          { key: queueKey(nextBracket, vs, myChampion), vsChampion: vs },
          ...wildcards.map((w) => ({ key: queueKey(nextBracket, vs, w), vsChampion: vs }))
        );
      }
    }
  }

  // ── Try each key; first atomic claim wins ─────────────────────────────────
  for (const { key: checkKey, vsChampion: matchedVs } of keysToCheck) {
    const opponentId = await redis.srandmember(checkKey);
    if (!opponentId || opponentId === userId) continue;

    const removed = await redis.srem(checkKey, opponentId);
    if (removed === 0) continue; // race — someone else claimed them first

    // Remove caller from ALL their queue slots
    await Promise.all(myKeys.map((k) => redis.srem(k, userId)));

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
        ...myKeys.map((k) => redis.sadd(k, userId)),
        redis.sadd(checkKey, opponentId),
      ]);
      return null;
    }

    if (!me || !opponent) {
      if (opponent) await redis.sadd(checkKey, opponentId);
      await Promise.all(myKeys.map((k) => redis.sadd(k, userId)));
      return null;
    }

    // ── Resolve the opponent's actual champion ────────────────────────────
    // For wildcard entries the opponent's QueueEntry holds their real champion.
    // For exact entries the matchedVs is already the opponent's champion.
    const opponentEntry    = await prisma.queueEntry.findUnique({ where: { userId: opponentId } });
    const opponentChampion = opponentEntry?.myChampion ?? matchedVs;

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
      matchId:   match.id,
      opponent:  { riotId: opponent.riotId, region: opponent.region, champion: opponentChampion },
      myChampion,
    };

    const resultForOpponent: MatchResult = {
      matchId:   match.id,
      opponent:  { riotId: me.riotId, region: me.region, champion: myChampion },
      myChampion: opponentChampion,
    };

    await Promise.all([
      redis.publish(matchChannel(userId),     JSON.stringify(resultForMe)),
      redis.publish(matchChannel(opponentId), JSON.stringify(resultForOpponent)),
    ]);

    return resultForMe;
  }

  // ── No opponent found — add to ALL vsChampion queue slots and wait ────────
  await Promise.all(myKeys.map((k) => redis.sadd(k, userId)));
  return null;
}

export async function leaveQueue(userId: string): Promise<void> {
  const entry = await prisma.queueEntry.findUnique({ where: { userId } });
  if (!entry) return;

  const vsChampions = parseVsChampions(entry.vsChampions);
  const keys = vsChampions.map((vs) =>
    queueKey(entry.eloBracket, entry.myChampion, vs)
  );

  await Promise.all([
    ...keys.map((k) => redis.srem(k, userId)),
    prisma.queueEntry.delete({ where: { userId } }),
  ]);
}
