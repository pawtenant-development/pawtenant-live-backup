// list-auth-users — Returns all Supabase Auth users cross-referenced with doctor_profiles
// Used by the admin Auth Cleanup tool to surface orphaned auth accounts.
// verify_jwt is OFF — we do our own admin check inside.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("doctor_profiles")
      .select("is_admin, role, full_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const allowedRoles = ["owner", "admin_manager", "billing", "support", "admin", "finance"];
    const isAllowed = callerProfile?.is_admin === true || allowedRoles.includes(callerProfile?.role ?? "");
    if (!isAllowed) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all auth users (paginated — max 1000 per call, supports up to ~5k total)
    let allAuthUsers: { id: string; email: string; created_at: string; last_sign_in_at: string | null; confirmed_at: string | null }[] = [];
    let page = 1;
    while (true) {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !users || users.length === 0) break;
      allAuthUsers = allAuthUsers.concat(
        users.map((u) => ({
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          confirmed_at: u.confirmed_at ?? null,
        }))
      );
      if (users.length < 1000) break;
      page++;
    }

    // Fetch all doctor_profiles user_ids
    const { data: profiles } = await supabaseAdmin
      .from("doctor_profiles")
      .select("user_id, email, full_name, is_active, role");

    const profileUserIds = new Set((profiles ?? []).map((p: { user_id: string }) => p.user_id));
    const profileEmails = new Set(
      (profiles ?? [])
        .map((p: { email: string | null }) => (p.email ?? "").toLowerCase())
        .filter(Boolean)
    );

    // An orphan is an auth user that has NO matching profile record
    // (neither by user_id nor by email — covers legacy contacts-only providers)
    const orphans = allAuthUsers.filter(
      (u) => !profileUserIds.has(u.id) && !profileEmails.has(u.email.toLowerCase())
    );

    // Also return matched users so the admin can see the full picture
    const matched = allAuthUsers.filter(
      (u) => profileUserIds.has(u.id) || profileEmails.has(u.email.toLowerCase())
    );

    return new Response(JSON.stringify({
      ok: true,
      total_auth_users: allAuthUsers.length,
      total_profiles: (profiles ?? []).length,
      orphans_count: orphans.length,
      orphans,
      matched_count: matched.length,
      callerEmail: caller.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[list-auth-users] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
