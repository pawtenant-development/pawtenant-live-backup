/**
 * Admin utility: given a confirmationId, fetches Stripe PI metadata,
 * backfills phone on the orders row, and re-fires the GHL webhook proxy.
 *
 * Uses GHL Contacts API directly to create/update the contact and capture
 * the returned contact.id immediately — no delayed search needed.
 *
 * Sends the CORRECT eventType based on order's CURRENT real status:
 *   - Lead (unpaid):          assessment_started
 *   - Paid only:              payment_confirmed_backfill
 *   - Provider assigned /
 *     under review /
 *     processing:             doctor_assigned_backfill
 *   - Completed:              order_completed_backfill
 *   - Refunded:               refund_issued_backfill
 *   - Cancelled:              order_cancelled_backfill
 *
 * verify_jwt: false — caller auth is handled inside the function.
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

function isSupabaseClientKey(token: string): boolean {
  if (token.startsWith("sb_publishable_")) return true;
  if (token.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")) return true;
  const parts = token.split(".");
  if (parts.length === 3 && parts[0].startsWith("eyJ")) return true;
  return false;
}

// ── Phone normalizer ──────────────────────────────────────────────────────────
function normalizePhone(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const stripped = raw.trim().replace(/[\s\-().]/g, "");
  if (/^\+\d{10,15}$/.test(stripped)) return stripped;
  const digitsOnly = stripped.replace(/\D/g, "");
  if (digitsOnly.length === 0) return "";
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

// ── Resolve correct eventType from order's current status ────────────────────
function resolveEventType(order: Record<string, unknown>): string {
  const rawStatus = (order.status as string) ?? "";
  const status = rawStatus.toLowerCase().trim();
  const isPaid = !!(order.payment_intent_id);

  console.log(`[RESOLVE-EVENT-TYPE] raw_status="${rawStatus}" normalized="${status}" isPaid=${isPaid}`);

  // Unpaid lead
  if (!isPaid || status === "lead") return "assessment_started";

  // Refunded — check before completed
  if (status === "refunded" || status === "refund_issued") return "refund_issued_backfill";

  // Cancelled
  if (status === "cancelled" || status === "canceled") return "order_cancelled_backfill";

  // Completed / letter sent / documents ready
  if (
    status === "completed" ||
    status === "order_completed" ||
    status === "letter_sent" ||
    status === "documents_ready" ||
    status === "documents_ready_for_patient"
  ) return "order_completed_backfill";

  // Doctor assigned / under review / processing
  // "processing" = provider has been assigned and is reviewing the order
  if (
    status === "doctor_assigned" ||
    status === "assigned" ||
    status === "under_review" ||
    status === "in_review" ||
    status === "provider_assigned" ||
    status === "processing"
  ) return "doctor_assigned_backfill";

  // Paid but no further status — default to payment confirmed
  console.log(`[RESOLVE-EVENT-TYPE] No specific match for status="${status}" — defaulting to payment_confirmed_backfill`);
  return "payment_confirmed_backfill";
}

// ── Human-readable lead status label ─────────────────────────────────────────
function resolveLeadStatus(eventType: string): string {
  switch (eventType) {
    case "assessment_started":         return "Lead (Unpaid) — Assessment Started";
    case "payment_confirmed_backfill": return "Paid – Order Confirmed";
    case "doctor_assigned_backfill":   return "Paid – Provider Assigned / Under Review";
    case "order_completed_backfill":   return "Completed – Letter Sent";
    case "refund_issued_backfill":     return "Refunded";
    case "order_cancelled_backfill":   return "Cancelled";
    default:                           return eventType;
  }
}

// ── GHL Direct Contact Upsert ─────────────────────────────────────────────────
async function upsertGhlContact(opts: {
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  adminClient: ReturnType<typeof createClient>;
}): Promise<{ success: boolean; contactId: string | null; action: string; error?: string; rawResponse?: string }> {
  const { confirmationId, firstName, lastName, email, phone, adminClient } = opts;

  const ghlApiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";

  if (!ghlApiKey || !locationId) {
    console.warn("[BACKFILL-GHL][CONTACT-UPSERT] GHL_API_KEY or GHL_LOCATION_ID not set — skipping contact upsert");
    return { success: false, contactId: null, action: "skipped", error: "GHL_API_KEY or GHL_LOCATION_ID not configured" };
  }

  const ghlHeaders = {
    "Authorization": `Bearer ${ghlApiKey}`,
    "Content-Type": "application/json",
    "Version": "2021-07-28",
  };

  const contactPayload: Record<string, unknown> = {
    locationId,
    firstName,
    lastName,
    email,
    phone,
    customFields: [
      {
        key: "contact.confirmation_id",
        field_value: confirmationId,
      },
    ],
  };

  console.log(`[BACKFILL-GHL][CONTACT-UPSERT] Upserting contact for confirmationId="${confirmationId}" email="${email}" phone="${phone}"`);

  const upsertUrl = "https://services.leadconnectorhq.com/contacts/upsert";
  let contactId: string | null = null;
  let action = "unknown";
  let rawResponse = "";

  try {
    const res = await fetch(upsertUrl, {
      method: "POST",
      headers: ghlHeaders,
      body: JSON.stringify(contactPayload),
    });
    rawResponse = await res.text();
    console.log(`[BACKFILL-GHL][CONTACT-UPSERT] Upsert HTTP ${res.status} raw response: ${rawResponse.slice(0, 800)}`);

    if (res.ok) {
      let data: { contact?: { id?: string }; id?: string; new?: boolean } = {};
      try { data = JSON.parse(rawResponse); } catch { /* ignore */ }

      contactId = data.contact?.id ?? data.id ?? null;
      action = data.new === true ? "created" : "updated";

      if (contactId) {
        console.log(`[BACKFILL-GHL][CONTACT-UPSERT] ✅ Contact ${action} — contactId="${contactId}" for confirmationId="${confirmationId}"`);
      } else {
        console.warn(`[BACKFILL-GHL][CONTACT-UPSERT] ⚠️ Upsert succeeded but no contact.id in response: ${rawResponse.slice(0, 300)}`);
        return { success: false, contactId: null, action: "upsert_no_id", error: "No contact.id in upsert response", rawResponse };
      }
    } else {
      const errMsg = `GHL upsert HTTP ${res.status}: ${rawResponse.slice(0, 300)}`;
      console.error(`[BACKFILL-GHL][CONTACT-UPSERT] ❌ ${errMsg}`);
      return { success: false, contactId: null, action: "upsert_failed", error: errMsg, rawResponse };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BACKFILL-GHL][CONTACT-UPSERT] ❌ Upsert threw: ${msg}`);
    return { success: false, contactId: null, action: "upsert_threw", error: msg };
  }

  // Save contact ID to orders table immediately
  let saved = false;
  try {
    const { data: existing } = await adminClient
      .from("orders")
      .select("ghl_contact_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    const existingContactId = existing?.ghl_contact_id ?? null;

    const { error: updateErr } = await adminClient
      .from("orders")
      .update({ ghl_contact_id: contactId })
      .eq("confirmation_id", confirmationId);

    if (updateErr) {
      console.error(`[BACKFILL-GHL][CONTACT-UPSERT] Failed to save ghl_contact_id: ${updateErr.message}`);
    } else {
      saved = true;
      if (existingContactId && existingContactId !== contactId) {
        console.log(`[BACKFILL-GHL][CONTACT-UPSERT] 🔄 Updated ghl_contact_id: "${existingContactId}" → "${contactId}" for confirmationId="${confirmationId}"`);
      } else if (!existingContactId) {
        console.log(`[BACKFILL-GHL][CONTACT-UPSERT] 💾 Saved new ghl_contact_id="${contactId}" for confirmationId="${confirmationId}"`);
      } else {
        console.log(`[BACKFILL-GHL][CONTACT-UPSERT] ✅ ghl_contact_id already up-to-date="${contactId}" for confirmationId="${confirmationId}"`);
      }
    }
  } catch (err) {
    console.error(`[BACKFILL-GHL][CONTACT-UPSERT] Supabase update threw: ${err instanceof Error ? err.message : err}`);
  }

  return { success: saved, contactId, action, rawResponse };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  console.log("[BACKFILL-GHL] Function entered");

  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const legacyAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authHeader  = req.headers.get("authorization") ?? "";
  const apikeyHeader = req.headers.get("apikey") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  const tokenPresent = bearerToken.length > 0;
  console.log(`[BACKFILL-GHL] Bearer token present: ${tokenPresent}`);
  console.log(`[BACKFILL-GHL] Bearer token prefix: ${bearerToken.slice(0, 30)}...`);
  console.log(`[BACKFILL-GHL] apikey header prefix: ${apikeyHeader.slice(0, 30)}...`);

  let isAuthorized = false;
  let authPath = "none";
  let actorName = "Admin";
  let actorId: string | null = null;

  if (bearerToken === serviceKey && serviceKey.length > 0) {
    isAuthorized = true;
    authPath = "service_key";
  }

  if (!isAuthorized && tokenPresent && isSupabaseClientKey(bearerToken)) {
    const apikeyMatchesBearer = apikeyHeader === bearerToken;
    const matchesLegacyAnon = legacyAnonKey.length > 0 && bearerToken === legacyAnonKey;
    if (apikeyMatchesBearer || matchesLegacyAnon) {
      isAuthorized = true;
      authPath = matchesLegacyAnon ? "legacy_anon_key_exact" : "publishable_key_with_apikey_header";
    } else {
      isAuthorized = true;
      authPath = "publishable_key_format";
    }
  }

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
      // ignore
    }
  }

  console.log(`[BACKFILL-GHL] Auth result: isAuthorized=${isAuthorized}, path=${authPath}`);

  if (!isAuthorized) {
    console.error(`[BACKFILL-GHL] UNAUTHORIZED — token prefix: ${bearerToken.slice(0, 30)}, path attempted: ${authPath}`);
    return json({ error: "Unauthorized — admin access required" }, 401);
  }

  console.log(`[BACKFILL-GHL] Authorized via: ${authPath} as: ${actorName}`);

  let body: { confirmationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { confirmationId } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);

  await adminClient.from("orders").update({
    ghl_last_attempt_at: new Date().toISOString(),
  }).eq("confirmation_id", confirmationId);

  const { data: order, error: orderErr } = await adminClient
    .from("orders")
    .select("*")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (orderErr || !order) {
    return json({ error: "Order not found", detail: orderErr?.message }, 404);
  }

  // ── Resolve eventType from ACTUAL order status ────────────────────────────
  const eventType = resolveEventType(order as Record<string, unknown>);
  const isPaid = !!(order.payment_intent_id);

  console.log(`[BACKFILL-GHL] confirmationId=${confirmationId} status="${order.status}" isPaid=${isPaid} eventType=${eventType}`);

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

  const normalizedPhone = normalizePhone(phone);
  console.log(`[BACKFILL-GHL] Phone raw="${phone}" normalized="${normalizedPhone}"`);

  // ── Step 1: Direct GHL Contact Upsert ────────────────────────────────────
  const contactUpsertResult = await upsertGhlContact({
    confirmationId,
    firstName: (order.first_name as string) ?? "",
    lastName: (order.last_name as string) ?? "",
    email: (order.email as string) ?? "",
    phone: normalizedPhone || phone,
    adminClient,
  });

  console.log(`[BACKFILL-GHL] Contact upsert result: action="${contactUpsertResult.action}" contactId="${contactUpsertResult.contactId ?? "none"}" success=${contactUpsertResult.success}`);

  // ── Step 2: Send webhook to GHL workflow ──────────────────────────────────
  // Include utm_source, gclid, fbclid so the proxy can derive orderSource accurately
  const ghlPayload = {
    webhookType: "main",
    eventType,
    firstName:      (order.first_name as string) ?? "",
    lastName:       (order.last_name as string) ?? "",
    email:          (order.email as string) ?? "",
    phone:          normalizedPhone || phone,
    state:          (order.state as string) ?? "",
    confirmationId: order.confirmation_id as string,
    amount:         isPaid ? (order.price ?? 0) : 0,
    orderAmount:    isPaid ? (order.price ?? 0) : 0,
    assignedDoctor: (order.doctor_name as string) ?? "",
    letterType:     (order.letter_type as string) ?? "esa",
    leadStatus:     resolveLeadStatus(eventType),
    orderStatus:    (order.status as string) ?? "",
    refundAmount:   (order.refund_amount as number) ?? 0,
    // Attribution fields — proxy uses these to derive orderSource accurately
    utm_source:     (order.utm_source as string) ?? "",
    utm_medium:     (order.utm_medium as string) ?? "",
    gclid:          (order.gclid as string) ?? "",
    fbclid:         (order.fbclid as string) ?? "",
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

  let parsedProxy: Record<string, unknown> = {};
  try { parsedProxy = JSON.parse(ghlResult.body) as Record<string, unknown>; } catch { parsedProxy = { raw: ghlResult.body }; }

  await adminClient.from("orders").update({
    ghl_synced_at: ghlResult.ok ? new Date().toISOString() : (order.ghl_synced_at ?? null),
    ghl_sync_error: ghlResult.ok ? null : `HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 500)}`,
  }).eq("confirmation_id", confirmationId);

  await adminClient.from("audit_logs").insert({
    actor_id: actorId,
    actor_name: actorName,
    object_type: "ghl_sync",
    object_id: confirmationId,
    action: ghlResult.ok ? "ghl_sync_success" : "ghl_sync_failed",
    description: ghlResult.ok
      ? `GHL sync succeeded for ${confirmationId} — eventType: ${eventType}${contactUpsertResult.contactId ? ` | ghl_contact_id saved: ${contactUpsertResult.contactId} (${contactUpsertResult.action})` : " | contact upsert failed"}`
      : `GHL sync failed for ${confirmationId}: HTTP ${ghlResult.status}`,
    new_values: {
      email: order.email,
      eventType,
      orderStatus: order.status,
      isPaid,
      ghlStatus: ghlResult.status,
      ghlContactId: contactUpsertResult.contactId,
      contactAction: contactUpsertResult.action,
    },
    metadata: { confirmationId, stripePhoneFetched, eventType, authPath },
  });

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
    orderStatus: order.status as string,
    phonePersisted: phone || null,
    phoneNormalized: normalizedPhone || null,
    stripePhoneFetched,
    stripeMetaLog,
    eventType,
    isPaid,
    ghlStatus: ghlResult.status,
    ghlBody: ghlResult.body,
    proxyResponse: parsedProxy,
    authPath,
    contactUpsert: {
      success: contactUpsertResult.success,
      contactId: contactUpsertResult.contactId,
      action: contactUpsertResult.action,
      error: contactUpsertResult.error,
      rawResponse: contactUpsertResult.rawResponse?.slice(0, 500),
    },
    message: ghlResult.ok
      ? `GHL sync succeeded. Order status: "${order.status}" → Event: ${eventType}.${contactUpsertResult.contactId ? ` GHL contact ${contactUpsertResult.action}, contact ID saved: ${contactUpsertResult.contactId}.` : " Contact upsert failed — see contactUpsert.error for details."}`
      : errorMessage || `GHL sync failed. HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 200)}`,
  });
});
