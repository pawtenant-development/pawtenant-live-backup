// src/lib/checkoutSlugMask.ts
//
// ASSESSMENT-CHECKOUT-REFRESH-AND-RESUME-PERSISTENCE-LIVE-INCIDENT-003
//
// Dependency-free so BOTH the attribution store and the durable-checkout layer
// can use it without an import cycle, and so the inline pre-boot capture in
// index.html can mirror it byte-for-byte.
//
// The durable payment URL is `/checkout/<slug>`, and that slug is a credential.
// It sits in the PATH, so the existing query-param scrub (`?rt=`, `?resume=`,
// `?token=`) does not touch it. Anything that PERSISTS or TRANSMITS a URL must
// mask it first, or the credential lands in `orders.landing_url`, GHL and the
// analytics tag stack — the exact leak the `?rt=` incident was about.

/** 8 = legacy slugs already in customer inboxes; 12 = current format. */
export const CHECKOUT_SLUG_RE = /^([2-9A-HJ-NP-TV-Z]{8}|[2-9A-HJ-NP-TV-Z]{12})$/;

/** Routes whose second path segment is a credential slug. */
const SLUG_ROUTES = ["checkout", "continue"];

/**
 * `/checkout/AB7K92QDXY41` -> `/checkout/:slug`
 *
 * Leaves every other URL byte-identical, so an unrelated capture is unchanged.
 */
export function maskCheckoutSlugPath(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(
      rawUrl,
      typeof window !== "undefined" ? window.location.origin : "https://pawtenant.com",
    );
    const parts = u.pathname.split("/").filter(Boolean);
    if (
      parts.length === 2 &&
      SLUG_ROUTES.includes(parts[0].toLowerCase()) &&
      CHECKOUT_SLUG_RE.test(parts[1].toUpperCase())
    ) {
      u.pathname = `/${parts[0].toLowerCase()}/:slug`;
      return u.toString();
    }
    return rawUrl;
  } catch {
    // Unparseable: fail SAFE — return something that cannot carry a slug.
    return rawUrl
      .split("?")[0]
      .replace(/\/(checkout|continue)\/[2-9A-HJ-NP-TV-Z]{8,12}\/?$/i, "/$1/:slug");
  }
}
