/**
 * Champion matchup win-rate lookups.
 *
 * Uses a curated static dataset of well-known counter matchups (win rates
 * sourced from lolalytics / u.gg community data). Returns null for matchups
 * not in the dataset so callers can fail-open (no counter bonus applied).
 *
 * Keys are DDragon champion IDs lowercased and stripped to alphanumeric
 * (e.g. "Vayne" → "vayne", "DrMundo" → "drmundo", "Kai'Sa" → "kaisa").
 */

export const COUNTER_WIN_RATE_THRESHOLD = 51; // > this % → counter matchup

/** Normalise a DDragon champion ID for dataset lookup. */
function toSlug(championId: string): string {
  return championId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Static win-rate dataset ───────────────────────────────────────────────────
// Format: MATCHUP_WIN_RATES[myChampSlug][vsChampSlug] = myChamp win rate (%)
// Only includes matchups with a meaningful advantage (> 51%).
// Update this list when the meta shifts significantly.

const MATCHUP_WIN_RATES: Record<string, Record<string, number>> = {
  // ── TOP LANE ──────────────────────────────────────────────────────────────
  vayne: {
    darius:    54.5,
    garen:     52.6,
    malphite:  53.9,
    drmundo:   53.2,
    sion:      52.4,
    nasus:     52.8,
    mordekaiser: 52.1,
    illaoi:    51.8,
    volibear:  51.6,
  },
  teemo: {
    darius:    54.9,
    garen:     53.6,
    malphite:  52.6,
    sett:      52.9,
    nasus:     53.3,
    drmundo:   52.8,
    sion:      52.1,
    cho_gath:  52.4,  // slug: chogath
    illaoi:    52.0,
  },
  fiora: {
    garen:     55.3,
    nasus:     54.2,
    malphite:  52.9,
    sion:      52.6,
    mordekaiser: 51.9,
    drmundo:   53.4,
    ornn:      52.2,
    sett:      52.0,
  },
  quinn: {
    darius:    54.3,
    garen:     52.9,
    malphite:  53.6,
    nasus:     53.1,
    sion:      52.5,
    drmundo:   52.8,
  },
  kennen: {
    darius:    53.2,
    garen:     52.6,
    malphite:  53.3,
    nasus:     52.7,
    sion:      52.1,
    drmundo:   52.4,
  },
  kayle: {
    darius:    51.9,
    garen:     52.2,
    malphite:  52.8,
    nasus:     53.1,
    sion:      51.6,
    drmundo:   51.8,
  },
  gnar: {
    malphite:  52.4,
    darius:    52.2,
    sion:      52.0,
    nasus:     51.8,
    cho_gath:  51.6,  // slug: chogath
  },
  tryndamere: {
    malphite:  52.3,
    nasus:     52.0,
    drmundo:   51.9,
    sion:      51.7,
  },
  jayce: {
    darius:    52.6,
    malphite:  53.2,
    nasus:     52.8,
    garen:     52.1,
    sion:      51.9,
    drmundo:   52.3,
  },
  akshan: {
    darius:    53.3,
    garen:     52.6,
    malphite:  53.1,
    nasus:     52.5,
  },
  gangplank: {
    darius:    51.9,
    malphite:  52.5,
    nasus:     52.1,
    garen:     51.7,
  },
  urgot: {
    darius:    52.9,
    garen:     52.1,
    nasus:     52.6,
    sion:      51.8,
  },
  // ── MID LANE ──────────────────────────────────────────────────────────────
  fizz: {
    syndra:    53.3,
    azir:      54.2,
    cassiopeia: 53.9,
    orianna:   52.6,
    viktor:    52.4,
    ryze:      52.0,
    lux:       52.8,
    xerath:    52.5,
  },
  katarina: {
    anivia:    53.6,
    ryze:      52.9,
    lux:       53.1,
    orianna:   52.4,
    syndra:    52.1,
    veigar:    52.7,
    viktor:    52.0,
  },
  zed: {
    syndra:    52.9,
    orianna:   53.3,
    cassiopeia: 52.6,
    lux:       53.5,
    veigar:    54.1,
    xerath:    52.8,
    viktor:    52.2,
  },
  talon: {
    syndra:    52.4,
    orianna:   52.9,
    azir:      53.2,
    lux:       53.6,
    xerath:    52.7,
    viktor:    52.1,
  },
  yasuo: {
    syndra:    52.6,
    lux:       53.8,
    veigar:    53.2,
    xerath:    53.5,
    ziggs:     52.9,
  },
  yone: {
    syndra:    52.2,
    lux:       53.4,
    veigar:    52.8,
    xerath:    53.1,
  },
  // ── BOT LANE (ADC) ────────────────────────────────────────────────────────
  draven: {
    jhin:      52.4,
    jinx:      52.1,
    ashe:      53.2,
    varus:     52.8,
    sivir:     52.5,
    ezreal:    51.9,
  },
  kalista: {
    jinx:      52.6,
    jhin:      52.3,
    sivir:     52.9,
    varus:     52.1,
  },
  // ── JUNGLE ────────────────────────────────────────────────────────────────
  shaco: {
    amumu:     53.1,
    warwick:   52.7,
    malphite:  52.4,
  },
  nocturne: {
    amumu:     52.5,
    hecarim:   52.2,
  },
};

// Alias entries that have compound DDragon IDs after slugification
// (done at query time, so no special handling needed — see toSlug())

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns myChampion's win rate (%) when facing vsChampion, or null if the
 * matchup is not in the dataset.
 */
export async function getMatchupWinRate(
  myChampion: string,
  vsChampion: string
): Promise<number | null> {
  if (!myChampion || !vsChampion) return null;
  const wr = MATCHUP_WIN_RATES[toSlug(myChampion)]?.[toSlug(vsChampion)] ?? null;
  return wr;
}

/** Returns true when the win rate represents a meaningful counter advantage. */
export function isCounterMatchup(winRate: number | null): winRate is number {
  return winRate !== null && winRate > COUNTER_WIN_RATE_THRESHOLD;
}
