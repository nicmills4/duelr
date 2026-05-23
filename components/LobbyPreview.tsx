"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Users, ArrowRight } from "lucide-react";
import { ELO_BRACKETS } from "@/lib/constants";
import type { LobbyPlayer } from "@/lib/lobby-types";

type PublicPlayer = Omit<LobbyPlayer, "userId">;

const MAX_SHOWN = 8;

export default function LobbyPreview({ refreshInterval = 20_000 }: { refreshInterval?: number }) {
  const [players, setPlayers] = useState<PublicPlayer[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/lobby/public")
        .then((r) => r.json())
        .then((d) => setPlayers(d.players ?? []))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  // Don't render until we have data, and hide completely if nobody's around
  if (!players || players.length === 0) return null;

  const shown   = players.slice(0, MAX_SHOWN);
  const overflow = players.length - MAX_SHOWN;

  return (
    <div className="card max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Pulsing live dot */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Open Lobby —{" "}
            <span className="text-white">{players.length}</span>{" "}
            {players.length === 1 ? "player" : "players"} available now
          </p>
        </div>
        <a
          href="/lobby"
          className="flex items-center gap-1 text-xs text-gold-400 hover:underline font-medium"
        >
          Join Lobby <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {shown.map((player, i) => {
          const bracketLabel =
            ELO_BRACKETS.find((b) => b.value === player.eloBracket)?.label ??
            player.eloBracket;
          const isLast = i === MAX_SHOWN - 1 && overflow > 0;

          return (
            <div
              key={`${player.riotId}-${i}`}
              className={`relative flex items-center gap-2.5 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 ${
                isLast ? "overflow-hidden" : ""
              }`}
            >
              <Image
                src={player.champImage}
                alt={player.champName}
                width={32}
                height={32}
                className="rounded-full ring-1 ring-dark-500 flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {player.riotId.split("#")[0]}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {player.champName} · {bracketLabel}
                </p>
              </div>

              {/* "+N more" overlay on the last visible card */}
              {isLast && (
                <div className="absolute inset-0 bg-dark-700/90 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Users className="w-3.5 h-3.5" />
                    <span>+{overflow} more</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
