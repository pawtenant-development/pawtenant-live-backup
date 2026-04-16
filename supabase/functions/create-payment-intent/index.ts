import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ─── ESA One-time pricing (pet-count aware) ───────────────────────────────────
function getESAOneTimeAmount(petCount: number, deliverySpeed: string): number {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isPriority = deliverySpeed !== "2-3days";
  if (tier === 1) return isPriority ? 11500 : 10000;
  if (tier === 2) return isPriority ? 13000 : 11500;
  return               isPriority ? 14500 : 13000;
}

// ─── ESA Annual subscription pricing (pet-count aware) ───────────────────────
function getESAAnnualAmount(petCount: number, deliverySpeed: string): number {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isPriority = deliverySpeed !== "2-3days";
  if (tier === 1) return isPriority ? 10500 : 9000;
  if (tier === 2) return isPriority ? 12000 : 10500;
  return               isPriority ? 13500 : 12000;
}

function getPSDOneTimeAmount(petCount: number, deliverySpeed: string): number {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isPriority = deliverySpeed !== "2-3days";
  if (tier === 1) return isPriority ? 12000 : 10000;
  if (tier === 2) return isPriority ? 14000 : 12000;
  return isPriority ? 15500 : 13500;
}

const ESA_ANNUAL_PRICE_IDS: Record<number, { standard: string; priority: string }> = {
  1: { standard: "price_1THP45Gwm9wIWlgi1XDsvnTx", priority: "price_1TF1a9Gwm9wIWlgig0i7gdKz" },
  2: { standard: "price_1THP5NGwm9wIWlgipmibdZro", priority: "price_1THP7RGwm9wIWlgiyd3wR6LM" },
  3: { standard: "price_1THP6nGwm9wIWlgirhtFjBHe", priority: "price_1THP76Gwm9wIWlgiVw9ZI1Oj" },
};

const PSD_ANNUAL_PRICE_IDS: Record<number, string> = {
  1: "price_1TFkDaGwm9wIWlgisHcWoZfX",
  2: "price_1TG6RrGwm9wIWlgiRSRzWkOb",
  3: "price_1TG6TKGwm9wIWlgiNFZbRloA",
};

/**
 * Resolve a Stripe coupon ID from a coupon code string.
 * Strategy:
 *  1. Try to retrieve a Stripe Coupon directly by ID (coupon code = coupon ID).
 *  2. If that fails, try to retrieve a Stripe PromotionCode by code string and
 *     return the underlying coupon ID.
 * Returns the Stripe coupon ID to attach to the subscription, or null if not found.
 */
