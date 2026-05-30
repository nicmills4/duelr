import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'
import {
  Settings, AlertCircle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, ShieldCheck, ShieldAlert,
} from 'lucide-react'

// ── Regions (mirrors web app) ─────────────────────────────────────────────────

const REGIONS = [
  { value: 'na1',  label: 'NA'   },
  { value: 'euw1', label: 'EUW'  },
  { value: 'eun1', label: 'EUNE' },
  { value: 'kr',   label: 'KR'   },
  { value: 'br1',  label: 'BR'   },
  { value: 'la1',  label: 'LAN'  },
  { value: 'la2',  label: 'LAS'  },
  { value: 'oc1',  label: 'OCE'  },
  { value: 'tr1',  label: 'TR'   },
  { value: 'ru',   label: 'RU'   },
  { value: 'jp1',  label: 'JP'   },
]

// ── Shared primitives ─────────────────────────────────────────────────────────

function Success({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}

function Section({
  title, description, children,
}: {
  title: string; description: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
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
  )
}

function ResendVerificationButton() {
  const [state, setState]     = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleClick() {
    setState('loading')
    const { ok, data } = await api.post<{ error?: string }>('/api/auth/resend-verification', {})
    if (ok) {
      setState('sent')
    } else {
      setState('error')
      setMessage((data as { error?: string })?.error ?? 'Failed')
      setTimeout(() => setState('idle'), 5000)
    }
  }

  if (state === 'sent') return <span className="text-emerald-400 text-xs font-medium">✓ Email sent!</span>

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        className="text-xs underline underline-offset-2 hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap text-amber-400"
      >
        {state === 'loading'
          ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Sending…</span>
          : 'Resend email'}
      </button>
      {state === 'error' && <span className="text-xs text-red-300">{message}</span>}
    </div>
  )
}

// ── Riot ID section ───────────────────────────────────────────────────────────

function RiotIdSection({
  currentRiotId, currentRegion, onSaved,
}: {
  currentRiotId: string; currentRegion: string; onSaved: () => void
}) {
  const [riotId,  setRiotId]  = useState(currentRiotId)
  const [region,  setRegion]  = useState(currentRegion)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error,   setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess(''); setError('')
    setLoading(true)
    const { ok, data } = await api.patch<{ riotId?: string; error?: string }>(
      '/api/settings', { action: 'riotId', riotId, region }
    )
    setLoading(false)
    if (ok) {
      setSuccess('Riot ID updated successfully.')
      onSaved()
    } else {
      setError((data as { error?: string })?.error ?? 'Failed to update')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Riot ID</label>
        <input
          className="input"
          value={riotId}
          onChange={e => setRiotId(e.target.value)}
          placeholder="GameName#TAG"
          required
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-gray-500 mt-1">We'll re-verify this with the Riot API.</p>
      </div>
      <div>
        <label className="label">Region</label>
        <select className="input" value={region} onChange={e => setRegion(e.target.value)}>
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
        {loading ? 'Verifying…' : 'Update Riot ID'}
      </button>
    </form>
  )
}

// ── Email section ─────────────────────────────────────────────────────────────

function EmailSection({ currentEmail, onSaved }: { currentEmail: string | null; onSaved: () => void }) {
  const [email,   setEmail]   = useState(currentEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error,   setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess(''); setError('')
    setLoading(true)
    const { ok, data } = await api.patch<{ error?: string }>('/api/settings', { action: 'email', email })
    setLoading(false)
    if (ok) { setSuccess('Email updated.'); onSaved() }
    else    { setError((data as { error?: string })?.error ?? 'Failed') }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Email Address</label>
        <input
          type="email"
          className="input"
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
        disabled={loading || email === (currentEmail ?? '')}
        className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? 'Saving…' : 'Update Email'}
      </button>
    </form>
  )
}

// ── Password section ──────────────────────────────────────────────────────────

