import { Notification } from 'electron'

export function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return

  const n = new Notification({
    title,
    body,
    silent: false,
  })
  n.show()
}
