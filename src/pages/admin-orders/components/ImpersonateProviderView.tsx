// ImpersonateProviderView — Admin view of provider portal (read-only)
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";

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
  price: number | null;
  delivery_speed: string | null;
  assessment_answers: Record<string, unknown> | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  created_at: string;
  letter_type?: string | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
}

interface Earning {
  id: string;
  order_id: string | null;
  confirmation_id: string | null;
  patient_name: string | null;
  patient_state: string | null;
  doctor_amount: number | null;
  status: string;
  paid_at: string | null;
  notes: string | null;
  payment_reference: string | null;
  created_at: string;
}

interface ProviderProfile {
  user_id: string;
  full_name: string;
  email: string | null;
  per_order_rate: number | null;
  photo_url?: string | null;
}

interface ImpersonateProviderViewProps {
  provider: ProviderProfile;
}

type TabKey = "orders" | "earnings";
type StatusFilter = "all" | "new" | "in_progress" | "completed";
type EarningsFilter = "all" | "pending" | "paid";

const DOCTOR_STATUS_LABEL: Record<string, string> = {
  pending_review: "New — Pending Review",
  in_review: "In Review",
  approved: "Approved",
  letter_sent: "Completed",
  patient_notified: "Completed",
  thirty_day_reissue: "30-Day Reissue",
};

