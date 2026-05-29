import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveTeamMembersList,
  type AttendanceTeamMemberLite,
} from "../../../lib/attendanceAdmin";
import {
  fetchDailySummariesForDate,
  formatMinutes,
  recomputeAttendanceForDay,
  summaryStatusLabel,
  type SummaryDisplay,
  type SummaryStatus,
} from "../../../lib/attendanceSummary";
import { pktDateString, pktTimeString } from "../../../lib/timezones";

/**
 * AttendanceSummaryPanel — Manual recompute UI for
 * attendance_daily_summary (COS-052 foundation).
 *
 * Owner / admin_manager only — visibility is enforced by the parent
 * Attendance tab's `getVisibleTabs(...)` ladder; server-side RLS
 * (`ads_admin_all`) is the second line of defence.
 *
 * Out of scope: payroll, leave approval, cron, automation.
 * The recompute is manual-only.
 */

type LoadState = "idle" | "ready" | "loading" | "error";

const STATUS_TONE: Record<SummaryStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  late: "bg-amber-100 text-amber-800 border-amber-200",
  incomplete: "bg-sky-100 text-sky-800 border-sky-200",
  absent: "bg-rose-100 text-rose-800 border-rose-200",
  off_day: "bg-slate-100 text-slate-700 border-slate-200",
  holiday: "bg-violet-100 text-violet-800 border-violet-200",
  not_scheduled: "bg-slate-50 text-slate-500 border-slate-200",
};

function memberLabel(m: AttendanceTeamMemberLite): string {
  const name = m.display_name?.trim() || "Unnamed";
  return m.employee_code ? `${name} (${m.employee_code})` : name;
}

function fmtSchedTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${pktTimeString(iso)} PKT`;
}

export default function AttendanceSummaryPanel() {
  const today = pktDateString(new Date());
  const [pktDate, setPktDate] = useState<string>(today);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [members, setMembers] = useState<AttendanceTeamMemberLite[]>([]);
  const [rows, setRows] = useState<SummaryDisplay[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState<boolean>(false);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const list = await fetchActiveTeamMembersList();
    setMembers(list);
  }, []);

  const loadSummaries = useCallback(
    async (date: string, memberId: string) => {
      setState("loading");
      setErrorMessage(null);
      try {
        const result = await fetchDailySummariesForDate({
          pktDate: date,
          teamMemberId: memberId || undefined,
        });
        setRows(result);
        setState("ready");
      } catch (err) {
        console.warn("[AttendanceSummaryPanel] load error", err);
        setErrorMessage("Could not load summary rows.");
        setState("error");
      }
    },
    [],
  );

  useEffect(() => {
    loadMembers();
    loadSummaries(today, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // COS-055: clear any prior recompute / error banner so it doesn't
  // linger across context changes (date, employee, load, recompute).
  function clearMessages() {
    setRecomputeMsg(null);
    setErrorMessage(null);
  }

  function handlePktDateChange(next: string) {
    clearMessages();
    setPktDate(next);
  }

  async function handleRecompute() {
    if (recomputing) return;
    if (!pktDate) {
      setRecomputeMsg("Pick a date first.");
      return;
    }
    setRecomputing(true);
    clearMessages();
    const res = await recomputeAttendanceForDay({
      pktDate,
      teamMemberId: employeeId || null,
    });
    if ("error" in res) {
      setRecomputeMsg(res.error);
    } else {
      const scopeLabel = employeeId
        ? (members.find((m) => m.id === employeeId)?.display_name?.trim() ||
            "selected employee")
        : "all active employees";
      setRecomputeMsg(
        `Recomputed ${res.recomputed} ${res.recomputed === 1 ? "row" : "rows"} for ${pktDate} (${scopeLabel}).`,
      );
      await loadSummaries(pktDate, employeeId);
    }
    setRecomputing(false);
  }

  function handleApplyDate() {
    if (!pktDate) return;
    clearMessages();
    loadSummaries(pktDate, employeeId);
  }

  function handleEmployee(next: string) {
    clearMessages();
    setEmployeeId(next);
    loadSummaries(pktDate, next);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mt-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            Daily Summary (Recompute)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Foundation only. Manual trigger. Recompute one PKT date for one or
            all active employees. Status is derived at read time from the
            stored row.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            PKT Date
          </label>
          <input
            type="date"
            value={pktDate}
            onChange={(e) => handlePktDateChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
          />
        </div>
        <button
          type="button"
          onClick={handleApplyDate}
          className="px-3 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
        >
          Load
        </button>

        <div className="flex flex-col ml-1">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
            Employee
          </label>
          <select
            value={employeeId}
            onChange={(e) => handleEmployee(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 min-w-[180px]"
          >
            <option value="">All active employees</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleRecompute}
          disabled={recomputing}
          className="px-3 py-2 text-sm font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 text-white"
        >
          {recomputing ? "Recomputing…" : "Recompute"}
        </button>
      </div>

      {recomputeMsg ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            recomputeMsg.startsWith("Recomputed")
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {recomputeMsg}
        </div>
      ) : null}

      {state === "error" && errorMessage ? (
        <div className="mt-3 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4">
        {state === "loading" ? (
          <div className="flex items-center justify-center text-slate-400 text-sm py-8 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <i className="ri-loader-4-line animate-spin text-lg mr-2"></i>
            Loading summary for {pktDate}…
          </div>
        ) : null}

        {state === "ready" && rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <i className="ri-calendar-event-line text-2xl text-slate-300"></i>
            <p className="mt-2 text-sm text-slate-700 font-semibold">
              No summary rows for {pktDate} yet.
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Click <strong>Recompute</strong> above to generate them, or
              switch to a different PKT date / employee.
            </p>
          </div>
        ) : null}

        {state === "ready" && rows.length > 0 ? (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Employee</th>
                    <th className="text-left font-bold px-3 py-2">Shift</th>
                    <th className="text-left font-bold px-3 py-2">Scheduled</th>
                    <th className="text-left font-bold px-3 py-2">Clock-in</th>
                    <th className="text-left font-bold px-3 py-2">Clock-out</th>
                    <th className="text-left font-bold px-3 py-2">Worked</th>
                    <th className="text-left font-bold px-3 py-2">Late</th>
                    <th className="text-left font-bold px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <DesktopSummaryRow key={r.row.team_member_id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {rows.map((r) => (
                <MobileSummaryCard key={r.row.team_member_id} row={r} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SummaryStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_TONE[status]}`}
    >
      {summaryStatusLabel(status)}
    </span>
  );
}

