import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/match/[id]/report
 *
 * Records a 1v1 outcome. The desktop app is the SOLE reporter: at end-of-game it
 * reads first blood from the League client (LCU) and submits the result for the
 * local player. There is no manual reporting and no two-sided confirmation —
 * a single report from either participant is authoritative and finalizes the
 * match, because the LCU reading reflects the real game for both players. This
 * is what gates the leaderboard to desktop-involved matches: with the Riot cron
 * removed and no web reporting UI, an outcome can only originate here.
 *
 * Body: { result: "win" | "loss", myChampion?, oppChampion? } — all relative to
 * the calling participant. The optional champions (DDragon keys, read by the
 * desktop app from the LCU match-history record) overwrite the picks indicated
 * at lobby creation, so the Match reflects what was ACTUALLY played. A single
 * desktop client supplies both sides, since match history exposes every player.
 */
// DDragon champion keys are letters only (e.g. "Orianna", "MonkeyKing").
const CHAMP_KEY = /^[A-Za-z]{1,30}$/;
const validChamp = (v: unknown): v is string =>
  typeof v === "string" && CHAMP_KEY.test(v);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: matchId } = await params;
  const { result, myChampion, oppChampion } = await req.json(); // "win" | "loss" + champs

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

  // Idempotent: the first authoritative report wins. If both players' clients
  // report (they'll agree, since both read the same first blood), the second is
  // a harmless no-op rather than a conflict.
  if (match.outcome) {
    return NextResponse.json({ ok: true, outcome: match.outcome, alreadyRecorded: true });
  }

  // A single report finalizes the outcome. Map the caller's win/loss to the
  // absolute A_WIN / B_WIN, and mirror both report fields for consistency.
  const callerWon = result === "win";
  const outcome =
    (isPlayerA && callerWon) || (isPlayerB && !callerWon) ? "A_WIN" : "B_WIN";

  // Overwrite the indicated picks with what was actually played. The caller's
  // own champion (myChampion) maps to their side (A or B); the opponent's to the
  // other side. Only apply valid keys, so a missing/garbage value leaves the
  // indicated pick untouched rather than clobbering it.
  const champData: { champA?: string; champB?: string } = {};
  if (validChamp(myChampion)) {
    if (isPlayerA) champData.champA = myChampion;
    else champData.champB = myChampion;
  }
  if (validChamp(oppChampion)) {
    if (isPlayerA) champData.champB = oppChampion;
    else champData.champA = oppChampion;
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      outcome,
      playerAReport: outcome === "A_WIN" ? "win" : "loss",
      playerBReport: outcome === "B_WIN" ? "win" : "loss",
      ...champData,
    },
  });

  return NextResponse.json({ ok: true, outcome });
}
