/**
 * Feature flags — one place to enable / disable gated features.
 * Flip the value and redeploy; no other code changes needed.
 */

/**
 * When true, creating Practice Partner posts requires a Premium subscription.
 * Set to false to open the feature to all full accounts temporarily.
 */
export const PARTNERS_REQUIRE_PREMIUM = false;

/**
 * When true, visitors using an ad blocker see a modal asking them to
 * whitelist the site or upgrade to Premium.
 * Set to false until the site is approved for ads — no point nagging users.
 */
export const SHOW_ADBLOCK_MODAL = false;
