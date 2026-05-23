import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[Stripe] STRIPE_SECRET_KEY is not set — payments will fail.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

/** 20 % platform cut on coaching sessions */
export const PLATFORM_CUT_PERCENT = 20;

/** Cents charged to the student for a coaching session */
export function sessionTotal(hourlyRateCents: number, durationMinutes: number): number {
  return Math.round((hourlyRateCents * durationMinutes) / 60);
}

/** Platform fee in cents */
export function platformFee(totalCents: number): number {
  return Math.round(totalCents * (PLATFORM_CUT_PERCENT / 100));
}
