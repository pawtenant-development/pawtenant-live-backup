// notify-provider-additional-doc — ADDITIONAL-DOCUMENTATION-PROVIDER-NOTIFICATION-001
//
// WHY THIS EXISTS
// When a customer buys the Additional Documentation add-on (or has the RA combo
// bundle) and uploads the requested form, the order returns to Under Review and
// the ASSIGNED PROVIDER has to act. Until now the only signal was an in-portal
// `doctor_notifications` row written by customer-upload-document — there was no
// email arm anywhere in the codebase, so a provider who was not logged in never
// learned the case had come back to them (confirmed LIVE on PT-PSDFIARSPET).
//
// CONTRACT
//   POST { confirmationId, trigger }
//     trigger = "customer_upload" | "assignment" | "manual_resend"
//
// SERVER-AUTHORITATIVE: the caller supplies only WHICH order to evaluate. This
// function re-derives, from the database, whether the request is actually
// provider-actionable and WHO the currently assigned provider is. A caller can
// never name the recipient, the request type, or force a send of a non-actionable
// order. That is what makes the trigger safe to fire from several call sites.
//
// EXACTLY ONCE: idempotency is durable, in the DB, via the unique partial index
// on communications.dedupe_key (reserveEmailSend claims the key BEFORE the Resend
// call). The key is anchored on (order, provider, uploaded document), so:
//   * duplicate webhooks / repeated status writes → blocked (same key)
//   * a NEW upload cycle                          → new key, notifies again
//   * reassignment to a different provider        → new key, the NEW provider is
//                                                    notified exactly once
//   * unassigned at upload time                   → nothing sent, recorded as
//                                                    PENDING; assign-doctor calls
//                                                    this again after assignment
//
// PRIVACY: the email carries the order reference, the request type, the required
// action and the portal CTA. It deliberately carries NO payment amount, NO
// provider compensation, NO admin/customer private notes and NO clinical detail.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  finalizeEmailSend,
  reserveEmailSend,
} from "../_shared/reserveEmailSend.ts";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import {
  evaluateNotificationSuppression,
  suppressForFixtureOrder,
} from "../_shared/testNotificationSuppression.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLUG = "provider_additional_doc_ready";
const FROM = "PawTenant <hello@pawtenant.com>";
const HEADER_BG = "#4a9e8a";
const ACCENT = "#1a5c4f";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

// Bounded retry — only for failures that can plausibly succeed on a retry.
// A 4xx from Resend (bad address, suppressed recipient) is permanent: retrying
// it just burns quota and delays the failure becoming visible to Admin.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isRetryable(status: number): boolean {
  // status 0 == network/DNS/timeout failure before an HTTP status existed.
  return status === 0 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Capability probe — NEVER `bearer === SERVICE_ROLE_KEY`. The project has both
