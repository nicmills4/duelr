import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getChallenge, deleteChallenge } from "@/lib/lobby";
import { redis, notificationChannel } from "@/lib/redis";

/**
 * POST /api/lobby/challenge/cancel
 *
 * Withdraw an outgoing challenge. Without this, "Cancel" in the client is
 * cosmetic — the challenge stays live server-side and the target can still
 * accept it minutes later, yanking the challenger into a match they thought
 * they had cancelled.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.challengeId) {
    return NextResponse.json({ error: "challengeId required" }, { status: 400 });
  }

  const challenge = await getChallenge(body.challengeId);
  if (!challenge) {
    // Already expired, declined, or accepted — nothing to cancel. The caller
    // treats 404 as "gone"; if it was accepted, the challenge_accepted SSE
    // event carries the truth.
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (challenge.challengerId !== session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await deleteChallenge(body.challengeId);

  // Tell the target their incoming challenge is gone so their UI doesn't offer
  // an Accept that would 404.
  await redis.publish(
    notificationChannel(challenge.targetId),
    JSON.stringify({ type: "challenge_cancelled", challengeId: body.challengeId })
  );

  return NextResponse.json({ ok: true });
}
