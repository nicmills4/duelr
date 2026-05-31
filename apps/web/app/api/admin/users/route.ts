import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Delete all cached sessions for a user so changes take effect immediately. */
async function bustSessionCache(userId: string) {
  try {
    const sessions = await prisma.session.findMany({
      where:  { userId },
      select: { id: true },
    });
    if (sessions.length > 0)
      await Promise.all(sessions.map(s => redis.del(`session_cache:${s.id}`)));
  } catch {}
}

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

    await bustSessionCache(body.userId);
    return NextResponse.json({ ok: true, user });
  }

  // password set/reset: { userId, password: string, email?: string }
  // Optionally also sets the email — needed for accounts (e.g. coaches added by
  // an admin) that never completed signup and therefore have no login email.
  if (typeof body.password === "string") {
    if (body.password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    const target = await prisma.user.findUnique({
      where:  { id: body.userId },
      select: { id: true, email: true },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const data: { passwordHash: string; email?: string; accountType?: string } = {
      passwordHash: await hashPassword(body.password),
    };

    // Optionally set/replace the email
    if (typeof body.email === "string" && body.email.trim() !== "") {
      const normalizedEmail = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail))
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

      const clash = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (clash && clash.id !== body.userId)
        return NextResponse.json({ error: "Email already in use by another account" }, { status: 409 });

      data.email = normalizedEmail;
    }

    // An account with both an email and a password is a "full" account, so promote
    // guests once they have working email + password login credentials.
    if (data.email ?? target.email) data.accountType = "full";

    const user = await prisma.user.update({
      where:  { id: body.userId },
      data,
      select: { id: true, riotId: true, email: true, accountType: true },
    }).catch(() => null);

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await bustSessionCache(body.userId);
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

  await bustSessionCache(body.userId);
  return NextResponse.json({ ok: true, user });
}
