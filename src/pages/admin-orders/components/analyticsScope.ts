/**
 * analyticsScope — single source of truth for the Analytics dashboard's
 * reporting window and channel grouping.
 *
 * UI-only. No SQL. No tracking changes. Used by every Analytics panel that
 * surfaces a count or revenue figure so Owner Dashboard, Business Snapshot,
 * Channel Performance, Funnel, Recovery, and Page Performance always agree.
 */

// ── Reporting window (default) ─────────────────────────────────────────────
// Chosen to match the start of the current marketing tracking era — orders
// before this date predate the Phase 1 attribution rollout and would skew
// every comparison.
export const ANALYTICS_SCOPE_START = "2026-03-01";

export function analyticsScopeStartIso(): string {
  return new Date(`${ANALYTICS_SCOPE_START}T00:00:00.000Z`).toISOString();
}

export function analyticsScopeRange(): { fromIso: string; toIso: string } {
  return {
    fromIso: analyticsScopeStartIso(),
    toIso:   new Date().toISOString(),
  };
}

export function analyticsScopeLabel(): string {
  // Format e.g. "Mar 1, 2026 – Today".
  const d = new Date(`${ANALYTICS_SCOPE_START}T00:00:00.000Z`);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day   = d.getUTCDate();
  const year  = d.getUTCFullYear();
  return `${month} ${day}, ${year} – Today`;
}

// ── Owner-friendly channel grouping ───────────────────────────────────────
// Re-buckets the canonical Phase-1 channel keys + raw click-id signals into
// the four owner-friendly buckets.
//
//   Google Ads          : channel = google_ads
//                          OR gclid present
//                          OR Google paid UTM (utm_source=google
//                             AND utm_medium ∈ {cpc, ppc, paid, paidsearch,
//                             paid-search, paid_search, sem, ads})
//   Facebook / Instagram: channel = facebook_ads
//                          OR fbclid present
//                          OR Meta UTM source (facebook|instagram|fb|ig|meta)
//                          OR Meta referrer host (facebook.com, fb.com, etc.)
//   SEO + Referral      : channel ∈ {organic_search, social_organic}
//                          OR utm_medium ∈ {organic, referral}
//                          OR known search-engine referrer
//                          (google.com, bing.com, duckduckgo.com, yahoo.com,
//                          yandex.*) — only if no paid signal above matched.
//                          Direct / Unknown is NEVER promoted into this bucket.
//   Direct / Unknown    : everything else (no fbclid, no gclid, no Meta or
//                          Google paid UTM, no known referrer)
//
// This grouping NEVER promotes Direct → Facebook unless an explicit Meta
// signal exists. It NEVER promotes paid Google traffic into SEO — the Google
// paid-UTM check runs BEFORE the search-referrer SEO check, so a Google Ads
// click with utm_medium=cpc and a google.com referrer is bucketed as
// google_ads, not seo_referral.

export type OwnerChannel = "google_ads" | "facebook_meta" | "seo_referral" | "direct_unknown";

export const OWNER_CHANNEL_LABEL: Record<OwnerChannel, string> = {
  google_ads:    "Google Ads",
  facebook_meta: "Facebook / Instagram",
  seo_referral:  "SEO + Referral",
  direct_unknown:"Direct / Unknown",
};

export const OWNER_CHANNEL_ICON: Record<OwnerChannel, { icon: string; bg: string; fg: string }> = {
  google_ads:     { icon: "ri-google-fill",          bg: "bg-orange-50",  fg: "text-orange-500"  },
  facebook_meta:  { icon: "ri-facebook-circle-fill", bg: "bg-blue-50",    fg: "text-[#1877F2]"   },
  seo_referral:   { icon: "ri-search-2-line",        bg: "bg-emerald-50", fg: "text-emerald-600" },
  direct_unknown: { icon: "ri-cursor-fill",          bg: "bg-gray-100",   fg: "text-gray-600"    },
};

const META_UTM_TOKENS = new Set(["facebook", "instagram", "fb", "ig", "meta"]);
const META_REFERRER_HOSTS = ["facebook.com", "instagram.com", "fb.com", "fb.me"];
const SEARCH_REFERRER_HOSTS = ["google.com", "bing.com", "duckduckgo.com", "yahoo.com", "yandex."];

// Tokens that mean "paid search". Normalized: lowercased + spaces stripped to
// hyphens so "paid search" and "paid-search" both match.
const GOOGLE_PAID_MEDIUM_TOKENS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid-search",
  "paid_search",
  "sem",
  "ads",
]);

export interface OwnerBucketSignals {
  channel?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}

function normalizeMedium(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export function bucketOwnerChannel(s: OwnerBucketSignals | null | undefined): OwnerChannel {
  if (!s) return "direct_unknown";
  const ch  = (s.channel ?? "").trim().toLowerCase();
  const um  = (s.utm_source ?? "").trim().toLowerCase();
  const med = normalizeMedium(s.utm_medium ?? "");
  const gclid  = (s.gclid ?? "").trim();
  const fbclid = (s.fbclid ?? "").trim();
  const ref    = (s.referrer ?? "").trim().toLowerCase();

  // 1. Google Ads — strongest signal
  //    a) canonical channel key
  //    b) gclid present
  //    c) Google paid UTM: utm_source=google AND utm_medium ∈ paid set
  if (ch === "google_ads" || gclid) return "google_ads";
  if (um === "google" && GOOGLE_PAID_MEDIUM_TOKENS.has(med)) return "google_ads";

  // 2. Facebook / Meta — explicit signal only
  if (ch === "facebook_ads" || fbclid) return "facebook_meta";
  if (META_UTM_TOKENS.has(um))         return "facebook_meta";
  try {
    if (ref) {
      const host = new URL(/^https?:\/\//i.test(ref) ? ref : `https://${ref}`).hostname.toLowerCase();
      if (META_REFERRER_HOSTS.some((h) => host.includes(h))) return "facebook_meta";
    }
  } catch { /* ignore */ }

  // 3. SEO + Referral
  //    Runs AFTER the Google-paid-UTM check above, so a Google Ads click that
  //    lost its gclid but kept utm_medium=cpc cannot be mis-bucketed here.
  if (ch === "organic_search" || ch === "social_organic") return "seo_referral";
  if (med === "referral" || med === "organic")            return "seo_referral";
  try {
    if (ref) {
      const host = new URL(/^https?:\/\//i.test(ref) ? ref : `https://${ref}`).hostname.toLowerCase();
      if (SEARCH_REFERRER_HOSTS.some((h) => host.includes(h))) return "seo_referral";
    }
  } catch { /* ignore */ }

  // 4. Direct / Unknown — fall-through. Never promoted into any other bucket.
  return "direct_unknown";
}
