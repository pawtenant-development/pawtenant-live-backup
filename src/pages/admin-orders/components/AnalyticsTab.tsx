// AnalyticsTab — Traffic source & order analytics for admin portal
import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdSpendPanel from "./AdSpendPanel";
import GoogleAdsSyncPanel from "./GoogleAdsSyncPanel";
import MetaCAPIPanel from "./MetaCAPIPanel";
import UnifiedBackfillPanel from "./UnifiedBackfillPanel";

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

const CHANNEL_MAP: Record<string, ChannelConfig> = {
  "Facebook / Instagram Ads": {
    label: "Facebook / Instagram",
    icon: "ri-facebook-circle-fill",
    color: "text-[#1877F2]",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    chartColor: "#1877F2",
  },
  "Google Ads": {
    label: "Google Ads",
    icon: "ri-google-fill",
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    chartColor: "#f97316",
  },
  "Google Organic": {
    label: "Google Organic (SEO)",
    icon: "ri-search-2-line",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    chartColor: "#10b981",
  },
  "TikTok Ads": {
    label: "TikTok Ads",
    icon: "ri-tiktok-fill",
    color: "text-gray-900",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-300",
    chartColor: "#111827",
  },
  "Instagram Ads": {
    label: "Instagram Ads",
    icon: "ri-instagram-fill",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    chartColor: "#db2777",
  },
  "Twitter / X": {
    label: "Twitter / X",
    icon: "ri-twitter-x-fill",
    color: "text-gray-800",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-300",
    chartColor: "#374151",
  },
  "YouTube Ads": {
    label: "YouTube Ads",
    icon: "ri-youtube-fill",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    chartColor: "#dc2626",
  },
  "Email Campaign": {
    label: "Email Campaign",
    icon: "ri-mail-send-fill",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    chartColor: "#7c3aed",
  },
  "Referral": {
    label: "Referral",
    icon: "ri-share-forward-fill",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
    chartColor: "#0d9488",
  },
  "Direct": {
    label: "Direct",
    icon: "ri-cursor-fill",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    chartColor: "#6b7280",
  },
  "Unknown": {
    label: "Direct / Unknown",
    icon: "ri-question-line",
    color: "text-gray-400",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    chartColor: "#d1d5db",
  },
};

function resolveChannel(referredBy: string | null): string {
  if (!referredBy) return "Unknown";
  if (CHANNEL_MAP[referredBy]) return referredBy;
  const lower = referredBy.toLowerCase();
  if (lower.includes("facebook") || (lower.includes("instagram") && !lower.includes("google"))) return "Facebook / Instagram Ads";
  if (lower.includes("google") && lower.includes("organic")) return "Google Organic";
  if (lower.includes("google")) return "Google Ads";
  if (lower.includes("tiktok")) return "TikTok Ads";
  if (lower.includes("twitter") || lower.includes("/ x")) return "Twitter / X";
  if (lower.includes("youtube")) return "YouTube Ads";
  if (lower.includes("email")) return "Email Campaign";
  if (lower.includes("referral")) return "Referral";
  if (lower.includes("seo") || lower.includes("organic")) return "Google Organic";
  if (lower.includes("direct")) return "Direct";
  return referredBy;
}

