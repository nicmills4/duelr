/**
 * GET /api/me
 *
 * Returns the current authenticated user's profile fields.
 * Used by the desktop app to hydrate auth state after session validation.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { user } = session;
  return NextResponse.json({
    id:            session.userId,
    riotId:        user.riotId,
    region:        user.region,
    accountType:   user.accountType,
    isPremium:     user.isPremium ?? false,
    emailVerified: user.emailVerified ?? false,
  });
}
