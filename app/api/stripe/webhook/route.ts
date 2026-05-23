import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Disable body parsing — Stripe needs the raw bytes to verify the signature.
export const config = { api: { bodyParser: false } };

async function invalidateSessionCache(userId: string) {
  // Bust any cached sessions for this user so isPremium refreshes immediately.
  // We scan for session_cache keys belonging to this user via the session table.
  try {
    const sessions = await prisma.session.findMany({
      where:  { userId },
      select: { id: true },
    });
    if (sessions.length > 0) {
      await Promise.all(
        sessions.map((s) => redis.del(`session_cache:${s.id}`))
      );
    }
  } catch {}
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    // ── Subscription started / payment succeeded ──────────────────────────────
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;

      // ── Premium subscription purchase ─────────────────────────────────────
      if (cs.mode === "subscription" && cs.metadata?.userId) {
        const userId = cs.metadata.userId;
        await prisma.user.update({
          where: { id: userId },
          data:  {
            isPremium:           true,
            stripeSubscriptionId: cs.subscription as string,
          },
        });
        await invalidateSessionCache(userId);
      }

      // ── Coaching session purchase ─────────────────────────────────────────
      if (cs.mode === "payment" && cs.metadata?.coachingSessionId) {
        await prisma.coachingSession.update({
          where: { id: cs.metadata.coachingSessionId },
          data:  {
            status:          "confirmed",
            stripeSessionId: cs.id,
          },
        });
      }
      break;
    }

    // ── Subscription cancelled / expired ──────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findFirst({
        where:  { stripeSubscriptionId: sub.id },
        select: { id: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data:  { isPremium: false, stripeSubscriptionId: null },
        });
        await invalidateSessionCache(user.id);
      }
      break;
    }

    // ── Subscription payment failure ──────────────────────────────────────────
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customerId) {
        const user = await prisma.user.findFirst({
          where:  { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data:  { isPremium: false },
          });
          await invalidateSessionCache(user.id);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
