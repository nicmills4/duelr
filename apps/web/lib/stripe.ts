import Stripe from "stripe";

// Lazily instantiated so the module can be imported at build time
// without STRIPE_SECRET_KEY being present (Next.js collects page data
// during `next build` before env vars are available at runtime).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  }
  return _stripe;
}

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
