import { app, shell, BrowserWindow, ipcMain, session, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { watchLockfile } from './lcu/lockfile'
import { lcuGet } from './lcu/client'
import { connectLcuEvents } from './lcu/events'
import { createLobbyAndGetJoinUrl } from './lcu/lobby'
import { getEndOfGameResult } from './lcu/end-of-game'
import { createTray } from './tray'
import { showNotification } from './notifications'
import type { LcuCreds } from './lcu/lockfile'

const API_ORIGIN = 'https://playduelr.gg'

// ── LCU state ────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let stopLcuEvents: (() => void) | null = null
let stopLockfileWatch: (() => void) | null = null
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

async function onLcuConnect(creds: LcuCreds) {
  currentLcuCreds = creds
  // Fetch summoner info + rank to show in status bar
  let summonerName = ''
  let rankLabel = ''

  try {
    const summoner = await lcuGet<SummonerInfo>('/lol-summoner/v1/current-summoner', creds)
    summonerName = summoner?.displayName ?? summoner?.internalName ?? ''
  } catch { /* ignore */ }

  try {
    const ranked = await lcuGet<RankedStats>('/lol-ranked/v1/current-ranked-stats', creds)
    const solo = ranked?.queueMap?.['RANKED_SOLO_5x5']
    if (solo?.tier) {
      rankLabel = `${solo.tier} ${solo.division ?? ''} ${solo.leaguePoints ?? 0} LP`.trim()
    }
  } catch { /* ignore */ }

  lastLcuStatus = { connected: true, summonerName, rankLabel }
  mainWindow?.webContents.send('lcu:status', lastLcuStatus)

  // Connect event stream — champion detection + phase tracking
  stopLcuEvents?.()
  stopLcuEvents = connectLcuEvents(creds, {
    onPhase: (phase) => {
      mainWindow?.webContents.send('lcu:phase', phase)
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
  currentLcuCreds = null
  stopLcuEvents?.()
  stopLcuEvents = null
  lastLcuStatus = { connected: false }
  mainWindow?.webContents.send('lcu:status', lastLcuStatus)
  mainWindow?.webContents.send('lcu:champion', null)
}

async function handleEndOfGame() {
  const matchId = activeMatchId
  const creds   = currentLcuCreds
  if (!matchId || !creds) return

  const result = await getEndOfGameResult(creds)
  // Send to renderer whether we got a result or not — renderer handles both cases
  mainWindow?.webContents.send('lcu:eog-result', { matchId, result })

  if (result) {
    showNotification(
      result === 'win' ? 'GG — Victory!' : 'GG — Defeat',
      'Reporting your match result automatically…'
    )
  }

  // Clear the active match so we don't re-report on subsequent EOG events
  activeMatchId = null
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
        headers['set-cookie'] = headers['set-cookie'].map((c) =>
          c
            .replace(/;\s*SameSite=Lax/gi, '')
            .replace(/;\s*SameSite=Strict/gi, '')
        )
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
    // Prefer discord:// protocol; fall back to https link
    const discordUrl = url.startsWith('discord://')
      ? url
      : url.replace('https://discord.gg/', 'discord://discord.gg/')
    try {
      await shell.openExternal(discordUrl)
    } catch {
      // If discord:// fails, open the https link in browser
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

  // Create a 1v1 custom lobby via LCU and return the shareable join URL
  ipcMain.handle('lcu:createLobby', async (): Promise<string | null> => {
    if (!currentLcuCreds) return null
    try {
      const url = await createLobbyAndGetJoinUrl(currentLcuCreds)
      if (url) {
        showNotification('Lobby created!', 'Join link copied — share it with your opponent')
      }
      return url
    } catch {
      return null
    }
  })
}

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#050A14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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
  stopLockfileWatch = watchLockfile(onLcuConnect, onLcuDisconnect)

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
  stopLockfileWatch?.()
})
