// _shared/pdfSafety.ts
//
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Content-level PDF validation for uploads that will be STORED and later
// opened by staff: signature + trailer checks, structural parse, encryption
// refusal, page count, and an active/embedded-content scan. Mirrors the checks
// proven on admin-upload-customer-resource (ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001),
// extracted here so a second upload surface cannot drift from the first.
//
// Never logs bytes or text. Returns codes, not messages with content.

import { PDFDocument, PDFDict, PDFName, PDFStream } from "https://esm.sh/pdf-lib@1.17.1";

export type PdfRejectCode =
  | "pdf_empty" | "pdf_too_small" | "pdf_too_large" | "pdf_mime" | "pdf_signature"
  | "pdf_truncated" | "pdf_encrypted" | "pdf_unparsable" | "pdf_no_pages" | "pdf_active_content";

export type PdfValidation =
  | { ok: true; pageCount: number; sha256: string }
  | { ok: false; code: PdfRejectCode; detail?: string };

/** PDF dictionary KEYS that mean active or embedded content. */
const FORBIDDEN_KEYS = new Set([
  "JavaScript", "JS", "OpenAction", "AA", "Launch", "EmbeddedFiles", "EmbeddedFile",
  "RichMedia", "RichMediaContent", "XFA", "SubmitForm", "ImportData", "GoToR", "Movie", "Sound",
]);
/** Action subtypes (/S values) that mean active content. */
const FORBIDDEN_ACTION_SUBTYPES = new Set([
  "JavaScript", "Launch", "SubmitForm", "ImportData", "GoToR", "RichMediaExecute", "Movie", "Sound", "Rendition",
]);

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

export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nameText(n: PDFName): string {
  try { return n.decodeText(); } catch { return n.asString().replace(/^\//, ""); }
}

/** Walk every indirect object and refuse active/embedded content. */
export function scanActiveContent(doc: PDFDocument): string[] {
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
      if (value instanceof PDFDict) inspectDict(value, depth + 1);
    }
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) inspectDict(obj, 0);
    else if (obj instanceof PDFStream) inspectDict(obj.dict, 0);
  }
  return [...findings];
}

/** Cheap pre-parse encryption probe: an /Encrypt entry in the trailer region. */
export function looksEncrypted(bytes: Uint8Array): boolean {
  return findAscii(bytes, "/Encrypt", Math.max(0, bytes.length - 65536), bytes.length) !== -1;
}

export async function validatePdfBytes(
  bytes: Uint8Array,
  opts: { maxBytes: number; minBytes?: number; declaredMime?: string | null },
): Promise<PdfValidation> {
  const minBytes = opts.minBytes ?? 256;
  if (bytes.length === 0) return { ok: false, code: "pdf_empty" };
  if (bytes.length < minBytes) return { ok: false, code: "pdf_too_small" };
  if (bytes.length > opts.maxBytes) return { ok: false, code: "pdf_too_large" };
  const declared = (opts.declaredMime ?? "").toLowerCase();
  if (declared && declared !== "application/pdf" && declared !== "application/octet-stream") {
    return { ok: false, code: "pdf_mime", detail: declared.slice(0, 64) };
  }
  if (findAscii(bytes, "%PDF-", 0, 1024) !== 0) return { ok: false, code: "pdf_signature" };
  if (findAscii(bytes, "%%EOF", bytes.length - 4096, bytes.length) === -1) return { ok: false, code: "pdf_truncated" };
  if (looksEncrypted(bytes)) return { ok: false, code: "pdf_encrypted" };

  let pageCount = 0;
  let findings: string[] = [];
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
    if (doc.isEncrypted) return { ok: false, code: "pdf_encrypted" };
    pageCount = doc.getPageCount();
    if (pageCount < 1) return { ok: false, code: "pdf_no_pages" };
    findings = scanActiveContent(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) return { ok: false, code: "pdf_encrypted" };
    return { ok: false, code: "pdf_unparsable" };
  }
  if (findings.length) return { ok: false, code: "pdf_active_content", detail: findings.slice(0, 4).join(", ") };
  return { ok: true, pageCount, sha256: await sha256HexBytes(bytes) };
}
