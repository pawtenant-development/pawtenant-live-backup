// google-ads-auth-debug — Temporary diagnostic function
// Diagnoses why advertiser 2480853323 under MCC 7629508384 returns USER_PERMISSION_DENIED
// Uses the exact same credentials as fetch-ad-spend

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Hardcoded IDs (no dashes) ─────────────────────────────────────────────────
const ADVERTISER_ID = "2480853323";
const MCC_ID        = "7629508384";
const API_VERSION   = "v20";

// ── Redact helper — never log actual secret values ────────────────────────────
function redact(val: string | undefined | null): string {
  if (!val) return "[NOT SET]";
  if (val.length <= 8) return "[SET — too short to redact safely]";
  return `${val.slice(0, 4)}...${val.slice(-4)} (len=${val.length})`;
}

// ── Step 0: Exchange refresh token for access token ───────────────────────────
async function getAccessToken(): Promise<{ token: string | null; error?: string; fields?: string[] }> {
  const clientId     = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId     && "GOOGLE_ADS_OAUTH_CLIENT_ID",
      !clientSecret && "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
      !refreshToken && "GOOGLE_ADS_REFRESH_TOKEN",
    ].filter(Boolean) as string[];
    return { token: null, error: `Missing secrets: ${missing.join(", ")}` };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok) {
      return {
        token: null,
        error: `Token exchange failed HTTP ${res.status}: ${text.slice(0, 400)}`,
      };
    }

    const fields = Object.keys(parsed);
    const token  = parsed["access_token"] as string | undefined;

    return {
      token: token ?? null,
      error: token ? undefined : "access_token missing from response",
      fields,
    };
  } catch (err) {
    return { token: null, error: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Step 1: listAccessibleCustomers ──────────────────────────────────────────
async function listAccessibleCustomers(
  token: string,
  devToken: string
): Promise<{
  url: string;
  headers_sent: Record<string, string>;
  http_status: number;
  success: boolean;
  resource_names?: string[];
  raw_error?: string;
}> {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`;
  const headers: Record<string, string> = {
    "Authorization":   `Bearer [REDACTED]`,
    "developer-token": "[REDACTED]",
  };

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization":   `Bearer ${token}`,
      "developer-token": devToken,
    },
  });

  const text = await res.text();
  let parsed: { resourceNames?: string[] } = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }

  return {
    url,
    headers_sent: headers,
    http_status: res.status,
    success: res.ok,
    resource_names: parsed.resourceNames,
    raw_error: res.ok ? undefined : text.slice(0, 1000),
  };
}

// ── Step 2: MCC self-query (no login-customer-id needed) ──────────────────────
async function testMCCQuery(
  token: string,
  devToken: string
): Promise<{
  url: string;
  headers_sent: Record<string, string>;
  http_status: number;
  success: boolean;
  customer_id?: string;
  customer_name?: string;
  raw_error?: string;
}> {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${MCC_ID}/googleAds:searchStream`;
  const query = "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1";

  const headers: Record<string, string> = {
    "Authorization":   "Bearer [REDACTED]",
    "developer-token": "[REDACTED]",
    "Content-Type":    "application/json",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization":   `Bearer ${token}`,
      "developer-token": devToken,
      "Content-Type":    "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }

  let customerId: string | undefined;
  let customerName: string | undefined;
  if (res.ok && Array.isArray(parsed)) {
    const first = (parsed as Array<{ results?: Array<{ customer?: { id?: string; descriptiveName?: string } }> }>)[0];
    const row = first?.results?.[0];
    customerId   = row?.customer?.id;
    customerName = row?.customer?.descriptiveName;
  }

  return {
    url,
    headers_sent: headers,
    http_status: res.status,
    success: res.ok,
    customer_id: customerId,
    customer_name: customerName,
    raw_error: res.ok ? undefined : text.slice(0, 1000),
  };
}

// ── Step 3: Advertiser query WITH login-customer-id header ────────────────────
async function testAdvertiserQuery(
  token: string,
  devToken: string
): Promise<{
  url: string;
  headers_sent: Record<string, string>;
  http_status: number;
  success: boolean;
  customer_id?: string;
  customer_name?: string;
  currency_code?: string;
  raw_error?: string;
}> {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${ADVERTISER_ID}/googleAds:searchStream`;
  const query = "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1";

  const headers: Record<string, string> = {
    "Authorization":     "Bearer [REDACTED]",
    "developer-token":   "[REDACTED]",
    "login-customer-id": MCC_ID,
    "Content-Type":      "application/json",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization":     `Bearer ${token}`,
      "developer-token":   devToken,
      "login-customer-id": MCC_ID,
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }

  let customerId: string | undefined;
  let customerName: string | undefined;
  let currencyCode: string | undefined;
  if (res.ok && Array.isArray(parsed)) {
    const first = (parsed as Array<{ results?: Array<{ customer?: { id?: string; descriptiveName?: string; currencyCode?: string } }> }>)[0];
    const row = first?.results?.[0];
    customerId   = row?.customer?.id;
    customerName = row?.customer?.descriptiveName;
    currencyCode = row?.customer?.currencyCode;
  }

  return {
    url,
    headers_sent: headers,
    http_status: res.status,
    success: res.ok,
    customer_id: customerId,
    customer_name: customerName,
    currency_code: currencyCode,
    raw_error: res.ok ? undefined : text.slice(0, 1000),
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

  // ── Secret presence check (redacted) ─────────────────────────────────────
  const secretsStatus = {
    GOOGLE_ADS_OAUTH_CLIENT_ID:     redact(Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID")),
    GOOGLE_ADS_OAUTH_CLIENT_SECRET: redact(Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET")),
    GOOGLE_ADS_REFRESH_TOKEN:       redact(Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")),
    GOOGLE_ADS_DEVELOPER_TOKEN:     redact(devToken),
  };

  console.log("[debug] Secrets status:", JSON.stringify(secretsStatus));

  if (!devToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: "GOOGLE_ADS_DEVELOPER_TOKEN is not set",
      secrets_status: secretsStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  // ── Step 0: get access token ──────────────────────────────────────────────
  const tokenResult = await getAccessToken();
  console.log("[debug] Token exchange result — fields:", tokenResult.fields, "error:", tokenResult.error);

  if (!tokenResult.token) {
    return new Response(JSON.stringify({
      ok: false,
      step: "token_exchange",
      error: tokenResult.error,
      token_response_fields: tokenResult.fields,
      secrets_status: secretsStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  // ── Step 1: listAccessibleCustomers ──────────────────────────────────────
  const accessibleResult = await listAccessibleCustomers(tokenResult.token, devToken);
  console.log("[debug] listAccessibleCustomers:", JSON.stringify({
    status: accessibleResult.http_status,
    success: accessibleResult.success,
    count: accessibleResult.resource_names?.length,
    error: accessibleResult.raw_error?.slice(0, 200),
  }));

  // ── Step 2: MCC self-query ────────────────────────────────────────────────
  const mccResult = await testMCCQuery(tokenResult.token, devToken);
  console.log("[debug] MCC query:", JSON.stringify({
    status: mccResult.http_status,
    success: mccResult.success,
    customer_id: mccResult.customer_id,
    error: mccResult.raw_error?.slice(0, 200),
  }));

  // ── Step 3: Advertiser query with login-customer-id ───────────────────────
  const advertiserResult = await testAdvertiserQuery(tokenResult.token, devToken);
  console.log("[debug] Advertiser query:", JSON.stringify({
    status: advertiserResult.http_status,
    success: advertiserResult.success,
    customer_id: advertiserResult.customer_id,
    error: advertiserResult.raw_error?.slice(0, 200),
  }));

  // ── Build clean diagnostic response ──────────────────────────────────────
  const response = {
    ok: true,
    timestamp: new Date().toISOString(),
    hardcoded_ids: {
      advertiser_id: ADVERTISER_ID,
      mcc_login_customer_id: MCC_ID,
    },
    secrets_status: secretsStatus,
    token_exchange: {
      success: true,
      response_fields: tokenResult.fields,
    },
    step1_list_accessible_customers: {
      url: accessibleResult.url,
      headers_sent: accessibleResult.headers_sent,
      http_status: accessibleResult.http_status,
      success: accessibleResult.success,
      accessible_customers: accessibleResult.resource_names ?? [],
      accessible_customer_count: accessibleResult.resource_names?.length ?? 0,
      raw_error: accessibleResult.raw_error,
    },
    step2_mcc_self_query: {
      url: mccResult.url,
      headers_sent: mccResult.headers_sent,
      http_status: mccResult.http_status,
      mcc_test_success: mccResult.success,
      customer_id_returned: mccResult.customer_id,
      customer_name_returned: mccResult.customer_name,
      raw_error: mccResult.raw_error,
    },
    step3_advertiser_query_with_login_customer_id: {
      url: advertiserResult.url,
      headers_sent: advertiserResult.headers_sent,
      http_status: advertiserResult.http_status,
      advertiser_test_success: advertiserResult.success,
      customer_id_returned: advertiserResult.customer_id,
      customer_name_returned: advertiserResult.customer_name,
      currency_code: advertiserResult.currency_code,
      raw_error: advertiserResult.raw_error,
    },
    diagnosis: {
      accessible_customers_retrieved: accessibleResult.success,
      mcc_accessible: mccResult.success,
      advertiser_accessible_with_mcc_header: advertiserResult.success,
      // Is the advertiser actually in the accessible customers list?
      advertiser_in_accessible_list: (accessibleResult.resource_names ?? [])
        .some((r) => r.includes(ADVERTISER_ID)),
      mcc_in_accessible_list: (accessibleResult.resource_names ?? [])
        .some((r) => r.includes(MCC_ID)),
    },
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
