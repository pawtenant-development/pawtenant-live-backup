import { useEffect, useMemo, useState } from "react";
import {
  fetchAllTimesheetAdjustments,
  reverseTimesheetAdjustment,
  ADJ_KIND_LABEL,
  type TimesheetAdjustment,
} from "../../../lib/timesheetAdjustments";
import { fmtSigned } from "../../../lib/attendanceNet";
import { fetchAllEmployees } from "../../../lib/employeeHr";
import { type TeamMember } from "../../../lib/teamMembers";

/**
 * Admin "Applied Adjustments" ledger view (Attendance tab). Lists recent
 * timesheet adjustments with gross/break/net impact and source correction.
 * Owner / admin_manager only (RLS). Reverse keeps the audit row.
 */
const STATUS_FILTERS = ["all", "applied", "reversed"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function TimesheetAdjustmentsAdmin() {
  const [rows, setRows] = useState<TimesheetAdjustment[] | null>(null);
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("applied");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, emps] = await Promise.all([fetchAllTimesheetAdjustments(), fetchAllEmployees()]);
    setRows(a); setEmployees(emps);
  }
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => { const m = new Map<string, TeamMember>(); employees.forEach((e) => m.set(e.id, e)); return m; }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!q) return true;
        const e = empById.get(r.team_member_id);
        return (e?.display_name ?? "").toLowerCase().includes(q) || (e?.employee_code ?? "").toLowerCase().includes(q);
      });
  }, [rows, statusFilter, search, empById]);

  async function handleReverse(adj: TimesheetAdjustment) {
    const reason = window.prompt("Reason for reversing this adjustment?");
    if (!reason || !reason.trim()) return;
    setBusyId(adj.id); setError(null);
    const err = await reverseTimesheetAdjustment(adj.id, reason.trim());
    if (err) setError(err); else await load();
    setBusyId(null);
  }

  const appliedCount = (rows ?? []).filter((r) => r.status === "applied").length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Applied Timesheet Adjustments</p>
          <p className="text-[11px] text-slate-500">{appliedCount} applied · auditable overlay — raw clock/break records are never changed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…"
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All" : s === "applied" ? "Applied" : "Reversed"}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-rose-600">{error}</p>}

      {rows === null ? (
        <div className="p-8 flex items-center justify-center text-slate-400"><i className="ri-loader-4-line animate-spin text-xl mr-2" /><span className="text-sm">Loading…</span></div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <i className="ri-equalizer-line text-3xl text-slate-300" />
          <p className="mt-2 text-sm text-slate-700 font-semibold">No timesheet adjustments</p>
          <p className="mt-1 text-xs text-slate-500">Approved attendance corrections you apply will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left font-bold px-4 py-2">Employee</th>
                <th className="text-left font-bold px-4 py-2">Date</th>
                <th className="text-left font-bold px-4 py-2">Kind</th>
                <th className="text-right font-bold px-4 py-2">Gross</th>
                <th className="text-right font-bold px-4 py-2">Break</th>
                <th className="text-right font-bold px-4 py-2">Net</th>
                <th className="text-left font-bold px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const e = empById.get(a.team_member_id);
                const reversed = a.status === "reversed";
                return (
                  <tr key={a.id} className={reversed ? "opacity-60" : ""}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900 truncate">{e?.display_name ?? "Unknown"}</div>
                      {e?.employee_code ? <div className="font-mono text-[11px] text-slate-500">{e.employee_code}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{new Date(a.adjustment_date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{ADJ_KIND_LABEL[a.adjustment_kind] ?? a.adjustment_kind}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">{fmtSigned(a.gross_adjustment_seconds)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-600">{fmtSigned(a.break_adjustment_seconds)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700">{fmtSigned(a.net_adjustment_seconds)}</td>
                    <td className="px-4 py-2.5">
                      {reversed ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-semibold" title={a.reversal_reason ?? ""}>Reversed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">Applied</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!reversed && (
                        <button type="button" disabled={busyId === a.id} onClick={() => handleReverse(a)}
                          className="rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold">Reverse</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
