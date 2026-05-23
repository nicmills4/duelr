import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { userId, user } = session;

  // Retrieve or create a Stripe customer for this user
  let customerId = (await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  }))?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email:    undefined, // Riot-based users don't have stored emails
      metadata: { userId, riotId: user.riotId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where:  { id: userId },
      data:   { stripeCustomerId: customerId },
    });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://duelr.gg";

  const checkoutSession = await getStripe().checkout.sessions.create({
    customer:             customerId,
    mode:                 "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price:    process.env.STRIPE_PREMIUM_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${origin}/premium?success=1`,
    cancel_url:  `${origin}/premium?canceled=1`,
    metadata:    { userId },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
