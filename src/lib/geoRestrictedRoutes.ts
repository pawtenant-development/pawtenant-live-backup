/**
 * Route-scoped GeoBlock policy.
 *
 * Public marketing / SEO / informational pages render globally — the
 * homepage, landing pages, state pages, blog, FAQs, contact, and the
 * paid Google/Meta landers are all reachable from any country. PageSpeed
 * therefore measures the real homepage instead of the GeoBlockScreen
 * fallback.
 *
 * The actual service-availability gate applies only inside the routes
 * that begin or progress an ESA / PSD service flow. A visitor from a
 * blocked region can read the marketing content, but when they try to
 * start the assessment or proceed to checkout they see the
 * GeoBlockScreen explaining that the service isn't available in their
 * region.
 *
 * Conversion / confirmation routes like /assessment/thank-you and
 * /psd-assessment/thank-you are intentionally NOT restricted here: a
 * user who already paid (legitimately) must still see their thank-you
 * page even if their geo flips, and the page itself is read-only.
 *
 * Mirror-safe between TEST and LIVE — the list is a constant; no
 * environment branching, no hostname checks, no UA checks.
 */
const RESTRICTED_EXACT = new Set<string>([
  "/assessment",
  "/psd-assessment",
]);

const RESTRICTED_PREFIXES = [
  "/checkout",         // any explicit checkout path
  "/account/checkout", // signed-in checkout
  "/r/",               // recovery click bridge → /assessment
];

export function isGeoRestrictedRoute(pathname: string): boolean {
  if (!pathname) return false;
  if (RESTRICTED_EXACT.has(pathname)) return true;
  for (const p of RESTRICTED_PREFIXES) {
    if (pathname === p.replace(/\/$/, "")) return true;
    if (pathname.startsWith(p)) return true;
  }
  return false;
}
