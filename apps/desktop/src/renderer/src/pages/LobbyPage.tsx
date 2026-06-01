import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Radio, CheckCircle, XCircle, Swords,
  LogIn, Copy, ExternalLink, Clock, Users, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLcu } from '../hooks/useLcu'
import ChampionSelector from '../components/ChampionSelector'
import PlayerCard from '../components/PlayerCard'
import { RankCrest } from '../components/LcuProfilePanels'
import {
  GroupCreateForm, GroupCard, MyGroupPanel, GroupReadyScreen, type GroupReady,
} from '../components/LobbyGroups'
import api from '../lib/api'
import { ELO_BRACKETS, type EloBracket } from '../lib/constants'
import type {
  Champion, LobbyPlayer, AcceptsType, ChallengePayload,
  LobbyMode, LobbyGroup, SlotKey, GroupSlot,
} from '../lib/lobby-types'
import { userSlotIn } from '../lib/lobby-types'

// ── Types ──────────────────────────────────────────────────────────────────────

type LobbyPhase =
  | { kind: 'idle' }
  | { kind: 'available'; expiresAt: number }
  | { kind: 'challenging'; targetRiotId: string; challengeId: string }
  | { kind: 'challenged'; payload: ChallengePayload }
  | { kind: 'matched'; opponentRiotId: string; voiceChannelUrl?: string; matchId: string; lobbyJoinUrl?: string; role: 'challenger' | 'challenged'; challengerPlatform: 'web' | 'desktop' }

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

  // ── 2v2 state
  const [mode, setMode]                     = useState<LobbyMode>('1v1')
  const [groups, setGroups]                 = useState<LobbyGroup[]>([])
  const [myGroup, setMyGroup]               = useState<LobbyGroup | null>(null)
  const [groupReady, setGroupReady]         = useState<GroupReady | null>(null)
  const [groupCreating, setGroupCreating]   = useState(false)
  const [groupErr, setGroupErr]             = useState('')
  const [leavingGroup, setLeavingGroup]     = useState(false)
  const [joiningSlot, setJoiningSlot]       = useState<SlotKey | null>(null)
  const [submitting, setSubmitting]         = useState(false)
  const [error, setError]                   = useState('')
  const [copied, setCopied]                 = useState(false)
  const [creatingLobby, setCreatingLobby]   = useState(false)
  const [lobbyDebug, setLobbyDebug]         = useState('')
  const [reportState, setReportState]       = useState<
    | { status: 'idle' }
    | { status: 'reporting' }
    | { status: 'reported'; result: 'win' | 'loss' }
    | { status: 'failed' }   // LCU couldn't detect first blood, or submit failed
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
    const { data } = await api.get<{
      players?: LobbyPlayer[]; groups?: LobbyGroup[]; myGroup?: LobbyGroup | null
    }>('/api/lobby/players')
    if (data?.players) setPlayers(data.players)
    setGroups(data?.groups ?? [])
    setMyGroup(data?.myGroup ?? null)
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
    window.duelr.lcu.onEogResult(async ({ matchId, result, myChampion, oppChampion }) => {
      // No manual fallback exists — the LCU first-blood read is the only source
      // of truth. If it couldn't determine a result, the match isn't recorded.
      if (!result) {
        setReportState({ status: 'failed' })
        return
      }

      setReportState({ status: 'reporting' })

      // Retry a few times to ride out transient network/server errors, since the
      // player has no way to re-submit by hand. Champions are sent alongside the
      // result so the Match record reflects what was actually played.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { ok } = await api.post(`/api/match/${matchId}/report`, {
            result,
            myChampion,
            oppChampion,
          })
          if (ok) {
            setReportState({ status: 'reported', result })
            window.duelr.notify(
              result === 'win' ? 'Victory recorded!' : 'Defeat recorded',
              'Result auto-detected from first blood.'
            )
            return
          }
        } catch {
          // fall through to retry
        }
        await new Promise((r) => setTimeout(r, 1500))
      }

      setReportState({ status: 'failed' })
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
            role: 'challenger',
            // This is the desktop app issuing the challenge, so the challenger
            // (us) is always on desktop — lobby links are supported.
            challengerPlatform: 'desktop',
            matchId: opp.matchId,
            opponentRiotId: opp.riotId,
            voiceChannelUrl: opp.voiceChannelUrl,
          })
          setError('')
          window.duelr.notify('Match found!', `vs ${opp.riotId}`)
          // Voice join is manual — user clicks "Join Discord Voice" in the matched card.
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
        } else if (data.type === 'group_updated') {
          const updated = data.group as LobbyGroup
          setMyGroup((prev) => prev?.groupId === updated.groupId ? updated : prev)
          setGroups((prev) => prev.map((g) => g.groupId === updated.groupId ? updated : g))
        } else if (data.type === 'group_ready') {
          setGroupReady({
            team1: data.team1, team2: data.team2, voiceChannelUrl: data.voiceChannelUrl,
            readyGroupId: data.readyGroupId, hostUserId: data.hostUserId,
          })
          setMyGroup(null)
          window.duelr.notify('2v2 group ready!', 'All 4 players are in — set up your custom game.')
        } else if (data.type === 'group_lobby_url') {
          setGroupReady((prev) =>
            prev && prev.readyGroupId === data.readyGroupId
              ? { ...prev, joinUrl: data.joinUrl as string }
              : prev
          )
        } else if (data.type === 'group_disbanded') {
          setMyGroup(null)
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
  // Only poll when a join link can actually be generated (challenger on desktop).
  const pollForJoinUrl  = phase.kind === 'matched' && phase.challengerPlatform === 'desktop'

  useEffect(() => {
    if (!polledMatchId || existingJoinUrl || !pollForJoinUrl) return
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
  }, [polledMatchId, existingJoinUrl, pollForJoinUrl])

  // ── Poll for the 2v2 group custom-game link (members, SSE fallback) ─────────

  const readyGroupId   = groupReady?.readyGroupId ?? null
  const readyJoinUrl   = groupReady?.joinUrl ?? null
  const readyIsHost    = !!groupReady && groupReady.hostUserId === user?.id

  useEffect(() => {
    if (!readyGroupId || readyJoinUrl || readyIsHost) return
    const id = setInterval(async () => {
      const { data } = await api.get<{ joinUrl?: string | null }>(
        `/api/lobby/group/lobby-url?readyGroupId=${readyGroupId}`
      )
      if (data?.joinUrl) {
        setGroupReady((prev) => prev ? { ...prev, joinUrl: data.joinUrl! } : prev)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [readyGroupId, readyJoinUrl, readyIsHost])

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
      { targetUserId: target.userId, platform: 'desktop' }
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
      match?: { id: string; opponentRiotId: string; voiceChannelUrl?: string; challengerPlatform?: 'web' | 'desktop' }
    }>('/api/lobby/respond', {
      challengeId: phase.payload.challengeId,
      accept,
    })

    if (accept && ok && data?.match) {
      setPhase({
        kind: 'matched',
        role: 'challenged',
        // The challenger's platform decides whether a lobby link is ever coming.
        challengerPlatform: data.match.challengerPlatform ?? 'web',
        matchId: data.match.id,
        opponentRiotId: data.match.opponentRiotId,
        voiceChannelUrl: data.match.voiceChannelUrl,
      })
      setError('')
      window.duelr.notify('Match confirmed!', `vs ${data.match.opponentRiotId} — set up your custom game`)
      // Voice join is manual — user clicks "Join Discord Voice" in the matched card.
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
    setError('')

    const result = await window.duelr.lcu.createLobby()

    // Surface the LCU call trace (main-process logs are invisible in the packaged app).
    if (result.debug) console.log('[Duelr] createLobby trace:\n' + result.debug)
    setLobbyDebug(result.debug ?? '')

    if (!result.created) {
      setError(result.error ?? 'Not in a custom game lobby. Create one in League first, then click here.')
    } else if (result.joinUrl) {
      // Full success — lobby created and join URL obtained
      setPhase((p) => p.kind === 'matched' ? { ...p, lobbyJoinUrl: result.joinUrl! } : p)
      navigator.clipboard.writeText(result.joinUrl).catch(() => {})
      api.patch(`/api/match/${phase.matchId}/lobby-url`, { joinUrl: result.joinUrl }).catch(() => {})
    } else {
      // Lobby was created but join URL couldn't be fetched — not a hard failure
      setError('Custom game created in League! Join URL unavailable — invite your opponent from inside League.')
    }
    setCreatingLobby(false)
  }

  function resetToIdle() {
    setReportState({ status: 'idle' })
    goUnavailable()
  }

  // ── 2v2 actions ──────────────────────────────────────────────────────────────

  async function createGroup(slotKey: SlotKey, champId: string, elo: EloBracket) {
    const champ = champById(champions, champId)
    if (!champ) { setGroupErr('Select a champion first.'); return }
    setGroupErr(''); setGroupCreating(true)
    const { ok, data } = await api.post<{ group?: LobbyGroup; error?: string }>(
      '/api/lobby/group/create',
      { slotKey, champId: champ.id, champName: champ.name, champImage: champ.imageUrl, eloBracket: elo },
    )
    setGroupCreating(false)
    if (ok && data?.group) {
      setMyGroup(data.group)
      fetchPlayers()
    } else {
      setGroupErr(data?.error ?? 'Failed to create group.')
    }
  }

  async function joinGroupSlot(groupId: string, slotKey: SlotKey, champId: string) {
    const champ = champById(champions, champId)
    if (!champ) return
    setJoiningSlot(slotKey)
    const { ok, data } = await api.post<{
      group?: LobbyGroup; isFull?: boolean; voiceChannelUrl?: string
      readyGroupId?: string; hostUserId?: string; error?: string
    }>('/api/lobby/group/join', {
      groupId, slotKey, champId: champ.id, champName: champ.name, champImage: champ.imageUrl,
    })
    setJoiningSlot(null)
    if (!ok || !data?.group) { setGroupErr(data?.error ?? 'Failed to join slot.'); return }
    if (data.isFull) {
      const g = data.group
      setGroupReady({
        team1: [g.team1_adc, g.team1_support].filter(Boolean) as GroupSlot[],
        team2: [g.team2_adc, g.team2_support].filter(Boolean) as GroupSlot[],
        voiceChannelUrl: data.voiceChannelUrl,
        readyGroupId:    data.readyGroupId,
        hostUserId:      data.hostUserId,
      })
      setMyGroup(null)
    } else {
      setMyGroup(data.group)
    }
    fetchPlayers()
  }

  async function leaveGroup() {
    setLeavingGroup(true)
    await api.post('/api/lobby/group/leave')
    setMyGroup(null)
    setLeavingGroup(false)
    fetchPlayers()
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const myChamp  = champById(champions, myChampId)
  const isBusy   = (phase.kind !== 'idle' && phase.kind !== 'available') || !!myGroup
  // Exclude self. Match on id AND riotId — riotId is a reliable fallback for the
  // brief window after a fresh login before /api/me hydrates a real user.id.
  const otherPlayers = players.filter(
    (p) => !user || (p.userId !== user.id && p.riotId !== user.riotId),
  )

  // ── Toggle vsChampions ─────────────────────────────────────────────────────

  function toggleVsChamp(id: string) {
    setVsChampIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // 2v2 group ready takes over the whole view (mirrors the web flow)
  if (groupReady) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <GroupReadyScreen
          ready={groupReady}
          userId={user?.id ?? null}
          onJoinUrl={(url) => setGroupReady((prev) => prev ? { ...prev, joinUrl: url } : prev)}
          onDone={() => { setGroupReady(null); fetchPlayers() }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            Open <span className="text-gold-400">Lobby</span>
          </h1>
          {/* Live Solo/Duo ranked crest, pulled from the LCU */}
          <RankCrest />
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Mark yourself available — other players can see you and send a direct challenge.
        </p>
      </div>

      {/* ── 2v2: mode toggle ──────────────────────────────────────────────── */}
      {user && phase.kind === 'idle' && !myGroup && (
        <div className="flex rounded-xl overflow-hidden border border-dark-600 w-fit">
          {(['1v1', '2v2'] as LobbyMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${
                mode === m ? 'bg-gold-400/10 text-gold-400' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {m === '1v1' ? '1v1 · Solo' : '2v2 · Bot Lane'}
            </button>
          ))}
        </div>
      )}

      {/* ── 2v2: my group status ──────────────────────────────────────────── */}
      {myGroup && user && (
        <MyGroupPanel group={myGroup} userId={user.id} onLeave={leaveGroup} leaving={leavingGroup} />
      )}

      {/* ── 2v2: create group form ────────────────────────────────────────── */}
      {user && phase.kind === 'idle' && mode === '2v2' && !myGroup && (
        <div className="card space-y-5">
          <GroupCreateForm
            champions={champions}
            creating={groupCreating}
            error={groupErr}
            onCreate={createGroup}
          />
        </div>
      )}

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

          {/* Error feedback for matched-phase actions (lobby creation etc.) */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Diagnostic trace of the last join-link attempt (temporary). */}
          {lobbyDebug && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-300 select-none">
                Join-link diagnostics
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-dark-800 border border-dark-600 rounded-lg p-2 font-mono text-gray-400">
                {lobbyDebug}
              </pre>
            </details>
          )}

          {/* ── Join link section ── */}
          {/* Lobby links only work when the challenger is on desktop (LCU). The
              challenger here is always on desktop; the challenged player only
              shows link UI when their challenger was on desktop. */}
          {(phase.role === 'challenger' || phase.challengerPlatform === 'desktop') && (
          <div className="pt-2 border-t border-dark-600">
            {phase.lobbyJoinUrl ? null : phase.role === 'challenger' ? (
              /* Challenger: steps + button to fetch the join link */
              lcu.connected ? (
                <div className="space-y-3">
                  <div className="bg-dark-700 border border-gold-400/30 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gold-400 uppercase tracking-wide">Before you click</p>
                    <ol className="space-y-1.5">
                      <li className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-gold-400 font-bold shrink-0">1.</span>
                        <span>In League, click <span className="font-semibold text-gray-100">Play → Custom Game</span></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-gold-400 font-bold shrink-0">2.</span>
                        <span>Click <span className="font-semibold text-gray-100">Create</span> and set up a Summoner's Rift lobby</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-gold-400 font-bold shrink-0">3.</span>
                        <span>Once in the lobby, click the button below — your opponent receives the link automatically</span>
                      </li>
                    </ol>
                  </div>
                  <button
                    onClick={handleCreateLobby}
                    disabled={creatingLobby}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {creatingLobby
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Swords className="w-4 h-4" />}
                    {creatingLobby ? 'Fetching join link…' : 'Get Custom Game Join Link'}
                  </button>
                </div>
              ) : (
                <div className="bg-dark-700 border border-gold-400/30 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-gold-400 uppercase tracking-wide">League client not detected</p>
                  <p className="text-xs text-gray-300">Start League of Legends, create a <span className="font-semibold text-gray-100">Custom Game</span> lobby, then return here to generate the join link.</p>
                </div>
              )
            ) : (
              /* Challenged: spinner waiting for challenger to generate the link */
              <div className="bg-gold-400/10 border border-gold-400/40 rounded-lg p-3 flex items-center gap-3 shadow-lg shadow-gold-400/10 animate-pulse-slow">
                <Loader2 className="w-6 h-6 text-gold-400 animate-spin flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gold-400">Waiting for your opponent…</p>
                  <p className="text-xs text-gray-400 mt-0.5">Your opponent is generating the lobby invite link — it will appear here automatically.</p>
                </div>
              </div>
            )}

            {/* Join URL — shown to both once available */}
            {phase.lobbyJoinUrl && (
            <div className="pt-2 border-t border-dark-600 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {phase.role === 'challenger' ? 'Custom Game Join Link — sent to your opponent automatically' : 'Custom Game Join Link'}
              </p>
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
                {phase.role !== 'challenger' && (
                  <button
                    onClick={() => window.duelr.shell.openExternal(phase.lobbyJoinUrl!)}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Join Lobby
                  </button>
                )}
                <p className="text-xs text-gray-600 self-center">
                  {copied ? '✓ Copied!' : phase.role === 'challenger' ? 'Your opponent already received this link' : 'Paste in your browser to join'}
                </p>
              </div>
            </div>
            )}
          </div>
          )}

          {/* ── Match result (auto-detected from first blood via LCU) ── */}
          <div className="pt-2 border-t border-dark-600">
            {reportState.status === 'idle' && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Match Result
                </p>
                <p className="text-xs text-gray-600">
                  {lcu.connected
                    ? 'Auto-detected from first blood when your game ends.'
                    : 'Open the League client so Duelr can auto-detect first blood.'}
                </p>
              </div>
            )}

            {reportState.status === 'reporting' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Recording result…
              </div>
            )}

            {reportState.status === 'reported' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                {reportState.result === 'win' ? 'Victory' : 'Defeat'} recorded from first blood. GG!
              </div>
            )}

            {reportState.status === 'failed' && (
              <div className="flex items-start gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Couldn&apos;t auto-detect first blood for this game, so it won&apos;t be
                  recorded. Results come straight from the League client — keep Duelr
                  running when your duel ends.
                </span>
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
      {user && phase.kind === 'idle' && mode === '1v1' && !myGroup && (
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

      {/* ── 2v2: open groups ──────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-gold-400" />
            <h2 className="font-semibold text-white flex items-center gap-2">
              Open 2v2 Groups
              <span className="text-sm text-gray-600 font-normal">({groups.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.groupId}
                group={g}
                userId={user?.id ?? null}
                champions={champions}
                canJoin={!!user && phase.kind === 'idle' && !myGroup && !userSlotIn(g, user?.id ?? '')}
                joiningSlot={joiningSlot}
                onJoinSlot={(slotKey, champId) => joinGroupSlot(g.groupId, slotKey, champId)}
              />
            ))}
          </div>
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
