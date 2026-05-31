import { app, shell, BrowserWindow, ipcMain, session, safeStorage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { watchLockfile } from './lcu/lockfile'
import { lcuGet } from './lcu/client'
import { connectLcuEvents } from './lcu/events'
import { createLobbyAndGetJoinUrl } from './lcu/lobby'
import { getFirstBloodResult } from './lcu/end-of-game'
import { createTray, setTrayLcuConnected, setTrayStatus } from './tray'
import { showNotification } from './notifications'
import type { LcuCreds, LockfileWatcher } from './lcu/lockfile'

const API_ORIGIN = 'https://playduelr.gg'

// ── LCU state ────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let stopLcuEvents: (() => void) | null = null
let lcuWatcher: LockfileWatcher | null = null
let currentLcuCreds: LcuCreds | null = null
// Match ID registered by the renderer when a match is found
let activeMatchId: string | null = null

// Last known LCU status — re-sent to the renderer on did-finish-load so the
// UI is correct even when League was already running before the window loaded.
let lastLcuStatus: { connected: boolean; summonerName?: string; rankLabel?: string } = { connected: false }

interface SummonerInfo { displayName: string; internalName: string }
interface RankedStats {
  queueMap?: Record<string, { tier: string; division: string; leaguePoints: number }>
}

async function onLcuConnect(creds: LcuCreds, lockfilePath: string | null = null) {
  console.log('[Main] LCU connected — port:', creds.port)
  currentLcuCreds = creds

  // ── Push "connected" immediately so the UI updates without waiting for API calls ──
  lastLcuStatus = { connected: true, summonerName: '', rankLabel: '' }
  mainWindow?.webContents.send('lcu:status', lastLcuStatus)
  setTrayLcuConnected(true)

  // ── Fetch summoner info + rank with retries (LCU HTTP server may not be ready yet) ──
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  // Check lockfile mtime: if it's older than 60s League was already running — poll immediately.
  // Otherwise wait 20s for the HTTP server to finish initialising.
  let initialDelay = 10000
  if (lockfilePath) {
    try {
      const { mtimeMs } = fs.statSync(lockfilePath)
      const ageMs = Date.now() - mtimeMs
      console.log(`[Main] Lockfile age: ${Math.round(ageMs / 1000)}s`)
      if (ageMs > 60_000) initialDelay = 0
    } catch { /* can't stat — use default */ }
  }

  if (initialDelay > 0) {
    console.log(`[Main] Waiting ${initialDelay / 1000}s for LCU HTTP server to initialise…`)
    await delay(initialDelay)
    if (currentLcuCreds?.port !== creds.port) return  // disconnected while waiting
  }

  async function fetchWithRetry<T>(path: string, retries = 6, intervalMs = 10000): Promise<T | null> {

    for (let i = 0; i < retries; i++) {
      // If we've disconnected while waiting, abort
      if (currentLcuCreds?.port !== creds.port) return null
      try {
        return await lcuGet<T>(path, creds)
      } catch (e: any) {
        if (e?.code === 'ECONNREFUSED' && i < retries - 1) {
          console.log(`[Main] LCU not ready yet (attempt ${i + 1}/${retries}), retrying in ${intervalMs / 1000}s…`)
          await delay(intervalMs)
        } else {
          console.error(`[Main] fetch failed (${path}):`, e?.message ?? e)
          return null
        }
      }
    }
    return null
  }

  const summoner = await fetchWithRetry<SummonerInfo>('/lol-summoner/v1/current-summoner')
  const summonerName = summoner?.displayName ?? summoner?.internalName ?? ''

  const ranked = await fetchWithRetry<RankedStats>('/lol-ranked/v1/current-ranked-stats')
  const solo = ranked?.queueMap?.['RANKED_SOLO_5x5']
  const rankLabel = solo?.tier
    ? `${solo.tier} ${solo.division ?? ''} ${solo.leaguePoints ?? 0} LP`.trim()
    : ''

  // Guard: don't overwrite status if League disconnected while we were waiting
  if (currentLcuCreds?.port !== creds.port) return

  // ── Update with full summoner info once we have it ──
  lastLcuStatus = { connected: true, summonerName, rankLabel }
  console.log('[Main] sending enriched lcu:status — summoner:', summonerName, 'rank:', rankLabel)
  mainWindow?.webContents.send('lcu:status', lastLcuStatus)

  // Connect event stream — champion detection + phase tracking
  stopLcuEvents?.()
  stopLcuEvents = connectLcuEvents(creds, {
    onPhase: (phase) => {
      mainWindow?.webContents.send('lcu:phase', phase)
      // Mirror LCU in-game phases to the tray
      if (phase === 'ChampSelect') setTrayStatus({ kind: 'champSelect' })
      else if (phase === 'InProgress') setTrayStatus({ kind: 'inGame' })
      else if (phase === 'EndOfGame' || phase === 'None') setTrayStatus({ kind: 'idle' })
    },
    onChampion: (ddragKey) => {
      mainWindow?.webContents.send('lcu:champion', ddragKey)
      if (ddragKey) {
        showNotification(
          'Champion locked in',
          `Auto-filling ${ddragKey} in your Duelr lobby form`
        )
      }
    },
    onEndOfGame: () => {
      handleEndOfGame()
    },
  })
}

function onLcuDisconnect() {
  console.log('[Main] LCU disconnected')
  currentLcuCreds = null
  stopLcuEvents?.()
  stopLcuEvents = null
  lastLcuStatus = { connected: false }
  mainWindow?.webContents.send('lcu:status', lastLcuStatus)
  mainWindow?.webContents.send('lcu:champion', null)
  setTrayLcuConnected(false)
}

async function handleEndOfGame() {
  const matchId = activeMatchId
  const creds   = currentLcuCreds
  if (!matchId || !creds) return

  const { result, myChampion, oppChampion } = await getFirstBloodResult(creds)
  // Send to renderer whether we got a result or not — renderer handles both cases.
  // Champions reflect what was ACTUALLY played, to correct the indicated picks.
  mainWindow?.webContents.send('lcu:eog-result', { matchId, result, myChampion, oppChampion })

  if (result) {
    showNotification(
      result === 'win' ? 'GG — First Blood!' : 'GG — Defeat',
      'Recording your match result automatically…'
    )
  }

  // Clear the active match so we don't re-report on subsequent EOG events
  activeMatchId = null
}

/**
 * Probe the current LCU creds against a cheap, always-available endpoint before
 * an important call. If the connection is refused — the classic "stale lockfile
 * / wrong port" symptom — re-read the lockfile and reconnect with fresh creds so
 * the app self-heals instead of holding a dead connection until League is
 * manually restarted. Returns the creds to use, or null if League is unreachable.
 */
async function ensureLiveLcu(): Promise<LcuCreds | null> {
  // No creds latched yet — force a scan in case the watcher hasn't caught up.
  if (!currentLcuCreds) return lcuWatcher?.revalidate() ?? null

  try {
    await lcuGet('/lol-summoner/v1/current-summoner', currentLcuCreds)
    return currentLcuCreds  // got an HTTP response — the connection is live
  } catch (e: any) {
    // A real HTTP error (LcuError) means the socket is fine and the creds are
    // good; only a refused/reset/timed-out connection signals stale creds.
    const refused =
      e?.code === 'ECONNREFUSED' ||
      e?.code === 'ECONNRESET'   ||
      e?.code === 'ECONNABORTED' ||
      /timeout/i.test(e?.message ?? '')
    if (!refused) return currentLcuCreds

    console.log('[Main] LCU probe refused — creds may be stale, revalidating…')
    return lcuWatcher?.revalidate() ?? null
  }
}

// ── CORS / origin injection ──────────────────────────────────────────────────

function setupCorsOverride(ses: Electron.Session) {
  // Inject Origin header so playduelr.gg CORS allows the request
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    if (details.url.startsWith(API_ORIGIN)) {
      headers['Origin'] = API_ORIGIN
      headers['Referer'] = `${API_ORIGIN}/`
    }
    callback({ requestHeaders: headers })
  })

  // Allow credentials with the specific origin (not wildcard)
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    if (details.url.startsWith(API_ORIGIN)) {
      headers['access-control-allow-origin'] = [API_ORIGIN]
      headers['access-control-allow-credentials'] = ['true']
      // Strip SameSite=Lax/Strict from session cookie so Chromium sends it on
      // cross-origin requests from the Electron renderer (localhost or file://).
      if (headers['set-cookie']) {
        headers['set-cookie'] = headers['set-cookie'].map((c) => {
          // Replace SameSite=Lax/Strict with SameSite=None so Chromium sends
          // the session cookie on cross-origin POST requests from Electron.
          // Chrome 80+ defaults to Lax when SameSite is absent, so stripping
          // it alone doesn't help — we must explicitly set None.
          let cookie = c
            .replace(/;\s*SameSite=Lax/gi,    '; SameSite=None')
            .replace(/;\s*SameSite=Strict/gi,  '; SameSite=None')
          // Ensure Secure is present (required for SameSite=None)
          if (/SameSite=None/i.test(cookie) && !/;\s*Secure/i.test(cookie)) {
            cookie += '; Secure'
          }
          return cookie
        })
      }
    }
    callback({ responseHeaders: headers })
  })
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

