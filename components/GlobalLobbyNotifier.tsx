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
  riotId:    string;
  champName: string;
  champImage: string;
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

        {/* CTA */}
        <button
          onClick={goToLobby}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
        >
          View Match Details
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
