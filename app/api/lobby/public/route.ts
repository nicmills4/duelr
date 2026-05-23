/**
 * Public (unauthenticated) lobby snapshot — used by the homepage.
 * Returns player display info only; userId is stripped.
 */
import { NextResponse } from "next/server";
import { getLobbyPlayers } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const players = await getLobbyPlayers();
    // Strip internal userId before returning to unauthenticated callers
    const safe = players.map(({ userId: _uid, ...rest }) => rest);
    return NextResponse.json({ players: safe });
  } catch {
    return NextResponse.json({ players: [] });
  }
}
