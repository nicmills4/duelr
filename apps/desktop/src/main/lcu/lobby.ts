/**
 * LCU custom lobby creation + shareable join-code generation.
 *
 * Flow:
 *   1. POST /lol-lobby/v2/lobby           → create a 1v1 custom game on SR
 *   2. Try several endpoints to get a shareable join code:
 *        a. GET  /lol-lobby/v2/ags/agsActivityId  (older clients)
 *           POST /lol-lobby/v2/ags/{id}/joinCode
 *        b. GET  /lol-lobby/v2/lobby               (newer clients — partyId in response)
 *           POST /lol-lobby/v2/ags/{partyId}/joinCode
 *   3. Return { created, joinUrl, error? }
 *
 * Opening the URL (https://gg.riotgames.com/LOL?joinCode=XXX) on any machine
 * with League installed auto-joins the lobby.
 */
import { lcuGet, lcuPost } from './client'
import type { LcuCreds } from './lockfile'

const JOIN_BASE = 'https://gg.riotgames.com/LOL'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateLobbyResult {
  /** Whether the custom game lobby was successfully created in League. */
  created:  boolean
  /** Shareable join URL, or null if the code endpoint is unavailable. */
  joinUrl:  string | null
  /** Human-readable reason if something failed. */
  error?:   string
}

interface LobbyState {
  gameConfig?: { customLobbyName?: string }
  partyId?:    string
}

type AgsResponse     = { agsActivityId?: string } | string
type JoinCodeResponse = { joinCode?: string; code?: string } | string

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const val = o.agsActivityId ?? o.joinCode ?? o.code ?? o.partyId
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return null
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── Join-code fetching (two strategies) ──────────────────────────────────────

/**
 * Strategy A: dedicated AGS activity-ID endpoint (older clients).
 */
async function getJoinUrlViaAgsEndpoint(creds: LcuCreds): Promise<string | null> {
  try {
    const agsRaw      = await lcuGet<AgsResponse>('/lol-lobby/v2/ags/agsActivityId', creds)
    const activityId  = extractString(agsRaw)
    if (!activityId) return null

    const codeRaw = await lcuPost<JoinCodeResponse>(
      `/lol-lobby/v2/ags/${encodeURIComponent(activityId)}/joinCode`,
      creds,
      {}
    )
    const joinCode = extractString(codeRaw)
    return joinCode ? `${JOIN_BASE}?joinCode=${joinCode}` : null
  } catch {
    return null
  }
}

/**
 * Strategy B: read partyId from the lobby state, then use it as the AGS ID
 * (newer clients embed it directly in the lobby object).
 */
async function getJoinUrlViaLobbyState(creds: LcuCreds): Promise<string | null> {
  try {
    const lobby   = await lcuGet<LobbyState>('/lol-lobby/v2/lobby', creds)
    const partyId = lobby?.partyId ?? extractString(lobby)
    if (!partyId) return null

    const codeRaw = await lcuPost<JoinCodeResponse>(
      `/lol-lobby/v2/ags/${encodeURIComponent(partyId)}/joinCode`,
      creds,
      {}
    )
    const joinCode = extractString(codeRaw)
    return joinCode ? `${JOIN_BASE}?joinCode=${joinCode}` : null
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches a shareable join URL for the lobby the player is currently in.
 * The player must already be in a custom game lobby in League — this does NOT
 * create a lobby, it only generates the join code for an existing one.
 *
 * Returns a structured result:
 *   - { created: true, joinUrl }      → success
 *   - { created: true, joinUrl: null }→ in a lobby but join URL unavailable
 *   - { created: false }              → not in a lobby or LCU unreachable
 */
export async function createLobbyAndGetJoinUrl(creds: LcuCreds): Promise<CreateLobbyResult> {
  try {
    const joinUrl =
      await getJoinUrlViaAgsEndpoint(creds) ??
      await getJoinUrlViaLobbyState(creds)

    if (joinUrl) return { created: true, joinUrl }

    // In a lobby but couldn't get a join code (endpoint unavailable on this client)
    return { created: true, joinUrl: null }
  } catch {
    return { created: false, joinUrl: null, error: 'Not in a custom game lobby. Create one in League first, then click here.' }
  }
}
