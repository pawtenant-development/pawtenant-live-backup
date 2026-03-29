// delete-auth-user — Deletes a Supabase auth user by userId OR email
// verify_jwt is OFF so Supabase doesn't reject the call before our own check runs.
// We verify the caller's identity ourselves using the service-role client.
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

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing authorization token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized — invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm caller is an admin-level user in doctor_profiles
    const { data: callerProfile } = await supabaseAdmin
      .from("doctor_profiles")
      .select("is_admin, role, full_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const allowedRoles = ["owner", "admin_manager", "billing", "support", "admin", "finance"];
    const isAllowed = callerProfile?.is_admin === true || allowedRoles.includes(callerProfile?.role ?? "");

    if (!isAllowed) {
      console.warn("[delete-auth-user] Forbidden attempt by", caller.email, "role:", callerProfile?.role);
      return new Response(JSON.stringify({ ok: false, error: "Forbidden — admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      userId?: string;
      email?: string;
      entityType?: string;
      entityName?: string;
      reason?: string;
    };
    const { userId, email, entityType = "user", entityName, reason = "Deleted by admin" } = body;

    if (!userId && !email) {
      return new Response(JSON.stringify({ ok: false, error: "Provide userId or email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let targetUserId = userId;
    let targetEmail = email;

    // Look up by email if no userId given
    if (!targetUserId && email) {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) {
        return new Response(JSON.stringify({ ok: false, error: `Failed to look up user: ${listErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!match) {
        return new Response(JSON.stringify({ ok: true, message: "No auth user found for this email — nothing to delete", noUserFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = match.id;
      targetEmail = match.email;
    }

    // Get email for audit log if we only had userId
    if (targetUserId && !targetEmail) {
      try {
        const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        targetEmail = targetUser?.email ?? "unknown";
      } catch {
        targetEmail = "unknown";
      }
    }

    // Safety: don't allow deleting your own account
    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ ok: false, error: "Cannot delete your own account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId!);

    if (deleteErr) {
      if (deleteErr.message?.toLowerCase().includes("not found") || deleteErr.status === 404) {
        return new Response(JSON.stringify({ ok: true, message: "Auth user already deleted or never existed", noUserFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[delete-auth-user] deleteUser error:", deleteErr.message);
      return new Response(JSON.stringify({ ok: false, error: deleteErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[delete-auth-user] ✓ Deleted auth user ${targetUserId} (${targetEmail}) — by ${caller.email}`);

    // HIPAA Audit Log
    const auditObjectType =
      entityType === "team_member" || entityType === "provider" ? "doctor" :
      entityType === "customer" ? "customer" : "staff";

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: caller.id,
      actor_name: callerProfile?.full_name ?? caller.email ?? "Admin",
      actor_role: callerProfile?.role ?? "admin",
      object_type: auditObjectType,
      object_id: targetUserId,
      action: "auth_user_deleted",
      description: `Supabase auth account permanently deleted for ${entityType}: ${entityName ?? targetEmail}`,
      metadata: {
        deleted_auth_user_id: targetUserId,
        deleted_email: targetEmail,
        entity_type: entityType,
        entity_name: entityName ?? null,
        performed_by_email: caller.email,
        performed_by_user_id: caller.id,
        reason,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Auth user deleted successfully",
      deletedUserId: targetUserId,
      deletedEmail: targetEmail,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[delete-auth-user] Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
