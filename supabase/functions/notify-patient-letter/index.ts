import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

async function sendViaResend(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[notify-patient-letter] RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[notify-patient-letter] Resend error ${res.status}: ${errBody}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify-patient-letter] Resend fetch error:", err);
    return false;
  }
}

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
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">${COMPANY_NAME} &mdash; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function detailCard(title: string, rows: Array<[string, string, string?]>): string {
  const rowsHtml = rows.map(([label, value, valueColor]) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:${valueColor ?? "#111827"};">${value}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${title}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </td></tr>
  </table>`;
}

function stepsCard(title: string, steps: string[]): string {
  const stepsHtml = steps.map((step, i) => `
    <tr>
      <td style="padding:7px 0;vertical-align:top;width:30px;">
        <div style="width:22px;height:22px;background:${ACCENT};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">${i + 1}</div>
      </td>
      <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">${step}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${title}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
    </td></tr>
  </table>`;
}

function ctaButton(url: string, text: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td align="center">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${text} &rarr;</a>
    </td></tr>
  </table>`;
}

function docIcon(label = "") {
  const l = String(label).toLowerCase();
  if (l.includes("housing")) return "&#127968;";
  if (l.includes("letter")) return "&#128196;";
  if (l.includes("pdf")) return "&#128206;";
  return "&#128196;";
}

