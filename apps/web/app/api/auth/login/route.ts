import { NextRequest, NextResponse } from "next/server";
import { getAccountByRiotId, parseRiotId, type Region } from "@/lib/riot";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

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
      return NextResponse.json({ error: "Riot account not found" }, { status: 404 });
    }

    // Normalised Riot ID (use exact casing from Riot)
    const normalizedRiotId = `${account.gameName}#${account.tagLine}`;

    // Upsert user — never downgrade a full account back to guest
    const user = await prisma.user.upsert({
      where: { puuid: account.puuid },
      update: { riotId: normalizedRiotId, region },
      create: { puuid: account.puuid, riotId: normalizedRiotId, region, accountType: "guest" },
    });

    // Block guest login if this Riot ID is already registered as a full account
    if (user.accountType === "full") {
      return NextResponse.json(
        { error: "This Riot ID is linked to an existing account. Please log in with your email and password." },
        { status: 403 }
      );
    }

    await createSession(user.id);

    return NextResponse.json({ ok: true, riotId: normalizedRiotId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
