import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import chokidar from 'chokidar'

export interface LcuCreds {
  pid: number
  port: number
  password: string
  protocol: string
}

// ── Lockfile parser ───────────────────────────────────────────────────────────

function parseLockfile(content: string): LcuCreds | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const [, pid, port, password, protocol] = parts
  return { pid: parseInt(pid, 10), port: parseInt(port, 10), password, protocol }
}

// ── Candidate lockfile / install directories ──────────────────────────────────

function candidateDirs(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    return [
      'C:\\Riot Games\\League of Legends',
      path.join(programFiles, 'Riot Games', 'League of Legends'),
      path.join(programFilesX86, 'Riot Games', 'League of Legends'),
      path.join(localAppData, 'Riot Games', 'League of Legends'),
      'D:\\Riot Games\\League of Legends',
      'D:\\Games\\League of Legends',
      'E:\\Riot Games\\League of Legends',
    ]
  }
  return [
    path.join(os.homedir(), 'Library', 'Application Support', 'Riot Games', 'League of Legends'),
  ]
}

// ── Method 1: direct lockfile scan ───────────────────────────────────────────
// Fastest — no shell needed. Works as long as League is installed in a
// known location.

function tryLockfileScan(): { creds: LcuCreds; installDir: string } | null {
  for (const dir of candidateDirs()) {
    const lockfilePath = path.join(dir, 'lockfile')
    try {
      const exists = fs.existsSync(lockfilePath)
      console.log('[LCU] Scan', lockfilePath, '→ exists:', exists)
      if (!exists) continue

      const content = fs.readFileSync(lockfilePath, 'utf-8')
      console.log('[LCU] Content length:', content.length, 'raw:', JSON.stringify(content.slice(0, 80)))
      const creds = parseLockfile(content)
      if (creds) {
        console.log('[LCU] Parsed OK — port:', creds.port)
        return { creds, installDir: dir }
      } else {
        console.log('[LCU] parseLockfile returned null')
      }
    } catch (e) {
      console.error('[LCU] Error reading', lockfilePath, e)
    }
  }
  return null
}

// ── Method 1b: PowerShell Get-Content (fallback if fs is blocked) ─────────────

