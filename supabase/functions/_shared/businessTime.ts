// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §C
//
// EDGE-RUNTIME COPY of src/lib/businessTime.ts.
//
// The frontend module and this one must stay byte-identical below this header.
// Deno cannot import from src/, and the browser bundle cannot import from
// supabase/functions/, so one canonical clock has to exist in two places.
// scripts/check-business-timezone.mjs imports BOTH and asserts they agree across
// the entire boundary matrix, so a change to one without the other fails the
// build rather than silently giving the report a different calendar from
// Accounts. The file is pure TypeScript with no imports, so a plain copy is
// portable to both runtimes.
//
// THE CANONICAL PAWTENANT BUSINESS CLOCK.
//
// Every business period — "today", "this month", Accounts Monthly Books, the
// month-end report, month-over-month comparisons — is measured in ONE timezone:
// America/New_York. Not the browser's timezone, not the server's, not a fixed
// UTC offset, and not Asia/Karachi.
//
// WHY THIS MODULE EXISTS
// ----------------------
// Accounts previously keyed every range to the OPERATOR'S LOCAL calendar day.
// For an operator in Karachi that makes "Current Month" the Pakistani month,
// which is not the month the business reports on: at 2026-08-01 05:00 in
// Karachi it is still 2026-07-31 20:00 in New York, so "this month" silently
// meant two different things depending on who was looking.
//
// The same class of bug shipped in the month-end report, which gated on the last
// day of the month in Asia/Karachi and therefore generated at 14:59 New York
// time — truncating the final ~9 hours of the business month, permanently.
//
// THE CONTRACT
// ------------
//   • Periods are start-INCLUSIVE and end-EXCLUSIVE:
//       [2026-08-01 00:00 America/New_York, 2026-09-01 00:00 America/New_York)
//     An inclusive end date cannot express "up to midnight" without inventing a
//     23:59:59.999 sentinel, which silently drops the final millisecond and
//     breaks at DST boundaries.
//   • Boundaries are converted to real UTC instants for querying.
//   • DST-safe: offsets are resolved from the IANA database at the instant in
//     question, never hardcoded. America/New_York is UTC-5 in winter and UTC-4
//     in summer, so a fixed offset is wrong for roughly half the year.
//
// Pure functions only — no React, no fetch, no Supabase. Safe to import from a
// guard and exercise directly.

export const BUSINESS_TIMEZONE = "America/New_York" as const;