function PasswordSection({ email }: { email: string | null }) {
  const [current,      setCurrent]      = useState('')
  const [next,         setNext]         = useState('')
  const [confirm,      setConfirm]      = useState('')
  const [loading,      setLoading]      = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent,    setResetSent]    = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSuccess(''); setError('')
    if (next !== confirm) { setError('New passwords do not match'); return }
    if (next.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    const { ok, data } = await api.patch<{ error?: string }>(
      '/api/settings', { action: 'password', currentPassword: current, newPassword: next }
    )
    setLoading(false)
    if (ok) {
      setSuccess('Password changed successfully.')
      setCurrent(''); setNext(''); setConfirm('')
    } else {
      setError((data as { error?: string })?.error ?? 'Failed')
    }
  }

  async function sendReset() {
    if (!email || resetSending || resetSent) return
    setResetSending(true)
    await api.post('/api/auth/forgot-password', { email })
    setResetSending(false)
    setResetSent(true)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">Current Password</label>
          {email && (
            <button
              type="button"
              onClick={sendReset}
              disabled={resetSending || resetSent}
              className="text-xs text-amber-400 hover:underline disabled:opacity-60 disabled:no-underline"
            >
              {resetSent ? 'Reset link sent!' : resetSending ? 'Sending…' : 'Forgot password?'}
            </button>
          )}
        </div>
        <input
          type="password"
          className="input"
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
          className="input"
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
          className="input"
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
        {loading ? 'Changing…' : 'Change Password'}
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <p className="text-gray-400">Sign in to access settings.</p>
          <button onClick={() => navigate('/login')} className="btn-primary text-sm px-4 py-2">
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const isFull = user.accountType === 'full'

  // Fetch fresh profile data after any save so displayed values stay in sync
  async function onSaved() {
    await refreshProfile()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-gold-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Settings</h1>
          <p className="text-xs text-gray-500">Manage your account details</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Account info card */}
        <div className="card mb-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{user.riotId}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {user.region?.toUpperCase()} · {isFull ? 'Full account' : 'Guest account'}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              isFull
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-gray-700/60 text-gray-400'
            }`}>
              {isFull ? 'Full account' : 'Guest'}
            </span>
          </div>

          {/* Email verification status */}
          {isFull && (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
              user.emailVerified
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : 'bg-amber-500/10 border border-amber-500/20'
            }`}>
              <div className="flex items-center gap-2">
                {user.emailVerified
                  ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  : <ShieldAlert  className="w-3.5 h-3.5 text-amber-400"  />}
                <span className={user.emailVerified ? 'text-emerald-400' : 'text-amber-400'}>
                  {user.emailVerified ? 'Email verified' : 'Email not verified'}
                </span>
              </div>
              {!user.emailVerified && <ResendVerificationButton />}
            </div>
          )}
        </div>

        {/* Riot ID & Region */}
        <Section
          title="Riot ID & Region"
          description={`Currently: ${user.riotId} (${user.region})`}
        >
          <RiotIdSection
            currentRiotId={user.riotId}
            currentRegion={user.region}
            onSaved={onSaved}
          />
        </Section>

        {/* Email — full accounts only */}
        {isFull && (
          <Section
            title="Email Address"
            description="Update your login email"
          >
            <EmailSection currentEmail={null} onSaved={onSaved} />
          </Section>
        )}

        {/* Password — full accounts only */}
        {isFull && (
          <Section
            title="Password"
            description="Change your login password"
          >
            <PasswordSection email={null} />
          </Section>
        )}

        {/* Guest upgrade nudge */}
        {!isFull && (
          <div className="text-xs text-gray-500 bg-dark-800 border border-white/5 rounded-xl px-4 py-3">
            Email and password settings are only available on full accounts.{' '}
            <button
              onClick={() => window.duelr.shell.openExternal('https://playduelr.gg')}
              className="text-amber-400 hover:underline"
            >
              Sign up on playduelr.gg
            </button>{' '}
            to upgrade.
          </div>
        )}

        {/* Danger zone */}
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="text-xs text-gray-600 text-center">
            Need help?{' '}
            <button
              onClick={() => window.duelr.shell.openExternal('https://playduelr.gg')}
              className="text-gray-500 hover:text-gray-300 underline"
            >
              Visit playduelr.gg
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
