"use client";

import { useState } from "react";
import { Lock, Menu, X, Settings } from "lucide-react";

type AccountType = "none" | "guest" | "full";

// ── Desktop tooltip link ──────────────────────────────────────────────────────

function ProtectedLink({
  href, label, accountType, requiresFull,
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
    return <a href={href} className="hover:text-gold-400 transition-colors">{label}</a>;
  }

  const tipText  = !isLoggedIn ? "Enter your Riot ID on the home page" : "Create a free account to unlock this feature";
  const tipLabel = !isLoggedIn ? "Login required" : "Account required";

  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <a href={href} className="text-gray-600 hover:text-gray-500 transition-colors flex items-center gap-1">
        <Lock className="w-3 h-3" />
        {label}
      </a>
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-50 pointer-events-none">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-dark-700 border-l border-t border-dark-600 rotate-45" />
          <div className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap text-xs">
            <span className="font-semibold text-amber-400">{tipLabel}</span>
            <span className="text-gray-400"> — {tipText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile row link (no tooltip — tap targets work better inline) ─────────────

function MobileNavLink({
  href, label, accountType, requiresFull, onClick,
}: {
  href:         string;
  label:        string;
  accountType:  AccountType;
  requiresFull: boolean;
  onClick:      () => void;
}) {
  const isLoggedIn = accountType !== "none";
  const hasAccess  = requiresFull ? accountType === "full" : isLoggedIn;

  return (
    <a
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between px-5 py-4 text-sm transition-colors border-b border-dark-700/50 last:border-0 ${
        hasAccess
          ? "text-gray-300 hover:text-gold-400 hover:bg-dark-700/40 active:bg-dark-700/60"
          : "text-gray-600 pointer-events-none"
      }`}
    >
      <span className="flex items-center gap-2.5">
        {!hasAccess && <Lock className="w-3.5 h-3.5 flex-shrink-0" />}
        {label}
      </span>
      {!hasAccess && (
        <span className="text-[10px] text-gray-700 uppercase tracking-wide">
          {!isLoggedIn ? "Login required" : "Account required"}
        </span>
      )}
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NavLinks({
  accountType,
  hasSession,
}: {
  accountType: AccountType;
  hasSession?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Desktop nav (md+) */}
      <nav className="hidden md:flex items-center gap-4 text-sm text-gray-400">
        <a href="/lobby"       className="hover:text-gold-400 transition-colors">Lobby</a>
        <ProtectedLink href="/partners"   label="Practice Partners" accountType={accountType} requiresFull={true} />
        <ProtectedLink href="/coaching"   label="Coaching"          accountType={accountType} requiresFull={true} />
        <a href="/leaderboard" className="hover:text-gold-400 transition-colors">Duelr 1v1 Top Players</a>
      </nav>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <>
          {/* Tap-outside to close */}
          <div className="fixed inset-0 z-40 md:hidden" onClick={close} />

          <div className="absolute top-14 left-0 right-0 bg-dark-800 border-b border-dark-600 shadow-xl z-50 md:hidden">
            <nav className="flex flex-col">
              <a href="/lobby" onClick={close}
                className="flex items-center px-5 py-4 text-sm text-gray-300 hover:text-gold-400 hover:bg-dark-700/40 active:bg-dark-700/60 transition-colors border-b border-dark-700/50">
                Lobby
              </a>
              <MobileNavLink href="/partners"   label="Practice Partners" accountType={accountType} requiresFull={true}  onClick={close} />
              <MobileNavLink href="/coaching"   label="Coaching"          accountType={accountType} requiresFull={true}  onClick={close} />
              <a href="/leaderboard" onClick={close}
                className="flex items-center px-5 py-4 text-sm text-gray-300 hover:text-gold-400 hover:bg-dark-700/40 active:bg-dark-700/60 transition-colors border-b border-dark-700/50">
                Duelr 1v1 Top Players
              </a>
              {hasSession && (
                <a href="/settings" onClick={close}
                  className="flex items-center gap-2.5 px-5 py-4 text-sm text-gray-300 hover:text-gold-400 hover:bg-dark-700/40 active:bg-dark-700/60 transition-colors">
                  <Settings className="w-4 h-4" />
                  Account Settings
                </a>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
