import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuditActor, maskPhone } from "../_shared/auditActor.ts";
import { issueResumeLink } from "../_shared/resumeLink.ts";
// The TEST tester-number containment guard now lives inside sendGhlSms, so it
// applies to EVERY caller of the canonical path — including the automated
// recovery sequence — rather than only to the endpoint that remembered to
// import it. On LIVE it is inert (it stands down outside the TEST project).
import { sendGhlSms } from "../_shared/ghlSms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://pawtenant.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// GHL API v2 credentials — set these in Supabase Edge Function Secrets:
//   GHL_API_KEY        → your GHL Private Integration / API key
//   GHL_LOCATION_ID   → your GHL sub-account Location ID
//   GHL_PHONE_NUMBER  → the GHL-owned number (e.g. +14099655885)
// GHL_API_KEY / GHL_LOCATION_ID are read inside `_shared/ghlSms.ts`; only the
// sending number is needed here, for the communications row.
const GHL_FROM_NUMBER  = Deno.env.get("GHL_PHONE_NUMBER") ?? "";

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

  const { orderId, confirmationId, toPhone, message } = body;

  // PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §16: `sentBy` in the
  // request body is a forgeable actor name and is ignored. The employee is
  // resolved from the caller's JWT; an automated caller is recorded as System.
  const actor = await resolveAuditActor(req, supabase);
  const sentBy = actor.name;

  if (!toPhone || !message) {
    return new Response(JSON.stringify({ ok: false, error: "toPhone and message are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ── {resume_url} is resolved HERE, server-side ───────────────────────────
  // ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §F/§G
  //
  // Recovery SMS templates used to hardcode `pawtenant.com/assessment?resume={order_id}`
  // — a confirmation id acting as a credential, sitting in the customer's SMS
  // history forever. Templates now carry the literal `{resume_url}` placeholder,
  // which the admin sees un-substituted in the compose box, and which is replaced
  // at SEND time with an expiring, single-use, order-bound link.
  //
  // Consequence: the raw token never enters an admin browser, is never copyable
  // from the console, and is never stored in the text the admin edited.
  let outboundMessage = message;
  if (/\{resume_url\}/.test(outboundMessage)) {
    if (confirmationId) {
      const issued = await issueResumeLink({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        siteUrl: SITE_URL,
        confirmationId,
        isPsd: /(-|_)psd/i.test(confirmationId),
        purpose: "resume_assessment",
        ttlMinutes: 1440,
        createdBy: "ghl-send-sms",
      });
      outboundMessage = outboundMessage.replace(/\{resume_url\}/g, issued.url);
    } else {
      // No order to bind a credential to — refuse rather than send a dead or
      // credential-free placeholder to a customer.
      return new Response(
        JSON.stringify({ ok: false, error: "This template needs a linked order to generate a secure resume link." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
  }

  // ── Provider call ─────────────────────────────────────────────────────────
  // LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002.
  //
  // Phone normalisation, contact resolve/create and the Conversations send used
  // to be written out inline here. They now live in `_shared/ghlSms.ts`, because
  // the automated recovery sequence was moved onto this same provider and two
  // hand-maintained copies of the GHL protocol is exactly how the two paths
  // drifted apart in the first place. One implementation, one classification
  // table, two callers.
  //
  // `checkDnd: false` is deliberate and preserves this endpoint's existing
  // behaviour: this is an interactive one-off send an admin is watching, and
  // adding a provider-side DND round trip here would change a working LIVE
  // admin workflow. The AUTOMATED sequence sets `checkDnd: true`, where an
  // unnoticed STOP would otherwise be re-messaged on a schedule.
  const smsRes = await sendGhlSms({
    toPhone,
    message: outboundMessage,
    checkDnd: false,
    contactSource: "Admin Portal",
  });

  const phone = smsRes.phone || toPhone;
  const ghlContactId = smsRes.contactId;
  const ghlMessageId = smsRes.messageId;

  // Refusals that never reached the provider keep their original contract: an
  // explicit status, and NO communications row — there was no attempt to log.
  if (smsRes.failureCode === "test_guard_blocked") {
    console.warn("[GHL-SEND-SMS] TEST tester guard refused send to non-approved number");
    return new Response(
      JSON.stringify({ ok: false, blocked_by: "test_tester_guard", error: smsRes.failureReason }),
      { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
  if (smsRes.failureCode === "provider_not_configured") {
    return new Response(
      JSON.stringify({ ok: false, error: "GHL_API_KEY and GHL_LOCATION_ID secrets not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
  if (smsRes.failureCode === "contact_unavailable") {
    return new Response(
      JSON.stringify({ ok: false, error: "Could not find or create GHL contact for this phone number" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  if (!smsRes.ok) {
    const errMsg = smsRes.failureReason ?? "GHL send failed";
    console.error("[GHL-SEND-SMS] ❌ GHL send failed:", smsRes.failureCode, errMsg);

    // Log failed attempt to communications
    const { data: failedComm } = await supabase.from("communications").insert({
      order_id: orderId ?? null,
      confirmation_id: confirmationId ?? null,
      type: "sms_outbound",
      direction: "outbound",
      body: outboundMessage,
      phone_from: GHL_FROM_NUMBER || null,
      phone_to: phone,
      status: "failed",
      sent_by: sentBy,
      twilio_sid: ghlContactId ? `ghl:${ghlContactId}` : null,
      failure_code: smsRes.failureCode,
      failure_reason: smsRes.failureReason,
    }).select("id").maybeSingle();

    const failedCommId = (failedComm as { id?: string } | null)?.id ?? null;
    await supabase.from("audit_logs").insert({
      actor_id: actor.id, actor_name: actor.name, actor_role: actor.role,
      actor_type: actor.type, category: "communications",
      source: actor.isHuman ? "admin_portal" : "system",
      object_type: "order", object_id: confirmationId ?? orderId ?? null,
      order_id: orderId ?? null, entity_type: "communication",
      entity_id: failedCommId, communication_id: failedCommId,
      action: "customer_sms_sent",
      description: `SMS to the customer (${maskPhone(phone)}) FAILED: ${errMsg}`,
      metadata: {
        channel: "sms", direction: "outbound", recipient_type: "customer",
        recipient_masked: maskPhone(phone), delivery_status: "failed",
        error: errMsg, confirmation_id: confirmationId ?? null,
      },
    });

    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  console.log(`[GHL-SEND-SMS] ✅ Sent via GHL — messageId: ${ghlMessageId}, to: ${phone}`);

  // ── Step 3: Log success to communications table ───────────────────────────
  const { data: commRow } = await supabase.from("communications").insert({
    order_id: orderId ?? null,
    confirmation_id: confirmationId ?? null,
    type: "sms_outbound",
    direction: "outbound",
    body: outboundMessage,
    phone_from: GHL_FROM_NUMBER || null,
    phone_to: phone,
    status: "sent",
    sent_by: sentBy,
    twilio_sid: ghlMessageId ? `ghl:${ghlMessageId}` : null,
  }).select("id").maybeSingle();

  // Audit the send with the RESOLVED actor. The message body is not duplicated
  // here — `communications` is authoritative and the audit row links to it (§19).
  const commId = (commRow as { id?: string } | null)?.id ?? null;
  await supabase.from("audit_logs").insert({
    actor_id: actor.id, actor_name: actor.name, actor_role: actor.role,
    actor_type: actor.type, category: "communications",
    source: actor.isHuman ? "admin_portal" : "system",
    object_type: "order", object_id: confirmationId ?? orderId ?? null,
    order_id: orderId ?? null, entity_type: "communication",
    entity_id: commId, communication_id: commId,
    action: "customer_sms_sent",
    description: `${actor.name} sent an SMS to the customer (${maskPhone(phone)}).`,
    metadata: {
      channel: "sms", direction: "outbound", recipient_type: "customer",
      recipient_masked: maskPhone(phone), delivery_status: "sent",
      ghl_message_id: ghlMessageId, confirmation_id: confirmationId ?? null,
    },
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
