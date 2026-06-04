import { useState, useCallback, useEffect, useRef } from "react";
import { monthlyPeriods, type MonthlyPeriod } from "../../../lib/accountsPeriods";
import {
  fetchExpensesUpTo, projectRecurringExpenses, fetchSalaryExpense,
  type CompanyExpense,
} from "../../../lib/companyExpenses";
import {
  fetchBooksMonthAgg,
  fetchAccountingPeriods, closeAccountingPeriod, reopenAccountingPeriod,
  sendPayrollSummaryEmail, fetchPayrollSendLog, PAYROLL_RECIPIENTS,
  type PanelMonthAgg, type AccountingPeriod, type BooksSnapshot, type PayrollSendLogRow,
} from "../../../lib/accountsBooks";

// The eight P&L figures a snapshot stores — used to recompute current books for a
// closed month and detect drift against the stored snapshot.
interface BooksFigures {
  gross: number;
  fees: number;
  refunds: number;
  payouts: number;
  businessNet: number;
  expenses: number;
  salary: number;
  operatingNet: number;
  expenseCount: number;
  chargeCount: number;
}

interface MonthRow extends MonthlyPeriod {
  gross: number;
  fees: number;
  refunds: number;
  payouts: number;
  businessNet: number;
  expenses: number;
  salary: number;
  operatingNet: number;
  expenseCount: number;
  chargeCount: number;
  // close/lock state
  rowStatus: "open" | "review" | "closed";
  periodId: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  // For closed rows: the CURRENT recalculated figures (vs the displayed snapshot)
  // and whether they drift from the snapshot, so we can warn + offer "Update Snapshot".
  live: BooksFigures | null;
  snapshotDrift: boolean;
}

// Snapshot vs current-books drift: any figure differing by more than half a cent.
function figuresDrift(snap: BooksFigures, live: BooksFigures): boolean {
  const keys: (keyof BooksFigures)[] = ["gross", "fees", "refunds", "payouts", "businessNet", "expenses", "salary", "operatingNet"];
  return keys.some((k) => Math.abs((snap[k] ?? 0) - (live[k] ?? 0)) > 0.005);
}

const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

function expenseUsd(e: CompanyExpense, fxRate: number): number {
  if ((e.currency || "USD").toUpperCase() === "PKR") return fxRate > 0 ? e.amount / fxRate : 0;
  return e.amount;
}

