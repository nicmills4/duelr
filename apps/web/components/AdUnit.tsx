"use client";

import { useEffect, useRef } from "react";

interface Props {
  slot: string;          // AdSense ad slot ID, e.g. "1234567890"
  format?: "auto" | "rectangle" | "vertical" | "horizontal";
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdUnit({ slot, format = "auto", className = "" }: Props) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

  useEffect(() => {
    if (!publisherId || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, [publisherId]);

  // In dev (no publisher ID set), show a labelled placeholder
  if (!publisherId) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-gray-700 rounded-xl bg-dark-800/50 text-gray-600 text-xs font-medium ${className}`}
      >
        Ad Space
      </div>
    );
  }

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className}`}
      style={{ display: "block" }}
      data-ad-client={publisherId}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
