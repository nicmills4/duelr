import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Duelr — 1v1 Matchmaking",
  description: "Find your perfect 1v1 practice match in League of Legends",
  icons: { icon: "/challenger.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark-900">
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
              <span className="font-bold text-xl tracking-wider"><span className="text-gold-400">Duel</span><span className="text-white">r</span></span>
              <span className="text-xs text-gray-500 ml-1">1v1</span>
            </a>
            <nav className="flex items-center gap-4 text-sm text-gray-400">
              <a href="/" className="hover:text-gold-400 transition-colors">Home</a>
              <a href="/queue" className="hover:text-gold-400 transition-colors">Queue</a>
              <a href="/leaderboard" className="hover:text-gold-400 transition-colors">Leaderboard</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
