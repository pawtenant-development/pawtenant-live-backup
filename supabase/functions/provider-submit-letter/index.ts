import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { applyVerificationPrefix, LETTER_LABELS } from "../_shared/letterType.ts";
import { ensureRaCompletionEarning } from "../_shared/raCompletionEarning.ts";
// evaluateNotificationSuppression moved with the customer email to
// admin-review-document; only the admin-alert fixture gate is still used here.
import { suppressForFixtureOrder } from "../_shared/testNotificationSuppression.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// RA-ADMIN-VISIBILITY-STORAGE-HARDENING-LIVE-001: download document bytes via a
// service-role Storage download (parsed from the stored URL) so footer injection
// works on the now-private provider-letters bucket; fall back to fetch for
// external / non-Supabase URLs.
const STORAGE_PATH_RE = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;
async function downloadDocumentBytes(
  supabase: ReturnType<typeof createClient>,
  fileUrl: string,
): Promise<ArrayBuffer> {
  try {
    const m = new URL(fileUrl).pathname.match(STORAGE_PATH_RE);
    if (m) {
      const bucket = decodeURIComponent(m[1]);
      const path = decodeURIComponent(m[2]);
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (!error && data) return await data.arrayBuffer();
    }
  } catch { /* fall through to fetch */ }
  const dlRes = await fetch(fileUrl);
  if (!dlRes.ok) throw new Error(`Failed to download PDF: HTTP ${dlRes.status}`);
  return await dlRes.arrayBuffer();
}

