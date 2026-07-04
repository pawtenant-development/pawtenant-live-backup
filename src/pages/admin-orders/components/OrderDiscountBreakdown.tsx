/**
 * OrderDiscountBreakdown — admin-only, read-only display of an order's
 * promo/coupon breakdown (Subtotal → Discount → Paid).
 *
 * 2026-07-04 (fix: show order discounts in admin). Discount data already lives
 * on the orders row: `coupon_code` (text) and `coupon_discount` (integer $).
 * The paid amount is `price` (the amount Stripe actually charged — set by
 * stripe-webhook markOrderProcessing / check-payment-status reconcile).
 *
 * Semantics (webhook contract): `price` = final amount paid. The pre-discount
 * subtotal is therefore derived as `price + coupon_discount`. We NEVER fabricate
 * a code or amount — if a field is missing we degrade gracefully:
 *   - discount amount but no code  → "Discount applied · −$X"
 *   - code but no amount           → shows the code, no amount / no subtotal
 *   - no coupon_code and no        → renders nothing (component returns null)
 *     coupon_discount > 0
 *
 * Pure presentational. No network, no business logic, no payment mutation.
 */

interface Props {
  /** Final amount paid (orders.price), in dollars. */
  price?: number | null;
  /** Promo/coupon code used (orders.coupon_code). */
  couponCode?: string | null;
  /** Discount amount (orders.coupon_discount), in dollars. */
  couponDiscount?: number | null;
  /**
   * "full"   → line-item card for the Payments tab.
   * "inline" → compact block for the Overview Order Details rail.
   */
  variant?: "full" | "inline";
}

/** Whole dollars render without decimals ($129); fractional keep two ($129.50). */
function usd(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

export default function OrderDiscountBreakdown({
  price,
  couponCode,
  couponDiscount,
  variant = "full",
}: Props) {
  const code = (couponCode ?? "").trim() || null;
  const discount =
    typeof couponDiscount === "number" && couponDiscount > 0 ? couponDiscount : null;

  // Nothing reliable to show → render nothing (never show empty fields).
  if (!code && !discount) return null;

  const paid = typeof price === "number" ? price : null;
  // Pre-discount original is only derivable when we have both paid + discount.
  const subtotal = paid != null && discount != null ? paid + discount : null;

  // ── Inline (Overview Order Details rail) ──────────────────────────────────
  if (variant === "inline") {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Discount</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono font-bold">
            <i className="ri-coupon-3-line text-[11px]"></i>
            {code ?? "Applied"}
          </span>
          {discount != null && (
            <span className="text-sm font-bold text-emerald-600">−{usd(discount)}</span>
          )}
        </div>
        {subtotal != null && (
          <p className="text-[11px] text-gray-400 mt-1">
            {usd(subtotal)} subtotal → <span className="font-semibold text-gray-600">{usd(paid!)} paid</span>
          </p>
        )}
      </div>
    );
  }

  // ── Full (Payments tab line-item card) ────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
      <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
        <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg">
          <i className="ri-price-tag-3-line text-emerald-600 text-sm"></i>
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-800">Discount Applied</p>
          <p className="text-xs text-emerald-500">Promo / coupon breakdown for this order</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {subtotal != null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 flex items-center gap-1.5">
              <i className="ri-shopping-bag-3-line text-gray-400"></i>Subtotal
            </span>
            <span className="text-sm font-semibold text-gray-700">{usd(subtotal)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 flex items-center gap-1.5">
            <i className="ri-coupon-3-line text-emerald-500"></i>
            Discount
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-mono font-bold">
              {code ?? "Applied"}
            </span>
          </span>
          <span className="text-sm font-bold text-emerald-600">
            {discount != null ? `−${usd(discount)}` : "—"}
          </span>
        </div>
        {paid != null && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs font-bold text-gray-700">Paid</span>
            <span className="text-base font-extrabold text-gray-900">{usd(paid)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
