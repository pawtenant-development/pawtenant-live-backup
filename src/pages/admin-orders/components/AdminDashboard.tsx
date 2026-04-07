// AdminDashboard — Comprehensive stats + recent activity
import { useMemo, useState } from "react";

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
  // Attribution fields
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
  onTabChange: (tab: string) => void;
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

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  // Already a full name (longer than 2 chars) — return as-is
  if (state.length > 2) return state;
  return STATE_NAMES[state.toUpperCase()] ?? state;
}

// ── Combined status helper (mirrors page.tsx logic) ──────────────────────────
function getOrderDisplayStatus(order: Order): { label: string; key: string } {
  if (order.status === "cancelled") return { label: "Cancelled", key: "cancelled" };
  if (order.doctor_status === "patient_notified") return { label: "Order Completed", key: "completed" };
  // payment_intent_id is the definitive proof of payment
  const isPaid = !!order.payment_intent_id;
  if (!isPaid) return { label: "Lead (Unpaid)", key: "lead_unpaid" };
  const isAssigned = !!(order.doctor_email || (order as Order & { doctor_user_id?: string }).doctor_user_id);
  if (!isAssigned) return { label: "Lead (Paid) · Unassigned", key: "lead_paid_unassigned" };
  return { label: "Lead (Paid) · Assigned", key: "lead_paid_assigned" };
}

// ── Traffic source derivation (mirrors sync-to-sheets logic) ─────────────────
function deriveTrafficSource(order: Order): string {
  const utmSrc = (order.utm_source ?? "").toLowerCase();
  const utmMed = (order.utm_medium ?? "").toLowerCase();
  const gclid = order.gclid ?? "";
  const fbclid = order.fbclid ?? "";
  const referred = (order.referred_by ?? "").toLowerCase();

  if (gclid) return "Google Ads";
  if (utmSrc === "google" && ["cpc", "paid", "ppc", "paidsearch"].includes(utmMed)) return "Google Ads";
  if (fbclid) return "Facebook / Instagram";
  if (utmSrc === "facebook") return "Facebook";
  if (utmSrc === "instagram") return "Instagram";
  if (utmSrc === "tiktok") return "TikTok";
  if (utmSrc === "google" || utmMed === "organic") return "Google Organic";
  if (referred.includes("google")) return "Google";
  if (referred.includes("tiktok")) return "TikTok";
  if (referred.includes("facebook") || referred.includes("instagram")) return "Facebook";
  if (referred.includes("seo") || referred.includes("organic")) return "Google Organic";
  if (referred && referred !== "direct" && referred !== "unknown") return referred;
  return "Direct / Unknown";
}

