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
 * - Sends an INTERNAL/ADMIN-ONLY email — ONLY when the "provider_rejected_order"
 *   event is enabled in the Admin Notification routing settings, and ONLY to the
 *   recipients that routing resolves (specific > group > global fallback).
 * - Does NOT notify the customer (no customer email, no customer-facing rejection).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_PORTAL_URL = "https://pawtenant.com/admin-orders?tab=orders";
const FROM_ADDRESS = "PawTenant Admin <noreply@pawtenant.com>";
const FALLBACK_ADMIN_EMAIL = "eservices.dm@gmail.com";

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

function escapeHtml(value = ""): string {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Resolve INTERNAL/admin recipients for the "provider_rejected_order" event ──
// Uses the existing notification routing settings (get-admin-notif-recipients):
// specific-per-notification > group ("Providers") > global fallback. Returns
// enabled=false when the admin turned this event off, in which case no email sends.
// Recipients are ALWAYS admin/internal addresses — the customer can never appear here.
async function getAdminNotifRecipients(
  notificationKey: string,
): Promise<{ enabled: boolean; recipients: string[] }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ notificationKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { enabled: boolean; recipients: string[]; source?: string };
    console.log(`[provider-reject-order] recipients for "${notificationKey}": [${data.recipients.join(", ")}] (source: ${data.source ?? "?"}, enabled: ${data.enabled})`);
    return { enabled: data.enabled, recipients: data.recipients };
  } catch (err) {
    // Fail-safe: fall back to the single admin catchall so a routing outage never
    // silently drops the internal alert. Still admin-only — never the customer.
    console.warn(`[provider-reject-order] getAdminNotifRecipients failed:`, err instanceof Error ? err.message : String(err));
    return { enabled: true, recipients: [FALLBACK_ADMIN_EMAIL] };
  }
}

async function sendAdminRejectionEmail(opts: {
  to: string;
  confirmationId: string;
  patientName: string;
  patientEmail: string;
  providerName: string;
  reason: string;
  letterType: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[provider-reject-order] RESEND_API_KEY not set — skipping admin email"); return false; }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">
        <tr><td style="background:#b91c1c;padding:22px 32px">
          <p style="margin:0;color:rgba(255,255,255,0.82);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Internal · Action Required</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:21px;font-weight:800">Provider Rejected an Order</h1>
        </td></tr>
        <tr><td style="padding:26px 32px">
          <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6">
            A provider has rejected or returned this order for admin review. The order has been
            unassigned and set back to processing so it can be reassigned. <strong>Please open the
            admin portal and review the order before contacting the customer.</strong>
            The customer has <strong>not</strong> been notified of any rejection.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:18px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Order</p>
              <p style="margin:0 0 12px;font-size:16px;font-weight:800;color:#111827">${escapeHtml(opts.confirmationId)}${opts.letterType ? ` &middot; ${escapeHtml(opts.letterType.toUpperCase())}` : ""}</p>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Customer</p>
              <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827">${escapeHtml(opts.patientName)}${opts.patientEmail ? ` &lt;${escapeHtml(opts.patientEmail)}&gt;` : ""}</p>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Rejected by provider</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${escapeHtml(opts.providerName)}</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:22px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Reason (internal — provider stated)</p>
              <p style="margin:0;font-size:14px;color:#374151;font-style:italic">"${escapeHtml(opts.reason)}"</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px"><tr><td align="center">
            <a href="${ADMIN_PORTAL_URL}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px">Review & Reassign in Admin Portal →</a>
          </td></tr></table>
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center">Internal PawTenant admin notification. Do not forward to the customer.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:14px 32px;text-align:center">
          <p style="margin:0;color:#9ca3af;font-size:11px">PawTenant Admin System &bull; Automated internal alert</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: `⚠️ Provider rejected order ${opts.confirmationId}`,
        html,
        tags: [{ name: "email_type", value: "provider_rejected_admin_notification" }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[provider-reject-order] Resend error ${res.status}: ${errBody.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[provider-reject-order] Resend fetch error:", err instanceof Error ? err.message : String(err));
    return false;
  }
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

    // ── Internal/admin EMAIL — routing-gated, admin-only, never the customer ──
    // Sent only when the "provider_rejected_order" event is ENABLED in the Admin
    // Notification routing settings, and only to the recipients routing resolves
    // (specific > group "Providers" > global fallback). Non-fatal: a mail failure
    // never breaks the rejection itself.
    let adminEmailSent = 0;
    let adminEmailEnabled = false;
    try {
      const { enabled, recipients } = await getAdminNotifRecipients("provider_rejected_order");
      adminEmailEnabled = enabled;
      if (enabled && recipients.length > 0) {
        const results = await Promise.allSettled(
          recipients.map((to) =>
            sendAdminRejectionEmail({
              to,
              confirmationId,
              patientName,
              patientEmail: order.email ?? "",
              providerName: profile.full_name,
              reason: rejectionReason.trim(),
              letterType: order.letter_type ?? "",
            })
          ),
        );
        adminEmailSent = results.filter((r) => r.status === "fulfilled" && r.value).length;
        console.log(`[provider-reject-order] ✓ Internal admin email sent: ${adminEmailSent}/${recipients.length}`);
      } else if (!enabled) {
        console.log(`[provider-reject-order] provider_rejected_order notification disabled — no admin email sent`);
      } else {
        console.log(`[provider-reject-order] No admin recipients configured — no admin email sent`);
      }
    } catch (emailErr) {
      console.error("[provider-reject-order] Admin email error:", emailErr instanceof Error ? emailErr.message : String(emailErr));
    }

    console.log(`[provider-reject-order] ✓ Order ${confirmationId} fully rejected by ${profile.full_name}`);

    return json({
      ok: true,
      message: "Order rejected. Admin has been notified and will reassign it.",
      confirmationId,
      rejectedAt,
      adminEmail: { enabled: adminEmailEnabled, sent: adminEmailSent },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[provider-reject-order] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
