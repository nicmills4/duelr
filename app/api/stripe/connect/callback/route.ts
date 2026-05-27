import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code           = searchParams.get("code");
  const coachProfileId = searchParams.get("state");
  const error          = searchParams.get("error");

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://duelr.gg";

  if (error) {
    console.error("[stripe-connect] OAuth error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(`${origin}/admin?stripe_connect=denied`);
  }

  if (!code || !coachProfileId) {
    return NextResponse.redirect(`${origin}/admin?stripe_connect=invalid`);
  }

  const coach = await prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
  if (!coach) {
    return NextResponse.redirect(`${origin}/admin?stripe_connect=not_found`);
  }

  try {
    const response = await getStripe().oauth.token({ grant_type: "authorization_code", code });
    const stripeAccountId = response.stripe_user_id;

    if (!stripeAccountId) throw new Error("No stripe_user_id in OAuth response");

    await prisma.coachProfile.update({
      where: { id: coachProfileId },
      data:  { stripeAccountId },
    });

    return NextResponse.redirect(`${origin}/admin?stripe_connect=success`);
  } catch (err) {
    console.error("[stripe-connect] token exchange failed:", err);
    return NextResponse.redirect(`${origin}/admin?stripe_connect=error`);
  }
}
