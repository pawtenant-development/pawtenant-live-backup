import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  fetchEffectiveExpenses, addExpense, deleteExpense, cancelExpense, fetchSalaryExpense, fetchSalaryDetail,
  fetchHalfDayLateDetail, resolveRange, resolutionToClassification,
  fetchMarketingSpendSummary, isMetaConnected,
  EXPENSE_CATEGORIES, CATEGORY_LABEL, MARKETING_CATEGORIES,
  type ExpenseCategory, type SalaryExpenseSummaryRow, type SalaryDetailRow, type HalfDayLateRow,
  type EffectiveExpense, type ChargePayoutResolution, type MarketingSpendSummary,
} from "../../../lib/companyExpenses";
import { exportAccountsCSV, type ProfitabilityRow } from "../../../lib/exportAccounts";
import { formatTimeOfDay12, pktTime12String } from "../../../lib/timezones";
import { fetchAccountingPeriods, type AccountingPeriod } from "../../../lib/accountsBooks";
import { buildCompanyFlow, type FlowStep, type ReconciliationStatus } from "../../../lib/accountsFinancialFlow";
import MonthlyBooksSummary from "./MonthlyBooksSummary";
import PayrollArchivePanel from "./PayrollArchivePanel";
import CompensationAdjustmentsCard from "./CompensationAdjustmentsCard";
import FinancialBridgeFlow from "./FinancialBridgeFlow";
import MetricCalculationDrawer from "./MetricCalculationDrawer";
import AccountsCollapsibleSection from "./AccountsCollapsibleSection";
import { sectionId } from "./AccountsSectionNav";

// Minimal shapes mirrored from PaymentsTab (avoids cross-file type coupling).
interface MiniSummary {
  total_revenue: number;
  total_refunded: number;
  total_fees?: number;
  net_after_fees?: number;
  net_revenue: number;
  fees_include_estimates?: boolean;
  // Counts from stripe-payment-history (respect the selected range). Used for the
  // Gross Revenue / Refunds card badges — same dataset basis as the amounts.
  charge_count?: number;
  refund_count?: number;
}
interface MiniCharge {
  amount: number;
  fee?: number;
  net?: number;
  amount_refunded: number;
  payment_intent: string | null;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
}

interface Props {
  period: "7d" | "30d" | "90d";
  customActive: boolean;
  customFrom: string;
  customTo: string;
  rangeLabel: string;
  summary: MiniSummary | undefined;
  charges: MiniCharge[] | undefined;
  resolutionMap: Record<string, ChargePayoutResolution>;
  canManageBooks?: boolean;
  onOpenMonth?: (from: string, to: string, label: string) => void;
  /** PKR→USD rate, owned by the Accounts header so one control drives every section. */
  fxRate: number;
  /** Reconciliation status shown inside the calculation drawer. */
  reconStatus: ReconciliationStatus;
  /** Publishes the company-wide totals this panel computes to the Accounts shell. */
  onTotals?: (t: CompanyTotals) => void;
  /** Hands the CSV export up so the global header can trigger it. */
  onExportReady?: (fn: () => void) => void;
  /**
   * Sections rendered BETWEEN Expenses & P&L and the Monthly Books Summary, so
   * the in-page nav order (Overview → Expenses → Channels → Marketing →
   * Reconciliation) matches the real DOM order and "jump to section" lands
   * where the label says it will (correction addendum §4 — Company Expenses
   * and Operating Net stay near the top). Composition slot — this panel owns
   * no logic for whatever is passed in.
   */
  middleSlot?: ReactNode;
  /** Bumped after a successful ad sync → re-read expenses + synced spend. */
  reloadSignal?: number;
  /** Bumped by the header's Add Expense quick action → open the form here. */
  openExpenseSignal?: number;
}

/** Canonical company figures, computed once here and reused everywhere else. */
export interface CompanyTotals {
  grossCharged: number;
  refunds: number;
  netRevenue: number;
  providerPayments: number;
  stripeFees: number;
  contributionAfterStripe: number;
  companyExpenses: number;
  operatingNet: number;
  paidOrders: number;
  refundCount: number;
  /** True when an ad-platform sync has produced no spend for the range. */
  spendSyncStale: boolean;
  metaConnected: boolean;
  googleAdsSpend: number;
  metaAdsSpend: number;
}

