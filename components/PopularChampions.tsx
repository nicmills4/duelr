"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { PopularChampion } from "@/app/api/queue/popular/route";

interface Props {
  refreshInterval?: number;
}

export default function PopularChampions({ refreshInterval = 30000 }: Props) {
  const [champs, setChamps] = useState<PopularChampion[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/queue/popular")
        .then((r) => r.json())
        .then((d) => setChamps(d.popular ?? []))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  if (!champs || champs.length === 0) return null;

  return (
    <div className="card max-w-lg mx-auto">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Champions in queue right now
      </p>
      <div className="grid grid-cols-5 gap-2">
        {champs.map(({ champion, count, imageUrl }) => (
          <div key={champion} className="flex flex-col items-center gap-1">
            <div className="relative">
              <Image
                src={imageUrl}
                alt={champion}
                width={44}
                height={44}
                className="rounded-lg ring-1 ring-dark-600"
              />
              {count > 1 && (
                <span className="absolute -top-1 -right-1 bg-gold-400 text-dark-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {count}
                </span>
              )}
            </div>
            <span className="text-[10px] text-gray-400 text-center leading-tight truncate w-full text-center">
              {champion}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
