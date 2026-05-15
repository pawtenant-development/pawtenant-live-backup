/**
 * acquisitionClassifier — Phase K
 *
 * Pure-function classifier that converts raw attribution signals into a
 * normalized acquisition label with confidence + reasoning. Designed to
 * be safe to call from any UI surface (Orders pill, Live Visitors card,
 * future analytics tooltips) without depending on React or side effects.
 *
 * Inputs are all optional. The classifier degrades gracefully — if all
 * inputs are missing, it returns "Direct / Unknown" with low confidence.
 *
 * Scope (Phase K): DISPLAY / INTERPRETATION ONLY.
 *   - Does NOT mutate any DB row.
 *   - Does NOT change analytics aggregation math (the legacy
 *     deriveTrafficSource() in admin-orders/page.tsx + AdminDashboard
 *     remains the source of truth for filter + dashboard counts).
 *   - Does NOT change tracking, capture, or storage.
 *   - Does NOT swap the source of `referred_by` writes at order creation.
 *
 * The raw inputs are preserved on the returned object for debugging.
 *
 * Priority order (descending):
 *   1. Google paid:   gclid / gbraid / wbraid / utm_source=google+paid utm_medium
 *   2. Facebook paid: fbclid / utm_source=facebook|fb|meta|instagram|ig + paid medium
 *   3. Microsoft Ads: msclkid
 *   4. TikTok Ads:    ttclid
 *   5. AI referrals:  referrer or utm_source matches chatgpt/openai/claude/gemini/perplexity
 *   6. Reddit:        utm_source=reddit or referrer host matches reddit
 *   7. Instagram:     utm_source=instagram|ig + non-paid medium (organic)
 *   8. Facebook Organic: utm_source=facebook|fb|meta + organic / referrer fb.com host
 *   9. Google Organic:   utm_source=google + organic / search referrer host
 *  10. Email Recovery:   utm_source=email or ref/referred_by starts with seq_/recovery
 *  11. Referral:         any other recognizable referrer host or utm_source
 *  12. Direct / Unknown: nothing recognized
 *
 * Confidence is "high" when an unambiguous click ID or canonical
 * utm_source+medium pair was detected, "medium" when only a referrer
 * host signal was used, and "low" when only a fuzzy utm_source string
 * or a stripped referrer left us guessing (dark social).
 */

export type AcquisitionLabel =
  | "Google Ads"
  | "Google Organic"
  | "Facebook Paid"
  | "Facebook Organic"
  | "Instagram"
  | "Reddit"
  | "TikTok"
  | "Microsoft Ads"
  | "ChatGPT"
  | "Claude"
  | "Gemini"
  | "Perplexity"
  | "Email Recovery"
  | "Referral"
  | "Direct / Unknown";

export type AcquisitionConfidence = "high" | "medium" | "low";

export interface AcquisitionInputs {
  utm_source?:   string | null;
  utm_medium?:   string | null;
  utm_campaign?: string | null;
  gclid?:        string | null;
  gbraid?:       string | null;
  wbraid?:       string | null;
  fbclid?:       string | null;
  msclkid?:      string | null;
  ttclid?:       string | null;
  /** Custom ?ref= param value. */
  ref?:          string | null;
  /** Legacy orders.referred_by column. May be a host, a label, or null. */
  referred_by?:  string | null;
  /** document.referrer at capture, when available. */
  referrer?:     string | null;
  /** Landing URL — used only as a tie-breaker today. */
  landing_url?:  string | null;
}

export interface AcquisitionClassification {
  label: AcquisitionLabel;
  confidence: AcquisitionConfidence;
  reasoning: string;
  /** Original inputs preserved for debugging / tooltips. */
  raw: AcquisitionInputs;
}

export interface AcquisitionVisual {
  /** Long-form display label — same as the AcquisitionLabel. */
  label: AcquisitionLabel;
  /** Compact label for tight pills. */
  shortLabel: string;
  /** remixicon class string, e.g. "ri-google-line". */
  icon: string;
  /** Tailwind classes for the pill: text, bg, border. */
  color: string;
}

