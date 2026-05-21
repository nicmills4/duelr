import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTopMasteries, getMatchIds, getMatch, getRouting, type Region } from "@/lib/riot";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_TTL = 60 * 30; // 30 minutes

export interface MatchupSuggestion {
  vsChampion: string;   // champion to practice against
  losses: number;       // how many times user lost to this champion
}

export interface ChampionSuggestion {
  myChampion: string;          // user's champion
  imageUrl: string;
  suggestions: MatchupSuggestion[];
}

// Fetch champion data from Data Dragon and build id→name + numericId→id maps
async function getChampionMaps(): Promise<{
  byNumericId: Map<number, string>;   // 122 → "Darius"
  imageUrl: (id: string) => string;
  version: string;
}> {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await versionsRes.json() as string[];
  const version = versions[0];

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
  );
  const champData = await champRes.json() as {
    data: Record<string, { id: string; key: string; name: string }>;
  };

  const byNumericId = new Map<number, string>();
  for (const champ of Object.values(champData.data)) {
    byNumericId.set(parseInt(champ.key), champ.id);
  }

  return {
    byNumericId,
    imageUrl: (id: string) =>
      `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`,
    version,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cacheKey = `suggestions:${session.userId}`;

  // Return cached result if available
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ suggestions: JSON.parse(cached), cached: true });
  }

  try {
    const { puuid, region } = session.user;
    const routing = getRouting(region as Region);

    // 1. Top 5 most played champions
    const masteries = await getTopMasteries(puuid, region as Region, 5);
    if (!masteries || masteries.length === 0) {
      return NextResponse.json({ suggestions: [], reason: "No champion mastery data found" });
    }

    // 2. Load champion data
    const champMaps = await getChampionMaps();

    // 3. For each champion, analyse recent matches for losses
    const results: ChampionSuggestion[] = [];

    for (const mastery of masteries) {
      const championId = champMaps.byNumericId.get(mastery.championId);
      if (!championId) continue;

      // Get last 5 match IDs where user played this champion
      const matchIds = await getMatchIds(puuid, routing, {
        championId: mastery.championId,
        count: 5,
      });
      if (!matchIds || matchIds.length === 0) continue;

      // Tally losses by opponent champion
      const lossTally = new Map<string, number>();

      for (const matchId of matchIds) {
        const match = await getMatch(matchId, routing);
        if (!match) continue;

        // Find this user's participant entry
        const me = match.info.participants.find((p) => p.puuid === puuid);
        if (!me || me.win) continue; // skip wins

        // Find opponent on opposite team in same position
        if (!me.teamPosition || me.teamPosition === "Invalid" || me.teamPosition === "") continue;

        const opponent = match.info.participants.find(
          (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition
        );
        if (!opponent) continue;

        lossTally.set(
          opponent.championName,
          (lossTally.get(opponent.championName) ?? 0) + 1
        );
      }

      // Sort by most losses, take top 3
      const suggestions: MatchupSuggestion[] = Array.from(lossTally.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([vsChampion, losses]) => ({ vsChampion, losses }));

      if (suggestions.length > 0) {
        results.push({
          myChampion: championId,
          imageUrl: champMaps.imageUrl(championId),
          suggestions,
        });
      }
    }

    // Cache for 30 minutes
    if (results.length > 0) {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
    }

    return NextResponse.json({ suggestions: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
