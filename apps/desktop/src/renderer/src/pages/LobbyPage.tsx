import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Radio, CheckCircle, XCircle, Swords,
  LogIn, Copy, ExternalLink, Clock, Users, Trophy, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLcu } from '../hooks/useLcu'
import ChampionSelector from '../components/ChampionSelector'
import PlayerCard from '../components/PlayerCard'
import api from '../lib/api'
import { ELO_BRACKETS, type EloBracket } from '../lib/constants'
import type { Champion, LobbyPlayer, AcceptsType, ChallengePayload } from '../lib/lobby-types'

// ── Types ──────────────────────────────────────────────────────────────────────

type LobbyPhase =
  | { kind: 'idle' }
  | { kind: 'available'; expiresAt: number }
  | { kind: 'challenging'; targetRiotId: string; challengeId: string }
  | { kind: 'challenged'; payload: ChallengePayload }
  | { kind: 'matched'; opponentRiotId: string; voiceChannelUrl?: string; matchId: string; lobbyJoinUrl?: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function champById(champions: Champion[], id: string): Champion | undefined {
  return champions.find((c) => c.id === id)
}

const BRACKET_LABELS: Record<string, string> = {
  low: 'Low Elo', mid: 'Mid Elo', high: 'High Elo', elite: 'Elite', apex: 'Apex',
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const lcu      = useLcu()

  // ── Champion data
  const [champions, setChampions]           = useState<Champion[]>([])
  const [champLoading, setChampLoading]     = useState(true)

  // ── Form state
  const [myChampId, setMyChampId]           = useState('')
  const [acceptsType, setAcceptsType]       = useState<AcceptsType>('any')
  const [vsChampIds, setVsChampIds]         = useState<string[]>([])
  const [eloBracket, setEloBracket]         = useState<EloBracket>('mid')

  // ── Lobby state
  const [players, setPlayers]               = useState<LobbyPlayer[]>([])
  const [phase, setPhase]                   = useState<LobbyPhase>({ kind: 'idle' })
  const [submitting, setSubmitting]         = useState(false)
  const [error, setError]                   = useState('')
  const [copied, setCopied]                 = useState(false)
  const [creatingLobby, setCreatingLobby]   = useState(false)
  const [reportState, setReportState]       = useState<
    | { status: 'idle' }
    | { status: 'reporting' }
    | { status: 'reported'; result: 'win' | 'loss' }
    | { status: 'failed' }
    | { status: 'manual' }   // game ended, LCU couldn't detect result
  >({ status: 'idle' })

  // SSE connection ref
  const esRef = useRef<EventSource | null>(null)

  // ── Load champion list ─────────────────────────────────────────────────────

  useEffect(() => {
    api.get<{ champions?: Champion[] }>('/api/champions').then(({ data }) => {
      if (data?.champions) setChampions(data.champions)
      setChampLoading(false)
    }).catch(() => setChampLoading(false))
  }, [])

  // ── Restore form from localStorage ────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem('duelr:lobbyForm')
      if (saved) {
        const { myChampId: c, acceptsType: a, vsChampIds: v, eloBracket: e } = JSON.parse(saved)
        if (c) setMyChampId(c)
        if (a) setAcceptsType(a)
        if (v) setVsChampIds(v)
        if (e) setEloBracket(e)
      }
    } catch { /* ignore */ }
  }, [])

  function saveForm(c: string, a: AcceptsType, v: string[], e: EloBracket) {
    localStorage.setItem('duelr:lobbyForm', JSON.stringify({ myChampId: c, acceptsType: a, vsChampIds: v, eloBracket: e }))
  }

  // ── LCU champion auto-fill ─────────────────────────────────────────────────

  useEffect(() => {
    if (!lcu.lockedChampion) return
    const champ = champById(champions, lcu.lockedChampion)
    if (champ) {
      setMyChampId(champ.id)
    }
  }, [lcu.lockedChampion, champions])

  // ── Fetch player list ──────────────────────────────────────────────────────

  const fetchPlayers = useCallback(async () => {
    const { data } = await api.get<{ players?: LobbyPlayer[] }>('/api/lobby/players')
    if (data?.players) setPlayers(data.players)
  }, [])

  // Poll every 3 s
  useEffect(() => {
    fetchPlayers()
    const id = setInterval(fetchPlayers, 3000)
    return () => clearInterval(id)
  }, [fetchPlayers])

  // ── Re-arm lobby status on mount (detect if already available) ─────────────

  useEffect(() => {
    if (!user) return
    api.get<{ available?: boolean; expiresAt?: number }>('/api/lobby/status').then(({ data }) => {
      if (data?.available && data.expiresAt) {
        setPhase({ kind: 'available', expiresAt: data.expiresAt })
      }
    }).catch(() => { /* ignore */ })
  }, [user])

  // ── Register active match with main process for EOG auto-reporting ─────────

  useEffect(() => {
    const matchId = phase.kind === 'matched' ? phase.matchId : null
    window.duelr.match.setActive(matchId)
  // Depend on the actual matchId string (null when not in matched phase)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'matched' ? phase.matchId : null])

  // ── Sync tray status with lobby phase ────────────────────────────────────

  useEffect(() => {
    switch (phase.kind) {
      case 'available':
        window.duelr.tray.setStatus({ kind: 'available' })
        break
      case 'matched':
        window.duelr.tray.setStatus({ kind: 'matched', opponent: phase.opponentRiotId })
        break
      case 'idle':
      case 'challenging':
      case 'challenged':
        window.duelr.tray.setStatus({ kind: 'idle' })
        break
    }
  }, [phase.kind])

  // ── Listen for end-of-game result from main process ──────────────────────

  useEffect(() => {
    window.duelr.lcu.onEogResult(async ({ matchId, result }) => {
      // Only act if this result is for our current match and we haven't reported yet
      setPhase((current) => {
        if (current.kind !== 'matched' || current.matchId !== matchId) return current
        return current
      })

      // We need the matchId from the current phase at call time — use a ref approach
      // by checking inside an async IIFE captured at event time
      ;(async () => {
        setReportState({ status: result ? 'reporting' : 'manual' })
        if (!result) return

        try {
          const { ok } = await api.post(`/api/match/${matchId}/report`, { result })
          if (ok) {
            setReportState({ status: 'reported', result })
            window.duelr.notify(
              result === 'win' ? 'Victory reported!' : 'Defeat reported',
              'Your match result has been automatically submitted.'
            )
          } else {
            setReportState({ status: 'failed' })
          }
        } catch {
          setReportState({ status: 'failed' })
        }
      })()
    })

    return () => {
      window.duelr.lcu.offEogResult()
    }
  }, [])

  // ── SSE — real-time challenge / match notifications ────────────────────────

  useEffect(() => {
    if (!user) return

    const es = new EventSource('https://playduelr.gg/api/notifications/stream', {
      withCredentials: true,
    })
    esRef.current = es

    // The stream sends unnamed data: events — use onmessage, not addEventListener
    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'challenge') {
          const payload = data as ChallengePayload
          setPhase({ kind: 'challenged', payload })
          window.duelr.notify(
            'Challenge received!',
            `${payload.challengerRiotId} wants to 1v1 as ${payload.challengerChampName}`
          )
        } else if (data.type === 'challenge_accepted') {
          // Sent to the challenger when the responder accepts
          const opp = data.opponent as {
            riotId: string; matchId: string; voiceChannelUrl?: string
          }
          setPhase({
            kind: 'matched',
            matchId: opp.matchId,
            opponentRiotId: opp.riotId,
            voiceChannelUrl: opp.voiceChannelUrl,
          })
          window.duelr.notify('Match found!', `vs ${opp.riotId}`)
          if (opp.voiceChannelUrl) window.duelr.discord.joinVoice(opp.voiceChannelUrl)
        } else if (data.type === 'challenge_declined') {
          setPhase((p) =>
            p.kind === 'challenging'
              ? { kind: 'available', expiresAt: Date.now() + 3600_000 }
              : p
          )
        } else if (data.type === 'lobby_url') {
          // Opponent set the custom game join URL — update our phase
          setPhase((p) =>
            p.kind === 'matched' ? { ...p, lobbyJoinUrl: data.joinUrl as string } : p
          )
        }
      } catch { /* ignore */ }
    }

    es.onerror = () => {
      // SSE error — the EventSource will auto-reconnect; nothing to do
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [user])

  // ── Poll for lobbyJoinUrl when in matched state (SSE may have closed) ───────

  const polledMatchId   = phase.kind === 'matched' ? phase.matchId   : null
  const existingJoinUrl = phase.kind === 'matched' ? phase.lobbyJoinUrl : null

  useEffect(() => {
    if (!polledMatchId || existingJoinUrl) return
    const id = setInterval(async () => {
      const { data } = await api.get<{ lobbyJoinUrl?: string | null }>(
        `/api/match/${polledMatchId}`
      )
      if (data?.lobbyJoinUrl) {
        setPhase((p) =>
          p.kind === 'matched' ? { ...p, lobbyJoinUrl: data.lobbyJoinUrl! } : p
        )
      }
    }, 5000)
    return () => clearInterval(id)
  }, [polledMatchId, existingJoinUrl])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function goAvailable() {
    const champ = champById(champions, myChampId)
    if (!champ) { setError('Select your champion first.'); return }
    setSubmitting(true)
    setError('')

    const result = await api.post<{ expiresAt?: number; error?: string; message?: string }>('/api/lobby/available', {
      myChampion:  champ.id,
      champName:   champ.name,
      champImage:  champ.imageUrl,
      eloBracket,
      acceptsType,
      vsChampions: vsChampIds,
    })

    if (result.ok) {
      setPhase({ kind: 'available', expiresAt: Date.now() + 3600_000 })
      saveForm(myChampId, acceptsType, vsChampIds, eloBracket)
      fetchPlayers()
    } else {
      const msg = result.data?.error ?? result.data?.message
      console.error('[Lobby] goAvailable failed — status:', result.status, 'body:', result.data)
      setError(msg ?? 'Failed to mark available. Please try again.')
    }
    setSubmitting(false)
  }

  async function goUnavailable() {
    setSubmitting(true)
    await api.post('/api/lobby/leave')
    setPhase({ kind: 'idle' })
    fetchPlayers()
    setSubmitting(false)
  }

  async function sendChallenge(target: LobbyPlayer) {
    if (phase.kind !== 'available') {
      setError('You must be available to challenge someone.')
      return
    }
    setSubmitting(true)
    const { ok, data } = await api.post<{ challengeId?: string; error?: string }>(
      '/api/lobby/challenge',
      { targetUserId: target.userId }
    )
    if (ok && data?.challengeId) {
      setPhase({ kind: 'challenging', targetRiotId: target.riotId, challengeId: data.challengeId })
    } else {
      setError(data?.error ?? 'Challenge failed — the player may have left.')
    }
    setSubmitting(false)
  }

  async function respondChallenge(accept: boolean) {
    if (phase.kind !== 'challenged') return
    setSubmitting(true)
    const { ok, data } = await api.post<{
      match?: { id: string; opponentRiotId: string; voiceChannelUrl?: string }
    }>('/api/lobby/respond', {
      challengeId: phase.payload.challengeId,
      accept,
    })

    if (accept && ok && data?.match) {
      setPhase({
        kind: 'matched',
        matchId: data.match.id,
        opponentRiotId: data.match.opponentRiotId,
        voiceChannelUrl: data.match.voiceChannelUrl,
      })
      window.duelr.notify('Match confirmed!', `vs ${data.match.opponentRiotId} — set up your custom game`)
      if (data.match.voiceChannelUrl) {
        window.duelr.discord.joinVoice(data.match.voiceChannelUrl)
      }
    } else if (accept && ok && !data?.match) {
      // Fallback: server didn't return match object (shouldn't happen, but handle gracefully)
      setError('Match found but details unavailable. Reload the app.')
      setPhase({ kind: 'available', expiresAt: Date.now() + 3600_000 })
    } else if (!accept) {
      setPhase({ kind: 'available', expiresAt: Date.now() + 3600_000 })
    } else {
      setError('Failed to respond to challenge. Please try again.')
      setPhase({ kind: 'available', expiresAt: Date.now() + 3600_000 })
    }
    setSubmitting(false)
  }

  async function cancelChallenge() {
    setPhase({ kind: 'available', expiresAt: Date.now() + 3600_000 })
  }

  async function handleCreateLobby() {
    if (phase.kind !== 'matched') return
    setCreatingLobby(true)

    const joinUrl = await window.duelr.lcu.createLobby()

    if (joinUrl) {
      // Update local state immediately
      setPhase((p) => p.kind === 'matched' ? { ...p, lobbyJoinUrl: joinUrl } : p)

      // Copy to clipboard automatically
      navigator.clipboard.writeText(joinUrl).catch(() => { /* ignore */ })

      // Store on the Duelr match so the opponent can see it too
      api.patch(`/api/match/${phase.matchId}/lobby-url`, { joinUrl }).catch(() => { /* non-critical */ })
    } else {
      setError('Could not create lobby — make sure League is open and not in a game.')
    }
    setCreatingLobby(false)
  }

  async function reportManually(matchId: string, result: 'win' | 'loss') {
    setReportState({ status: 'reporting' })
    try {
      const { ok } = await api.post(`/api/match/${matchId}/report`, { result })
      if (ok) {
        setReportState({ status: 'reported', result })
        window.duelr.notify(
          result === 'win' ? 'Victory reported!' : 'Defeat reported',
          'Match result submitted.'
        )
      } else {
        setReportState({ status: 'failed' })
      }
    } catch {
      setReportState({ status: 'failed' })
    }
  }

  function resetToIdle() {
    setReportState({ status: 'idle' })
    goUnavailable()
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const myChamp  = champById(champions, myChampId)
  const isBusy   = phase.kind !== 'idle' && phase.kind !== 'available'
  const otherPlayers = players.filter((p) => !user || p.userId !== user.id)

  // ── Toggle vsChampions ─────────────────────────────────────────────────────

  function toggleVsChamp(id: string) {
    setVsChampIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Open <span className="text-gold-400">Lobby</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Mark yourself available — other players can see you and send a direct challenge.
        </p>
      </div>

      {/* ── MATCH FOUND ───────────────────────────────────────────────────── */}
      {phase.kind === 'matched' && (
        <div className="card border-emerald-700/50 bg-emerald-950/20 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-white">Match found!</p>
              <p className="text-sm text-gray-400">
                vs <span className="text-white font-medium">{phase.opponentRiotId}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Copy opponent Riot ID */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(phase.opponentRiotId)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Riot ID'}
            </button>

            {/* Join Discord voice */}
            {phase.voiceChannelUrl && (
              <button
                onClick={() => window.duelr.discord.joinVoice(phase.voiceChannelUrl!)}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Join Discord Voice
              </button>
            )}

            {/* Done */}
            <button onClick={resetToIdle} className="btn-ghost text-sm">
              Done
            </button>
          </div>

          {/* LCU lobby creation — shown when League is connected */}
          {lcu.connected && !phase.lobbyJoinUrl && (
            <div className="pt-2 border-t border-dark-600">
              <button
                onClick={handleCreateLobby}
                disabled={creatingLobby}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {creatingLobby
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Swords className="w-4 h-4" />}
                {creatingLobby ? 'Creating lobby…' : 'Create Custom Game & Get Join Link'}
              </button>
              <p className="text-xs text-gray-600 mt-1.5">
                Auto-creates a 1v1 custom game in League and generates a shareable link for your opponent
              </p>
            </div>
          )}

          {/* Join URL — shown after lobby is created */}
          {phase.lobbyJoinUrl && (
            <div className="pt-2 border-t border-dark-600 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Game Join Link</p>
              <div className="flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-300 flex-1 truncate font-mono">{phase.lobbyJoinUrl}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(phase.lobbyJoinUrl!)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="text-gold-400 hover:text-gold-300 flex-shrink-0"
                  title="Copy join link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.duelr.shell.openExternal(phase.lobbyJoinUrl!)}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Join Lobby
                </button>
                <p className="text-xs text-gray-600 self-center">
                  {copied ? '✓ Copied!' : 'Share with your opponent or click to join'}
                </p>
              </div>
            </div>
          )}

          {!lcu.connected && !phase.lobbyJoinUrl && (
            <p className="text-xs text-gray-600 pt-1">
              Start League to auto-create a custom game and get a shareable join link.
            </p>
          )}

          {/* ── Match result reporting ── */}
          <div className="pt-2 border-t border-dark-600">
            {reportState.status === 'idle' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Report Result
                </p>
                <p className="text-xs text-gray-600">
                  {lcu.connected
                    ? 'Result will be auto-detected when your game ends.'
                    : 'Game finished? Report your result manually.'}
                </p>
                {!lcu.connected && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => reportManually(phase.matchId, 'win')}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Trophy className="w-3.5 h-3.5" /> I Won
                    </button>
                    <button
                      onClick={() => reportManually(phase.matchId, 'loss')}
                      className="btn-ghost text-xs text-gray-400 flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> I Lost
                    </button>
                  </div>
                )}
              </div>
            )}

            {reportState.status === 'reporting' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting result…
              </div>
            )}

            {reportState.status === 'reported' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                {reportState.result === 'win' ? 'Victory' : 'Defeat'} reported automatically. GG!
              </div>
            )}

            {(reportState.status === 'failed' || reportState.status === 'manual') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {reportState.status === 'failed'
                    ? 'Auto-report failed — please report manually.'
                    : 'Game ended — report your result:'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => reportManually(phase.matchId, 'win')}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5" /> I Won
                  </button>
                  <button
                    onClick={() => reportManually(phase.matchId, 'loss')}
                    className="btn-ghost text-xs text-gray-400 flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> I Lost
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INCOMING CHALLENGE ────────────────────────────────────────────── */}
      {phase.kind === 'challenged' && (
        <div className="card border-amber-700/50 bg-amber-950/20 space-y-4">
          <div className="flex items-start gap-3">
            <Swords className="w-6 h-6 text-gold-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-white">Challenge received!</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-8 h-8 rounded-full ring-1 ring-dark-600 overflow-hidden">
                  <img
                    src={phase.payload.challengerChampImage}
                    alt={phase.payload.challengerChampName}
                    width={32}
                    height={32}
                    className="scale-110 object-cover w-full h-full"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{phase.payload.challengerRiotId}</p>
                  <p className="text-xs text-gray-500">
                    {phase.payload.challengerChampName} ·{' '}
                    {BRACKET_LABELS[phase.payload.challengerElo] ?? phase.payload.challengerElo}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => respondChallenge(true)}
              disabled={submitting}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Accept
            </button>
            <button
              onClick={() => respondChallenge(false)}
              disabled={submitting}
              className="btn-ghost flex items-center gap-2 text-sm text-gray-400"
            >
              <XCircle className="w-4 h-4" />
              Decline
            </button>
          </div>
        </div>
      )}

      {/* ── CHALLENGING ───────────────────────────────────────────────────── */}
      {phase.kind === 'challenging' && (
        <div className="card border-blue-700/50 space-y-3">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400 animate-pulse flex-shrink-0" />
            <div>
              <p className="font-semibold text-white">Challenge sent</p>
              <p className="text-sm text-gray-400">
                Waiting for <span className="text-white">{phase.targetRiotId}</span> to respond…
              </p>
            </div>
          </div>
          <button onClick={cancelChallenge} className="btn-ghost text-sm text-gray-500">
            Cancel
          </button>
        </div>
      )}

      {/* ── LOBBY FORM (available) ─────────────────────────────────────────── */}
      {user && phase.kind === 'available' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">You&apos;re available</span>
            </div>
            {myChamp && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-gold-400">
                  <img src={myChamp.imageUrl} alt={myChamp.name} width={24} height={24} className="scale-110 object-cover w-full h-full" />
                </div>
                {myChamp.name} · {BRACKET_LABELS[eloBracket]}
              </div>
            )}
          </div>
          <button
            onClick={goUnavailable}
            disabled={submitting}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Stop looking
          </button>
        </div>
      )}

      {/* ── LOBBY FORM (idle) ──────────────────────────────────────────────── */}
      {user && phase.kind === 'idle' && (
        <div className="card space-y-5">
          <h2 className="font-semibold text-white text-sm uppercase tracking-wide">Post your lobby</h2>

          {/* LCU hint */}
          {lcu.connected && lcu.phase === 'ChampSelect' && !lcu.lockedChampion && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-950/30 border border-blue-800/30 rounded-lg text-xs text-blue-300">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              Waiting for champion lock-in…
            </div>
          )}
          {lcu.lockedChampion && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/30 border border-emerald-800/30 rounded-lg text-xs text-emerald-300">
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              Auto-filled from League: <span className="font-semibold ml-1">{lcu.lockedChampion}</span>
            </div>
          )}

          {/* My champion */}
          {!champLoading ? (
            <ChampionSelector
              label="I'll play"
              value={myChampId}
              onChange={setMyChampId}
              champions={champions}
              placeholder="Select your champion…"
            />
          ) : (
            <div className="input flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading champions…
            </div>
          )}

          {/* ELO bracket */}
          <div>
            <label className="label">ELO bracket</label>
            <div className="grid grid-cols-5 gap-1">
              {ELO_BRACKETS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setEloBracket(b.value)}
                  className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                    eloBracket === b.value
                      ? 'bg-gold-400 text-dark-900 border-gold-400'
                      : 'bg-dark-700 text-gray-400 border-dark-600 hover:border-gold-400/50'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {ELO_BRACKETS.find((b) => b.value === eloBracket)?.description}
            </p>
          </div>

          {/* Accepts type */}
          <div>
            <label className="label">I&apos;ll play against</label>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { value: 'any',    label: 'Any' },
                  { value: 'melee',  label: 'Any Melee' },
                  { value: 'ranged', label: 'Any Ranged' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAcceptsType(opt.value)}
                  className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                    acceptsType === opt.value
                      ? 'bg-gold-400 text-dark-900 border-gold-400'
                      : 'bg-dark-700 text-gray-400 border-dark-600 hover:border-gold-400/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred matchups (vsChampions) */}
          <div>
            <label className="label">
              Preferred Matchups
              <span className="text-gray-600 font-normal ml-1">— optional, up to 5</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">
              Tell people who you&apos;d prefer to play against
            </p>

            {/* Selected chips */}
            {vsChampIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {vsChampIds.map((id) => {
                  const c = champById(champions, id)
                  if (!c) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleVsChamp(id)}
                      className="flex items-center gap-1.5 px-2 py-1 bg-dark-700 border border-gold-400/30
                                 rounded-full text-xs text-gray-300 hover:border-red-400/50 hover:text-red-400 transition-colors"
                    >
                      <div className="w-4 h-4 rounded-full overflow-hidden">
                        <img src={c.imageUrl} alt={c.name} width={16} height={16} className="scale-110 object-cover w-full h-full" />
                      </div>
                      {c.name} ×
                    </button>
                  )
                })}
              </div>
            )}

            {/* Inline champion picker (small grid) */}
            {vsChampIds.length < 5 && !champLoading && (
              <VsChampPicker
                champions={champions}
                selected={vsChampIds}
                onToggle={toggleVsChamp}
              />
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={goAvailable}
            disabled={submitting || !myChampId}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            {submitting ? 'Posting…' : 'Go Available'}
          </button>
        </div>
      )}

      {/* ── GUEST CTA ──────────────────────────────────────────────────────── */}
      {!user && (
        <div className="card text-center py-8 space-y-3">
          <Radio className="w-8 h-8 mx-auto text-gray-600" />
          <p className="font-semibold text-white">Want to post your own lobby?</p>
          <p className="text-sm text-gray-500">
            Log in with your Riot ID to mark yourself available and challenge other players.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary inline-flex items-center gap-2 mt-1"
          >
            <LogIn className="w-4 h-4" />
            Log in to play
          </button>
        </div>
      )}

      {/* ── PLAYER LIST ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            Available Players
            <span className="text-sm text-gray-600 font-normal">({otherPlayers.length})</span>
          </h2>
        </div>

        {otherPlayers.length === 0 ? (
          <div className="card text-center py-8 text-gray-600 text-sm">
            No one is available right now — be the first to post!
          </div>
        ) : (
          <div className="space-y-2">
            {otherPlayers.map((p) => (
              <PlayerCard
                key={p.userId}
                player={p}
                isGuest={!user}
                isSelf={false}
                isBusy={isBusy}
                champions={champions}
                onChallenge={sendChallenge}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vs Champ Picker ─────────────────────────────────────────────────────────

function VsChampPicker({
  champions, selected, onToggle,
}: { champions: Champion[]; selected: string[]; onToggle: (id: string) => void }) {
  const [query, setQuery] = useState('')

  const filtered = query
    ? champions.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : champions.slice(0, 60) // show first 60 alphabetically when no query

  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl overflow-hidden">
      <div className="p-2 border-b border-dark-600">
        <input
          type="text"
          placeholder="Search champion to add…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-sm
                     text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
        />
      </div>
      <div className="grid grid-cols-6 gap-0.5 p-1.5 max-h-72 overflow-y-auto">
        {filtered.map((c) => {
          const isSelected = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              title={c.name}
              className={`relative w-full aspect-square rounded-md overflow-hidden transition-all ${
                isSelected
                  ? 'ring-2 ring-gold-400 brightness-100'
                  : 'ring-1 ring-dark-600 hover:ring-gold-400/50 brightness-75 hover:brightness-100'
              }`}
            >
              <img
                src={c.imageUrl}
                alt={c.name}
                width={48}
                height={48}
                className="w-full h-full object-cover scale-110"
              />
              {isSelected && (
                <div className="absolute inset-0 bg-gold-400/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-gold-400 drop-shadow" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
