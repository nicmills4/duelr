"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

function ProtectedLink({
  href,
  label,
  isLoggedIn,
}: {
  href: string;
  label: string;
  isLoggedIn: boolean;
}) {
  const [show, setShow] = useState(false);

  if (isLoggedIn) {
    return (
      <a href={href} className="hover:text-gold-400 transition-colors">
        {label}
      </a>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <a href={href} className="text-gray-600 hover:text-gray-500 transition-colors flex items-center gap-1">
        <Lock className="w-3 h-3" />
        {label}
      </a>

      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-50 pointer-events-none">
          {/* Arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-dark-700 border-l border-t border-dark-600 rotate-45" />
          {/* Body */}
          <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap text-xs">
            <span className="font-semibold text-amber-400">Login required</span>
            <span className="text-gray-400"> — enter your Riot ID on the home page</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NavLinks({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <nav className="flex items-center gap-4 text-sm text-gray-400">
      <a href="/" className="hover:text-gold-400 transition-colors">Home</a>
      <ProtectedLink href="/queue"       label="Specific Matchups" isLoggedIn={isLoggedIn} />
      <ProtectedLink href="/lobby"       label="Lobby"             isLoggedIn={isLoggedIn} />
      <a href="/leaderboard" className="hover:text-gold-400 transition-colors">Leaderboard</a>
    </nav>
  );
}
