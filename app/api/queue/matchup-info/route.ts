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
  const myChampion = searchParams.get("myChampion") ?? "";
  const vsChampion = searchParams.get("vsChampion") ?? "";
  const eloBracket = (searchParams.get("eloBracket") ?? "mid") as EloBracket;

  const empty: MatchupInfo = {
    winRate: null,
    isCounter: false,
    bonusBracket: null,
    bonusBracketLabel: null,
  };

  if (!myChampion || !vsChampion || isWildcard(vsChampion)) {
    return NextResponse.json(empty);
  }

  const winRate = await getMatchupWinRate(myChampion, vsChampion);
  const counter = isCounterMatchup(winRate);

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
    winRate,
    isCounter: counter,
    bonusBracket,
    bonusBracketLabel,
  } satisfies MatchupInfo);
}
