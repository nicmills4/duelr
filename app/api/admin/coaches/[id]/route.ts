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

  const updates: Record<string, unknown> = {};

  if (typeof body.isApproved  === "boolean") updates.isApproved  = body.isApproved;
  if (typeof body.isActive    === "boolean") updates.isActive    = body.isActive;
  if (typeof body.verifiedTier === "string") updates.verifiedTier = body.verifiedTier;
  if (typeof body.bio          === "string") updates.bio          = body.bio || null;
  if (typeof body.hourlyRateDollars === "number")
    updates.hourlyRate = Math.round(body.hourlyRateDollars * 100);
  if (Array.isArray(body.champions))
    updates.champions  = JSON.stringify(body.champions);
  if (Array.isArray(body.specialties))
    updates.specialties = JSON.stringify(body.specialties);

  const profile = await prisma.coachProfile.update({
    where: { id },
    data:  updates,
  }).catch(() => null);

  if (!profile) return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  return NextResponse.json({ ok: true, profile });
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
