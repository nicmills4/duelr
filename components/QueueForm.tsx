"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ChampionSelector from "./ChampionSelector";
import LivePlayerCount from "./LivePlayerCount";
import { ELO_BRACKETS, BRACKET_ORDER } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import type { RankInfo } from "@/app/api/me/rank/route";
import { isWildcard, wildcardLabel, WILDCARD_ANY } from "@/lib/champion-types";
import type { Champion } from "@/app/api/champions/route";
import type { MatchResult } from "@/lib/matchmaking";
import {
  Swords, Clock, CheckCircle2, XCircle, Loader2,
  Users, Zap, Trophy, ThumbsUp, ThumbsDown, Lock, ShieldCheck,
} from "lucide-react";
import type { MatchupInfo } from "@/app/api/queue/matchup-info/route";
import Image from "next/image";

type QueueState  = "idle" | "searching" | "matched" | "error";
type ReportState = "idle" | "pending" | "waiting" | "confirmed" | "disputed";

interface Props { riotId: string; }

// ── Queue depth indicator ────────────────────────────────────────────────────
function QueueDepth({
  myChampion, vsChampion, eloBracket,
}: { myChampion: string; vsChampion: string; eloBracket: string }) {
  const [depth,    setDepth]    = useState<number | null>(null);
  const [flexible, setFlexible] = useState(false);

  useEffect(() => {
    if (!myChampion || !vsChampion || !eloBracket) { setDepth(null); return; }

    const params = new URLSearchParams({ myChampion, vsChampion, eloBracket });
    fetch(`/api/queue/depth?${params}`)
      .then((r) => r.json())
      .then((d) => { setDepth(d.depth ?? null); setFlexible(d.flexible ?? false); })
      .catch(() => setDepth(null));
  }, [myChampion, vsChampion, eloBracket]);

  if (!myChampion || !vsChampion) return null;

  if (flexible) {
    return (
      <div className="flex items-center gap-2 text-xs text-gold-400">
        <Zap className="w-3 h-3" />
        Flexible matching — finds opponents faster
      </div>
    );
  }

  if (depth === null) return null;

  const instant = depth > 0;
  return (
    <div className={`flex items-center gap-2 text-xs ${instant ? "text-emerald-400" : "text-gray-500"}`}>
      <Users className="w-3 h-3" />
      {instant
        ? `${depth} player${depth !== 1 ? "s" : ""} waiting · Instant match available`
        : "0 players waiting · < 5 min estimated"}
    </div>
  );
}