function setupIpc() {
  // Discord voice channel auto-join
  ipcMain.handle('discord:joinVoice', async (_, url: string) => {
    if (typeof url !== 'string') return
    // Convert https Discord URLs to discord:// deep links so the app opens
    // directly without going through the browser invite page.
    // discord.gg/CODE and discord.com/invite/CODE both map to discord.com/invite/CODE
    let discordUrl = url
    if (!url.startsWith('discord://')) {
      if (url.includes('discord.gg/')) {
        const code = url.split('discord.gg/')[1]?.split('?')[0]
        if (code) discordUrl = `discord://discord.com/invite/${code}`
      } else if (url.includes('discord.com/invite/')) {
        discordUrl = url.replace('https://discord.com/', 'discord://discord.com/')
      } else if (url.includes('discord.com/channels/')) {
        discordUrl = url.replace('https://discord.com/', 'discord://discord.com/')
      }
    }
    try {
      await shell.openExternal(discordUrl)
    } catch {
      // discord:// not registered (Discord not installed) — fall back to browser
      await shell.openExternal(url)
    }
  })

  // Native notification (triggered by renderer for challenges etc.)
  ipcMain.handle('notify', (_, title: string, body: string) => {
    showNotification(title, body)
  })

  // Encrypt a string with the OS keychain (for saving passwords at rest)
  ipcMain.handle('safe-storage:encrypt', (_, text: string): string => {
    if (!safeStorage.isEncryptionAvailable()) return text
    return safeStorage.encryptString(text).toString('base64')
  })

  // Decrypt a base64-encoded ciphertext produced by safe-storage:encrypt
  ipcMain.handle('safe-storage:decrypt', (_, ciphertext: string): string => {
    if (!safeStorage.isEncryptionAvailable()) return ciphertext
    try {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    } catch {
      return ''
    }
  })

  // Open external URL safely
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url)
    }
  })

  // Renderer tells main which match is active so EOG can auto-report it
  ipcMain.handle('match:setActive', (_event, matchId: string | null) => {
    activeMatchId = typeof matchId === 'string' ? matchId : null
  })

  // Renderer pulls current LCU status on mount (avoids did-finish-load race)
  ipcMain.handle('lcu:getStatus', () => lastLcuStatus)

  // Renderer pushes Duelr lobby phase so the tray menu + tooltip stay in sync
  ipcMain.on('tray:setStatus', (_event, payload: { kind: string; opponent?: string; since?: number }) => {
    switch (payload.kind) {
      case 'available':   setTrayStatus({ kind: 'available' }); break
      case 'inQueue':     setTrayStatus({ kind: 'inQueue', since: payload.since ?? Date.now() }); break
      case 'matched':     setTrayStatus({ kind: 'matched', opponent: payload.opponent ?? '?' }); break
      case 'champSelect': setTrayStatus({ kind: 'champSelect' }); break
      case 'inGame':      setTrayStatus({ kind: 'inGame' }); break
      default:            setTrayStatus({ kind: 'idle' }); break
    }
  })

  // Window controls (used by custom title bar in renderer)
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  // Create a 1v1 custom lobby via LCU and return the result
  ipcMain.handle('lcu:createLobby', async (): Promise<import('./lcu/lobby').CreateLobbyResult> => {
    // Probe + self-heal stale creds first so a lingering lockfile doesn't
    // silently fail join-link generation (the "had to restart League" bug).
    const creds = await ensureLiveLcu()
    if (!creds) return { created: false, joinUrl: null, error: 'League is not connected.' }
    const result = await createLobbyAndGetJoinUrl(creds)
    if (result.created && result.joinUrl) {
      showNotification('Join link ready!', 'Your opponent has been sent the link automatically')
    }
    return result
  })
}

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 1150,
    minWidth: 900,
    minHeight: 900,
    show: false,
    backgroundColor: '#050A14',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      // Disable CORS enforcement — the renderer only ever talks to playduelr.gg
      // which we control, so there is no cross-origin security risk. Without this,
      // POST/PATCH requests with Content-Type: application/json trigger a CORS
      // preflight OPTIONS that Next.js returns 405 for, hanging the request.
      webSecurity: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Re-send LCU status once the renderer has loaded its JS and registered
  // its IPC listeners — the initial status event often fires before this.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('lcu:status', lastLcuStatus)
  })

  // Minimize to tray on close (hide instead of quit)
  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  // Open external links in the system browser, not in a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ── App lifecycle ────────────────────────────────────────────────────────────

// Enforce single instance — if a second copy is launched, focus the existing
// window and immediately quit the new process.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

// Suppress Chromium's WPAD proxy-discovery requests — they hit router
// self-signed certs and flood the console with harmless SSL errors.
app.commandLine.appendSwitch('no-proxy-server')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('gg.playduelr.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set up CORS override for the default session
  setupCorsOverride(session.defaultSession)

  // Set up IPC handlers
  setupIpc()

  // Create main window
  const win = createWindow()

  // System tray
  createTray(win)

  // Start watching for League client
  lcuWatcher = watchLockfile(onLcuConnect, onLcuDisconnect)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  stopLcuEvents?.()
  lcuWatcher?.stop()
})
