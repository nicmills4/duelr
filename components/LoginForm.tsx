"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/riot";
import { AlertCircle, LogIn, Loader2 } from "lucide-react";

export default function LoginForm() {
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState("na1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId, region }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push("/queue");
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
        <select
          className="input"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button type="submit" disabled={loading || !riotId} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? "Verifying..." : "Connect Account"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Your Riot ID is validated via the official Riot API.{" "}
        <br />Questions or trouble logging in?{" "}
        <a
          href="mailto:playduelrsupport@gmail.com"
          className="text-gold-400 hover:underline"
        >
          playduelrsupport@gmail.com
        </a>
      </p>
    </form>
  );
}
