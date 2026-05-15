// AdminDashboard — Redesigned with charts, stat cards, and visual hierarchy
import { useMemo, useState, useRef, useEffect } from "react";
// Phase K3 — shared normalized classifier so dashboard aggregation
// agrees with Orders pills + filter dropdown + Live Visitors chips.
import { classifyOrder, ACQUISITION_VISUAL } from "../../../lib/acquisitionClassifier";

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  status: string;
  doctor_status: string | null;
  doctor_email: string | null;
  doctor_name: string | null;
  payment_intent_id: string | null;
  price: number | null;
  created_at: string;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  email_log?: { type: string; sentAt: string; success: boolean }[] | null;
  payment_failure_reason?: string | null;
  payment_failed_at?: string | null;
  refunded_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referred_by?: string | null;
}

interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean | null;
}

interface AdminDashboardProps {
  orders: Order[];
  doctorContacts: DoctorContact[];
  loading: boolean;
  onTabChange: (tab: string, filters?: { statusFilter?: string; sourceFilter?: string | null }) => void;
}

function fmtRelative(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWaitTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffHrs = Math.floor(diffMs / (60 * 60 * 1000));
  const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / 60000);
  if (diffHrs >= 48) return `${Math.floor(diffHrs / 24)}d ${diffHrs % 24}h`;
  if (diffHrs >= 1) return `${diffHrs}h ${diffMins}m`;
  return `${diffMins}m`;
}

const STATUS_COLOR: Record<string, string> = {
  lead_unpaid:          "bg-amber-100 text-amber-700",
  lead_paid_unassigned: "bg-orange-100 text-orange-700",
  lead_paid_assigned:   "bg-sky-100 text-sky-700",
  completed:            "bg-emerald-100 text-emerald-700",
  cancelled:            "bg-red-100 text-red-600",
};

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};

function getStateName(state: string | null): string {
  if (!state) return "—";
  if (state.length > 2) return state;
  return STATE_NAMES[state.toUpperCase()] ?? state;
}

function getOrderDisplayStatus(order: Order): { label: string; key: string } {
  if (order.status === "cancelled") return { label: "Cancelled", key: "cancelled" };
  if (order.doctor_status === "patient_notified") return { label: "Completed", key: "completed" };
  const isPaid = !!order.payment_intent_id;
  if (!isPaid) return { label: "Lead (Unpaid)", key: "lead_unpaid" };
  const isAssigned = !!(order.doctor_email || (order as Order & { doctor_user_id?: string }).doctor_user_id);
  if (!isAssigned) return { label: "Unassigned", key: "lead_paid_unassigned" };
  return { label: "In Progress", key: "lead_paid_assigned" };
}

// STRICT attribution hierarchy — no twitter/x, no weak referrer parsing.
function deriveTrafficSource(order: Order): string {
  const utmSrc = (order.utm_source ?? "").toLowerCase();
  const gclid = order.gclid ?? "";
  const fbclid = order.fbclid ?? "";

  // 1. gclid → Google Ads
  if (gclid) return "Google Ads";
  // 2. fbclid → Facebook Ads
  if (fbclid) return "Facebook / Instagram";
  // 3. utm_source → display label
  if (utmSrc) {
    if (utmSrc === "facebook") return "Facebook";
    if (utmSrc === "instagram") return "Instagram";
    if (utmSrc === "google") return "Google Organic";
    if (utmSrc === "tiktok") return "TikTok";
    return utmSrc;
  }
  // 4. Referrer handled client-side (organic_search / social_organic) and stored in attribution_json.
  // 5. Default
  return "Direct / Unknown";
}

