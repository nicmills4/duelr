import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

export interface UpdateStatus {
  state:    'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

let lastStatus: UpdateStatus = { state: 'none' }

/**
 * Wires electron-updater to the renderer. Updates download in the background and
 * install on quit (autoInstallOnAppQuit) so a duel is never interrupted — the
 * renderer surfaces a non-intrusive "Restart to update" prompt when one is ready.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.logger = log
  log.transports.file.level = 'info'
  autoUpdater.autoDownload          = true
  autoUpdater.autoInstallOnAppQuit  = true

  const emit = (status: UpdateStatus) => {
    lastStatus = status
    getWindow()?.webContents.send('update:status', status)
  }

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available',     (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'none' }))
  autoUpdater.on('download-progress',    (p) => emit({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded',    (info) => emit({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    log.error('[updater] error:', err)
    emit({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  })

  const check = () => {
    autoUpdater.checkForUpdates().catch((e) => log.error('[updater] check failed:', e))
  }

  ipcMain.handle('update:getStatus', () => lastStatus)
  ipcMain.handle('update:check', () => { check() })
  ipcMain.handle('update:quitAndInstall', () => {
    // isSilent=false → show the installer; forceRunAfter=true → relaunch when done.
    autoUpdater.quitAndInstall(false, true)
  })

  // electron-updater is a noisy no-op when the app isn't packaged, so only schedule
  // real checks in production builds. (Use dev-app-update.yml + forceDevUpdateConfig
  // to exercise the flow locally.)
  if (app.isPackaged) {
    setTimeout(check, 8_000)                 // shortly after launch
    setInterval(check, 3 * 60 * 60 * 1000)   // and every 3 hours — it's a long-running tray app
  }
}
