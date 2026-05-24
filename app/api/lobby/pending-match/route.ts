/**
 * GET /api/lobby/pending-match
 *
 * Returns a pending match result for the current user if one exists.
 *
 * ?peek=true  — read without deleting (used by GlobalLobbyNotifier to
 *               show the toast while keeping the key for LobbyBrowser
 *               to claim on mount)
 *
 * (no param)  — read and delete (one-time claim, used by LobbyBrowser
 *               on mount and when the user explicitly dismisses the toast)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ match: null });

  const peek = new URL(req.url).searchParams.get("peek") === "true";
  const key  = `lobby:match_result:${session.userId}`;
  const raw  = await redis.get(key);

  if (!raw) return NextResponse.json({ match: null });

  if (!peek) {
    await redis.del(key);
  }

  return NextResponse.json({ match: JSON.parse(raw) });
}
