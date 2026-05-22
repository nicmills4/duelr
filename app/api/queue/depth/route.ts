import { NextResponse } from "next/server";
import { redis, queueKey } from "@/lib/redis";
import { isWildcard, wildcardKeysFor } from "@/lib/champion-types";
import { getChampionType } from "@/lib/champion-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/queue/depth?myChampion=Darius&vsChampion=Jax&eloBracket=high
 *
 * Returns how many players would instantly match with you if you joined
 * right now — i.e. the depth of all mirror/wildcard keys that accept you.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const myChampion = searchParams.get("myChampion") ?? "";
  const vsChampion = searchParams.get("vsChampion") ?? "";
  const eloBracket = searchParams.get("eloBracket") ?? "";

  if (!myChampion || !vsChampion || !eloBracket) {
    return NextResponse.json({ depth: 0 });
  }

  // Wildcards in vsChampion mean flexible opponent preference — depth can't
  // be easily computed without scanning all keys, so skip it.
  if (isWildcard(vsChampion)) {
    return NextResponse.json({ depth: null, flexible: true });
  }

  try {
    // Exact mirror: someone playing vsChampion who wants myChampion
    const exactKey = queueKey(eloBracket, vsChampion, myChampion);

    // Wildcard keys: someone playing vsChampion who wants any / any of my type
    const myType = await getChampionType(myChampion);
    const extraWildcards = myType ? wildcardKeysFor(myType) : ["_any"];
    const wildcardKeys   = extraWildcards.map((w) => queueKey(eloBracket, vsChampion, w));

    const counts = await Promise.all(
      [exactKey, ...wildcardKeys].map((k) => redis.scard(k))
    );

    const depth = counts.reduce((sum, n) => sum + n, 0);
    return NextResponse.json({ depth, flexible: false });
  } catch {
    return NextResponse.json({ depth: 0 });
  }
}
