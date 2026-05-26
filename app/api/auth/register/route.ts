import { NextRequest, NextResponse } from "next/server";
import { getAccountByRiotId, parseRiotId, type Region } from "@/lib/riot";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { createVerificationToken } from "@/lib/verify-token";
import { sendVerificationEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const { riotId, region, email, password } = body as Record<string, string>;

    // ── Validate inputs ────────────────────────────────────────────────────────
    if (!riotId || !region)
      return NextResponse.json({ error: "Riot ID and region are required" }, { status: 400 });

    if (!email || !EMAIL_RE.test(email))
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });

    if (!password || password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    // ── Verify Riot account via Riot API ───────────────────────────────────────
    const parsed = parseRiotId(riotId);
    if (!parsed)
      return NextResponse.json({ error: "Invalid Riot ID format. Use GameName#TAG" }, { status: 400 });

    const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region as Region);
    if (!account)
      return NextResponse.json({ error: "Riot account not found — check your Riot ID and region" }, { status: 404 });

    const normalizedRiotId = `${account.gameName}#${account.tagLine}`;

    // ── Check if email already in use by a different puuid ────────────────────
    const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingEmail && existingEmail.puuid !== account.puuid) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    // ── Upsert user — upgrade guest → full if they already exist ──────────────
    const normalizedEmail = email.toLowerCase();
    const isNewEmail = !existingEmail || existingEmail.emailVerified === false;

    const user = await prisma.user.upsert({
      where: { puuid: account.puuid },
      update: {
        riotId:        normalizedRiotId,
        region,
        email:         normalizedEmail,
        passwordHash,
        accountType:   "full",
        // Reset verification if they're changing their email
        emailVerified: existingEmail?.email === normalizedEmail
          ? (existingEmail.emailVerified ?? false)
          : false,
      },
      create: {
        puuid:         account.puuid,
        riotId:        normalizedRiotId,
        region,
        email:         normalizedEmail,
        passwordHash,
        accountType:   "full",
        emailVerified: false,
      },
    });

    await createSession(user.id);

    // Send verification email (non-blocking — don't fail the request if email fails)
    if (!user.emailVerified) {
      const token = await createVerificationToken(user.id);
      await sendVerificationEmail(normalizedEmail, token);
    }

    return NextResponse.json({ ok: true, riotId: normalizedRiotId, emailSent: !user.emailVerified });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Prisma unique constraint on email
    if (message.includes("Unique constraint") && message.includes("email")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
