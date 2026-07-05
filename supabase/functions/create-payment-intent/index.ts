import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
async function findPaidOrderBlockingEmail(
  email: string,
  currentConfirmationId: string,
): Promise<{ confirmation_id: string; payment_intent_id: string | null; paid_at: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("orders")
      .select("confirmation_id, payment_intent_id, paid_at, status")
      .ilike("email", normalized)
      .not("status", "in", `("refunded","cancelled")`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!data) return null;
    for (const row of data) {
      const paid = !!(row.payment_intent_id || row.paid_at);
      if (paid && row.confirmation_id !== currentConfirmationId) {
        return {
          confirmation_id: row.confirmation_id as string,
          payment_intent_id: (row.payment_intent_id as string | null) ?? null,
          paid_at: (row.paid_at as string | null) ?? null,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("[create-payment-intent] paid-email check failed:", err);
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

// ─── FINAL pricing structure (2026-07) ────────────────────────────────────────
// One-time (both products): 1 pet/dog = $129; 2 or 3 = $149 FIXED TOTAL.
// Annual (both products):   1 pet/dog = $109/yr; 2 or 3 = $129/yr FIXED TOTAL.
// Mirrors src/config/pricing.ts — keep both in sync. Annual amounts MUST match
// what the Stripe recurring Prices below actually bill (they feed the discount
// calc displayAmount − PI.amount; a mismatch stamps phantom coupon_discount).

function getESAOneTimeAmount(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 129 : 149) * 100; // cents
}

function getESAAnnualAmount(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 109 : 129) * 100; // cents
}

// One-time PSD letter (both delivery speeds).
function getPSDOneTimeAmount(petCount: number, _deliverySpeed: string): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 129 : 149) * 100; // cents
}

function getPSDAnnualAmount(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 109 : 129) * 100; // cents
}

// PSD Consultation — $79 clinical guidance call (separate lead product; no
// letter is created or promised by this purchase).
const PSD_CONSULTATION_AMOUNT = 7900;

// ─── Stripe recurring Price IDs (TEST) — tier model, owner-provided 2026-07 ──
// 1 pet/dog → $109/yr base Price; 2 or 3 → $129/yr fixed-total Price.
// The old base+add-on model ($99 + $20/pet) and $99/$109/$129 PSD tiers are
// retired. Keep in sync with create-checkout-session/index.ts.
const ESA_ANNUAL_BASE_PRICE_ID = "price_1TpOHNGwm9wIWlgiizgabvkc";   // $109/yr, 1 pet
const ESA_ANNUAL_MULTI_PRICE_ID = "price_1TpOLeGwm9wIWlgiLMeunzub";  // $129/yr, 2-3 pets

function buildESAAnnualItems(petCount: number): Array<{ price: string; quantity: number }> {
  const n = Math.max(1, Math.min(3, petCount));
  return [{ price: n === 1 ? ESA_ANNUAL_BASE_PRICE_ID : ESA_ANNUAL_MULTI_PRICE_ID, quantity: 1 }];
}

const PSD_ANNUAL_BASE_PRICE_ID = "price_1TpOPOGwm9wIWlgijMnt7NBJ";   // $109/yr, 1 dog
const PSD_ANNUAL_MULTI_PRICE_ID = "price_1TpORnGwm9wIWlgi9KiPhJpg";  // $129/yr, 2-3 dogs

