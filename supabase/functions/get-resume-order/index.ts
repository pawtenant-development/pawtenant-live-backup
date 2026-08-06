import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, RESUME_SUBJECT_LIMITS } from "../_shared/rateLimit.ts";

/** sha256 hex — used only to keep a confirmation reference out of the limiter. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const stripped = raw.trim().replace(/[\s\-().]/g, "");
  if (/^\+\d{10,15}$/.test(stripped)) return stripped;
  const digitsOnly = stripped.replace(/\D/g, "");
  if (digitsOnly.length === 0) return "";
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

function isAlreadyPaid(
  order: { payment_intent_id?: string | null; paid_at?: string | null } | null | undefined
): boolean {
  return !!(order?.payment_intent_id || order?.paid_at);
}

// ── ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001 ───────────────────────────────
// LOCKED SECURITY RULE: this endpoint is reachable with the PUBLIC anon key
// (verify_jwt=true, but every browser holds that key), so its request body is
// ATTACKER-CONTROLLED. It must therefore never be able to establish payment.
//
// Previously the ESA/PSD checkouts POSTed `paidAt: new Date().toISOString()`
// (a BROWSER clock value) plus `paymentIntentId` and `status: "processing"`,
// and this function wrote all three straight onto the order row. Because
// trigger `orders_entitlement_snapshot_on_paid` fires on
// (old.paid_at IS NULL AND new.paid_at IS NOT NULL) and mints an IMMUTABLE
// entitlement snapshot whose FIRST classification wins permanently, a forged
// request could mark an unpaid order paid, freeze the wrong package
// entitlement, and diverge payment state from Stripe forever.
//
// Payment evidence is now owned exclusively by server-side paths:
//   • stripe-webhook          — Stripe-signature-verified (primary)
//   • check-payment-status    — server-side Stripe retrieve, identifier-bound
//   • fix-order-payment       — admin-authenticated manual reconciliation
//
// This function still owns the NON-payment columns (contact, assessment,
// attribution, coupon hint). For a payment-shaped request it now DELEGATES to
// check-payment-status instead of writing payment state itself.
//
// Columns this function must NEVER write (see scripts/check-resume-payment-authority.mjs):
//   paid_at, payment_intent_id, checkout_session_id, subscription_id,
//   package_key, billing_plan, selected_provider→provider assignment, letter_url
const CLIENT_FORBIDDEN_PAYMENT_COLUMNS = [
  "paid_at",
  "payment_intent_id",
  "checkout_session_id",
  "subscription_id",
] as const;

// Statuses a CLIENT request may set. Anything else — notably the paid workflow
// statuses ("processing", "completed") the checkout used to send — is ignored;
// the authoritative payment writers set those alongside paid_at.
const CLIENT_SETTABLE_STATUSES = new Set(["lead"]);

/**
 * Fail-closed assertion that no forbidden payment column ever reaches the
 * orders upsert from this function. A programming mistake here is a security
 * incident, so we refuse the whole write rather than let it through.
 */
function assertNoClientPaymentColumns(payload: Record<string, unknown>): void {
  const leaked = CLIENT_FORBIDDEN_PAYMENT_COLUMNS.filter((c) => c in payload);
  if (leaked.length > 0) {
    throw new Error(
      `[get-resume-order] refusing upsert: client-derived payment column(s) present: ${leaked.join(", ")}`
    );
  }
}

// ── BATCH-0.2A: attribution "meaningfulness" test ────────────────────────
// A touch snapshot is "meaningful" when it carries real attribution evidence:
// a paid click id, a valid utm source/campaign, or a known non-direct
// channel/referrer. Used to protect a meaningful last_touch_json from being
// erased by a direct/empty return visit (documented precedence in the upsert).
function isUnresolvedMacro(s: string): boolean {
  const t = s.trim();
  return /^\{\{[^{}]*\}\}$/.test(t) || /^\{[a-z0-9_.:+-]+\}$/i.test(t);
}
function isRealValue(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0 && !isUnresolvedMacro(v);
}
function isMeaningfulTouch(touch: unknown): boolean {
  if (!touch || typeof touch !== "object") return false;
  const t = touch as Record<string, unknown>;
  const clickIds = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid"];
  if (clickIds.some((k) => isRealValue(t[k]))) return true;
  if (isRealValue(t.utm_source) || isRealValue(t.utm_campaign)) return true;
  const dead = new Set(["", "direct", "none", "unknown", "(direct)", "(none)"]);
  const ch = typeof t.channel === "string" ? t.channel.trim().toLowerCase() : "";
  if (ch && !dead.has(ch)) return true;
  const fs = typeof t.fullSource === "string" ? t.fullSource.trim().toLowerCase() : "";
  if (fs && !dead.has(fs)) return true;
  return false;
}