// Phase K3 — extended to cover every normalized acquisition label the
// classifier can emit so the dashboard's per-source cards match the
// Orders pills exactly. Legacy keys ("Facebook / Instagram", "Facebook",
// "Google") preserved for any older orders / aggregations that may still
// produce them through alternate code paths.
const SOURCE_COLORS: Record<string, { bar: string; badge: string; icon: string; hex: string }> = {
  "Google Ads":           { bar: "bg-orange-500",  badge: "bg-orange-50 text-orange-600",   icon: "ri-google-line",           hex: "#f97316" },
  "Google Organic":       { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", icon: "ri-search-2-line",         hex: "#10b981" },
  "Facebook Paid":        { bar: "bg-[#1877F2]",   badge: "bg-blue-50 text-[#1877F2]",       icon: "ri-facebook-circle-line",  hex: "#1877F2" },
  "Facebook Organic":     { bar: "bg-sky-500",     badge: "bg-blue-50 text-blue-600",        icon: "ri-facebook-line",         hex: "#0ea5e9" },
  "Instagram":            { bar: "bg-pink-500",    badge: "bg-pink-50 text-pink-600",        icon: "ri-instagram-line",        hex: "#ec4899" },
  "Reddit":               { bar: "bg-orange-600",  badge: "bg-orange-50 text-orange-700",    icon: "ri-reddit-line",           hex: "#ea580c" },
  "TikTok":               { bar: "bg-gray-800",    badge: "bg-gray-100 text-gray-900",       icon: "ri-tiktok-line",           hex: "#1f2937" },
  "Microsoft Ads":        { bar: "bg-sky-700",     badge: "bg-sky-50 text-sky-700",          icon: "ri-microsoft-line",        hex: "#0369a1" },
  "ChatGPT":              { bar: "bg-emerald-600", badge: "bg-emerald-50 text-emerald-700",  icon: "ri-openai-line",           hex: "#059669" },
  "Claude":               { bar: "bg-amber-600",   badge: "bg-amber-50 text-amber-700",      icon: "ri-sparkling-2-line",      hex: "#d97706" },
  "Gemini":               { bar: "bg-indigo-600",  badge: "bg-indigo-50 text-indigo-700",    icon: "ri-gemini-line",           hex: "#4f46e5" },
  "Perplexity":           { bar: "bg-slate-700",   badge: "bg-slate-100 text-slate-700",     icon: "ri-questionnaire-line",    hex: "#334155" },
  "Email Recovery":       { bar: "bg-violet-500",  badge: "bg-violet-50 text-violet-600",    icon: "ri-mail-send-line",        hex: "#8b5cf6" },
  "Referral":             { bar: "bg-teal-500",    badge: "bg-teal-50 text-teal-600",        icon: "ri-share-forward-line",    hex: "#14b8a6" },
  "Direct / Unknown":     { bar: "bg-gray-300",    badge: "bg-gray-100 text-gray-500",       icon: "ri-cursor-line",           hex: "#d1d5db" },
  // Legacy keys preserved for backward compat against any aggregation
  // path that may still emit the pre-K labels.
  "Facebook / Instagram": { bar: "bg-sky-500",     badge: "bg-sky-50 text-sky-700",          icon: "ri-facebook-circle-line",  hex: "#0ea5e9" },
  "Facebook":             { bar: "bg-sky-500",     badge: "bg-sky-50 text-sky-700",          icon: "ri-facebook-circle-line",  hex: "#0ea5e9" },
  "Google":               { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700",  icon: "ri-search-line",           hex: "#10b981" },
};
// Phase K3 — reference: ACQUISITION_VISUAL imported above is the source
// of truth for chip styling on Orders + Live Visitors. SOURCE_COLORS
// (bar / hex visuals) is dashboard-specific and stays here to preserve
// the per-source bar chart and hex codes used by SVG donut segments.
void ACQUISITION_VISUAL;

function getSourceColor(source: string) {
  return SOURCE_COLORS[source] ?? { bar: "bg-amber-400", badge: "bg-amber-50 text-amber-700", icon: "ri-share-line", hex: "#fbbf24" };
}

// ── Donut Chart Component ────────────────────────────────────────────────────
interface DonutSegment { label: string; value: number; color: string; lightBg: string; textColor: string }

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const size = 140;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const [hovered, setHovered] = useState<number | null>(null);

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const pct = total > 0 ? seg.value / total : 0;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = (offset / total) * 360 - 90;
    offset += seg.value;
    return { ...seg, dash, gap, rotation, pct, i };
  });

  const hoveredSeg = hovered !== null ? arcs[hovered] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-0">
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={hovered === i ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              strokeDashoffset={0}
              strokeLinecap="butt"
              transform={`rotate(${arc.rotation} ${cx} ${cy})`}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ opacity: hovered !== null && hovered !== i ? 0.4 : 1 }}
            />
          ))}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoveredSeg ? (
            <>
              <span className="text-xl font-extrabold text-gray-900 leading-none">{hoveredSeg.value}</span>
              <span className="text-[9px] text-gray-500 font-semibold mt-0.5 text-center leading-tight px-2">{hoveredSeg.label}</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-extrabold text-gray-900 leading-none">{total}</span>
              <span className="text-[9px] text-gray-400 font-semibold mt-0.5">Total</span>
            </>
          )}
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-col gap-2 flex-1 w-full">
        {arcs.map((arc, i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${hovered === i ? arc.lightBg : "hover:bg-gray-50"}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: arc.color }}></span>
              <span className="text-xs font-semibold text-gray-700 truncate">{arc.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-extrabold text-gray-900">{arc.value}</span>
              <span className="text-[10px] text-gray-400 w-8 text-right">{total > 0 ? Math.round((arc.value / total) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini Sparkline Bar Chart ─────────────────────────────────────────────────
function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${color} transition-all`}
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.5 }}
        ></div>
      ))}
    </div>
  );
}

export default function AdminDashboard({ orders, doctorContacts, loading, onTabChange }: AdminDashboardProps) {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(true);

  const overdueUnassigned = useMemo(() => {
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    return orders
      .filter(o =>
        o.status !== "cancelled" &&
        o.status !== "refunded" &&
        !(o as Order & { refunded_at?: string | null }).refunded_at &&
        !!o.payment_intent_id &&
        !o.doctor_email &&
        !(o as Order & { doctor_user_id?: string }).doctor_user_id &&
        o.doctor_status !== "patient_notified" &&
        (Date.now() - new Date(o.created_at).getTime()) > THREE_HOURS
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [orders]);

  const stats = useMemo(() => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const nowDate = new Date();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    const monthEnd   = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    const activeOrders = orders.filter(o => o.status !== "cancelled" && o.status !== "refunded" && !(o as Order & { refunded_at?: string | null }).refunded_at);

    const leadUnpaid            = activeOrders.filter(o => !o.payment_intent_id).length;
    const paymentFailed         = activeOrders.filter(o => !!(o.payment_failure_reason) && !o.payment_intent_id).length;
    const abandonedCheckouts    = activeOrders.filter(o => !o.payment_intent_id && (now - new Date(o.created_at).getTime()) > ONE_HOUR).length;
    const leadPaidUnassigned    = activeOrders.filter(o => !!o.payment_intent_id && (o.doctor_status === "provider_rejected" || o.doctor_status === "unassigned" || (!o.doctor_email && !(o as Order & { doctor_user_id?: string }).doctor_user_id)) && o.doctor_status !== "patient_notified").length;
    const leadPaidAssigned      = activeOrders.filter(o => !!o.payment_intent_id && !!(o.doctor_email || (o as Order & { doctor_user_id?: string }).doctor_user_id) && o.doctor_status !== "patient_notified").length;
    const completedOrders       = activeOrders.filter(o => o.doctor_status === "patient_notified").length;
    const paidOrders            = activeOrders.filter(o => !!o.payment_intent_id).length;
    const pendingProviderReview = activeOrders.filter(o =>
      !!o.payment_intent_id &&
      !!(o.doctor_email || (o as Order & { doctor_user_id?: string }).doctor_user_id) &&
      o.doctor_status !== "patient_notified"
    ).length;
    const activeProviders       = doctorContacts.filter(d => d.is_active !== false).length;
    const inactiveProviders     = doctorContacts.filter(d => d.is_active === false).length;
    const cancelledThisMonth    = orders.filter(o => {
      if (o.status !== "cancelled") return false;
      const t = new Date(o.created_at).getTime();
      return t >= monthStart && t <= monthEnd;
    }).length;

    return {
      leadUnpaid, paymentFailed, abandonedCheckouts,
      leadPaidUnassigned, leadPaidAssigned, completedOrders,
      paidOrders, pendingProviderReview, activeProviders,
      inactiveProviders, cancelledThisMonth,
    };
  }, [orders, doctorContacts]);

  const recentActivity = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 12);
  }, [orders]);

  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => !!o.payment_intent_id && o.price != null && o.status !== "cancelled")
      .reduce((sum, o) => sum + (o.price ?? 0), 0);
  }, [orders]);

  const conversionRate = useMemo(() => {
    const active = orders.filter(o => o.status !== "cancelled");
    const total = active.length;
    if (total === 0) return 0;
    const paid = active.filter(o => !!o.payment_intent_id).length;
    return Math.round((paid / total) * 100);
  }, [orders]);

  // Last 7 days order counts for sparkline
  const last7DaysCounts = useMemo(() => {
    const counts = Array(7).fill(0);
    const now = Date.now();
    orders.forEach(o => {
      const diffDays = Math.floor((now - new Date(o.created_at).getTime()) / (86400000));
      if (diffDays < 7) counts[6 - diffDays] += 1;
    });
    return counts;
  }, [orders]);

  const last7DaysRevenue = useMemo(() => {
    const counts = Array(7).fill(0);
    const now = Date.now();
    orders.filter(o => !!o.payment_intent_id && o.status !== "cancelled").forEach(o => {
      const diffDays = Math.floor((now - new Date(o.created_at).getTime()) / (86400000));
      if (diffDays < 7) counts[6 - diffDays] += (o.price ?? 0);
    });
    return counts;
  }, [orders]);

  const sourceBreakdown = useMemo(() => {
    // Phase K3 — bucket by normalized acquisition label so the dashboard
    // card values match what the OrderCard pill + Orders filter show.
    // Single classifyOrder() pass per row keeps perf identical to the
    // previous deriveTrafficSource() implementation.
    const counts: Record<string, { total: number; paid: number }> = {};
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const src = classifyOrder(o).label;
      if (!counts[src]) counts[src] = { total: 0, paid: 0 };
      counts[src].total += 1;
      if (o.payment_intent_id) counts[src].paid += 1;
    }
    return Object.entries(counts)
      .map(([source, { total, paid }]) => ({
        source,
        total,
        paid,
        convRate: total > 0 ? Math.round((paid / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [orders]);

  const maxSourceTotal = useMemo(() => Math.max(...sourceBreakdown.map(s => s.total), 1), [sourceBreakdown]);

  // Pipeline donut data
  const activeTotal = useMemo(() => {
    return orders.filter(o => o.status !== "cancelled" && o.status !== "refunded" && !(o as Order & { refunded_at?: string | null }).refunded_at).length;
  }, [orders]);

  const pipelineSegments: DonutSegment[] = [
    { label: "Lead (Unpaid)",     value: stats.leadUnpaid,         color: "#f59e0b", lightBg: "bg-amber-50",   textColor: "text-amber-700" },
    { label: "Paid · Unassigned", value: stats.leadPaidUnassigned, color: "#f97316", lightBg: "bg-orange-50",  textColor: "text-orange-700" },
    { label: "Paid · Assigned",   value: stats.leadPaidAssigned,   color: "#38bdf8", lightBg: "bg-sky-50",     textColor: "text-sky-700" },
    { label: "Completed",         value: stats.completedOrders,    color: "#3b6ea5", lightBg: "bg-[#e8f0f9]",  textColor: "text-[#3b6ea5]" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── URGENT ALERT ── */}
      {overdueUnassigned.length > 0 && !alertDismissed && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping"></span>
                <span className="relative flex w-2.5 h-2.5 rounded-full bg-red-500"></span>
              </div>
              <div>
                <p className="text-xs font-extrabold text-red-900 flex items-center gap-2">
                  Action Required
                  <span className="inline-flex items-center px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-extrabold rounded-full">
                    {overdueUnassigned.length}
                  </span>
                </p>
                <p className="text-[10px] text-red-700 mt-0.5">
                  Paid {overdueUnassigned.length === 1 ? "order" : "orders"} waiting 3+ hours — assign now
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button type="button" onClick={() => onTabChange("orders", { statusFilter: "paid_unassigned" })}
                className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs font-extrabold rounded-lg hover:bg-red-600 cursor-pointer transition-colors">
                <i className="ri-user-received-line"></i>Assign
              </button>
              <button type="button" onClick={() => setAlertExpanded(v => !v)}
                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors">
                <i className={`text-sm ${alertExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
              </button>
              <button type="button" onClick={() => setAlertDismissed(true)}
                className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg bg-red-100 text-red-400 hover:bg-red-200 cursor-pointer transition-colors">
                <i className="ri-close-line text-sm"></i>
              </button>
            </div>
          </div>
          {alertExpanded && (
            <div className="border-t border-red-200 divide-y divide-red-100">
              <div className="hidden sm:grid grid-cols-[1fr_100px_90px_110px_100px] gap-4 px-4 py-2 bg-red-100/50 text-[10px] font-bold text-red-700 uppercase tracking-wider">
                <span>Patient</span><span>Order ID</span><span>State</span><span>Paid at</span><span>Waiting</span>
              </div>
              {overdueUnassigned.map((order) => {
                const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                const waitMs = Date.now() - new Date(order.created_at).getTime();
                const waitHrs = waitMs / (60 * 60 * 1000);
                const isVeryOverdue = waitHrs >= 6;
                return (
                  <div key={order.id} className="grid grid-cols-1 sm:grid-cols-[1fr_100px_90px_110px_100px] gap-2 sm:gap-4 px-4 py-3 items-center bg-white/70 hover:bg-white/90 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-gray-900">{fullName}</p>
                      <p className="text-[10px] text-gray-400 truncate">{order.email}</p>
                      {order.price != null && <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">${order.price}</p>}
                    </div>
                    <p className="text-[10px] font-mono text-gray-600">{order.confirmation_id}</p>
                    <p className="text-[10px] font-semibold text-gray-700">{getStateName(order.state)}</p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                      {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isVeryOverdue ? "bg-red-100 text-red-700 border border-red-300" : "bg-orange-100 text-orange-700 border border-orange-300"}`}>
                        <i className="ri-alarm-warning-line text-[10px]"></i>{fmtWaitTime(order.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="px-4 py-2.5 bg-red-50 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] text-red-700 font-semibold flex items-center gap-1">
                  <i className="ri-information-line"></i>Orders waiting 6+ hours shown in red.
                </p>
                <button type="button" onClick={() => onTabChange("orders", { statusFilter: "paid_unassigned" })}
                  className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-[10px] font-extrabold rounded-lg hover:bg-red-600 cursor-pointer transition-colors">
                  <i className="ri-arrow-right-line"></i>Go to Orders
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ROW 1: 4 Hero Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Revenue */}
        <div
          className="bg-[#1e3a5f] rounded-2xl p-4 flex flex-col justify-between min-h-[110px] col-span-2 lg:col-span-1 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onTabChange("payments")}
          title="View Payments"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl">
              <i className="ri-money-dollar-circle-line text-[#93c5fd] text-base"></i>
            </div>
            <MiniBarChart data={last7DaysRevenue} color="bg-[#93c5fd]" />
          </div>
          <div>
            <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-extrabold text-white leading-tight">${totalRevenue.toLocaleString()}</p>
            <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-1">{stats.paidOrders} paid orders <i className="ri-arrow-right-line text-white/20"></i></p>
          </div>
        </div>

        {/* Conversion Rate */}
        <div
          className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col justify-between min-h-[110px] cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onTabChange("analytics")}
          title="View Analytics"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 flex items-center justify-center bg-[#e8f0f9] rounded-xl">
              <i className="ri-percent-line text-[#3b6ea5] text-base"></i>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                {conversionRate >= 50 ? "Good" : conversionRate >= 25 ? "Fair" : "Low"}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Conversion</p>
            <p className="text-2xl font-extrabold text-gray-900 leading-tight">{conversionRate}%</p>
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">Leads → paid <i className="ri-arrow-right-line text-gray-300"></i></p>
          </div>
        </div>

        {/* Completed */}
        <div
          className="bg-[#e8f0f9] border border-[#b8cce4] rounded-2xl p-4 flex flex-col justify-between min-h-[110px] cursor-pointer hover:bg-[#dbeafe] transition-colors"
          onClick={() => onTabChange("orders", { statusFilter: "completed" })}
          title="View Completed Orders"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 flex items-center justify-center bg-[#3b6ea5]/10 rounded-xl">
              <i className="ri-checkbox-circle-line text-[#3b6ea5] text-base"></i>
            </div>
            <MiniBarChart data={last7DaysCounts} color="bg-[#3b6ea5]" />
          </div>
          <div>
            <p className="text-[10px] text-[#3b6ea5]/60 font-semibold uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-extrabold text-[#3b6ea5] leading-tight">{stats.completedOrders}</p>
            <p className="text-[10px] text-[#3b6ea5]/50 mt-0.5 flex items-center gap-1">Letters delivered <i className="ri-arrow-right-line text-[#3b6ea5]/30"></i></p>
          </div>
        </div>

        {/* Needs Attention */}
        <div
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col justify-between min-h-[110px] cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => onTabChange("orders", { statusFilter: "paid_unassigned" })}
          title="View Orders Needing Action"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-xl">
              <i className="ri-alarm-warning-line text-amber-600 text-base"></i>
            </div>
            {(stats.leadPaidUnassigned + stats.paymentFailed) > 0 && (
              <span className="text-[10px] font-extrabold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full animate-pulse">
                Urgent
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Needs Action</p>
            <p className="text-2xl font-extrabold text-amber-700 leading-tight">{stats.leadPaidUnassigned + stats.paymentFailed}</p>
            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">Unassigned + failed <i className="ri-arrow-right-line text-amber-400"></i></p>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Pipeline Donut + Quick Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pipeline Donut Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-extrabold text-gray-900">Order Pipeline</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{activeTotal} active orders</p>
            </div>
            <button type="button" onClick={() => onTabChange("orders", { statusFilter: "all" })}
              className="whitespace-nowrap text-[10px] font-bold text-[#3b6ea5] hover:underline cursor-pointer flex items-center gap-1">
              View all <i className="ri-arrow-right-line"></i>
            </button>
          </div>
          <DonutChart segments={pipelineSegments} total={activeTotal} />
        </div>

        {/* Quick action metrics */}
        <div className="flex flex-col gap-3">
          {/* Unassigned alert card */}
          <div
            className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-orange-100 transition-colors"
            onClick={() => onTabChange("orders", { statusFilter: "paid_unassigned" })}
          >
            <div className="w-12 h-12 flex items-center justify-center bg-orange-100 rounded-xl flex-shrink-0">
              <i className="ri-user-unfollow-line text-orange-500 text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-orange-800">Paid · Unassigned</p>
              <p className="text-[10px] text-orange-600 mt-0.5">Needs provider assignment</p>
            </div>
            <div className="text-right flex-shrink-0 flex items-center gap-2">
              <p className="text-3xl font-extrabold text-orange-600">{stats.leadPaidUnassigned}</p>
              <i className="ri-arrow-right-s-line text-orange-400 text-lg"></i>
            </div>
          </div>

          {/* Pending review — paid + assigned, awaiting provider submission */}
          <div
            className="bg-[#e8f0f9] border border-[#b8cce4] rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-[#dbeafe] transition-colors"
            onClick={() => onTabChange("orders", { statusFilter: "under_review" })}
          >
            <div className="w-12 h-12 flex items-center justify-center bg-[#dbeafe] rounded-xl flex-shrink-0">
              <i className="ri-time-line text-[#3b6ea5] text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#3b6ea5]">Pending Provider Review</p>
              <p className="text-[10px] text-[#3b6ea5]/60 mt-0.5">Assigned, awaiting submission</p>
            </div>
            <div className="text-right flex-shrink-0 flex items-center gap-2">
              <p className="text-3xl font-extrabold text-[#3b6ea5]">{stats.pendingProviderReview}</p>
              <i className="ri-arrow-right-s-line text-[#3b6ea5]/40 text-lg"></i>
            </div>
          </div>

          {/* Payment failed */}
          <div
            className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-red-100 transition-colors"
            onClick={() => onTabChange("orders", { statusFilter: "payment_failed" })}
          >
            <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
              <i className="ri-bank-card-line text-red-500 text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-800">Payment Failed</p>
              <p className="text-[10px] text-red-600 mt-0.5">Stripe payment failures</p>
            </div>
            <div className="text-right flex-shrink-0 flex items-center gap-2">
              <p className="text-3xl font-extrabold text-red-500">{stats.paymentFailed}</p>
              <i className="ri-arrow-right-s-line text-red-400 text-lg"></i>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Traffic Source Bar Chart + Provider Health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Traffic Source Chart */}
        {sourceBreakdown.length > 0 && (
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-extrabold text-gray-900">Lead Sources</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Click any row to filter orders by channel</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-400 font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#3b6ea5] inline-block"></span>Paid</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block"></span>Total</span>
              </div>
            </div>
            <div className="space-y-3">
              {sourceBreakdown.map(({ source, total, paid, convRate }) => {
                const cfg = getSourceColor(source);
                const paidPct = Math.round((paid / maxSourceTotal) * 100);
                const totalPct = Math.round((total / maxSourceTotal) * 100);
                return (
                  <div
                    key={source}
                    className="group cursor-pointer rounded-xl p-2 -mx-2 hover:bg-gray-50 transition-colors"
                    onClick={() => onTabChange("orders", { statusFilter: "all", sourceFilter: source })}
                    title={`View all ${source} orders`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 ${cfg.badge}`}>
                          <i className={`${cfg.icon} text-xs`}></i>
                        </div>
                        <span className="text-xs font-bold text-gray-800 truncate">{source}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span className="text-[10px] text-gray-400">{total} leads</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${cfg.badge}`}>{paid} paid</span>
                        <span className={`text-xs font-extrabold w-9 text-right ${convRate >= 50 ? "text-[#3b6ea5]" : convRate >= 25 ? "text-amber-600" : "text-gray-400"}`}>{convRate}%</span>
                        <i className="ri-arrow-right-s-line text-gray-300 group-hover:text-gray-500 transition-colors text-sm"></i>
                      </div>
                    </div>
                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-gray-200 rounded-full transition-all" style={{ width: `${totalPct}%` }}></div>
                      <div className={`absolute inset-y-0 left-0 ${cfg.bar} rounded-full transition-all`} style={{ width: `${paidPct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
              <span><strong className="text-gray-700">{sourceBreakdown.reduce((s, r) => s + r.total, 0)}</strong> total leads across <strong className="text-gray-700">{sourceBreakdown.length}</strong> channels</span>
              <span>Top: <strong className="text-gray-700">{sourceBreakdown[0]?.source ?? "—"}</strong></span>
            </div>
          </div>
        )}

        {/* Provider Health */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-extrabold text-gray-900">Providers</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{doctorContacts.length} total</p>
            </div>
            <button type="button" onClick={() => onTabChange("doctors")}
              className="whitespace-nowrap text-[10px] font-bold text-[#3b6ea5] hover:underline cursor-pointer flex items-center gap-1">
              Manage <i className="ri-arrow-right-line"></i>
            </button>
          </div>

          {/* Active vs Inactive visual */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-[#3b6ea5]">{stats.activeProviders}</p>
              <p className="text-[10px] text-[#3b6ea5]/60 font-semibold mt-0.5">Active</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-red-500">{stats.inactiveProviders}</p>
              <p className="text-[10px] text-red-400 font-semibold mt-0.5">Inactive</p>
            </div>
          </div>

          {/* Active bar */}
          {doctorContacts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                <span>Active rate</span>
                <span className="font-bold text-[#3b6ea5]">{Math.round((stats.activeProviders / doctorContacts.length) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3b6ea5] rounded-full transition-all"
                  style={{ width: `${Math.round((stats.activeProviders / doctorContacts.length) * 100)}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Provider list */}
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {doctorContacts.length === 0 && (
              <p className="text-[10px] text-gray-400 text-center py-4">No providers added yet.</p>
            )}
            {doctorContacts.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.is_active !== false ? "bg-[#3b6ea5]" : "bg-red-400"}`}></div>
                  <span className="text-xs font-semibold text-gray-800 truncate">{d.full_name}</span>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${d.is_active !== false ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-red-50 text-red-400"}`}>
                  {d.is_active !== false ? "Active" : "Off"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 4: Recent Activity ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-extrabold text-gray-900">Recent Activity</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Latest {recentActivity.length} orders &amp; leads</p>
          </div>
          <button type="button" onClick={() => onTabChange("orders", { statusFilter: "all" })}
            className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#e8f0f9] border border-[#b8cce4] text-[#3b6ea5] text-[10px] font-bold rounded-lg hover:bg-[#e0f2ec] cursor-pointer transition-colors">
            <i className="ri-arrow-right-line"></i>View All
          </button>
        </div>

        <div className="hidden md:grid grid-cols-[1fr_130px_80px_140px_120px_70px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          <span>Patient</span>
          <span>Order ID</span>
          <span>State</span>
          <span>Status</span>
          <span>Provider</span>
          <span>Time</span>
        </div>

        <div className="divide-y divide-gray-50">
          {recentActivity.map((order) => {
            const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
            const displayStatus = getOrderDisplayStatus(order);
            return (
              <div key={order.id} className="grid grid-cols-1 md:grid-cols-[1fr_130px_80px_140px_120px_70px] gap-1.5 md:gap-3 px-5 py-3 items-center hover:bg-gray-50/60 transition-colors cursor-default">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#e8f0f9] border border-[#b8cce4] flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-extrabold text-[#3b6ea5]">
                      {(order.first_name?.[0] ?? order.email[0]).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{fullName}</p>
                    <p className="text-[10px] text-gray-400 truncate">{order.email}</p>
                  </div>
                </div>
                <p className="hidden md:block text-[10px] font-mono text-gray-500 truncate">{order.confirmation_id}</p>
                <p className="hidden md:block text-[10px] font-semibold text-gray-700">{getStateName(order.state)}</p>
                <div className="hidden md:block">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[displayStatus.key] ?? "bg-gray-100 text-gray-500"}`}>
                    {displayStatus.label}
                  </span>
                </div>
                <div className="hidden md:block">
                  {order.doctor_name ? (
                    <p className="text-[10px] font-semibold text-[#3b6ea5] truncate flex items-center gap-1">
                      <i className="ri-user-heart-line flex-shrink-0"></i>{order.doctor_name}
                    </p>
                  ) : (
                    <span className="text-[10px] text-gray-300">Unassigned</span>
                  )}
                </div>
                <div className="flex items-center justify-between md:block">
                  <p className="text-[10px] text-gray-400 whitespace-nowrap">{fmtRelative(order.created_at)}</p>
                  <span className={`md:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[displayStatus.key] ?? "bg-gray-100 text-gray-500"}`}>
                    {displayStatus.label}
                  </span>
                </div>
              </div>
            );
          })}
          {recentActivity.length === 0 && (
            <div className="px-5 py-12 text-center">
              <i className="ri-file-list-3-line text-gray-200 text-3xl block mb-2"></i>
              <p className="text-xs text-gray-400">No orders yet</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
