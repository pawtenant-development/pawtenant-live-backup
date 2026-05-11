import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Returns the paid-order row for this email if and only if the paid order
 * belongs to a DIFFERENT confirmation_id than the current attempt. Used to
 * hard-block Checkout Session creation for an email that already has a paid
 * order, while still allowing idempotent retries against the same
 * confirmation_id.
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
    console.warn("[create-checkout-session] paid-email check failed:", err);
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

// ─── ESA Stripe price IDs (LIVE) — base + add-on model ────────────────────
const ESA_ONETIME_BASE_PRICE_ID = "price_1TNN3RGwm9wIWlgi5wRMMfkW";
const ESA_ONETIME_ADDON_PRICE_ID = "price_1TNN3yGwm9wIWlgiKd6ZdCUa";
const ESA_ANNUAL_BASE_PRICE_ID = "price_1TNN4QGwm9wIWlgi05I7rDMe";
const ESA_ANNUAL_ADDON_PRICE_ID = "price_1TNN4rGwm9wIWlgie4OcX3rZ";

function buildESALineItems(
  petCount: number,
  planType: string,
): Array<{ price: string; quantity: number }> {
  const n = Math.max(1, Math.min(3, petCount));
  const isSub = planType === "subscription";
  const base = isSub ? ESA_ANNUAL_BASE_PRICE_ID : ESA_ONETIME_BASE_PRICE_ID;
  const addon = isSub ? ESA_ANNUAL_ADDON_PRICE_ID : ESA_ONETIME_ADDON_PRICE_ID;
  const items = [{ price: base, quantity: 1 }];
  if (n > 1) items.push({ price: addon, quantity: n - 1 });
  return items;
}

// ─── PSD ONE-TIME Price IDs ────────────────────────────────────────────────
const PSD_ONETIME_PRICE_IDS: Record<number, { standard: string; priority: string }> = {
  1: { standard: "price_1TFkAQGwm9wIWlgiMokTLkBQ", priority: "price_1TG6ZMGwm9wIWlgibs4wx4ER" },
  2: { standard: "price_1TG6XWGwm9wIWlgiiNBWaSl6", priority: "price_1TG6a0Gwm9wIWlgiX0QMNBqL" },
  3: { standard: "price_1TG6XnGwm9wIWlgips9dkLt3", priority: "price_1TG6aPGwm9wIWlgiWMFQ0mVO" },
};

// ─── PSD ANNUAL SUBSCRIPTION Price IDs ────────────────────────────────────
const PSD_ANNUAL_PRICE_IDS: Record<number, string> = {
  1: "price_1TFkDaGwm9wIWlgisHcWoZfX",
  2: "price_1TG6RrGwm9wIWlgiRSRzWkOb",
  3: "price_1TG6TKGwm9wIWlgiNFZbRloA",
};

function getPSDPriceId(petCount: number, deliverySpeed: string, planType: string): string {
  const tier  = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const level = deliverySpeed === "2-3days" ? "standard" : "priority";
  if (planType === "subscription") return PSD_ANNUAL_PRICE_IDS[tier];
  return PSD_ONETIME_PRICE_IDS[tier][level];
}

/**
 * Resolve a Stripe coupon ID from a coupon code string.
 * 1. Try direct coupon ID lookup.
 * 2. Fall back to promotion code lookup.
 */
