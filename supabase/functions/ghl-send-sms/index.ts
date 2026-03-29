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

// GHL API v2 credentials — set these in Supabase Edge Function Secrets:
//   GHL_API_KEY        → your GHL Private Integration / API key
//   GHL_LOCATION_ID   → your GHL sub-account Location ID
//   GHL_PHONE_NUMBER  → the GHL-owned number (e.g. +14099655885)
const GHL_API_KEY      = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_LOCATION_ID  = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_FROM_NUMBER  = Deno.env.get("GHL_PHONE_NUMBER") ?? "";
const GHL_API_BASE     = "https://services.leadconnectorhq.com";

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

  let body: {
    orderId?: string;
    confirmationId?: string;
    toPhone: string;
    message: string;
    sentBy?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { orderId, confirmationId, toPhone, message, sentBy = "Admin" } = body;

  if (!toPhone || !message) {
    return new Response(JSON.stringify({ ok: false, error: "toPhone and message are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return new Response(
      JSON.stringify({ ok: false, error: "GHL_API_KEY and GHL_LOCATION_ID secrets not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Normalize phone to E.164
  let phone = toPhone.replace(/\D/g, "");
  if (phone.length === 10) phone = "1" + phone;
  if (!phone.startsWith("+")) phone = "+" + phone;

  // ── Step 1: Look up or create GHL contact for this phone number ──────────
  let ghlContactId: string | null = null;

  try {
    // Search contact by phone
    const searchRes = await fetch(
      `${GHL_API_BASE}/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(phone)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
        },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json() as { contacts?: Array<{ id: string }> };
      if (searchData.contacts && searchData.contacts.length > 0) {
        ghlContactId = searchData.contacts[0].id;
        console.log(`[GHL-SEND-SMS] Found existing GHL contact: ${ghlContactId}`);
      }
    }

    // If not found, create a new contact
    if (!ghlContactId) {
      const createRes = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          phone,
          source: "Admin Portal",
        }),
      });

      if (createRes.ok) {
        const createData = await createRes.json() as { contact?: { id: string } };
        ghlContactId = createData.contact?.id ?? null;
        console.log(`[GHL-SEND-SMS] Created GHL contact: ${ghlContactId}`);
      } else {
        const errText = await createRes.text();
        console.warn(`[GHL-SEND-SMS] Could not create contact: ${errText}`);
      }
    }
  } catch (err) {
    console.warn("[GHL-SEND-SMS] Contact lookup/create error:", String(err));
  }

  // ── Step 2: Send SMS via GHL Conversations API ───────────────────────────
  if (!ghlContactId) {
    return new Response(
      JSON.stringify({ ok: false, error: "Could not find or create GHL contact for this phone number" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let ghlMessageId: string | null = null;

  const sendRes = await fetch(`${GHL_API_BASE}/conversations/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "SMS",
      contactId: ghlContactId,
      locationId: GHL_LOCATION_ID,
      fromNumber: GHL_FROM_NUMBER || undefined,
      message,
    }),
  });

  const sendData = await sendRes.json() as {
    messageId?: string;
    id?: string;
    message?: string;
    msg?: string;
    error?: string;
  };

  if (!sendRes.ok) {
    const errMsg = sendData.message ?? sendData.msg ?? sendData.error ?? `GHL HTTP ${sendRes.status}`;
    console.error("[GHL-SEND-SMS] ❌ GHL send failed:", errMsg, sendData);

    // Log failed attempt to communications
    await supabase.from("communications").insert({
      order_id: orderId ?? null,
      confirmation_id: confirmationId ?? null,
      type: "sms_outbound",
      direction: "outbound",
      body: message,
      phone_from: GHL_FROM_NUMBER || null,
      phone_to: phone,
      status: "failed",
      sent_by: sentBy,
      twilio_sid: ghlContactId ? `ghl:${ghlContactId}` : null,
    });

    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  ghlMessageId = sendData.messageId ?? sendData.id ?? null;
  console.log(`[GHL-SEND-SMS] ✅ Sent via GHL — messageId: ${ghlMessageId}, to: ${phone}`);

  // ── Step 3: Log success to communications table ───────────────────────────
  await supabase.from("communications").insert({
    order_id: orderId ?? null,
    confirmation_id: confirmationId ?? null,
    type: "sms_outbound",
    direction: "outbound",
    body: message,
    phone_from: GHL_FROM_NUMBER || null,
    phone_to: phone,
    status: "sent",
    sent_by: sentBy,
    twilio_sid: ghlMessageId ? `ghl:${ghlMessageId}` : null,
  });

  // Update last_contacted_at
  const now = new Date().toISOString();
  if (orderId) {
    await supabase.from("orders").update({ last_contacted_at: now }).eq("id", orderId);
  } else if (confirmationId) {
    await supabase.from("orders").update({ last_contacted_at: now }).eq("confirmation_id", confirmationId);
  }

  return new Response(
    JSON.stringify({ ok: true, messageId: ghlMessageId, ghlContactId }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
