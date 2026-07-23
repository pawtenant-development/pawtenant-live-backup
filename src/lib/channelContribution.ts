/**
 * channelContribution — ACCOUNTS-CHANNEL-CONTRIBUTION-BREAKDOWN-001
 *
 * Pure, side-effect-free classification + aggregation for the Accounts
 * "Channel Contribution" drilldown. It answers: which acquisition channels
 * create paid orders, and how much gross / net / provider-cost / ad-spend /
 * contribution each one represents — as an EXCLUSIVE partition of the paid
 * order set (every paid order → exactly one leaf channel).
 *
 * Design contract (do not weaken without updating the guard
 * scripts/check-channel-contribution.mjs):
 *   1. REUSE the canonical classifier. We do NOT re-implement channel
 *      detection — we call `classifyAcquisition` from acquisitionClassifier.ts
 *      and only ADD (a) a 4-category parent map over its 25 leaf labels,
 *      (b) a Direct-vs-Unknown split so unattributed traffic stays separate,
 *      and (c) an "Other Organic" / "Other Paid Media" home for the loose
 *      leaves. No competing detection logic lives here.
 *   2. EXCLUSIVE + EXHAUSTIVE. Every AcquisitionLabel maps to exactly one
 *      { category, leaf }. Unknown / Unattributed is its own category and is
 *      never merged into Organic / Direct / Referral / Paid Media / Organic AI.
 *   3. MONEY IS CANONICAL + PRE-COMPUTED. This module never derives money.
 *      Gross / refund / provider amounts are supplied per order (already
 *      computed server-side with the canonical orderFinancials.ts +
 *      providerPaymentExport.ts rules) and are only SUMMED here. USD dollars.
 *   4. NO STRIPE FEES. There is no authoritative order-level Stripe fee, so
 *      contribution intentionally stops at "before Stripe fees". We never
 *      estimate, apportion, or fabricate a per-channel fee, and never label
 *      pre-Stripe contribution as profit.
 *   5. AD SPEND belongs only to paid channels. Only the Google Ads leaf
 *      receives synced Google Ads spend; Organic, Organic AI and Unknown are
 *      always zero ad spend.
 *   6. NO PII. Inputs are a PII-safe evidence projection (presence sentinels
 *      for click IDs, host-only referrer, path-only landing, normalized
 *      tokens). This module never sees names / emails / raw click IDs.
 */

import {
  classifyAcquisition,
  canonicalChannelToLabel,
  type AcquisitionInputs,
  type AcquisitionLabel,
  type AcquisitionConfidence,
} from "./acquisitionClassifier";

// ── Taxonomy ────────────────────────────────────────────────────────────────

/** The four exclusive top-level categories. Unknown is always separate. */
export type ChannelCategory = "paid_media" | "organic" | "organic_ai" | "unknown";

/** Leaf channel names. Each belongs to exactly one category (see CHANNEL_LEAF_CATEGORY). */
export type ChannelLeaf =
  | "Google Ads"
  | "Other Paid Media"
  | "Organic Search"
  | "Direct"
  | "Referral"
  | "Other Organic"
  | "ChatGPT"
  | "Perplexity"
  | "Gemini"
  | "Copilot"
  | "Claude"
  | "Other AI"
  | "Unknown / Unattributed";

/** Confidence surfaced to the attribution-quality summary. */
export type ChannelConfidence = "verified" | "strong" | "weak" | "unknown";

/** Category render order. */
export const CHANNEL_CATEGORIES: ChannelCategory[] = [
  "paid_media",
  "organic",
  "organic_ai",
  "unknown",
];

/**
 * Leaf render order per category. "Google Ads" is the only built-out Paid
 * Media child; "Other Paid Media" is an extensibility catch-all that the UI
 * only surfaces when it has orders (see aggregateChannelContribution →
 * `hasVolume`). This keeps "Paid Media == Google Ads" true whenever no
 * non-Google paid order exists, while never mis-filing a paid order into
 * Organic / Unknown.
 */
