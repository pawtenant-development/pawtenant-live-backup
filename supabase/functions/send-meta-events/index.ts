/**
 * send-meta-events — Meta Conversions API (CAPI) backfill and preview endpoint.
 *
 * Modes:
 *   preview    — Returns a detailed report without sending anything
 *   dry-run    — Shows exactly which orders would be sent (with full payload preview)
 *   backfill   — Actually sends eligible orders to Meta CAPI
 *
 * Filters (all optional):
 *   sourceSystem  — "wordpress_legacy" | "new_site" | "all" (default: "all")
 *   dateFrom      — ISO date string, filter paid_at >= dateFrom
 *   dateTo        — ISO date string, filter paid_at <= dateTo
 *   includeHistorical — boolean, whether to include historical_import=true orders (default: false)
 *
 * Idempotency:
 *   - Checks sent_to_meta = true (NOT just null — fixes the null vs false bug)
 *   - Checks meta_capi_status = 'sent'
 *   - Checks meta_events table for existing sent record
 *   - Marks replayed orders with meta_backfill_replayed = true
 *   - Uses event_id = "purchase_{confirmationId}" — same as send-meta-capi-event
 *     so Meta deduplicates across both functions automatically
 *
 * fbc generation:
 *   Format: fb.1.<ms_timestamp>.<fbclid>
 *   Timestamp priority: attribution_json.fbclid_ts (stored capture time) → paid_at ms → Date.now() fallback
 *   fbc is NOT hashed — sent as plain text per Meta spec.
 *
 * Security:
 *   - Requires admin JWT token
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
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

async function verifyAdmin(token: string): Promise<{ isAdmin: boolean; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/check-admin-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });
    const data = await res.json() as { isAdmin?: boolean };
    return { isAdmin: data.isAdmin === true };
  } catch (err) {
    return { isAdmin: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── FIXED: Check if order already sent — handles null, false, AND true ──────
async function isAlreadySent(
  supabase: ReturnType<typeof createClient>,
  orderId: string
): Promise<boolean> {
  const { data: order } = await supabase
    .from("orders")
    .select("sent_to_meta, meta_capi_status")
    .eq("id", orderId)
    .maybeSingle();

  if (order?.sent_to_meta === true) return true;
  if (order?.meta_capi_status === "sent") return true;

  const { data: metaEvent } = await supabase
    .from("meta_events")
    .select("sent_to_meta")
    .eq("order_id", orderId)
    .eq("event_name", "Purchase")
    .maybeSingle();

  return metaEvent?.sent_to_meta === true;
}

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
  email_sha256: string | null;
  sent_to_meta: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
  source_system: string | null;
  historical_import: boolean | null;
}

interface BackfillFilters {
  sourceSystem: "wordpress_legacy" | "new_site" | "all";
  dateFrom: string | null;
  dateTo: string | null;
  includeHistorical: boolean;
  limit: number;
  offset: number;
}

function buildBaseQuery(
  supabase: ReturnType<typeof createClient>,
  filters: BackfillFilters,
  countOnly = false
) {
  const now = new Date().toISOString();

  let query = supabase
    .from("orders")
    .select(countOnly ? "*" : `
      id, confirmation_id, email, phone, price, paid_at, created_at,
      fbclid, attribution_json, meta_capi_status, meta_capi_event_id, phone_sha256, email_sha256,
      sent_to_meta, first_name, last_name, source_system, historical_import
    `, countOnly ? { count: "exact", head: true } : undefined)
    .not("payment_intent_id", "is", null)
    .in("status", ["processing", "completed"])
    .not("paid_at", "is", null)
    .lt("paid_at", now)
    .gt("price", 0)
    .or("email.not.is.null,phone.not.is.null")
    .neq("status", "refunded")
    .neq("sent_to_meta", true)
    .neq("meta_capi_status", "sent");

  if (filters.sourceSystem === "wordpress_legacy") {
    query = query.eq("source_system", "wordpress_legacy");
  } else if (filters.sourceSystem === "new_site") {
    query = query.or("source_system.is.null,source_system.neq.wordpress_legacy");
  }

  if (!filters.includeHistorical) {
    query = query.neq("historical_import", true);
  }

  if (filters.dateFrom) query = query.gte("paid_at", filters.dateFrom);
  if (filters.dateTo)   query = query.lte("paid_at", filters.dateTo);

  return query;
}

async function getEligibleOrders(
  supabase: ReturnType<typeof createClient>,
  filters: BackfillFilters
): Promise<OrderRow[]> {
  const query = buildBaseQuery(supabase, filters)
    .order("paid_at", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  const { data } = await query;
  return (data || []) as OrderRow[];
}

async function countEligibleOrders(
  supabase: ReturnType<typeof createClient>,
  filters: BackfillFilters
): Promise<number> {
  const { count } = await buildBaseQuery(supabase, filters, true);
  return count || 0;
}

async function getSentCount(
  supabase: ReturnType<typeof createClient>,
  filters: BackfillFilters
): Promise<number> {
  const now = new Date().toISOString();
  let query = supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .not("payment_intent_id", "is", null)
    .in("status", ["processing", "completed"])
    .not("paid_at", "is", null)
    .lt("paid_at", now)
    .eq("sent_to_meta", true);

  if (filters.sourceSystem === "wordpress_legacy") {
    query = query.eq("source_system", "wordpress_legacy");
  } else if (filters.sourceSystem === "new_site") {
    query = query.or("source_system.is.null,source_system.neq.wordpress_legacy");
  }
  if (!filters.includeHistorical) query = query.neq("historical_import", true);
  if (filters.dateFrom) query = query.gte("paid_at", filters.dateFrom);
  if (filters.dateTo)   query = query.lte("paid_at", filters.dateTo);

  const { count } = await query;
  return count || 0;
}

async function getMissingDataIssues(
  supabase: ReturnType<typeof createClient>,
  filters: BackfillFilters
): Promise<{
  noFbclid: number;
  noPhone: number;
  noEmail: number;
  invalidPaidAt: number;
  futurePaidAt: number;
}> {
  const now = new Date().toISOString();
  let query = supabase
    .from("orders")
    .select("fbclid, phone, email, paid_at, price, status, source_system, historical_import")
    .not("payment_intent_id", "is", null)
    .in("status", ["processing", "completed"])
    .neq("sent_to_meta", true)
    .neq("meta_capi_status", "sent")
    .neq("status", "refunded");

  if (filters.sourceSystem === "wordpress_legacy") {
    query = query.eq("source_system", "wordpress_legacy");
  } else if (filters.sourceSystem === "new_site") {
    query = query.or("source_system.is.null,source_system.neq.wordpress_legacy");
  }
  if (!filters.includeHistorical) query = query.neq("historical_import", true);
  if (filters.dateFrom) query = query.gte("paid_at", filters.dateFrom);
  if (filters.dateTo)   query = query.lte("paid_at", filters.dateTo);

  const { data: orders } = await query;

  const issues = { noFbclid: 0, noPhone: 0, noEmail: 0, invalidPaidAt: 0, futurePaidAt: 0 };
  for (const order of (orders || [])) {
    if (!order.fbclid) issues.noFbclid++;
    if (!order.phone)  issues.noPhone++;
    if (!order.email)  issues.noEmail++;
    if (!order.paid_at) issues.invalidPaidAt++;
    else if (order.paid_at > now) issues.futurePaidAt++;
  }
  return issues;
}

// ── FIXED: fbc generation using stored fbclid_ts from attribution_json ────────
// Format: fb.1.<ms_timestamp>.<fbclid>
// Priority: attribution_json.fbclid_ts → paid_at ms → Date.now() fallback
// fbc is NOT hashed — sent as plain text per Meta spec.
function generateFbc(
  fbclid: string,
  attributionJson: Record<string, unknown> | null,
  paidAtMs: number | null
): { fbc: string; timestampSource: "stored_fbclid_ts" | "paid_at" | "fallback" } {
  const rawFbclidTs = attributionJson?.fbclid_ts;
  const storedTs: number | null = rawFbclidTs
    ? (typeof rawFbclidTs === "number" ? rawFbclidTs : parseInt(String(rawFbclidTs), 10) || null)
    : null;

  if (storedTs && storedTs > 0) {
    return { fbc: `fb.1.${storedTs}.${fbclid}`, timestampSource: "stored_fbclid_ts" };
  }
  if (paidAtMs && paidAtMs > 0) {
    return { fbc: `fb.1.${paidAtMs}.${fbclid}`, timestampSource: "paid_at" };
  }
  const fallbackTs = Date.now();
  return { fbc: `fb.1.${fallbackTs}.${fbclid}`, timestampSource: "fallback" };
}

interface CAPIPayload {
  confirmationId: string;
  email: string | null;
  phone: string | null;
  price: number;
  eventTime: number;
  fbclid: string | null;
  attributionJson: Record<string, unknown> | null;
  paidAtMs: number | null;
  eventId: string;
  emailSha256?: string | null;
  phoneSha256?: string | null;
}

async function buildCAPIPayload(order: OrderRow): Promise<CAPIPayload | null> {
  if (!order.paid_at) return null;
  const paidAtMs = new Date(order.paid_at).getTime();
  const now = Date.now();
  if (isNaN(paidAtMs) || paidAtMs > now) return null;

  const eventTime = Math.floor(paidAtMs / 1000);
  const eventId = `purchase_${order.confirmation_id}`;
  const price = order.price ?? 0;

  let emailSha256 = order.email_sha256;
  let phoneSha256 = order.phone_sha256;

  if (order.email && !emailSha256) emailSha256 = await sha256Hex(order.email);
  const normalizedPhone = normalizePhone(order.phone);
  if (normalizedPhone && !phoneSha256) phoneSha256 = await sha256Hex(normalizedPhone);

  return {
    confirmationId: order.confirmation_id,
    email: order.email,
    phone: order.phone,
    price,
    eventTime,
    fbclid: order.fbclid,
    attributionJson: order.attribution_json,
    paidAtMs,
    eventId,
    emailSha256,
    phoneSha256,
  };
}

async function sendToMetaCAPI(
  payload: CAPIPayload,
  testEventCode?: string
): Promise<{ success: boolean; error?: string; rawResponse?: unknown; fbcTimestampSource?: string }> {
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
    return { success: false, error: "Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN secrets" };
  }

  const userData: Record<string, unknown> = {};
  if (payload.emailSha256) userData.em = [payload.emailSha256];
  if (payload.phoneSha256) userData.ph = [payload.phoneSha256];

  // ── FIXED fbc generation ──────────────────────────────────────────────────
  // Previously used event_time * 1000 (wrong — that's paid_at ms, not fbclid capture time)
  // Now correctly uses stored fbclid_ts from attribution_json, with paid_at as fallback
  let fbcTimestampSource: string | undefined;
  if (payload.fbclid) {
    const { fbc, timestampSource } = generateFbc(payload.fbclid, payload.attributionJson, payload.paidAtMs);
    userData.fbc = fbc;
    fbcTimestampSource = timestampSource;
    console.info(`[send-meta-events][${payload.confirmationId}] fbc: ${fbc} (ts_source: ${timestampSource})`);
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
  if (testEventCode) requestBody.test_event_code = testEventCode;

  try {
    const res = await fetch(META_CAPI_URL(META_PIXEL_ID), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const rawText = await res.text();
    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      return { success: false, error: `Non-JSON response (${res.status}): ${rawText.slice(0, 400)}`, fbcTimestampSource };
    }

    if (!res.ok) {
      const errDetail = (responseData.error as Record<string, unknown> | undefined);
      const errMsg = errDetail
        ? `Meta API ${res.status}: ${errDetail.message ?? JSON.stringify(errDetail)}`
        : `Meta API ${res.status}: ${rawText.slice(0, 400)}`;
      return { success: false, error: errMsg, rawResponse: responseData, fbcTimestampSource };
    }

    const eventsReceived = responseData.events_received as number | undefined;
    if (eventsReceived === 0) {
      return { success: false, error: "Meta received 0 events", rawResponse: responseData, fbcTimestampSource };
    }

    return { success: true, rawResponse: responseData, fbcTimestampSource };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), fbcTimestampSource };
  }
}

async function storeMetaEvent(
  supabase: ReturnType<typeof createClient>,
  order: OrderRow,
  payload: CAPIPayload,
  sent: boolean,
  response?: unknown,
  error?: string,
  dryRun = false,
  isBackfillReplay = false
): Promise<void> {
  const now = new Date().toISOString();

  await supabase.from("meta_events").upsert({
    order_id: order.id,
    confirmation_id: order.confirmation_id,
    event_name: "Purchase",
    event_id: payload.eventId,
    sent_to_meta: sent,
    meta_sent_at: sent ? now : null,
    meta_response: response ? JSON.stringify(response) : null,
    fbclid: order.fbclid,
    email: order.email,
    email_sha256: payload.emailSha256,
    phone: order.phone,
    phone_sha256: payload.phoneSha256,
    value: payload.price,
    currency: "USD",
    paid_at: order.paid_at,
    dry_run: dryRun,
    error_message: error || null,
    updated_at: now,
  }, { onConflict: "order_id,event_name" });

  const updatePayload: Record<string, unknown> = {
    sent_to_meta: sent,
    meta_capi_status: sent ? "sent" : (dryRun ? "previewed" : "failed"),
    meta_capi_sent_at: sent ? now : null,
    meta_capi_error: error || null,
    meta_capi_event_id: payload.eventId,
    email_sha256: payload.emailSha256,
    phone_sha256: payload.phoneSha256,
  };

  if (isBackfillReplay && sent) {
    updatePayload.meta_backfill_replayed = true;
    updatePayload.meta_backfill_replayed_at = now;
  }

  await supabase.from("orders").update(updatePayload).eq("id", order.id);
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { isAdmin, error: adminError } = await verifyAdmin(token);
    if (!isAdmin) return json({ ok: false, error: adminError || "Unauthorized - admin access required" }, 403);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({})) as {
      mode?: "preview" | "dry-run" | "backfill";
      limit?: number;
      offset?: number;
      testEventCode?: string;
      sourceSystem?: "wordpress_legacy" | "new_site" | "all";
      dateFrom?: string | null;
      dateTo?: string | null;
      includeHistorical?: boolean;
    };

    const mode = body.mode || "preview";
    const filters: BackfillFilters = {
      sourceSystem: body.sourceSystem ?? "all",
      dateFrom: body.dateFrom ?? null,
      dateTo: body.dateTo ?? null,
      includeHistorical: body.includeHistorical ?? false,
      limit: Math.min(body.limit || 50, 200),
      offset: body.offset || 0,
    };

    // ── Preview Mode ──────────────────────────────────────────────────────────
    if (mode === "preview") {
      const [eligibleCount, sentCount, issues] = await Promise.all([
        countEligibleOrders(supabase, filters),
        getSentCount(supabase, filters),
        getMissingDataIssues(supabase, filters),
      ]);

      return json({
        ok: true,
        mode: "preview",
        filters: {
          sourceSystem: filters.sourceSystem,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          includeHistorical: filters.includeHistorical,
        },
        report: {
          totalPaidOrdersEligible: eligibleCount + sentCount,
          alreadySentCount: sentCount,
          pendingBackfillCount: eligibleCount,
          missingDataIssues: issues,
        },
        config: {
          hasMetaPixelId: !!META_PIXEL_ID,
          hasMetaCapiAccessToken: !!META_CAPI_ACCESS_TOKEN,
          note: !META_CAPI_ACCESS_TOKEN
            ? "META_CAPI_ACCESS_TOKEN not configured - backfill will log preview only"
            : undefined,
        },
      });
    }

    // ── Dry-Run Mode ──────────────────────────────────────────────────────────
    if (mode === "dry-run") {
      const orders = await getEligibleOrders(supabase, filters);

      const previewItems = [];
      for (const order of orders) {
        const payload = await buildCAPIPayload(order);
        if (!payload) {
          previewItems.push({
            orderId: order.id,
            confirmationId: order.confirmation_id,
            sourceSystem: order.source_system ?? "new_site",
            isHistorical: order.historical_import ?? false,
            wouldSend: false,
            reason: "Invalid paid_at timestamp",
          });
          continue;
        }

        const alreadySent = await isAlreadySent(supabase, order.id);

        // Compute fbc for dry-run reporting
        let dryRunFbc: string | null = null;
        let dryRunFbcTsSource: string | null = null;
        if (order.fbclid) {
          const paidAtMs = order.paid_at ? new Date(order.paid_at).getTime() : null;
          const { fbc, timestampSource } = generateFbc(order.fbclid, order.attribution_json, paidAtMs);
          dryRunFbc = fbc;
          dryRunFbcTsSource = timestampSource;
        }

        previewItems.push({
          orderId: order.id,
          confirmationId: order.confirmation_id,
          sourceSystem: order.source_system ?? "new_site",
          isHistorical: order.historical_import ?? false,
          eventId: payload.eventId,
          eventName: "Purchase",
          value: payload.price,
          currency: "USD",
          paidAt: order.paid_at,
          hasEmail: !!order.email,
          hasPhone: !!order.phone,
          hasFbclid: !!order.fbclid,
          fbcGenerated: !!order.fbclid,
          fbcTimestampSource: dryRunFbcTsSource,
          sampleFbc: dryRunFbc,
          wouldSend: !alreadySent,
          alreadySent,
          requiredFieldsPresent: !!(order.email || order.phone) && payload.price > 0 && !!order.paid_at,
        });
      }

      return json({
        ok: true,
        mode: "dry-run",
        filters: {
          sourceSystem: filters.sourceSystem,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          includeHistorical: filters.includeHistorical,
        },
        wouldSendCount: previewItems.filter(i => i.wouldSend).length,
        alreadySentCount: previewItems.filter(i => i.alreadySent).length,
        skippedCount: previewItems.filter(i => !i.wouldSend && !i.alreadySent).length,
        preview: previewItems,
        config: {
          hasMetaPixelId: !!META_PIXEL_ID,
          hasMetaCapiAccessToken: !!META_CAPI_ACCESS_TOKEN,
        },
      });
    }

    // ── Backfill Mode ─────────────────────────────────────────────────────────
    if (mode === "backfill") {
      if (!META_CAPI_ACCESS_TOKEN) {
        return json({
          ok: false,
          error: "META_CAPI_ACCESS_TOKEN not configured. Cannot send events to Meta.",
          hint: "Set META_CAPI_ACCESS_TOKEN in Supabase Edge Function secrets, or use dry-run mode to preview.",
        }, 400);
      }

      const orders = await getEligibleOrders(supabase, filters);
      const results = [];
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const order of orders) {
        const alreadySent = await isAlreadySent(supabase, order.id);
        if (alreadySent) {
          skipped++;
          results.push({
            orderId: order.id,
            confirmationId: order.confirmation_id,
            sourceSystem: order.source_system ?? "new_site",
            status: "skipped",
            reason: "Already sent to Meta",
          });
          continue;
        }

        const payload = await buildCAPIPayload(order);
        if (!payload) {
          failed++;
          results.push({
            orderId: order.id,
            confirmationId: order.confirmation_id,
            sourceSystem: order.source_system ?? "new_site",
            status: "failed",
            error: "Invalid paid_at timestamp or missing required fields",
          });
          continue;
        }

        const isHistoricalReplay = order.historical_import === true || order.source_system === "wordpress_legacy";
        const metaResult = await sendToMetaCAPI(payload, body.testEventCode);

        if (metaResult.success) {
          sent++;
          await storeMetaEvent(supabase, order, payload, true, metaResult.rawResponse, undefined, false, isHistoricalReplay);
          results.push({
            orderId: order.id,
            confirmationId: order.confirmation_id,
            sourceSystem: order.source_system ?? "new_site",
            eventId: payload.eventId,
            status: "sent",
            value: payload.price,
            isBackfillReplay: isHistoricalReplay,
            fbcTimestampSource: metaResult.fbcTimestampSource,
          });
        } else {
          failed++;
          await storeMetaEvent(supabase, order, payload, false, metaResult.rawResponse, metaResult.error, false, false);
          results.push({
            orderId: order.id,
            confirmationId: order.confirmation_id,
            sourceSystem: order.source_system ?? "new_site",
            eventId: payload.eventId,
            status: "failed",
            error: metaResult.error,
          });
        }
      }

      return json({
        ok: true,
        mode: "backfill",
        filters: {
          sourceSystem: filters.sourceSystem,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          includeHistorical: filters.includeHistorical,
        },
        summary: { sent, skipped, failed, total: orders.length },
        results,
      });
    }

    return json({ ok: false, error: `Unknown mode: ${mode}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-meta-events] Unhandled error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
