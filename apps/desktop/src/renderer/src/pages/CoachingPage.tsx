import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, Star, Clock, Loader2, CheckCircle2, X, MessageCircle,
  ChevronUp, ChevronDown, SlidersHorizontal, Mail, LogIn,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'
import { AVAILABILITY_SLOTS } from '../lib/partner-types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChampEntry { id: string; imageUrl: string }

interface CoachData {
  id:           string
  riotId:       string
  region:       string
  verifiedTier: string
  hourlyRate:   number
  bio:          string | null
  availability: string[]
  champions:    ChampEntry[]
  roles:        string[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  MASTER:      'bg-purple-900/50 text-purple-300 border-purple-700/40',
  GRANDMASTER: 'bg-red-900/50    text-red-300    border-red-700/40',
  CHALLENGER:  'bg-gold-400/10   text-gold-400   border-gold-400/25',
}

const REGION_LABELS: Record<string, string> = {
  na1: 'NA', euw1: 'EUW', eun1: 'EUNE', kr: 'KR',
  br1: 'BR', la1: 'LAN', la2: 'LAS', oc1: 'OCE', tr1: 'TR', ru: 'RU', jp1: 'JP',
}

const ALL_ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']

const DURATION_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '90 min' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(0)}/hr`
}

function sessionPrice(hourlyRate: number, minutes: number) {
  return `$${((hourlyRate * minutes) / 60 / 100).toFixed(2)}`
}

function regionLabel(r: string) {
  return REGION_LABELS[r] ?? r.toUpperCase()
}

// ── Champion strip ─────────────────────────────────────────────────────────────

function ChampStrip({ champs, max = 8 }: { champs: ChampEntry[]; max?: number }) {
  const shown    = champs.slice(0, max)
  const overflow = champs.length - max
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map((c) => (
        <img key={c.id} src={c.imageUrl} alt={c.id} width={36} height={36}
          className="rounded-md ring-1 ring-dark-600" />
      ))}
      {overflow > 0 && <span className="text-xs text-gray-500">+{overflow}</span>}
    </div>
  )
}

// ── Coach card ─────────────────────────────────────────────────────────────────

function CoachCard({ coach, onBook }: { coach: CoachData; onBook: () => void }) {
  const badge = TIER_BADGE[coach.verifiedTier] ?? 'bg-dark-700 text-gray-400 border-dark-600'
  const avail = AVAILABILITY_SLOTS.filter((s) => coach.availability.includes(s.id))

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold-400 flex-shrink-0" />
            <span className="font-bold text-white text-xl">{coach.riotId}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${badge}`}>
              {coach.verifiedTier.charAt(0) + coach.verifiedTier.slice(1).toLowerCase()} · Verified
            </span>
            <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full border bg-dark-700 text-gray-400 border-dark-600">
              {regionLabel(coach.region)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-gold-400 text-2xl">{centsToDisplay(coach.hourlyRate)}</p>
        </div>
      </div>

      {/* Champions */}
      {coach.champions.length > 0 && (
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Plays</p>
          <ChampStrip champs={coach.champions} />
        </div>
      )}

      {/* Roles */}
      {coach.roles.length > 0 && (
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-2">Specializes in</p>
          <div className="flex flex-wrap gap-2">
            {coach.roles.map((role) => (
              <span key={role}
                className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-dark-700 text-gray-300 border-dark-600">
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Availability */}
      {avail.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {avail.map((s) => (
            <span key={s.id}
              className="text-xs bg-dark-700 border border-dark-600 text-gray-400 rounded-full px-2.5 py-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Bio */}
      {coach.bio && (
        <p className="text-sm text-gray-400 italic border-t border-dark-600 pt-3 leading-relaxed">
          &ldquo;{coach.bio}&rdquo;
        </p>
      )}

      <button
        onClick={onBook}
        className="btn-primary w-full flex items-center justify-center gap-2 text-base"
      >
        <Star className="w-4 h-4" /> Book a Session
      </button>
    </div>
  )
}

// ── Book modal ─────────────────────────────────────────────────────────────────

function BookModal({ coach, onClose }: { coach: CoachData; onClose: () => void }) {
  const [duration, setDuration] = useState(60)
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState('')

  async function book() {
    setLoading(true)
    setErr('')
    const { ok, data } = await api.post<{ url?: string; error?: string }>(
      '/api/coaching/book',
      { coachProfileId: coach.id, durationMinutes: duration }
    )
    setLoading(false)
    if (!ok || !data?.url) {
      setErr((data as { error?: string })?.error ?? 'Failed to create checkout session.')
      return
    }
    // Open Stripe checkout in the system browser; the success page is on playduelr.gg
    window.duelr.shell.openExternal(data.url)
    onClose()
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
                    ? 'border-gold-400 bg-gold-400/10 text-gold-400'
                    : 'border-dark-600 text-gray-400 hover:border-gray-500'
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

        <div className="flex items-start gap-2 text-xs text-gray-500 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
          <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Checkout opens in your browser. Your coach's Discord handle will be shown after payment.
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <button
          onClick={book}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? 'Opening checkout…' : `Pay ${sessionPrice(coach.hourlyRate, duration)}`}
        </button>
      </div>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

type SortPrice = 'asc' | 'desc' | null

interface FilterState {
  champ:  string
  role:   string | null
  region: string | null
  price:  SortPrice
}

function FilterBar({ coaches, filters, setFilters, resultCount }: {
  coaches:     CoachData[]
  filters:     FilterState
  setFilters:  (f: FilterState) => void
  resultCount: number
}) {
  const regions = useMemo(() => {
    const seen = new Set<string>()
    coaches.forEach((c) => seen.add(c.region))
    return [...seen].sort()
  }, [coaches])

  const hasFilter = !!filters.champ || !!filters.role || !!filters.region || !!filters.price

  function set(partial: Partial<FilterState>) { setFilters({ ...filters, ...partial }) }
  function clear() { setFilters({ champ: '', role: null, region: null, price: null }) }
  function togglePrice(dir: 'asc' | 'desc') { set({ price: filters.price === dir ? null : dir }) }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <input
            type="text"
            value={filters.champ}
            onChange={(e) => set({ champ: e.target.value })}
            placeholder="Filter by champion…"
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-gold-400/50 transition-colors"
          />
          {filters.champ && (
            <button onClick={() => set({ champ: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {regions.length > 1 && (
          <select
            value={filters.region ?? ''}
            onChange={(e) => set({ region: e.target.value || null })}
            className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gold-400/50 transition-colors cursor-pointer"
          >
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{regionLabel(r)}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1 bg-dark-700 border border-dark-600 rounded-lg p-1">
          <span className="text-xs text-gray-500 px-1.5 select-none">Price</span>
          <button onClick={() => togglePrice('asc')} title="Cheapest first"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              filters.price === 'asc'
                ? 'bg-gold-400/15 text-gold-400 border border-gold-400/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <ChevronUp className="w-3.5 h-3.5" /> Low
          </button>
          <button onClick={() => togglePrice('desc')} title="Most expensive first"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              filters.price === 'desc'
                ? 'bg-gold-400/15 text-gold-400 border border-gold-400/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <ChevronDown className="w-3.5 h-3.5" /> High
          </button>
        </div>
      </div>

      {/* Role pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 uppercase tracking-wide mr-1 select-none">Role</span>
        <button onClick={() => set({ role: null })}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${
            !filters.role
              ? 'bg-gold-400/15 text-gold-400 border-gold-400/30 font-semibold'
              : 'bg-dark-700 text-gray-500 border-dark-600 hover:text-gray-300'
          }`}>
          All
        </button>
        {ALL_ROLES.map((role) => (
          <button key={role}
            onClick={() => set({ role: filters.role === role ? null : role })}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              filters.role === role
                ? 'bg-gold-400/15 text-gold-400 border-gold-400/30 font-semibold'
                : 'bg-dark-700 text-gray-500 border-dark-600 hover:text-gray-300'
            }`}>
            {role}
          </button>
        ))}
      </div>

      {hasFilter && (
        <div className="flex items-center justify-between pt-1 border-t border-dark-600/50">
          <span className="text-xs text-gray-500">
            {resultCount === 0
              ? 'No coaches match'
              : `${resultCount} coach${resultCount !== 1 ? 'es' : ''} found`}
          </span>
          <button onClick={clear}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
            <X className="w-3 h-3" /> Clear filters
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CoachingPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [coaches,    setCoaches]    = useState<CoachData[]>([])
  const [loading,    setLoading]    = useState(true)
  const [bookTarget, setBookTarget] = useState<CoachData | null>(null)
  const [filters,    setFilters]    = useState<FilterState>({
    champ: '', role: null, region: null, price: null,
  })

  const isFull = user?.accountType === 'full'

  const load = useCallback(async () => {
    const { data } = await api.get<{ coaches?: CoachData[] }>('/api/coaching/coaches')
    setCoaches(data?.coaches ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    let list = [...coaches]
    if (filters.champ.trim()) {
      const q = filters.champ.trim().toLowerCase()
      list = list.filter((c) => c.champions.some((ch) => ch.id.toLowerCase().includes(q)))
    }
    if (filters.role)   { const r = filters.role;   list = list.filter((c) => c.roles.includes(r)) }
    if (filters.region) { const r = filters.region; list = list.filter((c) => c.region === r) }
    if (filters.price === 'asc')  list.sort((a, b) => a.hourlyRate - b.hourlyRate)
    if (filters.price === 'desc') list.sort((a, b) => b.hourlyRate - a.hourlyRate)
    return list
  }, [coaches, filters])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-6 h-6 text-gold-400" />
          <h1 className="text-2xl font-bold text-white">
            1v1 <span className="text-amber-400">Coaching</span>
          </h1>
        </div>
        <p className="text-sm text-gray-400 mt-1 max-w-xl">
          Tired of grinding matchups blind? Hire a verified Masters+ coach to play through
          the matchup with you and break down exactly what you&apos;re doing wrong.
        </p>
      </div>

      {/* Coach application callout */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-white">
            Interested in coaching on Duelr? Set your own rates and have clients come to you!
          </h2>
        </div>
        <p className="text-sm text-gray-400 mb-3">
          Reach out to{' '}
          <button
            onClick={() => window.duelr.shell.openExternal('mailto:playduelrsupport@gmail.com')}
            className="text-amber-400 hover:underline font-medium"
          >
            playduelrsupport@gmail.com
          </button>{' '}
          and include the following:
        </p>
        <ul className="space-y-1.5 text-sm text-gray-400">
          {[
            'Minimum Rank: Masters',
            'Your Op.gg profile link',
            'Your Discord username',
            'A quick bio — rank, peak rank, main role',
            "Champions you're comfortable coaching",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">·</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Not logged in */}
      {!user && (
        <div className="card text-center py-10 space-y-3">
          <Shield className="w-10 h-10 mx-auto text-gray-700" />
          <p className="font-semibold text-white">Log in to book a session</p>
          <p className="text-sm text-gray-500">A full account is required to purchase coaching.</p>
          <button onClick={() => navigate('/login')}
            className="btn-primary inline-flex items-center gap-2 mt-1">
            <LogIn className="w-4 h-4" /> Log in
          </button>
        </div>
      )}

      {/* Guest account — needs full account */}
      {user && !isFull && (
        <div className="card text-center py-10 space-y-3">
          <Shield className="w-10 h-10 mx-auto text-gray-700" />
          <p className="font-semibold text-white">Full account required</p>
          <p className="text-sm text-gray-500">Purchasing coaching requires an email + password account.</p>
          <button
            onClick={() => window.duelr.shell.openExternal('https://playduelr.gg/coaching')}
            className="btn-secondary inline-flex items-center gap-2 mt-1">
            Register on playduelr.gg
          </button>
        </div>
      )}

      {/* Coach board — shown to all full accounts */}
      {user && isFull && (
        loading ? (
          <div className="flex items-center justify-center py-16 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading coaches…
          </div>
        ) : coaches.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Shield className="w-10 h-10 text-gray-700 mx-auto" />
            <p className="text-gray-500">No coaches available yet — check back soon.</p>
          </div>
        ) : (
          <>
            <FilterBar
              coaches={coaches}
              filters={filters}
              setFilters={setFilters}
              resultCount={visible.length}
            />

            {visible.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <SlidersHorizontal className="w-8 h-8 text-gray-700 mx-auto" />
                <p className="text-gray-500 text-sm">No coaches match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {visible.map((coach) => (
                  <CoachCard
                    key={coach.id}
                    coach={coach}
                    onBook={() => setBookTarget(coach)}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}

      {bookTarget && (
        <BookModal coach={bookTarget} onClose={() => setBookTarget(null)} />
      )}
    </div>
  )
}
