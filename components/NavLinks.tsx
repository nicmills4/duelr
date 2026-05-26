"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

type AccountType = "none" | "guest" | "full";

function ProtectedLink({
  href,
  label,
  accountType,
  requiresFull,
}: {
  href:         string;
  label:        string;
  accountType:  AccountType;
  requiresFull: boolean;
}) {
  const [show, setShow] = useState(false);

  const isLoggedIn = accountType !== "none";
  const hasAccess  = requiresFull ? accountType === "full" : isLoggedIn;

  if (hasAccess) {
    return (
      <a href={href} className="hover:text-gold-400 transition-colors">
        {label}
      </a>
    );
  }

  const tipText = !isLoggedIn
    ? "Enter your Riot ID on the home page"
    : "Create a free account to unlock this feature";

  const tipLabel = !isLoggedIn ? "Login required" : "Account required";

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
            <span className="font-semibold text-amber-400">{tipLabel}</span>
            <span className="text-gray-400"> — {tipText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NavLinks({ accountType }: { accountType: AccountType }) {
  return (
    <nav className="flex items-center gap-4 text-sm text-gray-400">
      <ProtectedLink href="/lobby"      label="Lobby"             accountType={accountType} requiresFull={false} />
      <ProtectedLink href="/queue"      label="Specific Matchups" accountType={accountType} requiresFull={false} />
      <ProtectedLink href="/partners"   label="Practice Partners" accountType={accountType} requiresFull={true}  />
      <ProtectedLink href="/coaching"   label="Coaching"          accountType={accountType} requiresFull={true}  />
      <a href="/leaderboard" className="hover:text-gold-400 transition-colors">Leaderboard</a>
    </nav>
  );
}
