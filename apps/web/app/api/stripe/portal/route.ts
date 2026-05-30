import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:  { id: session.userId },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 400 });
  }

  const origin  = process.env.NEXT_PUBLIC_APP_URL ?? "https://duelr.gg";
  const portal  = await getStripe().billingPortal.sessions.create({
    customer:    user.stripeCustomerId,
    return_url:  `${origin}/premium`,
  });

  return NextResponse.json({ url: portal.url });
}
