import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getChallenge, deleteChallenge, leaveLobby } from "@/lib/lobby";
import { redis, notificationChannel } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import type { LobbyEntry } from "@/lib/lobby-types";
import { createMatchVoiceChannel } from "@/lib/discord";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.accept !== "boolean" || !body.challengeId) {
    return NextResponse.json({ error: "challengeId and accept required" }, { status: 400 });
  }

  const responderId = session.userId;
  const { challengeId, accept } = body;

  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    return NextResponse.json({ error: "Challenge expired or not found" }, { status: 404 });
  }
  if (challenge.targetId !== responderId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await deleteChallenge(challengeId);

  if (!accept) {
    // Notify challenger of the decline
    await redis.publish(
      notificationChannel(challenge.challengerId),
      JSON.stringify({ type: "challenge_declined", challengeId })
    );
    return NextResponse.json({ ok: true, accepted: false });
  }

  // Accepted — gather responder data then notify both parties
  const [responderRaw, responderUser] = await Promise.all([
    redis.get(`lobby:player:${responderId}`),
    prisma.user.findUnique({
      where: { id: responderId },
      select: { riotId: true, region: true },
    }),
  ]);

  const responderLobby = responderRaw ? (JSON.parse(responderRaw) as LobbyEntry) : null;

  // Remove both players from the lobby and create a voice channel in parallel
  const [, , voiceChannelUrl] = await Promise.all([
    leaveLobby(challenge.challengerId),
    leaveLobby(responderId),
    createMatchVoiceChannel("1v1-match", 2),
  ]);

  const opponentForChallenger = {
    riotId:          responderUser?.riotId ?? "Unknown",
    region:          responderUser?.region ?? "",
    champName:       responderLobby?.champName ?? "",
    champImage:      responderLobby?.champImage ?? "",
    voiceChannelUrl: voiceChannelUrl ?? undefined,
  };

  // Persist match result in Redis for 10 min so the challenger can retrieve it
  // if they navigated away and their SSE was closed before accepting.
  const MATCH_RESULT_TTL = 60 * 10; // 10 minutes
  await redis.setex(
    `lobby:match_result:${challenge.challengerId}`,
    MATCH_RESULT_TTL,
    JSON.stringify(opponentForChallenger)
  );

  // Notify challenger — their SSE will receive this and show the match card
  await redis.publish(
    notificationChannel(challenge.challengerId),
    JSON.stringify({ type: "challenge_accepted", opponent: opponentForChallenger })
  );

  // Return challenger data to the responder inline (they accepted synchronously)
  return NextResponse.json({
    ok:       true,
    accepted: true,
    challenger: {
      riotId:          challenge.challengerRiotId,
      champName:       challenge.challengerChampName,
      champImage:      challenge.challengerChampImage,
      voiceChannelUrl: voiceChannelUrl ?? undefined,
    },
  });
}
