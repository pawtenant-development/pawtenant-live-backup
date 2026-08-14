// OrderPaymentAmountBreakdown — RA-PAYMENT-TOTAL-001
//
// What the customer ACTUALLY paid for this order: the base order payment plus
// any SEPARATELY purchased, non-refunded Additional Documentation.
//
// READ-ONLY. Nothing here writes, and no amount is ever derived from current
// product pricing — every figure comes from the authoritative stored record:
// `orders.price` for the base and `amount_cents` on the paid request rows.
// Recomputing from today's price list would silently restate historical orders
// whenever pricing changed.
//
// TWO WAYS TO DOUBLE-COUNT, BOTH GUARDED
// --------------------------------------
//  1. BUNDLED RA. On an ESA+RA / PSD+RA bundle the RA is already inside the
//     single checkout total, so it is already inside `orders.price`. Any request
//     row sharing the ORDER'S OWN payment_intent describes that same charge, not
//     a second one, and is excluded.
//  2. DUPLICATE RECORDS. Retries and reconciliation can leave several rows
//     pointing at ONE Stripe PaymentIntent. Rows are deduplicated by
//     payment_intent before summing, so one charge counts once.
//
// Cancelled and refunded requests are excluded outright — the customer does not
// hold that charge.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface AddonRow {
  id: string;
  amount_cents: number | null;
  refund_amount_cents: number | null;
  status: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  stripe_payment_intent_id: string | null;
}

/**
 * What the customer STILL holds on this request, in cents.
 *
 * REFUND-CONSUMER rule: `refunded_at` is stamped for PARTIAL refunds too, so a
 * bare `!refunded_at` boolean would drop a $40 add-on entirely because $5 was
 * returned — understating what the customer actually paid. Subtract the refunded
 * amount instead; a fully refunded row nets to 0 and disappears on its own.
 */
function netPaidCents(r: AddonRow): number {
  const paid = typeof r.amount_cents === "number" ? r.amount_cents : 0;
  const refunded = typeof r.refund_amount_cents === "number" ? r.refund_amount_cents : 0;
  return Math.max(0, paid - refunded);
}

interface Props {
  orderId: string;
  basePrice: number | null;
  /** The order's own PaymentIntent — anything sharing it is the SAME charge. */
  orderPaymentIntentId: string | null;
}

/** Whole dollars when exact, cents only when the amount genuinely has them. */
function money(dollars: number): string {
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export default function OrderPaymentAmountBreakdown({ orderId, basePrice, orderPaymentIntentId }: Props) {
  const [rows, setRows] = useState<AddonRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("order_additional_documentation_requests")
      .select("id, amount_cents, refund_amount_cents, status, paid_at, cancelled_at, stripe_payment_intent_id")
      .eq("order_id", orderId);
    setRows((data as AddonRow[]) ?? []);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const base = typeof basePrice === "number" ? basePrice : null;

  // Until the add-on rows are known, show the base alone rather than a total
  // that might be about to change.
  const paidAddons = (rows ?? []).filter((r) =>
    r.status === "paid" && !!r.paid_at && !r.cancelled_at && netPaidCents(r) > 0
  );

  // Guard 1 — drop anything charged on the order's own PaymentIntent.
  const separatelyPaid = paidAddons.filter((r) =>
    !orderPaymentIntentId || r.stripe_payment_intent_id !== orderPaymentIntentId
  );

  // Guard 2 — one PaymentIntent, one charge. Rows without a PI fall back to
  // their own id so a genuinely distinct manual record is not collapsed away.
  const seen = new Set<string>();
  const deduped = separatelyPaid.filter((r) => {
    const key = r.stripe_payment_intent_id ?? `row:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const addonTotal = deduped.reduce((s, r) => s + netPaidCents(r), 0) / 100;
  const hasAddons = deduped.length > 0 && addonTotal > 0;
  const total = (base ?? 0) + addonTotal;

  if (base == null && !hasAddons) {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Payment Amount</p>
        <p className="text-sm font-semibold text-gray-400">—</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">Payment Amount</p>
      <p className="text-sm font-semibold text-gray-800">{money(hasAddons ? total : base ?? 0)}</p>
      {hasAddons && (
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>Base order</span><span>{money(base ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>Additional Documentation{deduped.length > 1 ? ` ×${deduped.length}` : ""}</span>
            <span>+{money(addonTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 pt-0.5 border-t border-gray-100">
            <span>Total paid</span><span>{money(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
