import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packageEntitlementPatch } from "../_shared/packageEntitlement.ts";
import {
  oneTimeCents,
  firstYearCents,
  renewalCents,
  firstYearPriceId,
  COMBO_ONE_TIME_CENTS,
  COMBO_ANNUAL_CENTS,
} from "../_shared/pricingMatrix.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Returns the paid-order row for this email if and only if the paid order
 * belongs to a DIFFERENT confirmation_id than the current attempt. Used to
 * hard-block Stripe calls for an email that already has a paid order, while
 * still allowing idempotent retries against the same confirmation_id.
 *
 * We purposely ignore refunded/cancelled rows so a support-refunded order
 * doesn't lock the email forever.
 */
// CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001:
// Order identity is the confirmation_id, NOT the email — a returning customer may
// buy again with the same email (ESA→PSD, ESA→ESA, etc.). We therefore no longer
// block on "email already has a paid order". The only duplicate protection kept
// here is: refuse to mint a payment for an order that is ITSELF already paid, so the
// SAME confirmation_id can never be charged twice. Refunded/cancelled rows ignored.
async function findAlreadyPaidCurrentOrder(
  confirmationId: string,
): Promise<{ confirmation_id: string; payment_intent_id: string | null; paid_at: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !confirmationId) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("orders")
      .select("confirmation_id, payment_intent_id, paid_at, status")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();
    if (!data) return null;
    const paid = !!(data.payment_intent_id || data.paid_at);
    const dead = data.status === "refunded" || data.status === "cancelled";
    if (paid && !dead) {
      return {
        confirmation_id: data.confirmation_id as string,
        payment_intent_id: (data.payment_intent_id as string | null) ?? null,
        paid_at: (data.paid_at as string | null) ?? null,
      };
    }
    return null;
  } catch (err) {
    console.warn("[create-payment-intent] current-order paid check failed:", err);
    return null;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─── FINAL pricing structure (2026-07, phased subscriptions) ─────────────────
// One-time (both products): 1 pet/dog = $129; 2 or 3 = $149 FIXED TOTAL.
// Subscription FIRST YEAR:  1 pet/dog = $115; 2 or 3 = $135 FIXED TOTAL.
// Subscription RENEWAL yr2+: 1 pet/dog = $100; 2 or 3 = $115 (phase 2 schedule).
// Amounts + Stripe Price IDs come from _shared/pricingMatrix.ts (single server
// source; scripts/check-pricing-parity.mjs fails the build if it drifts from
// src/config/pricing.ts). The subscription is minted at the FIRST-YEAR price;
// the webhook attaches the renewal phase after the first invoice is paid.

function getESAOneTimeAmount(petCount: number): number {
  return oneTimeCents(petCount);
}

function getESAAnnualAmount(petCount: number): number {
  return firstYearCents(petCount); // FIRST-YEAR subscription amount (billed today)
}

// One-time PSD letter (both delivery speeds).
function getPSDOneTimeAmount(petCount: number, _deliverySpeed: string): number {
  return oneTimeCents(petCount);
}

function getPSDAnnualAmount(petCount: number): number {
  return firstYearCents(petCount); // FIRST-YEAR subscription amount (billed today)
}

// PSD Consultation RETIRED 2026-07 — no active purchase path. Requests for
// letterType "psd-consultation" are rejected up front (see handler guard);
// historical consultation orders keep their own recorded amounts.

// ─── RA bundle packages (PACKAGE-RA-LETTER-BUNDLE-001) ────────────────────────
// ESA + Reasonable Accommodation Letter  and  PSD + Reasonable Accommodation
// Letter. FLAT pricing for 1–3 pets/dogs (owner instruction). One-time is a
// dynamic PaymentIntent amount; annual uses inline recurring price_data so NO
// pre-created Stripe Price object / Price ID is required. Mirrors
// src/config/pricing.ts BUNDLE_PRICING — keep in sync.
const BUNDLE_ONE_TIME_AMOUNT = COMBO_ONE_TIME_CENTS; // $179 flat total
const BUNDLE_ANNUAL_AMOUNT = COMBO_ANNUAL_CENTS;     // $159/yr flat total (no year-two drop)

const PACKAGE_DISPLAY_NAMES: Record<string, string> = {
  esa_standard: "ESA Letter",
  esa_ra_bundle: "ESA + Reasonable Accommodation Letter",
  psd_standard: "PSD Documentation",
  psd_ra_bundle: "PSD + Reasonable Accommodation Letter",
};

const ALLOWED_PACKAGE_KEYS = ["esa_standard", "esa_ra_bundle", "psd_standard", "psd_ra_bundle"];

// Resolve the canonical package key from an explicit body value, falling back to
// the standard package for the given letterType. Backward compatible: any caller
// that doesn't send packageKey behaves exactly as before.
function resolvePackageKey(rawPackageKey: string, letterType: string): string {
  if (ALLOWED_PACKAGE_KEYS.includes(rawPackageKey)) return rawPackageKey;
  return letterType === "psd" ? "psd_standard" : "esa_standard";
}

function isRaBundleKey(packageKey: string): boolean {
  return packageKey === "esa_ra_bundle" || packageKey === "psd_ra_bundle";
}

// ─── Subscription FIRST-YEAR Price IDs — from _shared/pricingMatrix.ts ───────
// 1 pet/dog → $115/yr first-year Price; 2 or 3 → $135/yr first-year Price. The
// renewal ($100 / $115) is applied by the webhook via a Stripe Subscription
// Schedule after the first invoice is paid. The old flat $109/$129 recurring
// Prices are retired for NEW subscriptions (existing subscriptions untouched).
function buildESAAnnualItems(petCount: number): Array<{ price: string; quantity: number }> {
  return [{ price: firstYearPriceId("esa", petCount), quantity: 1 }];
}

/**
 * Resolve a Stripe coupon from a coupon code. Tries the code as a coupon ID
 * first, then as an active promotion code. Returns the Stripe.Coupon object
 * (or null). Stripe is the only source of truth — we no longer consult any
 * internal coupons table.
 */
async function resolveStripeCoupon(
  stripe: Stripe,
  couponCode: string,
): Promise<Stripe.Coupon | null> {
  if (!couponCode) return null;

  try {
    const coupon = await stripe.coupons.retrieve(couponCode);
    if (coupon && coupon.valid) {
      console.info(`[create-payment-intent] Resolved coupon by ID: ${coupon.id}`);
      return coupon;
    }
  } catch {
    // Not a direct coupon ID — try promotion code next.
  }

  try {
    const promoCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });
    if (promoCodes.data.length > 0) {
      const promo = promoCodes.data[0];
      const coupon = typeof promo.coupon === "string"
        ? await stripe.coupons.retrieve(promo.coupon)
        : promo.coupon;
      if (coupon && coupon.valid) {
        console.info(`[create-payment-intent] Resolved coupon via promo code ${couponCode} → coupon ${coupon.id}`);
        return coupon;
      }
    }
  } catch {
    // Promotion code lookup failed
  }

  console.warn(`[create-payment-intent] Could not resolve Stripe coupon for code: ${couponCode}`);
  return null;
}

