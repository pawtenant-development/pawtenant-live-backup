import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");
const GOOGLE_ADS_CONVERSION_ACTION_ID = Deno.env.get("GOOGLE_ADS_CONVERSION_ACTION_ID");
const GOOGLE_ADS_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

const GOOGLE_ADS_API_VERSION = "v20";

// Types that support uploadClickConversions
const CLICK_CONVERSION_COMPATIBLE_TYPES = new Set([
  "WEBPAGE",
  "CLICK_TO_CALL",
  "UPLOAD_CLICKS",
  "UPLOAD_CALLS",
  "STORE_SALES_DIRECT_UPLOAD",
  "STORE_SALES",
]);

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

async function getAccessToken(): Promise<{ token: string | null; error?: string }> {
  if (!GOOGLE_ADS_OAUTH_CLIENT_ID || !GOOGLE_ADS_OAUTH_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    return { token: null, error: "Missing OAuth credentials" };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_ADS_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
        refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const text = await res.text();
    if (!res.ok) return { token: null, error: `OAuth token refresh failed (${res.status}): ${text.slice(0, 400)}` };
    const data = JSON.parse(text) as { access_token: string };
    return { token: data.access_token };
  } catch (err) {
    return { token: null, error: `OAuth token fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function getUploadMethod(gclid: string | null, email: string | null): string {
  if (gclid && email) return "gclid_plus_hashed_email";
  if (gclid) return "gclid_only";
  if (email) return "hashed_email_only";
  return "unattributable";
}

function getMatchQuality(method: string): string {
  if (method === "gclid_only" || method === "gclid_plus_hashed_email") return "strong";
  if (method === "hashed_email_only") return "medium";
  return "weak";
}

function resolveGclid(gclidColumn: string | null, attributionJson: Record<string, unknown> | null, confirmationId: string): string | null {
  const fromColumn = gclidColumn?.trim() || null;
  if (fromColumn) { console.info(`[google-ads][${confirmationId}] gclid from column`); return fromColumn; }
  const fromAttribution = (attributionJson?.gclid as string | null | undefined)?.trim() || null;
  if (fromAttribution) { console.info(`[google-ads][${confirmationId}] gclid from attribution_json`); return fromAttribution; }
  return null;
}

function resolveSafeConversionTime(paidAt: string | null, createdAt: string | null, confirmationId: string): { isoTimestamp: string | null; source: string; warning?: string } {
  const now = Date.now();
  const parseTs = (ts: string | null): number | null => { if (!ts) return null; const ms = new Date(ts).getTime(); return isNaN(ms) ? null : ms; };
  const paidAtMs = parseTs(paidAt);
  const createdAtMs = parseTs(createdAt);

  if (paidAtMs !== null && paidAtMs <= now) {
    const isoTimestamp = new Date(paidAtMs).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
    return { isoTimestamp, source: "paid_at" };
  }
  if (createdAtMs !== null && createdAtMs <= now) {
    const isoTimestamp = new Date(createdAtMs).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
    const warning = `paid_at was ${paidAtMs !== null ? "in the future (" + paidAt + ")" : "null/invalid"} — used created_at as fallback`;
    return { isoTimestamp, source: "created_at_fallback", warning };
  }
  const blockReason = `BLOCKED: conversion_date_time would be in the future. paid_at=${paidAt ?? "null"}, created_at=${createdAt ?? "null"}`;
  return { isoTimestamp: null, source: "blocked", warning: blockReason };
}

interface ConversionPayload {
  confirmationId: string;
  paidAt: string;
  price: number;
  gclid: string | null;
  emailSha256: string | null;
  uploadMethod: string;
}

function buildRequestHeaders(accessToken: string): Record<string, string> {
  const loginCustomerId = (GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/[-\s]/g, "");
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

async function uploadConversionToGoogleAds(payload: ConversionPayload, accessToken: string, validateOnly = false): Promise<{ success: boolean; error?: string; rawResponse?: unknown; diagnostics?: Record<string, unknown> }> {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN || !GOOGLE_ADS_CONVERSION_ACTION_ID) {
    return { success: false, error: "Missing required secrets: GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, or GOOGLE_ADS_CONVERSION_ACTION_ID" };
  }

  const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/[-\s]/g, "");
  const loginCustomerId = (GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/[-\s]/g, "");
  const conversionAction = `customers/${customerId}/conversionActions/${GOOGLE_ADS_CONVERSION_ACTION_ID}`;

  const clickConversion: Record<string, unknown> = {
    conversionAction,
    conversionDateTime: payload.paidAt,
    conversionValue: payload.price,
    currencyCode: "USD",
    orderId: payload.confirmationId,
  };

  if (payload.gclid) {
    clickConversion.gclid = payload.gclid;
    if (payload.emailSha256) clickConversion.userIdentifiers = [{ hashedEmail: payload.emailSha256 }];
  } else if (payload.emailSha256) {
    clickConversion.userIdentifiers = [{ hashedEmail: payload.emailSha256 }];
  }

  const requestBody = { conversions: [clickConversion], partialFailure: true, validateOnly };
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  const diagnostics: Record<string, unknown> = {
    url, customerId, loginCustomerId: loginCustomerId || "NOT SET",
    conversionAction, conversionDateTime: payload.paidAt,
    hasGclid: !!payload.gclid, hasHashedEmail: !!payload.emailSha256,
    uploadMethod: payload.uploadMethod, validateOnly, apiVersion: GOOGLE_ADS_API_VERSION,
  };

  try {
    const res = await fetch(url, { method: "POST", headers: buildRequestHeaders(accessToken), body: JSON.stringify(requestBody) });
    const rawText = await res.text();

    if (rawText.trim().startsWith("<")) {
      return { success: false, error: `Google Ads API returned HTML (${res.status}) — URL may be wrong`, diagnostics };
    }

    let responseData: Record<string, unknown>;
    try { responseData = JSON.parse(rawText); } catch {
      return { success: false, error: `Non-JSON response (${res.status}): ${rawText.slice(0, 400)}`, diagnostics };
    }

    if (!res.ok) {
      let errMsg = `API ${res.status}: `;
      try {
        const errObj = responseData.error as Record<string, unknown> | undefined;
        const gadsFailure = (errObj?.details as Array<Record<string, unknown>>)?.[0];
        const gadsErrors = gadsFailure?.errors as Array<Record<string, unknown>> | undefined;
        const firstErr = gadsErrors?.[0];
        const authErrCode = (firstErr?.errorCode as Record<string, unknown>)?.authorizationError;
        if (authErrCode === "USER_PERMISSION_DENIED") {
          errMsg += `PERMISSION_DENIED — OAuth account lacks access to customer ${customerId}. `;
          if (!loginCustomerId) errMsg += `LIKELY FIX: Set GOOGLE_ADS_LOGIN_CUSTOMER_ID to your MCC account ID. `;
          errMsg += `Google says: ${firstErr?.message ?? ""}`;
        } else if (firstErr?.message) {
          errMsg += String(firstErr.message);
        } else {
          errMsg += JSON.stringify(responseData).slice(0, 600);
        }
      } catch { errMsg += JSON.stringify(responseData).slice(0, 600); }
      return { success: false, error: errMsg, rawResponse: responseData, diagnostics };
    }

    if (responseData.partialFailureError) {
      let partialErrMsg = `Partial failure: `;
      try {
        const pfe = responseData.partialFailureError as Record<string, unknown>;
        const details = pfe.details as Array<Record<string, unknown>> | undefined;
        const errors = details?.[0]?.errors as Array<Record<string, unknown>> | undefined;
        const firstErr = errors?.[0];
        const errCode = firstErr?.errorCode as Record<string, unknown> | undefined;
        const convErrType = errCode?.conversionUploadError as string | undefined;
        if (convErrType) {
          partialErrMsg += `conversionUploadError=${convErrType}`;
          if (convErrType === "INVALID_CONVERSION_ACTION_TYPE") {
            partialErrMsg += ` — The conversion action ID (${GOOGLE_ADS_CONVERSION_ACTION_ID}) is not compatible with uploadClickConversions. It must be type WEBPAGE. Go to Google Ads UI → Tools → Conversions → find a "Website" conversion action and use its ID.`;
          }
        } else {
          partialErrMsg += JSON.stringify(responseData.partialFailureError).slice(0, 800);
        }
      } catch {
        partialErrMsg += JSON.stringify(responseData.partialFailureError).slice(0, 800);
      }
      return { success: false, error: partialErrMsg, rawResponse: responseData, diagnostics };
    }

    return { success: true, rawResponse: responseData, diagnostics };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), diagnostics };
  }
}

// ── List all conversion actions in the account ────────────────────────────────
async function listConversionActions(accessToken: string): Promise<{
  success: boolean;
  actions?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    category: string;
    compatibleWithClickUpload: boolean;
    resourceName: string;
  }>;
  currentActionId: string | null;
  currentActionValid: boolean | null;
  error?: string;
  rawResponse?: unknown;
}> {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { success: false, error: "Missing GOOGLE_ADS_CUSTOMER_ID or GOOGLE_ADS_DEVELOPER_TOKEN", currentActionId: null, currentActionValid: null };
  }

  const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/[-\s]/g, "");
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;

  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.resource_name
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
  `;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildRequestHeaders(accessToken),
      body: JSON.stringify({ query }),
    });

    const rawText = await res.text();

    if (rawText.trim().startsWith("<")) {
      return { success: false, error: `Google Ads API returned HTML (${res.status})`, currentActionId: null, currentActionValid: null };
    }

    let responseData: unknown;
    try { responseData = JSON.parse(rawText); } catch {
      return { success: false, error: `Non-JSON response (${res.status}): ${rawText.slice(0, 400)}`, currentActionId: null, currentActionValid: null };
    }

    if (!res.ok) {
      return { success: false, error: `API ${res.status}: ${JSON.stringify(responseData).slice(0, 600)}`, rawResponse: responseData, currentActionId: null, currentActionValid: null };
    }

    const batches = responseData as Array<{ results?: Array<{ conversionAction?: Record<string, unknown> }> }>;
    const actions: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      category: string;
      compatibleWithClickUpload: boolean;
      resourceName: string;
    }> = [];

    for (const batch of batches) {
      for (const row of batch.results ?? []) {
        const ca = row.conversionAction;
        if (!ca) continue;
        const id = String(ca.id ?? "");
        const type = String(ca.type ?? "");
        actions.push({
          id,
          name: String(ca.name ?? ""),
          type,
          status: String(ca.status ?? ""),
          category: String(ca.category ?? ""),
          compatibleWithClickUpload: CLICK_CONVERSION_COMPATIBLE_TYPES.has(type),
          resourceName: String(ca.resourceName ?? ca.resource_name ?? ""),
        });
      }
    }

    const currentActionId = GOOGLE_ADS_CONVERSION_ACTION_ID ?? null;
    const currentAction = currentActionId ? actions.find((a) => a.id === currentActionId) : null;
    const currentActionValid = currentAction ? currentAction.compatibleWithClickUpload : (currentActionId ? false : null);

    return { success: true, actions, currentActionId, currentActionValid };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), currentActionId: null, currentActionValid: null };
  }
}