async function resolveStripeCouponId(
  stripe: Stripe,
  couponCode: string,
): Promise<string | null> {
  if (!couponCode) return null;

  // 1. Try direct coupon lookup
  try {
    const coupon = await stripe.coupons.retrieve(couponCode);
    if (coupon && coupon.valid) {
      console.info(`[create-checkout-session] Resolved coupon by ID: ${coupon.id}`);
      return coupon.id;
    }
  } catch {
    // Not a direct coupon ID
  }

  // 2. Try promotion code lookup
  try {
    const promoCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });
    if (promoCodes.data.length > 0) {
      const promoCode = promoCodes.data[0];
      const couponId = typeof promoCode.coupon === "string"
        ? promoCode.coupon
        : promoCode.coupon.id;
      console.info(`[create-checkout-session] Resolved coupon via promo code ${couponCode} → coupon ${couponId}`);
      return couponId;
    }
  } catch {
    // Promotion code lookup failed
  }

  console.warn(`[create-checkout-session] Could not resolve Stripe coupon for code: ${couponCode}`);
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

  const letterType     = (body.letterType     as string) ?? "esa";
  const petCount       = Math.max(1, Number(body.petCount   ?? 1));
  const deliverySpeed  = (body.deliverySpeed  as string) ?? "2-3days";
  const email          = (body.email          as string) ?? "";
  const firstName      = (body.firstName      as string) ?? "";
  const lastName       = (body.lastName       as string) ?? "";
  const state          = (body.state          as string) ?? "";
  const confirmationId = (body.confirmationId as string) ?? "";
  const mode           = (body.mode           as string) ?? "klarna";  // "klarna" | "qr" | "card"
  const planType       = (body.planType       as string) ?? "one-time";
  const origin         = (body.origin         as string) ?? "https://www.pawtenant.com";
  // Coupon code from frontend (already validated against Stripe by validate-coupon)
  const couponCode     = (body.couponCode     as string) ?? "";

  if (!email || !confirmationId) {
    return json({ error: "email and confirmationId are required" }, 400);
  }

  // ── Returning-customer bypass ────────────────────────────────────────────
  // See create-payment-intent for rationale. parent_order_id is set only by
  // service-role create-returning-order, so this cannot be triggered from the
  // public /assessment flow.
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
      console.warn("[create-checkout-session] returning-customer lookup failed:", err);
    }
  }

  // ── HARD BLOCK: email already has a PAID order under a different row ─────
  // Mirrors the guard in create-payment-intent. Without this, redirect flows
  // (Klarna / QR card / Link) can still reach a Stripe Checkout Session even
  // when the inline card path is blocked.
  const paidBlocker = isReturningCustomer
    ? null
    : await findPaidOrderBlockingEmail(email, confirmationId);
  if (paidBlocker) {
    console.warn(
      `[create-checkout-session] REFUSED: email ${email} already paid under ${paidBlocker.confirmation_id} (PI ${paidBlocker.payment_intent_id ?? "n/a"})`,
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

  const isESA = letterType !== "psd";
  const esaLineItems = isESA ? buildESALineItems(petCount, planType) : null;
  const psdPriceId = !isESA ? getPSDPriceId(petCount, deliverySpeed, planType) : "";

  // Success/cancel URLs — route to correct thank-you page per letter type
  const thankYouPath = letterType === "psd" ? "/psd-assessment/thank-you" : "/assessment/thank-you";
  const cancelPath   = letterType === "psd" ? "/psd-assessment" : "/assessment";
  const successUrl   = `${origin}${thankYouPath}?session_id={CHECKOUT_SESSION_ID}&plan=${planType}`;
  const cancelUrl    = `${origin}${cancelPath}`;

  const sharedMetadata = {
    confirmation_id: confirmationId,
    email,
    first_name: firstName,
    last_name: lastName,
    state,
    letter_type: letterType,
    delivery_speed: deliverySpeed,
    pet_count: String(petCount),
    payment_mode: mode,
    plan_type: planType,
    ...(couponCode ? { coupon_code: couponCode } : {}),
  };

  try {
    // ── SUBSCRIPTION CHECKOUT ──────────────────────────────────────────────
    if (planType === "subscription") {
      // Resolve coupon to Stripe coupon ID if provided
      let stripeCouponId: string | null = null;
      if (couponCode) {
        stripeCouponId = await resolveStripeCouponId(stripe, couponCode);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionParams: any = {
        mode: "subscription",
        line_items: isESA ? esaLineItems! : [{ price: psdPriceId, quantity: 1 }],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        payment_method_types: ["card"],
        subscription_data: { metadata: sharedMetadata },
        metadata: sharedMetadata,
        // Stripe receipt emails are controlled via the dashboard "Email customers"
        // setting. Do NOT pass `receipt_email: null` here — the Stripe Node SDK
        // serializes null to an empty form field which Stripe rejects with
        // "Invalid email address: ".
      };

      // Apply coupon discount if resolved
      if (stripeCouponId) {
        sessionParams.discounts = [{ coupon: stripeCouponId }];
        console.info(`[create-checkout-session] Applying coupon ${stripeCouponId} (code: ${couponCode}) to subscription session`);
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      console.info(`[create-checkout-session] Subscription session ${session.id} for ${confirmationId} (${letterType}), coupon=${couponCode || "none"}`);
      return json({ url: session.url, sessionId: session.id });
    }

    // ── ONE-TIME CHECKOUT (Klarna / QR) ────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      mode: "payment",
      line_items: isESA ? esaLineItems! : [{ price: psdPriceId, quantity: 1 }],
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      submit_type: "pay",
      metadata: sharedMetadata,
      // Stripe receipt emails are controlled via the dashboard "Email customers"
      // setting. Do NOT pass `receipt_email: null` here — the Stripe Node SDK
      // serializes null to an empty form field which Stripe rejects with
      // "Invalid email address: ".
      payment_intent_data: {
        metadata: sharedMetadata,
      },
    };

    if (mode === "klarna") {
      sessionParams.payment_method_types = ["klarna"];
    } else {
      // QR / mobile: card + Link (Apple Pay / Google Pay)
      sessionParams.payment_method_types = ["card", "link"];
    }

    // Apply coupon to one-time checkout sessions too
    if (couponCode) {
      const stripeCouponId = await resolveStripeCouponId(stripe, couponCode);
      if (stripeCouponId) {
        sessionParams.discounts = [{ coupon: stripeCouponId }];
        console.info(`[create-checkout-session] Applying coupon ${stripeCouponId} (code: ${couponCode}) to one-time session`);
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.info(`[create-checkout-session] ${mode} session ${session.id} for ${confirmationId} (${letterType}), coupon=${couponCode || "none"}`);
    return json({ url: session.url, sessionId: session.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-checkout-session] Stripe error:", message);
    return json({ error: message }, 500);
  }
});
