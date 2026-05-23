/**
 * Book a coaching session — creates a Stripe Checkout session (one-time payment).
 * The coach's Riot ID is revealed only after the webhook confirms payment.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stripe, sessionTotal, platformFee } from "@/lib/stripe";

const VALID_DURATIONS = new Set([30, 60, 90]);

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { coachProfileId, durationMinutes } = body;

  if (!coachProfileId || typeof coachProfileId !== "string")
    return NextResponse.json({ error: "coachProfileId required" }, { status: 400 });

  const dur = Number(durationMinutes);
  if (!VALID_DURATIONS.has(dur))
    return NextResponse.json({ error: "Duration must be 30, 60, or 90 minutes" }, { status: 400 });

  // Load the coach profile
  const coach = await prisma.coachProfile.findUnique({
    where:   { id: coachProfileId },
    include: { user: { select: { id: true, riotId: true } } },
  });
  if (!coach || !coach.isActive)
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  // Can't book yourself
  if (coach.userId === session.userId)
    return NextResponse.json({ error: "You can't book yourself" }, { status: 400 });

  const total   = sessionTotal(coach.hourlyRate, dur);
  const fee     = platformFee(total);

  // Create a pending CoachingSession first so we have an ID for the webhook
  const booking = await prisma.coachingSession.create({
    data: {
      coachProfileId,
      studentId:       session.userId,
      durationMinutes: dur,
      rateAtBooking:   coach.hourlyRate,
      totalCharged:    total,
      platformFee:     fee,
    },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://duelr.gg";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode:                 "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency:     "usd",
          unit_amount:  total,
          product_data: {
            name:        `Duelr Coaching — ${dur} min with Coach ${coach.displayCode}`,
            description: `${dur}-minute 1v1 coaching session · ${coach.verifiedTier}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/coaching?booked=${booking.id}`,
    cancel_url:  `${origin}/coaching?canceled=1`,
    metadata:    { coachingSessionId: booking.id },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