// Compute discount in cents from a Stripe coupon. Only fixed-amount (amount_off)
// coupons are supported right now; percent-off and non-USD coupons return 0
// (validate-coupon already rejects them up front, so this is a defense-in-depth
// guard for the create-payment-intent path).
function couponDiscountCents(coupon: Stripe.Coupon | null): number {
  if (!coupon || coupon.valid === false) return 0;
  if (coupon.amount_off == null) return 0;
  if (coupon.currency && coupon.currency.toLowerCase() !== "usd") return 0;
  return coupon.amount_off;
}

// ─── LEGACY-RESUME PRICE LOCK (2026-07) ───────────────────────────────────────
// New pricing applies to NEW customers only. When an EXISTING unpaid order is
// resumed, we charge the ORIGINAL saved quote (orders.price) instead of the
// recalculated current amount. The SERVER is authoritative — we read the saved
// price from the DB and never trust any client-supplied dollar value.
//
// The amount lock is driven purely by the saved price, so it is correct
// regardless of the exact cutoff. PRICING_V2_LAUNCH_AT only affects the audit
// label for the rare price-less pre-launch lead (legacy_fallback vs current).
// LIVE MUST set the PRICING_V2_LAUNCH_AT env var to its real pricing-launch
// timestamp at deploy time; the default below is a safe TEST fallback.
const PRICING_V2_LAUNCH_AT = new Date(
  Deno.env.get("PRICING_V2_LAUNCH_AT") ?? "2026-07-03T00:00:00Z",
);

