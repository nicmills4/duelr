"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import ChampionSelector from "./ChampionSelector";
import { ELO_BRACKETS, BRACKET_ORDER } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import type { Champion } from "@/app/api/champions/route";
import type {
  LobbyPlayer, LobbyMode, SlotKey, LobbyGroup, GroupSlot,
} from "@/lib/lobby-types";
import { ALL_SLOTS, SLOT_ROLE, userSlotIn, groupIsFull } from "@/lib/lobby-types";
import {
  Swords, Users, CheckCircle2, XCircle, Loader2,
  Radio, RefreshCw, Clock, Filter, X, Shield,
  UserPlus, LogOut, Crown, Copy, Check, Plus,
} from "lucide-react";
import { playQueuePop } from "@/lib/sounds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutgoingChallenge {
  challengeId:     string;
  targetRiotId:    string;
  targetChampName: string;
  expiresAt:       number;
}

interface IncomingChallenge {
  challengeId:          string;
  challengerRiotId:     string;
  challengerChampName:  string;
  challengerChampImage: string;
  challengerElo:        string;
  expiresAt:            number;
}

interface MatchResult {
  riotId:          string;
  champName:       string;
  champImage:      string;
  voiceChannelUrl?: string;
}

interface GroupReadyResult {
  team1:            GroupSlot[];
  team2:            GroupSlot[];
  voiceChannelUrl?: string;
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
    function tick() { setRemaining(Math.max(0, Math.round((expiresAt! - Date.now()) / 1000))); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

// ── Copy Riot ID button ────────────────────────────────────────────────────────

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy Riot ID"
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-dark-600 bg-dark-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy ID"}
    </button>
  );
}

// ── vsChampion chip ────────────────────────────────────────────────────────────

