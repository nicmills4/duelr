import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLobbyPlayers, getLobbyGroups, getUserLobbyGroup } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [players, groups, myGroup] = await Promise.all([
    getLobbyPlayers(),
    getLobbyGroups(),
    getUserLobbyGroup(session.userId),
  ]);

  return NextResponse.json({ players, groups, myGroup });
}
