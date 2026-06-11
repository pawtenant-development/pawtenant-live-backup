import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import {
  COMP_TYPE_LABEL,
  fmtPkr,
  periodMonthLabel,
  fetchMyCompensationAdjustments,
  type MyCompensationAdjustment,
} from "../../../lib/compensation";

/**
 * My Compensation — the employee's OWN bonuses / commissions / adjustments
 * (self-scoped RPC). Pending items show as awaiting approval; only approved
 * items are included in the Salary Snapshot above.
 */

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-600",
};

export default function MyCompensationWidget() {
  const [rows, setRows] = useState<MyCompensationAdjustment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyCompensationAdjustments().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide entirely until the employee has any compensation history.
  if (rows !== null && rows.length === 0) return null;

  return (
    <Widget icon="ri-hand-coin-line" title="My Compensation">
      {rows === null ? (
        <div className="flex items-center gap-2 py-3 text-stone-400">
          <i className="ri-loader-4-line animate-spin text-base"></i>
          <span className="text-xs">Loading…</span>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-stone-100">
            {rows.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-stone-700">
                    {COMP_TYPE_LABEL[r.comp_type] ?? r.comp_type}
                    <span className="ml-1 font-normal text-stone-400">{periodMonthLabel(r.period_month)}</span>
                  </p>
                  {r.reason && <p className="text-[11px] text-stone-400 truncate">{r.reason}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-bold ${r.comp_type === "deduction" || r.amount_pkr < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {r.comp_type === "deduction" || r.amount_pkr < 0 ? "−" : "+"}{fmtPkr(Math.abs(r.amount_pkr))}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold capitalize ${STATUS_TONE[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-stone-400">
            Approved items are included in your salary snapshot. Pending items are awaiting review.
          </p>
        </>
      )}
    </Widget>
  );
}
