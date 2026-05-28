"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";


// Two-signal detection — both must agree before we show the modal.
// 1. Bait element: ad blockers hide divs with ad-like class names.
// 2. Script load: try to load the AdSense script; ad blockers block it.
async function detectAdBlock(): Promise<boolean> {
  const baitBlocked = await new Promise<boolean>((resolve) => {
    const el = document.createElement("div");
    el.className = "ad ads adsbox ad-placement carbon-ads pub_300x250";
    el.style.cssText = "height:1px;width:1px;position:absolute;left:-9999px;top:-9999px;pointer-events:none;";
    document.body.appendChild(el);
    setTimeout(() => {
      const s = window.getComputedStyle(el);
      const blocked =
        el.offsetHeight === 0 ||
        el.offsetWidth  === 0 ||
        s.display       === "none" ||
        s.visibility    === "hidden" ||
        s.opacity       === "0";
      document.body.removeChild(el);
      resolve(blocked);
    }, 300);
  });

  if (baitBlocked) return true;

  // Fallback: try fetching a known ad URL — ad blockers will reject it
  try {
    await fetch(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      { method: "HEAD", mode: "no-cors", cache: "no-store" }
    );
    return false;
  } catch {
    return true;
  }
}

export default function AdBlockModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const blocked = await detectAdBlock();
      if (blocked) setShow(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-7 space-y-5 overflow-hidden">

        {/* Subtle amber glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none rounded-2xl" />

        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative space-y-2">
          <span className="font-display text-2xl tracking-wide">
            <span className="text-amber-400">Duel</span><span className="text-white">r</span>
          </span>
          <h2 className="text-xl font-bold leading-snug">
            We noticed you&apos;re using an ad blocker
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            Ads keep Duelr free for everyone. Upgrade to Premium for a fully
            ad-free experience, or whitelist us to show your support.
          </p>
        </div>

        <div className="relative flex flex-col gap-2">
          <Link
            href="/premium"
            onClick={dismiss}
            className="w-full text-center bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            Upgrade to Premium
          </Link>
          <button
            onClick={() => setShow(false)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            Whitelist Duelr
          </button>
          <button
            onClick={dismiss}
            className="w-full text-gray-500 hover:text-gray-300 text-sm py-1.5 transition-colors"
          >
            Continue with Adblock
          </button>
        </div>

      </div>
    </div>
  );
}
