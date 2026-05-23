"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Crosshair, Sword, Zap } from "lucide-react";
import type { QueuePlayer, VsEntry } from "@/app/api/queue/popular/route";

interface Props {
  refreshInterval?: number;
}

const ELO_BADGE: Record<string, string> = {
  low:   "bg-slate-700/60  text-slate-300  border-slate-600/40",
  mid:   "bg-emerald-900/50 text-emerald-300 border-emerald-700/40",
  high:  "bg-blue-900/50   text-blue-300   border-blue-700/40",
  elite: "bg-purple-900/50 text-purple-300  border-purple-700/40",
  apex:  "bg-red-900/50    text-red-300     border-red-700/40",
  any:   "bg-gold-400/10   text-gold-400    border-gold-400/25",
};

function WildcardIcon({ id }: { id: string }) {
  const cls = "w-3 h-3 text-gold-400 flex-shrink-0";
  if (id === "_any")        return <Crosshair className={cls} />;
  if (id === "_any_melee")  return <Sword     className={cls} />;
  if (id === "_any_ranged") return <Zap       className={cls} />;
  return null;
}

function VsChips({ entries }: { entries: VsEntry[] }) {
  return (
    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-0.5">
      <span className="text-[11px] text-gray-600 font-medium">vs</span>
      {entries.map((vs, i) => (
        <span key={vs.id} className="flex items-center gap-1">
          {vs.imageUrl ? (
            <Image
              src={vs.imageUrl}
              alt={vs.label}
              width={16}
              height={16}
              className="rounded-sm ring-1 ring-dark-600"
            />
          ) : (
            <WildcardIcon id={vs.id} />
          )}
          <span className="text-[11px] text-gray-300">{vs.label}</span>
          {i < entries.length - 1 && (
            <span className="text-gray-700 text-[11px]">·</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function PopularChampions({ refreshInterval = 30_000 }: Props) {
  const [players, setPlayers] = useState<QueuePlayer[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/queue/popular")
        .then((r) => r.json())
        .then((d) => setPlayers(d.players ?? []))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  if (!players || players.length === 0) return null;

  return (
    <div className="card max-w-lg mx-auto">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Champions in queue right now
      </p>

      <div className="divide-y divide-dark-600">
        {players.map((player, idx) => {
          const badgeCls =
            ELO_BADGE[player.eloBracket] ?? "bg-dark-600 text-gray-400 border-dark-500";

          return (
            <div
              key={`${player.riotId}-${idx}`}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              {/* My champion portrait */}
              <div className="flex-shrink-0">
                <Image
                  src={player.myChampionImageUrl}
                  alt={player.myChampion}
                  width={40}
                  height={40}
                  className="rounded-lg ring-1 ring-dark-600"
                />
              </div>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white text-sm truncate leading-tight">
                    {player.riotId}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${badgeCls}`}
                  >
                    {player.eloBracketLabel}
                  </span>
                </div>
                <VsChips entries={player.vsEntries} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
