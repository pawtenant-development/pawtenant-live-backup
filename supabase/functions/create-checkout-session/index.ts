import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packageEntitlementPatch } from "../_shared/packageEntitlement.ts";

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

// ─── ESA Stripe price IDs (TEST) — SUBSCRIPTIONS ONLY ──────────────────────
// Subscriptions require pre-created recurring Price objects (Stripe rule).
// Tier model, owner-provided 2026-07: 1 pet → $109/yr; 2 or 3 pets → $129/yr
// fixed total. Keep in sync with create-payment-intent/index.ts.
const ESA_ANNUAL_BASE_PRICE_ID = "price_1TpOHNGwm9wIWlgiizgabvkc";   // $109/yr, 1 pet
const ESA_ANNUAL_MULTI_PRICE_ID = "price_1TpOLeGwm9wIWlgiLMeunzub";  // $129/yr, 2-3 pets

function buildESASubscriptionLineItems(
  petCount: number,
): Array<{ price: string; quantity: number }> {
  const n = Math.max(1, Math.min(3, petCount));
  return [{ price: n === 1 ? ESA_ANNUAL_BASE_PRICE_ID : ESA_ANNUAL_MULTI_PRICE_ID, quantity: 1 }];
}

// ─── ESA ONE-TIME inline amount (cents) ────────────────────────────────────
// 2026-07 PRICING-SINGLE-SOURCE: one-time Klarna/QR sessions use inline
// `price_data` computed server-side (no Stripe one-time Price IDs). Mirrors
// getESAOneTimeAmount in create-payment-intent so card, Klarna and QR always
// charge identical totals. 1 pet = $129; 2 or 3 pets = $149 fixed total.
function getESAOneTimeAmountCents(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 129 : 149) * 100;
}

function buildESAOneTimeInlineLineItem(petCount: number) {
  const n = Math.max(1, Math.min(3, petCount));
  const petsLabel = n === 1 ? "1 Pet" : `${n} Pets`;
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: `ESA Letter — ${petsLabel} (One-Time)`,
        description: `Emotional Support Animal letter evaluation covering ${petsLabel.toLowerCase()}. Reviewed by a licensed provider; issued only if clinically appropriate.`,
      },
      unit_amount: getESAOneTimeAmountCents(petCount),
    },
    quantity: 1,
  };
}

// ─── PSD ANNUAL SUBSCRIPTION Price IDs ────────────────────────────────────
// (One-time PSD Price IDs removed 2026-07 — one-time sessions use inline
// price_data; see buildPSDOneTimeKlarnaLineItem.)
// Tier model, owner-provided 2026-07: 1 dog → $109/yr; 2 or 3 dogs → $129/yr
// fixed total. Keep in sync with create-payment-intent/index.ts.
const PSD_ANNUAL_PRICE_IDS: Record<number, string> = {
  1: "price_1TpOPOGwm9wIWlgijMnt7NBJ",  // $109/yr, 1 dog
  2: "price_1TpORnGwm9wIWlgi9KiPhJpg",  // $129/yr, 2-3 dogs
  3: "price_1TpORnGwm9wIWlgi9KiPhJpg",  // $129/yr, 2-3 dogs
};

function getPSDPriceId(petCount: number, _deliverySpeed: string, _planType: string): string {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  return PSD_ANNUAL_PRICE_IDS[tier];
}

// ─── PSD ONE-TIME inline amount (cents) — same table as create-payment-intent ──
// Inline `price_data` lets Stripe create the product on-the-fly and matches
// the inline-card amount exactly (no dashboard price drift).
// 2026-07 FINAL: 1 dog = $129; 2 or 3 dogs = $149 fixed total (both delivery
// speeds). Mirrors getPSDOneTimeAmount in create-payment-intent/index.ts.
function getPSDOneTimeAmountCents(petCount: number, _deliverySpeed: string): number {
  const n = Math.max(1, Math.min(3, petCount));
  return (n === 1 ? 129 : 149) * 100;
}

