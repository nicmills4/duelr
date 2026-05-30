import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

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
        accountType:   true,
        isPremium:     true,
        emailVerified: true,
        createdAt:     true,
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
// Body: { userId, tier: "guest" | "full" | "premium" }
export async function PATCH(req: NextRequest) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // emailVerified toggle: { userId, emailVerified: boolean }
  if (typeof body.emailVerified === "boolean") {
    const user = await prisma.user.update({
      where:  { id: body.userId },
      data:   { emailVerified: body.emailVerified },
      select: { id: true, riotId: true, emailVerified: true },
    }).catch(() => null);

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Bust session cache so the change is reflected immediately on next request
    try {
      const sessions = await prisma.session.findMany({
        where:  { userId: body.userId },
        select: { id: true },
      });
      if (sessions.length > 0)
        await Promise.all(sessions.map(s => redis.del(`session_cache:${s.id}`)));
    } catch {}

    return NextResponse.json({ ok: true, user });
  }

  const tierMap: Record<string, { accountType: string; isPremium: boolean }> = {
    guest:   { accountType: "guest", isPremium: false },
    full:    { accountType: "full",  isPremium: false },
    premium: { accountType: "full",  isPremium: true  },
  };

  const updates = tierMap[body.tier as string];
  if (!updates) return NextResponse.json({ error: "tier must be guest, full, or premium" }, { status: 400 });

  const user = await prisma.user.update({
    where:  { id: body.userId },
    data:   updates,
    select: { id: true, riotId: true, accountType: true, isPremium: true },
  }).catch(() => null);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Bust session cache so the change takes effect immediately
  try {
    const sessions = await prisma.session.findMany({
      where:  { userId: body.userId },
      select: { id: true },
    });
    if (sessions.length > 0)
      await Promise.all(sessions.map(s => redis.del(`session_cache:${s.id}`)));
  } catch {}

  return NextResponse.json({ ok: true, user });
}
