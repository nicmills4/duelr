import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { leaveLobby } from "@/lib/lobby";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await leaveLobby(session.userId);
  return NextResponse.json({ ok: true });
}
