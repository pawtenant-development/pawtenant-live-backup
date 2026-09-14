#!/usr/bin/env node
/**
 * check-partner-document-isolation.mjs
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 5.
 *
 * THE INVARIANT
 * A partner-origin order must never receive PawTenant identity: no QR, no
 * footer, no verification ID, no verification record, no pawtenant.com
 * destination, no internal PT- id in a customer/provider-facing document.
 * A DIRECT order may receive a portal/manual-lookup verification ID, but no
 * order may have a QR code, ID, or verification URL injected into its PDF.
 *
 * WHY THIS GUARD IS SHAPED THIS WAY
 *
 * 1. It EXECUTES the gate rather than grepping for it. The dangerous bug is not
 *    a missing call, it is a present call whose FAILURE branch is wrong — e.g.
 *    `if (error) { carry on }`, which brands exactly the order whose policy
 *    could not be read. A regex sees a healthy-looking call site either way, so
 *    the decision function is bundled and run against real fixtures, including
 *    an unreadable order and an under-selected row.
 *
 * 2. It asserts the USE, not the mention. Every source assertion runs against a
 *    COMMENT-STRIPPED copy, because this slice adds long explanatory comments
 *    that name the very identifiers being banned. String literals are kept —
 *    see stripComments() for why blanking them would make the checks vacuous.
 *
 * 3. It pins the DIRECT control as hard as the partner one. A change that
 *    isolates partners by breaking retail verification is the regression this
 *    guard exists to catch.
 *
 * 4. It refuses to accept the edge-function gates as the whole story. The
 *    authoritative boundary is the DATABASE trigger, because the revision path
 *    mints its ID inside Postgres (ensure_revision_verification_id) where no
 *    TypeScript gate can reach it.
 *
 * `--self-test` plants each real defect into the real source and proves the
 * corresponding check fails.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GATE = "supabase/functions/_shared/partnerDocumentGate.ts";
const POLICY = "supabase/functions/_shared/partnerPolicy.ts";
const SUBMIT = "supabase/functions/provider-submit-letter/index.ts";
const INJECT = "supabase/functions/inject-pdf-footer/index.ts";
const ISSUE = "supabase/functions/issue-letter-verification/index.ts";
const QRV2 = "supabase/functions/generate-qr-verification-pdf/index.ts";
const MIGRATION = "supabase/migrations/20260820160000_partner_document_verification_isolation.sql";

/**
 * THE single read point. CRLF is normalised here and nowhere else: with
 * core.autocrlf=true a bare `git apply` is enough to flip a file mid-session,
 * and every \n anchor below would then silently match nothing — turning the
 * negative controls vacuous while still reporting PASS.
 */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Strip COMMENTS ONLY — string literals are kept.
 *
 * This is the distinction that matters. The failure mode a guard must not have
 * is asserting on a MENTION: this slice adds long comments that name the very
 * identifiers being banned ("Rapid", "pawtenant_branded", "drawText"), so a
 * scan over raw source would pass on prose alone.
 *
 * String literals, by contrast, ARE the code here: `.from("letter_verifications")`,
 * `supabase.rpc("ensure_revision_verification_id")` and the SQL literal
 * `'pawtenant_branded'` are real uses, and blanking them would make the positive
 * checks vacuous — the exact bug this comment exists to prevent.
 *
 * Replaced with spaces so offsets, and therefore the ordering assertions, stay
 * meaningful.
 */
function stripComments(src, sql = false) {
  let out = "";
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  const lineStart = sql ? "--" : "//";
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === lineStart) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