export const CHANNEL_LEAVES: Record<ChannelCategory, ChannelLeaf[]> = {
  paid_media: ["Google Ads", "Other Paid Media"],
  organic: ["Organic Search", "Direct", "Referral", "Other Organic"],
  organic_ai: ["ChatGPT", "Perplexity", "Gemini", "Copilot", "Claude", "Other AI"],
  unknown: ["Unknown / Unattributed"],
};

/** Reverse lookup: leaf → its category. */
export const CHANNEL_LEAF_CATEGORY: Record<ChannelLeaf, ChannelCategory> = (() => {
  const m = {} as Record<ChannelLeaf, ChannelCategory>;
  (Object.keys(CHANNEL_LEAVES) as ChannelCategory[]).forEach((cat) => {
    CHANNEL_LEAVES[cat].forEach((leaf) => {
      m[leaf] = cat;
    });
  });
  return m;
})();

/**
 * The one and only mapping from the canonical classifier's 25 leaf labels
 * onto the Channel Contribution taxonomy. "Direct / Unknown" is intentionally
 * ABSENT — it is resolved by the Direct-vs-Unknown split in
 * classifyPaidOrderChannel (a canonical channel of literal `direct` → Direct;
 * otherwise → Unknown / Unattributed).
 */
export const ACQUISITION_LABEL_TO_CHANNEL: Record<
  Exclude<AcquisitionLabel, "Direct / Unknown">,
  { category: ChannelCategory; leaf: ChannelLeaf }
> = {
  // Paid Media — verified paid platforms.
  "Google Ads":       { category: "paid_media", leaf: "Google Ads" },
  "Facebook Paid":    { category: "paid_media", leaf: "Other Paid Media" },
  "Microsoft Ads":    { category: "paid_media", leaf: "Other Paid Media" },
  "Bing Ads":         { category: "paid_media", leaf: "Other Paid Media" },
  "Yahoo Ads":        { category: "paid_media", leaf: "Other Paid Media" },
  "AOL Ads":          { category: "paid_media", leaf: "Other Paid Media" },
  // Organic — search engines.
  "Google Organic":   { category: "organic", leaf: "Organic Search" },
  "Bing Organic":     { category: "organic", leaf: "Organic Search" },
  "Yahoo Organic":    { category: "organic", leaf: "Organic Search" },
  "AOL Organic":      { category: "organic", leaf: "Organic Search" },
  // Organic — external non-search referrers.
  "Referral":         { category: "organic", leaf: "Referral" },
  // Organic — other non-paid, non-AI social / email. (Note: a bare ttclid
  // paid-TikTok click is rare and unspent in TEST/LIVE; the classifier folds
  // paid + organic TikTok into one leaf, so it lands here — see task doc.)
  "Facebook Organic": { category: "organic", leaf: "Other Organic" },
  "Instagram":        { category: "organic", leaf: "Other Organic" },
  "Reddit":           { category: "organic", leaf: "Other Organic" },
  "TikTok":           { category: "organic", leaf: "Other Organic" },
  "Email Recovery":   { category: "organic", leaf: "Other Organic" },
  // Organic AI — named assistants.
  "ChatGPT":          { category: "organic_ai", leaf: "ChatGPT" },
  "Perplexity":       { category: "organic_ai", leaf: "Perplexity" },
  "Gemini":           { category: "organic_ai", leaf: "Gemini" },
  "Copilot":          { category: "organic_ai", leaf: "Copilot" },
  "Claude":           { category: "organic_ai", leaf: "Claude" },
  // Organic AI — other identifiable assistants.
  "Poe":              { category: "organic_ai", leaf: "Other AI" },
  "You.com":          { category: "organic_ai", leaf: "Other AI" },
  "Phind":            { category: "organic_ai", leaf: "Other AI" },
};

// ── PII-safe order evidence (the RPC projection shape) ───────────────────────

/**
 * One paid order's PII-safe attribution evidence + canonical money, as
 * returned by get_channel_contribution_orders. Click-ID fields are presence
 * sentinels ("present" | null) — never real click IDs. `referrer_host` is a
 * bare host, `landing_path` a path with no query, `referred_by` a normalized
 * token. Money is canonical USD dollars, pre-computed server-side.
 */
