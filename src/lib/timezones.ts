/**
 * Company OS — Timezone helpers (COS-046 Phase 2a).
 *
 * Single source of truth for converting `timestamptz` values into the
 * canonical PawTenant business timezone (Asia/Karachi / PKT).
 *
 * Storage stays in UTC (`timestamptz` columns). Display + business logic
 * (shift wall-clock, work_date, late math) is in PKT. Never derive
 * "today" from `new Date().getDate()` — that uses the visitor's local TZ
 * and will be wrong outside Pakistan. Always go through these helpers.
 *
 * Phase 2a ships these helpers without wiring them into any UI yet.
 * Future Phase 2b/2c will read them from the Time-In card and the admin
 * Attendance tab.
 */

const PKT_TZ = "Asia/Karachi";

/** Accept Date or ISO string; reject everything else with `null` fallback. */
function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Returns the PKT calendar date for the given timestamp as 'YYYY-MM-DD'.
 * Use this anywhere a `work_date` decision is made (server side does the
 * same via `(ts AT TIME ZONE 'Asia/Karachi')::date`).
 */
export function pktDateString(value: Date | string | number): string {
  const d = toDate(value);
  if (!d) return "";
  // en-CA gives ISO-style YYYY-MM-DD output across browsers.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Returns the PKT clock time for the given timestamp as 'HH:mm' (24h).
 * Useful for "Timed in at HH:mm PKT" labels.
 */
export function pktTimeString(value: Date | string | number): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PKT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Returns the PKT clock time for the given timestamp in the canonical
 * user-facing 12-hour format, e.g. '10:03 PM'. Pass `withSuffix` to get
 * '10:03 PM PKT' where the surrounding UI doesn't already say PKT.
 */
export function pktTime12String(
  value: Date | string | number,
  withSuffix = false,
): string {
  const d = toDate(value);
  if (!d) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: PKT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return withSuffix ? `${formatted} PKT` : formatted;
}

/**
 * Formats a wall-clock time-of-day string ('HH:MM' or 'HH:MM:SS', e.g. a
 * shift_templates start/end time) as 12-hour AM/PM, e.g. '19:00' → '7:00 PM'.
 * Pure string math — the value is already a PKT wall-clock time.
 */
export function formatTimeOfDay12(value: string | null | undefined): string {
  if (!value) return "—";
  const [hh, mm] = value.split(":");
  const h = Number(hh);
  const m = Number(mm ?? "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Formats a shift wall-clock range as '7:00 PM–4:00 AM PKT'.
 * Pass `withSuffix=false` where the surrounding UI already says PKT.
 */
export function formatShiftRange12(
  start: string | null | undefined,
  end: string | null | undefined,
  withSuffix = true,
): string {
  if (!start || !end) return "—";
  const range = `${formatTimeOfDay12(start)}–${formatTimeOfDay12(end)}`;
  return withSuffix ? `${range} PKT` : range;
}

/**
 * Returns a short, human-readable PKT date+time string, e.g.
 * 'Apr 27, 8:00 PM PKT'. Used in admin tables / activity logs.
 */
export function pktDateTimeShort(value: Date | string | number): string {
  const d = toDate(value);
  if (!d) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: PKT_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatted} PKT`;
}

/**
 * Returns the current instant. Returns a real Date so callers can format
 * with the helpers above; PKT-locality is purely display.
 */
export function nowInPkt(): Date {
  return new Date();
}

/** Exposed for tests / future helpers that need the canonical TZ id. */
export const PAWTENANT_BUSINESS_TZ = PKT_TZ;
