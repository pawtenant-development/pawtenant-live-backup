import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * contact-reply
 *
 * Admin sends a direct email reply to a contact_submissions row from the
 * admin portal. The reply is:
 *   1. Recorded in public.contact_submission_replies (service role).
 *   2. Sent via Resend to the submission's email address.
 *      - from:      PawTenant Support <hello@pawtenant.com>
 *      - to:        submission.email
 *      - reply_to:  hello@pawtenant.com
 *
 * The DB row is authoritative — if the email send fails, the row is still
 * written and the error is returned. Caller can display a retry / fallback
 * to mailto.
 *
 * TEST kill-switch: CONTACT_REPLY_DISABLE_EMAIL=1 (or
 * CONTACT_SUBMIT_DISABLE_EMAIL=1 as fallback) skips Resend entirely but
 * still writes the reply row. Used during TEST verification to avoid
 * firing real customer emails.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_MSG        = 10_000;
const MAX_ADMIN_NAME = 200;
const MAX_ADMIN_MAIL = 320;

const REPLY_TO   = "hello@pawtenant.com";
const FROM_EMAIL = "PawTenant Support <hello@pawtenant.com>";

interface ReplyPayload {
  submission_id?: string;
  message?: string;
  admin_id?: string | null;
  admin_email?: string | null;
  admin_name?: string | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trimOrNull(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: ReplyPayload;
  try {
    payload = (await req.json()) as ReplyPayload;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const submissionId = trimOrNull(payload.submission_id, 64);
  const message      = trimOrNull(payload.message, MAX_MSG);
  const adminEmail   = trimOrNull(payload.admin_email, MAX_ADMIN_MAIL);
  const adminName    = trimOrNull(payload.admin_name, MAX_ADMIN_NAME);
  const adminIdRaw   = trimOrNull(payload.admin_id, 64);
  const adminId      = adminIdRaw && isUuid(adminIdRaw) ? adminIdRaw : null;

  if (!submissionId) return json(400, { ok: false, error: "submission_id is required" });
  if (!isUuid(submissionId)) return json(400, { ok: false, error: "submission_id must be a uuid" });
  if (!message) return json(400, { ok: false, error: "message is required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Fetch the original submission so we know who to email + can quote the
  // original message in the body.
  const { data: sub, error: subErr } = await supabase
    .from("contact_submissions")
    .select("id, name, email, subject, message, created_at, status")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    return json(500, { ok: false, error: `Submission lookup failed: ${subErr.message}` });
  }
  if (!sub) {
    return json(404, { ok: false, error: "Submission not found" });
  }
  if (!sub.email || !isValidEmail(sub.email)) {
    return json(400, { ok: false, error: "Submission has no valid email address" });
  }

  // Insert reply row first — authoritative record, even if email fails.
  const { data: replyRow, error: insErr } = await supabase
    .from("contact_submission_replies")
    .insert({
      contact_submission_id: submissionId,
      admin_id:    adminId,
      admin_email: adminEmail,
      admin_name:  adminName,
      message,
    })
    .select("id, created_at")
    .single();

  if (insErr || !replyRow) {
    return json(500, {
      ok: false,
      error: insErr?.message ?? "Failed to record reply",
    });
  }

  // TEST-env kill switches.
  const disableA =
    (Deno.env.get("CONTACT_REPLY_DISABLE_EMAIL") ?? "").trim();
  const disableB =
    (Deno.env.get("CONTACT_SUBMIT_DISABLE_EMAIL") ?? "").trim();
  const emailDisabled =
    disableA === "1" || disableA.toLowerCase() === "true" ||
    disableB === "1" || disableB.toLowerCase() === "true";

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  let emailSent = false;
  let emailError: string | null = null;
  let resendMessageId: string | null = null;

  if (emailDisabled) {
    emailError = "email send disabled by environment flag";
  } else if (!resendKey) {
    emailError = "RESEND_API_KEY not configured";
  } else {
    const customerName = sub.name?.trim() || "there";
    const subjectLine  = sub.subject?.trim()
      ? `Re: ${sub.subject.trim()}`
      : "Re: Your PawTenant message";

    const adminLabel = adminName?.trim() || "PawTenant Support";

    // Pretty, branded email. Uses the same palette as contact-submit.
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">
        <tr>
          <td style="background:#1a5c4f;padding:24px 32px">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">PawTenant Support</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800">${escapeHtml(subjectLine)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;color:#111827;font-size:15px;line-height:1.65">
            <p style="margin:0 0 16px">Hi ${escapeHtml(customerName)},</p>
            <div style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(message)}</div>
            <p style="margin:0 0 4px;color:#374151">Best regards,</p>
            <p style="margin:0 0 4px;color:#111827;font-weight:600">PawTenant Support</p>
            ${adminLabel && adminLabel !== "PawTenant Support"
              ? `<p style="margin:0;color:#6b7280;font-size:13px">${escapeHtml(adminLabel)}</p>`
              : ""}
          </td>
        </tr>
        ${sub.message ? `
        <tr>
          <td style="padding:0 32px 28px">
            <div style="border-top:1px solid #e5e7eb;padding-top:16px">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Your original message</p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;font-size:13px;color:#4b5563;white-space:pre-wrap">${escapeHtml(sub.message)}</div>
            </div>
          </td>
        </tr>
        ` : ""}
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:11px">Reply directly to this email to reach us at ${escapeHtml(REPLY_TO)}</p>
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
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [sub.email],
          reply_to: REPLY_TO,
          subject: subjectLine,
          html,
        }),
      });

      if (res.ok) {
        emailSent = true;
        try {
          const parsed = (await res.json()) as { id?: string };
          resendMessageId = parsed?.id ?? null;
        } catch {
          // ignore
        }
      } else {
        const txt = await res.text().catch(() => "");
        emailError = `HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`;
        console.error(`[contact-reply] Resend failed:`, emailError);
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`[contact-reply] Resend network error:`, emailError);
    }
  }

  // Patch reply row with send outcome.
  await supabase
    .from("contact_submission_replies")
    .update({
      email_sent:        emailSent,
      email_error:       emailError,
      resend_message_id: resendMessageId,
      sent_at:           emailSent ? new Date().toISOString() : null,
    })
    .eq("id", replyRow.id);

  // Nudge submission status if it's still "new" → "viewed". Don't override
  // "resolved". Admin can still resolve after sending.
  if (sub.status === "new") {
    await supabase
      .from("contact_submissions")
      .update({ status: "viewed" })
      .eq("id", submissionId)
      .eq("status", "new");
  }

  return json(200, {
    ok: true,
    reply_id: replyRow.id,
    created_at: replyRow.created_at,
    emailSent,
    emailError: emailError ?? undefined,
  });
});
