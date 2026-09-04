// ─────────────────────────────────────────────────────────────────────────────
// channelGate.ts — GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001
//
// The Primary Google Ads backend purchase conversion action
// ("Pawtenant Backend Purchase (API)") is used for BIDDING. It must therefore
// receive ONLY purchases whose canonical acquisition is Google Ads.
//
// ROOT CAUSE THIS FIXES
// ─────────────────────
// The uploader's eligibility was "is this a paid order that has SOME usable
// identifier?". getUploadMethod() returns "hashed_email_only" whenever an order
// carries an email but no click id — so organic, direct, referral, AI-referral
// and social purchases were uploaded to the Primary action via Enhanced
// Conversions for Leads. Confirmed contamination: ≥48 non-Google purchases in
// July 2026 and ≥16 in August 2026.
//
// WHAT THIS MODULE IS (AND IS NOT)
// ────────────────────────────────
// It is NOT a new traffic-source classifier. PawTenant already has exactly one
// canonical acquisition classification, produced by the tracker
// (src/lib/attributionStore.ts buildChannel()) and snapshotted ONCE per browser
// into the immutable first touch (getOrInitFirstTouch → orders.first_touch_json,
// also embedded at attribution_json.first_touch). This module only READS that
// canonical value and answers one question: may this order enter the Primary
// backend purchase uploader?
//
// WHY THE CANONICAL CHANNEL ALONE IS NOT SUFFICIENT
// ─────────────────────────────────────────────────
// attributionStore.normalizeSource() maps a bare `utm_source=google` to
// "google_ads" REGARDLESS of medium, so an organic Google visit tagged
// `?utm_source=google&utm_medium=organic` produces canonical channel
// "google_ads". The owner decision is explicit: "utm_source=google alone does
// not prove paid traffic." So when the canonical channel's only possible basis
// is a bare utm_source, this gate additionally requires an explicitly PAID
// medium. We do NOT change buildChannel() — that would alter site-wide tracking
// semantics; the paid proof is required here, at the bidding boundary.
//
// FIRST TOUCH ONLY — NEVER A LATER TOUCH
// ──────────────────────────────────────
// orders.attribution_json.channel (top level) is the LAST-touch channel
// (buildChannel() evaluated at checkout). ATTRIBUTION-SOURCE-IMMUTABILITY-001
// proved a later touch can be contaminated by storage-restored click IDs
// (LIVE PT-MT1GWHXX: organic first touch re-branded Google Ads). The top-level
// channel is therefore used ONLY as a negative / conflict signal, never to grant
// eligibility while a first touch exists.
//
// PRIVACY
// ───────
// Every field this module returns is a machine token or a canonical channel
// name. It never returns, logs, or embeds a click id, an email, a hash, a URL,
// or any PHI.
// ─────────────────────────────────────────────────────────────────────────────

// LIVE ADAPTATION (GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION):
// TEST imports cleanClickId from ./lib.ts, a module introduced by the TEST-only
// refund-adjustment consumer. LIVE has no lib.ts, so the identical rule is inlined
// here. Keep it byte-for-byte equal to TEST lib.ts cleanClickId / CLICK_ID_MACRO_RE.
// A click id containing a macro / placeholder (`{gclid}`, `%7Bgclid%7D`, `[gbraid]`,
// the literal word `gclid`) is not evidence of anything.
export const CLICK_ID_MACRO_RE = /[{}\[\]]|%7b|%7d|gclid|gbraid|wbraid/i;

export function cleanClickId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (CLICK_ID_MACRO_RE.test(v)) return null;
  return v;
}

/** Canonical channel value (attributionStore.buildChannel) meaning Google paid. */
export const GOOGLE_ADS_CANONICAL_CHANNEL = "google_ads";

/** orders.google_ads_upload_status written for a non-Google acquisition. */
export const SKIP_NON_GOOGLE_CHANNEL = "skipped_non_google_channel";

/**
 * orders.google_ads_upload_status written when the canonical channel and the
 * click-id evidence CONTRADICT each other. Never uploaded; queued for a human.
 */
export const SKIP_ATTRIBUTION_CONFLICT = "skipped_attribution_conflict";

