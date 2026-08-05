// supabase/functions/lead-followup-sequence/core.ts
//
// Core sequence-run logic, factored out so both the engine HTTP handler
// (lead-followup-sequence/index.ts — called by Supabase Cron) and the admin
// manual wrapper (manual-run-lead-followup-sequence/index.ts — called by the
// Settings button) can invoke the same run IN-PROCESS. No inter-function
// HTTP roundtrip, so the wrapper no longer has to coordinate
// `Authorization: Bearer <SERVICE_ROLE_KEY>` against the engine's
// platform-level `verify_jwt`. That was the source of the
// "lead-followup-sequence returned status 401" symptom.
//
// Pure logic — takes a service-role Supabase client and returns a result
// object. Does not touch HTTP, does not read its own bearer, does not call
// other Edge Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";
import { issueResumeLink } from "../_shared/resumeLink.ts";
import { sendGhlSms, normalizeE164, type GhlSmsOutcome } from "../_shared/ghlSms.ts";

type SupabaseClient = ReturnType<typeof createClient>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002
//
// The direct Twilio dependency is GONE. This sequence used to call the Twilio
// REST API itself while every other PawTenant SMS producer went through GHL —
// and Twilio is not configured on LIVE, so 642 consecutive automated recovery
// SMS short-circuited with "Twilio not configured or phone missing" before any
// HTTP call was made. Owner decision: GHL is the one canonical SMS path.
// Do not reintroduce TWILIO_* secrets here.
const GHL_FROM_NUMBER = Deno.env.get("GHL_PHONE_NUMBER") ?? "";

const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
// Env-driven. Was hardcoded to the LIVE origin, which in TEST produced recovery
// links pointing at production — and a TEST-minted token can never satisfy a
// LIVE exchange (environment binding), so those links would fail closed.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const DISCOUNT_CODE = "20PAW";
// The hard-coded SMS discount constant that used to live here is DELETED.
//
// OWNER CORRECTION 2026-08-05 — read this before "restoring" it. The recovery
// SMS DOES advertise a promo code again, but the code and the whole message now
// come from the owner's saved Recovery Sequence configuration
// (`comms_settings.recovery_sms_promo_code` / `recovery_sms_5min_template`),
// never from a constant in this file. The distinction is the entire fix: a
// constant here is a second source of truth that disagrees with what the Admin
// settings screen shows, which is exactly how the wrong copy reached customers.
//
// The discount is TEXT IN THE BODY ONLY. It must never be appended to the
// checkout URL as a promo/coupon/discount/code parameter, and must never be
// pre-applied at Stripe — the customer types it in at checkout themselves.
// Safe fallback when an order has no pet name in assessment data.
const PET_FALLBACK = "your pet";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

// Eligibility lookback window for the sequence cron's leads query.
// IMPORTANT: this MUST be larger than the latest stage's age threshold (Stage 3
// fires at age >= 3 days), otherwise a lead that missed an earlier cron tick
// would age out of the query before the later stage can fire.
export const SEQUENCE_LOOKBACK_DAYS = 14;
// Hard cutoff inside the loop: if a lead is older than this AND has already
// received the final stage, mark it expired and skip cheap.
export const SEQUENCE_FINAL_STAGE_MAX_AGE_DAYS = 3;

export interface SequenceResults {
  step1_30min: number;
  step2_24h: number;
  step3_3day: number;
  sms_5min: number;
  skipped: number;
  opted_out: number;
  expired: number;
  dedup_skipped: number;
  /**
   * LEAD-FOLLOWUP-SEQUENCE-SECURE-RESUME-REGRESSION-RECOVERY-001.
   * A lead whose secure resume link could not be minted (so nothing was claimed
   * and nothing was sent), and a lead whose SMS was claimed but rejected by the
   * sender (claim released for retry). Surfaced in the heartbeat so a silent
   * partial failure can never look like a clean run again.
   */
  sms_link_failed: number;
  sms_send_failed: number;
}

/** One stage a dry run determined WOULD fire. Never contains PII. */
export interface SequencePlanEntry {
  confirmation_id: string;
  order_id: string;
  stage: string;
  channel: "sms" | "email";
}

export interface SequenceRunResult {
  ok: boolean;
  processed: number;
  results: SequenceResults;
  error?: string;
  /** Present only on a dry run. Empty array means nothing would be sent. */
  dry_run?: boolean;
  plan?: SequencePlanEntry[];
}

function emptyResults(): SequenceResults {
  return { step1_30min: 0, step2_24h: 0, step3_3day: 0, sms_5min: 0, skipped: 0, opted_out: 0, expired: 0, dedup_skipped: 0, sms_link_failed: 0, sms_send_failed: 0 };
}

