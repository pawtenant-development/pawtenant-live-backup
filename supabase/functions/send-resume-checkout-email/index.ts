// send-resume-checkout-email
//
// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002 — Phase B.
//
// The Admin Orders "Send Resume Checkout Email" action: one manual, deliberate,
// discount-free email that hands an unpaid customer back their existing order.
//
// WHY A NEW FUNCTION RATHER THAN EXTENDING send-checkout-recovery
// ---------------------------------------------------------------
// `send-checkout-recovery` exists and works, but it is the DISCOUNT recovery
// path — it builds discount banners and is wired to `checkout_recovery_discount`.
// Bolting a "same thing but promise not to apply the discount" flag onto it
// would put the no-discount guarantee one boolean away from being wrong, in a
// function whose whole shape assumes a discount. Separation is the guarantee:
// there is no code path from this file to a coupon.
//
// TWO ACTIONS, ONE ENDPOINT:
//   preview — server-authoritative eligibility + the exact values the
//             confirmation modal displays. Mutates NOTHING.
//   send    — reserve → send → finalize.
//
// The browser never decides eligibility. It renders what the server ruled, the
// same contract `create-additional-pet-request` uses, so Admin and server can
// never disagree about whether an order may be contacted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuditActor, maskEmail } from "../_shared/auditActor.ts";
import { issueResumeLink } from "../_shared/resumeLink.ts";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";

const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

const HEADER_BG = "#4a9e8a";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

