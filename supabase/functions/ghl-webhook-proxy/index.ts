import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getGhlUrl(webhookType: string | undefined): string {
  if (webhookType === "network") return Deno.env.get("GHL_NETWORK_WEBHOOK_URL") ?? "";
  if (webhookType === "comms") return Deno.env.get("GHL_COMMS_WEBHOOK_URL") ?? Deno.env.get("GHL_WEBHOOK_URL") ?? "";
  return Deno.env.get("GHL_WEBHOOK_URL") ?? "";
}

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

function buildTags(opts: {
  event?: string;
  confirmationId?: string;
  addonServices?: string[];
  price?: number;
  explicitTags?: string[];
}): string[] {
  const tags: string[] = [];
  const isPSD = (opts.confirmationId ?? "").toUpperCase().includes("-PSD");
  tags.push(isPSD ? "PSD Order" : "ESA Order");

  const event = opts.event ?? "";

  if (["payment_confirmed", "checkout.session.completed", "payment_intent.succeeded", "payment_confirmed_backfill"].includes(event)) {
    tags.push("Lead (Paid)", "Payment Confirmed");
  } else if (event === "lead_created" || event === "assessment_started") {
    tags.push("Lead (Unpaid)", "Assessment Started");
  } else if (event === "doctor_assigned" || event === "doctor_assigned_backfill") {
    tags.push("Paid (Assigned)", "Doctor Assigned");
  } else if (
    event === "documents_ready_for_patient" ||
    event === "letter_sent" ||
    event === "order_completed" ||
    event === "order_completed_backfill"
  ) {
    tags.push("Letter Sent", "Completed");
  } else if (["refund_issued", "order_refunded", "refunded", "refund_issued_backfill"].includes(event)) {
    tags.push("Refunded");
  } else if (["order_cancelled", "cancelled", "order_cancelled_backfill"].includes(event)) {
    tags.push("Cancelled");
  }

  if (Array.isArray(opts.addonServices) && opts.addonServices.length > 0) tags.push("VIP");
  if (typeof opts.price === "number" && opts.price > 130) tags.push("Priority Order");
  if (Array.isArray(opts.explicitTags)) {
    opts.explicitTags.forEach((t) => { if (t && !tags.includes(t)) tags.push(t); });
  }
  return tags;
}

function deriveOrderStatus(event: string): string {
  const map: Record<string, string> = {
    "lead_created": "Lead (Unpaid)",
    "assessment_started": "Lead (Unpaid)",
    "payment_confirmed": "Paid — Awaiting Assignment",
    "checkout.session.completed": "Paid — Awaiting Assignment",
    "payment_intent.succeeded": "Paid — Awaiting Assignment",
    "payment_confirmed_backfill": "Paid — Awaiting Assignment",
    "doctor_assigned": "Under Review",
    "doctor_assigned_backfill": "Under Review",
    "documents_ready_for_patient": "Completed",
    "letter_sent": "Completed",
    "order_completed": "Completed",
    "order_completed_backfill": "Completed",
    "refund_issued": "Refunded",
    "order_refunded": "Refunded",
    "refund_issued_backfill": "Refunded",
    "order_cancelled": "Cancelled",
    "cancelled": "Cancelled",
    "order_cancelled_backfill": "Cancelled",
  };
  return map[event] ?? event;
}

/**
 * Derive orderSource from utm_source / gclid / fbclid fields.
 */
function deriveOrderSource(payload: Record<string, unknown>): string {
  const existing = (payload.orderSource as string) ?? "";
  if (existing && existing !== "Direct / Unknown") return existing;

  const utmSource = ((payload.utmSource as string) ?? (payload.utm_source as string) ?? "").toLowerCase().trim();
  const utmMedium = ((payload.utmMedium as string) ?? (payload.utm_medium as string) ?? "").toLowerCase().trim();
  const gclid = ((payload.gclid as string) ?? "").trim();
  const fbclid = ((payload.fbclid as string) ?? "").trim();

  if (gclid) return "Google Ads";
  if (fbclid) return "Facebook";

  if (utmSource === "google") {
    const paidMediums = ["cpc", "paid", "ppc", "paidsearch", "paid_search", "google_ads"];
    if (paidMediums.includes(utmMedium)) return "Google Ads";
    return "Google Organic";
  }
  if (utmSource === "facebook" || utmSource === "fb") return "Facebook";
  if (utmSource === "instagram" || utmSource === "ig") return "Instagram";
  if (utmSource === "tiktok" || utmSource === "tik_tok") return "TikTok";
  if (utmSource === "email" || utmMedium === "email") return "Email";
  if (utmSource === "bing" || utmSource === "microsoft") return "Bing Ads";
  if (utmSource) return utmSource.charAt(0).toUpperCase() + utmSource.slice(1);

  return "Direct / Unknown";
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
): Promise<{ ok: boolean; status: number; body: string; attempts: number }> {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      lastStatus = res.status;
      try { lastBody = await res.text(); } catch { lastBody = "(unreadable)"; }
      if (res.ok) return { ok: true, status: lastStatus, body: lastBody, attempts: attempt };
      if (lastStatus >= 400 && lastStatus < 500) return { ok: false, status: lastStatus, body: lastBody, attempts: attempt };
    } catch (err) {
      lastBody = err instanceof Error ? err.message : "fetch threw";
      lastStatus = 0;
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return { ok: false, status: lastStatus, body: lastBody, attempts: maxAttempts };
}

