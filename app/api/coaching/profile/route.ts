/**
 * Create / update / delete the authenticated user's coach profile.
 * Requires Masters+ rank — verified against the Riot API on creation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AVAILABILITY_SLOTS } from "@/lib/partner-types";

const VALID_AVAIL    = new Set<string>(AVAILABILITY_SLOTS.map((s) => s.id));
const CHAMPION_RE    = /^[a-zA-Z0-9]{1,50}$/;
const MASTERS_TIERS  = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** Fetch the caller's solo-queue tier from Riot via our existing rank endpoint. */
async function verifyMastersTier(
  riotId: string,
  region: string,
  baseUrl: string
): Promise<string | null> {
  try {
    const res  = await fetch(`${baseUrl}/api/me/rank`, {
      headers: { "x-internal-riotid": riotId, "x-internal-region": region },
    });
    if (!res.ok) return null;
    const data = await res.json() as { tier?: string };
    return data.tier ?? null;
  } catch {
    return null;
  }
}

// ── GET — return own profile ──────────────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: session.userId } });
  if (!profile) return NextResponse.json({ profile: null });

  return NextResponse.json({
    profile: {
      id:           profile.id,
      displayCode:  profile.displayCode,
      verifiedTier: profile.verifiedTier,
      champions:    JSON.parse(profile.champions),
      specialties:  JSON.parse(profile.specialties),
      hourlyRate:   profile.hourlyRate,
      bio:          profile.bio,
      availability: JSON.parse(profile.availability),
      isActive:     profile.isActive,
    },
  });
}

// ── POST — create or update ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { champions, specialties, hourlyRate, bio, availability } = body;

  // ── Validate champions ───────────────────────────────────────────────────
  if (!Array.isArray(champions) || champions.length === 0)
    return NextResponse.json({ error: "Add at least one champion" }, { status: 400 });
  for (const id of [...(champions ?? []), ...(specialties ?? [])]) {
    if (!CHAMPION_RE.test(id))
      return NextResponse.json({ error: `Invalid champion id: "${id}"` }, { status: 400 });
  }

  // ── Validate rate ────────────────────────────────────────────────────────
  const rateCents = Math.round(Number(hourlyRate) * 100);
  if (!rateCents || rateCents < 500 || rateCents > 50_000)
    return NextResponse.json({ error: "Rate must be between $5 and $500/hr" }, { status: 400 });

  const avail: string[] = Array.isArray(availability)
    ? availability.filter((a: string) => VALID_AVAIL.has(a))
    : [];

  if (typeof bio === "string" && bio.length > 500)
    return NextResponse.json({ error: "Bio max 500 characters" }, { status: 400 });

  // ── Rank verification (only on first creation) ───────────────────────────
  const existing = await prisma.coachProfile.findUnique({ where: { userId: session.userId } });

  let verifiedTier = existing?.verifiedTier ?? null;

  if (!existing) {
    // First-time creation: verify Masters+ rank via Riot API
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const tier   = await verifyMastersTier(session.user.riotId, session.user.region, origin);

    if (!tier || !MASTERS_TIERS.has(tier)) {
      return NextResponse.json(
        { error: `Coaching requires Masters or above. Your current tier: ${tier ?? "Unranked"}.` },
        { status: 403 }
      );
    }
    verifiedTier = tier;
  }

  // ── Generate a unique display code for new profiles ──────────────────────
  const displayCode = existing?.displayCode ?? Math.random().toString(36).substring(2, 6).toUpperCase();

  await prisma.coachProfile.upsert({
    where:  { userId: session.userId },
    create: {
      userId:       session.userId,
      displayCode,
      verifiedTier: verifiedTier!,
      champions:    JSON.stringify(champions),
      specialties:  JSON.stringify(specialties ?? []),
      hourlyRate:   rateCents,
      bio:          bio?.trim() || null,
      availability: JSON.stringify(avail),
    },
    update: {
      champions:    JSON.stringify(champions),
      specialties:  JSON.stringify(specialties ?? []),
      hourlyRate:   rateCents,
      bio:          bio?.trim() || null,
      availability: JSON.stringify(avail),
    },
  });

  return NextResponse.json({ ok: true });
}

// ── DELETE — remove own profile ───────────────────────────────────────────────
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await prisma.coachProfile.deleteMany({ where: { userId: session.userId } });
  return NextResponse.json({ ok: true });
}
