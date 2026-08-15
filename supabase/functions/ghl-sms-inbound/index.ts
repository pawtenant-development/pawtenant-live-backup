import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildInboundColumns,
  extractConversationId,
  extractProviderEventId,
  isDuplicateInsert,
  maskPhone,
  resolveInboundIdentity,
} from "../_shared/inboundIdentity.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Safely extract message text from GHL's varied payload structures ─────────
// GHL sometimes sends body as a plain string, sometimes as a nested object
// like { type: 2, body: "Yes" }, and sometimes as a JSON-encoded string of that.
function extractMessageBody(raw: unknown): string {
  if (raw === null || raw === undefined) return "(no message body)";

  // If it's already a plain string — check if it looks like a JSON object
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.body === "string" && parsed.body) return parsed.body;
        if (typeof parsed.text === "string" && parsed.text) return parsed.text;
        if (typeof parsed.content === "string" && parsed.content) return parsed.content;
        // If we parsed but found no recognized text field, return the raw string
        return trimmed;
      } catch {
        // Not valid JSON — use raw string as-is
      }
    }
    return trimmed || "(no message body)";
  }

  // If it's already a JS object (GHL sent it as nested JSON)
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.body === "string" && obj.body) return obj.body;
    if (typeof obj.text === "string" && obj.text) return obj.text;
    if (typeof obj.content === "string" && obj.content) return obj.content;
    // Fallback: stringify the whole thing so it's at least readable
    return JSON.stringify(raw);
  }

  return String(raw);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // §10: never log the raw payload — for an inbound SMS it contains the
  // customer's complete message body, and these logs are retained, searchable
  // and exportable. Log the KEY SHAPE instead, which is what the payload-probing
  // in `_shared/inboundIdentity.ts` actually needs for diagnosis.
  console.log("[GHL-SMS-INBOUND] payload keys:", Object.keys(payload).sort().join(","));

  // ── Extract phone ─────────────────────────────────────────────────────────
  const phone =
    (payload.phone as string) ||
    (payload.Phone as string) ||
    (payload.phoneNumber as string) ||
    (payload.from as string) ||
    null;

  // ── Extract message body — handles nested objects like {type:2, body:"Yes"} ──
  // GHL may nest the message in multiple fields; try each in priority order
  const rawMessage =
    payload.message ??     // GHL standard: "message" field (may be object or string)
    payload.body ??         // alt: "body" field
    payload.Message ??      // capitalized variant
    payload.messageBody ??  // some GHL versions
    payload.text ??         // fallback
    null;

  const message = extractMessageBody(rawMessage);

  // ── Extract contact name ───────────────────────────────────────────────────
  const contactName =
    `${(payload.firstName as string) ?? ""} ${(payload.lastName as string) ?? ""}`.trim() ||
    (payload.contactName as string) ||
    (payload.fullName as string) ||
    "Unknown";

  const contactEmail =
    (payload.email as string) ||
    (payload.Email as string) ||
    null;

  const ghlContactId =
    (payload.contactId as string) ||
    (payload.contact_id as string) ||
    null;

  // ── Identity, provider id and normalisation ──────────────────────────────
  // UNIFIED-ADMIN-COMMAND-CENTER-...-GHL-SYNC-001. This block used to
  //   * store `phone` verbatim (GHL sends display format, so the row became
  //     unreachable by every E.164 lookup),
  //   * use `.limit(1)` on a phone `ilike` and thereby ATTACH A GUESSED
  //     CUSTOMER when several share a number, and
  //   * put the CONTACT id in `twilio_sid` and call it a provider id — the same
  //     value for every message that contact ever sends, so there was no
  //     idempotency key at all.
  // All three now live in `_shared/inboundIdentity.ts` so this webhook and
  // `ghl-call-inbound` cannot drift apart again.
  const providerEventId = extractProviderEventId(payload);
  const conversationId = extractConversationId(payload);
  const identity = await resolveInboundIdentity(supabase, phone);

  // Email is a WEAKER signal than phone and is only consulted when the phone
  // produced no candidate at all. It is never used to override an `ambiguous`
  // phone verdict — that would reintroduce the guess by another route.
  let matchedOrderId = identity.orderId;
  let matchedConfirmationId = identity.confirmationId;
  if (identity.state === "unknown" && contactEmail) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, confirmation_id, email")
      .ilike("email", contactEmail)
      .limit(2);
    // Exactly one match, or nothing. Two customers behind one address is not a
    // resolution.
    if (orders && orders.length === 1) {
      matchedOrderId = orders[0].id;
      matchedConfirmationId = orders[0].confirmation_id;
    }
  }

  // ── Insert into communications table ─────────────────────────────────────
  const { error: insertError } = await supabase.from("communications").insert({
    order_id: matchedOrderId,
    confirmation_id: matchedConfirmationId,
    type: "sms_inbound",
    direction: "inbound",
    body: message,
    status: "received",
    sent_by: contactName,
    ...buildInboundColumns({
      type: "sms_inbound",
      rawPhone: phone,
      ourNumber: Deno.env.get("GHL_PHONE_NUMBER") ?? null,
      providerEventId,
      conversationId,
      contactId: ghlContactId,
    }),
  });

  // A replayed webhook loses the race on `communications_dedupe_key_uniq`. That
  // is the mechanism working, not a failure: acknowledge 200 so GHL stops
  // retrying, and do NOT write a second copy of the customer's message.
  if (insertError && isDuplicateInsert(insertError)) {
    console.log(`[GHL-SMS-INBOUND] duplicate webhook ignored — event ${providerEventId ?? "n/a"}`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (insertError) {
    console.error("[GHL-SMS-INBOUND] DB insert error:", insertError.message);
    return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── Update last_contacted_at if we matched an order ───────────────────────
  if (matchedOrderId) {
    await supabase
      .from("orders")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", matchedOrderId);
  }

  // §10: never log a message body. The previous line printed the first 100
  // characters of every inbound customer SMS into the function logs.
  console.log(
    `[GHL-SMS-INBOUND] ✅ inbound SMS from ${maskPhone(phone)} — identity: ${identity.state} — order: ${matchedOrderId ?? "unmatched"} — chars: ${message.length}`
  );

  return new Response(JSON.stringify({ ok: true, matched: !!matchedOrderId }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
