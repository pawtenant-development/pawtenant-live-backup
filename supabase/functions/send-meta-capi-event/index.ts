/**
 * send-meta-capi-event — Meta Conversions API (CAPI) Purchase event sender.
 *
 * Sends a server-side Purchase event to Meta's Conversions API.
 * Designed to mirror the frontend pixel event for deduplication.
 *
 * Deduplication: event_id = "purchase_{confirmationId}"
 * This MUST match the eventID used in metaPixel.ts fireMetaPurchase().
 *
 * Required secrets:
 *   META_PIXEL_ID         — your Pixel ID (e.g. 2970753196590228)
 *   META_CAPI_ACCESS_TOKEN — your CAPI access token from Meta Events Manager
 *
 * Modes:
 *   single       — send for one order by confirmationId
 *   backfill     — send for all paid orders not yet sent
 *   retry_failed — retry orders with meta_capi_status = 'failed' or 'queued'
 *   test         — dry run, logs what would be sent without hitting Meta API
 *
 * Audit log columns used: new_values (Meta response), metadata (event context)
 * Skipped orders (no email + no phone): marked meta_capi_status = 'skipped_missing_user_data'
 *
 * fbc generation:
 *   Format: fb.1.<ms_timestamp>.<fbclid>
 *   Timestamp priority: attribution_json.fbclid_ts (stored capture time) → Date.now() fallback
 *   fbc is NOT hashed — sent as plain text per Meta spec.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
const META_CAPI_ACCESS_TOKEN = Deno.env.get("META_CAPI_ACCESS_TOKEN");

// ── LIVE MODE ENABLED ─────────────────────────────────────────────────────────
const CAPI_SENDING_DISABLED = false;
// ─────────────────────────────────────────────────────────────────────────────

// Meta CAPI endpoint
const META_CAPI_URL = (pixelId: string) =>
  `https://graph.facebook.com/v19.0/${pixelId}/events`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── SHA-256 hashing (Meta requires lowercase-trimmed input) ──────────────────
async function sha256Hex(input: string): Promise<string> {
  const normalized = input.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Normalize phone for Meta (E.164 digits only, no +) ──────────────────────
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

// ── Resolve safe event_time ───────────────────────────────────────────────────
function resolveSafeEventTime(
  paidAt: string | null,
  createdAt: string | null,
  confirmationId: string
): { unixTimestamp: number | null; source: string; warning?: string } {
  const now = Date.now();

  const parseTs = (ts: string | null): number | null => {
    if (!ts) return null;
    const ms = new Date(ts).getTime();
    return isNaN(ms) ? null : ms;
  };

  const paidAtMs = parseTs(paidAt);
  const createdAtMs = parseTs(createdAt);

  if (paidAtMs !== null && paidAtMs <= now) {
    const unixTimestamp = Math.floor(paidAtMs / 1000);
    console.info(`[meta-capi][${confirmationId}] event_time: ${unixTimestamp} (source: paid_at=${paidAt})`);
    return { unixTimestamp, source: "paid_at" };
  }

  if (paidAtMs !== null && paidAtMs > now) {
    console.warn(`[meta-capi][${confirmationId}] paid_at is in the future (${paidAt}) — falling back to created_at`);
  } else {
    console.warn(`[meta-capi][${confirmationId}] paid_at is null/invalid — falling back to created_at`);
  }

  if (createdAtMs !== null && createdAtMs <= now) {
    const unixTimestamp = Math.floor(createdAtMs / 1000);
    const warning = `paid_at was ${paidAtMs !== null ? "in the future (" + paidAt + ")" : "null/invalid"} — used created_at as fallback`;
    console.warn(`[meta-capi][${confirmationId}] event_time: ${unixTimestamp} (source: created_at fallback). Warning: ${warning}`);
    return { unixTimestamp, source: "created_at_fallback", warning };
  }

  const blockReason = `BLOCKED: event_time would be in the future. paid_at=${paidAt ?? "null"}, created_at=${createdAt ?? "null"}`;
  console.error(`[meta-capi][${confirmationId}] ${blockReason}`);
  return { unixTimestamp: null, source: "blocked", warning: blockReason };
}

// ── Generate fbc value ────────────────────────────────────────────────────────
// Format: fb.1.<ms_timestamp>.<fbclid>
// Per Meta spec: fbc is NOT hashed, sent as plain text.
// Timestamp priority: stored fbclid_ts (ms) → Date.now() fallback.
function generateFbc(
  fbclid: string,
  fbclidTs: number | null
): { fbc: string; timestampSource: "stored" | "fallback"; timestampMs: number } {
  const timestampMs = fbclidTs && fbclidTs > 0 ? fbclidTs : Date.now();
  const timestampSource: "stored" | "fallback" = fbclidTs && fbclidTs > 0 ? "stored" : "fallback";
  const fbc = `fb.1.${timestampMs}.${fbclid}`;
  return { fbc, timestampSource, timestampMs };
}

// ── Build and send the CAPI event ────────────────────────────────────────────
interface CAPIPayload {
  confirmationId: string;
  email: string | null;
  phone: string | null;
  price: number;
  eventTime: number;
  fbclid: string | null;
  /** Millisecond timestamp when fbclid was first captured (from attribution_json.fbclid_ts) */
  fbclidTs: number | null;
  eventId: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;
}

