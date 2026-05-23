import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLobbyPlayers } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const players = await getLobbyPlayers();
  return NextResponse.json({ players });
}
