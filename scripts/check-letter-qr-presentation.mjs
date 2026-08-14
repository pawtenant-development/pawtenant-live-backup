// scripts/check-letter-qr-presentation.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 — QR-ONLY presentation guard.
//
// WHAT THIS PINS. A PawTenant letter must carry a bare QR code and nothing else
// that names the vendor or the verification system. A recipient who reads
// "Verification ID: ESA-.." and "pawtenant.com/verify/.." off a clinical letter
// learns it was produced by a website, which is exactly the impression the
// owner requires the document not to give.
//
//   P1  the shared QR module draws NO text at all.
//   P2  the shared module draws no plate border (a boxed code reads as a stamp).
//   P3  inject-pdf-footer — the CUSTOMER-FACING generator, whose output is
//       served as processed_file_url — prints no Verification ID, URL or label.
//   P4  inject-pdf-footer routes through the shared module, so it inherits the
//       content-bounds placement rather than stamping blindly.
//   P5  the QR size constants stay inside the owner's 0.75-0.9in print band.
//   P6  the sample builder encodes the ID-only contract with no `?token=`.
//   P7  no build path reads a demo token from an env var or a local token file.
//   P8  the TEST scan artifacts target the TEST host and carry no token.
//
// ASSERTIONS ARE MADE AGAINST CODE, NOT PROSE. Comments and string literals are
// stripped before every "must NOT contain" scan: the files legitimately DISCUSS
// the removed wording in their headers, and a guard that matched a comment
// would fire on the explanation of the fix instead of on the fix regressing.
//
//   node scripts/check-letter-qr-presentation.mjs
//   node scripts/check-letter-qr-presentation.mjs --self-test

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = process.argv.includes("--self-test");