// pricing_source values persisted for admin visibility:
//   current_pricing    — fresh customer / new-pricing amount used
//   legacy_saved_quote — resumed order kept its original (different) quote
//   legacy_fallback    — pre-launch lead with no usable saved price (current
//                        pricing used because no old amount exists to restore;
//                        flagged for admin review — we never fabricate a price)
async function resolveLegacyQuoteLock(
  confirmationId: string,
  configBaseCents: number,
): Promise<{ baseCents: number; pricingSource: string; savedPriceCents: number | null }> {
  const out = { baseCents: configBaseCents, pricingSource: "current_pricing", savedPriceCents: null as number | null };
  if (!confirmationId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return out;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("orders")
      .select("price, created_at, paid_at, payment_intent_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();
    if (!data) return out; // brand-new customer — no saved quote to preserve
    // NEVER reprice a paid order (defensive guard — a paid order should not
    // re-mint a PI, but if it somehow does we leave the amount untouched).
    if (data.payment_intent_id || data.paid_at) return out;
    const savedPrice = typeof data.price === "number" ? data.price : null;
    const isLegacy = data.created_at
      ? new Date(data.created_at as string).getTime() < PRICING_V2_LAUNCH_AT.getTime()
      : false;
    if (savedPrice != null && savedPrice > 0) {
      const savedCents = Math.round(savedPrice * 100);
      out.savedPriceCents = savedCents;
      out.baseCents = savedCents; // lock the base to the original quoted amount
      out.pricingSource = savedCents !== configBaseCents ? "legacy_saved_quote" : "current_pricing";
      return out;
    }
    // No usable saved price — we cannot restore an old amount without fabricating
    // one, so current pricing is used. Flag pre-launch leads for admin review.
    out.pricingSource = isLegacy ? "legacy_fallback" : "current_pricing";
    return out;
  } catch (err) {
    console.warn("[create-payment-intent] legacy quote lock failed — using current pricing:", err instanceof Error ? err.message : String(err));
    return out;
  }
}

async function stampPricingSource(confirmationId: string, pricingSource: string): Promise<void> {
  if (!confirmationId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const patch: Record<string, unknown> = { pricing_source: pricingSource };
    if (pricingSource === "legacy_saved_quote") patch.quote_locked_at = new Date().toISOString();
    await supabase.from("orders").update(patch).eq("confirmation_id", confirmationId);
  } catch { /* best-effort audit only — never block payment setup */ }
}

// RA-DOCUMENT-WORKFLOW-PORTALS-CONSISTENCY-001 (2026-07-11): stamp the
// authoritative package entitlement onto the (unpaid) order at PI-creation time
// so combo (RA bundle) orders carry package_key / billing_plan /
// includes_reasonable_accommodation_letter regardless of whether the Stripe
// webhook fires first — the webhook still reconciles too (defense-in-depth).
// This uses the SAME server-validated packageKey the amount is charged on — it
// is NOT price inference. Guarded to unpaid orders so a paid order is never
// re-stamped. Best-effort: never blocks payment setup.
async function stampPackageEntitlement(
  confirmationId: string,
  pkgKey: string,
  billingPlan: "one_time" | "annual",
): Promise<void> {
  if (!confirmationId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase
      .from("orders")
      .update(packageEntitlementPatch(pkgKey, billingPlan))
      .eq("confirmation_id", confirmationId)
      .is("paid_at", null);
  } catch (err) {
    console.warn("[create-payment-intent] package entitlement stamp failed (webhook will reconcile):", err instanceof Error ? err.message : String(err));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) return json({ error: "Payment service not configured" }, 500);

  // @ts-ignore
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const action = (body.action as string) ?? "";
  const plan = (body.plan as string) ?? "one-time";
  const letterType = (body.letterType as string) ?? "esa";
  const petCount = Math.max(1, Number(body.petCount ?? 1));
  const deliverySpeed = (body.deliverySpeed as string) ?? "2-3days";
  const email = (body.email as string) ?? "";
  // ESA sends confirmationId at the top level; the PSD checkout nests it under
  // `metadata.confirmationId`. Read both so the legacy-resume price lock (and
  // the PI's confirmation_id metadata) resolve correctly for BOTH products.
  const bodyMeta = (body.metadata && typeof body.metadata === "object")
    ? (body.metadata as Record<string, unknown>)
    : {};
  const confirmationId = (body.confirmationId as string)
    || (bodyMeta.confirmationId as string)
    || "";
  const firstName = (body.firstName as string) ?? "";
  const lastName = (body.lastName as string) ?? "";
  const state = (body.state as string) ?? "";
  const customerName = (body.customerName as string) ?? `${firstName} ${lastName}`.trim();
  const cancelSubId = (body.cancelSubscriptionId as string) ?? "";
  const paymentMethodId = (body.paymentMethodId as string) ?? "";
  // Coupon code from frontend (validated by our DB validate-coupon function)
  const couponCode = (body.couponCode as string) ?? "";

  // ── RA bundle package (PACKAGE-RA-LETTER-BUNDLE-001) ──────────────────────
  // packageKey drives the flat bundle pricing + fulfillment flag. Optional and
  // backward compatible — omitted → standard package for this letterType.
  const packageKey = resolvePackageKey((body.packageKey as string) ?? "", letterType);
  const isBundle = isRaBundleKey(packageKey);

  // ── PSD consultation RETIRED (2026-07) ────────────────────────────────────
  // No active purchase path. Reject any attempt to mint a charge for it before
  // any Stripe call. Historical consultation orders keep their recorded amounts.
  if (letterType === "psd-consultation" || packageKey === "psd_consultation") {
    return json({ error: "The PSD consultation is no longer available.", retired: true }, 410);
  }

  // ── Phase 1 analytics: read attribution fields (all optional, all safe) ──
  // Six fields ONLY are forwarded into Stripe payment_intent.metadata so
  // attribution survives even if the Supabase lead-write is lost. We do NOT
  // include the full attribution_json — that lives in orders.attribution_json
  // and orders.first_touch_json / last_touch_json (the canonical store).
  const sessionId    = (body.sessionId    as string | null) ?? null;
  const utmSource    = (body.utmSource    as string | null) ?? null;
  const utmCampaign  = (body.utmCampaign  as string | null) ?? null;
  const gclid        = (body.gclid        as string | null) ?? null;
  const fbclid       = (body.fbclid       as string | null) ?? null;
  const channel      = (body.channel      as string | null) ?? null;

  // Build the additive metadata block once — only include non-empty values.
  // Stripe rejects null/undefined values, so coerce to strings or omit.
  function buildAttributionMeta(): Record<string, string> {
    const meta: Record<string, string> = {};
    const put = (k: string, v: string | null | undefined) => {
      if (v && typeof v === "string" && v.length > 0) meta[k] = v.slice(0, 500);
    };
    put("session_id",   sessionId);
    put("utm_source",   utmSource);
    put("utm_campaign", utmCampaign);
    put("gclid",        gclid);
    put("fbclid",       fbclid);
    put("channel",      channel);
    return meta;
  }

  // Package metadata carried on the PI/subscription so the webhook can persist
  // package_key / package_display_name / billing_plan / includes_ra_letter onto
  // the order. Only stamped for the esa/psd letter products (not consultation).
  function buildPackageMeta(billingPlan: "one_time" | "annual"): Record<string, string> {
    if (letterType !== "esa" && letterType !== "psd") return {};
    return {
      package_key: packageKey,
      package_display_name: PACKAGE_DISPLAY_NAMES[packageKey] ?? "",
      billing_plan: billingPlan,
      includes_ra_letter: isBundle ? "true" : "false",
    };
  }

  // ── Action: cancel_subscription ──────────────────────────────────────────
  if (action === "cancel_subscription" && cancelSubId) {
    try {
      await stripe.subscriptions.cancel(cancelSubId);
      return json({ ok: true });
    } catch {
      return json({ ok: false });
    }
  }

  // ── Action: update_metadata ───────────────────────────────────────────────
  if (action === "update_metadata") {
    const paymentIntentId = (body.paymentIntentId as string) ?? "";
    const checkoutSessionId = (body.checkoutSessionId as string) ?? "";
    const metadataPatch = (body.metadata as Record<string, string>) ?? {};

    if (!paymentIntentId) {
      return json({ error: "paymentIntentId is required for update_metadata" }, 400);
    }

    const metadataUpdate: Record<string, string> = { ...metadataPatch };
    if (checkoutSessionId) {
      metadataUpdate.checkout_session_id = checkoutSessionId;
    }

    if (Object.keys(metadataUpdate).length === 0) {
      return json({ error: "No metadata fields provided to update" }, 400);
    }

    try {
      const updated = await stripe.paymentIntents.update(paymentIntentId, {
        metadata: metadataUpdate,
      });
      console.info(`[create-payment-intent] Metadata updated for PI ${paymentIntentId}: ${JSON.stringify(metadataUpdate)}`);
      return json({ ok: true, paymentIntentId: updated.id, metadata: updated.metadata });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[create-payment-intent] update_metadata error:", message);
      return json({ error: message }, 500);
    }
  }

  // ── Action: update_amount ─────────────────────────────────────────────────
  if (action === "update_amount") {
    const piId = (body.paymentIntentId as string) ?? "";
    const lt = (body.letterType as string) ?? "esa";
    const pc = Math.max(1, Number(body.petCount ?? 1));
    const ds = (body.deliverySpeed as string) ?? "2-3days";
    const cc = (body.couponCode as string) ?? "";

    if (!piId) return json({ error: "paymentIntentId is required for update_amount" }, 400);

    // update_amount only ever adjusts a ONE-TIME PaymentIntent (annual switches
    // re-create a subscription PI). Resolve the package so a standard↔bundle
    // switch re-prices to the flat bundle amount server-side.
    const pkg = resolvePackageKey((body.packageKey as string) ?? "", lt);
    const bundle = isRaBundleKey(pkg);

    // Re-derive base amount server-side — never trust a client-supplied dollar value
    const baseAmount = bundle
      ? BUNDLE_ONE_TIME_AMOUNT
      : lt === "psd"
        ? getPSDOneTimeAmount(pc, ds)
        : getESAOneTimeAmount(pc);

    let discountCents = 0;
    if (cc) {
      try {
        const coupon = await resolveStripeCoupon(stripe, cc);
        discountCents = couponDiscountCents(coupon);
      } catch {
        console.warn("[create-payment-intent] update_amount: Stripe coupon lookup failed for", cc);
      }
    }

    const finalAmount = Math.max(baseAmount - discountCents, 0);

    // Stamp the backend-validated coupon details into the PI metadata so the
    // webhook can persist coupon_code and coupon_discount without trusting any
    // frontend-supplied value. This is the source of truth for one-time payments.
    const metadataPatch: Record<string, string> = {};
    if (cc && discountCents > 0) {
      metadataPatch.coupon_code = cc;
      metadataPatch.coupon_discount_cents = String(discountCents);
    }
    // Persist the final package selection onto the PI (one-time plan) so the
    // webhook records the correct package even if the customer switched at Step 3.
    if (lt === "esa" || lt === "psd") {
      metadataPatch.package_key = pkg;
      metadataPatch.package_display_name = PACKAGE_DISPLAY_NAMES[pkg] ?? "";
      metadataPatch.billing_plan = "one_time";
      metadataPatch.includes_ra_letter = bundle ? "true" : "false";
    }

    try {
      const updated = await stripe.paymentIntents.update(piId, {
        amount: finalAmount,
        ...(Object.keys(metadataPatch).length > 0 ? { metadata: metadataPatch } : {}),
      });
      console.info(`[create-payment-intent] update_amount: PI ${piId} -> $${finalAmount / 100} (coupon: ${cc || "none"}, discount: $${discountCents / 100})`);
      return json({
        ok: true,
        amount: finalAmount,
        paymentIntentId: updated.id,
        couponCode: cc || null,
        couponDiscountCents: discountCents,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[create-payment-intent] update_amount error:", message);
      return json({ error: message }, 500);
    }
  }

  // email is required for customer operations
  if (!email) {
    return json({ error: "email is required" }, 400);
  }

  // ── Duplicate-charge guard (CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001) ──
  // Repeat purchases with the same email are allowed (order identity is the
  // confirmation_id, not the email). We only refuse to mint a payment for an order
  // that is ITSELF already paid — this prevents charging the same confirmation_id
  // twice while letting a returning customer start and pay for a NEW order.
  const alreadyPaidOrder = await findAlreadyPaidCurrentOrder(confirmationId);
  if (alreadyPaidOrder) {
    console.warn(
      `[create-payment-intent] REFUSED: order ${confirmationId} is already paid (PI ${alreadyPaidOrder.payment_intent_id ?? "n/a"})`,
    );
    return json(
      {
        error: "This order has already been paid. Start a new order to purchase again.",
        alreadyPaid: true,
        confirmationId,
      },
      409,
    );
  }

  try {
    // ── Subscription payment intent ──────────────────────────────────────────
    if (plan === "subscription") {
      // ── Phase 8: NO public coupons on subscriptions ─────────────────────────
      // The subscription price is already the built-in saving. Public coupons are
      // rejected server-side (never silently ignored). Exceptional subscription
      // discounts are an admin/backend-only, audited path — not this endpoint.
      if (couponCode) {
        return json({
          error: "Coupons can't be applied to subscription plans — the annual plan already includes the built-in saving.",
          couponRejected: true,
        }, 400);
      }
      const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let subscriptionItems: any[];
      if (isBundle) {
        // RA bundle annual = flat $159/yr. The Stripe Subscriptions API (unlike
        // Checkout Sessions) does NOT accept inline `price_data.product_data` — it
        // requires an existing `product` id. Create an on-the-fly product so the
        // amount stays server-authoritative with NO pre-created Price object/id.
        const bundleProduct = await stripe.products.create({
          name: PACKAGE_DISPLAY_NAMES[packageKey] ?? "PawTenant RA Bundle (Annual)",
        });
        subscriptionItems = [{
          price_data: {
            currency: "usd",
            product: bundleProduct.id,
            recurring: { interval: "year" },
            unit_amount: BUNDLE_ANNUAL_AMOUNT,
          },
          quantity: 1,
        }];
      } else if (letterType === "psd") {
        const priceId = firstYearPriceId("psd", petCount);
        if (!priceId) return json({ error: "No subscription price found" }, 400);
        subscriptionItems = [{ price: priceId, quantity: 1 }];
      } else {
        subscriptionItems = buildESAAnnualItems(petCount);
      }

      if (cancelSubId) {
        try { await stripe.subscriptions.cancel(cancelSubId); } catch { /* best-effort */ }
      }

      // ── Find or create Stripe customer ──────────────────────────────────
      let customerId: string;
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email,
          name: customerName || undefined,
          metadata: confirmationId ? { confirmation_id: confirmationId } : {},
        });
        customerId = customer.id;
      }

      if (paymentMethodId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
        } catch { /* best-effort */ }
      }

      // ── Build subscription params ────────────────────────────────────────
      // No coupon handling here: public coupons on subscriptions are rejected
      // above, so the subscription is always minted at the pure first-year price.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptionParams: any = {
        customer: customerId,
        items: subscriptionItems,
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          ...(confirmationId ? { confirmation_id: confirmationId } : {}),
          ...(email ? { email } : {}),
          plan: "subscription",
          letter_type: letterType,
          pet_count: String(tier),
          delivery_speed: deliverySpeed,
          first_name: firstName,
          last_name: lastName,
          state,
          // ── RA bundle package metadata (additive) ───────────────────────
          ...buildPackageMeta("annual"),
          // ── Phase 1: attribution metadata (additive, all optional) ──────
          ...buildAttributionMeta(),
        },
      };

      const subscription = await stripe.subscriptions.create(subscriptionParams);

      // @ts-ignore
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      // @ts-ignore
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

      if (!paymentIntent?.client_secret) {
        return json({ error: "Could not obtain subscription payment intent" }, 500);
      }

      // Suppress Stripe auto-receipt — we send our own branded receipt.
      // Also stamp coupon details onto the invoice PI metadata so the webhook
      // can persist coupon_code and coupon_discount without relying on frontend
      // state. discountCents = base price − what Stripe will actually charge
      // after applying the coupon; this is the real backend-calculated discount.
      // Annual display amount must be the SUBSCRIPTION price (previously the
      // PSD branch wrongly used the one-time amount, which stamped a phantom
      // coupon_discount on every PSD subscription).
      const displayAmount = isBundle
        ? BUNDLE_ANNUAL_AMOUNT
        : letterType === "psd"
          ? getPSDAnnualAmount(petCount)
          : getESAAnnualAmount(petCount);
      const discountCents = Math.max(0, displayAmount - paymentIntent.amount);

      // ── SUBSCRIPTION-PI-ORPHAN-FIX ────────────────────────────────────────
      // The invoice PI previously carried ONLY coupon metadata (and receipt_email
      // was nulled), so stripe-webhook's resolveOrder had no confirmation_id, no
      // email and no session to match → payment_intent.succeeded was logged as an
      // orphaned payment and ALL post-payment emails (receipt, portal access,
      // admin notification) plus coupon capture were skipped for every annual
      // first purchase. Mirror the one-time PI metadata convention here so the
      // webhook resolves subscription first invoices exactly like one-time PIs.
      const piMetaPatch: Record<string, string> = {
        ...(confirmationId ? { confirmation_id: confirmationId } : {}),
        ...(email ? { email } : {}),
        subscription_id: subscription.id,
        plan: "subscription",
        letter_type: letterType,
        pet_count: String(tier),
        delivery_speed: deliverySpeed,
        ...buildPackageMeta("annual"),
        ...buildAttributionMeta(),
      };
      // No coupon fields on subscription PIs — subscriptions never take a public coupon.

      try {
        await stripe.paymentIntents.update(paymentIntent.id, {
          receipt_email: null,
          metadata: piMetaPatch,
        });
        console.info(`[create-payment-intent] Invoice PI ${paymentIntent.id} metadata stamped: cid=${confirmationId || "none"}, email=${email ? "yes" : "no"}, sub=${subscription.id}, coupon=${couponCode || "none"}`);
      } catch (metaErr) {
        // Best-effort, but LOUD — if this fails the webhook falls back to the
        // subscription-metadata lookup (see stripe-webhook resolveOrder fallback).
        console.warn(`[create-payment-intent] Invoice PI metadata patch FAILED for ${paymentIntent.id} (webhook will use subscription fallback):`, metaErr instanceof Error ? metaErr.message : String(metaErr));
      }

      console.info(`[create-payment-intent] Subscription ${subscription.id} created for ${confirmationId || email} — pet_count=${petCount}, delivery=${deliverySpeed}, display_amount=$${displayAmount / 100}, coupon=${couponCode || "none"}, discount=$${discountCents / 100}`);

      // Stamp authoritative package entitlement now (annual) — webhook-independent.
      await stampPackageEntitlement(confirmationId, packageKey, "annual");

      // Renewal amount (year two onward) for the checkout disclosure. Combo is
      // flat (no drop); standard uses the tier renewal price. The webhook attaches
      // the actual renewal-price schedule after the first invoice is paid.
      const renewalAmountCents = isBundle ? BUNDLE_ANNUAL_AMOUNT : renewalCents(petCount);

      return json({
        clientSecret: paymentIntent.client_secret,
        subscriptionId: subscription.id,
        amount: paymentIntent.amount,
        basePriceAmount: paymentIntent.amount,
        paymentIntentId: paymentIntent.id,
        firstYearAmount: displayAmount,
        renewalAmount: renewalAmountCents,
      });
    }

    // ── One-time payment intent ──────────────────────────────────────────────
    let baseAmount: number;
    if (isBundle) {
      baseAmount = BUNDLE_ONE_TIME_AMOUNT; // flat $179, 1–3 pets/dogs
    } else if (letterType === "psd") {
      baseAmount = getPSDOneTimeAmount(petCount, deliverySpeed);
    } else {
      baseAmount = getESAOneTimeAmount(petCount);
    }

    // ── LEGACY-RESUME PRICE LOCK ──────────────────────────────────────────────
    // Preserve the original saved quote for resumed unpaid orders. Skipped for
    // the consultation product (flat $79, never resume-repriced). Server reads
    // the saved price from the DB — the client-supplied petCount/plan cannot
    // override a resumed order's locked amount.
    // RA bundles are brand-new flat-priced products with no legacy quotes to
    // preserve; skipping the lock also prevents a standard saved lead price
    // (e.g. $129) from suppressing the $179 bundle upcharge on an in-session
    // upgrade. Standard packages keep the existing resume/legacy behavior.
    let pricingSource = "current_pricing";
    if (letterType !== "psd-consultation" && !isBundle) {
      const lock = await resolveLegacyQuoteLock(confirmationId, baseAmount);
      baseAmount = lock.baseCents;
      pricingSource = lock.pricingSource;
    } else if (isBundle) {
      pricingSource = "bundle_flat";
    }

    // Apply coupon discount server-side at PI creation so Stripe charges the
    // discounted amount. Stripe is the only source of truth — the coupon is
    // resolved against the Stripe API; if the code isn't a valid amount_off
    // coupon there, no discount is applied.
    let discountCents = 0;
    if (couponCode) {
      try {
        const coupon = await resolveStripeCoupon(stripe, couponCode);
        discountCents = couponDiscountCents(coupon);
      } catch {
        console.warn("[create-payment-intent] Stripe coupon lookup failed for", couponCode);
      }
    }

    const finalAmount = Math.max(baseAmount - discountCents, 0);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: "usd",
      payment_method_types: ["card"],
      // receipt_email intentionally omitted — we send our own branded receipt via Resend
      metadata: {
        ...(confirmationId ? { confirmation_id: confirmationId } : {}),
        email,
        first_name: firstName,
        last_name: lastName,
        state,
        letter_type: letterType,
        delivery_speed: deliverySpeed,
        pet_count: String(petCount),
        pricing_source: pricingSource,
        ...(couponCode && discountCents > 0
          ? { coupon_code: couponCode, coupon_discount_cents: String(discountCents) }
          : {}),
        // ── RA bundle package metadata (additive) ─────────────────────────
        ...buildPackageMeta("one_time"),
        // ── Phase 1: attribution metadata (additive, all optional) ────────
        ...buildAttributionMeta(),
      },
    });

    // Persist the pricing decision for admin visibility (best-effort, never
    // blocks payment setup). Amount is already locked above.
    await stampPricingSource(confirmationId, pricingSource);
    // Stamp authoritative package entitlement now (one-time) — webhook-independent.
    await stampPackageEntitlement(confirmationId, packageKey, "one_time");

    console.info(`[create-payment-intent] PI ${paymentIntent.id} — $${finalAmount / 100} (${letterType}, ${petCount} pet(s), ${deliverySpeed}, coupon: ${couponCode || "none"}, discount: $${discountCents / 100}, pricing: ${pricingSource}) — cid: ${confirmationId || "none"}`);

    return json({
      clientSecret: paymentIntent.client_secret,
      amount: finalAmount,
      basePriceAmount: baseAmount,
      paymentIntentId: paymentIntent.id,
      couponCode: couponCode || null,
      couponDiscountCents: discountCents,
      pricingSource,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-payment-intent] Error:", message);
    return json({ error: message }, 500);
  }
});