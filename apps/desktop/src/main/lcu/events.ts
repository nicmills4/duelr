/**
 * LCU WebSocket event subscriber.
 * Connects to the League client's event stream and emits champion + phase events.
 */
import WebSocket from 'ws'
import type { LcuCreds } from './lockfile'
import { lcuGet } from './client'

// DDragon champion alias keyed by LCU champion integer ID
type ChampionMap = Map<number, string>

interface ChampSummaryEntry {
  id: number
  alias: string
  name: string
}

interface ChampSelectSession {
  localPlayerCellId: number
  myTeam: Array<{
    cellId: number
    championId: number
    championPickIntent: number
  }>
}

// /lol-gameflow/v1/session — `gameData.isCustomGame` is the reliable custom-game
// flag from champ select through in-game (the /lol-lobby endpoint 404s once you
// leave the lobby for champ select). `gameData.gameId` identifies the live game
// so the end-of-game reader can reject stale match-history entries.
interface GameflowSession {
  gameData?: { isCustomGame?: boolean; gameId?: number }
}

export interface LcuEventHandlers {
  onPhase: (phase: string) => void
  onChampion: (ddragKey: string | null) => void
  /** gameId of the game that just ended, or null if it couldn't be determined. */
  onEndOfGame: (gameId: number | null) => void
}

export function connectLcuEvents(creds: LcuCreds, handlers: LcuEventHandlers): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let champMap: ChampionMap = new Map()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // The champ-select session event fires many times per second during champ
  // select (timers, other players hovering, etc.). Dedupe so onChampion — which
  // drives a system notification — only fires when the value actually changes.
  // `undefined` = nothing emitted yet (distinct from an emitted `null`).
  let lastChampion: string | null | undefined = undefined
  function emitChampion(ddragKey: string | null) {
    if (ddragKey === lastChampion) return
    lastChampion = ddragKey
    handlers.onChampion(ddragKey)
  }

  // Duelr only cares about CUSTOM games (1v1 duels). Cache whether the current
  // game is custom so we don't re-query LCU on every champ-select tick.
  // `null` = unknown (not yet fetched for this champ-select entry).
  let isCustomLobby: boolean | null = null
  // gameId of the game currently in champ select / in progress. Match history
  // lags behind game end, so the EOG reader needs this to verify it's reading
  // the game that just ended and not the player's previous game.
  let currentGameId: number | null = null
  async function refreshLobbyType(): Promise<boolean> {
    try {
      const s = await lcuGet<GameflowSession>('/lol-gameflow/v1/session', creds)
      isCustomLobby = s?.gameData?.isCustomGame === true
      if (s?.gameData?.gameId) currentGameId = s.gameData.gameId
    } catch {
      isCustomLobby = false
    }
    return isCustomLobby
  }

  async function loadChampionMap() {
    try {
      const summary = await lcuGet<ChampSummaryEntry[]>(
        '/lol-game-data/assets/v1/champion-summary.json',
        creds
      )
      if (Array.isArray(summary)) {
        champMap = new Map(summary.filter((c) => c.id > 0).map((c) => [c.id, c.alias]))
      }
    } catch {
      // champion map unavailable — will work without auto-fill
    }
  }

  async function handleChampSelect() {
    // Only auto-fill / notify for custom games. Fetch the flag once per champ
    // select (cached), and stay silent for normal/ranked/ARAM queues.
    const custom = isCustomLobby ?? (await refreshLobbyType())
    if (!custom) {
      emitChampion(null)
      return
    }

    try {
      const session = await lcuGet<ChampSelectSession>(
        '/lol-champ-select/v1/session',
        creds
      )
      if (!session?.myTeam) return

      const localSlot = session.myTeam.find(
        (s) => s.cellId === session.localPlayerCellId
      )
      if (!localSlot) return

      // Use locked-in champion, fall back to intent
      const champId = localSlot.championId || localSlot.championPickIntent
      if (!champId) {
        emitChampion(null)
        return
      }

      const alias = champMap.get(champId)
      emitChampion(alias ?? null)
    } catch {
      // champ select session unavailable
    }
  }

  function connect() {
    if (closed) return

    const auth = Buffer.from(`riot:${creds.password}`).toString('base64')
    ws = new WebSocket(`wss://127.0.0.1:${creds.port}/`, {
      rejectUnauthorized: false,
      headers: { Authorization: `Basic ${auth}` },
    })

    ws.on('open', async () => {
      // Subscribe to all JSON API events
      ws!.send(JSON.stringify([5, 'OnJsonApiEvent']))
      await loadChampionMap()
      // If this is a (re)connect mid-game, recapture the live gameId so an
      // EndOfGame arriving after the reconnect can still be verified.
      refreshLobbyType().catch(() => {})
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as unknown[]
        if (!Array.isArray(msg) || msg[0] !== 8) return

        const event = msg[2] as {
          uri: string
          eventType: string
          data: unknown
        }

        // Game phase changes
        if (event.uri === '/lol-gameflow/v1/gameflow-phase') {
          const phase = event.data as string
          handlers.onPhase(phase)

          if (phase === 'ChampSelect') {
            isCustomLobby = null // unknown until refreshed for this game
            currentGameId = null
            handleChampSelect()
          } else if (phase === 'InProgress') {
            // Capture the live gameId in case champ select was skipped or the
            // WS connected mid-flow.
            refreshLobbyType().catch(() => {})
            emitChampion(null)
          } else if (phase === 'EndOfGame') {
            const finishedGameId = currentGameId
            currentGameId = null
            isCustomLobby = null
            emitChampion(null)
            if (finishedGameId != null) {
              handlers.onEndOfGame(finishedGameId)
            } else {
              // gameId never captured (WS connected after the game started and
              // the open-handler refresh lost the race). The gameflow session is
              // still live during EndOfGame — read the gameId from it now.
              lcuGet<GameflowSession>('/lol-gameflow/v1/session', creds)
                .then((s) => handlers.onEndOfGame(s?.gameData?.gameId ?? null))
                .catch(() => handlers.onEndOfGame(null))
            }
          } else {
            isCustomLobby = null
            emitChampion(null)
          }
        }

        // Champion selection updates while in champ select
        if (event.uri.startsWith('/lol-champ-select/v1/session')) {
          handleChampSelect()
        }
      } catch {
        // malformed message — ignore
      }
    })

    ws.on('close', () => {
      if (!closed) {
        reconnectTimer = setTimeout(connect, 3000)
      }
    })

    ws.on('error', () => {
      ws?.terminate()
    })
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.terminate()
  }
}
