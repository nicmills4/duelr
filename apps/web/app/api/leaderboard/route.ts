import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Cache the leaderboard for 5 minutes — it changes slowly and is expensive to build. */
const CACHE_KEY = "leaderboard:v1";
const CACHE_TTL = 300; // seconds

export interface LeaderboardEntry {
  userId:     string;
  riotId:     string;
  region:     string;
  wins:       number;
  losses:     number;
  winRate:    number; // 0–1
  totalGames: number;
}

export async function GET() {
  try {
    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = await redis.get(CACHE_KEY).catch(() => null);
    if (cached) {
      return NextResponse.json({ leaderboard: JSON.parse(cached) as LeaderboardEntry[] });
    }

    // ── DB-level aggregation — avoids loading every match row into memory ───
    // Four groupBy queries cover all win/loss combinations without pulling raw rows.
    const [aWins, bWins, aLosses, bLosses] = await Promise.all([
      prisma.match.groupBy({
        by:    ["playerAId"],
        where: { outcome: "A_WIN" },
        _count: { _all: true },
      }),
      prisma.match.groupBy({
        by:    ["playerBId"],
        where: { outcome: "B_WIN" },
        _count: { _all: true },
      }),
      prisma.match.groupBy({
        by:    ["playerAId"],
        where: { outcome: "B_WIN" }, // playerA lost
        _count: { _all: true },
      }),
      prisma.match.groupBy({
        by:    ["playerBId"],
        where: { outcome: "A_WIN" }, // playerB lost
        _count: { _all: true },
      }),
    ]);

    // ── Merge into a single stats map ────────────────────────────────────────
    const stats = new Map<string, { wins: number; losses: number }>();
    function tally(id: string, wins: number, losses: number) {
      const s = stats.get(id) ?? { wins: 0, losses: 0 };
      s.wins   += wins;
      s.losses += losses;
      stats.set(id, s);
    }
    for (const r of aWins)   tally(r.playerAId, r._count._all, 0);
    for (const r of bWins)   tally(r.playerBId, r._count._all, 0);
    for (const r of aLosses) tally(r.playerAId, 0, r._count._all);
    for (const r of bLosses) tally(r.playerBId, 0, r._count._all);

    // ── Filter, sort, slice ──────────────────────────────────────────────────
    const qualified = [...stats.entries()]
      .filter(([, s]) => s.wins + s.losses >= 3)
      .sort(([, a], [, b]) => {
        const wDiff = b.wins - a.wins;
        if (wDiff !== 0) return wDiff;
        return (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses));
      })
      .slice(0, 50);

    // ── Single user lookup for the top 50 ───────────────────────────────────
    const userIds = qualified.map(([id]) => id);
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, riotId: true, region: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderboard: LeaderboardEntry[] = qualified
      .map(([userId, s]) => {
        const u = userMap.get(userId);
        if (!u) return null;
        return {
          userId,
          riotId:     u.riotId,
          region:     u.region,
          wins:       s.wins,
          losses:     s.losses,
          totalGames: s.wins + s.losses,
          winRate:    s.wins / (s.wins + s.losses),
        };
      })
      .filter((e): e is LeaderboardEntry => e !== null);

    // Populate cache (fire-and-forget; a cache miss on failure is acceptable)
    redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(leaderboard)).catch(() => {});

    return NextResponse.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
