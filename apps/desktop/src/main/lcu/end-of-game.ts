/**
 * LCU end-of-game first-blood reader.
 *
 * Determines whether the local player won the 1v1 by FIRST BLOOD — the Duelr
 * win condition — by reading the most recent game from LCU match history.
 *
 * Why match history (not /lol-end-of-game/v1/eog-stats-block): the EOG stats
 * block resolves win/loss by the *actual* game result (nexus / surrender), which
 * never fires for a duel that ends right after first blood. The match-history
 * endpoint exposes Match-v5-style participant stats — including `firstBloodKill`
 * per player — so we can credit the kill even when the game itself was
 * abandoned or remade.
 *
 * Returns 'win'  — the local player scored first blood,
 *         'loss' — the opponent scored first blood,
 *         null   — no first blood found / data unavailable (nothing to record).
 */
import { lcuGet } from './client'
import type { LcuCreds } from './lockfile'

interface MhParticipantStats {
  firstBloodKill?: boolean
  win?: boolean
}
interface MhParticipant {
  participantId: number
  stats?: MhParticipantStats
}
interface MhIdentity {
  participantId: number
  player?: { puuid?: string }
}
interface MhGame {
  gameId: number
  gameType?: string
  participants?: MhParticipant[]
  participantIdentities?: MhIdentity[]
}
interface MhResponse {
  games?: { games?: MhGame[] }
}
interface CurrentSummoner {
  puuid?: string
}

export async function getFirstBloodResult(
  creds: LcuCreds,
  attempts = 10,
  delayMs = 3000
): Promise<'win' | 'loss' | null> {
  // Who am I? Needed to map a participant slot to the local player.
  let myPuuid: string | undefined
  try {
    const me = await lcuGet<CurrentSummoner>('/lol-summoner/v1/current-summoner', creds)
    myPuuid = me?.puuid
  } catch {
    // current-summoner unavailable — can't attribute first blood
  }
  if (!myPuuid) {
    console.log('[LCU][firstblood] no local puuid — cannot determine result')
    return null
  }

  for (let i = 0; i < attempts; i++) {
    try {
      // begIndex=0&endIndex=0 → just the most recent game (the one that ended).
      const hist = await lcuGet<MhResponse>(
        `/lol-match-history/v1/products/lol/${myPuuid}/matches?begIndex=0&endIndex=0`,
        creds
      )
      const game = hist?.games?.games?.[0]
      if (game) {
        const result = firstBloodFromGame(game, myPuuid)
        console.log(
          `[LCU][firstblood] attempt ${i + 1}: gameId=${game.gameId} type=${game.gameType ?? '?'} → ${result ?? 'no first blood yet'}`
        )
        if (result) return result
      } else {
        console.log(`[LCU][firstblood] attempt ${i + 1}: no game in history yet`)
      }
    } catch {
      // match history not populated yet — retry
      console.log(`[LCU][firstblood] attempt ${i + 1}: match history unavailable`)
    }

    if (i < attempts - 1) await sleep(delayMs)
  }

  return null
}

function firstBloodFromGame(game: MhGame, myPuuid: string): 'win' | 'loss' | null {
  const ids   = game.participantIdentities ?? []
  const parts = game.participants ?? []

  const myId = ids.find((x) => x.player?.puuid === myPuuid)?.participantId
  if (myId == null) return null

  const firstBlood = parts.find((p) => p.stats?.firstBloodKill === true)
  if (!firstBlood) return null // no kill recorded (remake / no first blood)

  return firstBlood.participantId === myId ? 'win' : 'loss'
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
