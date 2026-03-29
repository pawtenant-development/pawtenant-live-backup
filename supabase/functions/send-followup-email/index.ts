import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const SITE_URL = "https://www.pawtenant.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildEmailHtml(firstName: string, resumeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Complete Your ESA Letter — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#1a5c4f;padding:28px 36px;text-align:center;">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">PawTenant</p>
            <p style="margin:4px 0 0;font-size:12px;color:#a8d5c9;letter-spacing:1px;font-family:Arial,sans-serif;text-transform:uppercase;">Emotional Support Animal Letters</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 36px 24px;font-family:Georgia,serif;">
            <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${firstName || "there"},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65;">
              We noticed you started your ESA assessment with PawTenant but haven't completed the process yet.
            </p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65;">
              Your ESA Letter helps protect your right to keep your emotional support animal in housing 
              that would otherwise restrict pets — and it's backed by the <strong>Fair Housing Act</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;">
              <tr>
                <td style="padding:8px 12px;background:#f0faf7;border-radius:8px;margin-bottom:8px;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="padding-right:10px;color:#1a5c4f;font-size:16px;">✓</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;color:#1a5c4f;font-weight:600;">Licensed Medical Providers in your state</td>
                  </tr></table>
                </td>
              </tr>
              <tr><td style="height:6px;"></td></tr>
              <tr>
                <td style="padding:8px 12px;background:#f0faf7;border-radius:8px;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="padding-right:10px;color:#1a5c4f;font-size:16px;">✓</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;color:#1a5c4f;font-weight:600;">Delivered within 24 hours</td>
                  </tr></table>
                </td>
              </tr>
              <tr><td style="height:6px;"></td></tr>
              <tr>
                <td style="padding:8px 12px;background:#f0faf7;border-radius:8px;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="padding-right:10px;color:#1a5c4f;font-size:16px;">✓</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;color:#1a5c4f;font-weight:600;">Legally enforced for rentals, vacation homes &amp; college dorms</td>
                  </tr></table>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td style="background:#f97316;border-radius:8px;">
                  <a href="${resumeUrl}"
                     style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
                    Complete Your ESA Assessment →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;font-family:Arial,sans-serif;">
              If you have any questions, feel free to reply to this email or call us at 
              <strong style="color:#374151;">(409) 965-5885</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">
              Warm regards, <strong style="color:#374151;">The PawTenant Team</strong>
            </p>
            <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#9ca3af;">${SUPPORT_EMAIL}</a> · (409) 965-5885 · 
              <a href="https://www.pawtenant.com" style="color:#9ca3af;">pawtenant.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(firstName: string, resumeUrl: string): string {
  return [
    `Hi ${firstName || "there"},`,
    "",
    "We noticed you started your ESA assessment with PawTenant but haven't completed the process yet.",
    "",
    "Your ESA Letter helps protect your right to keep your emotional support animal in housing that would otherwise restrict pets — and it's backed by the Fair Housing Act.",
    "",
    "✓ Licensed Medical Providers in your state",
    "✓ Delivered within 24 hours (or 2–3 days at a reduced rate)",
    "✓ Legally enforced for rentals, vacation homes, and college dorms",
    "",
    "Complete your assessment here:",
    resumeUrl,
    "",
    "If you have any questions, feel free to reply to this email or call us at (409) 965-5885.",
    "",
    "Warm regards,",
    "The PawTenant Team",
    "hello@pawtenant.com | pawtenant.com",
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, role, full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const allowedRoles = ["owner", "admin_manager", "billing", "support", "admin"];
    const isAuthorized = profile?.is_admin === true || allowedRoles.includes(profile?.role ?? "");
    if (!isAuthorized) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden — admins only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      leads?: { email: string; first_name?: string | null; confirmation_id?: string }[];
      email?: string;
      first_name?: string | null;
      confirmation_id?: string;
    };

    const leads = body.leads ?? (body.email ? [{ email: body.email, first_name: body.first_name, confirmation_id: body.confirmation_id }] : []);

    if (!leads.length) {
      return new Response(JSON.stringify({ ok: false, error: "No leads provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; confirmation_id?: string; ok: boolean; error?: string }[] = [];
    const sentAt = new Date().toISOString();

    for (const lead of leads) {
      const firstName = lead.first_name ?? "";
      // Use resume link when confirmation_id is available so customer can pick up exactly where they left off
      const resumeUrl = lead.confirmation_id
        ? `${SITE_URL}/assessment?resume=${encodeURIComponent(lead.confirmation_id)}`
        : `${SITE_URL}/assessment`;

      // Subject always includes order ID when available
      const subject = lead.confirmation_id
        ? `Complete Your ESA Letter — Order ${lead.confirmation_id}`
        : "Complete Your ESA Letter — PawTenant";

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [lead.email],
            subject,
            html: buildEmailHtml(firstName, resumeUrl),
            text: buildEmailText(firstName, resumeUrl),
            reply_to: SUPPORT_EMAIL,
          }),
        });

        const resendData = await resendRes.json() as { id?: string; error?: { message?: string } };

        if (!resendRes.ok) {
          results.push({ email: lead.email, confirmation_id: lead.confirmation_id, ok: false, error: resendData.error?.message ?? `HTTP ${resendRes.status}` });
          continue;
        }

        if (lead.confirmation_id) {
          await supabase
            .from("orders")
            .update({ sent_followup_at: sentAt })
            .eq("confirmation_id", lead.confirmation_id);
        }

        await supabase.from("audit_logs").insert({
          action: "manual_followup_email_sent",
          entity_type: "lead",
          entity_id: lead.confirmation_id ?? lead.email,
          performed_by_user_id: user.id,
          performed_by_name: profile?.full_name ?? user.email ?? "Admin",
          details: {
            to_email: lead.email,
            resend_email_id: resendData.id,
            sent_at: sentAt,
          },
        });

        results.push({ email: lead.email, confirmation_id: lead.confirmation_id, ok: true });
      } catch (err) {
        results.push({ email: lead.email, confirmation_id: lead.confirmation_id, ok: false, error: String(err) });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({ ok: failCount === 0, successCount, failCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-followup-email] Unhandled error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
