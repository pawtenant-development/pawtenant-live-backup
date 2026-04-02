import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

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

function getESAOneTimeAmount(deliverySpeed: string): number {
  return deliverySpeed === "2-3days" ? 10000 : 11500;
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

const ADDON_AMOUNTS: Record<string, number> = {
  zoom_call: 4000,
  physical_mail: 5000,
  landlord_letter: 3000,
};

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
  const addonServices   = (body.addonServices    as string[]) ?? [];
  const cancelSubId     = (body.cancelSubscriptionId as string) ?? "";
  const paymentMethodId = (body.paymentMethodId  as string)   ?? "";

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

      const subscription = await stripe.subscriptions.create({
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
        },
      });

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

      console.info(`[create-payment-intent] Subscription ${subscription.id} created for ${confirmationId || email}`);

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
      baseAmount = getESAOneTimeAmount(deliverySpeed);
    }

    const addonTotal  = addonServices.reduce((s: number, id: string) => s + (ADDON_AMOUNTS[id] ?? 0), 0);
    const totalAmount = baseAmount + addonTotal;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
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
        addon_services: addonServices.join(","),
      },
    });

    console.info(`[create-payment-intent] PI ${paymentIntent.id} — $${totalAmount / 100} (${letterType}) — cid: ${confirmationId || "none"}`);

    return json({
      clientSecret:    paymentIntent.client_secret,
      amount:          totalAmount,
      basePriceAmount: baseAmount,
      paymentIntentId: paymentIntent.id,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-payment-intent] Error:", message);
    return json({ error: message }, 500);
  }
});
