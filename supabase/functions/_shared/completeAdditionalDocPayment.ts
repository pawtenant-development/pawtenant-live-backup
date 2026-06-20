// completeAdditionalDocPayment — single source of truth for finalizing a paid
// "Additional Documentation" ($40) add-on. Called by BOTH:
//   - stripe-webhook (when the Stripe event is delivered), and
//   - create-additional-doc-invoice "reconcile"/"list" (self-heal when the
//     webhook is not subscribed/delivered — same pattern as check-payment-status).
//
// Idempotent on the request row (status='paid' short-circuits). Never touches
// the parent order's price / coupon / original payment intent or the normal
// paid-order emails. Pure DB + email side effects (no Stripe calls here — the
// caller resolves the Stripe ids and passes them in).

import { reserveEmailSend, finalizeEmailSend } from "./logEmailComm.ts";

type SupabaseClient = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const FALLBACK_INTERNAL_EMAIL = "eservices.dm@gmail.com";

async function sendViaResend(opts: { to: string; subject: string; html: string; tags?: Array<{ name: string; value: string }> }): Promise<{ sent: boolean; error?: string; resendId?: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${await res.text()}` };
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    return { sent: true, resendId: (body as { id?: string }).id ?? null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getAdminNotifRecipients(notificationKey: string): Promise<{ enabled: boolean; recipients: string[] }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ notificationKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { enabled: boolean; recipients: string[] };
    return { enabled: data.enabled, recipients: Array.isArray(data.recipients) ? data.recipients : [] };
  } catch (err) {
    console.warn(`[completeAddonDoc] getAdminNotifRecipients failed for "${notificationKey}":`, err instanceof Error ? err.message : String(err));
    // For internal alerts only: fall back to a known internal address so the
    // team is not silently blind. (Customer-facing receipt never uses this.)
    return { enabled: true, recipients: [FALLBACK_INTERNAL_EMAIL] };
  }
}

function buildAddonReceiptHtml(opts: { firstName: string; confirmationId: string; amountFormatted: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;"><tr><td style="background:#0f172a;padding:26px 32px;text-align:center;"><img src="${LOGO_URL}" width="140" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 12px;height:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.12);color:#94a3b8;padding:4px 14px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">PAYMENT RECEIVED</div><p style="margin:0;font-size:34px;font-weight:900;color:#ffffff;">${opts.amountFormatted}</p><p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Additional Documentation</p></td></tr><tr><td style="padding:26px 32px;"><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Hi <strong>${opts.firstName || "there"}</strong>, we received your $40 payment for additional documentation on order <strong>${opts.confirmationId}</strong>. Your order has been placed back <strong>under review</strong> and a provider will review the request.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:8px;"><p style="margin:0;font-size:13px;color:#475569;line-height:1.7;"><strong>Next step:</strong> please reply to this email and attach the specific form you need completed, or upload it in your <a href="${PORTAL_URL}" style="color:#1a5c4f;">customer portal</a>. Provider review is based on a clinical assessment of your file; we cannot guarantee third-party acceptance of any document.</p></div></td></tr><tr><td style="padding:14px 32px;text-align:center;border-top:1px solid #f1f5f9;background:#f8fafc;"><p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &middot; <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a></p></td></tr></table></td></tr></table></body></html>`;
}