/** Visual mapping. Tailwind classes are constant so the compiler keeps them. */
export const ACQUISITION_VISUAL: Record<AcquisitionLabel, AcquisitionVisual> = {
  "Google Ads":        { label: "Google Ads",        shortLabel: "Google Ads",   icon: "ri-google-line",          color: "text-orange-600 bg-orange-50 border-orange-200" },
  "Google Organic":    { label: "Google Organic",    shortLabel: "Organic",      icon: "ri-search-2-line",        color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  "Facebook Paid":     { label: "Facebook Paid",     shortLabel: "Facebook",     icon: "ri-facebook-circle-line", color: "text-[#1877F2] bg-blue-50 border-blue-200" },
  "Facebook Organic":  { label: "Facebook Organic",  shortLabel: "FB Organic",   icon: "ri-facebook-line",        color: "text-blue-600 bg-blue-50 border-blue-200" },
  "Instagram":         { label: "Instagram",         shortLabel: "Instagram",    icon: "ri-instagram-line",       color: "text-pink-600 bg-pink-50 border-pink-200" },
  "Reddit":            { label: "Reddit",            shortLabel: "Reddit",       icon: "ri-reddit-line",          color: "text-orange-700 bg-orange-50 border-orange-200" },
  "TikTok":            { label: "TikTok",            shortLabel: "TikTok",       icon: "ri-tiktok-line",          color: "text-gray-900 bg-gray-100 border-gray-300" },
  "Microsoft Ads":     { label: "Microsoft Ads",     shortLabel: "Bing Ads",     icon: "ri-microsoft-line",       color: "text-sky-700 bg-sky-50 border-sky-200" },
  "ChatGPT":           { label: "ChatGPT",           shortLabel: "ChatGPT",      icon: "ri-openai-line",          color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  "Claude":            { label: "Claude",            shortLabel: "Claude",       icon: "ri-sparkling-2-line",     color: "text-amber-700 bg-amber-50 border-amber-200" },
  "Gemini":            { label: "Gemini",            shortLabel: "Gemini",       icon: "ri-gemini-line",          color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  "Perplexity":        { label: "Perplexity",        shortLabel: "Perplexity",   icon: "ri-questionnaire-line",   color: "text-slate-700 bg-slate-100 border-slate-300" },
  "Email Recovery":    { label: "Email Recovery",    shortLabel: "Email",        icon: "ri-mail-send-line",       color: "text-violet-600 bg-violet-50 border-violet-200" },
  "Referral":          { label: "Referral",          shortLabel: "Referral",     icon: "ri-share-forward-line",   color: "text-teal-600 bg-teal-50 border-teal-200" },
  "Direct / Unknown":  { label: "Direct / Unknown",  shortLabel: "Direct",       icon: "ri-cursor-line",          color: "text-gray-600 bg-gray-50 border-gray-200" },
};

// ── Internal helpers ────────────────────────────────────────────────────

const PAID_MEDIUM_TOKENS = new Set([
  "cpc", "ppc", "paid", "paidsearch", "paid-search", "paid_search", "sem", "ads", "paidsocial", "paid-social", "paid_social",
]);

const ORGANIC_MEDIUM_TOKENS = new Set([
  "organic", "organic-search", "organic_search", "seo", "social-organic", "social_organic", "referral",
]);

const META_UTM_TOKENS = new Set(["facebook", "fb", "meta"]);
const IG_UTM_TOKENS   = new Set(["instagram", "ig"]);

const SEARCH_REFERRER_HOSTS = ["google.", "bing.", "duckduckgo.", "yahoo.", "yandex.", "ecosia.", "brave."];
const META_REFERRER_HOSTS   = ["facebook.com", "fb.com", "fb.me", "m.facebook.com", "l.facebook.com"];
const IG_REFERRER_HOSTS     = ["instagram.com", "l.instagram.com"];
const REDDIT_REFERRER_HOSTS = ["reddit.com", "old.reddit.com", "redd.it"];
const TIKTOK_REFERRER_HOSTS = ["tiktok.com", "vt.tiktok.com"];

const AI_REFERRER_MAP: { hosts: string[]; label: AcquisitionLabel }[] = [
  { hosts: ["chatgpt.com", "chat.openai.com", "chatgpt.co", "openai.com"], label: "ChatGPT" },
  { hosts: ["claude.ai"],                                                   label: "Claude" },
  { hosts: ["gemini.google.com", "bard.google.com"],                        label: "Gemini" },
  { hosts: ["perplexity.ai", "www.perplexity.ai"],                          label: "Perplexity" },
];

const AI_UTM_MAP: { tokens: string[]; label: AcquisitionLabel }[] = [
  { tokens: ["chatgpt", "openai"],     label: "ChatGPT" },
  { tokens: ["claude", "anthropic"],   label: "Claude" },
  { tokens: ["gemini", "bard"],        label: "Gemini" },
  { tokens: ["perplexity"],            label: "Perplexity" },
];

function normalize(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

function normalizeMedium(v: string | null | undefined): string {
  return normalize(v).replace(/\s+/g, "-");
}

function extractHost(referrer: string | null | undefined): string {
  const r = (referrer ?? "").trim();
  if (!r) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(r) ? r : `https://${r}`);
    return url.hostname.toLowerCase();
  } catch {
    return r.toLowerCase().replace(/^https?:\/\//i, "").split("/")[0];
  }
}

function hostMatchesAny(host: string, candidates: string[]): boolean {
  if (!host) return false;
  return candidates.some((c) => host === c || host.endsWith(`.${c}`) || host.includes(c));
}

function depthOf(landingUrl: string | null | undefined): number {
  const v = (landingUrl ?? "").trim();
  if (!v) return 0;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://example.com${v.startsWith("/") ? v : `/${v}`}`);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length;
  } catch {
    return 0;
  }
}

// ── Main classifier ─────────────────────────────────────────────────────

/**
 * Classify a raw attribution input set into one of the normalized labels.
 * Always returns a result — never throws. Inputs are echoed back on the
 * `raw` field for tooltip / debug surfaces.
 */
export function classifyAcquisition(inputs: AcquisitionInputs): AcquisitionClassification {
  const utmSource   = normalize(inputs.utm_source);
  const utmMedium   = normalizeMedium(inputs.utm_medium);
  const utmCampaign = normalize(inputs.utm_campaign);
  const gclid       = (inputs.gclid       ?? "").trim();
  const gbraid      = (inputs.gbraid      ?? "").trim();
  const wbraid      = (inputs.wbraid      ?? "").trim();
  const fbclid      = (inputs.fbclid      ?? "").trim();
  const msclkid     = (inputs.msclkid     ?? "").trim();
  const ttclid      = (inputs.ttclid      ?? "").trim();
  const ref         = normalize(inputs.ref);
  const referredBy  = normalize(inputs.referred_by);
  const referrer    = (inputs.referrer    ?? "").trim();
  const referrerHost = extractHost(referrer);

  const result = (label: AcquisitionLabel, confidence: AcquisitionConfidence, reasoning: string): AcquisitionClassification => ({
    label, confidence, reasoning, raw: inputs,
  });

  // 1. Google paid — strongest signal first.
  if (gclid)  return result("Google Ads",   "high", "Detected gclid (Google Ads click ID).");
  if (gbraid) return result("Google Ads",   "high", "Detected gbraid (Google Ads app→web).");
  if (wbraid) return result("Google Ads",   "high", "Detected wbraid (Google Ads web→app).");
  if (utmSource === "google" && PAID_MEDIUM_TOKENS.has(utmMedium)) {
    return result("Google Ads", "high", `Detected utm_source=google with paid medium (${utmMedium}).`);
  }

  // 2. Facebook / Meta paid.
  if (fbclid) return result("Facebook Paid", "high", "Detected fbclid (Meta Ads click ID).");
  if ((META_UTM_TOKENS.has(utmSource) || IG_UTM_TOKENS.has(utmSource)) && PAID_MEDIUM_TOKENS.has(utmMedium)) {
    return result("Facebook Paid", "high", `Detected utm_source=${utmSource} with paid medium (${utmMedium}).`);
  }

  // 3. Microsoft Ads.
  if (msclkid) return result("Microsoft Ads", "high", "Detected msclkid (Microsoft Ads click ID).");

  // 4. TikTok Ads / TikTok organic.
  if (ttclid) return result("TikTok", "high", "Detected ttclid (TikTok Ads click ID).");

  // 5. AI referrals — utm_source first, then referrer host.
  for (const ai of AI_UTM_MAP) {
    if (ai.tokens.includes(utmSource)) {
      return result(ai.label, "high", `Detected utm_source=${utmSource} (AI referral).`);
    }
  }
  for (const ai of AI_REFERRER_MAP) {
    if (hostMatchesAny(referrerHost, ai.hosts)) {
      return result(ai.label, "high", `Referrer host ${referrerHost} matches ${ai.label}.`);
    }
  }

  // 6. Reddit.
  if (utmSource === "reddit") return result("Reddit", "high", "Detected utm_source=reddit.");
  if (hostMatchesAny(referrerHost, REDDIT_REFERRER_HOSTS)) {
    return result("Reddit", "medium", `Referrer host ${referrerHost} matches Reddit.`);
  }

  // 7. TikTok organic referrer.
  if (hostMatchesAny(referrerHost, TIKTOK_REFERRER_HOSTS)) {
    return result("TikTok", "medium", `Referrer host ${referrerHost} matches TikTok.`);
  }

  // 8. Instagram organic.
  if (IG_UTM_TOKENS.has(utmSource)) {
    return result("Instagram", "medium", `Detected utm_source=${utmSource}.`);
  }
  if (hostMatchesAny(referrerHost, IG_REFERRER_HOSTS)) {
    return result("Instagram", "medium", `Referrer host ${referrerHost} matches Instagram.`);
  }

  // 9. Facebook Organic.
  if (META_UTM_TOKENS.has(utmSource) && (ORGANIC_MEDIUM_TOKENS.has(utmMedium) || !utmMedium)) {
    return result("Facebook Organic", "medium", `Detected utm_source=${utmSource} with organic / unset medium.`);
  }
  if (hostMatchesAny(referrerHost, META_REFERRER_HOSTS)) {
    return result("Facebook Organic", "medium", `Referrer host ${referrerHost} matches Facebook.`);
  }

  // 10. Google Organic.
  if (utmSource === "google" && (ORGANIC_MEDIUM_TOKENS.has(utmMedium) || !utmMedium)) {
    return result("Google Organic", "medium", "Detected utm_source=google with organic / unset medium.");
  }
  if (hostMatchesAny(referrerHost, SEARCH_REFERRER_HOSTS)) {
    return result("Google Organic", "medium", `Referrer host ${referrerHost} matches a search engine.`);
  }

  // 11. Email Recovery — explicit signals only.
  if (utmSource === "email" || utmSource === "recovery") {
    return result("Email Recovery", "high", `Detected utm_source=${utmSource}.`);
  }
  if (/^(seq_|recovery)/.test(ref) || /^(seq_|recovery)/.test(referredBy)) {
    return result("Email Recovery", "high", `Recovered via tagged ref/referred_by (${ref || referredBy}).`);
  }

  // 12. Recognized but uncategorized utm_source → low-confidence Referral.
  if (utmSource) {
    return result("Referral", "low", `utm_source=${utmSource} (no canonical mapping).`);
  }
  // Recognized referrer host → Referral with medium confidence.
  if (referrerHost) {
    return result("Referral", "medium", `Referrer host ${referrerHost}.`);
  }

  // 13. Legacy referred_by salvage path.
  if (referredBy) {
    if (referredBy.includes("google") && !referredBy.includes("organic")) {
      return result("Google Ads", "medium", `Legacy referred_by=${referredBy}.`);
    }
    if (referredBy.includes("google") && referredBy.includes("organic")) {
      return result("Google Organic", "medium", `Legacy referred_by=${referredBy}.`);
    }
    if (referredBy.includes("facebook") || referredBy.includes("instagram") || referredBy.includes("meta")) {
      return result("Facebook Paid", "medium", `Legacy referred_by=${referredBy}.`);
    }
    if (referredBy.includes("tiktok")) {
      return result("TikTok", "medium", `Legacy referred_by=${referredBy}.`);
    }
    if (referredBy.includes("email")) {
      return result("Email Recovery", "medium", `Legacy referred_by=${referredBy}.`);
    }
    if (referredBy.includes("seo") || referredBy.includes("organic")) {
      return result("Google Organic", "medium", `Legacy referred_by=${referredBy}.`);
    }
    return result("Referral", "low", `Legacy referred_by=${referredBy} (no canonical mapping).`);
  }

  // 14. Dark social / direct — no signals at all.
  // Phase K2 — landing_url is now reliably populated from first_touch_json
  // / last_touch_json on orders, so the dark-social heuristic fires more
  // accurately. A deep landing path with NO attribution signals strongly
  // suggests dark social (Slack/WhatsApp/iOS Mail strips referrers).
  const landingDepth = depthOf(inputs.landing_url);
  if (landingDepth >= 2) {
    return result("Direct / Unknown", "low", "Deep landing without attribution signals (possible dark social or stripped referrer).");
  }
  return result("Direct / Unknown", "medium", "No referrer, no UTM, no click ID detected.");
}

/**
 * Convenience helper that returns the visual config for a classified
 * label. Falls back to the "Direct / Unknown" visual for safety.
 */
export function visualFor(label: AcquisitionLabel): AcquisitionVisual {
  return ACQUISITION_VISUAL[label] ?? ACQUISITION_VISUAL["Direct / Unknown"];
}

/**
 * Build a single-line tooltip string suitable for the `title` attribute
 * on a pill. Format:
 *   "Classified as <Label> · <confidence> confidence · <reasoning>"
 */
export function explain(c: AcquisitionClassification): string {
  return `Classified as ${c.label} · ${c.confidence} confidence · ${c.reasoning}`;
}

// ── Order-row helpers (Phase K3) ────────────────────────────────────────
//
// Shared "build inputs from an order row" helpers so the Orders filter,
// AdminDashboard aggregation, and OrderCard pill all read the same
// signal set. Pure, no IO.

/**
 * Minimal structural shape of an orders.first_touch_json /
 * orders.last_touch_json snapshot. Any superset object also works at the
 * call site — TypeScript only needs these fields.
 */
interface OrderTouchSnapshotLike {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  ref?: string | null;
  referrer?: string | null;
  landing_url?: string | null;
}

/**
 * Structural shape of an order row used by the analytics-alignment
 * helpers. Every field is optional so admin-orders' rich Order type and
 * AdminDashboard's narrower Order type both satisfy it.
 */
export interface OrderLikeAttribution {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referred_by?: string | null;
  first_touch_json?: OrderTouchSnapshotLike | null;
  last_touch_json?:  OrderTouchSnapshotLike | null;
}

/**
 * Merge an order row's flat columns + last_touch + first_touch into a
 * single AcquisitionInputs payload. Precedence: flat column → last_touch
 * → first_touch. Null-safe; returns a fully-shaped object even for
 * sparse / legacy orders.
 */
export function buildOrderAcquisitionInputs(order: OrderLikeAttribution): AcquisitionInputs {
  const lt = order.last_touch_json  ?? null;
  const ft = order.first_touch_json ?? null;
  const pick = <K extends keyof OrderTouchSnapshotLike>(k: K): string | null => {
    return (lt && (lt[k] as string | null | undefined)) ||
           (ft && (ft[k] as string | null | undefined)) ||
           null;
  };
  return {
    utm_source:   order.utm_source   ?? pick("utm_source"),
    utm_medium:   order.utm_medium   ?? pick("utm_medium"),
    utm_campaign: order.utm_campaign ?? pick("utm_campaign"),
    gclid:        order.gclid        ?? pick("gclid"),
    gbraid:                              pick("gbraid"),
    wbraid:                              pick("wbraid"),
    fbclid:       order.fbclid       ?? pick("fbclid"),
    msclkid:                             pick("msclkid"),
    ttclid:                              pick("ttclid"),
    ref:                                 pick("ref"),
    referred_by:  order.referred_by  ?? null,
    referrer:                            pick("referrer"),
    landing_url:                         pick("landing_url"),
  };
}

/** Convenience: classify an order row in one call. */
export function classifyOrder(order: OrderLikeAttribution): AcquisitionClassification {
  return classifyAcquisition(buildOrderAcquisitionInputs(order));
}

/**
 * The full canonical list of normalized labels, in the order that
 * dropdowns and dashboards should render them. Exposed so consumers
 * don't need to hard-code the union.
 */
export const ACQUISITION_LABELS: AcquisitionLabel[] = [
  "Google Ads",
  "Google Organic",
  "Facebook Paid",
  "Facebook Organic",
  "Instagram",
  "Reddit",
  "TikTok",
  "Microsoft Ads",
  "ChatGPT",
  "Claude",
  "Gemini",
  "Perplexity",
  "Email Recovery",
  "Referral",
  "Direct / Unknown",
];
