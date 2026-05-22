/**
 * Server-only: Redis-backed champion attack-type cache.
 * Derives melee/ranged from DDragon stats and stores results in a Redis hash.
 * DO NOT import this file from client components.
 */
import { redis } from "./redis";
import type { AttackType } from "./champion-types";

// Champions with attack range > 200 are considered ranged.
const RANGE_THRESHOLD = 200;
const CACHE_KEY       = "champ_attack_types";
const CACHE_TTL       = 60 * 60 * 24; // 24 h

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
