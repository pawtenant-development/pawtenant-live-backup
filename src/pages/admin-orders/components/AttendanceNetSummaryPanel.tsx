import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTeamSummaryForDate,
  fmtHrsMins,
  fmtSigned,
  type TeamAttendanceSummaryRow,
} from "../../../lib/attendanceNet";
import { pktDateString, pktTimeString } from "../../../lib/timezones";
import { DOMAIN_ROLE_LABEL } from "../../../lib/teamMembers";

/**
 * Admin net worked time panel (inside the Attendance tab). For a selected PKT
 * date, shows each employee's gross clocked time, break time, and net worked
 * time, with first/last clock, live clocked-in / on-break flags, and an
 * approved-leave indicator. RPC-backed (owner/admin_manager + is_admin only,
 * server-enforced). Read-only; not payroll.
 */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function AttendanceNetSummaryPanel() {
  const [date, setDate] = useState<string>(() => pktDateString(new Date()));
  const [rows, setRows] = useState<TeamAttendanceSummaryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setRows(await fetchTeamSummaryForDate(d));
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      (r.display_name ?? "").toLowerCase().includes(q) ||
      (r.employee_code ?? "").toLowerCase().includes(q) ||
      (r.title ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.gross += r.gross_seconds;
        acc.brk += r.break_seconds;
        acc.net += r.net_seconds;
        acc.adjNet += r.adjusted_net_worked_seconds;
        if (r.has_adjustments) acc.anyAdj = true;
        if (r.active_clocked_in) acc.clockedIn += 1;
        if (r.active_break) acc.onBreak += 1;
        return acc;
      },
      { gross: 0, brk: 0, net: 0, adjNet: 0, anyAdj: false, clockedIn: 0, onBreak: 0 },
    );
  }, [filtered]);

  const isToday = date === pktDateString(new Date());

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Net Worked Time</p>
          <p className="text-[11px] text-slate-500">Gross clocked − break = net worked, per employee. PKT.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…"
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900" />
          <input type="date" value={date} max={pktDateString(new Date())} onChange={(e) => setDate(e.target.value || pktDateString(new Date()))}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900" />
          <button type="button" onClick={() => setDate(pktDateString(new Date()))}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Today</button>
          <button type="button" onClick={() => load(date)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300">
            <i className="ri-refresh-line mr-1" />Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center text-slate-400">
          <i className="ri-loader-4-line animate-spin text-xl mr-2" /><span className="text-sm">Loading summary…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <i className="ri-time-line text-3xl text-slate-300" />
          <p className="mt-2 text-sm text-slate-700 font-semibold">No attendance for this date.</p>
          <p className="mt-1 text-xs text-slate-500">No clock, break, or approved-leave activity on {date}.</p>
        </div>
      ) : (
        <>
          {/* Totals strip */}
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 border-b border-slate-100 bg-slate-50/50">
            <span><span className="font-bold text-slate-900">{filtered.length}</span> employees</span>
            <span className="text-slate-300">·</span>
            <span>Gross <span className="font-mono font-bold text-slate-900">{fmtHrsMins(totals.gross)}</span></span>
            <span>Break <span className="font-mono font-bold text-amber-600">{fmtHrsMins(totals.brk)}</span></span>
            <span>Net <span className="font-mono font-bold text-emerald-700">{fmtHrsMins(totals.anyAdj ? totals.adjNet : totals.net)}</span>{totals.anyAdj ? <span className="ml-1 text-[10px] font-semibold text-[#3b6ea5]">(adjusted)</span> : null}</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-bold text-emerald-700">{totals.clockedIn}</span> clocked in</span>
            <span><span className="font-bold text-rose-600">{totals.onBreak}</span> on break</span>
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-2">Employee</th>
                  <th className="text-left font-bold px-4 py-2">First in</th>
                  <th className="text-left font-bold px-4 py-2">Last out</th>
                  <th className="text-right font-bold px-4 py-2">Gross</th>
                  <th className="text-right font-bold px-4 py-2">Break</th>
                  <th className="text-right font-bold px-4 py-2">Net</th>
                  <th className="text-left font-bold px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.team_member_id} className={r.active_clocked_in ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                          {initials(r.display_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{r.display_name ?? "Unknown"}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {r.employee_code ? <span className="font-mono">{r.employee_code}</span> : null}
                            {r.title ? ` · ${r.title}` : ""}
                            {r.domain_role ? ` · ${DOMAIN_ROLE_LABEL[r.domain_role] ?? r.domain_role}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.first_clock_in ? pktTimeString(r.first_clock_in) : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.last_clock_out ? pktTimeString(r.last_clock_out) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">{fmtHrsMins(r.gross_seconds)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-600">{fmtHrsMins(r.break_seconds)}{r.break_count ? <span className="text-slate-400 text-[10px]"> ·{r.break_count}</span> : null}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.has_adjustments ? (
                        <div className="leading-tight">
                          <div className="font-mono font-semibold text-emerald-700">{fmtHrsMins(r.adjusted_net_worked_seconds)}</div>
                          <div className="text-[10px] text-slate-400">raw {fmtHrsMins(r.net_seconds)} · {fmtSigned(r.net_adjustment_seconds)}</div>
                        </div>
                      ) : (
                        <span className="font-mono font-semibold text-emerald-700">{fmtHrsMins(r.net_seconds)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.has_adjustments ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#e8f0f9] border border-[#b8cfe6] text-[#3b6ea5] text-[10px] font-semibold"><i className="ri-equalizer-line" />Adjusted</span>
                        ) : null}
                        {r.active_break ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"><i className="ri-cup-line" />On break</span>
                        ) : r.active_clocked_in ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Clocked in</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                        {r.on_leave ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-semibold"><i className="ri-calendar-check-line" />Approved leave</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filtered.map((r) => (
              <div key={r.team_member_id} className={`px-4 py-3 ${r.active_clocked_in ? "bg-emerald-50/40" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{initials(r.display_name)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{r.display_name ?? "Unknown"}</div>
                      <div className="text-[11px] text-slate-500 truncate">{r.employee_code ? <span className="font-mono">{r.employee_code}</span> : null}{r.title ? ` · ${r.title}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 flex-shrink-0">
                    {r.active_break ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"><i className="ri-cup-line" />Break</span>
                      : r.active_clocked_in ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">In</span> : null}
                    {r.on_leave ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-semibold">Leave</span> : null}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-500">Gross</span><div className="font-mono text-slate-800">{fmtHrsMins(r.gross_seconds)}</div></div>
                  <div><span className="text-slate-500">Break</span><div className="font-mono text-amber-600">{fmtHrsMins(r.break_seconds)}</div></div>
                  <div><span className="text-slate-500">Net</span><div className="font-mono font-semibold text-emerald-700">{fmtHrsMins(r.net_seconds)}</div></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isToday ? (
        <div className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">Live — gross/break include open sessions and active breaks.</div>
      ) : null}
    </div>
  );
}
