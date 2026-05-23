import { getSession } from "@/lib/session";
import PartnerBoard from "@/components/PartnerBoard";
import PremiumGate from "@/components/PremiumGate";
import { Users2 } from "lucide-react";

export const metadata = {
  title: "Practice Partners · Duelr",
  description: "Find long-term 1v1 practice partners who share your champion pool.",
};

export default async function PartnersPage() {
  const session   = await getSession();
  const isPremium = session?.user?.isPremium ?? false;
  const isLoggedIn = !!session;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
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

      <PremiumGate isPremium={isPremium} isLoggedIn={isLoggedIn}>
        <PartnerBoard
          userId={session?.userId ?? null}
          riotId={session?.user.riotId ?? null}
        />
      </PremiumGate>
    </div>
  );
}
