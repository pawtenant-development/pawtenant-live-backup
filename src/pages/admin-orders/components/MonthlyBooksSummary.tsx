import { useState, useCallback } from "react";
import { monthlyPeriods, type MonthlyPeriod } from "../../../lib/accountsPeriods";
import {
  fetchExpensesUpTo, projectRecurringExpenses, fetchSalaryExpense,
  type CompanyExpense,
} from "../../../lib/companyExpenses";
import {
  fetchBooksCharges, resolveBooksPayouts, bucketChargesByMonth,
  fetchAccountingPeriods, closeAccountingPeriod, reopenAccountingPeriod,
  type MonthChargeAgg, type AccountingPeriod, type BooksSnapshot,
} from "../../../lib/accountsBooks";

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
}

const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

function expenseUsd(e: CompanyExpense, fxRate: number): number {
  if ((e.currency || "USD").toUpperCase() === "PKR") return fxRate > 0 ? e.amount / fxRate : 0;
  return e.amount;
}

export default function MonthlyBooksSummary({
  fxRate, canManage = false, monthsToShow = 6, onOpenMonth, onBooksChanged,
}: {
  fxRate: number;
  canManage?: boolean;
  monthsToShow?: number;
  onOpenMonth?: (from: string, to: string, label: string) => void;
  onBooksChanged?: () => void; // lets the parent Accounts panel re-evaluate its closed-lock state
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [err, setErr] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const build = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const months = monthlyPeriods(monthsToShow);
      const newest = months[0];
      const oldest = months[months.length - 1];

      const charges = await fetchBooksCharges(oldest.from, newest.to);
      const resMap = await resolveBooksPayouts(charges);
      const agg: Record<string, MonthChargeAgg> = bucketChargesByMonth(charges, resMap);
      const allExp = await fetchExpensesUpTo(newest.to);
      const sal = await fetchSalaryExpense(newest.from, newest.to);
      const salaryUsd = sal.reduce((s, r) => s + (r.currency === "PKR" ? (fxRate > 0 ? r.monthly_total / fxRate : 0) : r.monthly_total), 0);

      // Closed-month snapshots (admin/finance gated; returns [] for non-admins).
      const periods = await fetchAccountingPeriods(oldest.from, newest.to);
      const closedByRange: Record<string, AccountingPeriod> = {};
      periods.forEach((p) => { if (p.status === "closed") closedByRange[`${p.period_start}__${p.period_end}`] = p; });
      const periodByRange: Record<string, AccountingPeriod> = {};
      periods.forEach((p) => { periodByRange[`${p.period_start}__${p.period_end}`] = p; });

      const built: MonthRow[] = months.map((m) => {
        const closed = closedByRange[`${m.from}__${m.to}`];
        const anyPeriod = periodByRange[`${m.from}__${m.to}`];
        if (closed && closed.snapshot_json) {
          const s = closed.snapshot_json;
          return {
            ...m,
            gross: s.gross, fees: s.fees, refunds: s.refunds, payouts: s.payouts, businessNet: s.businessNet,
            expenses: s.expenses, salary: s.salary, operatingNet: s.operatingNet,
            expenseCount: s.expenseCount, chargeCount: s.chargeCount,
            rowStatus: "closed", periodId: closed.id, closedAt: closed.closed_at, reopenedAt: null,
          };
        }
        // Live figures (open / review).
        const a = agg[m.key] ?? { gross: 0, fees: 0, refunds: 0, payouts: 0, businessNet: 0, chargeCount: 0 };
        const occ = projectRecurringExpenses(allExp, m.from, m.to);
        const expenses = occ.reduce((sum, e) => sum + expenseUsd(e, fxRate), 0);
        return {
          ...m,
          gross: a.gross, fees: a.fees, refunds: a.refunds, payouts: a.payouts, businessNet: a.businessNet,
          expenses, salary: salaryUsd, operatingNet: a.businessNet - expenses - salaryUsd,
          expenseCount: occ.length, chargeCount: a.chargeCount,
          rowStatus: m.status, periodId: anyPeriod?.id ?? null,
          closedAt: null, reopenedAt: anyPeriod?.reopened_at ?? null,
        };
      });
      setRows(built);
      setLoaded(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load monthly books");
    }
    setLoading(false);
  }, [fxRate, monthsToShow]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) build();
  };

  const handleClose = async (r: MonthRow) => {
    if (!window.confirm(`Close ${r.label} books? This stores a snapshot for reporting. Source transactions are not changed.`)) return;
    setBusyKey(r.key); setErr("");
    const snapshot: BooksSnapshot = {
      month_key: r.key, period_start: r.from, period_end: r.to, label: r.label,
      gross: r.gross, fees: r.fees, refunds: r.refunds, payouts: r.payouts, businessNet: r.businessNet,
      expenses: r.expenses, salary: r.salary, operatingNet: r.operatingNet,
      expenseCount: r.expenseCount, chargeCount: r.chargeCount, snapshotAt: new Date().toISOString(),
    };
    const res = await closeAccountingPeriod(r.from, r.to, r.label, snapshot);
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
                        <td className="text-center py-2 px-2">{statusBadge(r)}</td>
                        <td className="text-right py-2 pl-2 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {onOpenMonth && (
                              <button type="button" onClick={() => onOpenMonth(r.from, r.to, `${r.label} Books`)}
                                className="text-[10px] font-semibold text-[#3b6ea5] hover:underline cursor-pointer">View / Edit</button>
                            )}
                            {canManage && (busyKey === r.key ? (
                              <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                            ) : r.rowStatus === "closed" ? (
                              <button type="button" onClick={() => handleReopen(r)}
                                className="text-[10px] font-semibold text-amber-600 hover:underline cursor-pointer">Reopen</button>
                            ) : (
                              <button type="button" onClick={() => handleClose(r)}
                                className="text-[10px] font-semibold text-gray-500 hover:text-[#3b6ea5] hover:underline cursor-pointer">Close</button>
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
                Recurring subscriptions are applied to every month. Salary is the current monthly estimate (active non-owner employees), applied per month — owners excluded.
                {canManage ? " Closing a month stores a snapshot for reporting; source transactions are never changed. Reopen allows corrections." : " Monthly close/lock is admin-only."}
                {" "}“Open” = current month, “Review” = prior months, “Closed” = snapshot locked.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