const SOURCE_COLORS: Record<string, { bar: string; badge: string; icon: string }> = {
  "Google Ads":          { bar: "bg-[#1a5c4f]",  badge: "bg-[#f0faf7] text-[#1a5c4f]",   icon: "ri-google-line" },
  "Facebook / Instagram":{ bar: "bg-sky-500",     badge: "bg-sky-50 text-sky-700",         icon: "ri-facebook-circle-line" },
  "Facebook":            { bar: "bg-sky-500",     badge: "bg-sky-50 text-sky-700",         icon: "ri-facebook-circle-line" },
  "Instagram":           { bar: "bg-pink-500",    badge: "bg-pink-50 text-pink-700",       icon: "ri-instagram-line" },
  "TikTok":              { bar: "bg-gray-800",    badge: "bg-gray-100 text-gray-700",      icon: "ri-tiktok-line" },
  "Google Organic":      { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", icon: "ri-search-line" },
  "Google":              { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", icon: "ri-search-line" },
  "Direct / Unknown":    { bar: "bg-gray-300",    badge: "bg-gray-100 text-gray-500",      icon: "ri-global-line" },
};

function getSourceColor(source: string) {
  return SOURCE_COLORS[source] ?? { bar: "bg-amber-400", badge: "bg-amber-50 text-amber-700", icon: "ri-share-line" };
}

export default function AdminDashboard({ orders, doctorContacts, loading, onTabChange }: AdminDashboardProps) {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(true);

  // ── Orders that have been paid + unassigned for more than 3 hours ──────────
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

    // Current month boundaries
    const nowDate = new Date();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    const monthEnd   = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    // Only count non-cancelled, non-refunded orders for active pipeline metrics
    const activeOrders = orders.filter(o => o.status !== "cancelled" && o.status !== "refunded" && !(o as Order & { refunded_at?: string | null }).refunded_at);

    const leadUnpaid            = activeOrders.filter(o => !o.payment_intent_id).length;
    const paymentFailed         = activeOrders.filter(o => !!(o.payment_failure_reason) && !o.payment_intent_id).length;
    const abandonedCheckouts    = activeOrders.filter(o => !o.payment_intent_id && (now - new Date(o.created_at).getTime()) > ONE_HOUR).length;
    const leadPaidUnassigned    = activeOrders.filter(o => !!o.payment_intent_id && !o.doctor_email && !(o as Order & { doctor_user_id?: string }).doctor_user_id && o.doctor_status !== "patient_notified").length;
    const leadPaidAssigned      = activeOrders.filter(o => !!o.payment_intent_id && !!(o.doctor_email || (o as Order & { doctor_user_id?: string }).doctor_user_id) && o.doctor_status !== "patient_notified").length;
    const completedOrders       = activeOrders.filter(o => o.doctor_status === "patient_notified").length;
    const paidOrders            = activeOrders.filter(o => !!o.payment_intent_id).length;
    // Pending provider review = ASSIGNED orders where provider hasn't submitted yet
    // Must be paid + assigned + NOT yet completed
    const pendingProviderReview = activeOrders.filter(o =>
      !!o.payment_intent_id &&
      !!(o.doctor_email || (o as Order & { doctor_user_id?: string }).doctor_user_id) &&
      o.doctor_status !== "patient_notified"
    ).length;
    const activeProviders       = doctorContacts.filter(d => d.is_active !== false).length;
    const inactiveProviders     = doctorContacts.filter(d => d.is_active === false).length;

    // Cancelled orders placed (or cancelled) this calendar month
    const cancelledThisMonth    = orders.filter(o => {
      if (o.status !== "cancelled") return false;
      const t = new Date(o.created_at).getTime();
      return t >= monthStart && t <= monthEnd;
    }).length;

    return {
      leadUnpaid,
      paymentFailed,
      abandonedCheckouts,
      leadPaidUnassigned,
      leadPaidAssigned,
      completedOrders,
      paidOrders,
      pendingProviderReview,
      activeProviders,
      inactiveProviders,
      cancelledThisMonth,
    };
  }, [orders, doctorContacts]);

  // Recent activity: last 15 orders sorted by created_at desc
  const recentActivity = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      })
      .slice(0, 15);
  }, [orders]);

  // Revenue from paid orders (excluding cancelled)
  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => !!o.payment_intent_id && o.price != null && o.status !== "cancelled")
      .reduce((sum, o) => sum + (o.price ?? 0), 0);
  }, [orders]);

  // Conversion rate (exclude cancelled from total to get accurate rate)
  const conversionRate = useMemo(() => {
    const active = orders.filter(o => o.status !== "cancelled");
    const total = active.length;
    if (total === 0) return "0%";
    const paid = active.filter(o => !!o.payment_intent_id).length;
    return `${Math.round((paid / total) * 100)}%`;
  }, [orders]);

  // ── Traffic source breakdown ─────────────────────────────────────────────
  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, { total: number; paid: number }> = {};
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const src = deriveTrafficSource(o);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f] block mb-3"></i>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Split metric cards into two groups
  const urgentCards = [
    {
      label: "Unpaid Leads",
      value: stats.leadUnpaid,
      icon: "ri-user-follow-line",
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
      borderColor: "border-amber-200",
      tab: "orders",
      note: `${stats.abandonedCheckouts} older than 1 hour — need recovery`,
    },
    {
      label: "Payment Failed",
      value: stats.paymentFailed,
      icon: "ri-bank-card-line",
      bg: "bg-red-50",
      iconColor: "text-red-500",
      borderColor: "border-red-200",
      tab: "orders",
      note: "Card declined or insufficient funds",
    },
    {
      label: "Paid · Unassigned",
      value: stats.leadPaidUnassigned,
      icon: "ri-user-unfollow-line",
      bg: "bg-orange-50",
      iconColor: "text-orange-500",
      borderColor: "border-orange-200",
      tab: "orders",
      note: "Payment received — needs provider",
    },
    {
      label: "Pending Provider Review",
      value: stats.pendingProviderReview,
      icon: "ri-time-line",
      bg: "bg-[#f0faf7]",
      iconColor: "text-[#1a5c4f]",
      borderColor: "border-[#b8ddd5]",
      tab: "orders",
      note: "Assigned & paid — provider hasn't submitted yet",
    },
    {
      label: "Cancellations",
      value: stats.cancelledThisMonth,
      icon: "ri-forbid-2-line",
      bg: "bg-red-50",
      iconColor: "text-red-500",
      borderColor: "border-red-200",
      tab: "orders",
      note: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    },
  ];

  const performanceCards = [
    {
      label: "Lead (Paid) · Assigned",
      value: stats.leadPaidAssigned,
      icon: "ri-user-received-line",
      bg: "bg-sky-50",
      iconColor: "text-sky-600",
      borderColor: "border-sky-200",
      tab: "orders",
      note: "Provider assigned, in progress",
      isString: false,
    },
    {
      label: "Order Completed",
      value: stats.completedOrders,
      icon: "ri-checkbox-circle-line",
      bg: "bg-[#f0faf7]",
      iconColor: "text-[#1a5c4f]",
      borderColor: "border-[#b8ddd5]",
      tab: "orders",
      note: "Letter signed & delivered",
      isString: false,
    },
    {
      label: "Conversion Rate",
      value: conversionRate,
      icon: "ri-bar-chart-line",
      bg: "bg-violet-50",
      iconColor: "text-violet-600",
      borderColor: "border-violet-200",
      tab: "orders",
      note: "Leads that became paid customers",
      isString: true,
    },
    {
      label: "Active Providers",
      value: stats.activeProviders,
      icon: "ri-stethoscope-line",
      bg: "bg-[#f0faf7]",
      iconColor: "text-[#1a5c4f]",
      borderColor: "border-[#b8ddd5]",
      tab: "doctors",
      note: `${stats.inactiveProviders} inactive`,
      isString: false,
    },
    {
      label: "Total Paid Orders",
      value: stats.paidOrders,
      icon: "ri-bank-card-line",
      bg: "bg-[#f0faf7]",
      iconColor: "text-[#1a5c4f]",
      borderColor: "border-[#b8ddd5]",
      tab: "orders",
      note: "All time — includes completed",
      isString: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header with revenue strip ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mt-0.5">{orders.length} total records &middot; {doctorContacts.length} providers</p>
        </div>
        {/* Revenue + paid summary */}
        <div className="flex items-stretch gap-2 flex-wrap sm:flex-nowrap">
          <div className="bg-[#0f1e1a] rounded-xl px-4 py-3 flex items-center gap-3 min-w-[140px]">
            <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg flex-shrink-0">
              <i className="ri-money-dollar-circle-line text-[#5ecfb1] text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Total Revenue</p>
              <p className="text-lg font-extrabold text-white leading-tight">${totalRevenue.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-center gap-3 min-w-[120px]">
            <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f]/10 rounded-lg flex-shrink-0">
              <i className="ri-checkbox-circle-line text-[#1a5c4f] text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-[#1a5c4f]/60 font-medium">Paid Orders</p>
              <p className="text-lg font-extrabold text-[#1a5c4f] leading-tight">{stats.paidOrders}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 min-w-[120px]">
            <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
              <i className="ri-bar-chart-line text-violet-600 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Conversion</p>
              <p className="text-lg font-extrabold text-gray-900 leading-tight">{conversionRate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── URGENT ALERT ── */}
      {overdueUnassigned.length > 0 && !alertDismissed && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping"></span>
                <span className="relative flex w-3 h-3 rounded-full bg-red-500"></span>
              </div>
              <div>
                <p className="text-sm font-extrabold text-red-900 flex items-center gap-2">
                  Action Required
                  <span className="inline-flex items-center px-2 py-0.5 bg-red-500 text-white text-xs font-extrabold rounded-full">
                    {overdueUnassigned.length} order{overdueUnassigned.length !== 1 ? "s" : ""}
                  </span>
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  Paid {overdueUnassigned.length === 1 ? "order has" : "orders have"} been waiting for a provider for <strong>3+ hours</strong> — assign immediately
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={() => onTabChange("orders")}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-xs font-extrabold rounded-xl hover:bg-red-600 cursor-pointer transition-colors">
                <i className="ri-user-received-line"></i>Assign Now
              </button>
              <button type="button" onClick={() => setAlertExpanded(v => !v)}
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-xl bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors">
                {alertExpanded
                  ? <i className="ri-arrow-up-s-line text-sm"></i>
                  : <i className="ri-arrow-down-s-line text-sm"></i>
                }
              </button>
              <button type="button" onClick={() => setAlertDismissed(true)}
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-xl bg-red-100 text-red-400 hover:bg-red-200 hover:text-red-600 cursor-pointer transition-colors">
                <i className="ri-close-line text-sm"></i>
              </button>
            </div>
          </div>
          {alertExpanded && (
            <div className="border-t border-red-200 divide-y divide-red-100">
              <div className="hidden sm:grid grid-cols-[1fr_100px_90px_110px_100px] gap-4 px-5 py-2 bg-red-100/50 text-xs font-bold text-red-700 uppercase tracking-wider">
                <span>Patient</span><span>Order ID</span><span>State</span><span>Paid at</span><span>Waiting</span>
              </div>
              {overdueUnassigned.map((order) => {
                const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                const waitMs = Date.now() - new Date(order.created_at).getTime();
                const waitHrs = waitMs / (60 * 60 * 1000);
                const isVeryOverdue = waitHrs >= 6;
                return (
                  <div key={order.id} className="grid grid-cols-1 sm:grid-cols-[1fr_100px_90px_110px_100px] gap-2 sm:gap-4 px-5 py-3.5 items-center bg-white/70 hover:bg-white/90 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-gray-900">{fullName}</p>
                      <p className="text-xs text-gray-400 truncate">{order.email}</p>
                      {order.price != null && <p className="text-xs font-semibold text-emerald-600 mt-0.5">${order.price}</p>}
                    </div>
                    <p className="text-xs font-mono text-gray-600">{order.confirmation_id}</p>
                    <p className="text-xs font-semibold text-gray-700">{getStateName(order.state)}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                      {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${isVeryOverdue ? "bg-red-100 text-red-700 border border-red-300" : "bg-orange-100 text-orange-700 border border-orange-300"}`}>
                        <i className="ri-alarm-warning-line text-xs"></i>{fmtWaitTime(order.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="px-5 py-3 bg-red-50 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-red-700 font-semibold flex items-center gap-1.5">
                  <i className="ri-information-line"></i>Orders waiting 6+ hours shown in red.
                </p>
                <button type="button" onClick={() => onTabChange("orders")}
                  className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-xs font-extrabold rounded-xl hover:bg-red-600 cursor-pointer transition-colors">
                  <i className="ri-arrow-right-line"></i>Go to Orders Tab
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GROUP 1: Needs Attention ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Needs Attention</span>
          <div className="flex-1 h-px bg-red-100"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {urgentCards.map((card) => (
            <button key={card.label} type="button" onClick={() => onTabChange(card.tab)}
              className={`bg-white rounded-xl border ${card.borderColor} p-4 text-left hover:border-gray-300 hover:-translate-y-0.5 transition-all cursor-pointer group`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 flex items-center justify-center ${card.bg} rounded-xl`}>
                  <i className={`${card.icon} ${card.iconColor} text-base`}></i>
                </div>
                <i className="ri-arrow-right-up-line text-gray-200 group-hover:text-gray-400 transition-colors text-sm"></i>
              </div>
              <p className="text-3xl font-extrabold text-gray-900 mb-0.5">
                {(card.value as number).toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-600 leading-tight">{card.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{card.note}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── GROUP 2: Pipeline & Performance ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pipeline &amp; Performance</span>
          <div className="flex-1 h-px bg-gray-100"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {performanceCards.map((card) => (
            <button key={card.label} type="button" onClick={() => onTabChange(card.tab)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:-translate-y-0.5 transition-all cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 flex items-center justify-center ${card.bg} rounded-xl`}>
                  <i className={`${card.icon} ${card.iconColor} text-sm`}></i>
                </div>
                <i className="ri-arrow-right-up-line text-gray-200 group-hover:text-gray-400 transition-colors text-xs"></i>
              </div>
              <p className={`font-extrabold text-gray-900 mb-0.5 ${card.isString ? "text-2xl" : "text-2xl"}`}>
                {card.isString ? card.value : (card.value as number).toLocaleString()}
              </p>
              <p className="text-xs font-bold text-gray-600 leading-tight">{card.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{card.note}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Quick action row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
              <i className="ri-mail-send-line text-amber-600 text-sm"></i>
            </div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Recovery Emails Needed</p>
          </div>
          <p className="text-2xl font-extrabold text-amber-700 mb-1">{stats.abandonedCheckouts}</p>
          <p className="text-xs text-amber-700">Unpaid leads &gt; 1 hour old. Use <strong>Lead Actions</strong> in the Orders tab to send recovery emails.</p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
              <i className="ri-user-received-line text-orange-600 text-sm"></i>
            </div>
            <p className="text-xs font-bold text-orange-800 uppercase tracking-wide">Awaiting Assignment</p>
          </div>
          <p className="text-2xl font-extrabold text-orange-700 mb-1">{stats.leadPaidUnassigned}</p>
          <p className="text-xs text-orange-700">Paid orders with no provider yet. Go to <strong>Orders</strong> and filter by &ldquo;Paid Unassigned&rdquo;.</p>
        </div>

        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
              <i className="ri-time-line text-[#1a5c4f] text-sm"></i>
            </div>
            <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-wide">Pending Provider Review</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1a5c4f] mb-1">{stats.pendingProviderReview}</p>
          <p className="text-xs text-[#1a5c4f]/70">Paid &amp; assigned orders where the provider hasn&apos;t submitted the letter yet.</p>
        </div>
      </div>

      {/* Pipeline summary bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Order Pipeline</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Lead (Unpaid)",     value: stats.leadUnpaid,         color: "bg-amber-400",   textColor: "text-amber-700",  lightBg: "bg-amber-50" },
            { label: "Paid · Unassigned", value: stats.leadPaidUnassigned, color: "bg-orange-400",  textColor: "text-orange-700", lightBg: "bg-orange-50" },
            { label: "Paid · Assigned",   value: stats.leadPaidAssigned,   color: "bg-sky-400",     textColor: "text-sky-700",    lightBg: "bg-sky-50" },
            { label: "Completed",         value: stats.completedOrders,    color: "bg-[#1a5c4f]",   textColor: "text-[#1a5c4f]",  lightBg: "bg-[#f0faf7]" },
          ].map((stage) => {
            const activeTotal = Math.max(orders.filter(o => o.status !== "cancelled" && o.status !== "refunded" && !(o as Order & { refunded_at?: string | null }).refunded_at).length, 1);
            const pct = Math.round((stage.value / activeTotal) * 100);
            return (
              <div key={stage.label} className={`${stage.lightBg} rounded-xl p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold ${stage.textColor} leading-tight`}>{stage.label}</span>
                  <span className={`text-xl font-extrabold ${stage.textColor}`}>{stage.value}</span>
                </div>
                <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                  <div className={`h-full ${stage.color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{pct}% of total</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── REFERRED BY SOURCE BREAKDOWN ── */}
      {sourceBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="text-sm font-extrabold text-gray-900">Lead Source Breakdown</p>
              <p className="text-xs text-gray-400 mt-0.5">Which channels are driving leads &amp; conversions</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400 font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#1a5c4f] inline-block"></span>Paid</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block"></span>Total Leads</span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {sourceBreakdown.map(({ source, total, paid, convRate }) => {
              const cfg = getSourceColor(source);
              const paidPct = Math.round((paid / maxSourceTotal) * 100);
              const totalPct = Math.round((total / maxSourceTotal) * 100);
              return (
                <div key={source} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 ${cfg.badge}`}>
                        <i className={`${cfg.icon} text-xs`}></i>
                      </div>
                      <span className="text-xs font-bold text-gray-800 truncate">{source}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="text-xs text-gray-400 font-semibold">{total} leads</span>
                      <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${cfg.badge}`}>{paid} paid</span>
                      <span className={`text-xs font-bold w-10 text-right ${convRate >= 50 ? "text-[#1a5c4f]" : convRate >= 25 ? "text-amber-600" : "text-gray-400"}`}>{convRate}%</span>
                    </div>
                  </div>
                  {/* Stacked bar */}
                  <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-gray-200 rounded-full transition-all" style={{ width: `${totalPct}%` }}></div>
                    <div className={`absolute inset-y-0 left-0 ${cfg.bar} rounded-full transition-all`} style={{ width: `${paidPct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Summary row */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-500">
              <strong className="text-gray-700">{sourceBreakdown.reduce((s, r) => s + r.total, 0)}</strong> total leads across <strong className="text-gray-700">{sourceBreakdown.length}</strong> channels
            </p>
            <p className="text-xs text-gray-500">
              Top channel: <strong className="text-gray-700">{sourceBreakdown[0]?.source ?? "—"}</strong> ({sourceBreakdown[0]?.total ?? 0} leads)
            </p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-extrabold text-gray-900">Recent Activity</p>
            <p className="text-xs text-gray-400 mt-0.5">Latest {recentActivity.length} orders &amp; leads</p>
          </div>
          <button type="button" onClick={() => onTabChange("orders")}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#f0faf7] border border-[#b8ddd5] text-[#1a5c4f] text-xs font-bold rounded-lg hover:bg-[#e0f2ec] cursor-pointer transition-colors">
            <i className="ri-arrow-right-line"></i>View All Orders
          </button>
        </div>

        <div className="hidden md:grid grid-cols-[1fr_140px_100px_150px_130px_80px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
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
              <div key={order.id} className="grid grid-cols-1 md:grid-cols-[1fr_140px_100px_150px_130px_80px] gap-2 md:gap-3 px-5 py-3 items-center hover:bg-gray-50/60 transition-colors group cursor-default">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{fullName}</p>
                  <p className="text-xs text-gray-400 truncate">{order.email}</p>
                </div>
                <p className="hidden md:block text-xs font-mono text-gray-500 truncate">{order.confirmation_id}</p>
                <p className="hidden md:block text-xs font-semibold text-gray-700">{getStateName(order.state)}</p>
                <div className="hidden md:block">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[displayStatus.key] ?? "bg-gray-100 text-gray-500"}`}>
                    {displayStatus.label}
                  </span>
                </div>
                <div className="hidden md:block">
                  {order.doctor_name ? (
                    <p className="text-xs font-semibold text-[#1a5c4f] truncate flex items-center gap-1">
                      <i className="ri-user-heart-line flex-shrink-0"></i>{order.doctor_name}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">Unassigned</span>
                  )}
                </div>
                <div className="flex items-center justify-between md:block">
                  <p className="text-xs text-gray-400 whitespace-nowrap">{fmtRelative(order.created_at)}</p>
                  {/* Mobile-only: show status badge */}
                  <span className={`md:hidden inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[displayStatus.key] ?? "bg-gray-100 text-gray-500"}`}>
                    {displayStatus.label}
                  </span>
                </div>
              </div>
            );
          })}
          {recentActivity.length === 0 && (
            <div className="px-5 py-12 text-center">
              <i className="ri-file-list-3-line text-gray-200 text-3xl block mb-2"></i>
              <p className="text-sm text-gray-400">No orders yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Provider health */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-extrabold text-gray-900">Provider Health</p>
          <button type="button" onClick={() => onTabChange("doctors")}
            className="whitespace-nowrap text-xs text-[#1a5c4f] font-bold hover:underline cursor-pointer">
            Manage Providers &rarr;
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Active", value: stats.activeProviders, color: "text-[#1a5c4f]", bg: "bg-[#f0faf7]", border: "border-[#b8ddd5]", icon: "ri-checkbox-circle-line" },
            { label: "Inactive", value: stats.inactiveProviders, color: "text-red-500", bg: "bg-red-50", border: "border-red-200", icon: "ri-indeterminate-circle-line" },
            { label: "Total", value: doctorContacts.length, color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200", icon: "ri-stethoscope-line" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
              <i className={`${s.icon} ${s.color} text-lg block mb-1`}></i>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 font-semibold">{s.label}</p>
            </div>
          ))}
        </div>
        {doctorContacts.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No providers added yet.</p>
        )}
        {doctorContacts.length > 0 && (
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {doctorContacts.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.is_active !== false ? "bg-[#1a5c4f]" : "bg-red-400"}`}></div>
                  <span className="text-xs font-semibold text-gray-800">{d.full_name}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${d.is_active !== false ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-red-50 text-red-400"}`}>
                  {d.is_active !== false ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
