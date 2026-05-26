"use client";

/**
 * Polls for pending lobby match results on any page and shows a toast
 * when a challenge the user sent was accepted while they were away.
 *
 * Rendered in the layout for all logged-in users.
 * Skips itself on /lobby because LobbyBrowser handles it directly via SSE.
 */

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, X, ArrowRight } from "lucide-react";
import { playQueuePop } from "@/lib/sounds";

interface PendingMatch {
  riotId:          string;
  champName:       string;
  champImage:      string;
  voiceChannelUrl?: string;
}

export default function GlobalLobbyNotifier() {
  const pathname = usePathname();
  const router   = useRouter();
  const [match,  setMatch]  = useState<PendingMatch | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Don't render on the lobby page — LobbyBrowser handles everything there
  const onLobbyPage = pathname === "/lobby";

  useEffect(() => {
    if (onLobbyPage) return;

    function poll() {
      fetch("/api/lobby/pending-match?peek=true")
        .then((r) => r.json())
        .then((d: { match: PendingMatch | null }) => {
          if (d.match) {
            playQueuePop();
            setMatch(d.match);
            // Stop polling once we have a result to show
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        })
        .catch(() => {});
    }

    poll(); // immediate check on mount / page change
    pollRef.current = setInterval(poll, 10_000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [onLobbyPage]);

  if (!match) return null;

  async function dismiss() {
    // Claim (delete) the Redis key so it doesn't resurface
    await fetch("/api/lobby/pending-match").catch(() => {});
    setMatch(null);
  }

  function goToLobby() {
    // Don't claim the key here — let LobbyBrowser claim it on mount
    // so it can show the full match result screen
    setMatch(null);
    router.push("/lobby");
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="card border border-emerald-500/30 bg-dark-800 shadow-2xl space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Challenge Accepted!
          </div>
          <button
            onClick={dismiss}
            className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Opponent info */}
        <div className="flex items-center gap-3">
          {match.champImage && (
            <Image
              src={match.champImage}
              alt={match.champName}
              width={40}
              height={40}
              className="rounded-full ring-2 ring-emerald-500/40 flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm text-white font-semibold truncate">{match.riotId}</p>
            <p className="text-xs text-gray-400">
              is ready to play as {match.champName}
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          {match.voiceChannelUrl && (
            <a
              href={match.voiceChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.132 18.111a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Join Voice Channel
            </a>
          )}
          <button
            onClick={goToLobby}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            View Match Details
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
