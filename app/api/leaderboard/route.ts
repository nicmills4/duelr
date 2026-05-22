import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface LeaderboardEntry {
  userId: string;
  riotId: string;
  region: string;
  wins: number;
  losses: number;
  winRate: number;  // 0–1
  totalGames: number;
}

export async function GET() {
  try {
    const confirmed = await prisma.match.findMany({
      where:   { outcome: { in: ["A_WIN", "B_WIN"] } },
      include: { playerA: true, playerB: true },
      orderBy: { createdAt: "desc" },
    });

    const stats = new Map<string, {
      riotId: string; region: string; wins: number; losses: number;
    }>();

    function ensure(userId: string, riotId: string, region: string) {
      if (!stats.has(userId)) stats.set(userId, { riotId, region, wins: 0, losses: 0 });
    }

    for (const m of confirmed) {
      ensure(m.playerAId, m.playerA.riotId, m.playerA.region);
      ensure(m.playerBId, m.playerB.riotId, m.playerB.region);

      if (m.outcome === "A_WIN") {
        stats.get(m.playerAId)!.wins++;
        stats.get(m.playerBId)!.losses++;
      } else {
        stats.get(m.playerBId)!.wins++;
        stats.get(m.playerAId)!.losses++;
      }
    }

    const leaderboard: LeaderboardEntry[] = Array.from(stats.entries())
      .map(([userId, s]) => ({
        userId,
        riotId:     s.riotId,
        region:     s.region,
        wins:       s.wins,
        losses:     s.losses,
        totalGames: s.wins + s.losses,
        winRate:    s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0,
      }))
      .filter((e) => e.totalGames >= 3) // minimum games for meaningful ranking
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
      .slice(0, 50);

    return NextResponse.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