const PSD_ANNUAL_PRICE_IDS: Record<number, string> = {
  1: PSD_ANNUAL_BASE_PRICE_ID,
  2: PSD_ANNUAL_MULTI_PRICE_ID,
  3: PSD_ANNUAL_MULTI_PRICE_ID,
};

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

    // Re-derive base amount server-side — never trust a client-supplied dollar value
    const baseAmount = lt === "psd-consultation"
      ? PSD_CONSULTATION_AMOUNT
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

  // ── Returning-customer bypass ────────────────────────────────────────────
  // If the CURRENT confirmationId row was spawned by create-returning-order
  // (i.e. parent_order_id is set), this is an authorized upgrade/repeat —
  // skip the paid-email block. Only service-role create-returning-order can
  // set parent_order_id, so the public /assessment flow remains strict.
  let isReturningCustomer = false;
  if (confirmationId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: currentRow } = await sb
        .from("orders")
        .select("parent_order_id")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();
      isReturningCustomer = !!currentRow?.parent_order_id;
    } catch (err) {
      console.warn("[create-payment-intent] returning-customer lookup failed:", err);
    }
  }

  // ── HARD BLOCK: email already has a PAID order under a different row ─────
  // The DB-level protection in get-resume-order catches the LEAD write, but
  // a motivated user could still reach this endpoint (stale state, bypassed
  // Step 2 guard, direct API call). Refuse here so Stripe never charges a card
  // for an email that already has a fulfilled order.
  const paidBlocker = isReturningCustomer
    ? null
    : await findPaidOrderBlockingEmail(email, confirmationId);
  if (paidBlocker) {
    console.warn(
      `[create-payment-intent] REFUSED: email ${email} already paid under ${paidBlocker.confirmation_id} (PI ${paidBlocker.payment_intent_id ?? "n/a"})`,
    );
    return json(
      {
        error: "An order already exists for this email. Please use a different email or contact support to resume your existing order.",
        emailConflict: true,
        alreadyPaid: true,
      },
      409,
    );
  }

  try {
    // ── Subscription payment intent ──────────────────────────────────────────
    if (plan === "subscription") {
      // A consultation is a one-time purchase — never a subscription. Guard so
      // a malformed request can't accidentally mint an ESA subscription.
      if (letterType === "psd-consultation") {
        return json({ error: "PSD consultations are one-time purchases" }, 400);
      }
      const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;

      let subscriptionItems: Array<{ price: string; quantity: number }>;
      if (letterType === "psd") {
        const priceId = PSD_ANNUAL_PRICE_IDS[tier];
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

      // ── Resolve coupon to Stripe coupon ID ──────────────────────────────
      // The coupon code was already validated by validate-coupon (Stripe-only).
      // Here we resolve it again to attach to the subscription.
      let stripeCouponId: string | null = null;
      if (couponCode) {
        const coupon = await resolveStripeCoupon(stripe, couponCode);
        stripeCouponId = coupon ? coupon.id : null;
      }

      // ── Build subscription params ────────────────────────────────────────
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
          ...(couponCode ? { coupon_code: couponCode } : {}),
          // ── Phase 1: attribution metadata (additive, all optional) ──────
          ...buildAttributionMeta(),
        },
      };

      // Attach coupon to subscription if resolved
      if (stripeCouponId) {
        subscriptionParams.coupon = stripeCouponId;
        console.info(`[create-payment-intent] Applying coupon ${stripeCouponId} (code: ${couponCode}) to subscription`);
      }

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
      const displayAmount = letterType === "psd"
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
        ...buildAttributionMeta(),
      };
      if (couponCode) piMetaPatch.coupon_code = couponCode;
      if (discountCents > 0) piMetaPatch.coupon_discount_cents = String(discountCents);

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

      return json({
        clientSecret: paymentIntent.client_secret,
        subscriptionId: subscription.id,
        amount: paymentIntent.amount,
        basePriceAmount: paymentIntent.amount,
        paymentIntentId: paymentIntent.id,
      });
    }

    // ── One-time payment intent ──────────────────────────────────────────────
    let baseAmount: number;
    if (letterType === "psd-consultation") {
      baseAmount = PSD_CONSULTATION_AMOUNT;
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
    let pricingSource = "current_pricing";
    if (letterType !== "psd-consultation") {
      const lock = await resolveLegacyQuoteLock(confirmationId, baseAmount);
      baseAmount = lock.baseCents;
      pricingSource = lock.pricingSource;
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
        // ── Phase 1: attribution metadata (additive, all optional) ────────
        ...buildAttributionMeta(),
      },
    });

    // Persist the pricing decision for admin visibility (best-effort, never
    // blocks payment setup). Amount is already locked above.
    await stampPricingSource(confirmationId, pricingSource);

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