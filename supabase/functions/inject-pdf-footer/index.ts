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
import { decodePDFRawStream, PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { buildQrVerificationPdf } from "../_shared/qrVerificationPdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_BASE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://pawtenant.com";

/**
 * THE allowlist of document types that may carry a verification QR.
 *
 * This is an ALLOWLIST on purpose. A denylist would have to be extended every
 * time a new document type is introduced, and the one nobody remembered to add
 * would silently become verifiable. Here, an unknown or future type is refused
 * by default — the failure mode is "no QR", never "QR on an RA form".
 *
 * Do not add `housing_completed`, `customer_upload`, `landlord_form`,
 * `ra_completed_form`, `housing_verification`, intake/source forms, notary
 * documents or supporting files. Those keep clean, unstamped originals.
 */
const VERIFIABLE_DOC_TYPES = new Set(["esa_letter", "psd_letter"]);

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
    // esm.sh minifies constructor names in the Edge bundle, so capability
    // detection is required here. A constructor-name check mistakes a PDFArray
    // for a stream and makes every compressed provider PDF unreadable.
    const list = typeof contents.asArray === "function"
      // deno-lint-ignore no-explicit-any
      ? contents.asArray().map((r: any) => (doc as any).context.lookup(r))
      : [contents];
    let out = "";
    for (const stream of list) {
      let decoded: Uint8Array;
      if (typeof stream?.getUnencodedContents === "function") {
        decoded = stream.getUnencodedContents();
      } else if (stream?.dict && stream?.contents) {
        decoded = decodePDFRawStream(stream).decode();
      } else {
        return null;
      }
      // PDF operators are ASCII-compatible. Deno Edge does not support the
      // browser-only "latin1" TextDecoder label the old reader used.
      out += new TextDecoder().decode(decoded);
    }
    return out;
  } catch {
    return null;
  }
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


