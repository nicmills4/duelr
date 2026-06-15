import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";
import { getSession } from "@/lib/session";
import { leaveLobby, leaveLobbyGroup } from "@/lib/lobby";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      await Promise.all([
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
