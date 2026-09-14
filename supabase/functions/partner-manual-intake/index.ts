// partner-manual-intake
//
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Admin-only manual intake of a partner's PAID-ORDER PDF into a canonical
// PawTenant partner order. Until a partner completes its API integration, an
// admin uploads the PDF the partner sent; this function validates and stores
// it privately, extracts what it can, and holds a DRAFT for human review.
// Nothing here ever creates an order on its own: commit is an explicit admin
// action on a reviewed draft, and it runs the SAME acceptance path as the API
// (validateOrderRequest → public.partner_accept_order), so API-created and
// manually created partner orders converge on one model.
//
// ACTIONS (?action=…, POST only)
//   upload      multipart {partner_id, file}   → draft + inline text extraction
//   ocr_text    {draft_id, pages[], engine}    → OCR text produced in the admin's
//                                                browser for image-only pages
//   reparse     {draft_id}                     → re-run extraction on stored text
//   review      {draft_id, review, expected_review_version}
//   commit      {draft_id}                     → canonical order (idempotent)
//   cancel      {draft_id, reason}
//   source_url  {draft_id}                     → short-lived signed URL (300 s)
//
// SECURITY MODEL
//   1. Caller must present a USER JWT (never the anon or service key).
//   2. The caller's own JWT must satisfy public.is_chat_admin() — the same
//      capability gate every partner-economics surface uses.
//   3. Multipart bodies are DRAINED before any early refusal (a 403 answered
//      before the body is read stalls behind the gateway and becomes a 504).
//   4. The PDF is validated by CONTENT (signature, trailer, parse, encryption,
//      page count, active-content scan) before it is stored, then stored in the
//      PRIVATE partner-intake bucket under a generated path. No public URL.
//   5. Extracted page text lives in the deny-all private schema. This function
//      never logs page text, answers, names, emails, phones or addresses.
//   6. Duplicates are refused: same partner + same PDF sha256, same partner +
//      same external order id (drafts AND orders). Different partners never
//      collide with each other.
//   7. Commit is idempotent: an atomic claim (reviewed → committing) means two
//      admins cannot both accept; a retry after a crash resolves through the
//      idempotency ledger (idempotency key = manual:<draft id>) and returns the
//      original order; a failure releases the claim so the draft stays
//      recoverable.
//   8. The wholesale rate is selected and frozen SERVER-SIDE inside
//      partner_accept_order(); no amount is ever accepted from the client.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy, extractText } from "npm:unpdf@0.12.1";
import { PSD_TARGET_ASSESSMENT_VERSION, canonicalPayloadHash, type PartnerIdentity } from "../_shared/partnerApi.ts";
import { validateOrderRequest } from "../partner-orders-v1/validate.ts";
import { validatePdfBytes } from "../_shared/pdfSafety.ts";
import {
  EXTRACTION_ENGINE, EXTRACTION_VERSION, extractIntake,
  type ExtractionResult, type PageText,
} from "./extract.ts";
import { MIN_TEXT_CHARS_PER_PAGE, buildPayload, mergePages, s, type ReviewPayload } from "./payload.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const BUCKET = "partner-intake";
const HARD_MAX_BYTES = 15 * 1024 * 1024; // bucket limit
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_BYTES = Math.min(HARD_MAX_BYTES, Number(Deno.env.get("PARTNER_INTAKE_MAX_BYTES") ?? DEFAULT_MAX_BYTES) || DEFAULT_MAX_BYTES);
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_OCR_CHARS_PER_PAGE = 200_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, code, error, ...extra });

/** Consume (without buffering) whatever body the client is still sending. */
async function drain(req: Request): Promise<void> {
  try {
    if (!req.body) return;
    const reader = req.body.getReader();
    // deno-lint-ignore no-empty
    while (!(await reader.read()).done) {}
  } catch { /* the client may already have gone */ }
}

function safeFilename(raw: string, fallback: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 160);
  return cleaned || fallback;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Types ────────────────────────────────────────────────────────────────────

interface Actor { id: string; email: string | null }