async function resolveProfileId(
  supabase: ReturnType<typeof createClient>,
  authUserId: string | null
): Promise<string | null> {
  if (!authUserId) return null;
  const { data } = await supabase
    .from("doctor_profiles")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function generateVerificationId(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  confirmationId: string,
  state: string,
  letterType: "esa" | "psd",
  authUserId: string | null
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from("letter_verifications")
      .select("letter_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existing?.letter_id) {
      console.log(`[generateVerificationId] Reusing existing: ${existing.letter_id}`);
      await supabase.from("orders").update({ letter_id: existing.letter_id }).eq("id", orderId);
      return existing.letter_id as string;
    }

    const { data: orderCheck } = await supabase
      .from("orders")
      .select("letter_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderCheck?.letter_id) {
      console.log(`[generateVerificationId] Order already has letter_id: ${orderCheck.letter_id}`);
      return orderCheck.letter_id as string;
    }

    const { data: genResult, error: genErr } = await supabase
      .rpc("generate_letter_verification_id", { p_state: state.toUpperCase().trim().slice(0, 2) });

    if (genErr || !genResult) {
      console.error("[generateVerificationId] RPC error:", genErr?.message);
      return null;
    }

    // ── 2026-05-20 LETTER-DELIVERY-PRODUCT-TYPE-CONSISTENCY ────────────────
    // Swap the ESA-/PSD- prefix on the RPC output to match the order's
    // letter_type. The RPC's p_state-only signature can't emit PSD IDs
    // on its own; this rewrite keeps the unique (state, code) tail while
    // forcing the correct product prefix.
    const letterId = applyVerificationPrefix(genResult as string, letterType);
    const profileId = await resolveProfileId(supabase, authUserId);

    const { error: insertErr } = await supabase
      .from("letter_verifications")
      .insert({
        letter_id: letterId,
        order_id: orderId,
        provider_id: profileId,
        state: state.toUpperCase().trim().slice(0, 2),
        letter_type: letterType,
        issued_at: new Date().toISOString(),
        status: "valid",
        expires_at: null,
      });

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raceRecord } = await supabase
          .from("letter_verifications")
          .select("letter_id")
          .eq("order_id", orderId)
          .maybeSingle();
        if (raceRecord?.letter_id) {
          await supabase.from("orders").update({ letter_id: raceRecord.letter_id }).eq("id", orderId);
          return raceRecord.letter_id as string;
        }
      }
      console.error("[generateVerificationId] Insert error:", insertErr.message);
      return null;
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ letter_id: letterId })
      .eq("id", orderId);

    if (updateErr) {
      console.error("[generateVerificationId] Order update error:", updateErr.message);
      await supabase.from("letter_verifications").delete().eq("letter_id", letterId);
      return null;
    }

    await supabase.from("audit_logs").insert({
      actor_name: "System", actor_role: "system",
      object_type: "letter_verification", object_id: confirmationId,
      action: "verification_issued",
      description: `Verification ID issued for order ${confirmationId}: ${letterId}`,
      metadata: { order_id: orderId, confirmation_id: confirmationId, letter_id: letterId, provider_id: profileId, issued: true, timestamp: new Date().toISOString() },
    });

    return letterId;
  } catch (err) {
    console.error("[generateVerificationId] Unexpected error:", err);
    return null;
  }
}
async function injectPdfVerification(
  supabase: ReturnType<typeof createClient>,
  opts: {
    orderId: string;
    confirmationId: string;
    documentId: string;
    fileUrl: string;
    letterId: string;
    forceReInject?: boolean;
  }
): Promise<{ ok: boolean; processedUrl?: string; error?: string }> {
  const { orderId, confirmationId, documentId, fileUrl, letterId, forceReInject } = opts;

  try {
    if (!forceReInject) {
      const { data: docRecord } = await supabase
        .from("order_documents")
        .select("footer_injected, processed_file_url, footer_letter_id")
        .eq("id", documentId)
        .maybeSingle();

      if (docRecord?.footer_injected && docRecord?.footer_letter_id === letterId && docRecord?.processed_file_url) {
        return { ok: true, processedUrl: docRecord.processed_file_url as string };
      }
    }

    const pdfBytes = await downloadDocumentBytes(supabase, fileUrl);

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount === 0) throw new Error("PDF has no pages");

    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const line1 = "Verification ID:";
    const line2 = letterId;
    const line3 = `pawtenant.com/verify/${letterId}`;

    const sz1 = 8, sz2 = 11, sz3 = 7.5;
    const w1 = font.widthOfTextAtSize(line1, sz1);
    const w2 = fontBold.widthOfTextAtSize(line2, sz2);
    const w3 = font.widthOfTextAtSize(line3, sz3);
    const boxW = Math.max(w1, w2, w3) + 16;

    const MARGIN_RIGHT = 20, MARGIN_TOP = 20;
    const lineH1 = sz1 + 4, lineH2 = sz2 + 4, lineH3 = sz3 + 4;
    const boxH = lineH1 + lineH2 + lineH3 + 8;
    const boxX = width - MARGIN_RIGHT - boxW;
    const boxY = height - MARGIN_TOP - boxH;

    firstPage.drawRectangle({
      x: boxX, y: boxY, width: boxW, height: boxH,
      color: rgb(1, 1, 1), borderColor: rgb(0.85, 0.45, 0.1),
      borderWidth: 1, opacity: 0.97,
    });

    const y1 = boxY + boxH - 8 - sz1;
    const y2 = y1 - lineH1 - 1;
    const y3 = y2 - lineH2 + 2;

    firstPage.drawText(line1, { x: boxX + boxW - 8 - w1, y: y1, size: sz1, font, color: rgb(0.4, 0.4, 0.4) });
    firstPage.drawText(line2, { x: boxX + boxW - 8 - w2, y: y2, size: sz2, font: fontBold, color: rgb(0.85, 0.35, 0.05) });
    firstPage.drawText(line3, { x: boxX + boxW - 8 - w3, y: y3, size: sz3, font, color: rgb(0.35, 0.35, 0.35) });

    const processedBytes = await pdfDoc.save();
    const processedFileName = `${confirmationId}-${documentId}-verified.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("letters")
      .upload(processedFileName, processedBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // ── 2026-05-20 LETTERS-BUCKET-PRIVATE-SIGNED-URL-FIX ────────────────────
    // `letters` is a PRIVATE bucket (migration 20260519140000 §4 sets
    // public=false). getPublicUrl returns a /storage/v1/object/public/<...>
    // URL that resolves to "Bucket not found" 404 for both admin and
    // customer. Use createSignedUrl with a 10-year TTL — same pattern as
    // admin-upload-document — so the URL stored in processed_file_url is
    // immediately working. notify-patient-letter re-signs every URL at
    // send time anyway, so email delivery is unaffected by the change.
    const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data: signed, error: signErr } = await supabase.storage
      .from("letters")
      .createSignedUrl(processedFileName, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Signed URL generation failed: ${signErr?.message ?? "no signed url"}`);
    }
    const processedUrl = signed.signedUrl;

    await supabase.from("order_documents").update({
      footer_injected: true,
      processed_file_url: processedUrl,
      footer_letter_id: letterId,
    }).eq("id", documentId);

    await supabase.from("audit_logs").insert({
      actor_name: "System", actor_role: "system",
      object_type: "pdf_footer_injection", object_id: confirmationId,
      action: "pdf_footer_injected",
      description: `Verification header injected into document ${documentId} for order ${confirmationId} — letter_id: ${letterId}`,
      metadata: { order_id: orderId, confirmation_id: confirmationId, document_id: documentId, letter_id: letterId, success: true, timestamp: new Date().toISOString() },
    });

    return { ok: true, processedUrl };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[injectPdf] Failed for doc ${documentId}:`, msg);
    await supabase.from("audit_logs").insert({
      actor_name: "System", actor_role: "system",
      object_type: "pdf_footer_injection", object_id: confirmationId,
      action: "pdf_footer_injection_failed",
      description: `PDF header injection failed for document ${documentId} (order ${confirmationId}): ${msg}`,
      metadata: { order_id: orderId, confirmation_id: confirmationId, document_id: documentId, letter_id: letterId, success: false, error: msg, timestamp: new Date().toISOString() },
    });
    return { ok: false, error: msg };
  }
}

// ── Admin notification for provider_letter_submitted ─────────────────────────
async function notifyAdminLetterSubmitted(opts: {
  confirmationId: string; providerName: string; documentLabel: string;
  providerNote?: string | null; customerEmail: string; customerFirstName: string; customerLastName: string;
}): Promise<void> {
  try {
    // DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §10: a TEST fixture
    // submission must never page real staff. Gated on the FIXTURE ORDER's
    // recipient (not the staff address) and fail-closed, so ordinary orders
    // still notify admins exactly as before. Checked here so BOTH call sites
    // (housing completion + letter submitted) are covered by one gate.
    if (suppressForFixtureOrder(opts.customerEmail)) {
      console.warn(
        `[notifySuppressed] admin alert SUPPRESSED for TEST fixture order ${opts.confirmationId} — no email sent`,
      );
      return;
    }
    const recipRes = await fetch(`${SUPABASE_URL}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ notificationKey: "provider_letter_submitted" }),
    });
    if (!recipRes.ok) return;
    const { enabled, recipients } = await recipRes.json() as { enabled: boolean; recipients: string[] };
    if (!enabled || !recipients?.length) return;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return;

    const subject = `[Pending Admin Approval] ${opts.providerName} — Order ${opts.confirmationId}`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:32px 16px;margin:0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;">
