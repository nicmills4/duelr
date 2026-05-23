import type { Metadata } from "next";
import Script from "next/script";
import { Bebas_Neue, Exo_2 } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/session";
import NavLinks from "@/components/NavLinks";
import AdBanner from "@/components/AdBanner";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
});

const exo2 = Exo_2({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-exo-2",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Duelr — 1v1 Matchmaking",
  description: "Find your perfect 1v1 practice match in League of Legends",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={`dark ${bebasNeue.variable} ${exo2.variable}`}>
      <body className="min-h-screen bg-dark-900 font-sans">
        {process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="font-display text-2xl tracking-wide"><span className="text-amber-400">Duel</span><span className="text-white">r</span></span>
              <span className="text-xs text-gray-500 ml-1">1v1</span>
            </a>
            <NavLinks isLoggedIn={!!session} />
          </div>
        </header>
        {/* AdBanner: temporarily disabled until Stripe/Premium is live */}
        {/* {session && !session.user.isPremium && <AdBanner />} */}
        <main>{children}</main>
      </body>
    </html>
  );
}
