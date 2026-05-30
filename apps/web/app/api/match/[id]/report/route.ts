import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await params;
  const { result } = await req.json(); // "win" | "loss"

  if (result !== "win" && result !== "loss") {
    return NextResponse.json({ error: "result must be 'win' or 'loss'" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const isPlayerA = match.playerAId === session.userId;
  const isPlayerB = match.playerBId === session.userId;
  if (!isPlayerA && !isPlayerB) {
    return NextResponse.json({ error: "Not a participant in this match" }, { status: 403 });
  }

  // Don't allow re-reporting once any outcome is set (including DISPUTED).
  // Players cannot change their report after the fact — disputes must go through support.
  if (match.outcome) {
    return NextResponse.json({ error: "Outcome already recorded" }, { status: 409 });
  }

  const update = isPlayerA ? { playerAReport: result } : { playerBReport: result };
  const updated = await prisma.match.update({
    where: { id: matchId },
    data:  update,
  });

  // Resolve outcome when both players have reported
  const aReport = isPlayerA ? result : updated.playerAReport;
  const bReport = isPlayerB ? result : updated.playerBReport;

  if (aReport && bReport) {
    const agree = (aReport === "win" && bReport === "loss") ||
                  (aReport === "loss" && bReport === "win");
    const outcome = agree
      ? (aReport === "win" ? "A_WIN" : "B_WIN")
      : "DISPUTED";

    await prisma.match.update({ where: { id: matchId }, data: { outcome } });
    return NextResponse.json({ ok: true, outcome });
  }

  return NextResponse.json({ ok: true, outcome: null, waiting: "other player" });
}
