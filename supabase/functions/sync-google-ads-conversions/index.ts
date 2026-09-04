import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveGoogleAdsChannelEligibility,
  CHANNEL_GATE_SKIP_STATUSES,
  SKIP_NON_GOOGLE_CHANNEL,
  SKIP_ATTRIBUTION_CONFLICT,
  type ChannelGateResult,
} from "./channelGate.ts";
import {
  authorizeInvocation,
  type AuthzResult,
} from "./invocationAuth.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  // x-cron-secret is listed so a scheduled caller that authenticates by header is
  // not blocked by preflight. It is only ever TRUSTED when a secret is actually
  // provisioned — see invocationAuth.secretsMatch.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Shared secret for a scheduled caller. UNSET = the header branch is disabled.
// There is no fallback to another function's cron secret: this function writes to
// the PRIMARY, bidding-critical conversion action, so its internal credential is
// narrow by design. No cron job calls this function today (verified against
// cron.job); stripe-webhook is the only internal caller and it uses the
// service-role bearer.
const GOOGLE_ADS_CRON_SECRET = Deno.env.get("GOOGLE_ADS_CRON_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");
const GOOGLE_ADS_CONVERSION_ACTION_ID = Deno.env.get("GOOGLE_ADS_CONVERSION_ACTION_ID");
const GOOGLE_ADS_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

// Enhanced Conversions for Leads gate.
// Default true = existing behavior (attach hashed-email userIdentifiers).
// Set GOOGLE_ADS_ECL_ENABLED="false" when the account does NOT have Enhanced
// Conversions for Leads active: gclid orders then upload gclid-only (no hashed
// email), and email-only orders are deferred (not uploaded) until ECL is enabled.
const GOOGLE_ADS_ECL_ENABLED = Deno.env.get("GOOGLE_ADS_ECL_ENABLED") !== "false";

const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v21";

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

  // ECL gate: only attach hashed-email enhanced-conversion identifiers when ECL is enabled.
  if (payload.gclid) {
    clickConversion.gclid = payload.gclid;
    if (payload.emailSha256 && GOOGLE_ADS_ECL_ENABLED) clickConversion.userIdentifiers = [{ hashedEmail: payload.emailSha256 }];
  } else if (payload.emailSha256 && GOOGLE_ADS_ECL_ENABLED) {
    clickConversion.userIdentifiers = [{ hashedEmail: payload.emailSha256 }];
  }

  const requestBody = { conversions: [clickConversion], partialFailure: true, validateOnly };
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  const diagnostics: Record<string, unknown> = {
    url, customerId, loginCustomerId: loginCustomerId || "NOT SET",
    conversionAction, conversionDateTime: payload.paidAt,
    hasGclid: !!payload.gclid, hasHashedEmail: !!payload.emailSha256,
    eclEnabled: GOOGLE_ADS_ECL_ENABLED,
    attachedHashedEmail: !!(payload.emailSha256 && GOOGLE_ADS_ECL_ENABLED),
    uploadMethod: payload.uploadMethod, validateOnly, apiVersion: GOOGLE_ADS_API_VERSION,
  };

  try {
    const res = await fetch(url, { method: "POST", headers: buildRequestHeaders(accessToken), body: JSON.stringify(requestBody) });
    const rawText = await res.text();
    // Google returns its trace id in this header — recorded as upload provenance
    // so a later adjustment can be tied back to the exact original request.
    diagnostics.requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? null;

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
  gbraid?: string | null;
  wbraid?: string | null;
  attribution_json: Record<string, unknown> | null;
  // GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001 — canonical acquisition inputs.
  // first_touch_json is the immutable first touch; last_touch_json / the flat
  // utm columns are read by the gate only as corroborating or conflict evidence.
  first_touch_json?: Record<string, unknown> | null;
  last_touch_json?: Record<string, unknown> | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  email_sha256: string | null;
  google_ads_upload_status: string | null;
  google_ads_upload_method: string | null;
  google_ads_uploaded_at?: string | null;
  source_system?: string | null;
  historical_import?: boolean | null;
  google_tag_fired?: boolean | null;
}