/** Wall-clock components as read in the business timezone. */
export interface BusinessParts {
  year: number;
  /** 0-based, to match JS Date. */
  month0: number;
  /** 1-based day of month. */
  day: number;
  hour: number;
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function rawParts(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some engines under hour12:false.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Read an instant's wall clock in the business timezone. */
export function businessParts(instant: Date = new Date()): BusinessParts {
  const p = rawParts(instant);
  return { year: p.year, month0: p.month - 1, day: p.day, hour: p.hour, minute: p.minute };
}

/**
 * The timezone's UTC offset (ms) at a given instant. Positive east of UTC.
 * Derived from the IANA database, so DST is handled for free.
 */
function offsetMsAt(instant: Date): number {
  const p = rawParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * Resolve a business wall-clock reading to the real UTC instant.
 *
 * Solved iteratively because the offset depends on the very instant being
 * computed. Two passes converge for every real-world zone: the first guess uses
 * the offset near the target, the second corrects it when the guess landed on
 * the far side of a DST transition.
 *
 * Spring-forward gap (02:30 on a US spring-forward date does not exist): the
 * result normalises forward into the post-transition offset, which is the
 * conventional interpretation and never throws.
 */
export function businessWallClockToUtc(
  year: number,
  month0: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month0, day, hour, minute);
  let instant = new Date(naive - offsetMsAt(new Date(naive)));
  const corrected = naive - offsetMsAt(instant);
  if (corrected !== instant.getTime()) instant = new Date(corrected);
  return instant;
}

/** First instant of a business month, as a UTC instant. INCLUSIVE bound. */
export function businessMonthStart(year: number, month0: number): Date {
  return businessWallClockToUtc(year, month0, 1, 0, 0);
}

/** First instant of the FOLLOWING business month. EXCLUSIVE upper bound. */
export function businessMonthEndExclusive(year: number, month0: number): Date {
  const y = month0 === 11 ? year + 1 : year;
  const m = month0 === 11 ? 0 : month0 + 1;
  return businessMonthStart(y, m);
}

/** A resolved business period. `endExclusive` is NOT part of the period. */
export interface BusinessPeriod {
  /** "YYYY-MM" in the business timezone. */
  key: string;
  /** e.g. "July 2026". */
  label: string;
  /** Inclusive lower bound, as a UTC instant. */
  start: Date;
  /** EXCLUSIVE upper bound, as a UTC instant. */
  endExclusive: Date;
  /** "YYYY-MM-DD" of the first day, in the business timezone. */
  from: string;
  /**
   * "YYYY-MM-DD" of the LAST day in the period, in the business timezone.
   * Provided for the many existing consumers whose APIs take an inclusive end
   * date (Stripe range filters, `p_to` RPC arguments). New code should prefer
   * `endExclusive`.
   */
  toInclusive: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for an instant, as read in the business timezone. */
export function businessIsoDate(instant: Date): string {
  const p = businessParts(instant);
  return `${p.year}-${pad2(p.month0 + 1)}-${pad2(p.day)}`;
}

/** "YYYY-MM" bucket key for an instant, as read in the business timezone. */
export function businessMonthKey(instant: Date): string {
  const p = businessParts(instant);
  return `${p.year}-${pad2(p.month0 + 1)}`;
}

/** "YYYY-MM" bucket key from Unix seconds (e.g. a Stripe `created`). */
export function businessMonthKeyOfUnix(unixSeconds: number): string {
  return businessMonthKey(new Date(unixSeconds * 1000));
}

/** Build the business period for a given year/month. */
export function businessMonth(year: number, month0: number): BusinessPeriod {
  const start = businessMonthStart(year, month0);
  const endExclusive = businessMonthEndExclusive(year, month0);
  // One day before the exclusive end, read in the business timezone. Derived by
  // subtracting a day from the boundary rather than by assuming a month length,
  // so it is correct across DST and leap years alike.
  const lastDay = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  return {
    key: `${year}-${pad2(month0 + 1)}`,
    label: `${MONTH_NAMES[month0]} ${year}`,
    start,
    endExclusive,
    from: businessIsoDate(start),
    toInclusive: businessIsoDate(lastDay),
  };
}

/** The business month containing `instant` (defaults to now). */
export function currentBusinessMonth(instant: Date = new Date()): BusinessPeriod {
  const p = businessParts(instant);
  return businessMonth(p.year, p.month0);
}

/**
 * The business month BEFORE the one containing `instant`.
 *
 * This is what a month-end report covers: the month that has actually finished.
 * Reporting on the CURRENT month while it is still running is what truncated
 * the July report.
 */
export function previousBusinessMonth(instant: Date = new Date()): BusinessPeriod {
  const p = businessParts(instant);
  const y = p.month0 === 0 ? p.year - 1 : p.year;
  const m = p.month0 === 0 ? 11 : p.month0 - 1;
  return businessMonth(y, m);
}

/**
 * True when `instant` falls on or after the first moment of the business month
 * following `period` — i.e. the period is genuinely over in business time.
 *
 * A report must not be generated until this is true, or it silently omits the
 * tail of its own reporting window.
 */
export function isBusinessPeriodComplete(period: BusinessPeriod, instant: Date = new Date()): boolean {
  return instant.getTime() >= period.endExclusive.getTime();
}

/** The last `count` business months, most recent first. */
export function recentBusinessMonths(count: number, instant: Date = new Date()): BusinessPeriod[] {
  const p = businessParts(instant);
  const out: BusinessPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const total = p.year * 12 + p.month0 - i;
    out.push(businessMonth(Math.floor(total / 12), ((total % 12) + 12) % 12));
  }
  return out;
}