interface OrderRow {
  id: string;
  confirmation_id: string;
  email: string | null;
  price: number | null;
  paid_at: string | null;
  created_at: string | null;
  gclid: string | null;
  attribution_json: Record<string, unknown> | null;
  email_sha256: string | null;
  google_ads_upload_status: string | null;
  google_ads_upload_method: string | null;
  source_system?: string | null;
  historical_import?: boolean | null;
  google_tag_fired?: boolean | null;
}

async function processOrder(
  order: OrderRow,
  supabase: ReturnType<typeof createClient>,
  accessToken: string | null,
  tokenError: string | undefined,
  dryRun: boolean,
  isBackfillReplay = false,
  forceUpload = false
): Promise<{ confirmationId: string; method: string; quality: string; success: boolean; skipped: boolean; skipReason?: string; error?: string; diagnostics?: Record<string, unknown> }> {

  // ── Skip same-session orders: website tag already fired, no backend upload needed ──
  // forceUpload=true bypasses this guard (used for manual single-order retries from admin panel)
  if (!forceUpload && order.google_tag_fired === true) {
    console.info(`[google-ads][${order.confirmation_id}] Skipped — google_tag_fired=true (same-session, website tag handled conversion)`);
    await supabase.from("orders").update({
      google_ads_upload_status: "skipped_website_tag",
      google_ads_upload_method: "website_tag",
      google_ads_last_attempt_at: new Date().toISOString(),
    }).eq("id", order.id);
    return {
      confirmationId: order.confirmation_id,
      method: "website_tag",
      quality: "strong",
      success: true,
      skipped: true,
      skipReason: "google_tag_fired=true — same-session purchase handled by website gtag conversion",
    };
  }

  const gclid = resolveGclid(order.gclid, order.attribution_json, order.confirmation_id);
  const email = order.email?.trim() || null;
  const uploadMethod = getUploadMethod(gclid, email);
  const matchQuality = getMatchQuality(uploadMethod);

  if (!order.gclid && gclid) {
    await supabase.from("orders").update({ gclid }).eq("id", order.id);
  }

  if (uploadMethod === "unattributable") {
    await supabase.from("orders").update({
      google_ads_upload_status: "unattributable",
      google_ads_upload_method: "unattributable",
      google_ads_last_attempt_at: new Date().toISOString(),
    }).eq("id", order.id);
    return { confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: false, skipped: true };
  }

  const tsResult = resolveSafeConversionTime(order.paid_at, order.created_at, order.confirmation_id);
  if (!tsResult.isoTimestamp) {
    const errMsg = tsResult.warning ?? "conversion_date_time would be in the future — upload blocked";
    await supabase.from("orders").update({
      google_ads_upload_status: "failed",
      google_ads_upload_error: errMsg,
      google_ads_upload_method: uploadMethod,
      google_ads_last_attempt_at: new Date().toISOString(),
    }).eq("id", order.id);
    return { confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: false, skipped: false, error: errMsg };
  }

  const resolvedPaidAt = tsResult.isoTimestamp;
  const timestampWarning = tsResult.warning;

  let emailSha256 = order.email_sha256 || null;
  if (email && !emailSha256) {
    emailSha256 = await sha256Hex(email);
    await supabase.from("orders").update({ email_sha256: emailSha256 }).eq("id", order.id);
  }

  if (dryRun) {
    return {
      confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: true, skipped: false,
      diagnostics: { resolvedTimestamp: resolvedPaidAt, timestampSource: tsResult.source, timestampWarning, paidAt: order.paid_at, hasGclid: !!gclid, hasEmail: !!email },
    };
  }

  if (!accessToken) {
    const errMsg = tokenError ?? "Google Ads OAuth token could not be obtained";
    await supabase.from("orders").update({ google_ads_upload_status: "failed", google_ads_upload_error: errMsg, google_ads_upload_method: uploadMethod, google_ads_last_attempt_at: new Date().toISOString() }).eq("id", order.id);
    return { confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: false, skipped: false, error: errMsg };
  }

  const price = order.price ?? 0;
  const result = await uploadConversionToGoogleAds({ confirmationId: order.confirmation_id, paidAt: resolvedPaidAt, price, gclid, emailSha256, uploadMethod }, accessToken);
  const now = new Date().toISOString();

  if (result.success) {
    const updatePayload: Record<string, unknown> = {
      google_ads_uploaded_at: now,
      google_ads_upload_status: "uploaded",
      google_ads_upload_error: null,
      google_ads_upload_method: uploadMethod,
      google_ads_last_attempt_at: now,
      email_sha256: emailSha256,
    };
    if (isBackfillReplay) {
      updatePayload.google_backfill_replayed = true;
      updatePayload.google_backfill_replayed_at = now;
    }
    await supabase.from("orders").update(updatePayload).eq("id", order.id);

    try {
      await supabase.from("audit_logs").insert({
        action: "google_ads_conversion_uploaded",
        object_type: "order",
        object_id: order.confirmation_id,
        actor_name: "system",
        actor_role: "automation",
        details: {
          confirmation_id: order.confirmation_id, upload_method: uploadMethod, match_quality: matchQuality,
          price, paid_at_original: order.paid_at, conversion_date_time_sent: resolvedPaidAt,
          timestamp_source: tsResult.source, timestamp_warning: timestampWarning ?? null,
          has_gclid: !!gclid, has_email: !!email, uploaded_at: now,
          is_backfill_replay: isBackfillReplay,
          google_tag_fired: order.google_tag_fired ?? false,
        },
      });
    } catch { /* non-critical */ }

    return { confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: true, skipped: false, diagnostics: { ...result.diagnostics, resolvedTimestamp: resolvedPaidAt, timestampSource: tsResult.source } };
  } else {
    await supabase.from("orders").update({ google_ads_upload_status: "failed", google_ads_upload_error: result.error ?? "Unknown error", google_ads_upload_method: uploadMethod, google_ads_last_attempt_at: now }).eq("id", order.id);
    try {
      await supabase.from("audit_logs").insert({
        action: "google_ads_conversion_failed", object_type: "order", object_id: order.confirmation_id,
        actor_name: "system", actor_role: "automation",
        details: { confirmation_id: order.confirmation_id, upload_method: uploadMethod, error: result.error, paid_at_original: order.paid_at, conversion_date_time_sent: resolvedPaidAt, diagnostics: result.diagnostics, attempted_at: now },
      });
    } catch { /* non-critical */ }
    return { confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality, success: false, skipped: false, error: result.error, diagnostics: result.diagnostics };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({})) as {
      mode?: "backfill" | "single" | "retry_failed" | "test_auth" | "test_upload" | "retry_gclid_upgraded" | "list_conversion_actions";
      confirmationId?: string;
      dryRun?: boolean;
      forceUpload?: boolean;
      sourceSystem?: "wordpress_legacy" | "new_site" | "all";
      dateFrom?: string | null;
      dateTo?: string | null;
      includeHistorical?: boolean;
    };

    const mode = body.mode ?? "backfill";
    const dryRun = body.dryRun === true;
    // forceUpload=true bypasses the google_tag_fired guard — for admin manual retries only
    const forceUpload = body.forceUpload === true;

    // ── List conversion actions ───────────────────────────────────────────────
    if (mode === "list_conversion_actions") {
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);
      const result = await listConversionActions(tokenResult.token);
      return json({ ok: result.success, mode: "list_conversion_actions", ...result });
    }

    // ── Test auth ─────────────────────────────────────────────────────────────
    if (mode === "test_auth") {
      const tokenResult = await getAccessToken();
      const customerId = (GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/[-\s]/g, "");
      const loginCustomerId = (GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/[-\s]/g, "");
      const diagnosis: string[] = [];
      if (!tokenResult.token) diagnosis.push(`AUTH FAILED: ${tokenResult.error}`);
      if (!GOOGLE_ADS_DEVELOPER_TOKEN) diagnosis.push("MISSING: GOOGLE_ADS_DEVELOPER_TOKEN");
      if (!customerId) diagnosis.push("MISSING: GOOGLE_ADS_CUSTOMER_ID");
      if (!GOOGLE_ADS_CONVERSION_ACTION_ID) diagnosis.push("MISSING: GOOGLE_ADS_CONVERSION_ACTION_ID");
      if (!loginCustomerId) diagnosis.push("WARNING: GOOGLE_ADS_LOGIN_CUSTOMER_ID not set");
      return json({ ok: !!tokenResult.token, hasToken: !!tokenResult.token, tokenError: tokenResult.error, customerId: customerId || null, loginCustomerId: loginCustomerId || null, hasDevToken: !!GOOGLE_ADS_DEVELOPER_TOKEN, hasConversionActionId: !!GOOGLE_ADS_CONVERSION_ACTION_ID, hasLoginCustomerId: !!loginCustomerId, apiVersion: GOOGLE_ADS_API_VERSION, endpointWouldBe: customerId ? `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions` : "GOOGLE_ADS_CUSTOMER_ID not set", diagnosis, mccRequired: !loginCustomerId });
    }

    // ── Test upload ───────────────────────────────────────────────────────────
    if (mode === "test_upload") {
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);
      const { data: testOrder } = await supabase.from("orders").select("id, confirmation_id, email, price, paid_at, created_at, gclid, attribution_json, email_sha256, google_ads_upload_status, google_ads_upload_method, google_tag_fired").not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).order("paid_at", { ascending: false }).limit(1).maybeSingle();
      if (!testOrder) return json({ ok: false, error: "No paid orders found to test with" });
      const order = testOrder as OrderRow;
      const gclid = resolveGclid(order.gclid, order.attribution_json, order.confirmation_id);
      const email = order.email?.trim() || null;
      const uploadMethod = getUploadMethod(gclid, email);
      let emailSha256 = order.email_sha256 || null;
      if (email && !emailSha256) emailSha256 = await sha256Hex(email);
      const tsResult = resolveSafeConversionTime(order.paid_at, order.created_at, order.confirmation_id);
      if (!tsResult.isoTimestamp) return json({ ok: false, error: tsResult.warning ?? "conversion_date_time would be in the future", mode: "test_upload", testOrderId: order.confirmation_id });
      const result = await uploadConversionToGoogleAds({ confirmationId: order.confirmation_id, paidAt: tsResult.isoTimestamp, price: order.price ?? 0, gclid, emailSha256, uploadMethod }, tokenResult.token, true);
      return json({ ok: result.success, mode: "test_upload", validateOnly: true, testOrderId: order.confirmation_id, uploadMethod, resolvedTimestamp: tsResult.isoTimestamp, timestampSource: tsResult.source, success: result.success, error: result.error, diagnostics: result.diagnostics, note: result.success ? "validateOnly=true passed" : "validateOnly=true FAILED" });
    }

    // ── Retry gclid-upgraded ──────────────────────────────────────────────────
    if (mode === "retry_gclid_upgraded") {
      const { data: emailOnlyOrders } = await supabase.from("orders").select("id, confirmation_id, email, price, paid_at, created_at, gclid, attribution_json, email_sha256, google_ads_upload_status, google_ads_upload_method, google_tag_fired").eq("google_ads_upload_method", "hashed_email_only").eq("google_ads_upload_status", "uploaded").not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).limit(100);
      if (!emailOnlyOrders || emailOnlyOrders.length === 0) return json({ ok: true, mode: "retry_gclid_upgraded", processed: 0, message: "No hashed_email_only orders found to upgrade" });
      const upgradeable = (emailOnlyOrders as OrderRow[]).filter((o) => resolveGclid(o.gclid, o.attribution_json, o.confirmation_id) !== null);
      if (upgradeable.length === 0) return json({ ok: true, mode: "retry_gclid_upgraded", processed: 0, checked: emailOnlyOrders.length, message: "No hashed_email_only orders have a gclid available for upgrade" });
      for (const order of upgradeable) await supabase.from("orders").update({ google_ads_uploaded_at: null, google_ads_upload_status: "pending_gclid_upgrade" }).eq("id", order.id);
      let accessToken: string | null = null;
      let tokenError: string | undefined;
      if (!dryRun) {
        const tokenResult = await getAccessToken();
        accessToken = tokenResult.token;
        tokenError = tokenResult.error;
        if (!accessToken) return json({ ok: false, error: `OAuth failed: ${tokenError}` }, 500);
      }
      const results = [];
      for (const order of upgradeable) results.push(await processOrder(order, supabase, accessToken, tokenError, dryRun, false, forceUpload));
      return json({ ok: true, mode: "retry_gclid_upgraded", dryRun, checked: emailOnlyOrders.length, upgradeable: upgradeable.length, upgraded: results.filter(r => r.success && !r.skipped).length, failed: results.filter(r => !r.success && !r.skipped).length, results });
    }

    // ── Get access token for real upload modes ────────────────────────────────
    let accessToken: string | null = null;
    let tokenError: string | undefined;
    if (!dryRun) {
      const tokenResult = await getAccessToken();
      accessToken = tokenResult.token;
      tokenError = tokenResult.error;
      if (!accessToken) return json({ ok: false, error: `OAuth failed: ${tokenError}` }, 500);
    }

    // ── Single order ──────────────────────────────────────────────────────────
    if (mode === "single" && body.confirmationId) {
      const { data: order } = await supabase.from("orders").select("id, confirmation_id, email, price, paid_at, created_at, gclid, attribution_json, email_sha256, google_ads_upload_status, google_ads_upload_method, source_system, historical_import, google_tag_fired").eq("confirmation_id", body.confirmationId).maybeSingle();
      if (!order) return json({ ok: false, error: "Order not found" }, 404);
      const result = await processOrder(order as OrderRow, supabase, accessToken, tokenError, dryRun, false, forceUpload);
      return json({ ok: true, mode: "single", dryRun, forceUpload, result });
    }

    // ── Retry failed ──────────────────────────────────────────────────────────
    if (mode === "retry_failed") {
      const { data: failedOrders } = await supabase.from("orders").select("id, confirmation_id, email, price, paid_at, created_at, gclid, attribution_json, email_sha256, google_ads_upload_status, google_ads_upload_method, source_system, historical_import, google_tag_fired").eq("google_ads_upload_status", "failed").not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).limit(100);
      if (!failedOrders || failedOrders.length === 0) return json({ ok: true, mode: "retry_failed", processed: 0, message: "No failed uploads to retry" });
      const results = [];
      // retry_failed uses forceUpload=true — admin explicitly wants to retry these
      for (const order of failedOrders) results.push(await processOrder(order as OrderRow, supabase, accessToken, tokenError, dryRun, false, true));
      return json({ ok: true, mode: "retry_failed", dryRun, processed: results.length, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success && !r.skipped).length, firstError: results.find(r => !r.success && !r.skipped)?.error, results });
    }

    // ── Backfill (default) ────────────────────────────────────────────────────
    const bfSourceSystem = body.sourceSystem ?? "new_site";
    const bfDateFrom = body.dateFrom ?? null;
    const bfDateTo = body.dateTo ?? null;
    const bfIncludeHistorical = body.includeHistorical ?? false;

    let pendingQuery = supabase
      .from("orders")
      .select("id, confirmation_id, email, price, paid_at, created_at, gclid, attribution_json, email_sha256, google_ads_upload_status, google_ads_upload_method, source_system, historical_import, google_tag_fired")
      .not("payment_intent_id", "is", null)
      .in("status", ["processing", "completed"])
      .is("google_ads_uploaded_at", null)
      .neq("status", "refunded")
      .neq("google_ads_upload_status", "skip_historical")
      .neq("google_ads_upload_status", "skipped_website_tag")
      .order("paid_at", { ascending: false })
      .limit(100);

    if (bfSourceSystem === "wordpress_legacy") {
      pendingQuery = pendingQuery.eq("source_system", "wordpress_legacy");
    } else if (bfSourceSystem === "new_site") {
      pendingQuery = pendingQuery.or("source_system.is.null,source_system.neq.wordpress_legacy");
    }
    if (!bfIncludeHistorical) pendingQuery = pendingQuery.neq("historical_import", true);
    if (bfDateFrom) pendingQuery = pendingQuery.gte("paid_at", bfDateFrom);
    if (bfDateTo) pendingQuery = pendingQuery.lte("paid_at", bfDateTo);

    const { data: pendingOrders } = await pendingQuery;

    if (!pendingOrders || pendingOrders.length === 0) {
      return json({ ok: true, mode: "backfill", processed: 0, message: "All paid orders already uploaded or no paid orders found matching filters" });
    }

    const results = [];
    for (const order of pendingOrders) {
      const isHistoricalReplay = (order as OrderRow).historical_import === true || (order as OrderRow).source_system === "wordpress_legacy";
      results.push(await processOrder(order as OrderRow, supabase, accessToken, tokenError, dryRun, isHistoricalReplay, forceUpload));
    }

    return json({
      ok: true, mode: "backfill", dryRun,
      filters: { sourceSystem: bfSourceSystem, dateFrom: bfDateFrom, dateTo: bfDateTo, includeHistorical: bfIncludeHistorical },
      processed: results.length,
      uploaded: results.filter(r => r.success && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      skipped_website_tag: results.filter(r => r.skipped && r.skipReason?.includes("google_tag_fired")).length,
      failed: results.filter(r => !r.success && !r.skipped).length,
      firstError: results.find(r => !r.success && !r.skipped)?.error,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[google-ads] Unhandled error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
