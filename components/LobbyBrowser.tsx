"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import ChampionSelector from "./ChampionSelector";
import { ELO_BRACKETS } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import type { Champion } from "@/app/api/champions/route";
import type { AcceptsType, LobbyPlayer } from "@/lib/lobby-types";
import {
  Swords, Users, CheckCircle2, XCircle, Loader2,
  Radio, RefreshCw, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutgoingChallenge {
  challengeId: string;
  targetRiotId: string;
  targetChampName: string;
  expiresAt: number;
}

interface IncomingChallenge {
  challengeId: string;
  challengerRiotId: string;
  challengerChampName: string;
  challengerChampImage: string;
  challengerElo: string;
  expiresAt: number;
}

interface MatchResult {
  riotId: string;
  champName: string;
  champImage: string;
}

interface Props {
  riotId: string;
  userId: string;
}

// ── Countdown helper ──────────────────────────────────────────────────────────

function useCountdown(expiresAt: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    function tick() {
      setRemaining(Math.max(0, Math.round((expiresAt! - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

// ── Player card ───────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  onChallenge,
  disabled,
}: {
  player: LobbyPlayer;
  onChallenge: () => void;
  disabled: boolean;
}) {
  const bracketLabel =
    ELO_BRACKETS.find((b) => b.value === player.eloBracket)?.label ?? player.eloBracket;
  const acceptsLabel =
    player.acceptsType === "any"
      ? "Any opponent"
      : player.acceptsType === "melee"
      ? "Melee only"
      : "Ranged only";

  return (
    <div className="card flex items-center gap-4">
      <Image
        src={player.champImage}
        alt={player.champName}
        width={48}
        height={48}
        className="rounded-full ring-2 ring-dark-600 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm truncate">{player.riotId}</p>
        <p className="text-xs text-gray-400">
          {player.champName} · {bracketLabel} · {player.region.toUpperCase()}
        </p>
        <p className="text-xs text-gray-600 mt-0.5">{acceptsLabel}</p>
      </div>
      <button
        onClick={onChallenge}
        disabled={disabled}
        className="btn-primary text-sm px-4 py-1.5 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Challenge
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LobbyBrowser({ riotId, userId }: Props) {
  const [champions,    setChampions]    = useState<Champion[]>([]);
  const [myChampion,   setMyChampion]   = useState("");
  const [eloBracket,   setEloBracket]   = useState<EloBracket>("mid");
  const [acceptsType,  setAcceptsType]  = useState<AcceptsType>("any");
  const [available,    setAvailable]    = useState(false);

  const [players,      setPlayers]      = useState<LobbyPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const [outgoing,     setOutgoing]     = useState<OutgoingChallenge | null>(null);
  const [incoming,     setIncoming]     = useState<IncomingChallenge | null>(null);
  const [matchResult,  setMatchResult]  = useState<MatchResult | null>(null);

  const [availErr,     setAvailErr]     = useState("");
  const [challengeErr, setChallengeErr] = useState("");
  const [going,        setGoing]        = useState(false);
  const [challenging,  setChallenging]  = useState<string | null>(null); // userId being challenged

  const sseRef = useRef<EventSource | null>(null);
  const outgoingCountdown = useCountdown(outgoing?.expiresAt ?? null);
  const incomingCountdown = useCountdown(incoming?.expiresAt ?? null);

  // Auto-clear expired challenges on client
  useEffect(() => {
    if (outgoing && outgoingCountdown === 0) setOutgoing(null);
  }, [outgoing, outgoingCountdown]);
  useEffect(() => {
    if (incoming && incomingCountdown === 0) setIncoming(null);
  }, [incoming, incomingCountdown]);

  // Fetch champion list
  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []));
  }, []);

  // Notification SSE — stays open for real-time challenge events
  useEffect(() => {
    const sse = new EventSource("/api/notifications/stream");
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "challenge") {
          setIncoming({
            challengeId:        data.challengeId,
            challengerRiotId:   data.challengerRiotId,
            challengerChampName: data.challengerChampName,
            challengerChampImage: data.challengerChampImage,
            challengerElo:      data.challengerElo,
            expiresAt:          Date.now() + 44_000,
          });
        } else if (data.type === "challenge_accepted") {
          setMatchResult(data.opponent as MatchResult);
          setOutgoing(null);
          setAvailable(false);
        } else if (data.type === "challenge_declined") {
          setOutgoing(null);
        }
      } catch {}
    };

    return () => { sse.close(); sseRef.current = null; };
  }, []);

  // Poll player list every 10 s
  const fetchPlayers = useCallback(() => {
    setLoadingPlayers(true);
    fetch("/api/lobby/players")
      .then((r) => r.json())
      .then((d) => setPlayers(d.players ?? []))
      .catch(() => {})
      .finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    fetchPlayers();
    const id = setInterval(fetchPlayers, 10_000);
    return () => clearInterval(id);
  }, [fetchPlayers]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function goAvailable() {
    if (!myChampion) { setAvailErr("Select your champion first"); return; }
    setAvailErr("");
    setGoing(true);

    const champ = champions.find((c) => c.id === myChampion);
    if (!champ) { setGoing(false); return; }

    const res = await fetch("/api/lobby/available", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        myChampion,
        champName:  champ.name,
        champImage: champ.imageUrl,
        eloBracket,
        acceptsType,
      }),
    });

    setGoing(false);
    if (res.ok) { setAvailable(true); fetchPlayers(); }
  }

  async function goOffline() {
    await fetch("/api/lobby/leave", { method: "POST" });
    setAvailable(false);
    fetchPlayers();
  }

  async function sendChallenge(player: LobbyPlayer) {
    setChallengeErr("");
    setChallenging(player.userId);

    const res = await fetch("/api/lobby/challenge", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ targetUserId: player.userId }),
    });
    const data = await res.json();
    setChallenging(null);

    if (!res.ok) { setChallengeErr(data.error ?? "Failed to send challenge"); return; }

    setOutgoing({
      challengeId:    data.challengeId,
      targetRiotId:   player.riotId,
      targetChampName: player.champName,
      expiresAt:      Date.now() + 45_000,
    });
  }

  async function respondToChallenge(accept: boolean) {
    if (!incoming) return;

    const res = await fetch("/api/lobby/respond", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ challengeId: incoming.challengeId, accept }),
    });
    const data = await res.json();
    setIncoming(null);

    if (accept && data.challenger) {
      setMatchResult(data.challenger as MatchResult);
      setAvailable(false);
    }
  }

  const myChampData    = champions.find((c) => c.id === myChampion);
  const myBracketLabel = ELO_BRACKETS.find((b) => b.value === eloBracket)?.label ?? eloBracket;
  const otherPlayers   = players.filter((p) => p.userId !== userId);

  // ── Match confirmed ──────────────────────────────────────────────────────────
  if (matchResult) {
    return (
      <div className="card max-w-lg mx-auto space-y-6 text-center">
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h2 className="text-xl font-bold">Challenge Accepted!</h2>
        </div>

        {matchResult.champImage && (
          <Image
            src={matchResult.champImage}
            alt={matchResult.champName}
            width={64} height={64}
            className="rounded-full ring-2 ring-gold-400 mx-auto"
          />
        )}

        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-left space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Your opponent</p>
          <p className="text-lg font-bold text-gold-400">{matchResult.riotId}</p>
          <p className="text-sm text-gray-400">{matchResult.champName}</p>
        </div>

        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-sm text-gray-400 text-left space-y-2">
          <p className="font-semibold text-white">How to start:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Add <span className="text-gold-400 font-medium">{matchResult.riotId}</span> as a friend in the client</li>
            <li>Create a Custom Game and invite them</li>
            <li>Pick your champions and play!</li>
          </ol>
        </div>

        <button onClick={() => { setMatchResult(null); fetchPlayers(); }} className="btn-secondary w-full">
          Back to Lobby
        </button>
      </div>
    );
  }

  // ── Incoming challenge ───────────────────────────────────────────────────────
  if (incoming) {
    return (
      <div className="card max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Incoming Challenge</p>
          <h2 className="text-xl font-bold text-white">{incoming.challengerRiotId}</h2>
          <p className="text-sm text-gray-400">wants to 1v1!</p>
        </div>

        <div className="flex items-center justify-center gap-6">
          {incoming.challengerChampImage && (
            <div className="flex flex-col items-center gap-2">
              <Image
                src={incoming.challengerChampImage}
                alt={incoming.challengerChampName}
                width={64} height={64}
                className="rounded-full ring-2 ring-gold-400"
              />
              <span className="text-sm font-medium">{incoming.challengerChampName}</span>
              <span className="text-xs text-gray-500 uppercase">{incoming.challengerElo} elo</span>
            </div>
          )}
          <Swords className="w-8 h-8 text-gray-600" />
          {myChampData ? (
            <div className="flex flex-col items-center gap-2">
              <Image
                src={myChampData.imageUrl}
                alt={myChampData.name}
                width={64} height={64}
                className="rounded-full ring-2 ring-gray-600"
              />
              <span className="text-sm font-medium">{myChampData.name}</span>
              <span className="text-xs text-gray-500">You</span>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-dark-600 ring-2 ring-gray-600 flex items-center justify-center">
              <span className="text-gray-500 text-xs">You</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Expires in {incomingCountdown}s</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => respondToChallenge(true)}
            className="btn-primary flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" /> Accept
          </button>
          <button
            onClick={() => respondToChallenge(false)}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Decline
          </button>
        </div>
      </div>
    );
  }

  // ── Main lobby view ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── My status card ─────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        {!available ? (
          <>
            <div>
              <h2 className="text-lg font-bold text-white">Go Available</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                You&apos;ll appear in the list and anyone can send you a direct challenge.
              </p>
            </div>

            <ChampionSelector
              label="I'm playing"
              value={myChampion}
              onChange={setMyChampion}
              champions={champions}
            />

            {/* Accepts type */}
            <div>
              <span className="label">I&apos;ll play against</span>
              <div className="flex gap-2">
                {(["any", "melee", "ranged"] as AcceptsType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAcceptsType(t)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-all ${
                      acceptsType === t
                        ? "border-gold-400 bg-gold-400/10 text-gold-400"
                        : "border-dark-600 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {t === "any" ? "Anyone" : t === "melee" ? "Melee only" : "Ranged only"}
                  </button>
                ))}
              </div>
            </div>

            {/* Elo bracket */}
            <div>
              <span className="label">My elo bracket</span>
              <div className="grid grid-cols-3 gap-2">
                {ELO_BRACKETS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setEloBracket(b.value as EloBracket)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      eloBracket === b.value
                        ? "border-gold-400 bg-gold-400/10 text-gold-400"
                        : "border-dark-600 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <div className="font-semibold text-sm">{b.label}</div>
                    <div className="text-xs opacity-60">{b.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {availErr && <p className="text-sm text-red-400">{availErr}</p>}

            <button
              onClick={goAvailable}
              disabled={!myChampion || going}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {going
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Going available…</>
                : <><Radio className="w-4 h-4" /> Go Available</>}
            </button>
          </>
        ) : (
          /* Available status row */
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 z-10">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                  {myChampData ? (
                    <Image
                      src={myChampData.imageUrl}
                      alt={myChampData.name}
                      width={40} height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-dark-600" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">You&apos;re available</p>
                  <p className="text-xs text-gray-400">
                    {myChampData?.name} · {myBracketLabel} ·{" "}
                    {acceptsType === "any" ? "Any opponent" : acceptsType === "melee" ? "Melee only" : "Ranged only"}
                  </p>
                </div>
              </div>
              <button
                onClick={goOffline}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Go Offline
              </button>
            </div>

            {/* Outgoing challenge status */}
            {outgoing && (
              <div className="flex items-center justify-between bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gold-400 flex-shrink-0" />
                  <span className="text-gray-300">
                    Waiting for{" "}
                    <span className="text-gold-400 font-medium">{outgoing.targetRiotId}</span>{" "}
                    ({outgoing.targetChampName})…
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 ml-2 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {outgoingCountdown}s
                  <button
                    onClick={() => setOutgoing(null)}
                    className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {challengeErr && <p className="text-xs text-red-400">{challengeErr}</p>}
          </>
        )}
      </div>

      {/* ── Available players ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold-400" />
            <h3 className="font-semibold text-sm text-white">
              Available Players
              {otherPlayers.length > 0 && (
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  {otherPlayers.length} online
                </span>
              )}
            </h3>
          </div>
          <button
            onClick={fetchPlayers}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {loadingPlayers
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>

        {otherPlayers.length === 0 ? (
          <div className="card text-center py-12 space-y-2">
            <Users className="w-8 h-8 mx-auto text-gray-700" />
            <p className="text-sm text-gray-600">No players available right now.</p>
            <p className="text-xs text-gray-700">Go available above to be the first!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {otherPlayers.map((player) => (
              <PlayerCard
                key={player.userId}
                player={player}
                onChallenge={() => sendChallenge(player)}
                disabled={
                  !available ||
                  !!outgoing ||
                  challenging === player.userId
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
