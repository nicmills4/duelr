/**
 * LCU end-of-game stats reader.
 * Fetches /lol-end-of-game/v1/eog-stats-block and determines whether
 * the local player won or lost the most recent game.
 */
import { lcuGet } from './client'
import type { LcuCreds } from './lockfile'

interface EogPlayer {
  cellId: number
  puuid?: string
  wins?: number
  // The game-result field name varies by patch; fall back to checking the team
}

interface EogTeam {
  win: boolean
  players: EogPlayer[]
}

interface EogStatsBlock {
  localPlayerCellId: number
  teams?: EogTeam[]
}

/**
 * Returns 'win', 'loss', or null (if data is unavailable / ambiguous).
 * We wait up to ~10 s after entering EndOfGame phase because the stats
 * block may not be populated immediately.
 */
export async function getEndOfGameResult(
  creds: LcuCreds,
  attempts = 5,
  delayMs = 2000
): Promise<'win' | 'loss' | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const block = await lcuGet<EogStatsBlock>(
        '/lol-end-of-game/v1/eog-stats-block',
        creds
      )

      if (!block?.teams?.length) {
        if (i < attempts - 1) await sleep(delayMs)
        continue
      }

      const localCellId = block.localPlayerCellId

      for (const team of block.teams) {
        const inTeam = team.players.some((p) => p.cellId === localCellId)
        if (inTeam) {
          return team.win ? 'win' : 'loss'
        }
      }
    } catch {
      // LCU not ready yet
    }

    if (i < attempts - 1) await sleep(delayMs)
  }

  return null
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
