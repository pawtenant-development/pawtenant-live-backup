// admin-review-document
//
// PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §10 / §11.
//
// The single server entry point for the two employee decisions on a provider-
// submitted customer-facing document:
//
//   action = "approve"           → Approve & Deliver
//   action = "request_correction" → Needs Correction (requires a note)
//
// Authorization and attribution model
// ───────────────────────────────────
// The caller MUST present their own Supabase session JWT. The state transition
// is performed by a SECURITY DEFINER RPC invoked ON THAT JWT, so the approver
// recorded in the database is auth.uid() — not a name the client sent. A
// provider's JWT fails is_admin_staff() inside the RPC and can never approve
// their own document. There is no service-role fallback for the decision
// itself; the service role is used only for the side effects afterwards.
//
// Exactly-once notification
// ─────────────────────────
// approve_order_document() / request_order_document_correction() return
// `transitioned: true` for the ONE call that actually moved the row, and
// `transitioned: false` (with a reason) for every replay, double-click and
// losing concurrent caller. Notifications hang off that flag only, so a second
// click can never produce a second customer email. notify-patient-letter's own
// dedupe_key on `communications` is a second, independent layer.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// RA-LIFECYCLE-001 step D: RA completion payout is created on APPROVAL, here.
import { ensureRaCompletionEarning } from "../_shared/raCompletionEarning.ts";
import { evaluateNotificationSuppression } from "../_shared/testNotificationSuppression.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const LETTER_DOC_TYPES = new Set(["esa_letter", "psd_letter", "signed_letter", "letter"]);

interface ReviewResult {
  transitioned: boolean;
  review_status: string;
  reason?: string;
  document_id: string;
  order_id: string;
  confirmation_id: string;
  doc_type: string;
  document_label?: string;
  is_letter?: boolean;
  approved_by_name?: string;
  reviewed_by_name?: string;
  correction_note?: string;
  provider_user_id?: string | null;
  letter_id?: string | null;
}

