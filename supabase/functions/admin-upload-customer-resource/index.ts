// admin-upload-customer-resource — admin-only upload of a NEW VERSION of an
// owner-managed customer resource (the Pet Care Planner by PawTenant), with
// server-side validation of the PDF itself.
// ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001.
//
// Flow
//   1. Resolve the caller (auth.getUser) and require public.is_admin_staff()
//      via the caller's OWN JWT — never doctor_profiles read with the service
//      role, never user_metadata, never a service-role bearer.
//   2. Validate the PDF by CONTENT, not by the browser's MIME string:
//      non-empty, <= 25 MB, `%PDF-` header, `%%EOF` trailer, parses with
//      pdf-lib, not encrypted, >= 1 page, and NO active content (JavaScript,
//      OpenAction, additional actions, Launch, embedded files, rich media,
//      XFA, form submission).
//   3. Optionally validate a thumbnail image by magic bytes (JPEG/PNG/WebP,
//      <= 2 MB).
//   4. Upload to storage under a generated safe path (never the user's file
//      name), then REGISTER the version through
//      admin_customer_resource_register_version() with the caller's JWT so the
//      database records the real uploader and verifies the object exists.
//      If registration fails the uploaded objects are removed again.
//
// Uploading never publishes. Publishing is a separate, explicit admin action
// (admin_customer_resource_publish) and never touches an order.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, PDFDict, PDFName, PDFStream } from "https://esm.sh/pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MIN_PDF_BYTES = 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const PDF_BUCKET = "customer-resources";
const THUMB_BUCKET = "customer-resource-previews";
const RESOURCE_KEYS = new Set(["esa_planner", "psd_planner"]);

/** PDF dictionary KEYS that mean active or embedded content. */
const FORBIDDEN_KEYS = new Set([
  "JavaScript", "JS", "OpenAction", "AA", "Launch", "EmbeddedFiles", "EmbeddedFile",
  "RichMedia", "RichMediaContent", "XFA", "SubmitForm", "ImportData", "GoToR", "Movie", "Sound",
]);
/** Action subtypes (/S values) that mean active content. */
const FORBIDDEN_ACTION_SUBTYPES = new Set([
  "JavaScript", "Launch", "SubmitForm", "ImportData", "GoToR", "RichMediaExecute", "Movie", "Sound", "Rendition",
]);

/** Consume (without buffering) whatever body the client is still sending.
 *  Answering an unauthenticated / unauthorized multipart upload BEFORE the
 *  body is read leaves the connection stalled behind the gateway and turns a
 *  clean 403 into a 504 — observed on TEST with the 6 MB planner. */
async function drain(req: Request): Promise<void> {
  try {
    if (!req.body) return;
    const reader = req.body.getReader();
    // deno-lint-ignore no-empty
    while (!(await reader.read()).done) {}
  } catch { /* the client may already have gone */ }
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeFilename(raw: string, fallback: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 160);
  return cleaned || fallback;
}

function bytesStartWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function findAscii(bytes: Uint8Array, needle: string, from: number, to: number): number {
  const n = needle.split("").map((c) => c.charCodeAt(0));
  const end = Math.min(to, bytes.length) - n.length;
  for (let i = Math.max(0, from); i <= end; i++) {
    let hit = true;
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) { hit = false; break; }
    if (hit) return i;
  }
  return -1;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nameText(n: PDFName): string {
  try { return n.decodeText(); } catch { return n.asString().replace(/^\//, ""); }
}

/** Walk every indirect object and refuse active/embedded content. */
function scanActiveContent(doc: PDFDocument): string[] {
  const findings = new Set<string>();
  const inspectDict = (dict: PDFDict, depth: number) => {
    if (depth > 6) return;
    for (const [key, value] of dict.entries()) {
      const keyName = nameText(key);
      if (FORBIDDEN_KEYS.has(keyName)) findings.add(`/${keyName}`);
      if (keyName === "S" && value instanceof PDFName) {
        const sub = nameText(value);
        if (FORBIDDEN_ACTION_SUBTYPES.has(sub)) findings.add(`/S /${sub}`);
      }
      if (keyName === "Type" && value instanceof PDFName) {
        const t = nameText(value);
        if (t === "EmbeddedFile" || t === "Filespec" || t === "RichMedia") findings.add(`/Type /${t}`);
      }
      // Inline dictionaries (e.g. an /A action dict written directly).
      if (value instanceof PDFDict) inspectDict(value, depth + 1);
    }
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) inspectDict(obj, 0);
    else if (obj instanceof PDFStream) inspectDict(obj.dict, 0);
  }
  return [...findings];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { ok: false, error: "Server not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer === serviceKey || bearer === anonKey) {
    await drain(req);
    return json(401, { ok: false, code: "unauthenticated", error: "Admin sign-in required" });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp?.user) {
    await drain(req);
    return json(401, { ok: false, code: "unauthenticated", error: "Admin sign-in required" });
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: isStaff, error: staffErr } = await asCaller.rpc("is_admin_staff");
  if (staffErr || isStaff !== true) {
    await drain(req);
    return json(403, { ok: false, code: "forbidden", error: "Admin staff only" });
  }

  // Refuse an oversized body BEFORE buffering it: a 26 MB multipart body is
  // enough to exhaust the worker, and the byte check below would only run
  // after req.formData() had already read it all.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_BYTES + MAX_THUMB_BYTES + 1024 * 1024) {
    await drain(req);
    return json(413, { ok: false, code: "pdf_too_large", error: `The PDF must be ${MAX_PDF_BYTES / (1024 * 1024)} MB or smaller` });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, code: "bad_request", error: "Expected multipart/form-data" });
  }

  const resourceKey = (form.get("resourceKey") ?? "").toString().trim();
  if (!RESOURCE_KEYS.has(resourceKey)) return json(400, { ok: false, code: "bad_request", error: "Unknown resource slot" });
  const releaseNotes = (form.get("releaseNotes") ?? "").toString().trim().slice(0, 1000);

  // -- The PDF ---------------------------------------------------------------
  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, code: "bad_request", error: "A PDF file is required" });
  if (file.size === 0) return json(422, { ok: false, code: "pdf_empty", error: "The file is empty" });
  if (file.size < MIN_PDF_BYTES) return json(422, { ok: false, code: "pdf_too_small", error: "The file is too small to be a real planner PDF" });
  if (file.size > MAX_PDF_BYTES) {
    return json(413, { ok: false, code: "pdf_too_large", error: `The PDF must be ${MAX_PDF_BYTES / (1024 * 1024)} MB or smaller` });
  }
  const declared = (file.type || "").toLowerCase();
  if (declared && declared !== "application/pdf" && declared !== "application/octet-stream") {
    return json(415, { ok: false, code: "pdf_mime", error: `Expected a PDF, received ${declared}` });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Header must open the file; trailer must carry %%EOF near the end - a
  // truncated upload fails here before parsing.
  if (findAscii(bytes, "%PDF-", 0, 1024) !== 0) {
    return json(422, { ok: false, code: "pdf_signature", error: "That file is not a PDF (missing %PDF- header)" });
  }
  if (findAscii(bytes, "%%EOF", bytes.length - 4096, bytes.length) === -1) {
    return json(422, { ok: false, code: "pdf_truncated", error: "The PDF looks truncated (no %%EOF trailer)" });
  }

  let pageCount = 0;
  let findings: string[] = [];
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
    if (doc.isEncrypted) return json(422, { ok: false, code: "pdf_encrypted", error: "Encrypted PDFs are not accepted" });
    pageCount = doc.getPageCount();
    if (pageCount < 1) return json(422, { ok: false, code: "pdf_no_pages", error: "The PDF has no pages" });
    findings = scanActiveContent(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) return json(422, { ok: false, code: "pdf_encrypted", error: "Encrypted PDFs are not accepted" });
    return json(422, { ok: false, code: "pdf_unparsable", error: "The PDF could not be parsed - it may be corrupt" });
  }
  if (findings.length) {
    return json(422, {
      ok: false, code: "pdf_active_content",
      error: `The PDF contains active or embedded content (${findings.slice(0, 4).join(", ")}) and was rejected`,
    });
  }

  const sha256 = await sha256Hex(bytes);
  const originalFilename = safeFilename(file.name, "planner.pdf");

  // -- Optional thumbnail ----------------------------------------------------
  const thumb = form.get("thumbnail");
  let thumbBytes: Uint8Array | null = null;
  let thumbExt = "";
  let thumbMime = "";
  if (thumb instanceof File && thumb.size > 0) {
    if (thumb.size > MAX_THUMB_BYTES) return json(413, { ok: false, code: "thumb_too_large", error: "The thumbnail must be 2 MB or smaller" });
    thumbBytes = new Uint8Array(await thumb.arrayBuffer());
    if (bytesStartWith(thumbBytes, [0xff, 0xd8, 0xff])) { thumbExt = "jpg"; thumbMime = "image/jpeg"; }
    else if (bytesStartWith(thumbBytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) { thumbExt = "png"; thumbMime = "image/png"; }
    else if (bytesStartWith(thumbBytes, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(thumbBytes, [0x57, 0x45, 0x42, 0x50], 8)) { thumbExt = "webp"; thumbMime = "image/webp"; }
    else return json(415, { ok: false, code: "thumb_type", error: "The thumbnail must be a JPEG, PNG or WebP image" });
  }

  // -- Generated, safe object paths (never the uploader's file name) ---------
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const sha8 = sha256.slice(0, 8);
  const pdfPath = `${resourceKey}/${stamp}-${sha8}.pdf`;
  const thumbPath = thumbBytes ? `${resourceKey}/${stamp}-${sha8}-thumb.${thumbExt}` : null;

  const { error: upErr } = await admin.storage.from(PDF_BUCKET).upload(pdfPath, bytes, {
    contentType: "application/pdf", upsert: false, cacheControl: "0",
  });
  if (upErr) {
    console.error("[admin-upload-customer-resource] pdf upload failed:", upErr.message);
    return json(502, { ok: false, code: "upload_failed", error: "The PDF could not be stored" });
  }
  if (thumbBytes && thumbPath) {
    const { error: thErr } = await admin.storage.from(THUMB_BUCKET).upload(thumbPath, thumbBytes, {
      contentType: thumbMime, upsert: false, cacheControl: "3600",
    });
    if (thErr) {
      await admin.storage.from(PDF_BUCKET).remove([pdfPath]);
      console.error("[admin-upload-customer-resource] thumbnail upload failed:", thErr.message);
      return json(502, { ok: false, code: "upload_failed", error: "The thumbnail could not be stored" });
    }
  }

  // -- Register with the caller's JWT (real uploader, object verified) -------
  const { data: reg, error: regErr } = await asCaller.rpc("admin_customer_resource_register_version", {
    p_resource_key: resourceKey,
    p_storage_bucket: PDF_BUCKET,
    p_storage_path: pdfPath,
    p_original_filename: originalFilename,
    p_byte_size: bytes.length,
    p_sha256: sha256,
    p_page_count: pageCount,
    p_release_notes: releaseNotes || null,
    p_thumbnail_bucket: thumbPath ? THUMB_BUCKET : null,
    p_thumbnail_path: thumbPath,
  });
  if (regErr) {
    await admin.storage.from(PDF_BUCKET).remove([pdfPath]);
    if (thumbPath) await admin.storage.from(THUMB_BUCKET).remove([thumbPath]);
    console.error("[admin-upload-customer-resource] register failed:", regErr.message);
    const code = (regErr as { code?: string }).code ?? "";
    if (code === "42501") return json(403, { ok: false, code: "forbidden", error: "Admin staff only" });
    return json(500, { ok: false, code: "register_failed", error: "The upload could not be recorded - nothing was kept" });
  }

  return json(200, {
    ok: true,
    version: reg,
    pageCount,
    byteSize: bytes.length,
    sha256,
    originalFilename,
    hasThumbnail: !!thumbPath,
  });
});
