/**
 * PATCH /api/match/[id]/lobby-url
 *
 * Called by the desktop app after it creates a 1v1 custom game via the LCU.
 * Stores the gg.riotgames.com join URL on the Match record so the opponent
 * can see it in their match screen.
 *
 * Auth: must be one of the two players in the match.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redis, notificationChannel } from "@/lib/redis";

const JOIN_URL_PATTERN = /^https:\/\/gg\.riotgames\.com\/LOL\?joinCode=[\w-]+$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { joinUrl } = body ?? {};

  if (typeof joinUrl !== "string" || !JOIN_URL_PATTERN.test(joinUrl)) {
    return NextResponse.json({ error: "Invalid joinUrl" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { playerAId: true, playerBId: true, lobbyJoinUrl: true },
  });

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const { playerAId, playerBId } = match;
  const callerId = session.userId;

  if (callerId !== playerAId && callerId !== playerBId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow setting (not changing) the URL once it's been set
  if (match.lobbyJoinUrl) {
    return NextResponse.json({ ok: true, joinUrl: match.lobbyJoinUrl });
  }

  await prisma.match.update({
    where: { id: params.id },
    data: { lobbyJoinUrl: joinUrl },
  });

  // Notify the opponent via the real-time notification channel
  const opponentId = callerId === playerAId ? playerBId : playerAId;
  await redis.publish(
    notificationChannel(opponentId),
    JSON.stringify({ type: "lobby_url", matchId: params.id, joinUrl })
  );

  return NextResponse.json({ ok: true, joinUrl });
}
