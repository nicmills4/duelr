import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createLobbyGroup, leaveLobby, leaveLobbyGroup,
} from "@/lib/lobby";
import { BRACKET_ORDER } from "@/lib/constants";
import type { SlotKey, DuoRole } from "@/lib/lobby-types";
import { SLOT_ROLE } from "@/lib/lobby-types";

const VALID_BRACKETS = new Set<string>(BRACKET_ORDER);
const VALID_SLOTS    = new Set<string>(["team1_adc", "team1_support", "team2_adc", "team2_support"]);
const CHAMPION_RE    = /^[a-zA-Z0-9]{1,50}$/;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)  return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { slotKey, champId, champName, champImage, eloBracket } = body;

  if (!VALID_SLOTS.has(slotKey))
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  if (!CHAMPION_RE.test(champId))
    return NextResponse.json({ error: "Invalid champion" }, { status: 400 });
  if (!VALID_BRACKETS.has(eloBracket))
    return NextResponse.json({ error: "Invalid elo bracket" }, { status: 400 });
  if (typeof champName !== "string" || typeof champImage !== "string")
    return NextResponse.json({ error: "Missing champion metadata" }, { status: 400 });

  const { userId, user } = session;

  // Leave any existing 1v1 lobby or 2v2 group
  await Promise.all([
    leaveLobby(userId).catch(() => {}),
    leaveLobbyGroup(userId).catch(() => {}),
  ]);

  const slot = {
    userId,
    riotId:    user.riotId,
    region:    user.region,
    champId,
    champName,
    champImage,
    role: SLOT_ROLE[slotKey as SlotKey] as DuoRole,
  };

  const group = await createLobbyGroup(userId, slotKey as SlotKey, slot, eloBracket);

  return NextResponse.json({ ok: true, group });
}