/** The comms slug this action owns. Also the audit/cooldown anchor. */
const SLUG = "resume_checkout_email";
/** Guards an accidental second send. Deliberate retries are allowed after it. */
const COOLDOWN_MINUTES = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeHtml(v = ""): string {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Why an order cannot be sent this email. Machine-readable so the menu item can
 * render an exact reason instead of an unexplained disabled state.
 */
type IneligibleReason =
  | "order_not_found"
  | "already_paid"
  | "completed"
  | "cancelled"
  | "refunded"
  | "archived"
  | "missing_email"
  | "not_resumable";

const REASON_TEXT: Record<IneligibleReason, string> = {
  order_not_found: "This order could not be found.",
  already_paid: "This order is already paid — there is nothing to resume.",
  completed: "This order is completed.",
  cancelled: "This order was cancelled.",
  refunded: "This order was refunded.",
  archived: "This order is archived.",
  missing_email: "No customer email is saved on this order.",
  not_resumable: "This order is no longer resumable.",
};

interface OrderRow {
  id: string;
  confirmation_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  letter_type: string | null;
  package_display_name: string | null;
  package_key: string | null;
  price: number | null;
  status: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_status: string | null;
  payment_intent_id: string | null;
}

/**
 * Server-authoritative eligibility.
 *
 * DELIBERATELY NOT TIME-BOUNDED. A July lead is exactly as resumable as a lead
 * from this morning — the order is either still payable or it is not, and
 * "recent" is not part of that. The automated drip has a 14-day lookback
 * because it is unattended; a human choosing to contact one specific customer
 * has already made the judgement the lookback exists to avoid making blindly.
 */
export function evaluate(order: OrderRow | null): { eligible: boolean; reason?: IneligibleReason } {
  if (!order) return { eligible: false, reason: "order_not_found" };
  const status = (order.status ?? "").toLowerCase();
  if (order.paid_at) return { eligible: false, reason: "already_paid" };
  if (status === "completed") return { eligible: false, reason: "completed" };
  if (status === "cancelled") return { eligible: false, reason: "cancelled" };
  if (status === "refunded" || order.refunded_at) return { eligible: false, reason: "refunded" };
  if (status === "archived" || status === "void") return { eligible: false, reason: "archived" };
  if (!(order.email ?? "").trim() || !(order.email ?? "").includes("@")) {
    return { eligible: false, reason: "missing_email" };
  }
  return { eligible: true };
}

function serviceLabel(order: OrderRow): string {
  return (order.letter_type ?? "").toLowerCase() === "psd"
    ? "PSD Letter"
    : "ESA Letter";
}

function packageLabel(order: OrderRow): string {
  return (order.package_display_name ?? "").trim()
    || (order.package_key ?? "").trim()
    || "—";
}

/**
 * The email.
 *
 * Copy is SPECIFIED verbatim by the task. Two things it must never grow:
 *   • a discount, coupon or promo of any kind;
 *   • anything that sends the customer back into the assessment. They already
 *     completed it — "your previous information has been saved" is the whole
 *     point of the message.
 */
function buildEmailHtml(firstName: string, checkoutUrl: string): string {
  const name = escapeHtml((firstName || "").trim() || "there");
  const url = escapeHtml(checkoutUrl);
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
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">Complete your PawTenant order</h1>
          <p style="margin:0;font-size:14px;color:${HEADER_SUB};">Your information has been saved</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
            You can continue your existing PawTenant order using the secure link below.
            Your previous information has been saved, so you can continue directly to checkout.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td align="center">
              <a href="${url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Complete Your Order &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;word-break:break-all;">
            Or paste this link into your browser:<br />
            <a href="${url}" style="color:${ACCENT};">${url}</a>
          </p>
          <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
            If you have any questions, reply to this email and our support team will help.
          </p>
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">PawTenant Support</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { action?: string; orderId?: string; confirmationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // ── Actor ────────────────────────────────────────────────────────────────
  // Resolved from the JWT, never from the request body. `sentBy`-style body
  // fields are forgeable and are the reason audit rows used to be unable to
  // distinguish a person from a cron. An automated caller resolves to System
  // and is refused here: this action is a deliberate human decision to contact
  // a customer, so there is no legitimate unattended caller.
  const actor = await resolveAuditActor(req, supabase);
  if (!actor.isHuman || actor.type !== "employee") {
    return json({ ok: false, error: "Admin sign-in required for this action." }, 403);
  }

  const { orderId, confirmationId } = body;
  if (!orderId && !confirmationId) {
    return json({ ok: false, error: "orderId or confirmationId is required" }, 400);
  }

  const COLUMNS =
    "id, confirmation_id, email, first_name, last_name, letter_type, package_display_name, " +
    "package_key, price, status, paid_at, refunded_at, refund_status, payment_intent_id";

  const query = supabase.from("orders").select(COLUMNS);
  const { data: orderData } = orderId
    ? await query.eq("id", orderId).maybeSingle()
    : await query.eq("confirmation_id", confirmationId!).maybeSingle();

  const order = orderData as OrderRow | null;
  const verdict = evaluate(order);

  // ── preview ──────────────────────────────────────────────────────────────
  // Everything the confirmation modal shows. The stable slug is NOT returned:
  // the modal has no need for it, and a link that reaches an admin browser can
  // be pasted, screenshotted and forwarded. The customer's own email is the
  // only place it belongs.
  if (body.action === "preview") {
    if (!order) {
      return json({
        ok: true, eligible: false,
        reason: "order_not_found", reasonText: REASON_TEXT.order_not_found,
      });
    }
    // Last successful/in-flight send, for the cooldown countdown.
    const { data: recent } = await supabase
      .from("communications")
      .select("created_at, status")
      .eq("order_id", order.id)
      .eq("slug", SLUG)
      .in("status", ["sent", "sending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({
      ok: true,
      eligible: verdict.eligible,
      reason: verdict.reason ?? null,
      reasonText: verdict.reason ? REASON_TEXT[verdict.reason] : null,
      display: {
        customerName: [order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "—",
        maskedEmail: maskEmail(order.email),
        confirmationId: order.confirmation_id,
        serviceType: serviceLabel(order),
        packageName: packageLabel(order),
        // The AMOUNT ALREADY STORED on the order. Never recomputed here — a
        // price derived at send time is how a customer gets quoted one figure
        // and charged another.
        amount: order.price ?? null,
      },
      lastSentAt: (recent as { created_at?: string } | null)?.created_at ?? null,
      cooldownMinutes: COOLDOWN_MINUTES,
    });
  }

  if (body.action !== "send") return json({ ok: false, error: "Unknown action" }, 400);

  // ── send ─────────────────────────────────────────────────────────────────
  if (!order || !verdict.eligible) {
    const reason = verdict.reason ?? "not_resumable";
    return json({ ok: false, error: REASON_TEXT[reason], reason }, 409);
  }

  // Cooldown. Scoped to sent/sending only: a definitively FAILED attempt
  // delivered nothing, so making an admin wait five minutes to retry it would
  // punish them for the provider's outage.
  const cooldownSince = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const { data: recentSend } = await supabase
    .from("communications")
    .select("id, created_at")
    .eq("order_id", order.id)
    .eq("slug", SLUG)
    .in("status", ["sent", "sending"])
    .gte("created_at", cooldownSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentSend) {
    return json({
      ok: false,
      reason: "cooldown",
      error: `A resume checkout email was already sent to this customer in the last ${COOLDOWN_MINUTES} minutes.`,
      lastSentAt: (recentSend as { created_at?: string }).created_at ?? null,
    }, 429);
  }

  // Per-attempt idempotency key. Two clicks racing compute the SAME attempt
  // number, so they contend for one key and exactly one wins the insert — the
  // guarantee is the unique index, not a disabled button. After the cooldown
  // the count has moved on, so a deliberate retry gets a fresh key.
  const { count: priorAttempts } = await supabase
    .from("communications")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id)
    .eq("slug", SLUG);

  const attemptNo = (priorAttempts ?? 0) + 1;
  const dedupeKey = `${order.confirmation_id}:${SLUG}:${attemptNo}`;
  const subject = "Complete your PawTenant order";

  const reservation = await reserveEmailSend({
    supabase,
    orderId: order.id,
    confirmationId: order.confirmation_id,
    to: order.email!,
    from: FROM_EMAIL,
    subject,
    slug: SLUG,
    dedupeKey,
    templateSource: "hardcoded",
    // The REAL admin, snapshotted at send time.
    sentBy: actor.name,
    type: "email",
  });

  if (!reservation.proceed) {
    return json({
      ok: false, reason: "duplicate",
      error: "This email is already being sent — no second copy was sent.",
    }, 409);
  }

  // ── The link ─────────────────────────────────────────────────────────────
  // `issueResumeLink` → `ensure_checkout_slug_by_confirmation` → the order's
  // CURRENT ACTIVE slug, minting one only when none exists. An existing live
  // link — 8-character legacy or 12-character current — is returned unchanged,
  // so a link already sitting in the customer's inbox keeps working. That
  // matters: 39 of 40 dead recovery links died from SUPERSESSION, not expiry.
  //
  // `extraParams` is not passed and is ignored by that module by design, so no
  // promo / coupon / discount parameter can be attached from here.
  const issued = await issueResumeLink({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: SITE_URL,
    confirmationId: order.confirmation_id,
    isPsd: (order.letter_type ?? "").toLowerCase() === "psd",
    createdBy: "send-resume-checkout-email",
  });

  if (!issued.tokenized) {
    // Fail closed rather than emailing the credential-free fallback path and
    // calling it a resume link.
    await finalizeEmailSend(supabase, reservation.rowId, {
      success: false, errorMessage: "Could not resolve a checkout link for this order.",
    });
    await supabase.from("communications").update({
      failure_code: "link_unavailable",
      failure_reason: "Could not resolve an active checkout link for this order.",
    }).eq("id", reservation.rowId!);
    return json({
      ok: false, reason: "link_unavailable",
      error: "Could not resolve an active checkout link for this order. Nothing was sent.",
    }, 502);
  }

  const html = buildEmailHtml(order.first_name ?? "", issued.url);
  const sendRes = await sendEmailViaResend({
    from: FROM_EMAIL,
    to: order.email!,
    subject,
    html,
    reply_to: SUPPORT_EMAIL,
  });

  await finalizeEmailSend(supabase, reservation.rowId, {
    success: sendRes.ok,
    body: sendRes.ok ? html : undefined,
    resendId: sendRes.ok ? (sendRes.messageId ?? undefined) : undefined,
    errorMessage: sendRes.ok ? undefined : sendRes.error,
  });

  if (!sendRes.ok) {
    await supabase.from("communications").update({
      failure_code: "provider_rejected",
      failure_reason: String(sendRes.error ?? "").slice(0, 300),
    }).eq("id", reservation.rowId!);
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  // Wording is specified. The summary carries NO stable URL and NO email body:
  // `communications` is authoritative for content and this row links to it, so
  // duplicating a customer's live checkout link into the audit trail would
  // spread it for nothing.
  await supabase.from("audit_logs").insert({
    actor_id: actor.id, actor_name: actor.name, actor_role: actor.role,
    actor_type: actor.type, category: "communications",
    source: "admin_portal",
    object_type: "order", object_id: order.confirmation_id,
    order_id: order.id, entity_type: "communication",
    entity_id: reservation.rowId, communication_id: reservation.rowId,
    action: "resume_checkout_email_sent",
    description: sendRes.ok
      ? `${actor.name} sent a Resume Checkout Email to the customer.`
      : `${actor.name} attempted a Resume Checkout Email to the customer — delivery FAILED.`,
    metadata: {
      channel: "email", direction: "outbound", recipient_type: "customer",
      recipient_masked: maskEmail(order.email), delivery_status: sendRes.ok ? "sent" : "failed",
      confirmation_id: order.confirmation_id, slug: SLUG,
      idempotency_key: dedupeKey, discount_applied: false,
    },
  });

  if (!sendRes.ok) {
    return json({
      ok: false, reason: "provider_error",
      error: `The email provider rejected the send: ${sendRes.error}`,
    }, 502);
  }

  return json({
    ok: true,
    sentTo: maskEmail(order.email),
    subject,
    idempotencyKey: dedupeKey,
    communicationId: reservation.rowId,
  });
});
