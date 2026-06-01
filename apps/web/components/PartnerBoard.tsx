"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Plus, X, Pencil, Trash2, CheckCircle2, Clock,
  Moon, Sun, Sunset, Coffee, Calendar, Loader2, UserPlus, Crown,
} from "lucide-react";
import { ELO_BRACKETS, BRACKET_ORDER } from "@/lib/constants";
import type { EloBracket } from "@/lib/constants";
import { AVAILABILITY_SLOTS, PARTNER_LANES, LANE_ICON } from "@/lib/partner-types";
import type { PartnerPostPublic } from "@/lib/partner-types";
import type { Champion } from "@/app/api/champions/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const ELO_BADGE: Record<string, string> = {
  low:   "bg-slate-700/60   text-slate-300   border-slate-600/40",
  mid:   "bg-emerald-900/50 text-emerald-300  border-emerald-700/40",
  high:  "bg-blue-900/50    text-blue-300    border-blue-700/40",
  elite: "bg-purple-900/50  text-purple-300   border-purple-700/40",
  apex:  "bg-red-900/50     text-red-300     border-red-700/40",
};

const AVAIL_ICON: Record<string, React.ReactNode> = {
  morning:   <Sun     className="w-3 h-3" />,
  afternoon: <Sunset  className="w-3 h-3" />,
  evening:   <Coffee  className="w-3 h-3" />,
  late:      <Moon    className="w-3 h-3" />,
  weekends:  <Calendar className="w-3 h-3" />,
};

// ── Small reusable pieces ─────────────────────────────────────────────────────

function ChampStrip({
  champs,
  max = 8,
  size = 28,
}: {
  champs: { id: string; imageUrl: string }[];
  max?: number;
  size?: number;
}) {
  const shown    = champs.slice(0, max);
  const overflow = champs.length - max;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((c) => (
        <Image
          key={c.id}
          src={c.imageUrl}
          alt={c.id}
          width={size}
          height={size}
          className="rounded-md ring-1 ring-dark-600"
        />
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-gray-500 pl-0.5">+{overflow}</span>
      )}
    </div>
  );
}

function LanePills({ lanes }: { lanes: string[] }) {
  const shown = PARTNER_LANES.filter((l) => lanes.includes(l));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((lane) => (
        <span
          key={lane}
          className="flex items-center gap-1 text-[10px] bg-dark-700 border border-dark-600 text-gray-300 rounded-full px-2 py-0.5"
        >
          <Image src={LANE_ICON[lane]} alt={lane} width={12} height={12} />
          {lane}
        </span>
      ))}
    </div>
  );
}

