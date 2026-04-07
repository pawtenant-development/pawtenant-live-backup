/**
 * google-oauth-start
 *
 * Generates a Google OAuth 2.0 authorization URL for the admin to visit.
 * The user clicks the URL, grants consent, and Google redirects to the
 * callback function with an authorization code.
 *
 * Required secrets:
 *   GOOGLE_ADS_OAUTH_CLIENT_ID     — OAuth 2.0 Client ID from Google Cloud Console
 *   GOOGLE_ADS_OAUTH_CLIENT_SECRET — OAuth 2.0 Client Secret
 *
 * The redirect_uri must be registered in Google Cloud Console as an
 * authorized redirect URI. It should point to the google-oauth-callback
 * edge function URL.
 *
 * Scopes requested:
 *   - https://www.googleapis.com/auth/adwords  (Google Ads API — conversions + reporting)
 *
 * Returns:
 *   { ok: true, authUrl: "https://accounts.google.com/o/oauth2/v2/auth?..." }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const clientId = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  if (!clientId || !clientSecret) {
    return json({
      ok: false,
      error: "Missing GOOGLE_ADS_OAUTH_CLIENT_ID or GOOGLE_ADS_OAUTH_CLIENT_SECRET in Supabase secrets.",
      setup: [
        "1. Go to Google Cloud Console → APIs & Services → Credentials",
        "2. Create an OAuth 2.0 Client ID (Web application type)",
        "3. Add the callback URL as an authorized redirect URI",
        "4. Copy Client ID and Client Secret to Supabase Edge Function secrets",
      ],
    }, 500);
  }

  // The callback URL — this edge function handles the code exchange
  const callbackUrl = `${supabaseUrl}/functions/v1/google-oauth-callback`;

  // State param — used to verify the callback is legitimate
  const state = crypto.randomUUID();

  // Build the OAuth consent URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/adwords",
    ].join(" "),
    access_type: "offline",      // Required to get a refresh_token
    prompt: "consent",           // Force consent screen to always get refresh_token
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  console.info("[google-oauth-start] Generated auth URL");
  console.info(`[google-oauth-start] redirect_uri: ${callbackUrl}`);
  console.info(`[google-oauth-start] state: ${state}`);

  return json({
    ok: true,
    authUrl,
    callbackUrl,
    state,
    scopes: ["https://www.googleapis.com/auth/adwords"],
    note: "Open authUrl in a browser. After granting consent, Google will redirect to the callback URL which will store your tokens automatically.",
    instructions: [
      "1. Copy the authUrl below and open it in your browser",
      "2. Sign in with the Google account that has access to your Google Ads account",
      "3. Grant the requested permissions",
      "4. You will be redirected to the callback page which stores your tokens",
      "5. Come back here and click 'Test Auth' to verify everything works",
    ],
  });
});
