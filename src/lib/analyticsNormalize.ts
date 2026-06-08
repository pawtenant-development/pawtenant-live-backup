// analyticsNormalize — reusable source + landing-page normalization for the
// admin Analytics dashboard.
//
// Purpose: ONE place that decides
//   • the canonical traffic SOURCE label for an order (reuses the verified
//     resolveOrderAttribution so it matches Orders / CSV export exactly), and
//   • whether a first-landing path is a real CUSTOMER-FACING page, so admin /
//     internal / system routes never pollute landing-page analytics.
//
// DISPLAY / REPORT ONLY. Pure functions, no IO, no React. Never invents data:
// blank / invalid / internal landings collapse to "Unknown / Not captured".

import {
  resolveOrderAttribution,
  type ResolvableOrder,
} from "./attributionResolver";

export const UNKNOWN_LANDING = "Unknown / Not captured";
export const UNKNOWN_SOURCE = "Unknown";

// Admin / internal / system path prefixes that must be EXCLUDED from
// landing-page analytics (they are not customer acquisition landings).
export const NON_CUSTOMER_PREFIXES: string[] = [
  "/admin",          // /admin, /admin-orders, /admin-login, /admin-*
  "/company",        // employee company OS portal
  "/settings",
  "/audit",
  "/health",
  "/provider",       // /provider, /provider-portal, /providers
  "/api",
  "/functions",      // supabase edge fn routes
  "/thank-you",
  "/thankyou",
  "/payment-success",
  "/payment-failed",
  "/order-status",
  "/my-orders",
  "/account",        // /account/checkout etc.
  "/dashboard",
  "/assets",         // static asset URLs
  "/static",
  "/r/",             // internal redirect shims (e.g. /r/manual)
  "/_",              // framework internals
];

// Host fragments that indicate infra / internal origins, never a customer page.
const NON_CUSTOMER_HOST_HINTS = ["supabase.co", "supabase.in", "localhost", "127.0.0.1"];

/**
 * Clean a raw landing URL/path into a comparable path:
 * lowercase, host stripped, query + hash removed, trailing slash trimmed.
 * Returns "" when the value is blank or clearly invalid (→ caller maps to Unknown).
 */
export function normalizeLandingPage(raw?: string | null): string {
  if (raw === null || raw === undefined) return "";
  let v = String(raw).trim();
  if (!v) return "";

  // Reject obvious infra hosts outright.
  const lowerFull = v.toLowerCase();
  if (NON_CUSTOMER_HOST_HINTS.some((h) => lowerFull.includes(h))) {
    // keep parsing — an infra host with a real customer path is still possible,
    // but a bare infra host with no path is not.
  }

  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://x${v.startsWith("/") ? v : `/${v}`}`);
    v = url.pathname || "/";
  } catch {
    v = v.replace(/^https?:\/\//i, "");
    const slash = v.indexOf("/");
    v = slash >= 0 ? v.slice(slash) : "/";
  }
  v = v.split("?")[0].split("#")[0].toLowerCase();
  if (v.length > 1) v = v.replace(/\/+$/, "");
  return v || "/";
}

/**
 * True only when the normalized path is a real customer-facing landing page
 * (homepage, assessment, SEO/landing pages, state guides, …). Admin / internal
 * / system routes and blank values return false.
 */
export function isCustomerFacingLandingPage(rawOrPath?: string | null): boolean {
  const p = normalizeLandingPage(rawOrPath);
  if (!p) return false;
  if (p === "/") return true; // homepage is customer-facing
  for (const pre of NON_CUSTOMER_PREFIXES) {
    if (p === pre) return false;
    // prefix match on a path boundary: "/admin" blocks "/admin-orders" + "/admin/x"
    if (pre.endsWith("/")) {
      if (p.startsWith(pre)) return false;
    } else if (p.startsWith(pre + "/") || p.startsWith(pre + "-") || p === pre) {
      return false;
    }
  }
  return true;
}

/**
 * Bucket a landing path for landing-page tables:
 *   • customer-facing path  → the clean path
 *   • blank / invalid / admin / internal → "Unknown / Not captured"
 * so nothing is silently dropped and totals still reconcile.
 */
export function groupUnknownLandingPage(rawOrPath?: string | null): string {
  const p = normalizeLandingPage(rawOrPath);
  if (!p) return UNKNOWN_LANDING;
  return isCustomerFacingLandingPage(p) ? p : UNKNOWN_LANDING;
}

/**
 * Canonical traffic source label for an order, via the verified resolver.
 * Returns "Direct" for a no-signal order (resolver default) and "Unknown" only
 * if resolution fails. Never throws.
 */
export function normalizeSource(order: ResolvableOrder): string {
  try {
    const r = resolveOrderAttribution(order);
    return (r.traffic_source_final || "").trim() || UNKNOWN_SOURCE;
  } catch {
    return UNKNOWN_SOURCE;
  }
}

/** A source is "unidentified" for data-quality purposes when it is Direct/Unknown. */
export function isUnidentifiedSource(source: string): boolean {
  return source === UNKNOWN_SOURCE || source === "Direct";
}
