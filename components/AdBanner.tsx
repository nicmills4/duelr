"use client";

import { useState } from "react";
import { X, Zap } from "lucide-react";

/** Shown to non-premium users — serves as both ad placeholder and upgrade nudge. */
export default function AdBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  async function upgrade() {
    const res  = await fetch("/api/stripe/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  return (
    <div className="w-full bg-dark-800 border-b border-dark-600">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
          <span className="bg-gold-400/10 text-gold-400 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
            Ad
          </span>
          <span className="truncate">
            Remove ads and unlock <span className="text-gray-300 font-medium">Practice Partners</span> — upgrade to Premium
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={upgrade}
            className="flex items-center gap-1 text-xs font-semibold text-gold-400 hover:text-gold-500 transition-colors whitespace-nowrap"
          >
            <Zap className="w-3 h-3" />
            $2.99/mo
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-700 hover:text-gray-500 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
