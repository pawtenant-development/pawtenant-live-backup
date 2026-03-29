import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
//  LIVE RENEWAL PRICE IDs
//  Annual subscription renewal — price_1TF1a9Gwm9wIWlgig0i7gdKz (~$100/yr)
//  All pet tiers share the same renewal price.
// ─────────────────────────────────────────────────────────────
const LIVE_RENEWAL_ANNUAL_PRICE_ID = "price_1TF1a9Gwm9wIWlgig0i7gdKz";

const RENEWAL_PRICES: Record<string, Record<string, string>> = {
  onetime: {
    "1": Deno.env.get("RENEWAL_ONETIME_1PET_PRICE_ID") ?? LIVE_RENEWAL_ANNUAL_PRICE_ID,
    "2": Deno.env.get("RENEWAL_ONETIME_2PET_PRICE_ID") ?? LIVE_RENEWAL_ANNUAL_PRICE_ID,
    "3": Deno.env.get("RENEWAL_ONETIME_3PET_PRICE_ID") ?? LIVE_RENEWAL_ANNUAL_PRICE_ID,
  },
  annual: {
    "1": LIVE_RENEWAL_ANNUAL_PRICE_ID,
    "2": LIVE_RENEWAL_ANNUAL_PRICE_ID,
    "3": LIVE_RENEWAL_ANNUAL_PRICE_ID,
  },
};

const SITE_URL = "https://www.pawtenant.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const {
      email,
      firstName,
      petCount = 1,
      billingCycle = "onetime",
      successUrl,
      cancelUrl,
    } = await req.json();

    if (!email) throw new Error("email is required");

    const tier = Math.min(3, Math.max(1, parseInt(String(petCount), 10) || 1)).toString();
    const cycle = billingCycle === "annual" ? "annual" : "onetime";
    const priceId = RENEWAL_PRICES[cycle][tier];

    const petLabel = tier === "1" ? "1 Pet" : tier === "2" ? "2 Pets" : "3 Pets";
    const cycleLabel = cycle === "annual" ? "Annual Subscription" : "One-Time Renewal";

    const baseMetadata = {
      order_type: "renewal",
      billing_cycle: cycle,
      pet_count: tier,
      customer_name: firstName ?? "",
    };

    let session: Stripe.Checkout.Session;

    if (cycle === "annual") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: email,
        billing_address_collection: "required",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl ?? `${SITE_URL}/assessment/thank-you?type=renewal`,
        cancel_url: cancelUrl ?? `${SITE_URL}/renew-esa-letter`,
        metadata: baseMetadata,
        custom_text: {
          submit: {
            message: `Renewing your ESA letter (${petLabel} — ${cycleLabel}). Your updated letter will be delivered within 24 hours.`,
          },
        },
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        billing_address_collection: "required",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl ?? `${SITE_URL}/assessment/thank-you?type=renewal`,
        cancel_url: cancelUrl ?? `${SITE_URL}/renew-esa-letter`,
        metadata: baseMetadata,
        payment_intent_data: { metadata: baseMetadata },
        custom_text: {
          submit: {
            message: `Renewing your ESA letter (${petLabel} — ${cycleLabel}). Your updated letter will be delivered within 24 hours.`,
          },
        },
      });
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