export default function MonthlyBooksSummary({
  fxRate, canManage = false, monthsToShow = 6, onOpenMonth, onBooksChanged, reloadSignal = 0,
}: {
  fxRate: number;
  canManage?: boolean;
  monthsToShow?: number;
  onOpenMonth?: (from: string, to: string, label: string) => void;
  onBooksChanged?: () => void; // lets the parent Accounts panel re-evaluate its closed-lock state
  reloadSignal?: number; // bumped by the parent when expenses change → rebuild if open
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [err, setErr] = useState("");
  const [busyKey, setBusyKey] = useState("");
  // Payroll summary email: last-sent log (keyed "start__end"), confirm modal,
  // in-flight send guard, and a transient success/error toast.
  const [payrollSends, setPayrollSends] = useState<Record<string, PayrollSendLogRow>>({});
  const [payrollConfirm, setPayrollConfirm] = useState<MonthRow | null>(null);
  const [payrollSending, setPayrollSending] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const build = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const months = monthlyPeriods(monthsToShow);
      const newest = months[0];
      const oldest = months[months.length - 1];

      const allExp = await fetchExpensesUpTo(newest.to);

      // Per-month books, computed exactly like the Accounts panel:
      //   • gross/fees/refunds/payouts/businessNet via fetchBooksMonthAgg (same
      //     stripe-payment-history SUMMARY → refunds by refund date, not charge
      //     month — this is the fix for the refund mismatch), and
      //   • salary via fetchSalaryExpense prorated_total (PKR→USD at fxRate, owners
      //     excluded server-side).
      // Each month is queried for its own range so the row matches the panel when
      // the panel views that month. Done in parallel.
      const aggByKey: Record<string, PanelMonthAgg> = {};
      const salByKey: Record<string, number> = {};
      await Promise.all(months.map(async (m) => {
        const [agg, sal] = await Promise.all([
          fetchBooksMonthAgg(m.from, m.to),
          fetchSalaryExpense(m.from, m.to),
        ]);
        aggByKey[m.key] = agg;
        salByKey[m.key] = sal.reduce(
          (s, r) => s + (r.currency === "PKR" ? (fxRate > 0 ? r.prorated_total / fxRate : 0) : r.prorated_total),
          0,
        );
      }));

      // Closed-month snapshots (admin/finance gated; returns [] for non-admins).
      const periods = await fetchAccountingPeriods(oldest.from, newest.to);
      const closedByRange: Record<string, AccountingPeriod> = {};
      periods.forEach((p) => { if (p.status === "closed") closedByRange[`${p.period_start}__${p.period_end}`] = p; });
      const periodByRange: Record<string, AccountingPeriod> = {};
      periods.forEach((p) => { periodByRange[`${p.period_start}__${p.period_end}`] = p; });

      const built: MonthRow[] = months.map((m) => {
        const closed = closedByRange[`${m.from}__${m.to}`];
        const anyPeriod = periodByRange[`${m.from}__${m.to}`];

        // CURRENT recalculated books for this month — same basis as the Accounts
        // panel (charges → gross/fees/refunds/payouts/businessNet; recurring-aware
        // expenses; per-month prorated salary). Computed for every row so a closed
        // month can be compared against its stored snapshot.
        const a = aggByKey[m.key] ?? { gross: 0, fees: 0, refunds: 0, netAfterFees: 0, payouts: 0, businessNet: 0, chargeCount: 0, refundCount: 0 };
        const occ = projectRecurringExpenses(allExp, m.from, m.to);
        const expenses = occ.reduce((sum, e) => sum + expenseUsd(e, fxRate), 0);
        const salaryUsd = salByKey[m.key] ?? 0;
        const live: BooksFigures = {
          gross: a.gross, fees: a.fees, refunds: a.refunds, payouts: a.payouts, businessNet: a.businessNet,
          expenses, salary: salaryUsd, operatingNet: a.businessNet - expenses - salaryUsd,
          expenseCount: occ.length, chargeCount: a.chargeCount,
        };

        if (closed && closed.snapshot_json) {
          const s = closed.snapshot_json;
          const snapFigures: BooksFigures = {
            gross: s.gross, fees: s.fees, refunds: s.refunds, payouts: s.payouts, businessNet: s.businessNet,
            expenses: s.expenses, salary: s.salary, operatingNet: s.operatingNet,
            expenseCount: s.expenseCount, chargeCount: s.chargeCount,
          };
          // Closed rows DISPLAY the stored snapshot (req: closed → snapshot), but we
          // keep the live figures + a drift flag so we can warn and offer "Update Snapshot".
          return {
            ...m,
            gross: s.gross, fees: s.fees, refunds: s.refunds, payouts: s.payouts, businessNet: s.businessNet,
            expenses: s.expenses, salary: s.salary, operatingNet: s.operatingNet,
            expenseCount: s.expenseCount, chargeCount: s.chargeCount,
            rowStatus: "closed", periodId: closed.id, closedAt: closed.closed_at, reopenedAt: null,
            live, snapshotDrift: figuresDrift(snapFigures, live),
          };
        }
        // Open / reopened (review) → DISPLAY current recalculated figures.
        return {
          ...m,
          gross: live.gross, fees: live.fees, refunds: live.refunds, payouts: live.payouts, businessNet: live.businessNet,
          expenses: live.expenses, salary: live.salary, operatingNet: live.operatingNet,
          expenseCount: live.expenseCount, chargeCount: live.chargeCount,
          rowStatus: m.status, periodId: anyPeriod?.id ?? null,
          closedAt: null, reopenedAt: anyPeriod?.reopened_at ?? null,
          live, snapshotDrift: false,
        };
      });
      setRows(built);
      setLoaded(true);

      // Last payroll-email send per month (admin/finance only; returns {} otherwise)
      // so closed rows can show a "Payroll sent …" marker.
      if (canManage) {
        try { setPayrollSends(await fetchPayrollSendLog(oldest.from, newest.to)); }
        catch { /* non-fatal */ }
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load monthly books");
    }
    setLoading(false);
  }, [fxRate, monthsToShow, canManage]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) build();
  };

  // Rebuild when the parent Accounts panel signals an expense change, so an
  // already-open summary reflects current figures and a later Close snapshots them.
  const lastSignal = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal !== lastSignal.current) {
      lastSignal.current = reloadSignal;
      if (open && loaded && !loading) build();
    }
  }, [reloadSignal, open, loaded, loading, build]);

  // Build a snapshot from the CURRENT recalculated figures (r.live), so closing or
  // updating always stores the exact figures the Accounts panel shows for the month.
  const buildSnapshot = (r: MonthRow): BooksSnapshot => {
    const f: BooksFigures = r.live ?? {
      gross: r.gross, fees: r.fees, refunds: r.refunds, payouts: r.payouts, businessNet: r.businessNet,
      expenses: r.expenses, salary: r.salary, operatingNet: r.operatingNet,
      expenseCount: r.expenseCount, chargeCount: r.chargeCount,
    };
    return {
      month_key: r.key, period_start: r.from, period_end: r.to, label: r.label,
      gross: f.gross, fees: f.fees, refunds: f.refunds, payouts: f.payouts, businessNet: f.businessNet,
      expenses: f.expenses, salary: f.salary, operatingNet: f.operatingNet,
      expenseCount: f.expenseCount, chargeCount: f.chargeCount, snapshotAt: new Date().toISOString(),
    };
  };

  const handleClose = async (r: MonthRow) => {
    if (!window.confirm(`Close ${r.label} books? This stores a snapshot for reporting. Source transactions are not changed.`)) return;
    setBusyKey(r.key); setErr("");
    const res = await closeAccountingPeriod(r.from, r.to, r.label, buildSnapshot(r));
    setBusyKey("");
    if (!res.ok) { setErr(res.error ?? "Failed to close month"); return; }
    build();
    onBooksChanged?.();
  };

  const handleReopen = async (r: MonthRow) => {
    if (!r.periodId) return;
    if (!window.confirm(`Reopen ${r.label} books? This allows corrections and marks the close snapshot as reopened.`)) return;
    setBusyKey(r.key); setErr("");
    const res = await reopenAccountingPeriod(r.periodId);
    setBusyKey("");
    if (!res.ok) { setErr(res.error ?? "Failed to reopen month"); return; }
    build();
    onBooksChanged?.();
  };

  // Overwrite a CLOSED month's snapshot with the current recalculated books (e.g.
  // a refund landed after close). Keeps the month closed; the row then matches the
  // Accounts panel. Uses the same upsert RPC as Close (ON CONFLICT updates snapshot).
  const handleUpdateSnapshot = async (r: MonthRow) => {
    if (!window.confirm(`Update ${r.label} snapshot to the current books? This overwrites the stored figures and keeps the month closed.`)) return;
    setBusyKey(r.key); setErr("");
    const res = await closeAccountingPeriod(r.from, r.to, r.label, buildSnapshot(r));
    setBusyKey("");
    if (!res.ok) { setErr(res.error ?? "Failed to update snapshot"); return; }
    build();
    onBooksChanged?.();
  };

  // Send the monthly payroll summary email for a CLOSED month. Real send only
  // (no books are touched). Guarded against double-clicks via payrollSending.
  const handleSendPayroll = async () => {
    const r = payrollConfirm;
    if (!r || payrollSending) return;
    setPayrollSending(true);
    const res = await sendPayrollSummaryEmail({
      periodStart: r.from, periodEnd: r.to, periodLabel: r.label, fxRate,
    });
    setPayrollSending(false);
    setPayrollConfirm(null);
    if (res.ok) {
      setToast({
        type: "ok",
        msg: `Payroll summary for ${r.label} sent to ${PAYROLL_RECIPIENTS.join(" and ")} (${res.employeeCount ?? 0} employees, PKR ${Math.round(res.totalPkr ?? 0).toLocaleString()}).`,
      });
      try { setPayrollSends(await fetchPayrollSendLog(rows[rows.length - 1]?.from ?? r.from, rows[0]?.to ?? r.to)); }
      catch { /* non-fatal */ }
    } else {
      setToast({ type: "err", msg: res.error ?? "Failed to send payroll summary." });
    }
  };

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const statusBadge = (r: MonthRow) => {
    if (r.rowStatus === "closed") return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600" title={r.closedAt ? `Closed ${new Date(r.closedAt).toLocaleString()}` : ""}>Closed{r.closedAt ? ` · ${fmtDate(r.closedAt)}` : ""}</span>;
    if (r.rowStatus === "open") return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Open</span>;
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Review</span>;
  };

  return (
    <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
        <div className="flex items-center gap-2">
          <i className="ri-calendar-2-line text-[#3b6ea5]"></i>
          <h3 className="text-sm font-extrabold text-gray-900">Monthly Books Summary</h3>
          <span className="text-[10px] font-semibold text-gray-400">last {monthsToShow} months</span>
        </div>
        <i className={`text-gray-400 ${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
      </button>

      {open && (
        <div className="p-3">
          {err && <div className="mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{err}</div>}
          {toast && (
            <div className={`mb-2 px-4 py-2 rounded-lg text-xs flex items-center gap-2 border ${toast.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              <i className={toast.type === "ok" ? "ri-checkbox-circle-line" : "ri-error-warning-line"}></i>
              <span className="flex-1">{toast.msg}</span>
              <button type="button" onClick={() => setToast(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer"><i className="ri-close-line"></i></button>
            </div>
          )}
          {!loading && rows.some((r) => r.snapshotDrift) && (
            <div className="mb-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
              <i className="ri-error-warning-line"></i>
              <span>Snapshot is out of sync with current books. One or more closed months changed after they were closed (e.g. a refund landed). Use <strong>Update Snapshot</strong> to refresh, or Reopen to make corrections.</span>
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400"><i className="ri-loader-4-line animate-spin text-2xl block mb-2"></i>Building monthly books…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="text-left py-2 pr-3">Month</th>
                      <th className="text-right py-2 px-2">Gross</th>
                      <th className="text-right py-2 px-2">Fees</th>
                      <th className="text-right py-2 px-2">Refunds</th>
                      <th className="text-right py-2 px-2">Payouts</th>
                      <th className="text-right py-2 px-2">Business Net</th>
                      <th className="text-right py-2 px-2">Expenses</th>
                      <th className="text-right py-2 px-2">Salary (est.)</th>
                      <th className="text-right py-2 px-2">Operating Net</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-right py-2 pl-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                          {onOpenMonth ? (
                            <button type="button" onClick={() => onOpenMonth(r.from, r.to, `${r.label} Books`)}
                              title="Open this month's books in Accounts" className="text-[#3b6ea5] hover:underline cursor-pointer">
                              {r.label}
                            </button>
                          ) : <span className="text-gray-800">{r.label}</span>}
                        </td>
                        <td className="text-right py-2 px-2 text-emerald-600 font-semibold">{fmt(r.gross)}</td>
                        <td className="text-right py-2 px-2 text-gray-400">−{fmt(r.fees)}</td>
                        <td className="text-right py-2 px-2 text-gray-400">−{fmt(r.refunds)}</td>
                        <td className="text-right py-2 px-2 text-gray-400">−{fmt(r.payouts)}</td>
                        <td className="text-right py-2 px-2 text-[#3b6ea5] font-semibold">{fmt(r.businessNet)}</td>
                        <td className="text-right py-2 px-2 text-gray-400">−{fmt(r.expenses)}</td>
                        <td className="text-right py-2 px-2 text-gray-400">−{fmt(r.salary)}</td>
                        <td className={`text-right py-2 px-2 font-extrabold ${r.operatingNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(r.operatingNet)}</td>
                        <td className="text-center py-2 px-2">
                          {statusBadge(r)}
                          {r.snapshotDrift && (
                            <div className="mt-0.5">
                              <span title="Snapshot is out of sync with current books. Use Update Snapshot to refresh."
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600">
                                <i className="ri-error-warning-line"></i> Out of sync
                              </span>
                            </div>
                          )}
                          {canManage && r.rowStatus === "closed" && payrollSends[`${r.from}__${r.to}`] && (
                            <div className="mt-0.5">
                              <span title={`Payroll summary emailed ${new Date(payrollSends[`${r.from}__${r.to}`].sent_at).toLocaleString()}`}
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#1a5c4f]">
                                <i className="ri-mail-check-line"></i> Payroll sent {fmtDate(payrollSends[`${r.from}__${r.to}`].sent_at)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="text-right py-2 pl-2 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {onOpenMonth && (
                              <button type="button" onClick={() => onOpenMonth(r.from, r.to, `${r.label} Books`)}
                                className="text-[10px] font-semibold text-[#3b6ea5] hover:underline cursor-pointer">View / Edit</button>
                            )}
                            {canManage && (busyKey === r.key ? (
                              <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                            ) : r.rowStatus === "closed" ? (
                              <>
                                {r.snapshotDrift && (
                                  <button type="button" onClick={() => handleUpdateSnapshot(r)}
                                    title="Overwrite the stored snapshot with the current books"
                                    className="text-[10px] font-semibold text-[#3b6ea5] hover:underline cursor-pointer">Update Snapshot</button>
                                )}
                                <button type="button" onClick={() => handleReopen(r)}
                                  className="text-[10px] font-semibold text-amber-600 hover:underline cursor-pointer">Reopen</button>
                                <button type="button" onClick={() => setPayrollConfirm(r)}
                                  title="Email the monthly payroll summary to the owners"
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#1a5c4f] hover:underline cursor-pointer">
                                  <i className="ri-mail-send-line"></i> Send Payroll
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => handleClose(r)}
                                  className="text-[10px] font-semibold text-gray-500 hover:text-[#3b6ea5] hover:underline cursor-pointer">Close</button>
                                <span title="Close books before sending payroll summary."
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-300 cursor-not-allowed select-none">
                                  <i className="ri-mail-send-line"></i> Send Payroll
                                </span>
                              </>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-gray-400">
                Business Net = gross − Stripe fees − refunds − confirmed provider payouts. Operating Net = Business Net − company expenses − estimated salary.
                Recurring subscriptions are applied to every month. Salary is the estimated cost of active non-owner employees, prorated to each month (owners excluded) — same basis as the Accounts panel above.
                {canManage ? " Closing a month stores a snapshot for reporting; source transactions are never changed. Reopen allows corrections; Update Snapshot refreshes a closed month's stored figures to the current books (e.g. a late refund) without reopening." : " Monthly close/lock is admin-only."}
                {" "}“Open” = current month, “Review” = prior months, “Closed” = snapshot locked.
              </p>
            </>
          )}
        </div>
      )}

      {/* Confirm-before-send modal — prevents accidental payroll emails. */}
      {payrollConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!payrollSending) setPayrollConfirm(null); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#1a5c4f]/10 flex items-center justify-center">
                <i className="ri-mail-send-line text-[#1a5c4f]"></i>
              </div>
              <h4 className="text-sm font-extrabold text-gray-900">Send Payroll Summary</h4>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              Send payroll summary for <strong>{payrollConfirm.label}</strong> to{" "}
              <strong>{PAYROLL_RECIPIENTS[0]}</strong> and <strong>{PAYROLL_RECIPIENTS[1]}</strong>?
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4 text-[11px] text-gray-500 leading-snug">
              Internal owner/admin notification only. Active non-owner employees only; owner/co-owner compensation is excluded.
              This does not move money or process payroll. Books values are not changed.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" disabled={payrollSending} onClick={() => setPayrollConfirm(null)}
                className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer disabled:opacity-50">Cancel</button>
              <button type="button" disabled={payrollSending} onClick={handleSendPayroll}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1a5c4f] rounded-lg hover:bg-[#164a40] cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5">
                {payrollSending ? (<><i className="ri-loader-4-line animate-spin"></i> Sending…</>) : (<><i className="ri-mail-send-line"></i> Send Payroll Email</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
