/**
 * attributionResolver — canonical "source vs landing-page" resolver.
 *
 * ONE place that turns an order's stored attribution signals into clean,
 * marketing-ready fields, so admin display / CSV export never again show a
 * landing-page label (e.g. "state-page") in the Traffic Source column.
 *
 * Design notes / scope:
 *   • DISPLAY / REPORT ONLY. Pure function. No IO, no DB writes, no React.
 *   • Reuses the already-verified acquisitionClassifier (build-time
 *     check-attribution-parity guards it) for source detection, then maps its
 *     label to the marketing vocabulary the owner asked for
 *     (Google Ads / Paid Search, Meta Ads / Paid Social, ChatGPT / AI Referral …).
 *   • Landing page is kept STRICTLY separate from traffic source: the landing
 *     URL/path/type come only from the landing_url, never from the source rule.
 *   • Raw legacy value (orders.referred_by) is preserved as traffic_source_raw.
 *   • Derives everything from data the order already carries
 *     (referred_by, gclid, fbclid, utm_*, first_touch_json, last_touch_json) —
 *     no new columns, no migration, no backfill needed.
 *
 * Source rule priority (owner spec) — implemented via the classifier:
 *   1. gclid                       → Google Ads      / Paid Search
 *   2. fbclid or meta/ig UTM       → Meta Ads        / Paid Social
 *   3. referrer chatgpt/openai     → ChatGPT         / AI Referral
 *   4. referrer perplexity.ai      → Perplexity      / AI Referral
 *   5. referrer claude.ai          → Claude          / AI Referral
 *   6. referrer gemini.google.com  → Gemini          / AI Referral
 *   7. google organic (no gclid)   → Google Organic  / Organic Search
 *   8. fb/ig organic (no paid)     → Facebook/Instagram Organic / Organic Social
 *   9. same-domain pawtenant.com   → Internal Referral / Internal
 *  10. nothing                     → Direct          / Direct
 *  11. landing labels (state-page, homepage, checkout, …) → landing_page_type,
 *      NEVER the source.
 */

import {
  classifyAcquisition,
  type AcquisitionInputs,
  type AcquisitionLabel,
} from "./acquisitionClassifier";

// Minimal structural shape of a first_touch_json / last_touch_json snapshot.
interface TouchSnapshot {
  session_id?: string | null;
  first_seen_at?: string | null;
  channel?: string | null;
  fullSource?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gad_source?: string | null;
  keyword?: string | null;
  search_term?: string | null;
  matchtype?: string | null;
  network?: string | null;
  device?: string | null;
  placement?: string | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  ref?: string | null;
  referrer?: string | null;
  landing_url?: string | null;
  captured_at?: string | null;
}

/** Structural shape this resolver reads off an order row. All optional. */
export interface ResolvableOrder {
  referred_by?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  landing_url?: string | null;
  session_id?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  first_touch_json?: TouchSnapshot | null;
  last_touch_json?: TouchSnapshot | null;
}

export interface ResolvedAttribution {
  // Source vs channel (final, marketing-ready)
  traffic_source_raw: string;        // legacy orders.referred_by, untouched
  traffic_source_final: string;
  traffic_channel_final: string;
  attribution_rule_reason: string;
  attribution_confidence: string;    // high | medium | low
  attribution_data_completeness: string; // e.g. "4/4 (Complete)"
  // Click IDs / campaign (already on the order — surfaced for convenience)
  gclid: string;
  fbclid: string;
  gad_source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  // Keyword / search term (verbatim — never invented)
  keyword: string;
  search_term: string;
  // Campaign / ad-set / ad identifiers + ValueTrack signals
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  network: string;
  match_type: string;
  device: string;
  placement: string;
  // Landing pages (kept separate from source)
  first_landing_page_url: string;
  first_landing_page_path: string;
  first_landing_page_type: string;
  last_landing_page_url: string;
  last_landing_page_path: string;
  last_landing_page_type: string;
  // Referrers
  first_referrer: string;
  last_referrer: string;
  // Identity + timing
  session_id: string;
  attribution_first_seen_at: string;
  time_to_payment_minutes: string;        // created_at → paid_at
  time_first_visit_to_order_minutes: string; // first_seen_at → created_at
}

// ── classifier label → owner marketing vocabulary ───────────────────────────
interface FinalPair { source: string; channel: string; }

