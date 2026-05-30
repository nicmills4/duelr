/**
 * POST /api/admin/seed-test-user
 *
 * Development-only endpoint. Creates the TEST_EMAIL account directly in the
 * database without going through the Riot API. Used by the test runner when
 * the Riot API key is expired and normal registration fails.
 *
 * Requires a valid admin session (ADMIN_PASSWORD) so it can never be called
 * by anonymous users. Also blocked in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession }        from "@/lib/admin-auth";
import { hashPassword }              from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Blocked in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Requires admin auth
  if (!await verifyAdminSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.riotId || !body?.region) {
    return NextResponse.json({ error: "email, password, riotId, region required" }, { status: 400 });
  }

  const { email, password, riotId, region } = body;

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate password length
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Validate Riot ID format
  if (!riotId.includes("#")) {
    return NextResponse.json({ error: "Invalid Riot ID format" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  // Use a deterministic fake PUUID based on the email (test-only)
  const fakePuuid = `test-puuid-${Buffer.from(email).toString("hex").slice(0, 32)}`;

  try {
    // Note: emailVerified may not be in the generated Prisma client types if
    // `prisma generate` hasn't been re-run since the field was added to the schema.
    // We therefore set it via a raw SQL query AFTER the upsert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertData: any = {
      where:  { email },
      update: { passwordHash, accountType: "full", riotId, region },
      create: { email, passwordHash, riotId, puuid: fakePuuid, region, accountType: "full" },
    };

    const user = await prisma.user.upsert(upsertData);

    // Mark email as verified via raw SQL (handles the case where the Prisma client
    // was generated before the emailVerified column was added to the schema)
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "emailVerified" = true WHERE id = $1`,
      user.id
    );

    return NextResponse.json({ ok: true, userId: user.id, riotId: user.riotId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique constraint on riotId — another user already has this Riot ID
    if ((err as { code?: string })?.code === "P2002") {
      // Try to update that user instead (riotId taken by a different record)
      try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (!existing) {
          return NextResponse.json({ error: "riotId already used by another account" }, { status: 409 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, accountType: "full" } as any });
        await prisma.$executeRawUnsafe(`UPDATE "User" SET "emailVerified" = true WHERE id = $1`, existing.id);
        return NextResponse.json({ ok: true, userId: existing.id, riotId: existing.riotId });
      } catch (e2) {
        return NextResponse.json({ error: String(e2) }, { status: 500 });
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
