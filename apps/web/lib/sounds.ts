/**
 * Client-only sound utilities.
 * Safe to call even when the browser blocks autoplay — errors are swallowed.
 */

let queuePopAudio: HTMLAudioElement | null = null;

/**
 * Play the League-style queue-pop sound.
 * Pre-loads the Audio object lazily so the first play has no gap.
 * Silently no-ops if the browser's autoplay policy blocks it.
 */
export function playQueuePop(): void {
  try {
    if (!queuePopAudio) {
      queuePopAudio = new Audio("/league_queue_pop.mp3");
      queuePopAudio.volume = 0.7;
    } else {
      // Rewind so rapid re-triggers restart cleanly
      queuePopAudio.currentTime = 0;
    }
    queuePopAudio.play().catch(() => {});
  } catch {
    // SSR guard — Audio is not defined server-side
  }
}