async function logSyncAttempt(opts: {
  confirmationId: string;
  eventType: string;
  status: "success" | "failed";
  ghlStatusCode: number;
  errorMessage: string | null;
  attempts: number;
  triggeredBy: string;
  payloadSummary: Record<string, unknown>;
}): Promise<void> {
  if (!opts.confirmationId || opts.confirmationId === "(no confirmationId)") return;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("ghl_sync_logs").insert({
      confirmation_id: opts.confirmationId,
      event_type: opts.eventType,
      status: opts.status,
      ghl_status_code: opts.ghlStatusCode,
      error_message: opts.errorMessage,
      attempts: opts.attempts,
      triggered_by: opts.triggeredBy,
      payload_summary: opts.payloadSummary,
    });
  } catch (e) {
    console.error("[GHL-PROXY] Failed to write sync log:", e);
  }
}

async function updateOrderSyncStatus(confirmationId: string, success: boolean, errorMsg?: string): Promise<void> {
  if (!confirmationId || confirmationId === "(no confirmationId)") return;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (success) {
      await supabase.from("orders").update({ ghl_synced_at: new Date().toISOString(), ghl_sync_error: null }).eq("confirmation_id", confirmationId);
    } else {
      await supabase.from("orders").update({ ghl_sync_error: errorMsg?.slice(0, 500) ?? "Unknown error" }).eq("confirmation_id", confirmationId);
    }
  } catch { /* non-critical */ }
}

