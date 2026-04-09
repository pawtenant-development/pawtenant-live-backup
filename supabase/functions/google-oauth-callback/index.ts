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
    .card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px; max-width: 680px; width: 100%; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: ${isError ? "#fef2f2" : "#f0faf7"}; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 16px; }
    .code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 16px; cursor: pointer; user-select: all; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; background: ${isError ? "#fef2f2" : "#f0faf7"}; color: ${color}; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 12px 24px; background: ${color}; color: white; border-radius: 8px; font-size: 14px; font-weight: 700; text-decoration: none; margin-top: 8px; cursor: pointer; }
    .step { display: flex; gap: 12px; margin-bottom: 12px; }
    .step-num { width: 24px; height: 24px; border-radius: 50%; background: ${color}; color: white; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    .step-text { font-size: 13px; color: #374151; line-height: 1.5; }
    label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px; }
    .warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; color: #92400e; }
    .ok-box { background: #f0faf7; border: 1px solid #b8ddd5; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; color: #1a5c4f; font-weight: 700; }
    .diag { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 12px; color: #475569; font-family: monospace; white-space: pre-wrap; word-break: break-all; }
    .copy-hint { font-size: 10px; color: #94a3b8; margin-top: 4px; }
  </style>
  <script>
    function copyText(el) {
      const text = el.innerText || el.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const orig = el.style.background;
        el.style.background = '#d1fae5';
        setTimeout(() => { el.style.background = orig; }, 800);
      });
    }
  </script>
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
    console.info(`[google-oauth-callback] Token response fields: ${rawText.slice(0, 200)}`);

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

  // Store refresh_token in ad_platform_settings.access_token column
  // (this column is used as the primary token store for the platform)
  if (refresh_token) {
    const { error: upsertErr } = await supabase
      .from("ad_platform_settings")
      .upsert({
        platform: "google",
        access_token: refresh_token,
        account_id: Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "",
        updated_at: now,
      }, { onConflict: "platform" });

    if (upsertErr) {
      console.warn(`[google-oauth-callback] DB upsert warning: ${upsertErr.message}`);
    } else {
      console.info("[google-oauth-callback] refresh_token stored in ad_platform_settings");
    }
  }

  // Store OAuth event in audit_logs
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
          ? "Refresh token obtained successfully"
          : "WARNING: No refresh token returned. Account may have already granted access. Use prompt=consent to force re-consent.",
      },
    });
  } catch { /* non-critical */ }

  // ── Try to auto-set the secret via Supabase Management API ───────────────
  let secretAutoSet = false;
  let secretError = "";
  let managementApiStatus = "";
  const supabaseAccessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  const supabaseProjectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  console.info(`[google-oauth-callback] SUPABASE_ACCESS_TOKEN present: ${!!supabaseAccessToken}`);
  console.info(`[google-oauth-callback] Project ref: ${supabaseProjectRef}`);
  console.info(`[google-oauth-callback] Has refresh_token to save: ${!!refresh_token}`);

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
      const secretResText = await secretRes.text();
      managementApiStatus = `HTTP ${secretRes.status}: ${secretResText.slice(0, 300)}`;
      if (secretRes.ok) {
        secretAutoSet = true;
        console.info("[google-oauth-callback] GOOGLE_ADS_REFRESH_TOKEN auto-set via Management API ✓");
      } else {
        secretError = `Management API ${secretRes.status}: ${secretResText.slice(0, 300)}`;
        console.warn(`[google-oauth-callback] Could not auto-set secret: ${secretError}`);
      }
    } catch (err) {
      secretError = err instanceof Error ? err.message : String(err);
      managementApiStatus = `Exception: ${secretError}`;
      console.warn(`[google-oauth-callback] Secret auto-set error: ${secretError}`);
    }
  } else {
    if (!supabaseAccessToken) {
      managementApiStatus = "SKIPPED — SUPABASE_ACCESS_TOKEN not set in secrets";
      secretError = "SUPABASE_ACCESS_TOKEN not set — manual copy required";
    } else if (!refresh_token) {
      managementApiStatus = "SKIPPED — no refresh_token in Google response";
      secretError = "No refresh_token returned by Google";
    } else {
      managementApiStatus = "SKIPPED — could not extract project ref from SUPABASE_URL";
    }
    console.warn(`[google-oauth-callback] Auto-set skipped: ${managementApiStatus}`);
  }

  // ── Build diagnostic block ────────────────────────────────────────────────
  const diagLines = [
    `Token exchange:        SUCCESS`,
    `has_access_token:      ${!!access_token}`,
    `has_refresh_token:     ${!!refresh_token}`,
    `scope:                 ${scope ?? "not returned"}`,
    `expires_in:            ${expires_in ?? "not returned"}s`,
    ``,
    `SUPABASE_ACCESS_TOKEN: ${supabaseAccessToken ? "SET" : "NOT SET ← this is why auto-save may fail"}`,
    `Project ref:           ${supabaseProjectRef ?? "could not extract"}`,
    `Management API result: ${managementApiStatus}`,
    `Secret auto-set:       ${secretAutoSet ? "YES ✓" : "NO ✗"}`,
    ``,
    `DB (ad_platform_settings): ${refresh_token ? "refresh_token stored" : "nothing stored (no refresh_token)"}`,
    ``,
    `IMPORTANT: sync-google-ads-conversions reads GOOGLE_ADS_REFRESH_TOKEN`,
    `from Deno.env (Supabase secrets), NOT from the database.`,
    `If auto-set failed, you must manually add it to Supabase secrets.`,
  ].join("\n");

  // ── Return success HTML page ──────────────────────────────────────────────
  const noRefreshTokenWarning = !refresh_token ? `
    <div class="warn">
      <strong>⚠ No refresh_token in Google's response</strong><br><br>
      This happens when the Google account has previously authorized this OAuth app.
      Google only returns a refresh_token on the <em>first</em> authorization.<br><br>
      <strong>Fix:</strong> Go back to the admin panel → click "Connect Google Account" again.
      The flow uses <code>prompt=consent</code> which forces Google to show the consent screen
      and return a new refresh_token. Make sure you see the "Grant access" screen — if it
      skips straight to the callback, revoke access first at
      <a href="https://myaccount.google.com/permissions" target="_blank" style="color:#92400e;">myaccount.google.com/permissions</a>
      and try again.
    </div>` : "";

  const refreshTokenSection = refresh_token
    ? `<label>Refresh Token — copy this to GOOGLE_ADS_REFRESH_TOKEN in Supabase secrets (click to copy)</label>
       <div class="code" onclick="copyText(this)" title="Click to copy">${refresh_token}</div>
       <p class="copy-hint">↑ Click the box above to copy the full token</p>`
    : "";

  const secretSection = secretAutoSet
    ? `<div class="ok-box">✓ GOOGLE_ADS_REFRESH_TOKEN was automatically saved to Supabase secrets via Management API.<br>
         <span style="font-weight:400;font-size:12px;">You can now close this window and click "Test Auth" in the admin panel.</span>
       </div>`
    : refresh_token
      ? `<div class="warn">
           <strong>Manual step required</strong> — the refresh token was NOT automatically saved to Supabase secrets.<br><br>
           ${secretError ? `<strong>Reason:</strong> ${secretError}<br><br>` : ""}
           <strong>What to do:</strong><br>
           1. Copy the refresh token below (click the box)<br>
           2. Go to <strong>Supabase Dashboard → Edge Functions → Secrets</strong><br>
           3. Add or update secret: <code>GOOGLE_ADS_REFRESH_TOKEN</code> = the token you copied<br>
           4. Come back to the admin panel and click <strong>"Test Auth"</strong>
         </div>`
      : "";

  return htmlPage(
    refresh_token ? "Authorization Successful" : "Partial Success — No Refresh Token",
    `<h1>${refresh_token ? "Google Ads Connected!" : "Access Granted — But No Refresh Token"}</h1>
     <p>${refresh_token
       ? "Your Google account has been authorized and the refresh token was received."
       : "Google granted access but did not return a refresh token. See the warning below."
     }</p>

     ${noRefreshTokenWarning}
     ${secretSection}
     ${refreshTokenSection}

     ${refresh_token ? `
     <label>Access Token (expires in ${expires_in ? Math.round(expires_in / 60) + " minutes" : "unknown"} — do not save this)</label>
     <div class="code" style="color:#94a3b8;">${access_token.slice(0, 40)}...${access_token.slice(-10)}</div>

     <label>Scopes Granted</label>
     <div class="code">${scope ?? "Not specified"}</div>
     ` : ""}

     <details style="margin-bottom:16px;">
       <summary style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;margin-bottom:8px;">Diagnostics (click to expand)</summary>
       <div class="diag">${diagLines}</div>
     </details>

     ${refresh_token ? `
     <p style="font-size:13px;color:#374151;"><strong>Next steps:</strong></p>
     <div class="step"><div class="step-num">1</div><div class="step-text">${secretAutoSet ? "✓ GOOGLE_ADS_REFRESH_TOKEN was auto-saved to Supabase secrets" : "Copy the refresh token above → Supabase → Edge Functions → Secrets → GOOGLE_ADS_REFRESH_TOKEN"}</div></div>
     <div class="step"><div class="step-num">2</div><div class="step-text">Go back to the admin panel → Analytics → Google Ads Sync → click "Test Auth"</div></div>
     <div class="step"><div class="step-num">3</div><div class="step-text">If Test Auth passes, click "Test Upload" to validate the full conversion upload flow</div></div>
     ` : ""}`,
    !refresh_token
  );
});
