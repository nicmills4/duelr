import type { Metadata } from "next";
import Script from "next/script";
import { Bebas_Neue, Exo_2 } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/session";
import NavLinks from "@/components/NavLinks";
import AdBanner from "@/components/AdBanner";
import GlobalLobbyNotifier from "@/components/GlobalLobbyNotifier";
import { Settings } from "lucide-react";
import ResendVerificationButton from "@/components/ResendVerificationButton";

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
  const accountType = !session
    ? "none"
    : session.user.accountType === "full"
    ? "full"
    : "guest";
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
        {/* Discord invite banner */}
        <div className="bg-indigo-600/90 text-white text-xs text-center py-2 px-4">
          <span className="opacity-90">Join the Duelr community on Discord — find opponents, discuss matchups, and get updates.{" "}</span>
          <a
            href="https://discord.gg/sV5xJXQ9Bx"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Join the Duelr Discord →
          </a>
        </div>
        <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="font-display text-2xl tracking-wide"><span className="text-amber-400">Duel</span><span className="text-white">r</span></span>
            </a>
            <NavLinks accountType={accountType as "none" | "guest" | "full"} />
            {session && (
              <a
                href="/settings"
                className="ml-2 p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-dark-700 transition-colors"
                aria-label="Account settings"
              >
                <Settings className="w-4 h-4" />
              </a>
            )}
          </div>
        </header>
        {/* Email verification banner */}
        {session?.user.accountType === "full" && session.user.emailVerified === false && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs text-center py-2 px-4 flex items-center justify-center gap-3">
            <span>Please verify your email address — check your inbox.</span>
            <ResendVerificationButton />
          </div>
        )}
        {session && !session.user.isPremium && <AdBanner />}
        <main>{children}</main>
        {/* Global toast: fires when a lobby challenge is accepted off-page */}
        {session && <GlobalLobbyNotifier />}
      </body>
    </html>
  );
}
