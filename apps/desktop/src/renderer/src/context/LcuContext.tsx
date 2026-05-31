import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LcuStatus, LcuRank } from '../../../preload/index'

export type { LcuRank }

export interface LcuState {
  connected: boolean
  summonerName: string
  rankLabel: string
  rank: LcuRank | null
  phase: string
  lockedChampion: string | null
}

const defaultState: LcuState = {
  connected: false,
  summonerName: '',
  rankLabel: '',
  rank: null,
  phase: 'None',
  lockedChampion: null,
}

const LcuContext = createContext<LcuState>(defaultState)

export function LcuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LcuState>(defaultState)

  useEffect(() => {
    // Pull current status immediately on mount — avoids the race condition
    // where did-finish-load fires before React has registered its listener.
    const applyStatus = (prev: LcuState, status: LcuStatus): LcuState => ({
      ...prev,
      connected: status.connected,
      summonerName: status.summonerName ?? '',
      rankLabel: status.rankLabel ?? '',
      rank: status.rank ?? null,
      ...(status.connected ? {} : { phase: 'None', lockedChampion: null }),
    })

    window.duelr.lcu.getStatus().then((status: LcuStatus) => {
      setState((prev) => applyStatus(prev, status))
    })

    // Single shared listener for all consumers
    window.duelr.lcu.onStatus((status: LcuStatus) => {
      setState((prev) => applyStatus(prev, status))
    })

    window.duelr.lcu.onChampion((ddragKey: string | null) => {
      setState((prev) => ({ ...prev, lockedChampion: ddragKey }))
    })

    window.duelr.lcu.onPhase((phase: string) => {
      setState((prev) => ({ ...prev, phase }))
    })

    return () => {
      window.duelr.lcu.offStatus()
      window.duelr.lcu.offChampion()
      window.duelr.lcu.offPhase()
    }
  }, [])

  return <LcuContext.Provider value={state}>{children}</LcuContext.Provider>
}

export function useLcu(): LcuState {
  return useContext(LcuContext)
}
