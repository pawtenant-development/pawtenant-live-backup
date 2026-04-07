// fetch-ad-spend — Fetches ad spend data from Meta, Google Ads, and TikTok Ads APIs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdSpendResult {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaigns: { id: string; name: string; spend: number; impressions: number; clicks: number; status: string }[];
  currency: string;
  dateRange: { from: string; to: string };
  error?: string;
}

// ── Meta (Facebook/Instagram) Ads ────────────────────────────────────────────
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
    return {
      platform: "facebook",
      spend: 0, impressions: 0, clicks: 0,
      campaigns: [],
      currency: "USD",
      dateRange: { from: dateFrom, to: dateTo },
      error: `Meta API error: ${data.error.message}`,
    };
  }

  const campaigns = (data.data ?? []).map((c) => ({
    id: c.campaign_id,
    name: c.campaign_name,
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
    campaigns,
    currency: "USD",
    dateRange: { from: dateFrom, to: dateTo },
  };
}

// ── Google Ads ────────────────────────────────────────────────────────────────
async function fetchGoogleSpend(
  accessToken: string,
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<AdSpendResult> {
  // Google Ads API v16 — GAQL query
  const cleanId = customerId.replace(/-/g, "");
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

  const url = `https://googleads.googleapis.com/v16/customers/${cleanId}/googleAds:search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": "PLACEHOLDER", // Users need to provide this
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const data = await res.json() as {
    results?: {
      campaign: { id: string; name: string; status: string };
      metrics: { costMicros: string; impressions: string; clicks: string };
    }[];
    error?: { message: string };
  };

  if (data.error || !res.ok) {
    return {
      platform: "google",
      spend: 0, impressions: 0, clicks: 0,
      campaigns: [],
      currency: "USD",
      dateRange: { from: dateFrom, to: dateTo },
      error: `Google Ads API error: ${data.error?.message ?? "Check your Customer ID and access token"}`,
    };
  }

  const campaigns = (data.results ?? []).map((r) => ({
    id: r.campaign.id,
    name: r.campaign.name,
    spend: parseInt(r.metrics.costMicros ?? "0", 10) / 1_000_000,
    impressions: parseInt(r.metrics.impressions ?? "0", 10),
    clicks: parseInt(r.metrics.clicks ?? "0", 10),
    status: r.campaign.status,
  }));

  return {
    platform: "google",
    spend: campaigns.reduce((s, c) => s + c.spend, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    campaigns,
    currency: "USD",
    dateRange: { from: dateFrom, to: dateTo },
  };
}

// ── TikTok Ads ────────────────────────────────────────────────────────────────
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
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
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
    return {
      platform: "tiktok",
      spend: 0, impressions: 0, clicks: 0,
      campaigns: [],
      currency: "USD",
      dateRange: { from: dateFrom, to: dateTo },
      error: `TikTok API error: ${data.message}`,
    };
  }

  // Aggregate by campaign
  const campaignMap: Record<string, { name: string; spend: number; impressions: number; clicks: number }> = {};
  for (const item of data.data?.list ?? []) {
    const id = item.dimensions.campaign_id;
    if (!campaignMap[id]) {
      campaignMap[id] = { name: item.metrics.campaign_name, spend: 0, impressions: 0, clicks: 0 };
    }
    campaignMap[id].spend += parseFloat(item.metrics.spend ?? "0");
    campaignMap[id].impressions += parseInt(item.metrics.impressions ?? "0", 10);
    campaignMap[id].clicks += parseInt(item.metrics.clicks ?? "0", 10);
  }

  const campaigns = Object.entries(campaignMap).map(([id, c]) => ({
    id,
    name: c.name,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    status: "active",
  }));

  return {
    platform: "tiktok",
    spend: campaigns.reduce((s, c) => s + c.spend, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    campaigns,
    currency: "USD",
    dateRange: { from: dateFrom, to: dateTo },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json() as {
      platform: string;
      dateFrom: string;
      dateTo: string;
    };

    const { platform, dateFrom, dateTo } = body;

    // Load credentials from DB
    const { data: settings, error: settingsErr } = await supabase
      .from("ad_platform_settings")
      .select("*")
      .eq("platform", platform)
      .maybeSingle();

    if (settingsErr || !settings) {
      return new Response(JSON.stringify({ ok: false, error: `No credentials found for platform: ${platform}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    let result: AdSpendResult;

    if (platform === "facebook") {
      result = await fetchMetaSpend(settings.access_token, settings.account_id, dateFrom, dateTo);
    } else if (platform === "google") {
      result = await fetchGoogleSpend(settings.access_token, settings.account_id, dateFrom, dateTo);
    } else if (platform === "tiktok") {
      result = await fetchTikTokSpend(settings.access_token, settings.account_id, dateFrom, dateTo);
    } else {
      return new Response(JSON.stringify({ ok: false, error: `Unknown platform: ${platform}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Cache the result in DB
    await supabase
      .from("ad_platform_settings")
      .update({
        last_fetched_at: new Date().toISOString(),
        last_spend_data: result,
        updated_at: new Date().toISOString(),
      })
      .eq("platform", platform);

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
