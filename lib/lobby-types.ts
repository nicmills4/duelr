/**
 * Shared types for the open lobby feature.
 * Client-safe — no server imports.
 */

export type AcceptsType = "any" | "melee" | "ranged";
export type LobbyMode   = "1v1" | "2v2";
export type DuoRole     = "adc" | "support";
export type SlotKey     = "team1_adc" | "team1_support" | "team2_adc" | "team2_support";

// ── 1v1 ───────────────────────────────────────────────────────────────────────

export interface LobbyEntry {
  userId:       string;
  myChampion:   string;
  champName:    string;
  champImage:   string;
  eloBracket:   string;
  acceptsType:  AcceptsType;
  vsChampions?: string[];   // preferred opponent champion IDs (empty = any)
  joinedAt:     number;
}

export interface LobbyPlayer extends LobbyEntry {
  riotId: string;
  region: string;
}

export interface ChallengePayload {
  challengeId:          string;
  challengerId:         string;
  challengerRiotId:     string;
  challengerChampion:   string;
  challengerChampName:  string;
  challengerChampImage: string;
  challengerElo:        string;
  targetId:             string;
}

// ── 2v2 ───────────────────────────────────────────────────────────────────────

export interface GroupSlot {
  userId:     string;
  riotId:     string;
  region:     string;
  champId:    string;
  champName:  string;
  champImage: string;
  role:       DuoRole;
  isHost:     boolean;
}

export interface LobbyGroup {
  groupId:       string;
  eloBracket:    string;
  createdAt:     number;
  team1_adc:     GroupSlot | null;
  team1_support: GroupSlot | null;
  team2_adc:     GroupSlot | null;
  team2_support: GroupSlot | null;
}

export const SLOT_ROLE: Record<SlotKey, DuoRole> = {
  team1_adc:     "adc",
  team1_support: "support",
  team2_adc:     "adc",
  team2_support: "support",
};

export const SLOT_LABEL: Record<SlotKey, string> = {
  team1_adc:     "Team 1 · ADC",
  team1_support: "Team 1 · Support",
  team2_adc:     "Team 2 · ADC",
  team2_support: "Team 2 · Support",
};

/** All 4 slot keys in display order (team1 left, team2 right) */
export const ALL_SLOTS: SlotKey[] = ["team1_adc", "team1_support", "team2_adc", "team2_support"];

/** Returns all slots occupied by a given userId in a group */
export function userSlotIn(group: LobbyGroup, userId: string): SlotKey | null {
  for (const k of ALL_SLOTS) {
    if (group[k]?.userId === userId) return k;
  }
  return null;
}

/** Returns true when all 4 slots are filled */
export function groupIsFull(group: LobbyGroup): boolean {
  return !!(group.team1_adc && group.team1_support && group.team2_adc && group.team2_support);
}
