"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, Package, Sword } from "lucide-react";
import type { MatchupStatsResponse, ItemData } from "@/app/api/matchup-stats/route";

interface Props {
  myChampion: string;
  vsChampion: string;
}

function WinRateBadge({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const pct = Math.round(rate * 100);
  const isGood = pct >= 52;
  const isBad  = pct <= 48;

  const color = isGood
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : isBad
      ? "text-red-400 border-red-500/30 bg-red-500/10"
      : "text-gold-400 border-gold-400/30 bg-gold-400/10";

  const Icon = isGood ? TrendingUp : isBad ? TrendingDown : Minus;

  return (
    <div className={`inline-flex items-center gap-2 border rounded-xl px-4 py-2 ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="text-2xl font-black">{pct}%</span>
      <span className="text-xs opacity-70">{wins}W / {losses}L</span>
    </div>
  );
}

function ItemRow({ items, label, icon }: { items: ItemData[]; label: string; icon: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.id} className="group relative">
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={36}
              height={36}
              className="rounded-md ring-1 ring-dark-600 group-hover:ring-gold-400 transition-all"
            />
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                            hidden group-hover:block pointer-events-none">
              <div className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 whitespace-nowrap text-xs">
                <p className="font-semibold text-white">{item.name}</p>
                <p className="text-gray-400">{item.totalGold}g</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchupStats({ myChampion, vsChampion }: Props) {
  const [stats, setStats]   = useState<MatchupStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!myChampion || !vsChampion) {
      setStats(null);
      setError("");
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setStats(null);

    fetch(
      `/api/matchup-stats?myChampion=${encodeURIComponent(myChampion)}&vsChampion=${encodeURIComponent(vsChampion)}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStats(data as MatchupStatsResponse);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Failed to load matchup data");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [myChampion, vsChampion]);

  if (!myChampion || !vsChampion) return null;

  if (loading) {
    return (
      <div className="card max-w-lg mx-auto mt-4">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-gold-400" />
          <span className="text-sm">Analysing Challenger match data…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card max-w-lg mx-auto mt-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Matchup data unavailable — {error}</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const noItems = stats.starterItems.length === 0 && stats.coreBuild.length === 0;

  return (
    <div className="card max-w-lg mx-auto mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          {stats.myChampion} vs {stats.vsChampion}
        </h3>
        <span className="text-xs text-gray-600">
          {stats.cached ? "Cached · " : ""}Patch {stats.patch}
        </span>
      </div>

      {/* Win rate */}
      {stats.insufficientData ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-gold-400/60" />
          <span>
            Only {stats.matchupGames} game{stats.matchupGames !== 1 ? "s" : ""} found in Challenger
            — not enough data for a reliable win rate.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <WinRateBadge rate={stats.winRate} wins={stats.wins} losses={stats.losses} />
          <span className="text-xs text-gray-500">
            win rate in {stats.matchupGames} Challenger games
          </span>
        </div>
      )}

      {/* Items */}
      {noItems && !stats.insufficientData && (
        <p className="text-xs text-gray-600">No item data available for this matchup.</p>
      )}

      <ItemRow
        items={stats.starterItems}
        label="Starter"
        icon={<Package className="w-3 h-3" />}
      />

      <ItemRow
        items={stats.coreBuild}
        label="Core Build"
        icon={<Sword className="w-3 h-3" />}
      />

      {/* Attribution */}
      <p className="text-xs text-gray-700 pt-1 border-t border-dark-600">
        Based on {stats.gamesSearched} Challenger (NA) games — updates every 24 h
      </p>
    </div>
  );
}
