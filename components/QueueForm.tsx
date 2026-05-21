"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ChampionSelector from "./ChampionSelector";
import { ELO_BRACKETS } from "@/lib/constants";
import type { Champion } from "@/app/api/champions/route";
import type { MatchResult } from "@/lib/matchmaking";
import { Swords, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Image from "next/image";

type QueueState = "idle" | "searching" | "matched" | "error";

interface Props {
  riotId: string;
}

export default function QueueForm({ riotId }: Props) {
  const searchParams = useSearchParams();
  const [champions, setChampions] = useState<Champion[]>([]);
  const [myChampion, setMyChampion] = useState(searchParams.get("my") ?? "");
  const [vsChampion, setVsChampion] = useState(searchParams.get("vs") ?? "");
  const [eloBracket, setEloBracket] = useState("mid");
  const [state, setState] = useState<QueueState>("idle");
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []));
  }, []);

  useEffect(() => {
    if (state === "searching") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function closeSse() {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
  }

  async function joinQueue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("searching");

    // Start SSE listener first so we don't miss the event
    const sse = new EventSource("/api/queue/stream");
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) { setError(data.error); setState("error"); }
        else { setMatch(data as MatchResult); setState("matched"); }
      } catch { setState("error"); }
      closeSse();
    };

    sse.onerror = () => {
      if (state === "searching") { setError("Connection lost"); setState("error"); }
      closeSse();
    };

    try {
      const res = await fetch("/api/queue/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myChampion, vsChampion, eloBracket }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); setState("error"); closeSse(); return; }

      if (data.status === "matched") {
        setMatch(data.match as MatchResult);
        setState("matched");
        closeSse();
      }
      // else: stay in "searching", SSE will fire when a match is found
    } catch {
      setError("Network error — please try again");
      setState("error");
      closeSse();
    }
  }

  async function leaveQueue() {
    closeSse();
    await fetch("/api/queue/leave", { method: "POST" });
    setState("idle");
  }

  const myChampData = champions.find((c) => c.id === myChampion);
  const vsChampData = champions.find((c) => c.id === vsChampion);
  const opponentChampData = match ? champions.find((c) => c.id === match.opponent.champion) : null;
  const myChampDataInMatch = match ? champions.find((c) => c.id === match.myChampion) : null;

  if (state === "matched" && match) {
    return (
      <div className="card max-w-lg mx-auto text-center space-y-6">
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h2 className="text-xl font-bold">Match Found!</h2>
        </div>

        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            {myChampDataInMatch && (
              <Image src={myChampDataInMatch.imageUrl} alt={myChampDataInMatch.name} width={64} height={64}
                className="rounded-full ring-2 ring-gold-400" />
            )}
            <span className="text-sm font-medium text-gold-400">You</span>
            <span className="text-xs text-gray-400">{myChampDataInMatch?.name}</span>
          </div>

          <div className="flex flex-col items-center">
            <Swords className="w-8 h-8 text-gray-500" />
            <span className="text-xs text-gray-600 mt-1">vs</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {opponentChampData && (
              <Image src={opponentChampData.imageUrl} alt={opponentChampData.name} width={64} height={64}
                className="rounded-full ring-2 ring-gray-600" />
            )}
            <span className="text-sm font-medium text-gray-300">Opponent</span>
            <span className="text-xs text-gray-400">{opponentChampData?.name}</span>
          </div>
        </div>

        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Opponent&apos;s Details</p>
          <p className="text-lg font-bold text-gold-400">{match.opponent.riotId}</p>
          <p className="text-sm text-gray-400">Region: <span className="text-gray-200 uppercase">{match.opponent.region}</span></p>
        </div>

        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-sm text-gray-400 text-left space-y-2">
          <p className="font-semibold text-white">How to start your match:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Add <span className="text-gold-400 font-medium">{match.opponent.riotId}</span> as a friend in the League client</li>
            <li>Create a Custom Game (5v5 or 1v1 mode)</li>
            <li>Invite your opponent and enjoy the match!</li>
          </ol>
        </div>

        <button onClick={() => { setMatch(null); setState("idle"); }} className="btn-secondary w-full">
          Find Another Match
        </button>
      </div>
    );
  }

  if (state === "searching") {
    return (
      <div className="card max-w-lg mx-auto text-center space-y-6">
        <div className="flex items-center justify-center gap-3 text-gold-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <h2 className="text-xl font-bold">Searching for Opponent...</h2>
        </div>

        <div className="flex items-center justify-center gap-6 py-2">
          {myChampData && (
            <div className="flex flex-col items-center gap-2">
              <Image src={myChampData.imageUrl} alt={myChampData.name} width={64} height={64}
                className="rounded-full ring-2 ring-gold-400" />
              <span className="text-sm font-medium">{myChampData.name}</span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <Swords className="w-8 h-8 text-gray-600" />
          </div>
          {vsChampData && (
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Image src={vsChampData.imageUrl} alt={vsChampData.name} width={64} height={64}
                  className="rounded-full ring-2 ring-gray-600 opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-gold-400/80 animate-spin" />
                </div>
              </div>
              <span className="text-sm font-medium text-gray-400">{vsChampData.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-lg">{formatTime(elapsed)}</span>
        </div>

        <p className="text-sm text-gray-500">Looking for a <span className="text-gold-400">{vsChampData?.name}</span> player who wants to face a <span className="text-gold-400">{myChampData?.name}</span></p>

        <button onClick={leaveQueue} className="btn-secondary w-full flex items-center justify-center gap-2">
          <XCircle className="w-4 h-4" />
          Leave Queue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={joinQueue} className="card max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Set Up Your Match</h2>
        <p className="text-sm text-gray-400">Playing as <span className="text-gold-400 font-medium">{riotId}</span></p>
      </div>

      <ChampionSelector
        label="I want to play"
        value={myChampion}
        onChange={setMyChampion}
        champions={champions}
      />

      <ChampionSelector
        label="I want to face"
        value={vsChampion}
        onChange={setVsChampion}
        champions={champions}
      />

      <div>
        <label className="label">Elo Bracket</label>
        <div className="grid grid-cols-2 gap-2">
          {ELO_BRACKETS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setEloBracket(b.value)}
              className={`rounded-lg border p-3 text-left transition-all ${
                eloBracket === b.value
                  ? "border-gold-400 bg-gold-400/10 text-gold-400"
                  : "border-gray-700 hover:border-gray-500 text-gray-300"
              }`}
            >
              <div className="font-semibold text-sm">{b.label}</div>
              <div className="text-xs opacity-70">{b.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!myChampion || !vsChampion || !eloBracket}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Swords className="w-4 h-4" />
        Find Match
      </button>
    </form>
  );
}
