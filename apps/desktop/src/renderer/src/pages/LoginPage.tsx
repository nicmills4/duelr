import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Swords, Loader2, AlertCircle, ChevronRight, CheckCircle } from 'lucide-react'
import api from '../lib/api'

const REGIONS = [
  { value: 'na1',  label: 'NA' },
  { value: 'euw1', label: 'EUW' },
  { value: 'eun1', label: 'EUNE' },
  { value: 'kr',   label: 'KR' },
  { value: 'br1',  label: 'BR' },
  { value: 'la1',  label: 'LAN' },
  { value: 'la2',  label: 'LAS' },
  { value: 'oc1',  label: 'OCE' },
  { value: 'tr1',  label: 'TR' },
  { value: 'ru',   label: 'RU' },
  { value: 'jp1',  label: 'JP' },
]

type Mode = 'guest' | 'full' | 'register'

const CREDS_KEY = 'duelr:saved-creds'

interface SavedCreds {
  mode: Exclude<Mode, 'register'>
  // guest
  riotId?: string
  region?: string
  // full
  email?: string
  encryptedPassword?: string
}

function loadSavedCreds(): SavedCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedCreds
  } catch {
    return null
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { loginGuest, loginFull } = useAuth()

  const [mode, setMode]           = useState<Mode>('guest')
  const [riotId, setRiotId]       = useState('')
  const [region, setRegion]       = useState('na1')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [registered, setRegistered] = useState(false)

  // On mount: load saved credentials and populate the form.
  // Only auto-submit if the user did NOT explicitly log out this session.
  useEffect(() => {
    const saved = loadSavedCreds()
    if (!saved) return

    setRememberMe(true)

    if (saved.mode === 'guest' && saved.riotId) {
      setMode('guest')
      setRiotId(saved.riotId)
      setRegion(saved.region ?? 'na1')

      if (sessionStorage.getItem('duelr:explicit-logout')) return

      // Auto-submit with saved guest credentials
      setLoading(true)
      loginGuest(saved.riotId, saved.region ?? 'na1').then((result) => {
        setLoading(false)
        if (result === true) {
          navigate('/lobby')
        } else if (result.status === 0 || result.status >= 500) {
          // Server down / offline — NOT a credential problem. Keep the saved
          // creds so a launch during a deploy window doesn't "log the user out".
          setError("Couldn't reach Duelr — check your connection and sign in to retry.")
        } else {
          localStorage.removeItem(CREDS_KEY)
          setRememberMe(false)
          setError(result.message || 'Auto-login failed — please sign in again.')
        }
      })
    } else if (saved.mode === 'full' && saved.email && saved.encryptedPassword) {
      setMode('full')
      setEmail(saved.email)

      // Decrypt and populate password field regardless
      window.duelr.safeStorage.decrypt(saved.encryptedPassword).then(async (plainPassword) => {
        if (!plainPassword) {
          localStorage.removeItem(CREDS_KEY)
          setRememberMe(false)
          return
        }
        setPassword(plainPassword)

        if (sessionStorage.getItem('duelr:explicit-logout')) return

        // Auto-submit
        setLoading(true)
        const result = await loginFull(saved.email!, plainPassword)
        setLoading(false)
        if (result === true) {
          navigate('/lobby')
        } else if (result.status === 0 || result.status >= 500) {
          setError("Couldn't reach Duelr — check your connection and sign in to retry.")
        } else {
          localStorage.removeItem(CREDS_KEY)
          setRememberMe(false)
          setError(result.message || 'Auto-login failed — please sign in again.')
        }
      })
    } else if (saved.mode === 'full' && saved.email) {
      // Email remembered but no stored password (OS encryption unavailable
      // when saving) — prefill the email and let the user type the password.
      setMode('full')
      setEmail(saved.email)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'register') {
      const { data, ok } = await api.post<{ ok?: boolean; error?: string; emailSent?: boolean }>(
        '/api/auth/register',
        { riotId: riotId.trim(), region, email: email.trim(), password }
      )
      setLoading(false)
      if (ok) {
        setRegistered(true)
      } else {
        setError((data as { error?: string })?.error ?? 'Registration failed. Please try again.')
      }
      return
    }

    let result: Awaited<ReturnType<typeof loginGuest>>
    if (mode === 'guest') {
      if (!riotId.includes('#')) {
        setError('Enter your Riot ID in GameName#TAG format.')
        setLoading(false)
        return
      }
      result = await loginGuest(riotId.trim(), region)
      if (result !== true) setError(result.message || 'Riot ID not found or invalid. Check your GameName#TAG and region.')
    } else {
      result = await loginFull(email.trim(), password)
      if (result !== true) setError(result.message || 'Invalid email or password.')
    }

    setLoading(false)

    if (result === true) {
      sessionStorage.removeItem('duelr:explicit-logout')
      if (rememberMe) {
        await saveCredentials()
      } else {
        localStorage.removeItem(CREDS_KEY)
      }
      navigate('/lobby')
    }
  }

  async function saveCredentials() {
    if (mode === 'guest') {
      const creds: SavedCreds = { mode: 'guest', riotId: riotId.trim(), region }
      localStorage.setItem(CREDS_KEY, JSON.stringify(creds))
    } else {
      // encrypt() returns null when OS encryption is unavailable. In that case
      // remember the email only — never write the password to disk in clear.
      const encryptedPassword = await window.duelr.safeStorage.encrypt(password)
      const creds: SavedCreds = encryptedPassword
        ? { mode: 'full', email: email.trim(), encryptedPassword }
        : { mode: 'full', email: email.trim() }
      localStorage.setItem(CREDS_KEY, JSON.stringify(creds))
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setRegistered(false)
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-dark-700 border border-dark-600 mb-4">
            <Swords className="w-7 h-7 text-gold-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to Duelr</h1>
          <p className="text-sm text-gray-500 mt-1">LoL matchmaking — find a game in seconds</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-dark-700 p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('guest')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'guest'
                ? 'bg-dark-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Riot ID
          </button>
          <button
            type="button"
            onClick={() => switchMode('full')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'full'
                ? 'bg-dark-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-gold-400/20 text-gold-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Register
          </button>
        </div>

        {/* ── Registration success ─────────────────────────────── */}
        {registered ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-4">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Account created!</p>
                <p className="text-xs text-gray-400 mt-1">
                  A verification email has been sent to <span className="text-gray-200">{email}</span>.
                  Check your inbox, then sign in below.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { switchMode('full'); setPassword('') }}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <ChevronRight className="w-4 h-4" />
              Go to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ── Riot ID (guest + register) ── */}
            {(mode === 'guest' || mode === 'register') && (
              <>
                <div>
                  <label className="label">Riot ID</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="GameName#TAG"
                    value={riotId}
                    onChange={(e) => setRiotId(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Region</label>
                  <select
                    className="input"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* ── Email (full + register) ── */}
            {(mode === 'full' || mode === 'register') && (
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={mode === 'full'}
                />
              </div>
            )}

            {/* ── Password (full + register) ── */}
            {(mode === 'full' || mode === 'register') && (
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                />
              </div>
            )}

            {/* Remember me — only for login modes */}
            {mode !== 'register' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-dark-500 bg-dark-700 accent-gold-400"
                />
                <span className="text-sm text-gray-400">Remember me</span>
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading
                ? mode === 'register' ? 'Creating account…' : 'Signing in…'
                : mode === 'register' ? 'Create Account' : 'Sign in'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">
          By signing in you agree to the{' '}
          <button
            type="button"
            onClick={() => window.duelr.shell.openExternal('https://playduelr.gg/terms')}
            className="text-gray-500 hover:text-gray-300 underline"
          >
            Terms of Service
          </button>
        </p>

      </div>
    </div>
  )
}