async function fireGHLServerSide(opts: {
  supabase: ReturnType<typeof createClient>;
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  letterType: string;
  status: string;
  event: string;
  serviceKey: string;
}): Promise<void> {
  try {
    const ghlPayload = {
      webhookType: "assessment",
      event: opts.event,
      firstName: opts.firstName,
      lastName: opts.lastName,
      email: opts.email,
      phone: opts.phone,
      state: opts.state,
      confirmationId: opts.confirmationId,
      letterType: opts.letterType,
      leadSource: "ESA Assessment Form",
      submittedAt: new Date().toISOString(),
    };

    const ghlRes = await fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.serviceKey}`,
      },
      body: JSON.stringify(ghlPayload),
    });

    const ghlBody = await ghlRes.text();
    const ghlOk = ghlRes.ok;

    await opts.supabase
      .from("orders")
      .update({
        ghl_synced_at: ghlOk ? new Date().toISOString() : null,
        ghl_sync_error: ghlOk ? null : `HTTP ${ghlRes.status}: ${ghlBody.slice(0, 400)}`,
      })
      .eq("confirmation_id", opts.confirmationId);

    if (!ghlOk) {
      console.warn(
        `[get-resume-order] GHL sync failed for ${opts.confirmationId}: HTTP ${ghlRes.status} — ${ghlBody.slice(0, 200)}`
      );
    } else {
      console.info(`[get-resume-order] GHL sync OK for ${opts.confirmationId} (event=${opts.event})`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[get-resume-order] GHL sync threw for ${opts.confirmationId}: ${msg}`);
    try {
      await opts.supabase
        .from("orders")
        .update({
          ghl_sync_error: `GHL proxy error: ${msg.slice(0, 400)}`,
        })
        .eq("confirmation_id", opts.confirmationId);
    } catch {
      // best-effort only
    }
  }
}

/**
 * Resolve who should receive the "Unpaid Lead / Abandoned Checkout" admin alert.
 * Single source of truth = the admin_notification_prefs settings (resolved by the
 * get-admin-notif-recipients edge function, key "unpaid_lead").
 *
 * NO hardcoded staff-email fallback. If the resolver is disabled, returns no
 * recipients, or errors, we send to NOBODY. Empty recipients => skip the send.
 */
async function resolveUnpaidLeadRecipients(): Promise<{ enabled: boolean; recipients: string[] }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ notificationKey: "unpaid_lead" }),
    });
    if (!res.ok) {
      console.warn(
        `[get-resume-order] recipient resolver returned HTTP ${res.status} — suppressing unpaid-lead alert (no fallback)`
      );
      return { enabled: false, recipients: [] };
    }
    const data = (await res.json()) as { enabled?: boolean; recipients?: unknown };
    const recipients = Array.isArray(data?.recipients)
      ? (data.recipients as unknown[]).filter(
          (e): e is string => typeof e === "string" && e.includes("@")
        )
      : [];
    return { enabled: data?.enabled !== false, recipients };
  } catch (err) {
    console.warn(
      "[get-resume-order] recipient resolver error — suppressing unpaid-lead alert (no fallback):",
      err
    );
    return { enabled: false, recipients: [] };
  }
}

// ── ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001 ───────────────────────────────
/**
 * PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001.
 *
 * "Blank" for the purposes of refusing an overwrite. Covers the three shapes a
 * reset client actually sends:
 *   • ""  / null / undefined            — every scalar question default
 *   • [] / {}                            — multi-select and object defaults
 *   • [{name:"",age:"",breed:"",...}]    — the SYNTHESISED pet placeholder the
 *     stable-checkout resume builds from a pet COUNT, which looks populated
 *     (right length, right keys) but carries no information at all. This one
 *     is the whole reason a naive `!value` check is not enough.
 */
function isBlankAnswer(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0 || v.every((el) => isBlankAnswer(el));
  if (typeof v === "object") {
    const vals = Object.values(v as Record<string, unknown>);
    return vals.length === 0 || vals.every((el) => isBlankAnswer(el));
  }
  return false; // numbers and booleans are real answers, including 0 and false
}

/**
 * Merge incoming assessment answers over the stored ones without ever letting a
 * blank erase a real answer.
 *
 * Returns the merged object. Logs a COUNT of refused erasures — never the keys'
 * values, which are mental-health intake and must not reach logs.
 */
function mergeAssessmentAnswers(
  stored: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  confirmationId: string,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    stored && typeof stored === "object" && !Array.isArray(stored) ? { ...stored } : {};
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;

  let refused = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (isBlankAnswer(value) && !isBlankAnswer(base[key])) {
      refused++;               // stored answer survives
      continue;
    }
    base[key] = value;
  }

  if (refused > 0) {
    // Loud on purpose: a non-zero count means a client just tried to erase
    // clinical answers, which is the signature of a resume path that reset its
    // own state. Silence here is what let this run undetected.
    console.warn(
      `[get-resume-order] MERGE PROTECTED ${refused} stored answer field(s) from blank overwrite for ${confirmationId}`,
    );
  }
  return base;
}

/**
 * Security telemetry. Written best-effort and DEDUPED per order+action so the
 * thank-you page's normal polling cannot flood audit_logs. Never stores the
 * Stripe secret, the Authorization header, or any card/payment-method detail.
 */
async function logSecurityEvent(
  supabase: ReturnType<typeof createClient>,
  action: string,
  confirmationId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const { count } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", action)
      .eq("object_id", confirmationId);
    if ((count ?? 0) > 0) return; // already recorded once for this order

    await supabase.from("audit_logs").insert({
      action,
      object_type: "order",
      object_id: confirmationId,
      actor_name: "get-resume-order",
      actor_role: "service",
      description: `[ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001] ${action} for ${confirmationId}`,
      metadata: { ...metadata, confirmation_id: confirmationId, source: "get_resume_order" },
    });
  } catch {
    // Telemetry must never block or fail the request.
  }
}

