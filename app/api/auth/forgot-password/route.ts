import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResetRateLimited, resetRateLimitTtl, createResetToken } from "@/lib/reset-token";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Always return the same success response — never reveal whether the email exists
  const SUCCESS = NextResponse.json({
    ok: true,
    message: "If that email is linked to an account, a reset link has been sent.",
  });

  // Rate limit: 1 request per 5 minutes per email
  const limited = await isResetRateLimited(email);
  if (limited) {
    const wait = await resetRateLimitTtl(email);
    return NextResponse.json(
      { error: `Please wait ${wait}s before requesting another reset link.` },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where:  { email: email.toLowerCase().trim() },
    select: { id: true, accountType: true },
  });

  // No user or guest account (no password) — return success silently
  if (!user || user.accountType !== "full") return SUCCESS;

  const token = await createResetToken(user.id);
  await sendPasswordResetEmail(email, token);

  return SUCCESS;
}
