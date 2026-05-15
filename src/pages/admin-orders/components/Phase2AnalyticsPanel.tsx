/**
 * Phase2AnalyticsPanel — Owner-mode admin analytics (safe v2).
 *
 * Reads four SQL views populated by the Phase 1 / Phase 3 tracking pipeline:
 *   • public.funnel_summary             (single-row funnel counts)
 *   • public.channel_performance        (sessions/orders/CR per channel)
 *   • public.landing_page_performance   (sessions/orders/CR per landing_url)
 *   • public.analytics_roi_summary      (Phase 3 — spend ↔ attribution rollup)
 *
 * No writes. No checkout interaction. No tracking code. Read-only UI.
 *
 * Layout:
 *   1. Owner Summary       — 4 plain-English insight cards
 *   2. Growth Dashboard    — ROI + Funnel health (compact, 2-col on desktop)
 *   3. Detailed Data       — Channel + Landing tables, top-5 + "Show all"
 *
 * MODES:
 *   "all"          — render everything
 *   "acquisition"  — owner-mode layout (1 + 2 + 3)
 *   "funnel"       — funnel only (used by AnalyticsTab Section 2)
 *
 * SAFETY NOTES (post-revert hardening):
 *   - All hooks are at the TOP of the component, before any early return,
 *     so the hook count is identical on every render.
 *   - Insight builders are pure functions wrapped per-call in try/catch so a
 *     bad row can never crash the panel.
 *   - All sort comparators NaN-guard.
 *   - Dual-fetch (Phase 1 views + Phase 3 ROI view) keeps Phase-1-only
 *     databases working: ROI view absence becomes a friendly card, not a
 *     fatal error.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelRow {
  total_sessions:     number | null;
  assessment_step_1:  number | null;
  assessment_step_2:  number | null;
  assessment_step_3:  number | null;
  payment_attempted:  number | null;
  orders_completed:   number | null;
}

interface ChannelRow {
  channel:         string | null;
  sessions:        number | null;
  orders:          number | null;
  conversion_rate: number | string | null;
}

interface LandingRow {
  landing_url:     string | null;
  sessions:        number | null;
  orders:          number | null;
  conversion_rate: number | string | null;
}

interface RoiRow {
  campaign_name:   string | null;
  channel:         string | null;
  spend:           number | string | null;
  sessions:        number | null;
  orders:          number | null;
  revenue:         number | string | null;
  cost_per_order:  number | string | null;
  roi:             number | string | null;
}

export type Phase2PanelMode =
  | "all"
  | "acquisition"
  | "funnel"
  | "owner-summary"   // Section 1 — only the 4 plain-English insight cards
  | "marketing"       // Section 3 — Ad Spend & ROI + Channel performance
  | "pages-geo";      // Section 5 — Landing-page table only

interface Phase2AnalyticsPanelProps {
  mode?: Phase2PanelMode;
  // Optional date / channel scope for the events-table funnel (Phase 3D).
  // When BOTH dateFromIso and dateToIso are provided, the funnel rows come
  // from public.events (COUNT DISTINCT session_id per event_name) inside
  // that window, optionally filtered by ownerChannel. When omitted, the
  // existing public.funnel_summary view is used (legacy global counts).
  dateFromIso?: string | null;
  dateToIso?: string | null;
  ownerChannel?: "all" | "google_ads" | "facebook_meta" | "seo_referral" | "direct_unknown" | null;
}

// ── Phase 3D — events-table funnel loader ────────────────────────────────────
// Replaces the legacy funnel_summary view with COUNT DISTINCT session_id per
// event_name from public.events, scoped by date window and (optional) owner
// channel bucket. Channel mapping aligns with analyticsScope.bucketOwnerChannel:
//   google_ads     → props->>channel = 'google_ads'
//   facebook_meta  → props->>channel = 'facebook_ads'
//   seo_referral   → props->>channel IN ('organic_search','social_organic')
//   direct_unknown → props->>channel = 'direct' OR props->>channel IS NULL
//
// Distinct counting happens client-side because PostgREST has no COUNT DISTINCT.
// At current TEST volumes (~hundreds of events) this is fine; at production
// scale this should move behind a single funnel_from_events RPC.
async function loadEventsFunnel(opts: {
  fromIso: string;
  toIso: string;
  ownerChannel?: string | null;
}): Promise<FunnelRow> {
  type Row = { session_id: string | null };
  type RowsRes = { data: Row[] | null; error: { message: string } | null };

  const applyChannel = <Q extends { eq: (...a: unknown[]) => Q; or: (s: string) => Q }>(q: Q): Q => {
    const c = opts.ownerChannel;
    if (!c || c === "all") return q;
    if (c === "google_ads")     return q.eq("props->>channel", "google_ads");
    if (c === "facebook_meta")  return q.eq("props->>channel", "facebook_ads");
    if (c === "seo_referral")   return q.or("props->>channel.eq.organic_search,props->>channel.eq.social_organic");
    if (c === "direct_unknown") return q.or("props->>channel.eq.direct,props->>channel.is.null");
    return q;
  };

  const eventQuery = (eventName: string) => {
    const q = supabase
      .from("events")
      .select("session_id")
      .eq("event_name", eventName)
      .gte("created_at", opts.fromIso)
      .lte("created_at", opts.toIso)
      .not("session_id", "is", null);
    return applyChannel(q as unknown as { eq: (...a: unknown[]) => typeof q; or: (s: string) => typeof q }) as unknown as Promise<RowsRes>;
  };

  const stepQuery = (step: 1 | 2 | 3) => {
    const q = supabase
      .from("events")
      .select("session_id")
      .eq("event_name", "assessment_step_view")
      .filter("props->>step", "eq", String(step))
      .gte("created_at", opts.fromIso)
      .lte("created_at", opts.toIso)
      .not("session_id", "is", null);
    return applyChannel(q as unknown as { eq: (...a: unknown[]) => typeof q; or: (s: string) => typeof q }) as unknown as Promise<RowsRes>;
  };

  const [pv, s1, s2, s3, pa, ps] = await Promise.all([
    eventQuery("page_view"),
    stepQuery(1),
    stepQuery(2),
    stepQuery(3),
    eventQuery("payment_attempted"),
    eventQuery("payment_success"),
  ]);

  const distinct = (res: RowsRes): number => {
    if (res?.error) return 0;
    const ids = (res?.data ?? []).map((r) => r.session_id).filter((s): s is string => !!s);
    return new Set(ids).size;
  };

  return {
    total_sessions:    distinct(pv),
    assessment_step_1: distinct(s1),
    assessment_step_2: distinct(s2),
    assessment_step_3: distinct(s3),
    payment_attempted: distinct(pa),
    orders_completed:  distinct(ps),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Static config
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_STEPS: Array<{ key: keyof FunnelRow; label: string }> = [
  { key: "total_sessions",    label: "Sessions" },
  { key: "assessment_step_1", label: "Assessment Start" },
  { key: "assessment_step_2", label: "Mid Assessment" },
  { key: "assessment_step_3", label: "Final Step" },
  { key: "payment_attempted", label: "Payment Attempt" },
  { key: "orders_completed",  label: "Completed Orders" },
];

const STEP_INSIGHTS: Record<string, string> = {
  "Sessions→Assessment Start":
    "Most users are not starting the assessment. This usually indicates low trust, unclear CTA, page mismatch, or weak above-the-fold messaging.",
  "Assessment Start→Mid Assessment":
    "Users start but quit early. Step 1 questions may feel intrusive or confusing — consider trimming, clarifying value, or adding progress feedback.",
  "Mid Assessment→Final Step":
    "Mid-assessment is the bleed point. Look at Step 2 (personal info) — pricing surprise, form length, or required fields are common culprits.",
  "Final Step→Payment Attempt":
    "Users reach checkout but don't try to pay. Check pricing clarity, plan-selection UX, payment-method mix, and any blocking validation errors.",
  "Payment Attempt→Completed Orders":
    "Payments are being attempted but not succeeding. Investigate Stripe failures (declined cards, 3DS), Klarna eligibility, or webhook delays.",
};

const LANDING_PATH_BLOCKLIST: RegExp[] = [
  /^\/admin($|\/|-)/i,
  /^\/provider($|\/|-)/i,
  /^\/account($|\/|-)/i,
  /^\/\.well-known($|\/)/i,
  /^\/my-orders($|\/)/i,
  /^\/customer-login($|\/)/i,
  /^\/reset-password($|\/)/i,
  /^\/admin-login($|\/)/i,
  /^\/company($|\/)/i,
];

const TONE_CLASS: Record<string, string> = {
  red:     "bg-red-50 text-red-700 border-red-200",
  amber:   "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  gray:    "bg-gray-50 text-gray-600 border-gray-200",
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (NaN-safe, never throw)
// ─────────────────────────────────────────────────────────────────────────────

function extractPath(raw: string): string {
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return "__BLOCK_HOST__";
      return u.pathname || "/";
    }
  } catch { /* not a URL */ }
  return raw;
}

function isMeaningfulLandingUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const path = extractPath(raw);
  if (!path) return false;
  if (path === "__BLOCK_HOST__") return false;
  return !LANDING_PATH_BLOCKLIST.some((re) => re.test(path));
}

function fmtPct(num: number | string | null | undefined, digits = 2): string {
  if (num == null || num === "") return "—";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function pctRatio(prev: number, next: number, digits = 1): { value: number; display: string } {
  if (!Number.isFinite(prev) || prev <= 0) return { value: NaN, display: "—" };
  const v = (next / prev) * 100;
  return { value: v, display: `${v.toFixed(digits)}%` };
}

function safeNum(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toNumber(v: number | string | null | undefined): number {
  if (v == null || v === "") return NaN;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : NaN;
}

/** NaN-safe descending comparator that won't blow up V8/Safari sorts. */
function descNum(a: number, b: number): number {
  const aa = Number.isFinite(a) ? a : -Infinity;
  const bb = Number.isFinite(b) ? b : -Infinity;
  if (aa < bb) return 1;
  if (aa > bb) return -1;
  return 0;
}
function ascNum(a: number, b: number): number {
  const aa = Number.isFinite(a) ? a :  Infinity;
  const bb = Number.isFinite(b) ? b :  Infinity;
  if (aa < bb) return -1;
  if (aa > bb) return  1;
  return 0;
}

function fmtUsd(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUsdOrDash(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRoi(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function suggestLandingAction(sessions: number, orders: number, cr: number): { label: string; tone: "red" | "amber" | "emerald" | "gray" } {
  if (sessions === 0) return { label: "Needs more data or CRO review", tone: "gray" };
  if (orders === 0 && sessions >= 50) return { label: "Review trust / CTA — high traffic, no orders", tone: "red" };
  if (orders === 0) return { label: "Needs more data or CRO review", tone: "gray" };
  if (sessions < 20 && cr >= 5) return { label: "Increase traffic — strong converter", tone: "emerald" };
  if (cr < 1) return { label: "Below 1% — review CRO", tone: "amber" };
  return { label: "Healthy — monitor", tone: "emerald" };
}

function channelLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  const v = raw.trim().toLowerCase();
  if (v === "facebook_ads")   return "Facebook / IG Ads";
  if (v === "google_ads")     return "Google Ads";
  if (v === "organic_search") return "Organic Search";
  if (v === "social_organic") return "Social (Organic)";
  if (v === "direct")         return "Direct";
  if (v === "tiktok_ads")     return "TikTok Ads";
  return raw;
}

// ── Channel icon mapping ───────────────────────────────────────────────────
// Uses Remix-Icon glyphs already loaded in index.html. Returns a small
// branded badge that pairs with channelLabel(). NaN-safe — unknown channels
// fall back to a neutral globe icon.
function channelIconKey(raw: string | null | undefined): "google_ads" | "facebook_ads" | "organic_search" | "social_organic" | "direct" | "tiktok_ads" | "other" {
  if (!raw) return "other";
  const v = raw.trim().toLowerCase();
  if (v === "google_ads" || v === "facebook_ads" || v === "organic_search" || v === "social_organic" || v === "direct" || v === "tiktok_ads") return v;
  return "other";
}

const CHANNEL_ICON_CLASS: Record<string, { icon: string; bg: string; fg: string }> = {
  google_ads:     { icon: "ri-google-fill",          bg: "bg-orange-50",  fg: "text-orange-500" },
  facebook_ads:   { icon: "ri-facebook-circle-fill", bg: "bg-blue-50",    fg: "text-[#1877F2]"  },
  organic_search: { icon: "ri-search-2-line",        bg: "bg-emerald-50", fg: "text-emerald-600" },
  social_organic: { icon: "ri-share-forward-fill",   bg: "bg-violet-50",  fg: "text-violet-600" },
  direct:         { icon: "ri-cursor-fill",          bg: "bg-gray-100",   fg: "text-gray-600"   },
  tiktok_ads:     { icon: "ri-tiktok-fill",          bg: "bg-gray-100",   fg: "text-gray-900"   },
  other:          { icon: "ri-global-line",          bg: "bg-gray-50",    fg: "text-gray-400"   },
};

function ChannelIcon({ channel, size = "sm" }: { channel: string | null | undefined; size?: "xs" | "sm" }) {
  const cls = CHANNEL_ICON_CLASS[channelIconKey(channel)] ?? CHANNEL_ICON_CLASS.other;
  const dim = size === "xs" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs";
  return (
    <span className={`inline-flex items-center justify-center rounded-md ${cls.bg} ${cls.fg} ${dim} flex-shrink-0`}>
      <i className={cls.icon}></i>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight builders — each wrapped by tryBuild() at call site so any throw
// becomes a "Capture more data" gray card instead of a panel crash.
// ─────────────────────────────────────────────────────────────────────────────

interface InsightCard {
  tone: "emerald" | "red" | "amber" | "blue" | "gray";
  icon: string;
  title: string;
  headline: string;
  detail: string;
}

const FALLBACK_CARD: (title: string) => InsightCard = (title) => ({
  tone: "gray",
  icon: "ri-time-line",
  title,
  headline: "Not enough data",
  detail: "Capture more sessions and re-check.",
});

function tryBuild(title: string, fn: () => InsightCard): InsightCard {
  try {
    return fn();
  } catch {
    return FALLBACK_CARD(title);
  }
}

function buildBestChannel(channels: ChannelRow[]): InsightCard {
  const ranked = (channels ?? [])
    .filter((c) => safeNum(c?.orders) > 0)
    .map((c) => ({
      label: channelLabel(c.channel),
      orders: safeNum(c.orders),
      sessions: safeNum(c.sessions),
      cr: typeof c.conversion_rate === "string"
        ? (parseFloat(c.conversion_rate) || 0)
        : safeNum(c.conversion_rate as number),
    }))
    .sort((a, b) => descNum(a.orders, b.orders) || descNum(a.cr, b.cr));
  if (ranked.length === 0) return FALLBACK_CARD("Best channel");
  const top = ranked[0];
  return {
    tone: "emerald",
    icon: "ri-trophy-line",
    title: "Best channel",
    headline: top.label,
    detail: `${top.orders.toLocaleString()} orders from ${top.sessions.toLocaleString()} sessions (${top.cr.toFixed(2)}% CR).`,
  };
}

function buildBiggestLeak(funnel: FunnelRow | null): InsightCard {
  if (!funnel) return FALLBACK_CARD("Biggest leak");
  const counts = FUNNEL_STEPS.map((s) => ({
    label: s.label,
    value: safeNum(funnel[s.key] as number | null),
  }));
  type T = { fromLabel: string; toLabel: string; survival: number; drop: number; key: string };
  const transitions: T[] = [];
  for (let i = 1; i < counts.length; i++) {
    const prev = counts[i - 1].value;
    const next = counts[i].value;
    if (prev <= 0) continue;
    const survival = (next / prev) * 100;
    transitions.push({
      fromLabel: counts[i - 1].label,
      toLabel: counts[i].label,
      survival,
      drop: 100 - survival,
      key: `${counts[i - 1].label}→${counts[i].label}`,
    });
  }
  if (transitions.length === 0) return FALLBACK_CARD("Biggest leak");
  const biggest = transitions.slice().sort((a, b) => descNum(a.drop, b.drop))[0];
  return {
    tone: "red",
    icon: "ri-error-warning-line",
    title: "Biggest leak",
    headline: `${biggest.fromLabel} → ${biggest.toLabel}`,
    detail: `${biggest.drop.toFixed(1)}% drop — only ${biggest.survival.toFixed(1)}% advance. ${STEP_INSIGHTS[biggest.key] ?? ""}`,
  };
}

function buildBestCampaignOrPage(roi: RoiRow[], pages: LandingRow[]): InsightCard {
  const profitable = (roi ?? [])
    .filter((r) => Number.isFinite(toNumber(r?.roi)) && toNumber(r.roi) > 0 && safeNum(r.orders) > 0)
    .sort((a, b) => descNum(toNumber(a.roi), toNumber(b.roi)));
  if (profitable.length > 0) {
    const top = profitable[0];
    return {
      tone: "emerald",
      icon: "ri-rocket-2-line",
      title: "Best campaign",
      headline: top.campaign_name ?? "—",
      detail: `${channelLabel(top.channel)} · ${safeNum(top.orders).toLocaleString()} orders · ROI ${fmtRoi(top.roi)}.`,
    };
  }
  const filtered = (pages ?? [])
    .filter((p) => isMeaningfulLandingUrl(p?.landing_url) && safeNum(p?.orders) > 0)
    .map((p) => ({
      page: extractPath(p.landing_url ?? ""),
      sessions: safeNum(p.sessions),
      orders: safeNum(p.orders),
      cr: typeof p.conversion_rate === "string"
        ? (parseFloat(p.conversion_rate) || 0)
        : safeNum(p.conversion_rate as number),
    }))
    .filter((p) => p.sessions >= 10)
    .sort((a, b) => descNum(a.cr, b.cr));
  if (filtered.length > 0) {
    const top = filtered[0];
    return {
      tone: "emerald",
      icon: "ri-rocket-2-line",
      title: "Best page",
      headline: top.page,
      detail: `${top.orders.toLocaleString()} orders from ${top.sessions.toLocaleString()} sessions (${top.cr.toFixed(2)}% CR).`,
    };
  }
  return FALLBACK_CARD("Best campaign / page");
}

function buildRecommendation(
  funnel: FunnelRow | null,
  roi: RoiRow[],
  channels: ChannelRow[],
  pages: LandingRow[],
): InsightCard {
  // Losing campaigns
  const losers = (roi ?? [])
    .filter((r) => Number.isFinite(toNumber(r?.spend)) && toNumber(r.spend) > 0
                && Number.isFinite(toNumber(r?.roi)) && toNumber(r.roi) <= -50)
    .sort((a, b) => ascNum(toNumber(a.roi), toNumber(b.roi)));
  if (losers.length > 0) {
    const worst = losers[0];
    return {
      tone: "red",
      icon: "ri-pause-circle-line",
      title: "Recommended action",
      headline: `Pause ${worst.campaign_name ?? "campaign"}`,
      detail: `${channelLabel(worst.channel)} — spend ${fmtUsd(worst.spend)} returned ROI ${fmtRoi(worst.roi)}. Pause or rework before adding more budget.`,
    };
  }

  // Winning campaigns
  const winners = (roi ?? [])
    .filter((r) => Number.isFinite(toNumber(r?.roi)) && toNumber(r.roi) > 50 && safeNum(r.orders) >= 3)
    .sort((a, b) => descNum(toNumber(a.roi), toNumber(b.roi)));
  if (winners.length > 0) {
    const top = winners[0];
    return {
      tone: "emerald",
      icon: "ri-funds-line",
      title: "Recommended action",
      headline: `Scale ${top.campaign_name ?? "campaign"}`,
      detail: `${channelLabel(top.channel)} — ROI ${fmtRoi(top.roi)} on ${safeNum(top.orders).toLocaleString()} orders. Increase budget incrementally.`,
    };
  }

  // Undervalued page
  const undervalued = (pages ?? [])
    .filter((p) => isMeaningfulLandingUrl(p?.landing_url))
    .map((p) => ({
      page: extractPath(p.landing_url ?? ""),
      sessions: safeNum(p.sessions),
      orders: safeNum(p.orders),
      cr: typeof p.conversion_rate === "string"
        ? (parseFloat(p.conversion_rate) || 0)
        : safeNum(p.conversion_rate as number),
    }))
    .filter((p) => p.sessions >= 10 && p.sessions < 200 && p.cr >= 5 && p.orders > 0)
    .sort((a, b) => descNum(a.cr, b.cr))[0];
  if (undervalued) {
    return {
      tone: "blue",
      icon: "ri-arrow-up-line",
      title: "Recommended action",
      headline: `Send traffic to ${undervalued.page}`,
      detail: `Strong converter (${undervalued.cr.toFixed(2)}% CR) but only ${undervalued.sessions.toLocaleString()} sessions. SEO + ads can amplify it.`,
    };
  }

  // Funnel-based fallback
  if (funnel) {
    const sessions   = safeNum(funnel.total_sessions);
    const step1      = safeNum(funnel.assessment_step_1);
    const payAttempt = safeNum(funnel.payment_attempted);
    const orders     = safeNum(funnel.orders_completed);

    if (sessions > 0 && step1 / Math.max(sessions, 1) < 0.10) {
      return {
        tone: "amber",
        icon: "ri-pencil-ruler-2-line",
        title: "Recommended action",
        headline: "Improve homepage CTA",
        detail: `Only ${((step1 / sessions) * 100).toFixed(1)}% of visitors start the assessment. Tighten hero, value prop, and primary CTA.`,
      };
    }
    if (payAttempt > 5 && orders / Math.max(payAttempt, 1) < 0.6) {
      return {
        tone: "amber",
        icon: "ri-bank-card-line",
        title: "Recommended action",
        headline: "Investigate payment failures",
        detail: `Payment success rate is ${((orders / payAttempt) * 100).toFixed(1)}%. Review Stripe declines, 3DS issues, and Klarna eligibility.`,
      };
    }
  }

  // High-traffic-no-orders channel fallback
  const noOrderHighSession = (channels ?? [])
    .map((c) => ({ label: channelLabel(c?.channel), sessions: safeNum(c?.sessions), orders: safeNum(c?.orders) }))
    .filter((c) => c.orders === 0 && c.sessions >= 100)
    .sort((a, b) => descNum(a.sessions, b.sessions))[0];
  if (noOrderHighSession) {
    return {
      tone: "amber",
      icon: "ri-search-eye-line",
      title: "Recommended action",
      headline: `Review ${noOrderHighSession.label}`,
      detail: `${noOrderHighSession.sessions.toLocaleString()} sessions but no orders. Check landing experience, audience match, and CTA.`,
    };
  }

  return {
    tone: "gray",
    icon: "ri-compass-3-line",
    title: "Recommended action",
    headline: "Capture more data",
    detail: "Once a few hundred sessions and at least one paid campaign run, this card surfaces a concrete next move.",
  };
}

const INSIGHT_TONE_CLASS: Record<InsightCard["tone"], { box: string; iconBg: string; iconText: string; headline: string }> = {
  emerald: { box: "bg-emerald-50 border-emerald-200", iconBg: "bg-emerald-100", iconText: "text-emerald-600", headline: "text-emerald-900" },
  red:     { box: "bg-red-50 border-red-200",         iconBg: "bg-red-100",     iconText: "text-red-600",     headline: "text-red-900" },
  amber:   { box: "bg-amber-50 border-amber-200",     iconBg: "bg-amber-100",   iconText: "text-amber-600",   headline: "text-amber-900" },
  blue:    { box: "bg-sky-50 border-sky-200",         iconBg: "bg-sky-100",     iconText: "text-sky-600",     headline: "text-sky-900" },
  gray:    { box: "bg-gray-50 border-gray-200",       iconBg: "bg-gray-100",    iconText: "text-gray-500",    headline: "text-gray-800" },
};

function InsightTile({ card }: { card: InsightCard }) {
  const cls = INSIGHT_TONE_CLASS[card.tone];
  return (
    <div className={`rounded-2xl border p-4 ${cls.box}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${cls.iconBg} ${cls.iconText}`}>
          <i className={`${card.icon} text-base`}></i>
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{card.title}</p>
          <p className={`text-base font-extrabold mt-0.5 leading-tight break-words ${cls.headline}`}>{card.headline}</p>
          <p className="text-[11px] text-gray-700 mt-1 leading-relaxed">{card.detail}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component — all hooks declared at the top, before any early return.
// ─────────────────────────────────────────────────────────────────────────────

export default function Phase2AnalyticsPanel({
  mode = "all",
  dateFromIso = null,
  dateToIso = null,
  ownerChannel = null,
}: Phase2AnalyticsPanelProps) {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [funnel, setFunnel]     = useState<FunnelRow | null>(null);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [pages, setPages]       = useState<LandingRow[]>([]);
  const [roi, setRoi]           = useState<RoiRow[]>([]);
  const [roiUnavailable, setRoiUnavailable] = useState<string | null>(null);
  const [expandRoi, setExpandRoi]           = useState(false);
  const [expandChannels, setExpandChannels] = useState(false);
  const [expandPages, setExpandPages]       = useState(false);

  const showFunnel       = mode === "all" || mode === "funnel";
  const showAcquisition  = mode === "all" || mode === "acquisition";
  const showOwnerOnly    = mode === "owner-summary";
  const showMarketing    = mode === "marketing";
  const showPagesGeo     = mode === "pages-geo";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRoiUnavailable(null);

    // Phase 3D — when both date bounds are provided AND we render the funnel,
    // build funnel rows from public.events (event-name COUNT DISTINCT
    // session_id) instead of the legacy funnel_summary view. Falls back to
    // funnel_summary when props are absent so non-funnel modes / external
    // callers stay unchanged.
    const useEventsFunnel = !!dateFromIso && !!dateToIso && (mode === "all" || mode === "funnel");

    try {
      const [funnelRes, channelRes, landingRes] = await Promise.all([
        useEventsFunnel
          ? loadEventsFunnel({ fromIso: dateFromIso!, toIso: dateToIso!, ownerChannel })
              .then((row) => ({ data: row, error: null as { message: string } | null }))
              .catch((err) => ({ data: null, error: { message: err instanceof Error ? err.message : String(err) } }))
          : supabase.from("funnel_summary").select("*").maybeSingle(),
        supabase.from("channel_performance").select("*"),
        supabase.from("landing_page_performance").select("*"),
      ]);

      if (funnelRes.error)   throw new Error(`funnel: ${funnelRes.error.message}`);
      if (channelRes.error)  throw new Error(`channel_performance: ${channelRes.error.message}`);
      if (landingRes.error)  throw new Error(`landing_page_performance: ${landingRes.error.message}`);

      setFunnel((funnelRes.data ?? null) as FunnelRow | null);
      setChannels((channelRes.data ?? []) as ChannelRow[]);
      setPages((landingRes.data ?? []) as LandingRow[]);

      try {
        const roiRes = await supabase.from("analytics_roi_summary").select("*");
        if (roiRes.error) {
          setRoiUnavailable(roiRes.error.message);
          setRoi([]);
        } else {
          setRoi((roiRes.data ?? []) as RoiRow[]);
        }
      } catch (roiErr) {
        setRoiUnavailable(roiErr instanceof Error ? roiErr.message : String(roiErr));
        setRoi([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFunnel(null);
      setChannels([]);
      setPages([]);
      setRoi([]);
    } finally {
      setLoading(false);
    }
  }, [mode, dateFromIso, dateToIso, ownerChannel]);

  useEffect(() => { void load(); }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-orange-400 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading analytics…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm font-bold text-red-700 mb-1">Could not load analytics</p>
        <p className="text-xs text-red-600 font-mono break-all">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg cursor-pointer"
        >
          <i className="ri-refresh-line"></i> Retry
        </button>
      </div>
    );
  }

  // ── Plain-const derived values (NOT hooks) ────────────────────────────
  const filteredPages = (pages ?? []).filter((p) => isMeaningfulLandingUrl(p?.landing_url));
  const hasFunnelData = !!funnel && Object.values(funnel).some((v) => safeNum(v as number) > 0);

  // Insights — each builder is wrapped in tryBuild() so a malformed row
  // can never crash the panel; worst case we render a gray fallback card.
  const insights: InsightCard[] = [
    tryBuild("Best channel",          () => buildBestChannel(channels)),
    tryBuild("Biggest leak",          () => buildBiggestLeak(funnel)),
    tryBuild("Best campaign / page",  () => buildBestCampaignOrPage(roi, pages)),
    tryBuild("Recommended action",    () => buildRecommendation(funnel, roi, channels, pages)),
  ];

  // ROI totals
  const totals = (roi ?? []).reduce(
    (acc, r) => {
      const spend   = toNumber(r?.spend);
      const revenue = toNumber(r?.revenue);
      acc.spend   += Number.isFinite(spend)   ? spend   : 0;
      acc.revenue += Number.isFinite(revenue) ? revenue : 0;
      acc.orders  += safeNum(r?.orders);
      return acc;
    },
    { spend: 0, revenue: 0, orders: 0 }
  );
  const totalsCpa = totals.orders > 0 ? totals.spend / totals.orders : NaN;
  const totalsRoi = totals.spend  > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : NaN;

  // ── Renderers (plain functions — no hooks inside) ─────────────────────

  const renderFunnel = () => {
    if (!hasFunnelData) {
      return (
        <div className="text-center py-10">
          <i className="ri-bar-chart-line text-gray-200 text-4xl"></i>
          <p className="text-sm text-gray-400 mt-2">No funnel data yet.</p>
        </div>
      );
    }

    const counts = FUNNEL_STEPS.map((s) => ({
      key:   s.key,
      label: s.label,
      value: safeNum(funnel?.[s.key] as number | null),
    }));
    const max = Math.max(...counts.map((c) => c.value), 1);

    type Transition = { idx: number; survival: number; drop: number; validBase: boolean; key: string };
    const transitions: Transition[] = [];
    for (let i = 1; i < counts.length; i++) {
      const prev = counts[i - 1].value;
      const next = counts[i].value;
      const survival = prev > 0 ? (next / prev) * 100 : NaN;
      const drop = Number.isFinite(survival) ? 100 - survival : NaN;
      transitions.push({
        idx: i,
        survival: Number.isFinite(survival) ? survival : 0,
        drop:     Number.isFinite(drop)     ? drop     : 0,
        validBase: prev > 0,
        key: `${counts[i - 1].label}→${counts[i].label}`,
      });
    }
    const validTransitions = transitions.filter((t) => t.validBase);
    const biggest = validTransitions.length > 0
      ? validTransitions.slice().sort((a, b) => descNum(a.drop, b.drop))[0]
      : null;

    const sessions   = safeNum(funnel?.total_sessions);
    const step1      = safeNum(funnel?.assessment_step_1);
    const payAttempt = safeNum(funnel?.payment_attempted);
    const orders     = safeNum(funnel?.orders_completed);

    const sessionToOrder = pctRatio(sessions, orders);
    const startRate      = pctRatio(sessions, step1);
    const paySuccess     = pctRatio(payAttempt, orders);

    return (
      <div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {counts.map((c, idx) => {
            const heightPct = (c.value / max) * 100;
            const inbound = idx > 0 ? transitions[idx - 1] : null;
            const isBiggest = !!biggest && !!inbound && biggest.idx === inbound.idx;
            return (
              <div
                key={c.key}
                className={`rounded-lg border p-3 flex flex-col bg-white ${isBiggest ? "border-red-300 ring-1 ring-red-200" : "border-gray-100"}`}
              >
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold leading-tight">Step {idx + 1}</p>
                <p className="text-[11px] font-bold text-gray-700 mt-0.5 leading-tight">{c.label}</p>
                <div className="mt-2 h-10 w-full bg-gray-50 border border-gray-100 rounded flex items-end overflow-hidden">
                  <div
                    className={`w-full rounded ${isBiggest ? "bg-gradient-to-t from-red-500 to-red-300" : "bg-gradient-to-t from-orange-500 to-orange-300"}`}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                  />
                </div>
                <p className="text-lg font-extrabold text-gray-900 mt-2 tabular-nums leading-tight">{c.value.toLocaleString()}</p>
                {inbound ? (
                  <p className={`text-[10px] mt-0.5 ${isBiggest ? "text-red-500" : "text-gray-400"}`}>
                    {inbound.validBase ? `↓ ${inbound.drop.toFixed(1)}% drop` : "no base"}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-0.5">Top of funnel</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Session → Order</p>
            <p className="text-lg font-extrabold text-gray-900 tabular-nums">{sessionToOrder.display}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Assessment Start Rate</p>
            <p className="text-lg font-extrabold text-gray-900 tabular-nums">{startRate.display}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Payment Success Rate</p>
            <p className="text-lg font-extrabold text-gray-900 tabular-nums">{paySuccess.display}</p>
          </div>
        </div>

        {/* Action callout — biggest drop in plain English */}
        {biggest && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-600 flex-shrink-0">
              <i className="ri-alarm-warning-line text-base"></i>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-red-900">This is where you are losing most customers</p>
              <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                Between <strong>{FUNNEL_STEPS[biggest.idx - 1]?.label ?? "previous step"}</strong> and <strong>{FUNNEL_STEPS[biggest.idx]?.label ?? "next step"}</strong> — only {biggest.survival.toFixed(1)}% advance. Fix this transition first.
              </p>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          <i className="ri-information-line mr-1"></i>
          Percentages may be skewed by legacy orders before tracking was enabled (pre-Phase-1 orders have no session_id).
        </p>
      </div>
    );
  };

  const renderRoiCompact = () => {
    if (roiUnavailable) {
      return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-extrabold text-gray-900">Campaign ROI</h3>
            <p className="text-xs text-gray-500 mt-0.5">Per-campaign spend vs revenue.</p>
          </div>
          <div className="px-5 py-8 text-center">
            <i className="ri-database-2-line text-gray-200 text-4xl"></i>
            <p className="text-sm text-gray-400 mt-2">ROI view not available yet.</p>
            <p className="text-[11px] text-gray-400 mt-1 font-mono break-all">{roiUnavailable}</p>
          </div>
        </div>
      );
    }

    const hasRoi = (roi ?? []).length > 0;
    const visible = expandRoi ? roi : (roi ?? []).slice(0, 5);
    const hiddenCount = Math.max(0, (roi ?? []).length - visible.length);

    return (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Campaign ROI</h3>
            <p className="text-xs text-gray-500 mt-0.5">Plain English: how much each campaign earned vs cost.</p>
          </div>
          {hasRoi && (
            <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
              <span>Spend <strong className="text-gray-800 tabular-nums">{fmtUsd(totals.spend)}</strong></span>
              <span>Revenue <strong className="text-gray-800 tabular-nums">{fmtUsd(totals.revenue)}</strong></span>
              <span>CPA <strong className="text-gray-800 tabular-nums">{Number.isFinite(totalsCpa) ? `$${totalsCpa.toFixed(2)}` : "—"}</strong></span>
              <span>ROI <strong className={`tabular-nums ${Number.isFinite(totalsRoi) ? (totalsRoi >= 0 ? "text-emerald-600" : "text-red-600") : "text-gray-400"}`}>
                {Number.isFinite(totalsRoi) ? fmtRoi(totalsRoi) : "—"}
              </strong></span>
            </div>
          )}
        </div>

        {!hasRoi ? (
          <div className="px-5 py-10 text-center">
            <i className="ri-advertisement-line text-gray-200 text-4xl"></i>
            <p className="text-sm text-gray-400 mt-2">No ROI data yet.</p>
            <p className="text-[11px] text-gray-400 mt-1">Insert spend rows into ad_spend_meta or ad_spend_google to populate this view.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-100">
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Campaign</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Channel</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Spend</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Orders</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Revenue</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Cost / Order</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const roiNum = toNumber(r.roi);
                    const roiTone = !Number.isFinite(roiNum)
                      ? "text-gray-400"
                      : roiNum >= 0 ? "text-emerald-600" : "text-red-600";
                    return (
                      <tr key={`${r.channel}-${r.campaign_name}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="py-2.5 px-4 font-medium text-gray-800">{r.campaign_name ?? "—"}</td>
                        <td className="py-2.5 px-4 text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <ChannelIcon channel={r.channel} />
                            {channelLabel(r.channel)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmtUsdOrDash(r.spend)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{safeNum(r.orders).toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmtUsdOrDash(r.revenue)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmtUsdOrDash(r.cost_per_order)}</td>
                        <td className={`py-2.5 px-4 text-right tabular-nums font-bold ${roiTone}`}>{Number.isFinite(roiNum) ? fmtRoi(roiNum) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpandRoi((v) => !v)}
                className="w-full px-4 py-2 text-[11px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 cursor-pointer border-t border-gray-100"
              >
                {expandRoi ? "Show less" : `Show all ${(roi ?? []).length} campaigns`}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  const renderChannelTable = (compact: boolean) => {
    const hasChannels = (channels ?? []).length > 0;
    if (!hasChannels) {
      return (
        <div className="text-center py-10">
          <i className="ri-pie-chart-line text-gray-200 text-4xl"></i>
          <p className="text-sm text-gray-400 mt-2">No channel data yet.</p>
        </div>
      );
    }

    // ── Aggregate ROI rows by channel for revenue + spend → CPA ──────────
    const roiByChannel: Record<string, { revenue: number; spend: number; orders: number }> = {};
    for (const r of (roi ?? [])) {
      const key = (r?.channel ?? "").trim().toLowerCase();
      if (!key) continue;
      const bucket = roiByChannel[key] ?? { revenue: 0, spend: 0, orders: 0 };
      bucket.revenue += toNumber(r?.revenue) || 0;
      bucket.spend   += toNumber(r?.spend)   || 0;
      bucket.orders  += safeNum(r?.orders);
      roiByChannel[key] = bucket;
    }

    // ── Build merged rows (channel_performance is the spine; ROI fills $) ──
    type Merged = { channel: string | null; orders: number; revenue: number; cpa: number | null };
    const merged: Merged[] = (channels ?? []).map((row) => {
      const key = (row?.channel ?? "").trim().toLowerCase();
      const r = roiByChannel[key];
      const orders = safeNum(row?.orders);
      const revenue = r ? r.revenue : 0;
      const spend   = r ? r.spend   : 0;
      const cpa = orders > 0 && spend > 0 ? spend / orders : null;
      return { channel: row?.channel ?? null, orders, revenue, cpa };
    });

    // ── Best performing channel = highest revenue (ties broken by orders) ──
    const ranked = merged.slice().sort((a, b) => descNum(a.revenue, b.revenue) || descNum(a.orders, b.orders));
    const best = ranked.find((r) => r.orders > 0) ?? null;

    const visible = compact && !expandChannels ? merged.slice(0, 5) : merged;
    const hiddenCount = Math.max(0, merged.length - visible.length);

    return (
      <>
        {best && (
          <div className="px-4 pt-3 pb-2 flex items-start gap-2 bg-emerald-50 border-b border-emerald-100">
            <i className="ri-trophy-line text-emerald-600 text-base mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>Best performing channel:</strong> {channelLabel(best.channel)} — {best.orders.toLocaleString()} orders
              {best.revenue > 0 ? <> · {fmtUsd(best.revenue)} revenue</> : null}.
            </p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Channel</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Orders</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Revenue</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr key={`${row.channel}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="py-2.5 px-4 font-medium text-gray-800">
                    <span className="inline-flex items-center gap-2">
                      <ChannelIcon channel={row.channel} />
                      {channelLabel(row.channel)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{row.orders.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-bold text-gray-800">{fmtUsdOrDash(row.revenue)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {compact && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpandChannels((v) => !v)}
            className="w-full px-4 py-2 text-[11px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 cursor-pointer border-t border-gray-100"
          >
            {expandChannels ? "Show less" : `Show all ${merged.length} channels`}
          </button>
        )}
      </>
    );
  };

  const renderLandingTable = (compact: boolean) => {
    const hasPages = filteredPages.length > 0;
    if (!hasPages) {
      return (
        <div className="text-center py-10">
          <i className="ri-window-line text-gray-200 text-4xl"></i>
          <p className="text-sm text-gray-400 mt-2">No marketing-page data yet.</p>
        </div>
      );
    }

    // ── Page insight rankings ────────────────────────────────────────────
    const enriched = filteredPages.map((p) => {
      const sessions = safeNum(p?.sessions);
      const orders   = safeNum(p?.orders);
      const cr = typeof p?.conversion_rate === "string"
        ? (parseFloat(p.conversion_rate) || 0)
        : safeNum(p?.conversion_rate as number);
      return {
        page: extractPath(p?.landing_url ?? "") || "—",
        sessions, orders, cr,
      };
    });
    const topConverter = enriched
      .filter((p) => p.orders > 0 && p.sessions >= 10)
      .slice()
      .sort((a, b) => descNum(a.cr, b.cr))[0] ?? null;
    const needsImprovement = enriched
      .filter((p) => p.sessions >= 50 && p.orders === 0)
      .slice()
      .sort((a, b) => descNum(a.sessions, b.sessions))[0] ?? null;

    const visible = compact && !expandPages ? filteredPages.slice(0, 5) : filteredPages;
    const hiddenCount = Math.max(0, filteredPages.length - visible.length);
    return (
      <>
        {(topConverter || needsImprovement) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pt-4 pb-1">
            {topConverter && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2">
                  <i className="ri-rocket-2-line text-emerald-600"></i>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">Top converting page</p>
                </div>
                <p className="text-sm font-extrabold text-emerald-900 mt-1 break-all font-mono">{topConverter.page}</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  {topConverter.cr.toFixed(2)}% conversion · {topConverter.orders.toLocaleString()} orders from {topConverter.sessions.toLocaleString()} sessions.
                </p>
              </div>
            )}
            {needsImprovement && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2">
                  <i className="ri-tools-line text-amber-600"></i>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700">Pages to improve</p>
                </div>
                <p className="text-sm font-extrabold text-amber-900 mt-1 break-all font-mono">{needsImprovement.page}</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {needsImprovement.sessions.toLocaleString()} visits but no orders yet — review CTA, trust, or page mismatch.
                </p>
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Page</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Sessions</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Orders</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Conv. Rate</th>
                <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const sessions = safeNum(row.sessions);
                const orders   = safeNum(row.orders);
                const cr = typeof row.conversion_rate === "string" ? (parseFloat(row.conversion_rate) || 0) : safeNum(row.conversion_rate as number);
                const action = suggestLandingAction(sessions, orders, cr);
                return (
                  <tr key={`${row.landing_url}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 text-xs font-mono text-gray-700 break-all">{extractPath(row.landing_url ?? "") || "—"}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{sessions.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{orders.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-bold text-emerald-600">{fmtPct(row.conversion_rate)}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${TONE_CLASS[action.tone]}`}>
                        {action.tone === "red"     && <i className="ri-alarm-warning-line"></i>}
                        {action.tone === "amber"   && <i className="ri-error-warning-line"></i>}
                        {action.tone === "emerald" && <i className="ri-check-line"></i>}
                        {action.tone === "gray"    && <i className="ri-time-line"></i>}
                        {action.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {compact && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpandPages((v) => !v)}
            className="w-full px-4 py-2 text-[11px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 cursor-pointer border-t border-gray-100"
          >
            {expandPages ? "Show less" : `Show all ${filteredPages.length} pages`}
          </button>
        )}
      </>
    );
  };

  // ─── Owner-summary-only mode (Section 1 in unified layout) ────────────
  if (showOwnerOnly) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {insights.map((c, i) => (
          <InsightTile key={i} card={c} />
        ))}
      </div>
    );
  }

  // ─── Marketing mode (Section 3 — ROI + Channel performance) ──────────
  if (showMarketing) {
    return (
      <div className="space-y-4">
        {renderRoiCompact()}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-extrabold text-gray-900">Channel Summary</h3>
            <p className="text-xs text-gray-500 mt-0.5">Aggregate orders, revenue, and CPA per channel (not per campaign).</p>
          </div>
          {renderChannelTable(false)}
        </div>
      </div>
    );
  }

  // ─── Pages & Geo mode (Section 5 — landing-page table only) ──────────
  if (showPagesGeo) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-extrabold text-gray-900">Landing-page performance</h3>
          <p className="text-xs text-gray-500 mt-0.5">Sessions, orders, conversion rate, and suggested action per public marketing page.</p>
        </div>
        {renderLandingTable(true)}
        <p className="px-4 pt-2 pb-3 text-[11px] text-gray-400">
          Filtered to public marketing pages — admin / portal / dev-host paths are excluded.
        </p>
      </div>
    );
  }

  // ─── Funnel-only mode ──────────────────────────────────────────────────
  if (showFunnel && !showAcquisition) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Funnel</h3>
            <p className="text-xs text-gray-500 mt-0.5">How visitors progress from landing to a completed order.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-[11px] font-bold rounded-lg cursor-pointer"
          >
            <i className="ri-refresh-line"></i> Refresh
          </button>
        </div>
        {renderFunnel()}
      </div>
    );
  }

  // ─── Acquisition / "all" mode → owner layout ───────────────────────────
  if (!showAcquisition) return null;

  return (
    <div className="space-y-8">
      {/* 1. Owner Summary */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Owner Summary</h3>
            <p className="text-xs text-gray-500 mt-0.5">What's working, what's broken, and what to do next.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-[11px] font-bold rounded-lg cursor-pointer"
          >
            <i className="ri-refresh-line"></i> Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {insights.map((c, i) => (
            <InsightTile key={i} card={c} />
          ))}
        </div>
      </section>

      {/* 2. Growth Dashboard */}
      <section>
        <div className="mb-3">
          <h3 className="text-sm font-extrabold text-gray-900">Growth Dashboard</h3>
          <p className="text-xs text-gray-500 mt-0.5">Compact view of paid spend, funnel health, and top landing pages.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderRoiCompact()}

          {showFunnel && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="mb-3">
                <h3 className="text-sm font-extrabold text-gray-900">Funnel health</h3>
                <p className="text-xs text-gray-500 mt-0.5">Step-by-step drop-off — biggest leak highlighted in red.</p>
              </div>
              {renderFunnel()}
            </div>
          )}
        </div>
      </section>

      {/* 3. Detailed Data */}
      <section>
        <div className="mb-3 pb-2 border-b border-dashed border-gray-200">
          <h3 className="text-sm font-extrabold text-gray-900">Detailed Data</h3>
          <p className="text-xs text-gray-500 mt-0.5">For ads / SEO team review. Top 5 shown by default — click "Show all" for the full list.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h4 className="text-sm font-extrabold text-gray-900">Channel Summary</h4>
              <p className="text-xs text-gray-500 mt-0.5">Aggregate orders, revenue, and CPA per channel (not per campaign).</p>
            </div>
            {renderChannelTable(true)}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h4 className="text-sm font-extrabold text-gray-900">Landing-page performance</h4>
              <p className="text-xs text-gray-500 mt-0.5">Sessions, orders, conversion rate, and suggested action per page.</p>
            </div>
            {renderLandingTable(true)}
            <p className="px-4 pt-2 pb-3 text-[11px] text-gray-400">
              Filtered to public marketing pages — admin / portal / dev-host paths are excluded.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
