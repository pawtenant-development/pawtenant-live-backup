import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── LIVE Price ID Map ──────────────────────────────────────────────────────
const ONE_TIME_PRICE_IDS: Record<string, Record<string, string>> = {
  "1": {
    standard: "price_1TF1aRGwm9wIWlgiUh5D4hlk",  // $100 – 1 Pet Standard
    priority: "price_1TF1aRGwm9wIWlgidsNUQWOh",  // $115 – 1 Pet Priority
  },
  "2": {
    standard: "price_1TF1aRGwm9wIWlgi75IgoDD2",  // $115 – 2 Pets Standard
    priority: "price_1TF1aRGwm9wIWlgiYbOUIUUJ",  // $130 – 2 Pets Priority
  },
  "3+": {
    standard: "price_1TF1aRGwm9wIWlgiKV1lvAxg",  // $135 – 3+ Pets Standard
    priority: "price_1TF1aRGwm9wIWlgi7VecucGQ",  // $150 – 3+ Pets Priority
  },
};

// ESA Letter Renewal (annual subscription)
const RENEWAL_PRICE_ID = "price_1TF1a9Gwm9wIWlgig0i7gdKz";
// Additional Document Fee (+$30 per doc)
const ADDITIONAL_DOC_PRICE_ID = "price_1TF1a6Gwm9wIWlgiJ8DKlLy3";

function getPetTier(count: number): string {
  if (count >= 3) return "3+";
  return String(Math.max(1, count));
}

function selectPriceId(plan: string, petCount: number, deliverySpeed: string): string {
  if (plan === "subscription") return RENEWAL_PRICE_ID;
  const tier = getPetTier(petCount);
  const speed = deliverySpeed === "2-3days" ? "standard" : "priority";
  return ONE_TIME_PRICE_IDS[tier]?.[speed] ?? ONE_TIME_PRICE_IDS["1"]["priority"];
}

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
      plan,
      petCount = 1,
      deliverySpeed = "priority",
      email,
      customerName,
      successUrl,
      cancelUrl,
      metadata,
      additionalDocCount = 0,
      paymentMethods,
    } = await req.json();

    const parsedPetCount = Math.max(1, parseInt(String(petCount), 10) || 1);
    const parsedAdditionalDocCount = Math.max(0, parseInt(String(additionalDocCount), 10) || 0);
    const priceId = selectPriceId(plan ?? "one-time", parsedPetCount, deliverySpeed);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ];

    if (parsedAdditionalDocCount > 0) {
      lineItems.push({
        price: ADDITIONAL_DOC_PRICE_ID,
        quantity: parsedAdditionalDocCount,
      });
    }

    const sanitizedMetadata: Record<string, string> = {};
    if (metadata && typeof metadata === "object") {
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== null && value !== undefined) {
          sanitizedMetadata[key] = String(value).slice(0, 500);
        }
      }
    }

    const allowedPaymentTypes: string[] =
      plan === "subscription"
        ? ["card"]
        : (Array.isArray(paymentMethods) && paymentMethods.length > 0)
          ? paymentMethods
          : ["card"];

    let session: Stripe.Checkout.Session;

    if (plan === "subscription") {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: email,
        billing_address_collection: "required",
        line_items: lineItems,
        success_url: successUrl ?? `${req.headers.get("origin") ?? ""}/assessment/thank-you`,
        cancel_url: cancelUrl ?? `${req.headers.get("origin") ?? ""}/assessment`,
        metadata: sanitizedMetadata,
        subscription_data: {
          metadata: sanitizedMetadata,
        },
        custom_text: {
          submit: {
            message: "Your ESA letter will be emailed within your selected delivery window after payment.",
          },
        },
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: allowedPaymentTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
        customer_email: email,
        billing_address_collection: "required",
        line_items: lineItems,
        success_url: successUrl ?? `${req.headers.get("origin") ?? ""}/assessment/thank-you`,
        cancel_url: cancelUrl ?? `${req.headers.get("origin") ?? ""}/assessment`,
        metadata: sanitizedMetadata,
        payment_intent_data: {
          metadata: sanitizedMetadata,
        },
        custom_text: {
          submit: {
            message: "Your ESA letter will be emailed within your selected delivery window after payment.",
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
