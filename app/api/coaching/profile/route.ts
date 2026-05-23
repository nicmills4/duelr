/**
 * Coach profile endpoint — read-only for regular users.
 * Profiles are created and managed by the site owner via scripts/manage-coaches.ts.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET — return the caller's own profile (if any) ────────────────────────────
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
      isApproved:   profile.isApproved,
    },
  });
}

// ── POST / DELETE — disabled; profiles are admin-managed only ─────────────────
export async function POST() {
  return NextResponse.json(
    { error: "Coach profiles are managed by the Duelr team. Contact us to be listed." },
    { status: 403 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Coach profiles are managed by the Duelr team. Contact us to be removed." },
    { status: 403 }
  );
}