interface DraftRow {
  id: string;
  partner_id: string;
  status: string;
  original_filename: string;
  file_size_bytes: number;
  file_sha256: string;
  page_count: number | null;
  storage_bucket: string;
  storage_path: string;
  extraction_method: string | null;
  extraction_attempts: number;
  extracted_fields: Record<string, unknown>;
  extracted_pets: unknown[];
  extracted_qa: unknown[];
  reviewed_fields: ReviewPayload | null;
  review_issues: unknown[];
  review_version: number;
  external_order_id: string | null;
  service: string | null;
  committed_order_id: string | null;
  committed_at: string | null;
}

interface ReviewIssue { code: string; field?: string; messages?: string[]; blocking: boolean }

const DRAFT_COLUMNS =
  "id, partner_id, status, original_filename, file_size_bytes, file_sha256, page_count, storage_bucket, storage_path, " +
  "extraction_method, extraction_attempts, extracted_fields, extracted_pets, extracted_qa, reviewed_fields, review_issues, " +
  "review_version, external_order_id, service, committed_order_id, committed_at";

/** What the browser receives. Storage internals stay server-side. */
function projectDraft(d: Record<string, unknown>): Record<string, unknown> {
  const { storage_path: _p, storage_bucket: _b, ...rest } = d;
  return rest;
}

// ── Clients ──────────────────────────────────────────────────────────────────

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false }, db: { schema: "public" } });
}

async function audit(
  admin: SupabaseClient, actor: Actor, action: string,
  draft: { id: string; partner_id: string }, orderId: string | null, metadata: Record<string, unknown> = {},
): Promise<void> {
  await admin.rpc("partner_intake_audit", {
    p_actor_id: actor.id, p_actor_email: actor.email, p_action: action,
    p_draft_id: draft.id, p_partner_id: draft.partner_id, p_order_id: orderId, p_metadata: metadata,
  }).then(() => {}, () => {});
}

// ── Extraction over stored page text ────────────────────────────────────────

// The private schema is not reachable through PostgREST: page text is stored
// and read ONLY through service-role RPCs (partner_intake_*_page_text).
async function storedPages(admin: SupabaseClient, draftId: string): Promise<{ text: PageText[]; ocr: PageText[] }> {
  const { data } = await admin.rpc("partner_intake_read_page_text", { p_draft_id: draftId });
  const rows = (Array.isArray(data) ? data : []) as Array<{ page_no: number; method: string; text: string }>;
  return {
    text: rows.filter((r) => r.method === "text").map((r) => ({ page: r.page_no, text: r.text })),
    ocr: rows.filter((r) => r.method === "ocr").map((r) => ({ page: r.page_no, text: r.text })),
  };
}

async function storePages(admin: SupabaseClient, draftId: string, method: "text" | "ocr", engine: string, pages: PageText[]): Promise<boolean> {
  const { error } = await admin.rpc("partner_intake_store_page_text", {
    p_draft_id: draftId, p_method: method, p_engine: engine, p_pages: pages.map((p) => ({ page: p.page, text: p.text })),
  });
  return !error;
}