function AvailPills({ slots }: { slots: string[] }) {
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {AVAILABILITY_SLOTS.filter((s) => slots.includes(s.id)).map((s) => (
        <span
          key={s.id}
          className="flex items-center gap-1 text-[10px] bg-dark-700 border border-dark-600 text-gray-400 rounded-full px-2 py-0.5"
        >
          {AVAIL_ICON[s.id]}
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  isOwn,
  onEdit,
  onDelete,
}: {
  post: PartnerPostPublic & { isOwn?: boolean };
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = ELO_BADGE[post.eloBracket] ?? "bg-dark-700 text-gray-400 border-dark-600";

  return (
    <div className={`card space-y-3 ${isOwn ? "ring-1 ring-gold-400/30" : ""}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm truncate">
              {post.riotId}
            </span>
            <span className="text-[10px] text-gray-600 uppercase">{post.region}</span>
          </div>
          <span
            className={`inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}
          >
            {post.eloBracketLabel}
          </span>
        </div>

        {isOwn && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gold-400 hover:bg-gold-400/10 transition-colors"
              title="Edit post"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete post"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Lanes */}
      {post.lanes.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Lane</p>
          <LanePills lanes={post.lanes} />
        </div>
      )}

      {/* My champs */}
      {post.myChampions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Plays</p>
          <ChampStrip champs={post.myChampions} />
        </div>
      )}

      {/* vs champs */}
      {post.vsChampions.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Wants to face</p>
          <ChampStrip champs={post.vsChampions} />
        </div>
      )}

      {/* Availability */}
      <AvailPills slots={post.availability} />

      {/* Notes */}
      {post.notes && (
        <p className="text-xs text-gray-400 italic border-t border-dark-600 pt-2 leading-relaxed">
          &ldquo;{post.notes}&rdquo;
        </p>
      )}
    </div>
  );
}

// ── Champion chip ─────────────────────────────────────────────────────────────

function ChampChip({
  id,
  champions,
  onRemove,
}: {
  id: string;
  champions: Champion[];
  onRemove: () => void;
}) {
  const c = champions.find((ch) => ch.id === id);
  return (
    <div className="flex items-center gap-1.5 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs">
      {c && (
        <Image src={c.imageUrl} alt={c.name} width={18} height={18} className="rounded-sm" />
      )}
      <span className="text-gray-200">{c?.name ?? id}</span>
      <button type="button" onClick={onRemove} className="text-gray-600 hover:text-gray-300 ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Champion search dropdown ──────────────────────────────────────────────────

function ChampSearch({
  champions,
  excluded,
  onPick,
  placeholder,
}: {
  champions: Champion[];
  excluded: string[];
  onPick: (id: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const available = champions.filter(
    (c) => !excluded.includes(c.id) &&
      c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        className="input w-full text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.length > 0 && available.length > 0 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {available.slice(0, 20).map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => { onPick(c.id); setQuery(""); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-dark-700 hover:text-white transition-colors"
            >
              <Image src={c.imageUrl} alt={c.name} width={24} height={24} className="rounded-sm" />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Post form ─────────────────────────────────────────────────────────────────

interface FormState {
  myChampions:  string[];
  vsChampions:  string[];
  lanes:        string[];
  eloBracket:   EloBracket;
  availability: string[];
  notes:        string;
}

function PostForm({
  champions,
  initial,
  onSave,
  onCancel,
}: {
  champions: Champion[];
  initial?: FormState;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? {
      myChampions:  [],
      vsChampions:  [],
      lanes:        [],
      eloBracket:   "mid",
      availability: [],
      notes:        "",
    }
  );
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  function toggleAvail(id: string) {
    setForm((f) => ({
      ...f,
      availability: f.availability.includes(id)
        ? f.availability.filter((a) => a !== id)
        : [...f.availability, id],
    }));
  }

  function toggleLane(lane: string) {
    setForm((f) => ({
      ...f,
      lanes: f.lanes.includes(lane)
        ? f.lanes.filter((l) => l !== lane)
        : [...f.lanes, lane],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.myChampions.length === 0) { setErr("Add at least one champion you play."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card border border-gold-400/20 space-y-5">
      <h3 className="font-bold text-white text-base">
        {initial ? "Edit Your Post" : "Post Your LFG"}
      </h3>

      {/* Champions I play */}
      <div>
        <label className="label">Champions I play</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.myChampions.map((id) => (
            <ChampChip
              key={id}
              id={id}
              champions={champions}
              onRemove={() =>
                setForm((f) => ({ ...f, myChampions: f.myChampions.filter((c) => c !== id) }))
              }
            />
          ))}
        </div>
        {form.myChampions.length < 15 && (
          <ChampSearch
            champions={champions}
            excluded={form.myChampions}
            placeholder="Search champion…"
            onPick={(id) => setForm((f) => ({ ...f, myChampions: [...f.myChampions, id] }))}
          />
        )}
      </div>

      {/* Champions I want to face */}
      <div>
        <label className="label">Want to play into <span className="text-gray-600 font-normal">(optional)</span></label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.vsChampions.map((id) => (
            <ChampChip
              key={id}
              id={id}
              champions={champions}
              onRemove={() =>
                setForm((f) => ({ ...f, vsChampions: f.vsChampions.filter((c) => c !== id) }))
              }
            />
          ))}
        </div>
        {form.vsChampions.length < 15 && (
          <ChampSearch
            champions={champions}
            excluded={form.vsChampions}
            placeholder="Search champion…"
            onPick={(id) => setForm((f) => ({ ...f, vsChampions: [...f.vsChampions, id] }))}
          />
        )}
      </div>

      {/* Lanes */}
      <div>
        <label className="label">Lane <span className="text-gray-600 font-normal">(optional)</span></label>
        <div className="flex flex-wrap gap-2">
          {PARTNER_LANES.map((lane) => {
            const active = form.lanes.includes(lane);
            return (
              <button
                key={lane}
                type="button"
                onClick={() => toggleLane(lane)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all ${
                  active
                    ? "border-gold-400 bg-gold-400/10 text-gold-400"
                    : "border-dark-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                <Image src={LANE_ICON[lane]} alt={lane} width={16} height={16} />
                <span className="font-medium">{lane}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Elo */}
      <div>
        <label className="label">Elo Bracket</label>
        <div className="grid grid-cols-2 gap-2">
          {ELO_BRACKETS.map((b) => {
            const active = form.eloBracket === b.value;
            const isApex = b.value === "apex";
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, eloBracket: b.value as EloBracket }))}
                className={`relative rounded-lg border p-3 text-left transition-all ${isApex ? "col-span-2" : ""} ${
                  active
                    ? "border-gold-400 bg-gold-400/10 text-gold-400"
                    : "border-dark-600 hover:border-gray-500 text-gray-300"
                }`}
              >
                <div className="font-semibold text-sm">{b.label}</div>
                <div className="text-xs opacity-60">{b.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability */}
      <div>
        <label className="label">When are you usually available?</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_SLOTS.map((s) => {
            const active = form.availability.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleAvail(s.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-all ${
                  active
                    ? "border-gold-400 bg-gold-400/10 text-gold-400"
                    : "border-dark-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                {AVAIL_ICON[s.id]}
                <span className="font-medium">{s.label}</span>
                <span className="opacity-60">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Notes <span className="text-gray-600 font-normal">(optional)</span></label>
          <span className="text-xs text-gray-600">{form.notes.length}/300</span>
        </div>
        <textarea
          className="input w-full resize-none text-sm"
          rows={3}
          maxLength={300}
          placeholder="e.g. Looking to grind my Irelia matchups before ranked, Diamond+ only"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>

      {err && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {saving ? "Saving…" : "Post"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary px-5">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

interface Props {
  userId:        string | null;
  riotId:        string | null;
  isPremium:     boolean;
  emailVerified: boolean;
}

export default function PartnerBoard({ userId, riotId, isPremium, emailVerified }: Props) {
  const [posts,      setPosts]      = useState<(PartnerPostPublic & { isOwn?: boolean })[]>([]);
  const [champions,  setChampions]  = useState<Champion[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<PartnerPostPublic | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  const myPost = posts.find((p) => p.isOwn) ?? null;

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const loadPosts = useCallback(() => {
    fetch("/api/partners")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPosts();
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []));
  }, [loadPosts]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleSave(data: {
    myChampions: string[];
    vsChampions: string[];
    lanes: string[];
    eloBracket: EloBracket;
    availability: string[];
    notes: string;
  }) {
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Save failed");
    }
    setFormOpen(false);
    setEditTarget(null);
    loadPosts();
  }

  async function handleDelete() {
    if (!confirm("Remove your practice partner post?")) return;
    setDeleting(true);
    await fetch("/api/partners", { method: "DELETE" });
    setDeleting(false);
    loadPosts();
  }

  // ── Build initial form state from an existing post ──────────────────────
  function postToFormState(p: PartnerPostPublic) {
    return {
      myChampions:  p.myChampions.map((c) => c.id),
      vsChampions:  p.vsChampions.map((c) => c.id),
      lanes:        p.lanes,
      eloBracket:   p.eloBracket as EloBracket,
      availability: p.availability,
      notes:        p.notes ?? "",
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const others = posts.filter((p) => !p.isOwn);

  return (
    <div className="space-y-6">
      {/* CTA bar */}
      {userId && !formOpen && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">
            {riotId && (
              <>Posting as <span className="text-gold-400 font-medium">{riotId}</span></>
            )}
          </p>

          {!emailVerified ? (
            /* ── Unverified email: block posting ── */
            <a
              href="/settings"
              className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-yellow-400" />
              Verify your email to post
            </a>
          ) : isPremium ? (
            /* ── Premium: show post / edit / delete controls ── */
            myPost ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditTarget(myPost); setFormOpen(true); }}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit My Post
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 rounded-lg px-3 py-2 transition-colors"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditTarget(null); setFormOpen(true); }}
                className="btn-primary flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Post Your LFG
              </button>
            )
          ) : (
            /* ── Non-premium: upgrade prompt ── */
            <a
              href="/premium"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors"
            >
              <Crown className="w-4 h-4 text-amber-400" />
              Upgrade to Premium to post your LFG
            </a>
          )}
        </div>
      )}

      {/* Login nudge */}
      {!userId && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">
            <a href="/" className="text-gold-400 hover:underline font-medium">Connect your account</a>
            {" "}to post your own LFG listing.
          </p>
        </div>
      )}

      {/* Form */}
      {formOpen && (
        <PostForm
          champions={champions}
          initial={editTarget ? postToFormState(editTarget) : undefined}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditTarget(null); }}
        />
      )}

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Clock className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-500">No partner posts yet.</p>
          {userId && isPremium && (
            <p className="text-sm text-gray-600">
              Be the first —{" "}
              <button
                onClick={() => setFormOpen(true)}
                className="text-gold-400 hover:underline"
              >
                post your LFG
              </button>
              .
            </p>
          )}
          {userId && !isPremium && (
            <p className="text-sm text-gray-600">
              <a href="/premium" className="text-amber-400 hover:underline">
                Upgrade to Premium
              </a>
              {" "}to post your LFG.
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* My post — pinned at top */}
          {myPost && !formOpen && (
            <div className="mb-6">
              <p className="text-xs text-gold-400 font-semibold uppercase tracking-wide mb-2">
                Your Post
              </p>
              <PostCard
                post={myPost}
                isOwn
                onEdit={() => { setEditTarget(myPost); setFormOpen(true); }}
                onDelete={handleDelete}
              />
            </div>
          )}

          {others.length > 0 && (
            <>
              {myPost && (
                <p className="text-xs text-gray-600 uppercase tracking-wide mb-3">
                  Other Players ({others.length})
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {others.map((post, i) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    isOwn={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