<tr><td style="background:#1a5c4f;padding:24px 32px;text-align:center;">
<img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="140" alt="PawTenant" style="display:block;margin:0 auto 12px;height:auto;" />
<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Pending Admin Approval</div>
<h1 style="margin:0;font-size:20px;font-weight:800;color:#fff;">Provider Submitted a Letter</h1>
<p style="margin:8px 0 0;font-size:13px;color:#d6e9e4;">The customer has NOT been notified. Review and approve to deliver.</p>
</td></tr>
<tr><td style="padding:24px 32px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:20px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Submission Details</p>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;width:140px;">Order ID</td><td style="font-size:13px;font-weight:700;color:#111827;font-family:monospace;">${opts.confirmationId}</td></tr>
<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">Provider</td><td style="font-size:13px;font-weight:600;color:#1a5c4f;">${opts.providerName}</td></tr>
<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">Document</td><td style="font-size:13px;font-weight:600;color:#111827;">${opts.documentLabel}</td></tr>
<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">Customer</td><td style="font-size:13px;color:#111827;">${opts.customerFirstName} ${opts.customerLastName} &lt;${opts.customerEmail}&gt;</td></tr>
${opts.providerNote ? `<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;vertical-align:top;">Provider Note</td><td style="font-size:13px;color:#374151;font-style:italic;">"${opts.providerNote}"</td></tr>` : ""}
</table>
</td></tr>
</table>
<div style="text-align:center;">
<a href="https://pawtenant.com/admin-orders?order=${encodeURIComponent(opts.confirmationId)}&tab=documents" style="background:#1a5c4f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block;">Review &amp; Approve &rarr;</a>
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    await Promise.all(recipients.map((email: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "PawTenant <hello@pawtenant.com>", to: [email], subject, html }),
      }).catch(() => {})
    ));
  } catch (err) {
    console.warn("[provider-submit-letter] admin notif failed:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token);
    if (authError || !user) {
      console.error("[provider-submit-letter] Auth error:", authError?.message);
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const { data: profile } = await supabase
      .from("doctor_profiles").select("user_id, full_name, email, is_active").eq("user_id", user.id).maybeSingle();
    if (!profile) return json({ ok: false, error: "Provider profile not found" }, 403);
    if (profile.is_active === false) return json({ ok: false, error: "Provider account is inactive" }, 403);

    // RA-PROVIDER-DOCUMENT-WORKFLOW-RELEASE-BLOCKERS-001: accept the letter as a
    // multipart file (preferred — the provider file is uploaded to the private
    // provider-letters bucket SERVER-SIDE via the service role below, so the
    // client never performs a storage write and can never hit
    // "new row violates row-level security policy"). The legacy JSON body
    // ({ documentUrl }) is still accepted for external / Drive-link submissions.
    const reqContentType = req.headers.get("content-type") ?? "";
    let confirmationId = "";
    let documentUrl = "";
    let documentLabel = "";
    let docType: string | undefined;
    let providerNote: string | undefined;
    let uploadedFile: File | null = null;

    if (reqContentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      uploadedFile = f instanceof File ? f : null;
      confirmationId = String(form.get("confirmationId") ?? "");
      documentLabel = String(form.get("documentLabel") ?? "");
      const dt = form.get("docType"); docType = dt ? String(dt) : undefined;
      const pn = form.get("providerNote"); providerNote = pn ? String(pn) : undefined;
      const du = form.get("documentUrl"); documentUrl = du ? String(du) : "";
    } else {
      const body = await req.json() as {
        confirmationId: string; documentUrl?: string; documentLabel: string;
        docType?: string; providerNote?: string;
      };
      confirmationId = body.confirmationId;
      documentUrl = body.documentUrl ?? "";
      documentLabel = body.documentLabel;
      docType = body.docType;
      providerNote = body.providerNote;
    }

    if (!confirmationId || !documentLabel) {
      return json({ ok: false, error: "confirmationId and documentLabel are required" }, 400);
    }
    if (!uploadedFile && !documentUrl) {
      return json({ ok: false, error: "A file or documentUrl is required" }, 400);
    }

    const { data: order, error: orderFetchErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_email, doctor_status, status, letter_type, addon_services, price, letter_id, letter_issue_date")
      .eq("confirmation_id", confirmationId).maybeSingle();

    if (orderFetchErr) return json({ ok: false, error: `Order fetch failed: ${orderFetchErr.message}` }, 500);
    if (!order) return json({ ok: false, error: "Order not found" }, 404);

    const matchesById = order.doctor_user_id === user.id;
    const matchesByEmail =
      !!order.doctor_email && !!profile.email &&
      order.doctor_email.toLowerCase() === profile.email.toLowerCase();

    if (!matchesById && !matchesByEmail) {
      return json({ ok: false, error: "Not authorized to update this order" }, 403);
    }

    if (!matchesById && matchesByEmail) {
      await supabase.from("orders").update({ doctor_user_id: user.id }).eq("id", order.id);
    }

    // ── Server-side provider-letters upload (assigned provider verified above) ──
    // Uploads run with the SERVICE ROLE (RLS-bypassing) to an ORDER-SCOPED path in
    // the PRIVATE provider-letters bucket. This is the fix for the client-side RLS
    // failure and keeps storage least-privilege (no client write access needed).
    let uploadedFilePath: string | null = null;
    let uploadedMime: string | null = null;
    let uploadedSize: number | null = null;
    if (uploadedFile) {
      const ALLOWED_MIME = new Set([
        "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp",
      ]);
      const mime = uploadedFile.type || "application/octet-stream";
      if (!ALLOWED_MIME.has(mime)) {
        return json({ ok: false, error: `Unsupported file type: ${mime}. Upload a PDF or image.` }, 415);
      }
      const MAX_BYTES = 25 * 1024 * 1024;
      const buf = new Uint8Array(await uploadedFile.arrayBuffer());
      if (buf.byteLength === 0) return json({ ok: false, error: "The uploaded file is empty." }, 400);
      if (buf.byteLength > MAX_BYTES) return json({ ok: false, error: "File exceeds the 25MB limit." }, 413);

      const stem = (order.confirmation_id as string) || (order.id as string);
      const safe = (uploadedFile.name || "letter.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const objectPath = `${stem}/provider/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;

      const { error: upErr } = await supabase.storage
        .from("provider-letters")
        .upload(objectPath, buf, { contentType: mime, upsert: false });
      if (upErr) return json({ ok: false, error: `Upload failed: ${upErr.message}` }, 500);

      const SIGNED_TTL = 60 * 60 * 24 * 365 * 10;
      const { data: signed, error: signErr } = await supabase.storage
        .from("provider-letters")
        .createSignedUrl(objectPath, SIGNED_TTL);
      if (signErr || !signed?.signedUrl) {
        try { await supabase.storage.from("provider-letters").remove([objectPath]); } catch { /* best effort */ }
        return json({ ok: false, error: `Signed URL failed: ${signErr?.message ?? "no signed url"}` }, 500);
      }
      documentUrl = signed.signedUrl;
      uploadedFilePath = objectPath;
      uploadedMime = mime;
      uploadedSize = buf.byteLength;
    }

    const now = new Date();

    // ── Document taxonomy classification (authoritative, product-derived) ──────
    // ESA/PSD product is derived from the ORDER (letter_type / confirmation id),
    // NOT from the provider's free choice — so a provider can never misclassify a
    // PSD order's letter as ESA (or vice-versa). A "completed Housing Accommodation
    // form" is a SEPARATE document class: it receives NO verification ID, NO footer
    // /QR, and does NOT complete the base ESA/PSD letter lifecycle. Any doc type we
    // do not recognize FAILS CLOSED (never mints/stamps/completes).
    const isPSD = (order.letter_type as string) === "psd" || (confirmationId ?? "").toUpperCase().includes("-PSD");
    const letterType: "esa" | "psd" = isPSD ? "psd" : "esa";
    const FINAL_LETTER_TYPES = new Set(["esa_letter", "psd_letter", "signed_letter", "letter"]);
    const HOUSING_COMPLETED_TYPES = new Set(["housing_completed", "ra_completed_form"]);
    const requestedType = (docType ?? "").trim() || "esa_letter"; // legacy default = final letter
    const isHousingCompleted = HOUSING_COMPLETED_TYPES.has(requestedType);
    const isFinalLetter = FINAL_LETTER_TYPES.has(requestedType);
    if (!isHousingCompleted && !isFinalLetter) {
      return json({ ok: false, error: `Unsupported document type for provider submission: ${requestedType}` }, 400);
    }
    // Stored type is product-accurate: final letters become esa_letter/psd_letter
    // (from the order), completed housing forms canonicalize to housing_completed.
    const storedDocType = isHousingCompleted ? "housing_completed" : `${letterType}_letter`;

    // ── PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §5 ───────────────
    // Provider submission is no longer customer delivery. Every provider-generated
    // final customer-facing document is inserted HIDDEN and pending review; only
    // approve_order_document() may ever flip customer_visible to true, and the
    // trg_order_document_release_gate trigger rejects any write that tries to
    // release a pending/needs_correction row from anywhere else.
    //
    // Customer uploads, intake docs and admin attachments do NOT pass through this
    // function at all, so they are untouched by the gate.
    const isPreviousCorrection = await (async () => {
      const { data } = await supabase
        .from("order_documents")
        .select("id")
        .eq("order_id", order.id)
        .eq("doc_type", storedDocType)
        .eq("review_status", "needs_correction")
        .order("uploaded_at", { ascending: false })
        .limit(1);
      return (data ?? []) as { id: string }[];
    })();
    const isResubmission = isPreviousCorrection.length > 0;

    const { data: insertedDoc, error: docError } = await supabase
      .from("order_documents")
      .insert({
        order_id: order.id, confirmation_id: confirmationId, label: documentLabel,
        doc_type: storedDocType, file_url: documentUrl,
        file_path: uploadedFilePath, mime_type: uploadedMime, file_size_bytes: uploadedSize,
        notes: providerNote?.trim() || null, uploaded_by: profile.full_name,
        sent_to_customer: false, customer_visible: false, footer_injected: false,
        review_status: "pending_admin_approval",
        submitted_by: user.id,
        submitted_at: now.toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (docError) return json({ ok: false, error: `Failed to save document: ${docError.message}` }, 500);

    const documentId = insertedDoc?.id ?? null;

    // A corrected resubmission retires the rejected submission rather than
    // overwriting it — the provider's original file and the employee's
    // correction note both stay on the record.
    if (isResubmission && documentId) {
      await supabase
        .from("order_documents")
        .update({ review_status: "superseded", superseded_by_document_id: documentId })
        .in("id", isPreviousCorrection.map((d) => d.id));
    }

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_name: profile.full_name ?? "Provider",
      actor_role: "provider",
      actor_type: "provider",
      category: "documents",
      source: "provider_portal",
      object_type: "order_document",
      object_id: confirmationId,
      order_id: order.id,
      entity_type: "order_document",
      entity_id: documentId,
      document_id: documentId,
      provider_id: user.id,
      action: isResubmission ? "provider_document_resubmitted" : "provider_document_submitted",
      description: `${profile.full_name ?? "Provider"} ${isResubmission ? "resubmitted a corrected" : "submitted"} ${documentLabel} for order ${confirmationId}. Awaiting admin approval.`,
      new_values: { review_status: "pending_admin_approval", customer_visible: false },
      metadata: {
        order_id: order.id, confirmation_id: confirmationId, document_id: documentId,
        doc_type: storedDocType, document_label: documentLabel,
        provider_name: profile.full_name, is_resubmission: isResubmission,
      },
    });

    // ══ COMPLETED HOUSING ACCOMMODATION FORM ══════════════════════════════════
    // Separate class: NO verification ID, NO footer/QR, and the base ESA/PSD letter
    // lifecycle (status / doctor_status / letter_id / validity dates /
    // signed_letter_url) is LEFT UNTOUCHED. We only mark the RA / Additional-
    // Documentation workflow complete and make the file available to the customer.
    if (isHousingCompleted) {
      // Mark the Housing workflow complete. If the base ESA/PSD letter is ALREADY
      // delivered (letter_id minted), this is a LATE follow-up on a reopened order →
      // return the order to 'completed' and restore the delivered doctor_status so it
      // leaves the active queue. If the base letter is NOT yet delivered (normal
      // in-flow combo), leave status/doctor_status untouched so the base ESA/PSD
      // workflow continues on its own. Base letter fields (letter_id / validity /
      // signed_letter_url) are never touched here.
      const housingOrderPatch: Record<string, unknown> = { additional_documentation_status: "completed" };
      if (order.letter_id) {
        housingOrderPatch.status = "completed";
        housingOrderPatch.doctor_status = "patient_notified";
      }
      await supabase.from("orders").update(housingOrderPatch).eq("id", order.id);

      await supabase.from("doctor_notifications").insert({
        doctor_user_id: user.id, title: "Housing Form Completed",
        message: `Completed Housing Accommodation form uploaded for order ${confirmationId}.`,
        type: "housing_form_completed", confirmation_id: confirmationId, order_id: order.id,
      });

      try {
        await supabase.from("communications").insert({
          order_id: order.id, confirmation_id: confirmationId,
          channel: "internal", direction: "outbound",
          subject: "Completed Housing Accommodation form uploaded",
          body: providerNote?.trim() || "Provider uploaded the completed Housing Accommodation form.",
          status: "logged", sent_at: new Date().toISOString(), source: "provider_submit_housing",
          metadata: { provider_id: user.id, provider_name: profile.full_name, document_label: documentLabel, doc_type: "housing_completed" },
        });
      } catch (commErr) { console.error("[provider-submit-letter] housing comm log error:", commErr); }

      await supabase.from("audit_logs").insert({
        actor_name: profile.full_name ?? "Provider", actor_role: "provider",
        object_type: "order_document", object_id: confirmationId,
        action: "housing_form_completed",
        description: `Completed Housing Accommodation form uploaded for order ${confirmationId} — no verification ID, no footer, base letter untouched.`,
        metadata: { order_id: order.id, confirmation_id: confirmationId, document_id: documentId, doc_type: "housing_completed", uploaded_by: profile.full_name },
      });

      // Provider RA-completion payout (combo orders). Idempotent + gated inside
      // the helper (combo + completed + base paid + provider). Non-critical: a
      // failure here must never fail the provider's submission — the backfill /
      // a later completion event heals it. See PROVIDER-EARNINGS-RA-DOUBLE-PAYOUT-001.
      try {
        await ensureRaCompletionEarning(supabase, order.id as string);
      } catch (earnErr) {
        console.error("[provider-submit-letter] RA-completion earning error (non-fatal):", earnErr);
      }

      notifyAdminLetterSubmitted({
        confirmationId, providerName: profile.full_name,
        documentLabel: `${documentLabel} (Completed Housing Form)`,
        providerNote: providerNote?.trim() || null,
        customerEmail: order.email as string,
        customerFirstName: order.first_name ?? "", customerLastName: order.last_name ?? "",
      }).catch(() => {});

      return json({
        ok: true, documentSaved: true, housingCompleted: true,
        verificationIssued: false, letterId: null, pdfFooterInjected: false,
        docType: "housing_completed", reviewStatus: "pending_admin_approval",
        pendingAdminApproval: true,
        message: "Completed Housing Accommodation form uploaded. It is pending admin approval and will be shared with the customer once approved. No verification ID is issued for housing forms.",
      });
    }

    // ══ FINAL ESA / PSD LETTER ════════════════════════════════════════════════
    const issueDate = (order.letter_issue_date as string | null) ?? toDateString(now);
    const expiryDate = (() => {
      const d = new Date(issueDate);
      d.setFullYear(d.getFullYear() + 1);
      return toDateString(d);
    })();
    const isNewIssue = !order.letter_issue_date;

    // ── PROVIDER-LETTER-ADMIN-APPROVAL-GATE §5 · order state on SUBMISSION ────
    // `status = completed`, `doctor_status = patient_notified`,
    // `signed_letter_url` and `patient_notification_sent_at` are DELIVERY facts.
    // They are no longer written here — approve_order_document() writes them
    // atomically with the release. Leaving signed_letter_url set at submission
    // would have leaked the unapproved letter to the customer through
    // resolveCustomerDocuments()'s legacy fallback path even with the document
    // row hidden, because that fallback reads orders.signed_letter_url directly.
    //
    // Issue/expiry dates stay here: they describe when the provider issued the
    // letter, and they carry no customer-visible file.
    const orderUpdatePatch: Record<string, unknown> = {
      doctor_status: "pending_admin_approval",
      doctor_user_id: user.id,
      letter_expiry_date: expiryDate,
    };
    if (isNewIssue) orderUpdatePatch.letter_issue_date = issueDate;

    await supabase.from("orders").update(orderUpdatePatch).eq("id", order.id);

    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);

    let resolvedLetterId: string | null = (order.letter_id as string | null) ?? null;

    // DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §7:
    // Decide FIRST LETTER vs REVISION entirely server-side. No request field,
    // no client flag, no query parameter takes part in this — the signal is
    // simply whether an ACTIVE approved version already exists for this
    // (order, doc_type). If it does, this submission is version 2+ and must
    // mint its OWN verification ID rather than reuse the original.
    let isRevision = false;
    let nextVersionNumber = 1;
    if (storedDocType.endsWith("_letter")) {
      const { data: activeVersion } = await supabase
        .from("order_document_versions")
        .select("id, version")
        .eq("order_id", order.id)
        .eq("doc_type", storedDocType)
        .eq("is_active", true)
        .maybeSingle();
      if (activeVersion?.id) {
        isRevision = true;
        nextVersionNumber = Number(activeVersion.version ?? 1) + 1;
      }
    }

    // FIRST LETTER only: unchanged behaviour, including its deliberate reuse of
    // an already-issued ID for this order.
    //
    // A REVISION does NOT mint its ID here. Minting before the version row is
    // deduplicated means N concurrent revisions mint N IDs while correctly
    // converging on ONE version — leaving publicly-resolvable orphans. The
    // revision ID is instead minted atomically per-version by
    // ensure_revision_verification_id() AFTER create_document_version()
    // (DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §8).
    if (state && state.length === 2 && !isRevision) {
      const generatedId = await generateVerificationId(
        supabase, order.id, confirmationId, state, letterType, user.id
      );
      if (generatedId) resolvedLetterId = generatedId;
    }

    // REVISION: create the version row FIRST (idempotent, deduplicated by the
    // target-version key) and mint its ID atomically from that row, so the
    // footer below is stamped with the revision's OWN new ID rather than the
    // original letter's. Concurrent submissions converge on one version AND one
    // ID. The version stays inactive until generation succeeds.
    let revisionVersionId: string | null = null;
    // ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §16: if this revision is being
    // issued because an Additional Pet request was APPROVED, the new version
    // must carry an immutable snapshot of the pets it covers — the original
    // approved pets PLUS the newly approved one. Read-only here; the request is
    // linked to the version after activation succeeds.
    let addPetRequest: Record<string, unknown> | null = null;
    let addPetSnapshot: Record<string, unknown> | null = null;
    if (isRevision) {
      try {
        const { data: apr } = await supabase
          .from("order_additional_pet_requests")
          .select("*")
          .eq("order_id", order.id)
          .eq("status", "approved_pending_document")
          .order("provider_decision_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (apr) {
          addPetRequest = apr as Record<string, unknown>;
          const { data: st } = await supabase.rpc("additional_pet_effective_state", { p_order_id: order.id });
          const originals = ((st as { original_pets?: unknown[] } | null)?.original_pets ?? []) as unknown[];
          addPetSnapshot = {
            pets: [...originals, apr.new_pet],
            source: "additional_pet_approval",
            additional_pet_request_id: apr.id,
            total_pets: originals.length + 1,
          };
        }
      } catch (err) {
        console.warn("[addPet] snapshot lookup failed:", err instanceof Error ? err.message : String(err));
      }
    }
    if (isRevision && documentId && state && state.length === 2) {
      try {
        const revProviderId = await resolveProfileId(supabase, user.id);

        // ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001 §6 — revision idempotency.
        //
        // The key used to be `revision:{order}:{docType}:v{nextVersionNumber}`.
        // That made CONCURRENT duplicates converge (they all read the same active
        // version, so they all computed the same target number) but left a
        // SEQUENTIAL retry broken: once the first call had activated v2, a
        // retried or replayed submission of the SAME file recomputed the target
        // as v3, so it minted a spurious extra version AND an extra publicly
        // resolvable verification ID — silently superseding the revision it was
        // only meant to repeat. Measured on TEST: a replay produced v3 with a
        // third ID and demoted the Additional Pet revision.
        //
        // Keying on the SOURCE FILE fixes both cases at once: concurrent callers
        // submitting one file still converge, and a sequential retry of that same
        // file returns the SAME version instead of creating another. A genuinely
        // new letter has a different file and correctly becomes a new version.
        const revisionSource = documentUrl || `doc:${documentId}`;
        const { data: revVersion, error: revErr } = await supabase.rpc("create_document_version", {
          p_order_id: order.id,
          p_doc_type: storedDocType,
          p_idempotency_key: `revision:${order.id}:${storedDocType}:${revisionSource}`,
          p_letter_id: null,
          p_provider_id: revProviderId,
          p_revision_reason: addPetRequest
            ? `additional pet approved — version ${nextVersionNumber}`
            : `provider revision — version ${nextVersionNumber}`,
          p_pet_snapshot: addPetSnapshot,
          p_order_document_id: documentId,
          p_file_url: documentUrl,
          p_storage_path: null,
        });
        if (revErr) {
          console.error("[revision] create_document_version failed:", revErr.message);
        } else if (revVersion?.id) {
          revisionVersionId = revVersion.id as string;
          const { data: mintedId, error: mintErr } = await supabase.rpc(
            "ensure_revision_verification_id",
            {
              p_version_id: revisionVersionId,
              p_state: state,
              p_letter_type: letterType,
              p_provider_id: revProviderId,
            },
          );
          if (mintErr) console.error("[revision] mint failed:", mintErr.message);
          else if (mintedId) resolvedLetterId = mintedId as string;
        }
      } catch (err) {
        console.error("[revision] unexpected error:", err instanceof Error ? err.message : err);
      }
    }

    let pdfInjectionResult: { ok: boolean; processedUrl?: string; error?: string } = { ok: false };

    if (resolvedLetterId && documentId && documentUrl) {
      pdfInjectionResult = await injectPdfVerification(supabase, {
        orderId: order.id, confirmationId, documentId,
        fileUrl: documentUrl, letterId: resolvedLetterId,
      });
    }

    // The customer's authoritative delivered letter must be the FINALIZED (stamped)
    // version, not the provider's original upload. Once the footer is injected,
    // repoint orders.signed_letter_url to the processed URL so every consumer
    // (customer portal, letter emails, legacy links) resolves the stamped letter
    // (RA-LATE-UPLOAD-... blocker F). The original stays in provider-letters and is
    // only reachable via the explicit admin/provider "Open Original" action.
    // PROVIDER-LETTER-ADMIN-APPROVAL-GATE §8: orders.signed_letter_url is a
    // CUSTOMER-facing pointer (resolveCustomerDocuments falls back to it when no
    // finalized document row is visible). Repointing it here would deliver the
    // unapproved letter. approve_order_document() repoints it from the approved
    // document row instead. The stamped file itself is already stored on
    // order_documents.processed_file_url, which admin preview reads.

    // ORDER-ENTITLEMENT-AND-DOCUMENT-VERSIONING-FOUNDATION-001 · Phase D
    //
    // Register this letter as a document VERSION so revision history exists from
    // the first letter onward. For the ordinary first-letter path this simply
    // records version 1 — the customer-visible behaviour above is unchanged.
    //
    // BEST EFFORT BY DESIGN: the letter is already delivered and orders/documents
    // are already written by this point. A failure here must never fail a
    // provider submission, so everything is swallowed and logged.
    //
    // Idempotency key:
    //   • FIRST LETTER — (order, document). A retry or double-click reuses the
    //     same uploaded document row, so it returns the SAME version.
    //   • REVISION — (order, doc_type, target version). A replayed revision
    //     uploads a NEW document row, so a document-derived key would create a
    //     second version. Keying on the TARGET VERSION instead makes a replayed
    //     or concurrent revision converge on one row
    //     (DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §9).
    try {
      // Use the SAME doc_type the document row was stored under. Housing
      // completions are not letters and are deliberately not versioned here.
      const versionDocType = storedDocType;
      const finalUrl = pdfInjectionResult.processedUrl || documentUrl;

      if (isRevision) {
        // The revision's version row and ID were created above (before footer
        // injection, so the stamp carries the revision's own ID). Only the
        // activation remains — and only now that generation has succeeded.
        if (revisionVersionId) {
          const { error: activateErr } = await supabase.rpc("activate_document_version", {
            p_version_id: revisionVersionId,
          });
          if (activateErr) {
            console.error("[revision] activate failed:", activateErr.message);
          } else {
            // orders.letter_id is a COMPATIBILITY CACHE of the ACTIVE document's
            // verification ID (the same role orders.signed_letter_url plays for
            // the file). It must follow the newly-active revision, or the
            // customer portal keeps labelling the current letter with the
            // SUPERSEDED id. Updated only AFTER activation succeeds. The v1
            // verification ROW is untouched and still resolves to v1.
            if (resolvedLetterId) {
              await supabase.from("orders")
                .update({ letter_id: resolvedLetterId })
                .eq("id", order.id);
            }
            console.info(`[revision] v${nextVersionNumber} active for ${confirmationId} (letter_id=${resolvedLetterId})`);

            // ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §16: the revised document
            // now exists and is active, so the approved Additional Pet request is
            // COMPLETE. Linked only after activation succeeded — a failed
            // generation must leave the request at approved_pending_document so
            // it can be safely retried without minting a second version or ID.
            if (addPetRequest) {
              try {
                await supabase.from("order_additional_pet_requests").update({
                  status: "completed",
                  document_version_id: revisionVersionId,
                  letter_id: resolvedLetterId,
                }).eq("id", addPetRequest.id as string)
                  .eq("status", "approved_pending_document");
                await supabase.from("order_additional_pet_request_events").insert({
                  request_id: addPetRequest.id as string,
                  order_id: order.id,
                  event_type: "revision_issued",
                  from_status: "approved_pending_document",
                  to_status: "completed",
                  actor_role: "system",
                  detail: {
                    document_version_id: revisionVersionId,
                    version: nextVersionNumber,
                    new_letter_id: resolvedLetterId,
                  },
                });
                console.info(`[addPet] request ${addPetRequest.id} completed — v${nextVersionNumber}, new letter_id=${resolvedLetterId}`);
              } catch (err) {
                console.error("[addPet] completion link failed:", err instanceof Error ? err.message : String(err));
              }
            }
          }
        }
      } else if (documentId && finalUrl && versionDocType.endsWith("_letter")) {
        const versionProviderId = await resolveProfileId(supabase, user.id);
        const { data: createdVersion, error: versionErr } = await supabase.rpc(
          "create_document_version",
          {
            p_order_id: order.id,
            p_doc_type: versionDocType,
            p_idempotency_key: `submit:${order.id}:${documentId}`,
            p_letter_id: resolvedLetterId,
            p_provider_id: versionProviderId,
            p_revision_reason: "provider letter submission",
            p_pet_snapshot: null,
            p_order_document_id: documentId,
            p_file_url: finalUrl,
            p_storage_path: null,
          },
        );

        if (versionErr) {
          console.error("[documentVersion] create failed:", versionErr.message);
        } else if (createdVersion?.id) {
          // Only now — the file exists and is stamped — may this become the
          // active customer-facing version. Any previous version is superseded
          // WITHOUT its file or verification ID being touched.
          const { error: activateErr } = await supabase.rpc(
            "activate_document_version",
            { p_version_id: createdVersion.id },
          );
          if (activateErr) {
            console.error("[documentVersion] activate failed:", activateErr.message);
          } else {
            console.info(
              `[documentVersion] order ${confirmationId} → version ${createdVersion.version} active (letter_id=${resolvedLetterId ?? "none"})`,
            );
          }
        }
      }
    } catch (err) {
      console.error("[documentVersion] unexpected error:", err instanceof Error ? err.message : err);
    }

    // ══ NO CUSTOMER NOTIFICATION HERE ═════════════════════════════════════════
    // PROVIDER-LETTER-ADMIN-APPROVAL-GATE §12: the customer "your letter is
    // ready" email moved from PROVIDER SUBMISSION to ADMIN APPROVAL. It is now
    // sent by admin-review-document, exactly once, keyed on the single
    // approve_order_document() state transition — so a double-click, a replay or
    // two concurrent reviewers cannot produce a second email.
    //
    // The TEST-fixture suppression gate moved with it, so a fixture order is
    // still never able to page a real recipient.

    // ── ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · APPROVAL GATE OFF ──
    // The document was inserted `pending_admin_approval` regardless, because that
    // invariant is what the release trigger enforces: nothing but a release
    // function may ever flip customer_visible. When the Employee Letter Quality
    // Check is disabled we therefore do not insert differently — we immediately
    // run the SAME release the employee would have run.
    //
    // auto_deliver_order_document() re-checks the gate itself and is service-role
    // only, so this is a request to deliver, not an assertion that we may. If the
    // gate is on (or the row is not pending, or this is a replay) it returns
    // transitioned:false and nothing happens.
    //
    // Running it here — after the letter id is minted, the version row exists and
    // the footer is injected — means the customer receives the finished letter,
    // not a half-built one.
    let autoDelivered = false;
    try {
      const { data: gateData } = await supabase.rpc("is_provider_approval_gate_enabled");
      const gateEnabled = gateData !== false; // fail-closed on null/undefined/error
      if (!gateEnabled) {
        const { data: relData, error: relErr } = await supabase
          .rpc("auto_deliver_order_document", { p_document_id: documentId });
        if (relErr) {
          console.error(`[provider-submit-letter] auto-delivery failed for ${confirmationId}: ${relErr.message}`);
        } else if ((relData as { transitioned?: boolean } | null)?.transitioned === true) {
          autoDelivered = true;
          // Exactly one customer email, gated on the ONE call that actually
          // transitioned the row — the same discipline admin-review-document
          // uses, so a replayed submission cannot double-notify.
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/notify-patient-letter`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
              },
              body: JSON.stringify({ confirmationId }),
            });
          } catch (e) {
            // The document IS released and visible in the portal; a failed email
            // must not roll that back or block the provider's submission.
            console.error(`[provider-submit-letter] auto-delivery email failed for ${confirmationId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`[provider-submit-letter] approval-gate resolution failed for ${confirmationId}:`, e);
    }

    await supabase.from("doctor_notifications").insert({
      doctor_user_id: user.id,
      title: autoDelivered ? "Letter Submitted — Delivered" : "Letter Submitted — Pending Admin Approval",
      message: autoDelivered
        ? `Documents submitted for order ${confirmationId} and delivered to the customer.`
        : `Documents submitted for order ${confirmationId}. A PawTenant reviewer will approve and deliver them to the customer.`,
      type: "letter_submitted", confirmation_id: confirmationId, order_id: order.id,
    });

    // The old `communications` insert here claimed an OUTBOUND CUSTOMER EMAIL
    // ("Your ESA Letter is Ready") at submission time. It was also dead code: it
    // named columns that do not exist on `communications` (channel / sent_at /
    // metadata), so every write silently failed inside its catch — there are
    // zero rows with source='provider_submit'. Under the approval gate that
    // claim would now be actively wrong, because no customer email is sent at
    // submission. The submission is recorded on audit_logs
    // (provider_document_submitted) above; the real customer email is logged by
    // admin-review-document when it is actually sent.

    // ── Notify admin recipients for provider_letter_submitted (fire-and-forget) ──
    notifyAdminLetterSubmitted({
      confirmationId,
      providerName: profile.full_name,
      documentLabel,
      providerNote: providerNote?.trim() || null,
      customerEmail: order.email as string,
      customerFirstName: order.first_name ?? "",
      customerLastName: order.last_name ?? "",
    }).catch(() => {});

    // The GHL `order_completed` event moved to admin-review-document. Firing it
    // here would tell the CRM the order is complete and the letter is sent while
    // the letter is still sitting in the review queue.

    return json({
      ok: true, documentSaved: true, orderUpdated: true,
      pendingAdminApproval: !autoDelivered,
      reviewStatus: autoDelivered ? "approved" : "pending_admin_approval",
      documentId,
      autoDelivered,
      patientNotified: autoDelivered,
      verificationIssued: !!resolvedLetterId,
      letterId: resolvedLetterId,
      pdfFooterInjected: pdfInjectionResult?.ok === true,
      processedPdfUrl: pdfInjectionResult?.processedUrl ?? null,
      letterIssueDate: issueDate, letterExpiryDate: expiryDate,
      message: autoDelivered
        ? "Documents submitted and delivered to the customer."
        : "Documents submitted for review. A PawTenant reviewer will check them and release them to the customer — the customer has not been notified yet.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[provider-submit-letter] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
