import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

// ── PATCH /api/admin/coaches/[id] ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Build update payload with explicit types to satisfy Prisma's generated client
  type CoachUpdate = {
    isApproved?:   boolean;
    isActive?:     boolean;
    verifiedTier?: string;
    bio?:          string | null;
    hourlyRate?:   number;
    champions?:    string;
    specialties?:  string;
  };
  const updates: CoachUpdate = {};

  if (typeof body.isApproved   === "boolean") updates.isApproved   = body.isApproved;
  if (typeof body.isActive     === "boolean") updates.isActive     = body.isActive;
  if (typeof body.verifiedTier === "string")  updates.verifiedTier = body.verifiedTier;
  if (typeof body.bio          === "string")  updates.bio          = body.bio || null;
  if (typeof body.hourlyRateDollars === "number")
    updates.hourlyRate = Math.round(body.hourlyRateDollars * 100);
  if (Array.isArray(body.champions))
    updates.champions  = JSON.stringify(body.champions);
  if (Array.isArray(body.specialties))
    updates.specialties = JSON.stringify(body.specialties);

  // Nothing to update — treat as not found
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  try {
    const profile = await prisma.coachProfile.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  updates as any,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (err: unknown) {
    // P2025 = record not found
    const code = (err as { code?: string })?.code;
    if (code === "P2025" || code === "P2016") {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE /api/admin/coaches/[id] ────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.coachProfile.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
