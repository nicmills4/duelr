import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/coaches/[id]/stripe-connect
// Returns the Stripe OAuth URL to send to the coach so they can authorize payouts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdminSession())
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId)
    return NextResponse.json({ error: "STRIPE_CONNECT_CLIENT_ID is not set" }, { status: 503 });

  const coach = await prisma.coachProfile.findUnique({
    where:  { id },
    select: { id: true, stripeAccountId: true, user: { select: { riotId: true } } },
  });

  if (!coach)
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  const origin      = process.env.NEXT_PUBLIC_APP_URL ?? "https://duelr.gg";
  const redirectUri = `${origin}/api/stripe/connect/callback`;

  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", coach.id);
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.json({
    connectUrl:     url.toString(),
    alreadyLinked:  !!coach.stripeAccountId,
    stripeAccountId: coach.stripeAccountId ?? null,
    riotId:         coach.user.riotId,
  });
}
