import { useState, useCallback } from "react";
import { monthlyPeriods } from "../../../lib/accountsPeriods";
import {
  fetchPayrollSnapshots, generatePayrollSnapshot, type PayrollSnapshotRow,
} from "../../../lib/accountsBooks";

// ── Payroll Archive (per-employee monthly snapshots) ────────────────────────
// Frozen history of what each employee was actually payable per month. Unlike
// the live "Estimated Salary Expense" (which recomputes with CURRENT employee
// status, so offboarded staff drop off / show $0), these rows are captured at
// payroll time and survive offboarding — so prior months stay correct.
//
// Snapshots are written automatically when the monthly payroll summary email is
// sent, and can be generated on demand here (does NOT send any email). Visible
// to accounts admins only (RLS); returns empty for everyone else.

const fmtPkr = (n: number | null) => `PKR ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const fmtUsd = (n: number | null) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

interface MonthGroup {
  periodStart: string;
  label: string;
  rows: PayrollSnapshotRow[];
  totalPkr: number;
  totalUsd: number;
}

function groupByMonth(rows: PayrollSnapshotRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const r of rows) {
    const g = map.get(r.period_start) ?? {
      periodStart: r.period_start,
      label: r.report_label || fmtMonth(r.period_start),
      rows: [], totalPkr: 0, totalUsd: 0,
    };
    g.rows.push(r);
    g.totalPkr += Number(r.net_payable) || 0;
    g.totalUsd += Number(r.net_payable_usd) || 0;
    map.set(r.period_start, g);
  }
  return Array.from(map.values()).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
}

export default function PayrollArchivePanel({ canManage = false }: { canManage?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<MonthGroup[]>([]);
  const [err, setErr] = useState("");
  const [genKey, setGenKey] = useState(""); // period_start of a month being generated
  const [genMonth, setGenMonth] = useState(""); // selected month key in the picker
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const months = monthlyPeriods(12);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const oldest = months[months.length - 1];
      const newest = months[0];
      const rows = await fetchPayrollSnapshots(oldest.from, newest.to);
      setGroups(groupByMonth(rows));
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load payroll archive");
    }
    setLoading(false);
  }, [months]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) load();
  };

  const handleGenerate = async (fromKey: string) => {
    const m = months.find((x) => x.from === fromKey) ?? (genMonth ? months.find((x) => x.key === genMonth) : null);
    if (!m) { setToast({ ok: false, msg: "Pick a month first." }); return; }
    setGenKey(m.from);
    const res = await generatePayrollSnapshot(m.from, m.to, m.label);
    setGenKey("");
    if (res.error) { setToast({ ok: false, msg: res.error }); return; }
    setToast({ ok: true, msg: `Saved ${res.count ?? 0} employee snapshot${res.count === 1 ? "" : "s"} for ${m.label}.` });
    await load();
  };

  return (
    <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
        <div className="flex items-center gap-2">
          <i className="ri-archive-2-line text-[#3b6ea5]"></i>
          <h3 className="text-sm font-extrabold text-gray-900">Payroll Archive</h3>
          <span className="text-[10px] font-semibold text-gray-400">per-employee monthly history</span>
        </div>
        <i className={`text-gray-400 ${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
      </button>

      {open && (
        <div className="p-3">
          {err && <div className="mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{err}</div>}
          {toast && (
            <div className={`mb-2 px-4 py-2 rounded-lg text-xs flex items-center gap-2 border ${toast.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              <i className={toast.ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}></i>
              <span className="flex-1">{toast.msg}</span>
              <button type="button" onClick={() => setToast(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer"><i className="ri-close-line"></i></button>
            </div>
          )}

          {canManage && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-[11px] font-semibold text-gray-500">Save / refresh a month’s snapshot:</span>
              <select value={genMonth} onChange={(e) => setGenMonth(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white text-xs px-2 h-8">
                <option value="">Select month…</option>
                {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <button type="button" disabled={!genMonth || !!genKey}
                onClick={() => { const m = months.find((x) => x.key === genMonth); if (m) handleGenerate(m.from); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 h-8 text-xs font-bold text-white">
                {genKey ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />} Save snapshot
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400"><i className="ri-loader-4-line animate-spin text-2xl block mb-2"></i>Loading payroll archive…</div>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">
              No payroll snapshots yet. Snapshots are saved automatically when the monthly payroll summary is sent{canManage ? ", or use “Save snapshot” above" : ""}.
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.periodStart} className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <span className="text-xs font-extrabold text-gray-800">{g.label}</span>
                    <span className="text-[11px] text-gray-500">
                      {g.rows.length} employee{g.rows.length === 1 ? "" : "s"} ·{" "}
                      <span className="font-bold text-gray-700">{fmtPkr(g.totalPkr)}</span>
                      <span className="text-gray-400"> · {fmtUsd(g.totalUsd)}</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                          <th className="text-left py-2 px-3">Employee</th>
                          <th className="text-right py-2 px-2">Base</th>
                          <th className="text-right py-2 px-2">Late ded.</th>
                          <th className="text-right py-2 px-2">Net Payable</th>
                          <th className="text-right py-2 px-3">USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 px-3">
                              <span className="font-semibold text-gray-800">{r.employee_name || "Unknown"}</span>
                              {r.employee_code ? <span className="text-gray-400"> · {r.employee_code}</span> : null}
                              {r.employment_status_at_period_end && r.employment_status_at_period_end !== "active" && (
                                <span className="ml-1 text-[9px] font-semibold text-slate-500">({r.employment_status_at_period_end})</span>
                              )}
                            </td>
                            <td className="text-right py-2 px-2 text-gray-600">{Math.round(Number(r.base_salary) || 0).toLocaleString()} {r.salary_currency}</td>
                            <td className={`text-right py-2 px-2 ${(Number(r.attendance_deduction_amount) || 0) > 0 ? "text-rose-500" : "text-gray-400"}`}>
                              {(Number(r.attendance_deduction_amount) || 0) > 0 ? `−${Math.round(Number(r.attendance_deduction_amount)).toLocaleString()}` : "—"}
                            </td>
                            <td className="text-right py-2 px-2 font-bold text-gray-800">{Math.round(Number(r.net_payable) || 0).toLocaleString()} {r.salary_currency}</td>
                            <td className="text-right py-2 px-3 text-[#1a5c4f]">{fmtUsd(r.net_payable_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[10px] leading-snug text-gray-400">
            Archived figures are frozen at payroll time and are not affected by later changes to an employee’s status —
            so an offboarded employee’s prior months stay correct. Owners are excluded. Admin/finance only.
          </p>
        </div>
      )}
    </div>
  );
}
