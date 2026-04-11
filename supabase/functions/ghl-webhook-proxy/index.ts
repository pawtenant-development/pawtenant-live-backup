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
  letterType?: string;
  addonServices?: string[];
  price?: number;
  explicitTags?: string[];
}): string[] {
  const tags: string[] = [];
  const isPSD = opts.letterType === "psd" || (opts.confirmationId ?? "").toUpperCase().includes("-PSD");
  tags.push(isPSD ? "PSD Order" : "ESA Order");

  const event = opts.event ?? "";
  if (["payment_confirmed", "checkout.session.completed", "payment_intent.succeeded", "payment_confirmed_backfill"].includes(event)) {
    tags.push("Lead (Paid)", "Payment Confirmed");
  } else if (event === "lead_created" || event === "assessment_started") {
    tags.push("Lead (Unpaid)", "Assessment Started");
  } else if (event === "doctor_assigned") {
    tags.push("Paid (Assigned)", "Doctor Assigned");
  } else if (event === "documents_ready_for_patient" || event === "letter_sent" || event === "order_completed") {
    tags.push("Letter Sent", "Completed");
  } else if (["refund_issued", "order_refunded", "refunded"].includes(event)) {
    tags.push("Refunded");
  } else if (["order_cancelled", "cancelled"].includes(event)) {
    tags.push("Cancelled");
  }

  if (Array.isArray(opts.addonServices) && opts.addonServices.length > 0) tags.push("VIP");
  if (typeof opts.price === "number" && opts.price > 130) tags.push("Priority Order");
  if (Array.isArray(opts.explicitTags)) {
    opts.explicitTags.forEach((t) => { if (t && !tags.includes(t)) tags.push(t); });
  }
  return tags;
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
    console.error(`[GHL-PROXY] ❌ GHL_WEBHOOK_URL not configured`);
    return new Response(
      JSON.stringify({ ok: false, error: "GHL_WEBHOOK_URL not configured in Supabase secrets." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Resolve fields
  const eventName = ((payload.eventType as string) ?? (payload.event as string) ?? "").trim();
  const rawFirst  = ((payload.firstName as string) ?? "").trim();
  const rawLast   = ((payload.lastName as string) ?? "").trim();
  const rawEmail  = ((payload.email as string) ?? "").trim().toLowerCase();
  const rawPhone  = (payload.phone as string) ?? "";
  const phone     = normalizePhone(rawPhone);
  const state     = ((payload.state as string) ?? (payload.patientState as string) ?? "").trim();
  const confirmationId = ((payload.confirmationId as string) ?? "").trim();

  const rawAmount = payload.amount ?? payload.orderTotal ?? payload.price;
  const amount: number = typeof rawAmount === "number" ? rawAmount : typeof rawAmount === "string" ? parseFloat(rawAmount) || 0 : 0;

  const fullName = [rawFirst, rawLast].filter(Boolean).join(" ").trim() ||
    (rawEmail ? rawEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

  const tags = buildTags({
    event: eventName,
    confirmationId,
    letterType: payload.letterType as string,
    addonServices: payload.addonServices as string[],
    price: amount,
    explicitTags: payload.tags as string[],
  });

  // ── CLEAN MINIMAL PAYLOAD — only fields GHL workflow actually uses ─────────
  // GHL webhook triggers work best with flat string/number fields.
  // Tags sent as comma-separated string (GHL standard format).
  // Pipeline fields removed — GHL workflows handle stage movement internally.
  const ghlPayload: Record<string, unknown> = {
    eventType:      eventName,
    firstName:      rawFirst || fullName.split(" ")[0] || "",
    lastName:       rawLast  || fullName.split(" ").slice(1).join(" ") || "",
    email:          rawEmail,
    phone:          phone,
    state:          state,
    confirmationId: confirmationId,
    amount:         amount,
    // Additional context as flat strings
    fullName:       fullName,
    tags:           tags.join(", "),   // ← comma-separated string, NOT array
    letterType:     (payload.letterType as string) ?? (confirmationId.toUpperCase().includes("-PSD") ? "psd" : "esa"),
    assignedDoctor: (payload.assignedDoctor as string) ?? "",
    leadStatus:     (payload.leadStatus as string) ?? "",
    orderStatus:    (payload.orderStatus as string) ?? eventName,
  };

  const emailForLog = rawEmail || "(no email)";
  const confIdForLog = confirmationId || "(no confirmationId)";

  console.log(
    `[GHL-PROXY] ▶ Sending to GHL` +
    `\n  webhookType    = "${webhookType ?? "main"}"` +
    `\n  eventType      = "${eventName}"` +
    `\n  email          = "${emailForLog}"` +
    `\n  phone_raw      = "${rawPhone}"` +
    `\n  phone_e164     = "${phone}"` +
    `\n  firstName      = "${ghlPayload.firstName}"` +
    `\n  lastName       = "${ghlPayload.lastName}"` +
    `\n  state          = "${state}"` +
    `\n  confirmationId = "${confIdForLog}"` +
    `\n  amount         = ${amount}` +
    `\n  tags           = "${ghlPayload.tags}"` +
    `\n  ghlUrl         = "${ghlUrl.slice(0, 60)}..."`
  );

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
    email: emailForLog,
    state,
    amount,
    tags: ghlPayload.tags,
    webhookType: webhookType ?? "main",
  };

  if (!result.ok) {
    const errMsg = `GHL HTTP ${result.status} after ${result.attempts} attempt(s): ${result.body.slice(0, 300)}`;
    console.error(`[GHL-PROXY] ❌ ${errMsg} | email="${emailForLog}" confirmId="${confIdForLog}"`);
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
      JSON.stringify({ ok: false, ghlStatus: result.status, ghlBody: result.body, attempts: result.attempts, error: errMsg, email: emailForLog, confirmationId: confIdForLog }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  console.log(`[GHL-PROXY] ✅ GHL accepted HTTP ${result.status} (${result.attempts} attempt(s)) | email="${emailForLog}" confirmId="${confIdForLog}"`);

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
    JSON.stringify({ ok: true, ghlStatus: result.status, ghlBody: result.body, attempts: result.attempts, email: emailForLog, confirmationId: confIdForLog, tagsSent: tags }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
