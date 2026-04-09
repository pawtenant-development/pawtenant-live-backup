import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── GHL webhook URLs loaded from Supabase secrets — never hardcoded ──────────
function getGhlUrl(webhookType: string | undefined): string {
  if (webhookType === "network") {
    return Deno.env.get("GHL_NETWORK_WEBHOOK_URL") ?? "";
  }
  if (webhookType === "comms") {
    return Deno.env.get("GHL_COMMS_WEBHOOK_URL") ?? Deno.env.get("GHL_WEBHOOK_URL") ?? "";
  }
  return Deno.env.get("GHL_WEBHOOK_URL") ?? "";
}

// ─── Normalize phone to E.164 format ─────────────────────────────────────────
// GHL "Create/Update Contact" requires E.164 (e.g. +14155551234).
// Without the + prefix, GHL rejects the contact with:
//   "no differentiation field value… Email or Phone"
// This function handles all common raw formats:
//   "4155551234"        → "+14155551234"  (10-digit US, add +1)
//   "14155551234"       → "+14155551234"  (11-digit with country code, add +)
//   "+14155551234"      → "+14155551234"  (already E.164, passthrough)
//   "(415) 555-1234"    → "+14155551234"  (formatted US number)
//   "415-555-1234"      → "+14155551234"  (dashed US number)
//   ""  / null / undef  → ""              (empty — no phone provided)
function normalizePhone(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";

  // Strip everything except digits and leading +
  const stripped = raw.trim().replace(/[\s\-().]/g, "");

  // Already valid E.164
  if (/^\+\d{10,15}$/.test(stripped)) return stripped;

  // Strip any non-digit characters for processing
  const digitsOnly = stripped.replace(/\D/g, "");

  if (digitsOnly.length === 0) return "";

  // 10-digit US number → add +1 country code
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;

  // 11-digit starting with 1 → US number with country code, add +
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;

  // For any other length, prepend + and hope for the best (international numbers)
  return `+${digitsOnly}`;
}

