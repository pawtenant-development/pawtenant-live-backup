/**
 * send-meta-browser-event — Phase-1 CAPI mirror for browser-fired Lead and
 * InitiateCheckout events. Receives the SAME event_id the Pixel just fired
 * so Meta can dedup the pair into a single conversion.
 *
 * Strict guarantees:
 *   - Only handles non-Purchase events (Purchase still flows through
 *     send-meta-capi-event). This function never writes to public.orders.
 *   - No DB writes at all (audit-log insert is best-effort, may be added
 *     later). Failures here cannot block any user-facing flow.
 *   - Stateless. Reads no Supabase tables. Reads only request body +
 *     standard proxy headers (X-Forwarded-For, User-Agent).
 *
 * Required secrets (already set in TEST + LIVE for send-meta-capi-event):
 *   META_PIXEL_ID
 *   META_CAPI_ACCESS_TOKEN
 *
 * Request body shape:
 *   {
 *     event_name:        "Lead" | "InitiateCheckout",
 *     event_id:          string                 // shared with Pixel for dedup
 *     email?:            string | null,
 *     value?:            number | null,
 *     currency?:         string | null,         // default "USD"
 *     content_name?:     string | null,
 *     fbp?:              string | null,         // _fbp cookie value
 *     event_source_url?: string | null,         // current page URL
 *     test_event_code?:  string | null,
 *   }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
const META_CAPI_ACCESS_TOKEN = Deno.env.get("META_CAPI_ACCESS_TOKEN");
const META_CAPI_URL = (pixelId: string) =>
  `https://graph.facebook.com/v19.0/${pixelId}/events`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const normalized = input.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MetaResponse {
  events_received?: number;
  fbtrace_id?: string;
  messages?: string[];
  error?: { message?: string; code?: number; error_subcode?: number };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
    console.error("[send-meta-browser-event] Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN");
    return json({ ok: false, error: "Missing CAPI secrets" }, 500);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: {
    event_name?: string;
    event_id?: string;
    email?: string | null;
    value?: number | null;
    currency?: string | null;
    content_name?: string | null;
    fbp?: string | null;
    event_source_url?: string | null;
    test_event_code?: string | null;
  } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const eventName = (body.event_name ?? "").trim();
  const eventId   = (body.event_id   ?? "").trim();

  // ── Validate ────────────────────────────────────────────────────────────
  if (eventName !== "Lead" && eventName !== "InitiateCheckout") {
    return json({ ok: false, error: "event_name must be 'Lead' or 'InitiateCheckout'" }, 400);
  }
  if (!eventId) {
    return json({ ok: false, error: "event_id is required" }, 400);
  }

  // ── Build user_data ─────────────────────────────────────────────────────
  const userData: Record<string, unknown> = {};
  if (body.email) userData.em = [await sha256Hex(body.email)];
  if (body.fbp)   userData.fbp = body.fbp;

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent");
  if (clientIp)  userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  // ── Build event ─────────────────────────────────────────────────────────
  const customData: Record<string, unknown> = {
    currency: (body.currency ?? "USD").toUpperCase(),
  };
  if (typeof body.value === "number" && Number.isFinite(body.value)) {
    customData.value = body.value;
  }
  if (body.content_name) customData.content_name = body.content_name;

  const eventData: Record<string, unknown> = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    event_id:      eventId,
    action_source: "website",
    user_data:     userData,
    custom_data:   customData,
  };
  if (body.event_source_url) {
    eventData.event_source_url = body.event_source_url;
  }

  const requestBody: Record<string, unknown> = {
    data: [eventData],
    access_token: META_CAPI_ACCESS_TOKEN,
  };
  if (body.test_event_code) {
    requestBody.test_event_code = body.test_event_code;
  }

  const url = META_CAPI_URL(META_PIXEL_ID);
  console.info(`[send-meta-browser-event] sending ${eventName} event_id=${eventId} has_email=${!!body.email} has_fbp=${!!body.fbp}`);

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(requestBody),
    });
    const httpStatus = res.status;
    const rawText = await res.text();
    let parsed: MetaResponse;
    try { parsed = JSON.parse(rawText) as MetaResponse; }
    catch { return json({ ok: false, http_status: httpStatus, raw: rawText.slice(0, 500) }, 502); }

    if (!res.ok) {
      console.warn(`[send-meta-browser-event] Meta ${httpStatus}: ${parsed.error?.message ?? rawText.slice(0, 200)}`);
      return json({
        ok: false,
        http_status: httpStatus,
        events_received: parsed.events_received ?? 0,
        fbtrace_id: parsed.fbtrace_id ?? null,
        error: parsed.error?.message ?? `Meta API ${httpStatus}`,
      }, 502);
    }

    return json({
      ok: true,
      event_name: eventName,
      event_id:   eventId,
      events_received: parsed.events_received ?? 0,
      fbtrace_id:      parsed.fbtrace_id ?? null,
      messages:        parsed.messages ?? [],
    });
  } catch (err) {
    console.error(`[send-meta-browser-event] fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
