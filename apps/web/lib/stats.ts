/**
 * Per-user 1v1 statistics, computed from confirmed Match rows.
 * Powers the Premium stats & match-history profile.
 */
import { prisma } from "./prisma";

export interface ChampionRecord {
  champion: string;
  wins:     number;
  losses:   number;
  games:    number;
  winRate:  number; // 0–1
}

export interface RecentMatch {
  matchId:          string;
  opponentRiotId:   string;
  myChampion:       string;
  opponentChampion: string;
  won:              boolean;
  createdAt:        string; // ISO
}

export interface UserStats {
  totalGames:    number;
  wins:          number;
  losses:        number;
  winRate:       number; // 0–1
  currentStreak: number;                  // length of the current streak
  streakType:    "win" | "loss" | null;
  topChampions:  ChampionRecord[];
  recentMatches: RecentMatch[];
}

/** Cheap count of a user's confirmed games — used for the free-tier teaser. */
export async function getConfirmedGameCount(userId: string): Promise<number> {
  return prisma.match.count({
    where: {
      OR: [{ playerAId: userId }, { playerBId: userId }],
      outcome: { in: ["A_WIN", "B_WIN"] },
    },
  });
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ playerAId: userId }, { playerBId: userId }],
      outcome: { in: ["A_WIN", "B_WIN"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      playerAId: true,
      champA: true,
      champB: true,
      outcome: true,
      createdAt: true,
      playerA: { select: { riotId: true } },
      playerB: { select: { riotId: true } },
    },
  });

  let wins = 0;
  let losses = 0;
  let currentStreak = 0;
  let streakType: "win" | "loss" | null = null;
  let streakBroken = false;

  const champMap = new Map<string, ChampionRecord>();
  const recentMatches: RecentMatch[] = [];

  // matches are newest-first
  for (const m of matches) {
    const amA              = m.playerAId === userId;
    const myChampion       = amA ? m.champA : m.champB;
    const opponentChampion = amA ? m.champB : m.champA;
    const opponentRiotId   = amA ? m.playerB.riotId : m.playerA.riotId;
    const won              = amA ? m.outcome === "A_WIN" : m.outcome === "B_WIN";

    if (won) wins++; else losses++;

    const rec = champMap.get(myChampion) ?? {
      champion: myChampion, wins: 0, losses: 0, games: 0, winRate: 0,
    };
    rec.games++;
    if (won) rec.wins++; else rec.losses++;
    champMap.set(myChampion, rec);

    // Leading contiguous streak from the most recent game.
    const type = won ? "win" : "loss";
    if (!streakBroken) {
      if (streakType === null) { streakType = type; currentStreak = 1; }
      else if (type === streakType) { currentStreak++; }
      else { streakBroken = true; }
    }

    if (recentMatches.length < 20) {
      recentMatches.push({
        matchId:          m.id,
        opponentRiotId,
        myChampion,
        opponentChampion,
        won,
        createdAt:        m.createdAt.toISOString(),
      });
    }
  }

  const topChampions = [...champMap.values()]
    .map((c) => ({ ...c, winRate: c.games > 0 ? c.wins / c.games : 0 }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 8);

  const totalGames = wins + losses;

  return {
    totalGames,
    wins,
    losses,
    winRate: totalGames > 0 ? wins / totalGames : 0,
    currentStreak,
    streakType,
    topChampions,
    recentMatches,
  };
}
