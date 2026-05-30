import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimVerificationToken } from "@/lib/verify-token";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token as string | undefined;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 400 });
  }

  const userId = await claimVerificationToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Token expired or already used" }, { status: 410 });
  }

  await prisma.user.update({
    where: { id: userId },
    data:  { emailVerified: true },
  });

  // Bust session cache so the verified flag is visible immediately
  const sessions = await prisma.session.findMany({
    where:  { userId },
    select: { id: true },
  });
  if (sessions.length) {
    await redis.del(...sessions.map(s => `session_cache:${s.id}`));
  }

  return NextResponse.json({ ok: true });
}
