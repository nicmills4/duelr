import { getSession } from "@/lib/session";
import PartnerBoard from "@/components/PartnerBoard";
import AccountGate from "@/components/AccountGate";
import { Users2 } from "lucide-react";
import { PARTNERS_REQUIRE_PREMIUM } from "@/lib/feature-flags";

export const metadata = {
  title: "Practice Partners · Duelr",
  description: "Find long-term 1v1 practice partners who share your champion pool.",
};

export default async function PartnersPage() {
  const session     = await getSession();
  const accountType = !session
    ? "none"
    : session.user.accountType === "full"
    ? "full"
    : "guest";
  // When the premium gate is disabled, treat all full accounts as premium for this feature
  const isPremium   = !PARTNERS_REQUIRE_PREMIUM || (session?.user.isPremium ?? false);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Users2 className="w-6 h-6 text-gold-400" />
          <h1 className="text-2xl font-bold text-white font-display tracking-wide">
            Practice <span className="text-amber-400">Partners</span>
          </h1>
        </div>
        <p className="text-sm text-gray-400 mt-1 max-w-xl">
          Looking for someone to regularly grind a matchup with? Post your champion
          pool and availability — find a consistent practice partner instead of
          queuing blind every time.
        </p>
      </div>

      <AccountGate accountType={accountType as "none" | "guest" | "full"} featureName="Practice Partners">
        <PartnerBoard
          userId={session?.userId ?? null}
          riotId={session?.user.riotId ?? null}
          isPremium={isPremium}
        />
      </AccountGate>
    </div>
  );
}
