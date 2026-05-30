import { NextRequest, NextResponse } from "next/server";
import { getAccountByRiotId, parseRiotId, type Region } from "@/lib/riot";

export async function POST(req: NextRequest) {
  try {
    const { riotId, region } = await req.json();

    if (!riotId || !region) {
      return NextResponse.json({ error: "riotId and region are required" }, { status: 400 });
    }

    const parsed = parseRiotId(riotId);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid Riot ID format. Use GameName#TAG" },
        { status: 400 }
      );
    }

    const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region as Region);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ valid: true, puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