// ── Outcome reporting ────────────────────────────────────────────────────────
function OutcomeReporter({ matchId, isPlayerA }: { matchId: string; isPlayerA: boolean }) {
  const [state,   setState]   = useState<ReportState>("idle");
  const [outcome, setOutcome] = useState<string | null>(null);

  async function report(result: "win" | "loss") {
    setState("pending");
    try {
      const res  = await fetch(`/api/match/${matchId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (!res.ok) { setState("idle"); return; }
      if (data.outcome === "DISPUTED") { setState("disputed"); return; }
      if (data.outcome) { setState("confirmed"); setOutcome(data.outcome); return; }
      setState("waiting");
    } catch {
      setState("idle");
    }
  }

  if (state === "confirmed") {
    const iWon = (outcome === "A_WIN" && isPlayerA) || (outcome === "B_WIN" && !isPlayerA);
    return (
      <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
        iWon
          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
          : "bg-red-500/10 border border-red-500/20 text-red-400"
      }`}>
        <Trophy className="w-4 h-4" />
        {iWon ? "Result confirmed — Win recorded!" : "Result confirmed — Loss recorded."}
      </div>
    );
  }

  if (state === "disputed") {
    return (
      <p className="text-xs text-gray-500">
        Outcome disputed — your opponent reported a different result.
      </p>
    );
  }

  if (state === "waiting") {
    return (
      <p className="text-xs text-gray-500">
        Your result was recorded. Waiting for your opponent to confirm…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-medium">How did it go?</p>
      <div className="flex gap-2">
        <button
          onClick={() => report("win")}
          disabled={state === "pending"}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 py-2 text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          <ThumbsUp className="w-4 h-4" /> I Won
        </button>
        <button
          onClick={() => report("loss")}
          disabled={state === "pending"}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 py-2 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          <ThumbsDown className="w-4 h-4" /> I Lost
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QueueForm({ riotId }: Props) {
  const searchParams = useSearchParams();
  const [champions,   setChampions]   = useState<Champion[]>([]);
  const [myChampion,  setMyChampion]  = useState(searchParams.get("my") ?? "");
  const [vsChampion,  setVsChampion]  = useState(searchParams.get("vs") ?? "");
  const [eloBracket,  setEloBracket]  = useState<EloBracket>("mid");
  const [rankInfo,    setRankInfo]    = useState<RankInfo | null>(null);
  const [rankLoading, setRankLoading] = useState(true);
  const [state,       setState]       = useState<QueueState>("idle");
  const [match,       setMatch]       = useState<MatchResult | null>(null);
  const [error,       setError]       = useState("");
  const [elapsed,     setElapsed]     = useState(0);
  const [matchupInfo,  setMatchupInfo]  = useState<MatchupInfo | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef   = useRef<EventSource | null>(null);

  const LOW_PLAYER_THRESHOLD = 10;

  // Sync champion selections when URL params change (e.g. "Practice →" in suggested matchups)
  useEffect(() => {
    const my = searchParams.get("my");
    const vs = searchParams.get("vs");
    if (my) setMyChampion(my);
    if (vs) setVsChampion(vs);
  }, [searchParams]);

  // Fetch champion list
  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []));
  }, []);

  // Track total queue size to power the low-player-count hint
  useEffect(() => {
    function refreshCount() {
      fetch("/api/queue/count")
        .then((r) => r.json())
        .then((d) => setTotalPlayers(d.count ?? 0))
        .catch(() => {});
    }
    refreshCount();
    const id = setInterval(refreshCount, 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch player's rank and gate brackets accordingly.
  // On any failure (API unavailable, dev key, network) — fail open, all brackets unlocked.
  useEffect(() => {
    fetch("/api/me/rank")
      .then((r) => r.json())
      .then((d: RankInfo & { error?: string }) => {
        if (d.error || !d.maxBracket) return; // leave rankInfo null → fail open
        setRankInfo(d);
        setEloBracket((current) => {
          const maxIdx = BRACKET_ORDER.indexOf(d.maxBracket);
          const curIdx = BRACKET_ORDER.indexOf(current);
          return curIdx > maxIdx ? d.maxBracket : current;
        });
      })
      .catch(() => {}) // network error → fail open
      .finally(() => setRankLoading(false));
  }, []);

  // Fetch counter-matchup info whenever champion selection changes
  useEffect(() => {
    if (!myChampion || !vsChampion || isWildcard(vsChampion)) {
      setMatchupInfo(null);
      return;
    }
    const params = new URLSearchParams({ myChampion, vsChampion, eloBracket });
    fetch(`/api/queue/matchup-info?${params}`)
      .then((r) => r.json())
      .then((d: MatchupInfo) => setMatchupInfo(d))
      .catch(() => setMatchupInfo(null));
  }, [myChampion, vsChampion, eloBracket]);

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
    const m   = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function closeSse() {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
  }

  const fireNotification = useCallback((opponent: string, myChamp: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden) return; // only if tabbed away
    new Notification("Duelr — Match Found!", {
      body: `${myChamp} vs ${opponent} · Open the tab to connect`,
      icon: "/favicon.ico",
    });
  }, []);

  async function joinQueue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("searching");

    // Request notification permission once the user starts searching
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const sse = new EventSource("/api/queue/stream");
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) { setError(data.error); setState("error"); }
        else {
          const result = data as MatchResult;
          setMatch(result);
          setState("matched");
          fireNotification(result.opponent.champion, result.myChampion);
        }
      } catch { setState("error"); }
      closeSse();
    };

    sse.onerror = () => {
      if (state === "searching") { setError("Connection lost"); setState("error"); }
      closeSse();
    };

    try {
      const res  = await fetch("/api/queue/join", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ myChampion, vsChampion, eloBracket }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setState("error"); closeSse(); return; }
      if (data.status === "matched") {
        const result = data.match as MatchResult;
        setMatch(result);
        setState("matched");
        fireNotification(result.opponent.champion, result.myChampion);
        closeSse();
      }
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

  const myChampData       = champions.find((c) => c.id === myChampion);
  const vsChampData       = !isWildcard(vsChampion) ? champions.find((c) => c.id === vsChampion) : null;
  const vsLabel           = isWildcard(vsChampion) ? wildcardLabel(vsChampion as Parameters<typeof wildcardLabel>[0]) : vsChampData?.name ?? vsChampion;
  const opponentChampData = match ? champions.find((c) => c.id === match.opponent.champion) : null;
  const myChampDataMatch  = match ? champions.find((c) => c.id === match.myChampion)        : null;

  // ── Matched state ──────────────────────────────────────────────────────────
  if (state === "matched" && match) {
    const isPlayerA = true; // we don't have a clean way to know here; the report API checks server-side
    return (
      <div className="card max-w-lg mx-auto text-center space-y-6">
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h2 className="text-xl font-bold">Match Found!</h2>
        </div>

        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            {myChampDataMatch && (
              <Image src={myChampDataMatch.imageUrl} alt={myChampDataMatch.name}
                width={64} height={64} className="rounded-full ring-2 ring-gold-400" />
            )}
            <span className="text-sm font-medium text-gold-400">You</span>
            <span className="text-xs text-gray-400">{myChampDataMatch?.name}</span>
          </div>

          <div className="flex flex-col items-center">
            <Swords className="w-8 h-8 text-gray-500" />
            <span className="text-xs text-gray-600 mt-1">vs</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {opponentChampData && (
              <Image src={opponentChampData.imageUrl} alt={opponentChampData.name}
                width={64} height={64} className="rounded-full ring-2 ring-gray-600" />
            )}
            <span className="text-sm font-medium text-gray-300">Opponent</span>
            <span className="text-xs text-gray-400">{opponentChampData?.name ?? match.opponent.champion}</span>
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
            <li>Add <span className="text-gold-400 font-medium">{match.opponent.riotId}</span> as a friend</li>
            <li>Create a Custom Game (5v5 or 1v1 mode)</li>
            <li>Invite your opponent and play!</li>
          </ol>
        </div>

        {/* Outcome reporting */}
        <OutcomeReporter matchId={match.matchId} isPlayerA={isPlayerA} />

        <button onClick={() => { setMatch(null); setState("idle"); }} className="btn-secondary w-full">
          Find Another Match
        </button>
      </div>
    );
  }

  // ── Searching state ────────────────────────────────────────────────────────
  if (state === "searching") {
    return (
      <div className="card max-w-lg mx-auto text-center space-y-6">
        <div className="flex items-center justify-center gap-3 text-gold-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <h2 className="text-xl font-bold">Searching for Opponent…</h2>
        </div>

        <div className="flex items-center justify-center gap-6 py-2">
          {myChampData && (
            <div className="flex flex-col items-center gap-2">
              <Image src={myChampData.imageUrl} alt={myChampData.name}
                width={64} height={64} className="rounded-full ring-2 ring-gold-400" />
              <span className="text-sm font-medium">{myChampData.name}</span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <Swords className="w-8 h-8 text-gray-600" />
          </div>
          {vsChampData ? (
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Image src={vsChampData.imageUrl} alt={vsChampData.name}
                  width={64} height={64} className="rounded-full ring-2 ring-gray-600 opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-gold-400/80 animate-spin" />
                </div>
              </div>
              <span className="text-sm font-medium text-gray-400">{vsChampData.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full ring-2 ring-gray-600 bg-dark-600 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-gold-400/80 animate-spin" />
              </div>
              <span className="text-sm font-medium text-gray-400">{vsLabel}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-lg">{formatTime(elapsed)}</span>
        </div>

        <p className="text-sm text-gray-500">
          Looking for a <span className="text-gold-400">{vsLabel}</span> to face your{" "}
          <span className="text-gold-400">{myChampData?.name}</span>
        </p>

        <div className="flex flex-col items-center gap-2">
          <QueueDepth
            myChampion={myChampion}
            vsChampion={vsChampion}
            eloBracket={eloBracket}
          />
          <LivePlayerCount />
          {matchupInfo?.isCounter && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <ShieldCheck className="w-3 h-3" />
              <span>
                Counter advantage · searching{" "}
                {matchupInfo.bonusBracketLabel
                  ? `${ELO_BRACKETS.find(b => b.value === eloBracket)?.label} + ${matchupInfo.bonusBracketLabel}`
                  : "expanded pool"}
              </span>
            </div>
          )}
        </div>

        <button onClick={leaveQueue} className="btn-secondary w-full flex items-center justify-center gap-2">
          <XCircle className="w-4 h-4" /> Leave Queue
        </button>
      </div>
    );
  }

  // ── Idle / error state ─────────────────────────────────────────────────────
  return (
    <form onSubmit={joinQueue} className="card max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Set Up Your Match</h2>
        <p className="text-sm text-gray-400">
          Playing as <span className="text-gold-400 font-medium">{riotId}</span>
        </p>
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
        allowWildcards
      />

      {/* Low player count suggestion */}
      {totalPlayers !== null &&
        totalPlayers < LOW_PLAYER_THRESHOLD &&
        vsChampion &&
        !isWildcard(vsChampion) && (
        <button
          type="button"
          onClick={() => setVsChampion(WILDCARD_ANY)}
          className="flex items-center gap-2.5 w-full text-xs text-left bg-gold-400/10 border border-gold-400/20 text-gold-400 rounded-lg px-3 py-2.5 hover:bg-gold-400/15 transition-colors group"
        >
          <Users className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
          <span className="flex-1">
            <span className="font-semibold">
              Only {totalPlayers} {totalPlayers === 1 ? "player" : "players"} in queue
            </span>
            {" — try "}
            <span className="underline underline-offset-2 group-hover:no-underline">
              Any Champion
            </span>
            {" to match faster"}
          </span>
        </button>
      )}

      {/* Queue depth + wait time */}
      {myChampion && vsChampion && (
        <QueueDepth
          myChampion={myChampion}
          vsChampion={vsChampion}
          eloBracket={eloBracket}
        />
      )}

      {/* Counter matchup advantage badge */}
      {matchupInfo?.isCounter && (
        <div className="flex items-start gap-2 text-xs bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded-lg px-3 py-2.5">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">
              {matchupInfo.winRate?.toFixed(1)}% win rate advantage
            </span>{" "}
            into this matchup
            {matchupInfo.bonusBracketLabel && (
              <>
                {" "}· you&apos;ll also match against{" "}
                <span className="font-semibold">{matchupInfo.bonusBracketLabel}</span>{" "}
                opponents
              </>
            )}
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-gray-400">Elo Bracket</span>
          {rankLoading ? (
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Fetching rank…
            </span>
          ) : rankInfo?.tier ? (
            <span className="text-xs text-gray-500">
              Your rank:{" "}
              <span className="text-gray-300 font-medium">
                {rankInfo.tier.charAt(0) + rankInfo.tier.slice(1).toLowerCase()} {rankInfo.rank}
              </span>
            </span>
          ) : rankInfo ? (
            <span className="text-xs text-gray-600">Unranked</span>
          ) : (
            <span className="text-xs text-gray-600 italic">Rank verification unavailable</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ELO_BRACKETS.map((b) => {
            const maxIdx  = rankInfo ? BRACKET_ORDER.indexOf(rankInfo.maxBracket) : BRACKET_ORDER.length - 1;
            const bIdx    = BRACKET_ORDER.indexOf(b.value as EloBracket);
            const locked  = !rankLoading && rankInfo !== null && bIdx > maxIdx;
            const active  = eloBracket === b.value;
            const isApex  = b.value === "apex";
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => { if (!locked) setEloBracket(b.value as EloBracket); }}
                disabled={locked}
                className={`relative rounded-lg border p-3 text-left transition-all ${isApex ? "col-span-2" : ""} ${
                  locked
                    ? "border-dark-600 opacity-40 cursor-not-allowed"
                    : active
                      ? "border-gold-400 bg-gold-400/10 text-gold-400"
                      : "border-dark-600 hover:border-gray-500 text-gray-300"
                }`}
              >
                {locked && (
                  <Lock className="absolute top-2 right-2 w-3 h-3 text-gray-600" />
                )}
                <div className="font-semibold text-sm">{b.label}</div>
                <div className="text-xs opacity-70">{b.description}</div>
              </button>
            );
          })}
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
        <Swords className="w-4 h-4" /> Find Match
      </button>
    </form>
  );
}
