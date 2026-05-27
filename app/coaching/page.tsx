import { getSession } from "@/lib/session";
import CoachBoard from "@/components/CoachBoard";
import AccountGate from "@/components/AccountGate";
import { Shield, Mail } from "lucide-react";

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
  const bookedSessionId = sp.booked && sp.booked !== "1" ? sp.booked : null;
  const canceled        = sp.canceled === "1";
  const accountType = !session
    ? "none"
    : session.user.accountType === "full"
    ? "full"
    : "guest";

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

      {/* Coach application callout */}
      <div className="mb-8 bg-dark-800 border border-dark-600 rounded-xl p-5 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-white">
            Interested in coaching on Duelr?<br />
            Set your own rates and have clients come to you!
          </h2>
        </div>
        <p className="text-sm text-gray-400 mb-3">
          Reach out to{" "}
          <a href="mailto:playduelrsupport@gmail.com"
            className="text-amber-400 hover:underline font-medium">
            playduelrsupport@gmail.com
          </a>{" "}
          and include the following:
        </p>
        <ul className="space-y-1.5 text-sm text-gray-400">
          {[
            "Minimum Rank: Masters",
            "Your Op.gg profile link",
            "Your Discord username",
            "A quick bio — rank, peak rank, main role",
            "Champions you're comfortable coaching",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">·</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {canceled && (
        <div className="mb-6 text-sm text-gray-400 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
          Checkout canceled — no charge was made.
        </div>
      )}

      <AccountGate accountType={accountType as "none" | "guest" | "full"} featureName="Coaching">
        <CoachBoard
          userId={session?.userId ?? null}
          bookedSessionId={bookedSessionId}
        />
      </AccountGate>
    </div>
  );
}
