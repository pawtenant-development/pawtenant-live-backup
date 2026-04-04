import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SITE_URL = "https://www.pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const DISCOUNT_CODE = "20PAW";

// Header colors
const HEADER_BG = "#4a9e8a";       // light green header
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";          // dark green for links/buttons/circles

const MAX_SEQUENCE_AGE_DAYS = 3;

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildUnsubscribeUrl(orderId: string): string {
  return `${SUPABASE_URL}/functions/v1/lead-followup-sequence?action=unsubscribe&id=${encodeURIComponent(orderId)}`;
}

function unsubscribeFooter(orderId: string): string {
  const url = escapeHtml(buildUnsubscribeUrl(orderId));
  return `
    <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a></p>
      <p style="margin:0;font-size:11px;color:#d1d5db;">
        You received this because you started an application on PawTenant.com.
        <a href="${url}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from follow-up emails</a>
      </p>
    </td></tr>`;
}

async function sendSMS(phone: string, message: string, orderId: string, confirmationId: string, supabase: ReturnType<typeof createClient>) {
  let p = phone.replace(/\D/g, "");
  if (p.length === 10) p = "1" + p;
  if (!p.startsWith("+")) p = "+" + p;

  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const body = new URLSearchParams({ To: p, From: TWILIO_FROM_NUMBER, Body: message });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json() as { sid?: string; error_message?: string; status?: string };

  await supabase.from("communications").insert({
    order_id: orderId,
    confirmation_id: confirmationId,
    type: "sms_outbound",
    direction: "outbound",
    body: message,
    phone_from: TWILIO_FROM_NUMBER,
    phone_to: p,
    status: res.ok ? (data.status ?? "sent") : "failed",
    twilio_sid: data.sid ?? null,
    sent_by: "Auto-Sequence",
  });

  return res.ok;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, reply_to: SUPPORT_EMAIL }),
  });
  return res.ok;
}

function baseLayout(badge: string, heading: string, subheading: string, bodyHtml: string, orderId: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:${HEADER_BG};padding:32px;text-align:center;">
        <img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
        <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">${heading}</h1>
        <p style="margin:0;font-size:14px;color:${HEADER_SUB};">${subheading}</p>
      </td></tr>
      <tr><td style="padding:32px;">${bodyHtml}</td></tr>
      ${unsubscribeFooter(orderId)}
    </table>
  </td></tr>
</table></body></html>`;
}

function ctaBtn(url: string, text: string, color = "#f97316") {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
    <a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${text} &rarr;</a>
  </td></tr></table>`;
}

function build30MinEmail(firstName: string, resumeLink: string, letterType: string, orderId: string): string {
  const name = escapeHtml(firstName || "there");
  const label = letterType === "psd" ? "PSD Letter" : "ESA Letter";
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">You started your <strong>${label}</strong> assessment with PawTenant but didn&rsquo;t complete checkout. Your answers are saved &mdash; pick up right where you left off in just one click.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Application Status</p>
        <p style="margin:0 0 6px;font-size:13px;color:#374151;">&#10003; <strong>Assessment complete</strong> &mdash; answers saved</p>
        <p style="margin:0;font-size:13px;color:#d97706;">&#9679; <strong>Payment pending</strong> &mdash; one step left</p>
      </td></tr>
    </table>
    ${ctaBtn(resumeLink, `Complete My ${label} Payment`)}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Questions? Call us at <strong style="color:#374151;">(409) 965-5885</strong> or reply to this email.</p>`;
  return baseLayout("Incomplete Application", `Your ${label} is waiting!`, "Your assessment answers have been saved — pick up where you left off", body, orderId);
}

function build24hEmail(firstName: string, resumeLink: string, letterType: string, orderId: string): string {
  const name = escapeHtml(firstName || "there");
  const label = letterType === "psd" ? "PSD Letter" : "ESA Letter";
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">Still thinking about your <strong>${label}</strong>? Thousands of pet owners rely on their ESA letter to avoid housing issues, pet fees, and lease restrictions. Don&rsquo;t let your pet&rsquo;s housing security wait.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#92400e;">Why act today?</p>
        <p style="margin:0 0 6px;font-size:13px;color:#92400e;">&#128021; Protect your pet&rsquo;s right to live with you</p>
        <p style="margin:0 0 6px;font-size:13px;color:#92400e;">&#127968; Avoid housing discrimination under the Fair Housing Act</p>
        <p style="margin:0;font-size:13px;color:#92400e;">&#9989; 100% money-back guarantee if not approved</p>
      </td></tr>
    </table>
    ${ctaBtn(resumeLink, "Get My ESA Letter Today", ACCENT)}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Your assessment answers are still saved. Complete checkout in under 2 minutes.</p>`;
  return baseLayout("Still Thinking?", "Get your ESA letter today and avoid housing issues.", "Your assessment is saved — complete checkout in under 2 minutes", body, orderId);
}

