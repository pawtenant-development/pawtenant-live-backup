import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) return json({ ok: false, error: "Unauthorized — no token" }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      console.error("[CREATE-REFUND] Auth error:", authErr?.message);
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const { data: profile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, full_name, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) return json({ ok: false, error: "Forbidden — admin only" }, 403);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ ok: false, error: "Stripe not configured on this server" }, 500);

    let body: { chargeId?: string; paymentIntentId?: string; amount?: number; reason?: string; note?: string; confirmationId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    let { chargeId } = body;
    const { amount, reason, note, confirmationId, paymentIntentId } = body;

    // If chargeId not provided, resolve from paymentIntentId
    if (!chargeId && paymentIntentId) {
      console.log(`[CREATE-REFUND] Resolving charge from payment intent: ${paymentIntentId}`);
      const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      });
      const pi = await piRes.json() as Record<string, unknown>;
      if (!piRes.ok) {
        const errMsg = (pi.error as Record<string, unknown>)?.message as string ?? `Failed to fetch payment intent (${piRes.status})`;
        return json({ ok: false, error: errMsg }, 400);
      }
      chargeId = pi.latest_charge as string;
      if (!chargeId) {
        return json({ ok: false, error: "No charge found for this payment intent — it may not have been captured yet." }, 400);
      }
      console.log(`[CREATE-REFUND] Resolved charge ID: ${chargeId}`);
    }

    if (!chargeId) return json({ ok: false, error: "chargeId or paymentIntentId is required" }, 400);

    console.log(`[CREATE-REFUND] Attempting refund for charge ${chargeId}, amount: ${amount ?? "full"}`);

    // Build Stripe refund request
    const params = new URLSearchParams();
    params.append("charge", chargeId);
    if (amount && amount > 0) {
      params.append("amount", String(Math.round(amount * 100)));
    }
    if (reason && ["duplicate", "fraudulent", "requested_by_customer"].includes(reason)) {
      params.append("reason", reason);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const refund = await stripeRes.json() as Record<string, unknown>;
    console.log(`[CREATE-REFUND] Stripe response status: ${stripeRes.status}`);

    if (!stripeRes.ok) {
      const stripeError = refund.error as Record<string, unknown> | undefined;
      const errMsg = stripeError?.message as string ?? stripeError?.code as string ?? `Stripe error (${stripeRes.status})`;
      console.error(`[CREATE-REFUND] Stripe error: ${errMsg}`, JSON.stringify(stripeError));

      try {
        await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          actor_name: profile.full_name ?? "Admin",
          actor_role: profile.role ?? "admin_manager",
          object_type: "refund",
          object_id: chargeId,
          action: "refund_failed",
          description: `Refund attempt failed: ${errMsg}`,
          new_values: { chargeId, amount, reason, note },
          metadata: { confirmationId },
        });
      } catch (logErr) {
        console.warn("[CREATE-REFUND] Failed to write failed-refund audit log:", logErr);
      }

      return json({ ok: false, error: errMsg }, 400);
    }

    // ── IMMEDIATELY sync refund status to the orders table ─────────────────
    const refundedAmountDollars = (refund.amount as number) / 100;
    const refundNow = new Date().toISOString();

    if (confirmationId) {
      const { error: orderUpdateErr } = await adminClient
        .from("orders")
        .update({
          status: "refunded",
          refunded_at: refundNow,
          refund_amount: Math.round(refundedAmountDollars),
        })
        .eq("confirmation_id", confirmationId);

      if (orderUpdateErr) {
        console.error(`[CREATE-REFUND] Failed to update order status for ${confirmationId}:`, orderUpdateErr.message);
      } else {
        console.log(`[CREATE-REFUND] Order ${confirmationId} marked as refunded ($${refundedAmountDollars})`);
      }

      // ── EARNINGS PRESERVATION GUARD ─────────────────────────────────────
      // If the order was already completed (doctor_status = 'patient_notified')
      // before this refund, the provider's earnings record is intentionally
      // preserved and NOT deleted. The provider completed their work; the refund
      // is a business/customer-service decision that should not affect their pay.
      // This is enforced by simply not touching the doctor_earnings table here.
      const { data: orderForEarningsCheck } = await adminClient
        .from("orders")
        .select("doctor_status, doctor_user_id, doctor_name")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (orderForEarningsCheck?.doctor_status === "patient_notified") {
        console.log(
          `[CREATE-REFUND] Order ${confirmationId} was completed before refund. ` +
          `Provider earnings for ${orderForEarningsCheck.doctor_name ?? orderForEarningsCheck.doctor_user_id} ` +
          `are PRESERVED (not deleted) — provider completed their work.`
        );
      } else {
        console.log(
          `[CREATE-REFUND] Order ${confirmationId} doctor_status=${orderForEarningsCheck?.doctor_status ?? "unknown"} ` +
          `— earnings not applicable or order was not completed.`
        );
      }

    } else if (paymentIntentId) {
      const { error: orderUpdateErr } = await adminClient
        .from("orders")
        .update({
          status: "refunded",
          refunded_at: refundNow,
          refund_amount: Math.round(refundedAmountDollars),
        })
        .eq("payment_intent_id", paymentIntentId);

      if (orderUpdateErr) {
        console.error(`[CREATE-REFUND] Failed to update order by PI ${paymentIntentId}:`, orderUpdateErr.message);
      } else {
        console.log(`[CREATE-REFUND] Order by PI ${paymentIntentId} marked as refunded ($${refundedAmountDollars})`);
      }

      // Earnings preservation for PI-matched orders
      const { data: piOrder } = await adminClient
        .from("orders")
        .select("confirmation_id, doctor_status, doctor_user_id, doctor_name")
        .eq("payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (piOrder?.doctor_status === "patient_notified") {
        console.log(
          `[CREATE-REFUND] Order ${piOrder.confirmation_id} was completed before refund. ` +
          `Provider earnings for ${piOrder.doctor_name ?? piOrder.doctor_user_id} are PRESERVED.`
        );
      }
    }

    // Log successful refund
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        actor_name: profile.full_name ?? "Admin",
        actor_role: profile.role ?? "admin_manager",
        object_type: "refund",
        object_id: refund.id as string,
        action: "refund_created",
        description: `Refund ${amount ? `of $${amount}` : "(full)"} issued for charge ${chargeId}${note ? `. Note: ${note}` : ""}`,
        new_values: { chargeId, amount, reason, refundId: refund.id, status: refund.status },
        metadata: { confirmationId, note },
      });
    } catch (logErr) {
      console.warn("[CREATE-REFUND] Failed to write success audit log:", logErr);
    }

    // ── Fire GHL with Refunded + Closed tags (fire-and-forget) ────────────
    const lookupId = confirmationId ?? "";
    if (lookupId) {
      try {
        const { data: orderData } = await adminClient
          .from("orders")
          .select("email, first_name, last_name, phone, letter_type, addon_services, price")
          .eq("confirmation_id", lookupId)
          .maybeSingle();

        if (orderData?.email) {
          fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              event: "order_refunded",
              email: orderData.email,
              firstName: orderData.first_name ?? "",
              lastName: orderData.last_name ?? "",
              phone: orderData.phone ?? "",
              confirmationId: lookupId,
              letterType: orderData.letter_type ?? "",
              addonServices: orderData.addon_services ?? [],
              price: orderData.price ?? 0,
              tags: ["Refunded", "Closed"],
              leadStatus: "Refunded — Order Closed",
            }),
          }).then(async (r) => {
            try {
              const result = await r.json() as Record<string, unknown>;
              console.log(`[CREATE-REFUND] GHL Refund tag → ok=${result.ok}`);
            } catch {
              console.warn("[CREATE-REFUND] Could not parse GHL response");
            }
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "unknown";
            console.error(`[CREATE-REFUND] GHL fire failed: ${msg}`);
          });
        }
      } catch (ghlErr) {
        console.warn("[CREATE-REFUND] GHL notification skipped:", ghlErr);
      }
    }

    // Auto-fire customer refund notification (fire-and-forget)
    if (confirmationId) {
      fetch(`${supabaseUrl}/functions/v1/notify-customer-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          confirmationId,
          refundAmount: refundedAmountDollars,
          refundId: refund.id as string,
          reason: reason ?? "requested_by_customer",
          note: note ?? "",
        }),
      }).then(async (r) => {
        try {
          const result = await r.json() as Record<string, unknown>;
          console.log(`[CREATE-REFUND] Notification → ok=${result.ok} email=${result.patientEmail ?? "n/a"}`);
        } catch {
          console.warn("[CREATE-REFUND] Could not parse notification response");
        }
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[CREATE-REFUND] Notification dispatch failed: ${msg}`);
      });
    }

    return json({ ok: true, refund, chargeId, customerNotificationQueued: !!confirmationId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[CREATE-REFUND] Uncaught exception:", msg);
    return json({ ok: false, error: `Server error: ${msg}` }, 500);
  }
});
