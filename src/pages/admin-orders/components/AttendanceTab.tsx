import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchActiveTeamMembersList,
  fetchAttendanceEntries,
  formatWorkedMinutes,
  shiftPktDateString,
  type AttendanceEntry,
  type AttendanceTeamMemberLite,
} from "../../../lib/attendanceAdmin";
import { pktDateString, pktTimeString } from "../../../lib/timezones";
import AttendanceSummaryPanel from "./AttendanceSummaryPanel";
import AttendanceNetSummaryPanel from "./AttendanceNetSummaryPanel";
import AdjustedTimesheetReport from "./AdjustedTimesheetReport";
import AttendanceCorrectionsAdmin from "./AttendanceCorrectionsAdmin";
import TimesheetAdjustmentsAdmin from "./TimesheetAdjustmentsAdmin";

/**
 * AttendanceTab — Admin Attendance view (COS-048 Phase 2c).
 *
 * Read-only. Lists `time_clock_entries` for a PKT work_date range,
 * grouped by day. Owner / admin_manager only — visibility is enforced
 * by the parent admin shell's `getVisibleTabs(...)` ladder; server-side
 * RLS (`tce_admin_all`, etc.) is the second line of defence.
 *
 * Out of scope: editing entries, closing open sessions, exporting CSV,
 * forgot-to-clock-out surfacing, payroll math, weekly aggregates.
 */

type LoadState = "idle" | "loading" | "ready" | "error";

const PRESETS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
];

function defaultRange(): { from: string; to: string } {
  const today = pktDateString(new Date());
  const from = shiftPktDateString(today, -6);
  return { from, to: today };
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "");
  return parts.join("") || "?";
}

