import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

  // @ts-ignore
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const confirmationId  = (body.confirmationId  as string) ?? "";
  const paymentIntentId = (body.paymentIntentId as string) ?? "";

  if (!confirmationId || !paymentIntentId) {
    return json({ error: "confirmationId and paymentIntentId are required" }, 400);
  }

  try {
    // 1. Fetch the PI from Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });

    if (pi.status !== "succeeded") {
      return json({ ok: false, error: `Payment intent status is "${pi.status}" — only succeeded payments can be re-processed` }, 400);
    }

    // 2. Try to find the checkout session
    let checkoutSessionId: string | null = null;

    if (pi.metadata?.checkout_session_id) {
      checkoutSessionId = pi.metadata.checkout_session_id;
    } else {
      try {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
        if (sessions.data.length > 0) {
          checkoutSessionId = sessions.data[0].id;
        }
      } catch (err) {
        console.warn("[resend-webhook] Could not search checkout sessions:", err);
      }
    }

    // 3. Get the order from DB
    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, status, payment_intent_id, checkout_session_id, email, first_name, last_name, price, payment_method, email_log, paid_at")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (!order) {
      return json({ ok: false, error: `Order ${confirmationId} not found in database` }, 404);
    }

    // 4. Build the update payload
    const updatePayload: Record<string, unknown> = {
      payment_intent_id: paymentIntentId,
      status: "processing",
    };

    if (checkoutSessionId && !order.checkout_session_id) {
      updatePayload.checkout_session_id = checkoutSessionId;
    }

    if (!order.paid_at) {
      updatePayload.paid_at = new Date(pi.created * 1000).toISOString();
    }

    if (!order.payment_method) {
      const pmType = pi.payment_method_types?.[0] ?? "card";
      updatePayload.payment_method = pmType;
    }

    if (!order.price && pi.amount_received) {
      updatePayload.price = Math.round(pi.amount_received / 100);
    }

    // 5. Write to DB
    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("confirmation_id", confirmationId);

    if (updateError) {
      return json({ ok: false, error: `DB update failed: ${updateError.message}` }, 500);
    }

    // 6. Patch PI metadata in Stripe if needed
    if (checkoutSessionId && !pi.metadata?.checkout_session_id) {
      try {
        await stripe.paymentIntents.update(paymentIntentId, {
          metadata: { ...pi.metadata, checkout_session_id: checkoutSessionId },
        });
      } catch (err) {
        console.warn("[resend-webhook] Could not patch PI metadata:", err);
      }
    }

    // 7. Write status log (correct schema: new_status, changed_by, changed_at)
    try {
      await supabase.from("order_status_logs").insert({
        order_id: order.id,
        confirmation_id: confirmationId,
        new_status: "processing",
        changed_by: "admin_resend_webhook",
        changed_at: new Date().toISOString(),
      });
    } catch { /* non-critical */ }

    // 8. Write audit log (correct schema: object_type, object_id)
    try {
      await supabase.from("audit_logs").insert({
        action: "admin_resend_webhook",
        object_type: "order",
        object_id: confirmationId,
        details: {
          confirmation_id: confirmationId,
          payment_intent_id: paymentIntentId,
          checkout_session_id: checkoutSessionId ?? null,
          fields_updated: Object.keys(updatePayload),
          timestamp: new Date().toISOString(),
        },
      });
    } catch { /* non-critical */ }

    console.info(`[resend-webhook] ✓ Re-processed ${confirmationId} — PI: ${paymentIntentId}${checkoutSessionId ? ` | Session: ${checkoutSessionId}` : ""}`);

    return json({
      ok: true,
      message: `Payment re-processed successfully.${checkoutSessionId ? ` checkout_session_id ${checkoutSessionId} backfilled.` : " No checkout session found for this payment intent."}`,
      checkoutSessionId: checkoutSessionId ?? null,
      fieldsUpdated: Object.keys(updatePayload),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[resend-webhook] Error:", message);
    return json({ ok: false, error: message }, 500);
  }
});
