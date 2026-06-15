/**
 * Routes where Google-served ads are permitted.
 *
 * AdSense's "Google-served ads on screens without publisher content" policy
 * forbids ads on utility / app screens — login, lobby, settings,
 * checkout, verify-email, etc. Ads may appear ONLY on pages with substantive,
 * crawlable publisher content (guides, articles, a content-rich leaderboard).
 *
 * The reviewer crawls the site logged OUT, so the ad script must not even be
 * present on thin screens. List ad-eligible content routes here; everything
 * else is ad-free.
 *
 * Currently EMPTY on purpose: no content pages exist yet, so ads load nowhere —
 * the correct state for resubmitting the site for AdSense review. Add prefixes
 * (e.g. "/guides") as the content section ships, and ads switch on there
 * automatically with no other code changes.
 */
export const AD_ELIGIBLE_PREFIXES: string[] = [
  // "/guides",
  // "/blog",
];

/** True only for routes with real publisher content where ads are allowed. */
export function isAdEligibleRoute(pathname: string): boolean {
  return AD_ELIGIBLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
