// CHECKOUT-PRICING-PHASED-SUBSCRIPTION-003 · Phase 4 (Option B)
// Attach a two-phase Stripe Subscription Schedule to a NEW standard subscription
// AFTER its first invoice is paid, WITHOUT disturbing the existing
// default_incomplete + PaymentElement first-payment flow.
//
//   Phase 1 (first year): the first-year Price the sub was minted at, 1 period.
//   Phase 2 (renewal):    the approved renewal Price, 1 period, then RELEASE —
//                         the released subscription keeps billing the renewal
//                         price every year after.
//
// Only applies to our provisioned standard first-year Prices. Combo (flat $159,
// inline price_data) and legacy pre-phased subscriptions are skipped. Fully
// idempotent + webhook-replay-safe: skips if the subscription is already
// scheduled OR the order already records a schedule id.
//
// stripe / supabase are passed in (typed loosely) so this stays a pure module
// the parity script can also read without pulling in the SDK.

import {
  renewalPriceIdForFirstYear,
  isProvisionedFirstYearPrice,
} from "./pricingMatrix.ts";

export interface AttachResult {
  attached: boolean;
  skipped?: string;
  scheduleId?: string;
  firstYearPriceId?: string;
  renewalPriceId?: string;
  firstYearCents?: number | null;
  renewalCents?: number | null;
  firstRenewalAt?: string | null;
}

// deno-lint-ignore no-explicit-any
type AnyStripe = any;
// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export async function attachRenewalSchedule(
  stripe: AnyStripe,
  supabase: AnySupabase | null,
  subscriptionId: string,
  confirmationId?: string | null,
): Promise<AttachResult> {
  // Retrieve the subscription with its price + any existing schedule.
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  // Already part of a schedule → nothing to do (idempotent / replay-safe).
  if (sub.schedule) return { attached: false, skipped: "already_scheduled" };

  const item = sub.items?.data?.[0];
  const firstYearId = typeof item?.price === "string" ? item.price : item?.price?.id;
  const firstYearAmt = typeof item?.price === "object" ? (item.price.unit_amount ?? null) : null;

  // Only phase our provisioned standard first-year prices. Combo/legacy → skip.
  if (!firstYearId || !isProvisionedFirstYearPrice(firstYearId)) {
    return { attached: false, skipped: "not_phased_price" };
  }
  const renewalId = renewalPriceIdForFirstYear(firstYearId);
  if (!renewalId) return { attached: false, skipped: "no_renewal_mapping" };

  // DB guard: this order already has a schedule id → don't create a second one.
  let orderId: string | null = null;
  if (supabase) {
    const sel = "id, subscription_schedule_id";
    const { data: row } = confirmationId
      ? await supabase.from("orders").select(sel).eq("confirmation_id", confirmationId).maybeSingle()
      : await supabase.from("orders").select(sel).eq("subscription_id", subscriptionId).maybeSingle();
    if (row?.subscription_schedule_id) return { attached: false, skipped: "order_already_scheduled" };
    orderId = row?.id ?? null;
  }

  // Create a schedule from the subscription (phase 0 mirrors current first-year
  // price + current billing period), then define the two phases + release.
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
  const cur = schedule.phases?.[0];
  const phase0Items = Array.isArray(cur?.items) && cur.items.length
    ? cur.items.map((i: { price: string | { id: string }; quantity?: number }) => ({
        price: typeof i.price === "string" ? i.price : i.price.id,
        quantity: i.quantity ?? 1,
      }))
    : [{ price: firstYearId, quantity: 1 }];

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      { items: phase0Items, start_date: cur?.start_date, iterations: 1 },
      { items: [{ price: renewalId, quantity: 1 }], iterations: 1 },
    ],
  });

  const firstRenewalAt = cur?.end_date ? new Date(cur.end_date * 1000).toISOString() : null;

  // Read the renewal price amount for the order record (best-effort).
  let renewalAmt: number | null = null;
  try {
    const rp = await stripe.prices.retrieve(renewalId);
    renewalAmt = rp?.unit_amount ?? null;
  } catch { /* non-fatal */ }

  if (supabase && orderId) {
    await supabase.from("orders").update({
      subscription_schedule_id: schedule.id,
      subscription_renewal_price_id: renewalId,
      subscription_first_year_cents: firstYearAmt,
      subscription_renewal_cents: renewalAmt,
      subscription_first_renewal_at: firstRenewalAt,
    }).eq("id", orderId);
  }

  return {
    attached: true,
    scheduleId: schedule.id,
    firstYearPriceId: firstYearId,
    renewalPriceId: renewalId,
    firstYearCents: firstYearAmt,
    renewalCents: renewalAmt,
    firstRenewalAt,
  };
}
