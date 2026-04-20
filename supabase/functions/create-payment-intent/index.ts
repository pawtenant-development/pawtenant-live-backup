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

// ─── ESA pricing (pet-count only) ─────────────────────────────────────────────
function getESAOneTimeAmount(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (110 + (n - 1) * 25) * 100; // cents
}

function getESAAnnualAmount(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (99 + (n - 1) * 20) * 100; // cents
}

function getPSDOneTimeAmount(petCount: number, deliverySpeed: string): number {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isPriority = deliverySpeed !== "2-3days";
  if (tier === 1) return isPriority ? 12000 : 10000;
  if (tier === 2) return isPriority ? 14000 : 12000;
  return isPriority ? 15500 : 13500;
}

// ─── ESA Stripe price IDs (LIVE) — base + add-on model ────────────────────────
const ESA_ANNUAL_BASE_PRICE_ID = "price_1TNN4QGwm9wIWlgi05I7rDMe";
const ESA_ANNUAL_ADDON_PRICE_ID = "price_1TNN4rGwm9wIWlgie4OcX3rZ";

function buildESAAnnualItems(petCount: number): Array<{ price: string; quantity: number }> {
  const n = Math.max(1, Math.min(3, petCount));
  const items = [{ price: ESA_ANNUAL_BASE_PRICE_ID, quantity: 1 }];
  if (n > 1) items.push({ price: ESA_ANNUAL_ADDON_PRICE_ID, quantity: n - 1 });
  return items;
}

const PSD_ANNUAL_PRICE_IDS: Record<number, string> = {
  1: "price_1TFkDaGwm9wIWlgisHcWoZfX",
  2: "price_1TG6RrGwm9wIWlgiRSRzWkOb",
  3: "price_1TG6TKGwm9wIWlgiNFZbRloA",
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
  const confirmationId = (body.confirmationId as string) ?? "";
  const firstName = (body.firstName as string) ?? "";
  const lastName = (body.lastName as string) ?? "";
  const state = (body.state as string) ?? "";
  const customerName = (body.customerName as string) ?? `${firstName} ${lastName}`.trim();
  const cancelSubId = (body.cancelSubscriptionId as string) ?? "";
  const paymentMethodId = (body.paymentMethodId as string) ?? "";
  // Coupon code from frontend (validated by our DB validate-coupon function)
  const couponCode = (body.couponCode as string) ?? "";

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
    const baseAmount = lt === "psd"
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
          letter_type: letterType,
          pet_count: String(tier),
          delivery_speed: deliverySpeed,
          first_name: firstName,
          last_name: lastName,
          state,
          ...(couponCode ? { coupon_code: couponCode } : {}),
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
      const displayAmount = letterType === "psd"
        ? getPSDOneTimeAmount(petCount, deliverySpeed)
        : getESAAnnualAmount(petCount);
      const discountCents = Math.max(0, displayAmount - paymentIntent.amount);

      const piMetaPatch: Record<string, string> = {};
      if (couponCode) piMetaPatch.coupon_code = couponCode;
      if (discountCents > 0) piMetaPatch.coupon_discount_cents = String(discountCents);

      try {
        await stripe.paymentIntents.update(paymentIntent.id, {
          receipt_email: null,
          ...(Object.keys(piMetaPatch).length > 0 ? { metadata: piMetaPatch } : {}),
        });
      } catch { /* best-effort */ }

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
    if (letterType === "psd") {
      baseAmount = getPSDOneTimeAmount(petCount, deliverySpeed);
    } else {
      baseAmount = getESAOneTimeAmount(petCount);
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
        ...(couponCode && discountCents > 0
          ? { coupon_code: couponCode, coupon_discount_cents: String(discountCents) }
          : {}),
      },
    });

    console.info(`[create-payment-intent] PI ${paymentIntent.id} — $${finalAmount / 100} (${letterType}, ${petCount} pet(s), ${deliverySpeed}, coupon: ${couponCode || "none"}, discount: $${discountCents / 100}) — cid: ${confirmationId || "none"}`);

    return json({
      clientSecret: paymentIntent.client_secret,
      amount: finalAmount,
      basePriceAmount: baseAmount,
      paymentIntentId: paymentIntent.id,
      couponCode: couponCode || null,
      couponDiscountCents: discountCents,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-payment-intent] Error:", message);
    return json({ error: message }, 500);
  }
});