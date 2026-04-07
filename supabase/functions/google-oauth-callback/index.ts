/**
 * google-oauth-callback
 *
 * Handles the OAuth 2.0 redirect from Google after the user grants consent.
 * Exchanges the authorization code for access_token + refresh_token,
 * then stores the refresh_token in the Supabase database (ad_platform_settings)
 * so it can be used by the sync functions.
 *
 * Also attempts to store the refresh_token as a Supabase secret via the
 * Management API if SUPABASE_ACCESS_TOKEN is available.
 *
 * Required secrets:
 *   GOOGLE_ADS_OAUTH_CLIENT_ID     — OAuth 2.0 Client ID
 *   GOOGLE_ADS_OAUTH_CLIENT_SECRET — OAuth 2.0 Client Secret
 *   SUPABASE_ACCESS_TOKEN          — (optional) Supabase Management API token for auto-setting secrets
 *
 * This function is called by Google as a redirect — it returns an HTML page
 * with the result so the admin can see what happened.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function htmlPage(title: string, body: string, isError = false): Response {
  const color = isError ? "#dc2626" : "#1a5c4f";
  const icon = isError ? "✗" : "✓";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Google OAuth</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px; max-width: 600px; width: 100%; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: ${isError ? "#fef2f2" : "#f0faf7"}; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 16px; }
    .code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 16px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; background: ${isError ? "#fef2f2" : "#f0faf7"}; color: ${color}; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 12px 24px; background: ${color}; color: white; border-radius: 8px; font-size: 14px; font-weight: 700; text-decoration: none; margin-top: 8px; }
    .step { display: flex; gap: 12px; margin-bottom: 12px; }
    .step-num { width: 24px; height: 24px; border-radius: 50%; background: ${color}; color: white; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    .step-text { font-size: 13px; color: #374151; line-height: 1.5; }
    label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="badge">${title}</div>
    ${body}
    <a href="javascript:window.close()" class="btn" style="margin-right:8px;">Close Window</a>
    <a href="/admin-orders" class="btn" style="background:#f1f5f9;color:#374151;">Back to Admin</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: isError ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // ── User denied access ────────────────────────────────────────────────────
  if (error) {
    console.error(`[google-oauth-callback] OAuth error: ${error} — ${errorDescription}`);
    return htmlPage(
      "Access Denied",
      `<h1>Authorization Failed</h1>
       <p>Google returned an error: <strong>${error}</strong></p>
       ${errorDescription ? `<p>${errorDescription}</p>` : ""}
       <p>Please go back to the admin panel and try again.</p>`,
      true
    );
  }

  // ── No code in callback ───────────────────────────────────────────────────
  if (!code) {
    return htmlPage(
      "Missing Code",
      `<h1>No Authorization Code</h1>
       <p>Google did not return an authorization code. This usually means the OAuth flow was not completed correctly.</p>
       <p>Please go back to the admin panel and start the OAuth flow again.</p>`,
      true
    );
  }

  const clientId = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return htmlPage(
      "Configuration Error",
      `<h1>Missing OAuth Credentials</h1>
       <p>GOOGLE_ADS_OAUTH_CLIENT_ID or GOOGLE_ADS_OAUTH_CLIENT_SECRET is not set in Supabase secrets.</p>`,
      true
    );
  }

  // The redirect_uri must exactly match what was used in the auth URL
  const callbackUrl = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

  // ── Exchange code for tokens ──────────────────────────────────────────────
  console.info("[google-oauth-callback] Exchanging authorization code for tokens...");

  let tokenData: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    const rawText = await tokenRes.text();
    console.info(`[google-oauth-callback] Token exchange status: ${tokenRes.status}`);

    try {
      tokenData = JSON.parse(rawText);
    } catch {
      return htmlPage(
        "Token Exchange Failed",
        `<h1>Token Exchange Error</h1>
         <p>Google returned an unexpected response (${tokenRes.status}):</p>
         <div class="code">${rawText.slice(0, 500)}</div>`,
        true
      );
    }

    if (tokenData.error) {
      console.error(`[google-oauth-callback] Token error: ${tokenData.error} — ${tokenData.error_description}`);
      return htmlPage(
        "Token Exchange Failed",
        `<h1>Token Exchange Error</h1>
         <p>Google returned an error: <strong>${tokenData.error}</strong></p>
         ${tokenData.error_description ? `<p>${tokenData.error_description}</p>` : ""}
         <p>Common causes:</p>
         <ul style="margin-left:20px;font-size:13px;color:#374151;line-height:2;">
           <li>The authorization code has already been used (codes are single-use)</li>
           <li>The redirect_uri doesn't match what was registered in Google Cloud Console</li>
           <li>The OAuth client credentials are incorrect</li>
         </ul>
         <p style="margin-top:12px;">Registered redirect_uri: <code style="font-size:11px;">${callbackUrl}</code></p>`,
        true
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[google-oauth-callback] Fetch error: ${msg}`);
    return htmlPage(
      "Network Error",
      `<h1>Network Error</h1><p>${msg}</p>`,
      true
    );
  }

  const { access_token, refresh_token, expires_in, scope } = tokenData;

  if (!access_token) {
    return htmlPage(
      "No Access Token",
      `<h1>No Access Token Received</h1>
       <p>Google did not return an access token. Response: ${JSON.stringify(tokenData).slice(0, 300)}</p>`,
      true
    );
  }

  console.info("[google-oauth-callback] Tokens received successfully");
  console.info(`[google-oauth-callback] has_refresh_token: ${!!refresh_token}`);
  console.info(`[google-oauth-callback] scope: ${scope}`);
  console.info(`[google-oauth-callback] expires_in: ${expires_in}s`);

  // ── Store tokens in Supabase DB (ad_platform_settings) ───────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date().toISOString();
  const tokenExpiresAt = expires_in
    ? new Date(Date.now() + expires_in * 1000).toISOString()
    : null;

  // Store in ad_platform_settings for the AdSpendPanel
  const { error: upsertErr } = await supabase
    .from("ad_platform_settings")
    .upsert({
      platform: "google",
      access_token: refresh_token ?? access_token, // Store refresh_token as the primary token
      account_id: Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "",
      updated_at: now,
      // Store extra OAuth metadata in a JSON column if it exists
    }, { onConflict: "platform" });

  if (upsertErr) {
    console.warn(`[google-oauth-callback] DB upsert warning: ${upsertErr.message}`);
  }

  // Store OAuth tokens in a dedicated table/record for the conversion sync
  // We use audit_logs to record the event
  try {
    await supabase.from("audit_logs").insert({
      action: "google_oauth_token_obtained",
      object_type: "system",
      object_id: "google_ads_oauth",
      actor_name: "admin",
      actor_role: "admin",
      details: {
        has_access_token: !!access_token,
        has_refresh_token: !!refresh_token,
        scope,
        expires_in,
        token_expires_at: tokenExpiresAt,
        obtained_at: now,
        callback_url: callbackUrl,
        note: refresh_token
          ? "Refresh token obtained — copy it to GOOGLE_ADS_REFRESH_TOKEN secret"
          : "WARNING: No refresh token returned. Make sure prompt=consent was used in the auth URL.",
      },
    });
  } catch { /* non-critical */ }

  // ── Try to auto-set the secret via Supabase Management API ───────────────
  let secretAutoSet = false;
  let secretError = "";
  const supabaseAccessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  const supabaseProjectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  if (supabaseAccessToken && supabaseProjectRef && refresh_token) {
    try {
      const secretRes = await fetch(
        `https://api.supabase.com/v1/projects/${supabaseProjectRef}/secrets`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            { name: "GOOGLE_ADS_REFRESH_TOKEN", value: refresh_token },
          ]),
        }
      );
      if (secretRes.ok) {
        secretAutoSet = true;
        console.info("[google-oauth-callback] GOOGLE_ADS_REFRESH_TOKEN auto-set via Management API");
      } else {
        const errText = await secretRes.text();
        secretError = `Management API ${secretRes.status}: ${errText.slice(0, 200)}`;
        console.warn(`[google-oauth-callback] Could not auto-set secret: ${secretError}`);
      }
    } catch (err) {
      secretError = err instanceof Error ? err.message : String(err);
      console.warn(`[google-oauth-callback] Secret auto-set error: ${secretError}`);
    }
  }

  // ── Return success HTML page ──────────────────────────────────────────────
  const refreshTokenSection = refresh_token
    ? `<label>Refresh Token (copy this to GOOGLE_ADS_REFRESH_TOKEN secret)</label>
       <div class="code" style="cursor:pointer;user-select:all;" title="Click to select all">${refresh_token}</div>`
    : `<div class="code" style="background:#fef2f2;border-color:#fecaca;color:#dc2626;">
         ⚠ No refresh token returned. This usually means the account already granted access previously.
         Go back to the admin panel and click "Connect Google Account" again — the consent screen will show
         because we use prompt=consent.
       </div>`;

  const secretSection = secretAutoSet
    ? `<div style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:8px;padding:12px;margin-bottom:16px;">
         <p style="color:#1a5c4f;font-weight:700;font-size:13px;">✓ GOOGLE_ADS_REFRESH_TOKEN was automatically set in Supabase secrets!</p>
         <p style="font-size:12px;color:#374151;margin-top:4px;">You can now close this window and test the connection from the admin panel.</p>
       </div>`
    : `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:16px;">
         <p style="color:#92400e;font-weight:700;font-size:13px;">Manual step required — copy the refresh token above</p>
         <p style="font-size:12px;color:#374151;margin-top:4px;">
           ${secretError ? `Auto-set failed: ${secretError}<br>` : ""}
           Go to Supabase → Edge Functions → Secrets → Add secret:
           <strong>GOOGLE_ADS_REFRESH_TOKEN</strong> = the token above.
         </p>
       </div>`;

  return htmlPage(
    "Authorization Successful",
    `<h1>Google Ads Connected!</h1>
     <p>Your Google account has been authorized. The tokens have been received successfully.</p>

     ${secretSection}

     ${refreshTokenSection}

     <label>Access Token (expires in ${expires_in ? Math.round(expires_in / 60) + " minutes" : "unknown"})</label>
     <div class="code" style="cursor:pointer;user-select:all;" title="Click to select all">${access_token.slice(0, 40)}...${access_token.slice(-10)}</div>

     <label>Scopes Granted</label>
     <div class="code">${scope ?? "Not specified"}</div>

     <p style="margin-top:16px;font-size:13px;color:#374151;">
       <strong>Next steps:</strong>
     </p>
     <div class="step"><div class="step-num">1</div><div class="step-text">${secretAutoSet ? "✓ GOOGLE_ADS_REFRESH_TOKEN was auto-set" : "Copy the refresh token above → Supabase → Edge Functions → Secrets → GOOGLE_ADS_REFRESH_TOKEN"}</div></div>
     <div class="step"><div class="step-num">2</div><div class="step-text">Go back to the admin panel → Analytics → Google Ads Sync → click "Test Auth"</div></div>
     <div class="step"><div class="step-num">3</div><div class="step-text">If Test Auth passes, click "Test Upload" to validate the full conversion upload flow</div></div>
     <div class="step"><div class="step-num">4</div><div class="step-text">Once both pass, click "Backfill Pending" to upload all historical conversions</div></div>`
  );
});