function buildDocumentsReadyEmail(opts: {
  firstName?: string;
  confirmationId: string;
  doctorName?: string;
  doctorMessage?: string | null;
  letterId?: string | null;
}, docs: Array<{ label: string; url: string }> = []): string {
  const name = escapeHtml(opts.firstName || "there");
  const providerName = escapeHtml(opts.doctorName ?? "Your Provider");

  const docListHtml = docs.length > 0
    ? docs.map((doc) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#374151;vertical-align:middle;">
          <span style="margin-right:6px;">${docIcon(doc.label)}</span> ${escapeHtml(doc.label)}
        </td>
        <td style="padding:8px 0;text-align:right;vertical-align:middle;">
          <a href="${escapeHtml(doc.url)}" style="display:inline-block;background:${ACCENT};color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;">Download</a>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="2" style="padding:8px 0;font-size:13px;color:#6b7280;">Documents are available in your portal below.</td></tr>`;

  const docsCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Documents</p>
      <table width="100%" cellpadding="0" cellspacing="0">${docListHtml}</table>
    </td></tr>
  </table>`;

  const doctorNoteHtml = opts.doctorMessage
    ? `<div style="background:#f0faf7;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.08em;">A note from ${providerName}</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;font-style:italic;">&ldquo;${escapeHtml(opts.doctorMessage)}&rdquo;</p>
      </div>`
    : "";

  const verificationBadge = opts.letterId
    ? `<div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">&#128274; Letter Verification ID</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#c2410c;letter-spacing:0.05em;">${escapeHtml(opts.letterId)}</p>
        <p style="margin:0;font-size:12px;color:#78350f;">
          Landlords can verify this letter at
          <a href="https://${COMPANY_DOMAIN}/verify/${escapeHtml(opts.letterId)}" style="color:#c2410c;text-decoration:none;font-weight:700;">
            ${COMPANY_DOMAIN}/verify/${escapeHtml(opts.letterId)}
          </a>
        </p>
      </div>`
    : "";

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Your ESA letter has been signed and is ready for download. You can access all your documents below or directly through your portal.
    </p>
    ${doctorNoteHtml}
    ${docsCard}
    ${verificationBadge}
    ${detailCard("Order Summary", [
      ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
      ["Completed By", providerName, ACCENT],
      ["Status", '<span style="color:#059669;font-weight:700;">Completed</span>'],
    ])}
    ${ctaButton(PORTAL_URL, "View All Documents")}
    ${stepsCard("What To Do With Your Letter", [
      "Download your signed ESA letter and keep a digital copy",
      "Present it to your landlord or housing provider as needed",
      "Contact us at any time if you need a renewal or have questions",
    ])}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Your ESA letter is legally recognized under the Fair Housing Act. If you ever need assistance, we&rsquo;re always here at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>`;

  return baseLayout("Documents Ready", "Your ESA Letter is here!", "Your signed documents are ready for download", body);
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(
  supabase: ReturnType<typeof createClient>,
  confirmationId: string,
  entry: EmailLogEntry
): Promise<void> {
  try {
    const { data } = await supabase
      .from("orders")
      .select("email_log")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await supabase
      .from("orders")
      .update({ email_log: [...currentLog, entry] })
      .eq("confirmation_id", confirmationId);
  } catch (err) {
    console.warn("[notify-patient-letter] email_log update failed:", err);
  }
}

interface OrderDoc {
  id: string;
  label: string;
  doc_type: string;
  file_url: string;
  processed_file_url: string | null;
  footer_injected: boolean | null;
  customer_visible: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) return jsonResp({ error: "Unauthorized — missing token" }, 401);

  let userId: string | null = null;
  let isAdmin = false;

  if (token === serviceKey) {
    // Internal service call — full trust
    isAdmin = true;
    userId = null;
  } else {
    // Try to resolve as a Supabase Auth user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      // Not a valid Supabase Auth session — check if it's the anon key (OTP admin login)
      // For OTP-based admin logins, the token may be the anon key; treat as unauthorized
      // unless we can verify via doctor_profiles by another means.
      // Since we can't identify the user without a valid JWT, reject.
      console.error("[notify-patient-letter] Auth failed:", authErr?.message ?? "no user");
      return jsonResp({ error: "Unauthorized" }, 401);
    }
    userId = user.id;

    const { data: callerProfile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, role")
      .eq("user_id", userId)
      .maybeSingle();
    isAdmin = callerProfile?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResp({ error: "Invalid JSON body" }, 400);
  }

  const confirmationId = body.confirmationId as string | undefined;
  const doctorMessage = (body.doctorMessage as string | null | undefined) ?? null;
  if (!confirmationId) return jsonResp({ error: "confirmationId is required" }, 400);

  console.log(`[notify-patient-letter] Processing ${confirmationId} — isAdmin:${isAdmin} userId:${userId ?? "internal"}`);

  // ── Fetch order ───────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_email, doctor_name, signed_letter_url, price, doctor_status, patient_notification_sent_at, letter_id")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (orderErr) {
    console.error("[notify-patient-letter] Order fetch error:", orderErr.message);
    return jsonResp({ error: `Order fetch failed: ${orderErr.message}` }, 500);
  }
  if (!order) {
    return jsonResp({ error: `Order not found: ${confirmationId}` }, 404);
  }

  // ── Authorization check (skip for admin/internal) ─────────────────────────
  if (!isAdmin && userId) {
    const isAssignedByUserId = order.doctor_user_id === userId;
    let isAssignedByEmail = false;

    if (!isAssignedByUserId && order.doctor_email) {
      const { data: providerProfile } = await supabase
        .from("doctor_profiles")
        .select("email")
        .eq("user_id", userId)
        .maybeSingle();
      if (providerProfile?.email && order.doctor_email.toLowerCase() === providerProfile.email.toLowerCase()) {
        isAssignedByEmail = true;
        await supabase.from("orders").update({ doctor_user_id: userId }).eq("confirmation_id", confirmationId);
      }
    }

    if (!isAssignedByUserId && !isAssignedByEmail) {
      return jsonResp({ error: "Access denied — not assigned to this case" }, 403);
    }
  }

  // ── Fetch documents ───────────────────────────────────────────────────────
  let docs: OrderDoc[] = [];
  try {
    const { data: orderDocs, error: docsErr } = await supabase
      .from("order_documents")
      .select("id, label, doc_type, file_url, processed_file_url, footer_injected, customer_visible")
      .eq("order_id", order.id)
      .eq("customer_visible", true)
      .order("uploaded_at", { ascending: true });

    if (docsErr) {
      console.warn("[notify-patient-letter] order_documents fetch error:", docsErr.message);
    } else {
      docs = (orderDocs as OrderDoc[]) ?? [];
    }
  } catch (err) {
    console.warn("[notify-patient-letter] order_documents exception:", err);
  }

  const totalDocCount = (order.signed_letter_url ? 1 : 0) +
    docs.filter((d) => d.file_url !== order.signed_letter_url).length;

  if (!order.signed_letter_url && docs.length === 0) {
    return jsonResp({ error: "No documents available to send for this order" }, 400);
  }

  // ── Update order status ───────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      patient_notification_sent_at: new Date().toISOString(),
      doctor_status: "patient_notified",
      status: "completed",
    })
    .eq("confirmation_id", confirmationId);

  if (updateErr) {
    console.error("[notify-patient-letter] Order update error:", updateErr.message);
    return jsonResp({ error: `Failed to update order: ${updateErr.message}` }, 500);
  }

  // ── Earnings record ───────────────────────────────────────────────────────
  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || order.email;
  const resolvedDoctorUserId = order.doctor_user_id ?? userId;
  let earningsCreated = false;

  try {
    const { data: existingEarning } = await supabase
      .from("doctor_earnings")
      .select("id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (!existingEarning && resolvedDoctorUserId) {
      const { data: doctorProfile } = await supabase
        .from("doctor_profiles")
        .select("full_name, email, per_order_rate")
        .eq("user_id", resolvedDoctorUserId)
        .maybeSingle();
      const perOrderRate = (doctorProfile as { per_order_rate?: number | null } | null)?.per_order_rate ?? null;
      await supabase.from("doctor_earnings").insert({
        doctor_user_id: resolvedDoctorUserId,
        doctor_name: doctorProfile?.full_name ?? order.doctor_name ?? "",
        doctor_email: doctorProfile?.email ?? order.doctor_email ?? "",
        order_id: order.id,
        confirmation_id: confirmationId,
        patient_name: patientName,
        patient_state: order.state ?? "",
        order_amount: order.price ?? 0,
        doctor_amount: perOrderRate,
        status: "pending",
      });
      earningsCreated = true;
    }
  } catch (err) {
    console.warn("[notify-patient-letter] earnings insert error:", err);
  }

  // ── Resolve best URL for each doc ─────────────────────────────────────────
  const resolveUrl = (doc: OrderDoc): string => {
    if (doc.footer_injected && doc.processed_file_url) return doc.processed_file_url;
    return doc.file_url;
  };

  const allDocs: Array<{ label: string; url: string }> = [];

  if (order.signed_letter_url) {
    const matchingDoc = docs.find(
      (d) => d.file_url === order.signed_letter_url || d.processed_file_url === order.signed_letter_url
    );
    const url = matchingDoc ? resolveUrl(matchingDoc) : order.signed_letter_url;
    allDocs.push({ label: "Signed ESA Letter", url });
  }

  docs
    .filter((d) => d.customer_visible && d.file_url !== order.signed_letter_url && d.processed_file_url !== order.signed_letter_url)
    .forEach((doc) => allDocs.push({ label: doc.label, url: resolveUrl(doc) }));

  const letterId = (order.letter_id as string | null) ?? null;

  // ── Build + send email ────────────────────────────────────────────────────
  const docCount = allDocs.length;
  const subjectSuffix = docCount > 1 ? ` (${docCount} documents)` : "";

  const html = buildDocumentsReadyEmail(
    {
      firstName: order.first_name ?? "there",
      confirmationId,
      doctorName: order.doctor_name ?? "Your Provider",
      doctorMessage: doctorMessage?.trim() || null,
      letterId,
    },
    allDocs,
  );

  const emailSent = await sendViaResend({
    to: order.email,
    subject: `Your Documents Are Ready — Order ${confirmationId}${subjectSuffix}`,
    html,
  });

  console.log(`[notify-patient-letter] Email sent: ${emailSent} to ${order.email} — letterId: ${letterId ?? "none"} — docs: ${allDocs.length}`);

  await appendEmailLog(supabase, confirmationId, {
    type: "letter_ready",
    sentAt: new Date().toISOString(),
    to: order.email,
    success: emailSent,
  });

  if (emailSent && docs.length > 0) {
    await supabase
      .from("order_documents")
      .update({ sent_to_customer: true })
      .in("id", docs.filter((d) => d.file_url !== order.signed_letter_url).map((d) => d.id));
  }

  // ── GHL webhook ───────────────────────────────────────────────────────────
  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      webhookType: "main",
      event: "documents_ready_for_patient",
      email: order.email,
      firstName: order.first_name ?? "",
      lastName: order.last_name ?? "",
      phone: (order.phone as string) ?? "",
      confirmationId,
      patientName,
      patientState: order.state ?? "",
      documentsCount: totalDocCount,
      notifiedAt: new Date().toISOString(),
      leadStatus: "Documents Ready — Patient Notified",
      tags: ["Documents Ready", "Patient Notified"],
    }),
  }).catch(() => {});

  return jsonResp({
    ok: true,
    message: `Patient notified for order ${confirmationId}`,
    confirmationId,
    patientEmail: order.email,
    docsEmailed: totalDocCount,
    emailSent,
    earningsCreated,
    letterId,
    verificationIncluded: !!letterId,
  });
});
