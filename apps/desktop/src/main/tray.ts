import { app, Menu, Tray, nativeImage, BrowserWindow } from 'electron'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrayStatus =
  | { kind: 'idle' }
  | { kind: 'available' }                    // posted in lobby, waiting for a challenge
  | { kind: 'inQueue'; since: number }       // in Duelr queue — since = Date.now() at queue join
  | { kind: 'matched'; opponent: string }    // match found, waiting to start
  | { kind: 'champSelect' }
  | { kind: 'inGame' }

// ── Module state ──────────────────────────────────────────────────────────────

let tray:         Tray          | null = null
let win:          BrowserWindow | null = null
let normalIcon:   Electron.NativeImage
let alertIcon:    Electron.NativeImage
let status:       TrayStatus = { kind: 'idle' }
let tickTimer:    ReturnType<typeof setInterval>  | null = null
let flashTimer:   ReturnType<typeof setTimeout>   | null = null
let lcuConnected: boolean = false

// ── Icon helpers ──────────────────────────────────────────────────────────────

function loadIcons(resourcesDir: string) {
  const iconPath = path.join(resourcesDir, 'tray-icon.png')
  try {
    normalIcon = nativeImage.createFromPath(iconPath)
    if (normalIcon.isEmpty()) normalIcon = nativeImage.createEmpty()
  } catch {
    normalIcon = nativeImage.createEmpty()
  }

  // Alert icon: tint the normal icon gold using canvas-style pixel manipulation.
  // If this fails for any reason we just reuse the normal icon.
  try {
    const size   = { width: 16, height: 16 }
    const src    = normalIcon.resize(size)
    const bitmap = src.getBitmap()

    // Overlay a gold tint (R:200 G:155 B:60) on non-transparent pixels
    for (let i = 0; i < bitmap.length; i += 4) {
      const a = bitmap[i + 3]
      if (a > 10) {
        bitmap[i]     = Math.min(255, bitmap[i]     + 80)   // R ↑
        bitmap[i + 1] = Math.min(255, bitmap[i + 1] + 50)   // G ↑ slightly
        bitmap[i + 2] = Math.max(0,   bitmap[i + 2] - 40)   // B ↓
      }
    }
    alertIcon = nativeImage.createFromBitmap(bitmap, { ...size, scaleFactor: 1 })
  } catch {
    alertIcon = normalIcon
  }
}

// ── Menu builder ──────────────────────────────────────────────────────────────

function statusLabel(): string {
  switch (status.kind) {
    case 'idle':        return lcuConnected ? '● League connected' : '○ League not running'
    case 'available':   return '📋 Lobby open — waiting for challenge'
    case 'inQueue':     return `⏳ In queue — ${elapsed(status.since)}`
    case 'matched':     return `⚡ Match found! vs ${status.opponent}`
    case 'champSelect': return '🎮 In champ select'
    case 'inGame':      return '⚔️  In game'
  }
}

function elapsed(since: number): string {
  const s = Math.floor((Date.now() - since) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function rebuildMenu() {
  if (!tray || !win) return

  const menu = Menu.buildFromTemplate([
    {
      label:   'Open Duelr',
      click:   () => { win!.show(); win!.focus() },
    },
    { type: 'separator' },
    {
      label:   statusLabel(),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)

  // Keep tooltip in sync
  tray.setToolTip(status.kind === 'matched'
    ? `Duelr — Match found! vs ${status.opponent}`
    : status.kind === 'inQueue'
    ? `Duelr — In queue ${elapsed(status.since)}`
    : status.kind === 'available'
    ? 'Duelr — Lobby open'
    : status.kind === 'champSelect'
    ? 'Duelr — Champ Select'
    : status.kind === 'inGame'
    ? 'Duelr — In Game'
    : 'Duelr'
  )
}

// ── Tick (queue timer) ────────────────────────────────────────────────────────

function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    if (status.kind === 'inQueue') rebuildMenu()
    else stopTick()
  }, 1000)
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

// ── Flash (match found alert) ─────────────────────────────────────────────────

function startFlash() {
  if (!tray || !win) return
  win.flashFrame(true)

  // Alternate between normal and alert icon every 500ms
  let alt = false
  if (flashTimer) clearInterval(flashTimer as unknown as ReturnType<typeof setInterval>)
  flashTimer = setInterval(() => {
    tray?.setImage(alt ? normalIcon : alertIcon)
    alt = !alt
  }, 500) as unknown as ReturnType<typeof setTimeout>
}

function stopFlash() {
  if (flashTimer) { clearInterval(flashTimer as unknown as ReturnType<typeof setInterval>); flashTimer = null }
  tray?.setImage(normalIcon)
  win?.flashFrame(false)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createTray(mainWin: BrowserWindow): void {
  win = mainWin
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(__dirname, '../../resources')
  loadIcons(resourcesDir)

  tray = new Tray(normalIcon)
  tray.setToolTip('Duelr')

  // Single-click shows the window (not just double-click)
  tray.on('click', () => { win?.show(); win?.focus() })
  tray.on('double-click', () => { win?.show(); win?.focus() })

  rebuildMenu()

  // Stop flashing when user focuses the window
  mainWin.on('focus', () => stopFlash())
}

export function setTrayLcuConnected(connected: boolean) {
  lcuConnected = connected
  rebuildMenu()
}

export function setTrayStatus(next: TrayStatus) {
  const prev = status
  status = next
  stopFlash()

  if (next.kind === 'matched' && prev.kind !== 'matched') {
    startFlash()
  }

  if (next.kind === 'inQueue') {
    startTick()
  } else {
    stopTick()
  }

  rebuildMenu()
}

export function destroyTray(): void {
  stopTick()
  stopFlash()
  tray?.destroy()
  tray = null
}
