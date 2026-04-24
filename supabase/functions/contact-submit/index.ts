import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * contact-submit
 *
 * Replaces third-party Readdy form submissions. Accepts contact form
 * payloads from:
 *   - /contact-us page
 *   - Home ContactSection
 *   - Customer portal ContactSupportWidget
 *
 * Writes a row to public.contact_submissions (RLS blocks anon inserts —
 * service role only) and sends a Resend email to hello@pawtenant.com.
 *
 * Never throws back at the client with internal details. A failed email
 * send does NOT fail the submission — the row is authoritative.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_NAME    = 200;
const MAX_EMAIL   = 320;
const MAX_PHONE   = 40;
const MAX_SUBJECT = 300;
const MAX_MSG     = 5000;
const MAX_PAGE    = 500;
const MAX_META_B  = 8 * 1024;

const NOTIFY_EMAIL = "hello@pawtenant.com";
const FROM_EMAIL   = "PawTenant Contact <noreply@pawtenant.com>";

interface ContactPayload {
  name?: string;
  email?: string;
  phone?: string | null;
  subject?: string | null;
  message?: string;
  source_page?: string | null;
  metadata?: Record<string, unknown> | null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: ContactPayload;
  try {
    payload = (await req.json()) as ContactPayload;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const name    = trimOrNull(payload.name, MAX_NAME);
  const email   = trimOrNull(payload.email, MAX_EMAIL);
  const phone   = trimOrNull(payload.phone, MAX_PHONE);
  const subject = trimOrNull(payload.subject, MAX_SUBJECT);
  const message = trimOrNull(payload.message, MAX_MSG);
  const sourcePage = trimOrNull(payload.source_page, MAX_PAGE);

  if (!name)    return json(400, { ok: false, error: "Name is required" });
  if (!email)   return json(400, { ok: false, error: "Email is required" });
  if (!message) return json(400, { ok: false, error: "Message is required" });
  if (!isValidEmail(email)) {
    return json(400, { ok: false, error: "Invalid email address" });
  }

  let metadata: Record<string, unknown> = {};
  if (
    payload.metadata &&
    typeof payload.metadata === "object" &&
    !Array.isArray(payload.metadata)
  ) {
    try {
      const asJson = JSON.stringify(payload.metadata);
      if (asJson.length <= MAX_META_B) {
        metadata = JSON.parse(asJson) as Record<string, unknown>;
      }
    } catch {
      metadata = {};
    }
  }

  // Capture request-side context (UA, referrer, IP best-effort).
  const ua = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;
  const xff = req.headers.get("x-forwarded-for") ?? null;
  const reqContext: Record<string, unknown> = {};
  if (ua) reqContext.user_agent = ua.slice(0, 512);
  if (referer) reqContext.referer = referer.slice(0, 2048);
  if (xff) reqContext.ip = xff.split(",")[0]?.trim().slice(0, 64);
  if (Object.keys(reqContext).length > 0) {
    metadata = { ...metadata, request: reqContext };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: inserted, error: insErr } = await supabase
    .from("contact_submissions")
    .insert({
      name,
      email,
      phone,
      subject,
      message,
      source_page: sourcePage,
      status: "new",
      metadata,
    })
    .select("id, created_at")
    .single();

  if (insErr || !inserted) {
    return json(500, {
      ok: false,
      error: insErr?.message ?? "Failed to record submission",
    });
  }

  // Fire Resend notification. Failure here is logged but not surfaced.
  // TEST-env kill switch: set CONTACT_SUBMIT_DISABLE_EMAIL=1 to skip the send
  // without affecting any other function that shares RESEND_API_KEY.
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const emailDisabled =
    (Deno.env.get("CONTACT_SUBMIT_DISABLE_EMAIL") ?? "").trim() === "1" ||
    (Deno.env.get("CONTACT_SUBMIT_DISABLE_EMAIL") ?? "").toLowerCase() === "true";
  let emailSent = false;
  let emailError: string | null = null;

  if (emailDisabled) {
    emailError = "email send disabled by CONTACT_SUBMIT_DISABLE_EMAIL";
  } else if (resendKey) {
    const subj = subject
      ? `New contact form: ${subject}`
      : `New contact form from ${name}`;

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
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Website Contact Form</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800">New Submission</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">From</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${escapeHtml(name)}</p>
                  <p style="margin:2px 0 0;font-size:14px;color:#2563eb"><a style="color:#2563eb;text-decoration:none" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
                  ${phone ? `<p style="margin:2px 0 0;font-size:14px;color:#374151">${escapeHtml(phone)}</p>` : ""}
                </td>
              </tr>
            </table>
            ${subject ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:16px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Subject</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111827">${escapeHtml(subject)}</p>
                </td>
              </tr>
            </table>
            ` : ""}
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:16px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Message</p>
                  <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p>
                </td>
              </tr>
            </table>
            ${sourcePage ? `
            <p style="margin:12px 0 0;font-size:12px;color:#9ca3af">Source: ${escapeHtml(sourcePage)}</p>
            ` : ""}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
              <tr>
                <td align="center">
                  <a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px">
                    Open Admin Panel →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center">
            <p style="margin:0;color:#9ca3af;font-size:11px">PawTenant Website &bull; Submission ID: ${escapeHtml(inserted.id)}</p>
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
          to: [NOTIFY_EMAIL],
          reply_to: email,
          subject: subj,
          html,
        }),
      });
      if (res.ok) {
        emailSent = true;
      } else {
        emailError = `HTTP ${res.status}`;
        const txt = await res.text().catch(() => "");
        console.error(`[contact-submit] Resend failed:`, emailError, txt.slice(0, 200));
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`[contact-submit] Resend network error:`, emailError);
    }
  } else {
    emailError = "RESEND_API_KEY not configured";
  }

  return json(200, {
    ok: true,
    id: inserted.id,
    created_at: inserted.created_at,
    emailSent,
    emailError: emailError ?? undefined,
  });
});
