/**
 * inject-pdf-footer
 *
 * Downloads a provider-uploaded PDF from Supabase Storage, stamps a BARE QR CODE
 * on it, and stores the processed copy at processed_file_url.
 *
 * THIS IS THE CUSTOMER-FACING LETTER. src/lib/customerDocuments.ts serves
 * processed_file_url as "the verification copy"; the newer qr_file_url built by
 * generate-qr-verification-pdf is not in the customer download path. So the
 * QR-only presentation had to land HERE to reach a real recipient.
 *
 * WHAT WAS REMOVED (QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001, final closure)
 * The first page used to carry an orange-bordered box in the TOP-RIGHT corner
 * printing three lines:
 *     "Verification ID:"  /  <LETTER-ID>  /  pawtenant.com/verify/<LETTER-ID>
 * A landlord could read the vendor's domain, the verification route and the
 * identifier straight off a clinical letter. All three are gone. The
 * verification destination now exists ONLY inside the QR module geometry.
 *
 * PLACEMENT. The box used to be stamped blindly at a fixed top-right position,
 * which could land on provider content. The QR is placed by the shared module's
 * content-bounds analysis instead: it prefers a bottom margin PROVEN empty
 * (the footer/signature area the owner asked for), then a proven-empty top
 * margin, and appends a page only when neither can be demonstrated safe. It
 * therefore cannot cover a signature, provider credentials or letter text.
 *
 * Auth: accepts EITHER service-role key (server-to-server) OR a valid admin JWT.
 * Pass forceReInject: true to bypass idempotency cache (used by admin Re-inject button).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// rgb/StandardFonts are gone with the text box: this function no longer draws
// any text of its own, and PDFDocument is kept only to validate the upload.
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { buildQrVerificationPdf } from "../_shared/qrVerificationPdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_BASE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://pawtenant.com";

/**
 * Inflate a page's content stream so the placement analyzer can read it.
 * Anything we cannot inflate returns null, and the shared module treats null as
 * "unreadable" -> appended page. Guessing is never an option here.
 */
async function readPageContent(doc: PDFDocument, index: number): Promise<string | null> {
  try {
    const page = doc.getPage(index);
    // deno-lint-ignore no-explicit-any
    const contents = (page as any).node.Contents();
    // NO /Contents key at all. The page draws nothing — that is proof of a
    // blank page, not a failure to read one. Returning null here made the
    // analyzer treat genuinely empty TEST letters as unreadable and refuse to
    // place the QR on them. An empty string is the honest answer.
    if (!contents) return "";
    const list = contents.constructor?.name === "PDFArray"
      // deno-lint-ignore no-explicit-any
      ? contents.asArray().map((r: any) => (doc as any).context.lookup(r))
      : [contents];
    let out = "";
    for (const s of list) {
      if (!s?.getContents) return null;
      const raw: Uint8Array = s.getContents();
      // A content stream may be Flate-compressed (zlib or raw deflate) or
      // stored verbatim. Try each before giving up — a stream we cannot inflate
      // is "unknown", and unknown blocks placement, so a false negative here
      // silently costs every letter its QR.
      if (raw[0] === 0x78) {
        out += await inflate(raw, "deflate");
      } else {
        const asText = new TextDecoder("latin1").decode(raw);
        // Heuristic: real content streams are printable operators. If it does
        // not look like one, try raw deflate before accepting it as text.
        out += /[A-Za-z]/.test(asText.slice(0, 32)) ? asText : await inflate(raw, "deflate-raw");
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function inflate(raw: Uint8Array, format: "deflate" | "deflate-raw"): Promise<string> {
  const ds = new DecompressionStream(format);
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder("latin1").decode(new Uint8Array(buf));
}

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

    // ── Resolve the QR destination ────────────────────────────────────────────
    // Prefer the opaque 128-bit public_token: it is what the QR has encoded for
    // genuine letters since Stage 1, and it is not enumerable. The Verification
    // ID resolves the same record through /verify/:letterId and is the fallback
    // for any row that predates the token backfill — never visible either way.
    const { data: lv } = await supabase
      .from("letter_verifications")
      .select("public_token")
      .eq("letter_id", letterId)
      .maybeSingle();
    const publicToken = (lv as { public_token?: string | null } | null)?.public_token ?? null;
    const verifyUrl = publicToken
      ? `${VERIFY_BASE}/v/t/${publicToken}`
      : `${VERIFY_BASE}/verify/${letterId}`;

    // ── Stamp the bare QR ─────────────────────────────────────────────────────
    // buildQrVerificationPdf works from the ORIGINAL bytes, never mutates them,
    // and refuses to place the code anywhere it cannot prove is empty.
    let processedBytes: Uint8Array;
    let built: Awaited<ReturnType<typeof buildQrVerificationPdf>>;
    try {
      built = await buildQrVerificationPdf(pdfBytes, { letterId, verifyUrl }, readPageContent);
      processedBytes = built.bytes;
    } catch (saveErr: unknown) {
      const msg = saveErr instanceof Error ? saveErr.message : "PDF save failed";
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: msg });
      return json({ ok: false, error: `PDF serialization failed: ${msg}` }, 500);
    }

    // EXPLICIT SAFE FAILURE — FAIL CLOSED.
    //
    // The shared module refuses for a whole family of reasons, not just "no room
    // for the code": a broken cross-reference table, trailing garbage after
    // %%EOF, an encrypted or unparseable file, page geometry it cannot reason
    // about, an output that will not reopen, or a drawn QR that does not match
    // the matrix the URL should produce.
    //
    // A document we cannot verify is one we must not rewrite. Publishing a
    // pdf-lib-REPAIRED copy of a clinical letter would republish something whose
    // fidelity to the provider's original we cannot demonstrate, and overlaying
    // or appending are both worse. So: nothing is uploaded, processed_file_url is
    // left exactly as it was, the original and its row are untouched, and no
    // notification is produced. `verified` must be explicitly true — an absent
    // flag is treated as a refusal, not as consent.
    const refused = built.placement.mode !== "inline" || built.verified !== true;
    if (refused) {
      const code = built.failure ?? "no_safe_qr_placement";
      // Kept deliberately coarse: a layout/structure class, never document
      // contents, storage paths, or library internals.
      const detail = built.failureDetail ?? built.placement.reason;
      console.error(`[inject-pdf-footer] refusing to publish ${documentId}: ${code} — ${detail}`);
      await logInjection(supabase, {
        orderId, confirmationId, documentId, letterId,
        success: false, error: `refused (${code}): ${detail}`,
      });
      return json({
        ok: false,
        skipped: true,
        reason: code,
        detail,
        documentId,
        letterId,
      }, 200);
    }
    console.log(`[inject-pdf-footer] QR placement: ${built.placement.mode} — ${built.placement.reason}`);

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

    // ── 2026-05-20 LETTERS-BUCKET-PRIVATE-SIGNED-URL-FIX ────────────────────
    // `letters` is a private bucket — getPublicUrl returns a broken
    // /storage/v1/object/public/letters/... URL. Use createSignedUrl
    // (10-year TTL) so the URL stored in processed_file_url works for
    // both admin and customer download surfaces.
    const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data: signed, error: signErr } = await supabase.storage
      .from("letters")
      .createSignedUrl(processedFileName, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      await logInjection(supabase, { orderId, confirmationId, documentId, letterId, success: false, error: `Signed URL generation failed: ${signErr?.message ?? "no signed url"}` });
      return json({ ok: false, error: `Signed URL generation failed: ${signErr?.message ?? "no signed url"}` }, 500);
    }
    const processedUrl = signed.signedUrl;

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
