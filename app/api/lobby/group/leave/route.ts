import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { leaveLobbyGroup } from "@/lib/lobby";
import { redis, notificationChannel } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { disbanded, remainingMembers, group } =
    await leaveLobbyGroup(session.userId);

  if (!group) return NextResponse.json({ ok: true });

  // Notify remaining members
  const event = disbanded
    ? { type: "group_disbanded" }
    : { type: "group_updated", group };

  await Promise.all(
    remainingMembers.map((m) =>
      redis.publish(notificationChannel(m.userId), JSON.stringify(event))
    )
  );

  return NextResponse.json({ ok: true, disbanded });
}