/**
 * Delegate payment reconciliation to the AUTHORITATIVE server-side reconciler.
 *
 * This function does not verify payment itself and does not write payment
 * columns. check-payment-status performs the server-side Stripe retrieve and
 * only reconciles when the Stripe object is genuinely paid AND is bound to
 * THIS order by an identifier our own server stamped (stored
 * checkout_session_id / payment_intent_id, or Stripe metadata.confirmation_id).
 *
 * `clientPaymentIntentHint` is an UNVERIFIED, attacker-controllable value. It
 * is forwarded only as a lookup hint; check-payment-status is responsible for
 * proving the binding and refuses on mismatch. A forged hint therefore cannot
 * mark anything paid — it can only fail to reconcile.
 */
async function delegatePaymentReconciliation(opts: {
  confirmationId: string;
  clientPaymentIntentHint: string | null;
}): Promise<{
  state: "payment_confirmed" | "already_paid" | "payment_confirmation_pending";
  reconciled: boolean;
}> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/check-payment-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        confirmationId: opts.confirmationId,
        // Forwarded as an unverified hint only — see the doc comment above.
        ...(opts.clientPaymentIntentHint
          ? { paymentIntentId: opts.clientPaymentIntentHint }
          : {}),
      }),
    });

    if (!res.ok) {
      console.warn(
        `[get-resume-order] reconciler returned HTTP ${res.status} for ${opts.confirmationId} — leaving order UNPAID`
      );
      return { state: "payment_confirmation_pending", reconciled: false };
    }

    const data = (await res.json()) as {
      paid?: boolean;
      reconciled?: boolean;
      source?: string;
    };

    if (data?.paid === true) {
      return {
        state: data.source === "db_already_paid" ? "already_paid" : "payment_confirmed",
        reconciled: data.reconciled === true,
      };
    }
    return { state: "payment_confirmation_pending", reconciled: false };
  } catch (err) {
    // Fail CLOSED: an unreachable reconciler means "not confirmed yet", never
    // "paid". The Stripe webhook remains the safety net.
    console.warn(
      `[get-resume-order] reconciler error for ${opts.confirmationId} — leaving order UNPAID:`,
      err instanceof Error ? err.message : String(err)
    );
    return { state: "payment_confirmation_pending", reconciled: false };
  }
}

