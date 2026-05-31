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
 */

export async function register() {
  // Only run in the Node.js server runtime — not the Edge runtime or build step.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sweepExpiredChannels } = await import("./lib/discord");

  const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

  const runSweep = () => {
    sweepExpiredChannels().catch(() => {});
  };

  // Kick one off shortly after boot to mop up anything left by the last restart…
  setTimeout(runSweep, 10_000);

  // …then keep sweeping on a fixed interval.
  const interval = setInterval(runSweep, SWEEP_INTERVAL_MS);

  // Don't keep the process alive solely for the sweep timer.
  if (typeof interval.unref === "function") interval.unref();
}
