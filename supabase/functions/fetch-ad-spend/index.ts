// fetch-ad-spend — Fetches ad spend data from Meta, Google Ads, and TikTok Ads APIs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_OAUTH_CLIENT_ID     = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
const GOOGLE_ADS_REFRESH_TOKEN       = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
const GOOGLE_ADS_DEVELOPER_TOKEN     = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_API_VERSION         = "v20";

const GOOGLE_ADS_ADVERTISER_ID   = "2480853323";
const GOOGLE_ADS_MCC_CUSTOMER_ID = "7629508384";

interface AdSpendResult {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaigns: { id: string; name: string; spend: number; impressions: number; clicks: number; status: string }[];
  currency: string;
  dateRange: { from: string; to: string };
  error?: string;
  debug?: Record<string, unknown>;
}

async function getGoogleAccessToken(): Promise<{ token: string | null; error?: string }> {
  if (!GOOGLE_ADS_OAUTH_CLIENT_ID || !GOOGLE_ADS_OAUTH_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    return { token: null, error: "Missing Google Ads OAuth secrets" };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     GOOGLE_ADS_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
        refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
        grant_type:    "refresh_token",
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

async function fetchMetaSpend(
  accessToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string
): Promise<AdSpendResult> {
  const accountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = "campaign_name,spend,impressions,clicks,campaign_id";
  const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
  const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${accessToken}&limit=50`;

  const res = await fetch(url);
  const data = await res.json() as {
    data?: { campaign_id: string; campaign_name: string; spend: string; impressions: string; clicks: string }[];
    error?: { message: string; code: number };
  };

  if (data.error) {
    return { platform: "facebook", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: "USD", dateRange: { from: dateFrom, to: dateTo }, error: `Meta API error: ${data.error.message}` };
  }

  const campaigns = (data.data ?? []).map((c) => ({
    id: c.campaign_id, name: c.campaign_name,
    spend: parseFloat(c.spend ?? "0"),
    impressions: parseInt(c.impressions ?? "0", 10),
    clicks: parseInt(c.clicks ?? "0", 10),
    status: "active",
  }));

  return {
    platform: "facebook",
    spend: campaigns.reduce((s, c) => s + c.spend, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    campaigns, currency: "USD",
    dateRange: { from: dateFrom, to: dateTo },
  };
}

// ── Google Ads — MCC mode ─────────────────────────────────────────────────────
// Step 1: query the account's currency via a customer resource query
// Step 2: fetch campaigns with spend
async function fetchGoogleSpend(dateFrom: string, dateTo: string): Promise<AdSpendResult> {
  const tokenResult = await getGoogleAccessToken();
  if (!tokenResult.token) {
    return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: "USD", dateRange: { from: dateFrom, to: dateTo }, error: `Google Ads OAuth failed: ${tokenResult.error}` };
  }

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: "USD", dateRange: { from: dateFrom, to: dateTo }, error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN secret" };
  }

  const advertiserCustomerId = GOOGLE_ADS_ADVERTISER_ID;
  const mccCustomerId        = GOOGLE_ADS_MCC_CUSTOMER_ID;
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${advertiserCustomerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    "Authorization":     `Bearer ${tokenResult.token}`,
    "developer-token":   GOOGLE_ADS_DEVELOPER_TOKEN,
    "login-customer-id": mccCustomerId,
    "Content-Type":      "application/json",
  };

  // ── Step 1: fetch the account currency ───────────────────────────────────
  let accountCurrency = "USD"; // fallback
  try {
    const currencyRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `SELECT customer.currency_code FROM customer WHERE customer.id = ${advertiserCustomerId} LIMIT 1`,
      }),
    });
    const currencyText = await currencyRes.text();
    console.log("[fetch-ad-spend] currency query status:", currencyRes.status);
    console.log("[fetch-ad-spend] currency query response:", currencyText.slice(0, 400));
    if (currencyRes.ok) {
      const currencyData = JSON.parse(currencyText) as Array<{
        results?: Array<{ customer: { currencyCode: string } }>;
      }>;
      const code = currencyData?.[0]?.results?.[0]?.customer?.currencyCode;
      if (code) {
        accountCurrency = code;
        console.log("[fetch-ad-spend] detected account currency:", accountCurrency);
      }
    }
  } catch (e) {
    console.log("[fetch-ad-spend] currency query failed, using USD fallback:", String(e));
  }

  // ── Step 2: fetch campaign spend ─────────────────────────────────────────
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;

  console.log("[fetch-ad-spend] Google Ads request — mode: mcc_mode");
  console.log("  advertiser:", advertiserCustomerId, "mcc:", mccCustomerId);
  console.log("  currency:", accountCurrency, "url:", url);

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query }) });
    const rawText = await res.text();

    console.log("[fetch-ad-spend] Google Ads API status:", res.status);
    console.log("[fetch-ad-spend] Google Ads API response (first 800):", rawText.slice(0, 800));

    if (rawText.trim().startsWith("<")) {
      return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: accountCurrency, dateRange: { from: dateFrom, to: dateTo }, error: `Google Ads API returned HTML (${res.status})` };
    }

    let responseData: unknown;
    try { responseData = JSON.parse(rawText); } catch {
      return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: accountCurrency, dateRange: { from: dateFrom, to: dateTo }, error: `Non-JSON response (${res.status}): ${rawText.slice(0, 400)}` };
    }

    if (!res.ok) {
      const errMsg = JSON.stringify(responseData).slice(0, 800);
      console.log("[fetch-ad-spend] Google Ads API error body:", errMsg);
      return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: accountCurrency, dateRange: { from: dateFrom, to: dateTo }, error: `Google Ads API ${res.status}: ${errMsg}` };
    }

    const batches = responseData as Array<{
      results?: Array<{
        campaign: { id: string; name: string; status: string };
        metrics: { costMicros: string; impressions: string; clicks: string };
      }>;
    }>;

    const campaigns: AdSpendResult["campaigns"] = [];
    for (const batch of batches) {
      for (const r of batch.results ?? []) {
        campaigns.push({
          id: r.campaign.id,
          name: r.campaign.name,
          // costMicros is in the account's currency, divide by 1M to get major units
          spend: parseInt(r.metrics.costMicros ?? "0", 10) / 1_000_000,
          impressions: parseInt(r.metrics.impressions ?? "0", 10),
          clicks: parseInt(r.metrics.clicks ?? "0", 10),
          status: r.campaign.status,
        });
      }
    }

    console.log("[fetch-ad-spend] Google Ads success — campaigns:", campaigns.length, "currency:", accountCurrency);

    return {
      platform: "google",
      spend: campaigns.reduce((s, c) => s + c.spend, 0),
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      campaigns,
      currency: accountCurrency,   // ← actual currency from the account, NOT hardcoded USD
      dateRange: { from: dateFrom, to: dateTo },
      debug: { mode: "mcc_mode", advertiserCustomerId, mccCustomerId, url, campaignsFound: campaigns.length, currency: accountCurrency },
    };
  } catch (err) {
    return { platform: "google", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: accountCurrency, dateRange: { from: dateFrom, to: dateTo }, error: `Google Ads fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function fetchTikTokSpend(
  accessToken: string,
  advertiserId: string,
  dateFrom: string,
  dateTo: string
): Promise<AdSpendResult> {
  const url = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/";
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks", "campaign_name"]),
    start_date: dateFrom,
    end_date: dateTo,
    page_size: "50",
  });

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
  });

  const data = await res.json() as {
    code: number;
    message: string;
    data?: {
      list?: {
        dimensions: { campaign_id: string };
        metrics: { spend: string; impressions: string; clicks: string; campaign_name: string };
      }[];
    };
  };

  if (data.code !== 0) {
    return { platform: "tiktok", spend: 0, impressions: 0, clicks: 0, campaigns: [], currency: "USD", dateRange: { from: dateFrom, to: dateTo }, error: `TikTok API error: ${data.message}` };
  }

  const campaignMap: Record<string, { name: string; spend: number; impressions: number; clicks: number }> = {};
  for (const item of data.data?.list ?? []) {
    const id = item.dimensions.campaign_id;
    if (!campaignMap[id]) campaignMap[id] = { name: item.metrics.campaign_name, spend: 0, impressions: 0, clicks: 0 };
    campaignMap[id].spend += parseFloat(item.metrics.spend ?? "0");
    campaignMap[id].impressions += parseInt(item.metrics.impressions ?? "0", 10);
    campaignMap[id].clicks += parseInt(item.metrics.clicks ?? "0", 10);
  }

  const campaigns = Object.entries(campaignMap).map(([id, c]) => ({ id, name: c.name, spend: c.spend, impressions: c.impressions, clicks: c.clicks, status: "active" }));

  return {
    platform: "tiktok",
    spend: campaigns.reduce((s, c) => s + c.spend, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    campaigns, currency: "USD",
    dateRange: { from: dateFrom, to: dateTo },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json() as { platform: string; dateFrom: string; dateTo: string };
    const { platform, dateFrom, dateTo } = body;

    let result: AdSpendResult;

    if (platform === "google") {
      result = await fetchGoogleSpend(dateFrom, dateTo);
    } else {
      const { data: settings, error: settingsErr } = await supabase
        .from("ad_platform_settings")
        .select("*")
        .eq("platform", platform)
        .maybeSingle();

      if (settingsErr || !settings) {
        return new Response(JSON.stringify({ ok: false, error: `No credentials found for platform: ${platform}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      if (platform === "facebook") {
        result = await fetchMetaSpend(settings.access_token, settings.account_id, dateFrom, dateTo);
      } else if (platform === "tiktok") {
        result = await fetchTikTokSpend(settings.access_token, settings.account_id, dateFrom, dateTo);
      } else {
        return new Response(JSON.stringify({ ok: false, error: `Unknown platform: ${platform}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }
    }

    // Cache the result in DB — this overwrites any stale cached data including old currency: "USD"
    await supabase
      .from("ad_platform_settings")
      .upsert({
        platform,
        last_fetched_at: new Date().toISOString(),
        last_spend_data: result,
        updated_at: new Date().toISOString(),
      }, { onConflict: "platform" });

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
