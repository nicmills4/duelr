"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Shield, Star, Clock, Loader2, CheckCircle2,
  Pencil, Trash2, Plus, X, ChevronDown,
} from "lucide-react";
import { AVAILABILITY_SLOTS } from "@/lib/partner-types";
import type { Champion } from "@/app/api/champions/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  MASTER:       "bg-purple-900/50 text-purple-300 border-purple-700/40",
  GRANDMASTER:  "bg-red-900/50    text-red-300    border-red-700/40",
  CHALLENGER:   "bg-gold-400/10   text-gold-400   border-gold-400/25",
};

const DURATION_OPTIONS = [
  { minutes: 30,  label: "30 min" },
  { minutes: 60,  label: "1 hour" },
  { minutes: 90,  label: "90 min" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(0)}/hr`;
}

function sessionPrice(hourlyRate: number, minutes: number): string {
  const total = Math.round((hourlyRate * minutes) / 60);
  return `$${(total / 100).toFixed(2)}`;
}

interface ChampEntry { id: string; imageUrl: string }

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

interface CoachData {
  id: string;
  displayCode: string;
  verifiedTier: string;
  hourlyRate: number;
  bio: string | null;
  availability: string[];
  champions: ChampEntry[];
  specialties: ChampEntry[];
  isOwn: boolean;
}

function CoachCard({
  coach,
  onBook,
  onEdit,
  onDelete,
  isOwn,
}: {
  coach: CoachData;
  onBook: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isOwn: boolean;
}) {
  const badge = TIER_BADGE[coach.verifiedTier] ?? "bg-dark-700 text-gray-400 border-dark-600";
  const avail = AVAILABILITY_SLOTS.filter((s) => coach.availability.includes(s.id));

  return (
    <div className={`card space-y-3 ${isOwn ? "ring-1 ring-gold-400/30" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gold-400 flex-shrink-0" />
            <span className="font-bold text-white text-base">Coach {coach.displayCode}</span>
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

      {/* Actions */}
      {isOwn ? (
        <div className="flex gap-2 pt-1">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs btn-secondary">
            <Pencil className="w-3 h-3" /> Edit Profile
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-400/40 bg-red-500/5 hover:bg-red-500/10 rounded-lg px-3 py-2 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={onBook}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Star className="w-3.5 h-3.5" /> Book a Session
        </button>
      )}
    </div>
  );
}

// ── Book modal ────────────────────────────────────────────────────────────────

