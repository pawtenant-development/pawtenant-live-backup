// generate-qr-verification-pdf
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · Stage 2
//
// Builds the QR-enabled verification copy (v2) of ONE letter from the preserved
// provider ORIGINAL and stores it at a NEW object path.
//
// Invariants this function is built around:
//   • the provider original (order_documents.file_url) is READ ONLY — it is
//     downloaded, hashed, and never re-uploaded;
//   • the existing v1 injected copy (processed_file_url) is never touched;
//   • the v2 copy is written to its own path and recorded on qr_file_url, so
//     rollback is a resolution change, not a data restore;
//   • re-running for the same document is a no-op unless force=true, which is
//     what makes the July-onward backfill safely resumable;
//   • it is SILENT — no email, SMS, notification row, provider alert or webhook.
//     It writes exactly one audit_logs row and nothing else. Do not add a
//     notification here: the backfill upgrades documents customers already hold.
//
// Auth: service-role bearer OR an admin JWT. Never customer-callable.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildQrVerificationPdf } from "../_shared/qrVerificationPdf.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_BASE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://pawtenant.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const STORAGE_RE = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/;
function parseStorageUrl(u: string | null): { bucket: string; path: string } | null {
  if (!u) return null;
  try {
    const m = new URL(u).pathname.match(STORAGE_RE);
    return m ? { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) } : null;
  } catch { return null; }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Inflate a page's content stream so the placement analyzer can read it.
 * Real producers Flate-compress content; anything we cannot inflate returns
 * null, and the module treats null as "unreadable" -> appended page. Guessing
 * is never an option here.
 */
