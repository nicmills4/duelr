import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { joinQueueAndMatch } from "@/lib/matchmaking";
import type { EloBracket } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { myChampion, vsChampion, eloBracket } = await req.json();

  if (!myChampion || !vsChampion || !eloBracket) {
    return NextResponse.json({ error: "myChampion, vsChampion, and eloBracket are required" }, { status: 400 });
  }

  const validBrackets = ["low", "mid", "high", "elite"];
  if (!validBrackets.includes(eloBracket)) {
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
