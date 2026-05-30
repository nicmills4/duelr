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

export interface LcuEventHandlers {
  onPhase: (phase: string) => void
  onChampion: (ddragKey: string | null) => void
  onEndOfGame: () => void
}

export function connectLcuEvents(creds: LcuCreds, handlers: LcuEventHandlers): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let champMap: ChampionMap = new Map()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

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
        handlers.onChampion(null)
        return
      }

      const alias = champMap.get(champId)
      handlers.onChampion(alias ?? null)
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
            handleChampSelect()
          } else if (phase === 'EndOfGame') {
            handlers.onEndOfGame()
            handlers.onChampion(null)
          } else {
            handlers.onChampion(null)
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
