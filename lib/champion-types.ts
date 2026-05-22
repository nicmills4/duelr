/**
 * Wildcard constants and pure helper functions for melee/ranged classification.
 * This file has NO server-only imports — it is safe to import in client components.
 * Redis-backed champion type lookup lives in lib/champion-cache.ts (server only).
 */

export type AttackType = "melee" | "ranged";

export const WILDCARD_ANY        = "_any";
export const WILDCARD_ANY_MELEE  = "_any_melee";
export const WILDCARD_ANY_RANGED = "_any_ranged";
export const WILDCARDS           = [WILDCARD_ANY, WILDCARD_ANY_MELEE, WILDCARD_ANY_RANGED] as const;
export type  Wildcard            = typeof WILDCARDS[number];

export function isWildcard(v: string): v is Wildcard {
  return v === WILDCARD_ANY || v === WILDCARD_ANY_MELEE || v === WILDCARD_ANY_RANGED;
}

export function wildcardLabel(v: Wildcard): string {
  if (v === WILDCARD_ANY)        return "Any Champion";
  if (v === WILDCARD_ANY_MELEE)  return "Any Melee";
  if (v === WILDCARD_ANY_RANGED) return "Any Ranged";
  return v;
}

/** Returns the wildcard keys that match a given attack type, plus the "_any" key. */
export function wildcardKeysFor(type: AttackType): Wildcard[] {
  return [WILDCARD_ANY, type === "melee" ? WILDCARD_ANY_MELEE : WILDCARD_ANY_RANGED];
}
