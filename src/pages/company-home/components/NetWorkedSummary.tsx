import { useEffect, useRef, useState } from "react";
import {
  fetchMyTodaySummary,
  fetchMySummaryRange,
  fmtHrsMins,
  fmtSigned,
  fmtDayLabel,
  shiftPktDay,
  type DayAttendanceSummary,
} from "../../../lib/attendanceNet";
import { pktDateString, pktTimeString } from "../../../lib/timezones";

interface NetWorkedSummaryProps {
  reloadToken?: number;
}

/**
 * Employee net worked time summary (Performance section). Gross clocked time
 * − break time = net worked, for today (live) plus a 7-day weekly table.
 * RPC-backed (own data only via SECURITY DEFINER). Refreshes today's figures on
 * an interval so open-session / active-break elapsed stays current. Net is
 * informational — not payroll.
 */
export default function NetWorkedSummary({ reloadToken }: NetWorkedSummaryProps) {
  const [today, setToday] = useState<DayAttendanceSummary | null>(null);
  const [week, setWeek] = useState<DayAttendanceSummary[] | null>(null);
  const pollRef = useRef<number | null>(null);

  async function loadToday() {
    setToday(await fetchMyTodaySummary());
  }
  async function loadWeek() {
    const end = pktDateString(new Date());
    const start = shiftPktDay(end, -6);
    setWeek(await fetchMySummaryRange(start, end));
  }

  useEffect(() => {
    let cancelled = false;
    fetchMyTodaySummary().then((t) => { if (!cancelled) setToday(t); });
    const end = pktDateString(new Date());
    fetchMySummaryRange(shiftPktDay(end, -6), end).then((w) => { if (!cancelled) setWeek(w); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  // Keep today's live figures fresh while clocked in / on break.
  useEffect(() => {
    pollRef.current = window.setInterval(() => { loadToday(); }, 20000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const anyAdjusted = (today?.has_adjustments ?? false) || (week ?? []).some((d) => d.has_adjustments);
  const weekNetTotal = (week ?? []).reduce((sum, d) => sum + (d.has_adjustments ? d.adjusted_net_worked_seconds : d.net_seconds), 0);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            Net Worked Time
            {anyAdjusted ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f0f9] border border-[#b8cfe6] text-[#3b6ea5] px-1.5 py-0.5 text-[9px] font-bold normal-case"><i className="ri-equalizer-line" />Adjusted</span> : null}
          </div>
          <h2 className="text-base font-semibold text-stone-900">Today</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {today?.active_clocked_in ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Clocked in
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-500">
              <i className="ri-logout-circle-line" /> Clocked out
            </span>
          )}
          {today?.active_break ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              <i className="ri-cup-line" /> On break
            </span>
          ) : null}
        </div>
      </div>

      {/* Today stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Gross" value={today ? fmtHrsMins(today.has_adjustments ? today.adjusted_gross_seconds : today.gross_seconds) : "—"} tone="stone" />
        <Stat label="Break" value={today ? fmtHrsMins(today.has_adjustments ? today.adjusted_break_seconds : today.break_seconds) : "—"} tone="amber" />
        <Stat label={today?.has_adjustments ? "Net (adjusted)" : "Net Worked"} value={today ? fmtHrsMins(today.has_adjustments ? today.adjusted_net_worked_seconds : today.net_seconds) : "—"} tone="emerald" />
      </div>
      {today?.has_adjustments ? (
        <p className="mt-2 text-[11px] text-stone-500">
          Raw net {fmtHrsMins(today.net_seconds)} · timesheet adjustment {fmtSigned(today.net_adjustment_seconds)} applied.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
        <div className="rounded-lg bg-stone-50 px-3 py-2">
          <span className="text-stone-500">First clock-in:</span>{" "}
          <span className="font-mono text-stone-800">{today?.first_clock_in ? pktTimeString(today.first_clock_in) : "—"}</span>
        </div>
        <div className="rounded-lg bg-stone-50 px-3 py-2">
          <span className="text-stone-500">Last clock-out:</span>{" "}
          <span className="font-mono text-stone-800">{today?.last_clock_out ? pktTimeString(today.last_clock_out) : "—"}</span>
        </div>
      </div>

      {/* Weekly table */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-stone-700">Last 7 days</h3>
          <span className="text-[11px] text-stone-500">
            Net total <span className="font-mono font-semibold text-stone-800">{fmtHrsMins(weekNetTotal)}</span>
          </span>
        </div>
        {week === null ? (
          <p className="text-xs text-stone-400">Loading…</p>
        ) : week.length === 0 ? (
          <p className="text-xs text-stone-500">No attendance recorded in the last 7 days.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-200">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="text-left font-semibold px-3 py-1.5">Day</th>
                  <th className="text-right font-semibold px-3 py-1.5">Gross</th>
                  <th className="text-right font-semibold px-3 py-1.5">Break</th>
                  <th className="text-right font-semibold px-3 py-1.5">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {week.map((d) => (
                  <tr key={d.work_date}>
                    <td className="px-3 py-1.5 text-stone-700">{fmtDayLabel(d.work_date)}{d.has_adjustments ? <i className="ri-equalizer-line text-[#3b6ea5] ml-1" title="Adjusted" /> : null}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-stone-700">{fmtHrsMins(d.has_adjustments ? d.adjusted_gross_seconds : d.gross_seconds)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-amber-600">{fmtHrsMins(d.has_adjustments ? d.adjusted_break_seconds : d.break_seconds)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-emerald-700">{fmtHrsMins(d.has_adjustments ? d.adjusted_net_worked_seconds : d.net_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-stone-400">
        Net = gross clocked time − break time. Live while clocked in / on break. Times in PKT. Not payroll.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "stone" | "amber" | "emerald" }) {
  const tones: Record<string, string> = {
    stone: "text-stone-900",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold font-mono ${tones[tone]}`}>{value}</div>
    </div>
  );
}
