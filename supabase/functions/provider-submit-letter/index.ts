import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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

/** Resolve doctor_profiles.id (row PK) from auth user_id. Returns null if not found. */
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

// ── Generate a unique verification ID inline ─────────────────────────────────
// provider_id must be doctor_profiles.id (row PK), NOT the auth user_id
async function generateVerificationId(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  confirmationId: string,
  state: string,
  letterType: "esa" | "psd",
  authUserId: string | null   // auth UUID — we resolve to profile row id internally
): Promise<string | null> {
  try {
    // Idempotency: check if already exists
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

    // Generate via RPC — parameter is named p_state in the DB function
    const { data: genResult, error: genErr } = await supabase
      .rpc("generate_letter_verification_id", { p_state: state.toUpperCase().trim().slice(0, 2) });

    if (genErr || !genResult) {
      console.error("[generateVerificationId] RPC error:", genErr?.message);
      return null;
    }

    const letterId = genResult as string;
    console.log(`[generateVerificationId] Generated: ${letterId}`);

    // Resolve doctor_profiles.id — FK requires row PK, not auth UUID
    const profileId = await resolveProfileId(supabase, authUserId);

    const { error: insertErr } = await supabase
      .from("letter_verifications")
      .insert({
        letter_id: letterId,
        order_id: orderId,
        provider_id: profileId,   // doctor_profiles.id row PK (nullable)
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

    console.log(`[generateVerificationId] ✓ Issued ${letterId} for ${confirmationId}`);
    return letterId;
  } catch (err) {
    console.error("[generateVerificationId] Unexpected error:", err);
    return null;
  }
}

// ── Inject verification ID into PDF ─────────────────────────────────────────
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
        console.log(`[injectPdf] Already injected for doc ${documentId}`);
        return { ok: true, processedUrl: docRecord.processed_file_url as string };
      }
    }

    const dlRes = await fetch(fileUrl);
    if (!dlRes.ok) throw new Error(`Failed to download PDF: HTTP ${dlRes.status}`);
    const pdfBytes = await dlRes.arrayBuffer();

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

    const { data: publicUrlData } = supabase.storage.from("letters").getPublicUrl(processedFileName);
    const processedUrl = publicUrlData.publicUrl;

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

    console.log(`[injectPdf] ✓ Injected for doc ${documentId} — ${letterId}`);
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

    const body = await req.json() as {
      confirmationId: string; documentUrl: string; documentLabel: string;
      docType?: string; providerNote?: string;
    };

    const { confirmationId, documentUrl, documentLabel, docType, providerNote } = body;
    if (!confirmationId || !documentUrl || !documentLabel) {
      return json({ ok: false, error: "confirmationId, documentUrl, and documentLabel are required" }, 400);
    }

    console.log(`[provider-submit-letter] Processing submission for ${confirmationId} by ${profile.full_name}`);

    const { data: order, error: orderFetchErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_email, doctor_status, status, letter_type, addon_services, price, letter_id, letter_issue_date")
      .eq("confirmation_id", confirmationId).maybeSingle();

    if (orderFetchErr) {
      console.error("[provider-submit-letter] Order fetch error:", orderFetchErr.message);
      return json({ ok: false, error: `Order fetch failed: ${orderFetchErr.message}` }, 500);
    }
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

    const now = new Date();
    const issueDate = (order.letter_issue_date as string | null) ?? toDateString(now);
    const expiryDate = (() => {
      const d = new Date(issueDate);
      d.setFullYear(d.getFullYear() + 1);
      return toDateString(d);
    })();
    const isNewIssue = !order.letter_issue_date;

    const { data: insertedDoc, error: docError } = await supabase
      .from("order_documents")
      .insert({
        order_id: order.id, confirmation_id: confirmationId, label: documentLabel,
        doc_type: docType ?? "esa_letter", file_url: documentUrl,
        notes: providerNote?.trim() || null, uploaded_by: profile.full_name,
        sent_to_customer: false, customer_visible: true, footer_injected: false,
      })
      .select("id")
      .maybeSingle();

    if (docError) {
      console.error("[provider-submit-letter] Doc insert error:", docError.message);
      return json({ ok: false, error: `Failed to save document: ${docError.message}` }, 500);
    }

    const documentId = insertedDoc?.id ?? null;

    const orderUpdatePatch: Record<string, unknown> = {
      doctor_status: "patient_notified",
      status: "completed",
      signed_letter_url: documentUrl,
      patient_notification_sent_at: new Date().toISOString(),
      doctor_user_id: user.id,
      letter_expiry_date: expiryDate,
    };
    if (isNewIssue) orderUpdatePatch.letter_issue_date = issueDate;

    await supabase.from("orders").update(orderUpdatePatch).eq("id", order.id);

    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    const isPSD = (order.letter_type as string) === "psd" || (confirmationId ?? "").toUpperCase().includes("-PSD");
    const letterType: "esa" | "psd" = isPSD ? "psd" : "esa";

    let resolvedLetterId: string | null = (order.letter_id as string | null) ?? null;

    if (state && state.length === 2) {
      // Pass auth user.id — generateVerificationId resolves to profile row id internally
      const generatedId = await generateVerificationId(
        supabase, order.id, confirmationId, state, letterType, user.id
      );
      if (generatedId) {
        resolvedLetterId = generatedId;
        console.log(`[provider-submit-letter] ✓ Verification ID: ${resolvedLetterId}`);
      } else {
        console.error(`[provider-submit-letter] ✗ Failed to generate verification ID for ${confirmationId}`);
      }
    }

    let pdfInjectionResult: { ok: boolean; processedUrl?: string; error?: string } = { ok: false };
    const finalDocTypes = ["esa_letter", "psd_letter", "letter", "signed_letter"];
    const isFinalLetter = finalDocTypes.includes(docType ?? "esa_letter");

    if (resolvedLetterId && documentId && documentUrl && isFinalLetter) {
      pdfInjectionResult = await injectPdfVerification(supabase, {
        orderId: order.id, confirmationId, documentId,
        fileUrl: documentUrl, letterId: resolvedLetterId,
      });
    }

    const notifyRes = await fetch(`${SUPABASE_URL}/functions/v1/notify-patient-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ confirmationId, doctorMessage: providerNote?.trim() || null }),
    });

    let notifyResult: { ok?: boolean; error?: string } = {};
    try { notifyResult = JSON.parse(await notifyRes.text()); } catch { /* ignore */ }

    await supabase.from("doctor_notifications").insert({
      doctor_user_id: user.id, title: "Order Completed",
      message: `Documents submitted for order ${confirmationId}. Order marked as completed and patient has been notified.`,
      type: "letter_submitted", confirmation_id: confirmationId, order_id: order.id,
    });

    try {
      await supabase.from("communications").insert({
        order_id: order.id, confirmation_id: confirmationId,
        channel: "email", direction: "outbound",
        subject: "Your ESA/PSD Letter is Ready",
        body: providerNote?.trim() || "Provider submitted your letter. Patient notification sent.",
        status: "sent", sent_at: new Date().toISOString(), source: "provider_submit",
        metadata: {
          provider_id: user.id, provider_name: profile.full_name,
          document_label: documentLabel, letter_id: resolvedLetterId,
          footer_injected: pdfInjectionResult?.ok === true,
          letter_issue_date: issueDate, letter_expiry_date: expiryDate,
        },
      });
    } catch (commErr) {
      console.error("[provider-submit-letter] comm log error:", commErr);
    }

    const addonServices = Array.isArray(order.addon_services) ? (order.addon_services as string[]) : [];
    fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        webhookType: "main", event: "order_completed",
        email: order.email, firstName: order.first_name ?? "",
        lastName: order.last_name ?? "", phone: order.phone ?? "",
        confirmationId, patientState: order.state ?? "",
        letterType: isPSD ? "psd" : "esa", addonServices, price: order.price,
        assignedDoctor: profile.full_name,
        leadStatus: isPSD ? "PSD — Letter Sent — Completed" : "ESA — Letter Sent — Completed",
        tags: ["Letter Sent", "Completed", isPSD ? "PSD Order" : "ESA Order"],
      }),
    }).catch(() => {});

    return json({
      ok: true, documentSaved: true, orderUpdated: true,
      patientNotified: notifyResult?.ok === true,
      verificationIssued: !!resolvedLetterId,
      letterId: resolvedLetterId,
      pdfFooterInjected: pdfInjectionResult?.ok === true,
      processedPdfUrl: pdfInjectionResult?.processedUrl ?? null,
      letterIssueDate: issueDate, letterExpiryDate: expiryDate,
      message: notifyResult?.ok
        ? "Documents submitted successfully. Order marked as completed and patient has been notified by email."
        : "Documents saved and order completed. Patient notification may have been delayed — admin can resend.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[provider-submit-letter] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
