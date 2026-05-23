"use client";

import { useState } from "react";
import { Crown, Zap, Users2, X as XIcon } from "lucide-react";

interface Props {
  children: React.ReactNode;
  isPremium: boolean;
  isLoggedIn: boolean;
}

function UpgradeModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    const res  = await fetch("/api/stripe/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card max-w-sm w-full space-y-5 border border-gold-400/30">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-600 hover:text-gray-400 transition-colors"
        >
          <XIcon className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-400/10 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg leading-tight">Duelr Premium</h2>
            <p className="text-xs text-gray-500">$2.99 / month · cancel anytime</p>
          </div>
        </div>

        <ul className="space-y-2.5">
          {[
            { icon: <Users2 className="w-4 h-4 text-gold-400" />, text: "Access Practice Partners board" },
            { icon: <XIcon  className="w-4 h-4 text-gold-400" />, text: "No ads — ever" },
            { icon: <Zap    className="w-4 h-4 text-gold-400" />, text: "Priority matching (coming soon)" },
          ].map(({ icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-gray-300">
              {icon}
              {text}
            </li>
          ))}
        </ul>

        <button
          onClick={startCheckout}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Crown className="w-4 h-4" />
          {loading ? "Redirecting…" : "Upgrade to Premium"}
        </button>

        <p className="text-[11px] text-gray-700 text-center">
          Secure payment via Stripe. You&apos;ll be redirected to complete checkout.
        </p>
      </div>
    </div>
  );
}

export default function PremiumGate({ children, isPremium, isLoggedIn }: Props) {
  const [showModal, setShowModal] = useState(false);

  if (isPremium) return <>{children}</>;

  return (
    <>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
      <div className="card max-w-md mx-auto text-center space-y-5 border border-gold-400/20">
        <div className="w-14 h-14 rounded-2xl bg-gold-400/10 flex items-center justify-center mx-auto">
          <Crown className="w-7 h-7 text-gold-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Premium Feature</h2>
          <p className="text-sm text-gray-400">
            Practice Partners is available to Premium members.
            Find consistent training partners who share your champion pool.
          </p>
        </div>
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">What you get</p>
          {[
            "Post your champion pool & availability",
            "Browse all partner listings",
            "Remove ads site-wide",
          ].map((item) => (
            <p key={item} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="w-4 h-4 rounded-full bg-gold-400/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-2.5 h-2.5 text-gold-400" />
              </span>
              {item}
            </p>
          ))}
        </div>
        {isLoggedIn ? (
          <button onClick={() => setShowModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <Crown className="w-4 h-4" />
            Upgrade — $2.99/mo
          </button>
        ) : (
          <a href="/" className="btn-primary w-full flex items-center justify-center gap-2">
            Connect your account to upgrade
          </a>
        )}
      </div>
    </>
  );
}
