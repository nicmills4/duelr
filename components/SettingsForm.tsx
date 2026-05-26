"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/riot";
import { AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  riotId:      string;
  region:      string;
  email:       string | null;
  accountType: string;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Success({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title:       string;
  description: string;
  children:    React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-dark-600 rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-dark-800 hover:bg-dark-700 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <p className="font-semibold text-white text-sm">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-gray-500 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>
      {open && <div className="px-5 pb-5 pt-4 bg-dark-800/50 space-y-4">{children}</div>}
    </div>
  );
}

const inp = "input"; // reuse global .input class from globals.css

// ─── Riot ID section ──────────────────────────────────────────────────────────

function RiotIdSection({ currentRiotId, currentRegion }: { currentRiotId: string; currentRegion: string }) {
  const [riotId,  setRiotId]  = useState(currentRiotId);
  const [region,  setRegion]  = useState(currentRegion);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(""); setError("");
    setLoading(true);
    const res = await fetch("/api/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "riotId", riotId, region }),
    });
    const d = await res.json();
    setLoading(false);
    if (res.ok) {
      setRiotId(d.riotId);
      setSuccess("Riot ID updated successfully.");
      router.refresh();
    } else {
      setError(d.error || "Failed to update");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Riot ID</label>
        <input
          className={inp}
          value={riotId}
          onChange={e => setRiotId(e.target.value)}
          placeholder="GameName#TAG"
          required
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-gray-500 mt-1">We&apos;ll re-verify this with the Riot API.</p>
      </div>
      <div>
        <label className="label">Region</label>
        <select className={inp} value={region} onChange={e => setRegion(e.target.value)}>
          {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {success && <Success msg={success} />}
      {error   && <ErrorBox msg={error} />}
      <button
        type="submit"
        disabled={loading || (riotId === currentRiotId && region === currentRegion)}
        className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? "Verifying…" : "Update Riot ID"}
      </button>
    </form>
  );
}

// ─── Email section ────────────────────────────────────────────────────────────

function EmailSection({ currentEmail }: { currentEmail: string | null }) {
  const [email,   setEmail]   = useState(currentEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(""); setError("");
    setLoading(true);
    const res = await fetch("/api/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "email", email }),
    });
    const d = await res.json();
    setLoading(false);
    if (res.ok) { setSuccess("Email updated."); router.refresh(); }
    else        { setError(d.error || "Failed"); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Email Address</label>
        <input
          type="email"
          className={inp}
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>
      {success && <Success msg={success} />}
      {error   && <ErrorBox msg={error} />}
      <button
        type="submit"
        disabled={loading || email === (currentEmail ?? "")}
        className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? "Saving…" : "Update Email"}
      </button>
    </form>
  );
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(""); setError("");
    if (next !== confirm) { setError("New passwords do not match"); return; }
    if (next.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    const res = await fetch("/api/settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "password", currentPassword: current, newPassword: next }),
    });
    const d = await res.json();
    setLoading(false);
    if (res.ok) {
      setSuccess("Password changed successfully.");
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      setError(d.error || "Failed");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Current Password</label>
        <input
          type="password"
          className={inp}
          value={current}
          onChange={e => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label">New Password</label>
        <input
          type="password"
          className={inp}
          value={next}
          onChange={e => setNext(e.target.value)}
          placeholder="Min 8 characters"
          required
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="label">Confirm New Password</label>
        <input
          type="password"
          className={inp}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>
      {success && <Success msg={success} />}
      {error   && <ErrorBox msg={error} />}
      <button
        type="submit"
        disabled={loading || !current || !next || !confirm}
        className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? "Changing…" : "Change Password"}
      </button>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsForm({ riotId, region, email, accountType }: Props) {
  const isFull = accountType === "full";

  return (
    <div className="space-y-3">
      {/* Current account info */}
      <div className="card mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{riotId}</p>
          <p className="text-xs text-gray-500">{email ?? "Guest account"} · {region.toUpperCase()}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          isFull
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-gray-700 text-gray-400"
        }`}>
          {isFull ? "Full account" : "Guest"}
        </span>
      </div>

      <Section
        title="Riot ID & Region"
        description={`Currently: ${riotId} (${region})`}
      >
        <RiotIdSection currentRiotId={riotId} currentRegion={region} />
      </Section>

      {isFull && (
        <Section
          title="Email Address"
          description={email ? `Currently: ${email}` : "No email set"}
        >
          <EmailSection currentEmail={email} />
        </Section>
      )}

      {isFull && (
        <Section
          title="Password"
          description="Change your login password"
        >
          <PasswordSection />
        </Section>
      )}

      {!isFull && (
        <div className="text-xs text-gray-500 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3">
          Email and password settings are only available on{" "}
          <a href="/?tab=signup" className="text-amber-400 hover:underline">full accounts</a>.
        </div>
      )}
    </div>
  );
}
