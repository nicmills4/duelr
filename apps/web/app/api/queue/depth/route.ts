import { NextResponse } from "next/server";
import { redis, queueKey } from "@/lib/redis";
import { isWildcard, wildcardKeysFor } from "@/lib/champion-types";
import { getChampionType } from "@/lib/champion-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/queue/depth?myChampion=Darius&vsChampion=Jax&vsChampion=Garen&eloBracket=high
 *
 * vsChampion may be repeated for multi-champion queuing.
 * Returns the total depth across all specified vsChampions.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const myChampion    = searchParams.get("myChampion") ?? "";
  const vsChampionList = searchParams.getAll("vsChampion");
  const eloBracket    = searchParams.get("eloBracket") ?? "";

  if (!myChampion || vsChampionList.length === 0 || !eloBracket) {
    return NextResponse.json({ depth: 0 });
  }

  // If all vsChampions are wildcards, flexible mode
  if (vsChampionList.every(isWildcard)) {
    return NextResponse.json({ depth: null, flexible: true });
  }

  try {
    const myType        = await getChampionType(myChampion);
    const extraWildcards = myType ? wildcardKeysFor(myType) : ["_any"];

    // For each concrete vsChampion, gather the keys to count
    const keysToCount: string[] = [];
    for (const vs of vsChampionList) {
      if (isWildcard(vs)) continue;
      keysToCount.push(
        queueKey(eloBracket, vs, myChampion),
        ...extraWildcards.map((w) => queueKey(eloBracket, vs, w))
      );
    }

    if (keysToCount.length === 0) {
      return NextResponse.json({ depth: null, flexible: true });
    }

    const counts = await Promise.all(keysToCount.map((k) => redis.scard(k)));
    const depth  = counts.reduce((sum, n) => sum + n, 0);

    return NextResponse.json({ depth, flexible: false });
  } catch {
    return NextResponse.json({ depth: 0 });
  }
}
