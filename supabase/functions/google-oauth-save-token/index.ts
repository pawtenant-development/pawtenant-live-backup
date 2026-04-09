/**
 * google-oauth-save-token
 *
 * Saves a Google Ads refresh token to Supabase secrets via the Management API.
 * Called by the admin panel when the OAuth callback didn't auto-save the token
 * (e.g. because SUPABASE_ACCESS_TOKEN wasn't set at callback time).
 *
 * Required secrets:
 *   SUPABASE_ACCESS_TOKEN — Supabase Management API personal access token
 *
 * Body: { refresh_token: string }
 * Returns: { ok: boolean, saved: boolean, error?: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAccessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");

  let body: { refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const refreshToken = body.refresh_token?.trim();
  if (!refreshToken) {
    return json({ ok: false, error: "refresh_token is required" }, 400);
  }

  if (!refreshToken.startsWith("1//")) {
    return json({ ok: false, error: "Invalid refresh token format — Google refresh tokens start with '1//'" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // ── Always store in ad_platform_settings (DB fallback) ───────────────────
  const { error: dbErr } = await supabase
    .from("ad_platform_settings")
    .upsert({
      platform: "google",
      access_token: refreshToken,
      account_id: Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "",
      updated_at: now,
    }, { onConflict: "platform" });

  if (dbErr) {
    console.warn(`[google-oauth-save-token] DB upsert warning: ${dbErr.message}`);
  }

  // ── Try Management API to set the secret ─────────────────────────────────
  if (!supabaseAccessToken) {
    // Log the attempt
    try {
      await supabase.from("audit_logs").insert({
        action: "google_oauth_token_manual_save",
        object_type: "system",
        object_id: "google_ads_oauth",
        actor_name: "admin",
        actor_role: "admin",
        details: {
          saved_to_db: !dbErr,
          saved_to_secrets: false,
          reason: "SUPABASE_ACCESS_TOKEN not set — token saved to DB only",
          saved_at: now,
        },
      });
    } catch { /* non-critical */ }

    return json({
      ok: false,
      saved: false,
      error: "SUPABASE_ACCESS_TOKEN is not set in Supabase secrets. This token is required to write to Supabase secrets via the Management API. Please add it: Supabase Dashboard → Edge Functions → Secrets → SUPABASE_ACCESS_TOKEN = your personal access token from app.supabase.com/account/tokens",
      db_saved: !dbErr,
      note: "The token was saved to the database (ad_platform_settings) but NOT to Supabase secrets. The sync function reads from secrets, so you must also add GOOGLE_ADS_REFRESH_TOKEN manually in Supabase → Edge Functions → Secrets.",
    });
  }

  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    return json({ ok: false, error: "Could not extract project ref from SUPABASE_URL", saved: false }, 500);
  }

  try {
    const secretRes = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { name: "GOOGLE_ADS_REFRESH_TOKEN", value: refreshToken },
        ]),
      }
    );

    const secretResText = await secretRes.text();

    if (!secretRes.ok) {
      const errMsg = `Management API ${secretRes.status}: ${secretResText.slice(0, 400)}`;
      console.error(`[google-oauth-save-token] Secret save failed: ${errMsg}`);

      try {
        await supabase.from("audit_logs").insert({
          action: "google_oauth_token_manual_save",
          object_type: "system",
          object_id: "google_ads_oauth",
          actor_name: "admin",
          actor_role: "admin",
          details: {
            saved_to_db: !dbErr,
            saved_to_secrets: false,
            management_api_status: secretRes.status,
            management_api_error: secretResText.slice(0, 400),
            saved_at: now,
          },
        });
      } catch { /* non-critical */ }

      return json({
        ok: false,
        saved: false,
        error: errMsg,
        db_saved: !dbErr,
        hint: secretRes.status === 401
          ? "SUPABASE_ACCESS_TOKEN is invalid or expired. Generate a new one at app.supabase.com/account/tokens"
          : secretRes.status === 403
          ? "SUPABASE_ACCESS_TOKEN doesn't have permission to manage secrets for this project"
          : "Check the Management API error above",
      });
    }

    console.info("[google-oauth-save-token] GOOGLE_ADS_REFRESH_TOKEN saved to Supabase secrets ✓");

    try {
      await supabase.from("audit_logs").insert({
        action: "google_oauth_token_manual_save",
        object_type: "system",
        object_id: "google_ads_oauth",
        actor_name: "admin",
        actor_role: "admin",
        details: {
          saved_to_db: !dbErr,
          saved_to_secrets: true,
          management_api_status: secretRes.status,
          saved_at: now,
        },
      });
    } catch { /* non-critical */ }

    return json({
      ok: true,
      saved: true,
      db_saved: !dbErr,
      message: "GOOGLE_ADS_REFRESH_TOKEN saved to Supabase secrets successfully. Click Test Auth in the admin panel to verify.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[google-oauth-save-token] Exception: ${msg}`);
    return json({ ok: false, saved: false, error: msg }, 500);
  }
});
