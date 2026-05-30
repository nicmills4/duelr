import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setLobbyAvailable, leaveLobbyGroup, LOBBY_TTL } from "@/lib/lobby";
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

  const { myChampion, champName, champImage, eloBracket, acceptsType, vsChampions } = body;

  if (!CHAMPION_RE.test(myChampion)) {
    return NextResponse.json({ error: "Invalid champion" }, { status: 400 });
  }
  if (!VALID_BRACKETS.has(eloBracket)) {
    return NextResponse.json({ error: "Invalid elo bracket" }, { status: 400 });
  }
  if (!VALID_ACCEPTS.has(acceptsType ?? "any")) {
    return NextResponse.json({ error: "Invalid acceptsType" }, { status: 400 });
  }
  if (typeof champName !== "string" || typeof champImage !== "string") {
    return NextResponse.json({ error: "Missing champion metadata" }, { status: 400 });
  }

  // Validate & sanitise vsChampions (optional, max 5)
  const validVs: string[] = Array.isArray(vsChampions)
    ? (vsChampions as unknown[])
        .filter((v): v is string => typeof v === "string" && CHAMPION_RE.test(v))
        .slice(0, 5)
    : [];

  const userId = session.userId;

  // Mutual exclusivity: leave queue and 2v2 group before going 1v1 available
  await Promise.all([
    leaveQueue(userId).catch(() => {}),
    leaveLobbyGroup(userId).catch(() => {}),
  ]);

  await setLobbyAvailable(userId, {
    myChampion,
    champName,
    champImage,
    eloBracket,
    acceptsType: (acceptsType as AcceptsType) ?? "any",
    vsChampions: validVs,
  });

  return NextResponse.json({ ok: true, expiresAt: Date.now() + LOBBY_TTL * 1000 });
}