// ─── Build comprehensive GHL tags from order context ─────────────────────────
function buildOrderTags(opts: {
  event?: string;
  confirmationId?: string;
  letterType?: string;
  addonServices?: string[];
  price?: number;
  explicitTags?: string[];
}): string[] {
  const tags: string[] = [];

  // ── Letter type (ESA vs PSD) ──────────────────────────────────────────
  const isPSD =
    opts.letterType === "psd" ||
    (opts.confirmationId ?? "").toUpperCase().includes("-PSD");
  tags.push(isPSD ? "PSD Order" : "ESA Order");

  // ── Order status tag based on event ──────────────────────────────────
  const event = opts.event ?? "";
  if (event === "payment_confirmed" || event === "checkout.session.completed" || event === "payment_intent.succeeded") {
    tags.push("Lead (Paid)", "Paid (Unassigned)", "Payment Confirmed");
  } else if (event === "lead_created" || event === "assessment_started") {
    tags.push("Lead (Unpaid)", "Assessment Started");
  } else if (event === "doctor_assigned") {
    tags.push("Paid (Assigned)", "Pending Review");
  } else if (event === "letter_sent" || event === "order_completed") {
    tags.push("Letter Sent", "Completed");
  } else if (event === "order_refunded" || event === "refunded") {
    tags.push("Refunded", "Closed");
  } else if (event === "order_cancelled" || event === "cancelled") {
    tags.push("Cancelled", "Closed");
  }

  // ── VIP tag if add-on services ────────────────────────────────────────
  if (Array.isArray(opts.addonServices) && opts.addonServices.length > 0) {
    tags.push("VIP", `Add-ons: ${opts.addonServices.length}`);
  }

  // ── Priority tag if price > $130 ─────────────────────────────────────
  if (typeof opts.price === "number" && opts.price > 130) {
    tags.push("Priority Order");
  }

  // ── Merge any explicit caller-supplied tags ───────────────────────────
  if (Array.isArray(opts.explicitTags)) {
    opts.explicitTags.forEach((t) => {
      if (t && !tags.includes(t)) tags.push(t);
    });
  }

  return tags;
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { webhookType, ...payload } = body;

  // ── Resolve GHL URL from secrets ─────────────────────────────────────────
  const ghlUrl = getGhlUrl(webhookType as string | undefined);

  if (!ghlUrl) {
    console.error(`[GHL-PROXY] ❌ No GHL webhook URL configured for type="${webhookType ?? "main"}". Set GHL_WEBHOOK_URL / GHL_NETWORK_WEBHOOK_URL / GHL_COMMS_WEBHOOK_URL in Supabase secrets.`);
    return new Response(
      JSON.stringify({ ok: false, error: `GHL webhook URL not configured for type "${webhookType ?? "main"}". Set the secret in Supabase Edge Function secrets.` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // ── Normalize contact fields ──────────────────────────────────────────────
  const rawFirst = (payload.firstName as string) ?? "";
  const rawLast  = (payload.lastName as string) ?? "";
  const rawEmail = ((payload.email as string) ?? "").trim().toLowerCase();

  // Normalize phone to E.164 — this is the root cause of GHL contact creation failures.
  // GHL requires E.164 format (+14155551234). Raw user input like "4155551234" is rejected
  // with "no differentiation field value… Email or Phone" even when email IS present,
  // because GHL tries to match the phone first and fails on non-E.164 format.
  const rawPhone = (payload.phone as string) ?? "";
  const normalizedPhone = normalizePhone(rawPhone);

  // Build full name with smart fallback from email prefix
  const fullName =
    [rawFirst, rawLast].filter(Boolean).join(" ").trim() ||
    (rawEmail ? rawEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

  // ── Build comprehensive tags ─────────────────────────────────────────────
  const builtTags = buildOrderTags({
    event: (payload.event as string) ?? (payload.eventType as string),
    confirmationId: payload.confirmationId as string,
    letterType: payload.letterType as string,
    addonServices: payload.addonServices as string[],
    price: (payload.orderTotal as number) ?? (payload.price as number),
    explicitTags: payload.tags as string[],
  });

  // ── Build the normalized GHL payload ─────────────────────────────────────
  // IMPORTANT: GHL expects a FLAT JSON object — no nesting.
  // email must be a plain lowercase string.
  // phone must be E.164 format string.
  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    firstName: rawFirst || fullName.split(" ")[0] || "",
    lastName: rawLast || fullName.split(" ").slice(1).join(" ") || "",
    name: fullName,
    email: rawEmail,                // plain lowercase string
    phone: normalizedPhone,         // E.164 format: +14155551234
    tags: builtTags,
    orderStatus: (payload.event as string) ?? (payload.leadStatus as string) ?? "",
    confirmationId: payload.confirmationId ?? "",
    state: payload.state ?? payload.patientState ?? "",
    eventType: (payload.event as string) ?? (payload.eventType as string) ?? "",
    letterType: (payload.letterType as string) ?? ((payload.confirmationId as string ?? "").toUpperCase().includes("-PSD") ? "psd" : "esa"),
  };

  const emailForLog = rawEmail || "(no email)";
  const confirmationId = (payload.confirmationId as string) || "(no confirmationId)";
  const phoneForLog = normalizedPhone || "(no phone)";

  // ── Log outgoing payload for debugging ───────────────────────────────────
  console.log(
    `[GHL-PROXY] ▶ Outgoing payload to GHL` +
    `\n  type        = "${webhookType ?? "main"}"` +
    `\n  event       = "${normalizedPayload.eventType}"` +
    `\n  email       = "${emailForLog}"` +
    `\n  phone_raw   = "${rawPhone}"` +
    `\n  phone_e164  = "${phoneForLog}"` +
    `\n  firstName   = "${normalizedPayload.firstName}"` +
    `\n  lastName    = "${normalizedPayload.lastName}"` +
    `\n  confirmId   = "${confirmationId}"` +
    `\n  tags        = ${JSON.stringify(builtTags)}` +
    `\n  fullPayload = ${JSON.stringify(normalizedPayload)}`
  );

  let ghlStatus = 0;
  let ghlBody = "";

  try {
    const ghlResponse = await fetch(ghlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(normalizedPayload),
    });

    ghlStatus = ghlResponse.status;
    try { ghlBody = await ghlResponse.text(); } catch { ghlBody = "(could not read body)"; }

    // ── Log GHL response ────────────────────────────────────────────────
    if (!ghlResponse.ok) {
      console.error(
        `[GHL-PROXY] ❌ GHL returned HTTP ${ghlStatus}` +
        `\n  email     = "${emailForLog}"` +
        `\n  phone     = "${phoneForLog}"` +
        `\n  confirmId = "${confirmationId}"` +
        `\n  body      = ${ghlBody}`
      );
      return new Response(
        JSON.stringify({ ok: false, ghlStatus, ghlBody, error: `GHL returned HTTP ${ghlStatus}`, email: emailForLog, phone: phoneForLog, confirmationId }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[GHL-PROXY] ✅ GHL accepted HTTP ${ghlStatus}` +
      `\n  email     = "${emailForLog}"` +
      `\n  phone     = "${phoneForLog}"` +
      `\n  confirmId = "${confirmationId}"` +
      `\n  tags      = ${builtTags.join(", ")}` +
      `\n  response  = ${ghlBody}`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GHL upstream fetch error";
    console.error(
      `[GHL-PROXY] ❌ fetch threw` +
      `\n  email     = "${emailForLog}"` +
      `\n  phone     = "${phoneForLog}"` +
      `\n  confirmId = "${confirmationId}"` +
      `\n  error     = ${msg}`
    );
    return new Response(JSON.stringify({ ok: false, error: msg, email: emailForLog, phone: phoneForLog, confirmationId }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, ghlStatus, ghlBody, email: emailForLog, phone: phoneForLog, confirmationId, tagsSent: builtTags }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