function getChannelConfig(channel: string): ChannelConfig {
  return CHANNEL_MAP[channel] ?? {
    label: channel,
    icon: "ri-share-circle-line",
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    chartColor: "#9ca3af",
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtShort(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDateRange(preset: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  switch (preset) {
    case "7d": return { from: new Date(now.getTime() - 7 * 86400000), to };
    case "30d": return { from: new Date(now.getTime() - 30 * 86400000), to };
    case "90d": return { from: new Date(now.getTime() - 90 * 86400000), to };
    case "ytd": return { from: new Date(now.getFullYear(), 0, 1), to };
    default: return { from: new Date(0), to };
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

// ── Donut chart (SVG) ─────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return (
    <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center">
      <span className="text-xs text-gray-400">No data</span>
    </div>
  );

  let cumulative = 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const paths = segments.filter((s) => s.value > 0).map((seg) => {
    const pct = seg.value / total;
    const offset = circumference * (1 - cumulative);
    const dash = circumference * pct;
    cumulative += pct;
    return { ...seg, dash, offset };
  });

  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {paths.map((p, i) => (
          <circle
            key={i}
            cx={50}
            cy={50}
            r={radius}
            fill="none"
            stroke={p.color}
            strokeWidth="18"
            strokeDasharray={`${p.dash} ${circumference - p.dash}`}
            strokeDashoffset={p.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-gray-900">{total}</span>
        <span className="text-[10px] text-gray-400 font-semibold">total</span>
      </div>
    </div>
  );
}

// ── Revenue Trend Bar Chart ───────────────────────────────────────────────────
interface TrendBucket {
  label: string;
  date: string;
  revenue: number;
  paid: number;
  leads: number;
  byChannel: Record<string, number>;
}

function RevenueTrendChart({
  buckets,
  granularity,
  onGranularityChange,
  topChannels,
}: {
  buckets: TrendBucket[];
  granularity: "daily" | "weekly";
  onGranularityChange: (g: "daily" | "weekly") => void;
  topChannels: { channel: string; cfg: ChannelConfig }[];
}) {
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxVal = useMemo(() => {
    if (metric === "revenue") return Math.max(...buckets.map((b) => b.revenue), 1);
    return Math.max(...buckets.map((b) => b.paid + b.leads), 1);
  }, [buckets, metric]);

  const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalOrders = buckets.reduce((s, b) => s + b.paid + b.leads, 0);

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <i className="ri-bar-chart-2-line text-gray-200 text-4xl mb-2"></i>
        <p className="text-sm text-gray-400">No data for this period</p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["revenue", "orders"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${metric === m ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {m === "revenue" ? "Revenue ($)" : "Orders (#)"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["daily", "weekly"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onGranularityChange(g)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${granularity === g ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {g === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Total: <strong className="text-gray-900">{metric === "revenue" ? `$${totalRevenue.toLocaleString()}` : totalOrders}</strong></span>
          <span className="text-gray-400">{buckets.length} {granularity === "daily" ? "days" : "weeks"}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Y-axis labels */}
        <div className="flex">
          <div className="w-12 flex-shrink-0 flex flex-col justify-between text-right pr-2 pb-6" style={{ height: "160px" }}>
            {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
              <span key={pct} className="text-[9px] text-gray-300 leading-none">
                {metric === "revenue" ? `$${Math.round(maxVal * pct).toLocaleString()}` : Math.round(maxVal * pct)}
              </span>
            ))}
          </div>

          {/* Bars */}
          <div className="flex-1 relative" style={{ height: "160px" }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
              <div
                key={pct}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ bottom: `${pct * 100}%` }}
              ></div>
            ))}

            {/* Bar columns */}
            <div className="absolute inset-0 flex items-end gap-px overflow-hidden">
              {buckets.map((bucket, idx) => {
                const val = metric === "revenue" ? bucket.revenue : bucket.paid + bucket.leads;
                const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                const isHovered = hoveredIdx === idx;

                return (
                  <div
                    key={bucket.date}
                    className="flex-1 flex flex-col justify-end relative group cursor-pointer"
                    style={{ height: "100%" }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none shadow-lg">
                        <p className="font-bold mb-1">{bucket.label}</p>
                        <p className="text-emerald-400">Revenue: ${bucket.revenue.toLocaleString()}</p>
                        <p className="text-sky-400">Paid: {bucket.paid}</p>
                        <p className="text-amber-400">Leads: {bucket.leads}</p>
                        {topChannels.slice(0, 3).map((ch) => {
                          const chVal = bucket.byChannel[ch.channel] ?? 0;
                          if (!chVal) return null;
                          return (
                            <p key={ch.channel} style={{ color: ch.cfg.chartColor }}>
                              {ch.cfg.label}: {chVal}
                            </p>
                          );
                        })}
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}

                    {/* Stacked bar by channel */}
                    <div
                      className="w-full rounded-t-sm transition-all duration-200 overflow-hidden"
                      style={{ height: `${heightPct}%`, minHeight: val > 0 ? "2px" : "0" }}
                    >
                      {metric === "orders" && topChannels.length > 0 ? (
                        // Stacked by channel
                        <div className="w-full h-full flex flex-col-reverse">
                          {topChannels.map((ch) => {
                            const chCount = bucket.byChannel[ch.channel] ?? 0;
                            const chPct = val > 0 ? (chCount / val) * 100 : 0;
                            return (
                              <div
                                key={ch.channel}
                                style={{ height: `${chPct}%`, backgroundColor: ch.cfg.chartColor, opacity: isHovered ? 1 : 0.85 }}
                              ></div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="w-full h-full rounded-t-sm transition-opacity"
                          style={{ backgroundColor: "#1a5c4f", opacity: isHovered ? 1 : 0.75 }}
                        ></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex ml-12 mt-1">
          {buckets.map((bucket, idx) => {
            // Show label every N buckets to avoid crowding
            const showEvery = buckets.length > 60 ? 14 : buckets.length > 30 ? 7 : buckets.length > 14 ? 3 : 1;
            const show = idx % showEvery === 0 || idx === buckets.length - 1;
            return (
              <div key={bucket.date} className="flex-1 text-center">
                {show && (
                  <span className="text-[9px] text-gray-300 whitespace-nowrap">
                    {bucket.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel legend */}
      {metric === "orders" && topChannels.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
          {topChannels.map((ch) => (
            <div key={ch.channel} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ch.cfg.chartColor }}></div>
              <span className="text-xs text-gray-500">{ch.cfg.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
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
    const ch = resolveChannel(o.referred_by);
    const cfg = getChannelConfig(ch);
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
  const [datePreset, setDatePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [letterTypeFilter, setLetterTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [orderListPage, setOrderListPage] = useState(1);
  const [trendGranularity, setTrendGranularity] = useState<"daily" | "weekly">("daily");
  const [csvExporting, setCsvExporting] = useState(false);
  const [reviewLogs, setReviewLogs] = useState<{ object_id: string; action: string; created_at: string }[]>([]);
  const [analyticsView, setAnalyticsView] = useState<"overview" | "ad_roi" | "google_ads_sync" | "meta_capi" | "backfill">("overview");
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

  // ── Date filtering ────────────────────────────────────────────────────────
  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") };
    }
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  // ── Filtered orders ───────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const created = new Date(o.created_at);
      if (created < rangeFrom || created > rangeTo) return false;
      if (orderTypeFilter === "paid" && !o.payment_intent_id) return false;
      if (orderTypeFilter === "lead" && o.payment_intent_id) return false;
      if (letterTypeFilter === "esa" && (o.letter_type === "psd" || o.confirmation_id.includes("-PSD"))) return false;
      if (letterTypeFilter === "psd" && o.letter_type !== "psd" && !o.confirmation_id.includes("-PSD")) return false;
      if (stateFilter !== "all" && (o.state ?? "") !== stateFilter) return false;
      const ch = resolveChannel(o.referred_by);
      if (channelFilter !== "all" && ch !== channelFilter) return false;
      return true;
    });
  }, [orders, rangeFrom, rangeTo, orderTypeFilter, letterTypeFilter, stateFilter, channelFilter]);

  // ── Channel breakdown ─────────────────────────────────────────────────────
  const channelStats = useMemo(() => {
    const map: Record<string, { total: number; paid: number; leads: number; revenue: number; completed: number }> = {};
    filteredOrders.forEach((o) => {
      const ch = resolveChannel(o.referred_by);
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
        cfg: getChannelConfig(channel),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  const maxTotal = Math.max(...channelStats.map((c) => c.total), 1);

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const paid = filteredOrders.filter((o) => !!o.payment_intent_id);
    const leads = filteredOrders.filter((o) => !o.payment_intent_id);
    const revenue = paid.reduce((s, o) => s + (o.price ?? 0), 0);
    const completed = filteredOrders.filter((o) => o.doctor_status === "patient_notified").length;
    const convRate = filteredOrders.length > 0 ? Math.round((paid.length / filteredOrders.length) * 100) : 0;
    return { total: filteredOrders.length, paid: paid.length, leads: leads.length, revenue, completed, convRate };
  }, [filteredOrders]);

  // ── Review request stats ──────────────────────────────────────────────────
  const reviewStats = useMemo(() => {
    // Build a set of order IDs in the current filtered period
    const filteredOrderIds = new Set(filteredOrders.map((o) => o.id));

    // Filter review logs to only those for orders in the current period
    const periodLogs = reviewLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= rangeFrom && logDate <= rangeTo && filteredOrderIds.has(log.object_id);
    });

    // Unique orders that received any review request
    const uniqueOrdersRequested = new Set(periodLogs.map((l) => l.object_id));
    const emailsSent = periodLogs.filter((l) => l.action === "trustpilot_review_email_sent").length;
    const smsSent = periodLogs.filter((l) => l.action === "trustpilot_review_sms_sent").length;
    const totalSent = uniqueOrdersRequested.size;

    // Per-order review sent lookup (for channel breakdown)
    const reviewSentByOrderId = new Set(periodLogs.map((l) => l.object_id));

    // Review rate vs completed orders
    const completed = filteredOrders.filter((o) => o.doctor_status === "patient_notified").length;
    const reviewRate = completed > 0 ? Math.round((totalSent / completed) * 100) : 0;

    return { totalSent, emailsSent, smsSent, reviewRate, reviewSentByOrderId };
  }, [reviewLogs, filteredOrders, rangeFrom, rangeTo]);

  // ── Per-channel review counts ─────────────────────────────────────────────
  const channelReviewCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (reviewStats.reviewSentByOrderId.has(o.id)) {
        const ch = resolveChannel(o.referred_by);
        map[ch] = (map[ch] ?? 0) + 1;
      }
    });
    return map;
  }, [filteredOrders, reviewStats.reviewSentByOrderId]);

  // ── Donut segments ────────────────────────────────────────────────────────
  const donutSegments = useMemo(() =>
    channelStats.map((c) => ({ label: c.cfg.label, value: c.total, color: c.cfg.chartColor })),
    [channelStats]
  );

  // ── Top channels for stacked chart ───────────────────────────────────────
  const topChannels = useMemo(() =>
    channelStats.slice(0, 6).map((c) => ({ channel: c.channel, cfg: c.cfg })),
    [channelStats]
  );

  // ── Revenue trend buckets ─────────────────────────────────────────────────
  const trendBuckets = useMemo((): TrendBucket[] => {
    if (trendGranularity === "daily") {
      const days = datePreset === "7d" ? 7 : datePreset === "30d" ? 30 : datePreset === "90d" ? 90 : 30;
      const buckets: Record<string, TrendBucket> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = {
          label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          date: key,
          revenue: 0,
          paid: 0,
          leads: 0,
          byChannel: {},
        };
      }
      filteredOrders.forEach((o) => {
        const key = o.created_at.slice(0, 10);
        if (!buckets[key]) return;
        const ch = resolveChannel(o.referred_by);
        if (o.payment_intent_id) {
          buckets[key].paid++;
          buckets[key].revenue += o.price ?? 0;
        } else {
          buckets[key].leads++;
        }
        buckets[key].byChannel[ch] = (buckets[key].byChannel[ch] ?? 0) + 1;
      });
      return Object.values(buckets);
    } else {
      // Weekly buckets
      const weekMap: Record<string, TrendBucket> = {};
      filteredOrders.forEach((o) => {
        const d = new Date(o.created_at);
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        if (!weekMap[key]) {
          weekMap[key] = {
            label: monday.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            date: key,
            revenue: 0,
            paid: 0,
            leads: 0,
            byChannel: {},
          };
        }
        const ch = resolveChannel(o.referred_by);
        if (o.payment_intent_id) {
          weekMap[key].paid++;
          weekMap[key].revenue += o.price ?? 0;
        } else {
          weekMap[key].leads++;
        }
        weekMap[key].byChannel[ch] = (weekMap[key].byChannel[ch] ?? 0) + 1;
      });
      return Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [filteredOrders, trendGranularity, datePreset]);

  // ── Orders for selected channel ───────────────────────────────────────────
  const channelOrders = useMemo(() => {
    if (!selectedChannel) return filteredOrders;
    return filteredOrders.filter((o) => resolveChannel(o.referred_by) === selectedChannel);
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

  // ── All unique channels for filter ───────────────────────────────────────
  const allChannels = useMemo(() => {
    const s = new Set(orders.map((o) => resolveChannel(o.referred_by)));
    return Array.from(s).sort();
  }, [orders]);

  // ── Revenue by channel (for AdSpendPanel ROI calc) ───────────────────────
  const revenueByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (!o.payment_intent_id) return;
      const ch = resolveChannel(o.referred_by);
      map[ch] = (map[ch] ?? 0) + (o.price ?? 0);
    });
    return map;
  }, [filteredOrders]);

  // ── Paid order count by channel (for CPA calc) ───────────────────────────
  const paidOrdersByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      if (!o.payment_intent_id) return;
      const ch = resolveChannel(o.referred_by);
      map[ch] = (map[ch] ?? 0) + 1;
    });
    return map;
  }, [filteredOrders]);

  // Date strings for AdSpendPanel
  const dateFromStr = rangeFrom.toISOString().slice(0, 10);
  const dateToStr = rangeTo.toISOString().slice(0, 10);

  // ── CSV Export handler ────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    setCsvExporting(true);
    const dateStr = new Date().toISOString().slice(0, 10);
    const channelLabel = selectedChannel ? `-${getChannelConfig(selectedChannel).label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}` : "";
    const filename = `pawtenant-orders-${datePreset}${channelLabel}-${dateStr}.csv`;
    exportToCSV(channelOrders, filename);
    setTimeout(() => setCsvExporting(false), 1500);
  }, [channelOrders, datePreset, selectedChannel]);

  return (
    <div className="space-y-5">

      {/* ── View switcher ── */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {[
          { key: "overview",       label: "Analytics Overview", icon: "ri-bar-chart-2-line" },
          { key: "ad_roi",         label: "Ad Spend & ROI",     icon: "ri-advertisement-line" },
          { key: "google_ads_sync",label: "Google Ads Sync",    icon: "ri-google-fill" },
          { key: "meta_capi",      label: "Meta CAPI",          icon: "ri-facebook-fill" },
          { key: "backfill",       label: "Conversion Backfill", icon: "ri-refresh-line" },
        ].map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setAnalyticsView(v.key as typeof analyticsView)}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${analyticsView === v.key ? "bg-white text-[#1a5c4f]" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={v.icon}></i>
            {v.label}
          </button>
        ))}
      </div>

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

      {/* ── Overview view ── */}
      {analyticsView === "overview" && <>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date presets */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { value: "7d", label: "7 Days" },
              { value: "30d", label: "30 Days" },
              { value: "90d", label: "90 Days" },
              { value: "ytd", label: "Year to Date" },
              { value: "all", label: "All Time" },
              { value: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDatePreset(p.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${datePreset === p.value ? "bg-white text-[#1a5c4f] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {datePreset === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]" />
            </div>
          )}

          <div className="h-5 w-px bg-gray-200 hidden sm:block"></div>

          {/* Order type */}
          <div className="flex items-center gap-1">
            {[
              { value: "all", label: "All Orders" },
              { value: "paid", label: "Paid Only" },
              { value: "lead", label: "Leads Only" },
            ].map((p) => (
              <button key={p.value} type="button" onClick={() => setOrderTypeFilter(p.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${orderTypeFilter === p.value ? "bg-[#1a5c4f] text-white border-[#1a5c4f]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
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
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${letterTypeFilter === p.value ? "bg-[#1a5c4f] text-white border-[#1a5c4f]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* State filter */}
          <div className="relative">
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
              <option value="all">All States</option>
              {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs"></i>
          </div>

          {/* Channel filter */}
          <div className="relative">
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer">
              <option value="all">All Channels</option>
              {allChannels.map((c) => <option key={c} value={c}>{getChannelConfig(c).label}</option>)}
            </select>
            <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs"></i>
          </div>

          <span className="text-xs text-gray-400 ml-auto">
            <strong className="text-gray-700">{filteredOrders.length}</strong> orders in range
          </span>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total Orders", value: kpis.total, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-50", sub: null },
          { label: "Paid Orders", value: kpis.paid, icon: "ri-bank-card-line", color: "text-emerald-600", bg: "bg-emerald-50", sub: null },
          { label: "Unpaid Leads", value: kpis.leads, icon: "ri-user-follow-line", color: "text-amber-600", bg: "bg-amber-50", sub: null },
          { label: "Completed", value: kpis.completed, icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f]", bg: "bg-[#f0faf7]", sub: null },
          { label: "Conversion Rate", value: `${kpis.convRate}%`, icon: "ri-percent-line", color: "text-violet-600", bg: "bg-violet-50", sub: null },
          { label: "Total Revenue", value: `$${kpis.revenue.toLocaleString()}`, icon: "ri-money-dollar-circle-line", color: "text-emerald-700", bg: "bg-emerald-50", sub: null },
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

      {/* ── Revenue Trend Chart ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Revenue Trend</h3>
            <p className="text-xs text-gray-400 mt-0.5">Daily / weekly revenue and order volume over time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#1a5c4f] inline-block"></span>Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block"></span>Paid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"></span>Leads
              </span>
            </div>
          </div>
        </div>
        <div className="px-5 py-5">
          <RevenueTrendChart
            buckets={trendBuckets}
            granularity={trendGranularity}
            onGranularityChange={setTrendGranularity}
            topChannels={topChannels}
          />
        </div>
      </div>

      {/* ── Main content: channel breakdown + donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Channel breakdown table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Traffic Source Breakdown</h3>
              <p className="text-xs text-gray-400 mt-0.5">Click a channel to drill into its orders below</p>
            </div>
            {selectedChannel && (
              <button type="button" onClick={() => setSelectedChannel(null)}
                className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer">
                <i className="ri-close-line"></i>Clear filter
              </button>
            )}
          </div>

          {channelStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                <i className="ri-bar-chart-2-line text-gray-300 text-xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-600">No data for this period</p>
              <p className="text-xs text-gray-400 mt-1">Try expanding the date range or removing filters</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50">
                <div className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channel</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Total</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Paid</div>
                <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Conv%</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</div>
                <div className="col-span-2 text-[10px] font-bold text-[#00b67a] uppercase tracking-wider text-right flex items-center justify-end gap-1">
                  <span>★</span>Reviews
                </div>
              </div>

              {channelStats.map((ch) => {
                const isSelected = selectedChannel === ch.channel;
                return (
                  <button
                    key={ch.channel}
                    type="button"
                    onClick={() => {
                      setSelectedChannel(isSelected ? null : ch.channel);
                      setOrderListPage(1);
                    }}
                    className={`w-full grid grid-cols-12 gap-2 px-5 py-3.5 text-left transition-colors cursor-pointer ${isSelected ? "bg-[#f0faf7] border-l-2 border-[#1a5c4f]" : "hover:bg-gray-50"}`}
                  >
                    {/* Channel name */}
                    <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${ch.cfg.bgColor} ${ch.cfg.borderColor} border`}>
                        <i className={`${ch.cfg.icon} ${ch.cfg.color} text-sm`}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">{ch.cfg.label}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <MiniBar value={ch.total} max={maxTotal} color={ch.cfg.chartColor} />
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{Math.round((ch.total / filteredOrders.length) * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-extrabold text-gray-900">{ch.total}</span>
                    </div>

                    {/* Paid */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-bold text-emerald-600">{ch.paid}</span>
                    </div>

                    {/* Conversion */}
                    <div className="col-span-1 flex items-center justify-end">
                      <span className={`text-sm font-bold ${ch.conversionRate >= 50 ? "text-emerald-600" : ch.conversionRate >= 25 ? "text-amber-600" : "text-red-500"}`}>
                        {ch.conversionRate}%
                      </span>
                    </div>

                    {/* Revenue */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-bold text-gray-700">${ch.revenue.toLocaleString()}</span>
                    </div>

                    {/* Reviews Requested */}
                    <div className="col-span-2 flex flex-col items-end justify-center gap-0.5">
                      {(() => {
                        const reviewCount = channelReviewCounts[ch.channel] ?? 0;
                        const reviewPct = ch.completed > 0 ? Math.round((reviewCount / ch.completed) * 100) : 0;
                        return reviewCount > 0 ? (
                          <>
                            <span className="text-sm font-bold text-[#00b67a]">{reviewCount}</span>
                            <span className="text-[10px] text-gray-400">{reviewPct}% of done</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-300 font-bold">—</span>
                        );
                      })()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: donut */}
        <div className="space-y-4">
          {/* Donut chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-extrabold text-gray-900 mb-4">Channel Mix</h3>
            <div className="flex items-center gap-4">
              <DonutChart segments={donutSegments} />
              <div className="flex-1 space-y-2 min-w-0">
                {channelStats.slice(0, 6).map((ch) => (
                  <div key={ch.channel} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ch.cfg.chartColor }}></div>
                    <span className="text-xs text-gray-600 truncate flex-1">{ch.cfg.label}</span>
                    <span className="text-xs font-bold text-gray-900 flex-shrink-0">{ch.total}</span>
                  </div>
                ))}
                {channelStats.length > 6 && (
                  <p className="text-xs text-gray-400">+{channelStats.length - 6} more channels</p>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-extrabold text-gray-900 mb-4">Period Summary</h3>
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
                  {channelStats.sort((a, b) => b.revenue - a.revenue)[0]?.cfg.label ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Best Conversion Rate</span>
                <span className="text-xs font-bold text-emerald-600">
                  {channelStats.filter((c) => c.total >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0]
                    ? `${channelStats.filter((c) => c.total >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0].conversionRate}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Trend Period</span>
                <span className="text-xs font-bold text-gray-900">
                  {trendBuckets.length > 0 ? `${fmtShort(trendBuckets[0].date)} – ${fmtShort(trendBuckets[trendBuckets.length - 1].date)}` : "—"}
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
      </div>

      {/* ── State breakdown ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-extrabold text-gray-900">Top States</h3>
          <p className="text-xs text-gray-400 mt-0.5">Orders by state in the selected period</p>
        </div>
        {stateStats.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">No state data available</div>
        ) : (
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stateStats.map(([state, count]) => (
              <div key={state} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                  <span className="text-xs font-extrabold text-[#1a5c4f]">{state}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-700">{count}</span>
                    <span className="text-[10px] text-gray-400">
                      {filteredOrders.length > 0 ? Math.round((count / filteredOrders.length) * 100) : 0}%
                    </span>
                  </div>
                  <MiniBar value={count} max={maxStateCount} color="#1a5c4f" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Order list (filtered by channel if selected) ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">
              {selectedChannel ? `Orders from ${getChannelConfig(selectedChannel).label}` : "All Orders in Period"}
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
                  ? "bg-[#f0faf7] text-[#1a5c4f] border-[#b8ddd5]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {csvExporting ? (
                <><i className="ri-checkbox-circle-fill text-[#1a5c4f]"></i>Exported!</>
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
                const ch = resolveChannel(order.referred_by);
                const cfg = getChannelConfig(ch);
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
                      <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded-full flex-shrink-0 text-[#1a5c4f] text-xs font-extrabold">
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
    </div>
  );
}