// legacy JWT and `sb_secret_` style service keys, so a string compare against one
// env var silently rejects the other. The Auth admin API is service-role-only, so
// a successful listUsers call proves the capability regardless of key format.
async function bearerIsServiceRole(url: string, bearer: string): Promise<boolean> {
  try {
    const probe = createClient(url, bearer, { auth: { persistSession: false } });
    const { data, error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error && !!data;
  } catch {
    return false;
  }
}

type OrderRow = {
  id: string;
  confirmation_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  doctor_user_id: string | null;
  doctor_email: string | null;
  doctor_name: string | null;
  includes_reasonable_accommodation_letter: boolean | null;
  additional_documentation_status: string | null;
  customer_uploaded_additional_document_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Server not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: { confirmationId?: string; trigger?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Expected JSON body" });
  }

  const confirmationId = (body.confirmationId ?? "").toString().trim();
  const trigger = (body.trigger ?? "customer_upload").toString().trim();
  if (!confirmationId) return json(400, { ok: false, error: "confirmationId is required" });
  if (!["customer_upload", "assignment", "manual_resend"].includes(trigger)) {
    return json(400, { ok: false, error: `Unsupported trigger: ${trigger}` });
  }

  // ── Authorize ──────────────────────────────────────────────────────────────
  // Internal edge-function callers present the service-role key. A human resend
  // must be an ADMIN — a provider may not decide to re-notify themselves, and a
  // customer may not trigger provider mail at all.
  let actorName = "PawTenant System";
  let actorRole = "system";
  let isAdminCaller = false;
  const serviceRoleCaller = await bearerIsServiceRole(supabaseUrl, bearer);
  if (!serviceRoleCaller) {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) return json(401, { ok: false, error: "Invalid token" });
    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin, full_name")
      .eq("user_id", userResp.user.id)
      .maybeSingle();
    isAdminCaller = !!(profile as { is_admin?: boolean } | null)?.is_admin;
    if (!isAdminCaller) return json(403, { ok: false, error: "Admin privileges required" });
    actorName = (profile as { full_name?: string } | null)?.full_name?.trim()
      || userResp.user.email || "Admin";
    actorRole = "admin";
  }
  // A manual resend is an explicit human act — it is not available to the
  // automated service-role path, which must stay strictly exactly-once.
  if (trigger === "manual_resend" && !isAdminCaller) {
    return json(403, { ok: false, error: "manual_resend requires an authenticated admin" });
  }

  // ── Load the order (authoritative source for everything below) ─────────────
  const { data: orderRaw, error: orderErr } = await admin
    .from("orders")
    .select(
      "id, confirmation_id, email, first_name, last_name, status, doctor_user_id, doctor_email, doctor_name, includes_reasonable_accommodation_letter, additional_documentation_status, customer_uploaded_additional_document_at",
    )
    .eq("confirmation_id", confirmationId)
    .maybeSingle();
  if (orderErr) return json(500, { ok: false, error: orderErr.message });
  if (!orderRaw) return json(404, { ok: false, error: "Order not found" });
  const order = orderRaw as OrderRow;

  // ── Derive provider-actionability server-side ──────────────────────────────
  // Entitlement mirrors customer-upload-document: a PAID add-on request, or the
  // RA combo bundle flag. Without entitlement there is no request to act on.
  let hasPaidAddon = false;
  try {
    const { data: paidAddon } = await admin
      .from("order_additional_documentation_requests")
      .select("id")
      .eq("order_id", order.id)
      .eq("status", "paid")
      .limit(1);
    hasPaidAddon = Array.isArray(paidAddon) && paidAddon.length > 0;
  } catch (e) {
    console.warn("[notify-provider-additional-doc] add-on lookup failed:", e instanceof Error ? e.message : String(e));
  }
  const isRaCombo = order.includes_reasonable_accommodation_letter === true;
  const entitled = hasPaidAddon || isRaCombo;

  // The actionable ARTIFACT is the customer's uploaded document. Anchoring on its
  // id (not on a timestamp or a boolean) is what makes a second request cycle
  // notify again while a replayed webhook does not.
  const { data: docRaw } = await admin
    .from("order_documents")
    .select("id, uploaded_at")
    .eq("order_id", order.id)
    .eq("doc_type", "customer_upload")
    .eq("uploaded_by", "customer")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const doc = docRaw as { id: string; uploaded_at: string | null } | null;

  const uploaded = order.additional_documentation_status === "uploaded";
  const actionable = entitled && uploaded && !!doc?.id;

  if (!actionable) {
    const reason = !entitled
      ? "no paid additional-documentation request and not an RA combo order"
      : !uploaded
        ? `additional_documentation_status is '${order.additional_documentation_status ?? "null"}', not 'uploaded'`
        : "no customer-uploaded document on the order";
    // A silent no-op for the automated triggers (they fire optimistically on
    // every upload/assignment); an explicit error for a human who asked for it.
    if (trigger === "manual_resend") return json(409, { ok: false, actionable: false, error: reason });
    return json(200, { ok: true, actionable: false, emailSent: false, reason });
  }

  const docId = doc!.id;
  const providerEmail = (order.doctor_email ?? "").trim().toLowerCase();

  // ── Unassigned → stay PENDING ──────────────────────────────────────────────
  // No provider means nothing to notify. Record it once per document so Admin can
  // see the request is waiting on assignment, then let assign-doctor call us back.
  if (!providerEmail || !order.doctor_user_id) {
    try {
      const { data: priorPending } = await admin
        .from("audit_logs")
        .select("id")
        .eq("action", "provider_additional_doc_notification_pending")
        .eq("object_id", confirmationId)
        .contains("metadata", { document_id: docId })
        .limit(1);
      if (!Array.isArray(priorPending) || priorPending.length === 0) {
        await admin.from("audit_logs").insert({
          actor_name: actorName, actor_role: actorRole, actor_type: actorRole === "admin" ? "user" : "system",
          category: "communications", source: "notify_provider_additional_doc",
          object_type: "notification", object_id: confirmationId, order_id: order.id,
          action: "provider_additional_doc_notification_pending",
          description:
            `Additional documentation is ready for provider review on order ${confirmationId}, but no provider is assigned. ` +
            `The notification is PENDING and will be sent to the provider assigned to this order.`,
          metadata: { confirmation_id: confirmationId, order_id: order.id, document_id: docId, pending: true, trigger },
        });
      }
    } catch (e) {
      console.warn("[notify-provider-additional-doc] pending audit failed:", e instanceof Error ? e.message : String(e));
    }
    return json(200, { ok: true, actionable: true, pending: true, emailSent: false, reason: "no provider assigned" });
  }

  // ── Claim the dedupe key BEFORE sending ────────────────────────────────────
  const baseKey = `${confirmationId}:${SLUG}:${providerEmail}:${docId}`;
  let dedupeKey = baseKey;
  if (trigger === "manual_resend") {
    // A resend is a deliberate NEW send, so it gets its own key rather than
    // recycling the original — the original stays in the timeline as sent, and
    // each resend is individually recorded and individually deduped.
    const { data: priorResends } = await admin
      .from("communications")
      .select("id")
      .like("dedupe_key", `${baseKey}:manual:%`);
    dedupeKey = `${baseKey}:manual:${(priorResends?.length ?? 0) + 1}`;
  }

  const requestType = isRaCombo
    ? "Reasonable Accommodation documentation"
    : "Additional documentation";
  const subject = `Action Required: ${requestType} ready for review — Order ${confirmationId}`;

  const reservation = await reserveEmailSend({
    supabase: admin,
    orderId: order.id,
    confirmationId,
    to: providerEmail,
    from: FROM,
    subject,
    slug: SLUG,
    dedupeKey,
    templateSource: "hardcoded",
    sentBy: actorRole === "admin" ? actorName : "system",
    // Transient Resend/network failures leave the row 'failed'; a later trigger
    // (or an admin resend) may legitimately recover it. Duplicates stay blocked.
    allowRetryAfterFailed: true,
  });

  if (!reservation.proceed) {
    return json(200, {
      ok: true, actionable: true, emailSent: false, duplicate: true,
      reason: "already notified for this provider and document", dedupeKey,
    });
  }

  // ── TEST-only suppression ──────────────────────────────────────────────────
  // Gate on the ORDER as well as the provider: a fixture order must never email a
  // real provider about work that does not exist.
  const suppression = suppressForFixtureOrder(order.email)
    ? { suppressed: true, reason: "TEST fixture order (reserved customer TLD)", checks: { fixtureOrder: true } }
    : evaluateNotificationSuppression(providerEmail);
  if (suppression.suppressed) {
    console.warn(`[notifySuppressed] provider additional-doc email SUPPRESSED for ${confirmationId} — ${suppression.reason}`);
    await finalizeEmailSend(admin, reservation.rowId, {
      success: false,
      errorMessage: `suppressed: ${suppression.reason}`,
    });
    try {
      await admin.from("audit_logs").insert({
        actor_name: actorName, actor_role: actorRole, actor_type: actorRole === "admin" ? "user" : "system",
        category: "communications", source: "notify_provider_additional_doc",
        object_type: "notification", object_id: confirmationId, order_id: order.id,
        action: "notification_suppressed_test_fixture",
        description: `Provider additional-documentation email SUPPRESSED for TEST fixture order ${confirmationId}. No email was sent.`,
        metadata: {
          confirmation_id: confirmationId, order_id: order.id, document_id: docId,
          suppressed: true, delivered: false, reason: suppression.reason, checks: suppression.checks, trigger,
        },
      });
    } catch { /* best effort */ }
    return json(200, { ok: true, actionable: true, emailSent: false, suppressed: true, reason: suppression.reason });
  }

  // ── Build the email ────────────────────────────────────────────────────────
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://pawtenant.com";
  const providerPortalUrl = `${SITE_URL}/provider-portal?order=${encodeURIComponent(confirmationId)}`;
  const providerName = esc(order.doctor_name?.trim() || "Provider");
  const patientName = esc([order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "the patient");
  const requestTypeHtml = esc(requestType);
  const uploadedAtLabel = esc(
    new Date(doc!.uploaded_at ?? order.customer_uploaded_additional_document_at ?? new Date().toISOString())
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }),
  );

  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${requestTypeHtml} Ready for Review — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:${HEADER_BG};padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="PawTenant" height="40" style="height:40px;width:auto;display:block;margin:0 auto 12px;" />
              <h1 style="color:#ffffff;font-size:18px;font-weight:800;margin:0;letter-spacing:-0.3px;">
                Action Required: Document Ready for Review
              </h1>
            </td>
          </tr>

          <tr>
            <td style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" valign="top">
                    <div style="width:32px;height:32px;background:#ea580c;border-radius:8px;text-align:center;line-height:32px;">
                      <span style="color:#fff;font-size:16px;">&#128206;</span>
                    </div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#9a3412;">${requestTypeHtml} received</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#c2410c;line-height:1.5;">
                      The patient has uploaded the requested document. This order is back in your queue as
                      <strong>Under Review</strong> and is waiting on you.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
                Hi <strong>${providerName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
                ${requestTypeHtml} has been submitted on one of your assigned orders. Please open the
                provider portal, review the uploaded document, and complete the order.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Order Details</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Order ID</span>
                          <strong style="font-size:13px;color:${ACCENT};font-family:monospace;">${esc(confirmationId)}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Patient</span>
                          <strong style="font-size:13px;color:${ACCENT};">${patientName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Request Type</span>
                          <strong style="font-size:13px;color:${ACCENT};">${requestTypeHtml}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:3px 0;">
                          <span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Document Received</span>
                          <strong style="font-size:13px;color:${ACCENT};">${uploadedAtLabel}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;">What You Need To Do</p>
                    <ol style="margin:0;padding-left:18px;color:#78350f;">
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Log in to the PawTenant provider portal</li>
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Open order <strong>${esc(confirmationId)}</strong> and go to <strong>Documents</strong></li>
                      <li style="font-size:13px;line-height:1.7;margin-bottom:4px;">Review the uploaded ${requestTypeHtml.toLowerCase()}</li>
                      <li style="font-size:13px;line-height:1.7;">Complete the requested document and submit it through the portal</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${providerPortalUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;letter-spacing:0.2px;">
                      Open Order in Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                If the button doesn't work, copy this link:<br/>
                <a href="${providerPortalUrl}" style="color:${ACCENT};word-break:break-all;">${providerPortalUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
                &copy; ${new Date().getFullYear()} PawTenant &middot; This is an automated notification from your case management system.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Send, with bounded retry for retryable failures only ───────────────────
  let attempts = 0;
  let lastStatus = 0;
  let lastError = "";
  let messageId: string | null = null;
  let sent = false;
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const result = await sendEmailViaResend({
      from: FROM, to: providerEmail, subject, html: emailHtml,
    });
    if (result.ok) {
      sent = true;
      lastStatus = result.status;
      messageId = result.messageId;
      break;
    }
    lastStatus = result.status;
    lastError = result.error;
    if (!isRetryable(result.status)) break;
    if (attempts < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempts - 1] ?? 1200);
  }
  const permanentFailure = !sent && !isRetryable(lastStatus);

  await finalizeEmailSend(admin, reservation.rowId, {
    success: sent,
    body: sent ? emailHtml : null,
    resendId: messageId,
    errorMessage: sent ? null : `${lastError} (attempts: ${attempts})`,
  });

  // orders.email_log — same internal record every other provider email writes.
  try {
    const { data: cur } = await admin.from("orders").select("email_log").eq("id", order.id).maybeSingle();
    const log = (cur?.email_log as Array<Record<string, unknown>>) ?? [];
    await admin.from("orders").update({
      email_log: [...log, {
        type: "provider_additional_doc_ready",
        sentAt: new Date().toISOString(),
        to: providerEmail,
        success: sent,
      }],
    }).eq("id", order.id);
  } catch { /* non-fatal */ }

  try {
    await admin.from("audit_logs").insert({
      actor_name: actorName, actor_role: actorRole, actor_type: actorRole === "admin" ? "user" : "system",
      category: "communications", source: "notify_provider_additional_doc",
      object_type: "notification", object_id: confirmationId, order_id: order.id,
      action: sent
        ? "provider_additional_doc_notification_sent"
        : "provider_additional_doc_notification_failed",
      description: sent
        ? `${requestType} ready for review — provider ${order.doctor_name ?? providerEmail} notified for order ${confirmationId}.`
        : `${requestType} provider notification FAILED for order ${confirmationId} after ${attempts} attempt(s): ${lastError}. ` +
          `${permanentFailure ? "PERMANENT — needs admin action." : "Retryable — a later trigger or an admin resend can recover it."}`,
      metadata: {
        confirmation_id: confirmationId, order_id: order.id, document_id: docId,
        provider_email: providerEmail, provider_user_id: order.doctor_user_id,
        request_type: requestType, trigger, dedupe_key: dedupeKey,
        delivered: sent, attempts, resend_status: lastStatus,
        permanent: permanentFailure, resend_message_id: messageId,
      },
    });
  } catch (e) {
    console.warn("[notify-provider-additional-doc] audit insert failed:", e instanceof Error ? e.message : String(e));
  }

  if (!sent) {
    console.error(`[notify-provider-additional-doc] send failed for ${confirmationId}: ${lastError}`);
    return json(200, {
      ok: false, actionable: true, emailSent: false,
      permanent: permanentFailure, attempts, error: lastError, dedupeKey,
    });
  }

  console.log(`[notify-provider-additional-doc] ✓ notified ${providerEmail} for ${confirmationId} (doc ${docId})`);
  return json(200, { ok: true, actionable: true, emailSent: true, attempts, messageId, dedupeKey });
});