/** Both terminal skip states, for selection filters and admin surfaces. */
export const CHANNEL_GATE_SKIP_STATUSES: readonly string[] = [
  SKIP_NON_GOOGLE_CHANNEL,
  SKIP_ATTRIBUTION_CONFLICT,
];

/**
 * utm_medium values that explicitly prove PAID traffic.
 *
 * Sourced from the owner decision (cpc / ppc / paid / paid_search / search_ad)
 * unioned with the paid-search half of the canonical PAID_MEDIUM_TOKENS set in
 * src/lib/acquisitionClassifier.ts. The paid-SOCIAL members of that canonical
 * set are deliberately excluded: they cannot prove a Google *search/paid* click.
 * check-google-ads-primary-channel-gate.mjs pins this list against both sources
 * so it can never silently widen.
 */
export const GOOGLE_PAID_MEDIUM_TOKENS: readonly string[] = [
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid-search",
  "paid_search",
  "sem",
  "ads",
  "searchad",
  "search-ad",
  "search_ad",
];

/** Google paid click identifiers, in the uploader's own precedence order. */
export const GOOGLE_CLICK_ID_FIELDS = ["gclid", "gbraid", "wbraid"] as const;
export type GoogleClickIdField = (typeof GOOGLE_CLICK_ID_FIELDS)[number];

export type ChannelGateState = "eligible" | "excluded" | "conflict";

export interface ChannelGateResult {
  /** eligible → may proceed; excluded / conflict → never uploaded. */
  state: ChannelGateState;
  /** Convenience mirror of state === "eligible". */
  eligible: boolean;
  /**
   * Value to write to orders.google_ads_upload_status when not eligible.
   * null while eligible (the normal upload path owns the status).
   */
  uploadStatus: string | null;
  /** Privacy-safe machine token naming the rule that decided this. */
  reason: string;
  /** Canonical first-touch channel actually observed ("" when absent). */
  channel: string;
  /** Where the channel came from. */
  channelSource:
    | "first_touch_json"
    | "attribution_json.first_touch"
    | "attribution_json.channel"
    | "none";
  /** Coarse booleans only — never the identifier values themselves. */
  signals: {
    hasFirstTouch: boolean;
    firstTouchGoogleClickId: boolean;
    firstTouchGoogleClickIdUnproven: boolean;
    anyGoogleClickId: boolean;
    googleSourcePaidMedium: boolean;
    googleSourceNonPaidMedium: boolean;
  };
}

type JsonObject = Record<string, unknown>;

/** Structural shape read off an order row. Every field optional / null-safe. */
export interface ChannelGateOrder {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  first_touch_json?: JsonObject | null;
  last_touch_json?: JsonObject | null;
  attribution_json?: JsonObject | null;
}

function asObject(v: unknown): JsonObject | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : null;
}

