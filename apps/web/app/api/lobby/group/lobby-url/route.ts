/**
 * POST /api/lobby/group/lobby-url
 *   Body: { readyGroupId, joinUrl }
 *   The 2v2 host (group creator) creates a custom game via the desktop LCU bridge
 *   and posts the gg.riotgames.com join URL here. The server stores it once and
 *   fans it out to the other group members over their SSE notification channels.
 *   Auth: caller must be the host of the ready group.
 *
 * GET /api/lobby/group/lobby-url?readyGroupId=...
 *   Poll fallback for members whose SSE event was missed. Returns { joinUrl }.
 *   Auth: caller must be a member of the ready group.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getReadyGroup, setReadyGroupJoinUrl } from "@/lib/lobby";
import { redis, notificationChannel } from "@/lib/redis";

const JOIN_URL_PATTERN = /^https:\/\/gg\.riotgames\.com\/LOL\?joinCode=[\w-]+$/;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { readyGroupId, joinUrl } = body ?? {};

  if (typeof readyGroupId !== "string")
    return NextResponse.json({ error: "readyGroupId required" }, { status: 400 });
  if (typeof joinUrl !== "string" || !JOIN_URL_PATTERN.test(joinUrl))
    return NextResponse.json({ error: "Invalid joinUrl" }, { status: 400 });

  const rg = await getReadyGroup(readyGroupId);
  if (!rg) return NextResponse.json({ error: "Group not found or expired" }, { status: 404 });
  if (rg.hostUserId !== session.userId)
    return NextResponse.json({ error: "Only the host can set the join link" }, { status: 403 });

  // First write wins — returns the existing URL if one was already set.
  const updated = await setReadyGroupJoinUrl(readyGroupId, joinUrl);
  const finalUrl = updated?.joinUrl ?? joinUrl;

  // Fan out to the other members (the host already has it locally).
  await Promise.all(
    rg.memberUserIds
      .filter((id) => id !== rg.hostUserId)
      .map((id) =>
        redis.publish(
          notificationChannel(id),
          JSON.stringify({ type: "group_lobby_url", readyGroupId, joinUrl: finalUrl })
        )
      )
  );

  return NextResponse.json({ ok: true, joinUrl: finalUrl });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const readyGroupId = req.nextUrl.searchParams.get("readyGroupId");
  if (!readyGroupId)
    return NextResponse.json({ error: "readyGroupId required" }, { status: 400 });

  const rg = await getReadyGroup(readyGroupId);
  if (!rg) return NextResponse.json({ joinUrl: null });
  if (!rg.memberUserIds.includes(session.userId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ joinUrl: rg.joinUrl });
}