function buildPSDOneTimeKlarnaLineItem(petCount: number, deliverySpeed: string) {
  const tier = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isPriority = deliverySpeed !== "2-3days";
  const speedLabel = isPriority ? "Priority (24-hour)" : "Standard (2-3 day)";
  const dogsLabel = tier === 1 ? "1 Dog" : `${tier} Dogs`;
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: `PSD Letter — ${dogsLabel}, ${speedLabel}`,
        description: `Psychiatric Service Dog letter for ${dogsLabel.toLowerCase()} — ${speedLabel} delivery. ADA-compliant.`,
      },
      unit_amount: getPSDOneTimeAmountCents(petCount, deliverySpeed),
    },
    quantity: 1,
  };
}

// ─── RA bundle packages (PACKAGE-RA-LETTER-BUNDLE-001) ────────────────────────
// ESA/PSD + Reasonable Accommodation Letter. FLAT $179 one-time / $159 annual for
// 1–3 pets/dogs. One-time = inline price_data; annual = inline recurring price_data
// (no pre-created Stripe Price). Mirrors create-payment-intent + src/config/pricing.ts.
const BUNDLE_ONE_TIME_AMOUNT_CENTS = 17900;
const BUNDLE_ANNUAL_AMOUNT_CENTS = 15900;

const PACKAGE_DISPLAY_NAMES: Record<string, string> = {
  esa_standard: "ESA Letter",
  esa_ra_bundle: "ESA + Reasonable Accommodation Letter",
  psd_standard: "PSD Documentation",
  psd_ra_bundle: "PSD + Reasonable Accommodation Letter",
};
const ALLOWED_PACKAGE_KEYS = ["esa_standard", "esa_ra_bundle", "psd_standard", "psd_ra_bundle"];
function resolvePackageKey(rawPackageKey: string, letterType: string): string {
  if (ALLOWED_PACKAGE_KEYS.includes(rawPackageKey)) return rawPackageKey;
  return letterType === "psd" ? "psd_standard" : "esa_standard";
}
function isRaBundleKey(packageKey: string): boolean {
  return packageKey === "esa_ra_bundle" || packageKey === "psd_ra_bundle";
}
function buildBundleOneTimeInlineLineItem(packageKey: string) {
  const name = PACKAGE_DISPLAY_NAMES[packageKey] ?? "PawTenant RA Bundle";
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: `${name} (One-Time)`,
        description: "Provider-reviewed documentation plus Reasonable Accommodation letter request support. Landlord-ready package; issued only if clinically appropriate.",
      },
      unit_amount: BUNDLE_ONE_TIME_AMOUNT_CENTS,
    },
    quantity: 1,
  };
}
function buildBundleSubscriptionLineItem(packageKey: string) {
  const name = PACKAGE_DISPLAY_NAMES[packageKey] ?? "PawTenant RA Bundle";
  return {
    price_data: {
      currency: "usd",
      product_data: { name: `${name} (Annual)` },
      recurring: { interval: "year" as const },
      unit_amount: BUNDLE_ANNUAL_AMOUNT_CENTS,
    },
    quantity: 1,
  };
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

// ─── LEGACY-RESUME PRICE LOCK (2026-07) ───────────────────────────────────────
// Mirrors create-payment-intent: resumed unpaid orders keep their ORIGINAL saved
// quote (orders.price) instead of the recalculated current amount, so the Klarna
// / QR (Checkout Session) path can never silently reprice an old lead. The SERVER
// is authoritative — the saved price comes from the DB, not the client.
// LIVE MUST set PRICING_V2_LAUNCH_AT env var at deploy time (default = TEST-safe).
const PRICING_V2_LAUNCH_AT = new Date(
  Deno.env.get("PRICING_V2_LAUNCH_AT") ?? "2026-07-03T00:00:00Z",
);

async function resolveLegacyQuoteLock(
  confirmationId: string,
  configBaseCents: number,
): Promise<{ baseCents: number; pricingSource: string }> {
  const out = { baseCents: configBaseCents, pricingSource: "current_pricing" };
  if (!confirmationId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return out;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from("orders")
      .select("price, created_at, paid_at, payment_intent_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();
    if (!data) return out;
    if (data.payment_intent_id || data.paid_at) return out; // never reprice paid
    const savedPrice = typeof data.price === "number" ? data.price : null;
    const isLegacy = data.created_at
      ? new Date(data.created_at as string).getTime() < PRICING_V2_LAUNCH_AT.getTime()
      : false;
    if (savedPrice != null && savedPrice > 0) {
      const savedCents = Math.round(savedPrice * 100);
      out.baseCents = savedCents;
      out.pricingSource = savedCents !== configBaseCents ? "legacy_saved_quote" : "current_pricing";
      return out;
    }
    out.pricingSource = isLegacy ? "legacy_fallback" : "current_pricing";
    return out;
  } catch (err) {
    console.warn("[create-checkout-session] legacy quote lock failed — using current pricing:", err instanceof Error ? err.message : String(err));
    return out;
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

  // ── RA bundle package (PACKAGE-RA-LETTER-BUNDLE-001) ──────────────────────
  const packageKey = resolvePackageKey((body.packageKey as string) ?? "", letterType);
  const isBundle = isRaBundleKey(packageKey);

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
  // Subscription sessions keep Stripe Price IDs (required for recurring
  // billing). One-time sessions use inline price_data computed server-side —
  // see buildESAOneTimeInlineLineItem / buildPSDOneTimeKlarnaLineItem.
  const psdAnnualPriceId = !isESA && planType === "subscription"
    ? getPSDPriceId(petCount, deliverySpeed, planType)
    : "";

  // Success/cancel URLs — route to correct thank-you page per letter type
  //
  // ── 2026-05-20 CHECKOUT-SESSION-ORDER-ID-IN-SUCCESS-URL ────────────────
  // Klarna / Amazon Pay open the Stripe Checkout Session in a NEW tab via
  // `window.open(...)`. sessionStorage is per-tab — the new tab does NOT
  // inherit `esa_pending_order` from the originating tab. After payment
  // Stripe redirects the new tab to this success URL; without the
  // confirmation_id in the URL, the thank-you page falls back to a
  // fabricated `PT-${Date.now()}` phantom ID (which exists nowhere in the
  // database) instead of the real canonical confirmation_id.
  //
  // Adding `order_id={confirmationId}` in the URL gives the thank-you
  // page an authoritative source. Same param name the inline-card path
  // already uses for Google Ads transaction_id, so no separate plumbing.
  const thankYouPath = letterType === "psd" ? "/psd-assessment/thank-you" : "/assessment/thank-you";
  const cancelPath   = letterType === "psd" ? "/psd-assessment" : "/assessment";
  const successUrl   = `${origin}${thankYouPath}?session_id={CHECKOUT_SESSION_ID}&plan=${planType}&order_id=${encodeURIComponent(confirmationId)}`;
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
    // Overwritten for one-time sessions once the legacy quote lock resolves
    // below. Subscriptions keep "current_pricing" (recurring Price IDs are not
    // resume-locked).
    pricing_source: "current_pricing",
    ...(couponCode ? { coupon_code: couponCode } : {}),
    ...((letterType === "esa" || letterType === "psd")
      ? {
          package_key: packageKey,
          package_display_name: PACKAGE_DISPLAY_NAMES[packageKey] ?? "",
          billing_plan: planType === "subscription" ? "annual" : "one_time",
          includes_ra_letter: isBundle ? "true" : "false",
        }
      : {}),
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
        line_items: isBundle
          ? [buildBundleSubscriptionLineItem(packageKey)]
          : isESA
            ? buildESASubscriptionLineItems(petCount)
            : [{ price: psdAnnualPriceId, quantity: 1 }],
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

      // KLARNA-RECONCILIATION-SELF-HEAL: same writeback as the one-time
      // path. Subscriptions don't accept Klarna at Stripe but the
      // checkout_session_id is still useful for any reconciler that
      // looks orders up by Stripe session.
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && session.id) {
        try {
          const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          const upd: Record<string, unknown> = { checkout_session_id: session.id };
          // Stamp authoritative package entitlement now (annual) — webhook-independent.
          if (letterType === "esa" || letterType === "psd") {
            Object.assign(upd, packageEntitlementPatch(packageKey, "annual"));
          }
          await sb.from("orders").update(upd).eq("confirmation_id", confirmationId).is("paid_at", null);
        } catch (writebackErr) {
          console.warn("[create-checkout-session] subscription checkout_session_id writeback failed:", writebackErr);
        }
      }

      return json({ url: session.url, sessionId: session.id });
    }

    // ── ONE-TIME CHECKOUT (Klarna / QR) ────────────────────────────────────
    //
    // ── 2026-05-20 PSD-KLARNA-INLINE-PRICE-DATA ────────────────────────────
    // For PSD one-time Klarna we use inline `price_data` instead of the
    // pre-created Stripe Price IDs in PSD_ONETIME_PRICE_IDS. The hardcoded
    // PSD price objects were rejecting Stripe Checkout Session creation
    // when payment_method_types=["klarna"] — most likely the per-product
    // Klarna activation in the Stripe dashboard is missing on those Price
    // objects, or one of the IDs no longer exists in this Stripe mode.
    // Inline price_data lets Stripe create the product on the fly using
    // the merchant's account-level Klarna activation (same activation
    // ESA Klarna already uses successfully). Amount mirrors
    // getPSDOneTimeAmount in create-payment-intent so card and Klarna
    // charge identical totals before coupons.
    //
    // QR / mobile paths and PSD subscription paths are unchanged.
    // 2026-07 PRICING-SINGLE-SOURCE: ALL one-time sessions (ESA + PSD, Klarna
    // + QR) now use inline price_data computed server-side, so Klarna/QR
    // totals always equal the inline-card PaymentIntent amounts. The retired
    // one-time Price IDs ($110+$25 ESA catalog, $100-$155 PSD tiers) are no
    // longer referenced.
    const oneTimeLineItems = (() => {
      if (isBundle) return [buildBundleOneTimeInlineLineItem(packageKey)];
      if (isESA) return [buildESAOneTimeInlineLineItem(petCount)];
      return [buildPSDOneTimeKlarnaLineItem(petCount, deliverySpeed)];
    })();

    // ── LEGACY-RESUME PRICE LOCK ──────────────────────────────────────────────
    // Override the inline unit_amount with the saved quote for resumed unpaid
    // orders so Klarna / QR charges the ORIGINAL price, never the recalculated
    // current amount. Coupons still apply on top (sessionParams.discounts below).
    const configBaseCents = oneTimeLineItems[0].price_data.unit_amount;
    // RA bundles are flat-priced with no legacy quote to preserve (prevents a
    // standard saved lead price from suppressing the $179 bundle upcharge).
    const quoteLock = isBundle
      ? { baseCents: configBaseCents, pricingSource: "bundle_flat" }
      : await resolveLegacyQuoteLock(confirmationId, configBaseCents);
    if (quoteLock.baseCents !== configBaseCents) {
      oneTimeLineItems[0].price_data.unit_amount = quoteLock.baseCents;
      console.info(`[create-checkout-session] legacy price lock: ${confirmationId} $${configBaseCents / 100} → $${quoteLock.baseCents / 100} (${quoteLock.pricingSource})`);
    }
    sharedMetadata.pricing_source = quoteLock.pricingSource;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      mode: "payment",
      line_items: oneTimeLineItems,
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

    // ── 2026-05-20 KLARNA-RECONCILIATION-SELF-HEAL ─────────────────────────
    // Persist the Stripe Checkout Session ID onto the orders row right now
    // so the `check-payment-status` reconciliation endpoint can find it
    // without waiting for the webhook. If the webhook never fires (Stripe
    // event subscription missing / TEST mode quirks), check-payment-status
    // can still query Stripe by this session_id and mark the order paid.
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && session.id) {
      try {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const patch: Record<string, unknown> = {
          checkout_session_id: session.id,
          pricing_source: quoteLock.pricingSource,
        };
        if (quoteLock.pricingSource === "legacy_saved_quote") patch.quote_locked_at = new Date().toISOString();
        // Stamp authoritative package entitlement now (one-time) — webhook-independent.
        // At checkout-session creation the order is always unpaid, so the paid_at
        // guard only skips the nonsensical already-paid case (correct to skip).
        if (letterType === "esa" || letterType === "psd") {
          Object.assign(patch, packageEntitlementPatch(packageKey, "one_time"));
        }
        await sb
          .from("orders")
          .update(patch)
          .eq("confirmation_id", confirmationId)
          .is("paid_at", null);
      } catch (writebackErr) {
        // Non-fatal — webhook reconciliation will still work. Log and continue.
        console.warn("[create-checkout-session] checkout_session_id writeback failed:", writebackErr);
      }
    }

    return json({ url: session.url, sessionId: session.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-checkout-session] Stripe error:", message);
    return json({ error: message }, 500);
  }
});
