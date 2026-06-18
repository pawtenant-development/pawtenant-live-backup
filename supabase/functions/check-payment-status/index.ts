// check-payment-status
//
// Self-healing payment-status reconciler. Originally a thin
// stripe.checkout.sessions.retrieve(sessionId) probe; extended (2026-05-20,
// KLARNA-RECONCILIATION-SELF-HEAL) to also accept a confirmationId and
// reconcile the orders row when the Stripe webhook has not fired (or
// has not been subscribed for `checkout.session.async_payment_succeeded`).
//
// Payload (either field accepted):
//   { confirmationId: "PT-XXXX" }   ← preferred for the Klarna "I've completed
//                                     payment" button, which only knows the
//                                     internal confirmation_id.
//   { sessionId: "cs_test_..." }    ← legacy probe by Stripe Checkout Session
//
// Behavior:
//   1. If confirmationId is supplied → look up orders row by it. If the row
//      already has `paid_at`, return paid=true without touching Stripe.
//   2. Otherwise resolve the checkout_session_id (from the orders row or
//      from the explicit sessionId argument) and call
//      stripe.checkout.sessions.retrieve.
//   3. If Stripe reports the session paid AND the orders row is still
//      unpaid, write `status=processing`, `paid_at=now`, `payment_intent_id`,
//      and `payment_method` back to the orders row — same fields the
//      `stripe-webhook` markOrderProcessing sets.
//   4. Always return { paid, status, paymentStatus, reconciled }.
//
// This makes the "I've Completed Payment" button work even when the Stripe
// webhook endpoint isn't subscribed to the async_payment_succeeded event
// (common Stripe-dashboard misconfig), without changing anything in the
// production payment-intent / inline-card path.
//
// Card payments are not affected: this function only reconciles on
// session.payment_status === "paid" || session.status === "complete", which
// the inline-card PaymentIntent flow already handles via the webhook's
// `payment_intent.succeeded` handler. Calling this function for a card-only
// order is a safe no-op (no session_id on the order → returns paid=false).

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestBody {
  sessionId?: string;
  confirmationId?: string;
}

interface OrderRow {
  id: string;
  confirmation_id: string;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  paid_at: string | null;
  status: string | null;
  // ── 2026-06-18 THANK-YOU-SOURCE-OF-TRUTH ──────────────────────────────────
  // Safe, non-medical display fields so the ESA/PSD thank-you pages can read
  // the canonical order record instead of trusting stale URL params or empty
  // sessionStorage. No assessment_answers / health data is ever returned.
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  price: number | null;
  plan_type: string | null;
  delivery_speed: string | null;
  letter_type: string | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  doctor_name: string | null;
}

// Map a raw order row to the safe public shape returned to the thank-you page.
function toPublicOrder(o: OrderRow | null) {
  if (!o) return null;
  return {
    confirmation_id: o.confirmation_id,
    first_name: o.first_name ?? null,
    last_name: o.last_name ?? null,
    email: o.email ?? null,
    price: o.price ?? null,
    plan_type: o.plan_type ?? null,
    delivery_speed: o.delivery_speed ?? null,
    letter_type: o.letter_type ?? null,
    coupon_code: o.coupon_code ?? null,
    coupon_discount: o.coupon_discount ?? null,
    doctor_name: o.doctor_name ?? null,
    status: o.status ?? null,
    paid_at: o.paid_at ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const body = await req.json() as RequestBody;
    const requestedSessionId = (body.sessionId ?? "").trim();
    const confirmationId = (body.confirmationId ?? "").trim();

    if (!requestedSessionId && !confirmationId) {
      return json({ error: "sessionId or confirmationId is required", paid: false }, 400);
    }

    let supabase: ReturnType<typeof createClient> | null = null;
    let order: OrderRow | null = null;

    // ── Fast path: confirmationId + orders.paid_at already set ─────────────
    if (confirmationId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from("orders")
        .select("id, confirmation_id, checkout_session_id, payment_intent_id, paid_at, status, first_name, last_name, email, price, plan_type, delivery_speed, letter_type, coupon_code, coupon_discount, doctor_name")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();
      if (error) {
        console.warn("[check-payment-status] orders lookup error:", error.message);
      }
      order = (data as OrderRow | null) ?? null;

      if (order?.paid_at) {
        return json({
          paid: true,
          status: order.status,
          paymentStatus: "paid",
          reconciled: false,
          source: "db_already_paid",
          order: toPublicOrder(order),
        });
      }
    }

    // Resolve the Stripe session id from either the orders row or the
    // explicit sessionId arg. If neither is available we cannot ask Stripe.
    const sessionIdToProbe = requestedSessionId || (order?.checkout_session_id ?? "");
    if (!sessionIdToProbe) {
      return json({
        paid: false,
        status: order?.status ?? null,
        paymentStatus: order?.paid_at ? "paid" : "unpaid",
        reconciled: false,
        source: "no_session_id",
        order: toPublicOrder(order),
      });
    }

    // ── Authoritative source of truth: ask Stripe ──────────────────────────
    const session = await stripe.checkout.sessions.retrieve(sessionIdToProbe);
    const stripePaid =
      session.payment_status === "paid" ||
      session.status === "complete";

    // ── Reconcile: if Stripe paid but DB unpaid, write back ────────────────
    let reconciled = false;
    if (stripePaid && order && !order.paid_at && supabase) {
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      const amt = Math.round((session.amount_total ?? 0) / 100);
      const paymentMode =
        (session.metadata?.payment_mode as string | undefined) ?? "klarna";

      const patch: Record<string, unknown> = {
        status: "processing",
        paid_at: new Date().toISOString(),
        payment_method: paymentMode,
      };
      if (piId) patch.payment_intent_id = piId;
      if (amt > 0) patch.price = amt;
      if (!order.checkout_session_id && session.id) {
        patch.checkout_session_id = session.id;
      }

      const { error: updErr } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", order.id);

      if (updErr) {
        console.error("[check-payment-status] reconcile update failed:", updErr.message);
      } else {
        reconciled = true;
        console.info(
          `[check-payment-status] RECONCILED ${order.confirmation_id} via session ${sessionIdToProbe} (PI: ${piId ?? "n/a"}, $${amt})`,
        );
        // Best-effort audit log so the source of the writeback is traceable.
        try {
          await supabase.from("audit_logs").insert({
            action: "klarna_payment_reconciled_via_button",
            object_type: "order",
            object_id: order.confirmation_id,
            description: `Manual "I've Completed Payment" reconciled ${order.confirmation_id}`,
            metadata: {
              order_id: order.id,
              confirmation_id: order.confirmation_id,
              session_id: sessionIdToProbe,
              payment_intent_id: piId,
              amount: amt,
              source: "check_payment_status_button",
              timestamp: new Date().toISOString(),
            },
          });
        } catch { /* non-critical */ }
      }
    }

    return json({
      paid: stripePaid,
      status: session.status,
      paymentStatus: session.payment_status,
      reconciled,
      confirmationId: order?.confirmation_id ?? confirmationId,
      sessionId: sessionIdToProbe,
      order: toPublicOrder(order),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[check-payment-status] error:", message);
    return json({ error: message, paid: false }, 400);
  }
});
