/**
 * SmartInsightsPanel — owner-friendly "what to do next" cards.
 *
 * Read-only. UI-only. NEVER throws, NEVER blocks the page. All hooks live
 * at the top of the component before any return — no conditional hooks.
 *
 * Reads existing data only:
 *   • orders (paid, in scope window) — for Growth, Channel, Recovery
 *   • visitor_sessions               — for conversion-rate denominator
 *   • channel_performance view       — for channel volume
 *   • funnel_summary view            — for biggest funnel drop
 *   • analytics_roi_summary view     — for spend / CPA / ROI
 *   • landing_page_performance view  — for page opportunities
 *   • communications (seq_*)         — for recovery insight
 *
 * NO technical terms shown to the owner: no "attribution_json", no
 * "RPC", no "CAPI", no "gclid". Only plain English + a clear action.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  analyticsScopeRange,
  bucketOwnerChannel,
  OWNER_CHANNEL_LABEL,
  type OwnerChannel,
} from "./analyticsScope";

// ─────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────

interface PaidOrder {
  price: number | string | null;
  gclid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  attribution_json: Record<string, unknown> | null;
  last_touch_json: Record<string, unknown> | null;
}

interface FunnelRow {
  total_sessions:    number | null;
  assessment_step_1: number | null;
  assessment_step_2: number | null;
  assessment_step_3: number | null;
  payment_attempted: number | null;
  orders_completed:  number | null;
}

interface RoiRow {
  channel:        string | null;
  campaign_name:  string | null;
  spend:          number | string | null;
  orders:         number | null;
  revenue:        number | string | null;
  cost_per_order: number | string | null;
  roi:            number | string | null;
}

interface LandingRow {
  landing_url:     string | null;
  sessions:        number | null;
  orders:          number | null;
  conversion_rate: number | string | null;
}

interface CommsRow {
  slug:   string | null;
  status: string | null;
}

interface InsightCard {
  tone: "emerald" | "red" | "amber" | "blue" | "gray";
  icon: string;
  title: string;
  explanation: string;
  action: string;
}

const TONE_CLASS: Record<InsightCard["tone"], { box: string; iconBg: string; iconFg: string; title: string }> = {
  emerald: { box: "bg-emerald-50 border-emerald-200", iconBg: "bg-emerald-100", iconFg: "text-emerald-600", title: "text-emerald-900" },
  red:     { box: "bg-red-50 border-red-200",         iconBg: "bg-red-100",     iconFg: "text-red-600",     title: "text-red-900" },
  amber:   { box: "bg-amber-50 border-amber-200",     iconBg: "bg-amber-100",   iconFg: "text-amber-600",   title: "text-amber-900" },
  blue:    { box: "bg-sky-50 border-sky-200",         iconBg: "bg-sky-100",     iconFg: "text-sky-600",     title: "text-sky-900" },
  gray:    { box: "bg-gray-50 border-gray-200",       iconBg: "bg-gray-100",    iconFg: "text-gray-500",    title: "text-gray-800" },
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function pct(prev: number, next: number): number {
  if (!Number.isFinite(prev) || prev <= 0) return NaN;
  return (next / prev) * 100;
}

function fallbackCard(title: string, icon: string): InsightCard {
  return {
    tone: "gray",
    icon,
    title,
    explanation: "Need more data — capture more sessions and orders first.",
    action: "Re-check this card once a few hundred sessions and a paid campaign run.",
  };
}

// Friendly stage label for recovery slugs.
const STAGE_LABEL: Record<string, string> = {
  seq_30min:           "30-minute email",
  seq_24h:             "24-hour email",
  seq_48h:             "48-hour email",
  seq_3day:            "3-day email",
  seq_5day:            "5-day email",
  seq_sms_stage1:      "first SMS",
  seq_sms_stage2:      "mid-stage SMS",
  seq_sms_stage_final: "final SMS",
};

const FUNNEL_LABEL: Record<string, string> = {
  total_sessions:    "visitors",
  assessment_step_1: "assessment start",
  assessment_step_2: "the middle of the assessment",
  assessment_step_3: "the final step",
  payment_attempted: "payment",
  orders_completed:  "completed orders",
};

const FUNNEL_STAGE_ACTION: Record<string, string> = {
  "total_sessions→assessment_step_1":
    "Improve the homepage hero, primary CTA, and trust signals — most visitors leave before starting.",
  "assessment_step_1→assessment_step_2":
    "Trim Step 1 questions or clarify the value — users start but quit early.",
  "assessment_step_2→assessment_step_3":
    "Review Step 2 (personal info) — pricing surprise or form length is likely the cause.",
  "assessment_step_3→payment_attempted":
    "Make pricing and payment options clearer at checkout — users reach checkout but don't try to pay.",
  "payment_attempted→orders_completed":
    "Investigate payment failures (declined cards, 3-D Secure, Klarna eligibility).",
};

// ─────────────────────────────────────────────────────────────────────────
// Insight builders — pure functions wrapped at call site by tryBuild.
// ─────────────────────────────────────────────────────────────────────────

function tryBuild(title: string, icon: string, fn: () => InsightCard): InsightCard {
  try {
    return fn();
  } catch {
    return fallbackCard(title, icon);
  }
}

// 1. GROWTH INSIGHT
//    Are paid orders growing? Is one channel dominating?
function buildGrowthInsight(paidOrders: PaidOrder[], totalRevenue: number): InsightCard {
  if (paidOrders.length === 0) return fallbackCard("Growth Insight", "ri-line-chart-line");

  // Bucket paid orders into owner channels and find dominant channel by share.
  const counts: Record<OwnerChannel, number> = { google_ads: 0, facebook_meta: 0, seo_referral: 0, direct_unknown: 0 };
  for (const o of paidOrders) {
    const aj = o?.attribution_json ?? null;
    const lt = o?.last_touch_json  ?? null;
    const channel =
      (typeof aj?.channel === "string" && aj.channel) ||
      (typeof lt?.channel === "string" && lt.channel) ||
      null;
    const refer =
      (typeof aj?.referrer === "string" && aj.referrer) ||
      (typeof lt?.referrer === "string" && lt.referrer) ||
      null;
    const bucket = bucketOwnerChannel({
      channel,
      utm_source: o?.utm_source,
      utm_medium: o?.utm_medium,
      gclid: o?.gclid,
      fbclid: o?.fbclid,
      referrer: refer,
    });
    counts[bucket] += 1;
  }
  const total = paidOrders.length;
  const ranked = (Object.entries(counts) as Array<[OwnerChannel, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) return fallbackCard("Growth Insight", "ri-line-chart-line");

  const [topKey, topCount] = ranked[0];
  const topShare = (topCount / total) * 100;

  if (topShare >= 50) {
    return {
      tone: "emerald",
      icon: "ri-line-chart-line",
      title: "Growth Insight",
      explanation: `${OWNER_CHANNEL_LABEL[topKey]} is driving most paid orders (${topShare.toFixed(0)}% of ${total.toLocaleString()} orders, $${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue).`,
      action: "Keep budget steady or increase slowly. Don't change what's working.",
    };
  }

  return {
    tone: "blue",
    icon: "ri-line-chart-line",
    title: "Growth Insight",
    explanation: `Paid orders are spread across channels — ${OWNER_CHANNEL_LABEL[topKey]} leads with ${topShare.toFixed(0)}%.`,
    action: "Test a small budget increase on the leading channel before scaling everything.",
  };
}

// 2. FUNNEL PROBLEM
//    Largest drop in the funnel.
function buildFunnelProblem(funnel: FunnelRow | null): InsightCard {
  if (!funnel) return fallbackCard("Funnel Problem", "ri-error-warning-line");

  const steps: Array<keyof FunnelRow> = [
    "total_sessions", "assessment_step_1", "assessment_step_2",
    "assessment_step_3", "payment_attempted", "orders_completed",
  ];
  let worst = { fromKey: "", toKey: "", drop: 0, survival: 0 };
  for (let i = 1; i < steps.length; i++) {
    const prev = num(funnel[steps[i - 1]]);
    const next = num(funnel[steps[i]]);
    if (prev <= 0) continue;
    const survival = (next / prev) * 100;
    const drop = 100 - survival;
    if (drop > worst.drop) worst = { fromKey: steps[i - 1], toKey: steps[i], drop, survival };
  }
  if (!worst.fromKey) return fallbackCard("Funnel Problem", "ri-error-warning-line");

  const fromLbl = FUNNEL_LABEL[worst.fromKey] ?? worst.fromKey;
  const toLbl   = FUNNEL_LABEL[worst.toKey]   ?? worst.toKey;
  const action  = FUNNEL_STAGE_ACTION[`${worst.fromKey}→${worst.toKey}`] ?? "Investigate this step in the customer journey.";

  return {
    tone: "red",
    icon: "ri-error-warning-line",
    title: "Funnel Problem",
    explanation: `Most customers drop between ${fromLbl} and ${toLbl} — only ${worst.survival.toFixed(0)}% advance.`,
    action,
  };
}

// 3. CHANNEL RECOMMENDATION
//    Is a campaign losing money? Is one printing money?
function buildChannelRecommendation(roi: RoiRow[]): InsightCard {
  if (!roi || roi.length === 0) return fallbackCard("Channel Recommendation", "ri-advertisement-line");

  // Losing campaigns: spend > 0, ROI ≤ -50%.
  const losers = roi
    .filter((r) => num(r?.spend) > 0 && Number.isFinite(num(r?.roi)) && num(r?.roi) <= -50)
    .sort((a, b) => num(a?.roi) - num(b?.roi));
  if (losers.length > 0) {
    const w = losers[0];
    return {
      tone: "red",
      icon: "ri-pause-circle-line",
      title: "Channel Recommendation",
      explanation: `Campaign "${w.campaign_name ?? "—"}" is losing money — spent $${num(w.spend).toFixed(0)} and earned much less back.`,
      action: "Pause this campaign or rework the ad creative before adding more budget.",
    };
  }

  // Winning campaigns: ROI ≥ 50%, ≥3 orders.
  const winners = roi
    .filter((r) => Number.isFinite(num(r?.roi)) && num(r?.roi) >= 50 && num(r?.orders) >= 3)
    .sort((a, b) => num(b?.roi) - num(a?.roi));
  if (winners.length > 0) {
    const top = winners[0];
    return {
      tone: "emerald",
      icon: "ri-funds-line",
      title: "Channel Recommendation",
      explanation: `Campaign "${top.campaign_name ?? "—"}" is profitable — ${num(top.orders).toLocaleString()} orders with strong return.`,
      action: "Increase budget on this campaign in small steps and watch performance for two weeks.",
    };
  }

  // Otherwise: blended view.
  const totalSpend  = roi.reduce((a, r) => a + num(r?.spend), 0);
  const totalOrders = roi.reduce((a, r) => a + num(r?.orders), 0);
  if (totalSpend === 0) {
    return {
      tone: "blue",
      icon: "ri-advertisement-line",
      title: "Channel Recommendation",
      explanation: "No paid spend recorded yet for the reporting period.",
      action: "Connect ad-spend data so this card can recommend where to invest.",
    };
  }
  if (totalOrders === 0) {
    return {
      tone: "amber",
      icon: "ri-advertisement-line",
      title: "Channel Recommendation",
      explanation: `Spent $${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })} but no orders attributed yet.`,
      action: "Check campaign targeting and landing-page match before adding budget.",
    };
  }
  const cpa = totalSpend / totalOrders;
  return {
    tone: "blue",
    icon: "ri-advertisement-line",
    title: "Channel Recommendation",
    explanation: `Average cost per order is $${cpa.toFixed(2)} across ${totalOrders.toLocaleString()} orders.`,
    action: "Compare this against your target CPA. If high, tighten audience or improve landing pages.",
  };
}

// 4. RECOVERY INSIGHT
//    Are recovery emails / SMS bringing leads back?
function buildRecoveryInsight(comms: CommsRow[]): InsightCard {
  if (!comms || comms.length === 0) return fallbackCard("Recovery Insight", "ri-mail-send-line");

  const counts: Record<string, { sent: number; failed: number }> = {};
  let totalSent = 0;
  let totalFailed = 0;
  for (const c of comms) {
    const slug = (c?.slug ?? "").toLowerCase();
    if (!slug.startsWith("seq_")) continue;
    if (!counts[slug]) counts[slug] = { sent: 0, failed: 0 };
    if (c?.status === "sent")    { counts[slug].sent    += 1; totalSent    += 1; }
    else if (c?.status === "failed") { counts[slug].failed += 1; totalFailed += 1; }
  }
  if (totalSent === 0 && totalFailed === 0) return fallbackCard("Recovery Insight", "ri-mail-send-line");

  const ranked = Object.entries(counts).sort((a, b) => b[1].sent - a[1].sent);
  const [topSlug, topCounts] = ranked[0];
  const friendly = STAGE_LABEL[topSlug] ?? topSlug;

  if (totalFailed > totalSent && totalFailed >= 5) {
    return {
      tone: "amber",
      icon: "ri-mail-send-line",
      title: "Recovery Insight",
      explanation: `${totalFailed.toLocaleString()} recovery messages failed to send recently — more than the ${totalSent.toLocaleString()} that succeeded.`,
      action: "Check email/SMS provider settings. Recovery delivery looks unhealthy.",
    };
  }

  return {
    tone: "emerald",
    icon: "ri-mail-send-line",
    title: "Recovery Insight",
    explanation: `Recovery is most active at the ${friendly} stage — ${topCounts.sent.toLocaleString()} messages sent.`,
    action: "Keep the recovery sequence active and review which discount code converts best.",
  };
}

// 5. PAGE OPPORTUNITY
//    A page with traffic but few/no orders.
function buildPageOpportunity(pages: LandingRow[]): InsightCard {
  if (!pages || pages.length === 0) return fallbackCard("Page Opportunity", "ri-window-line");

  const enriched = pages.map((p) => ({
    page: p?.landing_url ?? "",
    sessions: num(p?.sessions),
    orders:   num(p?.orders),
    cr: typeof p?.conversion_rate === "string"
      ? (parseFloat(p.conversion_rate) || 0)
      : num(p?.conversion_rate),
  }));

  // Big traffic, no orders → "Review CTA / trust"
  const stuck = enriched
    .filter((p) => p.sessions >= 50 && p.orders === 0)
    .sort((a, b) => b.sessions - a.sessions)[0];
  if (stuck) {
    return {
      tone: "amber",
      icon: "ri-window-line",
      title: "Page Opportunity",
      explanation: `Page "${displayPath(stuck.page)}" has ${stuck.sessions.toLocaleString()} visits but no orders.`,
      action: "Review the call-to-action and trust signals on this page. The visitors are arriving but not converting.",
    };
  }

  // Strong converter with low traffic → "Send more traffic"
  const undervalued = enriched
    .filter((p) => p.sessions >= 10 && p.sessions < 200 && p.cr >= 5 && p.orders > 0)
    .sort((a, b) => b.cr - a.cr)[0];
  if (undervalued) {
    return {
      tone: "emerald",
      icon: "ri-rocket-2-line",
      title: "Page Opportunity",
      explanation: `Page "${displayPath(undervalued.page)}" converts at ${undervalued.cr.toFixed(1)}% but only gets ${undervalued.sessions.toLocaleString()} visits.`,
      action: "Send more traffic to this page through ads or SEO — it's converting better than your average.",
    };
  }

  return fallbackCard("Page Opportunity", "ri-window-line");
}

function displayPath(raw: string): string {
  if (!raw) return "—";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return u.pathname || "/";
    }
  } catch { /* not a URL */ }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export default function SmartInsightsPanel() {
  const [loading, setLoading] = useState(true);
  const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [funnel, setFunnel] = useState<FunnelRow | null>(null);
  const [roi, setRoi] = useState<RoiRow[]>([]);
  const [pages, setPages] = useState<LandingRow[]>([]);
  const [comms, setComms] = useState<CommsRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const { fromIso } = analyticsScopeRange();

    const [ordersRes, funnelRes, roiRes, pagesRes, commsRes] = await Promise.all([
      supabase.from("orders")
        .select("price, gclid, fbclid, utm_source, utm_medium, attribution_json, last_touch_json")
        .not("payment_intent_id", "is", null)
        .not("status", "in", "(\"refunded\",\"cancelled\",\"archived\")")
        .gte("created_at", fromIso),
      supabase.from("funnel_summary").select("*").maybeSingle(),
      supabase.from("analytics_roi_summary").select("*"),
      supabase.from("landing_page_performance").select("*"),
      supabase.from("communications")
        .select("slug, status, created_at")
        .like("slug", "seq_%")
        .gte("created_at", fromIso),
    ]).then((arr) => arr).catch(() => [
      { data: [] }, { data: null }, { data: [] }, { data: [] }, { data: [] },
    ] as const);

    const orders = (ordersRes?.data ?? []) as PaidOrder[];
    setPaidOrders(orders);
    setRevenue(orders.reduce((a, r) => a + num(r?.price), 0));
    setFunnel((funnelRes?.data ?? null) as FunnelRow | null);
    setRoi((roiRes?.data ?? []) as RoiRow[]);
    setPages((pagesRes?.data ?? []) as LandingRow[]);
    setComms((commsRes?.data ?? []) as CommsRow[]);

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Plain const — NOT useMemo. Each builder wrapped in tryBuild so a bad
  // row downgrades a single card to "Need more data" instead of crashing.
  const cards: InsightCard[] = [
    tryBuild("Growth Insight",        "ri-line-chart-line",       () => buildGrowthInsight(paidOrders, revenue)),
    tryBuild("Funnel Problem",        "ri-error-warning-line",    () => buildFunnelProblem(funnel)),
    tryBuild("Channel Recommendation","ri-advertisement-line",    () => buildChannelRecommendation(roi)),
    tryBuild("Recovery Insight",      "ri-mail-send-line",        () => buildRecoveryInsight(comms)),
    tryBuild("Page Opportunity",      "ri-window-line",           () => buildPageOpportunity(pages)),
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-orange-400 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading insights…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((card, i) => {
        const cls = TONE_CLASS[card.tone];
        return (
          <div key={i} className={`rounded-2xl border p-4 flex flex-col ${cls.box}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${cls.iconBg} ${cls.iconFg}`}>
                <i className={`${card.icon} text-base`}></i>
              </span>
              <p className={`text-sm font-extrabold leading-tight ${cls.title}`}>{card.title}</p>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">{card.explanation}</p>
            <div className="mt-2 pt-2 border-t border-white/60">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-0.5">Recommended action</p>
              <p className="text-xs font-semibold text-gray-800 leading-relaxed">{card.action}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
