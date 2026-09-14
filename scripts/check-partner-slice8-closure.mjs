#!/usr/bin/env node
/**
 * check-partner-slice8-closure.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8.
 *
 * THE INVARIANTS (numbered R1–R15, mirroring the slice brief)
 *   R1  Partner documents cannot cross organization boundaries.
 *   R2  Only the approved partner-safe RELEASE can ever be signed — never a
 *       provider upload, never an internal derivative.
 *   R3  No permanent public document URL exists (short TTL, private buckets,
 *       no getPublicUrl anywhere in the partner surface).
 *   R4  Webhooks are HMAC-signed and replay-safe (timestamp in the base).
 *   R5  Webhook payloads carry no PHI, clinical content, provider identity or
 *       internal economics.
 *   R6  A successful delivery can never be repeated (DB-unique + frozen row).
 *   R7  Manual retry re-drives the EXISTING delivery — it cannot create a
 *       second logical event.
 *   R8  Accepted snapshots are immutable — the revision RPC inserts, never
 *       updates.
 *   R9  Revisions are complete linked immutable versions (prior_snapshot_id,
 *       (order, revision) unique, fail-closed states).
 *   R10 Partial / forged revisions fail closed (same validator as intake).
 *   R11 Issued invoice PDFs render from frozen lines — never a rate card.
 *   R12 Invoice PDFs carry no customer identity / PHI / provider economics.
 *   R13 Provider disclosure is operational; partner customer comms stay dead.
 *   R14 QR/verification isolation (Slice 5 boundary) remains intact.
 *   R15 Direct PawTenant behaviour unchanged; every prior partner guard wired.
 *
 * Like the Slice 5–7 guards, this one EXECUTES the real modules (esbuild
 * bundle + stub clients) where the dangerous defect is a wrong branch rather
 * than a missing call, asserts USE not mention (comment-stripped scans, string
 * literals kept), and `--self-test` plants each real defect into the real
 * source and proves the matching check fails.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHmac } from "node:crypto";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F_DOC = "supabase/functions/partner-orders-v1/document.ts";
const F_REV = "supabase/functions/partner-orders-v1/revise.ts";
const F_VAL = "supabase/functions/partner-orders-v1/validate.ts";
const F_IDX = "supabase/functions/partner-orders-v1/index.ts";
const F_DISPATCH = "supabase/functions/partner-webhook-dispatch/index.ts";
const F_PDF = "supabase/functions/partner-invoice-pdf/index.ts";
const F_ASSIGN = "supabase/functions/assign-doctor/index.ts";
const F_GATE = "supabase/functions/_shared/partnerDocumentGate.ts";
const F_PORTAL = "src/pages/provider-portal/page.tsx";
const M_REL = "supabase/migrations/20260821140000_partner_document_releases.sql";
const M_WH = "supabase/migrations/20260821150000_partner_status_webhooks.sql";
const M_REV = "supabase/migrations/20260821160000_partner_assessment_revisions.sql";
const M_INV = "supabase/migrations/20260821170000_partner_invoice_documents.sql";
const PKG = "package.json";

/** THE single read point — CRLF normalised here and nowhere else. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** Strip COMMENTS ONLY; string literals are kept (they ARE the code). */
function stripComments(src, sql = false) {
  let out = "";
  let i = 0;
  let mode = "code"; // code | line | block | s1 | s2 | tpl
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (!sql && c === "/" && n === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (!sql && c === "/" && n === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (sql && c === "-" && n === "-") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "'") { mode = "s1"; out += c; i++; continue; }
      if (c === '"') { mode = "s2"; out += c; i++; continue; }
      if (!sql && c === "`") { mode = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } else out += " "; i++; continue; }
    if (mode === "block") {
      if (c === "*" && n === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // strings/templates: kept verbatim (escapes included)
    if (c === "\\" && !sql) { out += c + (n ?? ""); i += 2; continue; }
    if ((mode === "s1" && c === "'") || (mode === "s2" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i++; continue;
  }
  return out;
}

/** Extract one SQL function body from a migration (between its header and the
 *  closing dollar-quote), so token scans stay scoped to the USE. */
function sqlFunctionBody(migrationSrc, fnName) {
  const start = migrationSrc.indexOf(`function public.${fnName}(`);
  if (start < 0) return null;
  const open = migrationSrc.indexOf("$function$", start);
  if (open < 0) return null;
  const close = migrationSrc.indexOf("$function$", open + 10);
  if (close < 0) return null;
  return migrationSrc.slice(open + 10, close);
}

// ── esbuild loader with URL-import stubs + Deno shim ────────────────────────
const httpStub = {
  name: "http-stub",
  setup(build) {
    build.onResolve({ filter: /^https?:\/\// }, (args) => ({ path: args.path, namespace: "http-stub" }));
    build.onResolve({ filter: /^jsr:/ }, (args) => ({ path: args.path, namespace: "http-stub" }));
    build.onLoad({ filter: /.*/, namespace: "http-stub" }, (args) => {
      if (args.path.includes("supabase-js")) {
        return { contents: "export const createClient = () => { throw new Error('stub createClient'); };", loader: "js" };
      }
      if (args.path.includes("pdf-lib")) {
        return {
          contents: "export const PDFDocument = { create: async () => { throw new Error('stub pdf'); } };" +
            "export const StandardFonts = { Helvetica: 'H', HelveticaBold: 'HB' }; export const rgb = () => ({});",
          loader: "js",
        };
      }
      return { contents: "export default {};", loader: "js" };
    });
  },
};

async function loadModule(rel) {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, rel)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    plugins: [httpStub],
    banner: { js: "globalThis.Deno = globalThis.Deno ?? { env: { get: () => '' }, serve: () => {} };" },
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

// ── Filtering stub client (tables + storage, with recorders) ────────────────
function makeStub(db, opts = {}) {
  const record = { uploads: [], signed: [], removed: [], downloads: [], inserts: [] };
  const applyFilters = (rows, filters) =>
    rows.filter((r) => filters.every((f) => {
      if (f.op === "eq") return r[f.col] === f.val;
      if (f.op === "is") return r[f.col] === f.val;
      if (f.op === "in") return f.val.includes(r[f.col]);
      return true;
    }));
  const from = (table) => {
    const filters = [];
    let insertedRow = null;
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters.push({ op: "eq", col, val }); return chain; },
      is: (col, val) => { filters.push({ op: "is", col, val }); return chain; },
      in: (col, val) => { filters.push({ op: "in", col, val }); return chain; },
      order: () => chain,
      limit: () => chain,
      insert: (row) => {
        insertedRow = row;
        return chain;
      },
      maybeSingle: async () => {
        if (insertedRow) {
          const rows = db[table] ?? (db[table] = []);
          if (table === "partner_document_releases"
              && rows.some((r) => r.source_document_id === insertedRow.source_document_id)) {
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
          rows.push(insertedRow);
          record.inserts.push({ table, row: insertedRow });
          return { data: insertedRow, error: null };
        }
        const rows = applyFilters(db[table] ?? [], filters);
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve) => resolve({ data: applyFilters(db[table] ?? [], filters), error: null }),
    };
    return chain;
  };
  const storage = {
    from: (bucket) => ({
      download: async (path) => {
        record.downloads.push({ bucket, path });
        const bytes = opts.storageBytes ?? new TextEncoder().encode("%PDF-stub-bytes");
        return { data: new Blob([bytes]), error: null };
      },
      upload: async (path, _bytes, _o) => { record.uploads.push({ bucket, path }); return { data: {}, error: null }; },
      remove: async (paths) => { record.removed.push({ bucket, paths }); return { data: {}, error: null }; },
      createSignedUrl: async (path, ttl, options) => {
        record.signed.push({ bucket, path, ttl, options });
        return { data: { signedUrl: `https://stub.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=x` }, error: null };
      },
    }),
  };
  return { client: { from, storage, rpc: async () => ({ data: null, error: null }) }, record, db };
}

const IDENTITY = {
  partnerId: "partner-A", partnerSlug: "rapid", partnerStatus: "sandbox",
  productionEnabled: false, scopes: ["orders:create", "orders:read", "documents:read"],
  rateLimitPerMinute: 60, maxPayloadBytes: 65536, credentialId: "cred-1", environment: "sandbox",
};
const noopAudit = async () => {};

const results = [];
const add = (name, ok, detail = "") => results.push({ name, ok, detail });

async function runChecks() {
  results.length = 0;

  const doc = stripComments(read(F_DOC));
  const rev = stripComments(read(F_REV));
  const idx = stripComments(read(F_IDX));
  const dispatch = stripComments(read(F_DISPATCH));
  const pdf = stripComments(read(F_PDF));
  const assign = stripComments(read(F_ASSIGN));
  const gate = stripComments(read(F_GATE));
  const portal = stripComments(read(F_PORTAL));
  const mRel = stripComments(read(M_REL), true);
  const mWh = stripComments(read(M_WH), true);
  const mRev = stripComments(read(M_REV), true);
  const mInv = stripComments(read(M_INV), true);
  const pkg = JSON.parse(read(PKG));

  // ── R1 — tenant isolation, executed against the real handler ─────────────
  const docMod = await loadModule(F_DOC);
  {
    const { client } = makeStub({
      orders: [{ id: "ord-B", partner_id: "partner-B", partner_order_id: "REF-9", confirmation_id: "PT-B", letter_type: "psd" }],
      order_documents: [], partner_document_releases: [],
    });
    const res = await docMod.handleDocumentRetrieval(client, IDENTITY, "REF-9", "req-1", noopAudit);
    add("R1a cross-partner reference is indistinguishable from nonexistent (404)",
      res.status === 404, `status=${res.status}`);
  }
  add("R1b partner predicate is part of the order lookup",
    doc.includes('.eq("partner_id", identity.partnerId)'));

  // ── R2 / R3 — release-only signing, executed ─────────────────────────────
  const APPROVED_DOC = {
    id: "doc-1", order_id: "ord-A", doc_type: "psd_letter",
    file_url: "https://stub.supabase.co/storage/v1/object/sign/provider-letters/PT-A/provider/letter.pdf?token=t",
    file_path: "PT-A/provider/letter.pdf", processed_file_url: null, footer_injected: false,
    qr_file_url: null, mime_type: "application/pdf", review_status: "approved",
    customer_visible: true, superseded_by_document_id: null, approved_at: "2026-08-20T00:00:00Z",
  };
  const ORDER_A = { id: "ord-A", partner_id: "partner-A", partner_order_id: "REF-1", confirmation_id: "PT-A1", letter_type: "psd", partner_document_policy: "partner_neutral" };
  {
    const { client } = makeStub({ orders: [ORDER_A], order_documents: [], partner_document_releases: [] });
    const res = await docMod.handleDocumentRetrieval(client, IDENTITY, "REF-1", "req-2", noopAudit);
    add("R2a unapproved order refuses with document_not_ready (409)",
      res.status === 409, `status=${res.status}`);
  }
  {
    const { client, record, db } = makeStub({ orders: [ORDER_A], order_documents: [APPROVED_DOC], partner_document_releases: [] });
    const res = await docMod.handleDocumentRetrieval(client, IDENTITY, "REF-1", "req-3", noopAudit);
    const body = res.status === 200 ? JSON.parse(await res.text()) : null;
    add("R2b approved order releases (200)", res.status === 200, `status=${res.status}`);
    add("R2c the SIGNED object is a partner-documents release, never the provider upload",
      record.signed.length >= 1 && record.signed.every((s) => s.bucket === "partner-documents" && s.path.startsWith("releases/")),
      JSON.stringify(record.signed));
    add("R2d release bytes were COPIED into partner-documents (no cross-bucket signing)",
      record.uploads.length === 1 && record.uploads[0].bucket === "partner-documents",
      JSON.stringify(record.uploads));
    add("R3a signed URL TTL is short (<= 900s)",
      record.signed.every((s) => s.ttl <= 900), JSON.stringify(record.signed.map((s) => s.ttl)));
    add("R3b response carries no internal order id",
      !!body && !JSON.stringify(body).includes("ord-A"), "");
    // idempotent second call: reuses the SAME release, no second upload
    const res2 = await docMod.handleDocumentRetrieval(client, IDENTITY, "REF-1", "req-4", noopAudit);
    add("R2e repeat GET reuses the minted release (idempotent, one artifact)",
      res2.status === 200 && record.uploads.length === 1 && db.partner_document_releases.length === 1,
      `uploads=${record.uploads.length} releases=${db.partner_document_releases.length}`);
  }
  {
    const branded = { ...APPROVED_DOC, id: "doc-2", footer_injected: true, processed_file_url: "https://x/processed.pdf" };
    const { client, record } = makeStub({ orders: [ORDER_A], order_documents: [branded], partner_document_releases: [] });
    const res = await docMod.handleDocumentRetrieval(client, IDENTITY, "REF-1", "req-5", noopAudit);
    add("R2f a verification/QR-bearing artifact on a partner order REFUSES (Slice 5 belt)",
      res.status === 500 && record.signed.length === 0, `status=${res.status} signed=${record.signed.length}`);
  }
  {
    const hostileOrder = { ...ORDER_A, id: "ord-H", partner_order_id: "EVIL/../..\\x", confirmation_id: "PT-H" };
    const hostileDoc = { ...APPROVED_DOC, id: "doc-h", order_id: "ord-H" };
    const { client } = makeStub({ orders: [hostileOrder], order_documents: [hostileDoc], partner_document_releases: [] });
    const res = await docMod.handleDocumentRetrieval(client, IDENTITY, "EVIL/../..\\x", "req-6", noopAudit);
    const body = res.status === 200 ? JSON.parse(await res.text()) : null;
    const fname = body?.document?.filename ?? "";
    add("R1c hostile partner reference cannot escape into the download filename",
      res.status === 200 && /^[A-Za-z0-9._-]+$/.test(fname) && !fname.includes("..") && !fname.includes("/"),
      fname);
  }
  add("R3c no getPublicUrl anywhere on the partner surface",
    [doc, rev, idx, dispatch, pdf].every((s) => !s.includes("getPublicUrl")));
  add("R3d partner-documents and partner-invoices buckets are created PRIVATE",
    mRel.includes("values ('partner-documents', 'partner-documents', false)")
    && mInv.includes("values ('partner-invoices', 'partner-invoices', false)"));
  add("R1d document route requires the documents:read scope",
    idx.includes('hasScope(identity, "documents:read")'));

  // ── R4 — signing, executed against the real dispatcher module ────────────
  const dispatchMod = await loadModule(F_DISPATCH);
  {
    const sig = await dispatchMod.signWebhookBody("sec-1", "1700000000", '{"a":1}');
    const expected = createHmac("sha256", "sec-1").update('1700000000.{"a":1}').digest("hex");
    add("R4a HMAC-SHA256 over timestamp.body — independently recomputed match",
      sig === expected, `${sig.slice(0, 12)} vs ${expected.slice(0, 12)}`);
    add("R4b signature header is attached to every send",
      dispatch.includes('"X-PawTenant-Signature": `v1=${signature}`'));
    add("R4c timestamp header present (replay window verification material)",
      dispatch.includes('"X-PawTenant-Timestamp": timestamp'));
    add("R4d redirects are refused at send time",
      dispatch.includes('redirect: "error"'));
    const cases = [
      ["http://sink.example.com/x", "sandbox", "https://proj.supabase.co", false],
      ["https://localhost/x", "sandbox", "https://proj.supabase.co", false],
      ["https://evil.example.com/x", "sandbox", "https://proj.supabase.co", false],
      ["https://proj.supabase.co/functions/v1/partner-webhook-sandbox-sink", "sandbox", "https://proj.supabase.co", true],
      ["https://partner.example.com/hooks", "production", "https://proj.supabase.co", true],
      ["https://192.168.1.10/hooks", "production", "https://proj.supabase.co", false],
    ];
    const bad = cases.filter(([url, env, own, allowed]) =>
      (dispatchMod.endpointRefusalReason(url, env, own) === null) !== allowed);
    add("R4e endpoint safety: https-only, no private hosts, sandbox pinned to the controlled sink",
      bad.length === 0, JSON.stringify(bad));
  }

  // ── R5 — payload allowlist in the ONE emitter ────────────────────────────
  {
    const emit = sqlFunctionBody(mWh, "partner_emit_webhook_event");
    add("R5a the emitter exists and reads ONLY the partner reference + confirmation",
      !!emit && emit.includes("select o.partner_order_id, o.confirmation_id"));
    const forbidden = /o\.email|first_name|last_name|o\.phone|doctor_email|doctor_user_id|assessment_answers|wholesale|margin/;
    add("R5b emitter body carries no PHI / provider identity / economics",
      !!emit && !forbidden.test(emit), (emit?.match(forbidden) ?? [])[0] ?? "");
    add("R5c order emitters are origin-gated (direct orders mint nothing)",
      (mWh.match(/if new\.order_origin is distinct from 'partner'/g) ?? []).length >= 2);
  }

  // ── R6 / R7 — duplicate-success + retry semantics ────────────────────────
  add("R6a one delivery row per (event, endpoint) — DB unique",
    mWh.includes("constraint partner_webhook_deliveries_unique unique (event_id, endpoint_id)"));
  add("R6b a succeeded delivery row is frozen by trigger",
    mWh.includes("already succeeded and is frozen"));
  add("R6c record_attempt refuses a second success outright",
    sqlFunctionBody(mWh, "partner_webhook_record_attempt")?.includes("already succeeded") ?? false);
  {
    const retry = sqlFunctionBody(mWh, "partner_webhook_retry_delivery");
    add("R7a manual retry cannot create a second logical event (no outbox insert)",
      !!retry && !/insert\s+into/i.test(retry), (retry?.match(/insert\s+into\s+\S+/i) ?? [])[0] ?? "");
    add("R7b manual retry refuses succeeded deliveries",
      !!retry && retry.includes("already succeeded"));
  }
  add("R6d outbox is immutable (append-only trigger present)",
    /create trigger partner_webhook_events_append_only\s/.test(mWh)
    && mWh.includes("the outbox is immutable"));

  // ── R8 / R9 — snapshot immutability + linked versions ────────────────────
  {
    const reviseFn = sqlFunctionBody(mRev, "partner_revise_assessment");
    add("R8a the revision RPC never UPDATEs a snapshot",
      !!reviseFn && !reviseFn.includes("update public.partner_assessment_snapshots"));
    add("R8b the revision migration drops no immutability trigger",
      !/drop\s+trigger/i.test(mRev));
    add("R9a revisions are linked immutable versions (prior_snapshot_id, rev+1, unique)",
      !!reviseFn && reviseFn.includes("v_current.revision + 1")
      && reviseFn.includes("prior_snapshot_id")
      && mRev.includes("on public.partner_assessment_snapshots (order_id, revision)"));
    add("R9b fail-closed states: assigned / completed / cancelled all refuse",
      ["revision_locked_assigned", "revision_locked_completed", "revision_locked_cancelled"]
        .every((t) => reviseFn?.includes(t)));
    add("R9c identical content can never mint a duplicate version",
      !!reviseFn && reviseFn.includes("v_current.source_payload_hash = p_payload_hash"));
  }

  // ── R10 — the ONE contract validator, executed ───────────────────────────
  const valMod = await loadModule(F_VAL);
  {
    const CATALOG = [
      "conditions", "currentTreatment", "dailyImpact", "dogDuration", "dogHelpDescription",
      "dogTasks", "emotionalFrequency", "housingType", "lifeChangeStress", "medication",
      "priorDiagnosis", "safetyCheck", "taskDescription", "taskPublicAccess", "taskReliability", "taskTraining",
    ].map((q) => ({ question_id: q, required: true }));
    const catalogStub = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: CATALOG, error: null }) }) }) };
    const FULL = Object.fromEntries(CATALOG.map((q) =>
      [q.question_id, ["conditions", "dogTasks"].includes(q.question_id) ? ["x"] : "answer"]));

    const okRes = await valMod.validatePsdContractAssessment("partner.assessment.psd.v1", FULL, catalogStub);
    add("R10a complete canonical payload validates", okRes.ok === true, JSON.stringify(okRes));

    const partial = { ...FULL }; delete partial.safetyCheck;
    const partialRes = await valMod.validatePsdContractAssessment("partner.assessment.psd.v1", partial, catalogStub);
    add("R10b partial payload fails closed (assessment_incomplete)",
      partialRes.ok === false && partialRes.code === "assessment_incomplete", JSON.stringify(partialRes));

    const forged = await valMod.validatePsdContractAssessment("partner.assessment.psd.v1", { ...FULL, eligible: "true" }, catalogStub);
    add("R10c forged eligibility claim refused",
      forged.ok === false && forged.code === "schema_violation", JSON.stringify(forged));

    const wrongVer = await valMod.validatePsdContractAssessment("partner.assessment.v1", FULL, catalogStub);
    add("R10d wrong schema version refused",
      wrongVer.ok === false && wrongVer.code === "assessment_schema_unsupported");

    add("R10e intake and revision share the SAME validator (one code path)",
      rev.includes("validatePsdContractAssessment(") && stripComments(read(F_VAL)).includes("await validatePsdContractAssessment(assessmentSchemaVersion, assessmentAnswers, admin)"));
  }

  // ── R11 / R12 — invoice PDF from frozen lines, no identity ───────────────
  const pdfMod = await loadModule(F_PDF);
  {
    add("R11a renderer references no rate card and recomputes nothing",
      !pdf.includes("partner_rate_cards") && !pdf.includes("wholesale"));
    add("R11b renderer's orders projection is id + partner reference ONLY",
      pdf.includes('.select("id, partner_order_id")'));
    add("R11c artifact rows are immutable and unique per (invoice, kind)",
      mInv.includes("constraint partner_invoice_documents_unique unique (invoice_id, kind)")
      && mInv.includes("rendered artifacts are immutable"));

    // Execute assembly + text model against a poisoned backend: a permissive
    // backend row carries customer identity; none of it may reach the model.
    const poisonDb = {
      partner_invoices: [{ id: "inv-1", partner_id: "p-1", invoice_number: "PTINV-2026-0009", status: "issued", currency: "USD", total_cents: 4000, issued_at: "2026-08-20T00:00:00Z", due_at: "2026-09-19T00:00:00Z", voided_at: null, void_reason: null }],
      partner_organizations: [{ id: "p-1", legal_name: "Rapid ESA Letter LLC", display_name: "Rapid" }],
      partner_invoice_lines: [
        { id: "l1", invoice_id: "inv-1", billable_event_id: "be-1", service: "psd", description: "Psd clinical fulfillment - clinical_work_completed", amount_cents: 4500, created_at: "2026-08-20T00:00:00Z" },
        { id: "l2", invoice_id: "inv-1", billable_event_id: "be-2", service: "psd", description: "credit", amount_cents: -500, created_at: "2026-08-20T00:00:01Z" },
      ],
      partner_billable_events: [
        { id: "be-1", order_id: "ord-1" }, { id: "be-2", order_id: "ord-1" },
      ],
      orders: [{ id: "ord-1", partner_order_id: "RPD-77", email: "poison-victim@example.com", first_name: "PoisonName", last_name: "PoisonSurname", phone: "+15550001111" }],
      partner_invoice_payments: [{ invoice_id: "inv-1", amount_cents: 1000, received_at: "2026-08-21T00:00:00Z", method: "manual", reference: "WIRE-1" }],
    };
    const { client } = makeStub(poisonDb);
    const assembled = await pdfMod.assembleInvoiceData(client, "inv-1");
    add("R11d assembly succeeds from frozen snapshot tables", assembled.ok === true, JSON.stringify(assembled));
    if (assembled.ok) {
      const model = pdfMod.buildInvoiceTextModel(assembled.data, "invoice");
      const text = JSON.stringify(model);
      add("R12a poisoned customer identity NEVER reaches the invoice text",
        !/Poison|poison-victim|15550001111/.test(text), (text.match(/Poison[a-zA-Z]*/) ?? [])[0] ?? "");
      add("R11e line amounts come from the frozen lines (45.00 / -5.00 visible)",
        text.includes("$45.00") && text.includes("-$5.00"), "");
      add("R12b partner reference and legal identity ARE present (the invoice is addressed)",
        text.includes("RPD-77") && text.includes("Rapid ESA Letter LLC"));
      add("R12c TEST remittance placeholder + not-a-payment-request footer",
        text.includes("TEST environment placeholder") && text.includes("Not a payment request"));
      const voidModel = pdfMod.buildInvoiceTextModel(
        { ...assembled.data, status: "void", voidedAt: "2026-08-22T00:00:00Z", voidReason: "fixture" }, "void_notice");
      add("R11f void notice is a distinct artifact model (original never rewritten)",
        voidModel.title === "VOID NOTICE" && JSON.stringify(voidModel).includes("released for re-billing"));
    }
    add("R12d renderer authorizes by capability probe, never a service-key comparison",
      pdf.includes('rpc("is_chat_admin")') && !pdf.includes("bearer === SERVICE_ROLE_KEY") && !pdf.includes("bearer === SUPABASE_SERVICE_ROLE_KEY"));
  }

  // ── R13 — provider disclosure operational; partner comms stay dead ───────
  // NOTE: bare "margin" is NOT scanned here — the email HTML is full of CSS
  // margin: properties (the Slice 4 lesson). The commercial tokens that could
  // actually leak are scanned instead.
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the provider is never
  // told a case is a partner case — no disclosure, no "Case Source" row, and
  // still no economics anywhere in the assignment email.
  add("R13a assignment email carries no partner disclosure, no case source and no economics",
    !assign.includes("originLabel")
    && !assign.includes("authorized PawTenant partner")
    && !assign.includes("Case Source")
    && !/wholesale|invoice status|partner_rate|profit margin/i.test(assign));
  add("R13b the Slice 6 customer-contact gate still decides (no re-enable)",
    assign.includes("const customerContactAllowed = !policy.suppressCustomerCommunication;"));
  add("R13c the provider portal carries no partner disclosure and no economics",
    !portal.includes("authorized PawTenant partner")
    && !/Partner Case/.test(portal)
    && !/wholesale|partner_rate_card|partner_invoice|billable_event/i.test(portal));

  // ── R14 — Slice 5 boundary intact ────────────────────────────────────────
  add("R14a partnerDocumentGate still fails closed on an unreadable policy",
    /if \(error \|\| !data\) \{\n    return \{\n      allowed: false,/.test(gate));
  add("R14b partner document handler never signs a processed/QR artifact",
    doc.includes("doc.footer_injected || doc.processed_file_url || doc.qr_file_url"));

  // ── R15 — direct behaviour + guard wiring ────────────────────────────────
  add("R15a the provider portal derives no partner state at all (every case identical)",
    !/isPartnerCase|order_origin|partner_id/.test(portal));
  {
    const build = pkg.scripts?.build ?? "";
    const priorGuards = [
      "check-partner-orders-segregation.mjs", "check-partner-assessment-pdf.mjs",
      "check-partner-document-isolation.mjs", "check-partner-comms-isolation.mjs",
      "check-psd-partner-unmapped-version.mjs", "check-partner-psd-contract-and-finance.mjs",
      "check-partner-slice8-closure.mjs",
    ];
    add("R15b every partner guard (Slices 1–8) is wired into the build",
      priorGuards.every((g) => build.includes(g)),
      priorGuards.filter((g) => !build.includes(g)).join(","));
  }
}

function report(title) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${title}`);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  [${r.detail}]`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  return failed.length;
}