async function readPageContent(doc: PDFDocument, index: number): Promise<string | null> {
  try {
    const page = doc.getPage(index);
    // deno-lint-ignore no-explicit-any
    const contents = (page as any).node.Contents();
    if (!contents) return null;
    const list = contents.constructor?.name === "PDFArray"
      // deno-lint-ignore no-explicit-any
      ? contents.asArray().map((r: any) => (doc as any).context.lookup(r))
      : [contents];
    let out = "";
    for (const s of list) {
      if (!s?.getContents) return null;
      const raw: Uint8Array = s.getContents();
      let text: string;
      if (raw[0] === 0x78) {
        const ds = new DecompressionStream("deflate");
        const buf = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
        text = new TextDecoder("latin1").decode(new Uint8Array(buf));
      } else {
        text = new TextDecoder("latin1").decode(raw);
      }
      out += text;
    }
    return out;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return json({ ok: false, error: "Missing bearer token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Capability probe rather than `bearer === SERVICE_KEY`: the deployed env var
  // is not always the key a caller holds, and a string compare silently denies
  // legitimate internal callers (or, worse, is treated as proof of privilege).
  let authorized = false;
  if (bearer === SERVICE_KEY) {
    authorized = true;
  } else {
    const { data: u } = await admin.auth.getUser(bearer);
    if (u?.user) {
      const { data: p } = await admin.from("doctor_profiles")
        .select("is_admin").eq("user_id", u.user.id).maybeSingle();
      authorized = !!(p as { is_admin?: boolean } | null)?.is_admin;
    }
  }
  if (!authorized) return json({ ok: false, error: "Not authorized" }, 403);

  let body: { documentId?: string; force?: boolean; dryRun?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const documentId = (body.documentId ?? "").trim();
  const force = body.force === true;
  const dryRun = body.dryRun === true;
  if (!documentId) return json({ ok: false, error: "documentId is required" }, 400);

  const { data: doc, error: docErr } = await admin
    .from("order_documents")
    .select("id, order_id, doc_type, file_url, processed_file_url, qr_file_url, customer_visible, confirmation_id")
    .eq("id", documentId).maybeSingle();
  if (docErr) return json({ ok: false, error: `Lookup failed: ${docErr.message}` }, 500);
  if (!doc) return json({ ok: false, error: "Document not found" }, 404);

  // Only ESA/PSD PRIMARY letters. RA forms, vet records, notarised documents and
  // customer uploads are different classes and must never be stamped as letters.
  const LETTER_TYPES = new Set(["esa_letter", "psd_letter", "signed_letter", "letter"]);
  if (!LETTER_TYPES.has(doc.doc_type as string)) {
    return json({ ok: false, skipped: true, reason: "not_a_primary_letter", doc_type: doc.doc_type }, 200);
  }
  if (!doc.file_url) {
    return json({ ok: false, skipped: true, reason: "no_provider_original" }, 200);
  }
  if (doc.qr_file_url && !force) {
    return json({ ok: true, alreadyGenerated: true, qrFileUrl: doc.qr_file_url, documentId }, 200);
  }

  const { data: order } = await admin.from("orders")
    .select("id, confirmation_id, letter_id").eq("id", doc.order_id).maybeSingle();
  const letterId = (order?.letter_id as string | null) ?? null;
  if (!letterId) return json({ ok: false, skipped: true, reason: "no_verification_id" }, 200);

  const { data: lv } = await admin.from("letter_verifications")
    .select("letter_id, public_token").eq("letter_id", letterId).maybeSingle();
  const token = (lv?.public_token as string | null) ?? null;
  if (!token) return json({ ok: false, skipped: true, reason: "no_public_token" }, 200);

  // Download the ORIGINAL. Read-only: these bytes are hashed and used as input,
  // and are never written back to any path.
  const src = parseStorageUrl(doc.file_url as string);
  if (!src) return json({ ok: false, skipped: true, reason: "original_not_in_storage" }, 200);
  const { data: blob, error: dlErr } = await admin.storage.from(src.bucket).download(src.path);
  if (dlErr || !blob) {
    // A row whose original object no longer exists is INELIGIBLE, not a failure:
    // there is nothing authentic to build v2 from, and fabricating a substitute
    // is exactly what must never happen. Reported so the census can count it.
    const missing = /not found/i.test(dlErr?.message ?? "");
    return json({
      ok: false, skipped: true,
      reason: missing ? "original_object_missing" : "original_download_failed",
      detail: dlErr?.message ?? "no data",
    }, 200);
  }
  const originalBytes = new Uint8Array(await blob.arrayBuffer());
  const originalSha = await sha256(originalBytes);

  let built;
  try {
    built = await buildQrVerificationPdf(
      originalBytes,
      // The SHORT alias is what goes in the QR. It resolves through the same
      // service as /verify/t/:token — it exists purely to shorten the payload.
      // Measured: the TEST origin needs 37 modules at /verify/t/ (82x98 =
      // 8036pt^2, LARGER than the block it replaces) but only 33 at /v/t/
      // (74x90 = 6660pt^2, -8.3%). Same 128-bit token either way.
      { letterId, verifyUrl: `${VERIFY_BASE}/v/t/${token}` },
      readPageContent,
    );
  } catch (e) {
    // An unreadable or non-PDF original (a JPEG/PNG upload) cannot be stamped.
    // Report it; never substitute another file under the verification label.
    return json({ ok: false, skipped: true, reason: "original_not_processable",
      detail: e instanceof Error ? e.message : String(e) }, 200);
  }

  if (dryRun) {
    return json({ ok: true, dryRun: true, documentId, letterId,
      placement: built.placement, metrics: built.metrics,
      pageCountBefore: built.pageCountBefore, pageCountAfter: built.pageCountAfter,
      originalSha256: originalSha }, 200);
  }

  // FAIL CLOSED. The module refuses for structural reasons (broken xref,
  // trailing garbage, encrypted, unusable geometry, output that will not reopen,
  // drawn modules that do not match the encoded matrix) as well as for "no clear
  // corner". In every case `bytes` is the unchanged original, so storing it
  // under a "verified" name would claim a QR that is not there. `verified` must
  // be explicitly true; an absent flag is a refusal.
  if (built.placement.mode !== "inline" || built.verified !== true) {
    return json({ ok: false, skipped: true,
      reason: built.failure ?? "no_safe_qr_placement",
      detail: built.failureDetail ?? built.placement.reason,
      documentId, letterId }, 200);
  }

  // NEW object path. `-qr-v2` keeps it distinct from the v1 `-verified.pdf`
  // object, so neither can overwrite the other even by accident.
  const cid = (order?.confirmation_id as string) ?? (doc.confirmation_id as string) ?? doc.order_id;
  const destPath = `${cid}-${doc.id}-verified-qr-v2.pdf`;
  const { error: upErr } = await admin.storage.from("letters")
    .upload(destPath, built.bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return json({ ok: false, error: `Upload failed: ${upErr.message}` }, 500);

  const TTL = 60 * 60 * 24 * 365 * 10;
  const { data: signed, error: signErr } = await admin.storage.from("letters")
    .createSignedUrl(destPath, TTL);
  if (signErr || !signed?.signedUrl) {
    return json({ ok: false, error: `Signed URL failed: ${signErr?.message ?? "none"}` }, 500);
  }

  const { error: updErr } = await admin.from("order_documents").update({
    qr_file_url: signed.signedUrl,
    qr_generated_at: new Date().toISOString(),
    qr_letter_id: letterId,
    qr_placement: built.placement.mode,
    qr_source_sha256: originalSha,
  }).eq("id", doc.id);
  if (updErr) return json({ ok: false, error: `Update failed: ${updErr.message}` }, 500);

  // Internal audit only. Deliberately NOT a doctor_notifications row, a
  // communications row, or any customer-facing event.
  await admin.from("audit_logs").insert({
    actor_name: "System", actor_role: "system",
    object_type: "order_document", object_id: cid,
    action: "verification_qr_v2_generated",
    description: `QR verification copy generated for ${cid} (${letterId}) — ${built.placement.mode}`,
    metadata: {
      document_id: doc.id, order_id: doc.order_id, letter_id: letterId,
      placement: built.placement.mode, placement_reason: built.placement.reason,
      pages_before: built.pageCountBefore, pages_after: built.pageCountAfter,
      original_sha256: originalSha, destination: destPath, silent: true,
    },
  });

  return json({
    ok: true, documentId, letterId,
    qrFileUrl: signed.signedUrl,
    placement: built.placement,
    metrics: built.metrics,
    pageCountBefore: built.pageCountBefore,
    pageCountAfter: built.pageCountAfter,
    originalSha256: originalSha,
  });
});
