import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setLobbyAvailable } from "@/lib/lobby";
import { leaveQueue } from "@/lib/matchmaking";
import { BRACKET_ORDER } from "@/lib/constants";
import type { AcceptsType } from "@/lib/lobby-types";

const VALID_ACCEPTS = new Set<string>(["any", "melee", "ranged"]);
const VALID_BRACKETS = new Set<string>(BRACKET_ORDER);
const CHAMPION_RE = /^[a-zA-Z0-9]{1,50}$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { myChampion, champName, champImage, eloBracket, acceptsType } = body;

  if (!CHAMPION_RE.test(myChampion)) {
    return NextResponse.json({ error: "Invalid champion" }, { status: 400 });
  }
  if (!VALID_BRACKETS.has(eloBracket)) {
    return NextResponse.json({ error: "Invalid elo bracket" }, { status: 400 });
  }
  if (!VALID_ACCEPTS.has(acceptsType)) {
    return NextResponse.json({ error: "Invalid acceptsType" }, { status: 400 });
  }
  if (typeof champName !== "string" || typeof champImage !== "string") {
    return NextResponse.json({ error: "Missing champion metadata" }, { status: 400 });
  }

  const userId = session.userId;

  // Leave the specific matchmaking queue if they were in one
  await leaveQueue(userId).catch(() => {});

  await setLobbyAvailable(userId, {
    myChampion,
    champName,
    champImage,
    eloBracket,
    acceptsType: acceptsType as AcceptsType,
  });

  const { LOBBY_TTL } = await import("@/lib/lobby");
  return NextResponse.json({ ok: true, expiresAt: Date.now() + LOBBY_TTL * 1000 });
}
