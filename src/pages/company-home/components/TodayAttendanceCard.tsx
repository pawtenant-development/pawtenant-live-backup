import { useEffect, useState } from "react";
import {
  fetchMyTodayAttendance,
  type TodayAttendanceEntry,
} from "../../../lib/attendance";
import { pktTime12String } from "../../../lib/timezones";

interface TodayAttendanceCardProps {
  teamMemberId: string;
  /** Bumped by the Workday panel after clock changes so this card refetches. */
  reloadToken?: number;
}

/**
 * Today's Attendance card — read-only summary of the employee's own
 * time-clock entry for today (PKT). Shows clock-in time, clock-out time (or an
 * "In progress" badge), worked duration, and a late / on-time hint.
 *
 * Self-only by RLS. Clocking in/out happens in the Today's Shift card; this
 * card never mutates data — it only reports.
 */

/** Whole-minute difference rendered as "Xh Ym" / "Ym". */
function formatDuration(fromIso: string, toIso: string): string {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return "—";
  const totalMin = Math.floor((to - from) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function TodayAttendanceCard({ teamMemberId, reloadToken }: TodayAttendanceCardProps) {
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<TodayAttendanceEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyTodayAttendance(teamMemberId).then((row) => {
      if (cancelled) return;
      setEntry(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamMemberId, reloadToken]);

  const inProgress = !!entry && !entry.clock_out_at;
  const duration = entry
    ? formatDuration(entry.clock_in_at, entry.clock_out_at ?? new Date().toISOString())
    : "—";

  return (
    <div id="attendance" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5 sm:p-6">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">Today's Attendance</div>
      <h2 className="text-base font-semibold text-stone-900">Clock Record</h2>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-stone-400">
          <i className="ri-loader-4-line animate-spin text-base"></i>
          <span className="text-xs">Loading attendance…</span>
        </div>
      ) : !entry ? (
        <div className="mt-4 rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-600">
          No clock-in recorded today.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Clock In" value={pktTime12String(entry.clock_in_at)} />
            <Stat
              label="Clock Out"
              value={entry.clock_out_at ? pktTime12String(entry.clock_out_at) : "—"}
            />
            <Stat label="Worked" value={duration} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {inProgress ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                In progress
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-xs font-medium text-stone-700">
                <i className="ri-check-line"></i>
                Completed
              </span>
            )}

            {/* ½-day applies only at 30+ min after shift start (policy floor).
                Rows written under the old 15-min grace can carry a stale
                was_late flag, so re-check the minutes before claiming ½-day. */}
            {entry.was_late && (entry.late_minutes ?? 0) >= 30 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800">
                <i className="ri-time-line"></i>
                Late by {entry.late_minutes} min · half-day
              </span>
            ) : entry.was_late !== null && entry.was_late !== undefined ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-800">
                <i className="ri-checkbox-circle-line"></i>
                On time
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-[11px] text-stone-400">Times shown in PKT.</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-2 py-3">
      <div className="text-[10px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-stone-900">{value}</div>
    </div>
  );
}