export interface ChannelOrderEvidence {
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  ref?: string | null;
  referred_by?: string | null;
  referrer_host?: string | null;
  landing_path?: string | null;
  canonical_channel?: string | null;
  gross_usd?: number | null;
  refund_usd?: number | null;
  provider_usd?: number | null;
}

export interface ChannelClassification {
  category: ChannelCategory;
  leaf: ChannelLeaf;
  confidence: ChannelConfidence;
  /** PII-safe reason codes describing which signals were used. */
  evidence: string[];
}

// Internal / self referrers must not count as external Referral acquisition —
// mirrors attributionResolver's "Internal same-domain" downgrade. Stripped
// before the classifier sees them so a self-referral degrades to Direct/Unknown.
const INTERNAL_REFERRER_SUFFIXES = ["pawtenant.com", "vercel.app", "vercel.com"];

function isInternalReferrerHost(host: string | null | undefined): boolean {
  const h = (host ?? "").trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  return INTERNAL_REFERRER_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`) || h.endsWith(s));
}

function mapConfidence(c: AcquisitionConfidence): ChannelConfidence {
  return c === "high" ? "verified" : c === "medium" ? "strong" : "weak";
}

const norm = (v: string | null | undefined): string => (v ?? "").toString().trim().toLowerCase();

/** The PII-safe list of signal names present on an evidence row (for the audit summary). */
function presentSignals(ev: ChannelOrderEvidence): string[] {
  const s: string[] = [];
  if (norm(ev.gclid)) s.push("gclid");
  if (norm(ev.gbraid)) s.push("gbraid");
  if (norm(ev.wbraid)) s.push("wbraid");
  if (norm(ev.fbclid)) s.push("fbclid");
  if (norm(ev.msclkid)) s.push("msclkid");
  if (norm(ev.ttclid)) s.push("ttclid");
  if (norm(ev.utm_source)) s.push("utm_source");
  if (norm(ev.utm_medium)) s.push("utm_medium");
  if (norm(ev.referrer_host)) s.push("referrer");
  if (norm(ev.referred_by)) s.push("referred_by");
  if (norm(ev.canonical_channel)) s.push("canonical_channel");
  return s;
}

/**
 * Classify ONE paid order into exactly one leaf channel + parent category.
 *
 * Precedence is inherited verbatim from classifyAcquisition (verified paid
 * click ID → AI → search → social → referral → nothing), so stronger verified
 * evidence always wins over weaker signals. Two additions on top:
 *   • Canonical-channel gap-fill: if raw signals yield "Direct / Unknown" but
 *     the server-written canonical channel names a real channel (the analytics
 *     feed sometimes lacks click IDs), adopt the canonical label.
 *   • Direct-vs-Unknown split: a remaining "Direct / Unknown" becomes Direct
 *     ONLY when the canonical channel is the literal `direct` (a positive
 *     Direct signal); otherwise it is Unknown / Unattributed — missing or
 *     merely weak/contradictory evidence never becomes Direct.
 */
export function classifyPaidOrderChannel(ev: ChannelOrderEvidence): ChannelClassification {
  const referrerHost = norm(ev.referrer_host);
  const referrer = referrerHost && !isInternalReferrerHost(referrerHost) ? referrerHost : null;

  const inputs: AcquisitionInputs = {
    utm_source: ev.utm_source ?? null,
    utm_medium: ev.utm_medium ?? null,
    gclid: ev.gclid ?? null,
    gbraid: ev.gbraid ?? null,
    wbraid: ev.wbraid ?? null,
    fbclid: ev.fbclid ?? null,
    msclkid: ev.msclkid ?? null,
    ttclid: ev.ttclid ?? null,
    ref: ev.ref ?? null,
    referred_by: ev.referred_by ?? null,
    referrer,
    landing_url: ev.landing_path ?? null,
  };

  const c = classifyAcquisition(inputs);
  let label: AcquisitionLabel = c.label;

  // Canonical-channel gap-fill for otherwise-unresolved rows.
  if (label === "Direct / Unknown") {
    const canon = canonicalChannelToLabel(ev.canonical_channel);
    if (canon && canon !== "Direct / Unknown") label = canon;
  }

  const signals = presentSignals(ev);

  if (label === "Direct / Unknown") {
    if (norm(ev.canonical_channel) === "direct") {
      return {
        category: "organic",
        leaf: "Direct",
        confidence: "strong",
        evidence: ["canonical_channel=direct"],
      };
    }
    return {
      category: "unknown",
      leaf: "Unknown / Unattributed",
      confidence: "unknown",
      evidence: signals.length ? signals : ["no_attribution_signal"],
    };
  }

  const mapped = ACQUISITION_LABEL_TO_CHANNEL[label];
  return {
    category: mapped.category,
    leaf: mapped.leaf,
    confidence: mapConfidence(c.confidence),
    evidence: signals.length ? signals : [c.reasoning],
  };
}

// ── Financial aggregation ────────────────────────────────────────────────────

export interface ChannelMetrics {
  paidOrders: number;
  grossCharged: number;
  refunds: number;
  netRevenue: number;
  providerPayments: number;
  contributionBeforeStripeAndSpend: number;
  adSpend: number;
  netAfterAdSpendBeforeStripe: number;
  /** Ratios are null (not NaN/Infinity) when their denominator is non-positive. */
  averageOrderValue: number | null;
  refundRate: number | null;
  contributionMargin: number | null;
  paidOrderShare: number | null;
  netRevenueShare: number | null;
}

export interface ChannelLeafRow extends ChannelMetrics {
  leaf: ChannelLeaf;
  category: ChannelCategory;
  /** True when this leaf has any paid order — drives conditional rendering of catch-all leaves. */
  hasVolume: boolean;
}

export interface ChannelCategoryRow extends ChannelMetrics {
  category: ChannelCategory;
  children: ChannelLeafRow[];
}

export interface AttributionQuality {
  paidOrders: number;
  verified: number;
  strong: number;
  weak: number;
  unknown: number;
  /** Percent (0–100) of paid orders that are Unknown / Unattributed. */
  unknownPct: number;
  /** Percent (0–100) of paid orders with verified or strong attribution. */
  attributedPct: number;
}

export interface ChannelContributionResult {
  categories: ChannelCategoryRow[];
  total: ChannelMetrics;
  quality: AttributionQuality;
  reconciliation: {
    balanced: boolean;
    /** Absolute drift between Σ category and the grand total (should be ~0). */
    paidOrdersDelta: number;
    grossDelta: number;
    refundsDelta: number;
    netRevenueDelta: number;
    providerDelta: number;
  };
}

/** Ratio helper — returns null (never NaN/Infinity) unless the denominator is > 0. */
function safeRatio(numer: number, denom: number): number | null {
  return denom > 0 ? numer / denom : null;
}

/** Round to cents to absorb floating-point drift in reconciliation checks. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface BaseAccum {
  paidOrders: number;
  grossCharged: number;
  refunds: number;
  providerPayments: number;
  adSpend: number;
}

function emptyAccum(): BaseAccum {
  return { paidOrders: 0, grossCharged: 0, refunds: 0, providerPayments: 0, adSpend: 0 };
}

const numOr0 = (v: number | null | undefined): number => (typeof v === "number" && isFinite(v) ? v : 0);

/**
 * Derive the full metric set for a node from its base sums + the totals it is
 * a share of. Ratios are computed from the summed base amounts (never averaged
 * from children). Contribution is signed: a channel whose provider cost + ad
 * spend exceed its net revenue stays negative.
 */
function deriveMetrics(base: BaseAccum, totalPaidOrders: number, totalNetRevenue: number): ChannelMetrics {
  const grossCharged = round2(base.grossCharged);
  const refunds = round2(base.refunds);
  const providerPayments = round2(base.providerPayments);
  const adSpend = round2(base.adSpend);
  const netRevenue = round2(grossCharged - refunds);
  const contributionBeforeStripeAndSpend = round2(netRevenue - providerPayments);
  const netAfterAdSpendBeforeStripe = round2(contributionBeforeStripeAndSpend - adSpend);
  return {
    paidOrders: base.paidOrders,
    grossCharged,
    refunds,
    netRevenue,
    providerPayments,
    contributionBeforeStripeAndSpend,
    adSpend,
    netAfterAdSpendBeforeStripe,
    averageOrderValue: safeRatio(grossCharged, base.paidOrders),
    // Refund rate is defined as refund $ ÷ gross charged $ (documented choice).
    refundRate: safeRatio(refunds, grossCharged),
    // Contribution margin = contribution (before Stripe + spend) ÷ net revenue.
    contributionMargin: safeRatio(contributionBeforeStripeAndSpend, netRevenue),
    paidOrderShare: safeRatio(base.paidOrders, totalPaidOrders),
    netRevenueShare: safeRatio(netRevenue, totalNetRevenue),
  };
}

export interface AggregateOptions {
  /** Synced Google Ads spend (USD) for the window — assigned to the Google Ads leaf only. */
  googleAdsSpendUsd?: number | null;
}

/**
 * Classify + fold a set of paid-order evidence rows into the full Channel
 * Contribution tree. Guarantees (verified by the guard):
 *   • every row lands in exactly one leaf (exclusive, exhaustive partition);
 *   • each category total === Σ of its children;
 *   • the grand total === Σ of all categories (+ Unknown), so parent rows and
 *     the company total reconcile by construction;
 *   • ad spend appears only on Google Ads / Paid Media.
 */
export function aggregateChannelContribution(
  rows: ChannelOrderEvidence[],
  opts: AggregateOptions = {},
): ChannelContributionResult {
  const googleAdsSpend = numOr0(opts.googleAdsSpendUsd);

  const leafBase = new Map<ChannelLeaf, BaseAccum>();
  const quality: AttributionQuality = {
    paidOrders: 0, verified: 0, strong: 0, weak: 0, unknown: 0, unknownPct: 0, attributedPct: 0,
  };

  for (const row of rows) {
    const cls = classifyPaidOrderChannel(row);
    const acc = leafBase.get(cls.leaf) ?? emptyAccum();
    acc.paidOrders += 1;
    acc.grossCharged += numOr0(row.gross_usd);
    acc.refunds += numOr0(row.refund_usd);
    acc.providerPayments += numOr0(row.provider_usd);
    leafBase.set(cls.leaf, acc);

    quality.paidOrders += 1;
    quality[cls.confidence] += 1;
  }

  // Ad spend attaches to Google Ads only.
  {
    const acc = leafBase.get("Google Ads") ?? emptyAccum();
    acc.adSpend += googleAdsSpend;
    if (googleAdsSpend !== 0 || leafBase.has("Google Ads")) leafBase.set("Google Ads", acc);
  }

  // Grand-total base sums (single source for share denominators).
  const totalBase = emptyAccum();
  for (const acc of leafBase.values()) {
    totalBase.paidOrders += acc.paidOrders;
    totalBase.grossCharged += acc.grossCharged;
    totalBase.refunds += acc.refunds;
    totalBase.providerPayments += acc.providerPayments;
    totalBase.adSpend += acc.adSpend;
  }
  const totalNetRevenue = totalBase.grossCharged - totalBase.refunds;
  const total = deriveMetrics(totalBase, totalBase.paidOrders, totalNetRevenue);

  // Build category rows from their leaves (canonical order).
  const categories: ChannelCategoryRow[] = CHANNEL_CATEGORIES.map((category) => {
    const catBase = emptyAccum();
    const children: ChannelLeafRow[] = CHANNEL_LEAVES[category].map((leaf) => {
      const acc = leafBase.get(leaf) ?? emptyAccum();
      catBase.paidOrders += acc.paidOrders;
      catBase.grossCharged += acc.grossCharged;
      catBase.refunds += acc.refunds;
      catBase.providerPayments += acc.providerPayments;
      catBase.adSpend += acc.adSpend;
      return {
        leaf,
        category,
        hasVolume: acc.paidOrders > 0,
        ...deriveMetrics(acc, totalBase.paidOrders, totalNetRevenue),
      };
    });
    return {
      category,
      children,
      ...deriveMetrics(catBase, totalBase.paidOrders, totalNetRevenue),
    };
  });

  // Reconciliation — Σ category vs grand total (must be ~0; float-tolerant).
  const sumCat = categories.reduce(
    (a, c) => ({
      paidOrders: a.paidOrders + c.paidOrders,
      grossCharged: a.grossCharged + c.grossCharged,
      refunds: a.refunds + c.refunds,
      netRevenue: a.netRevenue + c.netRevenue,
      providerPayments: a.providerPayments + c.providerPayments,
    }),
    { paidOrders: 0, grossCharged: 0, refunds: 0, netRevenue: 0, providerPayments: 0 },
  );
  const paidOrdersDelta = Math.abs(sumCat.paidOrders - total.paidOrders);
  const grossDelta = Math.abs(round2(sumCat.grossCharged - total.grossCharged));
  const refundsDelta = Math.abs(round2(sumCat.refunds - total.refunds));
  const netRevenueDelta = Math.abs(round2(sumCat.netRevenue - total.netRevenue));
  const providerDelta = Math.abs(round2(sumCat.providerPayments - total.providerPayments));
  const balanced =
    paidOrdersDelta === 0 &&
    grossDelta <= 0.01 &&
    refundsDelta <= 0.01 &&
    netRevenueDelta <= 0.01 &&
    providerDelta <= 0.01;

  quality.unknownPct = quality.paidOrders > 0 ? round2((quality.unknown / quality.paidOrders) * 100) : 0;
  quality.attributedPct =
    quality.paidOrders > 0
      ? round2(((quality.verified + quality.strong) / quality.paidOrders) * 100)
      : 0;

  return {
    categories,
    total,
    quality,
    reconciliation: { balanced, paidOrdersDelta, grossDelta, refundsDelta, netRevenueDelta, providerDelta },
  };
}

// ── Display metadata (whitelisted remixicon classes only) ────────────────────

export const CHANNEL_CATEGORY_META: Record<
  ChannelCategory,
  { label: string; icon: string; accent: string; blurb: string }
> = {
  paid_media: {
    label: "Paid Media",
    icon: "ri-megaphone-line",
    accent: "text-rose-600",
    blurb: "Verified paid advertising clicks.",
  },
  organic: {
    label: "Organic",
    icon: "ri-leaf-line",
    accent: "text-emerald-600",
    blurb: "Search, direct, referral & other non-paid traffic.",
  },
  organic_ai: {
    label: "Organic AI",
    icon: "ri-brain-line",
    accent: "text-indigo-600",
    blurb: "Visits referred by AI assistants (ChatGPT, etc.).",
  },
  unknown: {
    label: "Unknown / Unattributed",
    icon: "ri-question-line",
    accent: "text-gray-500",
    blurb: "Paid orders with no reliable acquisition signal.",
  },
};

export const CHANNEL_LEAF_META: Record<ChannelLeaf, { icon: string }> = {
  "Google Ads":           { icon: "ri-google-line" },
  "Other Paid Media":     { icon: "ri-advertisement-line" },
  "Organic Search":       { icon: "ri-search-2-line" },
  "Direct":               { icon: "ri-cursor-line" },
  "Referral":             { icon: "ri-share-forward-line" },
  "Other Organic":        { icon: "ri-group-line" },
  "ChatGPT":              { icon: "ri-openai-line" },
  "Perplexity":           { icon: "ri-questionnaire-line" },
  "Gemini":               { icon: "ri-gemini-line" },
  "Copilot":              { icon: "ri-microsoft-line" },
  "Claude":               { icon: "ri-sparkling-2-line" },
  "Other AI":             { icon: "ri-magic-line" },
  "Unknown / Unattributed": { icon: "ri-question-line" },
};
