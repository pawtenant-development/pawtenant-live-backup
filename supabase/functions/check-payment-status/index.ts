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
//   { paymentIntentId: "pi_..." }   ← ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001,
//                                     inline-card reconciliation hint
//
// ── ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001 (2026-07-30) ──────────────────
// This is now the ONLY non-webhook, non-admin writer of orders.paid_at, because
// get-resume-order delegates here instead of trusting the browser. Two rules
// make that safe:
//   1. IDENTIFIER BINDING — a client-relayed session/PI id is only a lookup
//      hint. It must equal the identifier already stored on the order, or the
//      retrieved Stripe object must carry metadata.confirmation_id for THIS
//      order (stamped server-side at creation). Otherwise: refuse, no write.
//   2. SERVER TIMESTAMP + SINGLE TRANSITION — paid_at is always `now()` on the
//      server and the update is guarded by `.is("paid_at", null)`, so the
//      immutable entitlement-snapshot trigger fires at most once per order.
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
  // ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001: lets an inline-card order be
  // reconciled when the webhook is delayed. Treated as an UNVERIFIED lookup
  // hint — it must be bound to the order by the stored payment_intent_id or by
  // server-stamped Stripe metadata.confirmation_id before anything is written.
  paymentIntentId?: string;
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

    // ── ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001: identifier binding ───────
    // This function is the authoritative reconciler that get-resume-order now
    // delegates to, so a client-relayed identifier must never be enough to mark
    // an order paid.
    //
    // Previously `sessionIdToProbe = requestedSessionId || stored` — the
    // CLIENT value won. That allowed cross-order injection: post
    // { confirmationId: <my unpaid order>, sessionId: <someone else's PAID
    // session> } and this function reconciled MY order against THEIR payment.
    //
    // Binding rules now, whenever we resolved an order:
    //   • A stored identifier is canonical. A client value that disagrees with
    //     it is REFUSED outright (no mutation).
    //   • With nothing stored yet (normal for a fresh inline-card order), a
    //     client hint is allowed as a LOOKUP key only, and the retrieved Stripe
    //     object must carry metadata.confirmation_id === this order. That
    //     metadata is stamped server-side by create-payment-intent /
    //     create-checkout-session, so it cannot be forged from the browser.
    const storedSessionId = order?.checkout_session_id ?? null;
    const storedPiId = order?.payment_intent_id ?? null;
    const requestedPiId = (body.paymentIntentId ?? "").trim();

    async function refuseMismatch(kind: string, supplied: string): Promise<Response> {
      console.error(
        `[check-payment-status] IDENTIFIER MISMATCH (${kind}) for ${order?.confirmation_id ?? confirmationId}: supplied ${supplied}`,
      );
      if (supabase && order) {
        try {
          // DEDUPE per (order, mismatch kind). This endpoint is reachable
          // without a JWT, so an attacker could otherwise inflate audit_logs
          // without bound by replaying mismatched identifiers. One row per
          // order+kind is enough to raise the signal.
          const { count } = await supabase
            .from("audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("action", "resume_payment_identifier_mismatch")
            .eq("object_id", order.confirmation_id)
            .contains("metadata", { mismatch_kind: kind });
          if ((count ?? 0) > 0) {
            return json({
              paid: false,
              status: order.status ?? null,
              paymentStatus: "unpaid",
              reconciled: false,
              source: "identifier_mismatch",
              order: toPublicOrder(order),
            });
          }

          await supabase.from("audit_logs").insert({
            action: "resume_payment_identifier_mismatch",
            object_type: "order",
            object_id: order.confirmation_id,
            actor_name: "check-payment-status",
            actor_role: "service",
            description:
              `[ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001] refused ${kind} not bound to ${order.confirmation_id}`,
            metadata: {
              order_id: order.id,
              confirmation_id: order.confirmation_id,
              mismatch_kind: kind,
              // Identifier only — never a secret, header, or payment method.
              supplied_identifier: supplied.slice(0, 64),
            },
          });
        } catch { /* non-critical */ }
      }
      return json({
        paid: false,
        status: order?.status ?? null,
        paymentStatus: "unpaid",
        reconciled: false,
        source: "identifier_mismatch",
        order: toPublicOrder(order),
      });
    }

    // Reject a client session id that contradicts the stored one.
    if (order && storedSessionId && requestedSessionId && requestedSessionId !== storedSessionId) {
      return await refuseMismatch("checkout_session_id", requestedSessionId);
    }
    // Reject a client PI id that contradicts the stored one.
    if (order && storedPiId && requestedPiId && requestedPiId !== storedPiId) {
      return await refuseMismatch("payment_intent_id", requestedPiId);
    }

    // Prefer the stored identifier; fall back to the client hint (binding is
    // enforced against Stripe metadata after retrieval).
    const sessionIdToProbe = order
      ? (storedSessionId || requestedSessionId)
      : requestedSessionId;
    const piIdToProbe = order ? (storedPiId || requestedPiId) : "";

    if (!sessionIdToProbe && !piIdToProbe) {
      return json({
        paid: false,
        status: order?.status ?? null,
        paymentStatus: order?.paid_at ? "paid" : "unpaid",
        reconciled: false,
        source: "no_payment_identifier",
        order: toPublicOrder(order),
      });
    }

    // Is the probed identifier already bound to this order server-side?
    const sessionPreBound = !!storedSessionId && sessionIdToProbe === storedSessionId;
    const piPreBound = !!storedPiId && piIdToProbe === storedPiId;

    // ── Authoritative source of truth: ask Stripe ──────────────────────────
    let stripePaid = false;
    let evidenceBound = false;
    let evidenceKind: "checkout_session" | "payment_intent" | null = null;
    let piId: string | null = null;
    let amt = 0;
    let paymentMode = "card";
    let resolvedSessionId: string | null = null;
    let reportedStatus: string | null = null;
    let reportedPaymentStatus: string | null = null;
    let stripeCurrency: string | null = null;
    let metaConfirmationId: string | null = null;

    if (sessionIdToProbe) {
      const session = await stripe.checkout.sessions.retrieve(sessionIdToProbe);
      evidenceKind = "checkout_session";
      resolvedSessionId = session.id ?? sessionIdToProbe;
      reportedStatus = session.status ?? null;
      reportedPaymentStatus = session.payment_status ?? null;
      stripeCurrency = session.currency ?? null;
      metaConfirmationId = (session.metadata?.confirmation_id as string | undefined) ?? null;
      stripePaid = session.payment_status === "paid" || session.status === "complete";
      piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      amt = Math.round((session.amount_total ?? 0) / 100);
      paymentMode = (session.metadata?.payment_mode as string | undefined) ?? "klarna";
      evidenceBound = sessionPreBound || (!!order && metaConfirmationId === order.confirmation_id);
    } else {
      // ── PaymentIntent branch (inline-card orders) ────────────────────────
      // Card checkouts never create a Checkout Session, so before this branch
      // existed a delayed webhook left them with NO reconciliation path at all.
      const pi = await stripe.paymentIntents.retrieve(piIdToProbe);
      evidenceKind = "payment_intent";
      reportedStatus = pi.status ?? null;
      reportedPaymentStatus = pi.status === "succeeded" ? "paid" : "unpaid";
      stripeCurrency = pi.currency ?? null;
      metaConfirmationId = (pi.metadata?.confirmation_id as string | undefined) ?? null;
      // ONLY "succeeded" counts. requires_payment_method / processing /
      // requires_action / canceled all leave the order unpaid.
      stripePaid = pi.status === "succeeded";
      piId = pi.id ?? piIdToProbe;
      amt = Math.round(((pi.amount_received ?? pi.amount ?? 0) as number) / 100);
      paymentMode = "card";
      evidenceBound = piPreBound || (!!order && metaConfirmationId === order.confirmation_id);
    }

    // A Stripe object that is paid but NOT bound to this order is an attempted
    // cross-order reconciliation. Refuse and never mutate.
    if (order && !order.paid_at && stripePaid && !evidenceBound) {
      return await refuseMismatch(
        evidenceKind === "payment_intent" ? "payment_intent_metadata" : "checkout_session_metadata",
        piIdToProbe || sessionIdToProbe,
      );
    }

    // ── Reconcile: only when Stripe says paid AND the evidence is bound ─────
    let reconciled = false;
    if (stripePaid && evidenceBound && order && !order.paid_at && supabase) {
      if (stripeCurrency && stripeCurrency.toLowerCase() !== "usd") {
        return await refuseMismatch("currency", `${stripeCurrency}`);
      }

      const patch: Record<string, unknown> = {
        status: "processing",
        // SERVER timestamp — never a client-supplied or Stripe-echoed value.
        paid_at: new Date().toISOString(),
        payment_method: paymentMode,
      };
      if (piId) patch.payment_intent_id = piId;
      if (amt > 0) patch.price = amt;
      if (!order.checkout_session_id && resolvedSessionId) {
        patch.checkout_session_id = resolvedSessionId;
      }

      // Idempotency guard: `.is("paid_at", null)` makes the paid transition
      // fire at most once even under concurrent callers, so the immutable
      // entitlement-snapshot trigger can only ever mint ONE snapshot.
      const { data: updRows, error: updErr } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", order.id)
        .is("paid_at", null)
        .select("id");

      if (updErr) {
        console.error("[check-payment-status] reconcile update failed:", updErr.message);
      } else if (!updRows || updRows.length === 0) {
        // Another writer (webhook or a concurrent call) won the race.
        console.info(
          `[check-payment-status] ${order.confirmation_id} already transitioned by another writer — no second write`,
        );
      } else {
        reconciled = true;
        console.info(
          `[check-payment-status] RECONCILED ${order.confirmation_id} via ${evidenceKind} ${piIdToProbe || sessionIdToProbe} (PI: ${piId ?? "n/a"}, $${amt})`,
        );
        // Best-effort audit log so the source of the writeback is traceable.
        try {
          await supabase.from("audit_logs").insert({
            action:
              evidenceKind === "payment_intent"
                ? "resume_payment_reconciliation_succeeded"
                : "klarna_payment_reconciled_via_button",
            object_type: "order",
            object_id: order.confirmation_id,
            // audit_logs.actor_name is NOT NULL — omitting it made this insert
            // fail silently inside the catch, so reconciliations were never
            // actually audited before this task.
            actor_name: "check-payment-status",
            actor_role: "service",
            description: `Server-verified ${evidenceKind} reconciled ${order.confirmation_id}`,
            metadata: {
              order_id: order.id,
              confirmation_id: order.confirmation_id,
              session_id: resolvedSessionId,
              payment_intent_id: piId,
              amount: amt,
              evidence_kind: evidenceKind,
              binding: sessionPreBound || piPreBound ? "stored_identifier" : "stripe_metadata",
              source: "check_payment_status",
              timestamp: new Date().toISOString(),
            },
          });
        } catch { /* non-critical */ }
      }
    }

    return json({
      paid: stripePaid && (evidenceBound || !order),
      status: reportedStatus,
      paymentStatus: reportedPaymentStatus,
      reconciled,
      confirmationId: order?.confirmation_id ?? confirmationId,
      sessionId: resolvedSessionId,
      order: toPublicOrder(order),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[check-payment-status] error:", message);
    return json({ error: message, paid: false }, 400);
  }
});
