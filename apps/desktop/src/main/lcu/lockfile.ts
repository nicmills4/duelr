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

// ── Process command-line scan ─────────────────────────────────────────────────

/**
 * Read credentials directly from the running LeagueClientUx.exe process.
 * The process is started with --app-port=N and --remoting-auth-token=X
 * as command-line arguments — no lockfile needed.
 * Also returns the install directory so the watcher knows where to listen
 * for the lockfile unlink (disconnect) event.
 */
function queryProcess(): { creds: LcuCreds; installDir: string | null } | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -First 1).CommandLine",
      ],
      { encoding: 'utf-8', timeout: 5000, windowsHide: true }
    ).trim()

    if (!out) return null

    const port       = out.match(/--app-port=(\d+)/)?.[1]
    const password   = out.match(/--remoting-auth-token=([\w-]+)/)?.[1]
    const pid        = out.match(/--app-pid=(\d+)/)?.[1]
    // "--install-directory=C:\Riot Games\League of Legends\" (may have quotes)
    const installDir = out.match(/--install-directory=["']?([^"'\s]+)/)?.[1]?.replace(/\\$/, '') ?? null

    if (!port || !password) return null

    return {
      creds: {
        pid:      pid ? parseInt(pid, 10) : 0,
        port:     parseInt(port, 10),
        password,
        protocol: 'https',
      },
      installDir,
    }
  } catch (e) {
    console.error('[LCU] queryProcess error:', e)
    return null
  }
}

// ── Lockfile parser (used by the watcher for future starts) ───────────────────

function parseLockfile(content: string): LcuCreds | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const [, pid, port, password, protocol] = parts
  return { pid: parseInt(pid, 10), port: parseInt(port, 10), password, protocol }
}

// ── Candidate lockfile directories to watch ───────────────────────────────────

function watchDirs(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
    return [
      'C:\\Riot Games\\League of Legends',
      'C:\\Program Files\\Riot Games\\League of Legends',
      path.join(localAppData, 'Riot Games', 'League of Legends'),
    ]
  }
  return [
    path.join(os.homedir(), 'Library', 'Application Support', 'Riot Games', 'League of Legends'),
  ]
}

// ── Main export ───────────────────────────────────────────────────────────────

export function watchLockfile(
  onConnect:    (creds: LcuCreds) => void,
  onDisconnect: () => void
): () => void {

  // ── If League is already running: read creds from its process args ────────
  const result = queryProcess()
  console.log('[LCU] queryProcess result:', result)
  if (result) setImmediate(() => onConnect(result.creds))

  // ── Watch lockfile directories for future League starts / stops ───────────
  // Include the live install dir (if found) so the unlink event fires
  // when League exits, even if it's installed at a non-default path.
  const dirs = [...new Set([
    ...(result?.installDir ? [result.installDir] : []),
    ...watchDirs(),
  ])]

  const watcher = chokidar.watch(dirs, {
    persistent:       true,
    ignoreInitial:    true,
    depth:            0,
    awaitWriteFinish: { stabilityThreshold: 200 },
  })

  function tryRead(filePath: string) {
    try {
      const creds = parseLockfile(fs.readFileSync(filePath, 'utf-8'))
      if (creds) onConnect(creds)
    } catch { /* ignore */ }
  }

  watcher.on('add',    (f) => { if (path.basename(f) === 'lockfile') tryRead(f) })
  watcher.on('change', (f) => { if (path.basename(f) === 'lockfile') tryRead(f) })
  watcher.on('unlink', (f) => { if (path.basename(f) === 'lockfile') onDisconnect() })
  watcher.on('error',  () => { /* ignore */ })

  return () => watcher.close()
}
