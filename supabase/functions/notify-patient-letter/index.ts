import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";
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
const ACCENT = "#4a7fb5";

interface ResendAttachment { filename: string; content: string }

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: ResendAttachment[];
}): Promise<{ success: boolean; error?: string; resendId?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    const msg = "RESEND_API_KEY environment variable is not set in Supabase secrets";
    console.error("[notify-patient-letter]", msg);
    return { success: false, error: msg };
  }
  try {
    const body: Record<string, unknown> = {
      from: FROM_ADDRESS,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments && opts.attachments.length > 0) {
      body.attachments = opts.attachments;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      let parsed: { message?: string; name?: string } = {};
      try { parsed = JSON.parse(errBody); } catch { /* ignore */ }
      const detail = parsed.message ?? errBody.slice(0, 300);
      const msg = `Resend API error ${res.status}: ${detail}`;
      console.error(`[notify-patient-letter] ${msg}`);
      return { success: false, error: msg };
    }
    const data = await res.json() as { id?: string };
    return { success: true, resendId: data.id };
  } catch (err) {
    const msg = err instanceof Error ? `Network error calling Resend: ${err.message}` : "Unknown network error calling Resend";
    console.error("[notify-patient-letter]", msg);
    return { success: false, error: msg };
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
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

  const docsCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Documents</p>
      <table width="100%" cellpadding="0" cellspacing="0">${docListHtml}</table>
    </td></tr>
  </table>`;

  const doctorNoteHtml = opts.doctorMessage
    ? `<div style="background:#eef2f9;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
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
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(supabase: ReturnType<typeof createClient>, confirmationId: string, entry: EmailLogEntry): Promise<void> {
  try {
    const { data } = await supabase.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await supabase.from("orders").update({ email_log: [...currentLog, entry] }).eq("confirmation_id", confirmationId);
  } catch (err) { console.warn("[notify-patient-letter] email_log update failed:", err); }
}

interface OrderDoc {
  id: string; label: string; doc_type: string; file_url: string;
  processed_file_url: string | null; footer_injected: boolean | null; customer_visible: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonResp({ error: "Unauthorized — missing token" }, 401);

  let userId: string | null = null;
  let isAdmin = false;

  if (token === serviceKey) {
    isAdmin = true;
    userId = null;
  } else {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) { console.error("[notify-patient-letter] Auth failed:", authErr?.message ?? "no user"); return jsonResp({ error: "Unauthorized" }, 401); }
    userId = user.id;
    const { data: callerProfile } = await supabase.from("doctor_profiles").select("is_admin, role, email").eq("user_id", userId).maybeSingle();
    isAdmin = callerProfile?.is_admin === true
      || ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "")
      || (callerProfile?.email ?? "").endsWith("@pawtenant.com");
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return jsonResp({ error: "Invalid JSON body" }, 400); }

  const confirmationId = body.confirmationId as string | undefined;
  const doctorMessage = (body.doctorMessage as string | null | undefined) ?? null;
  // DOCS-RESEND-DEDUPE-BYPASS (2026-05-19): allow callers (the admin
  // Resend / Send All buttons + the provider-side auto notify) to
  // signal whether this is a manual resend ("force") or an automatic
  // one-time delivery. Defaults preserve existing behavior for callers
  // that do not opt in.
  const forceResend = body.force === true || body.manual === true;
  if (!confirmationId) return jsonResp({ error: "confirmationId is required" }, 400);

  const { data: order, error: orderErr } = await supabase.from("orders").select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_email, doctor_name, signed_letter_url, price, doctor_status, patient_notification_sent_at, letter_id").eq("confirmation_id", confirmationId).maybeSingle();
  if (orderErr) { console.error("[notify-patient-letter] Order fetch error:", orderErr.message); return jsonResp({ error: `Order fetch failed: ${orderErr.message}` }, 500); }
  if (!order) return jsonResp({ error: `Order not found: ${confirmationId}` }, 404);

  if (!isAdmin && userId) {
    const isAssignedByUserId = order.doctor_user_id === userId;
    let isAssignedByEmail = false;
    if (!isAssignedByUserId && order.doctor_email) {
      const { data: providerProfile } = await supabase.from("doctor_profiles").select("email").eq("user_id", userId).maybeSingle();
      if (providerProfile?.email && order.doctor_email.toLowerCase() === providerProfile.email.toLowerCase()) {
        isAssignedByEmail = true;
        await supabase.from("orders").update({ doctor_user_id: userId }).eq("confirmation_id", confirmationId);
      }
    }
    if (!isAssignedByUserId && !isAssignedByEmail) return jsonResp({ error: "Access denied — not assigned to this case" }, 403);
  }

  let docs: OrderDoc[] = [];
  try {
    const { data: orderDocs, error: docsErr } = await supabase.from("order_documents").select("id, label, doc_type, file_url, processed_file_url, footer_injected, customer_visible").eq("order_id", order.id).eq("customer_visible", true).order("uploaded_at", { ascending: true });
    if (docsErr) { console.warn("[notify-patient-letter] order_documents fetch error:", docsErr.message); }
    else { docs = (orderDocs as OrderDoc[]) ?? []; }
  } catch (err) { console.warn("[notify-patient-letter] order_documents exception:", err); }

  // ── 2026-05-19 DOCS-RESEND-DOCUMENT-COUNT-FIX ──────────────────────────
  // Build the canonical deliverable list HERE (was previously computed
  // after the dedupe check, which left the dedupe-return path with no
  // count → UI rendered "0 document(s) delivered"). Same resolveUrl rule
  // as before — prefer the footer-injected processed_file_url when
  // available, fall back to the raw file_url.
  const resolveUrl = (doc: OrderDoc): string => { if (doc.footer_injected && doc.processed_file_url) return doc.processed_file_url; return doc.file_url; };
  const allDocs: Array<{ label: string; url: string; id?: string }> = [];
  if (order.signed_letter_url) {
    const matchingDoc = docs.find((d) => d.file_url === order.signed_letter_url || d.processed_file_url === order.signed_letter_url);
    const url = matchingDoc ? resolveUrl(matchingDoc) : order.signed_letter_url;
    allDocs.push({ label: "Signed ESA Letter", url, id: matchingDoc?.id });
  }
  docs
    .filter((d) => d.customer_visible && d.file_url !== order.signed_letter_url && d.processed_file_url !== order.signed_letter_url)
    .forEach((doc) => allDocs.push({ label: doc.label, url: resolveUrl(doc), id: doc.id }));

  // ── 2026-05-19 EMAIL-LETTER-DELIVERY-SIGNED-DOCUMENT-LINKS ────────────
  // Any URL pointing at /storage/v1/object/(public|sign|authenticated)/
  // <bucket>/<path> gets re-signed via createSignedUrl. The "letters"
  // bucket is private (per 20260519140000) so the raw /object/public/
  // pattern returns "Bucket not found"; signed URLs work regardless of
  // public/private state. 30-day TTL — generous enough for archive +
  // resend; resends generate fresh URLs anyway. URLs that do not match
  // a Supabase storage path (external CDN, etc.) are returned unchanged.
  // Returns null when re-signing fails so the caller can skip the doc.
  const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
  const storagePathRe = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/;
  async function ensureDownloadUrl(rawUrl: string | null | undefined): Promise<string | null> {
    if (!rawUrl) return null;
    try {
      const parsed = new URL(rawUrl);
      const match = parsed.pathname.match(storagePathRe);
      if (!match) return rawUrl; // not a Supabase storage URL — leave alone
      const bucket = decodeURIComponent(match[1]);
      const path   = decodeURIComponent(match[2]);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        console.warn(`[notify-patient-letter] createSignedUrl failed for ${bucket}/${path}: ${error?.message ?? "no signed url"}`);
        return null;
      }
      return data.signedUrl;
    } catch (err) {
      console.warn("[notify-patient-letter] ensureDownloadUrl threw:", err);
      return null;
    }
  }

  // Re-sign every doc URL serially (count is small, typically 1-3 docs)
  // so logs stay readable on failures. Drop docs we cannot resolve to a
  // working URL — they would otherwise produce "Bucket not found" in
  // the customer's inbox.
  const resolvedDocs: Array<{ label: string; url: string; id?: string }> = [];
  for (const d of allDocs) {
    const signed = await ensureDownloadUrl(d.url);
    if (!signed) {
      console.warn(`[notify-patient-letter] dropping unresolvable doc ${d.label} (raw=${d.url}) for ${confirmationId}`);
      continue;
    }
    resolvedDocs.push({ label: d.label, url: signed, id: d.id });
  }
  // Replace the original list — every downstream consumer (subject
  // suffix, doc count, document_list HTML, attachments) now reads
  // resolved working URLs.
  allDocs.length = 0;
  allDocs.push(...resolvedDocs);

  // DOCS-RESEND-ATTACHMENT-SELECTION-FIX: the canonical count is the
  // number of rows we will actually email (after dedupe of signed_letter
  // and processed_file_url collisions). Previously totalDocCount used a
  // weaker filter and could differ from the real attachment list.
  const docsEmailedCount = allDocs.length;

  if (docsEmailedCount === 0) {
    return jsonResp({
      error: "No working document download URL could be generated. Verify the letters bucket exists, the file is uploaded, and the storage path on order_documents is correct.",
      docsEmailed: 0,
    }, 500);
  }

  // ── 2026-05-19 DOCS-RESEND-DEDUPE-BYPASS ──────────────────────────────
  // Previously the dedupe key was `{confirmationId}:letter_ready` — a
  // PERMANENT key. Once a single letter_ready landed, every subsequent
  // admin Resend / Send All click hit the unique-violation branch in
  // reserveEmailSend and the function returned ok=true without sending
  // a new email. Admins saw "Email sent! N document(s) delivered" but
  // no new comms row, no new Resend message, nothing in the dashboard.
  //
  // Fix:
  //   • force=true / manual=true in the payload → use a fully unique
  //     dedupe key (Date.now() + crypto.randomUUID().slice(0,8)) so a
  //     fresh reservation always succeeds. Reserved for explicit
  //     admin manual resends.
  //   • Otherwise → use a 3-SECOND-bucketed key. Protects against
  //     accidental double-clicks within ~3 s but lets a deliberate
  //     resend a few seconds later succeed. The "DOCUMENTS_READY_LEGACY"
  //     dedupe row from the original first send no longer blocks any
  //     future click because the new key shape doesn't collide with it.
  //
  // Every real reservation = a fresh communications row, exactly as the
  // user-facing comms timeline requires.
  const subjectSuffixPre = docsEmailedCount > 1 ? ` (${docsEmailedCount} documents)` : "";
  const dedupeBucket = forceResend
    ? `${Date.now()}.${crypto.randomUUID().slice(0, 8)}`
    : `${Math.floor(Date.now() / 3000)}`;
  const dedupeKey = `${confirmationId}:letter_delivery:${forceResend ? "manual" : "auto"}:${dedupeBucket}`;
  const reserve = await reserveEmailSend({
    supabase,
    orderId: order.id as string,
    confirmationId,
    to: order.email,
    from: FROM_ADDRESS,
    subject: `Your Documents Are Ready — Order ${confirmationId}${subjectSuffixPre}`,
    slug: "letter_delivery",
    dedupeKey,
    templateSource: "hardcoded",
    sentBy: forceResend ? "admin_manual_resend" : "provider_notify_patient",
  });
  if (!reserve.proceed) {
    console.info(`[notify-patient-letter] DEDUPED for ${confirmationId} (key=${reserve.dedupeKey})`);
    // DOCS-RESEND-DEDUPE-BYPASS: surface the skip as a failure to the
    // OrderDetailModal (frozen file reads result.ok + result.error). The
    // 3 s race-protection window only blocks accidental double-clicks;
    // a real second click >3 s later passes cleanly.
    return jsonResp({
      ok: false,
      sent: false,
      skippedBecauseDuplicate: true,
      error: "Another send is already in progress — please wait a few seconds and try again.",
      confirmationId,
      dedupeKey: reserve.dedupeKey,
      docsEmailed: docsEmailedCount,
    });
  }

  const { error: updateErr } = await supabase.from("orders").update({ patient_notification_sent_at: new Date().toISOString(), doctor_status: "patient_notified", status: "completed" }).eq("confirmation_id", confirmationId);
  if (updateErr) {
    console.error("[notify-patient-letter] Order update error:", updateErr.message);
    await finalizeEmailSend(supabase, reserve.rowId, { success: false, errorMessage: `order update failed: ${updateErr.message}` });
    return jsonResp({ error: `Failed to update order: ${updateErr.message}` }, 500);
  }

  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || order.email;
  const resolvedDoctorUserId = order.doctor_user_id ?? userId;
  let earningsCreated = false;

  try {
    // Guard against duplicate BASE earnings: filter to the base earning only. A bare
    // .maybeSingle() on confirmation_id errors (returns null) once a second row — e.g. an
    // add-on earning — shares the confirmation_id, which previously re-inserted duplicate
    // base rows on every re-send/re-completion.
    const { data: existingBase } = await supabase.from("doctor_earnings").select("id").eq("confirmation_id", confirmationId).eq("earning_type", "base").neq("status", "cancelled").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!existingBase && resolvedDoctorUserId) {
      const { data: doctorProfile } = await supabase.from("doctor_profiles").select("full_name, email, per_order_rate").eq("user_id", resolvedDoctorUserId).maybeSingle();
      const perOrderRate = (doctorProfile as { per_order_rate?: number | null } | null)?.per_order_rate ?? null;
      const { error: earnErr } = await supabase.from("doctor_earnings").insert({ doctor_user_id: resolvedDoctorUserId, doctor_name: doctorProfile?.full_name ?? order.doctor_name ?? "", doctor_email: doctorProfile?.email ?? order.doctor_email ?? "", order_id: order.id, confirmation_id: confirmationId, patient_name: patientName, patient_state: order.state ?? "", order_amount: order.price ?? 0, doctor_amount: perOrderRate, status: "pending", earning_type: "base" });
      // 23505 = unique_violation on the base-earning partial index → a concurrent run already created it; treat as success.
      if (!earnErr || (earnErr as { code?: string }).code === "23505") earningsCreated = !earnErr;
      else console.warn("[notify-patient-letter] earnings insert error:", earnErr.message);
    }
  } catch (err) { console.warn("[notify-patient-letter] earnings insert error:", err); }

  const letterId = (order.letter_id as string | null) ?? null;
  const subjectSuffix = docsEmailedCount > 1 ? ` (${docsEmailedCount} documents)` : "";
  const subject = `Your Documents Are Ready — Order ${confirmationId}${subjectSuffix}`;

  // ── 2026-05-19 EMAIL-LETTER-DELIVERY-TEMPLATE-HUB ──────────────────────
  // Prefer the DB-managed letter_delivery template when it exists. This
  // lets admins edit the wording / Review CTA from the Templates Hub
  // without redeploying the edge function. The hardcoded
  // buildDocumentsReadyEmail layout remains the fallback so a missing
  // template never blocks delivery.
  //
  // EMAIL-LETTER-DELIVERY-HTML-NO-DOUBLE-WRAP (2026-05-19): when the
  // DB body is already full email-safe HTML (starts/contains <!DOCTYPE,
  // <html, or <table at the root), we substitute placeholders and ship
  // it directly — no baseLayout wrap. Wrapping a complete HTML email
  // inside another HTML email produced ugly line breaks and lost the
  // designed cards. Plain-text bodies (no HTML tags) still get the old
  // paragraph render + baseLayout wrap so older / non-HTML templates
  // keep working.
  //
  // ── 2026-05-19 EMAIL-LETTER-DELIVERY-GOOGLE-REVIEW-URL ────────────────
  // {review_url} in the Letter Delivery template used to resolve to
  // pawtenant.com/review/<conf>, which 404'd because that route does
  // not exist. The customer-facing review channel is Google. Resolve
  // order: GOOGLE_REVIEW_URL env > REVIEW_URL env > the canonical
  // Google search/reviews URL the owner picked. Same URL is hardcoded
  // in TrustpilotReviewPanel.tsx as GOOGLE_REVIEW_FALLBACK so the
  // OrderDetail manual review request + the auto Letter Delivery
  // email share a single source of truth.
  //
  // Set the GOOGLE_REVIEW_URL secret to a write-review URL once the
  //   https://search.google.com/local/writereview?placeid=<PLACE_ID>
  // is provisioned and admins prefer it over the search results page.
  const REVIEW_URL_FALLBACK =
    "https://www.google.com/search?sca_esv=08d3373863b39b87&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qOcgBj58jmxujTZ7byPAw8npggXTcPRI82lkEhuTmamSruv_EA9uwdfELsrB4RPReQ-OPCTj609pZy3sSjc4oz_EHV8no&q=PawTenant+Reviews&sa=X&ved=2ahUKEwjQzuTHjMSUAxUSA9sEHYkzJfIQ0bkNegQIIRAF";
  const reviewUrl = (
    Deno.env.get("GOOGLE_REVIEW_URL")
    ?? Deno.env.get("REVIEW_URL")
    ?? REVIEW_URL_FALLBACK
  ).trim() || REVIEW_URL_FALLBACK;

  const verificationUrl = letterId
    ? `https://${COMPANY_DOMAIN}/verify/${encodeURIComponent(letterId)}`
    : "";

  // Polished document_list: each document is a <tr> with icon + label
  // + Download button, matching the original Letter Delivery design.
  // The template body wraps this in an outer <table> so we only emit
  // <tr> rows here. Empty-doc fallback uses a single full-width row.
  const documentListHtmlForTemplate = allDocs.length > 0
    ? allDocs.map((d) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#374151;vertical-align:middle;">
            <span style="margin-right:6px;">${docIcon(d.label)}</span> ${escapeHtml(d.label)}
          </td>
          <td style="padding:8px 0;text-align:right;vertical-align:middle;">
            <a href="${escapeHtml(d.url)}" style="display:inline-block;background:#4a7fb5;color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;">Download</a>
          </td>
        </tr>`).join("")
    : `<tr><td colspan="2" style="padding:8px 0;font-size:13px;color:#6b7280;">Documents are available in your portal below.</td></tr>`;

  // Detect full-HTML body (any of <!DOCTYPE, <html, <table at the start).
  const looksLikeFullHtml = (s: string): boolean =>
    /^\s*(?:<!DOCTYPE\s+html|<html[\s>]|<table[\s>])/i.test(s);

  let html = "";
  let templateSourceUsed: "db_letter_delivery" | "hardcoded" = "hardcoded";
  try {
    const { data: tmpl } = await supabase
      .from("email_templates")
      .select("subject, body, cta_label, cta_url")
      .eq("slug", "letter_delivery")
      .eq("channel", "email")
      .maybeSingle();
    const t = tmpl as { subject?: string | null; body?: string | null; cta_label?: string | null; cta_url?: string | null } | null;
    if (t && (t.body ?? "").trim().length > 0) {
      const reviewCtaLabel = (t.cta_label ?? "").trim() || "Leave a Review";
      // REVIEW-PANEL-GOOGLE-URL-SWITCH (2026-05-19): prefer the DB
      // row's cta_url so admin edits in the Templates Hub go live
      // immediately. Ignore unsubstituted placeholders / legacy
      // Trustpilot / dead pawtenant.com/review/<id> values so a
      // stale row never beats the env / fallback resolution.
      const rawDbCtaUrl = (t.cta_url ?? "").trim();
      const dbCtaUrlUsable =
        !!rawDbCtaUrl &&
        rawDbCtaUrl !== "{review_url}" &&
        !rawDbCtaUrl.includes("trustpilot.com") &&
        !rawDbCtaUrl.includes(`${COMPANY_DOMAIN}/review/`);
      const effectiveReviewUrl = dbCtaUrlUsable ? rawDbCtaUrl : reviewUrl;
      const vars: Record<string, string> = {
        name: order.first_name || "there",
        order_id: confirmationId,
        document_list: documentListHtmlForTemplate,
        portal_url: PORTAL_URL,
        verification_id: letterId ?? "",
        verification_url: verificationUrl,
        provider_name: order.doctor_name || "Your Provider",
        review_url: effectiveReviewUrl,
        review_cta_label: reviewCtaLabel,
        support_email: SUPPORT_EMAIL,
      };
      const substitute = (s: string): string =>
        String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

      const rawBody = t.body ?? "";
      const renderedSubject = substitute(t.subject ?? "") || subject;

      if (looksLikeFullHtml(rawBody)) {
        // Full email-safe HTML — substitute placeholders, ship directly.
        // No baseLayout wrap (would double-wrap and break the design).
        html = substitute(rawBody);
      } else {
        // Plain-text body — paragraph render + auto CTA + baseLayout
        // wrap, preserving back-compat with non-HTML DB templates.
        const renderedBody    = substitute(rawBody);
        const renderedCtaLbl  = substitute(t.cta_label ?? "") || "View All Documents";
        const renderedCtaUrl  = substitute(t.cta_url   ?? "") || PORTAL_URL;
        const paragraphs = renderedBody
          .split("\n\n")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => `<p style="margin:0 0 16px;line-height:1.7;color:#374151;font-size:15px;">${p.replace(/\n/g, "<br/>")}</p>`)
          .join("");
        const ctaBlock = renderedCtaLbl && renderedCtaUrl
          ? `<div style="text-align:center;margin:28px 0;">
               <a href="${escapeHtml(renderedCtaUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">${escapeHtml(renderedCtaLbl)}</a>
             </div>`
          : "";
        const contentBody = `${paragraphs}${ctaBlock}`;
        html = baseLayout("Documents Ready", renderedSubject, "Your signed documents are ready for download", contentBody);
      }
      templateSourceUsed = "db_letter_delivery";
    }
  } catch (err) {
    console.warn("[notify-patient-letter] letter_delivery template render failed — falling back:", err);
  }
  if (!html) {
    html = buildDocumentsReadyEmail({
      firstName: order.first_name ?? "there",
      confirmationId,
      doctorName: order.doctor_name ?? "Your Provider",
      doctorMessage: doctorMessage?.trim() || null,
      letterId,
    }, allDocs);
    templateSourceUsed = "hardcoded";
  }

  // ── 2026-05-19 DOCS-RESEND-BROKEN ─────────────────────────────────────
  // Fetch each document as binary, base64-encode, and attach to the email.
  // Previously the email contained only HTML <a href="…"> download links,
  // which (a) confused customers who expected an attached PDF, (b) broke
  // for any mail client that strips signed URLs, and (c) made forwarding
  // / archiving the letter awkward. Attachments now match the customer
  // expectation. Failures to fetch any single document are tolerated —
  // we still send the email with whatever PDFs we successfully fetched
  // (and the in-body links remain as a fallback download path).
  //
  // Resend caps individual attachments at 40 MB. We cap at 25 MB per
  // doc as a safety margin; oversize docs skip attachment but still
  // appear as in-body links.
  const RESEND_MAX_ATTACH_BYTES = 25 * 1024 * 1024;
  const attachments: ResendAttachment[] = [];
  for (const doc of allDocs) {
    try {
      // EMAIL-LETTER-DELIVERY-SIGNED-DOCUMENT-LINKS: doc.url is now a
      // signed Supabase storage URL (or an external CDN URL). No
      // Authorization header needed — the signing token is in the URL
      // query string for storage URLs, and external CDNs are public.
      const fileRes = await fetch(doc.url);
      if (!fileRes.ok) {
        console.warn(`[notify-patient-letter] attachment fetch ${fileRes.status} for ${doc.label}`);
        continue;
      }
      const buf = await fileRes.arrayBuffer();
      if (buf.byteLength > RESEND_MAX_ATTACH_BYTES) {
        console.warn(`[notify-patient-letter] attachment ${doc.label} exceeds ${RESEND_MAX_ATTACH_BYTES} bytes — skipping inline attach`);
        continue;
      }
      const bytes = new Uint8Array(buf);
      // btoa on chunks to avoid call-stack overflow on large payloads.
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const safeLabel = doc.label.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 80) || "document";
      const filename = /\.pdf$/i.test(safeLabel) ? safeLabel : `${safeLabel}.pdf`;
      attachments.push({ filename, content: btoa(bin) });
    } catch (err) {
      console.warn(`[notify-patient-letter] attachment build failed for ${doc.label}:`, err);
    }
  }

  const sendResult = await sendViaResend({ to: order.email, subject, html, attachments });
  const emailSent = sendResult.success;

  await finalizeEmailSend(supabase, reserve.rowId, {
    success: emailSent,
    body: html,
    resendId: sendResult.resendId ?? null,
    errorMessage: sendResult.error ?? null,
  });

  await appendEmailLog(supabase, confirmationId, { type: "letter_ready", sentAt: new Date().toISOString(), to: order.email, success: emailSent });

  if (emailSent && docs.length > 0) { await supabase.from("order_documents").update({ sent_to_customer: true }).in("id", docs.filter((d) => d.file_url !== order.signed_letter_url).map((d) => d.id)); }

  // If email failed, revert the patient_notification_sent_at so admin can retry cleanly.
  // The reserved communications row is already marked "failed" via finalizeEmailSend,
  // but that row's dedupe_key would still block a retry — so we also DELETE the
  // failed reservation so the next call can reserve again with the same key.
  if (!emailSent) {
    await supabase.from("orders").update({ patient_notification_sent_at: null }).eq("confirmation_id", confirmationId);
    if (reserve.rowId) {
      await supabase.from("communications").delete().eq("id", reserve.rowId);
    }
    const errMsg = sendResult.error ?? "Email delivery failed — check Resend API key and domain verification in Supabase secrets";
    console.error(`[notify-patient-letter] Email send failed for ${confirmationId}: ${errMsg}`);
    return jsonResp({ ok: false, error: errMsg }, 500);
  }

  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ webhookType: "main", event: "documents_ready_for_patient", email: order.email, firstName: order.first_name ?? "", lastName: order.last_name ?? "", phone: (order.phone as string) ?? "", confirmationId, patientName, patientState: order.state ?? "", documentsCount: docsEmailedCount, notifiedAt: new Date().toISOString(), leadStatus: "Documents Ready — Patient Notified", tags: ["Documents Ready", "Patient Notified"] }) }).catch(() => {});

  // DOCS-RESEND-COMMS-HISTORY-LOG (2026-05-19): every real send (manual
  // or auto) wrote a fresh communications row via reserveEmailSend +
  // finalizeEmailSend above, so the Order Comms timeline now reflects
  // each click instead of silently re-using the original send's row.
  return jsonResp({
    ok: true,
    sent: emailSent,
    skippedBecauseDuplicate: false,
    message: `Patient notified for order ${confirmationId}`,
    confirmationId,
    patientEmail: order.email,
    docsEmailed: docsEmailedCount,
    attachmentsIncluded: attachments.length,
    templateSource: templateSourceUsed,
    emailSent,
    earningsCreated,
    letterId,
    verificationIncluded: !!letterId,
    resendId: sendResult.resendId,
    resendMessageId: sendResult.resendId,
    forceResend,
    dedupeKey,
    communicationsRowId: reserve.rowId,
  });
});
