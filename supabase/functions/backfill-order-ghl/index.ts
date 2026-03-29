/**
 * Admin utility: given a confirmationId, fetches Stripe PI metadata,
 * backfills phone on the orders row, and re-fires the GHL webhook proxy.
 * Enhanced: richer payload + audit logging + ghl_last_attempt_at tracking
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
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

  const authHeader = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const callerClient = createClient(supabaseUrl, authHeader.replace("Bearer ", ""));
  const adminClient = createClient(supabaseUrl, serviceKey);

  let actorName = "Admin";
  let actorId: string | null = null;

  const { data: { user } } = await callerClient.auth.getUser();
  if (user) {
    const { data: prof } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prof?.is_admin && authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Forbidden — admin only" }, 403);
    }
    actorName = prof?.full_name ?? "Admin";
    actorId = user.id;
  } else if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { confirmationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { confirmationId } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);

  // Mark attempt timestamp immediately
  await adminClient.from("orders").update({
    ghl_last_attempt_at: new Date().toISOString(),
  }).eq("confirmation_id", confirmationId);

  // Load order
  const { data: order, error: orderErr } = await adminClient
    .from("orders")
    .select("*")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (orderErr || !order) {
    return json({ error: "Order not found", detail: orderErr?.message }, 404);
  }

  // Fetch Stripe PI metadata for phone
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let phone = (order.phone as string | null) ?? "";
  let stripePhoneFetched = false;
  let stripeMetaLog = "";

  if (order.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id as string);
      const meta = pi.metadata ?? {};
      stripeMetaLog = JSON.stringify(meta);
      if (meta.phone) {
        phone = meta.phone;
        stripePhoneFetched = true;
      }
    } catch (err: unknown) {
      console.error(`[BACKFILL] Stripe PI fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (stripePhoneFetched && phone) {
    await adminClient.from("orders").update({ phone }).eq("confirmation_id", confirmationId);
  }

  // Build enhanced GHL payload
  const ghlPayload = {
    webhookType: "assessment",
    event: "payment_confirmed_backfill",
    email: order.email,
    firstName: order.first_name ?? "",
    lastName: order.last_name ?? "",
    phone: phone ?? "",
    state: order.state ?? "",
    confirmationId: order.confirmation_id,
    selectedProvider: (order.selected_provider as string) ?? "",
    assignedDoctor: (order.doctor_name as string) ?? "",
    assignedDoctorEmail: (order.doctor_email as string) ?? "",
    planType: (order.plan_type as string) ?? "One-Time Purchase",
    deliverySpeed: (order.delivery_speed as string) ?? "",
    orderTotal: order.price ?? 0,
    paymentIntentId: order.payment_intent_id ?? "",
    paymentConfirmed: !!(order.payment_intent_id),
    letterUrl: (order.letter_url as string) ?? "",
    signedLetterUrl: (order.signed_letter_url as string) ?? "",
    assessmentCompleted: !!(order.assessment_answers && Object.keys(order.assessment_answers as object).length > 0),
    orderStatus: order.status ?? "processing",
    doctorStatus: order.doctor_status ?? "",
    leadStatus: "Paid – Order Completed",
    confirmedAt: order.created_at,
    tags: ["Payment Confirmed", "Order Created", "Backfill", order.plan_type ?? "", order.state ?? ""].filter(Boolean),
  };

  let ghlResult = { ok: false, status: 0, body: "" };

  try {
    const ghlRes = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(ghlPayload),
    });
    const ghlBody = await ghlRes.text();
    ghlResult = { ok: ghlRes.ok, status: ghlRes.status, body: ghlBody };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GHL proxy error";
    ghlResult = { ok: false, status: 0, body: msg };
  }

  // Persist sync result
  await adminClient.from("orders").update({
    ghl_synced_at: ghlResult.ok ? new Date().toISOString() : (order.ghl_synced_at ?? null),
    ghl_sync_error: ghlResult.ok ? null : `HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 500)}`,
  }).eq("confirmation_id", confirmationId);

  // Write audit log
  await adminClient.from("audit_logs").insert({
    actor_id: actorId,
    actor_name: actorName,
    object_type: "ghl_sync",
    object_id: confirmationId,
    action: ghlResult.ok ? "ghl_sync_success" : "ghl_sync_failed",
    description: ghlResult.ok
      ? `GHL sync succeeded for order ${confirmationId} (${order.email as string})`
      : `GHL sync failed for order ${confirmationId}: HTTP ${ghlResult.status}`,
    new_values: {
      email: order.email,
      phone: phone || null,
      ghlStatus: ghlResult.status,
      payloadFields: Object.keys(ghlPayload),
    },
    metadata: { confirmationId, stripePhoneFetched },
  });

  return json({
    ok: ghlResult.ok,
    confirmationId,
    email: order.email as string,
    phonePersisted: phone || null,
    stripePhoneFetched,
    stripeMetaLog,
    ghlStatus: ghlResult.status,
    ghlBody: ghlResult.body,
    message: ghlResult.ok
      ? `GHL sync succeeded. Enhanced payload sent (${Object.keys(ghlPayload).length} fields).`
      : `GHL sync failed. HTTP ${ghlResult.status}. Body: ${ghlResult.body}`,
  });
});
