import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { getAccountByRiotId, parseRiotId, type Region } from "@/lib/riot";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const { userId } = session;

  // ── Update Email ───────────────────────────────────────────────────────────
  if (body.action === "email") {
    if (session.user.accountType !== "full")
      return NextResponse.json({ error: "Email is only available on full accounts" }, { status: 403 });

    const { email } = body;
    if (!email || !EMAIL_RE.test(email))
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });

    try {
      await prisma.user.update({
        where: { id: userId },
        data:  { email: email.toLowerCase() },
      });
      await invalidateSessionCache(userId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Unique constraint") || msg.includes("email"))
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      throw err;
    }
  }

  // ── Update Password ────────────────────────────────────────────────────────
  if (body.action === "password") {
    if (session.user.accountType !== "full")
      return NextResponse.json({ error: "Password is only available on full accounts" }, { status: 403 });

    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: "currentPassword and newPassword required" }, { status: 400 });
    if (newPassword.length < 8)
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });

    // Fetch current hash from DB (stripped from session cache)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash)
      return NextResponse.json({ error: "No password set on this account" }, { status: 400 });

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid)
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  }

  // ── Update Riot ID / Region ────────────────────────────────────────────────
  if (body.action === "riotId") {
    const { riotId, region } = body;
    if (!riotId || !region)
      return NextResponse.json({ error: "riotId and region required" }, { status: 400 });

    const parsed = parseRiotId(riotId);
    if (!parsed)
      return NextResponse.json({ error: "Invalid Riot ID format (GameName#TAG)" }, { status: 400 });

    const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region as Region);
    if (!account)
      return NextResponse.json({ error: "Riot account not found — check your Riot ID and region" }, { status: 404 });

    const normalizedRiotId = `${account.gameName}#${account.tagLine}`;

    // Make sure this puuid isn't already claimed by a different user
    const existing = await prisma.user.findUnique({ where: { puuid: account.puuid } });
    if (existing && existing.id !== userId)
      return NextResponse.json({ error: "That Riot account is already linked to another Duelr account" }, { status: 409 });

    await prisma.user.update({
      where: { id: userId },
      data:  { riotId: normalizedRiotId, puuid: account.puuid, region },
    });
    await invalidateSessionCache(userId);
    return NextResponse.json({ ok: true, riotId: normalizedRiotId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** Bust all Redis session cache entries for this user so changes are visible immediately */
async function invalidateSessionCache(userId: string) {
  const sessions = await prisma.session.findMany({
    where:  { userId },
    select: { id: true },
  });
  if (sessions.length) {
    await redis.del(...sessions.map(s => `session_cache:${s.id}`));
  }
}
