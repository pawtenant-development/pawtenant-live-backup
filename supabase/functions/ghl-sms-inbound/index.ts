import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  console.log("[GHL-SMS-INBOUND] Received payload:", JSON.stringify(payload));

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

  // ── Try to match this inbound SMS to an existing order ───────────────────
  let matchedOrderId: string | null = null;
  let matchedConfirmationId: string | null = null;

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const { data: orders } = await supabase
      .from("orders")
      .select("id, confirmation_id, phone")
      .ilike("phone", `%${cleanPhone.slice(-10)}`)
      .limit(1);

    if (orders && orders.length > 0) {
      matchedOrderId = orders[0].id;
      matchedConfirmationId = orders[0].confirmation_id;
    }
  }

  // Fallback: try matching by email
  if (!matchedOrderId && contactEmail) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, confirmation_id, email")
      .ilike("email", contactEmail)
      .limit(1);

    if (orders && orders.length > 0) {
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
    phone_from: phone,
    phone_to: Deno.env.get("GHL_PHONE_NUMBER") ?? null,
    status: "received",
    sent_by: contactName,
    twilio_sid: ghlContactId ? `ghl:${ghlContactId}` : null,
  });

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

  console.log(
    `[GHL-SMS-INBOUND] ✅ Logged inbound SMS from ${phone ?? "unknown"} — order: ${matchedOrderId ?? "unmatched"} — body: "${message.slice(0, 100)}"`
  );

  return new Response(JSON.stringify({ ok: true, matched: !!matchedOrderId }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