const LABEL_TO_FINAL: Record<AcquisitionLabel, FinalPair> = {
  "Google Ads":        { source: "Google Ads",          channel: "Paid Search" },
  "Google Organic":    { source: "Google Organic",      channel: "Organic Search" },
  "Facebook Paid":     { source: "Meta Ads",            channel: "Paid Social" },
  "Facebook Organic":  { source: "Facebook Organic",     channel: "Organic Social" },
  "Instagram":         { source: "Instagram",            channel: "Organic Social" },
  "Reddit":            { source: "Reddit",               channel: "Organic Social" },
  "TikTok":            { source: "TikTok",               channel: "Paid Social" },
  "Microsoft Ads":     { source: "Microsoft Ads",        channel: "Paid Search" },
  "Bing Ads":          { source: "Bing Ads",             channel: "Paid Search" },
  "Yahoo Ads":         { source: "Yahoo Ads",            channel: "Paid Search" },
  "AOL Ads":           { source: "AOL Ads",              channel: "Paid Search" },
  "Bing Organic":      { source: "Bing Organic",         channel: "Organic Search" },
  "Yahoo Organic":     { source: "Yahoo Organic",        channel: "Organic Search" },
  "AOL Organic":       { source: "AOL Organic",          channel: "Organic Search" },
  "ChatGPT":           { source: "ChatGPT",              channel: "AI Referral" },
  "Claude":            { source: "Claude",               channel: "AI Referral" },
  "Gemini":            { source: "Gemini",               channel: "AI Referral" },
  "Perplexity":        { source: "Perplexity",           channel: "AI Referral" },
  "Copilot":           { source: "Copilot",              channel: "AI Referral" },
  "Poe":               { source: "Poe",                  channel: "AI Referral" },
  "You.com":           { source: "You.com",              channel: "AI Referral" },
  "Phind":             { source: "Phind",                channel: "AI Referral" },
  "Email Recovery":    { source: "Email Recovery",       channel: "Email" },
  "Referral":          { source: "Referral",             channel: "Referral" },
  "Direct / Unknown":  { source: "Direct",               channel: "Direct" },
};

const s = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v));

// ?ref= / referred_by values that describe WHERE the visitor landed, not WHO
// sent them. These must NEVER become the traffic source — they belong in
// landing_page_type. (Owner rule #11.)
const LANDING_LABEL_TOKENS = [
  "state-page", "state_page", "state-landing", "statepage",
  "homepage", "home-page", "landing", "checkout", "payment",
  "landlord-denial", "landlord-denied", "housing", "esa-letter", "psd",
];
function isLandingLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  // Treat as a landing label only when it's a bare slug (no spaces, no host) —
  // never misclassify real source strings like "Google Ads" or a domain.
  if (v.includes(" ") || v.includes(".") || v.includes("/")) return false;
  return LANDING_LABEL_TOKENS.some((t) => v === t || v.includes(t));
}

function urlPath(rawUrl: string): string {
  const v = rawUrl.trim();
  if (!v) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://x${v.startsWith("/") ? v : `/${v}`}`);
    return url.pathname || "/";
  } catch {
    // strip protocol + host best-effort
    const noProto = v.replace(/^https?:\/\//i, "");
    const slash = noProto.indexOf("/");
    return slash >= 0 ? noProto.slice(slash).split("?")[0] : "/";
  }
}

function urlHost(rawUrl: string): string {
  const v = rawUrl.trim();
  if (!v) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.hostname.toLowerCase();
  } catch {
    return v.toLowerCase().replace(/^https?:\/\//i, "").split("/")[0];
  }
}

/**
 * Classify a LANDING page from its path (+ optional ref hint). This is the
 * "where did they land" axis — completely independent of traffic source.
 */
function landingType(rawUrl: string, refHint: string): string {
  const hasUrl = !!rawUrl.trim();
  const p = hasUrl ? (urlPath(rawUrl).toLowerCase().replace(/\/+$/, "") || "/") : "";
  const ref = refHint.trim().toLowerCase();

  if (hasUrl) {
    if (p === "/" || p === "/home" || p === "/index") return "homepage";
    if (p.startsWith("/assessment")) return "assessment";
    if (p.startsWith("/psd-assessment")) return "psd-assessment";
    if (p.startsWith("/checkout") || p.startsWith("/payment")) return "checkout";
    if (p.startsWith("/thank-you") || p.startsWith("/confirmation")) return "thank-you";
    // State guides live at /esa-letter/<state-slug>; the bare /esa-letter is info.
    if (p.startsWith("/esa-letter/")) return "state-page";
    if (p === "/esa-letter") return "esa-letter-info";
    if (p.includes("landlord-denied") || p.includes("landlord-denial")) return "landlord-denial";
    if (p.includes("housing")) return "housing";
    if (p.startsWith("/psd")) return "psd-info";
    if (p.startsWith("/blog")) return "blog";
  }

  // Fall back to the ?ref= landing hint (e.g. state-page) when the path is
  // unknown/absent — but only as a LANDING label, never as the traffic source.
  if (ref) {
    if (ref.includes("state")) return "state-page";
    if (ref.includes("home")) return "homepage";
    if (ref.includes("checkout")) return "checkout";
    if (ref.includes("landlord")) return "landlord-denial";
    if (ref.includes("housing")) return "housing";
  }

  if (!hasUrl) return "";

  if (p && p !== "/") {
    const seg = p.split("/").filter(Boolean)[0];
    if (seg) return seg;
  }
  return rawUrl ? "other" : "";
}

