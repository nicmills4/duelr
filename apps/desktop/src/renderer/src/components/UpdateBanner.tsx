import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, Loader2 } from 'lucide-react'

interface UpdateStatus {
  state:    'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

/**
 * Non-intrusive auto-update prompt. Updates download in the background; this only
 * surfaces while downloading or once an update is ready to install. Restarting is
 * always the user's choice — nothing interrupts a game.
 */
export default function UpdateBanner() {
  const [status, setStatus]       = useState<UpdateStatus>({ state: 'none' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.duelr.updates.getStatus().then(setStatus).catch(() => {})
    window.duelr.updates.onStatus((s) => {
      setStatus(s)
      setDismissed(false) // re-surface when the state advances (e.g. download completes)
    })
    return () => window.duelr.updates.offStatus()
  }, [])

  if (dismissed) return null
  if (status.state !== 'downloading' && status.state !== 'ready') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-dark-600 bg-dark-800 shadow-xl shadow-black/40 p-3">
      {status.state === 'downloading' ? (
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-gold-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Downloading update…</p>
            <div className="mt-1 h-1 rounded-full bg-dark-600 overflow-hidden">
              <div className="h-full bg-gold-400 transition-all" style={{ width: `${status.percent ?? 0}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Download className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              Update ready{status.version ? ` · v${status.version}` : ''}
            </p>
            <p className="text-xs text-gray-500">Restart to apply</p>
          </div>
          <button
            onClick={() => window.duelr.updates.quitAndInstall()}
            className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1.5 flex-shrink-0"
          >
            <RefreshCw className="w-3 h-3" /> Restart
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-600 hover:text-gray-300 flex-shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
