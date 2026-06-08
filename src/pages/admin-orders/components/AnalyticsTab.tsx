// AnalyticsTab — Traffic source & order analytics for admin portal
//
// LIVE parity rebuild (PAWTENANT-LIVE-MAKE-ANALYTICS-MATCH-TEST-FINAL):
// The visible Analytics surface now follows the SAME vertical, numbered IA as
// the approved TEST dashboard (commit 86c12e9):
//   Overview → 01 Conversion Analytics → 02 Recovery Performance →
//   03 Page Performance → 04 Insights (+ Top States + Period Summary) →
//   05 Funnel → 06 Tools / Debug.
// LIVE-specific data logic is preserved verbatim:
//   • canonical acquisitionClassifier channel labels (orderChannelLabel/Config)
//   • attribution_json.channel enrichment (orderChannelById → attribution_channel)
//   • Delivery-Speed / Payment-Method CSV export columns
//   • Phase2 funnel mounted with ownerChannel={null} (LIVE channelFilter holds
//     AcquisitionLabel values, not OwnerChannel buckets)
//   • Google Ads Sync / Meta CAPI / Conversion Backfill / Ad Spend panels
import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdSpendPanel from "./AdSpendPanel";
import GoogleAdsSyncPanel from "./GoogleAdsSyncPanel";
import MetaCAPIPanel from "./MetaCAPIPanel";
import UnifiedBackfillPanel from "./UnifiedBackfillPanel";
import Phase2AnalyticsPanel from "./Phase2AnalyticsPanel";
import SyncHealthCards from "./SyncHealthCards";
import OwnerKpiStrip from "./OwnerKpiStrip";
import RecoveryPerformancePanel from "./RecoveryPerformancePanel";
import SmartInsightsPanel from "./SmartInsightsPanel";
import SourceLandingPaidRatePanel from "./SourceLandingPaidRatePanel";
import {
  classifyOrder,
  canonicalChannelToLabel,
  ACQUISITION_VISUAL,
  type AcquisitionLabel,
} from "@/lib/acquisitionClassifier";
import { computeOrderMetrics } from "@/lib/analyticsMetrics";

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  plan_type: string | null;
  price: number | null;
  payment_intent_id: string | null;
  status: string;
  doctor_status: string | null;
  created_at: string;
  referred_by: string | null;
  letter_type?: string | null;
  refunded_at?: string | null;
  dispute_id?: string | null;
  payment_method?: string | null;
  delivery_speed?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  /** Canonical server-built channel (orders.attribution_json.channel),
   *  enriched in-tab by orderChannelById. Source of truth for order-side
   *  attribution — see LIVE-ANALYTICS-ATTRIBUTION-METRICS-REPAIR. */
  attribution_channel?: string | null;
}

interface AnalyticsTabProps {
  orders: Order[];
  onViewOrder?: (order: Order) => void;
}

// ── Channel resolution ────────────────────────────────────────────────────────
interface ChannelConfig {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  chartColor: string;
}

// ────────────────────────────────────────────────────────────────────────
// Canonical-classifier adapter helpers (LIVE — superset of TEST)
// ────────────────────────────────────────────────────────────────────────
// Drop-in replacements for the legacy resolveChannel/getChannelConfig backed
// by the shared acquisitionClassifier + ACQUISITION_VISUAL, so labels match
// Orders pills, Live Visitors chips, AdminDashboard breakdown and the canonical
// attribution everywhere else in LIVE. DO NOT replace with TEST's owner-bucket
// helpers — LIVE's classifier is intentionally a superset.

/** Hex chart color per canonical classifier label. Tracks the Tailwind color
 *  in ACQUISITION_VISUAL.color so swatch + label stay visually consistent. */
const LABEL_CHART_COLOR: Record<AcquisitionLabel, string> = {
  "Google Ads":       "#f97316", // orange-500 — matches text-orange-600 visual
  "Google Organic":   "#10b981", // emerald-500
  "Facebook Paid":    "#1877F2", // canonical Meta brand blue
  "Facebook Organic": "#2563eb", // blue-600
  "Instagram":        "#db2777", // pink-600
  "Reddit":           "#c2410c", // orange-700 — distinct from Google Ads
  "TikTok":           "#111827", // gray-900 — matches text-gray-900 visual
  "Microsoft Ads":    "#0284c7", // sky-600
  "ChatGPT":          "#047857", // emerald-700 — distinct from Google Organic
  "Claude":           "#b45309", // amber-700
  "Gemini":           "#4338ca", // indigo-700
  "Perplexity":       "#475569", // slate-600
  "Email Recovery":   "#7c3aed", // violet-600
  "Referral":         "#0d9488", // teal-600
  "Direct / Unknown": "#9ca3af", // gray-400
};

/** Classifier-driven channel label for an order. Prefers the canonical
 *  server-built channel (orders.attribution_json.channel, enriched in-tab);
 *  falls back to the raw-signal classifier for legacy orders. Always returns
 *  one of the canonical ACQUISITION_LABELS. */
function orderChannelLabel(o: Order): string {
  const canon = canonicalChannelToLabel(o.attribution_channel);
  if (canon) return canon;
  return classifyOrder(o as Parameters<typeof classifyOrder>[0]).label;
}

/** Same ChannelConfig shape as the legacy getChannelConfig(), so channelStats /
 *  Period Summary / order list consumers don't need to restructure. */
function orderChannelConfig(label: string): ChannelConfig {
  const vis = ACQUISITION_VISUAL[label as AcquisitionLabel];
  if (!vis) {
    return {
      label,
      icon:        "ri-share-circle-line",
      color:       "text-gray-500",
      bgColor:     "bg-gray-50",
      borderColor: "border-gray-200",
      chartColor:  "#9ca3af",
    };
  }
  // ACQUISITION_VISUAL.color is a combined Tailwind class string
  // ("text-orange-600 bg-orange-50 border-orange-200"). Split + bucket so the
  // shape matches the legacy split-class config.
  const tokens = vis.color.split(/\s+/);
  const color       = tokens.find((t) => t.startsWith("text-"))   ?? "text-gray-500";
  const bgColor     = tokens.find((t) => t.startsWith("bg-"))     ?? "bg-gray-50";
  const borderColor = tokens.find((t) => t.startsWith("border-")) ?? "border-gray-200";
  return {
    label:       vis.label,
    icon:        vis.icon,
    color,
    bgColor,
    borderColor,
    chartColor:  LABEL_CHART_COLOR[label as AcquisitionLabel] ?? "#9ca3af",
  };
}

