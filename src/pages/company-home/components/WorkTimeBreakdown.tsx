import { useEffect, useRef, useState } from "react";
import {
  fetchTodayShiftContext,
  fetchMyTodayAttendance,
  type TodayShiftContext,
  type TodayAttendanceEntry,
} from "../../../lib/attendance";

interface WorkTimeBreakdownProps {
  teamMemberId: string;
  reloadToken?: number;
}

function fmtHM(totalMin: number): string {
  const m = Math.max(0, Math.floor(totalMin));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}h ${String(m % 60).padStart(2, "0")}m`;
}

function workedMinutes(
  ctx: TodayShiftContext | null,
  today: TodayAttendanceEntry | null,
  nowMs: number,
): number {
  if (ctx?.openEntry) return (nowMs - new Date(ctx.openEntry.clock_in_at).getTime()) / 60000;
  if (today?.clock_out_at)
    return (new Date(today.clock_out_at).getTime() - new Date(today.clock_in_at).getTime()) / 60000;
  return 0;
}

/**
 * Computer Hours + Break breakdown for the Performance tab. Computer Hours is
 * today's worked duration (live while clocked in), from existing attendance
 * data. Break is a labelled placeholder until break_records exist (fast-follow).
 */
export default function WorkTimeBreakdown({ teamMemberId, reloadToken }: WorkTimeBreakdownProps) {
  const [ctx, setCtx] = useState<TodayShiftContext | null>(null);
  const [today, setToday] = useState<TodayAttendanceEntry | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTodayShiftContext(teamMemberId), fetchMyTodayAttendance(teamMemberId)]).then(
      ([c, e]) => {
        if (cancelled) return;
        setCtx(c);
        setToday(e);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [teamMemberId, reloadToken]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 20000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const clockedIn = !!ctx?.openEntry;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
      <Stat
        icon="ri-computer-line"
        label="Computer Hours"
        value={fmtHM(workedMinutes(ctx, today, nowMs))}
        tone="emerald"
        sub={clockedIn ? "Running" : "Today"}
      />
      <Stat icon="ri-cup-line" label="Break Time" value="00h 00m" tone="amber" sub="Coming soon" />
      <Stat
        icon="ri-login-circle-line"
        label="Sessions"
        value={today ? "1" : "0"}
        tone="stone"
        sub="Today"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "stone";
}) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    stone: "text-stone-500",
  };
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
        <i className={`${icon} ${tones[tone]}`} />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-stone-900 font-mono">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-stone-400">{sub}</div>
    </div>
  );
}
