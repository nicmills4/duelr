"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";

interface Props {
  className?: string;
  refreshInterval?: number; // ms
}

export default function LivePlayerCount({ className = "", refreshInterval = 30000 }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    function fetch_count() {
      fetch("/api/queue/count")
        .then((r) => r.json())
        .then((d) => setCount(d.count ?? 0))
        .catch(() => {});
    }

    fetch_count();
    const id = setInterval(fetch_count, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  if (count === null) return null;

  return (
    <div className={`flex items-center gap-1.5 text-sm text-gray-400 ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <Users className="w-3.5 h-3.5" />
      <span>
        <span className="text-white font-semibold">{count}</span>{" "}
        {count === 1 ? "player" : "players"} in queue
      </span>
    </div>
  );
}
