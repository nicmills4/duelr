import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Trophy, TrendingUp, Minus, TrendingDown } from "lucide-react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

export const revalidate = 300; // Revalidate every 5 minutes

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const confirmed = await prisma.match.findMany({
    where:   { outcome: { in: ["A_WIN", "B_WIN"] } },
    include: { playerA: true, playerB: true },
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

  return Array.from(stats.entries())
    .map(([userId, s]) => ({
      userId, riotId: s.riotId, region: s.region,
      wins: s.wins, losses: s.losses,
      totalGames: s.wins + s.losses,
      winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0,
    }))
    .filter((e) => e.totalGames >= 3)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
    .slice(0, 50);
}

function WinRateIcon({ rate }: { rate: number }) {
  if (rate >= 0.55) return <TrendingUp  className="w-4 h-4 text-emerald-400" />;
  if (rate <= 0.45) return <TrendingDown className="w-4 h-4 text-red-400"     />;
  return <Minus className="w-4 h-4 text-gray-500" />;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const [session, entries] = await Promise.all([
    getSession(),
    getLeaderboard(),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-8">
        <Trophy className="w-7 h-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Duelr 1v1 Top Players</h1>
          <p className="text-sm text-gray-500">
            Ranked by confirmed 1v1 wins · minimum 3 reported games
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12 space-y-2">
          <Trophy className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-400 font-medium">No confirmed results yet</p>
          <p className="text-sm text-gray-600">
            After a match, both players report the outcome to appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const isMe = session?.userId === entry.userId;
            return (
              <div
                key={entry.userId}
                className={`card flex items-center gap-4 py-3 ${
                  isMe ? "ring-1 ring-gold-400/40" : ""
                }`}
              >
                {/* Rank */}
                <div className="w-8 text-center flex-shrink-0">
                  {i < 3 ? (
                    <span className="text-lg">{MEDALS[i]}</span>
                  ) : (
                    <span className="text-sm font-bold text-gray-600">{i + 1}</span>
                  )}
                </div>

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {entry.riotId}
                    {isMe && (
                      <span className="ml-2 text-xs text-gold-400 font-normal">you</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 uppercase">{entry.region}</p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm flex-shrink-0">
                  <div className="text-center hidden sm:block">
                    <p className="font-bold text-white">{entry.wins}</p>
                    <p className="text-xs text-gray-600">Wins</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className="font-bold text-gray-400">{entry.losses}</p>
                    <p className="text-xs text-gray-600">Losses</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <WinRateIcon rate={entry.winRate} />
                    <span className={`font-bold tabular-nums ${
                      entry.winRate >= 0.55 ? "text-emerald-400"
                      : entry.winRate <= 0.45 ? "text-red-400"
                      : "text-gray-300"
                    }`}>
                      {Math.round(entry.winRate * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-700 text-center">
        Results are self-reported and confirmed when both players agree.
        Disputed outcomes are excluded.
      </p>
    </div>
  );
}
