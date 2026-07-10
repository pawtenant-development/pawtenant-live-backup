import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Calm customer notice that the 30-day official-letter review has started.
// Called by public.reopen_due_official_letter_orders() (pg_net) once per order.
// Deliberately reassuring: no "delayed", no mention of internal automation, no
// guaranteed approval, and never any provider-rejection wording.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADER_BG = "#4a9e8a";
const ACCENT = "#1a5c4f";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { confirmationId } = await req.json() as { confirmationId: string };

    if (!confirmationId) {
      return new Response(JSON.stringify({ ok: false, error: "confirmationId is required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, confirmation_id, first_name, last_name, email")
      .eq("confirmation_id", confirmationId).maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ ok: false, error: "Order not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (!order.email) {
      return new Response(JSON.stringify({ ok: false, error: "No customer email on this order" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://pawtenant.com";
    const portalUrl = `${SITE_URL}/my-orders`;
    const firstName = order.first_name || "there";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your official letter review has started — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="background:${HEADER_BG};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="PawTenant" height="40" style="height:40px;width:auto;display:block;margin:0 auto 12px;" />
              <h1 style="color:#ffffff;font-size:18px;font-weight:800;margin:0;letter-spacing:-0.3px;">
                Your Official Letter Review Has Started
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Good news &mdash; your case is now moving into official letter review. Our licensed
                provider will review your file and complete your updated document
                <strong>within 2 business days</strong>.
              </p>
              <p style="margin:0 0 22px;font-size:14px;color:#374151;line-height:1.6;">
                There is nothing you need to do right now. We&rsquo;ll email you as soon as your
                updated letter is ready in your portal.
              </p>

              <!-- Order box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="font-size:12px;color:#6b7280;width:90px;display:inline-block;">Order ID</span>
                    <strong style="font-size:13px;color:${ACCENT};font-family:monospace;">${order.confirmation_id}</strong>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;letter-spacing:0.2px;">
                      View Your Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
                Thank you for your patience &mdash; we&rsquo;ll be in touch shortly.<br />
                &mdash; The PawTenant Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
                &copy; ${new Date().getFullYear()} PawTenant &middot; This is an automated update about your order.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "PawTenant <hello@pawtenant.com>", to: [order.email], subject: `Your official letter review has started — Order ${order.confirmation_id}`, html: emailHtml }),
    });

    const resendData = await resendRes.json() as { id?: string; error?: string };
    const emailSent = resendRes.ok && !!resendData.id;

    try {
      const { data: currentOrder } = await supabase.from("orders").select("email_log").eq("id", order.id).maybeSingle();
      const existingLog = (currentOrder?.email_log as Array<{ type: string; sentAt: string; to: string; success: boolean }>) ?? [];
      await supabase.from("orders").update({ email_log: [...existingLog, { type: "thirty_day_customer_notice", sentAt: new Date().toISOString(), to: order.email, success: emailSent }] }).eq("id", order.id);
    } catch { /* Non-fatal */ }

    return new Response(JSON.stringify({ ok: true, emailSent, emailId: resendData.id ?? null }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