function fmtPktDayLabel(pktDate: string): string {
  if (!pktDate) return "";
  const [y, m, d] = pktDate.split("-").map(Number);
  if (!y || !m || !d) return pktDate;
  // Build a noon-UTC instant on that PKT date so display formatting is
  // stable across TZs. We only need the weekday + month/day label.
  const ts = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return ts.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function AttendanceTab() {
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [members, setMembers] = useState<AttendanceTeamMemberLite[]>([]);

  const initial = defaultRange();
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [employeeId, setEmployeeId] = useState<string>("");

  const reload = useCallback(
    async (range: { from: string; to: string }, memberId: string) => {
      setState("loading");
      setErrorMessage(null);
      try {
        const [list, rows] = await Promise.all([
          fetchActiveTeamMembersList(),
          fetchAttendanceEntries({
            fromWorkDatePkt: range.from,
            toWorkDatePkt: range.to,
            teamMemberId: memberId || undefined,
          }),
        ]);
        setMembers(list);
        setEntries(rows);
        setState("ready");
      } catch (err) {
        console.warn("[AttendanceTab] reload error", err);
        setErrorMessage("Could not load attendance. Please try again.");
        setState("error");
      }
    },
    [],
  );

  useEffect(() => {
    reload({ from: initial.from, to: initial.to }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(days: number) {
    const today = pktDateString(new Date());
    const next = { from: shiftPktDateString(today, -days), to: today };
    setFrom(next.from);
    setTo(next.to);
    reload(next, employeeId);
  }

  function applyManualRange() {
    if (!from || !to) return;
    const safe = from <= to ? { from, to } : { from: to, to: from };
    setFrom(safe.from);
    setTo(safe.to);
    reload(safe, employeeId);
  }

  function applyEmployee(next: string) {
    setEmployeeId(next);
    reload({ from, to }, next);
  }

  const grouped = useMemo(() => {
    const buckets = new Map<string, AttendanceEntry[]>();
    for (const e of entries) {
      const list = buckets.get(e.work_date) ?? [];
      list.push(e);
      buckets.set(e.work_date, list);
    }
    const ordered = Array.from(buckets.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0,
    );
    return ordered;
  }, [entries]);

  const summary = useMemo(() => {
    const employees = new Set(entries.map((e) => e.team_member_id)).size;
    const open = entries.filter((e) => !e.clock_out_at).length;
    return { count: entries.length, employees, open };
  }, [entries]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-extrabold text-gray-900">Attendance</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Read-only view of employee time-clock entries. All times shown in PKT.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={applyManualRange}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] text-white"
          >
            Apply range
          </button>

          <div className="flex items-center gap-1.5 ml-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col ml-auto">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Employee
            </label>
            <select
              value={employeeId}
              onChange={(e) => applyEmployee(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 min-w-[180px]"
            >
              <option value="">All employees</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.display_name?.trim() || "Unnamed") +
                    (m.employee_code ? ` (${m.employee_code})` : "")}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => reload({ from, to }, employeeId)}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
          >
            <i className="ri-refresh-line mr-1"></i>
            Refresh
          </button>
        </div>

        {/* Summary */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            <span className="font-bold text-slate-900">{summary.count}</span> entries
          </span>
          <span className="text-slate-300">·</span>
          <span>
            <span className="font-bold text-slate-900">{summary.employees}</span> employees
          </span>
          <span className="text-slate-300">·</span>
          <span>
            <span className="font-bold text-emerald-700">{summary.open}</span> still clocked in
          </span>
        </div>
      </div>

      {/* Error / Loading / Empty / Body */}
      {state === "error" && errorMessage ? (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center text-slate-400">
          <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
          <span className="text-sm">Loading attendance…</span>
        </div>
      ) : null}

      {state === "ready" && entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <i className="ri-time-line text-3xl text-slate-300"></i>
          <p className="mt-2 text-sm text-slate-700 font-semibold">
            No clock entries in this date range.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try expanding the range or selecting a different employee.
          </p>
          <button
            type="button"
            onClick={() => applyPreset(29)}
            className="mt-4 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Show last 30 days
          </button>
        </div>
      ) : null}

      {/* Net worked time (gross − break) per employee for a selected date. */}
      <AttendanceNetSummaryPanel />

      {/* Adjusted timesheet report + CSV export for a date range (read-only, no pay). */}
      <AdjustedTimesheetReport />

      {/* Employee attendance correction requests (approve/reject + apply to timesheet). */}
      <AttendanceCorrectionsAdmin />

      {/* Applied timesheet adjustment ledger (auditable overlay). */}
      <TimesheetAdjustmentsAdmin />

      {/* COS-052: Daily summary recompute foundation. */}
      <AttendanceSummaryPanel />

      {state === "ready" && entries.length > 0 ? (
        <div className="space-y-5">
          {grouped.map(([workDate, dayEntries]) => (
            <div key={workDate} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-900">
                  {fmtPktDayLabel(workDate)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {workDate} · {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"}
                </p>
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left font-bold px-4 py-2">Employee</th>
                      <th className="text-left font-bold px-4 py-2">Shift</th>
                      <th className="text-left font-bold px-4 py-2">Clock-in (PKT)</th>
                      <th className="text-left font-bold px-4 py-2">Clock-out (PKT)</th>
                      <th className="text-left font-bold px-4 py-2">Worked</th>
                      <th className="text-left font-bold px-4 py-2">Late</th>
                      <th className="text-left font-bold px-4 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dayEntries.map((entry) => (
                      <DesktopRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-slate-100">
                {dayEntries.map((entry) => (
                  <MobileCard key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DesktopRow({ entry }: { entry: AttendanceEntry }) {
  const isOpen = !entry.clock_out_at;
  const memberName = entry.member?.display_name?.trim() || "Unknown";
  const code = entry.member?.employee_code ?? null;
  const worked = formatWorkedMinutes(entry);

  return (
    <tr className={isOpen ? "bg-emerald-50/40" : ""}>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
            {initialsOf(memberName)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{memberName}</div>
            {code ? (
              <div className="font-mono text-[11px] text-slate-500">{code}</div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        {entry.shift?.name ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 align-top text-slate-700 font-mono text-xs">
        {pktTimeString(entry.clock_in_at)}
      </td>
      <td className="px-4 py-3 align-top text-slate-700 font-mono text-xs">
        {entry.clock_out_at ? (
          pktTimeString(entry.clock_out_at)
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            In progress
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        {worked ?? <span className="text-emerald-700 font-semibold">In progress</span>}
      </td>
      <td className="px-4 py-3 align-top">
        {entry.was_late ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold" title="Half-day late — half-day salary deduction applies (30-min grace)">
            +{entry.late_minutes ?? 0}m · ½ day
          </span>
        ) : entry.was_late === false ? (
          <span className="text-slate-400 text-xs">On time</span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
          {entry.source ?? "web"}
        </span>
      </td>
    </tr>
  );
}

function MobileCard({ entry }: { entry: AttendanceEntry }) {
  const isOpen = !entry.clock_out_at;
  const memberName = entry.member?.display_name?.trim() || "Unknown";
  const code = entry.member?.employee_code ?? null;
  const worked = formatWorkedMinutes(entry);

  return (
    <div className={`px-4 py-3 ${isOpen ? "bg-emerald-50/40" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
            {initialsOf(memberName)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{memberName}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {code ? <span className="font-mono">{code}</span> : null}
              {code && entry.shift?.name ? <span> · </span> : null}
              {entry.shift?.name ?? null}
            </div>
          </div>
        </div>
        {isOpen ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold flex-shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            In progress
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <span className="text-slate-500">In:</span>{" "}
          <span className="font-mono text-slate-800">{pktTimeString(entry.clock_in_at)}</span>
        </div>
        <div>
          <span className="text-slate-500">Out:</span>{" "}
          {entry.clock_out_at ? (
            <span className="font-mono text-slate-800">{pktTimeString(entry.clock_out_at)}</span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Worked:</span>{" "}
          <span className="text-slate-800">
            {worked ?? <span className="text-emerald-700 font-semibold">In progress</span>}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Late:</span>{" "}
          {entry.was_late ? (
            <span className="text-rose-700 font-semibold">+{entry.late_minutes ?? 0}m · ½ day</span>
          ) : entry.was_late === false ? (
            <span className="text-slate-700">On time</span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
