"use client";

// Premium gating is temporarily disabled until Stripe is configured.
// When ready, restore the gate by bringing back the UpgradeModal and blocked view.

interface Props {
  children: React.ReactNode;
  isPremium: boolean;
  isLoggedIn: boolean;
}

export default function PremiumGate({ children }: Props) {
  return <>{children}</>;
}
