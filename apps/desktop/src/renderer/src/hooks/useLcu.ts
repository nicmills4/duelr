import { useEffect, useState } from 'react'
import type { LcuStatus } from '../../../preload/index'

export interface LcuState {
  connected: boolean
  summonerName: string
  rankLabel: string
  phase: string
  lockedChampion: string | null   // DDragon key when in champ select
}

const defaultState: LcuState = {
  connected: false,
  summonerName: '',
  rankLabel: '',
  phase: 'None',
  lockedChampion: null,
}

export function useLcu(): LcuState {
  const [state, setState] = useState<LcuState>(defaultState)

  useEffect(() => {
    window.duelr.lcu.onStatus((status: LcuStatus) => {
      setState((prev) => ({
        ...prev,
        connected: status.connected,
        summonerName: status.summonerName ?? '',
        rankLabel: status.rankLabel ?? '',
        // Reset phase/champion on disconnect
        ...(status.connected ? {} : { phase: 'None', lockedChampion: null }),
      }))
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

  return state
}
