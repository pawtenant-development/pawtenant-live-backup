import { useEffect, useState } from "react";
import {
  fetchTodayShiftContext,
  type TodayShiftContext,
} from "../../../lib/attendance";
import { PAWTENANT_BUSINESS_TZ } from "../../../lib/timezones";

interface TodayShiftCardProps {
  teamMemberId: string;
  /** Bumped by the Workday panel after clock changes so this card refetches. */
  reloadToken?: number;
}

/**
 * Today's Shift — read-only shift detail for the /company dashboard grid.
 *
 * The clock-in / clock-out action now lives in the prominent Workday panel at
 * the top of the portal; this card only *describes* today's assigned shift
 * (name, time, day-off, grace window). It never mutates data.
 */

function formatShiftClock(value: string | null | undefined): string {
  if (!value) return "—";
  const [hh, mm] = value.split(":");
  const h = Number(hh);
  const m = Number(mm ?? "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Today's PKT day-of-week (0=Sun…6=Sat) via a tz-stable noon-UTC anchor. */
function pktDayOfWeek(): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: PAWTENANT_BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export default function TodayShiftCard({ teamMemberId, reloadToken }: TodayShiftCardProps) {
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<TodayShiftContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTodayShiftContext(teamMemberId).then((c) => {
      if (cancelled) return;
      setCtx(c);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamMemberId, reloadToken]);

  const shift = ctx?.shift && ctx.shift.is_active ? ctx.shift : null;
  const offToday =
    !!ctx?.assignment?.weekly_off_days &&
    ctx.assignment.weekly_off_days.includes(pktDayOfWeek());

  return (
    <div id="shift" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5 sm:p-6">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">Today's Shift</div>
      <h2 className="text-base font-semibold text-stone-900">Schedule</h2>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-stone-400">
          <i className="ri-loader-4-line animate-spin text-base" />
          <span className="text-xs">Loading shift…</span>
        </div>
      ) : offToday ? (
        <div className="mt-4 rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-600">
          <i className="ri-calendar-close-line mr-1.5 text-stone-400" />
          Today is your scheduled day off.
        </div>
      ) : shift ? (
        <div className="mt-4 space-y-2.5">
          <Row label="Shift" value={shift.name} />
          <Row
            label="Time"
            value={`${formatShiftClock(shift.start_time)} – ${formatShiftClock(shift.end_time)} PKT`}
          />
          {shift.crosses_midnight ? <Row label="Overnight" value="Crosses midnight" /> : null}
          {typeof shift.grace_minutes === "number" ? (
            <Row label="Grace" value={`${shift.grace_minutes} min`} />
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-600">
          No shift assigned for today.
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2.5 last:border-0 last:pb-0">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <span className="text-sm font-semibold text-stone-900 text-right">{value}</span>
    </div>
  );
}
