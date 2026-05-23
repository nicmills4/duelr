import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { joinQueueAndMatch } from "@/lib/matchmaking";
import { WILDCARDS, isWildcard } from "@/lib/champion-types";
import { BRACKET_ORDER } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import { getMatchupWinRate, isCounterMatchup } from "@/lib/matchup";

// DDragon champion IDs are alphanumeric, 1-50 chars (e.g. "Darius", "JarvanIV")
const CHAMPION_RE     = /^[a-zA-Z0-9]{1,50}$/;
const VALID_BRACKETS  = new Set<string>(BRACKET_ORDER);
const VALID_WILDCARDS = new Set<string>(WILDCARDS);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { myChampion, vsChampions, eloBracket } = body;

  if (!myChampion || !eloBracket) {
    return NextResponse.json(
      { error: "myChampion and eloBracket are required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(vsChampions) || vsChampions.length === 0) {
    return NextResponse.json(
      { error: "vsChampions must be a non-empty array" },
      { status: 400 }
    );
  }

  if (vsChampions.length > 5) {
    return NextResponse.json(
      { error: "At most 5 vsChampions allowed" },
      { status: 400 }
    );
  }

  if (!CHAMPION_RE.test(myChampion)) {
    return NextResponse.json(
      { error: "Invalid champion name — must be 1-50 alphanumeric characters" },
      { status: 400 }
    );
  }

  for (const vs of vsChampions) {
    if (!CHAMPION_RE.test(vs) && !VALID_WILDCARDS.has(vs)) {
      return NextResponse.json(
        { error: `Invalid vsChampion value: "${vs}"` },
        { status: 400 }
      );
    }
  }

  if (!VALID_BRACKETS.has(eloBracket)) {
    return NextResponse.json({ error: "Invalid eloBracket" }, { status: 400 });
  }

  try {
    // Determine counter bonus for each specific vsChampion (fail-open)
    const counterBonusFor = new Set<string>();
    await Promise.allSettled(
      vsChampions
        .filter((vs) => !isWildcard(vs))
        .map(async (vs) => {
          const wr = await getMatchupWinRate(myChampion, vs);
          if (isCounterMatchup(wr)) counterBonusFor.add(vs);
        })
    );

    const match = await joinQueueAndMatch(
      session.userId,
      myChampion,
      vsChampions as string[],
      eloBracket as EloBracket,
      counterBonusFor
    );

    if (match) {
      return NextResponse.json({ status: "matched", match });
    }
    return NextResponse.json({ status: "queued" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
