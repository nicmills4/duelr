import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  getChallengerEntries,
  getSummonerById,
  getMatchIds,
  getMatch,
  getRouting,
  type Region,
  type MatchParticipant,
} from "@/lib/riot";

export const dynamic = "force-dynamic";

// ── Cache keys & TTLs ────────────────────────────────────────────────────────
const STATS_CACHE_PREFIX  = "matchup_stats_v1:";
const PUUID_CACHE_KEY     = "chall_puuids:na1";
const STATS_TTL           = 60 * 60 * 24;   // 24 h — meta doesn't shift daily
const PUUID_TTL           = 60 * 60 * 2;    // 2 h  — challenger list rotates slowly

// Sample sizes — kept conservative to stay within the dev-key rate limit
// (100 requests / 2 minutes).  A production key can afford higher values.
const SAMPLE_PLAYERS      = 10;
const MATCHES_PER_PLAYER  = 8;   // 10 players × 8 match IDs = 80 match detail calls max

// Item IDs we never want to show as part of a "build"
const TRINKET_IDS  = new Set([3340, 3341, 3363, 3364, 3513]);
const CONSUMABLE_IDS = new Set([2003, 2010, 2031, 2033, 2055, 2138, 2139, 2140]);

// ── DDragon helpers ──────────────────────────────────────────────────────────
async function getDDragonVersion(): Promise<string> {
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const v = await res.json() as string[];
  return v[0];
}

interface DDragonChampMap {
  byKey:  Record<string, number>;   // "Darius" → 122
  byName: Record<string, number>;   // display name if different
}

async function getChampionMap(version: string): Promise<DDragonChampMap> {
  const res  = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
  const data = await res.json() as { data: Record<string, { key: string; name: string }> };
  const byKey:  Record<string, number> = {};
  const byName: Record<string, number> = {};
  for (const [id, val] of Object.entries(data.data)) {
    const numId = parseInt(val.key);
    byKey[id]      = numId;   // "Darius" → 122
    byName[val.name] = numId; // display name → 122 (handles Wukong / Nunu etc.)
  }
  return { byKey, byName };
}

interface ItemMeta {
  id: number;
  name: string;
  imageUrl: string;
  totalGold: number;
  hasComponents: boolean; // true = not a base/starter item
}

async function getItemMeta(version: string): Promise<Map<number, ItemMeta>> {
  const res  = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`);
  const data = await res.json() as {
    data: Record<string, {
      name: string;
      image: { full: string };
      gold: { total: number; purchasable: boolean };
      from?: string[];
    }>;
  };
  const map = new Map<number, ItemMeta>();
  for (const [idStr, item] of Object.entries(data.data)) {
    const id = parseInt(idStr);
    if (!item.gold.purchasable) continue;
    map.set(id, {
      id,
      name: item.name,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image.full}`,
      totalGold:    item.gold.total,
      hasComponents: !!(item.from && item.from.length > 0),
    });
  }
  return map;
}

// ── Challenger PUUID cache ───────────────────────────────────────────────────
async function getChallengerPuuids(): Promise<string[]> {
  const cached = await redis.get(PUUID_CACHE_KEY);
  if (cached) return JSON.parse(cached) as string[];

  const entries = await getChallengerEntries("na1" as Region);
  const topEntries = entries.slice(0, SAMPLE_PLAYERS * 3); // overshoot, some lookups may fail

  const results = await Promise.allSettled(
    topEntries.map((e) => getSummonerById(e.summonerId, "na1" as Region))
  );

  const puuids = results
    .filter((r): r is PromiseFulfilledResult<{ id: string; puuid: string; summonerLevel: number }> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value.puuid)
    .slice(0, SAMPLE_PLAYERS);

  if (puuids.length > 0) {
    await redis.setex(PUUID_CACHE_KEY, PUUID_TTL, JSON.stringify(puuids));
  }
  return puuids;
}