interface MetaAPIResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface SendResult {
  success: boolean;
  error?: string;
  eventId: string;
  // Sanitized Meta response fields
  eventsReceived?: number;
  fbtrace_id?: string;
  messages?: string[];
  httpStatus?: number;
  errorSubcode?: number;
  rawResponse?: MetaAPIResponse;
  // fbc generation info
  fbcGenerated?: boolean;
  fbcTimestampSource?: "stored" | "fallback";
}

async function sendCAPIEvent(
  payload: CAPIPayload,
  testEventCode?: string
): Promise<SendResult> {
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
    return {
      success: false,
      error: "Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN secrets",
      eventId: payload.eventId,
    };
  }

  const userData: Record<string, unknown> = {};

  if (payload.email) {
    userData.em = [await sha256Hex(payload.email)];
  }

  const normalizedPhone = normalizePhone(payload.phone);
  if (normalizedPhone) {
    userData.ph = [await sha256Hex(normalizedPhone)];
  }

  // ── fbc generation ────────────────────────────────────────────────────────
  // Only include fbc if fbclid exists. NOT hashed — plain text per Meta spec.
  // Format: fb.1.<ms_timestamp>.<fbclid>
  let fbcGenerated = false;
  let fbcTimestampSource: "stored" | "fallback" | undefined;

  if (payload.fbclid) {
    const { fbc, timestampSource, timestampMs } = generateFbc(payload.fbclid, payload.fbclidTs);
    userData.fbc = fbc;
    fbcGenerated = true;
    fbcTimestampSource = timestampSource;
    console.info(
      `[meta-capi][${payload.confirmationId}] fbc generated: fb.1.${timestampMs}.<fbclid> (timestamp_source: ${timestampSource})`
    );
  }

  if (payload.fbp) {
    userData.fbp = payload.fbp;
  }

  if (payload.clientIpAddress) {
    userData.client_ip_address = payload.clientIpAddress;
  }

  if (payload.clientUserAgent) {
    userData.client_user_agent = payload.clientUserAgent;
  }

  const eventData: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: payload.eventTime,
    event_id: payload.eventId,
    action_source: "website",
    user_data: userData,
    custom_data: {
      value: payload.price,
      currency: "USD",
      content_name: "ESA Letter",
      content_type: "product",
      order_id: payload.confirmationId,
    },
  };

  const requestBody: Record<string, unknown> = {
    data: [eventData],
    access_token: META_CAPI_ACCESS_TOKEN,
  };

  if (testEventCode) {
    requestBody.test_event_code = testEventCode;
  }

  const url = META_CAPI_URL(META_PIXEL_ID);

  console.info(`[meta-capi][${payload.confirmationId}] Sending Purchase event`);
  console.info(`[meta-capi][${payload.confirmationId}] event_id: ${payload.eventId}`);
  console.info(`[meta-capi][${payload.confirmationId}] event_time: ${payload.eventTime}`);
  console.info(`[meta-capi][${payload.confirmationId}] value: $${payload.price} USD`);
  console.info(`[meta-capi][${payload.confirmationId}] has_email: ${!!payload.email}`);
  console.info(`[meta-capi][${payload.confirmationId}] has_phone: ${!!normalizedPhone}`);
  console.info(`[meta-capi][${payload.confirmationId}] has_fbclid: ${!!payload.fbclid}`);
  console.info(`[meta-capi][${payload.confirmationId}] fbc_generated: ${fbcGenerated}`);
  console.info(`[meta-capi][${payload.confirmationId}] user_data keys: ${Object.keys(userData).join(", ")}`);
  if (testEventCode) {
    console.info(`[meta-capi][${payload.confirmationId}] test_event_code: ${testEventCode}`);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const httpStatus = res.status;
    const rawText = await res.text();
    console.info(`[meta-capi][${payload.confirmationId}] response status: ${httpStatus}`);
    console.info(`[meta-capi][${payload.confirmationId}] response body: ${rawText.slice(0, 500)}`);

    let responseData: MetaAPIResponse;
    try {
      responseData = JSON.parse(rawText) as MetaAPIResponse;
    } catch {
      return {
        success: false,
        error: `Non-JSON response (${httpStatus}): ${rawText.slice(0, 400)}`,
        eventId: payload.eventId,
        httpStatus,
        fbcGenerated,
        fbcTimestampSource,
      };
    }

    if (!res.ok) {
      const errDetail = responseData.error;
      const errMsg = errDetail
        ? `Meta API ${httpStatus}: ${errDetail.message ?? JSON.stringify(errDetail)}`
        : `Meta API ${httpStatus}: ${rawText.slice(0, 400)}`;
      console.error(`[meta-capi][${payload.confirmationId}] Error: ${errMsg}`);
      return {
        success: false,
        error: errMsg,
        eventId: payload.eventId,
        httpStatus,
        eventsReceived: responseData.events_received,
        fbtrace_id: errDetail?.fbtrace_id ?? responseData.fbtrace_id,
        messages: responseData.messages,
        errorSubcode: errDetail?.error_subcode,
        rawResponse: responseData,
        fbcGenerated,
        fbcTimestampSource,
      };
    }

    const eventsReceived = responseData.events_received;
    if (eventsReceived === 0) {
      const errMsg = `Meta received 0 events. Response: ${JSON.stringify(responseData)}`;
      console.warn(`[meta-capi][${payload.confirmationId}] ${errMsg}`);
      return {
        success: false,
        error: errMsg,
        eventId: payload.eventId,
        httpStatus,
        eventsReceived: 0,
        fbtrace_id: responseData.fbtrace_id,
        messages: responseData.messages,
        rawResponse: responseData,
        fbcGenerated,
        fbcTimestampSource,
      };
    }

    console.info(`[meta-capi][${payload.confirmationId}] Success — events_received: ${eventsReceived}, fbtrace_id: ${responseData.fbtrace_id}`);
    if (responseData.messages?.length) {
      console.warn(`[meta-capi][${payload.confirmationId}] Meta messages/warnings: ${JSON.stringify(responseData.messages)}`);
    }

    return {
      success: true,
      eventId: payload.eventId,
      httpStatus,
      eventsReceived,
      fbtrace_id: responseData.fbtrace_id,
      messages: responseData.messages,
      rawResponse: responseData,
      fbcGenerated,
      fbcTimestampSource,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[meta-capi][${payload.confirmationId}] Fetch error: ${msg}`);
    return { success: false, error: msg, eventId: payload.eventId, fbcGenerated, fbcTimestampSource };
  }
}

// ── Order row type ────────────────────────────────────────────────────────────
interface OrderRow {
  id: string;
  confirmation_id: string;
  email: string | null;
  phone: string | null;
  price: number | null;
  paid_at: string | null;
  created_at: string | null;
  fbclid: string | null;
  attribution_json: Record<string, unknown> | null;
  meta_capi_status: string | null;
  meta_capi_event_id: string | null;
  phone_sha256: string | null;
}

// ── Process a single order ────────────────────────────────────────────────────
async function processOrder(
  order: OrderRow,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean,
  testEventCode?: string
): Promise<{
  confirmationId: string;
  success: boolean;
  skipped: boolean;
  skipReason?: string;
  eventId: string;
  error?: string;
  timestampSource?: string;
  timestampWarning?: string;
  eventsReceived?: number;
  fbtrace_id?: string;
  messages?: string[];
  httpStatus?: number;
  fbcGenerated?: boolean;
  fbcTimestampSource?: "stored" | "fallback";
}> {
  const confirmationId = order.confirmation_id;
  const eventId = `purchase_${confirmationId}`;
  const isTest = !!testEventCode;

  // ── GUARD: skip orders with no user data — Meta will always reject these ──
  const hasEmail = !!order.email;
  const hasPhone = !!normalizePhone(order.phone);

  if (!hasEmail && !hasPhone) {
    const skipReason = "No email or phone — Meta requires at least one hashed identifier. Order skipped permanently.";
    console.warn(`[meta-capi][${confirmationId}] SKIPPED: ${skipReason}`);

    if (!dryRun) {
      await supabase.from("orders").update({
        meta_capi_status: "skipped_missing_user_data",
        meta_capi_error: skipReason,
        meta_capi_event_id: eventId,
      }).eq("id", order.id);

      // Log the skip to audit_logs using correct columns
      try {
        await supabase.from("audit_logs").insert({
          action: "meta_capi_purchase_skipped",
          object_type: "order",
          object_id: confirmationId,
          actor_name: "system",
          actor_role: "automation",
          description: `CAPI skip: ${confirmationId} — no email or phone`,
          metadata: {
            confirmation_id: confirmationId,
            event_id: eventId,
            skip_reason: skipReason,
            has_email: false,
            has_phone: false,
            has_fbclid: false,
            fbc_generated: false,
            skipped_at: new Date().toISOString(),
          },
          new_values: null,
        });
      } catch { /* non-critical */ }
    }

    return {
      confirmationId,
      success: false,
      skipped: true,
      skipReason,
      eventId,
    };
  }

  // ── Resolve event_time ────────────────────────────────────────────────────
  const tsResult = resolveSafeEventTime(order.paid_at, order.created_at, confirmationId);

  if (!tsResult.unixTimestamp) {
    const errMsg = tsResult.warning ?? "event_time would be in the future — blocked";
    console.error(`[meta-capi][${confirmationId}] Blocked: ${errMsg}`);
    if (!dryRun) {
      await supabase.from("orders").update({
        meta_capi_status: "failed",
        meta_capi_error: errMsg,
        meta_capi_event_id: eventId,
      }).eq("id", order.id);
    }
    return { confirmationId, success: false, skipped: false, eventId, error: errMsg };
  }

  const price = order.price ?? 0;

  // ── Extract fbclid_ts from attribution_json ───────────────────────────────
  // Stored as a string (localStorage value) — parse to number for fbc generation.
  const rawFbclidTs = order.attribution_json?.fbclid_ts;
  const fbclidTs: number | null = rawFbclidTs
    ? (typeof rawFbclidTs === "number" ? rawFbclidTs : parseInt(String(rawFbclidTs), 10) || null)
    : null;

  const hasFbclid = !!order.fbclid;

  // Cache phone_sha256 if not already stored
  if (order.phone && !order.phone_sha256 && !dryRun) {
    const normalizedPhone = normalizePhone(order.phone);
    if (normalizedPhone) {
      const phoneSha256 = await sha256Hex(normalizedPhone);
      await supabase.from("orders").update({ phone_sha256: phoneSha256 }).eq("id", order.id);
    }
  }

  if (dryRun) {
    // Compute what fbc would be for dry-run reporting
    let dryRunFbc: string | null = null;
    let dryRunFbcTsSource: "stored" | "fallback" | null = null;
    if (order.fbclid) {
      const { fbc, timestampSource } = generateFbc(order.fbclid, fbclidTs);
      dryRunFbc = fbc;
      dryRunFbcTsSource = timestampSource;
    }

    console.info(`[meta-capi][${confirmationId}] DRY RUN — would send Purchase event`);
    console.info(`[meta-capi][${confirmationId}] event_id: ${eventId}`);
    console.info(`[meta-capi][${confirmationId}] event_time: ${tsResult.unixTimestamp} (${tsResult.source})`);
    console.info(`[meta-capi][${confirmationId}] value: $${price} USD`);
    console.info(`[meta-capi][${confirmationId}] has_email: ${hasEmail}`);
    console.info(`[meta-capi][${confirmationId}] has_phone: ${hasPhone}`);
    console.info(`[meta-capi][${confirmationId}] has_fbclid: ${hasFbclid}`);
    console.info(`[meta-capi][${confirmationId}] fbc_generated: ${hasFbclid}`);
    if (dryRunFbc) {
      console.info(`[meta-capi][${confirmationId}] fbc (dry-run): ${dryRunFbc} (ts_source: ${dryRunFbcTsSource})`);
    }
    return {
      confirmationId,
      success: true,
      skipped: false,
      eventId,
      timestampSource: tsResult.source,
      timestampWarning: tsResult.warning,
      fbcGenerated: hasFbclid,
      fbcTimestampSource: dryRunFbcTsSource ?? undefined,
    };
  }

  // ── LIVE MODE: send to Meta ───────────────────────────────────────────────
  const result = await sendCAPIEvent(
    {
      confirmationId,
      email: order.email,
      phone: order.phone,
      price,
      eventTime: tsResult.unixTimestamp,
      fbclid: order.fbclid,
      fbclidTs,
      eventId,
    },
    testEventCode
  );

  const now = new Date().toISOString();

  if (result.success) {
    await supabase.from("orders").update({
      meta_capi_sent_at: now,
      meta_capi_status: "sent",
      meta_capi_error: null,
      meta_capi_event_id: eventId,
    }).eq("id", order.id);

    // ── Audit log: write to real columns (new_values + metadata) ─────────
    try {
      await supabase.from("audit_logs").insert({
        action: "meta_capi_purchase_sent",
        object_type: "order",
        object_id: confirmationId,
        actor_name: "system",
        actor_role: "automation",
        description: `CAPI Purchase sent: ${confirmationId}${isTest ? ` [TEST: ${testEventCode}]` : ""}`,
        // new_values: sanitized Meta API response
        new_values: {
          events_received: result.eventsReceived ?? 1,
          fbtrace_id: result.fbtrace_id ?? null,
          messages: result.messages ?? [],
          http_status: result.httpStatus ?? 200,
        },
        // metadata: event context (no PII)
        metadata: {
          confirmation_id: confirmationId,
          event_id: eventId,
          event_time: tsResult.unixTimestamp,
          timestamp_source: tsResult.source,
          timestamp_warning: tsResult.warning ?? null,
          price,
          currency: "USD",
          has_email: hasEmail,
          has_phone: hasPhone,
          has_fbclid: hasFbclid,
          fbc_generated: result.fbcGenerated ?? false,
          fbc_timestamp_source: result.fbcTimestampSource ?? null,
          is_test: isTest,
          test_event_code: isTest ? testEventCode : null,
          sent_at: now,
        },
      });
    } catch (auditErr) {
      console.warn(`[meta-capi][${confirmationId}] Audit log insert failed: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`);
    }
  } else {
    await supabase.from("orders").update({
      meta_capi_status: "failed",
      meta_capi_error: result.error ?? "Unknown error",
      meta_capi_event_id: eventId,
    }).eq("id", order.id);

    // ── Audit log: failure ────────────────────────────────────────────────
    try {
      await supabase.from("audit_logs").insert({
        action: "meta_capi_purchase_failed",
        object_type: "order",
        object_id: confirmationId,
        actor_name: "system",
        actor_role: "automation",
        description: `CAPI Purchase failed: ${confirmationId} — ${result.error?.slice(0, 120) ?? "Unknown error"}`,
        // new_values: Meta error response
        new_values: {
          events_received: result.eventsReceived ?? 0,
          fbtrace_id: result.fbtrace_id ?? null,
          messages: result.messages ?? [],
          http_status: result.httpStatus ?? null,
          error_subcode: result.errorSubcode ?? null,
          error_message: result.error ?? null,
        },
        // metadata: event context
        metadata: {
          confirmation_id: confirmationId,
          event_id: eventId,
          event_time: tsResult.unixTimestamp,
          timestamp_source: tsResult.source,
          price,
          has_email: hasEmail,
          has_phone: hasPhone,
          has_fbclid: hasFbclid,
          fbc_generated: result.fbcGenerated ?? false,
          fbc_timestamp_source: result.fbcTimestampSource ?? null,
          is_test: isTest,
          test_event_code: isTest ? testEventCode : null,
          attempted_at: now,
        },
      });
    } catch (auditErr) {
      console.warn(`[meta-capi][${confirmationId}] Audit log insert failed: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`);
    }
  }

  return {
    confirmationId,
    success: result.success,
    skipped: false,
    eventId,
    error: result.error,
    timestampSource: tsResult.source,
    timestampWarning: tsResult.warning,
    eventsReceived: result.eventsReceived,
    fbtrace_id: result.fbtrace_id,
    messages: result.messages,
    httpStatus: result.httpStatus,
    fbcGenerated: result.fbcGenerated,
    fbcTimestampSource: result.fbcTimestampSource,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({})) as {
      mode?: "single" | "backfill" | "retry_failed" | "test";
      confirmationId?: string;
      dryRun?: boolean;
      testEventCode?: string;
    };

    const mode = body.mode ?? "backfill";
    const dryRun = body.dryRun === true;
    const testEventCode = body.testEventCode;

    // ── Config check ──────────────────────────────────────────────────────────
    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
      const missing = [];
      if (!META_PIXEL_ID) missing.push("META_PIXEL_ID");
      if (!META_CAPI_ACCESS_TOKEN) missing.push("META_CAPI_ACCESS_TOKEN");
      console.error(`[meta-capi] Missing secrets: ${missing.join(", ")}`);
      if (!dryRun && mode !== "test") {
        return json({
          ok: false,
          error: `Missing required secrets: ${missing.join(", ")}. Set these in Supabase Edge Function secrets.`,
          missing,
        }, 500);
      }
    }

    // ── Test / dry-run mode ───────────────────────────────────────────────────
    if (mode === "test") {
      const { data: testOrder } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, phone, price, paid_at, created_at, fbclid, attribution_json, meta_capi_status, meta_capi_event_id, phone_sha256")
        .not("payment_intent_id", "is", null)
        .in("status", ["processing", "completed"])
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!testOrder) {
        return json({ ok: false, error: "No paid orders found to test with" });
      }

      const order = testOrder as OrderRow;
      const eventId = `purchase_${order.confirmation_id}`;
      const tsResult = resolveSafeEventTime(order.paid_at, order.created_at, order.confirmation_id);
      const hasEmail = !!order.email;
      const hasPhone = !!normalizePhone(order.phone);
      const hasFbclid = !!order.fbclid;

      // Show what fbc would look like
      let sampleFbc: string | null = null;
      let fbcTsSource: "stored" | "fallback" | null = null;
      if (order.fbclid) {
        const rawFbclidTs = order.attribution_json?.fbclid_ts;
        const fbclidTs: number | null = rawFbclidTs
          ? (typeof rawFbclidTs === "number" ? rawFbclidTs : parseInt(String(rawFbclidTs), 10) || null)
          : null;
        const { fbc, timestampSource } = generateFbc(order.fbclid, fbclidTs);
        sampleFbc = fbc;
        fbcTsSource = timestampSource;
      }

      return json({
        ok: true,
        mode: "test",
        capiSendingDisabled: CAPI_SENDING_DISABLED,
        pixelId: META_PIXEL_ID ?? "NOT SET",
        hasAccessToken: !!META_CAPI_ACCESS_TOKEN,
        testOrderId: order.confirmation_id,
        eventId,
        eventTime: tsResult.unixTimestamp,
        timestampSource: tsResult.source,
        timestampWarning: tsResult.warning ?? null,
        price: order.price,
        hasEmail,
        hasPhone,
        hasFbclid,
        fbcGenerated: hasFbclid,
        sampleFbc,
        fbcTimestampSource: fbcTsSource,
        wouldBeSkipped: !hasEmail && !hasPhone,
        currentMetaCapiStatus: order.meta_capi_status,
        note: "CAPI sending is LIVE. Use mode=single with dryRun=true to simulate, or add testEventCode to send to Meta Test Events.",
      });
    }

    // ── Single order mode ─────────────────────────────────────────────────────
    if (mode === "single" && body.confirmationId) {
      const { data: order } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, phone, price, paid_at, created_at, fbclid, attribution_json, meta_capi_status, meta_capi_event_id, phone_sha256")
        .eq("confirmation_id", body.confirmationId)
        .maybeSingle();

      if (!order) return json({ ok: false, error: "Order not found" }, 404);

      const result = await processOrder(order as OrderRow, supabase, dryRun, testEventCode);
      return json({
        ok: true,
        mode: "single",
        dryRun,
        capiSendingDisabled: CAPI_SENDING_DISABLED,
        result,
      });
    }

    // ── Retry failed / queued mode ────────────────────────────────────────────
    if (mode === "retry_failed") {
      const { data: failedOrders } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, phone, price, paid_at, created_at, fbclid, attribution_json, meta_capi_status, meta_capi_event_id, phone_sha256")
        .in("meta_capi_status", ["failed", "queued"])
        .not("payment_intent_id", "is", null)
        .in("status", ["processing", "completed"])
        .limit(100);

      if (!failedOrders || failedOrders.length === 0) {
        return json({ ok: true, mode: "retry_failed", processed: 0, message: "No failed or queued Meta CAPI events to retry" });
      }

      const results = [];
      for (const order of failedOrders) {
        const result = await processOrder(order as OrderRow, supabase, dryRun, testEventCode);
        results.push(result);
      }

      const succeeded = results.filter((r) => r.success && !r.skipped).length;
      const failed = results.filter((r) => !r.success && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;

      return json({
        ok: true,
        mode: "retry_failed",
        dryRun,
        capiSendingDisabled: CAPI_SENDING_DISABLED,
        processed: results.length,
        succeeded,
        failed,
        skipped,
        results,
      });
    }

    // ── Backfill mode (default) ───────────────────────────────────────────────
    const { data: pendingOrders } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, phone, price, paid_at, created_at, fbclid, attribution_json, meta_capi_status, meta_capi_event_id, phone_sha256")
      .not("payment_intent_id", "is", null)
      .in("status", ["processing", "completed"])
      .is("meta_capi_sent_at", null)
      .neq("status", "refunded")
      .neq("meta_capi_status", "skipped_missing_user_data")
      .order("paid_at", { ascending: false })
      .limit(100);

    if (!pendingOrders || pendingOrders.length === 0) {
      return json({ ok: true, mode: "backfill", processed: 0, message: "All paid orders already processed" });
    }

    console.info(`[meta-capi] Backfill: processing ${pendingOrders.length} orders. dryRun=${dryRun}`);

    const results = [];
    for (const order of pendingOrders) {
      const result = await processOrder(order as OrderRow, supabase, dryRun, testEventCode);
      results.push(result);
    }

    const sent = results.filter((r) => r.success && !r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const firstError = results.find((r) => !r.success && !r.skipped)?.error;

    console.info(`[meta-capi] Backfill complete: ${sent} sent, ${failed} failed, ${skipped} skipped (no user data)`);

    return json({
      ok: true,
      mode: "backfill",
      dryRun,
      capiSendingDisabled: CAPI_SENDING_DISABLED,
      processed: results.length,
      sent,
      failed,
      skipped,
      firstError,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta-capi] Unhandled error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