function normalize(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** Medium normalization mirrors acquisitionClassifier.normalizeMedium (whitespace → "-"). */
function normalizeMedium(v: unknown): string {
  return normalize(v).replace(/\s+/g, "-");
}

export function isGooglePaidMedium(medium: unknown): boolean {
  const m = normalizeMedium(medium);
  return m !== "" && GOOGLE_PAID_MEDIUM_TOKENS.includes(m);
}

/** A non-empty, non-macro click id, or null. Uses the uploader's own cleaner. */
function clickIdOf(source: JsonObject | null, field: GoogleClickIdField): string | null {
  if (!source) return null;
  return cleanClickId(source[field]);
}

/**
 * click_provenance (ATTRIBUTION-SOURCE-IMMUTABILITY-001, provenance_version >= 1):
 *   "url"     → captured from a URL in that tab session = a real paid click.
 *   "storage" → restored from a previous session = unproven.
 * A snapshot with NO provenance map predates the fix; there is nothing better to
 * read, so its ids are accepted (the canonical channel still governs above them).
 * An explicit non-"url" provenance is REJECTED — fail closed.
 */
function provenanceAllows(snapshot: JsonObject, field: GoogleClickIdField): boolean {
  const map = asObject(snapshot.click_provenance);
  if (!map) return true; // legacy snapshot — no provenance recorded at all
  if (!(field in map)) return true; // this id predates the map entry
  return normalize(map[field]) === "url";
}

function firstProvenGoogleClickId(snapshot: JsonObject | null): boolean {
  if (!snapshot) return false;
  return GOOGLE_CLICK_ID_FIELDS.some(
    (f) => !!clickIdOf(snapshot, f) && provenanceAllows(snapshot, f),
  );
}

function anyGoogleClickId(snapshot: JsonObject | null): boolean {
  if (!snapshot) return false;
  return GOOGLE_CLICK_ID_FIELDS.some((f) => !!clickIdOf(snapshot, f));
}

/**
 * The canonical, immutable FIRST-TOUCH snapshot.
 * orders.first_touch_json is the column written at order creation;
 * attribution_json.first_touch is the same snapshot embedded by
 * buildAttributionJson(). Never last_touch_json, never the flat columns.
 */
function resolveFirstTouch(order: ChannelGateOrder): {
  snapshot: JsonObject | null;
  source: ChannelGateResult["channelSource"];
} {
  const col = asObject(order.first_touch_json);
  if (col && Object.keys(col).length > 0) return { snapshot: col, source: "first_touch_json" };
  const embedded = asObject(asObject(order.attribution_json)?.first_touch);
  if (embedded && Object.keys(embedded).length > 0) {
    return { snapshot: embedded, source: "attribution_json.first_touch" };
  }
  return { snapshot: null, source: "none" };
}

/** Flat columns + last touch + attribution_json top level — conflict evidence only. */
function anyGoogleClickIdAnywhere(order: ChannelGateOrder, firstTouch: JsonObject | null): boolean {
  const flat: JsonObject = { gclid: order.gclid, gbraid: order.gbraid, wbraid: order.wbraid };
  return (
    anyGoogleClickId(flat) ||
    anyGoogleClickId(firstTouch) ||
    anyGoogleClickId(asObject(order.last_touch_json)) ||
    anyGoogleClickId(asObject(order.attribution_json))
  );
}

/**
 * THE ELIGIBILITY PREDICATE.
 *
 * An order may enter the Primary Backend Purchase uploader ONLY when its
 * authoritative first-touch acquisition is Google paid. Evidence order:
 *
 *   1. Canonical first-touch channel === "google_ads", corroborated by either a
 *      first-touch Google click id or an explicitly paid medium (see the
 *      normalizeSource note at the top of this file).
 *   2. Channel genuinely missing on the first touch → a first-touch Google paid
 *      click identifier (gclid / gbraid / wbraid) qualifies.
 *   3. Neither channel nor click id → utm_source=google qualifies ONLY with an
 *      explicitly paid medium.
 *
 * An explicit canonical NON-Google channel is never overridden — not by hashed
 * email availability, not by a later-touch Google signal, not by a stale or
 * storage-restored click id, not by a bare utm_source=google, and not by the
 * customer having previously interacted with Google.
 *
 * When the explicit channel and the click-id evidence contradict each other the
 * result is "conflict": still never uploaded, but flagged distinctly so an admin
 * can review it instead of it silently disappearing.
 */
export function resolveGoogleAdsChannelEligibility(order: ChannelGateOrder): ChannelGateResult {
  const { snapshot: ft, source: ftSource } = resolveFirstTouch(order);
  const ftChannel = normalize(ft?.channel);
  const laterChannel = normalize(asObject(order.attribution_json)?.channel);

  const ftProvenClick = firstProvenGoogleClickId(ft);
  const ftAnyClick = anyGoogleClickId(ft);
  const anyClick = anyGoogleClickIdAnywhere(order, ft);

  // utm evidence: the first-touch snapshot when we have one, else the flat
  // creation-time columns (which are all a legacy order has — the same fallback
  // acquisitionClassifier.buildOrderAcquisitionInputs() uses).
  const utmSource = ft ? normalize(ft.utm_source) : normalize(order.utm_source);
  const utmMedium = ft ? ft.utm_medium : order.utm_medium;
  const googleSource = utmSource === "google";
  const googlePaid = googleSource && isGooglePaidMedium(utmMedium);
  const googleNonPaid = googleSource && !isGooglePaidMedium(utmMedium);

  const signals: ChannelGateResult["signals"] = {
    hasFirstTouch: !!ft,
    firstTouchGoogleClickId: ftProvenClick,
    firstTouchGoogleClickIdUnproven: ftAnyClick && !ftProvenClick,
    anyGoogleClickId: anyClick,
    googleSourcePaidMedium: googlePaid,
    googleSourceNonPaidMedium: googleNonPaid,
  };

  const allow = (reason: string, channel: string, channelSource: ChannelGateResult["channelSource"]): ChannelGateResult => ({
    state: "eligible", eligible: true, uploadStatus: null, reason, channel, channelSource, signals,
  });
  const deny = (reason: string, channel: string, channelSource: ChannelGateResult["channelSource"]): ChannelGateResult => ({
    state: "excluded", eligible: false, uploadStatus: SKIP_NON_GOOGLE_CHANNEL, reason, channel, channelSource, signals,
  });
  const conflict = (reason: string, channel: string, channelSource: ChannelGateResult["channelSource"]): ChannelGateResult => ({
    state: "conflict", eligible: false, uploadStatus: SKIP_ATTRIBUTION_CONFLICT, reason, channel, channelSource, signals,
  });

  // ── 1. An explicit canonical first-touch channel is AUTHORITATIVE ─────────
  if (ft && ftChannel) {
    if (ftChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {
      // Never overridden. A Google click id anywhere on the row contradicts the
      // authoritative channel → conflict for admin review, still no upload.
      return anyClick
        ? conflict("non_google_channel_with_google_click_id", ftChannel, ftSource)
        : deny(`non_google_channel:${ftChannel}`, ftChannel, ftSource);
    }
    // channel === google_ads — corroborate it (bare utm_source=google is not proof).
    if (ftProvenClick) return allow("canonical_channel_with_first_touch_click_id", ftChannel, ftSource);
    if (googlePaid) return allow("canonical_channel_with_paid_medium", ftChannel, ftSource);
    if (ftAnyClick) return conflict("google_channel_with_unproven_click_id", ftChannel, ftSource);
    if (googleNonPaid) return deny("utm_source_google_without_paid_medium", ftChannel, ftSource);
    return deny("google_channel_without_supporting_evidence", ftChannel, ftSource);
  }

  // ── 2. First touch exists but carries NO channel ───────────────────────────
  if (ft) {
    if (ftProvenClick) return allow("first_touch_google_click_id", "", ftSource);
    if (googlePaid) return allow("first_touch_google_paid_medium", "", ftSource);
    if (ftAnyClick) return conflict("unproven_first_touch_click_id", "", ftSource);
    if (laterChannel && laterChannel !== GOOGLE_ADS_CANONICAL_CHANNEL && anyClick) {
      return conflict("non_google_later_channel_with_google_click_id", laterChannel, "attribution_json.channel");
    }
    return deny("no_google_first_touch_evidence", "", ftSource);
  }

  // ── 3. Legacy order: no first-touch snapshot at all ────────────────────────
  // The creation-time flat columns are the closest thing to a first touch.
  // The top-level (last-touch) canonical channel is used ONLY to REFUSE.
  if (laterChannel && laterChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {
    return anyClick
      ? conflict("non_google_later_channel_with_google_click_id", laterChannel, "attribution_json.channel")
      : deny(`non_google_channel:${laterChannel}`, laterChannel, "attribution_json.channel");
  }
  const flatClick = GOOGLE_CLICK_ID_FIELDS.some(
    (f) => !!cleanClickId((order as Record<string, unknown>)[f]),
  );
  if (flatClick) return allow("legacy_flat_google_click_id", laterChannel, laterChannel ? "attribution_json.channel" : "none");
  if (googlePaid) return allow("legacy_google_paid_medium", laterChannel, laterChannel ? "attribution_json.channel" : "none");
  if (googleNonPaid) return deny("utm_source_google_without_paid_medium", laterChannel, laterChannel ? "attribution_json.channel" : "none");
  return deny("no_google_attribution_evidence", laterChannel, laterChannel ? "attribution_json.channel" : "none");
}
