import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMatchupWinRate, isCounterMatchup } from "@/lib/matchup";
import { BRACKET_ORDER, ELO_BRACKETS } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import { isWildcard } from "@/lib/champion-types";

export interface MatchupInfo {
  winRate: number | null;
  isCounter: boolean;
  /** The bracket the counter player will also search (one above chosen), or null. */
  bonusBracket: EloBracket | null;
  bonusBracketLabel: string | null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const myChampion     = searchParams.get("myChampion") ?? "";
  const vsChampionList = searchParams.getAll("vsChampion");
  const eloBracket     = (searchParams.get("eloBracket") ?? "mid") as EloBracket;

  const empty: MatchupInfo = {
    winRate: null,
    isCounter: false,
    bonusBracket: null,
    bonusBracketLabel: null,
  };

  // Only concrete (non-wildcard) champions can have matchup info
  const concrete = vsChampionList.filter((vs) => !isWildcard(vs));
  if (!myChampion || concrete.length === 0) {
    return NextResponse.json(empty);
  }

  // Compute win rates for all concrete vsChampions, take the best counter
  const rates = await Promise.allSettled(
    concrete.map((vs) => getMatchupWinRate(myChampion, vs))
  );

  let bestWinRate: number | null = null;
  for (const r of rates) {
    if (r.status === "fulfilled" && r.value !== null) {
      if (bestWinRate === null || r.value > bestWinRate) {
        bestWinRate = r.value;
      }
    }
  }

  const counter = isCounterMatchup(bestWinRate);

  let bonusBracket: EloBracket | null = null;
  let bonusBracketLabel: string | null = null;

  if (counter) {
    const idx = BRACKET_ORDER.indexOf(eloBracket);
    if (idx >= 0 && idx < BRACKET_ORDER.length - 1) {
      bonusBracket = BRACKET_ORDER[idx + 1];
      bonusBracketLabel =
        ELO_BRACKETS.find((b) => b.value === bonusBracket)?.label ?? null;
    }
  }

  return NextResponse.json({
    winRate: bestWinRate,
    isCounter: counter,
    bonusBracket,
    bonusBracketLabel,
  } satisfies MatchupInfo);
}