// RA-ADMIN-VISIBILITY-STORAGE-HARDENING-LIVE-001: fetch document bytes.
// Prefer a service-role Storage download parsed from the stored URL (works on
// private buckets, ignores stale signed-URL tokens); fall back to a raw fetch
// for external / non-Supabase URLs.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth: an ACTIVE ADMIN employee session. Nothing else. ─────────────────
    //
    // INJECT-PDF-FOOTER-AUTHZ-001. This block previously accepted two things it
    // should never have accepted:
    //
    //   1. `token === SERVICE_ROLE_KEY` — the project's service-role SECRET used
    //      as an application bearer token. That conflates "holds a database
    //      superuser credential" with "is allowed to perform this action", and
    //      it means the secret has to travel to every caller that wants to
    //      stamp a letter. It also cannot be attributed to anyone or revoked
    //      without rotating the key for the whole project.
    //   2. ANY authenticated user. The old JWT branch only checked that
    //      `auth.getUser()` resolved and the account had an email — so a signed-in
    //      CUSTOMER could invoke verification stamping. The taxonomy gate bounded
    //      the blast radius to real letters, but it was never an authorization
    //      check.
    //
    // Replaced with the pattern already used by admin-review-document: resolve a
    // real Supabase Auth user from the caller's own JWT, then require an ACTIVE
    // ADMIN profile. Legitimate callers are unaffected — the only HTTP caller is
    // the admin UI, which sends a real user JWT via getAdminToken().
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return json({ ok: false, error: "Unauthorized — no token provided" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Explicit, and deliberately BEFORE getUser(): the service-role key is not an
    // identity. Naming it in the response makes the misuse obvious to whoever
    // wired it, instead of failing as a confusing "invalid token".
    if (token === SERVICE_ROLE_KEY) {
      return json({
        ok: false,
        error:
          "Unauthorized — the service-role key is not an accepted credential. Verification stamping requires an admin employee session.",
      }, 403);
    }

    const { data: userResp, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userResp?.user) {
      return json({ ok: false, error: "Unauthorized — invalid token" }, 401);
    }

    const { data: callerProfile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, is_active")
      .eq("user_id", userResp.user.id)
      .maybeSingle();
    const caller = callerProfile as { is_admin?: boolean; is_active?: boolean } | null;
    if (!caller || caller.is_admin !== true || caller.is_active === false) {
      return json({ ok: false, error: "Forbidden — admin privileges are required to stamp a letter." }, 403);
    }

    const body = await req.json() as {
      orderId: string;
      confirmationId: string;
      documentId: string;
      fileUrl: string;
      letterId: string;
      forceReInject?: boolean;
    };

    // `fileUrl` is intentionally NOT destructured: it stays on the wire contract
    // for existing callers but must never be read. See the taxonomy gate below.
    const { orderId, confirmationId, documentId, letterId, forceReInject } = body;

    if (!orderId || !confirmationId || !documentId || !letterId) {
      return json({ ok: false, error: "orderId, confirmationId, documentId, and letterId are required" }, 400);
    }

    // ── AUTHORITATIVE TAXONOMY GATE ───────────────────────────────────────────
    //
    // Every request field describing the DOCUMENT is untrusted. `fileUrl` is
    // still accepted for wire compatibility with existing callers but is
    // deliberately IGNORED — a caller that could name its own source file could
    // stamp a QR onto any PDF it liked, including an RA form.
    //
    // Resolve the row by id, prove it belongs to the order in the request, and
    // refuse every class that is not a final clinical letter. This runs BEFORE
    // any download, PDF construction, storage upload, verification record or
    // pointer update, so a refused call leaves absolutely no trace: no
    // verification row, no processed object, no audit success event.
    //
    // Only `esa_letter` and `psd_letter` are verifiable. RA source forms,
    // completed RA/housing forms, landlord and accommodation forms, intake
    // files, customer uploads, notary documents, supporting files and any
    // UNKNOWN or future type all fail closed here by construction: the check is
    // an allowlist, so a type nobody has invented yet is refused by default.
    const { data: authoritativeDoc, error: docLookupError } = await supabase
      .from("order_documents")
      .select("id, order_id, doc_type, file_url, footer_injected, processed_file_url, footer_letter_id")
      .eq("id", documentId)
      .maybeSingle();
    if (docLookupError || !authoritativeDoc || authoritativeDoc.order_id !== orderId) {
      return json({ ok: false, error: "Document does not belong to this order" }, 404);
    }
    if (!VERIFIABLE_DOC_TYPES.has(authoritativeDoc.doc_type ?? "")) {
      console.log(
        `[inject-pdf-footer] refusing ${documentId}: doc_type=${authoritativeDoc.doc_type ?? "null"} is not verifiable`,
      );
      return json({
        ok: false,
        skipped: true,
        reason: "document_type_not_verifiable",
        error: "Only final ESA or PSD letters can receive a verification QR code.",
      }, 422);
    }

    // The ONLY source of bytes. Always the immutable original — never
    // `processed_file_url`, so a re-inject can never stack a QR on an
    // already-stamped file, and never the caller's `fileUrl`.
    const authoritativeFileUrl = authoritativeDoc.file_url as string | null;
    if (!authoritativeFileUrl) {
      return json({ ok: false, error: "The final letter has no original PDF" }, 422);
    }

    // ── Idempotency check — skipped when forceReInject is true ───────────────
    if (!forceReInject) {
      // Reuse the row already fetched by the taxonomy gate — a second lookup
      // would be a wasted round trip and could observe a different state.
      const docRecord = authoritativeDoc;

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
      // MERGED 2026-08-15: the storage-hardened downloader (private buckets)
      // applied to the AUTHORITATIVE url. TEST v52 had regressed this to a plain
      // fetch(), which 404s on the now-private provider-letters bucket.
      pdfBytes = await downloadDocumentBytes(supabase, authoritativeFileUrl);
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
