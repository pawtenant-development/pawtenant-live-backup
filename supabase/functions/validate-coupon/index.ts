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

// Resolve a Stripe coupon by code. First treats the code as a Stripe coupon ID,
// then falls back to looking it up as an active promotion code. Returns the
// underlying Stripe.Coupon object or null.
async function resolveStripeCoupon(
  stripe: Stripe,
  code: string,
): Promise<Stripe.Coupon | null> {
  try {
    const coupon = await stripe.coupons.retrieve(code);
    if (coupon) return coupon;
  } catch {
    // Not a direct coupon ID — fall through to promotion code lookup.
  }

  try {
    const promoCodes = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });
    if (promoCodes.data.length > 0) {
      const promo = promoCodes.data[0];
      if (typeof promo.coupon === "string") {
        return await stripe.coupons.retrieve(promo.coupon);
      }
      return promo.coupon;
    }
  } catch {
    // Promotion code lookup failed
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ valid: false, error: "Method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return json({ valid: false, error: "Coupon service not configured" }, 500);
  }

  // @ts-ignore
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return json({ valid: false, error: "Bad request" }, 400);
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) {
    return json({ valid: false, error: "No code provided" }, 400);
  }

  const coupon = await resolveStripeCoupon(stripe, code);

  if (!coupon) {
    return json({ valid: false, error: "Invalid coupon code." });
  }

  if (coupon.valid === false) {
    return json({ valid: false, error: "This coupon is no longer valid." });
  }

  if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) {
    return json({ valid: false, error: "This coupon has expired." });
  }

  // Fixed-amount coupons only. Percent-off coupons are intentionally not
  // supported yet — they'll be added in a follow-up once the rest of checkout
  // is stable.
  if (coupon.amount_off == null) {
    return json({ valid: false, error: "This coupon code isn't supported." });
  }

  if (coupon.currency && coupon.currency.toLowerCase() !== "usd") {
    return json({ valid: false, error: "This coupon code isn't supported." });
  }

  const discountDollars = coupon.amount_off / 100;

  return json({ valid: true, discount: discountDollars, code });
});
