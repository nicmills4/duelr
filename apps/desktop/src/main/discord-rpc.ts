/**
 * Discord Rich Presence manager.
 *
 * Shows what the user is doing in Duelr as their Discord status:
 *   • Idle in client  → "Finding a 1v1"
 *   • In queue        → "Searching for a Match" + elapsed timer
 *   • Champ select    → "In Champ Select"
 *   • In game         → "In Game vs <opponent>" + elapsed timer
 *   • End of game     → "Reviewing Results"
 *
 * Setup (one-time):
 *   1. Go to https://discord.com/developers/applications
 *   2. Create a new application named "Duelr"
 *   3. Copy the Application ID and paste it as DISCORD_CLIENT_ID below
 *   4. Under "Rich Presence → Art Assets", upload an image named "logo"
 */

import DiscordRPC from 'discord-rpc'

// ── Replace with your Discord application ID ─────────────────────────────────
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_APP_ID'

// ─────────────────────────────────────────────────────────────────────────────

export interface RpcState {
  lcuConnected:   boolean
  phase:          string | null
  summonerName?:  string
  opponentRiotId?: string | null
  queueStartTime?: number | null
  matchStartTime?: number | null
}

let client: DiscordRPC.Client | null = null
let ready   = false
let current: RpcState = { lcuConnected: false, phase: null }
let retryTimer: ReturnType<typeof setTimeout> | null = null

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildPresence(s: RpcState): DiscordRPC.Presence {
  const base: DiscordRPC.Presence = {
    largeImageKey:  'logo',
    largeImageText: 'Duelr — 1v1 LoL matchmaking',
    instance:       false,
  }

  if (!s.lcuConnected) {
    return {
      ...base,
      details: 'Finding a 1v1',
      state:   'League not running',
    }
  }

  switch (s.phase) {
    case 'Matchmaking':
      return {
        ...base,
        details:        'Searching for a Match',
        state:          'In queue',
        startTimestamp: s.queueStartTime ?? Date.now(),
      }

    case 'ChampSelect':
      return {
        ...base,
        details: 'In Champ Select',
        state:   s.summonerName ? `Playing as ${s.summonerName}` : 'Picking a champion',
      }

    case 'InProgress':
      return {
        ...base,
        details:        s.opponentRiotId ? `vs ${s.opponentRiotId}` : 'In a 1v1',
        state:          'In Game',
        startTimestamp: s.matchStartTime ?? Date.now(),
      }

    case 'EndOfGame':
    case 'PreEndOfGame':
    case 'WaitingForStats':
      return {
        ...base,
        details: 'Match finished',
        state:   'Reviewing results',
      }

    case 'Lobby':
      return {
        ...base,
        details: 'In Lobby',
        state:   'Setting up a match',
      }

    default:
      return {
        ...base,
        details: 'Finding a 1v1',
        state:   s.summonerName ? `Logged in as ${s.summonerName}` : 'In the client',
      }
  }
}

async function push() {
  if (!client || !ready) return
  try {
    await client.setActivity(buildPresence(current))
  } catch {
    // Discord closed mid-session — will reconnect on next retry
    ready = false
  }
}

function scheduleRetry(delayMs = 15_000) {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    connect()
  }, delayMs)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function connect() {
  if (DISCORD_CLIENT_ID === 'YOUR_DISCORD_APP_ID') return // not configured yet

  try {
    DiscordRPC.register(DISCORD_CLIENT_ID)
    client = new DiscordRPC.Client({ transport: 'ipc' })

    client.on('ready', () => {
      ready = true
      push()
    })

    client.on('disconnected', () => {
      ready  = false
      client = null
      scheduleRetry()
    })

    client.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {
      // Discord not running — retry later
      client = null
      scheduleRetry()
    })
  } catch {
    scheduleRetry()
  }
}

export function disconnect() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  ready = false
  client?.destroy().catch(() => {})
  client = null
}

/** Call whenever LCU connects with summoner info. */
export function setLcuConnected(summonerName: string) {
  current = { ...current, lcuConnected: true, summonerName }
  push()
}

/** Call whenever LCU disconnects. */
export function setLcuDisconnected() {
  current = { lcuConnected: false, phase: null, opponentRiotId: null }
  push()
}

/** Call on every LCU phase change. */
export function setPhase(phase: string) {
  const prev = current.phase

  // Record timestamps for queue and match starts
  const queueStartTime =
    phase === 'Matchmaking' && prev !== 'Matchmaking'
      ? Date.now()
      : phase === 'Matchmaking' ? current.queueStartTime : null

  const matchStartTime =
    phase === 'InProgress' && prev !== 'InProgress'
      ? Date.now()
      : phase === 'InProgress' ? current.matchStartTime : null

  current = { ...current, phase, queueStartTime, matchStartTime }
  push()
}

/** Call when a match is found so the opponent name shows in RPC. */
export function setOpponent(riotId: string | null) {
  current = { ...current, opponentRiotId: riotId }
  push()
}