// ── Column list for every click-conversion mode ───────────────────────────────
// GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001: the gate needs first_touch_json,
// last_touch_json, utm_source and utm_medium. A per-mode hand-written list is how
// a mode silently loses a gate input (an absent first_touch_json would read as a
// legacy order), so every mode selects through THIS constant.
const ORDER_SELECT_COLUMNS =
  "id, confirmation_id, email, price, paid_at, created_at, gclid, gbraid, wbraid, " +
  "attribution_json, first_touch_json, last_touch_json, utm_source, utm_medium, " +
  "email_sha256, google_ads_upload_status, google_ads_upload_method, google_ads_uploaded_at, " +
  "source_system, historical_import, google_tag_fired";

// ── Channel gate application (the ONE place a skip is persisted) ──────────────
// Writes ONLY the skip status, the privacy-safe reason and the method marker.
// It deliberately never touches google_ads_uploaded_at (that would claim an
// upload that never happened) and never touches google_ads_last_attempt_at (no
// Google request was attempted, so the Sync Health "last sync" must not move).
async function persistChannelGateSkip(
  order: OrderRow,
  gate: ChannelGateResult,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await supabase.from("orders").update({
    google_ads_upload_status: gate.uploadStatus,
    google_ads_upload_error: gate.reason,
    google_ads_upload_method: "excluded",
  }).eq("id", order.id);
}

function channelGateSkipResult(order: OrderRow, gate: ChannelGateResult) {
  return {
    confirmationId: order.confirmation_id,
    method: "excluded",
    quality: "weak",
    success: false,
    skipped: true,
    skipReason: gate.uploadStatus ?? SKIP_NON_GOOGLE_CHANNEL,
    // Privacy-safe: machine tokens + a canonical channel name only. Never a
    // click id, an email, a hash or PHI.
    diagnostics: {
      channelGate: gate.state,
      channelGateReason: gate.reason,
      canonicalChannel: gate.channel || null,
      channelSource: gate.channelSource,
      signals: gate.signals,
    },
  };
}

/**
 * Partition a selected order set with the channel gate BEFORE any Google work.
 *
 * This runs ahead of the OAuth token request, ahead of email hashing and ahead
 * of payload construction, so an excluded order never reaches Google in any
 * form. processOrder() re-checks the same gate as defence in depth for any
 * future direct call site. Every order — synthetic fixtures included — goes
 * through the gate (fail closed; LIVE's processOrder has no fixture bypass).
 */
async function partitionByChannelGate(
  orders: OrderRow[],
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean,
): Promise<{ eligible: OrderRow[]; skipped: ReturnType<typeof channelGateSkipResult>[] }> {
  const eligible: OrderRow[] = [];
  const skipped: ReturnType<typeof channelGateSkipResult>[] = [];
  for (const order of orders) {
    const gate = resolveGoogleAdsChannelEligibility(order);
    if (gate.eligible) { eligible.push(order); continue; }
    await persistChannelGateSkip(order, gate, supabase, dryRun);
    console.info(`[google-ads][${order.confirmation_id}] channel gate ${gate.state}: ${gate.reason}`);
    skipped.push(channelGateSkipResult(order, gate));
  }
  return { eligible, skipped };
}

