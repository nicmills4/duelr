import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createVerificationToken } from "@/lib/verify-token";
import { sendVerificationEmail } from "@/lib/email";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_SECONDS = 60;

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

  // Redis-backed rate limit: survives across multiple server instances.
  // SET NX EX returns null if the key already exists (i.e. cooldown active).
  const rateLimitKey = `resend_verification:${userId}`;
  const acquired = await redis.set(rateLimitKey, "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
  if (!acquired) {
    const ttl = await redis.ttl(rateLimitKey);
    const wait = ttl > 0 ? ttl : RESEND_COOLDOWN_SECONDS;
    return NextResponse.json(
      { error: `Please wait ${wait}s before requesting another email` },
      { status: 429 }
    );
  }

  const token = await createVerificationToken(userId);
  const sent  = await sendVerificationEmail(user.email, token);

  if (!sent) {
    return NextResponse.json({ error: "Failed to send email — check RESEND_API_KEY" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
