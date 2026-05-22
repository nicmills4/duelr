/**
 * Melee / ranged classification for champions, derived from DDragon attack range.
 * Cached in Redis as a hash for O(1) per-champion lookups.
 */
import { redis } from "./redis";

export type AttackType = "melee" | "ranged";

// Champions with attack range > 200 are considered ranged.
// DDragon lists melee champions at 100–175 and ranged at 450–700+.
const RANGE_THRESHOLD = 200;
const CACHE_KEY       = "champ_attack_types";
const CACHE_TTL       = 60 * 60 * 24; // 24 h

export const WILDCARD_ANY        = "_any";
export const WILDCARD_ANY_MELEE  = "_any_melee";
export const WILDCARD_ANY_RANGED = "_any_ranged";
export const WILDCARDS           = [WILDCARD_ANY, WILDCARD_ANY_MELEE, WILDCARD_ANY_RANGED] as const;
export type  Wildcard            = typeof WILDCARDS[number];

export function isWildcard(v: string): v is Wildcard {
  return v === WILDCARD_ANY || v === WILDCARD_ANY_MELEE || v === WILDCARD_ANY_RANGED;
}

export function wildcardLabel(v: Wildcard): string {
  if (v === WILDCARD_ANY)        return "Any Champion";
  if (v === WILDCARD_ANY_MELEE)  return "Any Melee";
  if (v === WILDCARD_ANY_RANGED) return "Any Ranged";
  return v;
}

/** Returns the wildcard key that matches a given attack type, plus the "_any" key. */
export function wildcardKeysFor(type: AttackType): Wildcard[] {
  return [WILDCARD_ANY, type === "melee" ? WILDCARD_ANY_MELEE : WILDCARD_ANY_RANGED];
}

export async function getChampionType(championId: string): Promise<AttackType | null> {
  // Fast path — already cached
  const hit = await redis.hget(CACHE_KEY, championId);
  if (hit) return hit as AttackType;

  // Populate the full map from DDragon then retry
  await populateCache();
  return (await redis.hget(CACHE_KEY, championId)) as AttackType | null;
}

async function populateCache(): Promise<void> {
  const vRes  = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const [ver] = await vRes.json() as string[];

  const cRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`
  );
  const data = await cRes.json() as {
    data: Record<string, { stats: { attackrange: number } }>;
  };

  const pipeline = redis.pipeline();
  for (const [id, champ] of Object.entries(data.data)) {
    const type: AttackType = champ.stats.attackrange > RANGE_THRESHOLD ? "ranged" : "melee";
    pipeline.hset(CACHE_KEY, id, type);
  }
  pipeline.expire(CACHE_KEY, CACHE_TTL);
  await pipeline.exec();
}
