/**
 * GET|POST /api/cron/auto-report
 *
 * Manual / external trigger for the first-blood auto-report sweep.
 *
 * The PRIMARY driver is now the in-process interval in instrumentation.ts (runs
 * every 5 min on the long-lived server, no external scheduler needed). This
 * endpoint is kept so the same sweep can be invoked on demand — e.g. by an
 * external cron, or manually for debugging — and returns the per-tick stats.
 *
 * Accepts both GET and POST — Railway's Bun Function cron template uses POST.
 *
 * Security: requires the Authorization header to equal `Bearer ${CRON_SECRET}`
 * when CRON_SECRET is set.
 *
 * The actual polling logic lives in lib/auto-report.ts (runAutoReport).
 */

import { NextRequest, NextResponse } from "next/server";
import { runAutoReport } from "@/lib/auto-report";

export const dynamic = "force-dynamic";

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

  const stats = await runAutoReport();
  return NextResponse.json({ ok: true, ...stats });
}

// Railway's Bun Function cron template sends POST — alias to the same handler
export { GET as POST };