function BookModal({ coach, onClose }: { coach: CoachData; onClose: () => void }) {
  const [duration,  setDuration]  = useState(60);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");

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
          <h2 className="font-bold text-white text-lg">Book Coach {coach.displayCode}</h2>
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

        <div className="bg-gold-400/5 border border-gold-400/15 rounded-lg px-3 py-2 text-xs text-gold-400/80 flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Coach&apos;s Riot ID is revealed after payment so you can add them in-client.
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

// ── Coach profile form ────────────────────────────────────────────────────────

interface FormState {
  champions:    string[];
  specialties:  string[];
  hourlyRate:   string;
  bio:          string;
  availability: string[];
}

function CoachForm({
  champions: allChampions,
  initial,
  onSave,
  onCancel,
}: {
  champions: Champion[];
  initial?: FormState;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form,    setForm]    = useState<FormState>(initial ?? {
    champions: [], specialties: [], hourlyRate: "", bio: "", availability: [],
  });
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  const [champQ,  setChampQ]  = useState("");
  const [specQ,   setSpecQ]   = useState("");

  function toggleAvail(id: string) {
    setForm((f) => ({
      ...f,
      availability: f.availability.includes(id)
        ? f.availability.filter((a) => a !== id)
        : [...f.availability, id],
    }));
  }

  function ChampPicker({
    field,
    query,
    setQuery,
  }: { field: "champions" | "specialties"; query: string; setQuery: (q: string) => void }) {
    const excluded = [...form.champions, ...form.specialties];
    const filtered = allChampions.filter(
      (c) => !excluded.includes(c.id) && c.name.toLowerCase().includes(query.toLowerCase())
    );
    return (
      <div className="relative">
        <input className="input w-full text-sm" placeholder="Search champion…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && filtered.length > 0 && (
          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-40 overflow-y-auto">
            {filtered.slice(0, 15).map((c) => (
              <button key={c.id} type="button"
                onMouseDown={() => {
                  setForm((f) => ({ ...f, [field]: [...f[field], c.id] }));
                  setQuery("");
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-dark-700 hover:text-white transition-colors">
                <Image src={c.imageUrl} alt={c.name} width={22} height={22} className="rounded-sm" />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.champions.length === 0) { setErr("Add at least one champion you play."); return; }
    setSaving(true); setErr("");
    try { await onSave(form); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="card border border-gold-400/20 space-y-5">
      <h3 className="font-bold text-white text-base">Coach Profile</h3>

      {/* Champions I play */}
      <div>
        <label className="label">Champions I play</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.champions.map((id) => {
            const c = allChampions.find((ch) => ch.id === id);
            return (
              <div key={id} className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs">
                {c && <Image src={c.imageUrl} alt={c.name} width={16} height={16} className="rounded-sm" />}
                <span className="text-gray-200">{c?.name ?? id}</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, champions: f.champions.filter((v) => v !== id) }))}
                  className="text-gray-600 hover:text-gray-300 ml-0.5"><X className="w-3 h-3" /></button>
              </div>
            );
          })}
        </div>
        {form.champions.length < 15 && <ChampPicker field="champions" query={champQ} setQuery={setChampQ} />}
      </div>

      {/* Matchups I coach */}
      <div>
        <label className="label">Matchups / champions I coach <span className="text-gray-600 font-normal">(optional)</span></label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.specialties.map((id) => {
            const c = allChampions.find((ch) => ch.id === id);
            return (
              <div key={id} className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs">
                {c && <Image src={c.imageUrl} alt={c.name} width={16} height={16} className="rounded-sm" />}
                <span className="text-gray-200">{c?.name ?? id}</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, specialties: f.specialties.filter((v) => v !== id) }))}
                  className="text-gray-600 hover:text-gray-300 ml-0.5"><X className="w-3 h-3" /></button>
              </div>
            );
          })}
        </div>
        {form.specialties.length < 15 && <ChampPicker field="specialties" query={specQ} setQuery={setSpecQ} />}
      </div>

      {/* Rate */}
      <div>
        <label className="label">Hourly rate (USD)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
          <input
            className="input w-full text-sm pl-7"
            type="number" min="5" max="500" step="1" placeholder="30"
            value={form.hourlyRate}
            onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">/hr</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">You keep 80% after Duelr&apos;s 20% platform fee.</p>
      </div>

      {/* Availability */}
      <div>
        <label className="label">Availability</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_SLOTS.map((s) => {
            const active = form.availability.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleAvail(s.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all ${
                  active
                    ? "border-gold-400 bg-gold-400/10 text-gold-400"
                    : "border-dark-600 text-gray-400 hover:border-gray-500"
                }`}>
                <span className="font-medium">{s.label}</span>
                <span className="opacity-60">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bio */}
      <div>
        <div className="flex justify-between mb-1">
          <label className="label mb-0">Bio <span className="text-gray-600 font-normal">(optional)</span></label>
          <span className="text-xs text-gray-600">{form.bio.length}/500</span>
        </div>
        <textarea className="input w-full resize-none text-sm" rows={3} maxLength={500}
          placeholder="e.g. Challenger Irelia/Fiora main. I specialize in top-lane matchup mechanics and wave management."
          value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
      </div>

      {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Profile"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary px-5">Cancel</button>
      </div>
    </form>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

interface Props {
  userId:   string | null;
  bookedId: string | null;
}

export default function CoachBoard({ userId, bookedId }: Props) {
  const [coaches,     setCoaches]     = useState<CoachData[]>([]);
  const [champions,   setChampions]   = useState<Champion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [formOpen,    setFormOpen]    = useState(false);
  const [bookTarget,  setBookTarget]  = useState<CoachData | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [bookedCoach, setBookedCoach] = useState<{ riotId: string; displayCode: string } | null>(null);

  const myProfile = coaches.find((c) => c.isOwn) ?? null;

  const load = useCallback(() => {
    fetch("/api/coaching/coaches")
      .then((r) => r.json())
      .then((d) => setCoaches(d.coaches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []));
  }, [load]);

  // Show confirmed booking reveal
  useEffect(() => {
    if (!bookedId) return;
    fetch(`/api/coaching/session/${bookedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.coachRiotId) setBookedCoach({ riotId: d.coachRiotId, displayCode: d.displayCode });
      })
      .catch(() => {});
  }, [bookedId]);

  async function handleSave(data: FormState) {
    const res = await fetch("/api/coaching/profile", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        champions:    data.champions,
        specialties:  data.specialties,
        hourlyRate:   Number(data.hourlyRate),
        bio:          data.bio,
        availability: data.availability,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Save failed");
    }
    setFormOpen(false);
    load();
  }

  async function handleDelete() {
    if (!confirm("Remove your coach profile?")) return;
    setDeleting(true);
    await fetch("/api/coaching/profile", { method: "DELETE" });
    setDeleting(false);
    load();
  }

  function profileToForm(p: CoachData): FormState {
    return {
      champions:    p.champions.map((c) => c.id),
      specialties:  p.specialties.map((c) => c.id),
      hourlyRate:   String(p.hourlyRate / 100),
      bio:          p.bio ?? "",
      availability: p.availability,
    };
  }

  const others = coaches.filter((c) => !c.isOwn);

  return (
    <div className="space-y-6">
      {/* Booking confirmed — reveal coach Riot ID */}
      {bookedCoach && (
        <div className="card border border-emerald-500/20 bg-emerald-500/5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            Session booked!
          </div>
          <p className="text-sm text-gray-300">
            Your coach is{" "}
            <span className="text-gold-400 font-bold">{bookedCoach.riotId}</span>.
            Add them as a friend in the League client to arrange your session.
          </p>
          <button
            onClick={() => setBookedCoach(null)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* CTA */}
      {userId && !formOpen && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {myProfile
              ? "Your profile is live. Students can book you."
              : "Masters or above? List yourself as a coach."}
          </p>
          {myProfile ? (
            <div className="flex gap-2">
              <button onClick={() => setFormOpen(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm">
                <Pencil className="w-3.5 h-3.5" /> Edit Profile
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 border border-red-500/20 bg-red-500/5 rounded-lg px-3 py-2 transition-colors">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : (
            <button onClick={() => setFormOpen(true)}
              className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> List as Coach
            </button>
          )}
        </div>
      )}

      {!userId && (
        <p className="text-center text-sm text-gray-500 py-4">
          <a href="/" className="text-gold-400 hover:underline font-medium">Connect your account</a>
          {" "}to book a coach or list yourself.
        </p>
      )}

      {/* Form */}
      {formOpen && (
        <CoachForm
          champions={champions}
          initial={myProfile ? profileToForm(myProfile) : undefined}
          onSave={handleSave}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading coaches…
        </div>
      ) : coaches.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Shield className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-500">No coaches listed yet.</p>
          {userId && <p className="text-sm text-gray-600">
            Masters+? <button onClick={() => setFormOpen(true)} className="text-gold-400 hover:underline">Be the first.</button>
          </p>}
        </div>
      ) : (
        <div>
          {myProfile && !formOpen && (
            <div className="mb-6">
              <p className="text-xs text-gold-400 font-semibold uppercase tracking-wide mb-2">Your Profile</p>
              <CoachCard coach={myProfile} isOwn onEdit={() => setFormOpen(true)} onDelete={handleDelete} onBook={() => {}} />
            </div>
          )}
          {others.length > 0 && (
            <>
              {myProfile && <p className="text-xs text-gray-600 uppercase tracking-wide mb-3">Available Coaches ({others.length})</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {others.map((coach) => (
                  <CoachCard
                    key={coach.id}
                    coach={coach}
                    isOwn={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onBook={() => userId ? setBookTarget(coach) : (window.location.href = "/")}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {bookTarget && <BookModal coach={bookTarget} onClose={() => setBookTarget(null)} />}
    </div>
  );
}
