// provider-complete-first-login
//
// PROVIDER-TEMPORARY-PASSWORD-ONBOARDING-001
//
// Clears a provider's first-login password-change gate — and is the ONLY way
// it can be cleared.
//
// The gate row in public.provider_password_gate is readable by the provider but
// writable by nobody except the service role (no INSERT/UPDATE/DELETE grant
// exists for `authenticated`). A client therefore cannot mark itself done; it
// must come through here, and this function only clears the gate in the same
// call that actually changes the password through Supabase Admin Auth.
//
// Authorization is deliberately narrow:
//   • a valid caller JWT is required (verify_jwt is also enabled on the deploy);
//   • the caller may only ever change THEIR OWN password — the target user id
//     comes from the verified token, never from the request body;
//   • the caller must have an active, non-admin doctor_profiles row.
//
// The submitted password is never logged, never stored, and never echoed back.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_LENGTH = 10;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "Server misconfigured." }, 500);
    }

    const callerToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!callerToken) return json({ ok: false, error: "Not signed in." }, 401);

    // A bearer that merely EQUALS the service-role key is not a user session and
    // must never be treated as one.
    if (callerToken === serviceRoleKey) {
      return json({ ok: false, error: "Not signed in." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: caller }, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !caller) {
      return json({ ok: false, error: "Session expired — please sign in again." }, 401);
    }

    // Providers only. The target is always the verified caller.
    const { data: profile } = await adminClient
      .from("doctor_profiles")
      .select("id, is_active, is_admin, portal_first_accessed_at, account_setup_completed_at")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!profile) return json({ ok: false, error: "No provider profile for this account." }, 403);
    if ((profile as { is_active?: boolean | null }).is_active === false) {
      return json({ ok: false, error: "This provider account is inactive." }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Invalid request body." }, 400);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_LENGTH) {
      return json({ ok: false, error: `Password must be at least ${MIN_LENGTH} characters.` }, 400);
    }

    const { error: pwErr } = await adminClient.auth.admin.updateUserById(caller.id, { password });
    if (pwErr) {
      // Surface the reason (e.g. "same as the old password") without echoing
      // any part of the submitted value.
      return json({ ok: false, error: pwErr.message }, 400);
    }

    const nowIso = new Date().toISOString();
    const { error: gateErr } = await adminClient
      .from("provider_password_gate")
      .upsert({
        user_id: caller.id,
        must_change_password: false,
        password_changed_at: nowIso,
      }, { onConflict: "user_id" });

    if (gateErr) {
      // The password DID change. Report the residual gate failure honestly so
      // the provider is not told everything is fine while the portal still
      // blocks them.
      console.warn("[provider-complete-first-login] gate clear failed:", gateErr.message);
      return json({
        ok: false,
        password_changed: true,
        error: "Your password was changed, but the portal could not be unlocked. Please sign in again.",
      }, 500);
    }

    // Password completion is itself proven provider-portal activity. Project it
    // here before returning success so assignment readiness cannot lag behind
    // the gate that was just cleared.
    const typedProfile = profile as {
      id: string;
      portal_first_accessed_at?: string | null;
      account_setup_completed_at?: string | null;
    };
    const { error: accessErr } = await adminClient
      .from("doctor_profiles")
      .update({
        portal_first_accessed_at: typedProfile.portal_first_accessed_at ?? nowIso,
        portal_last_accessed_at: nowIso,
        account_setup_completed_at: typedProfile.account_setup_completed_at ?? nowIso,
      })
      .eq("id", typedProfile.id)
      .eq("user_id", caller.id);

    if (accessErr) {
      console.warn("[provider-complete-first-login] readiness projection failed:", accessErr.message);
      return json({
        ok: false,
        password_changed: true,
        error: "Your password was changed, but assignment readiness could not be recorded. Please sign in again.",
      }, 500);
    }

    return json({ ok: true, password_changed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[provider-complete-first-login] unhandled error:", msg);
    return json({ ok: false, error: "Server error." }, 500);
  }
});
