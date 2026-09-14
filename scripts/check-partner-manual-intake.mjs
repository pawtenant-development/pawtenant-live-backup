#!/usr/bin/env node
/**
 * check-partner-manual-intake.mjs
 *
 * PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001.
 *
 * Build-chained guard for the multi-partner manual (PDF) intake:
 *   * no partner brand is hardcoded anywhere (partners are rows);
 *   * manual and API orders converge on ONE acceptance path;
 *   * admins see the partner identity + intake method, providers see neither
 *     the brand, the external reference nor any economics;
 *   * the PDF is content-validated (malformed / encrypted / oversized refused,
 *     multipart drained before every early refusal), stored PRIVATELY and only
 *     ever reached through short-lived signed URLs;
 *   * extraction never invents values, flags low confidence, fails CLOSED on
 *     ESA/PSD contradictions, and NEVER creates an order — a human review and
 *     an explicit confirm are required;
 *   * duplicates (same partner + PDF sha256, same partner + external order id)
 *     are refused at the database and in the function; different partners
 *     never collide; commit is an atomic claim + idempotency-ledger replay;
 *   * the PSD canonical contract is preserved; the wholesale rate is selected
 *     and frozen server-side; later rate changes never rewrite old orders;
 *   * Partner Contribution is a separate Accounts section that reads no
 *     Stripe data and leaves the company bridge untouched;
 *   * no Stripe, attribution or provider-earning mutation; no PII/PHI logging;
 *   * the internal assessment PDF is neutral by default (customer copy unchanged).
 *
 * `--self-test` plants 20 real weakenings and asserts each is detected.
 * Restoration happens in `finally`; process.exit() is never called inside the
 * plant loop. CRLF is normalised at the single read point.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FN_DIR = "supabase/functions/partner-manual-intake";
const FN_INDEX = `${FN_DIR}/index.ts`;
const FN_EXTRACT = `${FN_DIR}/extract.ts`;
const FN_PAYLOAD = `${FN_DIR}/payload.ts`;
const PDF_SAFETY = "supabase/functions/_shared/pdfSafety.ts";
const API_ACCEPT = "supabase/functions/partner-orders-v1/accept.ts";
const MIG = "supabase/migrations/20260911120000_partner_multi_brand_manual_pdf_intake.sql";
const PP_DIR = "src/pages/admin-orders/components/partner-platform";
const INTAKE_UI = `${PP_DIR}/PartnerManualIntake.tsx`;
const PROFILE_UI = `${PP_DIR}/PartnerProfilePanel.tsx`;
const OCR_UI = `${PP_DIR}/pdfOcr.ts`;
const SHARED_UI = `${PP_DIR}/shared.tsx`;
const WORKSPACE = `${PP_DIR}/PartnerPlatformWorkspace.tsx`;
const ORDERS_TAB = "src/pages/admin-orders/components/PartnerOrdersTab.tsx";
const CONTRIB_UI = "src/pages/admin-orders/components/PartnerContributionPanel.tsx";
const NAV_UI = "src/pages/admin-orders/components/AccountsSectionNav.tsx";
const FLOW_LIB = "src/lib/accountsFinancialFlow.ts";
const UTILS = "src/pages/admin-orders/components/assessmentUtils.ts";
const CUSTOMER_CARD = "src/pages/my-orders/components/AssessmentCard.tsx";
const PROVIDER_PAGE = "src/pages/provider-portal/page.tsx";
const PROVIDER_DETAIL = "src/pages/provider-portal/components/ProviderOrderDetail.tsx";
const ASSIGN_FN = "supabase/functions/assign-doctor/index.ts";
const PKG = "package.json";

/** THE single read point. Every anchor below assumes \n line endings. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** String-aware comment stripper (never blanks string bodies). */
function stripComments(src, sql = false) {
  let out = "";
  let i = 0;
  let quote = null;
  const lineTok = sql ? "--" : "//";
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      out += ch;
      if (!sql && ch === "\\") { if (i + 1 < src.length) { out += src[i + 1]; i += 2; continue; } }
      else if (ch === quote) quote = null;
      else if (quote !== "`" && ch === "\n" && !sql) quote = null;
      i++;
      continue;
    }
    if (sql ? ch === "'" : (ch === "'" || ch === '"' || ch === "`")) { quote = ch; out += ch; i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === lineTok) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (!sql && two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Strip comments AND string literals — for "must NOT contain" USE scans. */
function stripStrings(src) {
  return src.replace(/`(?:\\.|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

/** Extract one `create or replace function <name>(...)... $$;` block from SQL. */
function fnBlock(sqlSrc, name) {
  const re = new RegExp(`create or replace function [\\w.]*${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`, "m");
  return sqlSrc.match(re)?.[0] ?? "";
}

async function loadModule(rel) {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, rel)], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: [{ name: "external-remote", setup(b) { b.onResolve({ filter: /^(https?:|npm:)/ }, (a) => ({ path: a.path, external: true })); } }],
  });
  let code = result.outputFiles[0].text;
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*"(https:|npm:)[^"]+";?/g, "");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function runChecks() {
  const fnRaw = read(FN_INDEX);
  const fn = stripComments(fnRaw);
  const fnUse = stripStrings(fn);
  const extractRaw = read(FN_EXTRACT);
  const extract = stripComments(extractRaw);
  const payload = stripComments(read(FN_PAYLOAD));
  const safety = stripComments(read(PDF_SAFETY));
  const accept = stripComments(read(API_ACCEPT));
  const migRaw = read(MIG);
  const mig = stripComments(migRaw, true);
  const intakeUi = stripComments(read(INTAKE_UI));
  const profileUi = stripComments(read(PROFILE_UI));
  const ocrUi = stripComments(read(OCR_UI));
  const sharedUi = stripComments(read(SHARED_UI));
  const workspace = stripComments(read(WORKSPACE));
  const ordersTab = stripComments(read(ORDERS_TAB));
  const contribUi = stripComments(read(CONTRIB_UI));
  const navUi = stripComments(read(NAV_UI));
  const flowLib = stripComments(read(FLOW_LIB));
  const utils = stripComments(read(UTILS));
  const customerCard = stripComments(read(CUSTOMER_CARD));
  const providerPage = read(PROVIDER_PAGE);
  const providerDetail = read(PROVIDER_DETAIL);
  const assignFn = stripComments(read(ASSIGN_FN));
  const pkg = read(PKG);

  // ── G1: no partner brand hardcoded anywhere in code ─────────────────────
  const codeSources = { fn: fnUse, extract: stripStrings(extract), payload: stripStrings(payload), mig: stripStrings(mig), intakeUi: stripStrings(intakeUi), profileUi: stripStrings(profileUi), workspace: stripStrings(workspace), ordersTab: stripStrings(ordersTab), contribUi: stripStrings(contribUi) };
  const brandHits = Object.entries(codeSources).flatMap(([k, s]) => (/signmyesa|rapid[-_ ]?esa|rapidesa/i.test(s) ? [k] : []));
  // Also refuse brand-keyed BRANCHES hidden in string comparisons (slug === "signmyesa").
  const brandBranch = Object.entries({ fn, intakeUi, profileUi, workspace, ordersTab, contribUi, mig }).flatMap(([k, s]) =>
    (/(slug|display_name|domain|partner_name)\s*(===|==|!==|!=|=|<>|like|ilike)\s*['"](signmyesa|rapid)/i.test(s) ? [k] : []));
  check("G1 no partner brand is hardcoded (partners are rows, never branches)",
    brandHits.length === 0 && brandBranch.length === 0, `brand tokens in: ${brandHits.join(",")} branches in: ${brandBranch.join(",")}`);

  // ── G2: any number of partners ───────────────────────────────────────────
  check("G2 the wizard offers every partner whose profile allows manual intake (no single-partner assumption)",
    /partners\.filter\(acceptsManualIntake\)/.test(intakeUi) && /export const acceptsManualIntake/.test(sharedUi) &&
      /intake_mode === "manual" \|\| o\.intake_mode === "both"/.test(sharedUi),
    "eligibility comes from the partner row's intake_mode, never from a name");

  // ── G3: manual and API converge on one acceptance path ───────────────────
  const acceptFn = fnBlock(migRaw, "partner_accept_order");
  check("G3 manual and API orders share public.partner_accept_order (intake_method defaults to api)",
    /p_intake_method text default 'api'/.test(acceptFn) && /partner_intake_method/.test(acceptFn) &&
      /admin\.rpc\("partner_accept_order"/.test(fn) && /p_intake_method: "manual"/.test(fn) &&
      /admin\.rpc\("partner_accept_order"/.test(accept) && !/p_intake_method/.test(accept),
    "the API caller is untouched; the manual caller passes 'manual'; no second order writer exists");
  check("G3b the manual function never inserts into orders directly",
    !/from\("orders"\)\s*\.insert/.test(fn) && !/insert into public\.orders/.test(fnUse),
    "orders are created ONLY through the canonical acceptance function");

  // ── G4: admin sees partner identity + intake method ──────────────────────
  // PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 added a THIRD
  // intake method (`partner_portal_manual`). The old assertion pinned the exact
  // two-way ternary, which would have gone on passing while every portal order
  // was mislabelled "api" — so it now requires a label for EVERY method the
  // orders table accepts, which is what an admin actually needs to see.
  const intakeMethods = ["api", "manual", "partner_portal_manual"];
  const labelMap = ordersTab.match(/INTAKE_METHOD_LABELS[^=]*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  check("G4 admins see the partner chip and a label for EVERY intake method on the Orders tab and the intake list",
    /partnerName\(o\)/.test(ordersTab) &&
      /INTAKE_METHOD_LABELS\[o\.partner_intake_method/.test(ordersTab) &&
      intakeMethods.every((mth) => new RegExp(`(^|[^_a-z])${mth}:`, "m").test(labelMap)) &&
      /<Badge label=\{partnerName\(d\.partner_id\)\}/.test(intakeUi),
    `partner identity is admin-visible on every partner-order surface; labelled methods: ${
      intakeMethods.filter((mth) => new RegExp(`(^|[^_a-z])${mth}:`, "m").test(labelMap)).join(", ") || "none"}`);

  // ── G5/G6: providers see no brand, no external id, no economics ──────────
  const providerLeak = [stripComments(providerPage), stripComments(providerDetail)].flatMap((s, i) =>
    (/partner_organizations|\bdisplay_name\b|partner_intake|signmyesa|rapid esa|partner_rate_cards|partner_order_financials|wholesale|partner_billable|partner_invoice|get_partner_contribution|partner_intake_drafts|partner-platform/i.test(s) ? [i === 0 ? "page" : "detail"] : []));
  check("G5 the provider portal references no partner identity, intake or economics surface",
    providerLeak.length === 0, `leaks in: ${providerLeak.join(",")}`);
  // PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: the provider receives
  // NO origin label at all — not on the portal, not in the assignment email.
  check("G5b the provider receives no partner label anywhere (portal or assignment email)",
    !/Partner Case/.test(providerPage) && !/providerFacingOriginLabel|originLabel/.test(assignFn) && !/display_name/.test(assignFn),
    "a provider works every case identically; origin is admin-only");
  check("G6 the provider portal never selects or renders the partner's external order id",
    !/partner_order_id\s*\}/.test(providerDetail) && !/\{order\.partner_order_id\}/.test(providerPage) && !/\{order\.partner_order_id\}/.test(providerDetail),
    "the external reference is admin-only (task §11)");

  // ── G7/G8: private storage + signed access only ──────────────────────────
  check("G7 the intake bucket is private and PDF-only",
    /values \('partner-intake', 'partner-intake', false, 15728640, array\['application\/pdf'\]\)/.test(mig) &&
      /set public = false/.test(mig),
    "no public bucket, no other MIME type");
  check("G8 the source PDF is reached only through short-lived signed URLs (≤ 600 s), never a public URL",
    /createSignedUrl\(draft\.storage_path, SIGNED_URL_TTL_SECONDS\)/.test(fn) &&
      Number(fn.match(/const SIGNED_URL_TTL_SECONDS = (\d+)/)?.[1] ?? 0) > 0 && Number(fn.match(/const SIGNED_URL_TTL_SECONDS = (\d+)/)?.[1] ?? 9999) <= 600 &&
      !/getPublicUrl/.test(fn) && !/getPublicUrl/.test(intakeUi),
    "signed, expiring access only");

  // ── G9: extraction never creates an order; human review + confirm required ─
  const commitIdx = fn.indexOf('case "commit"');
  const acceptIdx = fn.indexOf('admin.rpc("partner_accept_order"');
  check("G9 partner_accept_order is called ONLY inside the commit action, after an explicit reviewed check",
    commitIdx > 0 && acceptIdx > commitIdx && (fn.match(/admin\.rpc\("partner_accept_order"/g) ?? []).length === 1 &&
      /draft\.status !== "reviewed" \|\| !draft\.reviewed_fields\) return fail\(409, "not_reviewed"/.test(fn) &&
      !/partner_accept_order/.test(fn.slice(0, commitIdx)),
    "upload / extraction / OCR / review must never create an order");
  check("G9b the wizard shows the source PDF and a confirm step with the proposed charge before creation",
    /source_url/.test(intakeUi) && /Create partner order/.test(intakeUi) && /partner_rate_cards/.test(intakeUi) &&
      /frozen <strong>server-side<\/strong>/.test(read(INTAKE_UI)),
    "confirmation explains what will be created and where the amount comes from");

  // ── G10: low-confidence + missing highlighted ────────────────────────────
  check("G10 low-confidence and missing values are flagged by the extractor and highlighted in the review UI",
    /REVIEW_THRESHOLD/.test(extract) && /low_confidence/.test(extractRaw) &&
      /f\.confidence < REVIEW_THRESHOLD/.test(intakeUi) && /not found in PDF/.test(read(INTAKE_UI)) && /bg-amber-50/.test(read(INTAKE_UI)),
    "reviewers must see which values need checking");

  // ── G11/G12/G13: duplicates + idempotency ─────────────────────────────────
  check("G11 duplicate external order id is refused: DB partial unique index + function check at review AND commit",
    /create unique index if not exists partner_intake_drafts_external_active\s*\n\s*on public\.partner_intake_drafts \(partner_id, lower\(external_order_id\)\)/.test(mig) &&
      /orders_partner_order_unique|partner_order_id/.test(fnBlock(migRaw, "partner_accept_order")) &&
      (fn.match(/externalIdConflict\(/g) ?? []).length >= 3 && /duplicate_external_order_id/.test(fn),
    "same partner + same external id must never become two orders");
  check("G12 duplicate PDF (sha256) is refused per partner: DB partial unique index + 409 duplicate_pdf",
    /create unique index if not exists partner_intake_drafts_sha_active\s*\n\s*on public\.partner_intake_drafts \(partner_id, file_sha256\) where status <> 'cancelled'/.test(mig) &&
      /\.eq\("file_sha256", v\.sha256\)\.neq\("status", "cancelled"\)/.test(fn) && /"duplicate_pdf"/.test(fn),
    "the same file under another filename is the same file");
  check("G13 commit is an atomic claim (reviewed → committing) with an idempotency-ledger replay and a release on failure",
    /\.update\(\{ status: "committing"/.test(fn) && /\.eq\("id", draftId\)\.eq\("status", "reviewed"\)\.eq\("review_version", draft\.review_version\)/.test(fn) &&
      /const idempotencyKey = `manual:\$\{draftId\}`/.test(fn) && /partner_lookup_idempotency/.test(fn) &&
      /const release = async \(code: string\)/.test(fn) && /status: "reviewed", commit_error_code: code/.test(fn),
    "two admins, a double click, or a retry after a crash can never produce two orders");
  check("G13b a replayed acceptance for an id that is NOT ours is refused, never adopted",
    /if \(row\.replayed\)/.test(fn) && /release\("duplicate_external_order_id"\)/.test(fn),
    "partner_accept_order's replay arm must not silently link a draft to another order");

  // ── G14/G15/G16: malformed / encrypted / oversized refused; body drained ─
  const uploadIdx = fn.indexOf('if (action === "upload")');
  const validateIdx = fn.indexOf("validatePdfBytes(bytes");
  const storeIdx = fn.indexOf('storage.from(BUCKET).upload');
  check("G14 the PDF is validated by content before it is stored",
    /findAscii\(bytes, "%PDF-", 0, 1024\) !== 0/.test(safety) && /"%%EOF"/.test(safety) && /pdf_unparsable/.test(safety) &&
      /scanActiveContent/.test(safety) && uploadIdx > 0 && validateIdx > uploadIdx && storeIdx > validateIdx,
    "signature, trailer, parse, active content — then storage");
  check("G15 encrypted PDFs are refused clearly (trailer probe + parser flag)",
    /looksEncrypted\(bytes\)\) return \{ ok: false, code: "pdf_encrypted" \}/.test(safety) &&
      /if \(doc\.isEncrypted\) return \{ ok: false, code: "pdf_encrypted" \}/.test(safety) && /pdf_encrypted/.test(fn),
    "a locked PDF cannot be silently accepted");
  const maxBytes = fn.match(/const HARD_MAX_BYTES = (\d+) \* 1024 \* 1024/)?.[1];
  check("G16 oversized uploads are refused (hard cap ≤ 15 MB, Content-Length pre-check) and every early refusal drains the body",
    Number(maxBytes) > 0 && Number(maxBytes) <= 15 && /Math\.min\(HARD_MAX_BYTES/.test(fn) &&
      /declaredLength > MAX_BYTES/.test(fn) && /await drain\(req\);\s*return fail\(401/.test(fn) && /await drain\(req\);\s*return fail\(403/.test(fn),
    "a 6 MB body answered before it is read becomes a 504 (ESA-PLANNER lesson)");

  // ── G17: scanned PDFs → OCR fallback in the admin's browser, no 3rd party ─
  check("G17 image-only PDFs park as ocr_required and OCR runs in the admin's browser (no third-party OCR upload)",
    /status: "ocr_required"/.test(fn) && /case "ocr_text"/.test(fn) && /ocrPdfFile/.test(intakeUi) &&
      /createWorker\("eng"/.test(ocrUi) && !/fetch\(/.test(ocrUi) && !/XMLHttpRequest/.test(ocrUi),
    "page images never leave the admin's machine; only recognised text is posted to PawTenant");

  // ── G18: the SAME validator as the API decides completeness ──────────────
  check("G18 missing required fields block via the partner API's own validator (one code path)",
    /import \{ validateOrderRequest \} from "\.\.\/partner-orders-v1\/validate\.ts"/.test(fn) &&
      /await validateOrderRequest\(payload, identity, admin\)/.test(fn) && (fn.match(/evaluateReview\(/g) ?? []).length >= 3,
    "manual intake must not grow its own, weaker, rule set");

  // ── G19: ESA/PSD contradiction fails closed (behavioural) ────────────────
  const ex = await loadModule(FN_EXTRACT);
  const conflict = ex.extractIntake([{ page: 1, text: "Order Number: X-1\nProduct: ESA Letter and PSD Letter (Emotional Support Animal + Psychiatric Service Dog)\nEmail: a@b.test" }]);
  const esaOnly = ex.extractIntake([{ page: 1, text: "Order Number: X-2\nProduct: ESA Letter (Emotional Support Animal)\nEmail: a@b.test" }]);
  const docWide = ex.extractIntake([{ page: 1, text: "Order Number: X-3\nThis emotional support animal letter\nPsychiatric service dog tasks\nEmail: a@b.test" }]);
  check("G19 contradictory ESA/PSD evidence yields service = null + service_conflict; clear evidence resolves",
    conflict.fields.service.value === null && conflict.warnings.includes("service_conflict") &&
      esaOnly.fields.service.value === "esa" && docWide.fields.service.value === null && docWide.warnings.includes("service_conflict"),
    JSON.stringify({ conflict: conflict.fields.service, esaOnly: esaOnly.fields.service.value, docWide: docWide.fields.service.value }));
  check("G19b an unresolved contradiction blocks the review and commit",
    /service_conflict_unresolved/.test(fn) && /blocking: true/.test(fn.slice(fn.indexOf("service_conflict_unresolved") - 200, fn.indexOf("service_conflict_unresolved") + 200)) &&
      /service_conflict_resolution/.test(intakeUi),
    "a human must record how the service was confirmed");

  // ── G19c: the extractor never invents (behavioural) ───────────────────────
  const noEmail = ex.extractIntake([{ page: 1, text: "Order Number: X-4\nFirst Name: A\nLast Name: B\nProduct: ESA letter" }]);
  check("G19c missing values are reported as missing, never defaulted",
    noEmail.fields.email.value === null && noEmail.fields.email.warnings.includes("missing") &&
      noEmail.fields.phone.value === null && noEmail.pets.length === 0 && noEmail.warnings.includes("no_pets_found"),
    JSON.stringify({ email: noEmail.fields.email, pets: noEmail.pets.length }));
  const labelled = ex.extractIntake([{ page: 2, text: "Email: Jane.Doe@Example.test\nPet Name: Rex\nAnimal Type: Dog\nBreed: Beagle\nAddress: 1 Main St, Austin, TX 78701" }]);
  check("G19d every extracted value carries page + method + confidence; inferred state is low-confidence",
    labelled.fields.email.value === "jane.doe@example.test" && labelled.fields.email.page === 2 && labelled.fields.email.method === "label" &&
      labelled.fields.state.value === "TX" && labelled.fields.state.method === "inferred" && labelled.fields.state.confidence < 0.85 &&
      labelled.pets.length === 1 && labelled.pets[0].breed.value === "Beagle",
    JSON.stringify({ email: labelled.fields.email, state: labelled.fields.state }));

  // ── G20: PSD canonical contract preserved ────────────────────────────────
  const pl = await loadModule(FN_PAYLOAD);
  const psdPayload = pl.buildPayload({ service: "psd", answers: { safetyCheck: "no" }, animals: [{ name: "A", type: "Dog" }], paid_confirmed: true, consents: {} }, "d1", "2026-09-11T00:00:00.000Z");
  const esaPayload = pl.buildPayload({ service: "esa", answers: { q_x: "y" }, animals: [{ name: "A", type: "Dog" }], paid_confirmed: false, consents: { telehealth: true, privacy_data_transfer: false } }, "d1", "2026-09-11T00:00:00.000Z");
  check("G20 PSD drafts are submitted under the canonical PSD contract and normalised onto psd_v1",
    psdPayload.assessment.schema_version === "partner.assessment.psd.v1" &&
      /p_target_assessment_version: service === "psd" \? PSD_TARGET_ASSESSMENT_VERSION : null/.test(fn) &&
      /PSD_QUESTIONNAIRE_ITEMS/.test(intakeUi),
    JSON.stringify(psdPayload.assessment));
  check("G20b the payload builder never manufactures consent or payment: unchecked consents are omitted, unconfirmed payment is not 'paid'",
    esaPayload.consents.telehealth?.accepted === true && !("privacy_data_transfer" in esaPayload.consents) && !("electronic_signature" in esaPayload.consents) &&
      esaPayload.payment.status !== "paid" && psdPayload.payment.status === "paid",
    JSON.stringify({ consents: esaPayload.consents, payment: esaPayload.payment }));

  // ── G21: cross-partner isolation ─────────────────────────────────────────
  check("G21 duplicate checks and storage paths are partner-scoped; drafts are admin-only under FORCED RLS",
    /\.eq\("partner_id", partnerId\)\.eq\("partner_order_id", external\)/.test(fn) && /\.eq\("partner_id", partnerId\)\.neq\("status", "cancelled"\)\.neq\("id", selfDraftId\)/.test(fn) &&
      /const storagePath = `\$\{partnerId\}\/\$\{draftId\}\.pdf`/.test(fn) &&
      /alter table public\.partner_intake_drafts force row level security/.test(mig) &&
      /create policy partner_intake_drafts_admin_read on public\.partner_intake_drafts\s*\n\s*for select to authenticated using \(public\.is_chat_admin\(\)\)/.test(mig) &&
      /revoke all on public\.partner_intake_drafts from authenticated/.test(mig),
    "two partners may reuse an external id; providers/customers get zero rows");

  // ── G22/G23: rate snapshot immutable; rate changes never rewrite history ─
  const setRate = fnBlock(migRaw, "partner_admin_set_rate");
  check("G22 a rate change closes the open card and inserts version+1 — it never edits an amount in place",
    setRate.length > 0 && /set effective_to = v_from/.test(setRate) && /select coalesce\(max\(version\), 0\) \+ 1 into v_version/.test(setRate) &&
      !/set wholesale_unit_price_cents/.test(setRate) && !/partner_order_financials/.test(setRate) && !/partner_invoices/.test(setRate),
    "history is preserved; accepted orders and issued invoices are untouched");
  check("G23 the snapshot is selected server-side inside acceptance; no client amount is trusted",
    /select \* into v_rate from public\.partner_rate_cards/.test(acceptFn) && /wholesale_fee_cents, currency, provider_earning_rule/.test(acceptFn) &&
      !/amount_cents|wholesale/.test(fnUse.replace(/no_rate_card/g, "")) && !/wholesale_fee|amount_cents/.test(stripStrings(intakeUi).replace(/wholesale_unit_price_cents/g, "")),
    "the wizard displays the current rate; only the database decides what is frozen");

  // ── G24: Partner Contribution separate from direct revenue ───────────────
  check("G24 Partner Contribution is its own Accounts section that reads no Stripe data and leaves the company bridge untouched",
    /key: "partners",\s*label: "Partner Contribution"/.test(navUi) &&
      /get_partner_contribution_summary/.test(contribUi) && !/stripe-payment-history|payment_intent|get_channel_contribution|functions\.invoke|stripe_gross|stripe_net|from\("charges"\)/i.test(contribUi) &&
      !/partner/i.test(flowLib) && !/stripe/i.test(fnBlock(migRaw, "get_partner_contribution_summary")),
    "Stripe gross/net, channel contribution, marketing and closed periods must not change");
  check("G24b Net Partner Contribution = charge − provider payout − credits, and payout comes from the canonical earnings ledger",
    /e\.amount_cents\s*\n\s*\+ coalesce\(\(select sum\(c\.amount_cents\)/.test(mig) && /from public\.doctor_earnings de/.test(mig) &&
      /at time zone 'America\/New_York'/.test(mig) && /where public\.is_chat_admin\(\)/.test(fnBlock(migRaw, "get_partner_contribution_summary")),
    "one definition, NY calendar, admin-gated");

  // ── G25/G26/G27: no Stripe, attribution or provider-earning mutation ─────
  check("G25 the manual intake never touches Stripe",
    !/stripe|payment_intent|paymentintent/i.test(fnUse) && !/stripe|payment_intent/i.test(stripStrings(mig)),
    "the partner's customer paid the partner — PawTenant records no payment");
  check("G26 the manual intake never writes advertising attribution or GHL fields",
    !/utm_|attribution_json|first_touch|gclid|ghl_|referred_by|source_system/i.test(fnUse) && !/utm_|attribution_json|first_touch|gclid|ghl_/i.test(stripStrings(mig)) &&
      !/utm_|attribution_json|first_touch|gclid/i.test(acceptFn),
    "partner identity lives in its own columns, never in attribution");
  check("G27 acceptance creates no provider earning; contribution is recognised only on clinical completion",
    !/doctor_earnings/.test(fnUse) && !/doctor_earnings/.test(acceptFn) &&
      /if new\.doctor_status is distinct from 'patient_notified' then return new; end if;/.test(fnBlock(migRaw, "tg_partner_billable_on_completion")) &&
      /partner_contribution_recognized/.test(fnBlock(migRaw, "tg_partner_billable_on_completion")),
    "provider pay stays on the canonical earnings path");

  // ── G28/G29: assessment PDF neutral internally; customer documents unchanged ─
  check("G28 the internal assessment PDF is neutral by default and the customer portal explicitly asks for the customer copy",
    /audience: AssessmentAudience = "internal"/.test(utils) && /if \(audience === "internal"\) \{/.test(utils) &&
      /"customer"\)\)/.test(customerCard) && /title: isPsd \? "PSD Assessment" : "ESA Assessment"/.test(utils),
    "providers see 'ESA Assessment' / 'PSD Assessment' without any branding");
  check("G29 customer letters, QR copies and partner document releases do not use the assessment renderer",
    !/assessmentUtils|buildPrintHTML/.test(read("supabase/functions/_shared/qrVerificationPdf.ts")) &&
      !/assessmentUtils|buildPrintHTML/.test(read("supabase/functions/inject-pdf-footer/index.ts")) &&
      !/assessmentUtils|buildPrintHTML/.test(read("supabase/functions/partner-orders-v1/document.ts")),
    "the neutral change cannot reach a letter or a QR copy");

  // ── G30: no PII/PHI in logs or audit ──────────────────────────────────────
  check("G30 the intake function never logs and the audit writer refuses PII/PHI keys",
    !/console\./.test(fnUse) && !/console\./.test(stripStrings(extract)) && !/console\./.test(stripStrings(payload)) &&
      /v_forbidden constant text\[\] := array\['email','phone','first_name','last_name','address','answers','text','page_text','secret','token'\]/.test(mig) &&
      /raise exception 'intake audit metadata must not carry %'/.test(mig),
    "page text, answers and contact details must never reach logs or audit_logs");
  check("G30b extracted page text lives in the private schema and is reachable only through service-role RPCs",
    /create table if not exists private\.partner_intake_page_text/.test(mig) &&
      /grant execute on function %s to service_role/.test(mig) && /partner_intake_read_page_text/.test(fn) && /partner_intake_store_page_text/.test(fn) &&
      !/from\("partner_intake_page_text"\)/.test(fn),
    "no client role can read raw page text");

  // ── G31: build chain ─────────────────────────────────────────────────────
  const buildLine = JSON.parse(pkg).scripts.build;
  check("G31 this guard and the assessment-PDF guard are wired into the build",
    buildLine.includes("check-partner-manual-intake.mjs") && buildLine.includes("check-partner-assessment-pdf.mjs"),
    "a guard outside the build proves nothing");

  // ── G32: the legacy PDF wizard is RETIRED; only the read-only history mounts ──
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the PDF/OCR intake wizard
  // (PartnerManualIntake) must not mount on ANY active surface — the Partner
  // Platform workspace included. Historical records are viewed through
  // PartnerLegacyIntakeHistory under Settings, and the profile/rate panel stays
  // inside Settings. Provider and customer surfaces never see either.
  const settingsTab = read(`${PP_DIR}/PartnerSettingsTab.tsx`);
  check("G32 the legacy PDF wizard mounts nowhere; the read-only history and the rate panel mount only under Settings",
    !/<PartnerManualIntake/.test(workspace) && !/import PartnerManualIntake/.test(workspace) &&
      /<PartnerLegacyIntakeHistory/.test(settingsTab) && /<PartnerProfilePanel/.test(settingsTab) &&
      !/PartnerManualIntake|PartnerProfilePanel|PartnerLegacyIntakeHistory/.test(providerPage) &&
      !/PartnerManualIntake|PartnerProfilePanel|PartnerLegacyIntakeHistory/.test(read("src/pages/my-orders/page.tsx")),
    "the PDF path is retired; economics and history never reach provider or customer surfaces");
}

// ── Reporting ────────────────────────────────────────────────────────────────
function report(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
  console.log(`\n  ${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length;
}

const SELF_TEST = process.argv.includes("--self-test");

if (!SELF_TEST) {
  await runChecks();
  process.exitCode = report("PARTNER MANUAL PDF INTAKE") ? 1 : 0;
} else {
  const CONTROLS = [
    // Found in browser QA: a portal-created order was labelled "API" in Admin
    // Orders because the badge fell through to "api" for any method that was
    // not the literal string "manual".
    { name: "a new intake method silently falls through to the API label", file: ORDERS_TAB, expect: "G4",
      find: "  partner_portal_manual: \"portal\",",
      replace: "" },
    { name: "partner brand hardcoded in the intake function", file: FN_INDEX, expect: "G1",
      find: '    if (!["manual", "both"].includes(partner.intake_mode as string)) {',
      replace: '    if (partner.slug === "signmyesa") { /* special case */ }\n    if (!["manual", "both"].includes(partner.intake_mode as string)) {' },
    { name: "wizard hardwired to the first partner only", file: INTAKE_UI, expect: "G2",
      find: "  const eligible = useMemo(() => partners.filter(acceptsManualIntake), [partners]);",
      replace: "  const eligible = useMemo(() => partners.slice(0, 1), [partners]);" },
    { name: "extraction creates the order automatically (no human review)", file: FN_INDEX, expect: "G9",
      find: '      if (draft.status !== "reviewed" || !draft.reviewed_fields) return fail(409, "not_reviewed", "Review and save the draft before creating the order");',
      replace: '      if (!draft.reviewed_fields) return fail(409, "not_reviewed", "Review and save the draft before creating the order");' },
    { name: "intake bucket made public", file: MIG, expect: "G7",
      find: "values ('partner-intake', 'partner-intake', false, 15728640, array['application/pdf'])",
      replace: "values ('partner-intake', 'partner-intake', true, 15728640, array['application/pdf'])" },
    { name: "signed URL lifetime raised to a day", file: FN_INDEX, expect: "G8",
      find: "const SIGNED_URL_TTL_SECONDS = 300;", replace: "const SIGNED_URL_TTL_SECONDS = 86400;" },
    { name: "encrypted PDFs accepted (parser flag ignored)", file: PDF_SAFETY, expect: "G15",
      find: '    if (doc.isEncrypted) return { ok: false, code: "pdf_encrypted" };', replace: "" },
    { name: "size cap raised above the bucket limit", file: FN_INDEX, expect: "G16",
      find: "const HARD_MAX_BYTES = 15 * 1024 * 1024;", replace: "const HARD_MAX_BYTES = 200 * 1024 * 1024;" },
    { name: "403 answered before the multipart body is drained", file: FN_INDEX, expect: "G16",
      find: '  if (adminErr || isAdmin !== true) { await drain(req); return fail(403, "forbidden", "Partner Platform admin access required"); }',
      replace: '  if (adminErr || isAdmin !== true) { return fail(403, "forbidden", "Partner Platform admin access required"); }' },
    { name: "duplicate PDF index removed", file: MIG, expect: "G12",
      find: "create unique index if not exists partner_intake_drafts_sha_active\n  on public.partner_intake_drafts (partner_id, file_sha256) where status <> 'cancelled';",
      replace: "" },
    { name: "duplicate external id index removed", file: MIG, expect: "G11",
      find: "create unique index if not exists partner_intake_drafts_external_active\n  on public.partner_intake_drafts (partner_id, lower(external_order_id))",
      replace: "create index if not exists partner_intake_drafts_external_active\n  on public.partner_intake_drafts (partner_id, lower(external_order_id))" },
    { name: "commit claim no longer atomic (status predicate dropped)", file: FN_INDEX, expect: "G13",
      find: '        .eq("id", draftId).eq("status", "reviewed").eq("review_version", draft.review_version)\n        .select("id");',
      replace: '        .eq("id", draftId)\n        .select("id");' },
    { name: "replayed acceptance for a foreign id adopted silently", file: FN_INDEX, expect: "G13b",
      find: '        await release("duplicate_external_order_id");\n        await audit(admin, actor, "partner_intake_duplicate_refused", draft, row.order_id, { reason: "external_order_id_replay" });',
      replace: '        await audit(admin, actor, "partner_intake_duplicate_refused", draft, row.order_id, { reason: "external_order_id_replay" });' },
    { name: "provider portal selects the partner display name", file: PROVIDER_PAGE, expect: "G5",
      find: 'order_origin, partner_id, partner_order_id")', replace: 'order_origin, partner_id, partner_order_id, partner_organizations(display_name)")' },
    { name: "ESA/PSD contradiction silently resolved to ESA", file: FN_EXTRACT, expect: "G19",
      find: '      else if (ev.esa > 0 && ev.psd > 0) { take("service", { value: null, page, method: "label", confidence: 0, warnings: ["service_conflict"] }); warnings.push("service_conflict"); }',
      replace: '      else if (ev.esa > 0 && ev.psd > 0) take("service", found("esa", page, "label", 0.9));' },
    { name: "extractor invents a placeholder email", file: FN_EXTRACT, expect: "G19c",
      find: '    email: missing("missing"), phone: missing(), address: missing(), state: missing("missing"),',
      replace: '    email: found("unknown@partner.test", 1, "inferred", 0.5), phone: missing(), address: missing(), state: missing("missing"),' },
    { name: "unchecked consents manufactured in the payload", file: FN_PAYLOAD, expect: "G20b",
      find: "  if (r.consents?.privacy_data_transfer === true) consents.privacy_data_transfer = { accepted: true, at: attestedAt, evidence };",
      replace: "  consents.privacy_data_transfer = { accepted: true, at: attestedAt, evidence };" },
    { name: "rate change edits the amount in place (history rewritten)", file: MIG, expect: "G22",
      find: "    update public.partner_rate_cards\n       set effective_to = v_from\n     where id = v_open.id;",
      replace: "    update public.partner_rate_cards\n       set wholesale_unit_price_cents = p_amount_cents\n     where id = v_open.id;" },
    { name: "page images posted to a third-party OCR service", file: OCR_UI, expect: "G17",
      find: "  const { createWorker } = await import(\"tesseract.js\");",
      replace: "  await fetch(\"https://ocr.example.com/upload\", { method: \"POST\", body: JSON.stringify(rendered) });\n  const { createWorker } = await import(\"tesseract.js\");" },
    { name: "Partner Contribution folded into Stripe figures", file: CONTRIB_UI, expect: "G24",
      find: 'const { data, error: err } = await supabase.rpc("get_partner_contribution_summary", { p_from: from, p_to: to });',
      replace: 'const { data, error: err } = await supabase.rpc("get_partner_contribution_summary", { p_from: from, p_to: to });\n      await supabase.functions.invoke("stripe-payment-history", { body: {} });' },
    { name: "page text logged from the intake function", file: FN_INDEX, expect: "G30",
      find: "    if (pageTexts.length && !(await storePages(admin, draftId, \"text\", \"unpdf\", pageTexts))) {",
      replace: "    console.log(pageTexts);\n    if (pageTexts.length && !(await storePages(admin, draftId, \"text\", \"unpdf\", pageTexts))) {" },
    { name: "internal assessment PDF defaults to the branded customer copy", file: UTILS, expect: "G28",
      find: '  audience: AssessmentAudience = "internal",', replace: '  audience: AssessmentAudience = "customer",' },
  ];

  let controlFailures = 0;
  await runChecks();
  if (report("BASELINE (must be clean before planting)")) { console.log("\n  baseline dirty — controls would be meaningless"); controlFailures++; }
  else {
    for (const c of CONTROLS) {
      const abs = join(ROOT, c.file);
      const original = readFileSync(abs, "utf8");
      const normalized = original.replace(/\r\n/g, "\n");
      const occurrences = normalized.split(c.find).length - 1;
      if (occurrences !== 1) { console.log(`  MISSED  ${c.name} — anchor matched ${occurrences}× (must be exactly 1)`); controlFailures++; continue; }
      try {
        writeFileSync(abs, normalized.replace(c.find, c.replace));
        results.length = 0;
        let target;
        try { await runChecks(); target = results.find((r) => r.name.startsWith(c.expect + " ")); }
        catch { target = { ok: false }; } // a control that breaks a module also counts as detected
        if (target && !target.ok) console.log(`  DETECTED  ${c.name} (fails ${c.expect})`);
        else { console.log(`  MISSED  ${c.name} — ${c.expect} still passes`); controlFailures++; }
      } finally {
        writeFileSync(abs, original);
      }
    }
  }

  results.length = 0;
  await runChecks();
  const cleanFailures = report("PARTNER MANUAL PDF INTAKE (post-restore)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - controlFailures}/${CONTROLS.length} controls detected, tree restored`);
  process.exitCode = controlFailures || cleanFailures ? 1 : 0;
}
