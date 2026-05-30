import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimResetToken } from "@/lib/reset-token";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}));

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Claim the token — single use, deleted atomically
  const userId = await claimResetToken(token);
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link has expired or already been used. Please request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