function DesktopSummaryRow({ row }: { row: SummaryDisplay }) {
  const memberName = row.member?.display_name?.trim() || "Unknown";
  const code = row.member?.employee_code ?? null;
  const shiftName = row.shift?.name ?? "—";
  const scheduled = row.scheduled_start_at
    ? `${fmtSchedTime(row.scheduled_start_at)} – ${fmtSchedTime(row.scheduled_end_at)}`
    : "—";
  const outOfWindow = row.out_of_window_count;

  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <div className="font-semibold text-slate-900 truncate">{memberName}</div>
        {code ? (
          <div className="font-mono text-[11px] text-slate-500">{code}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-slate-700">
        <div className="font-semibold">{shiftName}</div>
        {row.shift?.crosses_midnight ? (
          <div className="text-[10px] text-slate-500">overnight</div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-700">
        {scheduled}
      </td>
      <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-700">
        {row.row.first_clock_in_at ? pktTimeString(row.row.first_clock_in_at) : "—"}
      </td>
      <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-700">
        {row.row.last_clock_out_at ? pktTimeString(row.row.last_clock_out_at) : "—"}
      </td>
      <td className="px-3 py-2 align-top text-slate-700">
        {formatMinutes(row.row.total_worked_minutes)}
      </td>
      <td className="px-3 py-2 align-top">
        {row.row.was_late ? (
          <span className="text-rose-700 font-semibold text-xs">
            +{row.row.late_minutes}m
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col items-start gap-0.5">
          <StatusPill status={row.status} />
          {outOfWindow > 0 ? (
            <span
              className="text-[10px] text-amber-700 font-semibold"
              title={`${outOfWindow} time-clock ${outOfWindow === 1 ? "entry" : "entries"} on this date fell outside the shift's tolerance window and were not counted.`}
            >
              {outOfWindow} outside window
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function MobileSummaryCard({ row }: { row: SummaryDisplay }) {
  const memberName = row.member?.display_name?.trim() || "Unknown";
  const code = row.member?.employee_code ?? null;
  const shiftName = row.shift?.name ?? "—";
  const scheduled = row.scheduled_start_at
    ? `${fmtSchedTime(row.scheduled_start_at)} – ${fmtSchedTime(row.scheduled_end_at)}`
    : "—";
  const outOfWindow = row.out_of_window_count;

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{memberName}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {code ? <span className="font-mono">{code}</span> : null}
            {code && shiftName !== "—" ? <span> · </span> : null}
            {shiftName !== "—" ? shiftName : null}
            {row.shift?.crosses_midnight ? <span> · overnight</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <StatusPill status={row.status} />
          {outOfWindow > 0 ? (
            <span className="text-[10px] text-amber-700 font-semibold">
              {outOfWindow} outside window
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="col-span-2">
          <span className="text-slate-500">Scheduled:</span>{" "}
          <span className="font-mono text-slate-800">{scheduled}</span>
        </div>
        <div>
          <span className="text-slate-500">In:</span>{" "}
          <span className="font-mono text-slate-800">
            {row.row.first_clock_in_at ? pktTimeString(row.row.first_clock_in_at) : "—"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Out:</span>{" "}
          <span className="font-mono text-slate-800">
            {row.row.last_clock_out_at ? pktTimeString(row.row.last_clock_out_at) : "—"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Worked:</span>{" "}
          <span className="text-slate-800">
            {formatMinutes(row.row.total_worked_minutes)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Late:</span>{" "}
          {row.row.was_late ? (
            <span className="text-rose-700 font-semibold">
              +{row.row.late_minutes}m
            </span>
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
