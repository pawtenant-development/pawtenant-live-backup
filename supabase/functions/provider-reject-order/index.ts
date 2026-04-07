/**
 * provider-reject-order
 *
 * Allows a provider to reject an assigned order.
 * - Sets doctor_status = "provider_rejected"
 * - Sets status back to "processing" (unassigned / needs new provider)
 * - Clears doctor assignment fields
 * - Logs the rejection reason in audit_logs + order_status_logs
 * - Sends in-portal notification to ALL admin users
 * - Sends in-portal confirmation to the rejecting provider
 * - Does NOT notify the customer
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    // Service-role client for all DB writes (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the provider's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token);
    if (authError || !user) {
      console.error("[provider-reject-order] Auth error:", authError?.message);
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    console.log(`[provider-reject-order] Auth OK — user.id: ${user.id}, email: ${user.email}`);

    // Look up provider profile
    const { data: profile, error: profileErr } = await supabase
      .from("doctor_profiles")
      .select("user_id, full_name, email, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("[provider-reject-order] Profile fetch error:", profileErr.message);
      return json({ ok: false, error: `Profile fetch failed: ${profileErr.message}` }, 500);
    }
    if (!profile) {
      console.error("[provider-reject-order] No profile found for user_id:", user.id);
      return json({ ok: false, error: "Provider profile not found" }, 403);
    }
    if (profile.is_active === false) return json({ ok: false, error: "Provider account is inactive" }, 403);

    const body = await req.json() as {
      confirmationId: string;
      rejectionReason: string;
    };

    const { confirmationId, rejectionReason } = body;

    if (!confirmationId) return json({ ok: false, error: "confirmationId is required" }, 400);
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      return json({ ok: false, error: "A rejection reason (at least 5 characters) is required" }, 400);
    }

    // Fetch the order
    const { data: order, error: orderFetchErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, doctor_user_id, doctor_email, doctor_status, status, letter_type")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (orderFetchErr) {
      console.error("[provider-reject-order] Order fetch error:", orderFetchErr.message);
      return json({ ok: false, error: `Order fetch failed: ${orderFetchErr.message}` }, 500);
    }
    if (!order) return json({ ok: false, error: "Order not found" }, 404);

    console.log(`[provider-reject-order] Order found — doctor_user_id: ${order.doctor_user_id}, doctor_email: ${order.doctor_email}, doctor_status: ${order.doctor_status}, status: ${order.status}`);

    // Authorization check — match by user_id OR email (profile or auth email)
    const matchesById = order.doctor_user_id === user.id;
    const matchesByEmail =
      !!order.doctor_email && !!profile.email &&
      order.doctor_email.toLowerCase().trim() === profile.email.toLowerCase().trim();
    const matchesByAuthEmail =
      !!order.doctor_email && !!user.email &&
      order.doctor_email.toLowerCase().trim() === user.email.toLowerCase().trim();

    console.log(`[provider-reject-order] Auth check — matchesById: ${matchesById}, matchesByEmail: ${matchesByEmail}, matchesByAuthEmail: ${matchesByAuthEmail}`);

    if (!matchesById && !matchesByEmail && !matchesByAuthEmail) {
      return json({
        ok: false,
        error: `Not authorized to reject this order. Order assigned to: ${order.doctor_email ?? order.doctor_user_id ?? "unknown"}`,
      }, 403);
    }

    // Cannot reject already completed or refunded orders
    if (order.doctor_status === "patient_notified" || order.doctor_status === "letter_sent") {
      return json({ ok: false, error: "Cannot reject an order that has already been completed" }, 400);
    }
    if (order.status === "refunded") {
      return json({ ok: false, error: "Cannot reject a refunded order" }, 400);
    }

    const rejectedAt = new Date().toISOString();
    const patientName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;

    // ── Update order: mark as provider_rejected, clear assignment ──────────
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        doctor_status: "provider_rejected",
        status: "processing",
        doctor_user_id: null,
        doctor_email: null,
        doctor_name: null,
      })
      .eq("id", order.id);

    if (updateErr) {
      console.error("[provider-reject-order] Order update error:", updateErr.message);
      return json({ ok: false, error: `Failed to update order: ${updateErr.message}` }, 500);
    }

    console.log(`[provider-reject-order] ✓ Order ${confirmationId} updated to provider_rejected`);

    // ── Log in order_status_logs (correct column names) ──────────────────
    try {
      await supabase.from("order_status_logs").insert({
        order_id: order.id,
        confirmation_id: confirmationId,
        old_doctor_status: order.doctor_status,
        new_doctor_status: "provider_rejected",
        old_status: order.status,
        new_status: "processing",
        changed_by: profile.full_name,
        changed_at: rejectedAt,
      });
    } catch (logErr) {
      console.error("[provider-reject-order] Status log error:", logErr);
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    try {
      await supabase.from("audit_logs").insert({
        actor_name: profile.full_name,
        actor_role: "provider",
        object_type: "order",
        object_id: confirmationId,
        action: "order_rejected_by_provider",
        description: `Provider ${profile.full_name} rejected order ${confirmationId}. Reason: ${rejectionReason.trim()}`,
        metadata: {
          order_id: order.id,
          confirmation_id: confirmationId,
          provider_id: user.id,
          provider_name: profile.full_name,
          provider_email: profile.email,
          rejection_reason: rejectionReason.trim(),
          rejected_at: rejectedAt,
        },
      });
    } catch (auditErr) {
      console.error("[provider-reject-order] Audit log error:", auditErr);
    }

    // ── Notify ALL admin users in-portal ─────────────────────────────────
    // Fetch all admin user_ids from doctor_profiles
    try {
      const { data: admins } = await supabase
        .from("doctor_profiles")
        .select("user_id")
        .eq("is_admin", true);

      if (admins && admins.length > 0) {
        const adminNotifs = admins.map((admin: { user_id: string }) => ({
          doctor_user_id: admin.user_id,
          title: "⚠️ Provider Rejected Order",
          message: `${profile.full_name} rejected order ${confirmationId} (${patientName}). Reason: "${rejectionReason.trim()}". Please reassign this case.`,
          type: "provider_rejected_admin",
          is_read: false,
          confirmation_id: confirmationId,
          order_id: order.id,
          created_at: rejectedAt,
        }));
        await supabase.from("doctor_notifications").insert(adminNotifs);
        console.log(`[provider-reject-order] ✓ Admin notifications sent to ${admins.length} admin(s)`);
      }
    } catch (adminNotifErr) {
      console.error("[provider-reject-order] Admin notification error:", adminNotifErr);
    }

    // ── In-portal confirmation for the rejecting provider ─────────────────
    try {
      await supabase.from("doctor_notifications").insert({
        doctor_user_id: user.id,
        title: "Order Rejected",
        message: `You rejected order ${confirmationId} (${patientName}). Admin has been notified and will reassign it.`,
        type: "order_rejected",
        is_read: false,
        confirmation_id: confirmationId,
        order_id: order.id,
        created_at: rejectedAt,
      });
    } catch (notifErr) {
      console.error("[provider-reject-order] Provider notification error:", notifErr);
    }

    // ── Shared note — visible to admin in the shared notes panel ──────────
    try {
      await supabase.from("shared_order_notes").insert({
        order_id: order.id,
        confirmation_id: confirmationId,
        author_id: user.id,
        author_name: profile.full_name,
        author_role: "provider",
        note: `⚠️ ORDER REJECTED BY PROVIDER\n\nProvider: ${profile.full_name}\nReason: ${rejectionReason.trim()}\n\nThis order needs to be reassigned to another provider.`,
        created_at: rejectedAt,
      });
    } catch (noteErr) {
      console.error("[provider-reject-order] Shared note error:", noteErr);
    }

    console.log(`[provider-reject-order] ✓ Order ${confirmationId} fully rejected by ${profile.full_name}`);

    return json({
      ok: true,
      message: "Order rejected. Admin has been notified and will reassign it.",
      confirmationId,
      rejectedAt,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[provider-reject-order] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
