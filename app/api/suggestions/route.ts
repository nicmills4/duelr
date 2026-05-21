import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTopMasteries, getMatchIds, getMatch, getRouting, type Region } from "@/lib/riot";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_TTL = 60 * 30; // 30 minutes
const TOP_CHAMPS = 3;
const MATCHES_PER_CHAMP = 5;

export interface MatchupSuggestion {
  vsChampion: string;
  losses: number;
}

export type ChampionSuggestionStatus = "ok" | "no_data" | "no_losses";

export interface ChampionSuggestion {
  myChampion: string;
  imageUrl: string;
  status: ChampionSuggestionStatus;
  suggestions: MatchupSuggestion[];
}

async function getChampionMaps(): Promise<{
  byNumericId: Map<number, string>;
  imageUrl: (id: string) => string;
}> {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await versionsRes.json() as string[];
  const version = versions[0];

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
  );
  const champData = await champRes.json() as {
    data: Record<string, { id: string; key: string }>;
  };

  const byNumericId = new Map<number, string>();
  for (const champ of Object.values(champData.data)) {
    byNumericId.set(parseInt(champ.key), champ.id);
  }

  return {
    byNumericId,
    imageUrl: (id: string) =>
      `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cacheKey = `suggestions:${session.userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ suggestions: JSON.parse(cached), cached: true });
  }

  try {
    const { puuid, region } = session.user;
    const routing = getRouting(region as Region);

    // Top 3 most played champions
    const masteries = await getTopMasteries(puuid, region as Region, TOP_CHAMPS);
    if (!masteries || masteries.length === 0) {
      return NextResponse.json({ suggestions: [], reason: "No champion mastery data found" });
    }

    const champMaps = await getChampionMaps();
    const results: ChampionSuggestion[] = [];

    for (const mastery of masteries) {
      const championId = champMaps.byNumericId.get(mastery.championId);
      if (!championId) continue;

      const imageUrl = champMaps.imageUrl(championId);

      // Get recent match IDs filtered by this champion
      const matchIds = await getMatchIds(puuid, routing, {
        championId: mastery.championId,
        count: MATCHES_PER_CHAMP,
      });

      if (!matchIds || matchIds.length === 0) {
        results.push({ myChampion: championId, imageUrl, status: "no_data", suggestions: [] });
        continue;
      }

      const lossTally = new Map<string, number>();
      let verifiedMatches = 0;

      for (const matchId of matchIds) {
        const match = await getMatch(matchId, routing);
        if (!match) continue;

        const me = match.info.participants.find((p) => p.puuid === puuid);
        if (!me) continue;

        // KEY FIX: verify the user actually played this champion in this match
        // The Riot filter param can leak matches from other champions
        if (me.championId !== mastery.championId) continue;
        verifiedMatches++;

        if (me.win) continue; // only care about losses

        // Skip if position is unknown (ARAM, missing data, etc.)
        if (!me.teamPosition || me.teamPosition === "Invalid" || me.teamPosition === "") continue;

        // Find opponent on opposite team in same lane position
        const opponent = match.info.participants.find(
          (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition
        );
        if (!opponent) continue;

        lossTally.set(opponent.championName, (lossTally.get(opponent.championName) ?? 0) + 1);
      }

      if (verifiedMatches === 0) {
        results.push({ myChampion: championId, imageUrl, status: "no_data", suggestions: [] });
        continue;
      }

      if (lossTally.size === 0) {
        results.push({ myChampion: championId, imageUrl, status: "no_losses", suggestions: [] });
        continue;
      }

      const suggestions: MatchupSuggestion[] = Array.from(lossTally.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([vsChampion, losses]) => ({ vsChampion, losses }));

      results.push({ myChampion: championId, imageUrl, status: "ok", suggestions });
    }

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
    return NextResponse.json({ suggestions: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
