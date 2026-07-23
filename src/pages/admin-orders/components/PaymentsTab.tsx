import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getAdminToken } from "../../../lib/supabaseClient";
import { presetRange, ACCOUNTS_PRESET_BUTTONS, type AccountsPreset } from "../../../lib/accountsPeriods";
import { can } from "../../../lib/adminPermissions";
import RefundModal from "./RefundModal";
import PaymentReconciliationPanel from "./PaymentReconciliationPanel";
import ApprovalRequestModal from "./ApprovalRequestModal";
import PaymentsAccountsPanel from "./PaymentsAccountsPanel";
import ChannelContributionPanel from "./ChannelContributionPanel";
import MarketingSpendPanel from "./MarketingSpendPanel";
import {
  fetchChargePayouts, resolutionToClassification, payoutLabel,
  type ChargePayoutResolution, type PayoutClassification,
} from "../../../lib/companyExpenses";

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
  // Net-after-Stripe-fee fields (added by stripe-payment-history edge fn).
  fee?: number;
  net?: number;
  fee_estimated?: boolean;
  payment_method_brand?: string | null;
  payment_method_last4?: string | null;
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
  total_fees?: number;
  net_after_fees?: number;
  fees_include_estimates?: boolean;
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
type ActiveView = "payments" | "reconciliation" | "accounts";

// Classify a charge's provider payout for Business Net, using the server-side
// resolver (resolve_charge_payouts) which walks the parent_order_id recovery
// chain. Payout deducts ONLY when the order/chain is completed.
function classifyCharge(
  charge: ChargeSummary,
  resolutionMap: Record<string, ChargePayoutResolution>,
): PayoutClassification {
  const res = charge.payment_intent ? resolutionMap[charge.payment_intent] : undefined;
  return resolutionToClassification(res, charge.refunded || charge.amount_refunded > 0);
}

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

// Fallback estimate (matches edge fn) — only used to label values the UI computes itself.
function estFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.round((amount * 0.029 + 0.3) * 100) / 100;
}

function chargeFee(c: ChargeSummary): { fee: number; estimated: boolean } {
  if (typeof c.fee === "number") return { fee: c.fee, estimated: !!c.fee_estimated };
  return { fee: c.status === "succeeded" ? estFee(c.amount) : 0, estimated: c.status === "succeeded" };
}

