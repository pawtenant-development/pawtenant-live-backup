import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GHL_MAIN_FALLBACK =
  "https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/d1962d95-66b5-4622-a16d-6d711c0bdd9b";
const GHL_NETWORK_FALLBACK =
  "https://services.leadconnectorhq.com/hooks/bCKXTfd8drHJ5M55g4Gn/webhook-trigger/cfdc1278-5813-46c9-901e-39165cf0f1f3";

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

  // ── Route to correct GHL webhook URL ─────────────────────────────────────
  let ghlUrl: string;
  if (webhookType === "network") {
    ghlUrl = Deno.env.get("GHL_NETWORK_WEBHOOK_URL") ?? GHL_NETWORK_FALLBACK;
  } else if (webhookType === "comms") {
    ghlUrl = Deno.env.get("GHL_COMMS_WEBHOOK_URL") ?? Deno.env.get("GHL_WEBHOOK_URL") ?? GHL_MAIN_FALLBACK;
  } else {
    ghlUrl = Deno.env.get("GHL_WEBHOOK_URL") ?? GHL_MAIN_FALLBACK;
  }

  // ── Normalize contact fields — ensure name/email are never empty ──────────
  const rawFirst = (payload.firstName as string) ?? "";
  const rawLast  = (payload.lastName as string) ?? "";
  const rawEmail = (payload.email as string) ?? "";

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
    price: payload.orderTotal as number ?? payload.price as number,
    explicitTags: payload.tags as string[],
  });

  // ── Build the normalized GHL payload ────────────────────────────────────
  const normalizedPayload = {
    ...payload,
    // Always send proper contact fields
    firstName: rawFirst || fullName.split(" ")[0] || "",
    lastName: rawLast || fullName.split(" ").slice(1).join(" ") || "",
    name: fullName,                          // GHL uses 'name' for contact display name
    email: rawEmail,
    phone: payload.phone ?? "",
    // Comprehensive tags
    tags: builtTags,
    // Status field for GHL custom fields
    orderStatus: (payload.event as string) ?? (payload.leadStatus as string) ?? "",
    confirmationId: payload.confirmationId ?? "",
    state: payload.state ?? payload.patientState ?? "",
    // Event metadata
    eventType: (payload.event as string) ?? (payload.eventType as string) ?? "",
    // Letter type explicit
    letterType: (payload.letterType as string) ?? ((payload.confirmationId as string ?? "").toUpperCase().includes("-PSD") ? "psd" : "esa"),
  };

  const email = rawEmail || "(no email)";
  const confirmationId = (payload.confirmationId as string) || "(no confirmationId)";

  console.log(
    `[GHL-PROXY] Firing → type="${webhookType ?? "main"}" event="${normalizedPayload.eventType}" email="${email}" id="${confirmationId}" tags=${JSON.stringify(builtTags)} url="${ghlUrl}"`
  );

  let ghlStatus = 0;
  let ghlBody = "";

  try {
    const ghlResponse = await fetch(ghlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedPayload),
    });

    ghlStatus = ghlResponse.status;
    try { ghlBody = await ghlResponse.text(); } catch { ghlBody = "(could not read body)"; }

    if (!ghlResponse.ok) {
      console.error(`[GHL-PROXY] ❌ GHL returned HTTP ${ghlStatus} for email="${email}" id="${confirmationId}". Body: ${ghlBody}`);
      return new Response(
        JSON.stringify({ ok: false, ghlStatus, ghlBody, error: `GHL returned HTTP ${ghlStatus}`, email, confirmationId }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GHL-PROXY] ✅ GHL accepted HTTP ${ghlStatus} for email="${email}" id="${confirmationId}". Tags: ${builtTags.join(", ")}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GHL upstream fetch error";
    console.error(`[GHL-PROXY] ❌ fetch threw for email="${email}" id="${confirmationId}": ${msg}`);
    return new Response(JSON.stringify({ ok: false, error: msg, email, confirmationId }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, ghlStatus, ghlBody, email, confirmationId, tagsSent: builtTags }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
