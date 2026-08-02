// ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001 §7
//
// THE VISIBLE ADMIN BUSINESS CLOCK.
//
// PawTenant reports, bills and schedules in America/New_York. Every operator
// works from Karachi, where the calendar date is ~9 hours ahead — so for a third
// of every day the browser's date and the business date DISAGREE. Without a
// visible New York clock an operator has no way to tell which day a KPI, a
// "Today" group or a month boundary actually refers to.
//
// Renders e.g.  New York · Aug 1, 2026 · 7:38 PM EDT
//
// Contract:
//   • America/New_York via src/lib/businessTime.ts — the same module the KPI
//     window and the Today/Yesterday grouping use. No second implementation.
//   • EST/EDT resolved from the IANA database at the current instant.
//   • Updates at least once per minute (30s tick).
//   • Pure display: no database request, no network, no side effects.
//   • Lazily-initialised state, so first render === first commit (no hydration
//     mismatch and no stale module-load clock).
import { formatBusinessClock } from "../../lib/businessTime";
import { useBusinessNow } from "../../hooks/useBusinessClock";

export default function BusinessClock({ className = "" }: { className?: string }) {
  const now = useBusinessNow();
  const clock = formatBusinessClock(now);

  return (
    <div
      // role=timer + aria-live=off: assistive tech can read it on demand, but a
      // clock that announced itself every 30 seconds would be unusable.
      role="timer"
      aria-live="off"
      aria-label={`Business time, New York: ${clock}`}
      title={`PawTenant business clock — America/New_York. All KPI periods, month boundaries and Today/Yesterday grouping use this clock, not your device's.`}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 ${className}`}
    >
      <i className="ri-time-line text-[#3b6ea5] text-xs" aria-hidden="true"></i>
      {/* "New York" is dropped below sm so the navbar never wraps on a phone;
          the date + time + EDT/EST always survive. */}
      <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-gray-400">
        New York
      </span>
      <span className="hidden sm:inline text-[10px] text-gray-300" aria-hidden="true">·</span>
      <span className="text-[11px] font-semibold text-gray-600 tabular-nums">{clock}</span>
    </div>
  );
}