function downloadCSV(
  data: ChargeSummary[],
  refunds: RefundItem[],
  label: string,
  resolutionMap: Record<string, ChargePayoutResolution>,
) {
  const headers = [
    "Charge ID", "Order ID", "Date", "Customer Name", "Customer Email", "Description",
    "Charge Status", "Refund Status", "Payment Method",
    "Gross (USD)", "Stripe Fee (USD)", "Fee Basis", "Net After Fee (USD)",
    "Provider Name", "Provider Payout (USD)", "Payout Classification", "Payout Deducted",
    "Payout Source", "Pending Est. Payout (USD)", "Provider Completed", "Business Net (USD)",
    "Duplicate Chain Charges", "Amount Refunded (USD)", "Net Collected (USD)", "Payment Intent", "Receipt URL",
  ];
  const rows = data.map((c) => {
    const { fee, estimated } = chargeFee(c);
    const net = typeof c.net === "number" ? c.net : c.amount - fee;
    const res = c.payment_intent ? resolutionMap[c.payment_intent] : undefined;
    const pc = classifyCharge(c, resolutionMap);
    const businessNet = net - c.amount_refunded - pc.deducted;
    return [
      c.id,
      res?.confirmation_id ?? "",
      new Date(c.created * 1000).toLocaleDateString("en-US"),
      c.customer_name ?? "",
      c.customer_email ?? "",
      c.description ?? "",
      c.status,
      c.refunded ? "Fully Refunded" : c.amount_refunded > 0 ? "Partially Refunded" : "Not Refunded",
      c.payment_method_brand ? `${c.payment_method_brand}${c.payment_method_last4 ? ` ••${c.payment_method_last4}` : ""}` : "",
      c.amount.toFixed(2),
      fee.toFixed(2),
      estimated ? "Estimated" : "Actual (Stripe)",
      net.toFixed(2),
      pc.name ?? "",
      pc.amount.toFixed(2),
      pc.classification,
      pc.deducted > 0 ? "Yes" : "No",
      pc.source ?? "none",
      pc.estimated.toFixed(2),
      res?.completed ? "Yes" : "No",
      businessNet.toFixed(2),
      res && res.chain_paid_count > 1 ? String(res.chain_paid_count) : "",
      c.amount_refunded.toFixed(2),
      (c.amount - c.amount_refunded).toFixed(2),
      c.payment_intent ?? "",
      c.receipt_url ?? "",
    ];
  });

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
  link.download = `pawtenant-payments-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PaymentsTab() {
  const [activeView, setActiveView] = useState<ActiveView>("accounts");
  const [period, setPeriod] = useState<Period>("30d");
  // Custom date range (overrides preset when active)
  const [customActive, setCustomActive] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Accounts "monthly books" range: a label override + active preset. The Accounts
  // view defaults to the current calendar month (auto-applied on first open).
  const [customLabel, setCustomLabel] = useState("");
  const [accountsPreset, setAccountsPreset] = useState<AccountsPreset>("current_month");
  const accountsInit = useRef(false);
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"charges" | "refunds">("charges");
  const [selectedCharge, setSelectedCharge] = useState<ChargeSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderMap, setOrderMap] = useState<Record<string, string>>({});
  const [resolutionMap, setResolutionMap] = useState<Record<string, ChargePayoutResolution>>({});

  // ── Bulk delete for payments (owner/admin only) ──
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [showBulkDeletePayments, setShowBulkDeletePayments] = useState(false);
  const [bulkDeletePayConfirmText, setBulkDeletePayConfirmText] = useState("");
  const [bulkDeletingPay, setBulkDeletingPay] = useState(false);
  const [bulkDeletePayMsg, setBulkDeletePayMsg] = useState("");
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string>("Team Member");
  const [adminUserId, setAdminUserId] = useState<string>("");

  // Approval request state for finance role refund restriction
  const [refundApprovalCharge, setRefundApprovalCharge] = useState<ChargeSummary | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const rangeLabel = customLabel || (customActive ? "Custom Range" : PERIOD_LABELS[period]);
  const fileLabel = customActive ? `${customFrom || "start"}_to_${customTo || "today"}` : period;

  // Load admin role on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("doctor_profiles").select("role, is_admin, full_name, user_id").eq("user_id", session.user.id).maybeSingle()
        .then(({ data: prof }) => {
          if (prof) {
            const p = prof as { role: string | null; is_admin: boolean; full_name: string; user_id: string };
            setAdminRole(p.role ?? (p.is_admin ? "owner" : null));
            setAdminName(p.full_name ?? "Team Member");
            setAdminUserId(p.user_id ?? "");
          }
        });
    });
  }, []);

  // Unified capability layer (lib/adminPermissions) — single definition of these
  // gates instead of inline role literals. Server RPCs/RLS remain the real
  // enforcement; these only gate the buttons. Behaviour is unchanged:
  //   accounts.payments.manage = owner/admin_manager
  //   accounts.books.close      = owner/admin_manager/finance
  const canBulkDelete = can({ role: adminRole }, "accounts.payments.manage");
  // Accounts close/lock tier also gates expenses edit + payroll send downstream.
  const canManageBooks = can({ role: adminRole }, "accounts.books.close");
  // Finance role cannot issue refunds directly — must request approval
  const isFinanceRole = adminRole === "finance";

  const handleBulkDeletePayments = async () => {
    if (selectedChargeIds.size === 0) return;
    setBulkDeletingPay(true);
    // Delete matching orders from Supabase by payment_intent_id
    let deleted = 0;
    for (const chargeId of Array.from(selectedChargeIds)) {
      const charge = data?.charges.find((c) => c.id === chargeId);
      const piId = charge?.payment_intent;
      if (piId) {
        const { data: matchedOrders } = await supabase.from("orders").select("id").eq("payment_intent_id", piId);
        for (const o of (matchedOrders ?? []) as { id: string }[]) {
          await supabase.from("doctor_earnings").delete().eq("order_id", o.id);
          await supabase.from("order_documents").delete().eq("order_id", o.id);
          await supabase.from("doctor_notes").delete().eq("order_id", o.id);
          await supabase.from("order_status_logs").delete().eq("order_id", o.id);
          await supabase.from("doctor_notifications").delete().eq("order_id", o.id);
          await supabase.from("orders").delete().eq("id", o.id);
          deleted++;
        }
      }
    }
    // Remove from local charges list
    setData((prev) => prev ? { ...prev, charges: prev.charges.filter((c) => !selectedChargeIds.has(c.id)) } : prev);
    setSelectedChargeIds(new Set());
    setShowBulkDeletePayments(false);
    setBulkDeletePayConfirmText("");
    setBulkDeletingPay(false);
    setBulkDeletePayMsg(`${deleted} order record${deleted !== 1 ? "s" : ""} deleted from database. Stripe charges are unaffected.`);
    setTimeout(() => setBulkDeletePayMsg(""), 8000);
  };

  const fetchData = useCallback(async (qs: string) => {
    setLoading(true);
    setError("");
    try {
      const token = await getAdminToken();
      const res = await fetch(
        `${supabaseUrl}/functions/v1/stripe-payment-history?${qs}`,
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

  // Preset-driven load (skips when a custom range is active)
  useEffect(() => {
    if (customActive) return;
    fetchData(`period=${period}`);
  }, [fetchData, period, customActive]);

  const applyCustomRange = () => {
    if (!customFrom) return;
    setCustomActive(true);
    setCustomLabel("");
    fetchData(`from=${customFrom}${customTo ? `&to=${customTo}` : ""}`);
  };

  const clearFilters = () => {
    setCustomActive(false);
    setCustomFrom("");
    setCustomTo("");
    setCustomLabel("");
    setSearchQuery("");
    setStatusFilter("all");
    setPeriod("30d");
  };

  const reload = () => {
    if (customActive) fetchData(`from=${customFrom}${customTo ? `&to=${customTo}` : ""}`);
    else fetchData(`period=${period}`);
  };

  // ── Accounts monthly-books range controls ───────────────────────────────
  const applyAccountsPreset = useCallback((preset: AccountsPreset) => {
    const r = presetRange(preset);
    setAccountsPreset(preset);
    setCustomActive(true);
    setCustomFrom(r.from);
    setCustomTo(r.to);
    setCustomLabel(r.label);
    fetchData(`from=${r.from}&to=${r.to}`);
  }, [fetchData]);

  const applyAccountsCustom = useCallback(() => {
    if (!customFrom) return;
    const to = customTo || new Date().toISOString().slice(0, 10);
    setAccountsPreset("custom");
    setCustomActive(true);
    setCustomLabel(`Custom: ${customFrom} → ${to}`);
    fetchData(`from=${customFrom}&to=${to}`);
  }, [customFrom, customTo, fetchData]);

  // Open a specific month's books from the Monthly Books Summary (View / Edit).
  // Sets the main Accounts range to that month and refetches revenue + expenses.
  const openAccountsMonth = useCallback((from: string, to: string, label: string) => {
    setAccountsPreset("custom");
    setCustomActive(true);
    setCustomFrom(from);
    setCustomTo(to);
    setCustomLabel(label);
    fetchData(`from=${from}&to=${to}`);
  }, [fetchData]);

  // Accounts view defaults to the current calendar month on first open. Each new
  // month this naturally resolves to the new month with no manual reset needed.
  useEffect(() => {
    if (activeView === "accounts" && !accountsInit.current) {
      accountsInit.current = true;
      applyAccountsPreset("current_month");
    }
  }, [activeView, applyAccountsPreset]);

  // Cross-reference payment_intent_id → confirmation_id (Order ID chip + refund modal).
  useEffect(() => {
    supabase
      .from("orders")
      .select("payment_intent_id, confirmation_id")
      .not("payment_intent_id", "is", null)
      .limit(5000)
      .then(({ data: orders }) => {
        if (!orders) return;
        const map: Record<string, string> = {};
        (orders as { payment_intent_id: string; confirmation_id: string }[]).forEach((o) => {
          if (o.payment_intent_id) map[o.payment_intent_id] = o.confirmation_id;
        });
        setOrderMap(map);
      });
  }, []);

  // Provider payout resolution for the visible charges (server-side, parent-chain aware).
  useEffect(() => {
    if (!data?.charges) return;
    const pis = data.charges.map((c) => c.payment_intent).filter((v): v is string => !!v);
    if (pis.length === 0) return;
    let cancelled = false;
    fetchChargePayouts(pis).then((m) => { if (!cancelled) setResolutionMap(m); });
    return () => { cancelled = true; };
  }, [data?.charges]);

  // Provider payout rollups for the period (whole charge set). Only payouts for
  // COMPLETED provider work are deducted from Business Net; the rest is advisory.
  const providerPayoutTotal = (data?.charges ?? []).reduce(
    (sum, c) => sum + classifyCharge(c, resolutionMap).deducted, 0,
  );
  const providerPendingTotal = (data?.charges ?? []).reduce(
    (sum, c) => sum + classifyCharge(c, resolutionMap).estimated, 0,
  );
  // Completed orders whose payout amount couldn't be found — admin attention needed.
  const providerMissingCount = (data?.charges ?? []).filter(
    (c) => classifyCharge(c, resolutionMap).classification === "payout_missing_completed",
  ).length;
  // Charges that belong to a multi-charge recovery chain (likely duplicate/over-charge).
  const duplicateChainCount = (data?.charges ?? []).filter(
    (c) => (c.payment_intent ? resolutionMap[c.payment_intent]?.chain_paid_count ?? 1 : 1) > 1,
  ).length;

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
  const formatCurrency2 = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

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

  const feesEstimated = data?.summary.fees_include_estimates ?? false;
  const totalFees = data?.summary.total_fees ?? 0;
  const netAfterFees = data?.summary.net_after_fees ?? (data ? data.summary.net_revenue : 0);
  // Business net = net after Stripe & refunds, minus provider payouts.
  const businessNetTotal = netAfterFees - providerPayoutTotal;

  return (
    <div>
      {/* View switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        <button type="button" onClick={() => setActiveView("accounts")}
          className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeView === "accounts" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
          <i className="ri-line-chart-line"></i>Accounts
        </button>
        <button type="button" onClick={() => setActiveView("payments")}
          className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeView === "payments" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
          <i className="ri-bank-card-line"></i>Payments &amp; Refunds
        </button>
        <button type="button" onClick={() => setActiveView("reconciliation")}
          className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeView === "reconciliation" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
          <i className="ri-link-m"></i>Reconciliation Tool
        </button>
      </div>

      {/* Reconciliation view */}
      {activeView === "reconciliation" && <PaymentReconciliationPanel />}

      {/* Accounts / P&L view */}
      {activeView === "accounts" && (
        <>
          {/* Monthly books date-range controls (defaults to current month) */}
          <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <i className="ri-calendar-2-line text-[#3b6ea5] text-sm"></i>
              <div className="flex items-center gap-1 flex-wrap">
                {ACCOUNTS_PRESET_BUTTONS.map((b) => (
                  <button key={b.key} type="button" onClick={() => applyAccountsPreset(b.key)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${accountsPreset === b.key ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-gray-50 border border-gray-200"}`}>
                    {b.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-xs font-semibold text-[#3b6ea5] bg-[#e8f0f9] border border-[#b8cce4] rounded-full px-3 py-1">
                {rangeLabel}{customFrom ? ` · ${customFrom} → ${customTo || "today"}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2.5">
              <span className="text-xs font-bold text-gray-500">Custom</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#3b6ea5]" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#3b6ea5]" />
              <button type="button" onClick={applyAccountsCustom} disabled={!customFrom}
                className="whitespace-nowrap px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
                Apply
              </button>
              <button type="button" onClick={() => applyAccountsPreset("current_month")}
                className="whitespace-nowrap px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                Reset to Current Month
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center"><i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i><p className="text-sm text-gray-500">Loading accounts…</p></div>
            </div>
          ) : (
            <>
              <PaymentsAccountsPanel
                period={period}
                customActive={customActive}
                customFrom={customFrom}
                customTo={customTo}
                rangeLabel={rangeLabel}
                summary={data?.summary}
                charges={data?.charges}
                resolutionMap={resolutionMap}
                canManageBooks={canManageBooks}
                onOpenMonth={openAccountsMonth}
              />
              {/* Channel Contribution — paid-order contribution by acquisition channel.
                  Drilldown of the paid-order totals; canonical per-order money basis. */}
              <ChannelContributionPanel
                from={customFrom || new Date().toISOString().slice(0, 10)}
                to={customTo || new Date().toISOString().slice(0, 10)}
                rangeLabel={rangeLabel}
              />
              {/* Marketing spend / ROI layer — separate from Business Net. */}
              <MarketingSpendPanel
                from={customFrom || new Date().toISOString().slice(0, 10)}
                to={customTo || new Date().toISOString().slice(0, 10)}
                businessNet={businessNetTotal}
                rangeLabel={rangeLabel}
                canSync={canManageBooks}
              />
            </>
          )}
        </>
      )}

      {/* Payments view */}
      {activeView === "payments" && <>
      {/* Header + controls */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Customer Payments &amp; Refunds</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Live data from Stripe. Net is after Stripe fees &amp; refunds. Issue refunds directly from this panel.
            The Provider Payouts card is a read-only estimate — the payout ledger itself is managed under <span className="font-semibold text-gray-700">Accounts → Earnings</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <button type="button" onClick={() => downloadCSV(filteredCharges, data.refunds, fileLabel, resolutionMap)}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <i className="ri-download-2-line text-[#3b6ea5]"></i>Export CSV
            </button>
          )}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <button key={p} type="button" onClick={() => { setCustomActive(false); setCustomLabel(""); setPeriod(p); }}
                className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${!customActive && period === p ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-2 flex-wrap mb-5 bg-white border border-gray-200 rounded-xl px-3 py-2 w-fit">
        <i className="ri-calendar-2-line text-gray-400 text-sm"></i>
        <span className="text-xs font-bold text-gray-500">Custom range</span>
        <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#3b6ea5]" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#3b6ea5]" />
        <button type="button" onClick={applyCustomRange} disabled={!customFrom}
          className="whitespace-nowrap px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
          Apply
        </button>
        {(customActive || customFrom || customTo || searchQuery || statusFilter !== "all") && (
          <button type="button" onClick={clearFilters}
            className="whitespace-nowrap px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
            Clear filters
          </button>
        )}
        {customActive && (
          <span className="text-xs font-semibold text-[#3b6ea5] bg-[#e8f0f9] border border-[#b8cce4] rounded-full px-2 py-0.5">
            {customFrom || "start"} → {customTo || "today"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5] block mb-3"></i>
            <p className="text-sm text-gray-500">Loading Stripe data...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <i className="ri-error-warning-line text-red-400 text-2xl block mb-2"></i>
          <p className="text-sm font-bold text-red-700 mb-1">Could not load payment data</p>
          <p className="text-xs text-red-500">{error}</p>
          <button type="button" onClick={reload}
            className="whitespace-nowrap mt-4 px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg cursor-pointer">Retry</button>
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
            {[
              { label: "Gross Revenue", value: formatCurrency(data.summary.total_revenue), icon: "ri-money-dollar-circle-line", color: "text-emerald-600", sub: `${data.summary.charge_count} transactions` },
              { label: feesEstimated ? "Stripe Fees (est.)" : "Stripe Fees", value: formatCurrency2(totalFees), icon: "ri-bank-card-2-line", color: "text-rose-500", sub: feesEstimated ? "Some estimated" : "Actual (Stripe)" },
              { label: "Provider Payouts (view)", value: formatCurrency(providerPayoutTotal), icon: "ri-user-shared-line", color: "text-purple-500", sub: providerPendingTotal > 0 ? `${formatCurrency(providerPendingTotal)} pending (not deducted)` : "Managed in Earnings tab" },
              { label: "Net After Fees", value: formatCurrency(netAfterFees), icon: "ri-funds-line", color: "text-[#3b6ea5]", sub: "After fees & refunds" },
              { label: "Business Net", value: formatCurrency(businessNetTotal), icon: "ri-line-chart-line", color: "text-[#0f766e]", sub: "After Stripe, refunds & confirmed payouts" },
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

          {feesEstimated && (
            <div className="mb-5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <i className="ri-information-line"></i>
              Some Stripe fees are <strong>estimated</strong> (2.9% + $0.30) because their balance transaction is still pending. Actual fees replace estimates automatically once Stripe settles.
            </div>
          )}

          {providerMissingCount > 0 && (
            <div className="mb-5 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center gap-2">
              <i className="ri-error-warning-line"></i>
              <strong>{providerMissingCount}</strong> completed order{providerMissingCount !== 1 ? "s have" : " has"} no provider payout record found — Business Net is not reduced for {providerMissingCount !== 1 ? "these" : "this"}. Check the provider Earnings panel.
            </div>
          )}

          {duplicateChainCount > 0 && (
            <div className="mb-5 px-4 py-2.5 bg-yellow-50 border border-yellow-300 rounded-xl text-xs text-yellow-800 flex items-center gap-2">
              <i className="ri-file-copy-2-line"></i>
              <strong>{duplicateChainCount}</strong> charge{duplicateChainCount !== 1 ? "s belong" : " belongs"} to recovery/retry chains with multiple paid charges (possible duplicate over-charges). Review for refunds — each completed charge still deducts its provider payout.
            </div>
          )}

          {/* Charges / Refunds tabs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setActiveSection("charges")}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeSection === "charges" ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  <i className="ri-bank-card-line"></i>Charges
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === "charges" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {data.charges.length}
                  </span>
                </button>
                <button type="button" onClick={() => setActiveSection("refunds")}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${activeSection === "refunds" ? "bg-[#3b6ea5] text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  <i className="ri-refund-2-line"></i>Refunds
                  {data.refunds.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeSection === "refunds" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"}`}>
                      {data.refunds.length}
                    </span>
                  )}
                </button>
              </div>

              {activeSection === "charges" && canBulkDelete && selectedChargeIds.size > 0 && (
                <button type="button" onClick={() => setShowBulkDeletePayments(true)}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 cursor-pointer transition-colors">
                  <i className="ri-delete-bin-2-line"></i>Delete DB Records ({selectedChargeIds.size})
                </button>
              )}
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
                      className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] w-44" />
                  </div>
                </div>
              )}
            </div>

            {activeSection === "charges" && (
              <>
                {bulkDeletePayMsg && (
                  <div className="mx-4 mt-3 px-4 py-2.5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl text-xs font-semibold text-[#3b6ea5] flex items-center gap-2">
                    <i className="ri-checkbox-circle-fill"></i>{bulkDeletePayMsg}
                  </div>
                )}
                <div className="hidden md:grid grid-cols-[32px_2fr_1fr_1fr_1.3fr_200px] gap-4 px-5 py-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {canBulkDelete && <span></span>}
                  <span>Customer</span><span>Date</span><span>Status</span><span className="text-right">Amount / Net</span><span>Actions</span>
                </div>
                {filteredCharges.length === 0 ? (
                  <div className="p-12 text-center text-sm text-gray-400">No charges match your filters</div>
                ) : (
                  <div className="divide-y divide-gray-200 max-h-[500px] overflow-y-auto">
                    {filteredCharges.map((charge) => {
                      const fullyRefunded = charge.amount_refunded >= charge.amount;
                      const canRefund = !fullyRefunded && charge.status === "succeeded";
                      const { fee, estimated } = chargeFee(charge);
                      const net = typeof charge.net === "number" ? charge.net : charge.amount - fee;
                      const payout = classifyCharge(charge, resolutionMap);
                      const businessNet = net - charge.amount_refunded - payout.deducted;

                      return (
                        <div key={charge.id} className="grid grid-cols-1 md:grid-cols-[32px_2fr_1fr_1fr_1.3fr_200px] gap-2 md:gap-4 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                          {canBulkDelete && (
                            <div className="hidden md:flex items-center">
                              <button type="button" onClick={() => setSelectedChargeIds((prev) => { const n = new Set(prev); n.has(charge.id) ? n.delete(charge.id) : n.add(charge.id); return n; })}
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${selectedChargeIds.has(charge.id) ? "bg-red-500 border-red-500" : "border-gray-300 hover:border-red-400"}`}>
                                {selectedChargeIds.has(charge.id) && <i className="ri-check-line text-white" style={{fontSize:"9px"}}></i>}
                              </button>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-gray-900 truncate">{charge.customer_name ?? charge.customer_email ?? "Anonymous"}</p>
                            {charge.customer_name && charge.customer_email && <p className="text-xs text-gray-400 truncate">{charge.customer_email}</p>}
                            {charge.description && <p className="text-xs text-gray-400 truncate">{charge.description}</p>}
                            {charge.payment_method_brand && (
                              <p className="text-xs text-gray-400 capitalize">{charge.payment_method_brand}{charge.payment_method_last4 ? ` ••${charge.payment_method_last4}` : ""}</p>
                            )}
                            <p className="text-xs font-mono text-gray-300 mt-0.5">{charge.id.slice(0, 20)}&hellip;</p>
                            {/* Order ID cross-reference */}
                            {(() => {
                              const orderId = charge.payment_intent ? orderMap[charge.payment_intent] : undefined;
                              if (orderId) {
                                return (
                                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-[#e8f0f9] border border-[#b8cce4] rounded-full text-xs font-bold text-[#3b6ea5]">
                                    <i className="ri-hashtag text-xs"></i>{orderId}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(charge.created)}</div>
                          <div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${charge.refunded ? "bg-red-100 text-red-600" : charge.amount_refunded > 0 ? "bg-orange-100 text-orange-700" : (STATUS_STYLE[charge.status] ?? "bg-gray-100 text-gray-500")}`}>
                              {charge.refunded ? "Refunded" : charge.amount_refunded > 0 ? "Partial Refund" : charge.status.charAt(0).toUpperCase() + charge.status.slice(1)}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-extrabold ${fullyRefunded ? "text-gray-400 line-through" : "text-emerald-600"}`}>
                              {formatCurrency2(charge.amount)}
                            </p>
                            {charge.status === "succeeded" && (
                              <p className="text-xs text-gray-400">
                                fee {formatCurrency2(fee)}{estimated ? " (est.)" : ""} · stripe net <span className="font-semibold text-[#3b6ea5]">{formatCurrency2(net)}</span>
                              </p>
                            )}
                            {charge.status === "succeeded" && (
                              <p className="text-xs text-gray-400">
                                {payout.name ? `${payout.name} · ` : ""}{payoutLabel(payout)} · business net <span className="font-semibold text-[#0f766e]">{formatCurrency2(businessNet)}</span>
                              </p>
                            )}
                            {charge.amount_refunded > 0 && (
                              <p className="text-xs text-orange-500">-{formatCurrency2(charge.amount_refunded)} refunded</p>
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
                              isFinanceRole ? (
                                <button type="button" onClick={() => setRefundApprovalCharge(charge)}
                                  title="Finance role — refunds require Owner or Admin Manager approval"
                                  className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-gray-50 rounded-lg text-xs font-bold text-gray-400 hover:bg-gray-100 cursor-pointer transition-colors">
                                  <i className="ri-lock-line"></i>Refund
                                </button>
                              ) : (
                                <button type="button" onClick={() => setSelectedCharge(charge)}
                                  className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 border border-orange-200 bg-orange-50 rounded-lg text-xs font-bold text-orange-600 hover:bg-orange-100 cursor-pointer transition-colors">
                                  <i className="ri-refund-2-line"></i>Refund
                                </button>
                              )
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
                          <p className="text-sm font-extrabold text-orange-500">-{formatCurrency2(refund.amount)}</p>
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
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Daily Revenue — {rangeLabel}</p>
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {data.daily.map((d) => {
              const heightPct = maxDaily > 0 ? (d.revenue / maxDaily) * 100 : 0;
              const isToday = d.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={d.date} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: (data.daily.length > 45) ? "10px" : "20px" }}>
                  <div className="relative group w-full">
                    {d.revenue > 0 && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatCurrency(d.revenue)}
                      </div>
                    )}
                    <div className={`w-full rounded-t transition-all ${isToday ? "bg-[#3b6ea5]" : "bg-[#b8cce4]"} ${d.revenue === 0 ? "opacity-30" : ""}`}
                      style={{ height: `${Math.max(heightPct, d.revenue > 0 ? 4 : 2)}px` }}>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{data.daily[0]?.date ? new Date(data.daily[0].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
            <span>{data.daily[data.daily.length - 1]?.date ? new Date(data.daily[data.daily.length - 1].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
          </div>
        </div>
      )}

      {/* Refund Modal — only for non-finance roles */}
      {selectedCharge && !isFinanceRole && (
        <RefundModal
          charge={selectedCharge}
          confirmationId={selectedCharge.payment_intent ? orderMap[selectedCharge.payment_intent] : undefined}
          onClose={() => setSelectedCharge(null)}
          onRefunded={handleRefunded}
        />
      )}

      {/* Approval Request Modal — for finance role trying to refund */}
      {refundApprovalCharge && (
        <ApprovalRequestModal
          actionType="refund"
          actionLabel="Issue Refund"
          actionDescription={`Request to issue a refund for charge ${refundApprovalCharge.id}. As a Finance user, refunds require Owner or Admin Manager approval.`}
          payload={{
            confirmationId: refundApprovalCharge.payment_intent ? orderMap[refundApprovalCharge.payment_intent] : undefined,
            chargeId: refundApprovalCharge.id,
            amount: refundApprovalCharge.amount - refundApprovalCharge.amount_refunded,
            refundType: "full",
          }}
          requesterName={adminName}
          requesterRole={adminRole ?? "finance"}
          requesterUserId={adminUserId}
          onClose={() => setRefundApprovalCharge(null)}
        />
      )}

      {/* Bulk Delete Payments Confirmation Modal */}
      {showBulkDeletePayments && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowBulkDeletePayments(false); setBulkDeletePayConfirmText(""); }}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-delete-bin-2-fill text-red-600 text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Delete {selectedChargeIds.size} Payment Record{selectedChargeIds.size !== 1 ? "s" : ""}?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">This removes the matching order records from the database. <strong>Stripe charges are NOT affected.</strong> Cannot be undone.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-xs text-red-700 space-y-1">
              <p className="font-bold flex items-center gap-1"><i className="ri-bank-card-line"></i>Stripe charges remain intact — only local DB records are deleted</p>
              <p className="flex items-center gap-1"><i className="ri-shield-keyhole-line"></i>Owner / Admin access only</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Type <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded">DELETE</span> to confirm</label>
              <input type="text" value={bulkDeletePayConfirmText} onChange={(e) => setBulkDeletePayConfirmText(e.target.value)}
                placeholder="Type DELETE here" autoFocus
                className="w-full px-3 py-2.5 border border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleBulkDeletePayments} disabled={bulkDeletingPay || bulkDeletePayConfirmText !== "DELETE"}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {bulkDeletingPay ? <><i className="ri-loader-4-line animate-spin"></i>Deleting...</> : <><i className="ri-delete-bin-2-line"></i>Yes, Delete Records</>}
              </button>
              <button type="button" onClick={() => { setShowBulkDeletePayments(false); setBulkDeletePayConfirmText(""); }}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
