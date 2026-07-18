// RETIRED — CHECKOUT-PRICING-TEST-CLOSEOUT-005 · Phase D
//
// This function previously represented a retired $70/yr upsell offer. It had ZERO
// callers and has been fully RETIRED. Upgrades from a one-time order to an annual
// subscription are handled by the authenticated account portal (create-returning-order
// → /account/checkout → phased assessment checkout), which is order-scoped,
// ownership-verified and server-priced.
//
// This endpoint is intentionally INERT. It NEVER:
//   • imports Stripe, creates a Checkout Session, subscription, or any Stripe object
//   • references any Stripe Price ID (LIVE or TEST)
//   • reads the request body or trusts any client amount / tier / pet count / email
//   • reads or writes Supabase, looks up a customer, or sends email / SMS
//
// It always responds HTTP 410 Gone — even with a valid JWT. verify_jwt stays true.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETIRED_MESSAGE =
  "This checkout flow has been retired. Please manage renewal or upgrade through your PawTenant account portal.";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "gone", retired: true, message: RETIRED_MESSAGE }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 410 },
  );
});
