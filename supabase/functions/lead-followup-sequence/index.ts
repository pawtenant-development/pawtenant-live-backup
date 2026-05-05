import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SITE_URL = "https://www.pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const DISCOUNT_CODE = "20PAW";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

// Eligibility lookback window for the sequence cron's leads query.
// IMPORTANT: this MUST be larger than the latest stage's age threshold (Stage 3
// fires at age >= 3 days), otherwise a lead that missed an earlier cron tick
// would age out of the query before the later stage can fire — Stage 2/3 would
// never be reached and the lead would stay stuck at "30min sent" forever.
// 14 days gives a safe buffer for catching delayed cron ticks, function outages,
// and the 3-day discount stage. Per-stage timing is still enforced inside the
// loop (ageMin >= 30, ageHours >= 24, ageDays >= 3), so a fresh lead does NOT
// receive multiple stages in one run.
const SEQUENCE_LOOKBACK_DAYS = 14;
// Hard cutoff inside the loop: if a lead is older than this AND has already
// received the final stage, mark it expired and skip cheap. Mirrors the prior
// behavior of MAX_SEQUENCE_AGE_DAYS for the expiry path only.
const SEQUENCE_FINAL_STAGE_MAX_AGE_DAYS = 3;

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

async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; resend_id?: string; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, reply_to: SUPPORT_EMAIL }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[lead-followup-sequence] Resend error:", res.status, errText);
    return { sent: false, error: `Resend ${res.status}: ${errText.slice(0, 200)}` };
  }
  const data = await res.json() as { id?: string };
  return { sent: true, resend_id: data.id };
}

async function writeAuditLog(
  supabase: ReturnType<typeof createClient>,
  opts: {
    action: string;
    description: string;
    object_id: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_name: "Auto-Sequence",
    actor_role: "system",
    object_type: "sequence",
    object_id: opts.object_id,
    action: opts.action,
    description: opts.description,
    metadata: opts.metadata ?? null,
  });
  if (error) console.error("[lead-followup-sequence] audit_log insert error:", error.message);
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

async function loadSeqTemplate(
  supabase: ReturnType<typeof createClient>,
  slug: string
): Promise<{ subject: string; body: string; ctaLabel: string; ctaUrl: string } | null> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject, body, cta_label, cta_url")
    .eq("slug", slug)
    .eq("channel", "email")
    .maybeSingle();
  if (error || !data) return null;
  return {
    subject: data.subject as string,
    body: data.body as string,
    ctaLabel: data.cta_label as string,
    ctaUrl: data.cta_url as string,
  };
}

