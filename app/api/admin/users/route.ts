import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// ── GET /api/admin/users?q=&page= ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const search = params.get("q") ?? "";
  const page   = Math.max(1, parseInt(params.get("page") ?? "1", 10));

  const where = search
    ? {
        OR: [
          { riotId: { contains: search, mode: "insensitive" as const } },
          { email:  { contains: search, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
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
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize:  PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });
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
