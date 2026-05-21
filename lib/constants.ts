export const ELO_BRACKETS = [
  { value: "low", label: "Low Elo", description: "Iron · Bronze · Silver" },
  { value: "mid", label: "Mid Elo", description: "Gold · Platinum" },
  { value: "high", label: "High Elo", description: "Emerald · Diamond" },
  { value: "elite", label: "Elite", description: "Master · Grandmaster · Challenger" },
] as const;

export type EloBracket = (typeof ELO_BRACKETS)[number]["value"];
