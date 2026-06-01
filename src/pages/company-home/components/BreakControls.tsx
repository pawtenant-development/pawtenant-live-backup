import { useEffect, useRef, useState } from "react";
import {
  fetchMyBreakRecords,
  startMyBreak,
  endMyBreak,
  activeBreak,
  todayBreakSeconds,
  fmtHMS,
  BREAK_TYPES,
  BREAK_TYPE_LABEL,
  BREAK_TYPE_ICON,
  type BreakRecord,
  type BreakType,
} from "../../../lib/employeeBreaks";

interface BreakControlsProps {
  teamMemberId: string;
  clockedIn: boolean;
  /** Called after a break starts/ends so the parent can refresh presence/siblings. */
  onChange?: () => void;
}

/**
 * Compact top-bar break surface: live "Break HH:MM" today-total chip + an active
 * break timer, with Start (type picker) / End controls. Writes go through the
 * employeeBreaks RPCs, which also update presence. Gated on being clocked in.
 */
export default function BreakControls({ teamMemberId, clockedIn, onChange }: BreakControlsProps) {
  const [records, setRecords] = useState<BreakRecord[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  async function load() {
    setRecords(await fetchMyBreakRecords(teamMemberId));
  }

  useEffect(() => {
    let cancelled = false;
    fetchMyBreakRecords(teamMemberId).then((r) => { if (!cancelled) setRecords(r); });
    return () => { cancelled = true; };
    // Refetch when clock state flips (e.g. clock-out auto-completes the break).
  }, [teamMemberId, clockedIn]);

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);

  const active = activeBreak(records);
  const todaySec = todayBreakSeconds(records, nowMs);
  const activeElapsed = active ? Math.max(0, Math.floor((nowMs - new Date(active.started_at).getTime()) / 1000)) : 0;

  async function handleStart(type: BreakType) {
    setMenuOpen(false);
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await startMyBreak(type);
    setBusy(false);
    if (err) { setError(err); return; }
    await load();
    onChange?.();
  }

  async function handleEnd() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await endMyBreak();
    setBusy(false);
    if (err) { setError(err); return; }
    await load();
    onChange?.();
  }

  return (
    <div className="relative flex items-center gap-2">
      {/* Today total / live break timer chip */}
      <span className="inline-flex items-center gap-1.5" title="Total break time today">
        <span className="text-stone-500">Break</span>
        <span className={`rounded px-1.5 h-5 inline-flex items-center font-mono font-semibold text-white leading-none ${active ? "bg-rose-500" : "bg-amber-500"}`}>
          {active ? fmtHMS(activeElapsed) : fmtHMS(todaySec)}
        </span>
      </span>

      {active ? (
        <button
          type="button"
          onClick={handleEnd}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-2 h-6 text-[11px] font-semibold text-white"
          title={`On ${BREAK_TYPE_LABEL[active.break_type] ?? active.break_type} · tap to end`}
        >
          <i className={BREAK_TYPE_ICON[active.break_type] ?? "ri-cup-line"} />
          End {BREAK_TYPE_LABEL[active.break_type] ?? "Break"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={!clockedIn || busy}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed px-2 h-6 text-[11px] font-semibold text-stone-600"
          title={clockedIn ? "Start a break" : "Clock in to take a break"}
        >
          <i className="ri-cup-line" /> Break
        </button>
      )}

      {menuOpen && !active ? (
        <>
          <button aria-label="Close" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 top-7 z-20 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg py-1">
            <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-stone-400">Start break</div>
            {BREAK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleStart(t)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50"
              >
                <i className={`${BREAK_TYPE_ICON[t]} text-stone-400`} />
                {BREAK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {error ? <span className="text-[10px] text-rose-600 max-w-[140px] truncate" title={error}>{error}</span> : null}
    </div>
  );
}
