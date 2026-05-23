/**
 * Shared types for the open lobby feature.
 * Client-safe — no server imports.
 */

export type AcceptsType = "any" | "melee" | "ranged";

export interface LobbyEntry {
  userId: string;
  myChampion: string;
  champName: string;
  champImage: string;
  eloBracket: string;
  acceptsType: AcceptsType;
  joinedAt: number;
}

export interface LobbyPlayer extends LobbyEntry {
  riotId: string;
  region: string;
}

export interface ChallengePayload {
  challengeId: string;
  challengerId: string;
  challengerRiotId: string;
  challengerChampion: string;
  challengerChampName: string;
  challengerChampImage: string;
  challengerElo: string;
  targetId: string;
}