function build3DayEmail(firstName: string, resumeLink: string, letterType: string, orderId: string): string {
  const name = escapeHtml(firstName || "there");
  const label = letterType === "psd" ? "PSD Letter" : "ESA Letter";
  const resumeWithPromo = `${resumeLink}&promo=${encodeURIComponent(DISCOUNT_CODE)}`;
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">We want to make it easy for you to get your <strong>${label}</strong>. Here&rsquo;s an exclusive <strong>$20 off</strong> just for you &mdash; limited time only.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="background:linear-gradient(135deg,${ACCENT},#2d8b73);border-radius:12px;padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.1em;">Special Offer Just For You</p>
        <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#ffffff;">$20 OFF your ${escapeHtml(label)}</p>
        <div style="display:inline-block;background:#ffffff;border-radius:8px;padding:10px 24px;margin-bottom:8px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Use promo code at checkout</p>
          <p style="margin:0;font-size:20px;font-weight:800;color:${ACCENT};letter-spacing:0.08em;">${DISCOUNT_CODE}</p>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.65);">Applies automatically &mdash; expires in 48 hours</p>
      </td></tr>
    </table>
    ${ctaBtn(resumeWithPromo, "Claim My $20 Discount", ACCENT)}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Your assessment answers are still saved. This discount expires in 48 hours &mdash; don&rsquo;t miss it!</p>`;
  return baseLayout("Limited Time Offer", `Here's $20 off your ${label}!`, "Exclusive discount — expires in 48 hours", body, orderId);
}

