/**
 * GET /api/coaching/session/[id]
 *
 * Returns details of a coaching session for the student who purchased it,
 * including the coach's Discord handle (only exposed after payment).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const booking = await prisma.coachingSession.findUnique({
    where:   { id },
    include: {
      coachProfile: {
        include: { user: { select: { riotId: true } } },
      },
    },
  });

  if (!booking)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Only the student who made the purchase may view this
  if (booking.studentId !== session.userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    session: {
      id:              booking.id,
      status:          booking.status,
      durationMinutes: booking.durationMinutes,
      totalCharged:    booking.totalCharged,
      coachRiotId:     booking.coachProfile.user.riotId,
      coachDiscord:    booking.coachProfile.discordHandle ?? null,
    },
  });
}
