"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";

const SESSION_KEY = "adblock_dismissed";

function detectAdBlock(): Promise<boolean> {
  return new Promise((resolve) => {
    const bait = document.createElement("div");
    bait.className = "ad ads adsbox ad-placement carbon-ads";
    bait.style.cssText =
      "height:1px;width:1px;position:absolute;left:-9999px;top:-9999px;";
    document.body.appendChild(bait);

    // Give the ad blocker time to act
    setTimeout(() => {
      const style = window.getComputedStyle(bait);
      const blocked =
        bait.offsetHeight === 0 ||
        bait.offsetWidth  === 0 ||
        style.display     === "none" ||
        style.visibility  === "hidden" ||
        style.opacity     === "0";
      document.body.removeChild(bait);
      resolve(blocked);
    }, 200);
  });
}

export default function AdBlockModal() {
  const [show,     setShow]     = useState(false);
  const detectedRef             = useRef(false);
  const handlerRef              = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    detectAdBlock().then((blocked) => {
      if (!blocked) return;
      detectedRef.current = true;

      // Show modal on the next user click
      const handler = () => {
        if (!sessionStorage.getItem(SESSION_KEY)) setShow(true);
      };
      document.addEventListener("click", handler, { once: true });
      handlerRef.current = handler;
    });

    return () => {
      if (handlerRef.current)
        document.removeEventListener("click", handlerRef.current);
    };
  }, []);

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
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
            onClick={dismiss}
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
