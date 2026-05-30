"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

// ── Shared pieces ─────────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

// ── Step 1: request form ──────────────────────────────────────────────────────

function RequestForm() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 429) { setError(data.error); return; }
      setSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Check your inbox</h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          If <span className="text-white">{email}</span> is linked to a Duelr account,
          you&apos;ll receive a reset link shortly. It expires in 1 hour.
        </p>
        <a href="/?tab=login" className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:underline mt-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-sm text-gray-400 mb-5 leading-relaxed">
          Enter the email address on your account and we&apos;ll send you a reset link.
        </p>
        <label className="label">Email address</label>
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

      {error && <ErrorBox message={error} />}

      <button
        type="submit"
        disabled={loading || !email}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Sending…" : "Send Reset Link"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Remembered it?{" "}
        <a href="/?tab=login" className="text-amber-400 hover:underline">Back to login</a>
      </p>
    </form>
  );
}

// ── Step 2: new-password form (token present) ─────────────────────────────────

function NewPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Reset failed — the link may have expired."); return; }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Password updated!</h2>
        <p className="text-sm text-gray-400">You can now log in with your new password.</p>
        <a href="/?tab=login" className="btn-primary inline-flex items-center gap-2 px-6 py-2 text-sm mt-2">
          Go to Login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label">New password</label>
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
        <label className="label">Confirm new password</label>
        <input
          type="password"
          className="input"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      {error && <ErrorBox message={error} />}

      <button
        type="submit"
        disabled={loading || !password || !confirm}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Saving…" : "Set New Password"}
      </button>
    </form>
  );
}

// ── Root — reads ?token from URL ──────────────────────────────────────────────

function ResetPasswordContent() {
  const params = useSearchParams();
  const token  = params.get("token");

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-8 shadow-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight">
                {token ? "Set new password" : "Forgot password?"}
              </h1>
              <p className="text-xs text-gray-500">Duelr account recovery</p>
            </div>
          </div>

          {token ? <NewPasswordForm token={token} /> : <RequestForm />}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
