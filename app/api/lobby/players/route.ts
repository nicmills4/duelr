import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLobbyPlayers, getLobbyGroups, getUserLobbyGroup } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  const [players, groups, myGroup] = await Promise.all([
    getLobbyPlayers(),
    getLobbyGroups(),
    session ? getUserLobbyGroup(session.userId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ players, groups, myGroup });
}
