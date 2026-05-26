import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getAccountByRiotId, parseRiotId, type Region } from "@/lib/riot";

export const dynamic = "force-dynamic";

function randomDisplayCode(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function uniqueDisplayCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomDisplayCode();
    const existing = await prisma.coachProfile.findUnique({ where: { displayCode: code } });
    if (!existing) return code;
  }
  // fallback: timestamp-based
  return Date.now().toString(36).slice(-4).toUpperCase();
}

// ── GET /api/admin/coaches ─────────────────────────────────────────────────────
export async function GET() {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const coaches = await prisma.coachProfile.findMany({
    include: { user: { select: { id: true, riotId: true, region: true, email: true, accountType: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ coaches });
}

// ── POST /api/admin/coaches ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const {
    riotId, region, verifiedTier, champions, specialties,
    hourlyRateDollars, bio, availability, isApproved = true,
  } = body;

  if (!riotId || !region || !verifiedTier || !hourlyRateDollars)
    return NextResponse.json({ error: "riotId, region, verifiedTier, hourlyRateDollars required" }, { status: 400 });

  // Look up / create the user via Riot API
  const parsed = parseRiotId(riotId);
  if (!parsed)
    return NextResponse.json({ error: "Invalid Riot ID format (GameName#TAG)" }, { status: 400 });

  const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region as Region);
  if (!account)
    return NextResponse.json({ error: "Riot account not found" }, { status: 404 });

  const normalizedRiotId = `${account.gameName}#${account.tagLine}`;

  const user = await prisma.user.upsert({
    where:  { puuid: account.puuid },
    update: { riotId: normalizedRiotId, region },
    create: { puuid: account.puuid, riotId: normalizedRiotId, region, accountType: "guest" },
  });

  // Build or update the coach profile
  const displayCode = await uniqueDisplayCode();
  const hourlyRate  = Math.round(parseFloat(hourlyRateDollars) * 100); // dollars → cents

  const profile = await prisma.coachProfile.upsert({
    where:  { userId: user.id },
    create: {
      userId:       user.id,
      displayCode,
      verifiedTier,
      champions:    JSON.stringify(Array.isArray(champions) ? champions : []),
      specialties:  JSON.stringify(Array.isArray(specialties) ? specialties : []),
      hourlyRate,
      bio:          bio || null,
      availability: JSON.stringify(Array.isArray(availability) ? availability : []),
      isApproved,
      isActive:     true,
    },
    update: {
      verifiedTier,
      champions:    JSON.stringify(Array.isArray(champions) ? champions : []),
      specialties:  JSON.stringify(Array.isArray(specialties) ? specialties : []),
      hourlyRate,
      bio:          bio || null,
      availability: JSON.stringify(Array.isArray(availability) ? availability : []),
      isApproved,
    },
  });

  return NextResponse.json({ ok: true, profile });
}