function buildUnpaidLeadHtml(opts: {
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  letterType: string;
  deliverySpeed: string;
  timestamp: string;
}): string {
  const rows = [
    ["Order ID", opts.confirmationId],
    ["Name", `${opts.firstName} ${opts.lastName}`.trim() || "—"],
    ["Email", opts.email],
    ["Phone", opts.phone || "—"],
    ["State", opts.state || "—"],
    ["Service", opts.letterType === "psd" ? "PSD Letter" : "ESA Letter"],
    ["Delivery", opts.deliverySpeed === "2-3days" ? "Standard (2-3 days)" : "Priority (24h)"],
    ["Status", "UNPAID — Assessment Completed"],
    ["Time", opts.timestamp],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;font-weight:600;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#f97316;padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 14px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.25);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">NEW UNPAID LEAD</div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Assessment Completed — Awaiting Payment</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">A new lead has completed their assessment but has <strong>not yet paid</strong>. Consider sending a follow-up or recovery email.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            ${rowsHtml}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;margin-right:12px;">Open Admin Portal &rarr;</a>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant Internal Notification &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json()) as {
      confirmationId?: string;
      action?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      state?: string;
      deliverySpeed?: string;
      assessmentAnswers?: Record<string, unknown>;
      letterType?: string;
      status?: string;
      paymentIntentId?: string;
      price?: number;
      planType?: string;
      referredBy?: string;
      // ── LEGACY / IGNORED (ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001) ──────
      // Still ACCEPTED for backward compatibility with any already-deployed
      // frontend bundle, but NEVER read, parsed, or written. A browser clock is
      // not payment evidence. Do not reintroduce a read of this field.
      paidAt?: string;
      paymentMethod?: string;
      couponCode?: string;
      couponDiscount?: number;
      selectedProvider?: string;
      addonServices?: string[];
      gclid?: string;
      fbclid?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmTerm?: string;
      utmContent?: string;
      landingUrl?: string;
      attributionJson?: Record<string, unknown>;
      gbraid?: string;
      wbraid?: string;
      sessionId?: string;
      firstTouchJson?: Record<string, unknown>;
      lastTouchJson?: Record<string, unknown>;
      suppressLeadNotification?: boolean;
      skipGhlSync?: boolean;
    };

    const { confirmationId, action } = body;

    if (!confirmationId) {
      return new Response(
        JSON.stringify({ ok: false, error: "confirmationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "upsert") {
      const normalizedPhone = normalizePhone(body.phone);
      const normalizedEmail = (body.email ?? "").trim().toLowerCase();
      // SHAPE detection only — NOT payment evidence. This flag decides routing
      // (don't create a row, don't fire the lead notification / GHL lead event)
      // and never authorizes a payment write.
      // ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001
      const isPaymentUpsert = !!body.paymentIntentId || !!body.paidAt;
      const clientClaimedPaid =
        !!body.paidAt ||
        body.status === "processing" ||
        body.status === "completed" ||
        (body as { paid?: unknown }).paid === true ||
        (body as { payment_status?: unknown }).payment_status === "succeeded" ||
        (body as { paid_at?: unknown }).paid_at !== undefined;

      // ── Step 1: Resolve the canonical order row ──────────────────────────
      // Priority:
      //   1. existing row with this confirmation_id
      //   2. (payment upserts only) existing row with this payment_intent_id
      //   3. existing UNPAID row with the same email (lead carry-over)
      //   4. none — create new row (lead only; payment upserts refuse)

      const { data: byConfId, error: byConfIdErr } = await supabase
        .from("orders")
        .select(
          "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider, session_id, first_touch_json, last_touch_json, referred_by, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_url, attribution_json, coupon_code, coupon_discount, assessment_answers"
        )
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (byConfIdErr) {
        console.error("[get-resume-order] failed to fetch existing order:", byConfIdErr.message);
        return new Response(
          JSON.stringify({ ok: false, error: byConfIdErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let existingOrder = byConfId;
      let effectiveConfirmationId = confirmationId;
      let matchedBy: "confirmation_id" | "payment_intent_id" | "email" | "new" = byConfId
        ? "confirmation_id"
        : "new";

      // 2. Payment upsert fallback: match by payment_intent_id (webhook may have written first)
      if (!existingOrder && isPaymentUpsert && body.paymentIntentId) {
        const { data: byPi } = await supabase
          .from("orders")
          .select(
            "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider, session_id, first_touch_json, last_touch_json, referred_by, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_url, attribution_json, coupon_code, coupon_discount, assessment_answers"
          )
          .eq("payment_intent_id", body.paymentIntentId)
          .maybeSingle();
        if (byPi) {
          existingOrder = byPi;
          effectiveConfirmationId = byPi.confirmation_id as string;
          matchedBy = "payment_intent_id";
          console.info(
            `[get-resume-order] matched by payment_intent_id: ${body.paymentIntentId} -> ${effectiveConfirmationId}`
          );
        }
      }

      // 3. Email fallback — applies to BOTH lead and payment upserts
      //    For PAID-email matches we still block (different user must use different email).
      //    For UNPAID-email matches we reuse the existing row.
      if (!existingOrder && normalizedEmail) {
        const { data: byEmail } = await supabase
          .from("orders")
          .select(
            "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider, session_id, first_touch_json, last_touch_json, referred_by, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_url, attribution_json, coupon_code, coupon_discount, assessment_answers"
          )
          .ilike("email", normalizedEmail)
          .not("status", "in", `("refunded","cancelled")`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byEmail) {
          if (isAlreadyPaid(byEmail) && !isPaymentUpsert) {
            // Lead save attempted against an email that already has a paid order — block
            console.warn(
              `[get-resume-order] Email conflict (paid): ${normalizedEmail} already has order ${byEmail.confirmation_id}`
            );
            return new Response(
              JSON.stringify({
                ok: false,
                error: "An order already exists for this email. Please use a different email.",
                emailConflict: true,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (isAlreadyPaid(byEmail) && isPaymentUpsert) {
            // Payment upsert against an already-paid email row with a different PI
            const incomingPi = body.paymentIntentId ?? null;
            if (incomingPi && byEmail.payment_intent_id && byEmail.payment_intent_id !== incomingPi) {
              console.error(
                `[get-resume-order] payment conflict (email): ${normalizedEmail} already paid with PI ${byEmail.payment_intent_id}, incoming PI ${incomingPi}`
              );
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: "Order already paid with a different payment intent",
                  alreadyPaid: true,
                  confirmationId: byEmail.confirmation_id,
                }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          existingOrder = byEmail;
          effectiveConfirmationId = byEmail.confirmation_id as string;
          matchedBy = "email";
          console.info(
            `[get-resume-order] matched by email: ${normalizedEmail} -> ${effectiveConfirmationId} (status=${byEmail.status})`
          );
        }
      }

      // 4. Payment upserts MUST NEVER create a new row
      if (isPaymentUpsert && !existingOrder) {
        console.error(
          `[get-resume-order] payment upsert refused — no existing row for ${confirmationId} / PI ${body.paymentIntentId ?? "none"} / email ${normalizedEmail || "none"}`
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              "Cannot record payment: no existing order found for this confirmation_id, payment_intent_id, or email. Lead must be saved before payment.",
            missingOrder: true,
            confirmationId,
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Step 2: Idempotent / conflict checks for payment upserts ─────────
      if (isPaymentUpsert && existingOrder) {
        const existingPi = existingOrder.payment_intent_id ?? null;
        const incomingPi = body.paymentIntentId ?? null;
        const alreadyPaid = isAlreadyPaid(existingOrder);

        if (alreadyPaid && existingPi && incomingPi && existingPi === incomingPi) {
          console.info(`[get-resume-order] idempotent payment upsert for ${effectiveConfirmationId}`);
          return new Response(
            JSON.stringify({
              ok: true,
              alreadyPaid: true,
              idempotent: true,
              confirmationId: effectiveConfirmationId,
              matchedBy,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (alreadyPaid && existingPi && incomingPi && existingPi !== incomingPi) {
          console.error(
            `[get-resume-order] payment conflict for ${effectiveConfirmationId}: existing PI ${existingPi}, incoming PI ${incomingPi}`
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Order already paid with a different payment intent",
              alreadyPaid: true,
              confirmationId: effectiveConfirmationId,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const isNewOrder = matchedBy === "new";

      // ── Step 3: Build and execute upsert ─────────────────────────────────
      const upsertPayload: Record<string, unknown> = {
        confirmation_id: effectiveConfirmationId,
        user_id: null,
      };

      if (body.email !== undefined) upsertPayload.email = body.email;
      if (body.firstName !== undefined) upsertPayload.first_name = body.firstName;
      if (body.lastName !== undefined) upsertPayload.last_name = body.lastName;
      if (body.phone !== undefined) upsertPayload.phone = normalizedPhone || body.phone;
      if (body.state !== undefined) upsertPayload.state = body.state;
      if (body.deliverySpeed !== undefined) upsertPayload.delivery_speed = body.deliverySpeed;
      if (body.letterType !== undefined) upsertPayload.letter_type = body.letterType;
      // ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001: a client may only set a
      // NON-paid status. The checkout used to send status:"processing" with the
      // forged paidAt; "processing" is a PAID workflow status and is now set
      // exclusively by the authoritative payment writers, together with paid_at.
      if (body.status !== undefined) {
        if (CLIENT_SETTABLE_STATUSES.has(body.status)) {
          upsertPayload.status = body.status;
        } else {
          console.info(
            `[get-resume-order] ignoring client-supplied status "${body.status}" for ${effectiveConfirmationId} — not client-settable`
          );
        }
      }
      // ── PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001 ──────────────
      // This line used to be a WHOLESALE REPLACE:
      //     upsertPayload.assessment_answers = body.assessmentAnswers;
      // which made the client the sole authority over the entire clinical
      // record. Combined with resume paths that reset the client's in-memory
      // answers to defaults, one step-2 submit destroyed a completed PSD
      // intake: 22 answered clinical fields collapsed to 3 on LIVE order
      // PT-PSDCUFKXQ61, and the same payload reproduced it exactly on TEST.
      //
      // The stored answers are now MERGED, under one rule: a blank incoming
      // value may never overwrite a stored non-blank one. Real edits still
      // win — this only refuses erasure.
      //
      // Deliberate trade-off: a customer cannot blank an already-answered
      // field through this endpoint. That is not reachable in the UI anyway
      // (radios/selects can only be changed to another option, and the free
      // text fields carry minimum-length validation), and refusing a silent
      // erasure of mental-health intake is worth more than supporting a
      // clear-to-empty no one can perform.
      //
      // This mirrors the STICKY attribution rule already enforced below, and
      // exists for the same reason: a later save arriving with less context
      // than an earlier one must not be allowed to win.
      if (body.assessmentAnswers !== undefined) {
        upsertPayload.assessment_answers = mergeAssessmentAnswers(
          existingOrder?.assessment_answers as Record<string, unknown> | null | undefined,
          body.assessmentAnswers,
          effectiveConfirmationId,
        );
      }
      if (body.price !== undefined) upsertPayload.price = body.price;
      if (body.planType !== undefined) upsertPayload.plan_type = body.planType;
      if (body.paymentMethod !== undefined) upsertPayload.payment_method = body.paymentMethod;
      if (body.selectedProvider !== undefined) upsertPayload.selected_provider = body.selectedProvider;
      if (body.addonServices !== undefined) upsertPayload.addon_services = body.addonServices;
      // ── 2026-05-19 ATTR-RESUME-LINK-CANONICAL-SOURCE ────────────────────
      // The flat attribution columns (referred_by, gclid, fbclid, utm_*,
      // landing_url, attribution_json) are now STICKY: written on the
      // initial lead save and never overwritten on subsequent upserts.
      //
      // Without this, when a visitor lands via Facebook, fills assessment
      // Step 2, abandons, then resumes payment via /r/manual?o=<conf>,
      // the resume save sent the current-tab attribution (which has been
      // reset because /r/manual has no UTM/click-id) and clobbered the
      // original Facebook attribution. Order list still classified the
      // row correctly via first_touch_json (which was already sticky),
      // but OrderDetailModal's "Referred By" badge reads from
      // orders.referred_by and was showing "Referral"/"Direct".
      //
      // first_touch_json (handled below) is the canonical first-touch
      // snapshot. These flat columns are denormalized first-touch
      // fields kept for backward compat with the OrderCard classifier
      // and OrderDetailModal Referred By pill.
      const stickyAttrSet = (
        bodyVal: string | undefined | null,
        existing: unknown,
        colKey: string,
      ): void => {
        if (bodyVal === undefined) return;
        if (bodyVal === null) return;
        if (typeof bodyVal === "string" && bodyVal.length === 0) return;
        if (existing !== null && existing !== undefined && existing !== "") return;
        upsertPayload[colKey] = bodyVal;
      };
      stickyAttrSet(body.gclid,        existingOrder?.gclid,        "gclid");
      stickyAttrSet(body.fbclid,       existingOrder?.fbclid,       "fbclid");
      stickyAttrSet(body.utmSource,    existingOrder?.utm_source,   "utm_source");
      stickyAttrSet(body.utmMedium,    existingOrder?.utm_medium,   "utm_medium");
      stickyAttrSet(body.utmCampaign,  existingOrder?.utm_campaign, "utm_campaign");
      stickyAttrSet(body.utmTerm,      existingOrder?.utm_term,     "utm_term");
      stickyAttrSet(body.utmContent,   existingOrder?.utm_content,  "utm_content");
      stickyAttrSet(body.landingUrl,   existingOrder?.landing_url,  "landing_url");
      stickyAttrSet(body.referredBy,   existingOrder?.referred_by,  "referred_by");

      // ── BATCH-0.2A: gbraid / wbraid (Google Ads click ids) ───────────────
      // The assessment/PSD clients send these nested inside the touch snapshots
      // (first_touch_json / attribution_json / last_touch_json) rather than as
      // flat top-level fields, so derive the scalar from there (a flat body.gbraid
      // / body.wbraid is also honored for forward-compat). Same STICKY rule as
      // gclid: written on first capture, never overwritten — so gclid/gbraid/wbraid
      // coexist and none clobbers another.
      const deriveTouchStr = (key: "gbraid" | "wbraid"): string | undefined => {
        const flat = body[key];
        if (typeof flat === "string" && flat.trim() !== "") return flat;
        const fromJson = (src: unknown): string | undefined => {
          if (!src || typeof src !== "object") return undefined;
          const val = (src as Record<string, unknown>)[key];
          return typeof val === "string" && val.trim() !== "" ? val : undefined;
        };
        return (
          fromJson(body.firstTouchJson) ??
          fromJson(body.attributionJson) ??
          fromJson(body.lastTouchJson)
        );
      };
      stickyAttrSet(deriveTouchStr("gbraid"), existingOrder?.gbraid, "gbraid");
      stickyAttrSet(deriveTouchStr("wbraid"), existingOrder?.wbraid, "wbraid");

      // attribution_json: same sticky rule but uses jsonb-shaped check
      // (an empty object {} still counts as "present" — we do not want
      // to flip a deliberate empty snapshot back to a populated one).
      if (
        body.attributionJson !== undefined &&
        body.attributionJson !== null &&
        (existingOrder?.attribution_json === null ||
          existingOrder?.attribution_json === undefined)
      ) {
        upsertPayload.attribution_json = body.attributionJson;
      }

      // ── Visitor session linkage + dual-touch attribution snapshots ───────
      // Previously the client at /assessment was already POSTing sessionId,
      // firstTouchJson, lastTouchJson — but this edge function silently
      // dropped them, so orders.session_id always stayed NULL and the admin
      // Attribution/Journey tab showed "No session_id linked on this order."
      //
      // Semantics:
      //   - session_id:        first writer wins. Once stamped on a row, a
      //                         subsequent lead-save from the same browser
      //                         (or any later upsert path) will not change it.
      //   - first_touch_json:  sticky. Set when missing; never overwritten.
      //                         This is the canonical "where did this lead
      //                         originally come from" snapshot.
      //   - last_touch_json:   most-recent campaign touch. Overwritable on
      //                         every upsert so revisits with a fresh utm
      //                         update the last-touch correctly.
      //
      // existingOrder may be null on isNewOrder — in that case every field
      // writes through unconditionally.
      const existingSessionId    = existingOrder?.session_id ?? null;
      const existingFirstTouch   = existingOrder?.first_touch_json ?? null;

      if (
        body.sessionId !== undefined &&
        body.sessionId !== null &&
        body.sessionId !== "" &&
        !existingSessionId
      ) {
        upsertPayload.session_id = body.sessionId;
      }
      if (
        body.firstTouchJson !== undefined &&
        body.firstTouchJson !== null &&
        !existingFirstTouch
      ) {
        upsertPayload.first_touch_json = body.firstTouchJson;
      }
      // ── BATCH-0.2A: last_touch_json overwrite guard ─────────────────────
      // last_touch_json is the MOST-RECENT campaign touch and normally updates on
      // revisits with a fresh utm/click id. But a direct / empty return visit
      // (resume via /r/manual, or a later organic revisit whose click ids have
      // expired) must NOT erase a meaningful paid/campaign last-touch already on
      // the row.
      //
      // Documented precedence — overwrite the existing last_touch_json ONLY when:
      //   (a) there is no existing last_touch_json yet, OR
      //   (b) the existing last_touch_json is itself NOT meaningful (direct/empty), OR
      //   (c) the INCOMING touch IS meaningful (a genuinely newer attributable
      //       touch: real paid click id, valid utm source/campaign, or a known
      //       non-direct channel/referrer).
      // The ONLY blocked case is: existing IS meaningful AND incoming is NOT.
      // This never freezes last-touch permanently — a real newer attributable
      // touch always wins.
      if (body.lastTouchJson !== undefined && body.lastTouchJson !== null) {
        const existingLast = existingOrder?.last_touch_json ?? null;
        if (
          !existingLast ||
          !isMeaningfulTouch(existingLast) ||
          isMeaningfulTouch(body.lastTouchJson)
        ) {
          upsertPayload.last_touch_json = body.lastTouchJson;
        } else {
          console.info(
            `[get-resume-order] last_touch_json overwrite SKIPPED for ${effectiveConfirmationId}: incoming touch is direct/empty and would erase a meaningful last-touch`
          );
        }
      }

      // ── ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001 ────────────────────────
      // REMOVED (deliberately, do not restore):
      //
      //   if (body.paymentIntentId ...) upsertPayload.payment_intent_id = body.paymentIntentId;
      //   if (body.paidAt ...)          upsertPayload.paid_at          = body.paidAt;
      //
      // Both values came from the browser. `paid_at` was a browser clock
      // reading, and writing it fired orders_entitlement_snapshot_on_paid,
      // permanently freezing an entitlement snapshot for an order Stripe had
      // never confirmed. `payment_intent_id` made isAlreadyPaid() true, which
      // additionally let a forged value block the customer's own real checkout
      // (create-payment-intent refuses an "already paid" order).
      //
      // Payment columns are now written ONLY by stripe-webhook (signature
      // verified), check-payment-status (server-side Stripe retrieve, bound to
      // this order by a server-stamped identifier), and fix-order-payment
      // (admin authenticated). See the delegation block after the upsert.

      // ── PSD-DUP-FIX: coupon fields via the safe server path ──────────────
      // The PSD checkout previously persisted coupon_code/coupon_discount via
      // a raw client-side orders.upsert AFTER payment — the same legacy call
      // that created duplicate paid rows when the browser confirmation_id
      // diverged from the canonical lead row. That raw upsert is removed;
      // coupon fields now flow through here instead. STICKY: the webhook's
      // backend-verified values (from PI metadata) always win — never
      // overwrite an already-recorded coupon.
      if (
        body.couponCode !== undefined &&
        body.couponCode !== null &&
        body.couponCode !== "" &&
        !existingOrder?.coupon_code
      ) {
        upsertPayload.coupon_code = body.couponCode;
        if (typeof body.couponDiscount === "number" && body.couponDiscount > 0) {
          upsertPayload.coupon_discount = body.couponDiscount;
        }
      }

      // letter_url intentionally never set here — only provider uploads set it.

      // Fail-closed backstop: refuse the write outright if any client-derived
      // payment column ever reaches this point. (ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001)
      assertNoClientPaymentColumns(upsertPayload);

      const { error: upsertError } = await supabase
        .from("orders")
        .upsert(upsertPayload, { onConflict: "confirmation_id", ignoreDuplicates: false });

      if (upsertError) {
        console.error("[get-resume-order] upsert failed:", upsertError.message);
        return new Response(
          JSON.stringify({ ok: false, error: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Step 4: Side effects (GHL, lead notification) ────────────────────
      const isLeadSave = !isPaymentUpsert && !body.skipGhlSync;
      const phoneForGhl = normalizedPhone || body.phone || existingOrder?.phone || "";
      const emailForGhl = body.email ?? existingOrder?.email ?? "";
      const firstNameForGhl = body.firstName ?? existingOrder?.first_name ?? "";
      const lastNameForGhl = body.lastName ?? existingOrder?.last_name ?? "";
      const stateForGhl = body.state ?? existingOrder?.state ?? "";
      const letterTypeForGhl = body.letterType ?? existingOrder?.letter_type ?? "esa";

      if (isLeadSave && emailForGhl) {
        fireGHLServerSide({
          supabase,
          confirmationId: effectiveConfirmationId,
          firstName: firstNameForGhl,
          lastName: lastNameForGhl,
          email: emailForGhl,
          phone: phoneForGhl,
          state: stateForGhl,
          letterType: letterTypeForGhl,
          status: body.status ?? "lead",
          event: "assessment_started",
          serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        }).catch((err) => {
          console.warn("[get-resume-order] GHL fire error:", err);
        });
      }

      const shouldNotify =
        isNewOrder &&
        !body.suppressLeadNotification &&
        !isPaymentUpsert &&
        (body.email || "").trim() !== "" &&
        RESEND_API_KEY;

      if (shouldNotify) {
        try {
          // ── RECIPIENT FIX (2026-06-16, LIVE) ─────────────────────────────
          // Previously this sent to a hardcoded INTERNAL_NOTIFICATION_EMAIL
          // ("eservices.dm@gmail.com"), ignoring the Admin > Settings >
          // Notifications "Unpaid Lead / Abandoned Checkout" recipient list.
          // Now we resolve recipients from admin_notification_prefs. If the
          // notification is disabled OR has no configured recipient, we send
          // to NOBODY (no fallback). Customer-facing emails are unaffected.
          const { enabled, recipients } = await resolveUnpaidLeadRecipients();

          if (!enabled) {
            console.info(
              `[get-resume-order] unpaid_lead notification is DISABLED in settings — no admin alert sent for ${effectiveConfirmationId}`
            );
          } else if (recipients.length === 0) {
            console.info(
              `[get-resume-order] no recipient configured for unpaid_lead — no admin alert sent for ${effectiveConfirmationId}`
            );
          } else {
            const emailData = body.email || "";
            const firstNameData = body.firstName || "";
            const lastNameData = body.lastName || "";
            const phoneData = normalizedPhone || body.phone || "";
            const stateData = body.state || "";
            const letterTypeData = body.letterType || "esa";
            const deliveryData = body.deliverySpeed || "2-3days";
            const timestamp =
              new Date().toLocaleString("en-US", {
                timeZone: "America/New_York",
                dateStyle: "medium",
                timeStyle: "short",
              }) + " ET";

            const html = buildUnpaidLeadHtml({
              confirmationId: effectiveConfirmationId,
              firstName: firstNameData,
              lastName: lastNameData,
              email: emailData,
              phone: phoneData,
              state: stateData,
              letterType: letterTypeData,
              deliverySpeed: deliveryData,
              timestamp,
            });

            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: FROM_EMAIL,
                to: recipients,
                subject: `[PawTenant] New Unpaid Lead — ${effectiveConfirmationId} (${letterTypeData.toUpperCase()})`,
                html,
              }),
            });

            if (res.ok) {
              console.info(
                `[get-resume-order] Unpaid lead notification sent for ${effectiveConfirmationId} to ${recipients.join(", ")}`
              );
            } else {
              const errText = await res.text();
              console.warn(`[get-resume-order] Lead notification failed: ${errText}`);
            }
          }
        } catch (notifyErr) {
          console.warn("[get-resume-order] Lead notification error:", notifyErr);
        }
      }

      // ── Step 5: AUTHORITATIVE payment reconciliation ─────────────────────
      // ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001
      //
      // The upsert above wrote only non-payment columns. For a payment-shaped
      // request we now ask the authoritative reconciler whether Stripe actually
      // confirms this order. The client's claim is never the answer; it only
      // triggers the server-side check.
      let paymentState:
        | "unpaid"
        | "already_paid"
        | "payment_confirmed"
        | "payment_confirmation_pending" = "unpaid";
      let reconciled = false;

      if (isPaymentUpsert) {
        if (clientClaimedPaid) {
          // Prove in the audit trail that the client's own paid claim was ignored.
          void logSecurityEvent(supabase, "resume_paid_at_client_value_ignored", effectiveConfirmationId, {
            client_sent_paid_at: body.paidAt !== undefined,
            client_sent_status: body.status ?? null,
            note:
              "Client-supplied payment claim ignored; payment state resolved server-side via check-payment-status.",
          });
        }

        const verdict = await delegatePaymentReconciliation({
          confirmationId: effectiveConfirmationId,
          clientPaymentIntentHint: body.paymentIntentId ?? null,
        });
        paymentState = verdict.state;
        reconciled = verdict.reconciled;

        if (paymentState === "payment_confirmation_pending") {
          console.info(
            `[get-resume-order] ${effectiveConfirmationId}: payment NOT confirmed by Stripe — order remains UNPAID (webhook is the safety net)`
          );
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          // Always return the canonical id; frontend MUST adopt this.
          confirmationId: effectiveConfirmationId,
          matchedBy,
          // Now derived from SERVER-VERIFIED state, never from the request body.
          alreadyPaid: paymentState === "already_paid" || paymentState === "payment_confirmed",
          paymentState,
          reconciled,
          idDiverged: effectiveConfirmationId !== confirmationId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── READ path ─────────────────────────────────────────────────────────
    // ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001
    //
    // A confirmation id is a DISPLAY REFERENCE, not a credential. It is printed
    // in emails, SMS, URLs, analytics and support threads, and it is reachable
    // here with the PUBLIC anon key that every browser holds.
    //
    // This path used to return first_name, last_name, email, phone, price,
    // letter_type (ESA vs PSD), package_key, billing_plan and the full
    // `assessment_answers` — the customer's mental-health intake — to anyone who
    // knew or guessed an order number.
    //
    // It now returns EXISTENCE + PAYMENT STATE ONLY. Resuming with real order
    // data requires an expiring, single-use, order-bound resume token exchanged
    // through `exchange-resume-token`.
    //
    // RATE LIMIT (§I). Only this READ path is throttled — the `upsert` action
    // above is the live checkout write path and must never be throttled. Two
    // buckets: caller IP, and the DIGEST of the confirmation reference. This is
    // what bounds the residual existence / paid-state oracle that necessarily
    // remains: `account-checkout` legitimately needs "does this order exist and
    // is it already paid" to route the customer. A throttled caller gets the
    // SAME "Order not found" body as an unknown reference, so throttling itself
    // answers nothing.
    const notFound = () =>
      new Response(
        JSON.stringify({ ok: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    const readIpAllowed = await consumeRateLimit(supabase, "request_new_link", clientIp(req));
    const readRefAllowed = await consumeRateLimit(
      supabase,
      "request_new_link",
      await sha256Hex(confirmationId),
      RESUME_SUBJECT_LIMITS.perConfirmationRef,
    );
    if (!readIpAllowed || !readRefAllowed) return notFound();

    const { data, error } = await supabase
      .from("orders")
      .select("confirmation_id, payment_intent_id, paid_at, status")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (error || !data) return notFound();

    const alreadyPaid = !!(data.payment_intent_id || data.paid_at);

    // Hand-built allowlist. Never spread the row; never add a display field back
    // "because a page used to show it" — use a resume token instead.
    const safeOrder = {
      confirmation_id: data.confirmation_id,
      status: data.status,
      already_paid: alreadyPaid,
    };

    return new Response(
      JSON.stringify({ ok: true, order: safeOrder }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