async function runExtraction(
  admin: SupabaseClient, actor: Actor, draft: DraftRow,
): Promise<{ status: string; result: ExtractionResult | null; method: string | null }> {
  const { text, ocr } = await storedPages(admin, draft.id);
  const { pages, method } = mergePages(text, ocr, draft.page_count ?? 1);
  const usable = pages.filter((p) => p.text.trim().length >= MIN_TEXT_CHARS_PER_PAGE);

  await admin.from("partner_intake_drafts").update({
    status: "extraction_pending", extraction_started_at: new Date().toISOString(),
    extraction_attempts: draft.extraction_attempts + 1,
    extraction_engine: EXTRACTION_ENGINE, extraction_version: EXTRACTION_VERSION,
  }).eq("id", draft.id);
  await audit(admin, actor, "partner_intake_extraction_started", draft, null, { attempt: draft.extraction_attempts + 1, method });

  if (usable.length === 0) {
    // Image-only (or empty) document: hand off to the browser OCR fallback.
    await admin.from("partner_intake_drafts").update({
      status: "ocr_required", extraction_method: method, extraction_error_code: "no_text_layer",
      extraction_completed_at: new Date().toISOString(),
    }).eq("id", draft.id);
    await audit(admin, actor, "partner_intake_extraction_completed", draft, null, { outcome: "ocr_required", pages: draft.page_count });
    return { status: "ocr_required", result: null, method };
  }

  let result: ExtractionResult;
  try {
    result = extractIntake(pages);
  } catch {
    await admin.from("partner_intake_drafts").update({
      status: "extraction_failed", extraction_method: method, extraction_error_code: "parser_error",
      extraction_completed_at: new Date().toISOString(),
    }).eq("id", draft.id);
    await audit(admin, actor, "partner_intake_extraction_failed", draft, null, { code: "parser_error" });
    return { status: "extraction_failed", result: null, method };
  }

  const warnings = [...result.warnings];
  if (usable.length < (draft.page_count ?? 1)) warnings.push("partial_text_layer");
  // A colliding external id is REPORTED, never written: the partial unique
  // index would otherwise refuse the whole extraction update.
  let external = result.fields.external_order_id.value;
  if (external && (await externalIdConflict(admin, draft.partner_id, external, draft.id))) {
    warnings.push("duplicate_external_order_id");
    result.fields.external_order_id.warnings.push("duplicate_external_order_id");
    external = null;
  }

  await admin.from("partner_intake_drafts").update({
    status: "review_required", extraction_method: method, extraction_error_code: null,
    extraction_completed_at: new Date().toISOString(),
    extracted_fields: { ...result.fields, _warnings: warnings, _char_count: result.charCount },
    extracted_pets: result.pets, extracted_qa: result.qa,
    external_order_id: external, service: result.fields.service.value,
  }).eq("id", draft.id);
  await audit(admin, actor, "partner_intake_extraction_completed", draft, null, {
    outcome: "review_required", method, qa_count: result.qa.length, pet_count: result.pets.length,
    warnings, fields_found: Object.entries(result.fields).filter(([, v]) => v.value !== null).map(([k]) => k),
  });
  return { status: "review_required", result, method };
}