function buildAddonAdminHtml(opts: { confirmationId: string; email: string; amountFormatted: string; timestamp: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;"><tr><td style="background:#f97316;padding:24px 32px;text-align:center;"><div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">ADDITIONAL DOCUMENTATION PAID</div><h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">Provider review needed</h1></td></tr><tr><td style="padding:24px 32px;"><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Additional documentation payment received. Customer needs provider review for additional forms/documentation. The order has been placed back under review.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;"><tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;font-weight:600;">Order ID</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${opts.confirmationId}</td></tr><tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;font-weight:600;">Customer</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${opts.email}</td></tr><tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;font-weight:600;">Amount</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${opts.amountFormatted}</td></tr><tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;font-weight:600;">Time</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${opts.timestamp}</td></tr></table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 30px;border-radius:8px;">Open Admin Portal &rarr;</a></td></tr></table></td></tr></table></td></tr></table></body></html>`;
}

export interface CompleteAddonResult {
  ok: boolean;
  addon: true;
  status: "completed" | "idempotent" | "no_request_row";
  requestId?: string;
  confirmationId?: string;
  reopened?: boolean;
}

// Resolve + finalize a paid add-on. The caller passes whichever Stripe ids it
// has (requestId preferred; sessionId / piId as fallbacks for lookup).
export async function completeAdditionalDocPayment(
  supabase: SupabaseClient,
  opts: {
    requestId?: string | null;
    parentOrderId?: string | null;
    sessionId?: string | null;
    piId?: string | null;
    amountCents?: number | null;
    eventId?: string | null;
    source?: string; // "webhook" | "reconcile" | ...
  },
): Promise<CompleteAddonResult> {
  const source = opts.source ?? "webhook";
  let reqRow: Record<string, unknown> | null = null;
  if (opts.requestId) reqRow = (await supabase.from("order_additional_documentation_requests").select("*").eq("id", opts.requestId).maybeSingle()).data as Record<string, unknown> | null;
  if (!reqRow && opts.sessionId) reqRow = (await supabase.from("order_additional_documentation_requests").select("*").eq("stripe_checkout_session_id", opts.sessionId).maybeSingle()).data as Record<string, unknown> | null;
  if (!reqRow && opts.piId) reqRow = (await supabase.from("order_additional_documentation_requests").select("*").eq("stripe_payment_intent_id", opts.piId).maybeSingle()).data as Record<string, unknown> | null;
  if (!reqRow) {
    console.warn(`[completeAddonDoc:${source}] no matching request row`, opts);
    return { ok: true, addon: true, status: "no_request_row" };
  }

  const reqId = reqRow.id as string;
  if ((reqRow.status as string) === "paid") {
    // Already finalized — but still make sure the provider add-on earning exists
    // (heals the case where the first run completed before a provider was assigned).
    await ensureAddonEarning(supabase, reqId);
    return { ok: true, addon: true, status: "idempotent", requestId: reqId, confirmationId: (reqRow.confirmation_id as string) ?? undefined };
  }

  const nowIso = new Date().toISOString();
  const amountCents = opts.amountCents ?? (reqRow.amount_cents as number) ?? 4000;
  const amountFormatted = `$${(amountCents / 100).toFixed(2)}`;

  await supabase.from("order_additional_documentation_requests").update({
    status: "paid",
    paid_at: nowIso,
    stripe_payment_intent_id: opts.piId ?? (reqRow.stripe_payment_intent_id as string | null) ?? null,
    stripe_checkout_session_id: opts.sessionId ?? (reqRow.stripe_checkout_session_id as string | null) ?? null,
  }).eq("id", reqId).neq("status", "paid");

  const parentOrderId = (reqRow.order_id as string) ?? opts.parentOrderId ?? null;
  let confId = (reqRow.confirmation_id as string) ?? "";
  let custEmail = (reqRow.customer_email as string) ?? "";
  let firstName = "";
  let reopened = false;
  if (parentOrderId) {
    const { data: parent } = await supabase.from("orders").select("id, confirmation_id, status, doctor_status, email, first_name").eq("id", parentOrderId).maybeSingle();
    if (parent) {
      confId = (parent.confirmation_id as string) ?? confId;
      custEmail = (parent.email as string) ?? custEmail;
      firstName = (parent.first_name as string) ?? "";
      const patch: Record<string, unknown> = { status: "under-review" };
      if ((parent.doctor_status as string) === "patient_notified") patch.doctor_status = "in_review";
      await supabase.from("orders").update(patch).eq("id", parent.id);
      reopened = true;
      try {
        await supabase.from("order_status_logs").insert({
          order_id: parent.id,
          confirmation_id: confId,
          old_status: (parent.status as string) ?? null,
          new_status: "under-review",
          old_doctor_status: (parent.doctor_status as string) ?? null,
          new_doctor_status: (patch.doctor_status as string) ?? (parent.doctor_status as string) ?? null,
          changed_by: `addon_payment_${source}`,
          changed_at: nowIso,
        });
      } catch { /* non-critical */ }
      try {
        await supabase.from("audit_logs").insert({
          action: "additional_documentation_paid",
          object_type: "order",
          object_id: confId,
          description: `Additional documentation paid (${amountFormatted}) — order reopened for provider review [via ${source}]`,
          metadata: { request_id: reqId, order_id: parent.id, confirmation_id: confId, amount_cents: amountCents, payment_intent_id: opts.piId ?? null, checkout_session_id: opts.sessionId ?? null, stripe_event_id: opts.eventId ?? null, source, paid_at: nowIso },
        });
      } catch { /* non-critical */ }
    }
  }

  // Customer receipt (deduped per request).
  if (custEmail) {
    const reserve = await reserveEmailSend({
      supabase, orderId: parentOrderId, confirmationId: confId, to: custEmail, from: FROM_ADDRESS,
      subject: "Payment Received — Additional Documentation — PawTenant",
      slug: "additional_documentation_receipt", dedupeKey: `${reqId}:additional_documentation_receipt`,
      templateSource: "hardcoded", sentBy: `addon_${source}`,
    });
    if (reserve.proceed) {
      const html = buildAddonReceiptHtml({ firstName, confirmationId: confId, amountFormatted });
      const r = await sendViaResend({ to: custEmail, subject: "Payment Received — Additional Documentation — PawTenant", html, tags: [{ name: "confirmation_id", value: confId }, { name: "email_type", value: "additional_documentation_receipt" }] });
      await finalizeEmailSend(supabase, reserve.rowId, { success: r.sent, body: html, resendId: r.resendId ?? null, errorMessage: r.error ?? null });
    }
  }

  // Internal admin alert (configured new_paid_order recipients; deduped per recipient).
  {
    const { enabled, recipients } = await getAdminNotifRecipients("new_paid_order");
    if (enabled && recipients.length > 0) {
      const adminHtml = buildAddonAdminHtml({ confirmationId: confId, email: custEmail, amountFormatted, timestamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET" });
      const subject = `[PawTenant] Additional Documentation Paid — ${confId}`;
      for (const rcpt of recipients) {
        const reserve = await reserveEmailSend({
          supabase, orderId: parentOrderId, confirmationId: confId, to: rcpt, from: FROM_ADDRESS,
          subject, slug: "internal_addon_paid", recipient: rcpt, extra: reqId, templateSource: "hardcoded", sentBy: `addon_${source}`,
        });
        if (!reserve.proceed) continue;
        const r = await sendViaResend({ to: rcpt, subject, html: adminHtml });
        await finalizeEmailSend(supabase, reserve.rowId, { success: r.sent, body: adminHtml, resendId: r.resendId ?? null, errorMessage: r.error ?? null });
      }
    }
  }

  // Record the provider's add-on payout (per-order rate) in the doctor_earnings
  // ledger. Idempotent + safe: no-op if no provider assigned or already recorded.
  await ensureAddonEarning(supabase, reqId);

  console.info(`[completeAddonDoc:${source}] ✓ ${reqId} paid (${amountFormatted}) — ${confId} reopened=${reopened}`);
  return { ok: true, addon: true, status: "completed", requestId: reqId, confirmationId: confId, reopened };
}

// ensureAddonEarning — record ONE provider payout for a PAID add-on request.
//
// Business rule: each paid Additional Documentation request earns the assigned
// provider an extra payout equal to their normal per-order rate
// (doctor_profiles.per_order_rate) — a separate row in the doctor_earnings ledger.
//
// Idempotent on three levels:
//   1. only acts on a PAID request,
//   2. skips when an earning already exists for this request id,
//   3. the partial UNIQUE index doctor_earnings_addon_request_uniq makes a racing
//      double-insert fail at the DB (caught + treated as success).
// No-op (logged) when the order has no assigned provider yet — a later run heals it.
export async function ensureAddonEarning(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ created: boolean; reason?: string }> {
  try {
    const { data: req } = await supabase
      .from("order_additional_documentation_requests")
      .select("id, order_id, confirmation_id, customer_email, amount_cents, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { created: false, reason: "no_request" };
    if ((req.status as string) !== "paid") return { created: false, reason: "not_paid" };

    const orderId = (req.order_id as string) ?? null;
    if (!orderId) return { created: false, reason: "no_order_link" };

    // Already recorded? (cheap pre-check before the unique-index backstop)
    const { data: existing } = await supabase
      .from("doctor_earnings")
      .select("id")
      .eq("additional_documentation_request_id", requestId)
      .maybeSingle();
    if (existing) return { created: false, reason: "already_exists" };

    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, doctor_user_id, doctor_name, doctor_email, state, first_name, last_name")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return { created: false, reason: "no_order" };

    const doctorUserId = (order.doctor_user_id as string) ?? null;
    if (!doctorUserId) {
      // No provider assigned at payment time — a later assign + reconcile heals it.
      console.info(`[completeAddonDoc] add-on earning deferred — no provider on order ${order.confirmation_id ?? orderId}`);
      return { created: false, reason: "no_provider" };
    }

    // Provider's per-order rate AT THE TIME this earning is created.
    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("per_order_rate, full_name, email")
      .eq("user_id", doctorUserId)
      .maybeSingle();
    const rate = (profile?.per_order_rate as number | null) ?? null;

    const patientName = [order.first_name, order.last_name]
      .filter((p) => !!p && String(p).trim())
      .join(" ")
      .trim() || null;
    const addonCharge = Math.round(((req.amount_cents as number | null) ?? 4000) / 100);

    const { error: insertErr } = await supabase.from("doctor_earnings").insert({
      doctor_user_id: doctorUserId,
      doctor_name: (order.doctor_name as string) ?? profile?.full_name ?? null,
      doctor_email: (order.doctor_email as string) ?? profile?.email ?? null,
      order_id: orderId,
      confirmation_id: (order.confirmation_id as string) ?? (req.confirmation_id as string) ?? null,
      patient_name: patientName,
      patient_state: (order.state as string) ?? null,
      order_amount: addonCharge,
      doctor_amount: rate,
      status: "pending",
      earning_type: "additional_documentation",
      additional_documentation_request_id: requestId,
      notes: rate == null
        ? "Additional Documentation payout — rate not set; set the provider's per-order rate in the Providers tab"
        : "Additional Documentation payout (provider per-order rate)",
    });

    if (insertErr) {
      // 23505 = unique_violation on the partial index → another run won the race.
      if ((insertErr as { code?: string }).code === "23505") return { created: false, reason: "race_dedup" };
      console.warn(`[completeAddonDoc] add-on earning insert failed for ${requestId}:`, insertErr.message);
      return { created: false, reason: "insert_error" };
    }
    console.info(`[completeAddonDoc] ✓ add-on earning recorded for ${order.confirmation_id ?? orderId} (rate=${rate})`);
    return { created: true };
  } catch (e) {
    console.warn(`[completeAddonDoc] ensureAddonEarning threw for ${requestId}:`, e instanceof Error ? e.message : String(e));
    return { created: false, reason: "exception" };
  }
}
