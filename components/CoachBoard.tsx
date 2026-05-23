"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Shield, Star, Clock, Loader2, CheckCircle2, X,
} from "lucide-react";
import { AVAILABILITY_SLOTS } from "@/lib/partner-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChampEntry { id: string; imageUrl: string }

interface CoachData {
  id:           string;
  riotId:       string;
  verifiedTier: string;
  hourlyRate:   number;
  bio:          string | null;
  availability: string[];
  champions:    ChampEntry[];
  specialties:  ChampEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  MASTER:      "bg-purple-900/50 text-purple-300 border-purple-700/40",
  GRANDMASTER: "bg-red-900/50    text-red-300    border-red-700/40",
  CHALLENGER:  "bg-gold-400/10   text-gold-400   border-gold-400/25",
};

const DURATION_OPTIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "90 min" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(0)}/hr`;
}

function sessionPrice(hourlyRate: number, minutes: number) {
  const total = Math.round((hourlyRate * minutes) / 60);
  return `$${(total / 100).toFixed(2)}`;
}

// ── Champion strip ────────────────────────────────────────────────────────────

function ChampStrip({ champs, max = 8 }: { champs: ChampEntry[]; max?: number }) {
  const shown    = champs.slice(0, max);
  const overflow = champs.length - max;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((c) => (
        <Image key={c.id} src={c.imageUrl} alt={c.id} width={24} height={24}
          className="rounded-md ring-1 ring-dark-600" />
      ))}
      {overflow > 0 && <span className="text-[10px] text-gray-500">+{overflow}</span>}
    </div>
  );
}

// ── Coach card ────────────────────────────────────────────────────────────────

function CoachCard({ coach, onBook }: { coach: CoachData; onBook: () => void }) {
  const badge = TIER_BADGE[coach.verifiedTier] ?? "bg-dark-700 text-gray-400 border-dark-600";
  const avail = AVAILABILITY_SLOTS.filter((s) => coach.availability.includes(s.id));

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gold-400 flex-shrink-0" />
            <span className="font-bold text-white text-base">{coach.riotId}</span>
          </div>
          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}>
            {coach.verifiedTier.charAt(0) + coach.verifiedTier.slice(1).toLowerCase()} · Verified
          </span>
        </div>
        <div className="text-right">
          <p className="font-bold text-gold-400 text-lg">{centsToDisplay(coach.hourlyRate)}</p>
        </div>
      </div>

      {/* Champions */}
      {coach.champions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Plays</p>
          <ChampStrip champs={coach.champions} />
        </div>
      )}
      {coach.specialties.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Coaches</p>
          <ChampStrip champs={coach.specialties} />
        </div>
      )}

      {/* Availability */}
      {avail.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {avail.map((s) => (
            <span key={s.id}
              className="text-[10px] bg-dark-700 border border-dark-600 text-gray-400 rounded-full px-2 py-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      {coach.bio && (
        <p className="text-xs text-gray-400 italic border-t border-dark-600 pt-2 leading-relaxed">
          &ldquo;{coach.bio}&rdquo;
        </p>
      )}

      <button
        onClick={onBook}
        className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
      >
        <Star className="w-3.5 h-3.5" /> Book a Session
      </button>
    </div>
  );
}

// ── Book modal ────────────────────────────────────────────────────────────────

function BookModal({ coach, onClose }: { coach: CoachData; onClose: () => void }) {
  const [duration, setDuration] = useState(60);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState("");

  async function book() {
    setLoading(true); setErr("");
    const res  = await fetch("/api/coaching/book", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ coachProfileId: coach.id, durationMinutes: duration }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Failed"); setLoading(false); return; }
    window.location.href = data.url;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card max-w-sm w-full space-y-5 border border-gold-400/20">
        <button onClick={onClose}
          className="absolute top-3 right-3 text-gray-600 hover:text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div>
          <h2 className="font-bold text-white text-lg">Book {coach.riotId}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {coach.verifiedTier.charAt(0) + coach.verifiedTier.slice(1).toLowerCase()} · {centsToDisplay(coach.hourlyRate)}
          </p>
        </div>

        {/* Duration picker */}
        <div>
          <p className="text-sm font-medium text-gray-400 mb-2">Session length</p>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => setDuration(opt.minutes)}
                className={`rounded-lg border p-3 text-center transition-all ${
                  duration === opt.minutes
                    ? "border-gold-400 bg-gold-400/10 text-gold-400"
                    : "border-dark-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                <div className="font-semibold text-sm">{opt.label}</div>
                <div className="text-xs opacity-70">{sessionPrice(coach.hourlyRate, opt.minutes)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-3 text-sm space-y-1.5">
          <div className="flex justify-between text-gray-400">
            <span>Session ({duration} min)</span>
            <span>{sessionPrice(coach.hourlyRate, duration)}</span>
          </div>
          <div className="flex justify-between text-gray-600 text-xs">
            <span>Platform fee (20%)</span>
            <span>included</span>
          </div>
          <div className="border-t border-dark-600 pt-1.5 flex justify-between font-semibold text-white">
            <span>Total</span>
            <span>{sessionPrice(coach.hourlyRate, duration)}</span>
          </div>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <button
          onClick={book}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? "Redirecting to checkout…" : `Pay ${sessionPrice(coach.hourlyRate, duration)}`}
        </button>
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

interface Props {
  userId:   string | null;
  bookedId: boolean;
}

export default function CoachBoard({ userId, bookedId }: Props) {
  const [coaches,    setCoaches]    = useState<CoachData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [bookTarget, setBookTarget] = useState<CoachData | null>(null);

  const load = useCallback(() => {
    fetch("/api/coaching/coaches")
      .then((r) => r.json())
      .then((d) => setCoaches(d.coaches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {bookedId && (
        <div className="card border border-emerald-500/20 bg-emerald-500/5 space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            Session booked!
          </div>
          <p className="text-sm text-gray-300">
            Payment confirmed. Add your coach as a friend in the League client to arrange your session.
          </p>
        </div>
      )}

      {!userId && (
        <p className="text-center text-sm text-gray-500 py-2">
          <a href="/" className="text-gold-400 hover:underline font-medium">Connect your account</a>
          {" "}to book a session.
        </p>
      )}

      {/* Coach grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading coaches…
        </div>
      ) : coaches.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Shield className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-500">No coaches available yet — check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              onBook={() => userId ? setBookTarget(coach) : (window.location.href = "/")}
            />
          ))}
        </div>
      )}

      {bookTarget && <BookModal coach={bookTarget} onClose={() => setBookTarget(null)} />}
    </div>
  );
}
