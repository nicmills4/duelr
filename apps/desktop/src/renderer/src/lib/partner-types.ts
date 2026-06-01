export const AVAILABILITY_SLOTS = [
  { id: 'morning',   label: 'Morning',    desc: '6am – 12pm' },
  { id: 'afternoon', label: 'Afternoon',  desc: '12pm – 6pm' },
  { id: 'evening',   label: 'Evening',    desc: '6pm – 11pm' },
  { id: 'late',      label: 'Late Night', desc: '11pm – 4am' },
  { id: 'weekends',  label: 'Weekends',   desc: 'Sat & Sun'  },
] as const

export type AvailabilitySlot = (typeof AVAILABILITY_SLOTS)[number]['id']

// Lanes a partner can flag — same set a coach picks for "Specializes in",
// using the same role icons (copied into renderer/public/) the coaching page uses.
export const PARTNER_LANES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as const
export type PartnerLane = (typeof PARTNER_LANES)[number]

export const LANE_ICON: Record<string, string> = {
  Top:     '/top.png',
  Jungle:  '/jungle.png',
  Mid:     '/mid.png',
  Bot:     '/bot.png',
  Support: '/support.png',
}

export interface ChampEntry {
  id: string
  imageUrl: string
}

export interface PartnerPostPublic {
  id: string
  userId: string
  riotId: string
  region: string
  eloBracket: string
  eloBracketLabel: string
  myChampions: ChampEntry[]
  vsChampions: ChampEntry[]
  lanes: string[]
  availability: string[]
  notes: string | null
  createdAt: string
  isOwn?: boolean
}
