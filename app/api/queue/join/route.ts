import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { joinQueueAndMatch } from "@/lib/matchmaking";
import type { EloBracket } from "@/lib/constants";

// DDragon champion IDs are alphanumeric, 1-50 chars (e.g. "Darius", "JarvanIV")
const CHAMPION_RE    = /^[a-zA-Z0-9]{1,50}$/;
const VALID_BRACKETS = new Set(["low", "mid", "high", "elite"]);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { myChampion, vsChampion, eloBracket } = body;

  if (!myChampion || !vsChampion || !eloBracket) {
    return NextResponse.json(
      { error: "myChampion, vsChampion, and eloBracket are required" },
      { status: 400 }
    );
  }

  if (!CHAMPION_RE.test(myChampion) || !CHAMPION_RE.test(vsChampion)) {
    return NextResponse.json(
      { error: "Invalid champion name — must be 1-50 alphanumeric characters" },
      { status: 400 }
    );
  }

  if (!VALID_BRACKETS.has(eloBracket)) {
    return NextResponse.json({ error: "Invalid eloBracket" }, { status: 400 });
  }

  try {
    const match = await joinQueueAndMatch(
      session.userId,
      myChampion,
      vsChampion,
      eloBracket as EloBracket
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
