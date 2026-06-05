// sync-marketing-spend — Pulls DAILY campaign spend from Google Ads + Meta Ads
// and upserts it into public.marketing_ad_spend_daily for the Accounts/Payments
// Marketing Spend / ROI layer.
//
// PRIVACY: this function only READS ad spend (cost, clicks, impressions, campaign
// names) from the ad platforms. It sends NO PII — no DOB/age, no ESA/PSD/service
// type, no diagnosis, no assessment answers, no provider/pet info — to Google/Meta.
//
// AUTH: deployed with verify_jwt=true (gateway checks the JWT) AND an internal
// admin check (caller must be an accounts admin). Writes use the service role.
//
// Account IDs (LIVE, fixed):
//   Google customer_id      = 2480853323
//   Google login_customer_id (MCC) = 7629508384
//   Meta ad account         = 740236200362043
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Google Ads ──────────────────────────────────────────────────────────────
const GOOGLE_ADS_OAUTH_CLIENT_ID     = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
const GOOGLE_ADS_REFRESH_TOKEN       = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
const GOOGLE_ADS_DEVELOPER_TOKEN     = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_API_VERSION         = "v20";
const GOOGLE_ADS_ADVERTISER_ID       = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") || "2480853323";
const GOOGLE_ADS_MCC_CUSTOMER_ID     = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "7629508384";

// ── Meta Ads ─────────────────────────────────────────────────────────────────
// Dedicated ads_read token (kept separate from the CAPI token). The CAPI token
// does NOT have ads_read, so a system-user token with ads_read is required here.
const META_ADS_ACCESS_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
const META_ADS_ACCOUNT_ID   = Deno.env.get("META_ADS_ACCOUNT_ID") || "740236200362043";
const META_API_VERSION      = "v19.0";

interface SyncResult {
  platform: "google_ads" | "meta_ads";
  success: boolean;
  dateRange: { from: string; to: string };
  rowsUpserted: number;
  totalSpend: number;      // native account currency
  currency: string;
  error?: string;
  diagnostics: Record<string, unknown>;
}

interface SpendRow {
  spend_date: string;
  platform: "google_ads" | "meta_ads";
  account_id: string;
  account_name: string | null;
  campaign_id: string;
  campaign_name: string | null;
  currency: string;
  spend_amount: number;
  clicks: number | null;
  impressions: number | null;
  platform_conversions: number | null;
  raw_payload: unknown;
  fetched_at: string;
  updated_at: string;
}

function isoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getGoogleAccessToken(): Promise<{ token: string | null; error?: string }> {
  if (!GOOGLE_ADS_OAUTH_CLIENT_ID || !GOOGLE_ADS_OAUTH_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    return { token: null, error: "Missing Google Ads OAuth secrets (client id/secret/refresh token)" };
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
    if (!res.ok) return { token: null, error: `OAuth token refresh failed (${res.status}): ${text.slice(0, 300)}` };
    return { token: (JSON.parse(text) as { access_token: string }).access_token };
  } catch (err) {
    return { token: null, error: `OAuth fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function syncGoogle(from: string, to: string): Promise<{ rows: SpendRow[]; result: SyncResult }> {
  const now = new Date().toISOString();
  const diagnostics: Record<string, unknown> = {
    using_mcc_login_customer_id: GOOGLE_ADS_MCC_CUSTOMER_ID,
    querying_customer_id: GOOGLE_ADS_ADVERTISER_ID,
    api_version: GOOGLE_ADS_API_VERSION,
    date_range: { from, to },
  };
  const fail = (error: string, currency = "USD"): { rows: SpendRow[]; result: SyncResult } => ({
    rows: [],
    result: { platform: "google_ads", success: false, dateRange: { from, to }, rowsUpserted: 0, totalSpend: 0, currency, error, diagnostics },
  });

  const tok = await getGoogleAccessToken();
  if (!tok.token) return fail(`Google Ads OAuth failed: ${tok.error}`);
  if (!GOOGLE_ADS_DEVELOPER_TOKEN) return fail("Missing GOOGLE_ADS_DEVELOPER_TOKEN secret");

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_ADVERTISER_ID}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${tok.token}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
    "login-customer-id": GOOGLE_ADS_MCC_CUSTOMER_ID,
    "Content-Type": "application/json",
  };

  // Account currency
  let currency = "USD";
  try {
    const cRes = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ query: `SELECT customer.currency_code FROM customer WHERE customer.id = ${GOOGLE_ADS_ADVERTISER_ID} LIMIT 1` }),
    });
    if (cRes.ok) {
      const cData = JSON.parse(await cRes.text()) as Array<{ results?: Array<{ customer: { currencyCode: string } }> }>;
      const code = cData?.[0]?.results?.[0]?.customer?.currencyCode;
      if (code) currency = code;
    }
  } catch { /* keep USD fallback */ }
  diagnostics.account_currency = currency;

  // Daily campaign spend — segments.date makes Google return one row per day.
  const query = `
    SELECT campaign.id, campaign.name, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'`;

  let rawText = "";
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query }) });
    rawText = await res.text();
    diagnostics.api_status = res.status;
    if (rawText.trim().startsWith("<")) return fail(`Google Ads API returned HTML (${res.status})`, currency);
    const parsed = JSON.parse(rawText);
    if (!res.ok) return fail(`Google Ads API ${res.status}: ${JSON.stringify(parsed).slice(0, 500)}`, currency);

    const batches = parsed as Array<{ results?: Array<{
      campaign: { id: string; name: string };
      segments: { date: string };
      metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
    }> }>;

    const rows: SpendRow[] = [];
    let total = 0;
    for (const batch of batches) {
      for (const r of batch.results ?? []) {
        const spend = parseInt(r.metrics.costMicros ?? "0", 10) / 1_000_000;
        total += spend;
        rows.push({
          spend_date: r.segments.date,
          platform: "google_ads",
          account_id: GOOGLE_ADS_ADVERTISER_ID,
          account_name: "Paw Tenant",
          campaign_id: String(r.campaign.id ?? ""),
          campaign_name: r.campaign.name ?? null,
          currency,
          spend_amount: spend,
          clicks: parseInt(r.metrics.clicks ?? "0", 10),
          impressions: parseInt(r.metrics.impressions ?? "0", 10),
          platform_conversions: typeof r.metrics.conversions === "number" ? r.metrics.conversions : null,
          raw_payload: r,
          fetched_at: now,
          updated_at: now,
        });
      }
    }
    diagnostics.rows_returned = rows.length;
    diagnostics.total_spend = total;
    return { rows, result: { platform: "google_ads", success: true, dateRange: { from, to }, rowsUpserted: rows.length, totalSpend: total, currency, diagnostics } };
  } catch (err) {
    return fail(`Google Ads fetch/parse error: ${err instanceof Error ? err.message : String(err)} | body: ${rawText.slice(0, 200)}`, currency);
  }
}

