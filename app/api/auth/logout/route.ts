import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";
import { getSession } from "@/lib/session";
import { leaveQueue } from "@/lib/matchmaking";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      await leaveQueue(session.userId).catch(() => {});
    }
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