function tryPowerShellRead(): { creds: LcuCreds; installDir: string } | null {
  if (process.platform !== 'win32') return null
  for (const dir of candidateDirs()) {
    const lockfilePath = path.join(dir, 'lockfile')
    try {
      const content = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Get-Content -LiteralPath '${lockfilePath}' -ErrorAction SilentlyContinue`],
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      ).trim()
      if (!content) continue
      console.log('[LCU] PS read', lockfilePath, '→', JSON.stringify(content.slice(0, 80)))
      const creds = parseLockfile(content)
      if (creds) return { creds, installDir: dir }
    } catch { /* ignore */ }
  }
  return null
}

// ── Method 2: WMIC (broad compatibility) ─────────────────────────────────────

function tryWmic(): { creds: LcuCreds; installDir: string | null } | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      'wmic',
      ['process', 'where', "name='LeagueClientUx.exe'", 'get', 'CommandLine', '/format:list'],
      { encoding: 'utf-8', timeout: 5000, windowsHide: true }
    ).trim()
    console.log('[LCU] WMIC output length:', out.length)
    return parseCommandLine(out)
  } catch (e) {
    console.error('[LCU] WMIC error:', e)
    return null
  }
}

// ── Method 3: PowerShell Get-CimInstance ─────────────────────────────────────

function tryCimInstance(): { creds: LcuCreds; installDir: string | null } | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -First 1).CommandLine",
      ],
      { encoding: 'utf-8', timeout: 8000, windowsHide: true }
    ).trim()
    console.log('[LCU] CIM output length:', out.length)
    return parseCommandLine(out)
  } catch (e) {
    console.error('[LCU] CimInstance error:', e)
    return null
  }
}

// ── Command-line parser (shared by WMIC + CIM) ────────────────────────────────

function parseCommandLine(out: string): { creds: LcuCreds; installDir: string | null } | null {
  if (!out) return null

  // WMIC wraps the value: "CommandLine=..."
  const cleaned = out.includes('CommandLine=')
    ? (out.match(/CommandLine=(.+)/s)?.[1] ?? out).trim()
    : out

  const port     = cleaned.match(/--app-port=(\d+)/)?.[1]
  const password = cleaned.match(/--remoting-auth-token=([\w-]+)/)?.[1]
  const pid      = cleaned.match(/--app-pid=(\d+)/)?.[1]

  if (!port || !password) {
    console.log('[LCU] Could not extract port/password from command line')
    return null
  }

  const installDirMatch =
    cleaned.match(/--install-directory="([^"]+)"/) ??
    cleaned.match(/--install-directory='([^']+)'/) ??
    cleaned.match(/--install-directory=(\S+)/)
  const installDir = installDirMatch?.[1]?.replace(/[/\\]+$/, '') ?? null

  console.log('[LCU] Parsed — port:', port, 'installDir:', installDir)
  return {
    creds: {
      pid:      pid ? parseInt(pid, 10) : 0,
      port:     parseInt(port, 10),
      password,
      protocol: 'https',
    },
    installDir,
  }
}

// ── queryProcess: tries all three methods in order ────────────────────────────

function queryProcess(): { creds: LcuCreds; installDir: string | null } | null {
  // 1. Direct lockfile read via Node fs
  const fromFile = tryLockfileScan()
  if (fromFile) return fromFile

  // 1b. PowerShell Get-Content (if Node fs is permission-blocked)
  const fromPs = tryPowerShellRead()
  if (fromPs) return fromPs

  // 2. WMIC
  const fromWmic = tryWmic()
  if (fromWmic) return fromWmic

  // 3. PowerShell CIM — last resort
  const fromCim = tryCimInstance()
  if (fromCim) return fromCim

  console.log('[LCU] All detection methods returned null — League not running or not found')
  return null
}

// ── Main export ───────────────────────────────────────────────────────────────

export function watchLockfile(
  onConnect:    (creds: LcuCreds) => void,
  onDisconnect: () => void
): () => void {

  let connected = false

  function tryConnect() {
    if (connected) return
    const result = queryProcess()
    if (!result) return
    connected = true
    if (result.installDir && !watcher.getWatched()[result.installDir]) {
      watcher.add(result.installDir)
    }
    onConnect(result.creds)
  }

  function handleDisconnect() {
    if (!connected) return
    connected = false
    onDisconnect()
  }

  // ── If League is already running ──────────────────────────────────────────
  const initial = queryProcess()
  console.log('[LCU] Initial queryProcess:', initial ? `connected (port ${initial.creds.port})` : 'null')
  if (initial) {
    connected = true
    setImmediate(() => onConnect(initial.creds))
  }

  // ── Watch lockfile directories ────────────────────────────────────────────
  const dirs = [...new Set([
    ...(initial?.installDir ? [initial.installDir] : []),
    ...candidateDirs(),
  ])]

  const watcher = chokidar.watch(dirs, {
    persistent:       true,
    ignoreInitial:    true,
    depth:            0,
    awaitWriteFinish: { stabilityThreshold: 200 },
  })

  function tryRead(filePath: string) {
    if (connected) return
    try {
      const creds = parseLockfile(fs.readFileSync(filePath, 'utf-8'))
      if (creds) { connected = true; onConnect(creds) }
    } catch { /* ignore */ }
  }

  watcher.on('add',    (f) => { if (path.basename(f) === 'lockfile') tryRead(f) })
  watcher.on('change', (f) => { if (path.basename(f) === 'lockfile') tryRead(f) })
  watcher.on('unlink', (f) => { if (path.basename(f) === 'lockfile') handleDisconnect() })
  watcher.on('error',  (e) => { console.error('[LCU] watcher error:', e) })

  // ── Polling fallback every 5s while disconnected ──────────────────────────
  const pollTimer = setInterval(() => {
    if (!connected) tryConnect()
  }, 5000)

  return () => {
    clearInterval(pollTimer)
    watcher.close()
  }
}
