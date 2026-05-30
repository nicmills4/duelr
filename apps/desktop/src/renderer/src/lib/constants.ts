export const ELO_BRACKETS = [
  { value: 'low',   label: 'Low Elo',  description: 'Iron · Bronze · Silver' },
  { value: 'mid',   label: 'Mid Elo',  description: 'Gold · Platinum' },
  { value: 'high',  label: 'High Elo', description: 'Emerald · Diamond' },
  { value: 'elite', label: 'Elite',    description: 'Master · Grandmaster' },
  { value: 'apex',  label: 'Apex',     description: 'Challenger' },
] as const

export type EloBracket = (typeof ELO_BRACKETS)[number]['value']

export const TIER_TO_BRACKET: Record<string, EloBracket> = {
  IRON: 'low', BRONZE: 'low', SILVER: 'low',
  GOLD: 'mid', PLATINUM: 'mid',
  EMERALD: 'high', DIAMOND: 'high',
  MASTER: 'elite', GRANDMASTER: 'elite',
  CHALLENGER: 'apex',
}

export const API_BASE = 'https://playduelr.gg'
