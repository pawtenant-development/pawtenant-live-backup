import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finalizeEmailSend, reserveEmailSend } from "../_shared/logEmailComm.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey || !resendKey) {
    return json({ ok: false, error: "Required service configuration is missing" }, 500);
  }

  const token = authHeader.slice("Bearer ".length);
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser(token);
  if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: isAdmin, error: adminError } = await caller.rpc("is_admin_staff");
  if (adminError || isAdmin !== true) return json({ ok: false, error: "Admin access required" }, 403);

  let confirmationId = "";
  try {
    const body = await req.json() as { confirmationId?: string };
    confirmationId = String(body.confirmationId ?? "").trim();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!confirmationId) return json({ ok: false, error: "confirmationId is required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: order } = await admin.from("orders")
    .select("id, confirmation_id, first_name, last_name, email, phone, state, letter_type, doctor_user_id, doctor_name, doctor_email, doctor_status, status, email_log")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();
  if (!order) return json({ ok: false, error: "Order not found" }, 404);

  const { data: activeRequest } = await admin.from("order_additional_pet_requests")
    .select("id, assigned_provider_user_id, status")
    .eq("order_id", order.id)
    .eq("assigned_provider_user_id", order.doctor_user_id)
    .in("status", ["pending_provider_review", "clarification_requested", "resubmitted", "approved_pending_document"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeRequest || order.status !== "under-review" || order.doctor_status !== "pending_review") {
    return json({ ok: false, error: "Order is not an active reassigned case" }, 409);
  }
  if (!order.doctor_email || !order.doctor_name) {
    return json({ ok: false, error: "Assigned provider contact is missing" }, 409);
  }

  const isPsd = order.letter_type === "psd" || confirmationId.toUpperCase().includes("-PSD");
  const caseType = isPsd ? "PSD" : "ESA";
  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || "Patient";
  const subject = `New ${caseType} Case Assigned — ${confirmationId}`;
  const recipient = String(order.doctor_email).trim().toLowerCase();
  const reservation = await reserveEmailSend({
    supabase: admin,
    orderId: order.id,
    confirmationId,
    to: recipient,
    from: "PawTenant <hello@pawtenant.com>",
    subject,
    slug: "provider_assigned_reopened_case",
    recipient,
    extra: String(activeRequest.id),
    templateSource: "hardcoded",
    sentBy: "admin_reopened_case_assignment",
    allowRetryAfterFailed: true,
    staleClaimMinutes: 10,
  });
  if (!reservation.proceed) {
    return json({ ok: true, emailSent: true, alreadySent: true });
  }

  const portalUrl = `https://pawtenant.com/provider-portal?order=${encodeURIComponent(confirmationId)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;padding:32px 16px"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><tr><td style="background:#4a9e8a;padding:28px 32px;text-align:center"><img src="https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png" alt="PawTenant" width="160" style="display:block;margin:0 auto 12px"><h1 style="margin:0;color:#fff;font-size:20px">New Case Assigned</h1><p style="margin:6px 0 0;color:rgba(255,255,255,.82);font-size:13px">PawTenant — ${caseType} Provider Portal</p></td></tr><tr><td style="padding:28px 32px"><p style="margin:0 0 16px;color:#374151;font-size:15px">Hi <strong>${escapeHtml(String(order.doctor_name).split(" ")[0])}</strong>,</p><p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.6">A new ${caseType} evaluation case has been assigned to you. Click below to open it in your portal.</p><table role="presentation" width="100%" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:10px;margin-bottom:22px"><tr><td style="padding:18px 22px"><p style="margin:0 0 10px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase">Case Details</p><p style="margin:5px 0;color:#111827;font-size:13px"><strong>Order ID:</strong> ${escapeHtml(confirmationId)}</p><p style="margin:5px 0;color:#111827;font-size:13px"><strong>Patient:</strong> ${escapeHtml(patientName)}</p><p style="margin:5px 0;color:#111827;font-size:13px"><strong>State:</strong> ${escapeHtml(order.state ?? "Unknown")}</p><p style="margin:5px 0;color:#1a5c4f;font-size:13px"><strong>Status:</strong> Pending Your Review</p></td></tr></table><a href="${portalUrl}" style="display:inline-block;background:#1a5c4f;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:700">View Assigned Order &rarr;</a></td></tr><tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px"><p style="margin:0;color:#9ca3af;font-size:12px">PawTenant — Provider Notification — Do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

  let resendId: string | null = null;
  let sendError: string | null = null;
  try {
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "PawTenant <hello@pawtenant.com>",
        to: [recipient],
        subject,
        html,
      }),
    });
    const result = await send.json().catch(() => ({})) as { id?: string; message?: string };
    if (!send.ok) sendError = result.message ?? `Resend returned HTTP ${send.status}`;
    else resendId = result.id ?? null;
  } catch (error) {
    sendError = error instanceof Error ? error.message : "Email request failed";
  }

  const emailSent = sendError === null;
  await finalizeEmailSend(reservation.rowId, {
    success: emailSent,
    body: null,
    resendId,
    errorMessage: sendError,
  });

  const emailLog = Array.isArray(order.email_log) ? order.email_log : [];
  await admin.from("orders").update({
    email_log: [...emailLog, {
      type: "provider_assigned_provider",
      sentAt: new Date().toISOString(),
      to: recipient,
      success: emailSent,
    }],
  }).eq("id", order.id);

  if (!emailSent) return json({ ok: false, emailSent: false, error: "Provider email failed" }, 502);
  return json({ ok: true, emailSent: true, alreadySent: false, messageId: resendId });
});
