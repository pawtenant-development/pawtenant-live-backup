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

  console.log("[GHL-CALL-INBOUND] Received payload:", JSON.stringify(payload));

  // ── Extract fields from GHL webhook payload ───────────────────────────────
  const phone =
    (payload.phone as string) ||
    (payload.Phone as string) ||
    (payload.phoneNumber as string) ||
    (payload.from as string) ||
    (payload.callerPhone as string) ||
    null;

  const callStatus =
    (payload.callStatus as string) ||
    (payload.status as string) ||
    (payload.CallStatus as string) ||
    "completed";

  const durationRaw =
    (payload.duration as string | number) ||
    (payload.Duration as string | number) ||
    (payload.callDuration as string | number) ||
    0;
  const durationSeconds = typeof durationRaw === "string" ? parseInt(durationRaw, 10) : Number(durationRaw);

  const recordingUrl =
    (payload.recordingUrl as string) ||
    (payload.RecordingUrl as string) ||
    (payload.recording as string) ||
    null;

  const contactName =
    `${(payload.firstName as string) ?? ""} ${(payload.lastName as string) ?? ""}`.trim() ||
    (payload.contactName as string) ||
    (payload.fullName as string) ||
    "Unknown Caller";

  const contactEmail =
    (payload.email as string) ||
    (payload.Email as string) ||
    null;

  const ghlContactId =
    (payload.contactId as string) ||
    (payload.contact_id as string) ||
    null;

  // ── Try to match this inbound call to an existing order ───────────────────
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

  // If no match by phone, try by email
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

  // ── Build a summary body for the call log ────────────────────────────────
  const bodyParts: string[] = [];
  if (contactName && contactName !== "Unknown Caller") bodyParts.push(`From: ${contactName}`);
  if (phone) bodyParts.push(`Phone: ${phone}`);
  if (callStatus) bodyParts.push(`Status: ${callStatus}`);
  if (durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    bodyParts.push(`Duration: ${mins}m ${secs}s`);
  }
  if (recordingUrl) bodyParts.push(`Recording: ${recordingUrl}`);
  const body = bodyParts.join(" | ") || "Inbound call received";

  // ── Insert into communications table ─────────────────────────────────────
  const { error: insertError } = await supabase.from("communications").insert({
    order_id: matchedOrderId,
    confirmation_id: matchedConfirmationId,
    type: "call_inbound",
    direction: "inbound",
    body,
    phone_from: phone,
    phone_to: Deno.env.get("GHL_PHONE_NUMBER") ?? null,
    duration_seconds: durationSeconds > 0 ? durationSeconds : null,
    status: callStatus,
    recording_url: recordingUrl,
    sent_by: contactName,
    twilio_sid: ghlContactId ? `ghl:${ghlContactId}` : null,
  });

  if (insertError) {
    console.error("[GHL-CALL-INBOUND] DB insert error:", insertError.message);
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
    `[GHL-CALL-INBOUND] ✅ Logged inbound call from ${phone ?? "unknown"} — status: ${callStatus} — order: ${matchedOrderId ?? "unmatched"}`
  );

  return new Response(JSON.stringify({ ok: true, matched: !!matchedOrderId }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
