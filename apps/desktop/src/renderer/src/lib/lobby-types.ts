export type AcceptsType = 'any' | 'melee' | 'ranged'
export type LobbyMode   = '1v1' | '2v2'

export interface LobbyEntry {
  userId:       string
  myChampion:   string
  champName:    string
  champImage:   string
  eloBracket:   string
  acceptsType:  AcceptsType
  vsChampions?: string[]
  joinedAt:     number
}

export interface LobbyPlayer extends LobbyEntry {
  riotId: string
  region: string
}

export interface ChallengePayload {
  challengeId:          string
  challengerId:         string
  challengerRiotId:     string
  challengerChampion:   string
  challengerChampName:  string
  challengerChampImage: string
  challengerElo:        string
  targetId:             string
}

export interface Champion {
  id:       string      // DDragon key, e.g. "Zed"
  name:     string      // display name
  imageUrl: string
  isRanged: boolean
}
