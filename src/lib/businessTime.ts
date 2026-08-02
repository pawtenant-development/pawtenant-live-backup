// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §C
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

// ─── ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §7/§8 ──────────────────────────────
//
// The visible business CLOCK and the Today/Yesterday day grouping. Both read the
// same America/New_York wall clock as every period helper above, so the header,
// the order groups and the KPI window can never disagree.
//
// WHY THIS EXISTS: the Orders list grouped rows with
// `d.toDateString() === new Date().toDateString()`, which is the OPERATOR'S
// BROWSER calendar day. For an operator in Karachi at 2026-08-02 04:38 PKT it is
// still 2026-08-01 19:38 in New York, so every order the business considers
// "today" was filed under "Yesterday" — nine hours early, every single day.

/**
 * The timezone's short abbreviation at an instant — "EST" or "EDT".
 * Resolved from the IANA database, never hardcoded, so it flips itself at the
 * DST transitions without a code change.
 */
export function businessZoneAbbrev(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    timeZoneName: "short",
  }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "ET";
}

/**
 * The header clock body, e.g. "Aug 1, 2026 · 7:38 PM EDT".
 * The "New York · " prefix is applied by the component so it can be dropped on
 * narrow screens without duplicating the format here.
 */
export function formatBusinessClock(instant: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
  return `${date} · ${time} ${businessZoneAbbrev(instant)}`;
}

/**
 * Milliseconds from `instant` until the next America/New_York midnight.
 *
 * Used to re-arm the day-rollover timer so "Today" advances on its own at NY
 * midnight — never at the operator's local midnight, and without a page reload.
 * Derived from the real boundary instant (DST-safe), not from a 24h assumption.
 */
export function msUntilNextBusinessMidnight(instant: Date = new Date()): number {
  const p = businessParts(instant);
  // Midnight of the NEXT business day. Date.UTC normalises month/year overflow,
  // and businessWallClockToUtc resolves the true offset at that boundary.
  const nextUtc = new Date(Date.UTC(p.year, p.month0, p.day + 1));
  const next = businessWallClockToUtc(
    nextUtc.getUTCFullYear(),
    nextUtc.getUTCMonth(),
    nextUtc.getUTCDate(),
    0,
    0,
  );
  return Math.max(1000, next.getTime() - instant.getTime());
}

/**
 * The day-group heading for a row timestamp: "Today", "Yesterday", or the
 * business date ("Jul 30, 2026"). Both the row and "now" are read in
 * America/New_York, so grouping never follows the browser's clock.
 */
export function businessDayGroupLabel(
  value: Date | string | number,
  /**
   * TODAY as a business-zone "YYYY-MM-DD". Passed in rather than read from the
   * clock so the caller controls rollover (see useBusinessDayKey) and so this
   * function is a pure, directly-testable mapping.
   */
  todayIso: string = businessIsoDate(new Date()),
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = businessIsoDate(d);
  if (day === todayIso) return "Today";
  // "Yesterday" is the calendar day before today IN THE BUSINESS ZONE — stepped
  // via UTC arithmetic on the date parts (no clock, no offset), so it stays
  // correct across DST transitions, month ends and leap years alike.
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const prevUtc = new Date(Date.UTC(ty, tm - 1, td - 1));
  const prev = `${prevUtc.getUTCFullYear()}-${pad2(prevUtc.getUTCMonth() + 1)}-${pad2(prevUtc.getUTCDate())}`;
  if (day === prev) return "Yesterday";
  // Same shape the ribbons used before this task ("Monday, July 30, 2026") —
  // only the timezone changed, so the visual language of the list is untouched.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
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