// ── Attribution Funnel (canonical channel keys) ───────────────────────────────
// Uses values written by src/lib/attributionStore.ts → buildChannel()
// and stored in orders.attribution_json.channel
//          and chat_sessions.external_metadata.attribution.channel
const FUNNEL_CHANNELS = [
  { key: "google_ads",     label: "Google Ads",          icon: "ri-google-fill",           color: "#f97316", bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-600" },
  { key: "facebook_ads",   label: "Facebook / IG Ads",   icon: "ri-facebook-circle-fill",  color: "#1877F2", bg: "bg-blue-50",    border: "border-blue-200",    text: "text-[#1877F2]" },
  { key: "organic_search", label: "Organic Search",      icon: "ri-search-2-line",         color: "#10b981", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-600" },
  { key: "social_organic", label: "Social (Organic)",    icon: "ri-share-forward-fill",    color: "#8b5cf6", bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-600" },
  { key: "direct",         label: "Direct",              icon: "ri-cursor-fill",           color: "#6b7280", bg: "bg-gray-50",    border: "border-gray-200",    text: "text-gray-600" },
  { key: "other",          label: "Other / Unknown",     icon: "ri-question-line",         color: "#9ca3af", bg: "bg-gray-50",    border: "border-gray-200",    text: "text-gray-400" },
] as const;

function normalizeCanonicalChannel(raw: unknown): string {
  if (typeof raw !== "string") return "other";
  const v = raw.toLowerCase().trim();
  if (v === "google_ads" || v === "facebook_ads" || v === "organic_search" || v === "social_organic" || v === "direct") return v;
  return "other";
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtShort(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Shared reporting-preset display labels (Current Month is the default).
const DATE_PRESET_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  mtd: "Current Month",
  lastmonth: "Previous Month",
  custom: "Custom",
};

function getDateRange(preset: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  switch (preset) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case "yesterday": {
      const from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
      const yTo = new Date(now); yTo.setDate(yTo.getDate() - 1); yTo.setHours(23, 59, 59, 999);
      return { from, to: yTo };
    }
    case "7d": return { from: new Date(now.getTime() - 7 * 86400000), to };
    case "30d": return { from: new Date(now.getTime() - 30 * 86400000), to };
    case "90d": return { from: new Date(now.getTime() - 90 * 86400000), to };
    case "mtd": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "lastmonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Last day of the previous month, end-of-day.
      const lastTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to: lastTo };
    }
    case "ytd": return { from: new Date(now.getFullYear(), 0, 1), to };
    // default → Current Month (the canonical shared default)
    default: return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
  }
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      ></div>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
// LIVE column set — privacy-safe (no DOB / age / diagnosis / service type /
// assessment answers). Keeps the LIVE-specific Delivery Speed + Payment Method
// columns used by the ads/ops team.
function exportToCSV(orders: Order[], filename: string) {
  const headers = [
    "Confirmation ID",
    "Date",
    "Customer Name",
    "Email",
    "State",
    "Channel",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "Status",
    "Letter Type",
    "Price",
    "Payment Method",
    "Delivery Speed",
  ];

  const rows = orders.map((o) => {
    const ch = orderChannelLabel(o);
    const cfg = orderChannelConfig(ch);
    const isPaid = !!o.payment_intent_id;
    const isCompleted = o.doctor_status === "patient_notified";
    const fullName = [o.first_name, o.last_name].filter(Boolean).join(" ") || "";
    const status = isCompleted ? "Completed" : isPaid ? "Paid" : "Lead";
    const letterType = o.letter_type === "psd" || o.confirmation_id.includes("-PSD") ? "PSD" : "ESA";

    return [
      o.confirmation_id,
      new Date(o.created_at).toLocaleDateString("en-US"),
      fullName,
      o.email,
      o.state ?? "",
      cfg.label,
      o.utm_source ?? "",
      o.utm_medium ?? "",
      o.utm_campaign ?? "",
      status,
      letterType,
      o.price != null ? `$${o.price}` : "",
      o.payment_method ?? "",
      o.delivery_speed ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalyticsTab({ orders, onViewOrder }: AnalyticsTabProps) {
  // Default reporting window pinned to Current Month so Owner Dashboard,
  // Business Snapshot, Conversion Analytics, Top States, Period Summary,
  // Smart Insights and the Funnel all surface the same numbers.
  const [datePreset, setDatePreset] = useState("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [letterTypeFilter, setLetterTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [orderListPage, setOrderListPage] = useState(1);
  // Section 06 → Detailed Data & Export is collapsed by default. The heavy
  // legacy JSX (secondary filters + KPI cards + order list + sync-tool panels)
  // only mounts when the operator clicks "Expand details".
  const [expandDetailed, setExpandDetailed] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [reviewLogs, setReviewLogs] = useState<{ object_id: string; action: string; created_at: string }[]>([]);
  const [analyticsView, setAnalyticsView] = useState<"overview" | "funnel" | "ad_roi" | "google_ads_sync" | "meta_capi" | "backfill">("overview");

  // ── Attribution Funnel state ─────────────────────────────────────────────
  interface FunnelOrderRow {
    id: string;
    payment_intent_id: string | null;
    price: number | null;
    attribution_json: { channel?: string | null } | null;
    created_at: string;
  }
  interface FunnelChatRow {
    id: string;
    external_metadata: { attribution?: { channel?: string | null } | null } | null;
    created_at: string;
  }
  const [funnelOrders, setFunnelOrders] = useState<FunnelOrderRow[]>([]);
  const [funnelChats, setFunnelChats] = useState<FunnelChatRow[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  // ── Fetch review request audit logs ──────────────────────────────────────
  useEffect(() => {
    async function fetchReviewLogs() {
      const { data } = await supabase
        .from("audit_logs")
        .select("object_id, action, created_at")
        .in("action", ["trustpilot_review_email_sent", "trustpilot_review_sms_sent"]);
      if (data) setReviewLogs(data);
    }
    fetchReviewLogs();
  }, []);

  // ── Fetch Attribution Funnel data on demand (legacy chat-session funnel) ──
  useEffect(() => {
    if (analyticsView !== "funnel") return;
    let cancelled = false;
    setFunnelLoading(true);
    setFunnelError(null);

    const fromIso = new Date(0).toISOString();
    const toIso = new Date().toISOString();

    Promise.all([
      supabase
        .from("orders")
        .select("id, payment_intent_id, price, attribution_json, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("chat_sessions")
        .select("id, external_metadata, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ])
      .then(([o, c]) => {
        if (cancelled) return;
        if (o.error) setFunnelError(o.error.message);
        else if (c.error) setFunnelError(c.error.message);
        setFunnelOrders((o.data ?? []) as FunnelOrderRow[]);
        setFunnelChats((c.data ?? []) as FunnelChatRow[]);
      })
      .finally(() => {
        if (!cancelled) setFunnelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analyticsView]);

  // ── Date filtering ────────────────────────────────────────────────────────
  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") };
    }
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Single human-readable label for the shared reporting period, e.g.
  // "Current Month — Jun 1, 2026 to Jun 8, 2026". Reused across sections so
  // they all advertise the SAME window.
  const reportingLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const name = datePreset === "custom" ? "Custom" : (DATE_PRESET_LABEL[datePreset] ?? "Current Month");
    return `${name} — ${fmt(rangeFrom)} to ${fmt(rangeTo)}`;
  }, [datePreset, rangeFrom, rangeTo]);

  // ── Canonical order channel (LIVE-ANALYTICS-ATTRIBUTION-METRICS-REPAIR) ───
  // Enrich each order with orders.attribution_json.channel — the canonical
  // server-built channel populated on every paid order. The parent order feed
  // doesn't carry it (nor gclid/fbclid), so without this every paid Google /
  // Facebook order collapsed into "Direct / Unknown". One lightweight read-only
  // select. No writes, no checkout/payment/tracking touch.
  const [orderChannelById, setOrderChannelById] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("orders")
      .select("id, attribution_json")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as { id: string; attribution_json: { channel?: string | null } | null }[]) {
          const ch = row.attribution_json?.channel;
          if (ch) map[row.id] = ch;
        }
        setOrderChannelById(map);
      });
    return () => { cancelled = true; };
  }, []);

  const ordersEnriched = useMemo<Order[]>(
    () => orders.map((o) => ({ ...o, attribution_channel: orderChannelById[o.id] ?? null })),
    [orders, orderChannelById],
  );

  // ── Filtered orders ───────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return ordersEnriched.filter((o) => {
      const created = new Date(o.created_at);
      if (created < rangeFrom || created > rangeTo) return false;
      if (orderTypeFilter === "paid" && !o.payment_intent_id) return false;
      if (orderTypeFilter === "lead" && o.payment_intent_id) return false;
      if (letterTypeFilter === "esa" && (o.letter_type === "psd" || o.confirmation_id.includes("-PSD"))) return false;
      if (letterTypeFilter === "psd" && o.letter_type !== "psd" && !o.confirmation_id.includes("-PSD")) return false;
      if (stateFilter !== "all" && (o.state ?? "") !== stateFilter) return false;
      const ch = orderChannelLabel(o);
      if (channelFilter !== "all" && ch !== channelFilter) return false;
      return true;
    });
  }, [ordersEnriched, rangeFrom, rangeTo, orderTypeFilter, letterTypeFilter, stateFilter, channelFilter]);

  // ── Channel breakdown ─────────────────────────────────────────────────────
  const channelStats = useMemo(() => {
    const map: Record<string, { total: number; paid: number; leads: number; revenue: number; completed: number }> = {};
    filteredOrders.forEach((o) => {
      const ch = orderChannelLabel(o);
      if (!map[ch]) map[ch] = { total: 0, paid: 0, leads: 0, revenue: 0, completed: 0 };
      map[ch].total++;
      if (o.payment_intent_id) {
        map[ch].paid++;
        map[ch].revenue += o.price ?? 0;
      } else {
        map[ch].leads++;
      }
      if (o.doctor_status === "patient_notified") map[ch].completed++;
    });
    return Object.entries(map)
      .map(([channel, stats]) => ({
        channel,
        ...stats,
        conversionRate: stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0,
        cfg: orderChannelConfig(channel),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  // Canonical metric definitions shared with Owner Dashboard + Conversion
  // Analytics via lib/analyticsMetrics. Paid = payment happened (incl. later
  // refunded); revenue here is GROSS. Net Paid / Net Revenue exclude refunds.
  const kpis = useMemo(() => {
    const m = computeOrderMetrics(filteredOrders);
    return {
      total: m.total,
      paid: m.paid,
      netPaid: m.netPaid,
      leads: m.leads,
      completed: m.completed,
      revenue: m.grossRevenue,
      netRevenue: m.netRevenue,
      refunds: m.refunds,
      paidRate: Math.round(m.paidRate),
      netPaidRate: Math.round(m.netPaidRate),
      aov: Math.round(m.aov),
    };
  }, [filteredOrders]);

  // ── Review request stats ──────────────────────────────────────────────────
  const reviewStats = useMemo(() => {
    const filteredOrderIds = new Set(filteredOrders.map((o) => o.id));
    const periodLogs = reviewLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= rangeFrom && logDate <= rangeTo && filteredOrderIds.has(log.object_id);
    });
    const uniqueOrdersRequested = new Set(periodLogs.map((l) => l.object_id));
    const emailsSent = periodLogs.filter((l) => l.action === "trustpilot_review_email_sent").length;
    const smsSent = periodLogs.filter((l) => l.action === "trustpilot_review_sms_sent").length;
    const totalSent = uniqueOrdersRequested.size;
    const reviewSentByOrderId = new Set(periodLogs.map((l) => l.object_id));
    const completed = filteredOrders.filter((o) => o.doctor_status === "patient_notified").length;
    const reviewRate = completed > 0 ? Math.round((totalSent / completed) * 100) : 0;
    return { totalSent, emailsSent, smsSent, reviewRate, reviewSentByOrderId };
  }, [reviewLogs, filteredOrders, rangeFrom, rangeTo]);

  // ── Orders for selected channel ───────────────────────────────────────────
  const channelOrders = useMemo(() => {
    if (!selectedChannel) return filteredOrders;
    return filteredOrders.filter((o) => orderChannelLabel(o) === selectedChannel);
  }, [filteredOrders, selectedChannel]);

  const pagedOrders = channelOrders.slice(0, orderListPage * PAGE_SIZE);
  const hasMoreOrders = channelOrders.length > pagedOrders.length;

  // ── State breakdown ───────────────────────────────────────────────────────
  const stateStats = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const s = o.state ?? "Unknown";
      map[s] = (map[s] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredOrders]);

  const maxStateCount = Math.max(...stateStats.map((s) => s[1]), 1);

  // ── All unique states for filter ──────────────────────────────────────────
  const allStates = useMemo(() => {
    const s = new Set(orders.map((o) => o.state).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [orders]);

  // ── All unique channels for filter (canonical labels) ────────────────────
  const allChannels = useMemo(() => {
    const s = new Set(ordersEnriched.map((o) => orderChannelLabel(o)));
    return Array.from(s).sort();
  }, [ordersEnriched]);

  // ── Revenue by channel (for AdSpendPanel ROI calc) ───────────────────────
  const revenueByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (!o.payment_intent_id) return;
      const ch = orderChannelLabel(o);
      map[ch] = (map[ch] ?? 0) + (o.price ?? 0);
    });
    return map;
  }, [filteredOrders]);

  // ── Paid order count by channel (for CPA calc) ───────────────────────────
  const paidOrdersByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (!o.payment_intent_id) return;
      const ch = orderChannelLabel(o);
      map[ch] = (map[ch] ?? 0) + 1;
    });
    return map;
  }, [filteredOrders]);

  // Date strings for AdSpendPanel
  const dateFromStr = rangeFrom.toISOString().slice(0, 10);
  const dateToStr = rangeTo.toISOString().slice(0, 10);

  // ── Funnel stats (date-range scoped) — legacy chat-session funnel ─────────
  const funnelStats = useMemo(() => {
    const map: Record<string, { chats: number; leads: number; paid: number; revenue: number }> = {};
    FUNNEL_CHANNELS.forEach((c) => { map[c.key] = { chats: 0, leads: 0, paid: 0, revenue: 0 }; });

    funnelChats.forEach((ch) => {
      const d = new Date(ch.created_at);
      if (d < rangeFrom || d > rangeTo) return;
      const raw = ch.external_metadata?.attribution?.channel ?? null;
      map[normalizeCanonicalChannel(raw)].chats++;
    });

    funnelOrders.forEach((o) => {
      const d = new Date(o.created_at);
      if (d < rangeFrom || d > rangeTo) return;
      const key = normalizeCanonicalChannel(o.attribution_json?.channel ?? null);
      if (o.payment_intent_id) {
        map[key].paid++;
        map[key].revenue += o.price ?? 0;
      } else {
        map[key].leads++;
      }
    });

    return FUNNEL_CHANNELS.map((c) => {
      const s = map[c.key];
      const total = s.leads + s.paid;
      return {
        ...c,
        ...s,
        total,
        convRate: total > 0 ? Math.round((s.paid / total) * 100) : 0,
      };
    });
  }, [funnelOrders, funnelChats, rangeFrom, rangeTo]);

  const funnelTotals = useMemo(() => {
    return funnelStats.reduce(
      (acc, r) => ({
        chats: acc.chats + r.chats,
        leads: acc.leads + r.leads,
        paid: acc.paid + r.paid,
        revenue: acc.revenue + r.revenue,
      }),
      { chats: 0, leads: 0, paid: 0, revenue: 0 },
    );
  }, [funnelStats]);

  const funnelTotalOrders = funnelTotals.leads + funnelTotals.paid;
  const funnelConvRate = funnelTotalOrders > 0 ? Math.round((funnelTotals.paid / funnelTotalOrders) * 100) : 0;

  // ── CSV Export handler ────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    setCsvExporting(true);
    const dateStr = new Date().toISOString().slice(0, 10);
    const channelLabel = selectedChannel ? `-${orderChannelConfig(selectedChannel).label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}` : "";
    const filename = `pawtenant-orders-${datePreset}${channelLabel}-${dateStr}.csv`;
    exportToCSV(channelOrders, filename);
    setTimeout(() => setCsvExporting(false), 1500);
  }, [channelOrders, datePreset, selectedChannel]);

  return (
    <div className="max-w-7xl mx-auto space-y-12">

      {/* ════════════════════ 0. ANALYTICS CONTROL BAR ══════════════════════ */}
      {/* Compact top-of-page controls: reporting period + channel + CSV export. */}
      {/* Single source of truth for the shared date range. The detailed         */}
      {/* order/letter/state filters live inside Section 06 (collapsed).         */}
      <section>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">

            {/* Date preset */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {[
                { value: "today",      label: "Today" },
                { value: "yesterday",  label: "Yesterday" },
                { value: "7d",         label: "Last 7 Days" },
                { value: "30d",        label: "Last 30 Days" },
                { value: "mtd",        label: "Current Month" },
                { value: "lastmonth",  label: "Previous Month" },
                { value: "custom",     label: "Custom" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDatePreset(p.value)}
                  className={`whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${datePreset === p.value ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range inputs */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:border-[#3b6ea5]"
                />
                <span className="text-[11px] text-gray-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:border-[#3b6ea5]"
                />
              </div>
            )}

            <div className="h-5 w-px bg-gray-200 hidden sm:block"></div>

            {/* Channel (canonical acquisition labels) */}
            <div className="relative">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="appearance-none pl-2.5 pr-7 py-1 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer"
              >
                <option value="all">All Channels</option>
                {allChannels.map((c) => (
                  <option key={c} value={c}>{orderChannelConfig(c).label}</option>
                ))}
              </select>
              <i className="ri-arrow-down-s-line absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs"></i>
            </div>

            <span className="text-[11px] text-gray-400">
              Reporting period: <strong className="text-gray-700">{reportingLabel}</strong>
              <span className="hidden sm:inline"> · <strong className="text-gray-700">{filteredOrders.length}</strong> orders</span>
            </span>

            {/* Export — pinned right */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={channelOrders.length === 0 || csvExporting}
              className={`ml-auto whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                csvExporting
                  ? "bg-[#e8f0f9] text-[#3b6ea5] border-[#b8cce4]"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {csvExporting ? (
                <><i className="ri-checkbox-circle-fill text-[#3b6ea5]"></i>Exported!</>
              ) : (
                <><i className="ri-download-2-line"></i>Export CSV ({channelOrders.length})</>
              )}
            </button>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP · OVERVIEW                                        */}
      {/*  Owner Dashboard + Business Snapshot — the executive read.            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-700">Overview</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent"></div>
      </div>

      {/* ── Owner Dashboard ── */}
      <section>
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-orange-50 text-orange-500">
              <i className="ri-dashboard-3-line text-base"></i>
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Owner Dashboard</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-9">How is the business doing right now?</p>
        </div>
        <OwnerKpiStrip
          dateFromIso={rangeFrom.toISOString()}
          dateToIso={rangeTo.toISOString()}
          rangeLabel={reportingLabel}
        />
      </section>

      {/* ── Business Snapshot (compact secondary) ── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gray-100 text-gray-500">
            <i className="ri-bar-chart-box-line text-[11px]"></i>
          </span>
          <h3 className="text-[13px] font-bold text-gray-700 tracking-tight">Business Snapshot</h3>
          <span className="text-[10px] text-gray-400">· {reportingLabel}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: "Total Orders",      value: kpis.total.toLocaleString()                       },
            { label: "Paid Orders",       value: kpis.paid.toLocaleString()                        },
            { label: "Unpaid Leads",      value: kpis.leads.toLocaleString()                       },
            { label: "Completed",         value: kpis.completed.toLocaleString()                   },
            { label: "Paid Rate",         value: `${kpis.paidRate}%`                               },
            { label: "Revenue (gross)",   value: `$${kpis.revenue.toLocaleString()}`               },
            { label: "Reviews Requested", value: (reviewStats?.totalSent ?? 0).toLocaleString()    },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">{kpi.label}</p>
              <p className="text-sm font-bold text-gray-700 tabular-nums mt-0.5">{kpi.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 01 · CONVERSION ANALYTICS                        */}
      {/*  Consolidated conversion dashboard (Executive Overview · Acquisition · */}
      {/*  Landing · Source×Landing Matrix · Paid Ads ROI · Keyword · Data      */}
      {/*  Quality). The marketing-decision view.                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-500 text-white text-[12px] font-extrabold tabular-nums shadow-sm">01</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-700">Conversion Analytics</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-200 to-transparent"></div>
      </div>

      <section>
        <SourceLandingPaidRatePanel
          globalFrom={rangeFrom}
          globalTo={rangeTo}
          globalLabel={reportingLabel}
        />
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 02 · RECOVERY PERFORMANCE                        */}
      {/*  Recovery clicks, conversions, stage breakdown.                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-teal-500 text-white text-[12px] font-extrabold tabular-nums shadow-sm">02</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-teal-700">Recovery Performance</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-teal-200 to-transparent"></div>
      </div>

      <section>
        <details open className="group rounded-2xl border border-gray-100 bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 bg-teal-50 text-teal-600">
                <i className="ri-mail-send-line text-base"></i>
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Recovery Performance</h2>
                <p className="text-xs text-gray-500 mt-0.5">Which follow-up wins back the most customers?</p>
              </div>
            </div>
            <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
          </summary>
          <div className="px-5 pb-5 pt-2 border-t border-gray-100">
            <RecoveryPerformancePanel />
          </div>
        </details>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 03 · PAGE PERFORMANCE                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-sky-500 text-white text-[12px] font-extrabold tabular-nums shadow-sm">03</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-700">Page Performance</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-sky-200 to-transparent"></div>
      </div>

      <section>
        <details open className="group rounded-2xl border border-gray-100 bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 bg-sky-50 text-sky-600">
                <i className="ri-window-line text-base"></i>
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Page Performance</h2>
                <p className="text-xs text-gray-500 mt-0.5">Which page sells, and which page needs work? <span className="text-gray-400">· Aggregated analytics window — independent of the reporting period above.</span></p>
              </div>
            </div>
            <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
          </summary>
          <div className="px-5 pb-5 pt-2 border-t border-gray-100">
            <Phase2AnalyticsPanel mode="pages-geo" />
          </div>
        </details>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 04 · INSIGHTS                                    */}
      {/*  Smart Insights + Top States + Period Summary.                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 text-white text-[12px] font-extrabold tabular-nums shadow-sm">04</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-orange-700">Insights</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-orange-200 to-transparent"></div>
      </div>

      <section>
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-orange-50 text-orange-500">
              <i className="ri-lightbulb-flash-line text-base"></i>
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Smart Insights</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-9">What to do next — based on this period's data.</p>
        </div>
        <SmartInsightsPanel
          dateFromIso={rangeFrom.toISOString()}
          dateToIso={rangeTo.toISOString()}
        />
      </section>

      {/* ── Period Summary + Top States ── */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Top States — spans 2/3 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-sky-50 to-sky-100 text-sky-600">
                <i className="ri-map-pin-line text-base"></i>
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Top States</h3>
                <p className="text-xs text-gray-400 mt-0.5">Orders by state in the selected period</p>
              </div>
            </div>
            {stateStats.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No state data available</div>
            ) : (
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {stateStats.map(([state, count]) => (
                  <div key={state} className="flex items-center gap-3 bg-gradient-to-br from-gray-50 to-white rounded-xl px-3 py-2.5 border border-gray-100">
                    <div className="w-9 h-9 flex items-center justify-center bg-gradient-to-br from-[#e8f0f9] to-[#dde7f3] rounded-lg flex-shrink-0">
                      <span className="text-[11px] font-extrabold text-[#3b6ea5]">{state}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-800">{count}</span>
                        <span className="text-[10px] text-gray-400">
                          {filteredOrders.length > 0 ? Math.round((count / filteredOrders.length) * 100) : 0}%
                        </span>
                      </div>
                      <MiniBar value={count} max={maxStateCount} color="#3b6ea5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Period Summary — spans 1/3 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 text-gray-700">
                <i className="ri-pulse-line text-base"></i>
              </span>
              <h3 className="text-sm font-extrabold text-gray-900">Period Summary</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Avg. Revenue / Paid Order</span>
                <span className="text-xs font-bold text-gray-900">
                  {kpis.paid > 0 ? `$${Math.round(kpis.revenue / kpis.paid)}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Best Channel (Revenue)</span>
                <span className="text-xs font-bold text-gray-900 truncate max-w-[120px]">
                  {channelStats.slice().sort((a, b) => b.revenue - a.revenue)[0]?.cfg.label ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Best Paid Rate (by channel)</span>
                <span className="text-xs font-bold text-emerald-600">
                  {channelStats.filter((c) => c.total >= 3).slice().sort((a, b) => b.conversionRate - a.conversionRate)[0]
                    ? `${channelStats.filter((c) => c.total >= 3).slice().sort((a, b) => b.conversionRate - a.conversionRate)[0].conversionRate}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Trend Period</span>
                <span className="text-xs font-bold text-gray-900">
                  {`${fmtShort(rangeFrom.toISOString())} – ${fmtShort(rangeTo.toISOString())}`}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-[10px] font-bold text-[#00b67a] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span>★</span> Review Requests
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Emails Sent</span>
                    <span className="text-xs font-bold text-gray-900">{reviewStats.emailsSent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">SMS Sent</span>
                    <span className="text-xs font-bold text-gray-900">{reviewStats.smsSent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Unique Orders Reached</span>
                    <span className="text-xs font-bold text-[#00b67a]">{reviewStats.totalSent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">% of Completed Orders</span>
                    <span className={`text-xs font-bold ${reviewStats.reviewRate >= 50 ? "text-[#00b67a]" : reviewStats.reviewRate >= 25 ? "text-amber-600" : "text-gray-400"}`}>
                      {reviewStats.reviewRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 05 · FUNNEL                                      */}
      {/*  Sessions → Assessment → Payment → Completed.                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white text-[12px] font-extrabold tabular-nums shadow-sm">05</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-700">Funnel</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-violet-200 to-transparent"></div>
      </div>

      <section>
        <details open className="group rounded-2xl border border-gray-100 bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 bg-violet-50 text-violet-500">
                <i className="ri-filter-2-line text-base"></i>
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Funnel Health</h2>
                <p className="text-xs text-gray-500 mt-0.5">Where am I losing customers?</p>
              </div>
            </div>
            <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
          </summary>
          <div className="px-5 pb-5 pt-2 border-t border-gray-100">
            {/* ownerChannel={null} — LIVE channelFilter holds AcquisitionLabel
                values, not Phase2's OwnerChannel enum buckets. Funnel shows all
                channels combined, matching the unfiltered KPI strip. */}
            <Phase2AnalyticsPanel
              mode="funnel"
              dateFromIso={rangeFrom.toISOString()}
              dateToIso={rangeTo.toISOString()}
              ownerChannel={null}
            />
          </div>
        </details>
      </section>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/*               GROUP 06 · TOOLS / DEBUG                               */}
      {/*  Detailed Data & Export + Tracking & Sync Health.                    */}
      {/*  Both stay collapsed by default — heavy / power-user surface.         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 pt-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-500 text-white text-[12px] font-extrabold tabular-nums shadow-sm">06</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-rose-700">Tools / Debug</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-rose-200 to-transparent"></div>
      </div>

      {/* ── Detailed Data & Export (collapsed) ── */}
      <section className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 bg-gray-100 text-gray-600">
                <i className="ri-table-2 text-base"></i>
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Detailed Data &amp; Export</h2>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Raw orders, filters, and CSV export for team review.</p>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Most business decisions should be made from the sections above. Use detailed data only when reviewing with ads / SEO team.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setExpandDetailed((v) => !v);
                if (expandDetailed && analyticsView !== "overview") setAnalyticsView("overview");
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap ${
                expandDetailed
                  ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  : "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700"
              }`}
            >
              <i className={expandDetailed ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
              {expandDetailed ? "Hide details" : "Expand details"}
            </button>
          </div>
        </div>

      {expandDetailed && (
      <>

      {/* ── Legacy chat-session Attribution Funnel view ── */}
      {analyticsView === "funnel" && (
        <div className="space-y-5">

          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 text-xs text-gray-400">
            Reporting period is set in the top Analytics Control Bar.{" "}
            {funnelLoading ? (
              <span className="inline-flex items-center gap-1.5"><i className="ri-loader-4-line animate-spin"></i>Loading…</span>
            ) : (
              <>
                <strong className="text-gray-700">{funnelChats.length}</strong> chats ·{" "}
                <strong className="text-gray-700">{funnelOrders.length}</strong> orders in window
              </>
            )}
          </div>

          {funnelError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-xs text-red-700">
              <i className="ri-error-warning-line mr-1.5"></i>{funnelError}
            </div>
          )}

          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Chat Sessions",  value: funnelTotals.chats,                              icon: "ri-chat-3-line",            color: "text-sky-600",     bg: "bg-sky-50" },
              { label: "Leads",          value: funnelTotals.leads,                              icon: "ri-user-follow-line",       color: "text-amber-600",   bg: "bg-amber-50" },
              { label: "Paid Orders",    value: funnelTotals.paid,                               icon: "ri-bank-card-line",         color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Revenue",        value: `$${funnelTotals.revenue.toLocaleString()}`,     icon: "ri-money-dollar-circle-line", color: "text-emerald-700", bg: "bg-emerald-50" },
              { label: "Conversion",     value: `${funnelConvRate}%`,                            icon: "ri-percent-line",           color: "text-violet-600",  bg: "bg-violet-50" },
            ].map((kpi) => (
              <div key={kpi.label} className={`${kpi.bg} rounded-xl border border-gray-100 p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-white/70 rounded-lg flex-shrink-0">
                    <i className={`${kpi.icon} ${kpi.color} text-sm`}></i>
                  </div>
                  <span className="text-xs text-gray-500 font-medium leading-tight">{kpi.label}</span>
                </div>
                <p className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Channel table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-extrabold text-gray-900">Channel Performance</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Canonical channels from <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded">attribution_json.channel</code> and <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded">external_metadata.attribution.channel</code>
              </p>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channel</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Chat Sessions</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Leads</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Paid</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Conv Rate</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Share</div>
            </div>

            <div className="divide-y divide-gray-50">
              {funnelStats.map((row) => {
                const sharePct = funnelTotalOrders > 0 ? Math.round(((row.leads + row.paid) / funnelTotalOrders) * 100) : 0;
                const convColor = row.convRate >= 50 ? "text-emerald-600" : row.convRate >= 25 ? "text-amber-600" : row.convRate > 0 ? "text-red-500" : "text-gray-300";
                return (
                  <div key={row.key} className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center">
                    {/* Channel */}
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${row.bg} ${row.border} border`}>
                        <i className={`${row.icon} ${row.text} text-sm`}></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{row.label}</p>
                        <p className="text-[10px] text-gray-400 truncate font-mono">{row.key}</p>
                      </div>
                    </div>
                    {/* Chats */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-bold text-sky-600">{row.chats}</span>
                    </div>
                    {/* Leads */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className="text-sm font-bold text-amber-600">{row.leads}</span>
                    </div>
                    {/* Paid */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className="text-sm font-extrabold text-emerald-600">{row.paid}</span>
                    </div>
                    {/* Revenue */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-bold text-gray-800">${row.revenue.toLocaleString()}</span>
                    </div>
                    {/* Conv Rate */}
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[80px]">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, row.convRate)}%`, backgroundColor: row.color }}></div>
                      </div>
                      <span className={`text-sm font-bold ${convColor} w-10 text-right`}>{row.convRate}%</span>
                    </div>
                    {/* Share */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className="text-xs font-bold text-gray-500">{sharePct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100 items-center">
              <div className="col-span-3 text-xs font-extrabold text-gray-700">Total</div>
              <div className="col-span-2 text-right text-sm font-extrabold text-sky-700">{funnelTotals.chats}</div>
              <div className="col-span-1 text-right text-sm font-extrabold text-amber-700">{funnelTotals.leads}</div>
              <div className="col-span-1 text-right text-sm font-extrabold text-emerald-700">{funnelTotals.paid}</div>
              <div className="col-span-2 text-right text-sm font-extrabold text-gray-900">${funnelTotals.revenue.toLocaleString()}</div>
              <div className="col-span-2 text-right text-sm font-extrabold text-violet-700">{funnelConvRate}%</div>
              <div className="col-span-1 text-right text-xs font-bold text-gray-400">100%</div>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 px-1">
            <i className="ri-information-line mr-1"></i>
            Conversion rate = paid orders ÷ total orders (leads + paid) per channel. Chat sessions and orders are independent top-of-funnel signals — a single visitor can do either, both, or neither.
          </p>
        </div>
      )}

      {/* ── Google Ads Sync view ── */}
      {analyticsView === "google_ads_sync" && <GoogleAdsSyncPanel />}

      {/* ── Meta CAPI view ── */}
      {analyticsView === "meta_capi" && <MetaCAPIPanel />}

      {/* ── Unified Conversion Backfill view ── */}
      {analyticsView === "backfill" && <UnifiedBackfillPanel />}

      {/* ── Ad ROI view ── */}
      {analyticsView === "ad_roi" && (
        <AdSpendPanel
          revenueByChannel={revenueByChannel}
          paidOrdersByChannel={paidOrdersByChannel}
          dateFrom={dateFromStr}
          dateTo={dateToStr}
          datePreset={datePreset}
        />
      )}

      {/* ── Overview view — secondary filters + KPI cards + raw order list ── */}
      {analyticsView === "overview" && <>

      {/* ── Secondary filter bar ── */}
      {/* Date preset, custom range, channel filter and CSV export live in the   */}
      {/* top Analytics Control Bar (Section 0) — single source of truth.        */}
      {/* Only the Detailed-Data-specific filters remain here: order type,       */}
      {/* letter type, and state.                                                */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Order type */}
          <div className="flex items-center gap-1">
            {[
              { value: "all", label: "All Orders" },
              { value: "paid", label: "Paid Only" },
              { value: "lead", label: "Leads Only" },
            ].map((p) => (
              <button key={p.value} type="button" onClick={() => setOrderTypeFilter(p.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${orderTypeFilter === p.value ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Letter type */}
          <div className="flex items-center gap-1">
            {[
              { value: "all", label: "ESA + PSD" },
              { value: "esa", label: "ESA" },
              { value: "psd", label: "PSD" },
            ].map((p) => (
              <button key={p.value} type="button" onClick={() => setLetterTypeFilter(p.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${letterTypeFilter === p.value ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* State filter */}
          <div className="relative">
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
              <option value="all">All States</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs"></i>
          </div>

          <span className="text-xs text-gray-400 ml-auto">
            Date &amp; channel filters and CSV export live in the top control bar.
            <strong className="text-gray-700 ml-2">{filteredOrders.length}</strong> orders in range
          </span>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total Orders", value: kpis.total, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-50", sub: null },
          { label: "Paid Orders", value: kpis.paid, icon: "ri-bank-card-line", color: "text-emerald-600", bg: "bg-emerald-50", sub: null },
          { label: "Unpaid Leads", value: kpis.leads, icon: "ri-user-follow-line", color: "text-amber-600", bg: "bg-amber-50", sub: null },
          { label: "Completed", value: kpis.completed, icon: "ri-checkbox-circle-line", color: "text-[#3b6ea5]", bg: "bg-[#e8f0f9]", sub: null },
          { label: "Paid Rate", value: `${kpis.paidRate}%`, icon: "ri-percent-line", color: "text-violet-600", bg: "bg-violet-50", sub: null },
          { label: "Revenue (gross)", value: `$${kpis.revenue.toLocaleString()}`, icon: "ri-money-dollar-circle-line", color: "text-emerald-700", bg: "bg-emerald-50", sub: null },
          {
            label: "Reviews Requested",
            value: reviewStats.totalSent,
            icon: "ri-star-smile-line",
            color: "text-[#00b67a]",
            bg: "bg-[#e6f9f2]",
            sub: reviewStats.totalSent > 0
              ? `${reviewStats.reviewRate}% of completed`
              : kpis.completed > 0 ? "0% of completed" : null,
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} rounded-xl border border-gray-100 p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 flex items-center justify-center bg-white/70 rounded-lg flex-shrink-0">
                <i className={`${kpi.icon} ${kpi.color} text-sm`}></i>
              </div>
              <span className="text-xs text-gray-500 font-medium leading-tight">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
            {kpi.sub && (
              <p className="text-[10px] text-gray-400 mt-1 font-medium">{kpi.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Order list (filtered by channel if selected) ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">
              {selectedChannel ? `Orders from ${orderChannelConfig(selectedChannel).label}` : "All Orders in Period"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{channelOrders.length} orders — click any row to open order details</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedChannel && (
              <button type="button" onClick={() => setSelectedChannel(null)}
                className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer">
                <i className="ri-close-line"></i>Show all
              </button>
            )}
            {/* CSV Export button */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={channelOrders.length === 0 || csvExporting}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                csvExporting
                  ? "bg-[#e8f0f9] text-[#3b6ea5] border-[#b8cce4]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {csvExporting ? (
                <><i className="ri-checkbox-circle-fill text-[#3b6ea5]"></i>Exported!</>
              ) : (
                <><i className="ri-download-2-line"></i>Export CSV ({channelOrders.length})</>
              )}
            </button>
          </div>
        </div>

        {channelOrders.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-400">No orders match the current filters</div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <div className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order ID</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channel / UTM</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">State</div>
              <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Price</div>
              <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Date</div>
            </div>

            <div className="divide-y divide-gray-50">
              {pagedOrders.map((order) => {
                const ch = orderChannelLabel(order);
                const cfg = orderChannelConfig(ch);
                const isPaid = !!order.payment_intent_id;
                const isCompleted = order.doctor_status === "patient_notified";
                const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                const hasUtm = order.utm_source || order.utm_campaign;

                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-12 gap-2 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onViewOrder?.(order)}
                  >
                    {/* Customer */}
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-full flex-shrink-0 text-[#3b6ea5] text-xs font-extrabold">
                        {fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{fullName}</p>
                        <p className="text-[10px] text-gray-400 truncate">{order.email}</p>
                      </div>
                    </div>

                    {/* Order ID */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs font-mono text-gray-600">{order.confirmation_id}</span>
                    </div>

                    {/* Channel + UTM */}
                    <div className="col-span-2 flex flex-col justify-center gap-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}>
                        <i className={`${cfg.icon} text-[10px]`}></i>
                        <span className="truncate max-w-[70px]">{cfg.label}</span>
                      </span>
                      {hasUtm && (
                        <span className="text-[9px] text-gray-400 truncate max-w-[120px]" title={`${order.utm_source ?? ""}${order.utm_campaign ? ` / ${order.utm_campaign}` : ""}`}>
                          {order.utm_source ?? ""}{order.utm_campaign ? ` · ${order.utm_campaign}` : ""}
                        </span>
                      )}
                    </div>

                    {/* State */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs font-semibold text-gray-600">{order.state ?? "—"}</span>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex items-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isCompleted ? "bg-emerald-100 text-emerald-700" :
                        isPaid ? "bg-sky-100 text-sky-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {isCompleted ? "Completed" : isPaid ? "Paid" : "Lead"}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className={`text-xs font-bold ${isPaid ? "text-emerald-600" : "text-gray-400"}`}>
                        {order.price != null ? `$${order.price}` : "—"}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMoreOrders && (
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Showing {pagedOrders.length} of {channelOrders.length}
                </span>
                <button type="button" onClick={() => setOrderListPage((p) => p + 1)}
                  className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                  <i className="ri-arrow-down-line"></i>Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>

      </>}

      </>
      )}
      {/* End {expandDetailed && (...)} gate */}

      </section>
      {/* End Detailed Data & Export */}

      {/* ── Tracking & Sync Health (collapsed) ── */}
      <section>
        <details className="group rounded-2xl border border-gray-100 bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 bg-rose-50 text-rose-600">
                <i className="ri-pulse-line text-base"></i>
              </span>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-gray-900 tracking-tight">Tracking &amp; Sync Health</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Google Ads Sync, Meta CAPI, and Conversion Backfill. Keeps marketing platforms in sync with paid orders.</p>
              </div>
            </div>
            <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
          </summary>

          <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-100">

            <SyncHealthCards />

            {/* Advanced sync tools — full panels behind a collapsible. */}
            <details className="mt-4 group rounded-2xl border border-gray-100 bg-white">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-gray-900">Advanced sync tools</p>
                  <p className="text-xs text-gray-500 mt-0.5">Full Google Ads sync, Meta CAPI, Conversion Backfill, and live Ad Spend panels.</p>
                </div>
                <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <div className="px-5 pb-5 pt-2 space-y-6 border-t border-gray-100">
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
                  {[
                    { key: "google_ads_sync", label: "Google Ads Sync",     icon: "ri-google-fill" },
                    { key: "meta_capi",       label: "Meta CAPI",           icon: "ri-facebook-fill" },
                    { key: "backfill",        label: "Conversion Backfill", icon: "ri-refresh-line" },
                    { key: "ad_roi",          label: "Ad Spend (live API)", icon: "ri-advertisement-line" },
                  ].map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => { setExpandDetailed(true); setAnalyticsView(v.key as typeof analyticsView); }}
                      className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${analyticsView === v.key ? "bg-white text-[#3b6ea5]" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <i className={v.icon}></i>
                      {v.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">
                  Click a tab above to load the underlying sync tool (it opens inside Detailed Data &amp; Export). Use "Back to dashboard" below to restore the default view.
                </p>
                {analyticsView !== "overview" && (
                  <button
                    type="button"
                    onClick={() => setAnalyticsView("overview")}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <i className="ri-arrow-go-back-line"></i> Back to dashboard
                  </button>
                )}
              </div>
            </details>

            {/* Legacy attribution-funnel chat-session table — kept for parity. */}
            <details className="mt-3 group rounded-2xl border border-dashed border-gray-200 bg-white">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-gray-900">Advanced legacy tools</p>
                  <p className="text-xs text-gray-500 mt-0.5">Chat-session attribution funnel + revenue per channel. Kept for parity verification.</p>
                </div>
                <i className="ri-arrow-down-s-line text-xl text-gray-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <div className="px-5 pb-5 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setExpandDetailed(true); setAnalyticsView(analyticsView === "funnel" ? "overview" : "funnel"); }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  <i className="ri-filter-2-line"></i>
                  {analyticsView === "funnel" ? "Hide legacy attribution funnel" : "Show legacy attribution funnel"}
                </button>
              </div>
            </details>

          </div>
        </details>
      </section>
      {/* End Tracking & Sync Health */}
    </div>
  );
}
