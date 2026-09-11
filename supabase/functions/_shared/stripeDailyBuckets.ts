// STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — pure Stripe
// daily-payment bucketing for the stripe-payment-history report.
//
// WHY THIS FILE EXISTS
// --------------------
// The report used to (a) parse `from`/`to` as UTC midnight and 23:59:59Z and
// (b) key its daily revenue buckets on `toISOString().slice(0, 10)` — the UTC
// calendar day. PawTenant's business day is America/New_York, so every charge
// between 20:00 and 00:00 ET (00:00–04:00Z in summer, 19:00–00:00 ET in winter)
// was filed under the NEXT day, and a month/day range was up to five hours off
// at each end. In Sep 1–11 2026 alone, 8 of 53 succeeded LIVE charges ($849 of
// $6,115) sat on a different day under UTC than under New York.
//
// This module holds the pure logic so a guard can EXECUTE it with fixtures.
// No Stripe client, no fetch, no Deno globals — importable from Node via jiti.
//
// CONTRACT
//   • from/to are America/New_York business dates ("YYYY-MM-DD"), start-INCLUSIVE
//     and end-EXCLUSIVE once resolved to instants (`lt`, never `lte`).
//   • A charge's day is the business date of Stripe's own `created` — the
//     authoritative payment instant. Never orders.created_at, never webhook
//     receipt time.
//   • Only `status === "succeeded"` charges count, each charge id once, and one
//     succeeded charge per PaymentIntent (a retried PI can carry several failed
//     charges beside its one success; a duplicate success is refused, not summed).
//   • Refunds are NOT subtracted here (cash-basis gross; the report nets refunds
//     by refund date separately). Failed / pending / uncaptured never count.

import {
  BUSINESS_TIMEZONE,
  businessIsoDate,
  businessIsoDateOfUnix,
  businessDayStart,
  businessDayEndExclusive,
  shiftBusinessIsoDate,
  businessDateRange,
  isBusinessIsoDate,
} from "./businessTime.ts";

export interface StripeReportWindow {
  /** IANA zone every date below is expressed in. Always America/New_York. */
  timezone: typeof BUSINESS_TIMEZONE;
  /** First business date of the window, inclusive. */
  fromIso: string;
  /** Last business date of the window, inclusive (display / bucket labels). */
  toIso: string;
  /** Unix seconds — Stripe `created[gte]`. */
  sinceSec: number;
  /**
   * Unix seconds — Stripe `created[lt]`, EXCLUSIVE. Null for a rolling preset
   * (7d/30d/90d) so charges landing while the report runs are not cut off.
   */
  untilExclusiveSec: number | null;
  /** Every business date in the window, ascending. `days === dates.length`. */
  dates: string[];
  days: number;
  /** True when the caller supplied an explicit from/to. */
  explicit: boolean;
}

/**
 * Resolve the report window. An explicit `from` (and optional `to`) wins; a
 * malformed value falls back to the rolling preset rather than to UTC.
 */
export function resolveStripeReportWindow(
  opts: { from?: string | null; to?: string | null; period?: string | null; now?: Date },
): StripeReportWindow {
  const now = opts.now ?? new Date();
  const todayIso = businessIsoDate(now);
  if (isBusinessIsoDate(opts.from)) {
    const fromIso = opts.from;
    const toIso = isBusinessIsoDate(opts.to) && opts.to >= fromIso ? opts.to : (todayIso >= fromIso ? todayIso : fromIso);
    const dates = businessDateRange(fromIso, toIso);
    return {
      timezone: BUSINESS_TIMEZONE,
      fromIso,
      toIso,
      sinceSec: Math.floor(businessDayStart(fromIso).getTime() / 1000),
      untilExclusiveSec: Math.floor(businessDayEndExclusive(toIso).getTime() / 1000),
      dates,
      days: dates.length,
      explicit: true,
    };
  }
  const days = opts.period === "7d" ? 7 : opts.period === "90d" ? 90 : 30;
  // Rolling preset = today plus the (days - 1) preceding FULL business days.
  const fromIso = shiftBusinessIsoDate(todayIso, -(days - 1));
  const dates = businessDateRange(fromIso, todayIso);
  return {
    timezone: BUSINESS_TIMEZONE,
    fromIso,
    toIso: todayIso,
    sinceSec: Math.floor(businessDayStart(fromIso).getTime() / 1000),
    untilExclusiveSec: null,
    dates,
    days: dates.length,
    explicit: false,
  };
}

/** The subset of a Stripe Charge this module reads. */
export interface ChargeLike {
  id: string;
  status: string;
  /** Major units (dollars), as the report already normalises. */
  amount: number;
  /** Stripe Unix seconds — the authoritative payment instant. */
  created: number;
  payment_intent?: string | null;
}

export interface DailyBucketResult {
  daily: { date: string; revenue: number; count: number }[];
  gross: number;
  count: number;
  /** Charges skipped because they were not succeeded, or were duplicates. */
  skipped: { id: string; reason: "not_succeeded" | "duplicate_charge" | "duplicate_payment_intent" | "outside_window" }[];
  /** Charge ids that counted, in input order. Handy for reconciliation output. */
  counted: string[];
}

/**
 * Bucket succeeded charges by America/New_York business day of Stripe `created`.
 * Every date in `dates` is present in the output (zero-filled), in order.
 */
export function bucketSucceededChargesByBusinessDay(charges: readonly ChargeLike[], dates: readonly string[]): DailyBucketResult {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const d of dates) map.set(d, { revenue: 0, count: 0 });
  const seenCharge = new Set<string>();
  const seenPi = new Set<string>();
  const skipped: DailyBucketResult["skipped"] = [];
  const counted: string[] = [];
  let gross = 0;
  for (const c of charges) {
    if (c.status !== "succeeded") { skipped.push({ id: c.id, reason: "not_succeeded" }); continue; }
    if (seenCharge.has(c.id)) { skipped.push({ id: c.id, reason: "duplicate_charge" }); continue; }
    seenCharge.add(c.id);
    if (c.payment_intent) {
      if (seenPi.has(c.payment_intent)) { skipped.push({ id: c.id, reason: "duplicate_payment_intent" }); continue; }
      seenPi.add(c.payment_intent);
    }
    const key = businessIsoDateOfUnix(c.created);
    const bucket = map.get(key);
    if (!bucket) { skipped.push({ id: c.id, reason: "outside_window" }); continue; }
    bucket.revenue += c.amount;
    bucket.count += 1;
    gross += c.amount;
    counted.push(c.id);
  }
  return {
    daily: dates.map((date) => ({ date, revenue: map.get(date)!.revenue, count: map.get(date)!.count })),
    gross,
    count: counted.length,
    skipped,
    counted,
  };
}
