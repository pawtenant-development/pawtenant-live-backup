import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { confirmationId } = await req.json() as { confirmationId: string };

    if (!confirmationId) {
      return new Response(JSON.stringify({ ok: false, error: "confirmationId is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch order with provider info
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, confirmation_id, first_name, last_name, email, state, doctor_email, doctor_name, doctor_user_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ ok: false, error: "Order not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!order.doctor_email) {
      return new Response(JSON.stringify({ ok: false, error: "No provider assigned to this order" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://pawtenant.com";
    const providerPortalUrl = `${SITE_URL}/provider-portal?order=${confirmationId}`;
    const patientFullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email;
    const providerName = order.doctor_name ?? "Provider";

    const STATE_NAMES: Record<string, string> = {
      CA: "California", AR: "Arkansas", IA: "Iowa", LA: "Louisiana", MT: "Montana",
    };
    const stateName = STATE_NAMES[order.state ?? ""] ?? order.state ?? "";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>30-Day Official Letter Required — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
              <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
                alt="PawTenant" height="40" style="height:40px;width:auto;display:block;margin:0 auto 12px;" />
              <h1 style="color:#ffffff;font-size:18px;font-weight:800;margin:0;letter-spacing:-0.3px;">
                Action Required: 30-Day Period Completed
              </h1>
            </td>
          </tr>

          <!-- Orange alert banner -->
          <tr>
            <td style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" valign="top">
                    <div style="width:32px;height:32px;background:#ea580c;border-radius:8px;text-align:center;line-height:32px;">
                      <span style="color:#fff;font-size:16px;">⏰</span>
                    </div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#9a3412;">30-Day Evaluation Period Completed</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#c2410c;line-height:1.5;">
                      The 30-day evaluation period for a <strong>${stateName}</strong> patient is complete.
                      Please issue the official letter through the same order.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
                Hi <strong>${providerName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
                The 30-day evaluation period for the following patient has been completed. 
                Per <strong>${stateName}</strong> state regulations, you are now required to issue the official letter.
                Please log in to the provider portal, review the case, and submit the official letter.
              </p>

              <!-- Patient info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Patient Details</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:110px;display:inline-block;">Patient Name</span>
                          <strong style="font-size:13px;color:#1a5c4f;">${patientFullName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:110px;display:inline-block;">Order ID</span>
                          <strong style="font-size:13px;color:#1a5c4f;font-family:monospace;">${confirmationId}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:110px;display:inline-block;">State</span>
                          <strong style="font-size:13px;color:#1a5c4f;">${stateName}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What to do -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;">What You Need To Do</p>
                    <ol style="margin:0;padding-left:18px;color:#78350f;">
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Log in to the PawTenant provider portal</li>
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Locate this order — it will be marked with a <strong>30-Day Reissue</strong> banner</li>
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Upload the official signed letter</li>
                      <li style="font-size:13px;line-height:1.7;">Click <strong>"Submit Official Letter"</strong> to deliver it to the patient</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${providerPortalUrl}"
                      style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;letter-spacing:0.2px;">
                      Open Order in Portal →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                If the button doesn't work, copy this link:<br/>
                <a href="${providerPortalUrl}" style="color:#1a5c4f;word-break:break-all;">${providerPortalUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
                © ${new Date().getFullYear()} PawTenant · This is an automated notification from your case management system.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send the email via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "PawTenant <hello@pawtenant.com>",
        to: [order.doctor_email],
        subject: `⏰ Action Required: 30-Day Official Letter — Order ${confirmationId} (${stateName})`,
        html: emailHtml,
      }),
    });

    const resendData = await resendRes.json() as { id?: string; error?: string };
    const emailSent = resendRes.ok && !!resendData.id;

    // Log to order email_log
    try {
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("email_log")
        .eq("id", order.id)
        .maybeSingle();

      const existingLog = (currentOrder?.email_log as Array<{ type: string; sentAt: string; to: string; success: boolean }>) ?? [];
      const newEntry = {
        type: "thirty_day_reminder",
        sentAt: new Date().toISOString(),
        to: order.doctor_email,
        success: emailSent,
      };
      await supabase
        .from("orders")
        .update({ email_log: [...existingLog, newEntry] })
        .eq("id", order.id);
    } catch {
      // Non-fatal
    }

    return new Response(JSON.stringify({ ok: true, emailSent, emailId: resendData.id ?? null }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-thirty-day-reissue error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
