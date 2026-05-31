/**
 * Next.js instrumentation hook — register() runs once when the server process
 * starts. We use it to drive a periodic sweep that deletes expired Discord match
 * voice channels.
 *
 * Why here (vs. the per-channel setTimeout in lib/discord.ts):
 *   • The setTimeout is lost on every redeploy/crash, so channels created before
 *     a restart never get cleaned up.
 *   • Cleanup previously only ran when a NEW channel was created, so a quiet
 *     period left expired channels piling up indefinitely.
 *   • register() re-runs on every cold start, so this interval is self-healing.
 *
 * Note: Discord's REST API does not expose voice-channel occupancy (that needs a
 * gateway connection), so the sweep is time-based: a channel is removed once its
 * 1-hour lifetime has elapsed.
 *
 * The Node-only work MUST live inside the `process.env.NEXT_RUNTIME === 'nodejs'`
 * block: Next compiles this file for the Edge runtime too, and webpack statically
 * follows the dynamic import there — pulling in ioredis (net/dns/crypto/stream),
 * which the Edge runtime can't resolve. Keeping the import inside the guarded
 * block lets webpack dead-code-eliminate it from the Edge bundle.
 */

export async function register() {
  // Only run — and only bundle the Node-only sweeps — in the Node.js runtime.
  // Both dynamic imports MUST stay inside this guard: Next compiles this file
  // for the Edge runtime too, and webpack statically follows the imports there —
  // pulling in ioredis / prisma (net/dns/crypto/stream), which Edge can't
  // resolve. Guarding the imports lets webpack dead-code-eliminate them from the
  // Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sweepExpiredChannels } = await import("./lib/discord");
    const { runAutoReport }        = await import("./lib/auto-report");

    const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

    // ── Discord voice-channel cleanup ─────────────────────────────────────────
    const runSweep = () => {
      sweepExpiredChannels().catch(() => {});
    };

    // ── First-blood auto-report (Riot Match v5 polling) ───────────────────────
    // No external cron needed: this in-process interval resolves match outcomes
    // from first blood, and re-arms on every cold start (self-healing across
    // redeploys). Matches persist in the DB until resolved or expired (3h), so a
    // missed tick is picked up on the next one.
    const runReport = () => {
      runAutoReport().catch((err) => {
        console.error("[instrumentation] auto-report tick failed:", err);
      });
    };

    // Kick both off shortly after boot to mop up anything left by the last
    // restart, then keep them running on a fixed interval.
    setTimeout(runSweep, 10_000);
    setTimeout(runReport, 15_000);

    const sweepInterval  = setInterval(runSweep, INTERVAL_MS);
    const reportInterval = setInterval(runReport, INTERVAL_MS);

    // Don't keep the process alive solely for these timers.
    if (typeof sweepInterval.unref  === "function") sweepInterval.unref();
    if (typeof reportInterval.unref === "function") reportInterval.unref();
  }
}
