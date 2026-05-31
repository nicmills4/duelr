/**
 * LCU end-of-game reader.
 *
 * From the most recent game in LCU match history this derives, for the local
 * player:
 *   • result      — did they win the 1v1 by FIRST BLOOD (the Duelr win
 *                   condition)? 'win' / 'loss' / null.
 *   • myChampion  — the champion they ACTUALLY played (DDragon key).
 *   • oppChampion — the champion the opponent ACTUALLY played (DDragon key).
 *
 * The champions are read here (rather than trusting the picks indicated at
 * lobby creation) so the Match record reflects what was really played even if a
 * player swapped their pick in champ select. A single desktop client corrects
 * BOTH sides, since match history exposes every participant.
 *
 * Why match history (not /lol-end-of-game/v1/eog-stats-block): the EOG stats
 * block resolves win/loss by the *actual* game result (nexus / surrender), which
 * never fires for a duel that ends right after first blood. The match-history
 * endpoint exposes Match-v5-style participant stats — including `firstBloodKill`
 * and `championId` per player — so we can credit the kill and read the champions
 * even when the game itself was abandoned or remade.
 */
import { lcuGet } from './client'
import type { LcuCreds } from './lockfile'

interface MhParticipantStats {
  firstBloodKill?: boolean
  win?: boolean
}
interface MhParticipant {
  participantId: number
  championId?: number
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
interface ChampSummaryEntry {
  id: number
  alias: string
}

/** Champion integer ID → DDragon key (e.g. 62 → "MonkeyKing"). */
type ChampionMap = Map<number, string>

export interface EogReport {
  /** 'win' / 'loss' by first blood, or null if undeterminable. */
  result: 'win' | 'loss' | null
  /** DDragon key the local player actually played, or null if unknown. */
  myChampion: string | null
  /** DDragon key the opponent actually played, or null if unknown. */
  oppChampion: string | null
}

const EMPTY: EogReport = { result: null, myChampion: null, oppChampion: null }

export async function getFirstBloodResult(
  creds: LcuCreds,
  attempts = 10,
  delayMs = 3000
): Promise<EogReport> {
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
    return EMPTY
  }

  // championId → DDragon key, so the champions we report match the web's format.
  const champMap = await loadChampionMap(creds)

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
        if (result) {
          const { my, opp } = championsFromGame(game, myPuuid, champMap)
          console.log(`[LCU][firstblood] champions — me=${my ?? '?'} opp=${opp ?? '?'}`)
          return { result, myChampion: my, oppChampion: opp }
        }
      } else {
        console.log(`[LCU][firstblood] attempt ${i + 1}: no game in history yet`)
      }
    } catch {
      // match history not populated yet — retry
      console.log(`[LCU][firstblood] attempt ${i + 1}: match history unavailable`)
    }

    if (i < attempts - 1) await sleep(delayMs)
  }

  return EMPTY
}

async function loadChampionMap(creds: LcuCreds): Promise<ChampionMap> {
  try {
    const summary = await lcuGet<ChampSummaryEntry[]>(
      '/lol-game-data/assets/v1/champion-summary.json',
      creds
    )
    if (Array.isArray(summary)) {
      return new Map(summary.filter((c) => c.id > 0).map((c) => [c.id, c.alias]))
    }
  } catch {
    // champion map unavailable — champions just won't be corrected
  }
  return new Map()
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

/** Resolve the DDragon keys both players actually locked in this game. */
function championsFromGame(
  game: MhGame,
  myPuuid: string,
  champMap: ChampionMap
): { my: string | null; opp: string | null } {
  const ids   = game.participantIdentities ?? []
  const parts = game.participants ?? []

  const myId = ids.find((x) => x.player?.puuid === myPuuid)?.participantId
  if (myId == null) return { my: null, opp: null }

  const keyOf = (p?: MhParticipant): string | null =>
    p?.championId != null ? champMap.get(p.championId) ?? null : null

  const me  = parts.find((p) => p.participantId === myId)
  const opp = parts.find((p) => p.participantId !== myId) // 1v1 → the other slot

  return { my: keyOf(me), opp: keyOf(opp) }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
