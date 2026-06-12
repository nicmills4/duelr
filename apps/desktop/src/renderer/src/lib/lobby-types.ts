export type AcceptsType = 'any' | 'melee' | 'ranged'
export type LobbyMode   = '1v1' | '2v2'
export type DuoRole     = 'adc' | 'support'
export type SlotKey     = 'team1_adc' | 'team1_support' | 'team2_adc' | 'team2_support'

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

/** The 1v1 lobby state machine, driven by user actions and SSE events. */
export type LobbyPhase =
  | { kind: 'idle' }
  | { kind: 'available'; expiresAt: number }
  | { kind: 'challenging'; targetRiotId: string; challengeId: string }
  | { kind: 'challenged'; payload: ChallengePayload }
  | { kind: 'matched'; opponentRiotId: string; voiceChannelUrl?: string; matchId: string; lobbyJoinUrl?: string; role: 'challenger' | 'challenged'; challengerPlatform: 'web' | 'desktop' }

export interface Champion {
  id:       string      // DDragon key, e.g. "Zed"
  name:     string      // display name
  imageUrl: string
  isRanged: boolean
}

// ── 2v2 groups (mirrors apps/web/lib/lobby-types.ts) ───────────────────────────

export interface GroupSlot {
  userId:     string
  riotId:     string
  region:     string
  champId:    string
  champName:  string
  champImage: string
  role:       DuoRole
  isHost:     boolean
}

export interface LobbyGroup {
  groupId:       string
  eloBracket:    string
  createdAt:     number
  team1_adc:     GroupSlot | null
  team1_support: GroupSlot | null
  team2_adc:     GroupSlot | null
  team2_support: GroupSlot | null
}

export const SLOT_ROLE: Record<SlotKey, DuoRole> = {
  team1_adc:     'adc',
  team1_support: 'support',
  team2_adc:     'adc',
  team2_support: 'support',
}

export const SLOT_LABEL: Record<SlotKey, string> = {
  team1_adc:     'Team 1 · ADC',
  team1_support: 'Team 1 · Support',
  team2_adc:     'Team 2 · ADC',
  team2_support: 'Team 2 · Support',
}

export const ALL_SLOTS: SlotKey[] = ['team1_adc', 'team1_support', 'team2_adc', 'team2_support']

/** The slot a user occupies in a group, or null. */
export function userSlotIn(group: LobbyGroup, userId: string): SlotKey | null {
  for (const k of ALL_SLOTS) {
    if (group[k]?.userId === userId) return k
  }
  return null
}

/** True when all four slots are filled. */
export function groupIsFull(group: LobbyGroup): boolean {
  return !!(group.team1_adc && group.team1_support && group.team2_adc && group.team2_support)
}
