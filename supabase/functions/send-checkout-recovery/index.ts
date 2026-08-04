import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logEmailComm } from "../_shared/logEmailComm.ts";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import { issueResumeLink } from "../_shared/resumeLink.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseLayout(badge: string, heading: string, subheading: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${HEADER_BG};padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">${heading}</h1>
          <p style="margin:0;font-size:14px;color:${HEADER_SUB};">${subheading}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">${body}</td>
      </tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function ctaButton(url: string, text: string, bgColor = "#f97316"): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td align="center">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:${bgColor};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${text} &rarr;</a>
    </td></tr>
  </table>`;
}

function buildDiscountBanner(discountCode: string, discountPercent: number, discountFixed: number): string {
  const savings = discountPercent > 0
    ? `${discountPercent}% OFF your order`
    : discountFixed > 0
      ? `$${discountFixed.toFixed(0)} OFF your order`
      : "Exclusive Discount Applied";

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
    <tr>
      <td style="background:linear-gradient(135deg,${ACCENT},#2d8b73);border-radius:12px;padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.1em;">Special Offer Just For You</p>
        <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#ffffff;">${escapeHtml(savings)}</p>
        <div style="display:inline-block;background:#ffffff;border-radius:8px;padding:10px 24px;margin-bottom:8px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Use promo code at checkout</p>
          <p style="margin:0;font-size:20px;font-weight:800;color:${ACCENT};letter-spacing:0.08em;">${escapeHtml(discountCode)}</p>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.65);">Applies automatically when you return &mdash; expires in 48 hours</p>
      </td>
    </tr>
  </table>`;
}