// Explicit, editable — not a hidden conversion. Owned by the Accounts header.
export const DEFAULT_PKR_PER_USD = 280;
const fmtUSD2 = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function PaymentsAccountsPanel({
  period, customActive, customFrom, customTo, rangeLabel, summary, charges, resolutionMap, canManageBooks = false, onOpenMonth,
  fxRate, reconStatus, onTotals, onExportReady, middleSlot, reloadSignal = 0, openExpenseSignal = 0,
}: Props) {
  const range = useMemo(
    () => resolveRange(period, customActive, customFrom, customTo),
    [period, customActive, customFrom, customTo],
  );

  const [expenses, setExpenses] = useState<EffectiveExpense[]>([]);
  const [marketing, setMarketing] = useState<MarketingSpendSummary | null>(null);
  const [salaryRows, setSalaryRows] = useState<SalaryExpenseSummaryRow[]>([]);
  const [salaryDetail, setSalaryDetail] = useState<SalaryDetailRow[]>([]);
  const [lateRows, setLateRows] = useState<HalfDayLateRow[]>([]);
  const [showSalaryDetail, setShowSalaryDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Which financial-flow step the calculation drawer is showing (null = closed).
  const [drawerStep, setDrawerStep] = useState<FlowStep | null>(null);
  // §7 collapse state — Overview and Expenses & P&L are open by default.
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [expensesOpen, setExpensesOpen] = useState(true);

  // Add-expense form
  const [showForm, setShowForm] = useState(false);
  const [fDate, setFDate] = useState(todayIso());
  const [fCategory, setFCategory] = useState<ExpenseCategory>("subscription");
  const [fVendor, setFVendor] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fRecurring, setFRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | ExpenseCategory>("all");
  // Closed-period guard: when the selected range exactly matches a closed month,
  // the ledger is read-only until the month is reopened (from Monthly Books Summary).
  const [closedPeriod, setClosedPeriod] = useState<AccountingPeriod | null>(null);
  // Bumped after any expense mutation so the (possibly already-open) Monthly Books
  // Summary rebuilds and reflects current figures — keeps it in sync with this panel.
  const [booksReloadSignal, setBooksReloadSignal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [exp, sal, salDetail, late, periods, mkt] = await Promise.all([
      fetchEffectiveExpenses(range.from, range.to),
      fetchSalaryExpense(range.from, range.to),
      fetchSalaryDetail(range.from, range.to),
      fetchHalfDayLateDetail(range.from, range.to),
      fetchAccountingPeriods(range.from, range.to),
      fetchMarketingSpendSummary(range.from, range.to),
    ]);
    setExpenses(exp);
    setMarketing(mkt);
    setSalaryRows(sal);
    setSalaryDetail(salDetail);
    setLateRows(late);
    // Exact-match closed period for the viewed range → lock editing.
    setClosedPeriod(periods.find((p) => p.period_start === range.from && p.period_end === range.to && p.status === "closed") ?? null);
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  // Refresh after a successful ad sync so the auto-synced spend rows,
  // Total Expenses and Operating Net reflect the new figures (skip initial 0).
  useEffect(() => {
    if (reloadSignal > 0) void load();
  }, [reloadSignal, load]);

  // Reload this panel AND signal the Monthly Books Summary to rebuild, so an
  // expense change here is immediately reflected in the summary row for the month.
  const refreshAll = useCallback(async () => {
    await load();
    setBooksReloadSignal((n) => n + 1);
  }, [load]);

  const isClosed = !!closedPeriod;
  const canEdit = canManageBooks && !isClosed; // gate add/edit/delete (RLS also enforces)

  // Header "Add Expense" quick action: expand the section and open the form.
  // The ref makes each signal fire exactly once even if canEdit later changes.
  const openReqRef = useRef(0);
  useEffect(() => {
    if (openExpenseSignal > 0 && openExpenseSignal !== openReqRef.current) {
      openReqRef.current = openExpenseSignal;
      setExpensesOpen(true);
      if (canManageBooks && !isClosed) setShowForm(true);
    }
  }, [openExpenseSignal, canManageBooks, isClosed]);

  // Default the Add-Expense date inside the selected range: today if today is in
  // range, otherwise the range end (so prior-month books don't default to today).
  useEffect(() => {
    const t = todayIso();
    setFDate(t >= range.from && t <= range.to ? t : range.to);
    if (isClosed) setShowForm(false);
  }, [range.from, range.to, isClosed]);

  // ── Revenue / direct-cost side (USD) ─────────────────────────────────────
  const gross = summary?.total_revenue ?? 0;
  const stripeFees = summary?.total_fees ?? 0;
  const refunds = summary?.total_refunded ?? 0;
  const netAfterFees = summary?.net_after_fees ?? (summary ? summary.net_revenue : 0);

  // Provider payouts — ONLY completed provider work (doctor_status='patient_notified')
  // is deducted from contribution margin. Pending/assigned work is advisory only.
  const { providerPayouts, providerPending } = useMemo(() => {
    let deducted = 0, pending = 0;
    for (const c of charges ?? []) {
      const res = c.payment_intent ? resolutionMap[c.payment_intent] : undefined;
      const pc = resolutionToClassification(res, c.amount_refunded > 0);
      deducted += pc.deducted;
      pending += pc.estimated;
    }
    return { providerPayouts: deducted, providerPending: pending };
  }, [charges, resolutionMap]);

  // Gross − Stripe fees − refunds − confirmed provider payouts. Labelled
  // "Contribution After Stripe" everywhere; the channel section's pre-Stripe
  // figure uses a DIFFERENT label so one word never means two formulas.
  const contributionAfterStripe = netAfterFees - providerPayouts;

  // ── Expense side (USD) ───────────────────────────────────────────────────
  const activeExpenses = useMemo(() => expenses.filter((e) => e.status !== "cancelled"), [expenses]);

  const expenseToUsd = useCallback((e: EffectiveExpense): number => {
    if ((e.currency || "USD").toUpperCase() === "PKR") return fxRate > 0 ? e.amount / fxRate : 0;
    return e.amount;
  }, [fxRate]);

  const manualMarketing = useMemo(
    () => activeExpenses.filter((e) => MARKETING_CATEGORIES.includes(e.category)).reduce((s, e) => s + expenseToUsd(e), 0),
    [activeExpenses, expenseToUsd],
  );
  const manualOther = useMemo(
    () => activeExpenses.filter((e) => !MARKETING_CATEGORIES.includes(e.category)).reduce((s, e) => s + expenseToUsd(e), 0),
    [activeExpenses, expenseToUsd],
  );
  const manualTotal = manualMarketing + manualOther;

  // Estimated salary expense — prorated, grouped by currency; PKR converted at fxRate.
  // Uses payable_total (prorated − automatic half-day late deductions); falls back
  // to prorated_total for older RPC payloads without the deduction fields.
  const salaryPkr = useMemo(() => salaryRows.filter((r) => r.currency === "PKR").reduce((s, r) => s + (r.payable_total ?? r.prorated_total), 0), [salaryRows]);
  const salaryUsdNative = useMemo(() => salaryRows.filter((r) => r.currency === "USD").reduce((s, r) => s + (r.payable_total ?? r.prorated_total), 0), [salaryRows]);
  const salaryUsd = salaryUsdNative + (fxRate > 0 ? salaryPkr / fxRate : 0);
  const salaryCount = useMemo(() => salaryRows.reduce((s, r) => s + r.employee_count, 0), [salaryRows]);
  const ownerExcludedCount = useMemo(() => salaryDetail.filter((r) => r.exclude_reason === "owner_compensation_excluded").length, [salaryDetail]);
  // Half-day late deductions (30-min grace policy, enforced server-side from 2026-06-08).
  const lateCount = useMemo(() => salaryRows.reduce((s, r) => s + (r.half_day_late_count ?? 0), 0), [salaryRows]);
  const lateDeductionPkr = useMemo(() => salaryRows.filter((r) => r.currency === "PKR").reduce((s, r) => s + (r.late_deduction_total ?? 0), 0), [salaryRows]);
  const lateDeductionUsdNative = useMemo(() => salaryRows.filter((r) => r.currency === "USD").reduce((s, r) => s + (r.late_deduction_total ?? 0), 0), [salaryRows]);
  const lateDeductionUsd = lateDeductionUsdNative + (fxRate > 0 ? lateDeductionPkr / fxRate : 0);

  // ── Auto-synced ad spend (Google + Meta) ─────────────────────────────────
  // Virtual, system-generated expense rows from get_marketing_spend_summary for
  // the SAME range — never written to company_expenses (so switching range never
  // duplicates manual rows). Meta is 0/"Not connected" until its token is set.
  const googleAdsSpend = marketing?.google_spend_usd ?? 0;
  const metaAdsSpend = marketing?.meta_spend_usd ?? 0;
  const metaConnected = isMetaConnected(marketing);
  const autoMarketingTotal = googleAdsSpend + metaAdsSpend;

  // Double-count guard: a manual AD-PLATFORM expense (Google/Meta/"marketing")
  // alongside auto-synced ad spend likely re-counts the same money. SEO is excluded
  // (it is not Google/Meta ad spend). We warn — never silently drop either side.
  const manualAdPlatform = useMemo(
    () => activeExpenses
      .filter((e) => e.category === "google_ads" || e.category === "facebook_meta" || e.category === "marketing")
      .reduce((s, e) => s + expenseToUsd(e), 0),
    [activeExpenses, expenseToUsd],
  );
  const duplicateMarketingRisk = manualAdPlatform > 0 && autoMarketingTotal > 0;

  const totalExpenses = manualTotal + salaryUsd + autoMarketingTotal;
  const operatingNet = contributionAfterStripe - totalExpenses;

  // ── Add expense ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (isClosed) { setErr("This month is closed. Reopen it to make corrections."); return; }
    const amt = parseFloat(fAmount);
    if (!fDate || isNaN(amt) || amt <= 0) { setErr("Enter a valid date and amount."); return; }
    setSaving(true);
    const res = await addExpense({
      expense_date: fDate, category: fCategory, vendor: fVendor || null, description: fDesc || null,
      amount: amt, currency: fCurrency, source: "manual", status: "confirmed", recurring: fRecurring,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error ?? "Failed to add expense"); return; }
    setShowForm(false);
    setFVendor(""); setFDesc(""); setFAmount(""); setFRecurring(false);
    refreshAll();
  };

  const handleDelete = async (id: string) => {
    const res = await deleteExpense(id);
    if (!res.ok) { setErr(res.error ?? "Failed to delete"); return; }
    refreshAll();
  };
  const handleCancel = async (id: string) => {
    const res = await cancelExpense(id);
    if (!res.ok) { setErr(res.error ?? "Failed to cancel"); return; }
    refreshAll();
  };

  const filteredExpenses = categoryFilter === "all" ? expenses : expenses.filter((e) => e.category === categoryFilter);

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const profitability: ProfitabilityRow[] = (charges ?? []).map((c) => {
      const res = c.payment_intent ? resolutionMap[c.payment_intent] : undefined;
      const fee = typeof c.fee === "number" ? c.fee : 0;
      const net = typeof c.net === "number" ? c.net : c.amount - fee;
      const pc = resolutionToClassification(res, c.amount_refunded > 0);
      const netAfterFees = net - c.amount_refunded; // after Stripe fee + refund, before payout
      return {
        order_id: res?.confirmation_id ?? "",
        customer: c.customer_name ?? c.customer_email ?? "",
        gross: c.amount,
        stripe_fee: fee,
        refund: c.amount_refunded,
        net_after_fees: netAfterFees,
        provider: pc.name ?? "",
        provider_payout: pc.deducted,
        payout_basis: pc.classification, // none | pending_estimated | confirmed_completed | confirmed_completed_refunded | cancelled*
        business_net: netAfterFees - pc.deducted,
        chain_paid_count: pc.chainPaidCount ?? 1,
        status: c.status,
      };
    });
    exportAccountsCSV({
      rangeLabel,
      generatedAt: new Date().toISOString(),
      summary: [
        { label: "Gross Revenue", amount: gross },
        { label: "Stripe Fees", amount: -stripeFees },
        { label: "Refunds", amount: -refunds },
        { label: "Provider Payouts (confirmed)", amount: -providerPayouts, note: "Completed provider work only" },
        { label: "Contribution After Stripe", amount: contributionAfterStripe, note: "Gross − refunds − provider payments − Stripe fees" },
        { label: "Pending Provider Payouts (advisory)", amount: -providerPending, note: "Not yet completed — NOT deducted from margin/net" },
        { label: "Salary Expenses (est.)", amount: -salaryUsd, note: salaryPkr > 0 ? `Incl. PKR ${Math.round(salaryPkr).toLocaleString()} @ ${fxRate}/USD` : "" },
        { label: "Marketing Expenses (manual)", amount: -manualMarketing },
        { label: "Google Ads Spend (auto-synced)", amount: -googleAdsSpend, note: "From Google Ads API for selected range" },
        { label: "Meta / Facebook Ads Spend (auto-synced)", amount: -metaAdsSpend, note: metaConnected ? "From Meta Ads API for selected range" : "Meta not connected — add META_ADS_ACCESS_TOKEN" },
        { label: "Other Manual Expenses", amount: -manualOther },
        { label: "Total Expenses", amount: -totalExpenses, note: "Manual + salary + auto ad spend" },
        { label: "Operating Net", amount: operatingNet, note: "Contribution After Stripe − company expenses (incl. ad spend)" },
      ],
      expenses,
      profitability,
    });
  };

  // Hand the export up so the single global header button triggers it. Kept in
  // a ref-stable effect so re-registering never re-renders the header.
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    onExportReady?.(() => exportRef.current());
  }, [onExportReady]);

  // ── Render ───────────────────────────────────────────────────────────────
  // Badge counts use the SAME range-scoped dataset as the amounts: charge_count
  // = paid Stripe charges in gross revenue; refund_count = refunds in the refund
  // total. Unpaid leads are never counted (the edge fn only counts succeeded
  // charges / refund records).
  const chargeCount = summary?.charge_count ?? 0;
  const refundCount = summary?.refund_count ?? 0;

  // The single company-wide bridge, built from the SAME figures the P&L panel
  // and the CSV export use. Every visible Overview number comes from here.
  const companyFlow = useMemo(
    () => buildCompanyFlow({
      grossChargedUsd: gross,
      refundsUsd: refunds,
      stripeFeesUsd: stripeFees,
      providerPaymentsUsd: providerPayouts,
      companyExpensesUsd: totalExpenses,
      paidOrders: chargeCount,
      refundCount,
      feesIncludeEstimates: summary?.fees_include_estimates,
    }),
    [gross, refunds, stripeFees, providerPayouts, totalExpenses, chargeCount, refundCount, summary?.fees_include_estimates],
  );

  // Child values shown in the drawer for the Company Expenses step.
  const expenseBreakdown = useMemo(() => [
    { label: "Salary (estimated, prorated)", amountUsd: -salaryUsd },
    { label: "Google Ads spend (auto-synced)", amountUsd: -googleAdsSpend },
    { label: metaConnected ? "Meta Ads spend (auto-synced)" : "Meta Ads spend (not connected)", amountUsd: -metaAdsSpend },
    { label: "Marketing (manual entries)", amountUsd: -manualMarketing },
    { label: "Other manual expenses", amountUsd: -manualOther },
  ], [salaryUsd, googleAdsSpend, metaAdsSpend, metaConnected, manualMarketing, manualOther]);

  // Publish the canonical totals upward so the header badge, the drawer and the
  // Reconciliation section never recompute (and never disagree with) these.
  useEffect(() => {
    if (!onTotals) return;
    onTotals({
      grossCharged: gross,
      refunds,
      netRevenue: companyFlow.netRevenueUsd,
      providerPayments: providerPayouts,
      stripeFees,
      contributionAfterStripe: companyFlow.contributionAfterStripeUsd,
      companyExpenses: totalExpenses,
      operatingNet: companyFlow.operatingNetUsd,
      paidOrders: chargeCount,
      refundCount,
      spendSyncStale: !loading && googleAdsSpend === 0 && metaAdsSpend === 0,
      metaConnected,
      googleAdsSpend,
      metaAdsSpend,
    });
  }, [onTotals, gross, refunds, providerPayouts, stripeFees, totalExpenses, chargeCount, refundCount,
      companyFlow, loading, googleAdsSpend, metaAdsSpend, metaConnected]);

  return (
    <div>
      {err && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <i className="ri-error-warning-line"></i>{err}
        </div>
      )}

      {/* ── OVERVIEW: the financial bridge (open by default, §7) ───────────── */}
      <AccountsCollapsibleSection
        id={sectionId("overview")}
        title="Financial Overview"
        icon="ri-flow-chart"
        subtitle="How the money flows — every step subtracts from the one before it"
        open={overviewOpen}
        onToggle={() => setOverviewOpen((s) => !s)}
        summary={
          <span className={`text-sm font-extrabold tabular-nums ${companyFlow.operatingNetUsd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            Operating Net {fmtUSD2(companyFlow.operatingNetUsd)}
          </span>
        }
      >
        <div className="pt-3">
          <FinancialBridgeFlow
            steps={companyFlow.steps}
            activeKey={drawerStep?.key ?? null}
            onSelect={setDrawerStep}
          />
        </div>
      </AccountsCollapsibleSection>

      {/* ── COMPANY EXPENSES & ESTIMATED P&L (near the top, §4; open, §7) ──── */}
      <AccountsCollapsibleSection
        id={sectionId("expenses")}
        title="Company Expenses & Estimated P&L"
        icon="ri-wallet-3-line"
        subtitle="Add Expense · salary estimate · ad spend · subscriptions · Operating Net"
        open={expensesOpen}
        onToggle={() => setExpensesOpen((s) => !s)}
        // No `whitespace-nowrap` on the outer span: below ~440px this line is
        // wider than the header slot and an ancestor clips overflow, so pinning
        // it to one line cut the Operating Net figure off screen. Letting it
        // wrap (while keeping "Net $x" itself unbreakable) keeps Operating Net
        // readable at every width.
        summary={
          <span className="text-xs font-bold text-gray-600 tabular-nums">
            Expenses −{fmtUSD2(totalExpenses)} · <span className={`${operatingNet >= 0 ? "text-emerald-600" : "text-rose-600"} whitespace-nowrap`}>Net {fmtUSD2(operatingNet)}</span>
          </span>
        }
      >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start pt-3">
        {/* Expense ledger */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900">Company Expenses</h3>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | ExpenseCategory)}
                className="appearance-none pl-2 pr-6 py-1 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white focus:outline-none cursor-pointer">
                <option value="all">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            {isClosed ? (
              <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <i className="ri-lock-2-line"></i>This month is closed. Reopen it to make corrections.
              </span>
            ) : canEdit ? (
              <button type="button" onClick={() => setShowForm((s) => !s)}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors">
                <i className={showForm ? "ri-close-line" : "ri-add-line"}></i>{showForm ? "Close" : "Add Expense"}
              </button>
            ) : null}
          </div>

          {showForm && canEdit && (
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Date</label>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Category</label>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#3b6ea5]">
                  {EXPENSE_CATEGORIES.filter((c) => c !== "employee_salary" && c !== "provider_payout").map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Amount</label>
                <input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Currency</label>
                <select value={fCurrency} onChange={(e) => setFCurrency(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#3b6ea5]">
                  <option value="USD">USD</option>
                  <option value="PKR">PKR</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Vendor</label>
                <input type="text" value={fVendor} onChange={(e) => setFVendor(e.target.value)} placeholder="Optional"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Optional"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5]" />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                <input type="checkbox" checked={fRecurring} onChange={(e) => setFRecurring(e.target.checked)} />Recurring
              </label>
              <div className="col-span-2 md:col-span-1 flex items-end">
                <button type="button" onClick={handleAdd} disabled={saving}
                  className="whitespace-nowrap w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                  {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving</> : <><i className="ri-check-line"></i>Save Expense</>}
                </button>
              </div>
            </div>
          )}

          {/* Salary system row — estimated, based on active employee base salaries */}
          {(salaryPkr > 0 || salaryUsdNative > 0) && (
            <div className="border-b border-gray-100 bg-[#f8fdfc]">
              <div className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <i className="ri-team-line text-[#3b6ea5]"></i>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Estimated Salary Expense</p>
                    <p className="text-xs text-gray-400">
                      Estimated, based on {salaryCount} active employee base salar{salaryCount === 1 ? "y" : "ies"}, prorated to range.
                      {salaryPkr > 0 ? ` PKR ${Math.round(salaryPkr).toLocaleString()} @ ${fxRate}/USD.` : ""}
                      {ownerExcludedCount > 0 ? " Owner compensation excluded." : ""}
                    </p>
                    {lateCount > 0 && (
                      <p className="text-xs font-semibold text-rose-500">
                        Includes {lateCount} half-day late deduction{lateCount === 1 ? "" : "s"} −{fmtUSD2(lateDeductionUsd)}
                        {lateDeductionPkr > 0 ? ` (PKR ${Math.round(lateDeductionPkr).toLocaleString()})` : ""} · clock-in 30+ min after shift start
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-rose-500">−{fmtUSD2(salaryUsd)}</p>
                  <button type="button" onClick={() => setShowSalaryDetail((s) => !s)}
                    className="text-[10px] font-semibold text-[#3b6ea5] hover:underline cursor-pointer">
                    {showSalaryDetail ? "Hide" : "Breakdown"} <i className={showSalaryDetail ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
                  </button>
                </div>
              </div>
              {showSalaryDetail && (
                <div className="px-5 pb-3">
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <span>Employee</span><span className="text-right">Salary</span><span>Status</span><span className="text-right">Prorated</span><span className="text-right">Late ded.</span><span className="text-right">Payable</span>
                    </div>
                    {salaryDetail.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No salary records.</p>
                    ) : salaryDetail.map((r) => (
                      <div key={r.team_member_id} className={`grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 text-xs border-t border-gray-100 ${r.included ? "" : "opacity-50"}`}>
                        <span className="truncate text-gray-700">{r.display_name ?? r.employee_code ?? "—"}</span>
                        <span className="text-right text-gray-700">{Math.round(r.base_salary).toLocaleString()} {r.salary_currency}</span>
                        <span className="text-gray-500">{r.included ? r.employment_status : (r.exclude_reason ?? "excluded")}</span>
                        <span className="text-right font-semibold text-gray-700">{r.included ? `${Math.round(r.prorated_amount).toLocaleString()} ${r.salary_currency}` : "—"}</span>
                        <span className={`text-right font-semibold ${(r.late_deduction_amount ?? 0) > 0 ? "text-rose-500" : "text-gray-300"}`}>
                          {r.included && (r.late_deduction_amount ?? 0) > 0
                            ? `−${Math.round(r.late_deduction_amount ?? 0).toLocaleString()} (${r.half_day_late_days ?? 0}×½)`
                            : "—"}
                        </span>
                        <span className="text-right font-bold text-gray-800">
                          {r.included ? `${Math.round(r.payable_amount ?? r.prorated_amount).toLocaleString()} ${r.salary_currency}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {lateRows.length > 0 && (
                    <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50/50 overflow-hidden">
                      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 bg-rose-50 text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                        <span>Half-day late</span><span>Date</span><span className="text-right">Shift start</span><span className="text-right">Clock-in</span><span className="text-right">Late by</span>
                      </div>
                      {lateRows.map((l) => (
                        <div key={`${l.team_member_id}-${l.work_date}`} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 text-xs border-t border-rose-100/60">
                          <span className="truncate text-gray-700">{l.display_name ?? l.employee_code ?? "—"}</span>
                          <span className="text-gray-600">{l.work_date}</span>
                          <span className="text-right text-gray-600">{formatTimeOfDay12(l.shift_start)} PKT</span>
                          <span className="text-right text-gray-600">
                            {pktTime12String(l.clock_in_at, true)}
                          </span>
                          <span className="text-right font-semibold text-rose-500">{l.minutes_late} min</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] text-gray-400">
                    Admin-only diagnostic. Salaries never shown in the employee portal. Half-day deduction = base salary ÷ Mon–Fri working
                    days in range ÷ 2, applied once per day where the first clock-in is 30+ minutes after shift start. Policy active from 2026-06-08; earlier attendance is never deducted.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Compensation adjustments — bonuses / commissions / monthly adjustments
              (Company OS). Approved rows already flow into the salary figures above. */}
          <CompensationAdjustmentsCard
            from={range.from}
            to={range.to}
            canManage={canManageBooks}
            onChanged={refreshAll}
          />

          {/* Auto-synced ad spend — system-generated, non-editable. Follows the
              selected range; never stored as a manual expense. */}
          {!loading && (googleAdsSpend > 0 || metaAdsSpend > 0 || marketing) && (categoryFilter === "all" || MARKETING_CATEGORIES.includes(categoryFilter)) && (
            <div className="border-b border-gray-100 bg-[#fbfaff]">
              {duplicateMarketingRisk && (
                <div className="px-5 pt-3">
                  <p className="text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                    <i className="ri-error-warning-line mt-0.5"></i>
                    <span>You have manual marketing expenses <strong>and</strong> auto-synced ad spend in this range. Don’t enter Google/Meta spend manually — it’s already included below. Remove duplicate manual rows to avoid double-counting.</span>
                  </p>
                </div>
              )}
              <AutoSpendRow
                label="Google Ads Spend" icon="ri-google-fill" iconColor="text-[#4285F4]"
                amount={googleAdsSpend} connected note="Auto-synced from Google Ads for the selected date range." />
              <AutoSpendRow
                label="Meta / Facebook Ads Spend" icon="ri-meta-fill" iconColor="text-[#0866FF]"
                amount={metaAdsSpend} connected={metaConnected}
                note={metaConnected
                  ? "Auto-synced from Meta Ads for the selected date range."
                  : "Meta spend sync not connected. Add the Meta token secret (META_ADS_ACCESS_TOKEN) to enable."} />
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400"><i className="ri-loader-4-line animate-spin text-2xl block mb-2"></i>Loading expenses…</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No manual expenses in this range.{!isClosed && canEdit ? " Use “Add Expense”." : ""}</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {filteredExpenses.map((e) => (
                <div key={`${e.id}-${e._occurrence_date}`} className={`flex items-center justify-between gap-3 px-5 py-3 ${e.status === "cancelled" ? "opacity-50" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{CATEGORY_LABEL[e.category]}</p>
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{e.source}</span>
                      {e.status !== "confirmed" && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.status === "cancelled" ? "bg-gray-200 text-gray-500" : "bg-amber-100 text-amber-700"}`}>{e.status}</span>
                      )}
                      {e.recurring && (
                        <span className="text-[10px] font-semibold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                          {e._projected ? "recurring · auto" : "recurring"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {e._occurrence_date}{e.vendor ? ` · ${e.vendor}` : ""}{e.description ? ` · ${e.description}` : ""}
                      {e._projected ? " · projected from recurring entry" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-extrabold text-rose-500">
                      −{e.currency === "USD" ? fmtUSD2(e.amount) : `${e.amount.toFixed(2)} ${e.currency}`}
                    </p>
                    {e._projected ? (
                      <span className="text-[10px] text-gray-300" title="Edit the original recurring entry in its own month">auto</span>
                    ) : canEdit ? (
                      <>
                        {e.status !== "cancelled" && (
                          <button type="button" onClick={() => handleCancel(e.id)} title="Cancel (keep record)"
                            className="text-gray-300 hover:text-amber-500 cursor-pointer"><i className="ri-close-circle-line"></i></button>
                        )}
                        <button type="button" onClick={() => handleDelete(e.id)} title="Delete permanently"
                          className="text-gray-300 hover:text-red-500 cursor-pointer"><i className="ri-delete-bin-line"></i></button>
                      </>
                    ) : isClosed ? (
                      <i className="ri-lock-2-line text-gray-300" title="Month closed — reopen to edit"></i>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* P&L summary panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Estimated P&amp;L</p>
          <dl className="space-y-2.5 text-sm">
            <Row label="Contribution After Stripe" value={fmtUSD2(contributionAfterStripe)} strong />
            <Row label="Salary Expenses (est.)" value={`−${fmtUSD2(salaryUsd)}`} tone="rose" />
            {manualMarketing > 0 && <Row label="Marketing (manual)" value={`−${fmtUSD2(manualMarketing)}`} tone="rose" />}
            <Row label="Google Ads Spend (auto)" value={`−${fmtUSD2(googleAdsSpend)}`} tone="rose" />
            <Row label={metaConnected ? "Meta Ads Spend (auto)" : "Meta Ads Spend (not connected)"} value={`−${fmtUSD2(metaAdsSpend)}`} tone="rose" />
            <Row label="Other Expenses" value={`−${fmtUSD2(manualOther)}`} tone="rose" />
            <div className="border-t border-gray-100 pt-2.5">
              <Row label="Total Expenses" value={`−${fmtUSD2(totalExpenses)}`} tone="rose" strong />
            </div>
            <div className="border-t-2 border-gray-200 pt-3 mt-1">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-extrabold text-gray-900">Operating Net</dt>
                <dd className={`text-lg font-extrabold ${operatingNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtUSD2(operatingNet)}</dd>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Estimated profit = contribution margin − company expenses.</p>
            </div>
          </dl>
          {salaryPkr > 0 && (
            <p className="mt-4 text-[11px] leading-snug text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Salaries are stored in PKR and converted at an editable rate ({fxRate} PKR/USD). Adjust the rate above; this is an estimate, not a finalized FX conversion.
            </p>
          )}
          {providerPending > 0 && (
            <p className="mt-3 text-[11px] leading-snug text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
              {fmtUSD2(providerPending)} of provider payouts are pending (work not yet completed) and are <strong>not</strong> deducted from Contribution After Stripe.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-snug text-gray-400">
            Provider payouts deduct only after the provider completes the order (letter delivered). Google &amp; Meta ad spend is auto-synced from the ad platforms for the selected range and included in Operating Net — no manual entry needed.{!metaConnected ? " Meta spend stays $0 until its token is connected." : ""}
          </p>
          <p className="mt-3 text-[11px] leading-snug text-gray-400">
            Recurring subscriptions persist into each new month, so a fresh month opens with its fixed costs already applied. Monthly close/lock is a future feature.
          </p>
        </div>
      </div>
      </AccountsCollapsibleSection>

      {/* Channel Contribution + Marketing render here so the section nav order
          (Overview → Expenses → Channels → Marketing) matches the DOM order
          (see the middleSlot prop docs). */}
      {middleSlot}

      {/* Previous months' books (collapsible, closed by default) */}
      <MonthlyBooksSummary fxRate={fxRate} canManage={canManageBooks} onOpenMonth={onOpenMonth} onBooksChanged={load} reloadSignal={booksReloadSignal} />

      {/* Per-employee payroll archive — frozen monthly snapshots (survive offboarding) */}
      <PayrollArchivePanel canManage={canManageBooks} />

      {/* Calculation drawer — opened by any step in the financial bridge above.
          Renders FlowStep metadata only, so it can never leak customer data. */}
      <MetricCalculationDrawer
        step={drawerStep}
        rangeLabel={rangeLabel}
        from={range.from}
        to={range.to}
        status={reconStatus}
        related={drawerStep?.key === "company_expenses" ? expenseBreakdown : []}
        onClose={() => setDrawerStep(null)}
      />
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "rose"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={`text-xs ${strong ? "font-bold text-gray-700" : "text-gray-500"}`}>{label}</dt>
      <dd className={`${strong ? "text-sm font-extrabold" : "text-sm font-semibold"} ${tone === "rose" ? "text-rose-500" : "text-gray-800"}`}>{value}</dd>
    </div>
  );
}

// System-generated, non-editable ad-spend row for the Company Expenses ledger.
// No edit/delete controls — it is a virtual row driven by the synced spend totals
// for the selected range, not a manual company_expenses record.
function AutoSpendRow({ label, icon, iconColor, amount, connected, note }: {
  label: string; icon: string; iconColor: string; amount: number; connected: boolean; note: string;
}) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3 border-t border-gray-100 first:border-t-0">
      <div className="flex items-center gap-2 min-w-0">
        <i className={`${icon} ${iconColor} text-base`}></i>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{label}</p>
            <span className="text-[10px] font-bold text-[#6d5bd0] bg-[#efeafc] border border-[#ddd3f7] px-1.5 py-0.5 rounded">Auto-synced</span>
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Marketing</span>
            {!connected && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Not connected</span>
            )}
          </div>
          <p className="text-xs text-gray-400">{note}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="text-sm font-extrabold text-rose-500">−{fmtUSD2(amount)}</p>
        <i className="ri-lock-2-line text-gray-300" title="System-generated — not editable"></i>
      </div>
    </div>
  );
}
