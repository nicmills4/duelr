/**
 * GET /api/lobby/status
 * Returns whether the current user is in the lobby and their remaining TTL.
 * Used by LobbyBrowser on mount to re-arm the client-side expiry timer
 * after navigating away and returning.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { redis } from "@/lib/redis";
import { lobbyKey, LOBBY_TTL } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ available: false });

  const ttl = await redis.ttl(lobbyKey(session.userId));

  if (ttl <= 0) {
    return NextResponse.json({ available: false });
  }

  return NextResponse.json({
    available:  true,
    expiresAt:  Date.now() + ttl * 1000,
    ttlSeconds: ttl,
    maxTtl:     LOBBY_TTL,
  });
}
