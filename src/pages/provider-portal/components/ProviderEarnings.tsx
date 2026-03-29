// ProviderEarnings — Provider's own earnings view
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface OrderInfo {
  status: string;
  doctor_status: string | null;
  refunded_at: string | null;
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
  orders?: OrderInfo | null;
}

interface ProviderEarningsProps {
  userId: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-[#e8f5f1] text-[#1a5c4f]",
  cancelled: "bg-red-100 text-red-600",
};

type ActiveTab = "overview" | "payout-history";

export default function ProviderEarnings({ userId }: ProviderEarningsProps) {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [perOrderRate, setPerOrderRate] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  useEffect(() => {
    const load = async () => {
      const [earningsRes, profileRes] = await Promise.all([
        supabase
          .from("doctor_earnings")
          .select("id, order_id, confirmation_id, patient_name, patient_state, doctor_amount, status, paid_at, notes, payment_reference, created_at, orders!order_id(status, doctor_status, refunded_at)")
          .eq("doctor_user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("doctor_profiles")
          .select("per_order_rate")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const raw = (earningsRes.data as Earning[]) ?? [];

      // Only show earnings for completed orders, or already-paid earnings
      // Rule: pending earnings → only if order doctor_status = "patient_notified" AND not refunded/cancelled
      //       paid earnings    → always show (payment was already issued)
      const filtered = raw.filter((e) => {
        if (e.status === "paid") return true; // always show paid earnings
        const order = e.orders as OrderInfo | null;
        if (!order) return false; // no linked order → hide pending/unknown
        if (
          order.refunded_at ||
          order.status === "refunded" ||
          order.status === "cancelled"
        ) return false; // refunded/cancelled → never show unpaid earnings
        return order.doctor_status === "patient_notified"; // only show if fully completed
      });

      setEarnings(filtered);
      setPerOrderRate((profileRes.data as { per_order_rate: number | null } | null)?.per_order_rate ?? null);
      setLoading(false);
    };
    load();
  }, [userId]);

  // ── Real-time: update per_order_rate the moment admin saves it ──
  useEffect(() => {
    const channel = supabase
      .channel(`earnings-profile-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "doctor_profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as { per_order_rate: number | null };
          if (updated.per_order_rate !== undefined) {
            setPerOrderRate(updated.per_order_rate ?? null);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const summary = useMemo(() => {
    const completed = earnings.filter((e) => e.status !== "cancelled");
    const totalEarned = completed.reduce((s, e) => s + (e.doctor_amount ?? (perOrderRate ?? 0)), 0);
    const paidAmount = earnings.filter((e) => e.status === "paid").reduce((s, e) => s + (e.doctor_amount ?? (perOrderRate ?? 0)), 0);
    const unpaidAmount = earnings.filter((e) => e.status === "pending").reduce((s, e) => s + (e.doctor_amount ?? (perOrderRate ?? 0)), 0);
    return { totalEarned, paidAmount, unpaidAmount, completedCount: completed.length };
  }, [earnings, perOrderRate]);

  const paidRecords = useMemo(
    () => earnings.filter((e) => e.status === "paid").sort((a, b) => new Date(b.paid_at ?? b.created_at).getTime() - new Date(a.paid_at ?? a.created_at).getTime()),
    [earnings]
  );

  const filtered = earnings.filter((e) => filterStatus === "all" || e.status === filterStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Per-Order Rate", value: perOrderRate != null ? `$${perOrderRate}` : "TBD", icon: "ri-price-tag-3-line", color: "text-[#1a5c4f]", note: "Set by admin" },
          { label: "Completed Orders", value: summary.completedCount, icon: "ri-checkbox-circle-line", color: "text-emerald-600", note: "Total cases done" },
          { label: "Total Earned", value: `$${summary.totalEarned}`, icon: "ri-money-dollar-circle-line", color: "text-gray-800", note: "Paid + unpaid" },
          { label: "Unpaid Balance", value: `$${summary.unpaidAmount}`, icon: "ri-time-line", color: "text-amber-600", note: `$${summary.paidAmount} already paid` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0">
                <i className={`${s.icon} ${s.color} text-base`}></i>
              </div>
              <span className="text-xs text-gray-500 font-medium leading-tight">{s.label}</span>
            </div>
            <p className={`text-2xl font-extrabold ${s.color}`}>{String(s.value)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Payout formula */}
      {perOrderRate != null && summary.completedCount > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Payout Calculation</p>
          <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
            <span className="font-mono font-bold text-[#1a5c4f]">${perOrderRate}</span>
            <span className="text-gray-400">per order</span>
            <span className="text-gray-300 mx-1">×</span>
            <span className="font-bold text-gray-800">{summary.completedCount}</span>
            <span className="text-gray-400">completed</span>
            <span className="text-gray-300 mx-1">=</span>
            <span className="font-extrabold text-gray-900">${perOrderRate * summary.completedCount}</span>
            <span className="text-gray-400">total</span>
          </div>
        </div>
      )}

      {/* Breakdown bar */}
      {summary.totalEarned > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Earnings Breakdown</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#1a5c4f] rounded-l-full transition-all"
                style={{ width: `${Math.round((summary.paidAmount / Math.max(summary.totalEarned, 1)) * 100)}%` }}
              ></div>
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${Math.round((summary.unpaidAmount / Math.max(summary.totalEarned, 1)) * 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#1a5c4f] flex-shrink-0"></div>
              <span className="text-xs font-semibold text-gray-700">Paid: <strong>${summary.paidAmount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0"></div>
              <span className="text-xs font-semibold text-gray-700">Pending: <strong>${summary.unpaidAmount}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeTab === "overview" ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:text-gray-700"}`}
        >
          <i className="ri-list-check"></i> All Cases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payout-history")}
          className={`whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeTab === "payout-history" ? "bg-[#1a5c4f] text-white" : "text-gray-500 hover:text-gray-700"}`}
        >
          <i className="ri-history-line"></i> Payout History
          {paidRecords.length > 0 && (
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-extrabold ${activeTab === "payout-history" ? "bg-white/20 text-white" : "bg-[#e8f5f1] text-[#1a5c4f]"}`}>
              {paidRecords.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB: All Cases ── */}
      {activeTab === "overview" && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Filter:</span>
            {[
              { value: "all", label: "All" },
              { value: "pending", label: "Unpaid" },
              { value: "paid", label: "Paid" },
            ].map((opt) => (
              <button key={opt.value} type="button" onClick={() => setFilterStatus(opt.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${filterStatus === opt.value ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                <i className="ri-money-dollar-circle-line text-gray-400 text-2xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-700 mb-1">No earnings records yet</p>
              <p className="text-xs text-gray-400">Earnings are recorded once you complete cases and submit letters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((earning) => (
                <div key={earning.id}
                  className={`bg-white rounded-xl border p-5 ${earning.status === "paid" ? "border-[#b8ddd5]" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-gray-900">{earning.patient_name ?? "—"}</p>
                        <span className="text-xs text-gray-400 font-mono">{earning.confirmation_id ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {earning.patient_state && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <i className="ri-map-pin-line text-gray-400"></i>{earning.patient_state}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(earning.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {earning.paid_at && (
                          <span className="text-xs text-[#1a5c4f] flex items-center gap-1">
                            <i className="ri-checkbox-circle-fill"></i>
                            Paid {new Date(earning.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                        {earning.payment_reference && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full text-xs font-semibold text-[#1a5c4f]">
                            <i className="ri-bank-card-line"></i>
                            {earning.payment_reference}
                          </span>
                        )}
                      </div>
                      {earning.notes && (
                        <p className="text-xs text-gray-400 italic mt-1.5">&quot;{earning.notes}&quot;</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-lg font-extrabold ${earning.doctor_amount != null ? "text-[#1a5c4f]" : "text-gray-300"}`}>
                          {earning.doctor_amount != null ? `$${earning.doctor_amount}` : "TBD"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[earning.status] ?? STATUS_STYLE.pending}`}>
                        <i className={earning.status === "paid" ? "ri-checkbox-circle-fill" : "ri-time-line"}></i>
                        {earning.status === "paid" ? "Paid" : earning.status === "pending" ? "Awaiting Payment" : "Cancelled"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Payout History ── */}
      {activeTab === "payout-history" && (
        <>
          {paidRecords.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center bg-[#e8f5f1] rounded-full mx-auto mb-3">
                <i className="ri-history-line text-[#1a5c4f] text-2xl"></i>
              </div>
              <p className="text-sm font-bold text-gray-700 mb-1">No payments received yet</p>
              <p className="text-xs text-gray-400">Your payment history will appear here once admin marks earnings as paid.</p>
            </div>
          ) : (
            <>
              {/* Payout total banner */}
              <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-[#1a5c4f] rounded-xl flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-white text-lg"></i>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1a5c4f]">Total Payments Received</p>
                    <p className="text-xs text-[#1a5c4f]/70">{paidRecords.length} payment{paidRecords.length !== 1 ? "s" : ""} on record</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-[#1a5c4f]">${summary.paidAmount}</p>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                {paidRecords.map((record, idx) => (
                  <div key={record.id} className="bg-white rounded-xl border border-[#b8ddd5] overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start gap-4">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center flex-shrink-0 mt-1">
                          <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-full">
                            <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-sm"></i>
                          </div>
                          {idx < paidRecords.length - 1 && (
                            <div className="w-px flex-1 bg-[#d0ece7] mt-2 min-h-[16px]"></div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-sm font-bold text-gray-900">
                                {record.patient_name ?? "—"}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs font-mono text-gray-400">{record.confirmation_id ?? "—"}</span>
                                {record.patient_state && (
                                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                    <i className="ri-map-pin-line"></i>{record.patient_state}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-lg font-extrabold text-[#1a5c4f]">
                                {record.doctor_amount != null ? `$${record.doctor_amount}` : "—"}
                              </p>
                            </div>
                          </div>

                          {/* Payment details row */}
                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                            {record.paid_at && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a5c4f]">
                                <i className="ri-calendar-check-line"></i>
                                {new Date(record.paid_at).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                              </span>
                            )}
                            {record.payment_reference ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full text-xs font-bold text-[#1a5c4f]">
                                <i className="ri-bank-card-line"></i>
                                {record.payment_reference}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                <i className="ri-bank-card-line"></i>
                                No payment method recorded
                              </span>
                            )}
                          </div>

                          {record.notes && (
                            <p className="mt-1.5 text-xs text-gray-400 italic">&quot;{record.notes}&quot;</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4 flex items-start gap-3">
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
          <i className="ri-information-line text-[#1a5c4f] text-sm"></i>
        </div>
        <p className="text-xs text-[#1a5c4f]/80 leading-relaxed">
          Payout amounts are set and managed by the PawTenant admin team. If you have questions about your earnings or payment schedule, please contact your account manager.
        </p>
      </div>
    </div>
  );
}
