import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SITE_URL = "https://www.pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Order {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  patient_notification_sent_at: string;
  email_log: unknown[] | null;
  plan_type: string | null;
}

function buildRenewalReminderEmail(firstName: string, expiryDate: string, daysLeft: number): string {
  const renewUrl = `${SITE_URL}/renew-esa-letter`;
  const urgencyColor = daysLeft <= 14 ? "#DC2626" : "#FF6A00";
  const urgencyLabel = daysLeft <= 14 ? "URGENT — Expires Very Soon" : "Action Required — 30 Days Left";
  
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your ESA Letter Expires in ${daysLeft} Days</title></head>
<body style="margin:0;padding:0;background:#F7F7F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">

        <!-- Header -->
        <tr><td style="background:#FFFFFF;border-radius:16px 16px 0 0;padding:32px 40px 24px;text-align:center;border-bottom:1px solid #EEEEEE;">
          <img src="${LOGO_URL}" alt="PawTenant" height="44" style="display:block;margin:0 auto;object-fit:contain;">
        </td></tr>

        <!-- Urgency badge -->
        <tr><td style="background:#FFFFFF;padding:12px 40px 0;text-align:center;">
          <span style="display:inline-block;background:${urgencyColor}1A;color:${urgencyColor};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:6px 16px;border-radius:100px;border:1px solid ${urgencyColor}30;">${urgencyLabel}</span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:28px 40px 40px;">

          <h1 style="font-size:24px;font-weight:800;color:#1A1A1A;margin:0 0 12px;">
            Hi ${firstName}, your ESA letter expires in <span style="color:${urgencyColor};">${daysLeft} days</span>
          </h1>
          <p style="font-size:15px;color:#555555;line-height:1.7;margin:0 0 24px;">
            Your Emotional Support Animal letter is set to expire on <strong>${expiryDate}</strong>. 
            Once expired, your landlord can legally reject your ESA accommodation request — even if they accepted it before.
          </p>

          <!-- Expiry countdown card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F0;border-radius:12px;border:1px solid #FFD5B0;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #FFE5CC;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Letter Expires</span>
                  </td>
                  <td align="right" style="padding:6px 0;border-bottom:1px solid #FFE5CC;">
                    <span style="font-size:13px;color:${urgencyColor};font-weight:700;">${expiryDate}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #FFE5CC;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Days Remaining</span>
                  </td>
                  <td align="right" style="padding:6px 0;border-bottom:1px solid #FFE5CC;">
                    <span style="font-size:13px;color:${urgencyColor};font-weight:700;">${daysLeft} days</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Renewal Status</span>
                  </td>
                  <td align="right" style="padding:6px 0;">
                    <span style="font-size:13px;color:#16A34A;font-weight:700;">Available Now</span>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${renewUrl}" style="display:inline-block;background:#FF6A00;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;">
                Renew My ESA Letter Now &rarr;
              </a>
            </td></tr>
            <tr><td align="center" style="padding-top:10px;">
              <span style="font-size:12px;color:#999;">Takes under 24 hours &nbsp;·&nbsp; From $79/yr &nbsp;·&nbsp; 100% money-back guarantee</span>
            </td></tr>
          </table>

          <!-- What happens if expired -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF0F0;border-radius:12px;border:1px solid #FECACA;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="font-size:13px;font-weight:700;color:#DC2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">⚠️ What happens if your letter expires?</p>
              ${[
                "Landlords can legally deny your ESA accommodation",
                "You can be charged pet fees &amp; deposits again",
                "Your lease protection under the FHA is removed",
                "University dorm ESA accommodations become invalid",
              ].map(b => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td width="20" valign="top" style="padding-top:1px;">
                    <span style="color:#DC2626;font-size:14px;">✗</span>
                  </td>
                  <td style="font-size:13px;color:#444;padding-left:8px;line-height:1.5;">${b}</td>
                </tr>
              </table>`).join("")}
            </td></tr>
          </table>

          <!-- What renewal includes -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FFF4;border-radius:12px;border:1px solid #BBF7D0;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="font-size:13px;font-weight:700;color:#16A34A;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">✓ Your renewal includes:</p>
              ${[
                "New ESA letter from a licensed LMHP in your state",
                "New issue date — valid for another full 12 months",
                "FHA-compliant letter accepted by landlords nationwide",
                "Delivered to your inbox within 24 hours",
              ].map(b => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td width="20" valign="top" style="padding-top:1px;">
                    <span style="color:#16A34A;font-size:14px;">✓</span>
                  </td>
                  <td style="font-size:13px;color:#444;padding-left:8px;line-height:1.5;">${b}</td>
                </tr>
              </table>`).join("")}
            </td></tr>
          </table>

          <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
            Questions? Reply to this email or call us at <strong style="color:#1A1A1A;">(409) 965-5885</strong>.<br>
            As a returning PawTenant client, you get priority scheduling — no waitlist.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="font-size:12px;color:#AAAAAA;margin:0 0 8px;">
            PawTenant · ESA Consultation Services<br>
            <a href="${SITE_URL}" style="color:#FF6A00;text-decoration:none;">pawtenant.com</a> · (409) 965-5885
          </p>
          <p style="font-size:11px;color:#CCCCCC;margin:0;">
            You received this because you previously obtained an ESA letter through PawTenant.<br>
            To stop renewal reminders, reply with "unsubscribe" to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find completed orders where the letter was sent ~335 days ago
    // (meaning the ESA letter expires in ~30 days)
    // We use patient_notification_sent_at as the letter issue date.
    // Window: 334–336 days ago to catch any timing drift in the daily cron.
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, email, first_name, last_name, patient_notification_sent_at, email_log, plan_type")
      .eq("status", "completed")
      .not("patient_notification_sent_at", "is", null)
      .gte("patient_notification_sent_at", new Date(Date.now() - 336 * 24 * 60 * 60 * 1000).toISOString())
      .lte("patient_notification_sent_at", new Date(Date.now() - 334 * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw new Error(`DB query error: ${error.message}`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No renewal reminders to send today", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: { email: string; status: string; error?: string }[] = [];

    for (const order of orders as Order[]) {
      try {
        // Skip if renewal reminder already sent for this order
        const emailLog = (order.email_log as Array<{ type: string }>) ?? [];
        const alreadySent = emailLog.some((entry) => entry.type === "renewal_reminder_30day");
        if (alreadySent) {
          results.push({ email: order.email, status: "skipped_already_sent" });
          continue;
        }

        // Calculate exact expiry date (365 days after letter was sent)
        const letterSentDate = new Date(order.patient_notification_sent_at);
        const expiryDate = new Date(letterSentDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.round((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        
        const formattedExpiry = expiryDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const displayName = order.first_name?.trim() || "there";

        // Send via Resend
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [order.email],
            subject: `⏰ Your ESA Letter Expires in ${daysLeft} Days — Renew Now`,
            html: buildRenewalReminderEmail(displayName, formattedExpiry, daysLeft),
          }),
        });

        const emailResult = await emailRes.json() as { id?: string; error?: string };

        if (!emailRes.ok || emailResult.error) {
          throw new Error(emailResult.error ?? "Resend send failed");
        }

        // Log in order's email_log to prevent duplicate sends
        const newLogEntry = {
          type: "renewal_reminder_30day",
          sentAt: new Date().toISOString(),
          to: order.email,
          daysLeft,
          expiryDate: expiryDate.toISOString(),
          messageId: emailResult.id,
          success: true,
        };

        await supabase
          .from("orders")
          .update({ email_log: [...emailLog, newLogEntry] })
          .eq("id", order.id);

        results.push({ email: order.email, status: "sent" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ email: order.email, status: "failed", error: msg });
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const skippedCount = results.filter((r) => r.status === "skipped_already_sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        ok: true,
        summary: { sent: sentCount, skipped: skippedCount, failed: failedCount },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