function countGateSkips(results: Array<{ skipReason?: string }>) {
  return {
    skipped_non_google_channel: results.filter((r) => r.skipReason === SKIP_NON_GOOGLE_CHANNEL).length,
    skipped_attribution_conflict: results.filter((r) => r.skipReason === SKIP_ATTRIBUTION_CONFLICT).length,
  };
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

  // ── Backend API is now the single PRIMARY purchase conversion ──────────────
  // The Google Ads goal was corrected: "Pawtenant Backend Purchase (API)"
  // (action 7567366496) = PRIMARY; "ESA Purchase (Dynamic)" and
  // "PSD Purchase (Dynamic)" = SECONDARY (diagnostics only, "All conversions").
  //
  // Previously this function skipped orders where google_tag_fired=true (marking
  // them "skipped_website_tag") because the website tags were Primary and would
  // have double-counted. Now that the website tags are Secondary, that skip would
  // leave the google_tag_fired orders out of the Primary count — so the backend
  // must upload EVERY eligible paid Google Ads order, google_tag_fired or not.
  //
  // No double-counting in the "Conversions" column: the website actions are
  // Secondary (different conversion actions), so only the backend Primary action
  // counts for bidding. Dedup is still enforced two ways: the backfill selects
  // only orders with google_ads_uploaded_at IS NULL, and Google Ads dedupes by
  // orderId (= confirmation_id). The "skipped_website_tag" status is now
  // LEGACY-ONLY — no longer written here; the backfill selection still excludes
  // pre-existing skipped_website_tag rows so historical orders aren't re-touched.
  // (forceUpload is retained for call-site compatibility / manual retries.)

  // ── PRIMARY CHANNEL GATE (FAIL CLOSED) ─────────────────────────────────────
  // GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001. The Primary backend purchase
  // action feeds BIDDING, so it may only receive purchases whose canonical
  // first-touch acquisition is Google Ads. This runs BEFORE the email is hashed,
  // before any identifier is resolved, before a payload exists and before any
  // Google API call — an excluded order can never reach Google by any path
  // (payment-triggered single, backfill, retry_failed, retry_gclid_upgraded,
  // manual admin sync). partitionByChannelGate() already filters the batch modes
  // ahead of the OAuth token request; this is the defence-in-depth copy that any
  // future direct caller of processOrder still hits.
  //
  // A skipped order never gets google_ads_uploaded_at, so it can never become a
  // refund-adjustment candidate either (any adjustment path requires a prior
  // successful upload).
  const channelGate = resolveGoogleAdsChannelEligibility(order);
  if (!channelGate.eligible) {
    await persistChannelGateSkip(order, channelGate, supabase, dryRun);
    console.info(`[google-ads][${order.confirmation_id}] channel gate ${channelGate.state}: ${channelGate.reason}`);
    return channelGateSkipResult(order, channelGate);
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

  // ── ECL gate: email-only enhanced conversions require Enhanced Conversions for Leads.
  //    When ECL is disabled, defer these (no API call) so they aren't sent with an empty
  //    payload; gclid orders still upload (gclid-only). uploaded_at stays null so they are
  //    automatically retried once ECL is enabled. email hashing is preserved for later. ──
  if (!GOOGLE_ADS_ECL_ENABLED && uploadMethod === "hashed_email_only") {
    if (!dryRun) {
      await supabase.from("orders").update({
        google_ads_upload_status: "deferred_ecl_disabled",
        google_ads_upload_method: uploadMethod,
        google_ads_last_attempt_at: new Date().toISOString(),
      }).eq("id", order.id);
    }
    return {
      confirmationId: order.confirmation_id, method: uploadMethod, quality: matchQuality,
      success: false, skipped: true,
      skipReason: "ECL disabled — email-only conversion deferred until Enhanced Conversions for Leads is enabled",
    };
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

    // ── GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001 ────────────────────
    // Immutable provenance of what was ACTUALLY sent to Google. Without this the
    // uploaded value is unrecoverable (orders.price is mutable), which makes a
    // refund RESTATEMENT impossible to compute honestly. Append-only: a retry
    // cannot create a second successful row (unique partial index), and the
    // insert is best-effort so it can never break an upload that already
    // succeeded at Google.
    try {
      await supabase.from("google_ads_conversion_uploads").insert({
        order_id: order.id,
        order_transaction_id: order.confirmation_id,
        conversion_action_id: GOOGLE_ADS_CONVERSION_ACTION_ID ?? "",
        uploaded_value: price,
        currency_code: "USD",
        conversion_date_time: resolvedPaidAt,
        attribution_method: uploadMethod,
        google_ads_api_version: GOOGLE_ADS_API_VERSION,
        google_request_id: (result.diagnostics?.requestId as string | null) ?? null,
        uploaded_at: now,
        upload_status: "success",
        // Safe summary only — never the raw Google payload, never click IDs.
        response_summary_safe: {
          match_quality: matchQuality,
          timestamp_source: tsResult.source,
          google_tag_fired: order.google_tag_fired ?? false,
          is_backfill_replay: isBackfillReplay,
        },
        idempotency_key: `${order.confirmation_id}:${GOOGLE_ADS_CONVERSION_ACTION_ID ?? ""}:success`,
      });
    } catch { /* non-critical: provenance must never fail a completed upload */ }

    try {
      await supabase.from("audit_logs").insert({
        action: "google_ads_conversion_uploaded",
        object_type: "order",
        object_id: order.confirmation_id,
        actor_name: "system",
        actor_role: "automation",
        // NOTE: this column is `metadata`. It was previously written as `details`
        // — a column audit_logs does not have — so every insert failed silently
        // inside the empty catch below (1 audit row for 404 uploads at LIVE).
        metadata: {
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
        // `metadata`, not `details` — see the note on the success path above.
        metadata: { confirmation_id: order.confirmation_id, upload_method: uploadMethod, error: result.error, paid_at_original: order.paid_at, conversion_date_time_sent: resolvedPaidAt, diagnostics: result.diagnostics, attempted_at: now },
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
      mode?: "backfill" | "single" | "retry_failed" | "test_auth" | "test_upload" | "retry_gclid_upgraded" | "list_conversion_actions" | "inspect_conversion_action" | "apply_refund_adjustments";
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
    // forceUpload is retained for call-site/API compatibility (manual admin retries).
    // The google_tag_fired skip it used to bypass has been removed — the backend now
    // uploads every eligible paid order regardless of google_tag_fired.
    const forceUpload = body.forceUpload === true;

    // ══ INVOCATION AUTHORIZATION (FAIL CLOSED) ══════════════════════════════
    // GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-CLOSURE.
    //
    // verify_jwt=true is NOT authorization: the PUBLIC anon key is a valid project
    // JWT, so the gateway admits it. This is the single boundary every mode passes
    // through, and it runs BEFORE order selection, email hashing, the Google OAuth
    // token request, payload construction, any Google API call and any
    // upload-status mutation. A refused call performs zero of those.
    //
    // Nothing below this point is reachable by an anonymous caller, an ordinary
    // customer or a provider. forceUpload is not consulted here and cannot bypass
    // it, exactly as it cannot bypass the acquisition-channel gate.
    const authz: AuthzResult = await authorizeInvocation(req, mode, {
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      cronSecret: GOOGLE_ADS_CRON_SECRET,
      getUser: async (token) => {
        const { data } = await supabase.auth.getUser(token);
        return data?.user ? { id: data.user.id } : null;
      },
      getAdminProfile: async (userId) => {
        const { data } = await supabase
          .from("doctor_profiles").select("is_admin, role").eq("user_id", userId).maybeSingle();
        return (data as { is_admin?: boolean | null; role?: string | null } | null) ?? null;
      },
      // Capability probe: an operation granted to service_role ONLY. A legacy
      // service-role JWT that is not string-equal to the injected key still passes;
      // the anon key, a customer session and a provider session all fail it.
      probeServiceRole: async (token) => {
        try {
          const probe = createClient(SUPABASE_URL, token, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
          return !error;
        } catch {
          return false;
        }
      },
    });

    if (!authz.authorized) {
      // Privacy-safe: a machine reason token only — never a bearer, key, secret,
      // email, hash, click id or PHI.
      console.warn(`[google-ads] invocation refused: mode=${mode} reason=${authz.reason}`);
      return json({ ok: false, error: "Unauthorized", reason: authz.reason }, authz.status);
    }
    console.info(`[google-ads] invocation authorized: mode=${mode} caller=${authz.kind}`);

    // ── Google OAuth token — acquired LAZILY, never before the channel gate ────
    // GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001 requires the channel gate to
    // run BEFORE a Google token is requested. Every upload mode therefore selects
    // its orders, partitions them with partitionByChannelGate(), and only then
    // calls ensureAccessToken() — and only if at least one order survived. The
    // token is fetched at most once per invocation and the OAuth-failure response
    // is unchanged (HTTP 500, no order writes).
    let cachedToken: { token: string | null; error?: string } | null = null;
    const ensureAccessToken = async (): Promise<{ token: string | null; error?: string; failure?: Response }> => {
      if (dryRun) return { token: null };
      if (!cachedToken) cachedToken = await getAccessToken();
      if (!cachedToken.token) {
        return { token: null, error: cachedToken.error, failure: json({ ok: false, error: `OAuth failed: ${cachedToken.error}` }, 500) };
      }
      return { token: cachedToken.token, error: cachedToken.error };
    };

    // ── List conversion actions ───────────────────────────────────────────────
    if (mode === "list_conversion_actions") {
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);
      const result = await listConversionActions(tokenResult.token);
      return json({ ok: result.success, mode: "list_conversion_actions", ...result });
    }

    // ── Inspect the configured conversion action (READ-ONLY) ─────────────────
    // GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001. Canary prerequisites
    // require proof that the Backend Purchase action accepts UPLOADED values
    // rather than overriding them with a default (adjustment error 10
    // CANNOT_RESTATE_CONVERSION_ACTION_THAT_ALWAYS_USES_DEFAULT_CONVERSION_VALUE)
    // and that it is Primary for bidding. Pure GAQL SELECT — no mutation.
    if (mode === "inspect_conversion_action") {
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);
      const customerId = (GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/[-\s]/g, "");
      const actionId = GOOGLE_ADS_CONVERSION_ACTION_ID ?? "";
      const query = `
        SELECT
          conversion_action.id,
          conversion_action.name,
          conversion_action.type,
          conversion_action.status,
          conversion_action.category,
          conversion_action.primary_for_goal,
          conversion_action.counting_type,
          conversion_action.value_settings.default_value,
          conversion_action.value_settings.default_currency_code,
          conversion_action.value_settings.always_use_default_value,
          conversion_action.include_in_conversions_metric,
          conversion_action.click_through_lookback_window_days
        FROM conversion_action
        WHERE conversion_action.id = ${actionId}
      `;
      try {
        const res = await fetch(
          `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
          { method: "POST", headers: buildRequestHeaders(tokenResult.token), body: JSON.stringify({ query }) },
        );
        const rawText = await res.text();
        if (!res.ok) return json({ ok: false, mode, error: `API ${res.status}: ${rawText.slice(0, 600)}` }, 500);
        const batches = JSON.parse(rawText) as Array<{ results?: Array<{ conversionAction?: Record<string, unknown> }> }>;
        const ca = batches?.[0]?.results?.[0]?.conversionAction ?? null;
        const vs = (ca?.valueSettings ?? {}) as Record<string, unknown>;
        return json({
          ok: true, mode, apiVersion: GOOGLE_ADS_API_VERSION, customerId, actionId,
          action: ca,
          canary_checks: {
            // A RETRACTION carries no value, so alwaysUseDefaultValue cannot block it;
            // it WOULD block a RESTATEMENT (error 10).
            always_use_default_value: vs.alwaysUseDefaultValue === true,
            uploaded_values_accepted: vs.alwaysUseDefaultValue !== true,
            primary_for_goal: ca?.primaryForGoal ?? null,
            counting_type: ca?.countingType ?? null,
            status: ca?.status ?? null,
            type: ca?.type ?? null,
          },
        });
      } catch (err) {
        return json({ ok: false, mode, error: err instanceof Error ? err.message : String(err) }, 500);
      }
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
      if (!GOOGLE_ADS_ECL_ENABLED) diagnosis.push("INFO: GOOGLE_ADS_ECL_ENABLED=false — gclid orders upload gclid-only; email-only orders deferred");
      diagnosis.push(`INFO: Primary channel gate ACTIVE — only canonically Google Ads purchases are uploaded; others are recorded as ${SKIP_NON_GOOGLE_CHANNEL} / ${SKIP_ATTRIBUTION_CONFLICT}`);
      return json({ ok: !!tokenResult.token, hasToken: !!tokenResult.token, tokenError: tokenResult.error, customerId: customerId || null, loginCustomerId: loginCustomerId || null, hasDevToken: !!GOOGLE_ADS_DEVELOPER_TOKEN, hasConversionActionId: !!GOOGLE_ADS_CONVERSION_ACTION_ID, hasLoginCustomerId: !!loginCustomerId, eclEnabled: GOOGLE_ADS_ECL_ENABLED, apiVersion: GOOGLE_ADS_API_VERSION, endpointWouldBe: customerId ? `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions` : "GOOGLE_ADS_CUSTOMER_ID not set", diagnosis, mccRequired: !loginCustomerId });
    }

    // ── Test upload ───────────────────────────────────────────────────────────
    if (mode === "test_upload") {
      // The channel gate applies here too, and runs BEFORE the OAuth token:
      // validateOnly still BUILDS a payload from a real order, still hashes its
      // email and still calls the Google Ads API, so a non-Google order must
      // never be the diagnostic sample. Pick the newest paid order that PASSES
      // the gate rather than simply the newest paid order.
      const { data: testCandidates } = await supabase.from("orders").select(ORDER_SELECT_COLUMNS).not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).order("paid_at", { ascending: false }).limit(50);
      const testOrder = ((testCandidates ?? []) as OrderRow[]).find((o) => resolveGoogleAdsChannelEligibility(o).eligible) ?? null;
      if (!testOrder) return json({ ok: false, error: "No Google Ads-attributed paid orders found to test with (channel gate excluded every candidate)" });
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);
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
      const { data: emailOnlyOrders } = await supabase.from("orders").select(ORDER_SELECT_COLUMNS).eq("google_ads_upload_method", "hashed_email_only").eq("google_ads_upload_status", "uploaded").not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).limit(100);
      if (!emailOnlyOrders || emailOnlyOrders.length === 0) return json({ ok: true, mode: "retry_gclid_upgraded", processed: 0, message: "No hashed_email_only orders found to upgrade" });
      const candidates = (emailOnlyOrders as OrderRow[]).filter((o) => resolveGclid(o.gclid, o.attribution_json, o.confirmation_id) !== null);
      // Channel gate FIRST — an already-uploaded non-Google order must not be
      // re-uploaded here, and must not have its uploaded_at cleared below.
      const upgradeGate = await partitionByChannelGate(candidates, supabase, dryRun);
      const upgradeable = upgradeGate.eligible;
      if (upgradeable.length === 0) return json({ ok: true, mode: "retry_gclid_upgraded", processed: 0, checked: emailOnlyOrders.length, ...countGateSkips(upgradeGate.skipped), message: "No eligible hashed_email_only orders have a gclid available for upgrade", results: upgradeGate.skipped });
      for (const order of upgradeable) await supabase.from("orders").update({ google_ads_uploaded_at: null, google_ads_upload_status: "pending_gclid_upgrade" }).eq("id", order.id);
      const upgradeToken = await ensureAccessToken();
      if (upgradeToken.failure) return upgradeToken.failure;
      const results = [];
      for (const order of upgradeable) results.push(await processOrder(order, supabase, upgradeToken.token, upgradeToken.error, dryRun, false, forceUpload));
      return json({ ok: true, mode: "retry_gclid_upgraded", dryRun, checked: emailOnlyOrders.length, upgradeable: upgradeable.length, upgraded: results.filter(r => r.success && !r.skipped).length, failed: results.filter(r => !r.success && !r.skipped).length, ...countGateSkips(upgradeGate.skipped), results: [...results, ...upgradeGate.skipped] });
    }

    // ── Single order ───────────────────────────────────────────────────────────────────────
    // This is the PAYMENT-TRIGGERED path (stripe-webhook posts mode "single") as
    // well as the admin per-order retry. The channel gate runs here, BEFORE the
    // OAuth token is ever requested.
    if (mode === "single" && body.confirmationId) {
      const { data: order } = await supabase.from("orders").select(ORDER_SELECT_COLUMNS).eq("confirmation_id", body.confirmationId).maybeSingle();
      if (!order) return json({ ok: false, error: "Order not found" }, 404);
      const singleGate = await partitionByChannelGate([order as OrderRow], supabase, dryRun);
      if (singleGate.eligible.length === 0) {
        return json({ ok: true, mode: "single", dryRun, forceUpload, ...countGateSkips(singleGate.skipped), result: singleGate.skipped[0] });
      }
      const singleToken = await ensureAccessToken();
      if (singleToken.failure) return singleToken.failure;
      const result = await processOrder(order as OrderRow, supabase, singleToken.token, singleToken.error, dryRun, false, forceUpload);
      return json({ ok: true, mode: "single", dryRun, forceUpload, result });
    }

    // ── Retry failed ──────────────────────────────────────────────────────────
    if (mode === "retry_failed") {
      const { data: failedOrders } = await supabase.from("orders").select(ORDER_SELECT_COLUMNS).eq("google_ads_upload_status", "failed").not("payment_intent_id", "is", null).in("status", ["processing", "completed"]).limit(100);
      if (!failedOrders || failedOrders.length === 0) return json({ ok: true, mode: "retry_failed", processed: 0, message: "No failed uploads to retry" });
      // forceUpload cannot bypass the channel gate: a previously-failed order whose
      // acquisition is not Google is re-classified as skipped and drops out of this
      // mode's selection permanently (retry_failed selects status = "failed" only).
      const retryGate = await partitionByChannelGate(failedOrders as OrderRow[], supabase, dryRun);
      const results = [];
      // retry_failed uses forceUpload=true — admin explicitly wants to retry these
      if (retryGate.eligible.length > 0) {
        const retryToken = await ensureAccessToken();
        if (retryToken.failure) return retryToken.failure;
        for (const order of retryGate.eligible) results.push(await processOrder(order, supabase, retryToken.token, retryToken.error, dryRun, false, true));
      }
      const retryAll = [...results, ...retryGate.skipped];
      return json({ ok: true, mode: "retry_failed", dryRun, processed: retryAll.length, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success && !r.skipped).length, ...countGateSkips(retryGate.skipped), firstError: results.find(r => !r.success && !r.skipped)?.error, results: retryAll });
    }

    // ── Fail closed: only an explicit backfill reaches the backfill block ──────
    // LIVE ADAPTATION (GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION).
    // Authorization above admits a KNOWN mode, but a known mode with no handler on
    // this deployment (apply_refund_adjustments is TEST-only) or a "single" call
    // without a confirmationId used to fall through into the DEFAULT backfill —
    // a 100-order upload nobody asked for. Refuse instead.
    if (mode !== "backfill") return json({ ok: false, error: "Mode is not available on this deployment or a required parameter is missing", mode }, 400);

    // ── Backfill (default) ────────────────────────────────────────────────────
    const bfSourceSystem = body.sourceSystem ?? "new_site";
    const bfDateFrom = body.dateFrom ?? null;
    const bfDateTo = body.dateTo ?? null;
    const bfIncludeHistorical = body.includeHistorical ?? false;

    let pendingQuery = supabase
      .from("orders")
      .select(ORDER_SELECT_COLUMNS)
      .not("payment_intent_id", "is", null)
      .in("status", ["processing", "completed"])
      .is("google_ads_uploaded_at", null)
      .neq("status", "refunded")
      // Null-safe skip-status exclusion: include rows where google_ads_upload_status IS NULL
      // (never-attempted orders) OR status is none of the terminal skip states.
      // A plain .neq(...) excludes NULLs (Postgres: NULL <> 'x' is not TRUE), which silently
      // dropped every never-attempted order from backfill — the exact coverage gap we must fix.
      //
      // GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001 adds skipped_non_google_channel and
      // skipped_attribution_conflict here so a channel-gated order is decided ONCE and is
      // never re-selected by cron/backfill forever. An admin can still force a
      // re-evaluation for a single order via mode "single" (which re-runs the gate).
      .or(`google_ads_upload_status.is.null,and(google_ads_upload_status.neq.skip_historical,google_ads_upload_status.neq.skipped_website_tag,${CHANNEL_GATE_SKIP_STATUSES.map((s) => `google_ads_upload_status.neq.${s}`).join(",")})`)
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

    // Channel gate BEFORE the OAuth token request: a batch containing no
    // Google-attributed order never asks Google for anything at all.
    const backfillGate = await partitionByChannelGate(pendingOrders as OrderRow[], supabase, dryRun);

    const results = [];
    if (backfillGate.eligible.length > 0) {
      const bfToken = await ensureAccessToken();
      if (bfToken.failure) return bfToken.failure;
      for (const order of backfillGate.eligible) {
        const isHistoricalReplay = order.historical_import === true || order.source_system === "wordpress_legacy";
        results.push(await processOrder(order, supabase, bfToken.token, bfToken.error, dryRun, isHistoricalReplay, forceUpload));
      }
    }
    const allResults = [...results, ...backfillGate.skipped];

    return json({
      ok: true, mode: "backfill", dryRun, eclEnabled: GOOGLE_ADS_ECL_ENABLED,
      filters: { sourceSystem: bfSourceSystem, dateFrom: bfDateFrom, dateTo: bfDateTo, includeHistorical: bfIncludeHistorical },
      processed: allResults.length,
      channelGateEvaluated: (pendingOrders as OrderRow[]).length,
      channelGateEligible: backfillGate.eligible.length,
      uploaded: results.filter(r => r.success && !r.skipped).length,
      skipped: allResults.filter(r => r.skipped).length,
      skipped_website_tag: results.filter(r => r.skipped && r.skipReason?.includes("google_tag_fired")).length,
      deferred_ecl: results.filter(r => r.skipped && r.skipReason?.includes("ECL disabled")).length,
      ...countGateSkips(allResults),
      failed: results.filter(r => !r.success && !r.skipped).length,
      firstError: results.find(r => !r.success && !r.skipped)?.error,
      results: allResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[google-ads] Unhandled error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
