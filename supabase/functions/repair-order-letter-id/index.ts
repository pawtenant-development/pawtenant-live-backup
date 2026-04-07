/**
 * repair-order-letter-id
 *
 * Two modes:
 * 1. Bulk backfill — no body or { all: true } — requires service role key
 * 2. Single order  — { confirmationId: "PT-XXX" } — accepts admin JWT OR service role key
 *
 * Auth:
 *   - Service role key in Authorization header → always allowed (both modes)
 *   - Admin JWT (is_admin=true in doctor_profiles) → allowed for single-order mode
 *
 * IMPORTANT:
 *   - DB RPC parameter is named p_state (not state)
 *   - letter_verifications.provider_id references doctor_profiles.id (NOT doctor_user_id)
 *     so we must resolve the profile row id before inserting
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

/** Resolve doctor_profiles.id from doctor_user_id (auth UUID). Returns null if not found. */
async function resolveProfileId(
  supabase: ReturnType<typeof createClient>,
  doctorUserId: string | null
): Promise<string | null> {
  if (!doctorUserId) return null;
  const { data } = await supabase
    .from("doctor_profiles")
    .select("id")
    .eq("user_id", doctorUserId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function injectPdf(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  confirmationId: string,
  documentId: string,
  fileUrl: string,
  letterId: string
): Promise<{ ok: boolean; processedUrl?: string; error?: string }> {
  try {
    const dlRes = await fetch(fileUrl);
    if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`);
    const pdfBytes = await dlRes.arrayBuffer();

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    }

    if (pdfDoc.getPageCount() === 0) throw new Error("PDF has no pages");

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

    const lineH1 = sz1 + 4, lineH2 = sz2 + 4, lineH3 = sz3 + 4;
    const boxH = lineH1 + lineH2 + lineH3 + 8;
    const boxX = width - 20 - boxW;
    const boxY = height - 20 - boxH;

    firstPage.drawRectangle({
      x: boxX, y: boxY, width: boxW, height: boxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.45, 0.1),
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

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabase.storage.from("letters").getPublicUrl(processedFileName);

    await supabase.from("order_documents").update({
      footer_injected: true,
      processed_file_url: publicUrl,
      footer_letter_id: letterId,
    }).eq("id", documentId);

    await supabase.from("audit_logs").insert({
      actor_name: "Admin", actor_role: "admin",
      object_type: "pdf_footer_injection", object_id: confirmationId,
      action: "pdf_footer_injected",
      description: `[REPAIR] Verification header injected into document ${documentId} for order ${confirmationId} — letter_id: ${letterId}`,
      metadata: { order_id: orderId, confirmation_id: confirmationId, document_id: documentId, letter_id: letterId, success: true, repair: true, timestamp: new Date().toISOString() },
    });

    return { ok: true, processedUrl: publicUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[repair] PDF inject failed for doc ${documentId}:`, msg);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const isServiceRole = token === SERVICE_ROLE_KEY;

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    }
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const confirmationId = body.confirmationId as string | undefined;
  const isSingleOrder = !!confirmationId;

  // Auth check
  if (!isServiceRole) {
    if (!isSingleOrder) {
      return json({ ok: false, error: "Bulk repair requires service role key" }, 401);
    }
    if (!token) {
      return json({ ok: false, error: "Authorization required" }, 401);
    }
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) {
      return json({ ok: false, error: "Invalid or expired token" }, 401);
    }
    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, is_active")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_admin || !profile?.is_active) {
      return json({ ok: false, error: "Admin access required" }, 403);
    }
  }

  // ── SINGLE ORDER MODE ──────────────────────────────────────────────────────
  if (isSingleOrder) {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, state, letter_type, doctor_user_id, letter_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (orderErr || !order) {
      return json({ ok: false, error: `Order not found: ${confirmationId}` }, 404);
    }

    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    if (!state || state.length !== 2) {
      return json({ ok: false, error: `Invalid state on order: ${order.state}` }, 400);
    }

    const isPSD = (order.letter_type as string) === "psd" || (order.confirmation_id as string).toUpperCase().includes("-PSD");
    const letterType = isPSD ? "psd" : "esa";

    // Resolve doctor_profiles.id from doctor_user_id — FK requires the profile row id, not auth uuid
    const profileId = await resolveProfileId(supabase, order.doctor_user_id as string | null);

    let letterId = order.letter_id as string | null;

    if (!letterId) {
      const { data: existing } = await supabase
        .from("letter_verifications")
        .select("letter_id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existing?.letter_id) {
        letterId = existing.letter_id as string;
        await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
      } else {
        const { data: genResult, error: genErr } = await supabase.rpc("generate_letter_verification_id", { p_state: state });
        if (genErr || !genResult) {
          return json({ ok: false, error: `Failed to generate ID: ${genErr?.message}` }, 500);
        }
        letterId = genResult as string;

        const { error: insertErr } = await supabase.from("letter_verifications").insert({
          letter_id: letterId,
          order_id: order.id,
          provider_id: profileId,   // doctor_profiles.id (row PK), not auth uuid
          state,
          letter_type: letterType,
          issued_at: new Date().toISOString(),
          status: "valid",
          expires_at: null,
        });

        if (insertErr && insertErr.code !== "23505") {
          return json({ ok: false, error: `Failed to save verification: ${insertErr.message}` }, 500);
        }

        if (insertErr?.code === "23505") {
          const { data: raceRec } = await supabase.from("letter_verifications").select("letter_id").eq("order_id", order.id).maybeSingle();
          if (raceRec?.letter_id) letterId = raceRec.letter_id as string;
        }

        await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
      }
    }

    const { data: docs } = await supabase
      .from("order_documents")
      .select("id, file_url, doc_type, footer_injected")
      .eq("order_id", order.id);

    let documentsProcessed = 0;
    const errors: string[] = [];

    for (const doc of (docs ?? [])) {
      const result = await injectPdf(
        supabase,
        order.id as string,
        order.confirmation_id as string,
        doc.id as string,
        doc.file_url as string,
        letterId!
      );
      if (result.ok) documentsProcessed++;
      else errors.push(`Doc ${doc.id}: ${result.error}`);
    }

    return json({
      ok: true,
      letterId,
      documentsProcessed,
      errors: errors.length > 0 ? errors : undefined,
      message: `Verification ID ${letterId} issued and injected into ${documentsProcessed} document(s)`,
    });
  }

  // ── BULK MODE (service role only) ──────────────────────────────────────────
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, state, letter_type, doctor_user_id, letter_id")
    .in("doctor_status", ["patient_notified", "letter_sent"])
    .is("letter_id", null);

  if (ordersErr) return json({ ok: false, error: ordersErr.message }, 500);
  if (!orders || orders.length === 0) return json({ ok: true, message: "No orders need repair", fixed: 0 });

  console.log(`[repair] Found ${orders.length} orders needing repair`);

  const results: Array<{ confirmationId: string; letterId: string | null; docsFixed: number; errors: string[] }> = [];

  for (const order of orders) {
    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    if (!state || state.length !== 2) {
      results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`Invalid state: ${order.state}`] });
      continue;
    }

    const isPSD = (order.letter_type as string) === "psd" || (order.confirmation_id as string).toUpperCase().includes("-PSD");
    const letterType = isPSD ? "psd" : "esa";

    // Resolve doctor_profiles.id from doctor_user_id
    const profileId = await resolveProfileId(supabase, order.doctor_user_id as string | null);

    let letterId: string | null = null;
    const { data: existing } = await supabase
      .from("letter_verifications")
      .select("letter_id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existing?.letter_id) {
      letterId = existing.letter_id as string;
      await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
    } else {
      const { data: genResult, error: genErr } = await supabase.rpc("generate_letter_verification_id", { p_state: state });
      if (genErr || !genResult) {
        results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`RPC failed: ${genErr?.message}`] });
        continue;
      }
      letterId = genResult as string;

      const { error: insertErr } = await supabase.from("letter_verifications").insert({
        letter_id: letterId,
        order_id: order.id,
        provider_id: profileId,   // doctor_profiles.id (row PK), not auth uuid
        state,
        letter_type: letterType,
        issued_at: new Date().toISOString(),
        status: "valid",
        expires_at: null,
      });

      if (insertErr && insertErr.code !== "23505") {
        results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`Insert failed: ${insertErr.message}`] });
        continue;
      }

      if (insertErr?.code === "23505") {
        const { data: raceRec } = await supabase.from("letter_verifications").select("letter_id").eq("order_id", order.id).maybeSingle();
        if (raceRec?.letter_id) letterId = raceRec.letter_id as string;
      }

      await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
    }

    const { data: docs } = await supabase
      .from("order_documents")
      .select("id, file_url, doc_type")
      .eq("order_id", order.id)
      .eq("footer_injected", false);

    const finalDocTypes = ["esa_letter", "psd_letter", "letter", "signed_letter"];
    const errors: string[] = [];
    let docsFixed = 0;

    for (const doc of (docs ?? [])) {
      if (!finalDocTypes.includes(doc.doc_type as string)) continue;
      const result = await injectPdf(supabase, order.id as string, order.confirmation_id as string, doc.id as string, doc.file_url as string, letterId!);
      if (result.ok) docsFixed++;
      else errors.push(`Doc ${doc.id}: ${result.error}`);
    }

    results.push({ confirmationId: order.confirmation_id as string, letterId, docsFixed, errors });
  }

  const totalFixed = results.filter((r) => r.letterId).length;
  const totalDocs = results.reduce((sum, r) => sum + r.docsFixed, 0);

  return json({
    ok: true,
    message: `Repaired ${totalFixed} orders, injected ${totalDocs} PDFs`,
    results,
  });
});
