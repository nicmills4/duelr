"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, LogOut, Plus, Check, X, ChevronDown, ChevronUp,
  Search, RefreshCw, Trash2, ToggleLeft, ToggleRight, Users, UserCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachProfile {
  id:           string;
  displayCode:  string;
  verifiedTier: string;
  champions:    string;  // JSON
  specialties:  string;  // JSON (legacy — kept for DB compat)
  roles:        string;  // JSON
  hourlyRate:   number;  // cents
  bio:          string | null;
  availability: string;  // JSON
  isActive:     boolean;
  isApproved:   boolean;
  createdAt:    string;
  user: {
    id:          string;
    riotId:      string;
    region:      string;
    email:       string | null;
    accountType: string;
  };
}

interface AdminUser {
  id:          string;
  riotId:      string;
  region:      string;
  email:       string | null;
  accountType: string;
  createdAt:   string;
  coachProfile: { id: string; isApproved: boolean; isActive: boolean } | null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res  = await fetch("/api/admin/auth", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) { onLogin(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || `Login failed (${res.status})`); }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-amber-400" />
          <h1 className="text-xl font-bold">Duelr Admin</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Admin Password</label>
            <input
              type="password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Checking…" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Add Coach Modal ──────────────────────────────────────────────────────────

function AddCoachModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    riotId:           "",
    region:           "na1",
    verifiedTier:     "MASTER",
    hourlyRateDollars:"30",
    bio:              "",
    championsRaw:     "",   // comma-separated champion IDs
    roles:            [] as string[],
    isApproved:       true,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const set = (k: string, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const champions = form.championsRaw.split(",").map(s => s.trim()).filter(Boolean);
    const res = await fetch("/api/admin/coaches", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...form, champions }),
    });
    setLoading(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || `Server error ${res.status}`); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="font-bold text-lg">Add / Update Coach</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Row label="Riot ID (GameName#TAG)">
            <input className={inp} value={form.riotId} onChange={e => set("riotId", e.target.value)} placeholder="Faker#KR1" required />
          </Row>
          <Row label="Region">
            <select className={inp} value={form.region} onChange={e => set("region", e.target.value)}>
              {["na1","euw1","eun1","kr","br1","jp1","la1","la2","oc1","tr1","ru"].map(r =>
                <option key={r} value={r}>{r}</option>
              )}
            </select>
          </Row>
          <Row label="Verified Tier">
            <select className={inp} value={form.verifiedTier} onChange={e => set("verifiedTier", e.target.value)}>
              {["MASTER","GRANDMASTER","CHALLENGER"].map(t =>
                <option key={t} value={t}>{t}</option>
              )}
            </select>
          </Row>
          <Row label="Hourly Rate ($)">
            <input className={inp} type="number" min="1" step="0.01" value={form.hourlyRateDollars}
              onChange={e => set("hourlyRateDollars", e.target.value)} required />
          </Row>
          <Row label="Champions (comma-separated IDs)">
            <input className={inp} value={form.championsRaw}
              onChange={e => set("championsRaw", e.target.value)}
              placeholder="Zed,Yasuo,Akali" />
          </Row>
          <Row label="Specializes in (roles)">
            <div className="flex flex-wrap gap-2 pt-1">
              {["Top","Jungle","Mid","Bot","Support"].map(role => {
                const checked = form.roles.includes(role);
                return (
                  <label key={role} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => setForm(f => ({ ...f, roles: checked ? f.roles.filter(r => r !== role) : [...f.roles, role] }))} />
                    {role}
                  </label>
                );
              })}
            </div>
          </Row>
          <Row label="Bio">
            <textarea className={`${inp} resize-none h-20`} value={form.bio}
              onChange={e => set("bio", e.target.value)} maxLength={500} />
          </Row>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${form.isApproved ? "bg-emerald-500" : "bg-gray-600"}`}
              onClick={() => set("isApproved", !form.isApproved)}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isApproved ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-gray-300">Approve immediately</span>
          </label>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-lg py-2 text-sm transition-colors disabled:opacity-50">
              {loading ? "Saving…" : "Save Coach"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Coach Modal ─────────────────────────────────────────────────────────

function EditCoachModal({ coach, onClose, onSaved }: {
  coach:   CoachProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const champions = JSON.parse(coach.champions || "[]") as string[];
  const initRoles = JSON.parse(coach.roles       || "[]") as string[];

  const [form, setForm] = useState({
    verifiedTier:      coach.verifiedTier,
    hourlyRateDollars: (coach.hourlyRate / 100).toFixed(2),
    bio:               coach.bio || "",
    championsRaw:      champions.join(", "),
    roles:             initRoles,
    isApproved:        coach.isApproved,
    isActive:          coach.isActive,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/admin/coaches/${coach.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        verifiedTier:      form.verifiedTier,
        hourlyRateDollars: parseFloat(form.hourlyRateDollars),
        bio:               form.bio,
        champions:         form.championsRaw.split(",").map(s => s.trim()).filter(Boolean),
        roles:             form.roles,
        isApproved:        form.isApproved,
        isActive:          form.isActive,
      }),
    });
    setLoading(false);
    if (res.ok) { onSaved(); onClose(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || `Server error ${res.status}`); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="font-bold text-lg">Edit Coach</h2>
            <p className="text-xs text-gray-400">{coach.user.riotId} · {coach.displayCode}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Row label="Verified Tier">
            <select className={inp} value={form.verifiedTier} onChange={e => set("verifiedTier", e.target.value)}>
              {["MASTER","GRANDMASTER","CHALLENGER"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Row>
          <Row label="Hourly Rate ($)">
            <input className={inp} type="number" min="1" step="0.01" value={form.hourlyRateDollars}
              onChange={e => set("hourlyRateDollars", e.target.value)} required />
          </Row>
          <Row label="Champions (comma-separated)">
            <input className={inp} value={form.championsRaw} onChange={e => set("championsRaw", e.target.value)} />
          </Row>
          <Row label="Specializes in (roles)">
            <div className="flex flex-wrap gap-2 pt-1">
              {["Top","Jungle","Mid","Bot","Support"].map(role => {
                const checked = form.roles.includes(role);
                return (
                  <label key={role} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => setForm(f => ({ ...f, roles: checked ? f.roles.filter(r => r !== role) : [...f.roles, role] }))} />
                    {role}
                  </label>
                );
              })}
            </div>
          </Row>
          <Row label="Bio">
            <textarea className={`${inp} resize-none h-20`} value={form.bio}
              onChange={e => set("bio", e.target.value)} maxLength={500} />
          </Row>
          <div className="flex gap-6">
            <Toggle label="Approved" value={form.isApproved} onChange={v => set("isApproved", v)} color="emerald" />
            <Toggle label="Active"   value={form.isActive}   onChange={v => set("isActive",   v)} color="blue"    />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-lg py-2 text-sm transition-colors disabled:opacity-50">
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Coaches Tab ──────────────────────────────────────────────────────────────

function CoachesTab() {
  const [coaches,     setCoaches]     = useState<CoachProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadErr,     setLoadErr]     = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [editCoach,   setEditCoach]   = useState<CoachProfile | null>(null);
  const [expanded,    setExpanded]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/admin/coaches");
      if (!res.ok) {
        const text = await res.text();
        setLoadErr(`HTTP ${res.status} — ${text.slice(0, 200)}`);
        setLoading(false);
        return;
      }
      const d = await res.json();
      setCoaches(d.coaches ?? []);
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleField(id: string, field: "isApproved" | "isActive", value: boolean) {
    await fetch(`/api/admin/coaches/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ [field]: value }),
    });
    await load();
  }

  async function deleteCoach(id: string, riotId: string) {
    if (!confirm(`Delete coach profile for ${riotId}? This cannot be undone.`)) return;
    await fetch(`/api/admin/coaches/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-amber-400" /> Coaches
          <span className="text-gray-500 font-normal text-sm">({coaches.length})</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={load}  className={iconBtn}><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-lg px-4 py-2 text-sm transition-colors">
            <Plus className="w-4 h-4" /> Add Coach
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : loadErr ? (
        <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-sm text-red-400 space-y-1">
          <p className="font-semibold">Failed to load coaches</p>
          <p className="font-mono text-xs break-all">{loadErr}</p>
        </div>
      ) : coaches.length === 0 ? (
        <p className="text-gray-500 text-sm">No coaches yet.</p>
      ) : (
        <div className="space-y-2">
          {coaches.map(c => {
            const champs = JSON.parse(c.champions || "[]") as string[];
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Status dots */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full ${c.isApproved ? "bg-emerald-400" : "bg-gray-600"}`} title={c.isApproved ? "Approved" : "Pending"} />
                    <span className={`w-2 h-2 rounded-full ${c.isActive ? "bg-blue-400" : "bg-gray-600"}`} title={c.isActive ? "Active" : "Inactive"} />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.user.riotId}</span>
                      <Badge color="amber">{c.verifiedTier}</Badge>
                      <Badge color="gray">{c.displayCode}</Badge>
                      <span className="text-xs text-gray-400">${(c.hourlyRate / 100).toFixed(0)}/hr</span>
                    </div>
                    {champs.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{champs.slice(0,6).join(", ")}{champs.length > 6 ? ` +${champs.length - 6}` : ""}</p>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleField(c.id, "isApproved", !c.isApproved)}
                      className={`p-1.5 rounded-lg text-xs transition-colors ${c.isApproved ? "text-emerald-400 hover:bg-emerald-400/10" : "text-gray-500 hover:bg-gray-700"}`}
                      title={c.isApproved ? "Revoke approval" : "Approve"}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleField(c.id, "isActive", !c.isActive)}
                      className={`p-1.5 rounded-lg transition-colors ${c.isActive ? "text-blue-400 hover:bg-blue-400/10" : "text-gray-500 hover:bg-gray-700"}`}
                      title={c.isActive ? "Deactivate" : "Activate"}>
                      {c.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditCoach(c)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-700 transition-colors text-xs"
                      title="Edit">
                      ✏️
                    </button>
                    <button onClick={() => deleteCoach(c.id, c.user.riotId)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white transition-colors">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-800 pt-3 grid grid-cols-2 gap-3 text-xs">
                    <Field label="Email"      value={c.user.email ?? "—"} />
                    <Field label="Region"     value={c.user.region} />
                    <Field label="Account"    value={c.user.accountType} />
                    <Field label="Rate"       value={`$${(c.hourlyRate / 100).toFixed(2)}/hr`} />
                    <Field label="Champions"     value={JSON.parse(c.champions || "[]").join(", ") || "—"} />
                    <Field label="Specializes in" value={JSON.parse(c.roles || "[]").join(", ") || "—"} />
                    {c.bio && <div className="col-span-2"><Field label="Bio" value={c.bio} /></div>}
                    <Field label="Created"    value={new Date(c.createdAt).toLocaleDateString()} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd  && <AddCoachModal  onClose={() => setShowAdd(false)}    onSaved={load} />}
      {editCoach && <EditCoachModal coach={editCoach} onClose={() => setEditCoach(null)} onSaved={load} />}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState("");

  const load = useCallback(async (q = "") => {
    setLoading(true);
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    const d   = await res.json();
    setUsers(d.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAccountType(userId: string, current: string) {
    const next = current === "full" ? "guest" : "full";
    if (!confirm(`Change account type to "${next}"?`)) return;
    await fetch("/api/admin/users", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId, accountType: next }),
    });
    load(query);
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    load(query);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-400" /> Users
          <span className="text-gray-500 font-normal text-sm">({users.length})</span>
        </h2>
        <form onSubmit={search} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-amber-400 w-56"
              placeholder="Riot ID or email…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm transition-colors">Search</button>
          <button type="button" onClick={() => { setQuery(""); load(""); }} className={iconBtn}><RefreshCw className="w-4 h-4" /></button>
        </form>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-gray-500 text-sm">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-4 font-medium">Riot ID</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Region</th>
                <th className="pb-2 pr-4 font-medium">Account</th>
                <th className="pb-2 pr-4 font-medium">Coach</th>
                <th className="pb-2 pr-4 font-medium">Joined</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-900/50">
                  <td className="py-2.5 pr-4 font-medium">{u.riotId}</td>
                  <td className="py-2.5 pr-4 text-gray-400">{u.email ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-400">{u.region}</td>
                  <td className="py-2.5 pr-4">
                    <Badge color={u.accountType === "full" ? "emerald" : "gray"}>{u.accountType}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    {u.coachProfile
                      ? <Badge color={u.coachProfile.isApproved ? "amber" : "gray"}>{u.coachProfile.isApproved ? "coach" : "pending"}</Badge>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5">
                    <button
                      onClick={() => toggleAccountType(u.id, u.accountType)}
                      className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md px-2 py-1 transition-colors"
                      title="Toggle account type"
                    >
                      {u.accountType === "full" ? "→ guest" : "→ full"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400";
const iconBtn = "p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange, color }: { label: string; value: boolean; onChange: (v: boolean) => void; color: "emerald" | "blue" }) {
  const bg = color === "emerald" ? "bg-emerald-500" : "bg-blue-500";
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className={`w-9 h-5 rounded-full transition-colors relative ${value ? bg : "bg-gray-600"}`} onClick={() => onChange(!value)}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}

function Badge({ color, children }: { color: "amber" | "emerald" | "gray" | "blue"; children: React.ReactNode }) {
  const cls = {
    amber:   "bg-amber-400/10 text-amber-400",
    emerald: "bg-emerald-400/10 text-emerald-400",
    gray:    "bg-gray-700 text-gray-400",
    blue:    "bg-blue-400/10 text-blue-400",
  }[color];
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>{children}</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-600 block">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type Tab = "coaches" | "users";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab,    setTab]    = useState<Tab>("coaches");

  // Check if already logged in
  useEffect(() => {
    fetch("/api/admin/coaches")
      .then(r => setAuthed(r.status !== 401))
      .catch(() => setAuthed(false));
  }, []);

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthed(false);
  }

  if (authed === null) return (
    <div className="flex items-center justify-center min-h-screen text-gray-500 text-sm">Loading…</div>
  );

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl font-bold">Duelr Admin</h1>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(["coaches", "users"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "coaches" && <CoachesTab />}
      {tab === "users"   && <UsersTab   />}
    </div>
  );
}
