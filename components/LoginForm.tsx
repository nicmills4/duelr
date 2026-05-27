"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/riot";
import { AlertCircle, LogIn, UserPlus, Loader2 } from "lucide-react";

type Tab = "guest" | "signup" | "login";

function GuestForm() {
  const [riotId, setRiotId]   = useState("");
  const [region, setRegion]   = useState("na1");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ riotId, region }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      router.push("/lobby");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-xs text-gray-400 leading-relaxed">
        <span className="text-amber-400 font-semibold">Guest access</span> — Lobby &amp; Specific Matchups only.{" "}
        Create a free account below to unlock Practice Partners and Coaching.
      </div>

      <div>
        <label className="label">Riot ID</label>
        <input
          type="text"
          className="input"
          placeholder="GameName#TAG"
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-gray-500 mt-1">Example: Faker#KR1</p>
      </div>

      <div>
        <label className="label">Region</label>
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={loading || !riotId} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? "Verifying..." : "Play as Guest"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Your Riot ID is validated via the official Riot API — no password needed.{" "}
        <br />Questions?{" "}
        <a href="mailto:playduelrsupport@gmail.com" className="text-gold-400 hover:underline">
          playduelrsupport@gmail.com
        </a>
      </p>
    </form>
  );
}

function SignupForm() {
  const [riotId, setRiotId]     = useState("");
  const [region, setRegion]     = useState("na1");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ riotId, region, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); return; }
      router.push("/lobby");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-dark-700 border border-emerald-500/20 rounded-lg px-4 py-3 text-xs text-gray-400 leading-relaxed">
        <span className="text-emerald-400 font-semibold">Full access</span> — unlocks Practice Partners and Coaching in addition to Lobby &amp; Specific Matchups.
      </div>

      <div>
        <label className="label">Riot ID</label>
        <input
          type="text"
          className="input"
          placeholder="GameName#TAG"
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div>
        <label className="label">Region</label>
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Email</label>
        <input
          type="email"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label">Password</label>
        <input
          type="password"
          className="input"
          placeholder="Min 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      <div>
        <label className="label">Confirm Password</label>
        <input
          type="password"
          className="input"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={loading || !riotId || !email || !password} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {loading ? "Creating account..." : "Create Free Account"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Already have an account?{" "}
        <a href="/?tab=login" className="text-gold-400 hover:underline">Log in</a>
      </p>
    </form>
  );
}

function LoginEmailForm() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      router.push("/lobby");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label">Password</label>
        <input
          type="password"
          className="input"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={loading || !email || !password} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? "Logging in..." : "Log In"}
      </button>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <a href="/reset-password" className="text-amber-400 hover:underline">
          Forgot password?
        </a>
        <span>
          No account?{" "}
          <a href="/?tab=signup" className="text-gold-400 hover:underline">Create one for free</a>
        </span>
      </div>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "guest",  label: "Play as Guest" },
  { id: "signup", label: "Create Account" },
  { id: "login",  label: "Log In" },
];

export default function LoginForm({ defaultTab = "guest" }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex border border-dark-600 rounded-lg overflow-hidden">
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              tab === id
                ? "bg-amber-400 text-dark-900"
                : "bg-dark-700 text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "guest"  && <GuestForm />}
      {tab === "signup" && <SignupForm />}
      {tab === "login"  && <LoginEmailForm />}
    </div>
  );
}
