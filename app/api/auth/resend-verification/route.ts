import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createVerificationToken } from "@/lib/verify-token";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Simple in-memory rate limit: one resend per userId per 60 s
const recentResends = new Map<string, number>();

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { userId, user } = session;

  if (user.accountType !== "full" || !user.email) {
    return NextResponse.json({ error: "No email on this account" }, { status: 400 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ error: "Email already verified" }, { status: 400 });
  }

  // Rate limit: 1 resend per minute
  const last = recentResends.get(userId) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < 60_000) {
    const wait = Math.ceil((60_000 - elapsed) / 1000);
    return NextResponse.json(
      { error: `Please wait ${wait}s before requesting another email` },
      { status: 429 }
    );
  }
  recentResends.set(userId, Date.now());

  const token = await createVerificationToken(userId);
  const sent  = await sendVerificationEmail(user.email, token);

  if (!sent) {
    return NextResponse.json({ error: "Failed to send email — check RESEND_API_KEY" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