function minutesBetween(fromIso: string, toIso: string): string {
  if (!fromIso || !toIso) return "";
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (isNaN(a) || isNaN(b)) return "";
  const mins = (b - a) / 60000;
  if (mins < 0) return "";
  return (Math.round(mins * 10) / 10).toString();
}

/**
 * Resolve an order's clean attribution view. Pure + null-safe; always returns
 * a fully-shaped object (empty strings where data is missing).
 */
export function resolveOrderAttribution(order: ResolvableOrder): ResolvedAttribution {
  const ft = order.first_touch_json ?? null;
  const lt = order.last_touch_json ?? null;

  const referredByRaw = s(order.referred_by);
  const refRaw = s(lt?.ref ?? ft?.ref);
  // A landing-label referred_by / ref must NOT drive the source — strip it
  // before classifying so the source falls back to the real signals
  // (gclid/fbclid/utm/referrer) or Direct. Keep the label as a landing hint.
  const referredByForSource = isLandingLabel(referredByRaw) ? null : (order.referred_by ?? null);
  const landingLabelHint = isLandingLabel(referredByRaw) ? referredByRaw : (isLandingLabel(refRaw) ? refRaw : "");

  // Merge signals for the source classifier (flat column → last → first).
  const inputs: AcquisitionInputs = {
    utm_source:   order.utm_source   ?? lt?.utm_source   ?? ft?.utm_source   ?? null,
    utm_medium:   order.utm_medium   ?? lt?.utm_medium   ?? ft?.utm_medium   ?? null,
    utm_campaign: order.utm_campaign ?? lt?.utm_campaign ?? ft?.utm_campaign ?? null,
    gclid:        order.gclid        ?? lt?.gclid        ?? ft?.gclid        ?? null,
    gbraid:                             lt?.gbraid       ?? ft?.gbraid       ?? null,
    wbraid:                             lt?.wbraid       ?? ft?.wbraid       ?? null,
    fbclid:       order.fbclid       ?? lt?.fbclid       ?? ft?.fbclid       ?? null,
    msclkid:                            lt?.msclkid      ?? ft?.msclkid      ?? null,
    ttclid:                             lt?.ttclid       ?? ft?.ttclid       ?? null,
    ref:                                lt?.ref          ?? ft?.ref          ?? null,
    referred_by:  referredByForSource,
    referrer:                           lt?.referrer     ?? ft?.referrer     ?? null,
    landing_url:  order.landing_url  ?? lt?.landing_url  ?? ft?.landing_url  ?? null,
  };

  const cls = classifyAcquisition(inputs);
  let { source, channel } = LABEL_TO_FINAL[cls.label] ?? LABEL_TO_FINAL["Direct / Unknown"];
  let reason = cls.reasoning;

  const mergedReferrer = s(inputs.referrer);
  const mergedReferrerHost = urlHost(mergedReferrer);

  // Post-adjustments the base classifier doesn't express:
  // (a) Same-domain pawtenant referral → Internal (owner rule #9). Matches the
  //     apex/www domain on LIVE and the *.vercel.app host on TEST.
  if (
    cls.label === "Referral" &&
    (mergedReferrerHost.includes("pawtenant") || referredByRaw.toLowerCase().includes("pawtenant"))
  ) {
    source = "Internal Referral";
    channel = "Internal";
    reason = `Same-domain referrer (${mergedReferrerHost || "pawtenant"}).`;
  }
  // (b) TikTok via referrer host (not ttclid) is organic, not paid.
  if (cls.label === "TikTok" && cls.confidence !== "high") {
    channel = "Organic Social";
  }

  // ── Landing pages (independent of source) ──────────────────────────────
  const firstLandingUrl = s(ft?.landing_url ?? order.landing_url);
  const lastLandingUrl = s(lt?.landing_url ?? order.landing_url);
  // landingLabelHint (a landing-only ?ref=, e.g. "state-page") is a fallback so
  // a missing/unknown landing_url still labels the landing type correctly.
  const refHint = landingLabelHint || s(ft?.ref ?? lt?.ref);

  // ── Timing ─────────────────────────────────────────────────────────────
  const createdAt = s(order.created_at);
  const paidAt = s(order.paid_at);
  const firstSeenAt = s(ft?.first_seen_at ?? lt?.first_seen_at);

  // ── Keyword / campaign signals (last-touch → first-touch) ───────────────
  // Read verbatim from the touch snapshots — these live only in JSON today.
  const pickTouch = (k: keyof TouchSnapshot): string =>
    s((lt && lt[k]) ?? (ft && ft[k]) ?? null);

  const utmTerm    = s(order.utm_term ?? null) || pickTouch("utm_term");
  const utmContent = s(order.utm_content ?? null) || pickTouch("utm_content");
  const gadSource  = pickTouch("gad_source");
  const keywordRaw = pickTouch("keyword");
  const searchTerm = pickTouch("search_term");
  const matchType  = pickTouch("matchtype");
  const network    = pickTouch("network");
  const device     = pickTouch("device");
  const placement  = pickTouch("placement");
  const campaignId = pickTouch("campaign_id");
  const adsetId    = pickTouch("adset_id");
  const adId       = pickTouch("ad_id");

  // Keyword resolution rule (owner spec): never invent. Prefer an explicit
  // keyword param; for paid search, utm_term commonly carries {keyword}, so
  // fall back to it. Anything else stays blank.
  const isPaidSearch = channel === "Paid Search";
  const keyword = keywordRaw || (isPaidSearch ? utmTerm : "");

  // ── Attribution data completeness (debug-friendly coverage signal) ──────
  // Four axes: a usable source signal, a landing page, a campaign id/name,
  // and a keyword/search term. Helps admin see at a glance how trustworthy
  // a row's marketing data is.
  const firstLandingUrlForScore = s(ft?.landing_url ?? order.landing_url);
  const hasSourceSignal = !!(s(inputs.gclid) || s(inputs.fbclid) || s(inputs.utm_source) || gadSource ||
    s(lt?.referrer) || s(ft?.referrer));
  const hasLanding  = !!(firstLandingUrlForScore || s(lt?.landing_url));
  const hasCampaign = !!(s(inputs.utm_campaign) || campaignId);
  const hasKeyword  = !!(keyword || searchTerm);
  const completenessScore = [hasSourceSignal, hasLanding, hasCampaign, hasKeyword].filter(Boolean).length;
  const completenessLabel =
    completenessScore >= 4 ? "Complete" :
    completenessScore >= 2 ? "Partial" :
    completenessScore >= 1 ? "Sparse" : "None";
  const attributionDataCompleteness = `${completenessScore}/4 (${completenessLabel})`;

  return {
    traffic_source_raw: referredByRaw,
    traffic_source_final: source,
    traffic_channel_final: channel,
    attribution_rule_reason: reason,
    attribution_confidence: cls.confidence,
    attribution_data_completeness: attributionDataCompleteness,
    gclid: s(inputs.gclid),
    fbclid: s(inputs.fbclid),
    gad_source: gadSource,
    utm_source: s(inputs.utm_source),
    utm_medium: s(inputs.utm_medium),
    utm_campaign: s(inputs.utm_campaign),
    utm_term: utmTerm,
    utm_content: utmContent,
    keyword,
    search_term: searchTerm,
    campaign_id: campaignId,
    adset_id: adsetId,
    ad_id: adId,
    network,
    match_type: matchType,
    device,
    placement,
    first_landing_page_url: firstLandingUrl,
    first_landing_page_path: firstLandingUrl ? urlPath(firstLandingUrl) : "",
    first_landing_page_type: landingType(firstLandingUrl, refHint),
    last_landing_page_url: lastLandingUrl,
    last_landing_page_path: lastLandingUrl ? urlPath(lastLandingUrl) : "",
    last_landing_page_type: landingType(lastLandingUrl, refHint),
    first_referrer: s(ft?.referrer),
    last_referrer: s(lt?.referrer),
    session_id: s(order.session_id ?? ft?.session_id ?? lt?.session_id),
    attribution_first_seen_at: firstSeenAt,
    time_to_payment_minutes: minutesBetween(createdAt, paidAt),
    time_first_visit_to_order_minutes: minutesBetween(firstSeenAt, createdAt),
  };
}
