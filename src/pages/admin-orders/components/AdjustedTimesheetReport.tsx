import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTeamAdjustedTimesheetRange,
  summarize,
  exportTimesheetSummaryCSV,
  exportTimesheetDailyCSV,
  type EmployeeTimesheetSummary,
} from "../../../lib/timesheetReport";
import { fmtHrsMins, fmtSigned, shiftPktDay, fmtDayLabel } from "../../../lib/attendanceNet";
import { pktDateString } from "../../../lib/timezones";
import { DOMAIN_ROLE_LABEL } from "../../../lib/teamMembers";

/**
 * Admin Adjusted Timesheet report (Attendance tab). Read-only per-employee
 * summary + daily drilldown for a date range, raw vs applied-adjusted time, with
 * leave / correction / adjustment counts and CSV export. Owner/admin_manager
 * only (RPC-enforced). NO salary / pay / payroll data of any kind.
 */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function AdjustedTimesheetReport() {
  const today = pktDateString(new Date());
  const [start, setStart] = useState<string>(() => shiftPktDay(today, -29));
  const [end, setEnd] = useState<string>(today);
  const [summaries, setSummaries] = useState<EmployeeTimesheetSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fAdjusted, setFAdjusted] = useState(false);
  const [fPending, setFPending] = useState(false);
  const [fLeave, setFLeave] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (s: string, e: string) => {
    setLoading(true);
    const rows = await fetchTeamAdjustedTimesheetRange(s, e);
    setSummaries(summarize(rows));
    setLoading(false);
  }, []);

  useEffect(() => { load(start, end); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (summaries ?? []).filter((s) => {
      if (q && !((s.display_name ?? "").toLowerCase().includes(q) || (s.employee_code ?? "").toLowerCase().includes(q) || (s.title ?? "").toLowerCase().includes(q))) return false;
      if (fAdjusted && !s.has_adjustments) return false;
      if (fPending && !s.has_pending_correction) return false;
      if (fLeave && !s.has_approved_leave) return false;
      return true;
    });
  }, [summaries, search, fAdjusted, fPending, fLeave]);

  const inputCls = "px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900";

  function applyRange() { if (start && end) load(start <= end ? start : end, start <= end ? end : start); }
  function preset(days: number) {
    const e = pktDateString(new Date());
    const s = shiftPktDay(e, -(days - 1));
    setStart(s); setEnd(e); load(s, e);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Adjusted Timesheet Report</p>
          <p className="text-[11px] text-slate-500">Raw vs adjusted worked time per employee. Read-only · PKT · no pay/salary.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!filtered.length} onClick={() => exportTimesheetSummaryCSV(filtered, start, end)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-50 text-white"><i className="ri-download-2-line mr-1" />Summary CSV</button>
          <button type="button" disabled={!filtered.length} onClick={() => exportTimesheetDailyCSV(filtered, start, end)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 disabled:opacity-50"><i className="ri-download-2-line mr-1" />Daily CSV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-end gap-2">
        <div className="flex flex-col"><label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">From</label>
          <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={inputCls} /></div>
        <div className="flex flex-col"><label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">To</label>
          <input type="date" value={end} max={today} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></div>
        <button type="button" onClick={applyRange} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] text-white">Apply</button>
        <div className="flex items-center gap-1.5">
          {[{ l: "7d", d: 7 }, { l: "30d", d: 30 }].map((p) => (
            <button key={p.l} type="button" onClick={() => preset(p.d)} className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">{p.l}</button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className={`${inputCls} ml-auto`} />
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={fAdjusted} onChange={(e) => setFAdjusted(e.target.checked)} className="rounded border-slate-300" />Adjusted</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={fPending} onChange={(e) => setFPending(e.target.checked)} className="rounded border-slate-300" />Pending corr.</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={fLeave} onChange={(e) => setFLeave(e.target.checked)} className="rounded border-slate-300" />On leave</label>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center text-slate-400"><i className="ri-loader-4-line animate-spin text-xl mr-2" /><span className="text-sm">Loading report…</span></div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <i className="ri-file-list-3-line text-3xl text-slate-300" />
          <p className="mt-2 text-sm text-slate-700 font-semibold">No timesheet activity</p>
          <p className="mt-1 text-xs text-slate-500">No clock, break, adjustment, correction, or approved-leave activity in this range/filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left font-bold px-4 py-2">Employee</th>
                <th className="text-right font-bold px-3 py-2">Raw Net</th>
                <th className="text-right font-bold px-3 py-2">Adj</th>
                <th className="text-right font-bold px-3 py-2">Adjusted Net</th>
                <th className="text-right font-bold px-3 py-2">Gross</th>
                <th className="text-right font-bold px-3 py-2">Break</th>
                <th className="text-center font-bold px-3 py-2">Leave</th>
                <th className="text-center font-bold px-3 py-2">Corr (P/A)</th>
                <th className="text-center font-bold px-3 py-2">Adj (A/R)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => {
                const isOpen = expanded === s.team_member_id;
                return (
                  <Fragment key={s.team_member_id}>
                    <tr className={s.has_adjustments ? "bg-[#f4f8fc]" : ""}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{initials(s.display_name)}</div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{s.display_name ?? "Unknown"}{s.has_open_session ? <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">open</span> : null}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {s.employee_code ? <span className="font-mono">{s.employee_code}</span> : null}
                              {s.title ? ` · ${s.title}` : ""}{s.domain_role ? ` · ${DOMAIN_ROLE_LABEL[s.domain_role] ?? s.domain_role}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700">{fmtHrsMins(s.net_seconds)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#3b6ea5]">{s.net_adjustment_seconds ? fmtSigned(s.net_adjustment_seconds) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">{fmtHrsMins(s.adjusted_net_seconds)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmtHrsMins(s.adjusted_gross_seconds)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-600">{fmtHrsMins(s.adjusted_break_seconds)}</td>
                      <td className="px-3 py-2.5 text-center text-slate-700">{s.leave_days || "—"}</td>
                      <td className="px-3 py-2.5 text-center text-slate-700">{s.pending_corrections}/{s.approved_corrections}</td>
                      <td className="px-3 py-2.5 text-center text-slate-700">{s.applied_adjustments}/{s.reversed_adjustments}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={() => setExpanded(isOpen ? null : s.team_member_id)}
                          className="text-[11px] font-semibold text-[#3b6ea5] hover:underline">{isOpen ? "Hide" : "View days"}</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={10} className="px-4 py-2 bg-slate-50/60">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-[10px] uppercase tracking-wide text-slate-400">
                                <tr>
                                  <th className="text-left font-semibold px-2 py-1">Day</th>
                                  <th className="text-right font-semibold px-2 py-1">Raw Net</th>
                                  <th className="text-right font-semibold px-2 py-1">Adj</th>
                                  <th className="text-right font-semibold px-2 py-1">Adjusted Net</th>
                                  <th className="text-left font-semibold px-2 py-1">Flags</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {s.days.map((d) => (
                                  <tr key={d.work_date}>
                                    <td className="px-2 py-1 text-slate-700">{fmtDayLabel(d.work_date)}</td>
                                    <td className="px-2 py-1 text-right font-mono text-slate-600">{fmtHrsMins(d.net_seconds)}</td>
                                    <td className="px-2 py-1 text-right font-mono text-[#3b6ea5]">{d.net_adjustment_seconds ? fmtSigned(d.net_adjustment_seconds) : "—"}</td>
                                    <td className="px-2 py-1 text-right font-mono font-semibold text-emerald-700">{fmtHrsMins(d.adjusted_net_seconds)}</td>
                                    <td className="px-2 py-1">
                                      <span className="flex flex-wrap gap-1">
                                        {d.applied_adjustments > 0 ? <span className="px-1.5 py-0.5 rounded bg-[#e8f0f9] text-[#3b6ea5] text-[10px] font-semibold">adj×{d.applied_adjustments}</span> : null}
                                        {d.on_leave ? <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold">leave</span> : null}
                                        {d.pending_corrections > 0 ? <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">pending×{d.pending_corrections}</span> : null}
                                        {d.has_open_session ? <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">open</span> : null}
                                        {d.reversed_adjustments > 0 ? <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">rev×{d.reversed_adjustments}</span> : null}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">Times in PKT. Adjusted = raw + applied (non-reversed) adjustments. No salary/pay data.</p>
        </div>
      )}
    </div>
  );
}
