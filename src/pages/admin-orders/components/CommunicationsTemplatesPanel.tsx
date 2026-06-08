/**
 * CommunicationsTemplatesPanel — Phase G
 *
 * Communications templates UI (email + SMS) extracted verbatim from
 * SettingsTab.tsx so it can mount in BOTH:
 *   1. The legacy Settings tab (where it lived as `CommsTemplatesPanel`).
 *   2. The Communications Hub → Templates sub-tab
 *      (/admin-orders?tab=communications&sub=templates).
 *
 * No logic changes. No template content changes. No placeholder edits.
 * Same Supabase reads / writes against the `email_templates` table.
 * Same channel split (channel='email' vs channel='sms') the DB already
 * supports.
 *
 * The internal function and its types kept their original names where
 * they cross module boundaries (EmailTemplate, SmsTemplate,
 * DEFAULT_TEMPLATES, NEW_TEMPLATE_DEFAULTS, DEFAULT_SMS_TEMPLATES). The
 * default export is the panel itself, renamed to
 * CommunicationsTemplatesPanel for hub clarity.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";

interface EmailTemplate {
  id: string;
  label: string;
  group: string;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface SmsTemplate {
  id: string;
  label: string;
  group: string;
  body: string;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "order_confirmed",
    label: "Order Confirmed",
    group: "Transactional",
    subject: "Your ESA Letter Order is Confirmed — PawTenant",
    body: `Hi {name},

Thank you for your order! Your ESA letter application has been received and is now being reviewed by one of our licensed mental health professionals.

You can track your order status at any time by logging into your customer portal. We'll notify you as soon as your letter is ready — usually within 24 hours.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Track My Order",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  // EMAIL-LETTER-DELIVERY-TEMPLATE-HUB + EMAIL-LETTER-DELIVERY-HTML-
  // TEMPLATE-PARITY (2026-05-19): DB-managed template sent by
  // notify-patient-letter on every Notify Patient / Resend / Send All.
  // Editable from the hub via slug='letter_delivery'. Body is the full
  // polished email-safe HTML, NOT plain text — see migration
  // 20260519150000_letter_delivery_template_seed.sql for the canonical
  // copy. notify-patient-letter and the hub preview detect the
  // <!DOCTYPE / <html / <table head and ship it directly without a
  // second master-layout wrap (would otherwise collapse the cards).
  {
    id: "letter_delivery",
    label: "Letter Delivery",
    group: "Transactional",
    subject: "Your ESA Letter is here — Order {order_id}",
    body: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#4a9e8a;padding:32px;text-align:center;">
          <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Documents Ready</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">Your ESA Letter is here!</h1>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);">Your signed documents are ready for download</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>{name}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
          Your ESA letter has been signed and is ready for download. You can access all your documents below or directly through your portal.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Documents</p>
            <table width="100%" cellpadding="0" cellspacing="0">{document_list}</table>
          </td></tr>
        </table>

        <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">&#128274; Letter Verification ID</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#c2410c;letter-spacing:0.05em;">{verification_id}</p>
          <p style="margin:0;font-size:12px;color:#78350f;">
            Landlords can verify this letter at
            <a href="{verification_url}" style="color:#c2410c;text-decoration:none;font-weight:700;">{verification_url}</a>
          </p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Order Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Order ID</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:#4a7fb5;">{order_id}</td></tr>
              <tr><td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Completed By</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:#4a7fb5;">{provider_name}</td></tr>
              <tr><td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Status</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:#111827;"><span style="color:#059669;font-weight:700;">Completed</span></td></tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td align="center">
            <a href="{portal_url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">View All Documents &rarr;</a>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">What To Do With Your Letter</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:7px 0;vertical-align:top;width:30px;"><div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">1</div></td><td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Download your signed ESA letter and keep a digital copy</td></tr>
              <tr><td style="padding:7px 0;vertical-align:top;width:30px;"><div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">2</div></td><td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Present it to your landlord or housing provider as needed</td></tr>
              <tr><td style="padding:7px 0;vertical-align:top;width:30px;"><div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">3</div></td><td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Contact us at any time if you need a renewal or have questions</td></tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:24px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1a5c4f;text-transform:uppercase;letter-spacing:0.08em;">A Quick Favor</p>
            <h2 style="margin:0 0 10px;font-size:18px;font-weight:800;color:#0f3d34;">How was your PawTenant experience?</h2>
            <p style="margin:0 0 18px;font-size:13px;color:#374151;line-height:1.6;">If everything looks good, we&rsquo;d love a quick review. It takes 30 seconds and helps other pet owners find us. If anything is off, just reply to this email &mdash; we&rsquo;ll make it right.</p>
            <a href="{review_url}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">{review_cta_label}</a>
          </td></tr>
        </table>

        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          Your ESA letter is legally recognized under the Fair Housing Act. If you ever need assistance, we&rsquo;re always here at <a href="mailto:{support_email}" style="color:#4a7fb5;text-decoration:none;">{support_email}</a>.
        </p>
      </td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:{support_email}" style="color:#4a7fb5;text-decoration:none;">{support_email}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#4a7fb5;text-decoration:none;">pawtenant.com</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
    ctaLabel: "Leave a Review",
    // REVIEW-PANEL-GOOGLE-URL-SWITCH (2026-05-19): canonical Google
    // reviews URL — same value seeded into email_templates.cta_url by
    // 20260519150000_letter_delivery_template_seed.sql. notify-patient-
    // letter prefers the DB row over env / fallback so an admin edit
    // here propagates without a redeploy.
    ctaUrl: "https://www.google.com/search?sca_esv=08d3373863b39b87&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qOcgBj58jmxujTZ7byPAw8npggXTcPRI82lkEhuTmamSruv_EA9uwdfELsrB4RPReQ-OPCTj609pZy3sSjc4oz_EHV8no&q=PawTenant+Reviews&sa=X&ved=2ahUKEwjQzuTHjMSUAxUSA9sEHYkzJfIQ0bkNegQIIRAF",
  },
  {
    id: "letter_ready",
    label: "ESA Letter Ready",
    group: "Transactional",
    subject: "Your ESA Letter is Ready — Download Now",
    body: `Hi {name},

Great news! Your ESA letter has been reviewed and signed by a licensed mental health professional. Your official ESA letter is now ready to download.

Your letter is valid for housing purposes under the Fair Housing Act. Present it to your landlord or property manager to request reasonable accommodation for your emotional support animal.

If you have any questions about your letter, please don't hesitate to contact us.`,
    ctaLabel: "Download My ESA Letter",
    ctaUrl: "https://pawtenant.com/my-orders",
  },
  {
    id: "renewal",
    label: "ESA Renewal Reminder",
    group: "Marketing",
    subject: "Time to Renew Your ESA Letter — Stay Protected",
    body: `Hi {name},

Your ESA letter may be approaching its annual renewal date. Most landlords and housing providers require an up-to-date letter from a licensed professional.

Renewing is quick and easy — our licensed providers are standing by to complete your evaluation within 24-48 hours.

Don't let your ESA protections lapse. Renew today and keep your housing rights secure.`,
    ctaLabel: "Renew My ESA Letter",
    ctaUrl: "https://pawtenant.com/renew-esa-letter",
  },
  {
    id: "finish_esa",
    label: "Abandoned Checkout Recovery",
    group: "Marketing",
    subject: "You're One Step Away — Complete Your ESA Letter",
    body: `Hi {name},

You're one step away from getting your ESA letter. Complete your order here and get protected today.

Your assessment answers are already saved — just finish the payment and our licensed providers will review your case within 24 hours.`,
    ctaLabel: "Complete My ESA Letter",
    ctaUrl: "https://pawtenant.com/assessment",
  },
  {
    id: "psd_upsell",
    label: "PSD Upgrade Offer",
    group: "Marketing",
    subject: "Upgrade to a Psychiatric Service Dog Letter — Full Public Access",
    body: `Hi {name},

Did you know you can upgrade your ESA letter to a full Psychiatric Service Dog (PSD) letter?

A PSD letter grants your dog access to public spaces, transportation, and more. Unlike ESA letters, PSD protections extend beyond housing under the Americans with Disabilities Act.

Our licensed providers can evaluate your eligibility and issue a PSD letter — usually within 24 hours.`,
    ctaLabel: "Get My PSD Letter",
    ctaUrl: "https://pawtenant.com/how-to-get-psd-letter",
  },
  {
    id: "broadcast_promo",
    label: "Broadcast Promo",
    group: "Broadcast",
    subject: "Exclusive Offer from PawTenant — Just for You",
    body: `Hi {name},

As one of our valued customers, we wanted to share an exclusive offer just for you.

Whether you need a renewal, an upgrade, or a letter for a new pet — our licensed mental health professionals are here to help.

Use the button below to claim your offer. This is a limited-time deal available only to our existing customers.

Thank you for trusting PawTenant with your ESA needs.`,
    ctaLabel: "Claim My Offer",
    ctaUrl: "https://pawtenant.com/assessment",
  },
];

// EMAIL-LETTER-DELIVERY-TEMPLATE-HUB (2026-05-19): the Letter Delivery
// template uses placeholders ({document_list}, {verification_id}, etc.)
// that notify-patient-letter substitutes at send time. The Templates Hub
// preview should render the SAME placeholders with realistic sample
// values so admins see what the customer will actually receive.
//
// EMAIL-LETTER-DELIVERY-HTML-NO-DOUBLE-WRAP (2026-05-19): document_list
// is now pre-rendered as polished table <tr> rows that fit inside the
// outer table the template body owns. previewName + review_cta_label
// fall back via applyPreviewVars / cta_label respectively.
// EMAIL-LETTER-DELIVERY-BROKEN-PUBLIC-BUCKET-FIX + EMAIL-LETTER-DELIVERY-
// GOOGLE-REVIEW-URL (2026-05-19): the sample document_list no longer
// references a TEST-project Supabase storage URL — that URL pattern
// 404'd in real sends and confused admins inspecting the preview. The
// sample now points the Download button at the portal /my-orders so
// the preview button is at least clickable to a real page. Sample
// review_url is the Google reviews search URL (matches the live
// fallback in notify-patient-letter when no GOOGLE_REVIEW_URL secret
// is set).
const SAMPLE_PREVIEW_VARS: Record<string, string> = {
  order_id:         "PT-SAMPLE123",
  document_list:    `<tr><td style="padding:8px 0;font-size:13px;color:#374151;vertical-align:middle;"><span style="margin-right:6px;">&#128196;</span> Signed ESA Letter</td><td style="padding:8px 0;text-align:right;vertical-align:middle;"><a href="https://www.pawtenant.com/my-orders" style="display:inline-block;background:#4a7fb5;color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;">Download</a></td></tr>`,
  portal_url:       "https://www.pawtenant.com/my-orders",
  verification_id:  "ESA-TX-SAMPLE",
  verification_url: "https://www.pawtenant.com/verify/ESA-TX-SAMPLE",
  provider_name:    "Licensed Provider",
  review_url:       "https://www.google.com/search?sca_esv=08d3373863b39b87&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qOcgBj58jmxujTZ7byPAw8npggXTcPRI82lkEhuTmamSruv_EA9uwdfELsrB4RPReQ-OPCTj609pZy3sSjc4oz_EHV8no&q=PawTenant+Reviews&sa=X&ved=2ahUKEwjQzuTHjMSUAxUSA9sEHYkzJfIQ0bkNegQIIRAF",
  review_cta_label: "Leave a Review",
  support_email:    "hello@pawtenant.com",
};

function applyPreviewVars(s: string, previewName: string): string {
  const vars: Record<string, string> = { ...SAMPLE_PREVIEW_VARS, name: previewName };
  return String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Detect full email-safe HTML so the preview can render it directly
// without a second master wrap (would double-wrap and break the
// designed cards — same fix path as notify-patient-letter).
function looksLikeFullEmailHtml(s: string): boolean {
  return /^\s*(?:<!DOCTYPE\s+html|<html[\s>]|<table[\s>])/i.test(s);
}

function buildEmailHtml(subject: string, body: string, ctaLabel: string, ctaUrl: string, previewName = "Jane"): string {
  // EMAIL-LETTER-DELIVERY-HTML-NO-DOUBLE-WRAP: when the body is already
  // a complete email-safe HTML document (the new letter_delivery
  // template + any future full-HTML template), substitute placeholders
  // and return it as-is. The outer preview shell below would double-
  // wrap the body and collapse its cards into ugly paragraph blocks.
  // cta_label / cta_url are surfaced as {review_cta_label} / inside
  // the body's own button so they still influence the rendered email.
  if (looksLikeFullEmailHtml(body)) {
    const varsWithCta: Record<string, string> = {
      ...SAMPLE_PREVIEW_VARS,
      name: previewName,
      review_cta_label: (ctaLabel || "").trim() || SAMPLE_PREVIEW_VARS.review_cta_label,
      review_url:       (ctaUrl   || "").trim() ? applyPreviewVars(ctaUrl, previewName) : SAMPLE_PREVIEW_VARS.review_url,
    };
    return String(body).replace(/\{(\w+)\}/g, (_, k) => varsWithCta[k] ?? `{${k}}`);
  }

  const previewBody = applyPreviewVars(body, previewName);
  const previewSubject = applyPreviewVars(subject, previewName);
  const previewCtaLabel = applyPreviewVars(ctaLabel, previewName);
  const previewCtaUrl   = applyPreviewVars(ctaUrl,   previewName);

  // {document_list} is intentionally pre-rendered HTML — strip the
  // <p> wrapping for that single line so the bullet list renders
  // correctly instead of being escaped into a paragraph.
  const paragraphs = previewBody
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => /^<(ul|ol|table|div|tr|td|th)/i.test(p)
      ? p
      : `<p style="margin:0 0 16px 0;line-height:1.65;color:#374151;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const ctaHtml = previewCtaLabel && previewCtaUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${previewCtaUrl}" style="display:inline-block;background:#3b6ea5;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${previewCtaLabel}</a>
      </div>`
    : "";

  // Re-bind so the inner head/body uses the substituted subject.
  // (Original signature kept; subject is now the variable-substituted one.)
  subject = previewSubject;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
    <tr>
      <td align="center">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:#3b6ea5;padding:28px 32px;text-align:center;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />
            <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
          </div>
          <div style="padding:32px 36px;">
            ${subject ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${subject}</h1>` : ""}
            ${paragraphs}
            ${ctaHtml}
          </div>
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#3b6ea5;text-decoration:none;">hello@pawtenant.com</a></p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const NEW_TEMPLATE_DEFAULTS: Omit<EmailTemplate, "id"> = {
  label: "New Template",
  group: "Marketing",
  subject: "Subject line here",
  body: `Hi {name},

Write your email body here. Use {name} to personalize with the recipient's name.

Separate paragraphs with a blank line.`,
  ctaLabel: "Click Here",
  ctaUrl: "https://pawtenant.com",
};

const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  { id: "sms_order_confirmed",     label: "Order Confirmed",        group: "Transactional", body: "Hi {name}, your ESA consultation with PawTenant is confirmed! Your Order ID is {order_id}. Track your order anytime at pawtenant.com/my-orders" },
  { id: "sms_documents_ready",     label: "Documents Ready",        group: "Transactional", body: "Hi {name}, great news! Your ESA letter is ready. Log in to download your documents at pawtenant.com/my-orders" },
  { id: "sms_under_review",        label: "Under Review",           group: "Transactional", body: "Hi {name}, your ESA assessment is under review by our licensed provider. We'll notify you as soon as it's complete, usually within 24 hours." },
  { id: "sms_finish_esa",          label: "Finish Your ESA Letter", group: "Lead Recovery",  body: "Hi {name}, you're one step away from your ESA letter! Complete your order here: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_still_thinking",      label: "Still Thinking?",        group: "Lead Recovery",  body: "Hi {name}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_consultation_booked", label: "Consultation Booked",    group: "Lead Recovery",  body: "Hi {name}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment?resume={order_id}" },
  { id: "sms_need_more_info",      label: "Need More Info",          group: "Transactional", body: "Hi {name}, we need a bit more information to complete your ESA assessment. Please reply here or call us and we'll get you sorted quickly!" },
  { id: "sms_follow_up",           label: "Follow Up",              group: "General",        body: "Hi {name}, just checking in on your ESA order. Is there anything we can help you with?" },
  { id: "sms_refund_processed",    label: "Refund Processed",       group: "Transactional", body: "Hi {name}, your refund has been processed and should appear in your account within 3-5 business days. Thank you for your patience." },
];

// ── Merge-tag legend dataset ────────────────────────────────────────────────
//
// COMMS-TEMPLATE-HUB-MERGE-TAGS (2026-05-23): visible guide for admins
// composing or editing a template. Documents which placeholders the email
// pipeline substitutes, where they can appear (subject / body / CTA label
// / CTA URL), a sample value, and whether the tag is available on every
// template or only on the templates whose Edge Function injects it.
//
// Important:
//   - This is DISPLAY-ONLY metadata. It does not change the rendering
//     pipeline or buildEmailHtml() in any way — admins still type the
//     literal `{tag}` text into Subject / Body / CTA fields, and the
//     existing Edge Functions still own the substitution.
//   - "Global" = always available on every template send (the variable
//     is injected from order data or comms_settings before the email
//     goes out).
//   - "Template-specific" = only injected when the originating flow
//     supplies the value (refund flow injects {amount}+{reason},
//     recovery flow injects {discount_code}+{discount_savings}+
//     {resume_url_with_promo}, consultation flow injects
//     {appointment_date}+{appointment_time}). If used outside that
//     flow the literal `{tag}` is delivered to the customer — admins
//     should treat these as opt-in per template.
//
// To extend: append a new MergeTag below. Do not remove rows — old
// templates may reference any tag declared here.
interface MergeTag {
  tag:     string;
  meaning: string;
  sample:  string;
  scope:   "global" | "template-specific";
}

const MERGE_TAGS: MergeTag[] = [
  // Global — every send substitutes these from order data.
  { tag: "{name}",              meaning: "Customer first name (auto-filled from order; falls back to last name or 'there').", sample: "Jane",                                                                  scope: "global" },
  { tag: "{first_name}",        meaning: "Same as {name} — alias for templates that already used the longer form.",          sample: "Jane",                                                                  scope: "global" },
  { tag: "{petname}",           meaning: "Pet's name from the order's assessment answers. Falls back to 'your pet' if missing.", sample: "Buddy",                                                               scope: "global" },
  { tag: "{order_id}",          meaning: "Order confirmation ID (PT-XXXX format).",                                            sample: "PT-12345",                                                              scope: "global" },
  { tag: "{letter_type}",       meaning: "ESA or PSD letter type for this order.",                                             sample: "ESA",                                                                   scope: "global" },
  { tag: "{resume_url}",        meaning: "Resume checkout link for the customer's lead, no promo applied.",                    sample: "https://pawtenant.com/assessment?resume=PT-12345",                      scope: "global" },
  { tag: "{portal_url}",        meaning: "Customer portal where the order, letter, and history live.",                         sample: "https://pawtenant.com/my-orders",                                       scope: "global" },
  { tag: "{verification_url}",  meaning: "Landlord-facing verification page for this customer's letter.",                       sample: "https://pawtenant.com/esa-letter-verification",                         scope: "global" },
  { tag: "{provider_name}",     meaning: "Assigned LMHP / PSD provider's display name (blank if unassigned).",                 sample: "Dr. Alex Stone",                                                        scope: "global" },
  // Template-specific — only injected by the originating Edge Function.
  { tag: "{amount}",             meaning: "Refund or payment amount (USD). Refund + cancellation templates only.",             sample: "$99.00",                                                                scope: "template-specific" },
  { tag: "{reason}",             meaning: "Cancellation / refund reason text entered by admin at refund time.",                sample: "Customer request",                                                      scope: "template-specific" },
  { tag: "{discount_code}",      meaning: "Recovery discount code (injected by lead-followup-sequence).",                       sample: "SAVE20",                                                                scope: "template-specific" },
  { tag: "{discount_savings}",   meaning: "Dollar amount the discount saves.",                                                  sample: "$20",                                                                   scope: "template-specific" },
  { tag: "{resume_url_with_promo}", meaning: "Resume checkout link with the recovery discount code pre-applied.",               sample: "https://pawtenant.com/assessment?resume=PT-12345&promo=SAVE20",         scope: "template-specific" },
  { tag: "{appointment_date}",   meaning: "Consultation / Zoom call slot date (consultation funnel only).",                    sample: "Apr 8, 2026",                                                           scope: "template-specific" },
  { tag: "{appointment_time}",   meaning: "Consultation / Zoom call slot time (consultation funnel only).",                    sample: "2:30 PM CT",                                                            scope: "template-specific" },
];

// Self-contained collapsible legend. No external props — pulls only the
// editor's current previewName so the "Preview as" line is in sync. Kept
// inside this file so the entire merge-tag knowledge surface stays in one
// place that admins reach via the editor itself.
function MergeTagLegend({ previewName }: { previewName: string }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (tag: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(tag).then(() => {
      setCopied(tag);
      window.setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1400);
    }).catch(() => { /* swallow — no fallback needed for an admin convenience tool */ });
  };

  const globalTags     = MERGE_TAGS.filter((t) => t.scope === "global");
  const templateTags   = MERGE_TAGS.filter((t) => t.scope === "template-specific");

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-100/70 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <i className="ri-braces-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
          <span className="text-xs font-bold text-gray-700 truncate">Variables / Merge Tags</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-500 flex-shrink-0">
            {MERGE_TAGS.length}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400 flex-shrink-0">
          <span className="hidden sm:inline">{open ? "Hide" : "Show"}</span>
          <i className={`ri-arrow-${open ? "up" : "down"}-s-line text-base`}></i>
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-200 bg-white px-4 py-3 space-y-3">
          <div className="text-[11px] text-gray-600 leading-relaxed">
            <p>
              Type any tag below into the <span className="font-semibold">Subject line</span>, <span className="font-semibold">Body</span>, <span className="font-semibold">CTA Button Label</span>, or <span className="font-semibold">CTA URL</span> fields. The email pipeline substitutes the live value at send time.
            </p>
            <p className="mt-1">
              <span className="font-semibold">Preview as &ldquo;{previewName}&rdquo;:</span> the iframe preview replaces <span className="font-mono bg-gray-100 px-1 rounded">&#123;name&#125;</span> only. Other tags appear as literal text in the preview — they substitute correctly at real send time.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Global &mdash; always available
            </p>
            <ul className="space-y-1">
              {globalTags.map((t) => (
                <MergeTagRow key={t.tag} tag={t} copied={copied === t.tag} onCopy={() => handleCopy(t.tag)} />
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Template-specific &mdash; only injected by the originating flow
            </p>
            <ul className="space-y-1">
              {templateTags.map((t) => (
                <MergeTagRow key={t.tag} tag={t} copied={copied === t.tag} onCopy={() => handleCopy(t.tag)} />
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] text-amber-700 leading-relaxed">
              If used on a template whose flow does not inject these values, the literal <span className="font-mono">&#123;tag&#125;</span> ships to the customer. Reserve these for the matching template (refund, recovery, consultation).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// COMMS-TEMPLATE-HUB-ACTIVE-SLOTS 2026-05-23 — compact selector that lets
// the admin assign exactly one template per automation slot. Eligible
// slots are filtered by template group so a Sequence template can only
// be picked for a Sequence slot, etc. Writes to comms_settings via the
// onChange handler; rendering of "Active" vs "Prepared" badges happens
// elsewhere in the panel based on the same pointer state.
function SlotAssignmentRow({
  templateId,
  templateGroup,
  slotPointers,
  saving,
  status,
  onChange,
}: {
  templateId:    string;
  templateGroup: string;
  slotPointers:  Record<string, string | null>;
  saving:        string | null;
  status:        { key: string; kind: "ok" | "err"; msg: string } | null;
  onChange:      (pointerKey: string, templateId: string | null) => void;
}) {
  // Filter slots to those whose group matches the template's group. If the
  // template's group does not match any slot ("Transactional", "Marketing",
  // "Broadcast"), the panel renders a "no slot eligible" hint instead of a
  // selector — automation slots are recovery flows only.
  const eligibleSlots = AUTOMATION_SLOTS.filter((s) => s.group === templateGroup);

  // Slots this template is CURRENTLY assigned to (one is the practical max
  // but we render any matches defensively).
  const assignedSlot = eligibleSlots.find((s) => slotPointers[s.pointerKey] === templateId) ?? null;

  if (eligibleSlots.length === 0) {
    return (
      <div className="border border-dashed border-gray-200 rounded-lg bg-gray-50/60 px-4 py-2.5 flex items-center gap-2">
        <i className="ri-flashlight-line text-gray-400 text-sm"></i>
        <p className="text-[11px] text-gray-500 leading-snug">
          No automation slot applies to <span className="font-semibold">{templateGroup}</span> templates. Move this template to a <span className="font-semibold">Sequence</span> or <span className="font-semibold">Lead Recovery</span> group to assign it.
        </p>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    // If the same slot is selected, also covers the no-op case.
    if (!next) {
      // "Not assigned" — clear whichever slot currently holds this template.
      if (assignedSlot) onChange(assignedSlot.pointerKey, null);
      return;
    }
    onChange(next, templateId);
    // If the template was previously assigned to a DIFFERENT slot, also
    // clear that older pointer so the template is Active for exactly one
    // slot at a time (defensive — the upsert path already enforces unique
    // pointer per key, but a stale pointer with the same template id on a
    // different slot would otherwise paint two badges).
    const prior = eligibleSlots.find((s) => s.pointerKey !== next && slotPointers[s.pointerKey] === templateId);
    if (prior) onChange(prior.pointerKey, null);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <i className="ri-flashlight-line text-[#3b6ea5]"></i>
          Automation Slot
        </span>
        {status && (
          <span className={`text-[10px] font-semibold ${status.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {status.msg}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={assignedSlot?.pointerKey ?? ""}
          onChange={handleChange}
          disabled={saving !== null}
          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer disabled:opacity-60"
        >
          <option value="">Not assigned (Saved only)</option>
          {eligibleSlots.map((s) => (
            <option key={s.pointerKey} value={s.pointerKey}>
              {s.label}{s.wired ? "" : " — Prepared (sender not wired yet)"}
            </option>
          ))}
        </select>
        {saving && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <i className="ri-loader-4-line animate-spin"></i>Saving…
          </span>
        )}
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed mt-1.5">
        Picking a slot makes this template the Active template for that automation. Only one template can be Active per slot. Slots marked <span className="font-semibold">Prepared</span> save the pointer but no Edge Function reads it yet — a follow-up code change will activate them. Clearing the selection falls back to the engine&rsquo;s built-in default slug.
      </p>
    </div>
  );
}

function MergeTagRow({ tag, copied, onCopy }: { tag: MergeTag; copied: boolean; onCopy: () => void }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <button
        type="button"
        onClick={onCopy}
        title={copied ? "Copied!" : "Click to copy"}
        className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-semibold border transition-colors cursor-pointer ${
          copied
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-gray-200 text-gray-700 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
        }`}
      >
        <i className={copied ? "ri-check-line text-[11px]" : "ri-file-copy-line text-[11px]"}></i>
        {tag.tag}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-gray-600 leading-snug">{tag.meaning}</p>
        <p className="text-[10px] text-gray-400 leading-snug">
          <span className="font-semibold">Sample:</span> <span className="font-mono">{tag.sample}</span>
        </p>
      </div>
    </li>
  );
}

const DEFAULT_MASTER_LAYOUT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#4a9e8a;padding:24px;text-align:center;color:#ffffff;">
        <h1 style="margin:0;font-size:22px;font-weight:800;">PawTenant</h1>
      </td></tr>
      <tr><td style="padding:32px;">{{content}}</td></tr>
      <tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

const SAMPLE_CONTENT = `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>Jane</strong>,</p>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">This is how your template body looks inside the master layout.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td align="center">
  <a href="#" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Sample CTA &rarr;</a>
</td></tr></table>`;

// Phase G hotfix — re-exported so SettingsTab.tsx can keep rendering it
// at its existing AccordionSection. The component is conceptually part
// of the communications surface and will be migrated into the hub's
// Templates / Settings & Automation sub-tabs in a future phase.
export function MasterEmailLayoutPanel() {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("comms_settings")
        .select("value")
        .eq("key", "email_layout_html")
        .maybeSingle();
      setHtml((data?.value as string | null) ?? "");
      setLoading(false);
    })();
  }, []);

  const effective = html || DEFAULT_MASTER_LAYOUT;
  const hasPlaceholder = effective.includes("{{content}}");
  const previewHtml = effective.replace("{{content}}", SAMPLE_CONTENT);

  const save = async () => {
    if (html && !html.includes("{{content}}")) {
      setStatus("ERROR: must include {{content}} placeholder");
      return;
    }
    setSaving(true);
    setStatus("");
    const { error } = await supabase
      .from("comms_settings")
      .upsert({ key: "email_layout_html", value: html || null, updated_at: new Date().toISOString() });
    setSaving(false);
    setStatus(error ? `ERROR: ${error.message}` : "Saved.");
    setTimeout(() => setStatus(""), 3000);
  };

  const resetDefault = () => {
    setHtml("");
    setStatus("Reverted to built-in default (not yet saved).");
  };

  const loadDefaultIntoEditor = () => {
    setHtml(DEFAULT_MASTER_LAYOUT);
    setStatus("Default loaded into editor (not yet saved).");
  };

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">
        This HTML wraps every DB-driven email (sequences, checkout recovery, review request, broadcast, order-modal custom templates).
        Use <code className="px-1 rounded bg-gray-100">{"{{content}}"}</code> where the body of each email should appear.
        Leave empty to use each function&apos;s built-in layout.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-[#3b6ea5] text-white text-xs font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Layout"}
        </button>
        <button
          type="button"
          onClick={loadDefaultIntoEditor}
          className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-semibold"
        >
          Load Default Into Editor
        </button>
        <button
          type="button"
          onClick={resetDefault}
          className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 text-xs font-semibold"
        >
          Clear (Use Fallback)
        </button>
        {status && <span className={`text-xs ${status.startsWith("ERROR") ? "text-red-600" : "text-green-700"}`}>{status}</span>}
        {!hasPlaceholder && <span className="text-xs text-red-600">Missing {"{{content}}"} placeholder</span>}
      </div>

      <textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={14}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono"
        placeholder="Leave empty to use built-in layout. Must include {{content}} placeholder."
      />

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">Preview:</span>
        <button
          type="button"
          onClick={() => setViewMode("rendered")}
          className={`px-2 py-1 rounded text-xs ${viewMode === "rendered" ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Rendered
        </button>
        <button
          type="button"
          onClick={() => setViewMode("raw")}
          className={`px-2 py-1 rounded text-xs ${viewMode === "raw" ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Raw HTML
        </button>
      </div>

      {viewMode === "rendered" ? (
        <iframe
          title="Master layout preview"
          srcDoc={previewHtml}
          className="w-full h-[520px] border border-gray-200 rounded-md bg-white"
        />
      ) : (
        <pre className="w-full max-h-[520px] overflow-auto border border-gray-200 rounded-md p-3 text-[11px] font-mono bg-gray-50 whitespace-pre-wrap break-all">
          {previewHtml}
        </pre>
      )}
    </div>
  );
}

// ── Recovery Sequence Settings panel ─────────────────────────────────────────
// Reads + writes 5 keys in `comms_settings`. ONLY the 3 email stages actually
// wired in the backend (lead-followup-sequence) are surfaced here:
//   recovery_stage_1_minutes (30-min), recovery_stage_2_hours (24-hr),
//   recovery_stage_4_days (3-day — historical key name).
// 48-hour, 5-day, and all SMS stages are intentionally hidden until backend
// support lands. Inactive comms_settings rows in DB are left untouched so no
// data is lost; they simply do not appear in the UI.
type RecoveryToggleKey =
  | "recovery_enabled"
  | "recovery_email_enabled"
  | "recovery_sms_enabled";

type RecoveryNumKey =
  | "recovery_stage_1_minutes"
  | "recovery_stage_2_hours"
  | "recovery_stage_4_days";

type RecoveryTextKey =
  | "recovery_sms_5min_template"
  | "recovery_sms_promo_code";

const RECOVERY_NUM_DEFAULTS: Record<RecoveryNumKey, number> = {
  // Stage 1 fires at 5 minutes (backend: lead-followup-sequence/core.ts
  // sends the first recovery email AND the one-time SMS at age >= 5 min).
  recovery_stage_1_minutes: 5,
  recovery_stage_2_hours:   24,
  recovery_stage_4_days:    3,
};

const RECOVERY_TOGGLE_DEFAULTS: Record<RecoveryToggleKey, boolean> = {
  recovery_enabled:       true,
  recovery_email_enabled: true,
  // SMS recovery is LIVE and intended ON. Controls ONLY the automatic 5-minute
  // SMS — turning it off does NOT affect the email sequence or manual
  // Order Details -> Comms SMS. Backend default is also TRUE when unset.
  recovery_sms_enabled:   true,
};

// Text settings (free-text, not validated as numbers). Default template MUST
// stay byte-identical to DEFAULT_SMS_TEMPLATE in
// supabase/functions/lead-followup-sequence/core.ts.
const RECOVERY_TEXT_DEFAULTS: Record<RecoveryTextKey, string> = {
  recovery_sms_5min_template:
    "Hi {first_name}, we saved your PawTenant checkout for {petname}. Use code {promo_code} for $20 off and complete it securely here: {resume_url}. Reply STOP to opt out.",
  recovery_sms_promo_code: "PAW20",
};

// Phase G hotfix — re-exported alongside MasterEmailLayoutPanel for the
// same reason: SettingsTab.tsx still mounts this component today.
export function RecoverySequencePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [toggles, setToggles] = useState<Record<RecoveryToggleKey, boolean>>(RECOVERY_TOGGLE_DEFAULTS);
  const [nums, setNums]       = useState<Record<RecoveryNumKey, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
      init[k] = String(RECOVERY_NUM_DEFAULTS[k]);
    }
    return init as Record<RecoveryNumKey, string>;
  });
  const [texts, setTexts]     = useState<Record<RecoveryTextKey, string>>({ ...RECOVERY_TEXT_DEFAULTS });

  useEffect(() => {
    (async () => {
      const allKeys = [
        ...Object.keys(RECOVERY_TOGGLE_DEFAULTS),
        ...Object.keys(RECOVERY_NUM_DEFAULTS),
        ...Object.keys(RECOVERY_TEXT_DEFAULTS),
      ];
      const { data, error } = await supabase
        .from("comms_settings")
        .select("key, value")
        .in("key", allKeys);

      if (!error && data) {
        const map = new Map<string, string>();
        for (const r of data as Array<{ key: string; value: string | null }>) {
          if (r.value !== null) map.set(r.key, r.value);
        }

        setToggles((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(RECOVERY_TOGGLE_DEFAULTS) as RecoveryToggleKey[]) {
            const v = map.get(k);
            if (v !== undefined) {
              const lower = v.trim().toLowerCase();
              next[k] = lower === "true" || lower === "1" || lower === "yes";
            }
          }
          return next;
        });

        setNums((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
            const v = map.get(k);
            if (v !== undefined) next[k] = v;
          }
          return next;
        });

        setTexts((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(RECOVERY_TEXT_DEFAULTS) as RecoveryTextKey[]) {
            const v = map.get(k);
            if (v !== undefined && v.trim() !== "") next[k] = v;
          }
          return next;
        });
      }
      setLoading(false);
    })();
  }, []);

  const validateNums = (): { ok: boolean; firstError?: string } => {
    for (const k of Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]) {
      const raw = nums[k];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || !/^\d+$/.test(raw.trim())) {
        return { ok: false, firstError: `${k} must be a positive whole number` };
      }
    }
    return { ok: true };
  };

  const save = async () => {
    const v = validateNums();
    if (!v.ok) {
      setStatus({ kind: "err", msg: v.firstError ?? "Invalid input" });
      setTimeout(() => setStatus(null), 4000);
      return;
    }
    // Light validation for the SMS template: must be non-empty and keep the
    // {resume_url} tag (otherwise the recovery link is lost). Promo code must
    // be non-empty.
    const smsTmpl = texts.recovery_sms_5min_template.trim();
    if (!smsTmpl) {
      setStatus({ kind: "err", msg: "SMS template cannot be empty" });
      setTimeout(() => setStatus(null), 4000);
      return;
    }
    if (!smsTmpl.includes("{resume_url}")) {
      setStatus({ kind: "err", msg: "SMS template must include {resume_url}" });
      setTimeout(() => setStatus(null), 4000);
      return;
    }
    if (!texts.recovery_sms_promo_code.trim()) {
      setStatus({ kind: "err", msg: "Promo code cannot be empty" });
      setTimeout(() => setStatus(null), 4000);
      return;
    }
    setSaving(true);
    setStatus(null);

    const nowIso = new Date().toISOString();
    const rows = [
      ...(Object.keys(RECOVERY_TOGGLE_DEFAULTS) as RecoveryToggleKey[]).map((k) => ({
        key: k,
        value: toggles[k] ? "true" : "false",
        updated_at: nowIso,
      })),
      ...(Object.keys(RECOVERY_NUM_DEFAULTS) as RecoveryNumKey[]).map((k) => ({
        key: k,
        value: String(Number(nums[k])),
        updated_at: nowIso,
      })),
      ...(Object.keys(RECOVERY_TEXT_DEFAULTS) as RecoveryTextKey[]).map((k) => ({
        key: k,
        value: texts[k].trim(),
        updated_at: nowIso,
      })),
    ];

    const { error } = await supabase
      .from("comms_settings")
      .upsert(rows, { onConflict: "key" });

    setSaving(false);
    if (error) {
      setStatus({ kind: "err", msg: error.message });
    } else {
      setStatus({ kind: "ok", msg: "Saved." });
    }
    setTimeout(() => setStatus(null), 4000);
  };

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  const Toggle = ({
    label, sub, k,
  }: { label: string; sub: string; k: RecoveryToggleKey }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white">
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={toggles[k]}
        onClick={() => setToggles((p) => ({ ...p, [k]: !p[k] }))}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
          toggles[k] ? "bg-[#3b6ea5]" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            toggles[k] ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );

  const NumField = ({
    label, suffix, k,
  }: { label: string; suffix: string; k: RecoveryNumKey }) => (
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-white">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          value={nums[k]}
          onChange={(e) => setNums((p) => ({ ...p, [k]: e.target.value }))}
          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md text-right focus:outline-none focus:border-[#3b6ea5]"
        />
        <span className="text-[11px] text-gray-500 w-12">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Active-stage banner — reflects the live backend (5min email + 5min SMS, 24h + 3day email) */}
      <div className="px-3 py-2.5 rounded-md border border-emerald-200 bg-emerald-50">
        <p className="text-[12px] text-emerald-900 leading-relaxed">
          <strong>Active recovery sequence:</strong> 5-minute email + one 5-minute SMS,
          then 24-hour and 3-day email follow-ups. The SMS sends only once and stops if
          the order is paid, cancelled, refunded, opted out, or already contacted.
        </p>
      </div>

      <div className="text-xs text-gray-600">
        Controls the automated email recovery sequence for unpaid leads.
        Stop conditions (paid, unsubscribe) are enforced regardless of these settings.
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Master Toggles</p>
        <Toggle label="Recovery Sequence Enabled" sub="Master switch — turns the entire automated sequence on or off" k="recovery_enabled" />
        <Toggle label="Email Recovery Enabled"    sub="Controls the email stages (5-minute, 24-hour, 3-day)"          k="recovery_email_enabled" />
        <Toggle label="SMS Recovery Enabled"      sub="Controls ONLY the one-time 5-minute recovery SMS. Off = no auto SMS; the email sequence and manual Order → Comms SMS are unaffected." k="recovery_sms_enabled" />
      </div>

      {/* Email stages */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Stage Timings</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NumField label="5-minute follow-up" suffix="minutes" k="recovery_stage_1_minutes" />
          <NumField label="24-hour follow-up"  suffix="hours"   k="recovery_stage_2_hours" />
          <NumField label="3-day follow-up"    suffix="days"    k="recovery_stage_4_days" />
        </div>
      </div>

      {/* SMS recovery (5-minute) — the one-time automatic SMS */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">SMS Recovery (5-minute)</p>
        <div className="px-3 py-3 rounded-lg border border-gray-200 bg-white space-y-2.5">
          <div>
            <label className="text-xs font-semibold text-gray-700">5-minute SMS template</label>
            <textarea
              rows={3}
              value={texts.recovery_sms_5min_template}
              onChange={(e) => setTexts((p) => ({ ...p, recovery_sms_5min_template: e.target.value }))}
              className="mt-1 w-full px-2.5 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-[#3b6ea5] font-mono leading-relaxed"
              placeholder={RECOVERY_TEXT_DEFAULTS.recovery_sms_5min_template}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-gray-700">Promo code</label>
            <input
              type="text"
              value={texts.recovery_sms_promo_code}
              onChange={(e) => setTexts((p) => ({ ...p, recovery_sms_promo_code: e.target.value.trim() }))}
              className="w-32 px-2 py-1 text-xs border border-gray-300 rounded-md text-right focus:outline-none focus:border-[#3b6ea5] uppercase"
              placeholder="PAW20"
            />
          </div>
          <div className="rounded-md bg-gray-50 border border-gray-100 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-gray-600 mb-1">Merge tags</p>
            <ul className="text-[11px] text-gray-500 space-y-0.5">
              <li><code className="text-gray-700">{"{name}"}</code> / <code className="text-gray-700">{"{first_name}"}</code> — lead's first name (falls back to “there”)</li>
              <li><code className="text-gray-700">{"{petname}"}</code> — pet name (falls back to “your pet”)</li>
              <li><code className="text-gray-700">{"{resume_url}"}</code> — secure resume link (the promo is auto-appended)</li>
              <li><code className="text-gray-700">{"{promo_code}"}</code> — defaults to <span className="font-semibold text-gray-700">PAW20</span></li>
            </ul>
            <p className="text-[10px] text-gray-400 mt-1.5">One SMS only, sent ~5 minutes after an unpaid lead with a phone number is created. Never re-sent.</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-[#3b6ea5] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {status && (
          <span className={`text-xs font-semibold ${status.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
            {status.kind === "ok" ? "✓ " : "⚠ "}{status.msg}
          </span>
        )}
      </div>

      {/* Future improvement marker — referenced by SETTINGS-IA-CLEANUP-GROUPED-SECTIONS */}
      <div className="mt-3 px-3 py-2 rounded-md border border-dashed border-gray-300 bg-gray-50">
        <p className="text-[11px] text-gray-500">
          <strong className="text-gray-600">Planned (not yet wired):</strong> additional email stages
          (48-hour, 5-day). By design there is only ONE automatic SMS (the 5-minute stage above) — no
          24-hour, 3-day, or repeating SMS.
        </p>
      </div>
    </div>
  );
}

// Slugs that are actively consumed by Edge Functions for automatic / button-driven sends.
// Anything NOT in this set is admin-editable but currently lives only as a preset
// (not wired to any automatic transactional flow yet).
//
// IMPORTANT — keep in sync with the backend reality. Membership in this set
// means an Edge Function reads the row by `slug` directly (not via the
// comms_settings active-pointer). Editing a template whose slug is here
// changes the live send the next time the function fires. Templates whose
// id is bound to an automation slot via comms_settings.seq_template_<slot>
// are handled separately via AUTOMATION_SLOTS below.
const WIRED_EMAIL_SLUGS = new Set<string>([
  "review_request",
  "checkout_recovery",
  "checkout_recovery_discount",
  "seq_30min",
  "seq_24h",
  "seq_3day",
  // EMAIL-LETTER-DELIVERY-TEMPLATE-HUB (2026-05-19): notify-patient-letter
  // now reads from email_templates.slug='letter_delivery' and falls back
  // to the hardcoded layout when missing. Admin edits go live.
  "letter_delivery",
]);
const WIRED_SMS_SLUGS = new Set<string>([
  "review_request_sms",
]);

// COMMS-TEMPLATE-HUB-ACTIVE-SLOTS 2026-05-23 — automation-slot registry.
// Each slot maps to a comms_settings key (`seq_template_<id>`) whose value
// is the email_templates.id of the Active template for that slot.
//
// `wired` is the SOURCE OF TRUTH for the UI badge: when true, a live Edge
// Function consults the pointer at send time (lead-followup-sequence does
// this after migration 20260523120000) — those templates render the green
// "Active" badge. When false, the pointer can still be set by the admin,
// but no sender consults it yet — those templates render "Prepared"
// (violet). Flipping a slot to `wired: true` is intentionally a code
// change so we never accidentally claim a flow is live when it isn't.
interface AutomationSlot {
  id:                  string;  // pointer key suffix
  pointerKey:          string;  // `seq_template_<id>`
  label:               string;  // human-readable slot name
  group:               string;  // matches the EmailTemplate.group of compatible templates
  defaultTemplateSlug: string;  // slug used when no pointer / pointer invalid
  channel:             "email" | "sms";
  wired:               boolean;
}

const AUTOMATION_SLOTS: AutomationSlot[] = [
  // Wired today via lead-followup-sequence/core.ts → loadSeqTemplate(pointer).
  { id: "30min",                       pointerKey: "seq_template_30min",                       label: "30-Min Sequence",              group: "Sequence",      defaultTemplateSlug: "seq_30min",                  channel: "email", wired: true  },
  { id: "24h",                         pointerKey: "seq_template_24h",                         label: "24-Hour Sequence",             group: "Sequence",      defaultTemplateSlug: "seq_24h",                    channel: "email", wired: true  },
  { id: "3day",                        pointerKey: "seq_template_3day",                        label: "3-Day Sequence + Discount",    group: "Sequence",      defaultTemplateSlug: "seq_3day",                   channel: "email", wired: true  },
  // Pointer rows exist via migration 20260523120000 but no sender consults
  // them yet — admin can mark Active, but automation will NOT fire it.
  { id: "48h",                         pointerKey: "seq_template_48h",                         label: "48-Hour Sequence + Discount",  group: "Sequence",      defaultTemplateSlug: "seq_48h",                    channel: "email", wired: false },
  { id: "5day",                        pointerKey: "seq_template_5day",                        label: "5-Day Sequence + Final Offer", group: "Sequence",      defaultTemplateSlug: "seq_5day",                   channel: "email", wired: false },
  { id: "checkout_recovery",           pointerKey: "seq_template_checkout_recovery",           label: "Checkout Recovery",            group: "Lead Recovery", defaultTemplateSlug: "checkout_recovery",          channel: "email", wired: false },
  { id: "checkout_recovery_discount",  pointerKey: "seq_template_checkout_recovery_discount",  label: "Checkout Recovery + Discount", group: "Lead Recovery", defaultTemplateSlug: "checkout_recovery_discount", channel: "email", wired: false },
  { id: "consultation_offer",          pointerKey: "seq_template_consultation_offer",          label: "Consultation Window Offer",    group: "Lead Recovery", defaultTemplateSlug: "",                           channel: "email", wired: false },
];

// COMMS-TEMPLATE-HUB-RESIZABLE-SIDEBAR (2026-05-19): horizontal drag-to-
// resize bounds for the template-picker sidebar. Below SIDEBAR_MOBILE_BP
// the layout stacks vertically and the drag handle is hidden.
const SIDEBAR_MIN_PX        = 220;
const SIDEBAR_MAX_PX        = 420;
const SIDEBAR_DEFAULT_PX    = 240;
const SIDEBAR_MOBILE_BP     = 768; // matches Tailwind md:
const SIDEBAR_STORAGE_KEY   = "comms_templates_sidebar_width";

function readPersistedSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_PX;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_PX;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_PX;
    return Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, n));
  } catch {
    return SIDEBAR_DEFAULT_PX;
  }
}

export default function CommunicationsTemplatesPanel() {
  const [activeChannel, setActiveChannel] = useState<"email" | "sms">("email");
  // Email state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedEmailId, setSelectedEmailId] = useState(DEFAULT_TEMPLATES[0].id);
  // SMS state
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>(DEFAULT_SMS_TEMPLATES);
  const [selectedSmsId, setSelectedSmsId] = useState(DEFAULT_SMS_TEMPLATES[0].id);
  // Shared state
  const [previewName, setPreviewName] = useState("Jane");
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("Marketing");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [dbLoaded, setDbLoaded] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Test send state
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sent" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [testCooldown, setTestCooldown] = useState(0);

  // COMMS-TEMPLATE-HUB-ACTIVE-SLOTS 2026-05-23 — comms_settings.seq_template_*
  // pointer rows hydrate once on mount. Map<pointerKey, templateId|null>.
  // Updated optimistically when admin assigns / clears a slot. Save handler
  // upserts the value into comms_settings.
  const [slotPointers, setSlotPointers] = useState<Record<string, string | null>>({});
  const [slotSaving, setSlotSaving]     = useState<string | null>(null);
  const [slotStatus, setSlotStatus]     = useState<{ key: string; kind: "ok" | "err"; msg: string } | null>(null);

  // COMMS-TEMPLATE-HUB-RESIZABLE-SIDEBAR (2026-05-19) ────────────────────
  // Sidebar width is admin-resizable on desktop via a drag handle. Width
  // persists in localStorage. Below SIDEBAR_MOBILE_BP the layout stacks
  // vertically and the inline width is ignored (Tailwind w-full applies).
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_PX);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const sidebarStartXRef = useRef<number>(0);
  const sidebarStartWidthRef = useRef<number>(SIDEBAR_DEFAULT_PX);
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    setSidebarWidth(readPersistedSidebarWidth());
  }, []);

  // Persist on change (debounced — every change is fine, write is cheap).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth)); } catch { /* ignore */ }
  }, [sidebarWidth]);

  // Mouse move + up listeners are attached on document while dragging so
  // the drag survives the cursor briefly leaving the handle hit-target.
  useEffect(() => {
    if (!isDraggingSidebar) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      if (w < SIDEBAR_MOBILE_BP) {
        setIsDraggingSidebar(false);
        return;
      }
      const delta = e.clientX - sidebarStartXRef.current;
      const next = Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, sidebarStartWidthRef.current + delta));
      setSidebarWidth(next);
    };
    const onUp = () => setIsDraggingSidebar(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // Lock body cursor + disable user-select for crisp drag UX.
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDraggingSidebar]);

  const beginSidebarDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== "undefined" && window.innerWidth < SIDEBAR_MOBILE_BP) return;
    sidebarStartXRef.current = e.clientX;
    sidebarStartWidthRef.current = sidebarWidth;
    setIsDraggingSidebar(true);
    e.preventDefault();
  };

  const resetSidebarWidth = () => setSidebarWidth(SIDEBAR_DEFAULT_PX);

  // Tick cooldown down each second; reset status to idle when it hits 0
  useEffect(() => {
    if (testCooldown <= 0) return;
    const t = setTimeout(() => {
      setTestCooldown((c) => {
        if (c <= 1) { setTestStatus("idle"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [testCooldown]);

  // Load all templates from DB on mount, split by channel
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at");
      if (!error && data && data.length > 0) {
        const emailRows = data.filter((r) => !r.channel || r.channel === "email");
        const smsRows   = data.filter((r) => r.channel === "sms");
        if (emailRows.length > 0) {
          const mapped: EmailTemplate[] = emailRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            subject: r.subject as string, body: r.body as string,
            ctaLabel: r.cta_label as string, ctaUrl: r.cta_url as string,
          }));
          setEmailTemplates(mapped);
          setSelectedEmailId(mapped[0].id);
        }
        if (smsRows.length > 0) {
          const mapped: SmsTemplate[] = smsRows.map((r) => ({
            id: r.id as string, label: r.label as string, group: r.group as string,
            body: r.body as string,
          }));
          setSmsTemplates(mapped);
          setSelectedSmsId(mapped[0].id);
        }
      }
      setDbLoaded(true);
    };
    load();
  }, []);

  // COMMS-TEMPLATE-HUB-ACTIVE-SLOTS 2026-05-23 — hydrate the
  // comms_settings.seq_template_* pointer rows so the Active / Prepared
  // badges and the Slot Assignment selector render the current state.
  useEffect(() => {
    const keys = AUTOMATION_SLOTS.map((s) => s.pointerKey);
    if (keys.length === 0) return;
    let cancelled = false;
    supabase
      .from("comms_settings")
      .select("key, value")
      .in("key", keys)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) return;
        const next: Record<string, string | null> = {};
        for (const row of data as Array<{ key: string; value: string | null }>) {
          next[row.key] = (row.value ?? null);
        }
        setSlotPointers((prev) => ({ ...prev, ...next }));
      });
    return () => { cancelled = true; };
  }, []);

  // Persist a single pointer change to comms_settings. NULL value = clear.
  // Falls back to slug-based loading in lead-followup-sequence/core.ts.
  const setSlotActiveTemplate = async (pointerKey: string, templateId: string | null) => {
    setSlotSaving(pointerKey);
    setSlotStatus(null);
    // Optimistic local update so the badge flips immediately.
    setSlotPointers((prev) => ({ ...prev, [pointerKey]: templateId }));
    try {
      const { error } = await supabase
        .from("comms_settings")
        .upsert(
          { key: pointerKey, value: templateId, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw error;
      setSlotStatus({ key: pointerKey, kind: "ok", msg: templateId ? "Saved" : "Cleared" });
    } catch (err) {
      setSlotStatus({ key: pointerKey, kind: "err", msg: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSlotSaving(null);
      window.setTimeout(() => setSlotStatus((s) => (s && s.key === pointerKey ? null : s)), 2500);
    }
  };

  // Resolve the badge a single template should render. Active wins over
  // Prepared wins over Wired. No badge = the template is Saved-only (the
  // implicit default for every loaded row).
  type SlotBadgeKind = "active" | "prepared" | "wired";
  interface SlotBadge {
    kind:    SlotBadgeKind;
    label:   string;
    tooltip: string;
    chip:    string; // tailwind classes for the chip itself
    dot:     string; // tailwind classes for the leading dot
  }
  const badgeForTemplate = (templateId: string, channel: "email" | "sms"): SlotBadge | null => {
    // 1. Active / Prepared via slot pointer
    const slot = AUTOMATION_SLOTS.find(
      (s) => s.channel === channel && slotPointers[s.pointerKey] === templateId
    );
    if (slot) {
      if (slot.wired) {
        return {
          kind:    "active",
          label:   "Active",
          tooltip: `Active template for ${slot.label}. Automation uses this template at send time. Only one template can be Active per slot.`,
          chip:    "bg-emerald-100 text-emerald-700",
          dot:     "bg-emerald-600",
        };
      }
      return {
        kind:    "prepared",
        label:   "Prepared",
        tooltip: `Pre-selected as the Active template for ${slot.label}. Automation does NOT consult this slot yet — once the sender is wired in a follow-up commit, this template will be used.`,
        chip:    "bg-violet-100 text-violet-700",
        dot:     "bg-violet-600",
      };
    }
    // 2. Wired (slug-based) — Edge Function reads the row by slug directly.
    if ((channel === "email" && WIRED_EMAIL_SLUGS.has(templateId)) ||
        (channel === "sms"   && WIRED_SMS_SLUGS.has(templateId))) {
      return {
        kind:    "wired",
        label:   "Wired",
        tooltip: "A live Edge Function reads this template by slug. Edits go live immediately on the next send.",
        chip:    "bg-amber-100 text-amber-700",
        dot:     "bg-amber-600",
      };
    }
    return null;
  };

  const saveAllToDb = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      // COMMS-TEMPLATE-HUB-AUTO-SLUG 2026-05-23 — every row gets slug=id on
      // save so that new admin-created custom templates show up in the
      // OrderDetail → Communications tab picker (which loads templates
      // where slug IS NOT NULL). For seeded rows id and slug already
      // match, so this upsert is idempotent. No admin action is needed
      // and no slug-aware Edge Function changes behaviour (the wired
      // slugs are the ones admins do not edit by hand).
      const emailRows = emailTemplates.map((t) => ({
        id: t.id, slug: t.id, label: t.label, group: t.group, subject: t.subject,
        body: t.body, cta_label: t.ctaLabel, cta_url: t.ctaUrl,
        channel: "email", updated_at: new Date().toISOString(),
      }));
      const smsRows = smsTemplates.map((t) => ({
        id: t.id, slug: t.id, label: t.label, group: t.group, subject: "",
        body: t.body, cta_label: "", cta_url: "",
        channel: "sms", updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("email_templates")
        .upsert([...emailRows, ...smsRows], { onConflict: "id" });
      // Delete orphaned email rows
      const emailIds = emailTemplates.map((t) => `"${t.id}"`).join(",");
      if (emailIds) await supabase.from("email_templates").delete().eq("channel", "email").not("id", "in", `(${emailIds})`);
      // Delete orphaned SMS rows
      const smsIds = smsTemplates.map((t) => `"${t.id}"`).join(",");
      if (smsIds) await supabase.from("email_templates").delete().eq("channel", "sms").not("id", "in", `(${smsIds})`);
      if (error) throw error;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } finally {
      setSaving(false);
    }
  };

  const selectedEmail = emailTemplates.find((t) => t.id === selectedEmailId) ?? emailTemplates[0];
  const emailGroups = [...new Set(emailTemplates.map((t) => t.group))];
  const updateEmailField = (field: keyof EmailTemplate, value: string) =>
    setEmailTemplates((prev) => prev.map((t) => t.id === selectedEmailId ? { ...t, [field]: value } : t));
  const deleteEmailTemplate = (id: string) => {
    const rem = emailTemplates.filter((t) => t.id !== id);
    setEmailTemplates(rem);
    if (selectedEmailId === id) setSelectedEmailId(rem[0]?.id ?? "");
  };

  const selectedSms = smsTemplates.find((t) => t.id === selectedSmsId) ?? smsTemplates[0];
  const smsGroups = [...new Set(smsTemplates.map((t) => t.group))];
  const updateSmsField = (field: keyof SmsTemplate, value: string) =>
    setSmsTemplates((prev) => prev.map((t) => t.id === selectedSmsId ? { ...t, [field]: value } : t));
  const deleteSmsTemplate = (id: string) => {
    const rem = smsTemplates.filter((t) => t.id !== id);
    setSmsTemplates(rem);
    if (selectedSmsId === id) setSelectedSmsId(rem[0]?.id ?? "");
  };

  const html = useMemo(
    () => buildEmailHtml(selectedEmail.subject, selectedEmail.body, selectedEmail.ctaLabel, selectedEmail.ctaUrl, previewName),
    [selectedEmail, previewName]
  );

  const addTemplate = () => {
    if (!newLabel.trim()) return;
    const id = `custom_${Date.now()}`;
    if (activeChannel === "email") {
      setEmailTemplates((prev) => [...prev, { ...NEW_TEMPLATE_DEFAULTS, id, label: newLabel.trim(), group: newGroup }]);
      setSelectedEmailId(id);
    } else {
      setSmsTemplates((prev) => [...prev, { id, label: newLabel.trim(), group: newGroup, body: "Hi {name}," }]);
      setSelectedSmsId(id);
    }
    setAddingNew(false);
    setNewLabel("");
    setEditMode(true);
  };

  // COMMS-TEMPLATE-HUB-CLONE 2026-05-24 — Duplicate an existing template
  // into a new editable row. The clone keeps the original group (so a
  // Sequence template's clone lands in Sequence and is immediately
  // eligible for slot assignment) and inherits subject / body / CTA, but
  // gets a fresh id/slug so saveAllToDb does not collide. The clone is
  // explicitly NOT assigned to any automation slot — admins must
  // promote it to Active via the Slot Assignment selector.
  const duplicateEmailTemplate = (id: string) => {
    const src = emailTemplates.find((t) => t.id === id);
    if (!src) return;
    const newId = `custom_${Date.now()}`;
    setEmailTemplates((prev) => [
      ...prev,
      {
        ...src,
        id: newId,
        label: `${src.label} (Copy)`,
      },
    ]);
    setSelectedEmailId(newId);
    setEditMode(true);
  };
  const duplicateSmsTemplate = (id: string) => {
    const src = smsTemplates.find((t) => t.id === id);
    if (!src) return;
    const newId = `custom_${Date.now()}`;
    setSmsTemplates((prev) => [
      ...prev,
      {
        ...src,
        id: newId,
        label: `${src.label} (Copy)`,
      },
    ]);
    setSelectedSmsId(newId);
    setEditMode(true);
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendTest = async () => {
    const email = testEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setTestError("Enter a valid email address");
      setTestStatus("error");
      return;
    }
    setTestSending(true);
    setTestStatus("idle");
    setTestError("");
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/send-template-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: email,
          subject: selectedEmail.subject,
          html,
          template_id: selectedEmail.id,
          template_label: selectedEmail.label,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setTestStatus("sent");
      setTestCooldown(10);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Unknown error");
      setTestStatus("error");
      setTimeout(() => setTestStatus("idle"), 6000);
    } finally {
      setTestSending(false);
    }
  };

  const resetToDefaults = async () => {
    setEmailTemplates(DEFAULT_TEMPLATES);
    setSelectedEmailId(DEFAULT_TEMPLATES[0].id);
    setSmsTemplates(DEFAULT_SMS_TEMPLATES);
    setSelectedSmsId(DEFAULT_SMS_TEMPLATES[0].id);
    setEditMode(false);
    setShowResetConfirm(false);
    setSaving(true);
    try { await supabase.from("email_templates").delete().neq("id", "__never__"); } catch { /* ignore */ }
    setSaving(false);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2500);
  };

  const totalCount = emailTemplates.length + smsTemplates.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header — COMMS-TEMPLATE-HUB-UI 2026-05-23 overlap fix. The
          title block and action toolbar are both flex children of a
          flex-wrap row. Without min-w-0 + flex-1 on the title block,
          the long subtitle could not shrink and collided with the
          action toolbar at mid-tablet widths. The toolbar is now
          flex-shrink-0 so its buttons never compress, and the title
          subtitle truncates cleanly instead of overlapping. */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
            <i className="ri-message-2-line text-[#3b6ea5] text-lg"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-gray-900 truncate">Communications Templates Hub</h3>
            <p className="text-xs text-gray-400 truncate" title="Edit DB-managed templates here. Some transactional emails still use legacy hardcoded templates until migrated.">
              Edit DB-managed templates here. Some transactional emails still use legacy hardcoded templates until migrated.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <button type="button" onClick={() => { setAddingNew(true); setEditMode(false); }}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e8f0f9] text-[#3b6ea5] hover:bg-[#b8cce4] transition-colors cursor-pointer">
            <i className="ri-add-line"></i> Add Template
          </button>
          <button type="button" onClick={() => setEditMode((v) => !v)}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${editMode ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <i className={editMode ? "ri-eye-line" : "ri-edit-line"}></i>
            {editMode ? "Preview Mode" : "Edit Mode"}
          </button>
          <button type="button" onClick={() => setShowResetConfirm(true)}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer">
            <i className="ri-refresh-line"></i> Reset Defaults
          </button>
          <button type="button" onClick={saveAllToDb} disabled={saving || !dbLoaded}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
              saveStatus === "saved" ? "bg-green-100 text-green-700" :
              saveStatus === "error" ? "bg-red-100 text-red-600" :
              "bg-gray-900 text-white hover:bg-gray-700"
            }`}>
            {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
              : saveStatus === "saved" ? <><i className="ri-checkbox-circle-line"></i>Saved to DB</>
              : saveStatus === "error" ? <><i className="ri-error-warning-line"></i>Save Failed</>
              : <><i className="ri-save-line"></i>Save to DB</>}
          </button>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#e8f0f9] text-[#3b6ea5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b6ea5] flex-shrink-0"></span>
            {totalCount} templates
          </span>
        </div>
      </div>

      {/* Channel switcher */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button type="button"
            onClick={() => { setActiveChannel("email"); setEditMode(false); setAddingNew(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeChannel === "email" ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <i className="ri-mail-line text-sm"></i> Email
            <span className="ml-1 px-1.5 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">{emailTemplates.length}</span>
          </button>
          <button type="button"
            onClick={() => { setActiveChannel("sms"); setEditMode(false); setAddingNew(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeChannel === "sms" ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <i className="ri-message-3-line text-sm"></i> SMS
            <span className="ml-1 px-1.5 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] rounded-full text-[10px] font-bold">{smsTemplates.length}</span>
          </button>
        </div>
        {activeChannel === "sms" && (
          <p className="text-[10px] text-gray-400">Placeholders: <span className="font-mono bg-gray-100 px-1 rounded">&#123;name&#125;</span> = first name &nbsp; <span className="font-mono bg-gray-100 px-1 rounded">&#123;order_id&#125;</span> = confirmation ID</p>
        )}
      </div>

      {/* DB-managed status notice */}
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2.5">
        <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
        <div className="text-[11px] text-amber-800 leading-relaxed">
          <p className="font-semibold mb-0.5">Not every send uses these templates yet.</p>
          <p>
            Templates marked <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] align-middle"><span className="w-1 h-1 rounded-full bg-emerald-600"></span>Active DB</span> are wired to Edge Functions and edits go live immediately.
            Other rows are admin-editable presets and may not yet drive an automatic flow.
            Order confirmation, payment receipt, status emails, and most provider notifications still use legacy hardcoded templates &mdash; see <span className="font-mono">AI/email-system-audit.md</span> for the full mapping.
          </p>
        </div>
      </div>

      {/* Add new template bar */}
      {addingNew && (
        <div className="px-5 py-3 bg-[#e8f0f9] border-b border-[#b8cce4] flex items-center gap-3 flex-wrap">
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Template name..." autoFocus
            className="px-3 py-1.5 border border-[#b8cce4] rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white w-48" />
          {/* COMMS-TEMPLATE-HUB-CREATE-GROUPS 2026-05-24: Sequence + Lead
              Recovery groups added to the email create dropdown so admins
              can build new automation-eligible templates. The Automation
              Slot selector inside the editor filters slot options by the
              template's group, so picking Sequence here unlocks the
              30-Min / 24-Hour / 3-Day / 48-Hour / 5-Day slots, and
              picking Lead Recovery unlocks Checkout Recovery / Checkout
              Recovery + Discount / Consultation Window Offer. */}
          <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
            className="px-3 py-1.5 border border-[#b8cce4] rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
            {activeChannel === "email"
              ? <><option>Sequence</option><option>Lead Recovery</option><option>Transactional</option><option>Marketing</option><option>Broadcast</option></>
              : <><option>Transactional</option><option>Lead Recovery</option><option>General</option></>}
          </select>
          <button type="button" onClick={addTemplate} className="whitespace-nowrap px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">Create</button>
          <button type="button" onClick={() => setAddingNew(false)} className="whitespace-nowrap px-3 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
        </div>
      )}

      {/* ── EMAIL CHANNEL ── */}
      {activeChannel === "email" && (
        <div ref={sidebarWrapperRef} className="flex flex-col md:flex-row" style={{ minHeight: "560px" }}>
          {/* Left: template picker.
              COMMS-TEMPLATE-HUB-UI (2026-05-19): md: breakpoint so the
              sidebar collapses to row layout below tablet.
              COMMS-TEMPLATE-HUB-RESIZABLE-SIDEBAR (2026-05-19): inline
              width is admin-resizable above md (drag handle to the
              right of this column). Below md the Tailwind w-full wins
              over the inline width because Tailwind compiles to a
              !important-less class while inline style only applies
              above the breakpoint via the conditional below. */}
          <div
            className="w-full flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50 p-4 space-y-4 max-h-[640px] md:max-h-none overflow-y-auto md:overflow-visible"
            style={
              typeof window !== "undefined" && window.innerWidth >= SIDEBAR_MOBILE_BP
                ? { width: `${sidebarWidth}px` }
                : undefined
            }
          >
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Preview As</label>
              <input type="text" value={previewName} onChange={(e) => setPreviewName(e.target.value || "Jane")} placeholder="Jane"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
              <p className="text-[10px] text-gray-400 mt-1">Replaces &#123;name&#125; in preview</p>
            </div>
            <div className="space-y-3">
              {emailGroups.map((grp) => (
                <div key={grp}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <i className={`text-xs ${grp === "Transactional" ? "ri-mail-check-line text-[#3b6ea5]" : grp === "Marketing" ? "ri-megaphone-line text-amber-500" : "ri-broadcast-line text-violet-500"}`}></i>
                    {grp}
                  </p>
                  <div className="space-y-1">
                    {emailTemplates.filter((t) => t.group === grp).map((t) => {
                      const badge = badgeForTemplate(t.id, "email");
                      const isSelected = selectedEmailId === t.id;
                      return (
                      <div key={t.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedEmailId(t.id)}
                          title={t.label}
                          className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${isSelected ? "bg-[#3b6ea5] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                          <span className="flex items-center justify-between gap-1.5 min-w-0">
                            <span className="truncate min-w-0">{t.label}</span>
                            {badge && (
                              <span title={badge.tooltip}
                                className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isSelected ? "bg-white/20 text-white" : badge.chip}`}>
                                <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : badge.dot}`}></span>
                                {badge.label}
                              </span>
                            )}
                          </span>
                        </button>
                        {editMode && (
                          <>
                            <button type="button" onClick={() => duplicateEmailTemplate(t.id)} title="Duplicate / Clone"
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-[#3b6ea5] hover:bg-[#e8f0f9] transition-colors cursor-pointer flex-shrink-0">
                              <i className="ri-file-copy-2-line text-xs"></i>
                            </button>
                            <button type="button" onClick={() => deleteEmailTemplate(t.id)} title="Delete"
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0">
                              <i className="ri-delete-bin-line text-xs"></i>
                            </button>
                          </>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!editMode && (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button type="button" onClick={() => setShowRaw(false)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${!showRaw ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500"}`}>Preview</button>
                  <button type="button" onClick={() => setShowRaw(true)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${showRaw ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500"}`}>HTML</button>
                </div>
              </div>
            )}
          </div>
          {/* COMMS-TEMPLATE-HUB-RESIZABLE-SIDEBAR (2026-05-19): drag
              handle between sidebar and editor. Hidden below md so
              the stacked mobile layout is uncluttered.
              role="separator" + aria-orientation="vertical" + keyboard
              support keep the handle accessible. Double-click resets
              to the default width. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize template list"
            tabIndex={0}
            onMouseDown={beginSidebarDrag}
            onDoubleClick={resetSidebarWidth}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setSidebarWidth((w) => Math.max(SIDEBAR_MIN_PX, w - 16));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setSidebarWidth((w) => Math.min(SIDEBAR_MAX_PX, w + 16));
              } else if (e.key === "Home") {
                e.preventDefault();
                resetSidebarWidth();
              }
            }}
            className={`hidden md:flex flex-shrink-0 w-1.5 cursor-col-resize items-center justify-center group select-none ${isDraggingSidebar ? "bg-[#3b6ea5]/40" : "bg-transparent hover:bg-gray-200/70"}`}
            style={{ touchAction: "none" }}
            title="Drag to resize · double-click to reset"
          >
            <span className={`block w-0.5 h-10 rounded-full ${isDraggingSidebar ? "bg-[#3b6ea5]" : "bg-gray-300 group-hover:bg-gray-400"}`} />
          </div>
          {/* Right: edit or preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {editMode ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-[#3b6ea5] flex-shrink-0"></div>
                  {/* COMMS-TEMPLATE-HUB-UI (2026-05-19): truncate long
                      template labels so the group pill stays visible on
                      narrow viewports. */}
                  <span className="text-xs font-bold text-gray-700 truncate min-w-0" title={selectedEmail.label}>
                    Editing: {selectedEmail.label}
                  </span>
                  <span className={`ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEmail.group === "Transactional" ? "bg-[#e8f0f9] text-[#3b6ea5]" : selectedEmail.group === "Marketing" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>{selectedEmail.group}</span>
                </div>
                {/* COMMS-TEMPLATE-HUB-ACTIVE-SLOTS 2026-05-23: assign this
                    template to one automation slot so the recovery engine
                    uses it. Eligible slots are filtered to the template's
                    Group (Sequence templates → Sequence slots; Lead
                    Recovery templates → Lead Recovery slots). Picking
                    a slot upserts comms_settings.seq_template_<slot> so
                    lead-followup-sequence reads the new id immediately
                    on its next run. "Prepared" slots also write the
                    pointer, but automation does not consult them yet —
                    flagged in the dropdown so admins can opt in safely. */}
                <SlotAssignmentRow
                  templateId={selectedEmail.id}
                  templateGroup={selectedEmail.group}
                  slotPointers={slotPointers}
                  saving={slotSaving}
                  status={slotStatus}
                  onChange={setSlotActiveTemplate}
                />
                {/* COMMS-TEMPLATE-HUB-MERGE-TAGS (2026-05-23): collapsible
                    legend documenting every placeholder the email pipeline
                    substitutes. Default collapsed so the editor stays
                    uncluttered; expanded once = sticky reference while
                    composing. Click any tag to copy it to the clipboard. */}
                <MergeTagLegend previewName={previewName} />
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Template Label</label>
                  <input type="text" value={selectedEmail.label} onChange={(e) => updateEmailField("label", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Group</label>
                  {/* COMMS-TEMPLATE-HUB-CREATE-GROUPS 2026-05-24: full
                      option set so an admin can move a template between
                      automation-eligible groups (Sequence / Lead
                      Recovery) and the non-automation groups
                      (Transactional / Marketing / Broadcast) after the
                      fact. */}
                  <select value={selectedEmail.group} onChange={(e) => updateEmailField("group", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                    <option>Sequence</option>
                    <option>Lead Recovery</option>
                    <option>Transactional</option>
                    <option>Marketing</option>
                    <option>Broadcast</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subject Line</label>
                  <input type="text" value={selectedEmail.subject} onChange={(e) => updateEmailField("subject", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                    Body <span className="normal-case font-normal text-gray-400">— use &#123;name&#125; for personalization, blank line = new paragraph</span>
                  </label>
                  <textarea value={selectedEmail.body} onChange={(e) => updateEmailField("body", e.target.value)}
                    rows={10} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white font-mono resize-y" />
                </div>
                {/* COMMS-TEMPLATE-HUB-UI 2026-05-23: CTA grid responds to
                    width — single column under 640px (no longer cramped on
                    narrow admin viewports / tablets), two columns above. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CTA Button Label</label>
                    <input type="text" value={selectedEmail.ctaLabel} onChange={(e) => updateEmailField("ctaLabel", e.target.value)}
                      placeholder="e.g. Track My Order"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CTA URL</label>
                    <input type="text" value={selectedEmail.ctaUrl} onChange={(e) => updateEmailField("ctaUrl", e.target.value)}
                      placeholder="https://pawtenant.com/…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                  </div>
                </div>
                {/* Live CTA button preview — COMMS-TEMPLATE-HUB-UI 2026-05-23.
                    Mirrors the inline-button HTML buildEmailHtml() emits so
                    admins see the chip without flipping to Preview Mode.
                    Empty label or URL collapses to a muted hint instead of
                    showing a broken button. The full email preview still
                    lives on the Preview Mode iframe and is the source of
                    truth for send-time rendering. */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CTA Button Preview</label>
                  <div className="border border-dashed border-gray-200 rounded-lg p-4 bg-gray-50/60 flex items-center justify-center min-h-[60px]">
                    {selectedEmail.ctaLabel.trim() && selectedEmail.ctaUrl.trim() ? (
                      <a
                        href={selectedEmail.ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-7 py-3 rounded-[10px] bg-[#3b6ea5] text-white text-[15px] font-bold hover:bg-[#2d5a8e] transition-colors no-underline"
                        title={`Opens ${selectedEmail.ctaUrl} in a new tab. Admins only — not the customer email link.`}
                      >
                        {selectedEmail.ctaLabel}
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-400 italic">
                        Add a label and URL above to render the email button.
                      </span>
                    )}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setEditMode(false)}
                    className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">
                    <i className="ri-eye-line"></i> Preview Result
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/30 flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">Subject:</span>
                  <span className="text-xs font-semibold text-gray-800 truncate flex-1">{selectedEmail.subject}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={copyHtml}
                      className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer">
                      <i className={copied ? "ri-check-line text-green-500" : "ri-clipboard-line"}></i>
                      {copied ? "Copied!" : "Copy HTML"}
                    </button>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedEmail.group === "Transactional" ? "bg-[#e8f0f9] text-[#3b6ea5]" : selectedEmail.group === "Marketing" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>{selectedEmail.group}</span>
                  </div>
                </div>
                <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                  <i className="ri-information-line text-amber-500 text-xs flex-shrink-0"></i>
                  <p className="text-[11px] text-amber-700 font-semibold">
                    Preview only — &#123;name&#125; replaced with &ldquo;{previewName}&rdquo; &middot; No email is sent
                  </p>
                </div>

                {/* ── Test Send ──
                    COMMS-TEMPLATE-HUB-UI (2026-05-19): stacked vertically
                    on mobile so the input + button + status no longer
                    cram into a single row on narrow viewports. */}
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/40 flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-wrap">
                  <i className="ri-send-plane-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">Test Send</span>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => { setTestEmail(e.target.value); setTestStatus("idle"); setTestError(""); }}
                    placeholder="admin@example.com"
                    className="flex-1 min-w-0 max-w-[220px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={testSending || !testEmail.trim() || testCooldown > 0}
                    className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                      testStatus === "sent" ? "bg-green-100 text-green-700" :
                      testStatus === "error" ? "bg-red-100 text-red-600" :
                      "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"
                    }`}
                  >
                    {testSending
                      ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                      : testStatus === "sent"
                        ? <><i className="ri-checkbox-circle-line"></i>Sent!</>
                        : testStatus === "error"
                          ? <><i className="ri-error-warning-line"></i>Failed</>
                          : <><i className="ri-send-plane-line"></i>Send Test</>}
                  </button>
                  {testStatus === "error" && testError && (
                    <span className="text-[10px] text-red-500 font-semibold truncate max-w-[200px]">{testError}</span>
                  )}
                  {testStatus === "sent" && (
                    <span className="text-[10px] text-green-600 font-semibold">
                      Sent.{testCooldown > 0 ? ` You can send again in ${testCooldown}s` : ""}
                    </span>
                  )}
                </div>

                {showRaw ? (
                  <div className="flex-1 overflow-auto bg-gray-900 p-4">
                    <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{html}</pre>
                  </div>
                ) : (
                  <div className="flex-1 bg-[#f3f4f6]" style={{ minHeight: "420px" }}>
                    <iframe srcDoc={html} title={`Email Preview: ${selectedEmail.label}`}
                      className="w-full h-full border-0" style={{ minHeight: "420px" }} sandbox="allow-same-origin" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SMS CHANNEL ── */}
      {activeChannel === "sms" && (
        <div className="flex flex-col lg:flex-row" style={{ minHeight: "480px" }}>
          {/* Left: SMS template list */}
          <div className="w-full lg:w-60 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/50 p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Preview Name</label>
              <input type="text" value={previewName} onChange={(e) => setPreviewName(e.target.value || "Jane")} placeholder="Jane"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
            </div>
            <div className="space-y-3">
              {smsGroups.map((grp) => (
                <div key={grp}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <i className={`text-xs ${grp === "Transactional" ? "ri-mail-check-line text-[#3b6ea5]" : grp === "Lead Recovery" ? "ri-user-follow-line text-orange-500" : "ri-chat-3-line text-gray-500"}`}></i>
                    {grp}
                  </p>
                  <div className="space-y-1">
                    {smsTemplates.filter((t) => t.group === grp).map((t) => {
                      const badge = badgeForTemplate(t.id, "sms");
                      const isSelected = selectedSmsId === t.id;
                      return (
                      <div key={t.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedSmsId(t.id)}
                          title={t.label}
                          className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${isSelected ? "bg-[#3b6ea5] text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                          <span className="flex items-center justify-between gap-1.5 min-w-0">
                            <span className="truncate min-w-0">{t.label}</span>
                            {badge && (
                              <span title={badge.tooltip}
                                className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isSelected ? "bg-white/20 text-white" : badge.chip}`}>
                                <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : badge.dot}`}></span>
                                {badge.label}
                              </span>
                            )}
                          </span>
                        </button>
                        {editMode && (
                          <>
                            <button type="button" onClick={() => duplicateSmsTemplate(t.id)} title="Duplicate / Clone"
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-[#3b6ea5] hover:bg-[#e8f0f9] transition-colors cursor-pointer flex-shrink-0">
                              <i className="ri-file-copy-2-line text-xs"></i>
                            </button>
                            <button type="button" onClick={() => deleteSmsTemplate(t.id)} title="Delete"
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0">
                              <i className="ri-delete-bin-line text-xs"></i>
                            </button>
                          </>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Right: SMS edit/preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {editMode ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <i className="ri-message-3-line text-[#3b6ea5] text-sm"></i>
                  <span className="text-xs font-bold text-gray-700">Editing: {selectedSms?.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0f9] text-[#3b6ea5]">{selectedSms?.group}</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Template Label</label>
                  <input type="text" value={selectedSms?.label ?? ""} onChange={(e) => updateSmsField("label", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Group</label>
                  <select value={selectedSms?.group ?? "Transactional"} onChange={(e) => updateSmsField("group", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white cursor-pointer">
                    <option>Transactional</option><option>Lead Recovery</option><option>General</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Message Body <span className="normal-case font-normal">— &#123;name&#125; = first name, &#123;order_id&#125; = confirmation ID</span>
                    </label>
                    <span className={`text-[10px] font-bold ${(selectedSms?.body?.length ?? 0) > 280 ? "text-red-500" : "text-gray-400"}`}>
                      {selectedSms?.body?.length ?? 0}/320
                    </span>
                  </div>
                  <textarea value={selectedSms?.body ?? ""} onChange={(e) => updateSmsField("body", e.target.value.slice(0, 320))}
                    rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#3b6ea5] bg-white font-mono resize-y" />
                  <p className="text-[10px] text-gray-400 mt-1">160 chars = 1 SMS segment · 320 chars = 2 segments</p>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button type="button" onClick={() => setEditMode(false)}
                    className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] transition-colors cursor-pointer">
                    <i className="ri-eye-line"></i> Preview Result
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <i className="ri-message-3-line text-[#3b6ea5] text-sm"></i>
                  <span className="text-xs font-bold text-gray-700">{selectedSms?.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0f9] text-[#3b6ea5]">{selectedSms?.group}</span>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 flex items-center gap-2">
                  <i className="ri-information-line text-amber-500 text-xs flex-shrink-0"></i>
                  <p className="text-[11px] text-amber-700 font-semibold">Preview — &#123;name&#125; → &ldquo;{previewName}&rdquo; · &#123;order_id&#125; → PT-XXXX</p>
                </div>
                {selectedSms && (
                  <div className="max-w-xs">
                    <div className="bg-[#3b6ea5] text-white rounded-2xl rounded-br-sm px-4 py-3">
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-1.5">SMS Preview</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedSms.body.replace(/\{name\}/g, previewName).replace(/\{order_id\}/g, "PT-XXXX")}
                      </p>
                      <p className="text-[10px] text-white/50 mt-2 text-right">
                        {selectedSms.body.length} chars · {Math.ceil(selectedSms.body.length / 160) || 1} segment{selectedSms.body.length > 160 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reset to Defaults Confirmation Dialog ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowResetConfirm(false)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                <i className="ri-refresh-line text-red-500 text-base"></i>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Reset to Defaults?</h3>
                <p className="text-xs text-gray-400">This will overwrite all current templates</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                All <strong>{totalCount} current templates</strong> will be replaced with factory defaults. This also clears any saved DB versions.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="ri-error-warning-line text-amber-500 text-sm flex-shrink-0"></i>
                <p className="text-xs text-amber-700 font-semibold">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
              <button type="button" onClick={() => setShowResetConfirm(false)}
                className="whitespace-nowrap flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-white transition-colors">
                Cancel
              </button>
              <button type="button" onClick={resetToDefaults}
                className="whitespace-nowrap flex-1 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-red-600 transition-colors">
                Yes, Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
