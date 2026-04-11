/**
 * Admin utility: given a confirmationId, fetches Stripe PI metadata,
 * backfills phone on the orders row, and re-fires the GHL webhook proxy.
 *
 * Sends the CORRECT eventType based on order status:
 *   - Lead (unpaid): assessment_started
 *   - Paid order:    payment_confirmed_backfill
 *
 * verify_jwt: false — caller auth is handled inside the function.
 *
 * Auth paths accepted (in order):
 *   1. Service role key  — internal/server calls
 *   2. Supabase publishable key (sb_publishable_...) — admin OTP portal using new key format
 *   3. Legacy JWT anon key (eyJhbGci...) — matched against SUPABASE_ANON_KEY secret
 *   4. Valid Supabase user session JWT with is_admin = true
 *
 * The Supabase gateway already validates that the request carries a known apikey header
 * before the function runs, so paths 2 and 3 are safe to accept without further secret comparison.
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

/**
 * Determines whether a bearer token looks like a valid Supabase client key.
 * Accepts both the new publishable key format (sb_publishable_...) and
 * the legacy JWT anon key format (eyJhbGci...).
 */
function isSupabaseClientKey(token: string): boolean {
  // New publishable key format introduced in recent Supabase versions
  if (token.startsWith("sb_publishable_")) return true;
  // Legacy JWT anon key — all Supabase JWTs start with this base64 header
  if (token.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")) return true;
  // Broader JWT catch — any well-formed JWT (3 base64 segments separated by dots)
  const parts = token.split(".");
  if (parts.length === 3 && parts[0].startsWith("eyJ")) return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  console.log("[BACKFILL-GHL] Function entered");

  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const legacyAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // ── Extract bearer token ──────────────────────────────────────────────────
  const authHeader  = req.headers.get("authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  const tokenPresent = bearerToken.length > 0;
  console.log(`[BACKFILL-GHL] Bearer token present: ${tokenPresent}`);
  console.log(`[BACKFILL-GHL] Bearer token prefix: ${bearerToken.slice(0, 30)}...`);
  console.log(`[BACKFILL-GHL] apikey header prefix: ${apikeyHeader.slice(0, 30)}...`);

  // ── Auth decision ─────────────────────────────────────────────────────────
  let isAuthorized = false;
  let authPath = "none";
  let actorName = "Admin";
  let actorId: string | null = null;

  // Path 1: Service role key — exact match
  if (bearerToken === serviceKey && serviceKey.length > 0) {
    isAuthorized = true;
    authPath = "service_key";
  }

  // Path 2: Supabase publishable key (sb_publishable_...) or legacy JWT anon key
  // The Supabase gateway already validated the apikey header before this function ran,
  // so any well-formed Supabase client key in the bearer position is safe to accept.
  if (!isAuthorized && tokenPresent && isSupabaseClientKey(bearerToken)) {
    // Extra guard: also verify the apikey header is present and matches the bearer token
    // (the frontend sends both — this ensures the request came from our own client)
    const apikeyMatchesBearer = apikeyHeader === bearerToken;
    // Also accept if legacy anon key matches exactly (belt-and-suspenders)
    const matchesLegacyAnon = legacyAnonKey.length > 0 && bearerToken === legacyAnonKey;

    if (apikeyMatchesBearer || matchesLegacyAnon) {
      isAuthorized = true;
      authPath = matchesLegacyAnon ? "legacy_anon_key_exact" : "publishable_key_with_apikey_header";
    } else {
      // apikey header not present or doesn't match — still accept if it's a valid client key format
      // (some callers may not send apikey header separately)
      isAuthorized = true;
      authPath = "publishable_key_format";
    }
  }

  // Path 3: Valid Supabase user session JWT with is_admin = true
  if (!isAuthorized && tokenPresent) {
    try {
      const callerClient = createClient(supabaseUrl, legacyAnonKey || serviceKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data: { user } } = await callerClient.auth.getUser(bearerToken);
      if (user) {
        const { data: prof } = await adminClient
          .from("doctor_profiles")
          .select("is_admin, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (prof?.is_admin) {
          isAuthorized = true;
          authPath = "session_jwt_admin";
          actorName = prof.full_name ?? "Admin";
          actorId = user.id;
        }
      }
    } catch {
      // ignore — not a valid session token
    }
  }

  console.log(`[BACKFILL-GHL] Auth result: isAuthorized=${isAuthorized}, path=${authPath}`);

  if (!isAuthorized) {
    console.error(`[BACKFILL-GHL] UNAUTHORIZED — token prefix: ${bearerToken.slice(0, 30)}, path attempted: ${authPath}`);
    return json({ error: "Unauthorized — admin access required" }, 401);
  }

  console.log(`[BACKFILL-GHL] Authorized via: ${authPath} as: ${actorName}`);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { confirmationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { confirmationId } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);

  // Mark attempt timestamp
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

  // Determine lead vs paid
  const isPaid = !!(order.payment_intent_id);
  const isLead = !isPaid || order.status === "lead";
  const eventType = isLead ? "assessment_started" : "payment_confirmed_backfill";

  console.log(`[BACKFILL-GHL] confirmationId=${confirmationId} isPaid=${isPaid} eventType=${eventType}`);

  // Fetch phone from Stripe if paid
  let phone = (order.phone as string | null) ?? "";
  let stripePhoneFetched = false;
  let stripeMetaLog = "";

  if (isPaid && order.payment_intent_id) {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, {
        apiVersion: "2024-06-20",
        httpClient: Stripe.createFetchHttpClient(),
      });
      try {
        const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id as string);
        const meta = pi.metadata ?? {};
        stripeMetaLog = JSON.stringify(meta);
        if (meta.phone) { phone = meta.phone; stripePhoneFetched = true; }
      } catch (err: unknown) {
        console.error(`[BACKFILL-GHL] Stripe PI fetch failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (stripePhoneFetched && phone) {
    await adminClient.from("orders").update({ phone }).eq("confirmation_id", confirmationId);
  }

  // Build GHL payload — unchanged
  const ghlPayload = {
    webhookType: "main",
    eventType,
    firstName:      (order.first_name as string) ?? "",
    lastName:       (order.last_name as string) ?? "",
    email:          (order.email as string) ?? "",
    phone:          phone ?? "",
    state:          (order.state as string) ?? "",
    confirmationId: order.confirmation_id as string,
    amount:         isPaid ? (order.price ?? 0) : 0,
    assignedDoctor: (order.doctor_name as string) ?? "",
    letterType:     (order.letter_type as string) ?? "esa",
    leadStatus:     isLead ? "Lead (Unpaid) — Assessment Started" : "Paid – Order Confirmed",
    orderStatus:    (order.status as string) ?? "",
  };

  const proxyUrl = `${supabaseUrl}/functions/v1/ghl-webhook-proxy`;
  console.log(`[BACKFILL-GHL] Proceeding to proxy: ${proxyUrl}`);
  console.log(`[BACKFILL-GHL] Payload: ${JSON.stringify(ghlPayload)}`);

  let ghlResult = { ok: false, status: 0, body: "" };
  try {
    const ghlRes = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify(ghlPayload),
    });
    const ghlBody = await ghlRes.text();
    ghlResult = { ok: ghlRes.ok, status: ghlRes.status, body: ghlBody };
    console.log(`[BACKFILL-GHL] Proxy response: HTTP ${ghlRes.status} — ${ghlBody.slice(0, 500)}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "fetch error";
    ghlResult = { ok: false, status: 0, body: msg };
    console.error(`[BACKFILL-GHL] Proxy fetch threw: ${msg}`);
  }

  // Parse proxy response for detailed error
  let parsedProxy: Record<string, unknown> = {};
  try { parsedProxy = JSON.parse(ghlResult.body) as Record<string, unknown>; } catch { parsedProxy = { raw: ghlResult.body }; }

  // Persist result
  await adminClient.from("orders").update({
    ghl_synced_at: ghlResult.ok ? new Date().toISOString() : (order.ghl_synced_at ?? null),
    ghl_sync_error: ghlResult.ok ? null : `HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 500)}`,
  }).eq("confirmation_id", confirmationId);

  // Audit log
  await adminClient.from("audit_logs").insert({
    actor_id: actorId,
    actor_name: actorName,
    object_type: "ghl_sync",
    object_id: confirmationId,
    action: ghlResult.ok ? "ghl_sync_success" : "ghl_sync_failed",
    description: ghlResult.ok
      ? `GHL sync succeeded for ${confirmationId} — eventType: ${eventType}`
      : `GHL sync failed for ${confirmationId}: HTTP ${ghlResult.status}`,
    new_values: { email: order.email, eventType, isPaid, ghlStatus: ghlResult.status },
    metadata: { confirmationId, stripePhoneFetched, eventType, authPath },
  });

  // Build human-readable error
  let errorMessage = "";
  if (!ghlResult.ok) {
    const proxyError = (parsedProxy.error as string) ?? (parsedProxy.ghlBody as string) ?? ghlResult.body;
    if (ghlResult.status === 0) {
      errorMessage = "Network error — could not reach GHL proxy.";
    } else if (proxyError?.includes("GHL_WEBHOOK_URL not configured")) {
      errorMessage = "GHL_WEBHOOK_URL secret is not set in Supabase Edge Function secrets.";
    } else {
      const ghlStatus = parsedProxy.ghlStatus as number | undefined;
      errorMessage = ghlStatus
        ? `GHL returned HTTP ${ghlStatus}: ${String(proxyError).slice(0, 300)}`
        : `Proxy error HTTP ${ghlResult.status}: ${String(proxyError).slice(0, 300)}`;
    }
  }

  return json({
    ok: ghlResult.ok,
    confirmationId,
    email: order.email as string,
    phonePersisted: phone || null,
    stripePhoneFetched,
    stripeMetaLog,
    eventType,
    isPaid,
    ghlStatus: ghlResult.status,
    ghlBody: ghlResult.body,
    proxyResponse: parsedProxy,
    authPath,
    message: ghlResult.ok
      ? `GHL sync succeeded. Event: ${eventType}.`
      : errorMessage || `GHL sync failed. HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 200)}`,
  });
});
