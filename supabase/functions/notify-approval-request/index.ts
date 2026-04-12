import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * notify-approval-request
 *
 * Two modes:
 * 1. notifyRequester: false (default) — called when a request is SUBMITTED.
 *    Fetches all owner/admin_manager emails and notifies them.
 * 2. notifyRequester: true — called when a request is APPROVED or REJECTED.
 *    Looks up the requester's email by ID (primary) or name (fallback) and sends them the decision.
 */

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

const ACTION_LABELS: Record<string, string> = {
  bulk_delete: "Bulk Delete Orders",
  bulk_assign: "Bulk Assign Provider",
  bulk_sms: "Bulk SMS Campaign",
  broadcast: "Broadcast Email/SMS",
  bulk_email: "Bulk Email Campaign",
  refund: "Issue Refund",
  orders_tab_access: "Orders Tab Access",
  delete_order: "Delete Order",
};

const ACTION_COLORS: Record<string, string> = {
  bulk_delete: "#dc2626",
  bulk_assign: "#d97706",
  bulk_sms: "#0284c7",
  broadcast: "#7c3aed",
  bulk_email: "#059669",
  refund: "#ea580c",
  orders_tab_access: "#1a5c4f",
  delete_order: "#dc2626",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: {
    // Shared fields
    requesterName?: string;
    requesterRole?: string;
    actionType?: string;
    actionLabel?: string;
    actionDescription?: string;
    payload?: Record<string, unknown>;
    note?: string;
    // Mode selector
    notifyRequester?: boolean;
    // notifyRequester=true fields
    requesterId?: string;   // ← preferred: auth user ID for reliable lookup
    decision?: "approved" | "rejected";
    reviewerName?: string;
    // notifyRequester=false fields
    requestId?: string;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    notifyRequester = false,
    requesterId,
    requesterName = "Team Member",
    requesterRole = "support",
    actionType = "unknown",
    actionLabel,
    actionDescription,
    payload = {},
    note,
    decision,
    reviewerName,
    requestId,
  } = body;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn("[notify-approval-request] RESEND_API_KEY not set — skipping email");
    return json({ ok: true, emailSent: false, reason: "RESEND_API_KEY not configured" });
  }

  const label = actionLabel ?? ACTION_LABELS[actionType] ?? actionType.replace(/_/g, " ");
  const color = ACTION_COLORS[actionType] ?? "#1a5c4f";
  const roleDisplay = requesterRole.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const adminPanelUrl = "https://pawtenant.com/admin-orders";

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 2: notifyRequester=true — send decision email to the requester
  // ─────────────────────────────────────────────────────────────────────────
  if (notifyRequester) {
    if (!decision) {
      return json({ error: "decision (approved|rejected) is required when notifyRequester=true" }, 400);
    }

    let requesterEmail: string | null = null;

    // PRIMARY: Look up by user ID (auth user ID stored in doctor_profiles.user_id)
    if (requesterId) {
      const { data: profileById } = await supabase
        .from("doctor_profiles")
        .select("email, full_name")
        .eq("user_id", requesterId)
        .maybeSingle();

      requesterEmail = profileById?.email ?? null;

      if (requesterEmail) {
        console.log(`[notify-approval-request] Found requester email by ID (${requesterId}): ${requesterEmail}`);
      } else {
        console.warn(`[notify-approval-request] No profile found for user_id: ${requesterId} — falling back to name lookup`);
      }
    }

    // FALLBACK: Look up by name if ID lookup failed or no ID provided
    if (!requesterEmail && requesterName) {
      const { data: profileByName } = await supabase
        .from("doctor_profiles")
        .select("email, full_name")
        .ilike("full_name", requesterName.trim())
        .limit(1);

      requesterEmail = profileByName?.[0]?.email ?? null;

      if (requesterEmail) {
        console.log(`[notify-approval-request] Found requester email by name fallback (${requesterName}): ${requesterEmail}`);
      }
    }

    if (!requesterEmail) {
      console.warn(`[notify-approval-request] Could not find email for requester: ${requesterName} (id: ${requesterId ?? "none"})`);
      return json({ ok: false, reason: "requester_email_not_found", requesterName, requesterId });
    }

    const isApproved = decision === "approved";
    const decisionColor = isApproved ? "#1a5c4f" : "#dc2626";
    const decisionIcon = isApproved ? "✅" : "❌";
    const decisionWord = isApproved ? "Approved" : "Rejected";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:${decisionColor};padding:24px 32px">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Request Update</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800">${decisionIcon} Request ${decisionWord}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6">
              Hi <strong>${requesterName}</strong>, your approval request has been reviewed.
            </p>

            <!-- Decision card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:${isApproved ? "#f0faf7" : "#fef2f2"};border:1px solid ${isApproved ? "#b8ddd5" : "#fecaca"};border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Decision</p>
                  <p style="margin:0;font-size:18px;font-weight:800;color:${decisionColor}">${decisionIcon} ${decisionWord}</p>
                  ${reviewerName ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">Reviewed by <strong>${reviewerName}</strong></p>` : ""}
                </td>
              </tr>
            </table>

            <!-- Action card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Requested Action</p>
                  <p style="margin:0;font-size:16px;font-weight:800;color:#111827">${label}</p>
                  ${actionDescription ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;line-height:1.5">${actionDescription}</p>` : ""}
                </td>
              </tr>
            </table>

            ${note ? `
            <!-- Rejection note -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Reviewer Note</p>
                  <p style="margin:0;font-size:14px;color:#374151;font-style:italic">"${note}"</p>
                </td>
              </tr>
            </table>
            ` : ""}

            ${isApproved && actionType === "orders_tab_access" ? `
            <!-- Special instructions for orders_tab_access -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a5c4f">Next Step</p>
                  <p style="margin:0;font-size:13px;color:#2d7a6a;line-height:1.6">
                    Your access has been granted for this session. Please <strong>refresh the admin panel</strong> and navigate to the Orders tab — it should now be accessible.
                  </p>
                </td>
              </tr>
            </table>
            ` : ""}

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td align="center">
                  <a href="${adminPanelUrl}" style="display:inline-block;background:${color};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px">
                    Open Admin Panel →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center">
              You received this because you submitted an approval request in the PawTenant admin panel.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:11px">PawTenant Admin System &bull; This is an automated notification</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "PawTenant Admin <noreply@pawtenant.com>",
          to: [requesterEmail],
          subject: `${decisionIcon} Your request was ${decisionWord.toLowerCase()}: ${label}`,
          html: htmlBody,
        }),
      });

      if (res.ok) {
        console.log(`[notify-approval-request] Decision email sent to requester: ${requesterEmail}`);
        return json({ ok: true, emailSent: true, to: requesterEmail, decision, lookupMethod: requesterId ? "id" : "name" });
      } else {
        const errBody = await res.text().catch(() => "");
        console.error(`[notify-approval-request] Failed to send decision email:`, errBody.slice(0, 200));
        return json({ ok: false, error: `HTTP ${res.status}`, detail: errBody.slice(0, 200) });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[notify-approval-request] Network error:`, msg);
      return json({ ok: false, error: msg });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 1: notifyRequester=false (default) — notify owners/admins of new request
  // ─────────────────────────────────────────────────────────────────────────

  // Fetch all owner and admin_manager emails
  const { data: admins, error: adminErr } = await supabase
    .from("doctor_profiles")
    .select("full_name, email, role")
    .in("role", ["owner", "admin_manager"])
    .not("email", "is", null);

  if (adminErr) {
    console.error("[notify-approval-request] Failed to fetch admins:", adminErr.message);
    return json({ ok: false, error: adminErr.message }, 500);
  }

  const recipients: string[] = (admins ?? [])
    .map((a: { email: string | null }) => a.email)
    .filter((e): e is string => !!e && e.includes("@"));

  // Fallback to ADMIN_EMAIL env var if no admins found
  const fallbackEmail = Deno.env.get("ADMIN_EMAIL") ?? "eservices.dm@gmail.com";
  if (recipients.length === 0) {
    recipients.push(fallbackEmail);
  }

  // Build payload details HTML
  const payloadLines: string[] = [];
  if (payload.orderCount !== undefined) payloadLines.push(`<li><strong>Orders:</strong> ${payload.orderCount}</li>`);
  if (payload.doctorName) payloadLines.push(`<li><strong>Provider:</strong> ${payload.doctorName}</li>`);
  if (payload.assignableCount !== undefined) payloadLines.push(`<li><strong>Eligible orders:</strong> ${payload.assignableCount}</li>`);
  if (payload.recipientCount !== undefined) payloadLines.push(`<li><strong>Recipients:</strong> ${payload.recipientCount}</li>`);
  if (payload.channel) payloadLines.push(`<li><strong>Channel:</strong> ${String(payload.channel)}</li>`);
  if (payload.audience) payloadLines.push(`<li><strong>Audience:</strong> ${String(payload.audience)}</li>`);
  if (payload.subject) payloadLines.push(`<li><strong>Subject:</strong> ${String(payload.subject)}</li>`);
  if (payload.confirmationId) payloadLines.push(`<li><strong>Order ID:</strong> ${String(payload.confirmationId)}</li>`);
  if (payload.amount) payloadLines.push(`<li><strong>Amount:</strong> $${String(payload.amount)}</li>`);
  if (note) payloadLines.push(`<li><strong>Note from requester:</strong> <em>${note}</em></li>`);

  const payloadHtml = payloadLines.length > 0
    ? `<ul style="margin:8px 0 0 0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7">${payloadLines.join("")}</ul>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:${color};padding:24px 32px">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Action Required</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800">Approval Request Submitted</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6">
              A team member has submitted a request that requires your approval before it can be executed.
            </p>

            <!-- Requester card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Requested By</p>
                  <p style="margin:0;font-size:16px;font-weight:800;color:#111827">${requesterName}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#6b7280">${roleDisplay} Role</p>
                </td>
              </tr>
            </table>

            <!-- Action card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:20px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Requested Action</p>
                  <p style="margin:0;font-size:16px;font-weight:800;color:#111827">${label}</p>
                  ${actionDescription ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;line-height:1.5">${actionDescription}</p>` : ""}
                  ${payloadHtml}
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td align="center">
                  <a href="${adminPanelUrl}" style="display:inline-block;background:${color};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px">
                    Review in Admin Panel →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center">
              Open the admin panel and click the <strong>Approvals</strong> button to approve or reject this request.<br>
              ${requestId ? `Request ID: <code style="font-family:monospace;background:#f3f4f6;padding:1px 4px;border-radius:4px">${requestId}</code>` : ""}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:11px">PawTenant Admin System &bull; This is an automated notification</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send to all owner/admin_manager recipients
  let emailsSent = 0;
  let lastError = "";

  for (const recipientEmail of recipients) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "PawTenant Admin <noreply@pawtenant.com>",
          to: [recipientEmail],
          subject: `⚠️ Approval Required: ${label} — requested by ${requesterName}`,
          html: htmlBody,
        }),
      });

      if (res.ok) {
        emailsSent++;
        console.log(`[notify-approval-request] Email sent to ${recipientEmail}`);
      } else {
        const errBody = await res.text().catch(() => "");
        lastError = `HTTP ${res.status}: ${errBody.slice(0, 200)}`;
        console.error(`[notify-approval-request] Failed to send to ${recipientEmail}:`, lastError);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[notify-approval-request] Network error for ${recipientEmail}:`, lastError);
    }
  }

  return json({
    ok: emailsSent > 0,
    emailsSent,
    recipients,
    lastError: lastError || undefined,
  });
});
