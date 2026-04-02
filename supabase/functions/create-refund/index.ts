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
  let body: { chargeId?: string; amount?: number; reason?: string; note?: string; confirmationId?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { chargeId, amount, reason, note, confirmationId } = body;
  if (!chargeId) return json({ ok: false, error: "chargeId is required" }, 400);

  // @ts-ignore
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

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

  // ── Update order in DB if confirmationId provided ─────────────────────────
  if (confirmationId) {
    const { data: order } = await adminClient
      .from("orders")
      .select("id, status, doctor_status")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (order) {
      await adminClient.from("orders").update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_amount: refundAmountDollars,
      }).eq("id", order.id);

      // Log status change
      try {
        await adminClient.from("order_status_logs").insert({
          order_id: order.id,
          confirmation_id: confirmationId,
          old_status: order.status,
          new_status: "refunded",
          changed_by: actorName,
          changed_at: new Date().toISOString(),
        });
      } catch { /* non-critical */ }

      // Doctor earnings: only void if provider had NOT completed the work
      const orderWasCompleted = order.doctor_status === "letter_sent" || order.doctor_status === "patient_notified";
      if (!orderWasCompleted) {
        await adminClient.from("doctor_earnings")
          .update({ status: "refunded", notes: `Order refunded by admin (${actorName}). No payout issued.` })
          .eq("confirmation_id", confirmationId)
          .neq("status", "paid");
      }

      console.info(`[create-refund] Order ${confirmationId} marked refunded. Earnings preserved: ${orderWasCompleted}`);
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
      new_values: { refundId: refund.id, chargeId, amount: refundAmountDollars, reason, note: note ?? null },
    });
  } catch { /* non-critical */ }

  // ── Notify customer via notify-customer-refund ────────────────────────────
  let customerNotificationQueued = false;
  if (confirmationId) {
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
    confirmationId: confirmationId ?? null,
    customerNotificationQueued,
  });
});
