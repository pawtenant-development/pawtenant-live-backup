/**
 * inject-pdf-footer
 *
 * Downloads a provider-uploaded PDF from Supabase Storage, injects a verification ID
 * stamp on the FIRST PAGE (top right corner) in ORANGE, and stores the processed copy.
 *
 * Auth: accepts EITHER service-role key (server-to-server) OR a valid admin JWT.
 * Pass forceReInject: true to bypass idempotency cache (used by admin Re-inject button).
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth: service-role key OR valid admin JWT ─────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return json({ ok: false, error: "Unauthorized — no token provided" }, 401);
    }

    const isServiceRole = token === SERVICE_ROLE_KEY;

    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user || !user.email) {
        return json({ ok: false, error: "Unauthorized — invalid token" }, 401);
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json() as {
      orderId: string;
      confirmationId: string;
      documentId: string;
      fileUrl: string;
      letterId: string;
      forceReInject?: boolean;
    };

    const { orderId, confirmationId, documentId, fileUrl, letterId, forceReInject } = body;

    if (!orderId || !confirmationId || !documentId || !fileUrl || !letterId) {
      return json({ ok: false, error: "orderId, confirmationId, documentId, fileUrl, and letterId are required" }, 400);
    }

    // ── Idempotency check — skipped when forceReInject is true ───────────────
    if (!forceReInject) {
      const { data: docRecord } = await supabase
        .from("order_documents")
        .select("footer_injected, processed_file_url, footer_letter_id")
        .eq("id", documentId)
        .maybeSingle();

      if (docRecord?.footer_injected && docRecord?.footer_letter_id === letterId && docRecord?.processed_file_url) {
        console.log(`[inject-pdf-footer] Already injected for doc ${documentId} — returning cached URL`);
        return json({
          ok: true,
          injected: false,
          reused: true,
          processedUrl: docRecord.processed_file_url,
          letterId,
        });
      }
    }

    // ── Download the original PDF ─────────────────────────────────────────────
    let pdfBytes: ArrayBuffer;
    try {
      const dlRes = await fetch(fileUrl);
      if (!dlRes.ok) throw new Error(`Failed to download PDF: HTTP ${dlRes.status}`);
      pdfBytes = await dlRes.arrayBuffer();
    } catch (dlErr: unknown) {
      const msg = dlErr instanceof Error ? dlErr.message : "Download failed";
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: msg });
      return json({ ok: false, error: msg }, 502);
    }

    // ── Load PDF ──────────────────────────────────────────────────────────────
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch {
      try {
        pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      } catch (loadErr: unknown) {
        const msg = loadErr instanceof Error ? loadErr.message : "PDF load failed";
        await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: msg });
        return json({ ok: false, error: `Cannot parse PDF: ${msg}` }, 422);
      }
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount === 0) {
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: "PDF has no pages" });
      return json({ ok: false, error: "PDF has no pages" }, 422);
    }

    // ── Inject on FIRST PAGE — top right corner ───────────────────────────────
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const line1 = "Verification ID:";
    const line2 = letterId;
    const line3 = `pawtenant.com/verify/${letterId}`;

    const sz1 = 8;
    const sz2 = 11;
    const sz3 = 7.5;

    const w1 = font.widthOfTextAtSize(line1, sz1);
    const w2 = fontBold.widthOfTextAtSize(line2, sz2);
    const w3 = font.widthOfTextAtSize(line3, sz3);
    const boxW = Math.max(w1, w2, w3) + 16;

    const MARGIN_RIGHT = 20;
    const MARGIN_TOP = 20;

    const lineH1 = sz1 + 4;
    const lineH2 = sz2 + 4;
    const lineH3 = sz3 + 4;
    const boxH = lineH1 + lineH2 + lineH3 + 8;

    const boxX = width - MARGIN_RIGHT - boxW;
    const boxY = height - MARGIN_TOP - boxH;

    // White background box with orange border
    firstPage.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.45, 0.1),  // orange border
      borderWidth: 1,
      opacity: 0.97,
    });

    const y1 = boxY + boxH - 8 - sz1;
    const y2 = y1 - lineH1 - 1;
    const y3 = y2 - lineH2 + 2;

    const textX1 = boxX + boxW - 8 - w1;
    const textX2 = boxX + boxW - 8 - w2;
    const textX3 = boxX + boxW - 8 - w3;

    // Line 1: "Verification ID:" — gray label
    firstPage.drawText(line1, {
      x: textX1, y: y1, size: sz1, font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Line 2: the ID itself — ORANGE, bold, prominent
    firstPage.drawText(line2, {
      x: textX2, y: y2, size: sz2, font: fontBold,
      color: rgb(0.85, 0.35, 0.05),  // orange as requested
    });

    // Line 3: URL — small gray
    firstPage.drawText(line3, {
      x: textX3, y: y3, size: sz3, font,
      color: rgb(0.35, 0.35, 0.35),
    });

    // ── Save PDF ──────────────────────────────────────────────────────────────
    let processedBytes: Uint8Array;
    try {
      processedBytes = await pdfDoc.save();
    } catch (saveErr: unknown) {
      const msg = saveErr instanceof Error ? saveErr.message : "PDF save failed";
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: msg });
      return json({ ok: false, error: `PDF serialization failed: ${msg}` }, 500);
    }

    // ── Upload to Storage ─────────────────────────────────────────────────────
    const processedFileName = `${confirmationId}-${documentId}-verified.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from("letters")
      .upload(processedFileName, processedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: uploadErr.message });
      return json({ ok: false, error: `Storage upload failed: ${uploadErr.message}` }, 500);
    }

    const { data: publicUrlData } = supabase.storage.from("letters").getPublicUrl(processedFileName);
    const processedUrl = publicUrlData.publicUrl;

    // ── Update order_documents ────────────────────────────────────────────────
    await supabase
      .from("order_documents")
      .update({
        footer_injected: true,
        processed_file_url: processedUrl,
        footer_letter_id: letterId,
      })
      .eq("id", documentId);

    await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: true });

    console.log(`[inject-pdf-footer] ✓ Injected for doc ${documentId} (${confirmationId}) — ${letterId}`);

    return json({
      ok: true,
      injected: true,
      reused: false,
      processedUrl,
      letterId,
      pageCount,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[inject-pdf-footer] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

async function logInjection(
  supabase: ReturnType<typeof createClient>,
  opts: { orderId: string; confirmationId: string; documentId: string; letterId: string; success: boolean; error?: string }
) {
  await supabase.from("audit_logs").insert({
    actor_name: "System",
    actor_role: "system",
    object_type: "pdf_footer_injection",
    object_id: opts.confirmationId,
    action: opts.success ? "pdf_footer_injected" : "pdf_footer_injection_failed",
    description: opts.success
      ? `Verification header injected into document ${opts.documentId} for order ${opts.confirmationId} — letter_id: ${opts.letterId}`
      : `PDF header injection failed for document ${opts.documentId} (order ${opts.confirmationId}): ${opts.error ?? "unknown"}`,
    metadata: {
      order_id: opts.orderId,
      confirmation_id: opts.confirmationId,
      document_id: opts.documentId,
      letter_id: opts.letterId,
      success: opts.success,
      error: opts.error ?? null,
      timestamp: new Date().toISOString(),
    },
  });
}
