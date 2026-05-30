import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { leaveQueue } from "@/lib/matchmaking";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await leaveQueue(session.userId);
  return NextResponse.json({ ok: true });
}
