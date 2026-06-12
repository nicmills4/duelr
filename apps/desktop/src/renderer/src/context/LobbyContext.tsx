/**
 * App-level lobby state: the 1v1 phase machine, 2v2 group state, the SSE
 * notification stream, and end-of-game result reporting.
 *
 * This lives at the provider level (not in LobbyPage) so that:
 *  • incoming challenges are received while the user is on ANY page,
 *  • match results are recorded even if the user is browsing the leaderboard
 *    when their duel ends (there is no manual re-report fallback),
 *  • the SSE connection survives page navigation and reconnects after fatal
 *    closes (401/5xx), which EventSource does NOT do by itself.
 */
import {
  createContext, useContext, useEffect, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react'
import { useAuth } from './AuthContext'
import api from '../lib/api'
import { API_BASE } from '../lib/constants'
import type {
  ChallengePayload, LobbyGroup, LobbyPhase,
} from '../lib/lobby-types'
import type { GroupReady } from '../components/LobbyGroups'

export type ReportState =
  | { status: 'idle' }
  | { status: 'reporting' }
  | { status: 'reported'; result: 'win' | 'loss' }
  | { status: 'failed' }   // LCU couldn't detect first blood, or submit failed

interface LobbyContextValue {
  phase: LobbyPhase
  setPhase: Dispatch<SetStateAction<LobbyPhase>>
  groups: LobbyGroup[]
  setGroups: Dispatch<SetStateAction<LobbyGroup[]>>
  myGroup: LobbyGroup | null
  setMyGroup: Dispatch<SetStateAction<LobbyGroup | null>>
  groupReady: GroupReady | null
  setGroupReady: Dispatch<SetStateAction<GroupReady | null>>
  reportState: ReportState
  setReportState: Dispatch<SetStateAction<ReportState>>
}

const LobbyContext = createContext<LobbyContextValue | null>(null)

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [phase, setPhase]             = useState<LobbyPhase>({ kind: 'idle' })
  const [groups, setGroups]           = useState<LobbyGroup[]>([])
  const [myGroup, setMyGroup]         = useState<LobbyGroup | null>(null)
  const [groupReady, setGroupReady]   = useState<GroupReady | null>(null)
  const [reportState, setReportState] = useState<ReportState>({ status: 'idle' })

  // Current phase, readable inside SSE handlers without re-subscribing.
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Register active match with main process for EOG auto-reporting ─────────

  useEffect(() => {
    const matchId = phase.kind === 'matched' ? phase.matchId : null
    window.duelr.match.setActive(matchId)
  // Depend on the actual matchId string (null when not in matched phase)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'matched' ? phase.matchId : null])

  // ── Sync tray status with lobby phase ──────────────────────────────────────

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, phase.kind === 'matched' ? phase.opponentRiotId : null])

  // ── End-of-game result from main process → report to server ────────────────

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
        await new Promise((r) => setTimeout(r, 1500))
      }

      setReportState({ status: 'failed' })
    })

    return () => {
      window.duelr.lcu.offEogResult()
    }
  }, [])

  // ── SSE — real-time challenge / match notifications ─────────────────────────

  useEffect(() => {
    if (!user) return

    let disposed = false
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1000

    function handleMessage(e: MessageEvent) {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'challenge') {
          const payload = data as ChallengePayload
          // Only take a challenge when not already engaged — an unguarded
          // overwrite here would destroy an active match card mid-duel (and
          // null out the active matchId, killing EOG auto-reporting).
          const p = phaseRef.current
          if (p.kind === 'idle' || p.kind === 'available') {
            setPhase({ kind: 'challenged', payload })
            window.duelr.notify(
              'Challenge received!',
              `${payload.challengerRiotId} wants to 1v1 as ${payload.challengerChampName}`
            )
          }
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
          setReportState({ status: 'idle' })
          window.duelr.notify('Match found!', `vs ${opp.riotId}`)
          // Voice join is manual — user clicks "Join Discord Voice" in the matched card.
        } else if (data.type === 'challenge_declined') {
          setPhase((p) =>
            p.kind === 'challenging'
              ? { kind: 'available', expiresAt: Date.now() + 3600_000 }
              : p
          )
        } else if (data.type === 'challenge_cancelled') {
          // The challenger withdrew — clear our incoming-challenge card so we
          // don't offer an Accept that would 404.
          setPhase((p) =>
            p.kind === 'challenged' && p.payload.challengeId === data.challengeId
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
      } catch { /* ignore malformed event */ }
    }

    function connect() {
      if (disposed) return

      es = new EventSource(`${API_BASE}/api/notifications/stream`, {
        withCredentials: true,
      })

      es.onopen = () => { retryDelay = 1000 }

      // The stream sends unnamed data: events — use onmessage, not addEventListener
      es.onmessage = handleMessage

      es.onerror = () => {
        // EventSource auto-reconnects dropped connections, but gives up
        // PERMANENTLY when the server responds with a non-200 (401 after the
        // session expires, 502 during a deploy). Without this the user sits
        // "available" but silently never receives another challenge.
        if (es?.readyState === EventSource.CLOSED && !disposed) {
          es.close()
          retryTimer = setTimeout(connect, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 30_000)
        }
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [user])

  return (
    <LobbyContext.Provider
      value={{
        phase, setPhase,
        groups, setGroups,
        myGroup, setMyGroup,
        groupReady, setGroupReady,
        reportState, setReportState,
      }}
    >
      {children}
    </LobbyContext.Provider>
  )
}

export function useLobby() {
  const ctx = useContext(LobbyContext)
  if (!ctx) throw new Error('useLobby must be used within LobbyProvider')
  return ctx
}