function isPercentEscaped(v: string): string {
  return v.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** Duplicate external id across this partner's orders and other active drafts. */
async function externalIdConflict(
  admin: SupabaseClient, partnerId: string, external: string, selfDraftId: string,
): Promise<{ kind: "order" | "draft"; id: string; confirmation_id?: string } | null> {
  const { data: order } = await admin.from("orders").select("id, confirmation_id")
    .eq("partner_id", partnerId).eq("partner_order_id", external).maybeSingle();
  if (order?.id) return { kind: "order", id: order.id, confirmation_id: order.confirmation_id };
  const { data: drafts } = await admin.from("partner_intake_drafts").select("id")
    .eq("partner_id", partnerId).neq("status", "cancelled").neq("id", selfDraftId)
    .ilike("external_order_id", isPercentEscaped(external)).limit(1);
  if (drafts && drafts.length) return { kind: "draft", id: drafts[0].id as string };
  return null;
}

async function evaluateReview(
  admin: SupabaseClient, draft: DraftRow, review: ReviewPayload, attestedAt: string,
): Promise<{ issues: ReviewIssue[]; payload: Record<string, unknown> }> {
  const issues: ReviewIssue[] = [];
  const payload = buildPayload(review, draft.id, attestedAt);

  // Manual-intake rules that sit in front of the shared validator.
  const extractedWarnings = ((draft.extracted_fields?._warnings as string[] | undefined) ?? []);
  if (extractedWarnings.includes("service_conflict") && !s(review.service_conflict_resolution)) {
    issues.push({ code: "service_conflict_unresolved", field: "service", blocking: true,
      messages: ["The document contains both ESA and PSD evidence. Confirm the service with the partner and record how it was resolved."] });
  }
  if (!review.service) {
    issues.push({ code: "service_required", field: "service", blocking: true, messages: ["Select ESA or PSD — the system never guesses the service family."] });
  }
  if (review.paid_confirmed !== true) {
    issues.push({ code: "paid_not_confirmed", field: "paid_confirmed", blocking: true, messages: ["Confirm the partner PDF shows the order as paid."] });
  }
  const external = s(review.external_order_id);
  if (external) {
    const dup = await externalIdConflict(admin, draft.partner_id, external, draft.id);
    if (dup) {
      issues.push({ code: "duplicate_external_order_id", field: "external_order_id", blocking: true,
        messages: [dup.kind === "order"
          ? `This partner already has PawTenant order ${dup.confirmation_id ?? ""} for that external order id.`
          : "Another open draft for this partner already carries that external order id."] });
    }
  }

  const identity = { partnerId: draft.partner_id } as PartnerIdentity;
  const v = await validateOrderRequest(payload, identity, admin);
  if (!v.ok) {
    issues.push({ code: v.code, blocking: true, messages: v.details ? Object.entries(v.details).map(([f, m]) => `${f}: ${m.join("; ")}`) : undefined });
  }
  return { issues, payload };
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") { await drain(req); return fail(405, "method_not_allowed", "POST only"); }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) { await drain(req); return fail(500, "not_configured", "Server not configured"); }

  const action = (new URL(req.url).searchParams.get("action") ?? "").trim();

  // 1. Caller must be a real user (never the anon or service key) …
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer === SERVICE_ROLE_KEY || bearer === ANON_KEY) {
    await drain(req);
    return fail(401, "unauthenticated", "Admin sign-in required");
  }
  const admin = serviceClient();
  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp?.user) { await drain(req); return fail(401, "unauthenticated", "Admin sign-in required"); }
  const actor: Actor = { id: userResp.user.id, email: userResp.user.email ?? null };

  // 2. … whose OWN JWT satisfies the canonical partner-economics gate.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc("is_chat_admin");
  if (adminErr || isAdmin !== true) { await drain(req); return fail(403, "forbidden", "Partner Platform admin access required"); }

  // ── PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: legacy PDF intake is RETIRED ──
  // Extraction could not reliably read real partner documents, so the structured
  // New Partner Order form is the only active intake. This boundary is enforced
  // here, not only in the UI: every action that could upload, extract, review,
  // retry, commit or otherwise create work from a PDF is refused with 410.
  // Historical drafts stay readable (admin RLS on partner_intake_drafts) and
  // their source PDFs stay viewable through `source_url`, which is the ONE
  // action left open — it never writes anything.
  const LEGACY_INTAKE_READ_ONLY_ACTIONS = new Set(["source_url"]);
  if (!LEGACY_INTAKE_READ_ONLY_ACTIONS.has(action)) {
    await drain(req);
    return fail(410, "legacy_intake_retired", "Legacy PDF intake has been retired. Create partner orders with the structured New Partner Order form.");
  }

  // ── upload (retired — unreachable; kept for the historical record) ────────
  if (action === "upload") {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 512 * 1024) {
      await drain(req);
      return fail(413, "pdf_too_large", `The PDF must be ${Math.round(MAX_BYTES / (1024 * 1024))} MB or smaller`);
    }
    let form: FormData;
    try { form = await req.formData(); } catch { return fail(400, "bad_request", "Expected multipart/form-data"); }

    const partnerId = (form.get("partner_id") ?? "").toString().trim();
    if (!UUID_RE.test(partnerId)) return fail(400, "bad_request", "partner_id is required");
    const { data: partner } = await admin.from("partner_organizations")
      .select("id, status, intake_mode, display_name").eq("id", partnerId).maybeSingle();
    if (!partner) return fail(404, "partner_not_found", "No such partner");
    if (!["sandbox", "active"].includes(partner.status as string)) return fail(403, "partner_not_active", "This partner is not enabled for intake");
    if (!["manual", "both"].includes(partner.intake_mode as string)) {
      return fail(403, "intake_mode_api_only", "This partner's profile is API-only. Change its intake mode to Manual or Both first.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "bad_request", "A PDF file is required");
    if (file.size > MAX_BYTES) return fail(413, "pdf_too_large", `The PDF must be ${Math.round(MAX_BYTES / (1024 * 1024))} MB or smaller`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = await validatePdfBytes(bytes, { maxBytes: MAX_BYTES, declaredMime: file.type });
    if (!v.ok) {
      const messages: Record<string, string> = {
        pdf_empty: "The file is empty", pdf_too_small: "The file is too small to be a PDF",
        pdf_too_large: "The PDF is too large", pdf_mime: "Only PDF files are accepted",
        pdf_signature: "That file is not a PDF", pdf_truncated: "The PDF looks truncated or corrupt",
        pdf_encrypted: "Encrypted or password-protected PDFs are refused — ask the partner for an unlocked copy",
        pdf_unparsable: "The PDF could not be parsed — it may be corrupt", pdf_no_pages: "The PDF has no pages",
        pdf_active_content: "The PDF contains active or embedded content and was refused",
      };
      return fail(v.code === "pdf_too_large" ? 413 : v.code === "pdf_mime" ? 415 : 422, v.code, messages[v.code] ?? "Invalid PDF");
    }

    // Duplicate PDF for THIS partner (a different partner's identical file is allowed).
    const { data: dupe } = await admin.from("partner_intake_drafts")
      .select("id, status, committed_order_id, original_filename, created_at")
      .eq("partner_id", partnerId).eq("file_sha256", v.sha256).neq("status", "cancelled").maybeSingle();
    if (dupe) {
      await audit(admin, actor, "partner_intake_duplicate_refused", { id: dupe.id as string, partner_id: partnerId }, (dupe.committed_order_id as string) ?? null,
        { reason: "pdf_sha256", attempted_filename: safeFilename(file.name, "upload.pdf") });
      return fail(409, "duplicate_pdf", "This exact PDF was already uploaded for this partner.", {
        existing: { draft_id: dupe.id, status: dupe.status, committed_order_id: dupe.committed_order_id, original_filename: dupe.original_filename, created_at: dupe.created_at },
      });
    }

    const draftId = crypto.randomUUID();
    const storagePath = `${partnerId}/${draftId}.pdf`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf", upsert: false, cacheControl: "0",
    });
    if (upErr) return fail(502, "upload_failed", "The PDF could not be stored");

    const { data: inserted, error: insErr } = await admin.from("partner_intake_drafts").insert({
      id: draftId, partner_id: partnerId, status: "uploaded",
      original_filename: safeFilename(file.name, "partner-order.pdf"), mime_type: "application/pdf",
      file_size_bytes: bytes.length, file_sha256: v.sha256, page_count: v.pageCount,
      storage_bucket: BUCKET, storage_path: storagePath,
      uploaded_by: actor.id, uploaded_by_email: actor.email,
    }).select(DRAFT_COLUMNS).single();
    if (insErr || !inserted) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      const code = (insErr as { code?: string } | null)?.code ?? "";
      if (code === "23505") return fail(409, "duplicate_pdf", "This exact PDF was already uploaded for this partner.");
      return fail(500, "draft_failed", "The upload could not be recorded — nothing was kept");
    }
    const draft = inserted as unknown as DraftRow;
    await audit(admin, actor, "partner_intake_pdf_uploaded", draft, null,
      { pages: v.pageCount, bytes: bytes.length, sha256: v.sha256, filename: draft.original_filename });

    // Text-layer extraction, stored per page in the private schema.
    let pageTexts: PageText[] = [];
    let textError: string | null = null;
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: false });
      const arr = Array.isArray(text) ? text : [String(text ?? "")];
      pageTexts = arr.map((t, i) => ({ page: i + 1, text: String(t ?? "") }));
    } catch {
      textError = "text_layer_error";
    }
    if (pageTexts.length && !(await storePages(admin, draftId, "text", "unpdf", pageTexts))) {
      textError = "page_text_store_failed";
    }
    if (textError) {
      await admin.from("partner_intake_drafts").update({ status: "ocr_required", extraction_error_code: textError, extraction_attempts: 1 }).eq("id", draftId);
      await audit(admin, actor, "partner_intake_extraction_failed", draft, null, { code: textError, fallback: "ocr_required" });
      const { data: row } = await admin.from("partner_intake_drafts").select(DRAFT_COLUMNS).eq("id", draftId).single();
      return json(200, { ok: true, draft: projectDraft(row as Record<string, unknown>) });
    }
    const outcome = await runExtraction(admin, actor, draft);
    const { data: row } = await admin.from("partner_intake_drafts").select(DRAFT_COLUMNS).eq("id", draftId).single();
    return json(200, { ok: true, draft: projectDraft(row as Record<string, unknown>), extraction: outcome.status });
  }

  // ── JSON actions ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4 * 1024 * 1024) return fail(413, "payload_too_large", "Request too large");
    body = raw ? JSON.parse(raw) : {};
  } catch { return fail(400, "malformed_json", "Request body is not valid JSON"); }

  const draftId = typeof body.draft_id === "string" ? body.draft_id.trim() : "";
  if (!UUID_RE.test(draftId)) return fail(400, "bad_request", "draft_id is required");
  const { data: draftRow } = await admin.from("partner_intake_drafts").select(DRAFT_COLUMNS).eq("id", draftId).maybeSingle();
  if (!draftRow) return fail(404, "not_found", "No such draft");
  const draft = draftRow as unknown as DraftRow;
  const reload = async () => {
    const { data } = await admin.from("partner_intake_drafts").select(DRAFT_COLUMNS).eq("id", draftId).single();
    return projectDraft(data as Record<string, unknown>);
  };

  switch (action) {
    case "source_url": {
      const { data, error } = await admin.storage.from(draft.storage_bucket).createSignedUrl(draft.storage_path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return fail(404, "source_unavailable", "The source PDF is no longer available");
      await audit(admin, actor, "partner_intake_source_viewed", draft, draft.committed_order_id, { ttl_seconds: SIGNED_URL_TTL_SECONDS });
      return json(200, { ok: true, signedUrl: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
    }

    case "ocr_text": {
      if (["committed", "committing", "cancelled"].includes(draft.status)) return fail(409, "draft_locked", "This draft can no longer be changed");
      const pagesRaw = Array.isArray(body.pages) ? body.pages : [];
      const engine = typeof body.engine === "string" ? body.engine.slice(0, 80) : "browser-ocr";
      const pages: PageText[] = [];
      for (const p of pagesRaw as Array<Record<string, unknown>>) {
        const no = Number(p?.page);
        const text = typeof p?.text === "string" ? p.text : "";
        if (!Number.isInteger(no) || no < 1 || (draft.page_count && no > draft.page_count)) return fail(422, "bad_page", "A page number is out of range");
        if (text.length > MAX_OCR_CHARS_PER_PAGE) return fail(413, "page_too_large", "OCR text for a page is too large");
        pages.push({ page: no, text });
      }
      if (!pages.length) return fail(422, "no_pages", "No OCR pages supplied");
      if (!(await storePages(admin, draftId, "ocr", engine, pages))) return fail(500, "store_failed", "OCR text could not be stored");
      await audit(admin, actor, "partner_intake_ocr_received", draft, null, { pages: pages.map((p) => p.page), engine, chars: pages.reduce((n, p) => n + p.text.length, 0) });
      const outcome = await runExtraction(admin, actor, draft);
      return json(200, { ok: true, draft: await reload(), extraction: outcome.status });
    }

    case "reparse": {
      if (["committed", "committing", "cancelled"].includes(draft.status)) return fail(409, "draft_locked", "This draft can no longer be changed");
      const outcome = await runExtraction(admin, actor, draft);
      return json(200, { ok: true, draft: await reload(), extraction: outcome.status });
    }

    case "review": {
      if (["committed", "committing", "cancelled"].includes(draft.status)) return fail(409, "draft_locked", "This draft can no longer be changed");
      if (!["review_required", "reviewed", "ocr_required", "extraction_failed"].includes(draft.status)) {
        return fail(409, "not_reviewable", "Extraction has not finished for this draft");
      }
      const expected = Number(body.expected_review_version);
      if (Number.isInteger(expected) && expected !== draft.review_version) {
        return fail(409, "stale_review", "Another admin saved this draft first — reload before saving again", { draft: await reload() });
      }
      const review = (body.review && typeof body.review === "object" && !Array.isArray(body.review)) ? body.review as ReviewPayload : null;
      if (!review) return fail(400, "bad_request", "review is required");
      if (JSON.stringify(review).length > 512 * 1024) return fail(413, "payload_too_large", "Review is too large");

      const attestedAt = new Date().toISOString();
      const { issues } = await evaluateReview(admin, draft, review, attestedAt);
      const blocking = issues.some((i) => i.blocking);
      const previous = draft.reviewed_fields ?? {};
      const changed = Object.keys({ ...previous, ...review }).filter((k) => JSON.stringify((previous as Record<string, unknown>)[k]) !== JSON.stringify((review as Record<string, unknown>)[k]));

      const { error: updErr } = await admin.from("partner_intake_drafts").update({
        reviewed_fields: review, review_issues: issues, review_version: draft.review_version + 1,
        reviewed_by: actor.id, reviewed_at: attestedAt,
        external_order_id: issues.some((i) => i.code === "duplicate_external_order_id") ? null : (s(review.external_order_id) ?? null),
        service: review.service === "psd" || review.service === "esa" ? review.service : null,
        status: blocking ? "review_required" : "reviewed",
      }).eq("id", draftId).eq("review_version", draft.review_version);
      if (updErr) {
        const code = (updErr as { code?: string }).code ?? "";
        if (code === "23505") return fail(409, "duplicate_external_order_id", "Another open draft for this partner already carries that external order id");
        return fail(500, "save_failed", "The review could not be saved");
      }
      await audit(admin, actor, "partner_intake_admin_corrected", draft, null,
        { changed_fields: changed, blocking_issues: issues.filter((i) => i.blocking).map((i) => i.code), review_version: draft.review_version + 1 });
      return json(200, { ok: true, draft: await reload(), issues, ready: !blocking });
    }

    case "cancel": {
      if (draft.status === "committed") return fail(409, "draft_locked", "A committed draft cannot be cancelled");
      if (draft.status === "cancelled") return json(200, { ok: true, draft: await reload() });
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const { error } = await admin.from("partner_intake_drafts").update({
        status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: actor.id, cancel_reason: reason || null,
      }).eq("id", draftId).neq("status", "committed");
      if (error) return fail(500, "cancel_failed", "The draft could not be cancelled");
      // The private artifact and its text are removed; the draft row keeps the audit trail.
      await admin.storage.from(draft.storage_bucket).remove([draft.storage_path]);
      await admin.rpc("partner_intake_purge_page_text", { p_draft_id: draftId });
      await audit(admin, actor, "partner_intake_draft_cancelled", draft, null, { had_status: draft.status, reason_given: Boolean(reason) });
      return json(200, { ok: true, draft: await reload() });
    }

    case "commit": {
      // Idempotent replay: already committed → the original result.
      if (draft.status === "committed" && draft.committed_order_id) {
        const { data: o } = await admin.from("orders").select("id, confirmation_id").eq("id", draft.committed_order_id).maybeSingle();
        return json(200, { ok: true, replayed: true, order_id: draft.committed_order_id, confirmation_id: o?.confirmation_id ?? null, draft: await reload() });
      }
      if (draft.status === "cancelled") return fail(409, "draft_locked", "This draft was cancelled");
      if (draft.status === "committing") return fail(409, "commit_in_progress", "Another admin is committing this draft right now");
      if (draft.status !== "reviewed" || !draft.reviewed_fields) return fail(409, "not_reviewed", "Review and save the draft before creating the order");

      // ATOMIC CLAIM: exactly one caller can move reviewed → committing.
      const { data: claimed } = await admin.from("partner_intake_drafts")
        .update({ status: "committing", commit_claimed_at: new Date().toISOString(), commit_error_code: null })
        .eq("id", draftId).eq("status", "reviewed").eq("review_version", draft.review_version)
        .select("id");
      if (!claimed || claimed.length !== 1) return fail(409, "commit_in_progress", "Another admin is committing this draft right now");
      await audit(admin, actor, "partner_intake_draft_confirmed", draft, null, { review_version: draft.review_version });

      const release = async (code: string) => {
        await admin.from("partner_intake_drafts").update({ status: "reviewed", commit_error_code: code }).eq("id", draftId).eq("status", "committing");
        await audit(admin, actor, "partner_intake_commit_failed", draft, null, { code });
      };

      // Recovery: our own idempotency key already produced an order (a crash
      // between acceptance and the draft update) → finalise without a 2nd order.
      const idempotencyKey = `manual:${draftId}`;
      const { data: prior } = await admin.rpc("partner_lookup_idempotency", { p_partner_id: draft.partner_id, p_idempotency_key: idempotencyKey });
      const priorRow = Array.isArray(prior) ? prior[0] : prior;
      if (priorRow?.order_id) {
        await admin.from("partner_intake_drafts").update({
          status: "committed", committed_order_id: priorRow.order_id, committed_at: new Date().toISOString(), committed_by: actor.id,
        }).eq("id", draftId);
        const { data: o } = await admin.from("orders").select("confirmation_id").eq("id", priorRow.order_id).maybeSingle();
        await audit(admin, actor, "partner_intake_order_created", draft, priorRow.order_id, { replayed: true, confirmation_id: o?.confirmation_id ?? null });
        return json(200, { ok: true, replayed: true, order_id: priorRow.order_id, confirmation_id: o?.confirmation_id ?? null, draft: await reload() });
      }

      // Re-validate the frozen review at commit time (fail closed on drift:
      // provider coverage, partner status, catalog changes, duplicates).
      const attestedAt = new Date().toISOString();
      const { issues, payload } = await evaluateReview(admin, draft, draft.reviewed_fields, attestedAt);
      if (issues.some((i) => i.blocking)) {
        await admin.from("partner_intake_drafts").update({ review_issues: issues }).eq("id", draftId);
        await release(issues.find((i) => i.blocking)!.code);
        const dup = issues.find((i) => i.code === "duplicate_external_order_id");
        if (dup) await audit(admin, actor, "partner_intake_duplicate_refused", draft, null, { reason: "external_order_id" });
        return fail(409, dup ? "duplicate_external_order_id" : "review_invalid", dup ? "This external order id already exists for this partner" : "The draft no longer passes validation — review it again", { issues, draft: await reload() });
      }

      const service = payload.service as "esa" | "psd";
      const schemaVersion = (payload.assessment as { schema_version: string }).schema_version;
      const payloadHash = await canonicalPayloadHash(payload);
      const { data, error } = await admin.rpc("partner_accept_order", {
        p_partner_id: draft.partner_id,
        p_payload: payload,
        p_payload_hash: payloadHash,
        p_schema_version: schemaVersion,
        p_idempotency_key: idempotencyKey,
        p_request_id: `manual-${draftId}`,
        p_target_assessment_version: service === "psd" ? PSD_TARGET_ASSESSMENT_VERSION : null,
        p_intake_method: "manual",
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.order_id) {
        const msg = error?.message ?? "";
        const code = /no_rate_card/.test(msg) ? "no_rate_card" : /partner_not_found/.test(msg) ? "partner_not_found" : "accept_failed";
        await release(code);
        return fail(code === "no_rate_card" ? 409 : 500, code,
          code === "no_rate_card" ? "This partner has no current rate for that service — set a rate in Settings first" : "The order could not be created — the draft was released for retry",
          { draft: await reload() });
      }
      if (row.replayed) {
        // partner_accept_order found an order with this partner_order_id that was
        // NOT ours (our idempotency lookup was empty). Never adopt it silently.
        await release("duplicate_external_order_id");
        await audit(admin, actor, "partner_intake_duplicate_refused", draft, row.order_id, { reason: "external_order_id_replay" });
        return fail(409, "duplicate_external_order_id", "This external order id already exists for this partner", { draft: await reload() });
      }

      const { error: finErr } = await admin.from("partner_intake_drafts").update({
        status: "committed", committed_order_id: row.order_id, committed_at: new Date().toISOString(), committed_by: actor.id,
      }).eq("id", draftId).eq("status", "committing");
      if (finErr) {
        // The order exists; the idempotency ledger will finalise on retry.
        await audit(admin, actor, "partner_intake_commit_failed", draft, row.order_id, { code: "draft_finalise_failed" });
        return json(200, { ok: true, order_id: row.order_id, confirmation_id: row.confirmation_id, finalised: false });
      }
      await audit(admin, actor, "partner_intake_order_created", draft, row.order_id,
        { confirmation_id: row.confirmation_id, service, intake_method: "manual", review_version: draft.review_version });
      await audit(admin, actor, "partner_intake_financial_snapshot_created", draft, row.order_id, { service });
      return json(200, { ok: true, order_id: row.order_id, confirmation_id: row.confirmation_id, replayed: false, draft: await reload() });
    }

    default:
      return fail(400, "unknown_action", "Unknown action");
  }
});
