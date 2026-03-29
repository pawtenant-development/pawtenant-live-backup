import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LIVE — $70/yr annual renewal offer shown on the thank-you page
const UPGRADE_PRICE_ID = "price_1TF1a1Gwm9wIWlgibLVDiOBL";

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
      email = "",
      firstName = "",
      lastName = "",
      successUrl,
      cancelUrl,
    } = await req.json();

    const origin = req.headers.get("origin") ?? "https://pawtenant.com";

    // Retrieve price to determine if it's recurring or one-time
    const price = await stripe.prices.retrieve(UPGRADE_PRICE_ID);
    const mode: Stripe.Checkout.SessionCreateParams.Mode =
      price.type === "recurring" ? "subscription" : "payment";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      customer_email: email || undefined,
      billing_address_collection: "required",
      line_items: [{ price: UPGRADE_PRICE_ID, quantity: 1 }],
      success_url: successUrl ?? `${origin}/assessment/thank-you?upgraded=true`,
      cancel_url: cancelUrl ?? `${origin}/assessment/thank-you`,
      metadata: {
        firstName,
        lastName,
        email,
        orderType: "upgrade_annual_renewal",
      },
      custom_text: {
        submit: {
          message: "Your ESA letter renewal will be sent automatically each year. Cancel anytime.",
        },
      },
    };

    if (mode === "payment") {
      (sessionParams as Record<string, unknown>).payment_method_types = ["card", "klarna"];
    } else {
      (sessionParams as Record<string, unknown>).payment_method_types = ["card"];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
