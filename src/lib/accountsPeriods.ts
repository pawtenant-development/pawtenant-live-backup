// Accounts "monthly books" date helpers. Pure functions (no React, no fetch).
//
// TIMEZONE — MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §C
// --------------------------------------------------------------------
// These ranges are now resolved in the CANONICAL BUSINESS TIMEZONE
// (America/New_York) via src/lib/businessTime.ts — never the operator's browser
// calendar.
//
// They previously used the browser's LOCAL date. For an operator in Karachi that
// made "Current Month" the Pakistani month: at 2026-08-01 05:00 in Karachi it is
// still 2026-07-31 20:00 in New York, so Accounts would roll over to August
// while the business was still closing July, and two operators in different
// countries saw different books for the same click.
//
// The from/to STRING contract is unchanged (inclusive "YYYY-MM-DD" on both
// ends), so every existing consumer — Stripe range filters, `p_from`/`p_to` RPC
// arguments — keeps working. Only the calendar they are computed against moved.
// New code that needs a real instant should use businessTime's `start` /
// `endExclusive` rather than re-deriving one from these strings.

export type AccountsPreset =
  | "current_month"
  | "last_month"
  | "last_30d"
  | "ytd"
  | "all_time"
  | "custom";

export interface ResolvedAccountsRange {
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
  label: string;
  preset: AccountsPreset;
}

import {
  businessParts, businessMonth, businessIsoDate, businessMonthKey,
  businessWallClockToUtc, recentBusinessMonths,
} from "./businessTime";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// All-time floor — earliest date we consider "all data". Safe lower bound.
export const ALL_TIME_FROM = "2020-01-01";

// Format an instant to YYYY-MM-DD as read in the BUSINESS timezone.
// (Historically this read the browser's local components — see the header.)
export function localIso(d: Date): string {
  return businessIsoDate(d);
}

export function monthLabel(year: number, monthIdx: number): string {
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

// "YYYY-MM" bucket key for an instant, in the BUSINESS timezone.
export function monthKeyOfDate(d: Date): string {
  return businessMonthKey(d);
}
// "YYYY-MM" bucket key from a Unix-seconds timestamp (Stripe `created`).
// A charge at 2026-07-31 21:30 New York is a JULY charge even though it is
// already 2026-08-01 in UTC and in Karachi.
export function monthKeyOfUnix(unixSeconds: number): string {
  return businessMonthKey(new Date(unixSeconds * 1000));
}

// Resolve a preset into a concrete date range + display label.
export function presetRange(preset: AccountsPreset, now: Date = new Date()): ResolvedAccountsRange {
  // Every component below is read in the BUSINESS timezone, so "today" and
  // "this month" mean the same thing for every operator, wherever they sit.
  const p = businessParts(now);
  const y = p.year;
  const m = p.month0;
  const today = businessIsoDate(now);
  const thisMonth = businessMonth(y, m);

  switch (preset) {
    case "current_month":
      return {
        from: thisMonth.from,
        to: thisMonth.toInclusive,
        label: `${thisMonth.label} Books`,
        preset,
      };
    case "last_month": {
      const lm = businessMonth(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
      return { from: lm.from, to: lm.toInclusive, label: `${lm.label} Books`, preset };
    }
    case "last_30d": {
      // Step back 29 business days from today's business date, via the business
      // wall clock — not by subtracting 29 * 86_400_000 from an instant, which
      // slips by an hour across a DST boundary and can land on the wrong date.
      const fromD = businessWallClockToUtc(y, m, p.day - 29, 12, 0);
      return { from: businessIsoDate(fromD), to: today, label: "Last 30 Days", preset };
    }
    case "ytd":
      return { from: businessMonth(y, 0).from, to: today, label: `Year to Date ${y}`, preset };
    case "all_time":
      return { from: ALL_TIME_FROM, to: today, label: "All Time", preset };
    case "custom":
    default:
      return { from: thisMonth.from, to: thisMonth.toInclusive, label: "Custom Range", preset };
  }
}

// Preset buttons shown in the Accounts range bar (custom handled separately).
export const ACCOUNTS_PRESET_BUTTONS: { key: AccountsPreset; label: string }[] = [
  { key: "current_month", label: "Current Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_30d", label: "Last 30 Days" },
  { key: "ytd", label: "Year to Date" },
  { key: "all_time", label: "All Time" },
];

export interface MonthlyPeriod {
  key: string;     // YYYY-MM
  label: string;   // "June 2026"
  from: string;
  to: string;
  isCurrent: boolean;
  status: "open" | "review"; // current = open, past = review (closed = future feature)
}

// The last `count` BUSINESS calendar months, most recent first (current month
// included as row 0). "Current" is the month in America/New_York, so an operator
// in Karachi does not see the books roll over hours before the business does.
export function monthlyPeriods(count: number, now: Date = new Date()): MonthlyPeriod[] {
  const curKey = businessMonthKey(now);
  return recentBusinessMonths(count, now).map((p) => ({
    key: p.key,
    label: p.label,
    from: p.from,
    to: p.toInclusive,
    isCurrent: p.key === curKey,
    status: p.key === curKey ? ("open" as const) : ("review" as const),
  }));
}
