import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  joinLobbyGroup, leaveLobby, leaveLobbyGroup,
} from "@/lib/lobby";
import { leaveQueue } from "@/lib/matchmaking";
import { redis, notificationChannel } from "@/lib/redis";
import type { SlotKey, DuoRole, LobbyGroup, GroupSlot } from "@/lib/lobby-types";
import { ALL_SLOTS, SLOT_ROLE, groupIsFull } from "@/lib/lobby-types";
import { BRACKET_ORDER } from "@/lib/constants";
import { createMatchVoiceChannel } from "@/lib/discord";

const VALID_SLOTS = new Set<string>(["team1_adc", "team1_support", "team2_adc", "team2_support"]);
const CHAMPION_RE = /^[a-zA-Z0-9]{1,50}$/;

export const dynamic = "force-dynamic";

/** Publish an SSE event to every filled slot in the group */
async function notifyGroup(group: LobbyGroup, event: object) {
  const members = ALL_SLOTS.map((k) => group[k]).filter(Boolean) as GroupSlot[];
  await Promise.all(
    members.map((m) =>
      redis.publish(notificationChannel(m.userId), JSON.stringify(event))
    )
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)  return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { groupId, slotKey, champId, champName, champImage } = body;

  if (!groupId || typeof groupId !== "string")
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  if (!VALID_SLOTS.has(slotKey))
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  if (!CHAMPION_RE.test(champId))
    return NextResponse.json({ error: "Invalid champion" }, { status: 400 });
  if (typeof champName !== "string" || typeof champImage !== "string")
    return NextResponse.json({ error: "Missing champion metadata" }, { status: 400 });

  const { userId, user } = session;

  // Mutual exclusivity: leave 1v1 lobby, queue, and any other 2v2 group first
  await Promise.all([
    leaveLobby(userId).catch(() => {}),
    leaveQueue(userId).catch(() => {}),
    leaveLobbyGroup(userId).catch(() => {}),
  ]);

  const slot: Omit<GroupSlot, "isHost"> = {
    userId,
    riotId:    user.riotId,
    region:    user.region,
    champId,
    champName,
    champImage,
    role: SLOT_ROLE[slotKey as SlotKey] as DuoRole,
  };

  let result: { group: LobbyGroup; isFull: boolean };
  try {
    result = await joinLobbyGroup(userId, groupId, slotKey as SlotKey, slot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to join";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { group, isFull } = result;

  let voiceChannelUrl: string | undefined;

  if (isFull) {
    // Build team summaries, create voice channel, notify all 4 members
    const team1 = [group.team1_adc, group.team1_support].filter(Boolean) as GroupSlot[];
    const team2 = [group.team2_adc, group.team2_support].filter(Boolean) as GroupSlot[];

    voiceChannelUrl = (await createMatchVoiceChannel("2v2-bot-lane", 4))?.url ?? undefined;

    await notifyGroup(group, {
      type: "group_ready",
      team1,
      team2,
      voiceChannelUrl,
    });
  } else {
    // Notify existing members that someone new joined
    // (exclude the joiner — they already know)
    const others = ALL_SLOTS
      .map((k) => group[k])
      .filter((s): s is GroupSlot => !!s && s.userId !== userId);

    await Promise.all(
      others.map((m) =>
        redis.publish(
          notificationChannel(m.userId),
          JSON.stringify({ type: "group_updated", group })
        )
      )
    );
  }

  return NextResponse.json({ ok: true, group, isFull, voiceChannelUrl });
}
