import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";
import { getSession } from "@/lib/session";
import { leaveQueue } from "@/lib/matchmaking";
import { leaveLobby, leaveLobbyGroup } from "@/lib/lobby";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      await Promise.all([
        leaveQueue(session.userId).catch(() => {}),
        leaveLobby(session.userId).catch(() => {}),
        leaveLobbyGroup(session.userId).catch(() => {}),
      ]);
    }
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
