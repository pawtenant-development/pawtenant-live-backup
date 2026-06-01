import { useEffect, useRef, useState } from "react";
import {
  fetchMyBreakRecords,
  startMyBreak,
  endMyBreak,
  activeBreak,
  todayBreaks,
  todayBreakSeconds,
  fmtDuration,
  fmtHMS,
  BREAK_TYPES,
  BREAK_TYPE_LABEL,
  BREAK_TYPE_ICON,
  type BreakRecord,
  type BreakType,
} from "../../../lib/employeeBreaks";
import { pktTimeString } from "../../../lib/timezones";
import { fetchTodayShiftContext } from "../../../lib/attendance";

interface BreakHistoryCardProps {
  teamMemberId: string;
  reloadToken?: number;
  onChange?: () => void;
}

/**
 * Today's break breakdown + history with Start/End controls. Mirrors the top-bar
 * BreakControls but in a full card (works on all screen sizes). Live total +
 * active timer; per-record list with type, time range and duration. Writes go
 * through the employeeBreaks RPCs (which also update presence).
 */
export default function BreakHistoryCard({ teamMemberId, reloadToken, onChange }: BreakHistoryCardProps) {
  const [records, setRecords] = useState<BreakRecord[] | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  async function load() {
    const [recs, ctx] = await Promise.all([
      fetchMyBreakRecords(teamMemberId),
      fetchTodayShiftContext(teamMemberId),
    ]);
    setRecords(recs);
    setClockedIn(!!ctx.openEntry);
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyBreakRecords(teamMemberId), fetchTodayShiftContext(teamMemberId)]).then(([recs, ctx]) => {
      if (cancelled) return;
      setRecords(recs);
      setClockedIn(!!ctx.openEntry);
    });
    return () => { cancelled = true; };
  }, [teamMemberId, reloadToken]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);

  const all = records ?? [];
  const active = activeBreak(all);
  const todaysList = todayBreaks(all, new Date(nowMs));
  const totalSec = todayBreakSeconds(all, nowMs);
  const activeElapsed = active ? Math.max(0, Math.floor((nowMs - new Date(active.started_at).getTime()) / 1000)) : 0;

  async function handleStart(type: BreakType) {
    setPicking(false);
    if (busy) return;
    setBusy(true); setError(null);
    const err = await startMyBreak(type);
    setBusy(false);
    if (err) { setError(err); return; }
    await load(); onChange?.();
  }
  async function handleEnd() {
    if (busy) return;
    setBusy(true); setError(null);
    const err = await endMyBreak();
    setBusy(false);
    if (err) { setError(err); return; }
    await load(); onChange?.();
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-500">Breaks</div>
          <h2 className="text-base font-semibold text-stone-900">Today's Breaks</h2>
        </div>
        <div className="text-right">
          <div className={`font-mono text-lg font-bold ${active ? "text-rose-600" : "text-amber-600"}`}>
            {active ? fmtHMS(activeElapsed) : fmtHMS(totalSec)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-stone-400">
            {active ? `On ${BREAK_TYPE_LABEL[active.break_type] ?? active.break_type}` : "Total today"}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-3 relative">
        {active ? (
          <button type="button" onClick={handleEnd} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-white">
            <i className={BREAK_TYPE_ICON[active.break_type] ?? "ri-cup-line"} />
            {busy ? "…" : `End ${BREAK_TYPE_LABEL[active.break_type] ?? "Break"}`}
          </button>
        ) : (
          <button type="button" onClick={() => setPicking((v) => !v)} disabled={!clockedIn || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 text-xs font-semibold text-white"
            title={clockedIn ? "Start a break" : "Clock in to take a break"}>
            <i className="ri-cup-line" /> Start Break
          </button>
        )}
        {!clockedIn && !active ? (
          <p className="mt-1.5 text-[11px] text-stone-400">Clock in to start a break.</p>
        ) : null}

        {picking && !active ? (
          <>
            <button aria-label="Close" onClick={() => setPicking(false)} className="fixed inset-0 z-10 cursor-default" />
            <div className="absolute left-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg py-1">
              <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-stone-400">Break type</div>
              {BREAK_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => handleStart(t)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50">
                  <i className={`${BREAK_TYPE_ICON[t]} text-stone-400`} />
                  {BREAK_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-[11px] text-rose-600">{error}</p> : null}

      {/* History */}
      <div className="mt-4">
        {records === null ? (
          <p className="text-xs text-stone-400">Loading…</p>
        ) : todaysList.length === 0 ? (
          <p className="text-xs text-stone-500">No breaks taken today.</p>
        ) : (
          <ul className="space-y-1.5">
            {todaysList.map((r) => {
              const live = r.status === "active";
              const dur = live ? activeElapsed : (r.duration_seconds ?? 0);
              return (
                <li key={r.id} className="flex items-center gap-2.5 rounded-lg border border-stone-200 px-3 py-2">
                  <i className={`${BREAK_TYPE_ICON[r.break_type] ?? "ri-cup-line"} ${live ? "text-rose-500" : "text-stone-400"} text-base shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-800">
                      {BREAK_TYPE_LABEL[r.break_type] ?? r.break_type}
                      {r.status === "cancelled" ? <span className="text-stone-400 font-normal"> · cancelled</span> : null}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {pktTimeString(r.started_at)}{r.ended_at ? ` – ${pktTimeString(r.ended_at)}` : " – now"}
                    </p>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${live ? "text-rose-600" : "text-stone-600"}`}>
                    {fmtDuration(dur)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-stone-400">Times shown in PKT. Breaks do not change your clock in/out.</p>
      </div>
    </div>
  );
}
