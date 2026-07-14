// REFUND-ONLY-PROVIDER-EARNINGS-SEPARATION-002
// Dedicated authenticated "Refund + Cancel" backend action. Owns cancellation
// semantics so create-refund / stripe-webhook can stay FINANCIAL ONLY.
//
// Idempotently, in order:
//   1. verify admin authorization
//   2. no-op if the order is already cancelled (no second refund, no re-void)
//   3. perform / confirm the refund via create-refund (stable Stripe idempotency
//      key -> a retried Refund + Cancel never issues a second refund)
//   4. atomically set orders.status='cancelled' AND void only NON-completed
//      provider earnings, via the cancel_order_and_void_earnings RPC
//   5. write the audit record (only when this call actually performed the cancel)
//   6. return the final order / earnings state
//
// The customer email / SMS is still owned by the caller (OrderDetailModal Refund +
// Cancel modal) via its own operator checkboxes — this action suppresses the generic
// auto-refund email (skipCustomerNotification).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // ── Auth: verify caller is admin (same contract as create-refund) ───────────
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
  const actorName = profile?.full_name ?? "Admin";

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: {
    confirmationId?: string;
    refundAmount?: number;   // dollars; 0 / omitted => cancel with no refund
    reason?: string;
    note?: string;
  };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { confirmationId, refundAmount, reason, note } = body;
  if (!confirmationId) return json({ ok: false, error: "confirmationId is required" }, 400);

  // ── Load order ────────────────────────────────────────────────────────────
  const { data: order } = await adminClient
    .from("orders")
    .select("id, status, doctor_status, payment_intent_id, price")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (!order) return json({ ok: false, error: "Order not found" }, 404);

  // ── Idempotency: already cancelled -> no-op (never re-refund / re-void) ──────
  if (order.status === "cancelled") {
    return json({
      ok: true, alreadyCancelled: true, status: "cancelled",
      earningsVoided: 0, refund: null,
      message: "Order was already cancelled; no changes made.",
    });
  }

  // ── Perform / confirm the refund (financial-only, via create-refund) ────────
  const capturedAmount = typeof order.price === "number" ? order.price : 0;
  const parsedRefundAmount = typeof refundAmount === "number" ? refundAmount : NaN;
  const wantsRefund = !!order.payment_intent_id && parsedRefundAmount > 0 && parsedRefundAmount <= capturedAmount;

  let refundResult: { id: string; amount: number; dollars: number } | null = null;
  let refundSkipped = false;
  let refundSkipReason = "";

  if (wantsRefund) {
    const isPartial = parsedRefundAmount < capturedAmount;
    const refundRes = await fetch(`${supabaseUrl}/functions/v1/create-refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${callerToken}` },
      body: JSON.stringify({
        paymentIntentId: order.payment_intent_id,
        amount: isPartial ? parsedRefundAmount : undefined,   // omit => full charge balance
        reason: reason ?? "requested_by_customer",
        note: note?.trim() || "Order cancelled by admin",
        confirmationId,
        skipCustomerNotification: true,      // Refund + Cancel modal owns the email/SMS
        // Stable key -> a retried Refund + Cancel never issues a second Stripe refund.
        idempotencyKey: `cancel-${confirmationId}`,
      }),
    });
    const refundData = await refundRes.json().catch(() => ({ ok: false, error: "bad refund response" })) as
      { ok: boolean; error?: string; refund?: { id: string; amount: number }; refundAmountDollars?: number };

    if (!refundData.ok) {
      const errMsg = refundData.error ?? "Unknown error";
      // Test/live-mode mismatch: skip the refund but still cancel (matches prior UX).
      const isModeMismatch = errMsg.toLowerCase().includes("test mode") || errMsg.toLowerCase().includes("live mode");
      if (isModeMismatch) {
        refundSkipped = true;
        refundSkipReason = "Payment was made in test mode — Stripe refund skipped. Order cancelled without a refund.";
      } else {
        // Do NOT cancel if the refund genuinely failed — keeps refund-first safety.
        return json({ ok: false, error: `Refund failed: ${errMsg}. Order not cancelled.` }, 400);
      }
    } else if (refundData.refund) {
      refundResult = {
        id: refundData.refund.id,
        amount: refundData.refund.amount,
        dollars: refundData.refundAmountDollars ?? refundData.refund.amount / 100,
      };
    }
  }

  // ── Atomic cancel + earnings void (idempotent RPC) ──────────────────────────
  const { data: rpcData, error: rpcErr } = await adminClient
    .rpc("cancel_order_and_void_earnings", { p_confirmation_id: confirmationId, p_actor: actorName });

  if (rpcErr) {
    // Refund (if any) already went through — surface the DB failure so the operator
    // can retry; a retry is safe (refund idempotency key + already-cancelled no-op).
    return json({ ok: false, error: `Cancellation failed after refund: ${rpcErr.message}. Retry is safe.` }, 500);
  }

  const rpc = (rpcData ?? {}) as {
    already_cancelled?: boolean; earnings_voided?: number; was_completed?: boolean; status?: string; ok?: boolean; error?: string;
  };
  if (rpc.ok === false) {
    return json({ ok: false, error: rpc.error ?? "Cancellation RPC returned an error" }, 500);
  }

  const alreadyCancelled = rpc.already_cancelled === true;
  const earningsVoided = rpc.earnings_voided ?? 0;

  // ── Audit (only when THIS call performed the cancel — never on a retry no-op) ─
  if (!alreadyCancelled) {
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        actor_name: actorName,
        actor_role: profile?.role ?? "admin",
        object_type: "order",
        object_id: confirmationId,
        action: "order_refund_cancelled",
        description: `Order cancelled (Refund + Cancel) by ${actorName}` +
          (refundResult ? ` with $${refundResult.dollars.toFixed(2)} refund` : refundSkipped ? " (refund skipped)" : " (no refund)") +
          `; provider earnings voided: ${earningsVoided}`,
        new_values: {
          confirmation_id: confirmationId,
          refund_id: refundResult?.id ?? null,
          refund_amount: refundResult?.dollars ?? 0,
          refund_skipped: refundSkipped,
          earnings_voided: earningsVoided,
          was_completed: rpc.was_completed ?? false,
          reason: reason ?? null,
          note: note ?? null,
        },
      });
    } catch { /* non-critical */ }
  }

  return json({
    ok: true,
    alreadyCancelled,
    status: "cancelled",
    earningsVoided,
    wasCompleted: rpc.was_completed ?? false,
    refund: refundResult,
    refundSkipped,
    refundSkipReason,
  });
});