// ── Provider notification for a correction request ───────────────────────────
async function notifyProviderCorrection(
  admin: ReturnType<typeof createClient>,
  r: ReviewResult,
): Promise<{ portal: boolean; email: boolean }> {
  const out = { portal: false, email: false };

  if (r.provider_user_id) {
    const { error } = await admin.from("doctor_notifications").insert({
      doctor_user_id: r.provider_user_id,
      title: "Correction Requested",
      message:
        `A reviewer asked for a correction on "${r.document_label ?? "your document"}" ` +
        `for order ${r.confirmation_id}: ${r.correction_note ?? ""}`,
      type: "document_correction_requested",
      confirmation_id: r.confirmation_id,
      order_id: r.order_id,
    });
    out.portal = !error;
    if (error) console.error("[admin-review-document] provider portal notif failed:", error.message);
  }

  // Email the provider. Suppressed for TEST fixture recipients by the same
  // fail-closed gate the customer email uses.
  try {
    const { data: prof } = await admin
      .from("doctor_profiles")
      .select("email, full_name")
      .eq("user_id", r.provider_user_id ?? "")
      .maybeSingle();
    const to = ((prof as { email?: string } | null)?.email ?? "").trim();
    if (!to) return out;

    const suppression = evaluateNotificationSuppression(to);
    if (suppression.suppressed) {
      console.warn(`[notifySuppressed] provider correction email suppressed — ${suppression.reason}`);
      return out;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return out;

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:32px 16px;margin:0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;">
<tr><td style="background:#b45309;padding:24px 32px;text-align:center;">
<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Correction Requested</div>
<h1 style="margin:0;font-size:20px;font-weight:800;color:#fff;">A document needs a correction</h1>
</td></tr>
<tr><td style="padding:24px 32px;">
<p style="margin:0 0 16px;font-size:14px;color:#374151;">Order <strong style="font-family:monospace;">${r.confirmation_id}</strong> — ${r.document_label ?? "Document"}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;margin-bottom:20px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">What needs fixing</p>
<p style="margin:0;font-size:14px;color:#374151;">${(r.correction_note ?? "").replace(/</g, "&lt;")}</p>
</td></tr></table>
<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">The customer has not received this document. Please upload a corrected version from your provider portal — your original submission is kept on the record.</p>
<div style="text-align:center;">
<a href="https://pawtenant.com/provider-portal" style="background:#1a5c4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block;">Open Provider Portal &rarr;</a>
</div>
</td></tr></table>
</td></tr></table>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "PawTenant <hello@pawtenant.com>",
        to: [to],
        subject: `[Correction Requested] Order ${r.confirmation_id}`,
        html,
      }),
    });
    out.email = res.ok;
  } catch (err) {
    console.error("[admin-review-document] provider correction email failed:", err);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  // A service-role bearer is deliberately NOT accepted as an approver. Approval
  // must be attributable to a real employee.
  if (bearer === SERVICE_ROLE_KEY) {
    return json(403, {
      ok: false,
      error: "Document approval requires an employee session — a service-role key cannot approve.",
    });
  }

  let body: { documentId?: string; action?: string; note?: string; checklistConfirmed?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const documentId = (body.documentId ?? "").trim();
  const action = (body.action ?? "").trim();
  if (!documentId) return json(400, { ok: false, error: "documentId is required" });
  if (action !== "approve" && action !== "request_correction") {
    return json(400, { ok: false, error: "action must be 'approve' or 'request_correction'" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Resolve the caller for logging. The AUTHORITATIVE authorization check is
  // is_admin_staff() inside the RPC, on this same JWT — this lookup only gives
  // a friendlier 403 and a name for the notification copy.
  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp?.user) return json(401, { ok: false, error: "Invalid token" });
  const callerId = userResp.user.id;

  const { data: prof } = await admin
    .from("doctor_profiles")
    .select("is_admin, is_active, full_name, role")
    .eq("user_id", callerId)
    .maybeSingle();
  const p = prof as { is_admin?: boolean; is_active?: boolean; full_name?: string } | null;
  if (!p || p.is_admin !== true || p.is_active === false) {
    return json(403, { ok: false, error: "Not authorized to review documents" });
  }

  // The transition runs ON THE CALLER'S JWT so auth.uid() inside the RPC is the
  // real approver. This is the whole point — a service-role call would record no
  // actor at all.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });

  if (action === "request_correction") {
    const note = (body.note ?? "").trim();
    if (note.length < 5) {
      return json(400, { ok: false, error: "A correction note of at least 5 characters is required." });
    }
    if (note.length > 1000) {
      return json(400, { ok: false, error: "Correction note must be 1000 characters or fewer." });
    }

    const { data, error } = await asCaller.rpc("request_order_document_correction", {
      p_document_id: documentId,
      p_note: note,
    });
    if (error) {
      console.error("[admin-review-document] correction rpc failed:", error.message);
      return json(error.message.includes("not authorised") ? 403 : 400, { ok: false, error: error.message });
    }

    const r = data as unknown as ReviewResult;
    if (!r.transitioned) {
      return json(200, {
        ok: true, transitioned: false, reviewStatus: r.review_status, reason: r.reason,
        message: "No change — this document is no longer awaiting review.",
      });
    }

    const notified = await notifyProviderCorrection(admin, r);
    return json(200, {
      ok: true, transitioned: true, reviewStatus: "needs_correction",
      documentId: r.document_id, confirmationId: r.confirmation_id,
      providerNotified: notified.portal || notified.email,
      providerEmailSent: notified.email,
      message: "Correction requested. The provider has been notified; the customer has not been notified.",
    });
  }

  // ── APPROVE & DELIVER ──────────────────────────────────────────────────────
  const { data, error } = await asCaller.rpc("approve_order_document", {
    p_document_id: documentId,
  });
  if (error) {
    console.error("[admin-review-document] approve rpc failed:", error.message);
    return json(error.message.includes("not authorised") ? 403 : 400, { ok: false, error: error.message });
  }

  const r = data as unknown as ReviewResult;
  if (!r.transitioned) {
    // Idempotent replay. The document is already in its final state and NO
    // second notification is sent.
    return json(200, {
      ok: true, transitioned: false, reviewStatus: r.review_status, reason: r.reason,
      customerNotified: false,
      message: r.reason === "already_approved"
        ? "Already approved and delivered — no duplicate notification was sent."
        : "No change — this document is no longer awaiting approval.",
    });
  }

  // ── RA-LIFECYCLE-001 step D — the ONLY place RA completion + payout happen ──
  //
  // provider-submit-letter used to mark the RA service completed and create the
  // provider earning at UPLOAD time, which made the provider their own approver
  // and paid out for documents an admin had not seen (and might reject). Both
  // now hang off this approval transition, and only when it really transitioned
  // — an idempotent replay returned above, so a double-click cannot reach here
  // twice.
  //
  // ensureRaCompletionEarning() is itself guarded by a pre-check AND the partial
  // unique index doctor_earnings_ra_completion_order_uniq, so even a genuine
  // race creates exactly one row. The status patch runs FIRST because the helper
  // gates on additional_documentation_status='completed'.
  let raCompleted = false;
  let raEarning: { created: boolean; reason: string } | null = null;
  let raOrderReturnedToCompleted = false;
  try {
    const { data: approvedDoc } = await admin
      .from("order_documents")
      .select("id, order_id, doc_type")
      .eq("id", documentId)
      .maybeSingle();

    if (approvedDoc && approvedDoc.doc_type === "housing_completed") {
      const { data: ord } = await admin
        .from("orders")
        .select("id, status, doctor_status, letter_id")
        .eq("id", approvedDoc.order_id)
        .maybeSingle();

      if (ord) {
        // The base clinical letter is "delivered" once its verification id has
        // been minted. RA approval must never complete an order whose ESA/PSD
        // letter has not reached the customer — that base workflow continues
        // untouched and completes on its own terms.
        const baseDelivered = !!ord.letter_id;
        const patch: Record<string, unknown> = { additional_documentation_status: "completed" };
        if (baseDelivered) {
          patch.status = "completed";
          patch.doctor_status = "patient_notified";
        }
        await admin.from("orders").update(patch).eq("id", ord.id);
        raCompleted = true;
        raOrderReturnedToCompleted = baseDelivered;

        raEarning = await ensureRaCompletionEarning(admin, ord.id as string);
        console.info(
          `[admin-review-document] RA approved for ${ord.id} — baseDelivered=${baseDelivered}, earning=${raEarning?.reason}`,
        );
      }
    }
  } catch (raErr) {
    // Never fail a completed approval because the payout bookkeeping threw. The
    // document IS approved; reconciliation heals the earning, and the helper is
    // idempotent so healing cannot double-pay.
    console.error("[admin-review-document] RA completion side effect failed (non-fatal):", raErr);
  }

  // ── Side effects of a REAL release ─────────────────────────────────────────
  let customerNotified = false;
  let notifySuppressed = false;
  let notifyError: string | null = null;

  const isLetter = r.is_letter === true || LETTER_DOC_TYPES.has(r.doc_type);

  const { data: orderRow } = await admin
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, phone, state, price, letter_type, addon_services, doctor_name")
    .eq("id", r.order_id)
    .maybeSingle();
  const order = orderRow as Record<string, unknown> | null;

  if (isLetter && order) {
    const suppression = evaluateNotificationSuppression((order.email as string | null) ?? null);
    if (suppression.suppressed) {
      notifySuppressed = true;
      console.warn(`[notifySuppressed] order=${r.confirmation_id} — ${suppression.reason} — NO external email sent`);
      await admin.from("audit_logs").insert({
        actor_name: "PawTenant System", actor_role: "system", actor_type: "system",
        category: "communications", source: "admin_review_document",
        object_type: "notification", object_id: r.confirmation_id,
        order_id: r.order_id, document_id: r.document_id,
        action: "notification_suppressed_test_fixture",
        description: `Customer delivery email SUPPRESSED for TEST fixture order ${r.confirmation_id}. No email was sent.`,
        metadata: {
          order_id: r.order_id, confirmation_id: r.confirmation_id,
          suppressed: true, delivered: false, reason: suppression.reason,
          checks: suppression.checks,
        },
      });
    } else {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-patient-letter`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearer}`,
            apikey: ANON_KEY || SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ confirmationId: r.confirmation_id }),
        });
        const parsed = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
        customerNotified = parsed?.ok === true;
        if (!customerNotified) notifyError = parsed?.error ?? `HTTP ${res.status}`;
      } catch (err) {
        notifyError = err instanceof Error ? err.message : "unknown";
      }

      await admin.from("audit_logs").insert({
        actor_name: "PawTenant System", actor_role: "system", actor_type: "system",
        category: "communications", source: "admin_review_document",
        object_type: "notification", object_id: r.confirmation_id,
        order_id: r.order_id, document_id: r.document_id,
        action: "customer_email_sent",
        description: customerNotified
          ? `Document-ready email sent to the customer for order ${r.confirmation_id}.`
          : `Document-ready email FAILED for order ${r.confirmation_id}: ${notifyError}`,
        metadata: {
          order_id: r.order_id, confirmation_id: r.confirmation_id,
          channel: "email", direction: "outbound", recipient_type: "customer",
          template: "letter_ready", delivery_status: customerNotified ? "sent" : "failed",
          error: notifyError, released_by: r.approved_by_name,
        },
      });
    }

    // CRM completion event — fires on DELIVERY, not on submission.
    const addonServices = Array.isArray(order.addon_services) ? (order.addon_services as string[]) : [];
    const isPSD = (order.letter_type as string) === "psd"
      || (r.confirmation_id ?? "").toUpperCase().includes("-PSD");
    fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        webhookType: "main",
        eventType: "order_completed",
        firstName: order.first_name ?? "",
        lastName: order.last_name ?? "",
        email: order.email,
        phone: order.phone ?? "",
        state: order.state ?? "",
        confirmationId: r.confirmation_id,
        amount: (order.price as number) ?? 0,
        letterType: isPSD ? "psd" : "esa",
        addonServices,
        assignedDoctor: order.doctor_name ?? "",
        leadStatus: isPSD ? "PSD — Letter Sent — Completed" : "ESA — Letter Sent — Completed",
        tags: ["Letter Sent", "Completed", isPSD ? "PSD Order" : "ESA Order"],
      }),
    }).catch(() => {});
  }

  return json(200, {
    ok: true,
    transitioned: true,
    reviewStatus: "approved",
    documentId: r.document_id,
    confirmationId: r.confirmation_id,
    approvedBy: r.approved_by_name,
    isLetter,
    customerNotified,
    notifySuppressed,
    notifyError,
    message: isLetter
      ? (customerNotified
          ? "Approved and delivered. The customer has been notified by email."
          : notifySuppressed
            ? "Approved and delivered. Customer email suppressed (TEST fixture order)."
            : "Approved and delivered, but the customer email did not send — you can resend it from the Comms tab.")
      : "Approved. The document is now available to the customer.",
  });
});
