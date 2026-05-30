import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getSummonerByPuuid, getRankedEntries } from "@/lib/riot";
import type { Region } from "@/lib/riot";
import { TIER_TO_BRACKET } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";

export const dynamic = "force-dynamic";

const CACHE_TTL = 3600; // 1 hour

export interface RankInfo {
  maxBracket: EloBracket;   // highest bracket this player can select
  tier:       string | null; // e.g. "GOLD", null = unranked
  rank:       string | null; // e.g. "II",   null = unranked
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check Redis cache first — avoids hitting Riot API on every page load
  const cacheKey = `rank_bracket:${session.userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json(JSON.parse(cached) as RankInfo);
  } catch {
    // Redis miss or error — fall through to live lookup
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Resolve summoner ID from PUUID (needed for League v4)
    const summoner = await getSummonerByPuuid(user.puuid, user.region as Region);
    if (!summoner) {
      const result: RankInfo = { maxBracket: "low", tier: null, rank: null };
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      return NextResponse.json(result);
    }

    const entries = await getRankedEntries(summoner.id, user.region as Region);

    // Prefer solo queue; fall back to flex
    const ranked =
      entries?.find((e) => e.queueType === "RANKED_SOLO_5x5") ??
      entries?.find((e) => e.queueType === "RANKED_FLEX_SR") ??
      null;

    const result: RankInfo = {
      maxBracket: ranked ? (TIER_TO_BRACKET[ranked.tier] ?? "low") : "low",
      tier:       ranked?.tier  ?? null,
      rank:       ranked?.rank  ?? null,
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