async function loadMasterLayout(
  supabase: ReturnType<typeof createClient>
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

function buildEmailFromTemplate(
  tmpl: { subject: string; body: string; ctaLabel: string; ctaUrl: string },
  vars: { name: string; letter_type: string; resume_url: string; discount_code?: string },
  badge: string, heading: string, subheading: string, orderId: string,
  masterLayout?: string | null,
): string {
  const sub = (s: string) =>
    s.replace(/\{name\}/g, escapeHtml(vars.name))
     .replace(/\{letter_type\}/g, vars.letter_type)
     .replace(/\{resume_url\}/g, vars.resume_url)
     .replace(/\{discount_code\}/g, vars.discount_code ?? DISCOUNT_CODE)
     .replace(/\{resume_url_with_promo\}/g, `${vars.resume_url}&promo=${encodeURIComponent(vars.discount_code ?? DISCOUNT_CODE)}`);
  const processedBody = sub(tmpl.body);
  const paragraphs = processedBody
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const ctaUrl = sub(tmpl.ctaUrl);
  const ctaLbl = sub(tmpl.ctaLabel);
  const bodyHtml = `${paragraphs}${ctaUrl ? ctaBtn(ctaUrl, ctaLbl) : ""}`;
  if (masterLayout) return masterLayout.replace("{{content}}", bodyHtml);
  return baseLayout(badge, heading, subheading, bodyHtml, orderId);
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

// ── Send one step with strict DB-level dedupe ────────────────────────────────
// Reserves a row in `communications` keyed on `seq:{orderId}:{step}` BEFORE
// hitting Resend. If another concurrent cron run already reserved the same
// key, the UNIQUE index rejects the insert and we skip — no second email.
async function sendSequenceStep(
  supabase: ReturnType<typeof createClient>,
  opts: {
    step: "seq_30min" | "seq_24h" | "seq_3day";
    orderId: string;
    confirmationId: string;
    email: string;
    subject: string;
    html: string;
    stampColumn: "seq_30min_sent_at" | "seq_24h_sent_at" | "seq_3day_sent_at";
    templateSource: "db" | "hardcoded";
  },
): Promise<{ sent: boolean; skipped: boolean; reason?: string; resendId?: string }> {
  // Phase 1: reserve dedupe_key — atomic per (orderId, step).
  const reservation = await reserveEmailSend({
    supabase,
    orderId: opts.orderId,
    confirmationId: opts.confirmationId,
    to: opts.email,
    from: FROM_EMAIL,
    subject: opts.subject,
    slug: opts.step,
    templateSource: opts.templateSource,
    sentBy: `auto_sequence:${opts.step}`,
  });

  if (!reservation.proceed) {
    console.log(`[lead-followup-sequence] SKIP ${opts.step} for order ${opts.orderId} — already sent (dedupe)`);
    // Still stamp the order so the expensive dedupe-lookup path is short-circuited next run.
    await supabase.from("orders").update({ [opts.stampColumn]: new Date().toISOString() }).eq("id", opts.orderId);
    return { sent: false, skipped: true, reason: "duplicate" };
  }

  // Phase 2: mark the order stamp BEFORE sending. Combined with the DB
  // reservation above, this ensures even if the cron re-fires, the next pass
  // sees the stamp and skips the template build entirely.
  await supabase.from("orders").update({ [opts.stampColumn]: new Date().toISOString() }).eq("id", opts.orderId);

  // Phase 3: send via Resend.
  const { sent, resend_id, error } = await sendEmail(opts.email, opts.subject, opts.html);

  // Phase 4: finalize the reserved row — status becomes "sent" or "failed".
  await finalizeEmailSend(supabase, reservation.rowId, {
    success: sent,
    body: `[Auto-Sequence ${opts.step}] ${opts.subject}`,
    resendId: resend_id ?? null,
    errorMessage: error ?? null,
  });

  return { sent, skipped: false, resendId: resend_id };
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

      await writeAuditLog(supabase, {
        action: "seq_unsubscribed",
        description: `Lead unsubscribed from follow-up sequence (${order.email})`,
        object_id: orderId,
        metadata: { email: order.email },
      });

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

    // Window the query at SEQUENCE_LOOKBACK_DAYS so leads that missed an earlier
    // tick still get picked up before the next stage. Per-stage age gates remain
    // inside the loop, so this widening cannot fast-forward stages.
    const maxAgeDate = new Date(now.getTime() - SEQUENCE_LOOKBACK_DAYS * 86400000).toISOString();

    const { data: leads, error } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, phone, letter_type, created_at, seq_30min_sent_at, seq_24h_sent_at, seq_3day_sent_at, payment_intent_id, status, paid_at, followup_opt_out")
      .is("payment_intent_id", null)
      .is("paid_at", null)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .neq("status", "refunded")
      .is("followup_opt_out", false)
      .not("email", "is", null)
      .gte("created_at", maxAgeDate)
      // Skip rows that have already received every stage — nothing left to do.
      .or("seq_30min_sent_at.is.null,seq_24h_sent_at.is.null,seq_3day_sent_at.is.null");

    if (error) return json({ ok: false, error: error.message }, 500);

    const results = { step1_30min: 0, step2_24h: 0, step3_3day: 0, skipped: 0, opted_out: 0, expired: 0, dedup_skipped: 0 };

    const masterLayout = await loadMasterLayout(supabase);

    for (const lead of (leads ?? [])) {
      if (lead.payment_intent_id || lead.paid_at || lead.status === "completed") { results.skipped++; continue; }
      if (lead.followup_opt_out) { results.opted_out++; continue; }

      const createdAt = new Date(lead.created_at as string);
      const ageMs = now.getTime() - createdAt.getTime();
      const ageMin = ageMs / 60000;
      const ageHours = ageMs / 3600000;
      const ageDays = ageMs / 86400000;

      // Only mark "expired" when the lead is past the final-stage age AND the
      // final stage has already been sent — i.e. nothing left to do. Without
      // the && guard, a lead that missed Stage 3 (cron downtime) would be
      // expired before Stage 3 could fire.
      if (ageDays > SEQUENCE_FINAL_STAGE_MAX_AGE_DAYS && lead.seq_3day_sent_at) { results.expired++; continue; }

      const letterType = (lead.letter_type as string) || "esa";
      const assessmentPath = letterType === "psd" ? "psd-assessment" : "assessment";
      const resumeLink = `${SITE_URL}/${assessmentPath}?resume=${encodeURIComponent(lead.confirmation_id as string)}`;
      const firstName = (lead.first_name as string) || "";
      const email = lead.email as string;
      const orderId = lead.id as string;
      const confirmationId = lead.confirmation_id as string;

      if (ageMin >= 30 && !lead.seq_30min_sent_at) {
        const dbTmpl30 = await loadSeqTemplate(supabase, "seq_30min");
        const label = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl30
          ? dbTmpl30.subject.replace(/\{letter_type\}/g, label)
          : `Complete Your ${letterType === "psd" ? "PSD" : "ESA"} Letter — Your answers are saved`;
        const html30 = dbTmpl30
          ? buildEmailFromTemplate(dbTmpl30, { name: firstName, letter_type: label, resume_url: resumeLink }, "Incomplete Application", `Your ${label} is waiting!`, "Your assessment answers have been saved — pick up where you left off", orderId, masterLayout)
          : build30MinEmail(firstName, resumeLink, letterType, orderId);

        const r = await sendSequenceStep(supabase, {
          step: "seq_30min", orderId, confirmationId, email, subject, html: html30,
          stampColumn: "seq_30min_sent_at", templateSource: dbTmpl30 ? "db" : "hardcoded",
        });
        if (r.skipped) { results.dedup_skipped++; continue; }

        await writeAuditLog(supabase, {
          action: "seq_30min_sent",
          description: `30-min follow-up sent to ${email} (${confirmationId})`,
          object_id: confirmationId,
          metadata: { order_id: orderId, email, letter_type: letterType, email_sent: r.sent, step: "30min" },
        });
        results.step1_30min++;
        continue;
      }

      if (ageHours >= 24 && !lead.seq_24h_sent_at) {
        const dbTmpl24 = await loadSeqTemplate(supabase, "seq_24h");
        const label24 = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl24
          ? dbTmpl24.subject.replace(/\{letter_type\}/g, label24)
          : `Still thinking? Get your ${letterType === "psd" ? "PSD" : "ESA"} letter today and avoid housing issues.`;
        const html24 = dbTmpl24
          ? buildEmailFromTemplate(dbTmpl24, { name: firstName, letter_type: label24, resume_url: resumeLink }, "Still Thinking?", "Get your ESA letter today and avoid housing issues.", "Your assessment is saved — complete checkout in under 2 minutes", orderId, masterLayout)
          : build24hEmail(firstName, resumeLink, letterType, orderId);

        const r = await sendSequenceStep(supabase, {
          step: "seq_24h", orderId, confirmationId, email, subject, html: html24,
          stampColumn: "seq_24h_sent_at", templateSource: dbTmpl24 ? "db" : "hardcoded",
        });
        if (r.skipped) { results.dedup_skipped++; continue; }

        await writeAuditLog(supabase, {
          action: "seq_24h_sent",
          description: `24-hour follow-up sent to ${email} (${confirmationId})`,
          object_id: confirmationId,
          metadata: { order_id: orderId, email, letter_type: letterType, email_sent: r.sent, step: "24h" },
        });
        results.step2_24h++;
        continue;
      }

      if (ageDays >= 3 && !lead.seq_3day_sent_at) {
        const dbTmpl3d = await loadSeqTemplate(supabase, "seq_3day");
        const label3d = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl3d
          ? dbTmpl3d.subject.replace(/\{letter_type\}/g, label3d).replace(/\{discount_code\}/g, DISCOUNT_CODE)
          : `Here's $20 off your ${letterType === "psd" ? "PSD" : "ESA"} letter (limited time) — Discount code: ${DISCOUNT_CODE}`;
        const html3d = dbTmpl3d
          ? buildEmailFromTemplate(dbTmpl3d, { name: firstName, letter_type: label3d, resume_url: resumeLink, discount_code: DISCOUNT_CODE }, "Limited Time Offer", `Here's $20 off your ${label3d}!`, "Exclusive discount — expires in 48 hours", orderId, masterLayout)
          : build3DayEmail(firstName, resumeLink, letterType, orderId);

        const r = await sendSequenceStep(supabase, {
          step: "seq_3day", orderId, confirmationId, email, subject, html: html3d,
          stampColumn: "seq_3day_sent_at", templateSource: dbTmpl3d ? "db" : "hardcoded",
        });
        if (r.skipped) { results.dedup_skipped++; continue; }

        await writeAuditLog(supabase, {
          action: "seq_3day_sent",
          description: `3-day follow-up + $20 discount sent to ${email} (${confirmationId})`,
          object_id: confirmationId,
          metadata: { order_id: orderId, email, letter_type: letterType, email_sent: r.sent, step: "3day", discount_code: DISCOUNT_CODE },
        });
        results.step3_3day++;
        continue;
      }

      results.skipped++;
    }

    const totalFired = results.step1_30min + results.step2_24h + results.step3_3day;
    if (totalFired > 0 || results.dedup_skipped > 0) {
      await writeAuditLog(supabase, {
        action: "seq_run_complete",
        description: `Sequence run: ${totalFired} sent, ${results.dedup_skipped} dedup-skipped — 30min: ${results.step1_30min}, 24h: ${results.step2_24h}, 3day: ${results.step3_3day}`,
        object_id: "system",
        metadata: { ...results, total_leads: leads?.length ?? 0 },
      });
    }

    console.log("[lead-followup-sequence] Results:", results);
    return json({ ok: true, processed: leads?.length ?? 0, results });

  } catch (err) {
    console.error("[lead-followup-sequence] Error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