// ── Load the REAL gate module ───────────────────────────────────────────────
async function loadGate() {
  const result = await esbuild.build({
    entryPoints: [join(ROOT, GATE)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

/** Minimal supabase stub: returns one row (or an error) for .maybeSingle(). */
function stubClient(response) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => response,
  };
  return { from: () => chain };
}

const PARTNER_ESA = {
  id: "p-esa", confirmation_id: "PT-S5PARTESA", order_origin: "partner",
  partner_id: "9e9f", partner_communication_policy: "partner_managed",
  partner_document_policy: "partner_neutral",
};
const PARTNER_PSD = { ...PARTNER_ESA, id: "p-psd", confirmation_id: "PT-S5PARTPSD" };
const DIRECT = {
  id: "d-1", confirmation_id: "PT-S5DIRECT", order_origin: "direct",
  partner_id: null, partner_communication_policy: null, partner_document_policy: null,
};

const results = [];
const add = (name, ok, detail = "") => results.push({ name, ok, detail });

async function runChecks() {
  results.length = 0;

  const gate = await loadGate();
  const may = gate.mayBrandOrderDocuments;

  // ── BEHAVIOURAL: the decision itself ──────────────────────────────────────

  const esa = await may(stubClient({ data: PARTNER_ESA, error: null }), "p-esa");
  add("P1  partner ESA order cannot enter QR/footer/verification",
    esa.allowed === false && esa.reason === "partner_document_policy_neutral",
    `allowed=${esa.allowed} reason=${esa.reason}`);

  const psd = await may(stubClient({ data: PARTNER_PSD, error: null }), "p-psd");
  add("P2  partner PSD order cannot enter QR/footer/verification",
    psd.allowed === false && psd.reason === "partner_document_policy_neutral",
    `allowed=${psd.allowed} reason=${psd.reason}`);

  const dir = await may(stubClient({ data: DIRECT, error: null }), "d-1");
  add("P3  DIRECT order still permitted (no retail regression)",
    dir.allowed === true && dir.decision?.document === "pawtenant_branded",
    `allowed=${dir.allowed} document=${dir.decision?.document}`);

  // The projection that forgot order_origin. partnerPolicy REFUSES to read this
  // as "direct by omission" — this is the single most likely real-world defect.
  const underSelected = await may(
    stubClient({ data: { id: "x", confirmation_id: "PT-X" }, error: null }), "x");
  add("P4  under-selected row (no order_origin) FAILS CLOSED",
    underSelected.allowed === false, `allowed=${underSelected.allowed}`);

  const unknownPolicy = await may(stubClient({
    data: { ...PARTNER_ESA, partner_document_policy: "something_new" }, error: null }), "p-esa");
  add("P5  unknown/malformed partner document policy FAILS CLOSED",
    unknownPolicy.allowed === false, `allowed=${unknownPolicy.allowed}`);

  const unknownOrigin = await may(stubClient({
    data: { ...DIRECT, order_origin: "reseller" }, error: null }), "d-1");
  add("P6  unrecognised order_origin FAILS CLOSED",
    unknownOrigin.allowed === false, `allowed=${unknownOrigin.allowed}`);

  const readErr = await may(stubClient({ data: null, error: { message: "timeout" } }), "d-1");
  add("P7  a FAILED policy read FAILS CLOSED (not 'proceed')",
    readErr.allowed === false, `allowed=${readErr.allowed}`);

  const missing = await may(stubClient({ data: null, error: null }), "nope");
  add("P8  order not found FAILS CLOSED", missing.allowed === false, `allowed=${missing.allowed}`);

  const nullId = await may(stubClient({ data: DIRECT, error: null }), null);
  add("P9  null order id FAILS CLOSED", nullId.allowed === false, `allowed=${nullId.allowed}`);

  // A forged client payload must be unable to influence the decision. The proof
  // is structural: the gate accepts ONLY (client, orderId) and re-reads the row,
  // so there is no request-controlled field for a caller to lie in.
  const forged = await may(
    stubClient({ data: PARTNER_ESA, error: null }),
    "p-esa",
    { order_origin: "direct", partner_document_policy: "pawtenant_branded" },
  );
  add("P10 forged retail-looking payload cannot opt a partner order in",
    forged.allowed === false && may.length === 2,
    `allowed=${forged.allowed} arity=${may.length}`);

  // ── SOURCE: every branded entry point is actually gated ────────────────────

  const src = {
    [SUBMIT]: stripComments(read(SUBMIT)),
    [INJECT]: stripComments(read(INJECT)),
    [ISSUE]: stripComments(read(ISSUE)),
    [QRV2]: stripComments(read(QRV2)),
  };

  const activeUngated = [SUBMIT, ISSUE]
    .filter((f) => !/mayBrandOrderDocuments\s*\(/.test(src[f]));
  const retiredNotClosed = [INJECT, QRV2]
    .filter((f) => !/pdf_verification_stamping_retired/.test(src[f]));
  add("P11 active ID entry points are gated and stamping endpoints are retired",
    activeUngated.length === 0 && retiredNotClosed.length === 0,
    [...activeUngated, ...retiredNotClosed].join(", "));

  // provider-submit-letter is the PRIMARY path: it may mint a portal lookup ID,
  // but it must preserve the provider's original PDF without stamping it.
  const submit = src[SUBMIT];
  add("P12 provider-submit-letter gates the first-letter verification mint",
    /if\s*\(\s*mayBrand\s*&&[^)]*!isRevision/.test(submit),
    "generateVerificationId must be behind mayBrand");
  add("P13 provider-submit-letter gates the REVISION verification mint",
    /if\s*\(\s*mayBrand\s*\)\s*\{[\s\S]{0,400}?ensure_revision_verification_id/.test(submit),
    "ensure_revision_verification_id must be behind mayBrand");
  add("P14 provider-submit-letter preserves the original PDF without stamping",
    /const\s+finalUrl\s*=\s*documentUrl\s*;/.test(submit) &&
      !/injectPdfVerification|buildQrVerificationPdf|PDFDocument/.test(submit),
    "finalUrl must be documentUrl and no PDF mutator may remain");

  add("P15 inject-pdf-footer is retired and cannot read, stamp, or upload a PDF",
    /pdf_verification_stamping_retired/.test(src[INJECT]) &&
      /\},\s*410\s*\)/.test(src[INJECT]) &&
      !/downloadDocumentBytes|buildQrVerificationPdf|PDFDocument|\.storage\s*\./.test(src[INJECT]));

  const issGate = src[ISSUE].indexOf("mayBrandOrderDocuments(");
  const issInsert = src[ISSUE].indexOf("letter_verifications");
  add("P16 issue-letter-verification refuses BEFORE touching letter_verifications",
    issGate !== -1 && issInsert !== -1 && issGate < issInsert,
    `gate@${issGate} table@${issInsert}`);

  add("P17 generate-qr-verification-pdf is retired and cannot build a QR",
    /pdf_verification_stamping_retired/.test(src[QRV2]) &&
      /status:\s*410/.test(src[QRV2]) &&
      !/buildQrVerificationPdf|PDFDocument|qrcode|\.storage\s*\./i.test(src[QRV2]));

  // ── No scattered partner-name comparisons anywhere in the gated paths ──────
  const nameSniff = Object.entries({ ...src, [GATE]: stripComments(read(GATE)) })
    .filter(([, s]) => /\brapid\b/i.test(s) || /partner_name\s*===/.test(s) ||
      /display_name\s*===/.test(s) || /\bslug\s*===/.test(s))
    .map(([f]) => f);
  add("P18 no partner-NAME/slug comparisons — policy is by canonical evidence",
    nameSniff.length === 0, nameSniff.join(", "));

  // ── ALL-ORDER REGRESSION PINS (no PDF identity; originals preserved) ───────
  const injRaw = read(INJECT);
  add("P19 retired stamping endpoint draws no text",
    (injRaw.match(/\.drawText\s*\(/g) ?? []).length === 0);
  add("P20 retired stamping endpoint does not delegate to a QR builder",
    !/buildQrVerificationPdf\s*\(/.test(src[INJECT]));
  add("P21 retired stamping endpoint has no verifiable-document allowlist",
    !/VERIFIABLE_DOC_TYPES/.test(injRaw));
  add("P22 provider delivery preserves document_url as final_url",
    /const\s+finalUrl\s*=\s*documentUrl\s*;/.test(submit));

  // ── DATABASE ARM: the boundary the TypeScript gates cannot be ──────────────
  const mig = read(MIGRATION);
  const migCode = stripComments(mig, true);
  add("P23 a BEFORE INSERT trigger on letter_verifications enforces the policy",
    /create trigger trg_letter_verifications_partner_isolation\s[\s\S]{0,200}?before insert on public\.letter_verifications/i.test(migCode));
  add("P24 the DB resolver refuses a partner-neutral order",
    /v_policy\s*<>\s*'pawtenant_branded'[\s\S]{0,300}?raise exception/i.test(migCode));
  add("P25 the DB resolver has NO permissive retail fallback",
    // The raise must be the FIRST statement of the unrecognised-origin branch.
    // A loose {0,200} window here silently matched the NEXT branch's raise, so a
    // planted `return 'pawtenant_branded'` went undetected — caught by the
    // negative control, which is exactly what it is for.
    !/else\s+return\s+'pawtenant_branded'/i.test(migCode) &&
    /v_origin\s*<>\s*'partner'\s*then\s*raise exception/i.test(migCode));
  add("P26 new DB function is revoked from anon AND authenticated by name",
    /revoke all on function public\.order_document_policy\(uuid\) from anon/i.test(migCode) &&
    /revoke all on function public\.order_document_policy\(uuid\) from authenticated/i.test(migCode));

  // ── The gate module itself must not acquire a permissive default ───────────
  const gateCode = stripComments(read(GATE));
  add("P27 gate never returns allowed:true from a failure branch",
    !/error[\s\S]{0,120}?allowed:\s*true/.test(gateCode));
  add("P28 gate owns the READ (callers cannot hand it an under-selected row)",
    /PARTNER_POLICY_COLUMNS/.test(gateCode) && /\.from\(\s*"orders"\s*\)/.test(read(GATE)));

  // partnerPolicy must stay fail-closed — it is what every arm depends on.
  const policyCode = stripComments(read(POLICY));
  add("P29 partnerPolicy still throws (not defaults) on unknown origin",
    /policy_origin_unrecognised/.test(policyCode) && /policy_origin_unknown/.test(policyCode));
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
  /**
   * Each control introduces the ACTUAL defect this slice exists to prevent —
   * not a syntactic tripwire. If a control is ever "MISSED", the corresponding
   * check is decorative.
   */
  const CONTROLS = [
    { name: "partner order allowed through the QR/branding gate", file: GATE, expect: "P1",
      from: "    if (decision.neutralDocuments) {",
      to: "    if (false && decision.neutralDocuments) {" },
    { name: "unknown classification falls back to permissive retail", file: GATE, expect: "P5",
      from: "      allowed: false,\n      reason: PARTNER_POLICY_UNRESOLVED,\n      detail: `order policy could not be determined (${code}); refusing to brand a document`,\n      decision: null,",
      to: "      allowed: true,\n      reason: null,\n      detail: `unknown policy (${code}) — treating as retail`,\n      decision: null," },
    { name: "a failed policy read proceeds instead of refusing", file: GATE, expect: "P7",
      from: "  if (error || !data) {\n    return {\n      allowed: false,",
      to: "  if (error || !data) {\n    return {\n      allowed: true," },
    { name: "provider-submit-letter starts mutating the PDF again", file: SUBMIT, expect: "P14",
      from: "    const finalUrl = documentUrl;",
      to: "    const finalUrl = await injectPdfVerification(documentUrl);" },
    { name: "REVISION path bypasses the gate (retry/revision hole)", file: SUBMIT, expect: "P13",
      from: "          if (mayBrand) {\n            const { data: mintedId, error: mintErr } = await supabase.rpc(",
      to: "          if (true) {\n            const { data: mintedId, error: mintErr } = await supabase.rpc(" },
    { name: "first-letter verification mint bypasses the gate", file: SUBMIT, expect: "P12",
      from: "    if (mayBrand && state && state.length === 2 && !isRevision) {",
      to: "    if (state && state.length === 2 && !isRevision) {" },
    { name: "inject-pdf-footer retirement marker is removed", file: INJECT, expect: "P15",
      from: "pdf_verification_stamping_retired",
      to: "pdf_verification_stamping_active" },
    { name: "issue-letter-verification creates the record before the gate", file: ISSUE, expect: "P16",
      from: "    const brandingGate = await mayBrandOrderDocuments(supabase, orderId);",
      to: "    const brandingGate = { allowed: true, reason: null, detail: \"\" };" },
    { name: "QR generator retirement marker is removed", file: QRV2, expect: "P17",
      from: "pdf_verification_stamping_retired",
      to: "pdf_verification_stamping_active" },
    { name: "policy decided by partner NAME instead of canonical evidence", file: GATE, expect: "P18",
      from: "    const decision = resolveOrderPolicy(data);",
      to: "    if (String(data.confirmation_id).toLowerCase().includes(\"rapid\")) return { allowed: false, reason: PARTNER_NEUTRAL_REFUSAL, detail: \"\", decision: null };\n    const decision = resolveOrderPolicy(data);" },
    { name: "DB trigger removed (revision path loses its only real boundary)", file: MIGRATION, expect: "P23",
      from: "create trigger trg_letter_verifications_partner_isolation",
      to: "create trigger trg_letter_verifications_partner_isolation_DISABLED_x" },
    { name: "DB resolver gains a permissive retail fallback", file: MIGRATION, expect: "P25",
      from: "  if v_origin <> 'partner' then\n    raise exception 'partner policy: order % has an unrecognised order_origin; refusing to guess', p_order_id\n      using errcode = 'check_violation';\n  end if;",
      to: "  if v_origin <> 'partner' then\n    return 'pawtenant_branded';\n  end if;" },
    { name: "retired endpoint draws identity text on a letter", file: INJECT, expect: "P19",
      from: "  return json({",
      to: "  pdfDoc.getPage(0).drawText(\"verification\");\n  return json({" },
    { name: "retired endpoint restores a verifiable-document allowlist", file: INJECT, expect: "P21",
      from: "const SUPABASE_URL = Deno.env.get(\"SUPABASE_URL\")!;",
      to: "const VERIFIABLE_DOC_TYPES = new Set([\"esa_letter\", \"psd_letter\"]);\nconst SUPABASE_URL = Deno.env.get(\"SUPABASE_URL\")!;" },
    { name: "new DB function left executable by authenticated", file: MIGRATION, expect: "P26",
      from: "revoke all on function public.order_document_policy(uuid) from authenticated;",
      to: "-- (revoke removed)" },
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
        } catch { caught = true; } // a control that breaks the module also counts as detected
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) missed++;
        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    // NEVER process.exit() here: `finally` would be skipped and a planted
    // mutation would stay on disk.
    for (const [rel, content] of originals) writeFileSync(join(ROOT, rel), content, "utf8");
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - missed}/${CONTROLS.length} controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  process.exitCode = report("PARTNER DOCUMENT / QR / FOOTER / VERIFICATION ISOLATION") ? 1 : 0;
}
