"use client";

import { useEffect, useState } from "react";
import { Crown, Zap, X, CheckCircle2, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PremiumContent() {
  const params   = useSearchParams();
  const success  = params.get("success") === "1";
  const canceled = params.get("canceled") === "1";

  const [loading,  setLoading]  = useState(false);
  const [managing, setManaging] = useState(false);

  async function startCheckout() {
    setLoading(true);
    const res  = await fetch("/api/stripe/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  }

  async function openPortal() {
    setManaging(true);
    const res  = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setManaging(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-10">
      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-400">You&apos;re now Premium!</p>
            <p className="text-sm text-emerald-300/70">All premium features are unlocked.</p>
          </div>
        </div>
      )}

      {canceled && (
        <div className="flex items-center gap-3 bg-gray-800/60 border border-dark-600 rounded-xl px-5 py-4 text-sm text-gray-400">
          <X className="w-4 h-4 flex-shrink-0" />
          Checkout canceled — no charge was made.
        </div>
      )}

      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mx-auto">
          <Crown className="w-8 h-8 text-gold-400" />
        </div>
        <h1 className="text-3xl font-bold text-white font-display tracking-wide">
          Duelr <span className="text-amber-400">Premium</span>
        </h1>
        <p className="text-gray-400 max-w-md mx-auto">
          Everything serious practice players need, with nothing in the way.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4">
        {[
          {
            icon: <X className="w-5 h-5 text-gold-400" />,
            title: "Zero Ads",
            desc: "No banners, no nudges. Just the matchmaking tools you came for.",
          },
          {
            icon: <Zap className="w-5 h-5 text-gold-400" />,
            title: "Priority Matching (soon)",
            desc: "Jump to the front of the pool in Specific Matchups when there are multiple candidates.",
          },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="card flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-gold-400/10 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="card border border-gold-400/20 text-center space-y-4">
        <div>
          <p className="text-3xl font-bold text-white">$2.99</p>
          <p className="text-sm text-gray-500">per month · cancel anytime</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={startCheckout}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            {loading ? "Redirecting to checkout…" : "Upgrade to Premium"}
          </button>
          <button
            onClick={openPortal}
            disabled={managing}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            {managing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {managing ? "Opening portal…" : "Manage existing subscription"}
          </button>
        </div>
        <p className="text-[11px] text-gray-700">Secure payment via Stripe</p>
      </div>
    </div>
  );
}

export default function PremiumPage() {
  return (
    <Suspense>
      <PremiumContent />
    </Suspense>
  );
}
