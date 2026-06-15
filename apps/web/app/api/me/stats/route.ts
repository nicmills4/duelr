import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/stats — the authenticated user's 1v1 stats & match history.
 * Premium-only: the full breakdown is a paid feature.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.user.isPremium) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }

  try {
    const stats = await getUserStats(session.userId);
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
