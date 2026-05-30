import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMatchIds, getMatch, getRouting, type Region } from "@/lib/riot";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY_PREFIX = "suggestions_v4:";
const CACHE_TTL = 60 * 10;  // 10 minutes — short enough to stay fresh
const RECENT_MATCHES = 25;
const TOP_CHAMPS = 3;

export interface MatchupSuggestion {
  vsChampion: string;
  losses: number;
}

export type ChampionSuggestionStatus = "ok" | "no_data" | "no_losses";

export interface ChampionSuggestion {
  myChampion: string;
  imageUrl: string;
  status: ChampionSuggestionStatus;
  gamesPlayed: number;
  suggestions: MatchupSuggestion[];
}

async function getDDragonVersion(): Promise<string> {
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await res.json() as string[];
  return versions[0];
}

function champImageUrl(version: string, id: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  const cacheKey = `${CACHE_KEY_PREFIX}${session.userId}`;

  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json({ suggestions: JSON.parse(cached), cached: true });
    }
  }

  try {
    const { puuid, region } = session.user;
    const routing = getRouting(region as Region);

    // Fetch match IDs and DDragon version in parallel
    const [matchIds, version] = await Promise.all([
      getMatchIds(puuid, routing, { count: RECENT_MATCHES }),
      getDDragonVersion(),
    ]);

    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json({ suggestions: [], reason: "No recent match history found" });
    }

    // Fetch ALL match details in parallel — much faster, no sequential failures
    const matchResults = await Promise.allSettled(
      matchIds.map((id) => getMatch(id, routing))
    );

    const champData = new Map<string, {
      gamesPlayed: number;
      lossTally: Map<string, number>;
    }>();

    for (const result of matchResults) {
      // Skip any that failed or returned null
      if (result.status === "rejected" || !result.value) continue;
      const match = result.value;

      const me = match.info.participants.find((p) => p.puuid === puuid);
      if (!me?.championName) continue;

      const myChamp = me.championName;
      if (!champData.has(myChamp)) {
        champData.set(myChamp, { gamesPlayed: 0, lossTally: new Map() });
      }
      const entry = champData.get(myChamp)!;
      entry.gamesPlayed++;

      if (me.win) continue;

      // Skip non-SR positions (ARAM, Arena etc.)
      if (!me.teamPosition || me.teamPosition === "Invalid" || me.teamPosition === "") continue;

      const opponent = match.info.participants.find(
        (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition
      );
      if (!opponent?.championName) continue;

      entry.lossTally.set(
        opponent.championName,
        (entry.lossTally.get(opponent.championName) ?? 0) + 1
      );
    }

    if (champData.size === 0) {
      return NextResponse.json({ suggestions: [], reason: "No usable match data found" });
    }

    const topChamps = Array.from(champData.entries())
      .sort((a, b) => b[1].gamesPlayed - a[1].gamesPlayed)
      .slice(0, TOP_CHAMPS);

    const results: ChampionSuggestion[] = topChamps.map(([myChampion, data]) => {
      const imageUrl = champImageUrl(version, myChampion);

      if (data.lossTally.size === 0) {
        return {
          myChampion, imageUrl,
          status: "no_losses" as ChampionSuggestionStatus,
          gamesPlayed: data.gamesPlayed,
          suggestions: [],
        };
      }

      const suggestions: MatchupSuggestion[] = Array.from(data.lossTally.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([vsChampion, losses]) => ({ vsChampion, losses }));

      return {
        myChampion, imageUrl,
        status: "ok" as ChampionSuggestionStatus,
        gamesPlayed: data.gamesPlayed,
        suggestions,
      };
    });

    // Only cache if we got a full dataset — partial results won't be stored
    if (matchResults.filter(r => r.status === "fulfilled" && r.value).length >= matchIds.length * 0.8) {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
    }

    return NextResponse.json({ suggestions: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
