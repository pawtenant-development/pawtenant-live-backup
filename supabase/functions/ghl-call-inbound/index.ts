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

  // §10: key shape only. The raw payload carries the caller's full number and,
  // on some GHL workflow versions, a recording URL.
  console.log("[GHL-CALL-INBOUND] payload keys:", Object.keys(payload).sort().join(","));

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

  // ── Identity, provider id and normalisation ──────────────────────────────
  // UNIFIED-ADMIN-COMMAND-CENTER-...-GHL-SYNC-001. THIS is the writer that
  // produced all 570 LIVE `call_inbound` rows carrying "(832) 726-0357" in
  // `phone_from`: the GHL payload value went in verbatim, so every E.164-keyed
  // lookup — conversation identity, admin search, GHL contact match — missed
  // them, which is exactly the reported "(832) calls appear in PawTenant but
  // not correctly in GHL".
  //
  // The `.limit(1)` phone match it replaced also attached a GUESSED customer
  // whenever several orders shared a number.
  const providerEventId = extractProviderEventId(payload);
  const conversationId = extractConversationId(payload);
  const identity = await resolveInboundIdentity(supabase, phone);

  let matchedOrderId = identity.orderId;
  let matchedConfirmationId = identity.confirmationId;
  if (identity.state === "unknown" && contactEmail) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, confirmation_id, email")
      .ilike("email", contactEmail)
      .limit(2);
    if (orders && orders.length === 1) {
      matchedOrderId = orders[0].id;
      matchedConfirmationId = orders[0].confirmation_id;
    }
  }

  // ── Build a summary body for the call log ────────────────────────────────
  // §10: the recording URL is NOT written into the body. It has its own column
  // (`recording_url`) which the Admin UI renders behind an explicit control;
  // inlining it here put a media credential into a free-text field that gets
  // previewed, searched and copied around.
  const bodyParts: string[] = [];
  if (contactName && contactName !== "Unknown Caller") bodyParts.push(`From: ${contactName}`);
  if (callStatus) bodyParts.push(`Status: ${callStatus}`);
  if (durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    bodyParts.push(`Duration: ${mins}m ${secs}s`);
  }
  const body = bodyParts.join(" | ") || "Inbound call received";

  // ── Insert into communications table ─────────────────────────────────────
  const { error: insertError } = await supabase.from("communications").insert({
    order_id: matchedOrderId,
    confirmation_id: matchedConfirmationId,
    type: "call_inbound",
    direction: "inbound",
    body,
    duration_seconds: durationSeconds > 0 ? durationSeconds : null,
    status: callStatus,
    recording_url: recordingUrl,
    sent_by: contactName,
    // The spread supplies phone_from (NORMALISED), phone_to, twilio_sid,
    // provider_event_id, ghl_conversation_id, ghl_sync_state and dedupe_key.
    // Conflict resolved toward the spread: it already sets `twilio_sid`, and the
    // TEST-side `source` column does not exist on LIVE (see the note in
    // `_shared/inboundIdentity.ts`).
    ...buildInboundColumns({
      type: "call_inbound",
      rawPhone: phone,
      ourNumber: Deno.env.get("GHL_PHONE_NUMBER") ?? null,
      providerEventId,
      conversationId,
      contactId: ghlContactId,
    }),
  });

  // Replayed webhook: the unique `dedupe_key` index rejected the second copy.
  // Acknowledge so GHL stops retrying; do not log a duplicate call.
  if (insertError && isDuplicateInsert(insertError)) {
    console.log(`[GHL-CALL-INBOUND] duplicate webhook ignored — event ${providerEventId ?? "n/a"}`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

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

  // §10: masked number only — the full caller number is PII and these logs are
  // retained and searchable.
  console.log(
    `[GHL-CALL-INBOUND] ✅ inbound call from ${maskPhone(phone)} — status: ${callStatus} — identity: ${identity.state} — order: ${matchedOrderId ?? "unmatched"}`
  );

  return new Response(JSON.stringify({ ok: true, matched: !!matchedOrderId }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
