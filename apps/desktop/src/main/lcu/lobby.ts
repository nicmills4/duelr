/**
 * LCU custom lobby creation + shareable join-code generation.
 *
 * Flow:
 *   1. POST /lol-lobby/v2/lobby           → create a 1v1 custom game on SR
 *   2. GET  /lol-lobby/v2/ags/agsActivityId → get the lobby activity ID
 *   3. POST /lol-lobby/v2/ags/{id}/joinCode → generate the join code
 *   4. Return https://gg.riotgames.com/LOL?joinCode={code}
 *
 * Opening that URL on any machine with League installed auto-joins the lobby.
 */
import { lcuGet, lcuPost } from './client'
import type { LcuCreds } from './lockfile'

const JOIN_BASE = 'https://gg.riotgames.com/LOL'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LobbyConfig {
  gameConfig: {
    gameMode: string
    mapId: number
    mutators: { id: number }
    teamSize: number
    spectatorPolicy: string
  }
}

// AGS response may be { agsActivityId: string } or a bare string
type AgsResponse = { agsActivityId?: string } | string

// Join code response may be { joinCode: string } or a bare string
type JoinCodeResponse = { joinCode?: string; code?: string } | string

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const val = o.agsActivityId ?? o.joinCode ?? o.code
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a 1v1 custom game on Summoner's Rift.
 * Spectators allowed so observers can watch.
 */
export async function createCustomLobby(creds: LcuCreds): Promise<void> {
  const config: LobbyConfig = {
    gameConfig: {
      gameMode: 'CLASSIC',
      mapId: 11,           // Summoner's Rift
      mutators: { id: 1 },
      teamSize: 1,         // 1v1
      spectatorPolicy: 'AllAllowed',
    },
  }
  await lcuPost('/lol-lobby/v2/lobby', creds, config)
}

/**
 * Gets the join code for the current lobby (lobby must already exist).
 * Returns the full https://gg.riotgames.com/LOL?joinCode=XXX URL or null.
 */
export async function getJoinUrl(creds: LcuCreds): Promise<string | null> {
  try {
    // Step 1: get the AGS activity ID for the active lobby
    const agsRaw = await lcuGet<AgsResponse>('/lol-lobby/v2/ags/agsActivityId', creds)
    const activityId = extractString(agsRaw)
    if (!activityId) return null

    // Step 2: generate a shareable join code
    const codeRaw = await lcuPost<JoinCodeResponse>(
      `/lol-lobby/v2/ags/${encodeURIComponent(activityId)}/joinCode`,
      creds,
      {}
    )
    const joinCode = extractString(codeRaw)
    if (!joinCode) return null

    return `${JOIN_BASE}?joinCode=${joinCode}`
  } catch {
    return null
  }
}

/**
 * Creates a custom 1v1 lobby then immediately generates a join URL.
 * Returns null if League isn't running or the LCU rejects the request.
 */
export async function createLobbyAndGetJoinUrl(creds: LcuCreds): Promise<string | null> {
  try {
    await createCustomLobby(creds)
    // Brief pause for the LCU to register the new lobby
    await new Promise<void>((res) => setTimeout(res, 600))
    return getJoinUrl(creds)
  } catch {
    return null
  }
}