async function upsertGhlContact(opts: {
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ success: boolean; contactId: string | null; action: string; error?: string }> {
  const { confirmationId, firstName, lastName, email, phone } = opts;

  const ghlApiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";

  if (!ghlApiKey || !locationId) {
    return { success: false, contactId: null, action: "skipped", error: "GHL_API_KEY or GHL_LOCATION_ID not configured" };
  }

  if (!confirmationId || confirmationId === "(no confirmationId)") {
    return { success: false, contactId: null, action: "skipped", error: "No confirmationId" };
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
      { key: "contact.confirmation_id", field_value: confirmationId },
    ],
  };

  const upsertUrl = "https://services.leadconnectorhq.com/contacts/upsert";
  let contactId: string | null = null;
  let action = "unknown";

  try {
    const res = await fetch(upsertUrl, {
      method: "POST",
      headers: ghlHeaders,
      body: JSON.stringify(contactPayload),
    });
    const rawBody = await res.text();

    if (res.ok) {
      let data: { contact?: { id?: string }; id?: string; new?: boolean } = {};
      try { data = JSON.parse(rawBody); } catch { /* ignore */ }
      contactId = data.contact?.id ?? data.id ?? null;
      action = data.new === true ? "created" : "updated";
      if (!contactId) return { success: false, contactId: null, action: "upsert_no_id", error: "No contact.id in upsert response" };
    } else {
      return { success: false, contactId: null, action: "upsert_failed", error: `GHL upsert HTTP ${res.status}: ${rawBody.slice(0, 300)}` };
    }
  } catch (err) {
    return { success: false, contactId: null, action: "upsert_threw", error: err instanceof Error ? err.message : String(err) };
  }

  let saved = false;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: updateErr } = await supabase.from("orders").update({ ghl_contact_id: contactId }).eq("confirmation_id", confirmationId);
    if (!updateErr) saved = true;
  } catch { /* non-critical */ }

  return { success: saved, contactId, action };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const { webhookType, ...payload } = body;
  const authHeader = req.headers.get("authorization") ?? "";
  const triggeredBy = authHeader.includes("Bearer ") ? "admin" : "system";

  const ghlUrl = getGhlUrl(webhookType as string | undefined);
  if (!ghlUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: "GHL_WEBHOOK_URL not configured in Supabase secrets." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const eventName      = ((payload.eventType as string) ?? (payload.event as string) ?? "").trim();
  const rawFirst       = ((payload.firstName as string) ?? "").trim();
  const rawLast        = ((payload.lastName as string) ?? "").trim();
  const rawEmail       = ((payload.email as string) ?? "").trim().toLowerCase();
  const rawPhone       = (payload.phone as string) ?? "";
  const phone          = normalizePhone(rawPhone);
  const state          = ((payload.state as string) ?? (payload.patientState as string) ?? "").trim();
  const confirmationId = ((payload.confirmationId as string) ?? "").trim();

  const rawAmount = payload.amount ?? payload.orderTotal ?? payload.price;
  const amount: number = typeof rawAmount === "number" ? rawAmount : typeof rawAmount === "string" ? parseFloat(rawAmount) || 0 : 0;

  const rawRefund = payload.refundAmount ?? payload.refund_amount;
  const refundAmount: number = typeof rawRefund === "number" ? rawRefund : typeof rawRefund === "string" ? parseFloat(rawRefund) || 0 : 0;

  const fullName = [rawFirst, rawLast].filter(Boolean).join(" ").trim() ||
    (rawEmail ? rawEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

  const tags = buildTags({
    event: eventName,
    confirmationId,
    addonServices: payload.addonServices as string[],
    price: amount,
    explicitTags: payload.tags as string[],
  });

  const orderSource = deriveOrderSource(payload);

  // ── Clean payload: 12 core fields + tags + fullName for comm sync ──────────
  // No pipeline fields. No letterType.
  // GHL workflows should update contact custom fields using these values.
  const ghlPayload: Record<string, unknown> = {
    // ── 12 core fields ──
    confirmationId:   confirmationId,
    orderStatus:      (payload.orderStatus as string) ?? deriveOrderStatus(eventName),
    orderAmount:      amount,
    assignedDoctor:   (payload.assignedDoctor as string) ?? "",
    state:            state,
    firstName:        rawFirst || fullName.split(" ")[0] || "",
    lastName:         rawLast  || fullName.split(" ").slice(1).join(" ") || "",
    email:            rawEmail,
    phone:            phone,
    orderSource:      orderSource,
    eventType:        eventName,
    refundAmount:     refundAmount,

    // ── Comm sync fields ──
    // fullName and tags allow GHL workflows to update contact records
    // and keep communication logs in sync between GHL and the admin portal.
    fullName:         fullName,
    tags:             tags.join(", "),
  };

  const emailForLog = rawEmail || "(no email)";
  const confIdForLog = confirmationId || "(no confirmationId)";

  console.log(
    `[GHL-PROXY] ▶ Sending to GHL` +
    `\n  eventType      = "${eventName}"` +
    `\n  confirmationId = "${confIdForLog}"` +
    `\n  email          = "${emailForLog}"` +
    `\n  firstName      = "${ghlPayload.firstName}"` +
    `\n  lastName       = "${ghlPayload.lastName}"` +
    `\n  phone          = "${phone}"` +
    `\n  state          = "${state}"` +
    `\n  orderAmount    = ${amount}` +
    `\n  orderStatus    = "${ghlPayload.orderStatus}"` +
    `\n  assignedDoctor = "${ghlPayload.assignedDoctor}"` +
    `\n  orderSource    = "${orderSource}"` +
    `\n  refundAmount   = ${refundAmount}` +
    `\n  tags           = "${ghlPayload.tags}"`
  );

  let contactUpsertResult: { success: boolean; contactId: string | null; action: string; error?: string } = {
    success: false, contactId: null, action: "skipped",
  };

  if (confirmationId && confirmationId !== "(no confirmationId)" && rawEmail) {
    contactUpsertResult = await upsertGhlContact({
      confirmationId,
      firstName: (ghlPayload.firstName as string) || "",
      lastName: (ghlPayload.lastName as string) || "",
      email: rawEmail,
      phone,
    });
  }

  const result = await fetchWithRetry(
    ghlUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghlPayload),
    },
    3,
  );

  const payloadSummary: Record<string, unknown> = {
    eventType: eventName,
    confirmationId: confIdForLog,
    email: emailForLog,
    state,
    orderAmount: amount,
    orderStatus: ghlPayload.orderStatus,
    assignedDoctor: ghlPayload.assignedDoctor,
    orderSource,
    refundAmount,
    tags: ghlPayload.tags,
    webhookType: webhookType ?? "main",
    ghlContactId: contactUpsertResult.contactId,
    contactAction: contactUpsertResult.action,
  };

  if (!result.ok) {
    const errMsg = `GHL HTTP ${result.status} after ${result.attempts} attempt(s): ${result.body.slice(0, 300)}`;
    console.error(`[GHL-PROXY] ❌ ${errMsg}`);
    await updateOrderSyncStatus(confirmationId, false, errMsg);
    await logSyncAttempt({
      confirmationId: confIdForLog,
      eventType: eventName,
      status: "failed",
      ghlStatusCode: result.status,
      errorMessage: errMsg.slice(0, 500),
      attempts: result.attempts,
      triggeredBy,
      payloadSummary,
    });
    return new Response(
      JSON.stringify({ ok: false, ghlStatus: result.status, error: errMsg, contactUpsert: contactUpsertResult }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  updateOrderSyncStatus(confirmationId, true).catch(() => {});
  logSyncAttempt({
    confirmationId: confIdForLog,
    eventType: eventName,
    status: "success",
    ghlStatusCode: result.status,
    errorMessage: null,
    attempts: result.attempts,
    triggeredBy,
    payloadSummary,
  }).catch(() => {});

  return new Response(
    JSON.stringify({
      ok: true,
      ghlStatus: result.status,
      attempts: result.attempts,
      confirmationId: confIdForLog,
      email: emailForLog,
      tagsSent: tags,
      orderStatus: ghlPayload.orderStatus,
      assignedDoctor: ghlPayload.assignedDoctor,
      orderSource,
      refundAmount,
      contactUpsert: {
        success: contactUpsertResult.success,
        contactId: contactUpsertResult.contactId,
        action: contactUpsertResult.action,
        error: contactUpsertResult.error,
      },
    }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
