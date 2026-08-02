// ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001 §7/§8
//
// React bindings for the canonical America/New_York business clock.
//
// Two separate concerns, deliberately two hooks:
//   • useBusinessNow()    — a ticking instant, for the visible header clock.
//   • useBusinessDayKey() — the CURRENT business date, which changes exactly
//                           once per New York midnight. Order grouping keys on
//                           this so "Today" rolls over on its own, without a
//                           reload, and WITHOUT re-rendering the whole list
//                           every minute the way useBusinessNow() would.
//
// Both read src/lib/businessTime.ts — no second timezone implementation.
import { useEffect, useState } from "react";
import {
  businessIsoDate,
  msUntilNextBusinessMidnight,
} from "../lib/businessTime";

/**
 * The current instant, refreshed every `intervalMs` (default 30s so a minute
 * boundary is never more than 30s stale).
 *
 * Lazily initialised from `new Date()` inside useState so the first render and
 * the first commit read the same value — no hydration mismatch, and no
 * module-load-time clock that would freeze on a long-lived tab.
 */
export function useBusinessNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    // Re-sync when the tab regains focus: background tabs are throttled hard by
    // every browser, so a laptop reopened the next morning would otherwise show
    // a stale clock until the next tick fired.
    const onVisible = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [intervalMs]);
  return now;
}

/**
 * The current America/New_York calendar date as "YYYY-MM-DD".
 *
 * Re-arms a single timer for the exact next New York midnight, so the value is
 * referentially stable all day and flips precisely at the business day
 * boundary. A consumer that groups rows by business day can depend on this
 * without re-rendering on every clock tick.
 */
export function useBusinessDayKey(): string {
  const [day, setDay] = useState<string>(() => businessIsoDate(new Date()));
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => {
        setDay(businessIsoDate(new Date()));
        arm(); // re-arm for the following midnight
      }, msUntilNextBusinessMidnight(new Date()));
    };
    arm();
    // A throttled background tab can miss the timeout entirely; re-checking on
    // focus guarantees the rollover is picked up as soon as the operator looks.
    const onVisible = () => {
      if (document.hidden) return;
      setDay((prev) => {
        const current = businessIsoDate(new Date());
        if (current !== prev) {
          window.clearTimeout(timer);
          arm();
        }
        return current;
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return day;
}
