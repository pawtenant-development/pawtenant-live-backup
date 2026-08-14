#!/usr/bin/env node
// check-document-qr-boundary.mjs — DOC-QR-BOUNDARY-001
//
// ONLY an authoritative final clinical letter may carry a verification QR.
//
//   VERIFIABLE : esa_letter, psd_letter
//   NEVER      : customer_upload, landlord_form, housing_completed,
//                ra_completed_form, housing_verification, intake/source forms,
//                notary documents, supporting files, and every unknown or
//                future type.
//
// The rule is enforced in the FUNCTION, not the UI. A hidden button is not a
// boundary — anyone can call the endpoint directly — so this guard asserts the
// server refuses first, and only then that the admin surface agrees with it.
//
// ORDERING IS PART OF THE CONTRACT. The refusal must happen before the document
// is downloaded, before a PDF is built, before anything is uploaded and before
// any pointer or verification row is written, so a refused call leaves no trace.
//
// Run:  node scripts/check-document-qr-boundary.mjs
// Self: node scripts/check-document-qr-boundary.mjs --self-test
//
// The self-test is the control the spec demands: it adds `housing_completed`
// to the allowlist and requires the guard to FAIL.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FN = "supabase/functions/inject-pdf-footer/index.ts";
const MODAL = "src/pages/admin-orders/components/OrderDetailModal.tsx";

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);
const ok = (c, m) => (c ? pass(m) : fail(m));

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/^\s*\*.*$/gm, " ");

/** Every non-letter class that must be refused. */
const MUST_REFUSE = [
  "customer_upload", "landlord_form", "housing_completed", "ra_completed_form",
  "housing_verification", "intake_form", "source_form", "notary_document",
  "supporting_file", "signed_letter", "letter", "", null,
  "some_future_type_nobody_has_invented_yet",
];
const MUST_ALLOW = ["esa_letter", "psd_letter"];

/** Parse the allowlist actually present in the function source. */
function parseAllowlist(src) {
  const m = /VERIFIABLE_DOC_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(codeOnly(src));
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

function checkGateBehaviour(allowlist) {
  if (!allowlist) { fail("could not find VERIFIABLE_DOC_TYPES allowlist in the function"); return; }
  const set = new Set(allowlist);

  ok(set.size === 2, `allowlist holds exactly 2 types (found ${set.size}: ${allowlist.join(", ")})`);
  for (const t of MUST_ALLOW) ok(set.has(t), `${t} IS verifiable`);
  // The important half: fail-closed for everything else, unknown types included.
  const leaked = MUST_REFUSE.filter((t) => set.has(t ?? ""));
  ok(leaked.length === 0,
    leaked.length === 0
      ? "every RA / supporting / unknown type is refused"
      : `REFUSED TYPES LEAKED INTO THE ALLOWLIST: ${leaked.join(", ")}`);
}

function checkFunction(raw) {
  const c = codeOnly(raw);

  ok(/\.from\(\s*["']order_documents["']\s*\)/.test(c) && /\.eq\(\s*["']id["']\s*,\s*documentId\s*\)/.test(c),
    "resolves the authoritative row from order_documents by documentId");
  ok(/authoritativeDoc\.order_id\s*!==\s*orderId/.test(c),
    "verifies the document actually belongs to the supplied order");
  ok(/document_type_not_verifiable/.test(raw), "returns the stable document_type_not_verifiable code");

  // Caller-supplied file location must never be read.
  ok(!/const\s*\{[^}]*\bfileUrl\b[^}]*\}\s*=\s*body/.test(c),
    "does NOT destructure the caller-supplied fileUrl");
  ok(/authoritativeFileUrl\s*=\s*authoritativeDoc\.file_url/.test(c),
    "builds from the database's immutable original file_url");
  ok(!/downloadDocumentBytes\(\s*supabase\s*,\s*fileUrl\s*\)/.test(c),
    "never downloads from the caller-supplied URL");
  ok(!/downloadDocumentBytes\([^)]*processed_file_url/.test(c),
    "never rebuilds from an already-processed/stamped file");

  // ORDERING: the refusal must precede every side effect.
  const gate = c.indexOf("document_type_not_verifiable");
  const sideEffects = [
    // The CALL site, not the helper's declaration — the declaration necessarily
    // sits above the request handler and would always look "before the gate".
    ["download", c.search(/await\s+downloadDocumentBytes\(/)],
    ["storage upload", c.search(/\.upload\(/)],
    ["document update", c.search(/\.from\(\s*["']order_documents["']\s*\)[\s\S]{0,80}\.update\(/)],
    ["verification insert", c.search(/\.insert\(/)],
  ];
  for (const [label, at] of sideEffects) {
    if (at === -1) { pass(`no ${label} before the gate (absent)`); continue; }
    ok(gate !== -1 && gate < at, `gate is evaluated BEFORE ${label}`);
  }
}

function checkAdminSurface(raw) {
  const c = codeOnly(raw);
  const lists = [...c.matchAll(/\[\s*("esa_letter"|'esa_letter')[^\]]*\]/g)].map((m) => m[0]);
  ok(lists.length > 0, "admin surface gates injection controls on an explicit type list");
  const widened = lists.filter((l) => /signed_letter|letter"|housing|customer_upload|landlord/.test(
    l.replace(/"esa_letter"|"psd_letter"/g, ""),
  ));
  ok(widened.length === 0,
    widened.length === 0
      ? "no admin injection list is wider than the server allowlist"
      : `admin list wider than server allowlist: ${widened.join(" | ")}`);
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  console.log("NEGATIVE CONTROL — assertions below MUST fail.\n");
  const before = failures;

  console.log("[1] housing_completed added to the server allowlist:");
  checkGateBehaviour(["esa_letter", "psd_letter", "housing_completed"]);

  console.log("\n[2] function reverted to trusting the caller's fileUrl:");
  checkFunction(
    read(FN)
      .replace(/const \{ orderId, confirmationId, documentId, letterId, forceReInject \} = body;/,
        "const { orderId, confirmationId, documentId, fileUrl, letterId, forceReInject } = body;")
      .replace(/document_type_not_verifiable/g, "removed_gate")
      .replace(/downloadDocumentBytes\(supabase, authoritativeFileUrl\)/, "downloadDocumentBytes(supabase, fileUrl)"),
  );

  console.log("\n[3] admin surface widened back to signed_letter/letter:");
  checkAdminSurface(read(MODAL).replace(/\["esa_letter", "psd_letter"\]/g,
    '["esa_letter", "psd_letter", "signed_letter", "letter"]'));

  const tripped = failures - before;
  const EXPECTED_MIN = 6;
  console.log("");
  if (tripped >= EXPECTED_MIN) {
    console.log(`✅ SELF-TEST PASSED — ${tripped} assertions tripped (>= ${EXPECTED_MIN}).`);
    console.log("   Adding housing_completed to the allowlist DOES break the guard, as required.");
    process.exit(0);
  }
  console.error(`❌ SELF-TEST FAILED — only ${tripped} tripped, expected >= ${EXPECTED_MIN}.`);
  process.exit(1);
}

console.log("DOC-QR-BOUNDARY-001 — only ESA/PSD letters may receive a QR\n");
const fnSrc = read(FN);
console.log("Allowlist behaviour (fail closed for everything else):");
checkGateBehaviour(parseAllowlist(fnSrc));
console.log("\nFunction enforcement:");
checkFunction(fnSrc);
console.log("\nAdmin surface agrees with the server:");
checkAdminSurface(read(MODAL));

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✅ QR injection is confined to authoritative ESA/PSD letters.");
