import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getUserStats, getConfirmedGameCount } from "@/lib/stats";
import {
  Crown, Swords, Flame, TrendingUp, TrendingDown, History, BarChart3, Lock,
} from "lucide-react";
import PremiumBadge from "@/components/PremiumBadge";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const isPremium = session.user.isPremium ?? false;

  // ── Free tier: locked upsell with a real teaser ───────────────────────────
  if (!isPremium) {
    const games = await getConfirmedGameCount(session.userId);
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Your Stats</h1>
            <p className="text-sm text-gray-500">{session.user.riotId}</p>
          </div>
        </div>

        <div className="card border border-gold-400/20 text-center space-y-5 py-10">
          <div className="w-14 h-14 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-gold-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-bold text-white">
              You&apos;ve played{" "}
              <span className="text-gold-400">{games}</span>{" "}
              confirmed {games === 1 ? "duel" : "duels"}.
            </p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Unlock your full 1v1 profile with Premium — win rate, win streaks,
              per-champion records, and your complete match history.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
            {[
              "Overall win rate & record",
              "Current win/loss streak",
              "Per-champion win rates",
              "Full match history",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
                <Crown className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <a href="/premium" className="btn-primary inline-flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Unlock with Premium
          </a>
        </div>
      </div>
    );
  }

  // ── Premium: full profile ─────────────────────────────────────────────────
  const stats = await getUserStats(session.userId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-7 h-7 text-gold-400" />
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Your Stats <PremiumBadge />
          </h1>
          <p className="text-sm text-gray-500">{session.user.riotId}</p>
        </div>
      </div>

      {stats.totalGames === 0 ? (
        <div className="card text-center py-12 space-y-2">
          <Swords className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-400 font-medium">No confirmed games yet</p>
          <p className="text-sm text-gray-600">
            Play a 1v1 and report the result — your stats will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card text-center py-4">
              <p className="text-2xl font-bold text-white">{stats.totalGames}</p>
              <p className="text-xs text-gray-500 mt-0.5">Games</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-2xl font-bold tabular-nums">
                <span className="text-emerald-400">{stats.wins}</span>
                <span className="text-gray-600">–</span>
                <span className="text-red-400">{stats.losses}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Record</p>
            </div>
            <div className="card text-center py-4">
              <p className={`text-2xl font-bold tabular-nums ${
                stats.winRate >= 0.55 ? "text-emerald-400"
                : stats.winRate <= 0.45 ? "text-red-400" : "text-white"
              }`}>
                {Math.round(stats.winRate * 100)}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Win Rate</p>
            </div>
            <div className="card text-center py-4">
              <p className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                stats.streakType === "win" ? "text-emerald-400"
                : stats.streakType === "loss" ? "text-red-400" : "text-gray-400"
              }`}>
                {stats.streakType === "win" && <Flame className="w-5 h-5" />}
                {stats.currentStreak}{stats.streakType === "win" ? "W" : stats.streakType === "loss" ? "L" : ""}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Streak</p>
            </div>
          </div>

          {/* Per-champion records */}
          <div className="space-y-3">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Swords className="w-4 h-4 text-gold-400" /> Champion Records
            </h2>
            <div className="space-y-2">
              {stats.topChampions.map((c) => (
                <div key={c.champion} className="card flex items-center gap-4 py-2.5">
                  <p className="font-medium text-white text-sm flex-1 truncate">{c.champion}</p>
                  <p className="text-sm tabular-nums">
                    <span className="text-emerald-400">{c.wins}</span>
                    <span className="text-gray-600">–</span>
                    <span className="text-red-400">{c.losses}</span>
                  </p>
                  <div className="flex items-center gap-1.5 w-16 justify-end">
                    {c.winRate >= 0.5
                      ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                    <span className={`text-sm font-bold tabular-nums ${
                      c.winRate >= 0.5 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {Math.round(c.winRate * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent matches */}
          <div className="space-y-3">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-gold-400" /> Recent Matches
            </h2>
            <div className="space-y-2">
              {stats.recentMatches.map((m) => (
                <div
                  key={m.matchId}
                  className={`card flex items-center gap-3 py-2.5 border-l-2 ${
                    m.won ? "border-l-emerald-500/60" : "border-l-red-500/60"
                  }`}
                >
                  <span className={`text-xs font-bold uppercase w-10 ${
                    m.won ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {m.won ? "Win" : "Loss"}
                  </span>
                  <p className="flex-1 min-w-0 text-sm text-gray-300 truncate">
                    <span className="text-white font-medium">{m.myChampion}</span>
                    <span className="text-gray-600"> vs </span>
                    <span className="text-gray-400">{m.opponentChampion}</span>
                    <span className="text-gray-600"> · {m.opponentRiotId}</span>
                  </p>
                  <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(m.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