async function resolveStripeCouponId(
  stripe: Stripe,
  couponCode: string,
): Promise<string | null> {
  if (!couponCode) return null;

  // 1. Try direct coupon lookup (coupon ID = code)
  try {
    const coupon = await stripe.coupons.retrieve(couponCode);
    if (coupon && coupon.valid) {
      console.info(`[create-payment-intent] Resolved coupon by ID: ${coupon.id}`);
      return coupon.id;
    }
  } catch {
    // Not a direct coupon ID — try promotion code next
  }

  // 2. Try promotion code lookup
  try {
    const promoCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });
    if (promoCodes.data.length > 0) {
      const promoCode = promoCodes.data[0];
      const couponId = typeof promoCode.coupon === "string"
        ? promoCode.coupon
        : promoCode.coupon.id;
      console.info(`[create-payment-intent] Resolved coupon via promo code ${couponCode} → coupon ${couponId}`);
      return couponId;
    }
  } catch {
    // Promotion code lookup failed
  }

  console.warn(`[create-payment-intent] Could not resolve Stripe coupon for code: ${couponCode}`);
  return null;
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

  const action          = (body.action          as string)   ?? "";
  const plan            = (body.plan             as string)   ?? "one-time";
  const letterType      = (body.letterType       as string)   ?? "esa";
  const petCount        = Math.max(1, Number(body.petCount   ?? 1));
  const deliverySpeed   = (body.deliverySpeed    as string)   ?? "2-3days";
  const email           = (body.email            as string)   ?? "";
  const confirmationId  = (body.confirmationId   as string)   ?? "";
  const firstName       = (body.firstName        as string)   ?? "";
  const lastName        = (body.lastName         as string)   ?? "";
  const state           = (body.state            as string)   ?? "";
  const customerName    = (body.customerName     as string)   ?? `${firstName} ${lastName}`.trim();
  const cancelSubId     = (body.cancelSubscriptionId as string) ?? "";
  const paymentMethodId = (body.paymentMethodId  as string)   ?? "";
  // Coupon code from frontend (validated by our DB validate-coupon function)
  const couponCode             = (body.couponCode             as string) ?? "";
  const existingPaymentIntentId = (body.existingPaymentIntentId as string) ?? "";

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
    const paymentIntentId    = (body.paymentIntentId    as string) ?? "";
    const checkoutSessionId  = (body.checkoutSessionId  as string) ?? "";
    const metadataPatch      = (body.metadata           as Record<string, string>) ?? {};

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

  // email is required for customer operations
  if (!email) {
    return json({ error: "email is required" }, 400);
  }

  try {
    // ── Subscription payment intent ──────────────────────────────────────────
    if (plan === "subscription") {
      const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
      let priceId: string;

      if (letterType === "psd") {
        priceId = PSD_ANNUAL_PRICE_IDS[tier];
      } else {
        const level = deliverySpeed === "2-3days" ? "standard" : "priority";
        priceId = ESA_ANNUAL_PRICE_IDS[tier][level];
      }

      if (!priceId) return json({ error: "No subscription price found" }, 400);

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

      // ── Resolve coupon → Stripe coupon ID ───────────────────────────────
      // The coupon code was already validated by our DB validate-coupon function.
      // Here we resolve it to a Stripe coupon/promotion code ID to attach to the subscription.
      let stripeCouponId: string | null = null;
      if (couponCode) {
        stripeCouponId = await resolveStripeCouponId(stripe, couponCode);
      }

      // ── Build subscription params ────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptionParams: any = {
        customer: customerId,
        items: [{ price: priceId }],
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

      // Suppress Stripe auto-receipt — we send our own branded receipt
      try {
        await stripe.paymentIntents.update(paymentIntent.id, { receipt_email: null });
      } catch { /* best-effort */ }

      const displayAmount = letterType === "psd"
        ? getPSDOneTimeAmount(petCount, deliverySpeed)
        : getESAAnnualAmount(petCount, deliverySpeed);

      console.info(`[create-payment-intent] Subscription ${subscription.id} created for ${confirmationId || email} — pet_count=${petCount}, delivery=${deliverySpeed}, display_amount=$${displayAmount / 100}, coupon=${couponCode || "none"}`);

      return json({
        clientSecret:    paymentIntent.client_secret,
        subscriptionId:  subscription.id,
        amount:          paymentIntent.amount,
        basePriceAmount: paymentIntent.amount,
        paymentIntentId: paymentIntent.id,
      });
    }

    // ── One-time payment intent ──────────────────────────────────────────────
    let baseAmount: number;
    if (letterType === "psd") {
      baseAmount = getPSDOneTimeAmount(petCount, deliverySpeed);
    } else {
      baseAmount = getESAOneTimeAmount(petCount, deliverySpeed);
    }

    // ── Apply coupon discount (one-time payments have no native Stripe coupon param) ──
    let discountedAmount = baseAmount;
    if (couponCode === "ADMINDISCOUNT90") {
      // Temporary hardcoded override: $98 = 9800 cents.
      // Remove once the Stripe coupon is corrected to amount_off: 9800.
      discountedAmount = Math.max(50, baseAmount - 9800);
      console.info(`[create-payment-intent] Hardcoded override: ${couponCode} → $${discountedAmount / 100} (was $${baseAmount / 100})`);
    } else if (couponCode) {
      const couponId = await resolveStripeCouponId(stripe, couponCode);
      if (couponId) {
        try {
          const coupon = await stripe.coupons.retrieve(couponId);
          if (coupon.valid) {
            if (coupon.percent_off) {
              discountedAmount = Math.max(50, Math.round(baseAmount * (1 - coupon.percent_off / 100)));
            } else if (coupon.amount_off) {
              discountedAmount = Math.max(50, baseAmount - coupon.amount_off);
            }
            console.info(`[create-payment-intent] One-time Stripe coupon applied: ${couponCode} → $${discountedAmount / 100} (was $${baseAmount / 100})`);
          }
        } catch {
          console.warn(`[create-payment-intent] Could not retrieve coupon ${couponId} — no discount applied`);
        }
      } else {
        // Stripe doesn't know this code — fall back to our own coupons DB table.
        // validate-coupon uses the same table, so this keeps the two in sync.
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          if (supabaseUrl && serviceKey) {
            const supabase = createClient(supabaseUrl, serviceKey);
            const { data: dbCoupon } = await supabase
              .from("coupons")
              .select("discount, is_active, expires_at")
              .eq("code", couponCode.toUpperCase())
              .maybeSingle();
            if (
              dbCoupon &&
              dbCoupon.is_active === true &&
              !(dbCoupon.expires_at && new Date(dbCoupon.expires_at) < new Date())
            ) {
              // discount column is stored in dollars (e.g. 20 = $20 off)
              const discountCents = Math.round(Number(dbCoupon.discount) * 100);
              discountedAmount = Math.max(50, baseAmount - discountCents);
              console.info(`[create-payment-intent] DB coupon applied: ${couponCode} → $${discountedAmount / 100} (was $${baseAmount / 100})`);
            } else {
              console.warn(`[create-payment-intent] DB coupon not found or inactive: ${couponCode}`);
            }
          }
        } catch (err: unknown) {
          console.warn(`[create-payment-intent] DB coupon lookup failed for ${couponCode}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // receipt_email intentionally omitted — we send our own branded receipt via Resend
    const oneTimeMetadata = {
      ...(confirmationId ? { confirmation_id: confirmationId } : {}),
      email,
      first_name: firstName,
      last_name: lastName,
      state,
      letter_type: letterType,
      delivery_speed: deliverySpeed,
      pet_count: String(petCount),
      ...(couponCode ? { coupon_code: couponCode } : {}),
    };

    // ── Update existing PaymentIntent if provided; fall back to create ────────
    let piId: string;
    let piClientSecret: string | null;

    if (existingPaymentIntentId) {
      let updatedPi: Stripe.PaymentIntent | null = null;
      try {
        const retrieved = await stripe.paymentIntents.retrieve(existingPaymentIntentId);
        const updatableStatuses = ["requires_payment_method", "requires_confirmation", "requires_action"];
        if (updatableStatuses.includes(retrieved.status)) {
          updatedPi = await stripe.paymentIntents.update(existingPaymentIntentId, {
            amount: discountedAmount,
            metadata: oneTimeMetadata,
          });
        } else {
          console.warn(`[create-payment-intent] PI ${existingPaymentIntentId} status "${retrieved.status}" is not updatable — creating new PI`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[create-payment-intent] Could not update PI ${existingPaymentIntentId}: ${msg} — creating new PI`);
      }

      if (updatedPi) {
        piId = updatedPi.id;
        piClientSecret = updatedPi.client_secret;
      } else {
        const newPi = await stripe.paymentIntents.create({
          amount: discountedAmount,
          currency: "usd",
          payment_method_types: ["card"],
          metadata: oneTimeMetadata,
        });
        piId = newPi.id;
        piClientSecret = newPi.client_secret;
      }
    } else {
      const newPi = await stripe.paymentIntents.create({
        amount: discountedAmount,
        currency: "usd",
        payment_method_types: ["card"],
        metadata: oneTimeMetadata,
      });
      piId = newPi.id;
      piClientSecret = newPi.client_secret;
    }

    if (!piClientSecret) {
      return json({ error: "Could not obtain payment intent client secret" }, 500);
    }

    console.info(`[create-payment-intent] PI ${piId} — $${discountedAmount / 100} (base $${baseAmount / 100}) (${letterType}, ${petCount} pet(s), ${deliverySpeed}) — cid: ${confirmationId || "none"} coupon: ${couponCode || "none"}`);

    return json({
      clientSecret:     piClientSecret,
      amount:           discountedAmount,
      basePriceAmount:  baseAmount,
      paymentIntentId:  piId,
      discountedAmount,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-payment-intent] Error:", message);
    return json({ error: message }, 500);
  }
});