// ── Item frequency helpers ────────────────────────────────────────────────────
function extractItems(p: MatchParticipant): number[] {
  return [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    .filter((id) => id > 0 && !TRINKET_IDS.has(id) && !CONSUMABLE_IDS.has(id));
}

// ── Response types ───────────────────────────────────────────────────────────
export interface ItemData {
  id: number;
  name: string;
  imageUrl: string;
  totalGold: number;
}

export interface MatchupStatsResponse {
  myChampion: string;
  vsChampion: string;
  winRate: number;
  wins: number;
  losses: number;
  matchupGames: number;   // games where this exact matchup appeared
  gamesSearched: number;  // total match details fetched
  starterItems: ItemData[];
  coreBuild: ItemData[];
  patch: string;
  cached: boolean;
  insufficientData: boolean;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const myChampion = searchParams.get("myChampion")?.trim() ?? "";
  const vsChampion = searchParams.get("vsChampion")?.trim() ?? "";

  if (!myChampion || !vsChampion) {
    return NextResponse.json({ error: "myChampion and vsChampion are required" }, { status: 400 });
  }

  const cacheKey = `${STATS_CACHE_PREFIX}${myChampion.toLowerCase()}:${vsChampion.toLowerCase()}`;

  // ── Cache hit ──
  const hit = await redis.get(cacheKey);
  if (hit) {
    return NextResponse.json({ ...JSON.parse(hit), cached: true });
  }

  try {
    // ── Fetch DDragon data (no rate limit) ──
    const version = await getDDragonVersion();
    const [champMap, itemMap] = await Promise.all([
      getChampionMap(version),
      getItemMeta(version),
    ]);

    const myChampionId = champMap.byKey[myChampion] ?? champMap.byName[myChampion];
    const vsChampionId = champMap.byKey[vsChampion] ?? champMap.byName[vsChampion];

    if (!myChampionId || !vsChampionId) {
      return NextResponse.json({ error: "Unknown champion name(s)" }, { status: 400 });
    }

    // ── Get Challenger PUUIDs (cached 2 h) ──
    const puuids = await getChallengerPuuids();
    if (puuids.length === 0) {
      return NextResponse.json({ error: "Could not fetch sample players" }, { status: 503 });
    }

    // ── Fetch match IDs for each player, filtered to myChampion ──
    const routing = getRouting("na1" as Region);
    const matchIdResults = await Promise.allSettled(
      puuids.map((puuid) =>
        getMatchIds(puuid, routing, { championId: myChampionId, count: MATCHES_PER_PLAYER })
      )
    );

    // Deduplicate match IDs
    const allMatchIds = Array.from(
      new Set(
        matchIdResults
          .flatMap((r) => (r.status === "fulfilled" && r.value ? r.value : []))
      )
    );

    if (allMatchIds.length === 0) {
      return NextResponse.json({ error: "No recent matches found for this champion" }, { status: 404 });
    }

    // ── Fetch all match details in parallel ──
    const matchResults = await Promise.allSettled(
      allMatchIds.map((id) => getMatch(id, routing))
    );

    // ── Aggregate matchup data ──
    let wins = 0;
    let losses = 0;
    const itemFreq = new Map<number, number>();

    for (const result of matchResults) {
      if (result.status === "rejected" || !result.value) continue;
      const match = result.value;

      // Find the participant who played myChampion
      const me = match.info.participants.find((p) => p.championId === myChampionId);
      if (!me) continue;

      // Skip games without a meaningful lane position (ARAM, Arena, etc.)
      if (!me.teamPosition || me.teamPosition === "" || me.teamPosition === "Invalid") continue;

      // Find the opposing laner
      const opponent = match.info.participants.find(
        (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition
      );
      if (!opponent || opponent.championId !== vsChampionId) continue;

      // Matchup found
      if (me.win) wins++; else losses++;

      // Tally items
      for (const itemId of extractItems(me)) {
        itemFreq.set(itemId, (itemFreq.get(itemId) ?? 0) + 1);
      }
    }

    const matchupGames = wins + losses;
    const insufficientData = matchupGames < 3;

    // ── Build item lists ──
    const sortedItems = Array.from(itemFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    function toItemData(id: number): ItemData | null {
      const meta = itemMap.get(id);
      if (!meta) return null;
      return { id: meta.id, name: meta.name, imageUrl: meta.imageUrl, totalGold: meta.totalGold };
    }

    // Starter items: cheap (≤ 500g) and no components (base items like Doran's, Long Sword, etc.)
    const starterItems: ItemData[] = sortedItems
      .filter((id) => {
        const meta = itemMap.get(id);
        return meta && meta.totalGold <= 500 && !meta.hasComponents;
      })
      .slice(0, 3)
      .map(toItemData)
      .filter(Boolean) as ItemData[];

    // Core build: everything else, top 6 by frequency
    const coreIds = new Set(starterItems.map((i) => i.id));
    const coreBuild: ItemData[] = sortedItems
      .filter((id) => !coreIds.has(id))
      .slice(0, 6)
      .map(toItemData)
      .filter(Boolean) as ItemData[];

    const response: MatchupStatsResponse = {
      myChampion,
      vsChampion,
      winRate: matchupGames > 0 ? wins / matchupGames : 0,
      wins,
      losses,
      matchupGames,
      gamesSearched: allMatchIds.length,
      starterItems,
      coreBuild,
      patch: version,
      cached: false,
      insufficientData,
    };

    // Only cache if we have useful data
    if (!insufficientData) {
      await redis.setex(cacheKey, STATS_TTL, JSON.stringify(response));
    }

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
