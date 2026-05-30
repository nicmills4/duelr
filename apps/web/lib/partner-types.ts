export const AVAILABILITY_SLOTS = [
  { id: "morning",   label: "Morning",    desc: "6am – 12pm" },
  { id: "afternoon", label: "Afternoon",  desc: "12pm – 6pm" },
  { id: "evening",   label: "Evening",    desc: "6pm – 11pm" },
  { id: "late",      label: "Late Night", desc: "11pm – 4am" },
  { id: "weekends",  label: "Weekends",   desc: "Sat & Sun"  },
] as const;

export type AvailabilitySlot = (typeof AVAILABILITY_SLOTS)[number]["id"];

export interface ChampEntry {
  id: string;
  imageUrl: string;
}

export interface PartnerPostPublic {
  id: string;
  userId: string;
  riotId: string;
  region: string;
  eloBracket: string;
  eloBracketLabel: string;
  myChampions: ChampEntry[];
  vsChampions: ChampEntry[];
  availability: string[];
  notes: string | null;
  createdAt: string;
}