export function escapeHtml(v = ""): string {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildUnsubscribeUrl(orderId: string): string {
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

// Resolve the pet's name from assessment data (orders.assessment_answers JSONB).
// Mirrors how first_name is read, with support for pets[0].name or a flat
// pet_name. Returns "" if missing — caller applies PET_FALLBACK.
export function resolvePetName(assessment: unknown): string {
  try {
    const a = assessment as { pets?: Array<{ name?: string | null }>; pet_name?: string | null } | null;
    const fromArray = a?.pets?.[0]?.name ?? "";
    const flat = a?.pet_name ?? "";
    return String(fromArray || flat || "").trim();
  } catch {
    return "";
  }
}

/**
 * The saved Recovery Sequence configuration — the ONE source of truth for the
 * 5-minute recovery SMS.
 *
 * OWNER CORRECTION 2026-08-05. This function previously rendered a hard-coded
 * generic message and ignored the template the owner had already saved in
 * Recovery Sequence settings, so the Admin preview and the SMS the customer
 * actually received were generated from two different places and disagreed.
 * There is now exactly one place: `comms_settings`.
 *
 * DO NOT reintroduce a hard-coded SMS body here, not even as a fallback. A
 * fallback string is a second source of truth that silently wins whenever the
 * config read hiccups — which is precisely how the wrong copy shipped.
 */
interface RecoverySmsConfig {
  /** Both `recovery_enabled` AND `recovery_sms_enabled` must be true. */
  enabled: boolean;
  /** Owner-authored template. Null/blank means DO NOT SEND. */
  template: string | null;
  promoCode: string;
  /** `recovery_stage_1_minutes` — the SMS stage's age threshold. */
  stage1Minutes: number;
}

/** Default promo used only when `recovery_sms_promo_code` is unset. */
const RECOVERY_PROMO_FALLBACK = "PAW20";

async function loadRecoverySmsConfig(supabase: SupabaseClient): Promise<RecoverySmsConfig> {
  const keys = [
    "recovery_enabled", "recovery_sms_enabled",
    "recovery_sms_5min_template", "recovery_sms_promo_code",
    "recovery_stage_1_minutes",
  ];
  const map = new Map<string, string>();
  try {
    const { data } = await supabase
      .from("comms_settings").select("key, value").in("key", keys);
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
      map.set(row.key, String(row.value ?? ""));
    }
  } catch {
    // Fail CLOSED. An unreadable config must not fall back to inventing copy.
    return { enabled: false, template: null, promoCode: RECOVERY_PROMO_FALLBACK, stage1Minutes: 5 };
  }
  const truthy = (k: string) => String(map.get(k) ?? "").trim().toLowerCase() === "true";
  const minutes = Number(map.get("recovery_stage_1_minutes") ?? "5");
  return {
    enabled: truthy("recovery_enabled") && truthy("recovery_sms_enabled"),
    template: (map.get("recovery_sms_5min_template") ?? "").trim() || null,
    promoCode: (map.get("recovery_sms_promo_code") ?? "").trim() || RECOVERY_PROMO_FALLBACK,
    stage1Minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 5,
  };
}

/**
 * Render the owner's saved template.
 *
 * Merge tags accept BOTH `{tag}` and `{{tag}}`. The stored template uses single
 * braces (matching the email templates); the spec was written with double. A
 * renderer that only understood one would ship the other verbatim to a
 * customer's phone.
 *
 * THE DISCOUNT RULE, and it is the whole point of this change:
 *   • `{promo_code}` renders as PLAIN TEXT in the message body, so the customer
 *     types it in themselves.
 *   • `{resume_url}` renders as the bare stable checkout link. It carries NO
 *     query string, so no promo / coupon / discount / code parameter can ride
 *     along and nothing is pre-applied at Stripe.
 * Those two must never be combined. Advertising the code is a marketing
 * decision; auto-applying it is a pricing decision, and this path is not
 * allowed to make the second one.
 *
 * "Reply STOP to opt out." is NOT appended. GHL emits its own required
 * unsubscribe disclosure on the first conversation, so adding ours duplicated
 * it. Suppression itself is untouched: `sms_opted_out` still gates the stage
 * and provider-side DND is still consulted before every automated send.
 */
function renderRecoverySms(
  template: string,
  vars: { firstName: string; petName: string; promoCode: string; resumeUrl: string },
): string {
  const values: Record<string, string> = {
    first_name: (vars.firstName || "").trim() || "there",
    petname: (vars.petName || "").trim() || PET_FALLBACK,
    pet_name: (vars.petName || "").trim() || PET_FALLBACK,
    promo_code: vars.promoCode,
    resume_url: vars.resumeUrl,
  };
  return template.replace(
    /\{\{?\s*(first_name|petname|pet_name|promo_code|resume_url)\s*\}?\}/g,
    (_m, tag: string) => values[tag] ?? "",
  );
}

/**
 * The idempotency anchor for ONE provider attempt.
 *
 * `sms_sequence_attempts` already holds one row per (order, stage, channel)
 * with a running `attempt_count`. The Nth attempt on a stage therefore has a
 * deterministic name, and that name is written to
 * `communications.dedupe_key`, which carries a UNIQUE partial index. The index
 * — not application logic — is what makes "one provider attempt = exactly one
 * communication record" true even across concurrent cron runs and retries.
 */
function smsAttemptIdempotencyKey(orderId: string, stage: string, attemptNo: number): string {
  return `seq:${orderId}:${stage}:sms:${attemptNo}`;
}

/** Attempts already recorded for this stage. 0 when never attempted. */
async function currentAttemptCount(
  supabase: SupabaseClient, orderId: string, stage: string,
): Promise<number> {
  const { data } = await supabase
    .from("sms_sequence_attempts")
    .select("attempt_count")
    .eq("order_id", orderId).eq("stage", stage).eq("channel", "sms")
    .maybeSingle();
  return Number((data as { attempt_count?: number } | null)?.attempt_count ?? 0);
}

interface RecoverySmsResult {
  sent: boolean;
  outcome: GhlSmsOutcome;
  providerMessageId: string | null;
  failureCode: string | null;
  failureReason: string | null;
  idempotencyKey: string;
  /** True when this exact attempt key was already logged, so nothing was sent. */
  duplicateSuppressed: boolean;
}

/**
 * Send one recovery SMS through the canonical GHL path and log EXACTLY one
 * communications row for it.
 *
 * SEQUENCE — and every step of it is load-bearing:
 *
 *   1. Compute this attempt's idempotency key from the durable attempt counter.
 *   2. CLAIM the key by inserting the communications row with status
 *      `sending`. The unique index on `dedupe_key` means a second caller
 *      holding the same key loses the insert and returns without sending.
 *   3. Call the provider.
 *   4. UPDATE that same row in place with the real outcome.
 *
 * Why claim with `sending` and not `sent`: an earlier incident stamped success
 * BEFORE the side effect, so an exception in between left seven leads
 * permanently marked as messaged having received nothing. A crash here leaves a
 * row reading `sending`, which is the truth — the attempt was started and its
 * result is unknown — and it is never mistaken for a delivery.
 *
 * Never throws.
 */
async function sendRecoverySms(
  supabase: SupabaseClient,
  opts: { orderId: string; confirmationId: string; stage: string; toPhone: string; message: string },
): Promise<RecoverySmsResult> {
  const attemptNo = (await currentAttemptCount(supabase, opts.orderId, opts.stage)) + 1;
  const idempotencyKey = smsAttemptIdempotencyKey(opts.orderId, opts.stage, attemptNo);

  const { data: claimRow, error: claimErr } = await supabase
    .from("communications")
    .insert({
      order_id: opts.orderId ?? null,
      confirmation_id: opts.confirmationId ?? null,
      type: "sms_outbound",
      direction: "outbound",
      body: opts.message,
      phone_from: GHL_FROM_NUMBER || null,
      phone_to: opts.toPhone || null,
      status: "sending",
      // System actor. This is a cron-initiated send with no human behind it and
      // it must never be attributable to an employee.
      sent_by: "PawTenant System",
      dedupe_key: idempotencyKey,
      sequence_stage: opts.stage,
    })
    .select("id")
    .maybeSingle();

  const commId = (claimRow as { id?: string } | null)?.id ?? null;
  if (claimErr || !commId) {
    // Unique violation on dedupe_key is the expected, healthy path here: this
    // exact attempt is already owned. Anything else is a genuine logging
    // failure — either way we refuse to send, because an unlogged send is
    // exactly the invisible message this incident was made of.
    return {
      sent: false,
      outcome: "retryable",
      providerMessageId: null,
      failureCode: "attempt_already_logged",
      failureReason: `Attempt ${attemptNo} was not claimed (${claimErr?.code ?? "no row"}) — not sent.`,
      idempotencyKey,
      duplicateSuppressed: true,
    };
  }

  const res = await sendGhlSms({
    toPhone: opts.toPhone,
    message: opts.message,
    // Automated send: a STOP the customer texted to the GHL number is invisible
    // to orders.sms_opted_out, so DND must be verified provider-side.
    checkDnd: true,
    contactSource: "PawTenant Checkout Recovery",
  });

  await supabase
    .from("communications")
    .update({
      status: res.ok ? "sent" : "failed",
      phone_to: res.phone || opts.toPhone || null,
      phone_from: res.fromNumber ?? GHL_FROM_NUMBER ?? null,
      twilio_sid: res.messageId ? `ghl:${res.messageId}` : null,
      failure_code: res.failureCode,
      failure_reason: res.failureReason,
    })
    .eq("id", commId);

  // A send that went out WITHOUT provider-side opt-out state being readable is
  // not an error, but it must not be invisible: it means GHL's own DND
  // enforcement was the only opt-out protection in play. Logged loudly so a
  // credential scope regression surfaces here rather than in a complaint.
  if (res.ok && !res.dndVerified) {
    console.warn(
      `[lead-followup-sequence] ${opts.confirmationId} ${opts.stage}: sent with UNVERIFIED opt-out state — ${res.dndDetail}`,
    );
  }

  return {
    sent: res.ok,
    outcome: res.outcome,
    providerMessageId: res.messageId,
    failureCode: res.failureCode,
    failureReason: res.failureReason,
    idempotencyKey,
    duplicateSuppressed: false,
  };
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  opts: {
    action: string;
    description: string;
    object_id: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
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

function ctaBtn(url: string, text: string, color = "#f97316"): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
    <a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${text} &rarr;</a>
  </td></tr></table>`;
}

async function loadSeqTemplate(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ subject: string; body: string; ctaLabel: string; ctaUrl: string } | null> {
  // COMMS-TEMPLATE-HUB-ACTIVE-POINTER 2026-05-23 — Option A (default-safe).
  // The admin Hub now writes the Active template id for each automation
  // slot into comms_settings under key='seq_template_<slug>'. If that row
  // exists AND it points to a non-archived, channel='email' template, we
  // load by id and use that template's body / subject / CTA. If the row
  // is missing, the pointer references a missing or archived template,
  // or the read fails for any other reason, we fall back to the original
  // slug-based lookup so recovery automation NEVER stops sending because
  // of a misconfigured pointer.
  const pointerKey = `seq_template_${slug}`;
  try {
    const { data: ptr } = await supabase
      .from("comms_settings")
      .select("value")
      .eq("key", pointerKey)
      .maybeSingle();
    const activeId = (ptr?.value as string | null | undefined) ?? null;
    if (activeId && activeId.trim()) {
      const { data: row } = await supabase
        .from("email_templates")
        .select("subject, body, cta_label, cta_url, archived, channel")
        .eq("id", activeId.trim())
        .maybeSingle();
      if (row && !row.archived && row.channel === "email") {
        return {
          subject:  row.subject  as string,
          body:     row.body     as string,
          ctaLabel: row.cta_label as string,
          ctaUrl:   row.cta_url   as string,
        };
      }
      // Pointer present but template missing / archived / wrong channel.
      // Fall through to the slug fallback below — do not abort the send.
    }
  } catch {
    // Network / RLS / schema cache hiccup. Fall through to slug fallback.
  }

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

async function loadMasterLayout(supabase: SupabaseClient): Promise<string | null> {
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
  vars: { name: string; letter_type: string; resume_url: string; discount_code?: string; petname?: string },
  badge: string,
  heading: string,
  subheading: string,
  orderId: string,
  masterLayout?: string | null,
): string {
  const petName = (vars.petname ?? "").trim() || PET_FALLBACK;
  const sub = (s: string) =>
    s.replace(/\{name\}/g, escapeHtml(vars.name))
     .replace(/\{petname\}/g, escapeHtml(petName))
     .replace(/\{letter_type\}/g, vars.letter_type)
     .replace(/\{resume_url\}/g, vars.resume_url)
     .replace(/\{discount_code\}/g, vars.discount_code ?? DISCOUNT_CODE)
     // {resume_url_with_promo} now resolves to the SAME bare stable link as
     // {resume_url}. Retained so existing templates keep rendering.
     .replace(/\{resume_url_with_promo\}/g, vars.resume_url);
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
  // No promo in customer links — see ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001.
  const resumeWithPromo = resumeLink;
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

export function buildUnsubscribePage(success: boolean, email = ""): string {
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
async function sendSequenceStep(
  supabase: SupabaseClient,
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
    await supabase.from("orders").update({ [opts.stampColumn]: new Date().toISOString() }).eq("id", opts.orderId);
    return { sent: false, skipped: true, reason: "duplicate" };
  }

  await supabase.from("orders").update({ [opts.stampColumn]: new Date().toISOString() }).eq("id", opts.orderId);

  const { sent, resend_id, error } = await sendEmail(opts.email, opts.subject, opts.html);

  await finalizeEmailSend(supabase, reservation.rowId, {
    success: sent,
    body: `[Auto-Sequence ${opts.step}] ${opts.subject}`,
    resendId: resend_id ?? null,
    errorMessage: error ?? null,
  });

  return { sent, skipped: false, resendId: resend_id };
}

/**
 * Best-effort heartbeat update of public.sequence_automation_status.
 *
 * Never throws — silent failures here must not break the actual sequence
 * run, but they ARE logged to console so they show up in Supabase function
 * logs if the heartbeat table or RLS is misconfigured.
 *
 * Note: writes are performed with the service-role client, which bypasses
 * RLS. If the table does not exist (migration not yet applied), the .from()
 * call returns an error rather than throwing — we swallow it.
 */
async function heartbeat(
  supabase: SupabaseClient,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("sequence_automation_status")
      .update(patch)
      .eq("id", 1);
    if (error) {
      console.warn(
        "[lead-followup-sequence] heartbeat update failed:",
        error.message,
      );
    }
  } catch (err) {
    console.warn(
      "[lead-followup-sequence] heartbeat threw (ignored):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Run the follow-up sequence over eligible unpaid leads.
 *
 * Pure logic — no HTTP, no auth coordination. Imported by both:
 *   - lead-followup-sequence/index.ts (POST {} from cron)
 *   - manual-run-lead-followup-sequence/index.ts (admin button)
 *
 * Caller passes a service-role Supabase client. Returns a result object;
 * never throws.
 *
 * SEQ-AUTOMATION-LIVE-SCHEDULER-ROOT-FIX:
 * `invocationSource` is stamped on the heartbeat row so admins can tell
 * apart automatic cron runs from manual Settings-button runs. Heartbeat
 * is best-effort and never blocks the run.
 */
export async function runLeadFollowupSequence(
  supabase: SupabaseClient,
  opts?: { invocationSource?: "cron" | "manual" | "unknown"; dryRun?: boolean },
): Promise<SequenceRunResult> {
  const invocationSource = opts?.invocationSource ?? "unknown";
  const dryRun = opts?.dryRun === true;
  const plan: SequencePlanEntry[] = [];
  const startedAtIso = new Date().toISOString();

  // Heartbeat — RUN STARTED. Always fires regardless of outcome.
  // Suppressed on a dry run: a rehearsal must not move the operational clock
  // admins read to answer "when did the sequence last actually run?".
  if (!dryRun) {
    await heartbeat(supabase, {
      last_run_started_at: startedAtIso,
      last_invocation_source: invocationSource,
    });
  }

  try {
    const now = new Date();
    const maxAgeDate = new Date(now.getTime() - SEQUENCE_LOOKBACK_DAYS * 86400000).toISOString();

    const { data: leads, error } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, phone, letter_type, created_at, seq_30min_sent_at, seq_24h_sent_at, seq_3day_sent_at, sms_5min_sent_at, sms_opted_out, assessment_answers, payment_intent_id, status, paid_at, followup_opt_out")
      .is("payment_intent_id", null)
      .is("paid_at", null)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .neq("status", "refunded")
      .not("email", "is", null)
      .gte("created_at", maxAgeDate)
      .or("seq_30min_sent_at.is.null,seq_24h_sent_at.is.null,seq_3day_sent_at.is.null,sms_5min_sent_at.is.null");

    if (error) return { ok: false, processed: 0, results: emptyResults(), error: error.message };

    const results = emptyResults();
    const masterLayout = await loadMasterLayout(supabase);
    // OWNER CORRECTION 2026-08-05: the 5-minute SMS renders from the SAVED
    // Recovery Sequence configuration. Loaded once per run so every lead in
    // this run is messaged from the same snapshot of the owner's settings.
    const smsConfig = await loadRecoverySmsConfig(supabase);
    if (!smsConfig.enabled || !smsConfig.template) {
      console.warn(
        `[lead-followup-sequence] 5-min SMS stage inactive — enabled=${smsConfig.enabled}, ` +
        `template=${smsConfig.template ? "present" : "MISSING"}. No recovery SMS will be sent this run.`,
      );
    }

    for (const lead of (leads ?? [])) {
      if (lead.payment_intent_id || lead.paid_at || lead.status === "completed") { results.skipped++; continue; }
      if (lead.followup_opt_out) { results.opted_out++; continue; }

      const createdAt = new Date(lead.created_at as string);
      const ageMs = now.getTime() - createdAt.getTime();
      const ageMin = ageMs / 60000;
      const ageHours = ageMs / 3600000;
      const ageDays = ageMs / 86400000;

      if (ageDays > SEQUENCE_FINAL_STAGE_MAX_AGE_DAYS && lead.seq_3day_sent_at) { results.expired++; continue; }

      const letterType = (lead.letter_type as string) || "esa";
      //
      // ORDER-RESUME-SECURE-TOKEN-001: the drip used to embed
      // `?resume=<confirmationId>` in every recovery email and SMS. It now
      // carries an expiring, single-use, order-bound token.
      //
      // LAZY + MEMOISED, deliberately. Issuing a token auto-revokes the
      // previous active one for the same (order, purpose) — so minting eagerly
      // for every lead on every cron tick would invalidate the link we emailed
      // minutes earlier. We mint at most one token per lead per run, and only
      // when a stage actually fires.
      let _resumeLink: string | null = null;
      const getResumeLink = async (): Promise<string> => {
        if (_resumeLink === null) {
          const issued = await issueResumeLink({
            supabaseUrl: SUPABASE_URL,
            serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
            siteUrl: SITE_URL,
            confirmationId: lead.confirmation_id as string,
            isPsd: letterType === "psd",
            purpose: "resume_assessment",
            ttlMinutes: 4320,
            createdBy: "lead-followup-sequence",
          });
          _resumeLink = issued.url;
        }
        return _resumeLink;
      };
      const firstName = (lead.first_name as string) || "";
      const petName = resolvePetName(lead.assessment_answers);
      const phone = ((lead.phone as string | null) ?? "").trim();
      const email = lead.email as string;
      const orderId = lead.id as string;
      const confirmationId = lead.confirmation_id as string;

      // ── 5-minute SMS recovery (independent of the email stage) ───────────────
      // Strict trigger: unpaid (already filtered above), age >= 5 min, has phone,
      // not SMS-opted-out, and not already sent. Idempotency uses an ATOMIC claim
      // (flip sms_5min_sent_at null -> now) so concurrent/repeated cron runs send
      // at most one 5-minute SMS per lead.
      //
      // LEAD-FOLLOWUP-SEQUENCE-SECURE-RESUME-REGRESSION-RECOVERY-001 — ORDERING.
      // The claim used to happen FIRST and the secure resume link was minted
      // afterwards. On LIVE the link call threw (an undeclared identifier), so
      // the claim survived and the SMS never went out: seven leads were
      // permanently stamped "sent" having received nothing, and because the
      // throw escaped the per-lead scope it aborted the whole run and stalled
      // every email stage too.
      //
      // Now: mint the link and render the message BEFORE claiming, so a link
      // failure costs nothing and is retried next tick; and if the sender
      // rejects the message, RELEASE the claim so the lead is retried rather
      // than silently written off. `sms_5min_sent_at` is left populated only
      // when the SMS was actually accepted.
      // Durable gate: never attempted, not delivered, not terminal, and past
      // next_retry_at. The cron still ticks every 15 min — that is only how
      // often it LOOKS, never how often a customer is contacted.
      //
      // DRY RUN (LEAD-FOLLOWUP-GHL-DELIVERY-...-002). Each stage's trigger is
      // hoisted into a single named const that BOTH the dry-run branch and the
      // real branch read. A dry run that re-derived its own predicates would be
      // free to disagree with the sender it is supposed to be predicting, which
      // is precisely the assurance we need before re-enabling the cron.
      // Age threshold, enabled state and template all come from the saved
      // configuration. A disabled or unconfigured stage is not "due" at all,
      // so it consumes no attempt and burns no retry slot.
      const smsStageDue =
        smsConfig.enabled && !!smsConfig.template &&
        ageMin >= smsConfig.stage1Minutes &&
        !lead.sms_5min_sent_at && !lead.sms_opted_out;
      let smsAttemptEligible = true;
      if (smsStageDue) {
        const { data: elig } = await supabase.rpc("sms_attempt_is_eligible", {
          p_order_id: orderId, p_stage: "sms_5min", p_channel: "sms",
        });
        smsAttemptEligible = elig !== false;
      }

      // A due stage with no usable destination is TERMINAL, recorded once,
      // WITHOUT a provider call and WITHOUT a communications row — nothing was
      // attempted, so there is nothing to log as an attempt. Previously the
      // phone condition sat in the trigger, so a phoneless lead was silently
      // re-evaluated on all 96 ticks a day and its state was never written
      // down anywhere an operator could see it.
      //
      // TRADE-OFF, deliberate: this suppresses the stage permanently, so a
      // phone number added or corrected AFTER this point will not trigger an
      // automatic recovery SMS. That is the specified behaviour ("missing
      // phone → terminal"); the Admin manual send remains available.
      const phoneUsable = normalizeE164(phone) !== "";
      if (smsStageDue && smsAttemptEligible && !phoneUsable && !dryRun) {
        await supabase.rpc("sms_attempt_record", {
          p_order_id: orderId,
          p_stage: "sms_5min",
          p_channel: "sms",
          p_delivered: false,
          p_permanent: true,
          p_provider_status: "not_attempted",
          p_provider_message_id: null,
          p_failure_code: phone ? "invalid_phone" : "missing_phone",
          p_failure_reason: phone
            ? "Phone number on the order is not a dialable E.164 number."
            : "No phone number on record for this customer.",
        });
        results.sms_send_failed++;
      }

      const smsWouldSend = smsStageDue && smsAttemptEligible && phoneUsable;
      if (smsWouldSend && dryRun) {
        plan.push({ confirmation_id: confirmationId, order_id: orderId, stage: "sms_5min", channel: "sms" });
      }
      if (smsWouldSend && !dryRun) {
        // 1. Build the message first. Nothing is claimed if this fails.
        let smsMsg: string | null = null;
        try {
          smsMsg = renderRecoverySms(smsConfig.template!, {
            firstName, petName, promoCode: smsConfig.promoCode,
            resumeUrl: await getResumeLink(),
          });
        } catch (linkErr) {
          results.sms_link_failed++;
          await writeAuditLog(supabase, {
            action: "sms_5min_link_failed",
            description: `5-min recovery SMS skipped for ${confirmationId} — secure resume link unavailable`,
            object_id: confirmationId,
            metadata: { order_id: orderId, step: "sms_5min", error: String((linkErr as Error)?.message ?? linkErr) },
          });
        }

        if (smsMsg !== null) {
          // 2. Atomic claim. The `.is(null)` predicate is the concurrency lock —
          //    unchanged, so two simultaneous runs still send at most one SMS.
          const claimTs = new Date().toISOString();
          const { data: claimed, error: claimErr } = await supabase
            .from("orders")
            .update({ sms_5min_sent_at: claimTs })
            .eq("id", orderId)
            .is("sms_5min_sent_at", null)
            .select("id");
          if (!claimErr && claimed && claimed.length > 0) {
            // 3. Send via the ONE canonical GHL path.
            const smsRes = await sendRecoverySms(supabase, {
              orderId, confirmationId, stage: "sms_5min", toPhone: phone, message: smsMsg,
            });
            await writeAuditLog(supabase, {
              action: "sms_5min_sent",
              description: `5-min recovery SMS ${smsRes.sent ? "sent" : "failed"} to order ${confirmationId}`,
              object_id: confirmationId,
              // The stable slug is NOT recorded here. It is a customer-facing
              // link that already lives in `communications.body`; duplicating
              // it into audit metadata spreads it for no operational gain.
              metadata: {
                order_id: orderId, sms_sent: smsRes.sent, step: "sms_5min",
                channel: "sms", provider: "ghl", outcome: smsRes.outcome,
                failure_code: smsRes.failureCode, error: smsRes.failureReason,
                idempotency_key: smsRes.idempotencyKey,
              },
            });
            // LEAD-FOLLOWUP-SMS-RETRY-LOOP-001 / -002: record the attempt
            // DURABLY. Classification now comes from the provider layer rather
            // than a regex over an error string: `permanent` means the identical
            // call cannot succeed (bad/missing number, DND, revoked credentials,
            // hard provider rejection) and goes TERMINAL immediately, while
            // `retryable` (timeout, 429, 5xx, network) gets the bounded
            // 60-minute → 360-minute → terminal backoff. Without this, the claim
            // release below makes a permanently failing send look "never
            // attempted" on the very next 15-minute tick.
            //
            // A duplicate-suppressed attempt is NOT recorded: nothing reached
            // the provider, so it must not consume a retry slot.
            if (!smsRes.duplicateSuppressed) {
              await supabase.rpc("sms_attempt_record", {
                p_order_id: orderId,
                p_stage: "sms_5min",
                p_channel: "sms",
                p_delivered: smsRes.sent === true,
                p_permanent: !smsRes.sent && smsRes.outcome === "permanent",
                p_provider_status: smsRes.sent ? "sent" : "failed",
                p_provider_message_id: smsRes.providerMessageId,
                p_failure_code: smsRes.sent ? null : smsRes.failureCode,
                p_failure_reason: smsRes.sent ? null : smsRes.failureReason,
              });
            }

            if (smsRes.sent) {
              results.sms_5min++;
            } else {
              // 4. Release OUR claim only — matched on the exact timestamp we
              //    wrote, so a claim another run legitimately took in the
              //    meantime can never be cleared by us. Safe to keep releasing:
              //    sms_sequence_attempts now gates re-eligibility.
              results.sms_send_failed++;
              await supabase
                .from("orders")
                .update({ sms_5min_sent_at: null })
                .eq("id", orderId)
                .eq("sms_5min_sent_at", claimTs);
            }
          } else {
            results.dedup_skipped++;
          }
        }
      }

      const step1Due = ageMin >= 5 && !lead.seq_30min_sent_at;
      if (step1Due && dryRun) {
        plan.push({ confirmation_id: confirmationId, order_id: orderId, stage: "seq_30min", channel: "email" });
      }
      if (step1Due && !dryRun) {
        const dbTmpl30 = await loadSeqTemplate(supabase, "seq_30min");
        const label = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl30
          ? dbTmpl30.subject.replace(/\{letter_type\}/g, label)
          : `Complete Your ${letterType === "psd" ? "PSD" : "ESA"} Letter — Your answers are saved`;
        const html30 = dbTmpl30
          ? buildEmailFromTemplate(dbTmpl30, { name: firstName, letter_type: label, resume_url: await getResumeLink(), petname: petName }, "Incomplete Application", `Your ${label} is waiting!`, "Your assessment answers have been saved — pick up where you left off", orderId, masterLayout)
          : build30MinEmail(firstName, await getResumeLink(), letterType, orderId);

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

      const step2Due = ageHours >= 24 && !lead.seq_24h_sent_at;
      if (step2Due && dryRun) {
        plan.push({ confirmation_id: confirmationId, order_id: orderId, stage: "seq_24h", channel: "email" });
      }
      if (step2Due && !dryRun) {
        const dbTmpl24 = await loadSeqTemplate(supabase, "seq_24h");
        const label24 = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl24
          ? dbTmpl24.subject.replace(/\{letter_type\}/g, label24)
          : `Still thinking? Get your ${letterType === "psd" ? "PSD" : "ESA"} letter today and avoid housing issues.`;
        const html24 = dbTmpl24
          ? buildEmailFromTemplate(dbTmpl24, { name: firstName, letter_type: label24, resume_url: await getResumeLink(), petname: petName }, "Still Thinking?", "Get your ESA letter today and avoid housing issues.", "Your assessment is saved — complete checkout in under 2 minutes", orderId, masterLayout)
          : build24hEmail(firstName, await getResumeLink(), letterType, orderId);

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

      const step3Due = ageDays >= 3 && !lead.seq_3day_sent_at;
      if (step3Due && dryRun) {
        plan.push({ confirmation_id: confirmationId, order_id: orderId, stage: "seq_3day", channel: "email" });
      }
      if (step3Due && !dryRun) {
        const dbTmpl3d = await loadSeqTemplate(supabase, "seq_3day");
        const label3d = letterType === "psd" ? "PSD Letter" : "ESA Letter";
        const subject = dbTmpl3d
          ? dbTmpl3d.subject.replace(/\{letter_type\}/g, label3d).replace(/\{discount_code\}/g, DISCOUNT_CODE)
          : `Here's $20 off your ${letterType === "psd" ? "PSD" : "ESA"} letter (limited time) — Discount code: ${DISCOUNT_CODE}`;
        const html3d = dbTmpl3d
          ? buildEmailFromTemplate(dbTmpl3d, { name: firstName, letter_type: label3d, resume_url: await getResumeLink(), discount_code: DISCOUNT_CODE, petname: petName }, "Limited Time Offer", `Here's $20 off your ${label3d}!`, "Exclusive discount — expires in 48 hours", orderId, masterLayout)
          : build3DayEmail(firstName, await getResumeLink(), letterType, orderId);

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

      // "No stage fired for this lead." On a DRY RUN every real branch is
      // gated off, so every lead reaches here and this counter would read
      // `skipped: <all of them>` next to a plan listing work to be done — the
      // two halves of the response contradicting each other. `plan` is the
      // dry run's only meaningful output; the send counters are not.
      if (!dryRun) results.skipped++;
    }

    const totalFired = results.step1_30min + results.step2_24h + results.step3_3day + results.sms_5min;
    if (!dryRun && (totalFired > 0 || results.dedup_skipped > 0)) {
      await writeAuditLog(supabase, {
        action: "seq_run_complete",
        description: `Sequence run: ${totalFired} sent, ${results.dedup_skipped} dedup-skipped — 5min-email: ${results.step1_30min}, sms-5min: ${results.sms_5min}, 24h: ${results.step2_24h}, 3day: ${results.step3_3day}`,
        object_id: "system",
        metadata: { ...results, total_leads: leads?.length ?? 0 },
      });
    }

    console.log(
      `[lead-followup-sequence] Run complete · source=${invocationSource} · processed=${leads?.length ?? 0} · results=`,
      results,
    );

    // Heartbeat — SUCCESS path. last_success_at is bumped so the admin
    // Settings panel can show "Last successful run X minutes ago" even on
    // runs where zero emails actually went out (no eligible leads).
    const finishedAtIso = new Date().toISOString();
    if (!dryRun) await heartbeat(supabase, {
      last_run_finished_at: finishedAtIso,
      last_success_at: finishedAtIso,
      last_invocation_source: invocationSource,
      last_results: results as unknown as Record<string, unknown>,
      last_processed: leads?.length ?? 0,
      // Clear the prior error message so the UI doesn't show a stale red banner
      // after a clean run. Keep last_error_at as a historical breadcrumb.
      last_error_message: null,
    });

    return dryRun
      ? { ok: true, processed: leads?.length ?? 0, results, dry_run: true, plan }
      : { ok: true, processed: leads?.length ?? 0, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[lead-followup-sequence] runLeadFollowupSequence error · source=${invocationSource} · ${msg}`,
    );

    // Heartbeat — ERROR path. last_error_at + last_error_message let the
    // admin UI flag a recent failure without anyone hunting through logs.
    const finishedAtIso = new Date().toISOString();
    if (!dryRun) await heartbeat(supabase, {
      last_run_finished_at: finishedAtIso,
      last_error_at: finishedAtIso,
      last_error_message: msg.slice(0, 1000),
      last_invocation_source: invocationSource,
    });

    return dryRun
      ? { ok: false, processed: 0, results: emptyResults(), error: msg, dry_run: true, plan }
      : { ok: false, processed: 0, results: emptyResults(), error: msg };
  }
}
