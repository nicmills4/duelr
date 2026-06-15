"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import AdBlockModal from "./AdBlockModal";
import { isAdEligibleRoute } from "@/lib/ad-routes";

/**
 * Loads the AdSense script and ad-related UI ONLY on content pages, and only
 * for non-premium users.
 *
 * Keeping the adsbygoogle script (and therefore Auto Ads) off login / lobby /
 * queue / settings screens is what satisfies AdSense's "screens without
 * publisher content" policy: the reviewer crawls logged out, so the script
 * must be absent from those thin screens entirely — not just hidden.
 */
export default function AdsGate({ isPremium }: { isPremium: boolean }) {
  const pathname = usePathname();
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

  // Premium users never see ads; ads only ever load on content routes.
  if (isPremium || !isAdEligibleRoute(pathname)) return null;

  return (
    <>
      {publisherId && (
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      )}
      <AdBlockModal />
    </>
  );
}