const DOCTOR_STATUS_COLOR: Record<string, { badge: string; dot: string }> = {
  pending_review: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  in_review: { badge: "bg-sky-100 text-sky-700", dot: "bg-sky-400" },
  approved: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  letter_sent: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  patient_notified: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  thirty_day_reissue: { badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-[#e8f5f1] text-[#1a5c4f]",
  cancelled: "bg-red-100 text-red-600",
};

function isPSDOrder(order: Pick<Order, "letter_type" | "confirmation_id">): boolean {
  return order.letter_type === "psd" || order.confirmation_id.includes("-PSD");
}

function isOrderInactive(order: Pick<Order, "status" | "refunded_at">): boolean {
  return order.status === "refunded" || !!order.refunded_at || order.status === "cancelled";
}

function statusMatchesFilter(doctorStatus: string | null, filter: StatusFilter, order: Order): boolean {
  if (filter === "all") return true;
  if (filter === "new") return doctorStatus === "pending_review" && !isOrderInactive(order);
  if (filter === "in_progress") return (doctorStatus === "in_review" || doctorStatus === "approved" || doctorStatus === "thirty_day_reissue") && !isOrderInactive(order);
  if (filter === "completed") return doctorStatus === "patient_notified" || doctorStatus === "letter_sent";
  return true;
}

export default function ImpersonateProviderView({ provider }: ImpersonateProviderViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [earningsFilter, setEarningsFilter] = useState<EarningsFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      setLoadingOrders(true);
      const { data } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, first_name, last_name, phone, state, status, doctor_status, price, delivery_speed, assessment_answers, letter_url, signed_letter_url, patient_notification_sent_at, created_at, letter_type, refunded_at, refund_amount")
        .eq("doctor_user_id", provider.user_id)
        .order("created_at", { ascending: false });
      setOrders((data as Order[]) ?? []);
      setLoadingOrders(false);
    };
    loadOrders();
  }, [provider.user_id]);

  useEffect(() => {
    const loadEarnings = async () => {
      setLoadingEarnings(true);
      const { data } = await supabase
        .from("doctor_earnings")
        .select("id, order_id, confirmation_id, patient_name, patient_state, doctor_amount, status, paid_at, notes, payment_reference, created_at")
        .eq("doctor_user_id", provider.user_id)
        .order("created_at", { ascending: false });
      setEarnings((data as Earning[]) ?? []);
      setLoadingEarnings(false);
    };
    loadEarnings();
  }, [provider.user_id]);

  const summary = useMemo(() => {
    const completed = earnings.filter((e) => e.status !== "cancelled");
    const totalEarned = completed.reduce((s, e) => s + (e.doctor_amount ?? (provider.per_order_rate ?? 0)), 0);
    const paidAmount = earnings.filter((e) => e.status === "paid").reduce((s, e) => s + (e.doctor_amount ?? (provider.per_order_rate ?? 0)), 0);
    const unpaidAmount = earnings.filter((e) => e.status === "pending").reduce((s, e) => s + (e.doctor_amount ?? (provider.per_order_rate ?? 0)), 0);
    return { totalEarned, paidAmount, unpaidAmount, completedCount: completed.length };
  }, [earnings, provider.per_order_rate]);

  const paidRecords = useMemo(
    () => earnings.filter((e) => e.status === "paid").sort((a, b) => new Date(b.paid_at ?? b.created_at).getTime() - new Date(a.paid_at ?? a.created_at).getTime()),
    [earnings]
  );

  const newCount = orders.filter((o) => o.doctor_status === "pending_review" && !isOrderInactive(o)).length;
  const inProgressCount = orders.filter((o) => (o.doctor_status === "in_review" || o.doctor_status === "approved") && !isOrderInactive(o)).length;
  const completedCount = orders.filter((o) => o.doctor_status === "letter_sent" || o.doctor_status === "patient_notified").length;

  const filteredOrders = orders.filter((o) => {
    if (!statusMatchesFilter(o.doctor_status, statusFilter, o)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ").toLowerCase();
      return (
        o.confirmation_id.toLowerCase().includes(q) ||
        name.includes(q) ||
        o.email.toLowerCase().includes(q) ||
        (o.state ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredEarnings = useMemo(
    () => earnings.filter((e) => earningsFilter === "all" || e.status === earningsFilter),
    [earnings, earningsFilter]
  );

  // Summary for the selected earnings filter
  const filteredEarningsSummary = useMemo(() => {
    const total = filteredEarnings.reduce((s, e) => s + (e.doctor_amount ?? (provider.per_order_rate ?? 0)), 0);
    const count = filteredEarnings.length;
    return { total, count };
  }, [filteredEarnings, provider.per_order_rate]);

  const initials = provider.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const earningsFilterLabel: Record<EarningsFilter, string> = {
    all: "Total Earnings",
    pending: "Total Unpaid",
    paid: "Total Paid",
  };

  const earningsFilterColor: Record<EarningsFilter, string> = {
    all: "text-gray-800",
    pending: "text-amber-600",
    paid: "text-[#1a5c4f]",
  };

  return (
    <div className="space-y-3">
      {/* Provider header */}
      <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center bg-[#1a5c4f] text-white text-xs font-extrabold rounded-full flex-shrink-0 overflow-hidden">
          {provider.photo_url ? (
            <img src={provider.photo_url} alt={provider.full_name} className="w-full h-full object-cover object-top" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1a5c4f]">Viewing as: {provider.full_name}</p>
          <p className="text-xs text-[#1a5c4f]/70 truncate">{provider.email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-[#1a5c4f]/70">Rate</p>
          <p className="text-sm font-bold text-[#1a5c4f]">{provider.per_order_rate != null ? `$${provider.per_order_rate}/order` : "Not set"}</p>
        </div>
      </div>

      {/* Summary cards — 2x2 grid to avoid overflow */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Assigned", value: orders.length, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-100" },
          { label: "New / Pending", value: newCount, icon: "ri-time-line", color: "text-amber-600", bg: "bg-amber-100" },
          { label: "In Progress", value: inProgressCount, icon: "ri-stethoscope-line", color: "text-sky-600", bg: "bg-sky-100" },
          { label: "Completed", value: completedCount, icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f]", bg: "bg-[#e8f5f1]" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-6 h-6 flex items-center justify-center ${s.bg} rounded-lg flex-shrink-0`}>
                <i className={`${s.icon} ${s.color} text-xs`}></i>
              </div>
              <span className="text-[11px] text-gray-500 font-medium leading-tight">{s.label}</span>
            </div>
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main tabs */}
      <div className="flex items-center gap-1 bg-gray-100/70 rounded-xl p-1">
        {([
          { key: "orders" as TabKey, label: "Cases", icon: "ri-folder-line" },
          { key: "earnings" as TabKey, label: "Earnings", icon: "ri-money-dollar-circle-line" },
        ]).map((tab) => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap flex-1 relative flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-extrabold transition-colors cursor-pointer ${activeTab === tab.key ? "bg-white text-[#1a5c4f]" : "text-gray-500 hover:text-gray-700"}`}>
            <i className={tab.icon}></i>{tab.label}
            {tab.key === "orders" && newCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-amber-500 text-white text-[9px] font-extrabold rounded-full">
                {newCount > 9 ? "9+" : newCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ ORDERS TAB ═══ */}
      {activeTab === "orders" && (
        <div>
          {/* Filters bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 mb-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { value: "all", label: "All" },
                { value: "new", label: `New${newCount > 0 ? ` (${newCount})` : ""}` },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
              ] as { value: StatusFilter; label: string }[]).map((opt) => (
                <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
                  className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${statusFilter === opt.value ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="relative w-full">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cases..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]" />
            </div>
          </div>

          {/* Orders list */}
          {loadingOrders ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                <i className="ri-folder-open-line text-gray-400 text-lg"></i>
              </div>
              <p className="text-sm font-bold text-gray-700">
                {orders.length === 0 ? "No cases assigned" : "No cases match filters"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {orders.length === 0 ? "This provider has no assigned orders yet." : "Try changing your filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
                const doctorStatus = order.doctor_status ?? "pending_review";
                const statusConfig = DOCTOR_STATUS_COLOR[doctorStatus] ?? { badge: "bg-gray-100 text-gray-500", dot: "bg-gray-400" };
                const isNew = doctorStatus === "pending_review";
                const isLetterIssued = doctorStatus === "letter_sent" || doctorStatus === "patient_notified";
                const isThirtyDay = doctorStatus === "thirty_day_reissue";
                const isRefunded = order.status === "refunded" || !!order.refunded_at;
                const isPSD = isPSDOrder(order);

                return (
                  <div key={order.id}
                    className={`bg-white rounded-xl border p-3 ${isRefunded ? "border-red-200 bg-red-50/30 opacity-80" : isPSD ? "border-amber-200" : isNew ? "border-amber-200" : isThirtyDay ? "border-orange-200" : isLetterIssued ? "border-[#b8ddd5]" : "border-gray-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-extrabold flex-shrink-0 ${isRefunded ? "bg-red-100 text-red-600" : isLetterIssued ? "bg-[#f0faf7] text-[#1a5c4f]" : isPSD ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                          {fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <p className="text-xs font-bold text-gray-900">{fullName}</p>
                            {isNew && !isRefunded && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-extrabold rounded-full uppercase">New</span>
                            )}
                            {isRefunded && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded-full text-[9px] font-extrabold">Refunded</span>
                            )}
                            {isPSD ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-full text-[9px] font-extrabold">PSD</span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] border border-[#b8ddd5] rounded-full text-[9px] font-extrabold">ESA</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-mono">{order.confirmation_id}</span>
                            {order.state && <><span className="text-gray-200 text-[10px]">·</span><span className="text-[10px] text-gray-500 font-semibold">{order.state}</span></>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {isRefunded ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>Refunded
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusConfig.badge}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
                            {DOCTOR_STATUS_LABEL[doctorStatus] ?? doctorStatus}
                          </span>
                        )}
                        <p className="text-[10px] text-gray-400">
                          {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ EARNINGS TAB ═══ */}
      {activeTab === "earnings" && (
        <div className="space-y-3">
          {/* Earnings Summary Cards — 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Per-Order Rate", value: provider.per_order_rate != null ? `$${provider.per_order_rate}` : "TBD", icon: "ri-price-tag-3-line", color: "text-[#1a5c4f]" },
              { label: "Completed", value: summary.completedCount, icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
              { label: "Total Earned", value: `$${summary.totalEarned}`, icon: "ri-money-dollar-circle-line", color: "text-gray-800" },
              { label: "Unpaid Balance", value: `$${summary.unpaidAmount}`, icon: "ri-time-line", color: "text-amber-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0">
                    <i className={`${s.icon} ${s.color} text-xs`}></i>
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{s.label}</span>
                </div>
                <p className={`text-xl font-extrabold ${s.color}`}>{String(s.value)}</p>
              </div>
            ))}
          </div>

          {/* Breakdown bar */}
          {summary.totalEarned > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Earnings Breakdown</p>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-[#1a5c4f] rounded-l-full" style={{ width: `${Math.round((summary.paidAmount / Math.max(summary.totalEarned, 1)) * 100)}%` }}></div>
                  <div className="h-full bg-amber-400" style={{ width: `${Math.round((summary.unpaidAmount / Math.max(summary.totalEarned, 1)) * 100)}%` }}></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#1a5c4f]"></div>
                  <span className="text-[11px] font-semibold text-gray-700">Paid: <strong>${summary.paidAmount}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-[11px] font-semibold text-gray-700">Pending: <strong>${summary.unpaidAmount}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Earnings filter */}
          <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Filter:</span>
            {([
              { value: "all", label: "All" },
              { value: "pending", label: "Unpaid" },
              { value: "paid", label: "Paid" },
            ] as { value: EarningsFilter; label: string }[]).map((opt) => (
              <button key={opt.value} type="button" onClick={() => setEarningsFilter(opt.value)}
                className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${earningsFilter === opt.value ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-gray-400">{filteredEarnings.length} records</span>
          </div>

          {/* Filter summary card — shows total for selected filter */}
          {filteredEarnings.length > 0 && (
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${earningsFilter === "paid" ? "bg-[#f0faf7] border-[#b8ddd5]" : earningsFilter === "pending" ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${earningsFilter === "paid" ? "bg-[#1a5c4f]" : earningsFilter === "pending" ? "bg-amber-500" : "bg-gray-400"}`}>
                  <i className={`text-white text-xs ${earningsFilter === "paid" ? "ri-checkbox-circle-fill" : earningsFilter === "pending" ? "ri-time-line" : "ri-list-check"}`}></i>
                </div>
                <div>
                  <p className={`text-xs font-bold ${earningsFilter === "paid" ? "text-[#1a5c4f]" : earningsFilter === "pending" ? "text-amber-700" : "text-gray-700"}`}>
                    {earningsFilterLabel[earningsFilter]}
                  </p>
                  <p className="text-[10px] text-gray-400">{filteredEarningsSummary.count} record{filteredEarningsSummary.count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <p className={`text-xl font-extrabold ${earningsFilterColor[earningsFilter]}`}>
                ${filteredEarningsSummary.total}
              </p>
            </div>
          )}

          {/* Earnings list */}
          {loadingEarnings ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
            </div>
          ) : filteredEarnings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-2">
                <i className="ri-money-dollar-circle-line text-gray-400 text-lg"></i>
              </div>
              <p className="text-sm font-bold text-gray-700">No earnings records</p>
              <p className="text-xs text-gray-400 mt-1">Earnings appear when cases are completed.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEarnings.map((earning) => (
                <div key={earning.id}
                  className={`bg-white rounded-xl border p-3 ${earning.status === "paid" ? "border-[#b8ddd5]" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-xs font-bold text-gray-900">{earning.patient_name ?? "—"}</p>
                        <span className="text-[10px] text-gray-400 font-mono">{earning.confirmation_id ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {earning.patient_state && (
                          <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                            <i className="ri-map-pin-line text-gray-400"></i>{earning.patient_state}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {new Date(earning.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {earning.paid_at && (
                          <span className="text-[10px] text-[#1a5c4f] flex items-center gap-0.5">
                            <i className="ri-checkbox-circle-fill"></i>
                            Paid {new Date(earning.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      {earning.notes && (
                        <p className="text-[10px] text-gray-400 italic mt-1 truncate max-w-[200px]">&quot;{earning.notes}&quot;</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-base font-extrabold ${earning.doctor_amount != null ? "text-[#1a5c4f]" : "text-gray-300"}`}>
                        {earning.doctor_amount != null ? `$${earning.doctor_amount}` : "TBD"}
                      </p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[earning.status] ?? STATUS_STYLE.pending}`}>
                        <i className={earning.status === "paid" ? "ri-checkbox-circle-fill" : "ri-time-line"}></i>
                        {earning.status === "paid" ? "Paid" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payout History Section */}
          {paidRecords.length > 0 && earningsFilter !== "pending" && (
            <div className="mt-2">
              <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-[#1a5c4f] rounded-lg flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-white text-xs"></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1a5c4f]">Payout History</p>
                    <p className="text-[10px] text-[#1a5c4f]/70">{paidRecords.length} payment{paidRecords.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <p className="text-lg font-extrabold text-[#1a5c4f]">${summary.paidAmount}</p>
              </div>

              <div className="space-y-2">
                {paidRecords.slice(0, 10).map((record) => (
                  <div key={record.id} className="bg-white rounded-xl border border-[#b8ddd5] p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 flex items-center justify-center bg-[#e8f5f1] rounded-full flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-xs"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-xs font-bold text-gray-900">{record.patient_name ?? "—"}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] font-mono text-gray-400">{record.confirmation_id ?? "—"}</span>
                              {record.patient_state && (
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                  <i className="ri-map-pin-line"></i>{record.patient_state}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-extrabold text-[#1a5c4f] flex-shrink-0">
                            {record.doctor_amount != null ? `$${record.doctor_amount}` : "—"}
                          </p>
                        </div>
                        {record.paid_at && (
                          <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1a5c4f]">
                              <i className="ri-calendar-check-line"></i>
                              {new Date(record.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            {record.payment_reference && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full text-[10px] font-bold text-[#1a5c4f]">
                                <i className="ri-bank-card-line"></i>{record.payment_reference}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {paidRecords.length > 10 && (
                  <p className="text-center text-[10px] text-gray-400 py-1">
                    + {paidRecords.length - 10} more payments
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
