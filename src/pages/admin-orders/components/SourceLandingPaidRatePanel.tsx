// SourceLandingPaidRatePanel — "Conversion Analytics" (consolidated)
//
// ONE clean, category-wise conversion dashboard for Admin → Analytics. It
// replaces the redundant Channel Summary / Traffic Source Breakdown / Campaign
// ROI cards with a single decision-driving surface organised into categories:
//
//   A. Executive Overview          — how is the business doing?
//   B. Acquisition Performance     — which source brings paid customers?
//   C. Landing Page Performance    — which CUSTOMER-FACING first page converts?
//   D. Source × Landing Matrix     — which source + page combo converts?
//   E. Paid Ads ROI                — are Google / Meta ads profitable?
//   F. Keyword / Search Term       — which searches bring paid orders?
//   G. Data Quality / Attribution  — what tracking is broken?
//
// Design / safety:
//   • SELF-CONTAINED. Owns its date range, scoped Supabase fetches, aggregation,
//     loading / empty / error-retry states, and CSV exports.
//   • LAZY. Fetches ONLY after the operator expands the panel (default
//     collapsed) — never on admin boot, never on Analytics-tab open.
//   • Reuses resolveOrderAttribution() + analyticsNormalize helpers so SOURCE
//     and CUSTOMER-FACING landing pages match Orders / CSV export. No invented
//     attribution; blank / admin / internal landings → "Unknown / Not captured".
//   • Paid Ads ROI reads the SAME canonical spend source as Accounts / Payments
//     P&L — the get_marketing_spend_summary RPC (marketing_ad_spend_daily,
//     PKR→USD at the shared FX rate) — for the selected range only; when no
//     spend exists it shows "Spend not connected yet" instead of fake ROI.
//     Never calls ad APIs / edge functions / runs a sync.
//   • ISOLATED FAILURE: any error renders inside the panel; it can never break
//     the Analytics tab or the admin shell.

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  resolveOrderAttribution,
  type ResolvableOrder,
} from "@/lib/attributionResolver";
import {
  groupUnknownLandingPage,
  isCustomerFacingLandingPage,
  isUnidentifiedSource,
  normalizeLandingPage,
  UNKNOWN_LANDING,
  UNKNOWN_SOURCE,
} from "@/lib/analyticsNormalize";
import { isPaidOrder, isRefundedOrder } from "@/lib/analyticsMetrics";
import { fetchMarketingSpendSummary, type MarketingSpendSummary } from "@/lib/companyExpenses";

// ── Row shapes ──────────────────────────────────────────────────────────────
interface PaidRateOrder extends ResolvableOrder {
  id: string;
  created_at?: string | null;
  paid_at?: string | null;
  payment_intent_id?: string | null;
  price?: number | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
  fbclid?: string | null;
}
const ORDER_COLUMNS =
  "id,created_at,paid_at,payment_intent_id,price,refunded_at,refund_amount," +
  "referred_by,landing_url,session_id," +
  "utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,fbclid," +
  "first_touch_json,last_touch_json";
const FETCH_CAP = 20000;

type Preset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "custom";
const PRESET_LABEL: Record<Preset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  this_month: "Current month",
  last_month: "Previous month",
  custom: "Custom",
};

// ── Date range ──────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function resolveRange(preset: Preset, cf: string, ct: string): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "7d": { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to: endOfDay(now) }; }
    case "30d": { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: startOfDay(f), to: endOfDay(now) }; }
    case "this_month": return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f), to: endOfDay(t) };
    }
    case "custom": {
      const f = cf ? startOfDay(new Date(cf + "T00:00:00")) : startOfDay(now);
      const t = ct ? endOfDay(new Date(ct + "T00:00:00")) : endOfDay(now);
      return { from: f, to: t };
    }
    default: return { from: startOfDay(now), to: endOfDay(now) };
  }
}

// ── Format helpers ──────────────────────────────────────────────────────────
const money = (n: number) => "$" + Math.round(n).toLocaleString();
const money2 = (n: number) => "$" + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => (Math.round(n * 10) / 10).toFixed(1) + "%";
const dateLbl = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── Aggregation ─────────────────────────────────────────────────────────────
interface Agg { leads: number; paid: number; revenue: number; netPaid: number; refunds: number; missingLanding: number; missingSource: number; }
const emptyAgg = (): Agg => ({ leads: 0, paid: 0, revenue: 0, netPaid: 0, refunds: 0, missingLanding: 0, missingSource: 0 });
const paidRate = (a: Agg) => (a.leads > 0 ? (a.paid / a.leads) * 100 : 0);
const netPaidRate = (a: Agg) => (a.leads > 0 ? (a.netPaid / a.leads) * 100 : 0);
const refundRate = (a: Agg) => (a.paid > 0 ? (a.refunds / a.paid) * 100 : 0);
const aov = (a: Agg) => (a.netPaid > 0 ? a.revenue / a.netPaid : 0);

