/**
 * GET /api/lobby/pending-match
 *
 * Returns a pending match result for the current user if one exists —
 * i.e. a challenge they sent was accepted while their SSE connection
 * was closed (they had navigated away from the lobby page).
 *
 * The result is deleted after being read so it is only shown once.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ match: null });

  const key = `lobby:match_result:${session.userId}`;
  const raw = await redis.get(key);

  if (!raw) return NextResponse.json({ match: null });

  // Delete immediately — one-time claim
  await redis.del(key);

  return NextResponse.json({ match: JSON.parse(raw) });
}
