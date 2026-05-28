"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, Swords, RefreshCw, AlertCircle } from "lucide-react";
import type { ChampionSuggestion } from "@/app/api/suggestions/route";

export default function SuggestedMatchups() {
  const [suggestions, setSuggestions] = useState<ChampionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const router = useRouter();

  async function fetchSuggestions(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/suggestions${forceRefresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load suggestions");
      } else if (data.reason) {
        setError(data.reason);
      } else {
        setSuggestions(data.suggestions ?? []);
        setCached(data.cached ?? false);
      }
    } catch {
      setError("Network error loading suggestions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSuggestions(false); }, []);

  function queueForMatchup(myChampion: string, vsChampion: string) {
    router.push(`/lobby?my=${encodeURIComponent(myChampion)}&vs=${encodeURIComponent(vsChampion)}`);
  }

  if (loading) {
    return (
      <div className="card max-w-lg mx-auto mt-6">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-gold-400" />
          <span className="text-sm">Analysing your match history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card max-w-lg mx-auto mt-6">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="max-w-lg mx-auto mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gold-400">
          <Lightbulb className="w-4 h-4" />
          <h3 className="font-semibold text-sm">Suggested Practice Matchups</h3>
        </div>
        <button
          onClick={() => fetchSuggestions(true)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          {cached ? "Cached · Refresh" : "Refresh"}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Based on your recent losses — these are the matchups you struggle with most.
      </p>

      {suggestions.map((champ) => (
        <div key={champ.myChampion} className="card space-y-3">
          {/* Champion header */}
          <div className="flex items-center gap-3">
            <Image
              src={champ.imageUrl}
              alt={champ.myChampion}
              width={40}
              height={40}
              className="rounded-full ring-2 ring-gold-400"
            />
            <div>
              <p className="font-semibold text-white">{champ.myChampion}</p>
              <p className="text-xs text-gray-500">
                {champ.gamesPlayed} game{champ.gamesPlayed !== 1 ? "s" : ""} in last 25
                {" · "}
                {champ.status === "no_losses" && "no recent losses — you're doing great!"}
                {champ.status === "ok" && "tough matchups below"}
              </p>
            </div>
          </div>

          {/* Suggested opponents — only shown when status is ok */}
          {champ.status === "ok" && (
            <div className="space-y-2">
              {champ.suggestions.map((s) => (
                <div
                  key={s.vsChampion}
                  className="flex items-center justify-between bg-dark-700 border border-dark-600 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Swords className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-200">{s.vsChampion}</span>
                    <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      {s.losses} {s.losses === 1 ? "loss" : "losses"}
                    </span>
                  </div>
                  <button
                    onClick={() => queueForMatchup(champ.myChampion, s.vsChampion)}
                    className="text-xs text-gold-400 hover:text-gold-500 font-medium transition-colors"
                  >
                    Practice →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
