/**
 * Client-only sound utilities.
 * Safe to call even when the browser blocks autoplay — errors are swallowed.
 */

let matchAudio: HTMLAudioElement | null = null;

/**
 * Play the match-found chime (a challenge was accepted / a match is ready).
 * Pre-loads the Audio object lazily so the first play has no gap.
 * Silently no-ops if the browser's autoplay policy blocks it.
 */
export function playMatchSound(): void {
  try {
    if (!matchAudio) {
      matchAudio = new Audio("/league_queue_pop.mp3");
      matchAudio.volume = 0.7;
    } else {
      // Rewind so rapid re-triggers restart cleanly
      matchAudio.currentTime = 0;
    }
    matchAudio.play().catch(() => {});
  } catch {
    // SSR guard — Audio is not defined server-side
  }
}
