import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) return json({ ok: false, error: "Stripe not configured" }, 500);

  // ── Auth: verify caller is admin ──────────────────────────────────────────
  const callerToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!callerToken) return json({ ok: false, error: "Unauthorized" }, 401);

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(callerToken);
  if (authErr || !user) return json({ ok: false, error: "Unauthorized — session expired, please refresh" }, 401);

  const { data: profile } = await adminClient
    .from("doctor_profiles")
    .select("is_admin, role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.is_admin === true ||
    ["owner", "admin_manager", "support", "admin", "finance"].includes(profile?.role ?? "");
  if (!isAdmin) return json({ ok: false, error: "Access denied — admin only" }, 403);

  // ── Parse body ────────────────────────────────────────────────────────────
  // 2026-05-22 REFUND-CANCEL-WORKFLOW: added optional `skipCustomerNotification`
  // (default false). When true, the auto-fire of notify-customer-refund is
  // skipped so the caller (OrderDetailModal Refund + Cancel modal) can decide
  // whether to send the customer email itself — without breaking the existing
  // RefundModal flow on PaymentsTab, which still gets its email automatically.
  let body: {
    chargeId?: string;
    paymentIntentId?: string;
    amount?: number;
    reason?: string;
    note?: string;
    confirmationId?: string;
    skipCustomerNotification?: boolean;
  };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { chargeId: rawChargeId, paymentIntentId, amount, reason, note, confirmationId, skipCustomerNotification } = body;

  // @ts-ignore
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  // ── Resolve charge ID ─────────────────────────────────────────────────────
  // Accept either chargeId (ch_...) or paymentIntentId (pi_...).
  // If paymentIntentId is provided, look up the latest charge from Stripe.
  let chargeId = rawChargeId;

  if (!chargeId && paymentIntentId) {
    try {
      console.info(`[create-refund] Resolving charge from payment intent: ${paymentIntentId}`);
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      // latest_charge is the charge ID string on the PI object
      const latestCharge = (pi as unknown as { latest_charge?: string }).latest_charge;
      if (latestCharge) {
        chargeId = latestCharge;
        console.info(`[create-refund] Resolved charge: ${chargeId}`);
      } else {
        // Fallback: list charges for this PI
        const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
        if (charges.data.length > 0) {
          chargeId = charges.data[0].id;
          console.info(`[create-refund] Resolved charge via list: ${chargeId}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[create-refund] Failed to resolve charge from PI ${paymentIntentId}:`, msg);
      return json({ ok: false, error: `Could not resolve charge from payment intent: ${msg}` }, 400);
    }
  }

  if (!chargeId) {
    return json({ ok: false, error: "Either chargeId or paymentIntentId is required" }, 400);
  }

  // ── Issue refund via Stripe ───────────────────────────────────────────────
  let refund: Stripe.Refund;
  try {
    const params: Stripe.RefundCreateParams = {
      charge: chargeId,
      reason: (reason as Stripe.RefundCreateParams.Reason) ?? "requested_by_customer",
    };
    // amount is in dollars from frontend — convert to cents for Stripe
    if (amount && amount > 0) {
      params.amount = Math.round(amount * 100);
    }
    refund = await stripe.refunds.create(params);
    console.info(`[create-refund] ✓ Refund ${refund.id} issued — $${(refund.amount / 100).toFixed(2)} for charge ${chargeId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[create-refund] Stripe refund failed for charge ${chargeId}:`, msg);
    return json({ ok: false, error: msg }, 400);
  }

  const refundAmountDollars = refund.amount / 100;
  const actorName = profile?.full_name ?? "Admin";

  // ── Determine full-vs-partial from Stripe truth ───────────────────────────
  // ORDER-PARTIAL-REFUND-STATUS-FIX-001: full/partial is decided by the Stripe
  // charge (cumulative amount_refunded vs amount + the `refunded` flag), NOT by
  // order.price — which can differ from the captured amount on coupon-bug orders
  // (e.g. Desiree PT-MR1HX27H: charged $99, price $59, refunded $40 = PARTIAL).
  let cumulativeRefundedDollars = refundAmountDollars;
  let isFullRefund = false;
  try {
    const ch = await stripe.charges.retrieve(chargeId);
    const chAmount = (ch as unknown as { amount?: number; amount_refunded?: number; refunded?: boolean });
    cumulativeRefundedDollars = (chAmount.amount_refunded ?? 0) / 100;
    isFullRefund = chAmount.refunded === true ||
      (typeof chAmount.amount === "number" && (chAmount.amount_refunded ?? 0) >= chAmount.amount);
  } catch (err) {
    // Conservative fallback: treat as PARTIAL so we never wrongly flip an order
    // to fully-refunded. The charge.refunded webhook reconciles authoritatively.
    console.warn("[create-refund] charge retrieve failed; treating as partial:", err);
  }
  const refundStatusValue: "partial" | "full" = isFullRefund ? "full" : "partial";

  // ── Update order in DB if confirmationId provided ─────────────────────────
  if (confirmationId) {
    const { data: order } = await adminClient
      .from("orders")
      .select("id, status, doctor_status, google_ads_upload_status")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (order) {
      // REFUND-ONLY-OPERATIONAL: create-refund is purely FINANCIAL — it records
      // the refund money + classification and NEVER changes the operational status.
      // Refund Only (partial OR full) keeps the order active; only the
      // "Refund + Cancel" action sets status='cancelled' (in OrderDetailModal).
      // refund_amount holds the cumulative refunded total so partials accumulate.
      const orderUpdate: Record<string, unknown> = {
        refunded_at: new Date().toISOString(),
        refund_amount: cumulativeRefundedDollars,
        refund_status: refundStatusValue,
      };
      if (isFullRefund) {
        // REFUND-ONLY-OPERATIONAL: do NOT set status='refunded' — a full refund via
        // Refund Only keeps the order operational; only Refund + Cancel sets
        // status='cancelled'. A full MONETARY refund still reverses the ad conversion.
        // ORDER-REFUND-IDEMPOTENCY-CLEANUP-TEST-001: flag the Google Ads refund
        // adjustment HERE too (admin path) so it never depends on the webhook
        // winning the status race. Set-once + applicable-only — only when a
        // conversion was actually uploaded (uploaded / pending_gclid_upgrade).
        // Never overwrites failed / skipped / null states; the webhook applies
        // the same guard so it can't double-set.
        const adsStatus = (order.google_ads_upload_status as string | null) ?? null;
        if (adsStatus === "uploaded" || adsStatus === "pending_gclid_upgrade") {
          orderUpdate.google_ads_upload_status = "refunded_pending_adjustment";
        }
      }
      await adminClient.from("orders").update(orderUpdate).eq("id", order.id);

      // Status log: the `orders_status_change_trigger` DB trigger already inserts
      // a single order_status_logs row on the status→refunded transition
      // (changed_by='system'). No explicit insert here — that was the duplicate.

      // Doctor earnings: only void on a FULL refund where the provider had NOT
      // completed the work. A partial refund never voids the provider payout.
      // `.neq('status','refunded')` keeps a retry from re-touching voided rows.
      const orderWasCompleted = order.doctor_status === "letter_sent" || order.doctor_status === "patient_notified";
      if (isFullRefund && !orderWasCompleted) {
        await adminClient.from("doctor_earnings")
          .update({ status: "refunded", notes: `Order refunded by admin (${actorName}). No payout issued.` })
          .eq("confirmation_id", confirmationId)
          .neq("status", "paid")
          .neq("status", "refunded");
      }

      console.info(`[create-refund] Order ${confirmationId} refund recorded — ${refundStatusValue} ($${cumulativeRefundedDollars.toFixed(2)} of charge). status_changed=${isFullRefund}, earnings_preserved=${orderWasCompleted}`);
    }
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  try {
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      actor_name: actorName,
      actor_role: profile?.role ?? "admin",
      object_type: "refund",
      object_id: confirmationId ?? chargeId,
      action: "refund_issued",
      description: `Refund of $${refundAmountDollars.toFixed(2)} issued for charge ${chargeId}${confirmationId ? ` (order ${confirmationId})` : ""}`,
      new_values: { refundId: refund.id, chargeId, paymentIntentId: paymentIntentId ?? null, amount: refundAmountDollars, reason, note: note ?? null },
    });
  } catch { /* non-critical */ }

  // ── Notify customer via notify-customer-refund ────────────────────────────
  // 2026-05-22 REFUND-CANCEL-WORKFLOW: gated by skipCustomerNotification so
  // the new OrderDetailModal Refund + Cancel flow can own the customer email
  // (via the order_cancelled_refund template) without firing the generic
  // "Refund Issued" email at the same time. Default behavior unchanged.
  let customerNotificationQueued = false;
  if (confirmationId && !skipCustomerNotification) {
    try {
      const notifyRes = await fetch(`${supabaseUrl}/functions/v1/notify-customer-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          confirmationId,
          refundAmount: refundAmountDollars,
          refundId: refund.id,
          reason: reason ?? "requested_by_customer",
          note: note ?? null,
        }),
      });
      const notifyData = await notifyRes.json() as { ok: boolean };
      customerNotificationQueued = notifyData.ok === true;
      console.info(`[create-refund] Customer notification: ${customerNotificationQueued ? "sent" : "failed"}`);
    } catch (err) {
      console.warn("[create-refund] Customer notification failed:", err);
    }
  }

  return json({
    ok: true,
    refund: { id: refund.id, amount: refund.amount, status: refund.status },
    refundAmountDollars,
    cumulativeRefundedDollars,
    refundStatus: refundStatusValue,
    isFullRefund,
    confirmationId: confirmationId ?? null,
    customerNotificationQueued,
  });
});
