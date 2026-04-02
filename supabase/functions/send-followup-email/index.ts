// send-followup-email
// Sends a 48-hour follow-up email to provider applicants who haven't been approved yet.
// Called manually from admin dashboard OR can be triggered by a cron job.
// Also supports sending a general follow-up to any lead email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildProviderFollowUpHtml(firstName: string, email: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#1a5c4f;padding:32px;text-align:center;">
            <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="180" style="display:block;margin:0 auto 18px;max-width:180px;" />
            <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Application Update</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">Still reviewing your application</h1>
            <p style="margin:10px 0 0;font-size:14px;color:#a7d5ca;line-height:1.5;">We haven&apos;t forgotten about you, ${escapeHtml(firstName)}!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              Thank you for applying to join the <strong>${COMPANY_NAME} Provider Network</strong>. Our clinical team is still reviewing your credentials and we want to make sure we give your application the attention it deserves.
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
              We expect to reach out to you within the next <strong>24 hours</strong> to schedule your onboarding call. In the meantime, here&apos;s a quick reminder of what to expect:
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:14px;margin:0 0 28px;">
              <tr><td style="padding:22px 24px;">
                <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">What Happens Next</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;width:32px;">
                      <div style="width:24px;height:24px;background:#1a5c4f;border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:700;color:#fff;">1</div>
                    </td>
                    <td style="padding:8px 0 8px 10px;">
                      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">Credential Verification</p>
                      <p style="margin:0;font-size:12px;color:#6b7280;">Our clinical team verifies your license and credentials.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;width:32px;">
                      <div style="width:24px;height:24px;background:#1a5c4f;border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:700;color:#fff;">2</div>
                    </td>
                    <td style="padding:8px 0 8px 10px;">
                      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">Onboarding Call</p>
                      <p style="margin:0;font-size:12px;color:#6b7280;">A short orientation covering platform use and ESA documentation standards.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;vertical-align:top;width:32px;">
                      <div style="width:24px;height:24px;background:#ff6a00;border-radius:50%;text-align:center;line-height:24px;font-size:11px;font-weight:700;color:#fff;">3</div>
                    </td>
                    <td style="padding:8px 0 8px 10px;">
                      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">Go Live &amp; Start Earning</p>
                      <p style="margin:0;font-size:12px;color:#6b7280;">Your profile goes live and you begin receiving matched ESA evaluation requests.</p>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin:0 0 28px;">
              <tr><td style="padding:16px 20px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;padding-right:10px;font-size:16px;">&#128276;</td>
                    <td style="font-size:13px;color:#92400e;line-height:1.6;">
                      <strong>Make sure to check your spam folder</strong> for our upcoming onboarding email. Add <a href="mailto:${SUPPORT_EMAIL}" style="color:#92400e;font-weight:700;">${SUPPORT_EMAIL}</a> to your contacts to ensure you don&apos;t miss it.
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">
              Have questions? We&apos;re happy to help — just reply to this email or reach us at:
            </p>
            <p style="margin:0;font-size:14px;">
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">${COMPANY_NAME} &mdash; Provider Network &mdash; <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a></p>
            <p style="margin:0;font-size:11px;color:#d1d5db;">You received this because you applied to join our provider network.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
        reply_to: SUPPORT_EMAIL,
        tags: [{ name: "email_type", value: "provider_application_followup" }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${err}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Verify caller is admin (or allow internal cron calls with service key) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    // Allow service-role key calls (cron) OR admin user calls
    let isAuthorized = false;
    if (token === serviceRoleKey) {
      isAuthorized = true; // internal cron call
    } else if (token) {
      const { data: { user } } = await adminClient.auth.getUser(token);
      if (user) {
        const { data: profile } = await adminClient
          .from("doctor_profiles")
          .select("is_admin, role")
          .eq("user_id", user.id)
          .maybeSingle();
        isAuthorized = profile?.is_admin === true ||
          ["owner", "admin_manager", "support"].includes(profile?.role ?? "");
      }
    }

    if (!isAuthorized) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json() as {
      // Manual single send
      email?: string;
      first_name?: string;
      // Bulk mode: send to all pending applicants older than 48h
      bulk?: boolean;
    };

    // ── BULK MODE: find all provider_applications pending > 48h ──────────
    if (body.bulk) {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: pending, error: fetchErr } = await adminClient
        .from("provider_applications")
        .select("id, first_name, last_name, email, created_at, followup_sent_at, status")
        .eq("status", "pending")
        .lt("created_at", cutoff)
        .is("followup_sent_at", null);

      if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
      if (!pending || pending.length === 0) return json({ ok: true, sent: 0, message: "No pending applications to follow up on." });

      const results: Array<{ email: string; sent: boolean; error?: string }> = [];
      for (const app of pending) {
        const firstName = (app.first_name as string) || "there";
        const email = app.email as string;
        const { sent, error } = await sendViaResend(
          email,
          `Still reviewing your ${COMPANY_NAME} provider application`,
          buildProviderFollowUpHtml(firstName, email)
        );
        results.push({ email, sent, error });
        if (sent) {
          await adminClient
            .from("provider_applications")
            .update({ followup_sent_at: new Date().toISOString() })
            .eq("id", app.id);
        }
      }

      const sentCount = results.filter((r) => r.sent).length;
      console.log(`[send-followup-email] Bulk: sent ${sentCount}/${pending.length} follow-ups`);
      return json({ ok: true, sent: sentCount, total: pending.length, results });
    }

    // ── SINGLE MODE: send to a specific email ────────────────────────────
    if (!body.email) return json({ ok: false, error: "email is required for single mode" }, 400);

    const firstName = body.first_name || body.email.split("@")[0];
    const { sent, error } = await sendViaResend(
      body.email,
      `Still reviewing your ${COMPANY_NAME} provider application`,
      buildProviderFollowUpHtml(firstName, body.email)
    );

    if (!sent) return json({ ok: false, error: error ?? "Failed to send email" }, 500);

    // Mark followup_sent_at if we can find the application
    await adminClient
      .from("provider_applications")
      .update({ followup_sent_at: new Date().toISOString() })
      .eq("email", body.email.toLowerCase())
      .eq("status", "pending");

    console.log(`[send-followup-email] Sent follow-up to ${body.email}`);
    return json({ ok: true, sent: true, to: body.email });

  } catch (err) {
    console.error("[send-followup-email] Error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
