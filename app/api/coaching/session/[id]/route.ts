/**
 * GET /api/coaching/session/[id]
 * Returns the coach's real Riot ID only if the session is confirmed and
 * the requester is the student who booked it (double-blind reveal).
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

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the student who paid may see the reveal
  if (booking.studentId !== session.userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (booking.status !== "confirmed" && booking.status !== "completed")
    return NextResponse.json({ error: "Payment not confirmed yet" }, { status: 402 });

  return NextResponse.json({
    coachRiotId:  booking.coachProfile.user.riotId,
    displayCode:  booking.coachProfile.displayCode,
    durationMinutes: booking.durationMinutes,
    totalCharged: booking.totalCharged,
  });
}
