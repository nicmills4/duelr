import { getSession } from "@/lib/session";
import CoachBoard from "@/components/CoachBoard";
import { Shield } from "lucide-react";

export const metadata = {
  title: "Coaching · Duelr",
  description: "Hire a verified Masters+ coach for 1v1 matchup coaching sessions.",
};

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; canceled?: string }>;
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const booked   = !!sp.booked;
  const canceled = sp.canceled === "1";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-6 h-6 text-gold-400" />
          <h1 className="text-2xl font-bold text-white font-display tracking-wide">
            1v1 <span className="text-amber-400">Coaching</span>
          </h1>
        </div>
        <p className="text-sm text-gray-400 mt-1 max-w-xl">
          Tired of grinding matchups blind? Hire a verified Masters+ coach to play through
          the matchup with you and break down exactly what you&apos;re doing wrong.
        </p>
      </div>

      {canceled && (
        <div className="mb-6 text-sm text-gray-400 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
          Checkout canceled — no charge was made.
        </div>
      )}

      <CoachBoard
        userId={session?.userId ?? null}
        bookedId={booked}
      />
    </div>
  );
}
