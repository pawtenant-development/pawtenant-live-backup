import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import {
  fetchTodayShiftContext,
  fetchMyTodayAttendance,
  type TodayShiftContext,
  type TodayAttendanceEntry,
} from "../../../lib/attendance";
import { pktTimeString } from "../../../lib/timezones";

interface TodaySummaryWidgetProps {
  teamMemberId: string;
  reloadToken?: number;
}

function fmtClock(value: string | null | undefined): string {
  if (!value) return "—";
  const [hh, mm] = value.split(":");
  const h = Number(hh);
  const m = Number(mm ?? "0");
  if (Number.isNaN(h)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Compact "Today" summary for the Home sidebar — a small read-only line, not a
 * large card (clock controls live in the top bar). Shows today's shift and
 * clock-in time.
 */
export default function TodaySummaryWidget({ teamMemberId, reloadToken }: TodaySummaryWidgetProps) {
  const [ctx, setCtx] = useState<TodayShiftContext | null>(null);
  const [entry, setEntry] = useState<TodayAttendanceEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTodayShiftContext(teamMemberId), fetchMyTodayAttendance(teamMemberId)]).then(
      ([c, e]) => {
        if (cancelled) return;
        setCtx(c);
        setEntry(e);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [teamMemberId, reloadToken]);

  const shift = ctx?.shift && ctx.shift.is_active ? ctx.shift : null;
  const inAt = ctx?.openEntry?.clock_in_at ?? entry?.clock_in_at ?? null;
  const outAt = entry?.clock_out_at ?? null;

  return (
    <Widget icon="ri-calendar-check-line" title="Today">
      {loading ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : (
        <dl className="space-y-1.5 text-xs">
          <Row label="Shift" value={shift ? `${shift.name} · ${fmtClock(shift.start_time)}–${fmtClock(shift.end_time)}` : "No shift"} />
          <Row label="Clock In" value={inAt ? `${pktTimeString(inAt)} PKT` : "—"} />
          <Row label="Clock Out" value={outAt ? `${pktTimeString(outAt)} PKT` : ctx?.openEntry ? "In progress" : "—"} />
        </dl>
      )}
    </Widget>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-800 text-right truncate">{value}</dd>
    </div>
  );
}
