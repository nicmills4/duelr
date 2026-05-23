/**
 * Champion matchup win-rate lookups.
 *
 * Fetches win-rate data from lolalytics.com and caches results in Redis for
 * 24 h. Returns null on any failure so callers can fail-open (no counter
 * bonus applied).
 */
import { redis } from "./redis";

export const COUNTER_WIN_RATE_THRESHOLD = 51; // > this % → counter matchup
const CACHE_TTL = 60 * 60 * 24; // 24 hours
const FETCH_TIMEOUT_MS = 8_000;

/** Normalise a DDragon champion ID to a lolalytics URL slug. */
function toSlug(championId: string): string {
  return championId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns myChampion's win rate (%) when facing vsChampion, or null if the
 * data is unavailable. Results are cached in Redis for 24 h.
 */
export async function getMatchupWinRate(
  myChampion: string,
  vsChampion: string
): Promise<number | null> {
  if (!myChampion || !vsChampion) return null;

  const cacheKey = `matchup_wr:${myChampion.toLowerCase()}:${vsChampion.toLowerCase()}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      if (cached === "") return null; // cached negative result
      const v = parseFloat(cached);
      return isNaN(v) ? null : v;
    }

    const wr = await fetchFromLolalytics(myChampion, vsChampion);

    // Cache even null results (empty string) to avoid hammering on cache miss
    await redis.setex(cacheKey, CACHE_TTL, wr !== null ? String(wr) : "");

    return wr;
  } catch {
    return null; // fail-open — Redis error, network error, etc.
  }
}

/** Returns true when the win rate represents a meaningful counter advantage. */
export function isCounterMatchup(winRate: number | null): winRate is number {
  return winRate !== null && winRate > COUNTER_WIN_RATE_THRESHOLD;
}

// ── Internal fetch ────────────────────────────────────────────────────────────

async function fetchFromLolalytics(
  myChampion: string,
  vsChampion: string
): Promise<number | null> {
  const slug   = toSlug(myChampion);
  const vsSlug = toSlug(vsChampion);

  try {
    const res = await fetch(
      `https://lolalytics.com/lol/${slug}/vs/${vsSlug}/`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) return null;

    const html = await res.text();

    // Extract the __NEXT_DATA__ JSON blob embedded in the page
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const pp   = data?.props?.pageProps;

    // Try multiple known paths — lolalytics structure can vary
    const wr: unknown =
      pp?.data?.header?.wr ??
      pp?.data?.summary?.wr ??
      pp?.data?.matchup?.winRate ??
      pp?.data?.wr ??
      pp?.winRate ??
      null;

    if (typeof wr !== "number" || wr < 1 || wr > 100) return null;

    return Math.round(wr * 10) / 10; // 1 decimal place
  } catch {
    return null; // timeout, JSON parse error, etc.
  }
}
