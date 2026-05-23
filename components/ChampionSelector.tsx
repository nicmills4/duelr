"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, X, Crosshair, Sword, Zap } from "lucide-react";
import type { Champion } from "@/app/api/champions/route";
import {
  WILDCARD_ANY, WILDCARD_ANY_MELEE, WILDCARD_ANY_RANGED,
  isWildcard, wildcardLabel,
  type Wildcard,
} from "@/lib/champion-types";

interface WildcardOption {
  id: Wildcard;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const WILDCARD_OPTIONS: WildcardOption[] = [
  {
    id: WILDCARD_ANY,
    label: "Any Champion",
    description: "Match with whoever's waiting",
    icon: <Crosshair className="w-5 h-5 text-gold-400" />,
  },
  {
    id: WILDCARD_ANY_MELEE,
    label: "Any Melee",
    description: "Fighters, tanks, assassins",
    icon: <Sword className="w-5 h-5 text-gold-400" />,
  },
  {
    id: WILDCARD_ANY_RANGED,
    label: "Any Ranged",
    description: "Mages, marksmen, ranged supports",
    icon: <Zap className="w-5 h-5 text-gold-400" />,
  },
];

interface Props {
  label: string;
  value: string;
  onChange: (championId: string) => void;
  champions: Champion[];
  allowWildcards?: boolean;
}

function WildcardIcon({ id }: { id: Wildcard }) {
  if (id === WILDCARD_ANY)        return <Crosshair className="w-6 h-6 text-gold-400" />;
  if (id === WILDCARD_ANY_MELEE)  return <Sword     className="w-6 h-6 text-gold-400" />;
  if (id === WILDCARD_ANY_RANGED) return <Zap       className="w-6 h-6 text-gold-400" />;
  return null;
}

export default function ChampionSelector({
  label, value, onChange, champions, allowWildcards = false,
}: Props) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  const selected        = champions.find((c) => c.id === value);
  const selectedWild    = isWildcard(value) ? (value as Wildcard) : null;

  const filtered = query
    ? champions.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : champions;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      {label && <label className="label">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input flex items-center gap-3 text-left cursor-pointer"
      >
        {selected ? (
          <>
            <Image src={selected.imageUrl} alt={selected.name} width={32} height={32}
              className="rounded-full ring-1 ring-gold-400" />
            <span className="font-medium">{selected.name}</span>
            <X className="ml-auto w-4 h-4 text-gray-500 hover:text-gray-300" onClick={clear} />
          </>
        ) : selectedWild ? (
          <>
            <WildcardIcon id={selectedWild} />
            <span className="font-medium text-gold-400">{wildcardLabel(selectedWild)}</span>
            <X className="ml-auto w-4 h-4 text-gray-500 hover:text-gray-300" onClick={clear} />
          </>
        ) : (
          <span className="text-gray-500">Select champion...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-dark-700 border border-dark-600 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-dark-600">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search champion..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto">
            {/* Wildcard options — shown at the top only when no query and allowed */}
            {allowWildcards && !query && WILDCARD_OPTIONS.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-dark-600 transition-colors text-left border-b border-dark-600/50 last:border-0"
                  onClick={() => { onChange(w.id); setOpen(false); setQuery(""); }}
                >
                  {w.icon}
                  <div>
                    <p className="text-sm font-semibold text-gold-400">{w.label}</p>
                    <p className="text-xs text-gray-500">{w.description}</p>
                  </div>
                </button>
              </li>
            ))}

            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500 text-center">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-600 transition-colors text-left"
                    onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
                  >
                    <Image src={c.imageUrl} alt={c.name} width={28} height={28}
                      className="rounded-full" />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="ml-auto text-xs text-gray-600">
                      {c.isRanged ? "Ranged" : "Melee"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