const F = {
  mod: "supabase/functions/_shared/qrVerificationPdf.ts",
  v1: "supabase/functions/inject-pdf-footer/index.ts",
  v2: "supabase/functions/generate-qr-verification-pdf/index.ts",
  build: "scripts/build-sample-letter-assets.mjs",
  artifacts: "scripts/build-test-scan-artifacts.mjs",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing file: ${F[key]}`);
  // Normalise to LF. The self-test mutates these sources at multi-line LF
  // anchors; on a CRLF checkout those anchors miss and the negative control
  // degrades to a NO-OP — a control that cannot fail proves nothing.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip line comments, block comments and string/template literals. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** Strings the module could actually draw: literals passed to drawText. */
function drawTextCalls(src) {
  return [...src.matchAll(/\.drawText\s*\(/g)].length;
}

function run(override) {
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  const mod = read("mod", override);
  const v1 = read("v1", override);
  const v2 = read("v2", override);
  const build = read("build", override);
  const artifacts = read("artifacts", override);

  // P1 — the shared module draws no text.
  add("P1", "shared QR module makes ZERO drawText calls", drawTextCalls(mod) === 0);

  // P2 — no border on the QR plate.
  add("P2", "shared QR module draws no plate border",
    !/borderColor|borderWidth/.test(codeOnly(mod)));

  // P3 — the customer-facing generator prints nothing.
  const v1code = codeOnly(v1);
  add("P3a", "inject-pdf-footer makes ZERO drawText calls", drawTextCalls(v1) === 0);
  add("P3b", "inject-pdf-footer builds no 'Verification ID' / verify-URL string",
    !/Verification ID/i.test(v1) || !new RegExp("Verification ID\\s*:?\\s*[\"'`]").test(v1code));
  add("P3c", "inject-pdf-footer no longer embeds fonts for its own text",
    !/embedFont/.test(v1code));

  // P4 — v1 routes through the shared, content-aware placement.
  add("P4", "inject-pdf-footer delegates to buildQrVerificationPdf",
    /buildQrVerificationPdf/.test(v1code) && /_shared\/qrVerificationPdf/.test(v1));

  // P5 — printed size band.
  const target = Number(mod.match(/QR_TARGET_PT\s*=\s*([\d.]+)/)?.[1]);
  add("P5a", `QR_TARGET_PT (${target}pt) is inside 0.75-0.90in (54-64.8pt)`,
    Number.isFinite(target) && target >= 54 && target <= 64.8);
  add("P5b", "the 4-module quiet zone is still mandated",
    /QUIET_ZONE_MODULES\s*=\s*4/.test(mod));

  // P6 — the sample builder encodes the ID-only contract.
  const bcode = codeOnly(build);
  add("P6a", "sample builder does NOT append a token query parameter",
    !/token=/.test(build.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")));
  add("P6b", "sample builder builds the URL from the Verification ID alone",
    /verifyBase\s*\}\s*\/\s*\$\{|\$\{CFG\.verifyBase\}\/\$\{/.test(build) || /verifyBase\}\/\$\{/.test(build));

  // P7 — no token plumbing anywhere in the build paths.
  add("P7a", "no SAMPLE_QR_TOKEN_* env var is read by any build script",
    !/SAMPLE_QR_TOKEN/.test(build) && !/SAMPLE_QR_TOKEN/.test(artifacts));
  add("P7b", "no gitignored local token file is read",
    !/sample-letter-tokens/.test(build) && !/sample-letter-tokens/.test(artifacts));
  add("P7c", "no 22-char base64url literal appears in any build script",
    !/["'`][A-Za-z0-9_-]{22}["'`]/.test(build) && !/["'`][A-Za-z0-9_-]{22}["'`]/.test(artifacts));

  // P8 — TEST artifacts stay on the TEST host and out of public/.
  add("P8a", "scan artifacts target the TEST verification host",
    /testVerifyBase/.test(artifacts));
  add("P8b", "scan artifacts are written OUTSIDE public/",
    /docs\/qa-artifacts/.test(artifacts) && !/["'`]public\//.test(artifacts));

  // v2 must keep encoding the non-enumerable token for genuine letters.
  add("P9", "generate-qr-verification-pdf still encodes the opaque token route",
    /\/v\/t\/\$\{token\}/.test(v2));

  return r;
}

if (SELF) {
  console.log("[check-letter-qr-presentation] self-test — each control must TRIP\n");
  const mod = read("mod");
  const v1 = read("v1");
  const build = read("build");
  const artifacts = read("artifacts");

  const CONTROLS = [
    ["P1", "a caption is redrawn in the shared module",
      { mod: mod.replace("  return m;\n}", '  page.drawText("Scan to verify", { x, y, size: 6, font });\n  return m;\n}') }],
    ["P2", "the plate border comes back",
      { mod: mod.replace(
        "width: m.width, height: m.height, color: rgb(1, 1, 1) });",
        "width: m.width, height: m.height, color: rgb(1, 1, 1), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });") }],
    ["P3a", "inject-pdf-footer draws text again",
      { v1: v1.replace("let processedBytes: Uint8Array;", 'firstPage.drawText("Verification ID:", {});\n    let processedBytes: Uint8Array;') }],
    ["P4", "inject-pdf-footer stops using the shared module",
      { v1: v1.replaceAll("buildQrVerificationPdf", "legacyStamp") }],
    ["P5a", "the QR is resized out of the print band",
      { mod: mod.replace(/QR_TARGET_PT = 61/, "QR_TARGET_PT = 90") }],
    ["P6a", "the inert token parameter is reintroduced",
      { build: build.replace("${CFG.verifyBase}/${CFG.esa.id}", "${CFG.verifyBase}/${CFG.esa.id}?token=x") }],
    ["P7a", "a token env var is read again",
      { build: build.replace("const CHECK =", "const T = process.env.SAMPLE_QR_TOKEN_ESA;\nconst CHECK =") }],
    ["P8b", "artifacts are written into public/",
      { artifacts: artifacts.replace('"docs/qa-artifacts"', '"public/qa-artifacts"') }],
  ];

  let bad = 0;
  for (const [target, label, override] of CONTROLS) {
    const key = Object.keys(override)[0];
    const changed = override[key] !== read(key);
    const hit = run(override).find((x) => x.id === target);
    const tripped = changed && hit && !hit.ok;
    if (!tripped) bad++;
    console.log(`  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(5)} ${label}`);
  }
  console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
  process.exit(bad === 0 ? 0 : 1);
}

const results = run();
for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(5)} ${x.desc}`);
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
