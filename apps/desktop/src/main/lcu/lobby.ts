/**
 * LCU custom lobby join-code generation.
 *
 * IMPORTANT: this does NOT create a lobby — the player must already be in a
 * Custom game lobby in League. It inspects the current lobby and tries to mint a
 * shareable join code for it.
 *
 * Flow:
 *   1. GET /lol-lobby/v2/lobby  → determine the real lobby state. This is what
 *      lets us return an honest `created` flag instead of always saying "true":
 *        • 404           → you're not in any lobby
 *        • isCustom:false → you're in a non-custom lobby (e.g. a normal queue)
 *        • otherwise      → you're in a custom lobby; proceed
 *   2. Try to mint a join code (two strategies, older + newer clients):
 *        a. GET  /lol-lobby/v2/ags/agsActivityId  →  POST /lol-lobby/v2/ags/{id}/joinCode
 *        b. POST /lol-lobby/v2/ags/{partyId}/joinCode   (partyId from step 1)
 *   3. Return { created, joinUrl, error?, debug }
 *
 * Opening the URL (https://gg.riotgames.com/LOL?joinCode=XXX) on any machine
 * with League installed auto-joins the lobby.
 *
 * Every LCU call here is traced into `debug` (and console) so join-link failures
 * can be diagnosed from the UI — Discord/main-process logs aren't visible in the
 * packaged app.
 */
import { lcuGet, lcuPost, LcuError } from './client'
import type { LcuCreds } from './lockfile'

const JOIN_BASE = 'https://gg.riotgames.com/LOL'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateLobbyResult {
  /** True only when the player is actually in a (custom) League lobby. */
  created:  boolean
  /** Shareable join URL, or null if the code endpoint is unavailable. */
  joinUrl:  string | null
  /** Human-readable reason if something failed. */
  error?:   string
  /** Diagnostic trace of the LCU calls attempted (temporary, for debugging). */
  debug?:   string
}

interface LobbyState {
  gameConfig?: { customLobbyName?: string; isCustom?: boolean; gameMode?: string }
  partyId?:    string
}

type AgsResponse      = { agsActivityId?: string } | string
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

/** Truncated JSON for trace lines — never throws. */
function safeJson(v: unknown, max = 200): string {
  try {
    const s = JSON.stringify(v)
    return s ? (s.length > max ? s.slice(0, max) + '…' : s) : String(v)
  } catch {
    return String(v)
  }
}

/** One-line description of any LCU/network error for the trace. */
function describeError(e: unknown): string {
  if (e instanceof LcuError) return `${e.status} ${safeJson(e.body)}`
  return (e as Error)?.message ?? String(e)
}

// ── Join-code fetching (two strategies) ──────────────────────────────────────

/**
 * Resolve the AGS activity id for the current lobby — the id the join-code
 * endpoints expect (confirmed: the lobby's partyId is rejected with 400).
 */
async function getAgsActivityId(
  creds: LcuCreds,
  log:   (line: string) => void,
): Promise<string | null> {
  try {
    const raw = await lcuGet<AgsResponse>('/lol-lobby/v2/ags/agsActivityId', creds)
    const id  = extractString(raw)
    log(`GET /ags/agsActivityId → OK id=${id ?? '∅'} raw=${safeJson(raw)}`)
    return id
  } catch (e) {
    log(`GET /ags/agsActivityId → ERR ${describeError(e)}`)
    return null
  }
}

/**
 * Get — or, if one doesn't exist yet, create — the shared join code for an AGS
 * activity.
 *
 * The upstream (/activity-gateway/v1/activities/{id}/join-code/shared) treats the
 * shared code as a resource: a POST to *create* it returns 409 once it already
 * exists (observed in the field). So we GET to read the existing code first and
 * only POST to create one when there isn't any.
 */