// ── Entry ───────────────────────────────────────────────────────────────────
const SELF = process.argv.includes("--self-test");

if (SELF) {
  const CONTROLS = [
    { name: "cross-partner document access (tenant predicate dropped)", file: F_DOC, expect: "R1a",
      from: '    .eq("partner_id", identity.partnerId)\n',
      to: "" },
    { name: "original provider upload returned to the partner", file: F_DOC, expect: "R2c",
      from: "  const { data: signed, error: signErr } = await admin.storage\n    .from(release.storage_bucket)\n    .createSignedUrl(release.storage_path, PARTNER_DOCUMENT_URL_TTL_SECONDS, { download: filename });",
      to: "  const { data: signed, error: signErr } = await admin.storage\n    .from(\"provider-letters\")\n    .createSignedUrl(doc.file_path ?? release.storage_path, PARTNER_DOCUMENT_URL_TTL_SECONDS, { download: filename });" },
    { name: "permanent document URL (10-year TTL)", file: F_DOC, expect: "R3a",
      from: "export const PARTNER_DOCUMENT_URL_TTL_SECONDS = 300;",
      to: "export const PARTNER_DOCUMENT_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;" },
    { name: "unsigned webhook delivery", file: F_DISPATCH, expect: "R4b",
      from: '          "X-PawTenant-Signature": `v1=${signature}`,\n',
      to: "" },
    { name: "webhook payload gains assessment content", file: M_WH, expect: "R5b",
      from: "  if p_order_id is not null then\n    select o.partner_order_id, o.confirmation_id into v_ref, v_conf\n      from public.orders o where o.id = p_order_id;\n  end if;",
      to: "  if p_order_id is not null then\n    select o.partner_order_id, o.confirmation_id into v_ref, v_conf\n      from public.orders o where o.id = p_order_id;\n    p_data := p_data || (select jsonb_build_object('answers', o.assessment_answers) from public.orders o where o.id = p_order_id);\n  end if;" },
    { name: "duplicate successful delivery becomes possible (unique dropped)", file: M_WH, expect: "R6a",
      from: "  constraint partner_webhook_deliveries_unique unique (event_id, endpoint_id)\n",
      to: "" },
    { name: "manual retry mints a second logical event", file: M_WH, expect: "R7a",
      from: "  update public.partner_webhook_deliveries\n     set status = 'pending', next_attempt_at = now(), claimed_at = null\n   where id = p_delivery_id;\nend;\n$function$;\n\n-- Dispatcher credential",
      to: "  insert into public.partner_webhook_events (id, partner_id, event_type, payload, dedupe_key)\n  select gen_random_uuid(), e.partner_id, e.event_type, e.payload, e.dedupe_key || ':retry'\n    from public.partner_webhook_events e\n    join public.partner_webhook_deliveries d on d.event_id = e.id\n   where d.id = p_delivery_id;\n  update public.partner_webhook_deliveries\n     set status = 'pending', next_attempt_at = now(), claimed_at = null\n   where id = p_delivery_id;\nend;\n$function$;\n\n-- Dispatcher credential" },
    { name: "accepted snapshot overwritten by a revision", file: M_REV, expect: "R8a",
      from: "  insert into public.partner_assessment_snapshots (",
      to: "  update public.partner_assessment_snapshots set revision_reason = p_reason where id = v_current.id;\n  insert into public.partner_assessment_snapshots (" },
    { name: "incomplete revision accepted (required loop removed)", file: F_VAL, expect: "R10b",
      from: "  for (const qid of requiredIds) {\n    if (!(qid in assessmentAnswers)) psdProblems.push(`missing required question: ${qid}`);\n  }\n\n  for (const [qid, value] of Object.entries(assessmentAnswers)) {\n    if (PSD_ARRAY_QUESTIONS.has(qid)) {",
      to: "  for (const [qid, value] of Object.entries(assessmentAnswers)) {\n    if (PSD_ARRAY_QUESTIONS.has(qid)) {" },
    { name: "issued invoice re-priced from the current rate card", file: F_PDF, expect: "R11a",
      from: "  const { data: payRows } = await admin",
      to: "  const { data: rateRows } = await admin.from(\"partner_rate_cards\").select(\"wholesale_unit_price_cents\");\n  const { data: payRows } = await admin" },
    { name: "invoice PDF gains the customer's identity", file: F_PDF, expect: "R12a",
      from: "      const { data: orders } = await admin\n        .from(\"orders\")\n        .select(\"id, partner_order_id\")\n        .in(\"id\", orderIds);\n      for (const o of orders ?? []) orderRef.set(o.id as string, (o.partner_order_id as string) ?? \"\");",
      to: "      const { data: orders } = await admin\n        .from(\"orders\")\n        .select(\"id, partner_order_id, first_name, last_name\")\n        .in(\"id\", orderIds);\n      for (const o of orders ?? []) orderRef.set(o.id as string, `${o.first_name} ${o.last_name}`);" },
    { name: "wholesale amount exposed on the provider portal", file: F_PORTAL, expect: "R13c",
      from: "                            <span className=\"font-bold\">Partner case.</span>{\" \"}",
      to: "                            <span className=\"font-bold\">Partner case (wholesale rate $45).</span>{\" \"}" },
    { name: "partner customer communication re-enabled", file: F_ASSIGN, expect: "R13b",
      from: "  const customerContactAllowed = !policy.suppressCustomerCommunication;",
      to: "  const customerContactAllowed = true;" },
    { name: "QR/verification isolation bypassed (gate fails open)", file: F_GATE, expect: "R14a",
      from: "  if (error || !data) {\n    return {\n      allowed: false,",
      to: "  if (error || !data) {\n    return {\n      allowed: true," },
    { name: "the provider portal grows a partner-origin branch again", file: F_PORTAL, expect: "R15a",
      from: "                  const isPSD = isPSDOrder(order);",
      to: "                  const isPSD = isPSDOrder(order);\n                  const isPartnerCase = Boolean((order as { partner_id?: string }).partner_id);\n                  void isPartnerCase;" },
  ];

  let missed = 0;
  const originals = new Map();
  try {
    await runChecks();
    if (report("BASELINE (must be clean before planting)")) {
      console.log("\n  baseline dirty — controls would be meaningless");
      missed++;
    } else {
      for (const c of CONTROLS) {
        const path = join(ROOT, c.file);
        if (!originals.has(c.file)) originals.set(c.file, readFileSync(path, "utf8"));
        const src = read(c.file);
        if (!src.includes(c.from)) { console.log(`  ANCHOR MISSING  ${c.name}`); missed++; continue; }
        writeFileSync(path, src.replace(c.from, c.to), "utf8");
        let caught = false;
        try {
          await runChecks();
          const t = results.find((r) => r.name.startsWith(c.expect));
          caught = Boolean(t && !t.ok);
        } catch { caught = true; }
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) missed++;
        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    // NEVER process.exit() here — finally would be skipped and a planted
    // mutation would stay on disk.
    for (const [rel, content] of originals) writeFileSync(join(ROOT, rel), content, "utf8");
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${15 - missed}/15 controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  process.exitCode = report("PARTNER SLICE 8 — DOCUMENT RETRIEVAL / WEBHOOKS / REVISIONS / INVOICE PDFs / DISCLOSURE") ? 1 : 0;
}
