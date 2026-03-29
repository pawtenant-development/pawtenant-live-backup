import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import RefundModal from "./RefundModal";

interface ChargeSummary {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created: number;
  refunded: boolean;
  amount_refunded: number;
  receipt_url: string | null;
  payment_intent: string | null;
}

interface RefundItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  charge: string | null;
  created: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface PaymentSummary {
  total_revenue: number;
  total_refunded: number;
  net_revenue: number;
  charge_count: number;
  refund_count: number;
  available_balance: number;
  pending_balance: number;
  period_days: number;
}

interface PaymentData {
  summary: PaymentSummary;
  daily: DailyRevenue[];
  charges: ChargeSummary[];
  refunds: RefundItem[];
}

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
};

const STATUS_STYLE: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-600",
};

function downloadCSV(data: ChargeSummary[], refunds: RefundItem[], period: Period) {
  const headers = [
    "Charge ID", "Date", "Customer Name", "Customer Email", "Description",
    "Charge Status", "Refund Status", "Amount (USD)", "Amount Refunded (USD)",
    "Net Collected (USD)", "Receipt URL"
  ];
  const rows = data.map((c) => [
    c.id,
    new Date(c.created * 1000).toLocaleDateString("en-US"),
    c.customer_name ?? "",
    c.customer_email ?? "",
    c.description ?? "",
    c.status,
    c.refunded ? "Fully Refunded" : c.amount_refunded > 0 ? "Partially Refunded" : "Not Refunded",
    c.amount.toFixed(2),
    c.amount_refunded.toFixed(2),
    (c.amount - c.amount_refunded).toFixed(2),
    c.receipt_url ?? "",
  ]);

  const refundRows: string[][] = [];
  if (refunds.length > 0) {
    refundRows.push([]);
    refundRows.push(["--- REFUNDS ---"]);
    refundRows.push(["Refund ID", "Date", "Charge ID", "Reason", "Amount (USD)", "Status"]);
    refunds.forEach((r) => refundRows.push([
      r.id,
      new Date(r.created * 1000).toLocaleDateString("en-US"),
      r.charge ?? "",
      r.reason ?? "",
      r.amount.toFixed(2),
      r.status,
    ]));
  }

  const csvContent = [...[headers, ...rows], ...refundRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pawtenant-payments-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PaymentsTab() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"charges" | "refunds">("charges");
  const [selectedCharge, setSelectedCharge] = useState<ChargeSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderMap, setOrderMap] = useState<Record<string, string>>({});

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(
        `${supabaseUrl}/functions/v1/stripe-payment-history?period=${p}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const result = await res.json() as PaymentData & { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Failed to load payment data");
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    }
    setLoading(false);
  }, [supabaseUrl]);

  useEffect(() => { fetchData(period); }, [fetchData, period]);

  // Cross-reference payment_intent_id → confirmation_id
  useEffect(() => {
    supabase
      .from("orders")
      .select("payment_intent_id, confirmation_id")
      .not("payment_intent_id", "is", null)
      .then(({ data: orders }) => {
        if (!orders) return;
        const map: Record<string, string> = {};
        (orders as { payment_intent_id: string; confirmation_id: string }[]).forEach((o) => {
          if (o.payment_intent_id) map[o.payment_intent_id] = o.confirmation_id;
        });
        setOrderMap(map);
      });
  }, []);

  const handleRefunded = (chargeId: string, newRefundedAmount: number) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        charges: prev.charges.map((c) => {
          if (c.id === chargeId) {
            const fullyRefunded = newRefundedAmount >= c.amount;
            return { ...c, amount_refunded: newRefundedAmount, refunded: fullyRefunded };
          }
          return c;
        }),
        summary: {
          ...prev.summary,
          total_refunded: prev.summary.total_refunded + (newRefundedAmount - (prev.charges.find((c) => c.id === chargeId)?.amount_refunded ?? 0)),
        },
      };
    });
    setSelectedCharge(null);
  };

  const maxDaily = data ? Math.max(...data.daily.map((d) => d.revenue), 1) : 1;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const filteredCharges = data?.charges.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      (c.customer_name ?? "").toLowerCase().includes(q) ||
      (c.customer_email ?? "").toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "refunded" && c.refunded) ||
      (statusFilter === "succeeded" && !c.refunded && c.status === "succeeded") ||
      (statusFilter === "partial" && !c.refunded && c.amount_refunded > 0);
    return matchSearch && matchStatus;
  }) ?? [];

  return (
    <div>
      {/* Header + controls */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Payments &amp; Refunds</h2>
          <p className="text-xs text-gray-500 mt-0.5">Live data from Stripe. Issue refunds directly from this panel.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <button type="button" onClick={() => downloadCSV(data.charges, data.refunds, period)}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <i className="ri-download-2-line text-[#1a5c4f]"></i>Export CSV
            </button>
          )}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${period === p ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f] block mb-3"></i>
            <p className="text-sm text-gray-500">Loading Stripe data...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <i className="ri-error-warning-line text-red-400 text-2xl block mb-2"></i>
          <p className="text-sm font-bold text-red-700 mb-1">Could not load payment data</p>
          <p className="text-xs text-red-500">{error}</p>
          <button type="button" onClick={() => fetchData(period)}
            className="whitespace-nowrap mt-4 px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg cursor-pointer">Retry</button>
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Gross Revenue", value: formatCurrency(data.summary.total_revenue), icon: "ri-money-dollar-circle-line", color: "text-emerald-600", sub: `${data.summary.charge_count} transactions` },
              { label: "Net Revenue", value: formatCurrency(data.summary.net_revenue), icon: "ri-funds-line", color: "text-[#1a5c4f]", sub: "After refunds" },
              { label: "Total Refunded", value: formatCurrency(data.summary.total_refunded), icon: "ri-refund-2-line", color: "text-orange-500", sub: `${data.summary.refund_count} refunds` },
              { label: "Available Balance", value: formatCurrency(data.summary.available_balance), icon: "ri-bank-line", color: "text-teal-600", sub: `${formatCurrency(data.summary.pending_balance)} pending` },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 flex items-center justify-center">
                    <i className={`${s.icon} ${s.color} text-base`}></i>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{s.label}</span>
                </div>
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Charges / Refunds tabs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setActiveSection("charges")}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeSection === "charges" ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  <i className="ri-bank-card-line"></i>Charges
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === "charges" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {data.charges.length}
                  </span>
                </button>
                <button type="button" onClick={() => setActiveSection("refunds")}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeSection === "refunds" ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  <i className="ri-refund-2-line"></i>Refunds
                  {data.refunds.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === "refunds" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"}`}>
                      {data.refunds.length}
                    </span>
                  )}
                </button>
              </div>

              {activeSection === "charges" && (
                <div className="flex items-center gap-2">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white focus:outline-none cursor-pointer">
                    <option value="all">All Statuses</option>
                    <option value="succeeded">Succeeded</option>
                    <option value="refunded">Refunded</option>
                    <option value="partial">Partially Refunded</option>
                  </select>
                  <div className="relative">
                    <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search customer, email, ID..."
                      className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f] w-44" />
                  </div>
                </div>
              )}
            </div>

            {activeSection === "charges" && (
              <>
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_200px] gap-4 px-5 py-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <span>Customer</span><span>Date</span><span>Status</span><span className="text-right">Amount</span><span>Actions</span>
                </div>
                {filteredCharges.length === 0 ? (
                  <div className="p-12 text-center text-sm text-gray-400">No charges match your filters</div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                    {filteredCharges.map((charge) => {
                      const fullyRefunded = charge.amount_refunded >= charge.amount;
                      const canRefund = !fullyRefunded && charge.status === "succeeded";

                      return (
                        <div key={charge.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_200px] gap-2 md:gap-4 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 truncate">{charge.customer_name ?? charge.customer_email ?? "Anonymous"}</p>
                            {charge.customer_name && charge.customer_email && <p className="text-xs text-gray-400 truncate">{charge.customer_email}</p>}
                            {charge.description && <p className="text-xs text-gray-400 truncate">{charge.description}</p>}
                            <p className="text-xs font-mono text-gray-300 mt-0.5">{charge.id.slice(0, 20)}&hellip;</p>
                            {/* Order ID cross-reference */}
                            {(() => {
                              // Match via payment_intent on the charge (pi_...) → order confirmation
                              const orderId = charge.payment_intent ? orderMap[charge.payment_intent] : undefined;
                              if (orderId) {
                                return (
                                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-[#f0faf7] border border-[#b8ddd5] rounded-full text-xs font-bold text-[#1a5c4f]">
                                    <i className="ri-hashtag text-xs"></i>{orderId}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(charge.created)}</div>
                          <div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[charge.status] ?? "bg-gray-100 text-gray-500"}`}>
                              {charge.refunded ? "Refunded" : charge.amount_refunded > 0 ? "Partial Refund" : charge.status.charAt(0).toUpperCase() + charge.status.slice(1)}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-extrabold ${fullyRefunded ? "text-gray-400 line-through" : "text-emerald-600"}`}>
                              {formatCurrency(charge.amount)}
                            </p>
                            {charge.amount_refunded > 0 && (
                              <p className="text-xs text-orange-500">-{formatCurrency(charge.amount_refunded)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {charge.receipt_url ? (
                              <a href={charge.receipt_url} target="_blank" rel="noopener noreferrer"
                                className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">
                                <i className="ri-receipt-line"></i>Receipt
                              </a>
                            ) : null}
                            {canRefund ? (
                              <button type="button" onClick={() => setSelectedCharge(charge)}
                                className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 border border-orange-200 bg-orange-50 rounded-lg text-xs font-bold text-orange-600 hover:bg-orange-100 cursor-pointer transition-colors">
                                <i className="ri-refund-2-line"></i>Refund
                              </button>
                            ) : fullyRefunded ? (
                              <span className="text-xs text-gray-300 font-medium">Refunded</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeSection === "refunds" && (
              <>
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <span>Refund ID</span><span>Date</span><span>Reason</span><span className="text-right">Amount</span>
                </div>
                {data.refunds.length === 0 ? (
                  <div className="p-12 text-center">
                    <i className="ri-checkbox-circle-line text-emerald-400 text-3xl block mb-2"></i>
                    <p className="text-sm font-bold text-gray-700">No refunds in this period</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {data.refunds.map((refund) => (
                      <div key={refund.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-2 md:gap-4 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                        <div>
                          <p className="text-xs font-mono text-gray-600">{refund.id}</p>
                          {refund.charge && <p className="text-xs text-gray-400">Charge: {refund.charge}</p>}
                        </div>
                        <div className="text-xs text-gray-500">{formatDate(refund.created)}</div>
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                            {refund.reason ? refund.reason.replace(/_/g, " ") : "No reason"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-orange-500">-{formatCurrency(refund.amount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : null}

      {/* Revenue chart — pinned to bottom */}
      {data && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-5">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Daily Revenue — {PERIOD_LABELS[period]}</p>
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {data.daily.map((d) => {
              const heightPct = maxDaily > 0 ? (d.revenue / maxDaily) * 100 : 0;
              const isToday = d.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={d.date} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: period === "90d" ? "10px" : "20px" }}>
                  <div className="relative group w-full">
                    {d.revenue > 0 && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatCurrency(d.revenue)}
                      </div>
                    )}
                    <div className={`w-full rounded-t transition-all ${isToday ? "bg-[#1a5c4f]" : "bg-[#c3e8df]"} ${d.revenue === 0 ? "opacity-30" : ""}`}
                      style={{ height: `${Math.max(heightPct, d.revenue > 0 ? 4 : 2)}px` }}>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{data.daily[0]?.date ? new Date(data.daily[0].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {selectedCharge && (
        <RefundModal
          charge={selectedCharge}
          onClose={() => setSelectedCharge(null)}
          onRefunded={handleRefunded}
        />
      )}
    </div>
  );
}
