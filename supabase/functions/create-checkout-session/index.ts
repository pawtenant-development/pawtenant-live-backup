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

// ─── ESA ONE-TIME Price IDs ────────────────────────────────────────────────
const ESA_ONETIME_PRICE_IDS: Record<number, { standard: string; priority: string }> = {
  1: { standard: "price_1TF1aRGwm9wIWlgiUh5D4hlk", priority: "price_1TF1aRGwm9wIWlgidsNUQWOh" },
  2: { standard: "price_1TF1aRGwm9wIWlgi75IgoDD2", priority: "price_1TF1aRGwm9wIWlgiYbOUIUUJ" },
  3: { standard: "price_1TF1aRGwm9wIWlgiKV1lvAxg", priority: "price_1TF1aRGwm9wIWlgi7VecucGQ" },
};

// ─── ESA ANNUAL SUBSCRIPTION Price IDs ────────────────────────────────────
const ESA_ANNUAL_PRICE_IDS: Record<number, { standard: string; priority: string }> = {
  1: { standard: "price_1THP45Gwm9wIWlgi1XDsvnTx", priority: "price_1TF1a9Gwm9wIWlgig0i7gdKz" },
  2: { standard: "price_1THP5NGwm9wIWlgipmibdZro", priority: "price_1THP7RGwm9wIWlgiyd3wR6LM" },
  3: { standard: "price_1THP6nGwm9wIWlgirhtFjBHe", priority: "price_1THP76Gwm9wIWlgiVw9ZI1Oj" },
};

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

function getPriceId(
  letterType: string,
  petCount: number,
  deliverySpeed: string,
  planType: string,
): string {
  const tier  = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const level = deliverySpeed === "2-3days" ? "standard" : "priority";

  if (letterType === "psd") {
    if (planType === "subscription") return PSD_ANNUAL_PRICE_IDS[tier];
    return PSD_ONETIME_PRICE_IDS[tier][level];
  }

  // default: ESA
  if (planType === "subscription") return ESA_ANNUAL_PRICE_IDS[tier][level];
  return ESA_ONETIME_PRICE_IDS[tier][level];
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

  if (!email || !confirmationId) {
    return json({ error: "email and confirmationId are required" }, 400);
  }

  const priceId = getPriceId(letterType, petCount, deliverySpeed, planType);

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
  };

  try {
    // ── SUBSCRIPTION CHECKOUT ──────────────────────────────────────────────
    if (planType === "subscription") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        payment_method_types: ["card"],
        subscription_data: { metadata: sharedMetadata },
        metadata: sharedMetadata,
        // Suppress Stripe's automatic receipt email — we send our own branded receipt
        payment_intent_data: {
          receipt_email: null,
        },
      });
      console.info(`[create-checkout-session] Subscription session ${session.id} for ${confirmationId} (${letterType})`);
      return json({ url: session.url, sessionId: session.id });
    }

    // ── ONE-TIME CHECKOUT (Klarna / QR) ────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      submit_type: "pay",
      metadata: sharedMetadata,
      // Suppress Stripe's automatic receipt email — we send our own branded receipt
      payment_intent_data: {
        receipt_email: null,
        metadata: sharedMetadata,
      },
    };

    if (mode === "klarna") {
      sessionParams.payment_method_types = ["klarna"];
    } else {
      // QR / mobile: card + Link (Apple Pay / Google Pay)
      sessionParams.payment_method_types = ["card", "link"];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.info(`[create-checkout-session] ${mode} session ${session.id} for ${confirmationId} (${letterType})`);
    return json({ url: session.url, sessionId: session.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[create-checkout-session] Stripe error:", message);
    return json({ error: message }, 500);
  }
});