function buildUnsubscribePage(success: boolean, email = ""): string {
  if (success) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Unsubscribed — PawTenant</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;text-align:center;">
  <div style="background:${HEADER_BG};padding:32px;">
    <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto;height:auto;" />
  </div>
  <div style="padding:40px 32px;">
    <div style="width:56px;height:56px;background:#f0faf7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
      <span style="font-size:28px;">&#10003;</span>
    </div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;">You've been unsubscribed</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#6b7280;line-height:1.6;">
      ${email ? `<strong>${escapeHtml(email)}</strong> has been` : "You've been"} removed from our follow-up sequence. You won't receive any more automated emails from us.
    </p>
    <p style="margin:0 0 28px;font-size:13px;color:#9ca3af;">If you change your mind, you can always start a new application at <a href="${SITE_URL}" style="color:${ACCENT};text-decoration:none;">pawtenant.com</a></p>
    <a href="${SITE_URL}" style="display:inline-block;background:${ACCENT};color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">Back to PawTenant</a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
  </div>
</div>
</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error — PawTenant</title></head>
<body style="margin:0;padding:40px;background:#f3f4f6;font-family:Arial,sans-serif;text-align:center;">
<h2 style="color:#ef4444;">Something went wrong</h2>
<p style="color:#6b7280;">This unsubscribe link may be invalid or expired. Please email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> to opt out.</p>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const html = (content: string, status = 200) =>
    new Response(content, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = new Date();
    const url = new URL(req.url);

    if (req.method === "GET" && url.searchParams.get("action") === "unsubscribe") {
      const orderId = url.searchParams.get("id");
      if (!orderId) return html(buildUnsubscribePage(false), 400);

      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("id, email, followup_opt_out")
        .eq("id", orderId)
        .maybeSingle();

      if (fetchErr || !order) return html(buildUnsubscribePage(false), 404);

      const { error: updateErr } = await supabase
        .from("orders")
        .update({ followup_opt_out: true, seq_opted_out_at: now.toISOString() })
        .eq("id", orderId);

      if (updateErr) return html(buildUnsubscribePage(false), 500);

      return html(buildUnsubscribePage(true, order.email as string));
    }

    if (req.method === "POST") {
      let body: Record<string, unknown> = {};
      try { body = await req.json() as Record<string, unknown>; } catch { /* empty body = run sequence */ }

      if (body.action === "opt_out" || body.action === "opt_in") {
        const orderId = body.orderId as string;
        if (!orderId) return json({ ok: false, error: "orderId required" }, 400);
        const optOut = body.action === "opt_out";
        const { error } = await supabase
          .from("orders")
          .update({ followup_opt_out: optOut, seq_opted_out_at: optOut ? now.toISOString() : null })
          .eq("id", orderId);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, action: body.action, orderId });
      }
    }

    const maxAgeDate = new Date(now.getTime() - MAX_SEQUENCE_AGE_DAYS * 86400000).toISOString();

    const { data: leads, error } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, phone, letter_type, created_at, seq_30min_sent_at, seq_24h_sent_at, seq_3day_sent_at, payment_intent_id, status, paid_at, followup_opt_out")
      .is("payment_intent_id", null)
      .is("paid_at", null)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .not("email", "is", null)
      .gte("created_at", maxAgeDate);

    if (error) return json({ ok: false, error: error.message }, 500);

    const results = { step1_30min: 0, step2_24h: 0, step3_3day: 0, skipped: 0, opted_out: 0, expired: 0 };

    for (const lead of (leads ?? [])) {
      if (lead.payment_intent_id || lead.paid_at || lead.status === "completed") { results.skipped++; continue; }
      if (lead.followup_opt_out) { results.opted_out++; continue; }

      const createdAt = new Date(lead.created_at as string);
      const ageMs = now.getTime() - createdAt.getTime();
      const ageMin = ageMs / 60000;
      const ageHours = ageMs / 3600000;
      const ageDays = ageMs / 86400000;

      if (ageDays > MAX_SEQUENCE_AGE_DAYS && lead.seq_3day_sent_at) { results.expired++; continue; }

      const letterType = (lead.letter_type as string) || "esa";
      const assessmentPath = letterType === "psd" ? "psd-assessment" : "assessment";
      const resumeLink = `${SITE_URL}/${assessmentPath}?resume=${encodeURIComponent(lead.confirmation_id as string)}`;
      const firstName = (lead.first_name as string) || "";
      const email = lead.email as string;
      const phone = (lead.phone as string) || "";
      const orderId = lead.id as string;
      const confirmationId = lead.confirmation_id as string;

      if (ageMin >= 30 && !lead.seq_30min_sent_at) {
        const subject = `Complete Your ${letterType === "psd" ? "PSD" : "ESA"} Letter — Your answers are saved`;
        await sendEmail(email, subject, build30MinEmail(firstName, resumeLink, letterType, orderId));
        if (phone && TWILIO_ACCOUNT_SID) {
          const smsMsg = `Hi ${firstName || "there"}! You started your ${letterType === "psd" ? "PSD" : "ESA"} letter assessment with PawTenant but didn't finish. Your answers are saved — complete checkout here: ${resumeLink}`;
          await sendSMS(phone, smsMsg, orderId, confirmationId, supabase);
        }
        await supabase.from("orders").update({ seq_30min_sent_at: now.toISOString() }).eq("id", orderId);
        results.step1_30min++;
        continue;
      }

      if (ageHours >= 24 && !lead.seq_24h_sent_at) {
        const subject = `Still thinking? Get your ${letterType === "psd" ? "PSD" : "ESA"} letter today and avoid housing issues.`;
        await sendEmail(email, subject, build24hEmail(firstName, resumeLink, letterType, orderId));
        if (phone && TWILIO_ACCOUNT_SID) {
          const smsMsg = `Hi ${firstName || "there"}, still thinking about your ${letterType === "psd" ? "PSD" : "ESA"} letter? Thousands of pet owners use PawTenant to protect their housing rights. Complete your application: ${resumeLink}`;
          await sendSMS(phone, smsMsg, orderId, confirmationId, supabase);
        }
        await supabase.from("orders").update({ seq_24h_sent_at: now.toISOString() }).eq("id", orderId);
        results.step2_24h++;
        continue;
      }

      if (ageDays >= 3 && !lead.seq_3day_sent_at) {
        const resumeWithPromo = `${resumeLink}&promo=${encodeURIComponent(DISCOUNT_CODE)}`;
        const subject = `Here's $20 off your ${letterType === "psd" ? "PSD" : "ESA"} letter (limited time) — Discount code: ${DISCOUNT_CODE}`;
        await sendEmail(email, subject, build3DayEmail(firstName, resumeLink, letterType, orderId));
        if (phone && TWILIO_ACCOUNT_SID) {
          const smsMsg = `Hi ${firstName || "there"}! Here's $20 off your ${letterType === "psd" ? "PSD" : "ESA"} letter — limited time. Use code ${DISCOUNT_CODE} at checkout: ${resumeWithPromo}`;
          await sendSMS(phone, smsMsg, orderId, confirmationId, supabase);
        }
        await supabase.from("orders").update({ seq_3day_sent_at: now.toISOString() }).eq("id", orderId);
        results.step3_3day++;
        continue;
      }

      results.skipped++;
    }

    console.log("[lead-followup-sequence] Results:", results);
    return json({ ok: true, processed: leads?.length ?? 0, results });

  } catch (err) {
    console.error("[lead-followup-sequence] Error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
