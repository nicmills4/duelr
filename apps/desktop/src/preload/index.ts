import { contextBridge, ipcRenderer } from 'electron'

// ── Types exposed to renderer ─────────────────────────────────────────────────

export interface LcuRank {
  tier: string      // "EMERALD", "GOLD", … (uppercase from LCU)
  division: string  // "IV", "III", … ("" for Master+)
  lp: number
  wins: number
  losses: number
}

export interface LcuStatus {
  connected: boolean
  summonerName?: string
  rankLabel?: string
  /** Solo/Duo ranked, or null if unranked / unavailable. */
  rank?: LcuRank | null
}

export interface EogResult {
  matchId: string
  result: 'win' | 'loss' | null
  /** DDragon key the local player actually played (corrects the indicated pick). */
  myChampion?: string | null
  /** DDragon key the opponent actually played. */
  oppChampion?: string | null
}

export interface DuelrAPI {
  lcu: {
    onStatus: (cb: (status: LcuStatus) => void) => void
    offStatus: () => void
    getStatus: () => Promise<LcuStatus>
    onChampion: (cb: (ddragKey: string | null) => void) => void
    offChampion: () => void
    onPhase: (cb: (phase: string) => void) => void
    offPhase: () => void
    onEogResult: (cb: (eog: EogResult) => void) => void
    offEogResult: () => void
    /** Inspects the current LCU lobby and returns a join URL plus a diagnostic trace. */
    createLobby: () => Promise<{ created: boolean; joinUrl: string | null; error?: string; debug?: string }>
  }
  match: {
    /** Tell main process which match is currently active so EOG can auto-report it. */
    setActive: (matchId: string | null) => Promise<void>
  }
  discord: {
    joinVoice: (url: string) => Promise<void>
  }
  notify: (title: string, body: string) => Promise<void>
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  safeStorage: {
    /** Encrypt a plaintext string via OS keychain. Returns base64 ciphertext. */
    encrypt: (text: string) => Promise<string>
    /** Decrypt a base64 ciphertext previously produced by encrypt. */
    decrypt: (ciphertext: string) => Promise<string>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  tray: {
    setStatus: (payload: { kind: string; opponent?: string; since?: number }) => void
  }
}

// ── contextBridge ─────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('duelr', {
  lcu: {
    onStatus: (cb: (status: LcuStatus) => void) => {
      ipcRenderer.removeAllListeners('lcu:status')
      ipcRenderer.on('lcu:status', (_, status: LcuStatus) => cb(status))
    },
    offStatus: () => ipcRenderer.removeAllListeners('lcu:status'),
    getStatus: () => ipcRenderer.invoke('lcu:getStatus'),

    onChampion: (cb: (ddragKey: string | null) => void) => {
      ipcRenderer.removeAllListeners('lcu:champion')
      ipcRenderer.on('lcu:champion', (_, key: string | null) => cb(key))
    },
    offChampion: () => ipcRenderer.removeAllListeners('lcu:champion'),

    onPhase: (cb: (phase: string) => void) => {
      ipcRenderer.removeAllListeners('lcu:phase')
      ipcRenderer.on('lcu:phase', (_, phase: string) => cb(phase))
    },
    offPhase: () => ipcRenderer.removeAllListeners('lcu:phase'),

    onEogResult: (cb: (eog: EogResult) => void) => {
      ipcRenderer.removeAllListeners('lcu:eog-result')
      ipcRenderer.on('lcu:eog-result', (_, eog: EogResult) => cb(eog))
    },
    offEogResult: () => ipcRenderer.removeAllListeners('lcu:eog-result'),

    createLobby: () => ipcRenderer.invoke('lcu:createLobby'),
  },

  match: {
    setActive: (matchId: string | null) => ipcRenderer.invoke('match:setActive', matchId),
  },

  discord: {
    joinVoice: (url: string) => ipcRenderer.invoke('discord:joinVoice', url),
  },

  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  safeStorage: {
    encrypt: (text: string) => ipcRenderer.invoke('safe-storage:encrypt', text),
    decrypt: (ciphertext: string) => ipcRenderer.invoke('safe-storage:decrypt', ciphertext),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  tray: {
    setStatus: (payload) => ipcRenderer.send('tray:setStatus', payload),
  },
} satisfies DuelrAPI)