async function getOrCreateJoinCode(
  id:    string,
  creds: LcuCreds,
  log:   (line: string) => void,
): Promise<string | null> {
  // 1. Read an existing shared join code (the steady state once made once).
  try {
    const raw  = await lcuGet<JoinCodeResponse>(
      `/lol-lobby/v2/ags/${encodeURIComponent(id)}/joinCode`, creds,
    )
    const code = extractString(raw)
    log(`GET /ags/${id}/joinCode → OK code=${code ?? '∅'} raw=${safeJson(raw)}`)
    if (code) return code
  } catch (e) {
    log(`GET /ags/${id}/joinCode → ERR ${describeError(e)}`)
  }

  // 2. No code yet — create one.
  try {
    const raw  = await lcuPost<JoinCodeResponse>(
      `/lol-lobby/v2/ags/${encodeURIComponent(id)}/joinCode`, creds, {},
    )
    const code = extractString(raw)
    log(`POST /ags/${id}/joinCode → OK code=${code ?? '∅'} raw=${safeJson(raw)}`)
    return code
  } catch (e) {
    log(`POST /ags/${id}/joinCode → ERR ${describeError(e)}`)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inspects the player's current League lobby and returns a shareable join URL.
 *
 * Returns a structured result:
 *   - { created: false, error }        → not in a lobby / not a custom lobby / unreadable
 *   - { created: true, joinUrl: null } → in a custom lobby but join code unavailable
 *   - { created: true, joinUrl }       → success
 *
 * `debug` always carries a trace of the LCU calls attempted.
 */
export async function createLobbyAndGetJoinUrl(creds: LcuCreds): Promise<CreateLobbyResult> {
  const trace: string[] = []
  const log = (line: string) => { trace.push(line); console.log('[LCU][joinlink]', line) }
  const debug = () => trace.join('\n')

  // 1. Read the actual lobby state so we can be honest about `created`.
  let lobby: LobbyState | null
  try {
    lobby = await lcuGet<LobbyState>('/lol-lobby/v2/lobby', creds)
    log(
      `GET /lol-lobby/v2/lobby → OK partyId=${lobby?.partyId ?? '∅'} ` +
      `isCustom=${lobby?.gameConfig?.isCustom ?? '∅'} gameMode=${lobby?.gameConfig?.gameMode ?? '∅'}`,
    )
    // Full lobby object in case the join code lives on a field here.
    log(`lobby raw=${safeJson(lobby, 500)}`)
  } catch (e) {
    log(`GET /lol-lobby/v2/lobby → ERR ${describeError(e)}`)
    const notInLobby = e instanceof LcuError && e.status === 404
    return {
      created: false,
      joinUrl: null,
      error: notInLobby
        ? "You're not in a League lobby. In League: Play → Custom → Create a Summoner's Rift lobby, then click here."
        : 'Could not read your League lobby — make sure League is running.',
      debug: debug(),
    }
  }

  // 2. Require a custom game. Only block when League explicitly says it isn't one
  //    (if the field is missing on some client version, don't false-negative).
  if (lobby?.gameConfig?.isCustom === false) {
    log('lobby is not a Custom game — aborting')
    return {
      created: false,
      joinUrl: null,
      error: "That's not a Custom game lobby. In League: Play → Custom → Create, then click here.",
      debug: debug(),
    }
  }

  // 3. We're in a custom lobby — resolve the AGS id, then get/create its code.
  //    agsActivityId is the right id (partyId is rejected with 400), so only fall
  //    back to partyId if the activity-id lookup itself fails.
  const activityId = (await getAgsActivityId(creds, log)) ?? lobby?.partyId ?? null
  const code = activityId ? await getOrCreateJoinCode(activityId, creds, log) : null

  if (code) {
    log(`SUCCESS joinCode=${code}`)
    return { created: true, joinUrl: `${JOIN_BASE}?joinCode=${code}`, debug: debug() }
  }

  log('all join-code strategies returned no code')
  return { created: true, joinUrl: null, debug: debug() }
}
