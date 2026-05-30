/**
 * GET /api/match/[id]
 *
 * Returns public match metadata for the authenticated caller.
 * Used by both the web app and desktop app to poll for lobbyJoinUrl
 * after a match is found (SSE stream closes before the URL is set).
 *
 * Auth: must be one of the two players in the match.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    select: {
      id:           true,
      playerAId:    true,
      playerBId:    true,
      champA:       true,
      champB:       true,
      eloBracket:   true,
      outcome:      true,
      lobbyJoinUrl: true,
      createdAt:    true,
    },
  });

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const { playerAId, playerBId } = match;
  if (session.userId !== playerAId && session.userId !== playerBId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(match);
}
