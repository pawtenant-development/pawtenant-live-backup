import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { confirmationId?: string; stripeChargeId?: string; stripePaymentIntentId?: string };
  try { body = await req.json() as typeof body; } catch { return json({ error: "Invalid JSON" }, 400); }

  const { confirmationId, stripeChargeId, stripePaymentIntentId } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);
  if (!stripeChargeId && !stripePaymentIntentId) return json({ error: "Either stripeChargeId or stripePaymentIntentId is required" }, 400);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  // Look up the order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, payment_intent_id, status, price, first_name, last_name, phone")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (orderErr || !order) return json({ ok: false, error: `Order not found: ${orderErr?.message ?? "no row"}` }, 404);

  if (order.payment_intent_id) {
    return json({ ok: true, alreadySynced: true, message: `Order already has payment_intent_id: ${order.payment_intent_id}` });
  }

  // Resolve payment intent ID and validate payment was actually successful
  let piId = stripePaymentIntentId ?? "";
  let priceInDollars = (order.price as number) ?? 0;
  let receiptUrl = "";

  try {
    if (stripeChargeId && stripeChargeId.startsWith("ch_")) {
      // ── Charge ID path ──
      const charge = await stripe.charges.retrieve(stripeChargeId);

      // Validate charge status
      if (!charge.paid || charge.status !== "succeeded") {
        return json({
          ok: false,
          error: `This charge is not successful. Status: "${charge.status}", paid: ${charge.paid}. Only succeeded charges can be linked to orders.`,
        }, 400);
      }
      // Validate not refunded
      if (charge.refunded) {
        return json({
          ok: false,
          error: `This charge has been fully refunded and cannot be linked to an order.`,
        }, 400);
      }

      piId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent as { id: string })?.id ?? "";
      receiptUrl = charge.receipt_url ?? "";
      if (charge.amount) priceInDollars = Math.round(charge.amount / 100);

    } else if (piId.startsWith("pi_")) {
      // ── Payment Intent path ──
      const pi = await stripe.paymentIntents.retrieve(piId);

      // Validate payment intent status — ONLY accept succeeded
      if (pi.status !== "succeeded") {
        const statusMessages: Record<string, string> = {
          canceled: "This payment intent was cancelled. No payment was collected.",
          requires_payment_method: "This payment intent requires a payment method — the customer never completed payment.",
          requires_confirmation: "This payment intent was never confirmed by the customer.",
          requires_action: "This payment intent requires additional customer action (e.g. 3D Secure) and was not completed.",
          processing: "This payment intent is still processing. Wait for Stripe to confirm it before linking.",
          requires_capture: "This payment intent was authorized but not captured.",
        };
        const detail = statusMessages[pi.status] ?? `Unexpected status: "${pi.status}".`;
        return json({
          ok: false,
          error: `Cannot link this payment intent — it has not succeeded. ${detail}`,
        }, 400);
      }

      // Resolve receipt URL from latest charge
      if (pi.latest_charge) {
        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as { id: string }).id;
        const charge = await stripe.charges.retrieve(chargeId);
        receiptUrl = charge.receipt_url ?? "";

        // Double-check the underlying charge is not refunded
        if (charge.refunded) {
          return json({
            ok: false,
            error: `This payment was collected but has been fully refunded. It cannot be linked to an order.`,
          }, 400);
        }
      }
      if (pi.amount) priceInDollars = Math.round(pi.amount / 100);

    } else {
      return json({ ok: false, error: "Invalid charge/payment intent ID format. Must start with ch_ or pi_" }, 400);
    }
  } catch (err: unknown) {
    // Handle Stripe "No such payment_intent / charge" errors gracefully
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("No such")) {
      return json({ ok: false, error: `Stripe could not find this ID. Double-check the charge or payment intent ID and try again.` }, 400);
    }
    return json({ ok: false, error: `Stripe lookup failed: ${errMsg}` }, 500);
  }

  if (!piId) return json({ ok: false, error: "Could not resolve payment_intent_id from the provided charge ID" }, 400);

  const { error: updateErr } = await supabase.from("orders").update({
    payment_intent_id: piId,
    price: priceInDollars || (order.price as number),
    status: (order.status === "lead" || !order.status) ? "processing" : (order.status as string),
  }).eq("id", order.id as string);

  if (updateErr) return json({ ok: false, error: `DB update failed: ${updateErr.message}` }, 500);

  return json({
    ok: true,
    message: `Order ${confirmationId} synced successfully`,
    paymentIntentId: piId,
    priceUpdated: priceInDollars,
    receiptUrl,
  });
});
