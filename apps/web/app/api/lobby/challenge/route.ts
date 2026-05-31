import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createChallenge, isInLobby } from "@/lib/lobby";
import { redis, notificationChannel } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.targetUserId) {
    return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
  }

  const challengerId = session.userId;
  const { targetUserId } = body;

  // Which client is the challenger on? Lobby join links require the desktop
  // app's LCU bridge, so the responder's UI uses this to decide whether a join
  // link is ever coming. Desktop sends platform: "desktop"; web omits it.
  const challengerPlatform: "web" | "desktop" =
    body.platform === "desktop" ? "desktop" : "web";

  if (targetUserId === challengerId) {
    return NextResponse.json({ error: "Cannot challenge yourself" }, { status: 400 });
  }

  // Ensure target is still in the lobby
  const targetAvailable = await isInLobby(targetUserId);
  if (!targetAvailable) {
    return NextResponse.json({ error: "Player is no longer available" }, { status: 404 });
  }

  // Load challenger's lobby entry and Riot ID
  const [challengerEntry, challengerUser] = await Promise.all([
    redis.get(`lobby:player:${challengerId}`),
    prisma.user.findUnique({
      where: { id: challengerId },
      select: { riotId: true },
    }),
  ]);

  if (!challengerEntry || !challengerUser) {
    return NextResponse.json(
      { error: "You must be in the lobby to send a challenge" },
      { status: 400 }
    );
  }

  const entry = JSON.parse(challengerEntry) as {
    myChampion: string; champName: string; champImage: string; eloBracket: string;
  };

  const challengeId = await createChallenge({
    challengerId,
    challengerRiotId: challengerUser.riotId,
    challengerChampion: entry.myChampion,
    challengerChampName: entry.champName,
    challengerChampImage: entry.champImage,
    challengerElo: entry.eloBracket,
    targetId: targetUserId,
    challengerPlatform,
  });

  // Push real-time notification to the target
  await redis.publish(
    notificationChannel(targetUserId),
    JSON.stringify({
      type: "challenge",
      challengeId,
      challengerRiotId: challengerUser.riotId,
      challengerChampName: entry.champName,
      challengerChampImage: entry.champImage,
      challengerElo: entry.eloBracket,
    })
  );

  return NextResponse.json({ challengeId, expiresIn: 45 });
}
