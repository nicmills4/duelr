import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET /api/admin/users ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(req.url).searchParams.get("q") ?? "";

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { riotId:      { contains: search, mode: "insensitive" } },
            { email:       { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id:          true,
      riotId:      true,
      region:      true,
      email:       true,
      accountType: true,
      createdAt:   true,
      coachProfile: { select: { id: true, isApproved: true, isActive: true } },
    },
    orderBy: { createdAt: "desc" },
    take:    100,
  });

  return NextResponse.json({ users });
}

// ── PATCH /api/admin/users ────────────────────────────────────────────────────
// Body: { userId, accountType }
export async function PATCH(req: NextRequest) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.accountType === "guest" || body.accountType === "full")
    updates.accountType = body.accountType;

  const user = await prisma.user.update({
    where: { id: body.userId },
    data:  updates,
    select: { id: true, riotId: true, accountType: true },
  }).catch(() => null);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ ok: true, user });
}