function buildRecoveryEmail(
  firstName: string,
  resumeLink: string,
  orderTotal: string,
  isPsd: boolean,
  discountCode?: string,
  discountPercent?: number,
  discountFixed?: number,
  customMessage?: string,
): string {
  const name = escapeHtml(firstName || "there");
  const hasDiscount = !!(discountCode && discountCode.trim());
  const letterLabel = isPsd ? "PSD Letter" : "ESA Letter";

  const psdBadge = isPsd
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr><td style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">
            <strong>&#128021; Psychiatric Service Dog (PSD) Letter</strong> — Your dog must perform specific trained tasks.
            PSD letters comply with the Americans with Disabilities Act (ADA) and provide full public access rights.
          </p>
        </td></tr>
      </table>`
    : "";

  const statusCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Application Status</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;">Assessment</td>
          <td style="padding:7px 0;font-size:13px;font-weight:600;color:#059669;">Saved &amp; Complete &#10003;</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#6b7280;">Payment</td>
          <td style="padding:7px 0;font-size:13px;font-weight:600;color:#d97706;">Awaiting Completion</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#6b7280;">Amount Due</td>
          <td style="padding:7px 0;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(orderTotal)}</td>
        </tr>
      </table>
    </td></tr>
  </table>`;

  const esaBenefits = [
    "Licensed mental health providers in your state",
    "Legally recognized under the Fair Housing Act",
    "Documents delivered within 24 hours (priority) or 2&ndash;3 days",
    "100% money-back guarantee if not approved",
  ];
  const psdBenefits = [
    "Licensed healthcare providers evaluate your PSD eligibility",
    "Full ADA public access rights for your psychiatric service dog",
    "Letter delivered within 24 hours (priority) or 2&ndash;3 days",
    "100% money-back guarantee if not approved",
  ];
  const benefits = isPsd ? psdBenefits : esaBenefits;

  const benefitsCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Why complete your ${escapeHtml(letterLabel)} application?</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${benefits.map((benefit) => `
        <tr>
          <td style="padding:7px 0;vertical-align:top;width:30px;">
            <div style="width:20px;height:20px;background:${ACCENT};border-radius:50%;text-align:center;line-height:20px;font-size:10px;font-weight:700;color:#fff;">&#10003;</div>
          </td>
          <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">${benefit}</td>
        </tr>`).join("")}
      </table>
    </td></tr>
  </table>`;

  const customMsgSection = customMessage && customMessage.trim()
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-left:4px solid ${ACCENT};border-radius:4px;margin-bottom:24px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;font-style:italic;">${escapeHtml(customMessage)}</p>
        </td></tr>
      </table>`
    : "";

  const heading = hasDiscount
    ? `Special Offer: Complete Your ${letterLabel}`
    : `Your ${letterLabel} is waiting!`;
  const subheading = hasDiscount
    ? `Exclusive discount inside — your assessment answers are saved`
    : `Your assessment answers have been saved — pick up where you left off`;

  // ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001: the customer link is a bare
  // stable /checkout/<slug> URL. A promo is NEVER appended to it. When a
  // discount applies the code is shown in the banner for the customer to enter,
  // or it is already saved server-side on the order.
  const resumeUrl = resumeLink;

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    ${hasDiscount
      ? `<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">We noticed you started a ${escapeHtml(letterLabel)} assessment but didn&rsquo;t complete checkout. We&rsquo;re offering you an exclusive discount to help you complete your letter today.</p>`
      : `<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">You started a ${escapeHtml(letterLabel)} assessment with PawTenant but didn&rsquo;t complete the checkout. Your assessment answers have been saved &mdash; you can pick up right where you left off without filling anything out again.</p>`
    }
    ${hasDiscount ? buildDiscountBanner(discountCode!, discountPercent ?? 0, discountFixed ?? 0) : ""}
    ${psdBadge}
    ${statusCard}
    ${customMsgSection}
    ${ctaButton(resumeUrl, hasDiscount ? "Claim My Discount &amp; Complete" : `Complete My ${escapeHtml(letterLabel)} Payment`, isPsd ? "#d97706" : (hasDiscount ? ACCENT : "#f97316"))}
    ${benefitsCard}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Have questions? Reply to this email or call us at <strong style="color:#374151;">(409) 965-5885</strong>. This link expires in 7 days.
    </p>`;

  return baseLayout(hasDiscount ? "Limited Time Offer" : "Incomplete Application", heading, subheading, body);
}

interface DbTemplate {
  subject: string;
  body: string;
  cta_label: string;
  cta_url: string;
}

async function loadTemplate(
  supabase: ReturnType<typeof createClient>,
  slug: string,
): Promise<DbTemplate | null> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject, body, cta_label, cta_url")
    .eq("slug", slug)
    .eq("channel", "email")
    .maybeSingle();
  if (error || !data) return null;
  return data as DbTemplate;
}

async function loadMasterLayout(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? null;
  if (val && val.includes("{{content}}")) return val;
  return null;
}

function buildEmailFromDbTemplate(
  tmpl: DbTemplate,
  vars: Record<string, string>,
  badge: string,
  subheading: string,
  masterLayout?: string | null,
): string {
  const sub = (s: string) =>
    s.replace(/\{(\w+)\}/g, (_, k) => escapeHtml(vars[k] ?? ""));

  const bodyHtml = sub(tmpl.body)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>`)
    .join("");

  const ctaUrl = sub(tmpl.cta_url);
  const ctaText = sub(tmpl.cta_label) || "Complete My Order";
  const heading = sub(tmpl.subject);

  const bodyContent = `${bodyHtml}${ctaButton(ctaUrl, ctaText)}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Have questions? Reply to this email or call us at <strong style="color:#374151;">(409) 965-5885</strong>. This link expires in 7 days.
    </p>`;

  if (masterLayout) return masterLayout.replace("{{content}}", bodyContent);
  return baseLayout(badge, heading, subheading, bodyContent);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json() as {
      confirmationId: string;
      email?: string;
      firstName?: string;
      price?: number;
      letterType?: string;
      discountCode?: string;
      discountType?: "percent" | "fixed";
      discountValue?: number;
      discountPercent?: number;
      discountFixed?: number;
      customMessage?: string;
    };

    const { confirmationId } = body;
    if (!confirmationId) {
      return new Response(JSON.stringify({ ok: false, error: "confirmationId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("email, first_name, last_name, price, email_log, letter_type")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ ok: false, error: "Order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = (body.email || order.email || "").trim();
    const firstName = (body.firstName || order.first_name || "").trim();
    const price = body.price ?? order.price;

    const rawLetterType = body.letterType || (order.letter_type as string | null) || "";
    const isPsd = rawLetterType === "psd" || confirmationId.includes("-PSD");

    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "No email address on this order" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const discountCode = body.discountCode?.trim() || undefined;
    let discountPercent = body.discountPercent ?? 0;
    let discountFixed = body.discountFixed ?? 0;

    if (body.discountType && body.discountValue != null && body.discountValue > 0) {
      if (body.discountType === "percent") {
        discountPercent = body.discountValue;
        discountFixed = 0;
      } else {
        discountFixed = body.discountValue;
        discountPercent = 0;
      }
    }

    const hasDiscount = !!(discountCode && discountCode.length > 0);
    const assessmentPath = isPsd ? "psd-assessment" : "assessment";

    // ── ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 ───────────────
    // Recovery links used to carry `?resume=<confirmationId>`. A confirmation id
    // is a DISPLAY REFERENCE that also lands in analytics, referrers, support
    // threads and mail logs — it must never act as a credential.
    //
    // We now mint an expiring, single-use, order-bound resume token and put THAT
    // in the link. The raw token is used once, here, to build the URL: it is not
    // logged, not persisted by this function, and not echoed in the response.
    //
    // Fail-closed: if issuance fails (order completed / cancelled / refunded /
    // already paid), we fall back to the bare assessment path with NO
    // confirmation id, so the customer gets the safe "request a new link"
    // screen rather than a link that leaks an order reference.
    // Built through the ONE canonical builder in _shared/resumeLink.ts so this
    // producer cannot drift from the others.
    const issuedLink = await issueResumeLink({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      siteUrl: SITE_URL,
      confirmationId,
      isPsd,
      purpose: "resume_assessment",
      ttlMinutes: 4320,
      createdBy: "send-checkout-recovery",
    });
    if (!issuedLink.tokenized) {
      console.info(`[send-checkout-recovery] no resume token issued — sending generic link`);
    }
    const resumeLink = issuedLink.url;
    // ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001: no promo is ever appended
    // to a customer link. The stable /checkout/<slug> URL carries no query
    // string at all. Name kept so downstream template slots stay unchanged.
    const resumeWithPromo = resumeLink;
    const orderTotal = price != null ? `$${Number(price).toFixed(2)}` : "Varies by plan";
    const letterLabel = isPsd ? "PSD Letter" : "ESA Letter";

    const discountLabel = hasDiscount
      ? (discountPercent > 0 ? `${discountPercent}%` : discountFixed > 0 ? `$${discountFixed}` : "")
      : "";

    // ── Template Hub is the primary source of truth ──────────────────────
    // Subject + body come from the DB row. Hardcoded buildRecoveryEmail() below
    // is ONLY used when the DB row is missing (empty TEST projects, accidental
    // template deletion, etc.) — never as a silent override.
    const dbSlug = hasDiscount ? "checkout_recovery_discount" : "checkout_recovery";
    const dbTemplate = await loadTemplate(supabase, dbSlug);
    const masterLayout = await loadMasterLayout(supabase);

    let html: string;
    let subject: string;

    if (dbTemplate) {
      const discountSavings = discountPercent > 0
        ? `${discountPercent}% OFF`
        : discountFixed > 0
          ? `$${discountFixed} OFF`
          : "Exclusive Discount";

      const vars: Record<string, string> = {
        name: firstName || "there",
        letter_type: letterLabel,
        resume_url: resumeLink,
        resume_url_with_promo: resumeWithPromo,
        // Forward-compat alias: admin templates may use {checkout_link}
        // interchangeably with {resume_url_with_promo} / {resume_url}.
        checkout_link: resumeWithPromo,
        order_id: confirmationId,
        order_total: orderTotal,
        discount_code: discountCode ?? "",
        discount_savings: discountSavings,
      };

      subject = dbTemplate.subject.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
      html = buildEmailFromDbTemplate(
        dbTemplate,
        vars,
        hasDiscount ? "Limited Time Offer" : "Incomplete Application",
        hasDiscount
          ? "Exclusive discount inside — your assessment answers are saved"
          : "Your assessment answers have been saved — pick up where you left off",
        masterLayout,
      );
    } else {
      // Fallback to rich hardcoded builder
      subject = hasDiscount
        ? `Your ${letterLabel}${discountLabel ? ` + Exclusive ${discountLabel} Discount` : " + Exclusive Discount"} Inside — Order ${confirmationId}`
        : `Complete Your ${letterLabel} Consultation — Order ${confirmationId}`;

      html = buildRecoveryEmail(
        firstName,
        resumeLink,
        orderTotal,
        isPsd,
        discountCode,
        discountPercent,
        discountFixed,
        body.customMessage,
      );
    }

    const sendResult = await sendEmailViaResend(
      {
        from: FROM_EMAIL,
        to: [email],
        subject,
        html,
        tags: [
          { name: "email_type", value: "checkout_recovery" },
          { name: "slug", value: dbSlug },
          { name: "confirmation_id", value: confirmationId },
        ],
      },
      RESEND_API_KEY,
    );

    if (!sendResult.ok) {
      throw new Error(sendResult.error || `Resend error ${sendResult.status}`);
    }
    const emailResult = { id: sendResult.messageId ?? undefined };

    const existingLog = (order.email_log as unknown[]) ?? [];
    const newEntry = {
      type: "checkout_recovery",
      sentAt: new Date().toISOString(),
      to: email,
      success: true,
      discountCode: discountCode ?? null,
      letterType: isPsd ? "psd" : "esa",
      templateSource: dbTemplate ? "db" : "hardcoded",
    };
    await supabase
      .from("orders")
      .update({ email_log: [...existingLog, newEntry] })
      .eq("confirmation_id", confirmationId);

    // Primary log → communications
    await logEmailComm({
      supabase,
      confirmationId,
      to: email,
      from: FROM_EMAIL,
      subject,
      body: hasDiscount ? `Discount code: ${discountCode}` : null,
      slug: dbSlug,
      templateSource: dbTemplate ? "db" : "hardcoded",
      sentBy: "admin_checkout_recovery",
      success: true,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        messageId: emailResult.id,
        message: `Recovery email sent to ${email}${hasDiscount ? ` with promo code ${discountCode}` : ""}`,
        sentTo: email,
        hasDiscount,
        letterType: isPsd ? "psd" : "esa",
        templateSource: dbTemplate ? "db" : "hardcoded",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