interface RRow {
  source: string;
  unknownSource: boolean;
  landingClean: string;       // normalized path ("" if blank)
  landingTable: string;       // customer-facing path or UNKNOWN_LANDING
  landingIsInternal: boolean; // captured but admin/internal
  landingBlank: boolean;
  isPaid: boolean;
  isRefunded: boolean;
  revenue: number;
  hasGclid: boolean;
  hasFbclid: boolean;
  keyword: string;            // captured keyword (or utm_term for paid search)
  matchType: string;
  campaign: string;
}

// csv
function csvEscape(v: unknown): string { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
function downloadCsv(filename: string, header: string[], rows: (string | number)[][], rangeNote: string) {
  const meta = [`"Date range",${csvEscape(rangeNote)}`, ""];
  const csv = [...meta, header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

const PAID_SOURCES_FOR_KEYWORD = new Set(["Google Ads"]);

interface ConversionAnalyticsProps {
  /** Shared global reporting range from AnalyticsTab. When BOTH are provided the
   *  panel is CONTROLLED: it follows this range and hides its own date controls,
   *  so Conversion Analytics never disagrees with the rest of Analytics. */
  globalFrom?: Date | null;
  globalTo?: Date | null;
  globalLabel?: string | null;
}

export default function SourceLandingPaidRatePanel(
  { globalFrom = null, globalTo = null, globalLabel = null }: ConversionAnalyticsProps = {},
) {
  const controlled = !!(globalFrom && globalTo);

  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [rows, setRows] = useState<PaidRateOrder[] | null>(null);
  const [spend, setSpend] = useState<MarketingSpendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [loadedRange, setLoadedRange] = useState<{ from: Date; to: Date } | null>(null);

  const range = useMemo(
    () => (controlled ? { from: globalFrom as Date, to: globalTo as Date } : resolveRange(preset, customFrom, customTo)),
    [controlled, globalFrom, globalTo, preset, customFrom, customTo],
  );
  const rangeNote = controlled && globalLabel ? globalLabel : `${dateLbl(range.from)} to ${dateLbl(range.to)}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = controlled
        ? { from: globalFrom as Date, to: globalTo as Date }
        : resolveRange(preset, customFrom, customTo);
      const fromYMD = toYMD(from);
      const toYMDs = toYMD(to);
      const [ordersRes, spendSummary] = await Promise.all([
        supabase
          .from("orders")
          .select(ORDER_COLUMNS)
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString())
          .order("created_at", { ascending: false })
          .limit(FETCH_CAP),
        // Marketing spend comes from the SAME canonical source as Accounts /
        // Payments P&L: the get_marketing_spend_summary RPC (reads
        // marketing_ad_spend_daily, converts PKR→USD at the shared FX rate).
        // The helper returns null on error / non-accounts-admin so the
        // dashboard degrades gracefully instead of breaking.
        fetchMarketingSpendSummary(fromYMD, toYMDs),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      const list = (ordersRes.data ?? []) as unknown as PaidRateOrder[];
      setRows(list);
      setCapped(list.length >= FETCH_CAP);
      setSpend(spendSummary);
      setLoadedRange({ from, to });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analytics data.");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [controlled, globalFrom, globalTo, preset, customFrom, customTo]);

  const handleExpand = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && rows === null && !loading) void fetchData();
  }, [open, rows, loading, fetchData]);

  // Controlled mode: when the shared global reporting range changes while the
  // panel is open, refetch so Conversion Analytics stays aligned with the rest
  // of the Analytics tab.
  useEffect(() => {
    if (controlled && open) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, globalFrom ? globalFrom.getTime() : 0, globalTo ? globalTo.getTime() : 0]);

  // ── Build model ────────────────────────────────────────────────────────────
  const model = useMemo(() => {
    if (!rows) return null;

    const resolved: RRow[] = rows.map((o) => {
      let source = UNKNOWN_SOURCE;
      let firstPath = "";
      let keyword = "";
      let matchType = "";
      let campaign = "";
      try {
        const r = resolveOrderAttribution(o);
        source = (r.traffic_source_final || "").trim() || UNKNOWN_SOURCE;
        firstPath = r.first_landing_page_path || "";
        keyword = r.keyword || "";
        matchType = r.match_type || "";
        campaign = r.utm_campaign || r.campaign_id || "";
      } catch { /* fall back to Unknown */ }

      const landingClean = normalizeLandingPage(firstPath || o.landing_url);
      const landingBlank = !landingClean;
      const customerFacing = !landingBlank && isCustomerFacingLandingPage(landingClean);
      const landingTable = groupUnknownLandingPage(landingClean);
      const isPaid = isPaidOrder(o);
      const isRefunded = isRefundedOrder(o);
      const price = typeof o.price === "number" ? o.price : 0;
      return {
        source,
        unknownSource: isUnidentifiedSource(source),
        landingClean,
        landingTable,
        landingIsInternal: !landingBlank && !customerFacing,
        landingBlank,
        isPaid,
        isRefunded,
        revenue: isPaid && !isRefunded ? price : 0,
        hasGclid: !!o.gclid,
        hasFbclid: !!o.fbclid,
        keyword,
        matchType,
        campaign,
      };
    });

    const total = emptyAgg();
    const bySource = new Map<string, Agg>();
    const byLanding = new Map<string, Agg>();
    const byMatrix = new Map<string, Agg>();
    const landingSourceMix = new Map<string, Map<string, number>>();

    const bump = (a: Agg, r: RRow) => {
      a.leads += 1;
      if (r.isPaid) a.paid += 1;
      if (r.isPaid && r.isRefunded) a.refunds += 1;
      if (r.isPaid && !r.isRefunded) a.netPaid += 1;
      a.revenue += r.revenue;
      if (r.landingBlank || r.landingIsInternal) a.missingLanding += 1;
      if (r.unknownSource) a.missingSource += 1;
    };
    const into = (m: Map<string, Agg>, key: string, r: RRow) => {
      let a = m.get(key); if (!a) { a = emptyAgg(); m.set(key, a); } bump(a, r);
    };

    for (const r of resolved) {
      bump(total, r);
      into(bySource, r.source, r);
      into(byLanding, r.landingTable, r);
      into(byMatrix, `${r.source}|||${r.landingTable}`, r);
      let mix = landingSourceMix.get(r.landingTable);
      if (!mix) { mix = new Map(); landingSourceMix.set(r.landingTable, mix); }
      mix.set(r.source, (mix.get(r.source) ?? 0) + 1);
    }

    const sourceRows = [...bySource.entries()].map(([source, a]) => ({ source, ...a }))
      .sort((x, y) => y.paid - x.paid || y.revenue - x.revenue);
    const landingRows = [...byLanding.entries()].map(([landing, a]) => {
      const mix = landingSourceMix.get(landing);
      const mixStr = mix ? [...mix.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([sname, c]) => `${sname} ${c}`).join(" · ") : "";
      return { landing, mix: mixStr, ...a };
    }).sort((x, y) => y.paid - x.paid || y.revenue - x.revenue);
    const matrixRows = [...byMatrix.entries()].map(([key, a]) => {
      const [source, landing] = key.split("|||");
      return { source, landing, ...a };
    }).sort((x, y) => y.paid - x.paid || y.revenue - x.revenue);

    const topSource = sourceRows.find((r) => r.paid > 0)?.source ?? "—";
    const topLanding = landingRows.find((r) => r.paid > 0 && r.landing !== UNKNOWN_LANDING)?.landing
      ?? landingRows.find((r) => r.paid > 0)?.landing ?? "—";

    // ── Keyword / search-term (captured on order; Google Ads paid search) ──────
    const byKeyword = new Map<string, Agg>();
    for (const r of resolved) {
      if (!(PAID_SOURCES_FOR_KEYWORD.has(r.source) || r.hasGclid)) continue;
      const k = r.keyword.trim() || "(no keyword captured)";
      into(byKeyword, k, r);
    }
    const keywordRows = [...byKeyword.entries()].map(([keyword, a]) => ({ keyword, ...a }))
      .sort((x, y) => y.paid - x.paid || y.leads - x.leads);

    // ── Spend / ROI ───────────────────────────────────────────────────────────
    // Spend (USD, FX-normalised) comes from the canonical Accounts source — the
    // get_marketing_spend_summary RPC. That source is daily-aggregated only, so
    // per-channel clicks / impressions are not available here (shown as "—").
    const gSpend = { cost: spend?.google_spend_usd ?? 0, clicks: 0, impr: 0 };
    const mSpend = { cost: spend?.meta_spend_usd ?? 0, clicks: 0, impr: 0 };
    const gAgg = bySource.get("Google Ads") ?? emptyAgg();
    const mAgg = bySource.get("Meta Ads") ?? emptyAgg();

    const roiFor = (label: string, sp: { cost: number; clicks: number; impr: number }, a: Agg, connected: boolean) => ({
      label, connected,
      spend: sp.cost, clicks: sp.clicks, impressions: sp.impr,
      revenue: a.revenue, paidOrders: a.paid,
      cpc: sp.clicks > 0 ? sp.cost / sp.clicks : 0,
      ctr: sp.impr > 0 ? (sp.clicks / sp.impr) * 100 : 0,
      cpa: a.paid > 0 ? sp.cost / a.paid : 0,
      roas: sp.cost > 0 ? a.revenue / sp.cost : 0,
      roi: sp.cost > 0 ? ((a.revenue - sp.cost) / sp.cost) * 100 : 0,
      net: a.revenue - sp.cost,
    });
    const roi = {
      google: roiFor("Google Ads", gSpend, gAgg, gSpend.cost > 0),
      meta: roiFor("Meta Ads", mSpend, mAgg, mSpend.cost > 0),
      combined: roiFor("Combined",
        { cost: gSpend.cost + mSpend.cost, clicks: 0, impr: 0 },
        { ...emptyAgg(), revenue: gAgg.revenue + mAgg.revenue, paid: gAgg.paid + mAgg.paid },
        (gSpend.cost + mSpend.cost) > 0),
    };
    const totalSpend = spend?.total_spend_usd ?? (gSpend.cost + mSpend.cost);
    const spendConnected = totalSpend > 0;

    // ── Data quality / attribution gaps ───────────────────────────────────────
    const cnt = (f: (r: RRow) => boolean) => resolved.filter(f).length;
    const dq = {
      total: total.leads,
      missingSource: cnt((r) => r.unknownSource),
      missingLanding: cnt((r) => r.landingBlank),
      internalLanding: cnt((r) => r.landingIsInternal),
      paidMissingLanding: cnt((r) => r.isPaid && (r.landingBlank || r.landingIsInternal)),
      paidUnknownSource: cnt((r) => r.isPaid && r.unknownSource),
      sourceNoLanding: cnt((r) => !r.unknownSource && (r.landingBlank || r.landingIsInternal)),
      landingNoSource: cnt((r) => !r.landingBlank && !r.landingIsInternal && r.unknownSource),
      gAdsNoGclid: cnt((r) => r.source === "Google Ads" && !r.hasGclid),
      metaNoFbclid: cnt((r) => r.source === "Meta Ads" && !r.hasFbclid),
      gAdsNoKeyword: cnt((r) => r.source === "Google Ads" && !r.keyword.trim()),
      gAdsTotal: cnt((r) => r.source === "Google Ads"),
      metaTotal: cnt((r) => r.source === "Meta Ads"),
    };

    // ── Warnings ──────────────────────────────────────────────────────────────
    const warnings: { tone: "warn" | "info"; text: string }[] = [];
    const missLandPct = total.leads ? (dq.missingLanding / total.leads) * 100 : 0;
    if (dq.missingLanding) warnings.push({ tone: missLandPct >= 25 ? "warn" : "info", text: `${pct(missLandPct)} of orders (${dq.missingLanding}/${total.leads}) have no first landing page captured.` });
    if (dq.internalLanding) warnings.push({ tone: "info", text: `${dq.internalLanding} order(s) first landed on an admin/internal page — excluded from landing tables (shown as ${UNKNOWN_LANDING}).` });
    if (dq.paidMissingLanding) warnings.push({ tone: "warn", text: `${dq.paidMissingLanding} paid order(s) have no usable first landing page.` });
    if (dq.paidUnknownSource) warnings.push({ tone: "warn", text: `${dq.paidUnknownSource} paid order(s) have an unknown / direct source.` });
    const meta = bySource.get("Meta Ads");
    if (meta && meta.leads >= 10 && paidRate(meta) < 5) warnings.push({ tone: "warn", text: `Meta Ads has ${meta.leads} leads but only ${pct(paidRate(meta))} paid rate — check targeting / landing match.` });
    if (total.refunds) warnings.push({ tone: refundRate(total) >= 10 ? "warn" : "info", text: `${total.refunds}/${total.paid} paid order(s) refunded (refund rate ${pct(refundRate(total))}). Paid Rate ${pct(paidRate(total))} → Net Paid Rate ${pct(netPaidRate(total))}.` });
    if (!spendConnected) warnings.push({ tone: "info", text: `Ad spend not connected for this range — ROI/CPA/ROAS hidden until Google/Meta spend rows exist.` });

    return {
      total, sourceRows, landingRows, matrixRows, keywordRows,
      topSource, topLanding, roi, totalSpend, spendConnected, dq, warnings, missLandPct,
    };
  }, [rows, spend]);

  // ── CSV exporters ────────────────────────────────────────────────────────────
  const exportSource = useCallback(() => {
    if (!model) return;
    downloadCsv(`source-performance_${preset}.csv`,
      ["Source", "Leads", "Paid Orders", "Paid Rate %", "Net Paid Rate %", "Revenue", "Refunds", "Refund Rate %", "Avg Order Value", "Missing Landing"],
      model.sourceRows.map((r) => [r.source, r.leads, r.paid, paidRate(r).toFixed(1), netPaidRate(r).toFixed(1), Math.round(r.revenue), r.refunds, refundRate(r).toFixed(1), Math.round(aov(r)), r.missingLanding]),
      rangeNote);
  }, [model, preset, rangeNote]);
  const exportLanding = useCallback(() => {
    if (!model) return;
    downloadCsv(`landing-page-performance_${preset}.csv`,
      ["First Landing Page", "Leads", "Paid Orders", "Paid Rate %", "Net Paid Rate %", "Revenue", "Source Mix", "Refunds", "Unknown Source"],
      model.landingRows.map((r) => [r.landing, r.leads, r.paid, paidRate(r).toFixed(1), netPaidRate(r).toFixed(1), Math.round(r.revenue), r.mix, r.refunds, r.missingSource]),
      rangeNote);
  }, [model, preset, rangeNote]);
  const exportMatrix = useCallback(() => {
    if (!model) return;
    downloadCsv(`source-x-landing_${preset}.csv`,
      ["Source", "First Landing Page", "Leads", "Paid Orders", "Paid Rate %", "Net Paid Rate %", "Revenue", "Refunds", "Refund Rate %"],
      model.matrixRows.map((r) => [r.source, r.landing, r.leads, r.paid, paidRate(r).toFixed(1), netPaidRate(r).toFixed(1), Math.round(r.revenue), r.refunds, refundRate(r).toFixed(1)]),
      rangeNote);
  }, [model, preset, rangeNote]);
  const exportKeyword = useCallback(() => {
    if (!model) return;
    downloadCsv(`keyword-performance_${preset}.csv`,
      ["Captured Keyword", "Leads", "Paid Orders", "Paid Rate %", "Revenue"],
      model.keywordRows.map((r) => [r.keyword, r.leads, r.paid, paidRate(r).toFixed(1), Math.round(r.revenue)]),
      rangeNote);
  }, [model, preset, rangeNote]);
  const exportRoi = useCallback(() => {
    if (!model) return;
    downloadCsv(`paid-ads-roi_${preset}.csv`,
      ["Channel", "Connected", "Spend", "Clicks", "Impressions", "CPC", "CTR %", "Paid Orders", "Revenue", "CPA", "ROAS", "ROI %", "Net"],
      [model.roi.google, model.roi.meta, model.roi.combined].map((c) => [c.label, c.connected ? "yes" : "no", c.spend.toFixed(2), c.clicks, c.impressions, c.cpc.toFixed(2), c.ctr.toFixed(1), c.paidOrders, Math.round(c.revenue), c.cpa.toFixed(2), c.roas.toFixed(2), c.roi.toFixed(1), Math.round(c.net)]),
      rangeNote);
  }, [model, preset, rangeNote]);

  const presets: Preset[] = ["today", "yesterday", "7d", "30d", "this_month", "last_month", "custom"];

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button type="button" onClick={handleExpand} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white flex-shrink-0">
          <i className="ri-focus-3-line text-lg"></i>
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-extrabold text-gray-900 tracking-tight">Conversion Analytics</h3>
          <p className="text-xs text-gray-500 mt-0.5">Source, landing page &amp; paid-rate — one decision-driving view (overview · acquisition · landing · matrix · ROI · keywords · data quality).</p>
        </div>
        <i className={`ri-arrow-down-s-line text-xl text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}></i>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-6">
          {/* Date range controls — hidden in CONTROLLED mode (follows global range) */}
          {controlled ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[11px] text-gray-500 inline-flex items-center gap-1.5">
                <i className="ri-calendar-line text-gray-400"></i>
                Follows the global reporting period: <span className="font-bold text-gray-700">{globalLabel ?? rangeNote}</span>
              </p>
              <button type="button" onClick={() => void fetchData()} disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-900 text-white hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5">
                <i className={`ri-refresh-line ${loading ? "animate-spin" : ""}`}></i>{loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <button key={p} type="button" onClick={() => setPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${preset === p ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {PRESET_LABEL[p]}
                </button>
              ))}
              {preset === "custom" && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                  <span className="text-gray-400 text-xs">→</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                </div>
              )}
              <button type="button" onClick={() => void fetchData()} disabled={loading}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-900 text-white hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5">
                <i className={`ri-refresh-line ${loading ? "animate-spin" : ""}`}></i>{loading ? "Loading…" : "Apply"}
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-500 -mt-3">
            Orders created <span className="font-bold text-gray-700">{dateLbl(range.from)} → {dateLbl(range.to)}</span>
            {loadedRange && model ? <> · {model.total.leads} orders</> : null}
            {capped ? <span className="text-amber-600 font-bold"> · capped at {FETCH_CAP}</span> : null}
          </p>

          {loading && <Loader />}
          {!loading && error && <ErrorState message={error} onRetry={() => void fetchData()} />}
          {!loading && !error && model && model.total.leads === 0 && <EmptyState />}

          {!loading && !error && model && model.total.leads > 0 && (
            <>
              {/* A. Executive Overview */}
              <Category letter="A" title="Executive Overview" subtitle="How is the business doing?">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card label="Leads / Orders" value={String(model.total.leads)} />
                  <Card label="Paid Orders" value={String(model.total.paid)} />
                  <Card label="Paid Rate" value={pct(paidRate(model.total))} accent="emerald" />
                  <Card label="Net Paid Rate" value={pct(netPaidRate(model.total))} accent="emerald" />
                  <Card label="Revenue (net of refunds)" value={money(model.total.revenue)} accent="emerald" />
                  <Card label="Avg Order Value" value={money(aov(model.total))} />
                  <Card label="Refund Rate" value={`${model.total.refunds} (${pct(refundRate(model.total))})`} accent={refundRate(model.total) >= 10 ? "amber" : undefined} />
                  <Card label="Marketing Spend" value={model.spendConnected ? money(model.totalSpend) : "Not connected"} small={!model.spendConnected} />
                  {model.spendConnected && <Card label="Net After Marketing" value={money(model.total.revenue - model.totalSpend)} accent="emerald" />}
                  {model.spendConnected && <Card label="Blended ROAS" value={`${(model.total.revenue / model.totalSpend).toFixed(2)}x`} />}
                  {model.spendConnected && <Card label="Blended CPA" value={model.total.paid ? money(model.totalSpend / model.total.paid) : "—"} />}
                  <Card label="Top Source (paid)" value={model.topSource} small />
                  <Card label="Top Landing (paid)" value={model.topLanding} small />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Paid Rate counts refunded orders as conversions (payment completed). Net Paid Rate excludes refunds. Revenue is already net of refunds. CPA/ROAS appear only when real spend exists.</p>
              </Category>

              {/* B. Acquisition Performance */}
              <Category letter="B" title="Acquisition Performance" subtitle="Which source brings leads and paid customers?">
                <Table onExport={exportSource}
                  head={["Source", "Leads", "Paid", "Paid %", "Net %", "Revenue", "Refunds", "Refund %", "AOV", "No LP"]}>
                  {model.sourceRows.map((r) => (
                    <Row key={r.source} highlightFirst cells={[r.source, r.leads, r.paid, pct(paidRate(r)), pct(netPaidRate(r)), money(r.revenue), r.refunds || "—", r.refunds ? pct(refundRate(r)) : "—", money(aov(r)), r.missingLanding || "—"]} />
                  ))}
                  <Total cells={["Total", model.total.leads, model.total.paid, pct(paidRate(model.total)), pct(netPaidRate(model.total)), money(model.total.revenue), model.total.refunds || "—", model.total.refunds ? pct(refundRate(model.total)) : "—", money(aov(model.total)), model.total.missingLanding || "—"]} />
                </Table>
              </Category>

              {/* C. Landing Page Performance (customer-facing only) */}
              <Category letter="C" title="Landing Page Performance" subtitle="Which customer-facing first page produces paid orders? (admin/internal pages excluded)">
                <Table onExport={exportLanding} wideFirst
                  head={["First Landing Page", "Leads", "Paid", "Paid %", "Net %", "Revenue", "Source Mix", "Refunds", "Unk. Src"]}>
                  {model.landingRows.map((r) => (
                    <Row key={r.landing} highlightFirst muteFirst={r.landing === UNKNOWN_LANDING}
                      cells={[r.landing, r.leads, r.paid, pct(paidRate(r)), pct(netPaidRate(r)), money(r.revenue), r.mix || "—", r.refunds || "—", r.missingSource || "—"]} />
                  ))}
                </Table>
              </Category>

              {/* D. Source × Landing Page Matrix */}
              <Category letter="D" title="Source × Landing Page Matrix" subtitle="Which source + first customer-facing page combination converts?">
                <Table onExport={exportMatrix}
                  head={["Source", "First Landing Page", "Leads", "Paid", "Paid %", "Net %", "Revenue", "Refunds"]}>
                  {model.matrixRows.slice(0, 100).map((r, i) => (
                    <Row key={`${r.source}|${r.landing}|${i}`} muteFirst={r.landing === UNKNOWN_LANDING}
                      cells={[r.source, r.landing, r.leads, r.paid, pct(paidRate(r)), pct(netPaidRate(r)), money(r.revenue), r.refunds || "—"]} />
                  ))}
                </Table>
                {model.matrixRows.length > 100 && <p className="px-1 pt-1 text-[11px] text-gray-400">Showing top 100 of {model.matrixRows.length}. Use CSV export for the full list.</p>}
              </Category>

              {/* E. Paid Ads ROI */}
              <Category letter="E" title="Paid Ads ROI" subtitle="Are Google / Meta ads profitable? (uses real spend only)">
                {!model.spendConnected ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
                    <p className="text-sm font-bold text-gray-700">Spend not connected yet</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-lg mx-auto">No Google/Meta spend recorded in the marketing ledger for this range (same source as the Accounts P&amp;L). Revenue from attributed paid orders is still shown below; ROI/CPA/ROAS appear once spend exists for the range. Live on-demand spend is available in Tools → Ad Spend.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-left">
                      <Card label="Google Ads — Paid Orders" value={String(model.roi.google.paidOrders)} small />
                      <Card label="Google Ads — Revenue" value={money(model.roi.google.revenue)} small />
                      <Card label="Meta Ads — Paid Orders" value={String(model.roi.meta.paidOrders)} small />
                      <Card label="Meta Ads — Revenue" value={money(model.roi.meta.revenue)} small />
                    </div>
                  </div>
                ) : (
                  <Table onExport={exportRoi}
                    head={["Channel", "Spend", "Clicks", "Impr.", "CPC", "CTR", "Paid", "Revenue", "CPA", "ROAS", "ROI", "Net"]}>
                    {[model.roi.google, model.roi.meta, model.roi.combined].map((c) => (
                      <Row key={c.label} highlightFirst
                        cells={[c.connected ? c.label : `${c.label} (not connected)`, money(c.spend), c.clicks || "—", c.impressions || "—", c.clicks ? money2(c.cpc) : "—", c.impressions ? pct(c.ctr) : "—", c.paidOrders, money(c.revenue), c.paidOrders ? money(c.cpa) : "—", c.spend ? `${c.roas.toFixed(2)}x` : "—", c.spend ? pct(c.roi) : "—", money(c.net)]} />
                    ))}
                  </Table>
                )}
                <p className="text-[10px] text-gray-400 mt-2">TikTok hidden — no spend data connected. Revenue is from paid orders attributed to each source (resolver), net of refunds.</p>
              </Category>

              {/* F. Keyword / Search Term */}
              <Category letter="F" title="Keyword / Search Term Performance" subtitle="Which searches bring paid orders?">
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-3">
                  <p className="text-[11px] text-blue-800"><b>Captured keyword</b> = the keyword/utm_term carried on the order's final URL (verbatim, never invented). It is the bidded keyword only when Google Ads passes <code>{`{keyword}`}</code> in the final-URL suffix. The actual <b>search term/query</b> a user typed is not on the order — it requires the Google Ads API (search_term_view) and is aggregated, not per-order.</p>
                </div>
                <Table onExport={exportKeyword} wideFirst
                  head={["Captured Keyword", "Leads", "Paid", "Paid %", "Revenue"]}>
                  {model.keywordRows.length === 0 ? (
                    <Row cells={["No Google Ads / gclid orders in range", "—", "—", "—", "—"]} muteFirst />
                  ) : model.keywordRows.slice(0, 50).map((r) => (
                    <Row key={r.keyword} highlightFirst muteFirst={r.keyword.startsWith("(")}
                      cells={[r.keyword, r.leads, r.paid, pct(paidRate(r)), money(r.revenue)]} />
                  ))}
                </Table>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <PlannedBox icon="ri-google-line" title="Google Ads search terms (planned)"
                    text="Per-search-term spend/CPA/ROAS needs Google Ads API reporting (search_term_view / keyword_view). A read-only probe exists (fetch-ad-spend-keyword-probe) but is not wired into a stored table yet." />
                  <PlannedBox icon="ri-search-eye-line" title="Google Organic queries (planned)"
                    text="Organic query data requires a Google Search Console API connection (query, page, clicks, impressions, CTR, avg position). Not integrated. Organic keyword per order is not available and is never invented — compare by landing page/date instead." />
                </div>
              </Category>

              {/* G. Data Quality / Attribution Gaps */}
              <Category letter="G" title="Data Quality / Attribution Gaps" subtitle="What tracking is broken?">
                {model.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-1.5 mb-3">
                    {model.warnings.map((w, i) => (
                      <p key={i} className={`text-xs ${w.tone === "warn" ? "text-amber-800" : "text-gray-600"}`}>
                        <span className="mr-1">{w.tone === "warn" ? "⚠️" : "ℹ️"}</span>{w.text}
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card label="Missing source" value={`${model.dq.missingSource} (${pct(model.total.leads ? model.dq.missingSource / model.total.leads * 100 : 0)})`} />
                  <Card label="Missing first landing" value={`${model.dq.missingLanding} (${pct(model.missLandPct)})`} accent={model.missLandPct >= 25 ? "amber" : undefined} />
                  <Card label="Paid, no landing" value={String(model.dq.paidMissingLanding)} />
                  <Card label="Paid, unknown source" value={String(model.dq.paidUnknownSource)} />
                  <Card label="Landing is admin/internal" value={String(model.dq.internalLanding)} />
                  <Card label="Source but no landing" value={String(model.dq.sourceNoLanding)} />
                  <Card label="Landing but no source" value={String(model.dq.landingNoSource)} />
                  <Card label="Google Ads missing gclid" value={`${model.dq.gAdsNoGclid}${model.dq.gAdsTotal ? ` / ${model.dq.gAdsTotal}` : ""}`} />
                  <Card label="Meta missing fbclid" value={`${model.dq.metaNoFbclid}${model.dq.metaTotal ? ` / ${model.dq.metaTotal}` : ""}`} />
                  <Card label="Google Ads keyword missing" value={`${model.dq.gAdsNoKeyword}${model.dq.gAdsTotal ? ` / ${model.dq.gAdsTotal}` : ""}`} />
                </div>
              </Category>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── Presentational helpers ───────────────────────────────────────────────────
function Category({ letter, title, subtitle, children }: { letter: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 text-white text-[11px] font-extrabold">{letter}</span>
        <div>
          <h4 className="text-sm font-extrabold text-gray-900 leading-tight">{title}</h4>
          <p className="text-[11px] text-gray-500 leading-tight">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Card({ label, value, accent, small }: { label: string; value: string; accent?: "emerald" | "amber"; small?: boolean }) {
  const color = accent === "emerald" ? "text-emerald-600" : accent === "amber" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold leading-tight">{label}</p>
      <p className={`mt-1 font-extrabold tabular-nums ${color} ${small ? "text-sm truncate" : "text-xl"}`} title={value}>{value}</p>
    </div>
  );
}

function Table({ head, children, onExport, wideFirst }: { head: string[]; children: ReactNode; onExport: () => void; wideFirst?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-end">
        <button type="button" onClick={onExport} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1">
          <i className="ri-download-2-line"></i> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left">
              {head.map((h, i) => (
                <th key={h} className={`px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${i === 0 ? (wideFirst ? "min-w-[200px]" : "") : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ cells, highlightFirst, muteFirst }: { cells: (string | number)[]; highlightFirst?: boolean; muteFirst?: boolean }) {
  return (
    <tr className="hover:bg-gray-50">
      {cells.map((c, i) => (
        <td key={i} className={`px-4 py-2.5 whitespace-nowrap ${i === 0 ? `${highlightFirst ? "font-bold" : "font-medium"} ${muteFirst ? "text-gray-400 italic" : "text-gray-900"} max-w-[260px] truncate` : "text-right tabular-nums text-gray-700"}`} title={i === 0 ? String(c) : undefined}>{c}</td>
      ))}
    </tr>
  );
}

function Total({ cells }: { cells: (string | number)[] }) {
  return (
    <tr className="bg-gray-50 border-t border-gray-100 font-extrabold">
      {cells.map((c, i) => (<td key={i} className={`px-4 py-2.5 whitespace-nowrap ${i === 0 ? "text-gray-900" : "text-right tabular-nums text-gray-900"}`}>{c}</td>))}
    </tr>
  );
}

function PlannedBox({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
      <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5"><i className={icon}></i>{title}</p>
      <p className="text-[11px] text-gray-500 mt-1">{text}</p>
    </div>
  );
}

function Loader() {
  return <div className="py-16 text-center text-gray-400 text-sm"><i className="ri-loader-4-line animate-spin text-2xl"></i><p className="mt-2">Loading orders…</p></div>;
}
function EmptyState() {
  return <div className="py-16 text-center text-gray-400 text-sm"><i className="ri-inbox-line text-2xl"></i><p className="mt-2">No orders in the selected range.</p></div>;
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-red-600 font-semibold">Could not load analytics.</p>
      <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto break-words">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700">Retry</button>
    </div>
  );
}
