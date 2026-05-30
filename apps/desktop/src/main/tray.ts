import { app, Menu, Tray, nativeImage, BrowserWindow } from 'electron'
import path from 'path'

let tray: Tray | null = null

export function createTray(win: BrowserWindow): void {
  // Use a simple 16x16 icon; replace with a real icon file before distribution
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      // Fallback: 16×16 dark transparent icon
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Duelr')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Duelr',
      click: () => {
        win.show()
        win.focus()
      },
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

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    win.show()
    win.focus()
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
