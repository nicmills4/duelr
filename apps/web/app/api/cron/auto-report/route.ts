/**
 * GET|POST /api/cron/auto-report
 *
 * Polls the Riot Match v5 API for completed custom games between matched players
 * and automatically sets the match outcome based on first blood.
 *
 * Expected call cadence: every 5 minutes (Railway cron or similar).
 * Accepts both GET and POST — Railway's Bun Function cron template uses POST.
 *
 * Security: requires the Authorization header to equal CRON_SECRET when set.
 *
 * Logic:
 *  1. Load all Match rows with no outcome and autoReported=false, created in the
 *     last MAX_POLL_HOURS hours.
 *  2. For each, query Riot for recent custom games (queue=0) started after the
 *     match was created, for playerA's PUUID.
 *  3. For each candidate Riot match: verify both PUUIDs are present.
 *  4. Determine winner: the participant with firstBloodKill=true wins.
 *     If neither has first blood (surrender with 0 kills), fall back to manual.
 *  5. Matches older than MAX_POLL_HOURS with no result are marked autoReported=true
 *     so they stop being polled and fall back to manual reporting.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRecentCustomMatchIds, getMatch, getRouting } from "@/lib/riot";
import type { Region } from "@/lib/riot";

export const dynamic = "force-dynamic";

/** Stop polling after this many hours. Falls back to manual reporting. */
const MAX_POLL_HOURS = 3;
const MAX_POLL_MS    = MAX_POLL_HOURS * 60 * 60 * 1000;

/** Max candidate Riot matches to inspect per Duelr match per tick. */
const MAX_CANDIDATES = 5;

export async function GET(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${cronSecret}`;
    if (auth !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Load pending matches ──────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - MAX_POLL_MS);

  const pending = await prisma.match.findMany({
    where: {
      outcome:      null,
      autoReported: false,
      createdAt:    { gte: cutoff },
    },
    select: {
      id:         true,
      champA:     true,
      champB:     true,
      eloBracket: true,
      createdAt:  true,
      playerA: { select: { puuid: true, region: true } },
      playerB: { select: { puuid: true, region: true } },
    },
  });

  const stats = { checked: 0, resolved: 0, noFirstBlood: 0, notFound: 0, expired: 0, errors: 0 };

  for (const match of pending) {
    stats.checked++;

    // Expire matches that have aged out without a resolution
    if (Date.now() - match.createdAt.getTime() > MAX_POLL_MS) {
      await prisma.match.update({ where: { id: match.id }, data: { autoReported: true } });
      stats.expired++;
      continue;
    }

    try {
      const routing     = getRouting(match.playerA.region as Region);
      const puuidA      = match.playerA.puuid;
      const puuidB      = match.playerB.puuid;
      const afterMs     = match.createdAt.getTime();

      const matchIds = await getRecentCustomMatchIds(puuidA, routing, afterMs, MAX_CANDIDATES);

      if (!matchIds || matchIds.length === 0) {
        stats.notFound++;
        continue; // not ready yet — Riot has ~5 min delay; check again next tick
      }

      let resolved = false;

      for (const riotMatchId of matchIds) {
        const detail = await getMatch(riotMatchId, routing);
        if (!detail) continue;

        // Verify both Duelr players are participants
        const parts = detail.info.participants;
        const pA    = parts.find((p) => p.puuid === puuidA);
        const pB    = parts.find((p) => p.puuid === puuidB);
        if (!pA || !pB) continue;

        // ── First blood = winner ──────────────────────────────────────────
        let outcome: string | null = null;
        if      (pA.firstBloodKill) outcome = "A_WIN";
        else if (pB.firstBloodKill) outcome = "B_WIN";

        if (outcome) {
          await prisma.match.update({
            where: { id: match.id },
            data: {
              outcome,
              riotMatchId,
              autoReported:  true,
              // Mirror reports so the manual endpoint stays consistent
              playerAReport: outcome === "A_WIN" ? "win" : "loss",
              playerBReport: outcome === "B_WIN" ? "win" : "loss",
            },
          });
          stats.resolved++;
        } else {
          // Game found but no first blood (zero-kill surrender) — stop polling,
          // leave outcome null so players can self-report manually.
          await prisma.match.update({
            where: { id: match.id },
            data:  { riotMatchId, autoReported: true },
          });
          stats.noFirstBlood++;
        }

        resolved = true;
        break;
      }

      if (!resolved) stats.notFound++;

    } catch (err) {
      console.error(`[auto-report] error on match ${match.id}:`, err);
      stats.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

// Railway's Bun Function cron template sends POST — alias to the same handler
export { GET as POST };
