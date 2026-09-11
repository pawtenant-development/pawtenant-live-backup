// STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — orders-side
// "successful PawTenant Stripe payments by business day".
//
// The five numbers the owner asked never to be presented as interchangeable:
//   1. orders CREATED today            → orders.created_at (operational lists)
//   2. successful PAYMENTS today       → orders.paid_at, only with a PaymentIntent
//   3. gross paid revenue today        → sum of (2)
//   4. operational queues by creation  → (1), labelled as such
//   5. partner-funded / manual orders  → NOT a PawTenant Stripe payment; excluded
//
// This module implements (2) and (3). Contract:
//   • the payment instant is `paid_at` — the FIRST successful payment, stamped by
//     the Stripe webhook. `created_at`, `last_meaningful_activity_at`, assignment
//     and contact times are never a payment time.
//   • a payment without a PaymentIntent is not a Stripe payment (partner-funded,
//     manual, $0 included paths). `order_origin === "partner"` is excluded
//     outright; a `paid_at` with no `payment_intent_id` fails closed.
//   • test rows (`is_test`) never count.
//   • duplicate orders sharing one PaymentIntent count that payment ONCE.
//   • the day is the America/New_York business date of `paid_at`; the browser's
//     day and the UTC day are both wrong for the operator in Karachi and for the
//     20:00–00:00 ET window respectively.
//
// Pure — no React, no fetch. Imported by the Admin Dashboard and executed by
// scripts/check-stripe-daily-payment-timezone.mjs with fixtures.

import { businessIsoDate, businessDateRange, shiftBusinessIsoDate } from "./businessTime";

export interface PaidOrderLike {
  id?: string;
  created_at?: string | null;
  paid_at?: string | null;
  payment_intent_id?: string | null;
  price?: number | null;
  status?: string | null;
  is_test?: boolean | null;
  order_origin?: string | null;
}

export interface PaidDayBucket {
  date: string;
  revenue: number;
  payments: number;
}

export interface PaidDayResult {
  daily: PaidDayBucket[];
  gross: number;
  payments: number;
  excluded: { id: string; reason: "no_paid_at" | "no_payment_intent" | "partner_funded" | "test_row" | "cancelled" | "duplicate_payment_intent" | "outside_window" }[];
}

/**
 * Is this order a successful PawTenant STRIPE payment? Fail-closed: every
 * signal must be present — a `paid_at` instant AND a PaymentIntent — and none
 * of the exclusions (partner origin, test row, cancelled).
 */
export function isStripePaidOrder(o: PaidOrderLike): boolean {
  return !!o.paid_at && !!o.payment_intent_id && !o.is_test && (o.order_origin ?? "direct") !== "partner" && o.status !== "cancelled" && o.status !== "canceled";
}

/**
 * Bucket successful Stripe payments by America/New_York business day of
 * `paid_at`. Every date in `dates` is present (zero-filled), in order.
 */
export function paidOrdersByBusinessDay(orders: readonly PaidOrderLike[], dates: readonly string[]): PaidDayResult {
  const map = new Map<string, PaidDayBucket>();
  for (const date of dates) map.set(date, { date, revenue: 0, payments: 0 });
  const seenPi = new Set<string>();
  const excluded: PaidDayResult["excluded"] = [];
  let gross = 0;
  let payments = 0;
  for (const o of orders) {
    const id = o.id ?? "";
    if (o.is_test) { excluded.push({ id, reason: "test_row" }); continue; }
    if ((o.order_origin ?? "direct") === "partner") { excluded.push({ id, reason: "partner_funded" }); continue; }
    if (!o.paid_at) { excluded.push({ id, reason: "no_paid_at" }); continue; }
    if (!o.payment_intent_id) { excluded.push({ id, reason: "no_payment_intent" }); continue; }
    if (o.status === "cancelled" || o.status === "canceled") { excluded.push({ id, reason: "cancelled" }); continue; }
    if (seenPi.has(o.payment_intent_id)) { excluded.push({ id, reason: "duplicate_payment_intent" }); continue; }
    seenPi.add(o.payment_intent_id);
    const paidAt = new Date(o.paid_at);
    if (Number.isNaN(paidAt.getTime())) { excluded.push({ id, reason: "no_paid_at" }); continue; }
    const bucket = map.get(businessIsoDate(paidAt));
    if (!bucket) { excluded.push({ id, reason: "outside_window" }); continue; }
    bucket.revenue += o.price ?? 0;
    bucket.payments += 1;
    gross += o.price ?? 0;
    payments += 1;
  }
  return { daily: dates.map((d) => map.get(d)!), gross, payments, excluded };
}

/** The last `count` business dates ending today (inclusive), ascending. */
export function recentBusinessDates(count: number, now: Date = new Date()): string[] {
  const today = businessIsoDate(now);
  return businessDateRange(shiftBusinessIsoDate(today, -(count - 1)), today);
}

/** Orders CREATED per business day — the operational count, never a payment count. */
export function ordersCreatedByBusinessDay(orders: readonly PaidOrderLike[], dates: readonly string[]): PaidDayBucket[] {
  const map = new Map<string, PaidDayBucket>();
  for (const date of dates) map.set(date, { date, revenue: 0, payments: 0 });
  for (const o of orders) {
    if (!o.created_at) continue;
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const b = map.get(businessIsoDate(d));
    if (b) b.payments += 1;
  }
  return dates.map((d) => map.get(d)!);
}
