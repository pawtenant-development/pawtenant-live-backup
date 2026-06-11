import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Widget } from "./TeamWidget";

/**
 * Salary snapshot widget — the logged-in employee's OWN current-month salary
 * figures from the self-scoped `get_my_salary_snapshot` RPC. The RPC mirrors
 * the Accounts salary math (same half-day late deduction rule + policy start
 * date), so this snapshot always matches the Finance side. Self-only: the RPC
 * resolves the caller via auth.uid() and never exposes other employees.
 */

interface MySalarySnapshot {
  period_start: string;
  period_end: string;
  base_salary: number;
  salary_currency: string;
  working_days: number;
  half_day_late_days: number;
  late_deduction_amount: number;
  payable_amount: number;
  included: boolean;
  exclude_reason: string | null;
}

async function fetchMySalarySnapshot(): Promise<MySalarySnapshot | null> {
  const { data, error } = await supabase.rpc("get_my_salary_snapshot");
  if (error) {
    console.warn("[SalarySnapshotWidget] rpc error", error);
    return null;
  }
  const rows = (data ?? []) as MySalarySnapshot[];
  return rows.length ? rows[0] : null;
}

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

function periodLabel(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number);
  if (!y || !m) return periodStart;
  const ts = new Date(Date.UTC(y, m - 1, 15));
  return ts.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function SalarySnapshotWidget() {
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<MySalarySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMySalarySnapshot().then((row) => {
      if (cancelled) return;
      setSnap(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="salary">
      <Widget
        icon="ri-money-dollar-circle-line"
        title="Salary Snapshot"
        action={
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
            {snap ? periodLabel(snap.period_start).toUpperCase() : "ESTIMATED"}
          </span>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-stone-400">
            <i className="ri-loader-4-line animate-spin text-base"></i>
            <span className="text-xs">Loading salary…</span>
          </div>
        ) : !snap ? (
          <p className="py-2 text-xs text-stone-500">
            Salary details are not available yet. Contact HR if you believe this is an error.
          </p>
        ) : !snap.included ? (
          <p className="py-2 text-xs text-stone-500">
            {snap.exclude_reason === "owner_compensation_excluded"
              ? "Owner compensation is handled outside payroll, so no salary snapshot is shown here."
              : snap.exclude_reason === "no salary set"
                ? "No salary is set on your profile yet. Contact HR to complete your payroll setup."
                : "Your salary snapshot is not available for this period. Contact HR for details."}
          </p>
        ) : (
          <>
            <dl className="divide-y divide-stone-100">
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs text-stone-600">Gross Salary</dt>
                <dd className="text-sm font-semibold text-stone-800">
                  {fmtMoney(snap.base_salary, snap.salary_currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs text-stone-600">Additions</dt>
                <dd className="text-sm font-semibold text-emerald-600">
                  {fmtMoney(0, snap.salary_currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs text-stone-600">
                  Deductions
                  {snap.half_day_late_days > 0 ? (
                    <span className="ml-1 text-[10px] text-rose-500 font-semibold">
                      ({snap.half_day_late_days} half-day late)
                    </span>
                  ) : null}
                </dt>
                <dd
                  className={`text-sm font-semibold ${
                    snap.late_deduction_amount > 0 ? "text-rose-600" : "text-stone-800"
                  }`}
                >
                  {snap.late_deduction_amount > 0
                    ? `−${fmtMoney(snap.late_deduction_amount, snap.salary_currency)}`
                    : fmtMoney(0, snap.salary_currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-2.5">
                <dt className="text-xs font-semibold text-stone-700">Net Payable</dt>
                <dd className="text-sm font-bold text-stone-900">
                  {fmtMoney(snap.payable_amount, snap.salary_currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] leading-snug text-stone-400">
              Estimated for {periodLabel(snap.period_start)}. Final payroll is confirmed by Finance.
            </p>
          </>
        )}
      </Widget>
    </div>
  );
}