function VsChip({
  vsId, champions, onRemove,
}: { vsId: string; champions: Champion[]; onRemove: () => void }) {
  const champ = champions.find((c) => c.id === vsId);
  return (
    <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1.5 text-sm">
      {champ && (
        <Image src={champ.imageUrl} alt={champ.name} width={18} height={18}
          className="rounded-full ring-1 ring-dark-500" />
      )}
      <span className="text-gray-200 font-medium text-xs">{champ?.name ?? vsId}</span>
      <button type="button" onClick={onRemove} className="ml-0.5 text-gray-500 hover:text-gray-300 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Player card (1v1) ─────────────────────────────────────────────────────────

function PlayerCard({
  player, champions, onChallenge, disabled,
}: { player: LobbyPlayer; champions: Champion[]; onChallenge: () => void; disabled: boolean }) {
  const bracketLabel = ELO_BRACKETS.find((b) => b.value === player.eloBracket)?.label ?? player.eloBracket;
  const vsIds        = player.vsChampions ?? [];

  return (
    <div className="card flex items-center gap-4">
      <Image src={player.champImage} alt={player.champName}
        width={48} height={48} className="rounded-full ring-2 ring-dark-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm truncate">{player.riotId}</p>
        <p className="text-xs text-gray-400">
          {player.champName} · {bracketLabel} · {player.region.toUpperCase()}
        </p>
        {vsIds.length > 0 ? (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {vsIds.slice(0, 5).map((id) => {
              const c = champions.find((ch) => ch.id === id);
              return c ? (
                <div key={id} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <Image src={c.imageUrl} alt={c.name} width={14} height={14} className="rounded-full opacity-80" />
                  {c.name}
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 mt-0.5">Open to all opponents</p>
        )}
      </div>
      <button onClick={onChallenge} disabled={disabled}
        className="btn-primary text-sm px-4 py-1.5 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
        Challenge
      </button>
    </div>
  );
}

// ── Group slot cell ───────────────────────────────────────────────────────────

function SlotCell({
  slot, role, isMe, canJoin, joining, onJoin,
}: {
  slot:    GroupSlot | null;
  role:    "adc" | "support";
  isMe:    boolean;
  canJoin: boolean;
  joining: boolean;
  onJoin:  () => void;
}) {
  const roleLabel = role === "adc" ? "ADC" : "Support";
  const roleColor = role === "adc" ? "text-blue-400" : "text-emerald-400";
  const roleBg    = role === "adc" ? "bg-blue-400/10 border-blue-400/20" : "bg-emerald-400/10 border-emerald-400/20";

  if (slot) {
    return (
      <div className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border ${isMe ? "border-gold-400/40 bg-gold-400/5" : "border-dark-600 bg-dark-700/50"}`}>
        <Image src={slot.champImage} alt={slot.champName}
          width={36} height={36} className="rounded-full ring-1 ring-dark-500" />
        <p className="text-[10px] font-semibold text-white truncate max-w-[72px] text-center leading-tight">
          {slot.riotId.split("#")[0]}
        </p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleColor} bg-dark-700`}>
          {roleLabel}
          {isMe && " · You"}
          {slot.isHost && !isMe && " · Host"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed ${roleBg} min-h-[92px]`}>
      <span className={`text-[10px] font-semibold ${roleColor}`}>{roleLabel}</span>
      {canJoin ? (
        <button onClick={onJoin} disabled={joining}
          className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-white border border-dark-500 hover:border-gray-400 bg-dark-700 hover:bg-dark-600 rounded-lg px-2 py-1 transition-all disabled:opacity-50">
          {joining ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <UserPlus className="w-2.5 h-2.5" />}
          Join
        </button>
      ) : (
        <span className="text-[10px] text-gray-700">Open</span>
      )}
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────

function GroupCard({
  group, userId, champions, canJoin, joiningSlot, onJoinSlot,
}: {
  group:       LobbyGroup;
  userId:      string;
  champions:   Champion[];
  canJoin:     boolean;
  joiningSlot: SlotKey | null;
  onJoinSlot:  (slotKey: SlotKey, champId: string) => void;
}) {
  const bracketLabel = ELO_BRACKETS.find((b) => b.value === group.eloBracket)?.label ?? group.eloBracket;
  const mySlot       = userSlotIn(group, userId);
  const isFull       = groupIsFull(group);
  const [champPick,  setChampPick]  = useState<Partial<Record<SlotKey, string>>>({});
  const [pickingFor, setPickingFor] = useState<SlotKey | null>(null);

  const slotPairs: [SlotKey, SlotKey][] = [["team1_adc", "team2_adc"], ["team1_support", "team2_support"]];

  function handleSlotClick(key: SlotKey) {
    if (!canJoin || mySlot) return;
    setPickingFor(key);
  }

  function confirmJoin(key: SlotKey) {
    const champ = champPick[key];
    if (!champ) return;
    onJoinSlot(key, champ);
    setPickingFor(null);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold-400" />
          <span className="text-sm font-semibold text-white">2v2 Bot Lane</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
            isFull ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-dark-700 text-gray-500 border-dark-600"
          }`}>
            {isFull ? "Full" : `${ALL_SLOTS.filter(k => group[k]).length}/4`}
          </span>
        </div>
        <span className="text-xs text-gray-500">{bracketLabel}</span>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5 text-center">
          <p className="text-[9px] text-gray-600 uppercase tracking-wide font-semibold">Team 1</p>
          <p className="text-[9px] text-gray-600 uppercase tracking-wide font-semibold">Team 2</p>
        </div>
        {slotPairs.map(([left, right]) => (
          <div key={left} className="grid grid-cols-2 gap-1.5">
            {([left, right] as SlotKey[]).map((key) => (
              <SlotCell
                key={key}
                slot={group[key]}
                role={SLOT_ROLE[key]}
                isMe={group[key]?.userId === userId}
                canJoin={canJoin && !mySlot && !group[key]}
                joining={joiningSlot === key}
                onJoin={() => handleSlotClick(key)}
              />
            ))}
          </div>
        ))}
      </div>

      {pickingFor && (
        <div className="border border-dark-600 rounded-xl bg-dark-700/60 p-3 space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            Pick your champion for{" "}
            <span className="text-white">{SLOT_ROLE[pickingFor] === "adc" ? "ADC" : "Support"}</span>
          </p>
          <ChampionSelector
            label=""
            value={champPick[pickingFor] ?? ""}
            onChange={(v) => setChampPick((p) => ({ ...p, [pickingFor]: v }))}
            champions={champions}
          />
          <div className="flex gap-2">
            <button
              onClick={() => confirmJoin(pickingFor)}
              disabled={!champPick[pickingFor] || joiningSlot === pickingFor}
              className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
            >
              {joiningSlot === pickingFor
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Joining…</>
                : <><UserPlus className="w-3 h-3" /> Join Slot</>}
            </button>
            <button onClick={() => setPickingFor(null)} className="btn-secondary px-3 py-2 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── My group status panel ─────────────────────────────────────────────────────

function MyGroupPanel({
  group, userId, onLeave, leaving,
}: { group: LobbyGroup; userId: string; onLeave: () => void; leaving: boolean }) {
  const filled       = ALL_SLOTS.filter((k) => group[k]).length;
  const mySlot       = userSlotIn(group, userId);
  const imHost       = mySlot ? group[mySlot]?.isHost : false;
  const bracketLabel = ELO_BRACKETS.find((b) => b.value === group.eloBracket)?.label ?? group.eloBracket;

  return (
    <div className="card space-y-3 ring-1 ring-gold-400/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-shrink-0">
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 z-10">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <Swords className="w-8 h-8 text-gold-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">
              Your 2v2 Group
              {imHost && <Crown className="inline w-3 h-3 text-gold-400 ml-1" />}
            </p>
            <p className="text-xs text-gray-400">{bracketLabel} · {filled}/4 players</p>
          </div>
        </div>
        <button onClick={onLeave} disabled={leaving}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 rounded-lg px-3 py-2 transition-colors">
          {leaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          {imHost ? "Disband" : "Leave"}
        </button>
      </div>
      {filled < 4 && (
        <p className="text-xs text-gray-500">
          Waiting for {4 - filled} more player{4 - filled !== 1 ? "s" : ""} to join…
        </p>
      )}
    </div>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "border-gold-400 bg-gold-400/10 text-gold-400"
          : "border-dark-600 text-gray-500 hover:border-gray-500 hover:text-gray-400"
      }`}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MAX_VS = 5;

export default function LobbyBrowser({ riotId, userId }: Props) {
  const searchParams = useSearchParams();
  const urlMy = searchParams.get("my") ?? "";
  const urlVs = searchParams.get("vs") ?? "";

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [champions,      setChampions]      = useState<Champion[]>([]);
  const [mode,           setMode]           = useState<LobbyMode>("1v1");

  // ── 1v1 state ────────────────────────────────────────────────────────────────
  const [myChampion,     setMyChampion]     = useState(urlMy);
  const [vsChampions,    setVsChampions]    = useState<string[]>(urlVs ? [urlVs] : []);
  const [addingVs,       setAddingVs]       = useState(false);
  const [eloBracket,     setEloBracket]     = useState<EloBracket>("mid");
  const [available,      setAvailable]      = useState(false);
  const [going,          setGoing]          = useState(false);
  const [availErr,       setAvailErr]       = useState("");

  const [outgoing,       setOutgoing]       = useState<OutgoingChallenge | null>(null);
  const [incoming,       setIncoming]       = useState<IncomingChallenge | null>(null);
  const [matchResult,    setMatchResult]    = useState<MatchResult | null>(null);
  const [challengeErr,   setChallengeErr]   = useState("");
  const [challenging,    setChallenging]    = useState<string | null>(null);

  // ── 2v2 state ────────────────────────────────────────────────────────────────
  const [myGroup,        setMyGroup]        = useState<LobbyGroup | null>(null);
  const [groups,         setGroups]         = useState<LobbyGroup[]>([]);
  const [groupSlot,      setGroupSlot]      = useState<SlotKey>("team1_adc");
  const [groupChamp,     setGroupChamp]     = useState("");
  const [groupElo,       setGroupElo]       = useState<EloBracket>("mid");
  const [groupCreating,  setGroupCreating]  = useState(false);
  const [groupErr,       setGroupErr]       = useState("");
  const [leavingGroup,   setLeavingGroup]   = useState(false);
  const [joiningSlot,    setJoiningSlot]    = useState<SlotKey | null>(null);
  const [groupReady,     setGroupReady]     = useState<GroupReadyResult | null>(null);

  // ── Lobby player list ─────────────────────────────────────────────────────────
  const [players,        setPlayers]        = useState<LobbyPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [filterElo,    setFilterElo]    = useState<string>("all");
  const [filterType,   setFilterType]   = useState<"all" | "melee" | "ranged">("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");

  const sseRef          = useRef<EventSource | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingCountdown = useCountdown(outgoing?.expiresAt ?? null);
  const incomingCountdown = useCountdown(incoming?.expiresAt ?? null);

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

  // ── Persist 1v1 form to localStorage (URL params take priority on first load) ─
  useEffect(() => {
    try {
      const saved = localStorage.getItem("duelr:lobby:form");
      if (saved) {
        const { myChampion: c, eloBracket: e, vsChampions: v } = JSON.parse(saved);
        if (!urlMy && c) setMyChampion(c);
        if (e) setEloBracket(e as EloBracket);
        if (!urlVs && Array.isArray(v)) setVsChampions(v);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!myChampion) return;
    try {
      localStorage.setItem("duelr:lobby:form", JSON.stringify({ myChampion, eloBracket, vsChampions }));
    } catch {}
  }, [myChampion, eloBracket, vsChampions]);

  // ── Fetch players + groups ────────────────────────────────────────────────────
  const fetchPlayers = useCallback((restore = false) => {
    setLoadingPlayers(true);
    fetch("/api/lobby/players")
      .then((r) => r.json())
      .then((d) => {
        const allPlayers: LobbyPlayer[] = d.players ?? [];
        const allGroups:  LobbyGroup[]  = d.groups  ?? [];
        const serverMyGroup: LobbyGroup | null = d.myGroup ?? null;

        setPlayers(allPlayers);
        setGroups(allGroups);

        if (restore) {
          const me1v1 = allPlayers.find((p) => p.userId === userId);
          if (me1v1) {
            setMyChampion(me1v1.myChampion);
            setEloBracket(me1v1.eloBracket as EloBracket);
            if (me1v1.vsChampions) setVsChampions(me1v1.vsChampions);
            setAvailable(true);
            setMode("1v1");

            fetch("/api/lobby/status")
              .then((r) => r.json())
              .then((s) => {
                if (!s.expiresAt) return;
                const msLeft = s.expiresAt - Date.now();
                if (msLeft <= 0) return;
                if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
                sessionTimerRef.current = setTimeout(() => {
                  sessionTimerRef.current = null;
                  if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("Duelr — Lobby Session Expired", {
                      body: "Your lobby session expired after 1 hour.",
                      icon: "/favicon.ico",
                    });
                  }
                  setAvailable(false);
                  fetchPlayers();
                }, msLeft);
              })
              .catch(() => {});
          }

          if (serverMyGroup) {
            setMyGroup(serverMyGroup);
            setMode("2v2");
          }
        } else {
          if (serverMyGroup) {
            setMyGroup(serverMyGroup);
          } else if (myGroup) {
            setMyGroup(null);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPlayers(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    fetchPlayers(true);
    const id = setInterval(() => fetchPlayers(), 10_000);
    return () => clearInterval(id);
  }, [fetchPlayers]);

  // Check for pending 1v1 match result
  useEffect(() => {
    fetch("/api/lobby/pending-match")
      .then((r) => r.json())
      .then((d) => { if (d.match) setMatchResult(d.match); })
      .catch(() => {});
  }, []);

  // ── SSE for real-time events ──────────────────────────────────────────────────
  useEffect(() => {
    const sse = new EventSource("/api/notifications/stream");
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "challenge") {
          playQueuePop();
          if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
          }
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
            new Notification("Duelr — Challenge Received!", {
              body: `${data.challengerRiotId} wants to 1v1 you as ${data.challengerChampName}!`,
              icon: "/favicon.ico",
            });
          }
          setIncoming({
            challengeId:          data.challengeId,
            challengerRiotId:     data.challengerRiotId,
            challengerChampName:  data.challengerChampName,
            challengerChampImage: data.challengerChampImage,
            challengerElo:        data.challengerElo,
            expiresAt:            Date.now() + 44_000,
          });
        } else if (data.type === "challenge_accepted") {
          playQueuePop();
          setMatchResult(data.opponent as MatchResult);
          setOutgoing(null);
          setAvailable(false);
          fetch("/api/lobby/pending-match").catch(() => {});
        } else if (data.type === "challenge_declined") {
          setOutgoing(null);
        } else if (data.type === "group_updated") {
          const updated = data.group as LobbyGroup;
          setMyGroup((prev) => prev?.groupId === updated.groupId ? updated : prev);
          setGroups((prev) => prev.map((g) => g.groupId === updated.groupId ? updated : g));
        } else if (data.type === "group_ready") {
          playQueuePop();
          setGroupReady({ team1: data.team1, team2: data.team2, voiceChannelUrl: data.voiceChannelUrl });
          setMyGroup(null);
        } else if (data.type === "group_disbanded") {
          setMyGroup(null);
        } else if (data.type === "session_expired") {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Duelr — Lobby Session Expired", {
              body: "Your lobby session expired after 1 hour.",
              icon: "/favicon.ico",
            });
          }
          if (sessionTimerRef.current) {
            clearTimeout(sessionTimerRef.current);
            sessionTimerRef.current = null;
          }
          setAvailable(false);
        }
      } catch {}
    };

    return () => {
      sse.close();
      sseRef.current = null;
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, []);

  // ── 1v1 actions ───────────────────────────────────────────────────────────────

  async function goAvailable() {
    if (!myChampion) { setAvailErr("Select your champion first"); return; }
    setAvailErr(""); setGoing(true);
    const champ = champions.find((c) => c.id === myChampion);
    if (!champ) { setGoing(false); return; }

    const res = await fetch("/api/lobby/available", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        myChampion, champName: champ.name, champImage: champ.imageUrl,
        eloBracket, acceptsType: "any", vsChampions,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setGoing(false);

    if (res.ok) {
      setAvailable(true);
      fetchPlayers();
      const msLeft = (data.expiresAt ?? 0) - Date.now();
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (msLeft > 0) {
        sessionTimerRef.current = setTimeout(() => {
          sessionTimerRef.current = null;
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Duelr — Lobby Session Expired", {
              body: "Your lobby session expired after 1 hour.",
              icon: "/favicon.ico",
            });
          }
          setAvailable(false);
          fetchPlayers();
        }, msLeft);
      }
    }
  }

  async function goOffline() {
    if (sessionTimerRef.current) { clearTimeout(sessionTimerRef.current); sessionTimerRef.current = null; }
    await fetch("/api/lobby/leave", { method: "POST" });
    setAvailable(false);
    fetchPlayers();
  }

  async function sendChallenge(player: LobbyPlayer) {
    setChallengeErr(""); setChallenging(player.userId);
    const res  = await fetch("/api/lobby/challenge", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ targetUserId: player.userId }),
    });
    const data = await res.json();
    setChallenging(null);
    if (!res.ok) { setChallengeErr(data.error ?? "Failed to send challenge"); return; }
    setOutgoing({ challengeId: data.challengeId, targetRiotId: player.riotId, targetChampName: player.champName, expiresAt: Date.now() + 45_000 });
  }

  async function respondToChallenge(accept: boolean) {
    if (!incoming) return;
    const res  = await fetch("/api/lobby/respond", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ challengeId: incoming.challengeId, accept }),
    });
    const data = await res.json();
    setIncoming(null);
    if (accept && data.challenger) {
      playQueuePop();
      setMatchResult(data.challenger as MatchResult);
      setAvailable(false);
    }
  }

  // ── 2v2 actions ───────────────────────────────────────────────────────────────

  async function createGroup() {
    const champ = champions.find((c) => c.id === groupChamp);
    if (!champ) { setGroupErr("Select a champion first"); return; }
    setGroupErr(""); setGroupCreating(true);

    const res = await fetch("/api/lobby/group/create", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        slotKey:    groupSlot,
        champId:    champ.id,
        champName:  champ.name,
        champImage: champ.imageUrl,
        eloBracket: groupElo,
      }),
    });
    const data = await res.json();
    setGroupCreating(false);
    if (!res.ok) { setGroupErr(data.error ?? "Failed to create group"); return; }
    setMyGroup(data.group);
    fetchPlayers();
  }

  async function leaveGroup() {
    setLeavingGroup(true);
    await fetch("/api/lobby/group/leave", { method: "POST" });
    setMyGroup(null);
    setLeavingGroup(false);
    fetchPlayers();
  }

  async function joinGroupSlot(groupId: string, slotKey: SlotKey, champId: string) {
    const champ = champions.find((c) => c.id === champId);
    if (!champ) return;
    setJoiningSlot(slotKey);

    const res  = await fetch("/api/lobby/group/join", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ groupId, slotKey, champId: champ.id, champName: champ.name, champImage: champ.imageUrl }),
    });
    const data = await res.json();
    setJoiningSlot(null);
    if (!res.ok) return;
    if (data.isFull) {
      playQueuePop();
      setGroupReady({
        team1: data.group.team1_adc && data.group.team1_support ? [data.group.team1_adc, data.group.team1_support] : [],
        team2: data.group.team2_adc && data.group.team2_support ? [data.group.team2_adc, data.group.team2_support] : [],
        voiceChannelUrl: data.voiceChannelUrl,
      });
      setMyGroup(null);
    } else {
      setMyGroup(data.group);
    }
    fetchPlayers();
  }

  // ── vsChampion helpers ────────────────────────────────────────────────────────

  function addVsChampion(id: string) {
    if (!id) return;
    setVsChampions((prev) => prev.includes(id) ? prev : [...prev, id]);
    setAddingVs(false);
  }

  function removeVsChampion(id: string) {
    setVsChampions((prev) => prev.filter((v) => v !== id));
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const myChampData    = champions.find((c) => c.id === myChampion);
  const myBracketLabel = ELO_BRACKETS.find((b) => b.value === eloBracket)?.label ?? eloBracket;
  const otherPlayers   = players.filter((p) => p.userId !== userId);

  const availableRegions = useMemo(
    () => [...new Set(otherPlayers.map((p) => p.region))].sort(),
    [otherPlayers]
  );

  const filteredPlayers = useMemo(() => {
    return otherPlayers.filter((player) => {
      if (filterRegion !== "all" && player.region !== filterRegion) return false;
      if (filterElo    !== "all" && player.eloBracket !== filterElo) return false;
      if (filterType   !== "all") {
        const c = champions.find((ch) => ch.id === player.myChampion);
        if (c) {
          if (filterType === "ranged" && !c.isRanged) return false;
          if (filterType === "melee"  &&  c.isRanged) return false;
        }
      }
      return true;
    });
  }, [otherPlayers, filterRegion, filterElo, filterType, champions]);

  const filtersActive = filterRegion !== "all" || filterElo !== "all" || filterType !== "all";
  function clearFilters() { setFilterRegion("all"); setFilterElo("all"); setFilterType("all"); }

  const isBusy = available || !!myGroup || !!outgoing;

  // ── vsChampion display label ──────────────────────────────────────────────────
  const vsLabel = vsChampions.length > 0
    ? vsChampions.map((v) => champions.find((c) => c.id === v)?.name ?? v).join(", ")
    : "Any opponent";

  // ── 2v2 group ready screen ────────────────────────────────────────────────────
  if (groupReady) {
    return (
      <div className="card max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h2 className="text-xl font-bold">Group Ready!</h2>
        </div>
        <p className="text-sm text-gray-400 text-center">All 4 players are in. Create a custom game!</p>
        {([["Team 1", groupReady.team1], ["Team 2", groupReady.team2]] as [string, GroupSlot[]][]).map(([label, team]) => (
          <div key={label} className="bg-dark-700 border border-dark-600 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
            {team.map((s) => (
              <div key={s.userId} className="flex items-center gap-3">
                <Image src={s.champImage} alt={s.champName} width={32} height={32} className="rounded-full ring-1 ring-dark-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{s.riotId}</p>
                    <CopyButton text={s.riotId} />
                  </div>
                  <p className="text-xs text-gray-400">{s.champName} · {s.role.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
        {groupReady.voiceChannelUrl && (
          <a href={groupReady.voiceChannelUrl} target="_blank" rel="noopener noreferrer"
            className="btn-primary w-full flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.132 18.111a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Join Voice Channel
          </a>
        )}
        <button onClick={() => { setGroupReady(null); fetchPlayers(); }} className="btn-secondary w-full">
          Back to Lobby
        </button>
      </div>
    );
  }

  // ── 1v1 match confirmed ───────────────────────────────────────────────────────
  if (matchResult) {
    return (
      <div className="card max-w-lg mx-auto space-y-6 text-center">
        <div className="flex items-center justify-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
          <h2 className="text-xl font-bold">Challenge Accepted!</h2>
        </div>
        {matchResult.champImage && (
          <Image src={matchResult.champImage} alt={matchResult.champName} width={64} height={64}
            className="rounded-full ring-2 ring-gold-400 mx-auto" />
        )}
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-left space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Your opponent</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-gold-400">{matchResult.riotId}</p>
            <CopyButton text={matchResult.riotId} />
          </div>
          <p className="text-sm text-gray-400">{matchResult.champName}</p>
        </div>
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 text-sm text-gray-400 text-left space-y-2">
          <p className="font-semibold text-white">How to start:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Add <span className="text-gold-400 font-medium">{matchResult.riotId}</span> in the client</li>
            <li>Create a Custom Game and invite them</li>
            <li>Pick your champions and play!</li>
          </ol>
        </div>
        {matchResult.voiceChannelUrl && (
          <a href={matchResult.voiceChannelUrl} target="_blank" rel="noopener noreferrer"
            className="btn-primary w-full flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.132 18.111a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Join Voice Channel
          </a>
        )}
        <button onClick={() => { setMatchResult(null); fetchPlayers(); }} className="btn-secondary w-full">
          Back to Lobby
        </button>
      </div>
    );
  }

  // ── Incoming challenge ────────────────────────────────────────────────────────
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
              <Image src={incoming.challengerChampImage} alt={incoming.challengerChampName}
                width={64} height={64} className="rounded-full ring-2 ring-gold-400" />
              <span className="text-sm font-medium">{incoming.challengerChampName}</span>
              <span className="text-xs text-gray-500 uppercase">{incoming.challengerElo} elo</span>
            </div>
          )}
          <Swords className="w-8 h-8 text-gray-600" />
          {myChampData ? (
            <div className="flex flex-col items-center gap-2">
              <Image src={myChampData.imageUrl} alt={myChampData.name} width={64} height={64}
                className="rounded-full ring-2 ring-gray-600" />
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
          <button onClick={() => respondToChallenge(true)} className="btn-primary flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Accept
          </button>
          <button onClick={() => respondToChallenge(false)} className="btn-secondary flex items-center justify-center gap-2">
            <XCircle className="w-4 h-4" /> Decline
          </button>
        </div>
      </div>
    );
  }

  // ── Main lobby view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Mode toggle ──────────────────────────────────────────────────────── */}
      {!available && !myGroup && (
        <div className="flex rounded-xl overflow-hidden border border-dark-600 w-fit">
          {(["1v1", "2v2"] as LobbyMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${
                mode === m
                  ? "bg-gold-400/10 text-gold-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}>
              {m === "1v1" ? "1v1 · Solo" : "2v2 · Bot Lane"}
            </button>
          ))}
        </div>
      )}

      {/* ── My status card ───────────────────────────────────────────────────── */}
      <div className="card space-y-5">

        {/* 2v2: in a group */}
        {myGroup && (
          <MyGroupPanel group={myGroup} userId={userId} onLeave={leaveGroup} leaving={leavingGroup} />
        )}

        {/* 2v2: create group form */}
        {!myGroup && mode === "2v2" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-white">Create a 2v2 Group</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Pick your role and champion. Three slots will be open for others to join.
              </p>
            </div>

            <div>
              <span className="label">My slot</span>
              <div className="grid grid-cols-2 gap-2">
                {(["team1_adc", "team1_support", "team2_adc", "team2_support"] as SlotKey[]).map((k) => {
                  const role  = SLOT_ROLE[k];
                  const team  = k.startsWith("team1") ? "Team 1" : "Team 2";
                  const label = `${team} · ${role === "adc" ? "ADC" : "Support"}`;
                  return (
                    <button key={k} type="button" onClick={() => setGroupSlot(k)}
                      className={`rounded-lg border p-2.5 text-left text-sm transition-all ${
                        groupSlot === k
                          ? "border-gold-400 bg-gold-400/10 text-gold-400"
                          : "border-dark-600 text-gray-400 hover:border-gray-500"
                      }`}>
                      <span className="font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <ChampionSelector label="My champion" value={groupChamp} onChange={setGroupChamp} champions={champions} />

            <div>
              <span className="label">Elo bracket</span>
              <div className="grid grid-cols-3 gap-2">
                {ELO_BRACKETS.map((b) => (
                  <button key={b.value} type="button" onClick={() => setGroupElo(b.value as EloBracket)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      groupElo === b.value
                        ? "border-gold-400 bg-gold-400/10 text-gold-400"
                        : "border-dark-600 text-gray-300 hover:border-gray-500"
                    }`}>
                    <div className="font-semibold text-sm">{b.label}</div>
                    <div className="text-xs opacity-60">{b.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {groupErr && <p className="text-sm text-red-400">{groupErr}</p>}

            <button onClick={createGroup} disabled={!groupChamp || groupCreating}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {groupCreating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : <><Shield className="w-4 h-4" /> Create Group</>}
            </button>
          </>
        )}

        {/* 1v1: not yet available */}
        {!available && mode === "1v1" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-white">Go Available</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                You&apos;ll appear in the list and anyone can send you a direct challenge.
              </p>
            </div>

            <ChampionSelector label="I'm playing" value={myChampion} onChange={setMyChampion} champions={champions} />

            {/* I'll play against — champion multi-select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="label mb-0">I&apos;ll play against</span>
                {vsChampions.length > 0 && (
                  <span className="text-xs text-gray-600">{vsChampions.length}/{MAX_VS}</span>
                )}
              </div>

              {vsChampions.length === 0 && !addingVs ? (
                <ChampionSelector label="" value="" onChange={addVsChampion} champions={champions} />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {vsChampions.map((id) => (
                      <VsChip key={id} vsId={id} champions={champions} onRemove={() => removeVsChampion(id)} />
                    ))}
                  </div>
                  {vsChampions.length < MAX_VS && (
                    addingVs ? (
                      <ChampionSelector label="" value="" onChange={addVsChampion} champions={champions} />
                    ) : (
                      <button type="button" onClick={() => setAddingVs(true)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
                        <Plus className="w-3.5 h-3.5" /> Add another champion
                      </button>
                    )
                  )}
                </div>
              )}

              {vsChampions.length === 0 && (
                <p className="text-xs text-gray-600 mt-1.5">Leave empty to accept any opponent</p>
              )}
            </div>

            <div>
              <span className="label">My elo bracket</span>
              <div className="grid grid-cols-3 gap-2">
                {ELO_BRACKETS.map((b) => (
                  <button key={b.value} type="button" onClick={() => setEloBracket(b.value as EloBracket)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      eloBracket === b.value
                        ? "border-gold-400 bg-gold-400/10 text-gold-400"
                        : "border-dark-600 text-gray-300 hover:border-gray-500"
                    }`}>
                    <div className="font-semibold text-sm">{b.label}</div>
                    <div className="text-xs opacity-60">{b.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {availErr && <p className="text-sm text-red-400">{availErr}</p>}

            <button onClick={goAvailable} disabled={!myChampion || going}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {going
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Going available…</>
                : <><Radio className="w-4 h-4" /> Go Available</>}
            </button>
          </>
        )}

        {/* 1v1: available status */}
        {available && mode === "1v1" && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 z-10">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                  {myChampData ? (
                    <Image src={myChampData.imageUrl} alt={myChampData.name} width={40} height={40} className="rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-dark-600" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">You&apos;re available</p>
                  <p className="text-xs text-gray-400">
                    {myChampData?.name} · {myBracketLabel} · {vsLabel}
                  </p>
                </div>
              </div>
              <button onClick={goOffline} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                Go Offline
              </button>
            </div>

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
                  <button onClick={() => setOutgoing(null)} className="text-gray-600 hover:text-red-400 transition-colors ml-1">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {challengeErr && <p className="text-xs text-red-400">{challengeErr}</p>}
          </>
        )}
      </div>

      {/* ── 2v2 Groups ─────────────────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-gold-400" />
            <h3 className="font-semibold text-sm text-white">
              Open 2v2 Groups
              <span className="ml-2 text-xs text-gray-500 font-normal">{groups.length} open</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.groupId}
                group={g}
                userId={userId}
                champions={champions}
                canJoin={!isBusy && !userSlotIn(g, userId)}
                joiningSlot={joiningSlot}
                onJoinSlot={(slotKey, champId) => joinGroupSlot(g.groupId, slotKey, champId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 1v1 Players ────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold-400" />
            <h3 className="font-semibold text-sm text-white">
              Available Players
              {otherPlayers.length > 0 && (
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  {filteredPlayers.length === otherPlayers.length
                    ? `${otherPlayers.length} online`
                    : `${filteredPlayers.length} of ${otherPlayers.length} shown`}
                </span>
              )}
            </h3>
          </div>
          <button onClick={() => fetchPlayers()}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {loadingPlayers
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>

        {/* Filter bar */}
        {otherPlayers.length > 0 && (
          <div className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                <Filter className="w-3.5 h-3.5" />Filters
              </div>
              {filtersActive && (
                <button type="button" onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors">
                  <X className="w-3 h-3" />Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600 w-14 flex-shrink-0">Skill</span>
              <div className="flex flex-wrap gap-1.5">
                <FilterPill label="Any" active={filterElo === "all"} onClick={() => setFilterElo("all")} />
                {BRACKET_ORDER.map((val) => (
                  <FilterPill key={val} label={ELO_BRACKETS.find((b) => b.value === val)?.label ?? val}
                    active={filterElo === val} onClick={() => setFilterElo(val)} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600 w-14 flex-shrink-0">Type</span>
              <div className="flex gap-1.5">
                <FilterPill label="Any"    active={filterType === "all"}    onClick={() => setFilterType("all")}    />
                <FilterPill label="Melee"  active={filterType === "melee"}  onClick={() => setFilterType("melee")}  />
                <FilterPill label="Ranged" active={filterType === "ranged"} onClick={() => setFilterType("ranged")} />
              </div>
            </div>
            {availableRegions.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 w-14 flex-shrink-0">Region</span>
                <div className="flex flex-wrap gap-1.5">
                  <FilterPill label="Any" active={filterRegion === "all"} onClick={() => setFilterRegion("all")} />
                  {availableRegions.map((r) => (
                    <FilterPill key={r} label={r.toUpperCase()} active={filterRegion === r} onClick={() => setFilterRegion(r)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {otherPlayers.length === 0 ? (
          <div className="card text-center py-12 space-y-2">
            <Users className="w-8 h-8 mx-auto text-gray-700" />
            <p className="text-sm text-gray-600">No players available right now.</p>
            <p className="text-xs text-gray-700">Go available above to be the first!</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="card text-center py-10 space-y-2">
            <Filter className="w-7 h-7 mx-auto text-gray-700" />
            <p className="text-sm text-gray-600">No players match your filters.</p>
            <button type="button" onClick={clearFilters} className="text-xs text-gold-400 hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPlayers.map((player) => (
              <PlayerCard
                key={player.userId}
                player={player}
                champions={champions}
                onChallenge={() => sendChallenge(player)}
                disabled={!available || !!outgoing || challenging === player.userId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