function purchaseFromActions(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  for (const a of actions as Array<{ action_type?: string; value?: string }>) {
    if (a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase") {
      const v = parseFloat(a.value ?? "0");
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

async function syncMeta(from: string, to: string): Promise<{ rows: SpendRow[]; result: SyncResult }> {
  const now = new Date().toISOString();
  const acct = META_ADS_ACCOUNT_ID.startsWith("act_") ? META_ADS_ACCOUNT_ID : `act_${META_ADS_ACCOUNT_ID}`;
  const accountIdBare = acct.replace("act_", "");
  const diagnostics: Record<string, unknown> = { account_id: accountIdBare, date_range: { from, to }, api_version: META_API_VERSION };
  const fail = (error: string, currency = "USD"): { rows: SpendRow[]; result: SyncResult } => ({
    rows: [],
    result: { platform: "meta_ads", success: false, dateRange: { from, to }, rowsUpserted: 0, totalSpend: 0, currency, error, diagnostics },
  });

  if (!META_ADS_ACCESS_TOKEN) {
    return fail("Missing META_ADS_ACCESS_TOKEN secret (system-user token with ads_read on the ad account)");
  }

  // Account currency
  let currency = "USD";
  try {
    const cRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${acct}?fields=currency&access_token=${META_ADS_ACCESS_TOKEN}`);
    const cData = await cRes.json() as { currency?: string; error?: { message: string } };
    if (cData.currency) currency = cData.currency;
  } catch { /* keep USD fallback */ }
  diagnostics.account_currency = currency;

  const fields = "campaign_id,campaign_name,spend,impressions,clicks,actions";
  const timeRange = JSON.stringify({ since: from, until: to });
  let next: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${acct}/insights?level=campaign&time_increment=1` +
    `&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&access_token=${META_ADS_ACCESS_TOKEN}&limit=200`;

  const rows: SpendRow[] = [];
  let total = 0;
  let pages = 0;
  try {
    while (next && pages < 25) {
      pages++;
      const res = await fetch(next);
      const data = await res.json() as {
        data?: Array<{ date_start: string; campaign_id: string; campaign_name: string; spend?: string; impressions?: string; clicks?: string; actions?: unknown }>;
        paging?: { next?: string };
        error?: { message: string; code: number };
      };
      if (data.error) return fail(`Meta API error: ${data.error.message}`, currency);
      for (const c of data.data ?? []) {
        const spend = parseFloat(c.spend ?? "0");
        total += spend;
        rows.push({
          spend_date: c.date_start,
          platform: "meta_ads",
          account_id: accountIdBare,
          account_name: "PawTenant",
          campaign_id: String(c.campaign_id ?? ""),
          campaign_name: c.campaign_name ?? null,
          currency,
          spend_amount: spend,
          clicks: parseInt(c.clicks ?? "0", 10),
          impressions: parseInt(c.impressions ?? "0", 10),
          platform_conversions: purchaseFromActions(c.actions),
          raw_payload: c,
          fetched_at: now,
          updated_at: now,
        });
      }
      next = data.paging?.next ?? null;
    }
    diagnostics.rows_returned = rows.length;
    diagnostics.pages = pages;
    diagnostics.total_spend = total;
    return { rows, result: { platform: "meta_ads", success: true, dateRange: { from, to }, rowsUpserted: rows.length, totalSpend: total, currency, diagnostics } };
  } catch (err) {
    return fail(`Meta fetch error: ${err instanceof Error ? err.message : String(err)}`, currency);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Admin gate (caller must be an accounts admin) ──
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!jwt) return json({ ok: false, error: "Missing Authorization bearer token" }, 401);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return json({ ok: false, error: "Invalid or expired session" }, 401);
    const { data: prof } = await supabase
      .from("doctor_profiles").select("is_admin, role").eq("user_id", user.id).maybeSingle();
    const p = prof as { is_admin?: boolean; role?: string | null } | null;
    const isAccountsAdmin = !!p && (p.is_admin === true || ["owner", "admin_manager", "finance"].includes(p.role ?? ""));
    if (!isAccountsAdmin) return json({ ok: false, error: "Not authorized (accounts admin required)" }, 403);
  } catch (err) {
    return json({ ok: false, error: `Auth check failed: ${err instanceof Error ? err.message : String(err)}` }, 401);
  }

  // ── Parse input ──
  let platform = "all", dateFrom = "", dateTo = "";
  try {
    const body = await req.json() as { platform?: string; dateFrom?: string; dateTo?: string };
    platform = (body.platform || "all").toLowerCase();
    dateFrom = body.dateFrom || "";
    dateTo = body.dateTo || "";
  } catch { /* defaults */ }
  if (!isoDate(dateFrom) || !isoDate(dateTo)) {
    return json({ ok: false, error: "dateFrom and dateTo are required (YYYY-MM-DD)" }, 400);
  }
  if (!["all", "google", "meta"].includes(platform)) {
    return json({ ok: false, error: `Unknown platform '${platform}' (use google | meta | all)` }, 400);
  }

  const results: SyncResult[] = [];

  async function runOne(which: "google" | "meta") {
    const { rows, result } = which === "google" ? await syncGoogle(dateFrom, dateTo) : await syncMeta(dateFrom, dateTo);
    // Upsert spend rows (only on success and when there is data)
    if (result.success && rows.length > 0) {
      const { error: upErr } = await supabase
        .from("marketing_ad_spend_daily")
        .upsert(rows, { onConflict: "platform,spend_date,account_id,campaign_id" });
      if (upErr) {
        result.success = false;
        result.error = `DB upsert failed: ${upErr.message}`;
        result.rowsUpserted = 0;
      }
    }
    // Log the sync run (drives "last synced" + "sync errors" in the UI)
    await supabase.from("marketing_ad_spend_sync_runs").insert({
      platform: result.platform,
      status: result.success ? "success" : "error",
      date_from: dateFrom,
      date_to: dateTo,
      rows_upserted: result.rowsUpserted,
      total_spend: result.totalSpend,
      currency: result.currency,
      error: result.error ?? null,
      finished_at: new Date().toISOString(),
    });
    results.push(result);
  }

  if (platform === "all" || platform === "google") await runOne("google");
  if (platform === "all" || platform === "meta")   await runOne("meta");

  const anyError = results.some((r) => !r.success);
  return json({
    ok: !anyError,
    project: "pawtenant-live",
    requested: { platform, dateFrom, dateTo },
    results,
  });
});
