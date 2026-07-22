#!/usr/bin/env node
// ADMIN-PROVIDER-PORTAL-PREVIEW-001 — regression guard.
//
// Locks in the security + read-only contract for the admin "Preview as Provider"
// mode so a future edit can't silently:
//   • let the preview write to the provider's data (drop a read-only guard),
//   • authorize on an insecure URL param / email instead of the admin session,
//   • leak a service-role key into the browser,
//   • skip the audit log or make it non-idempotent,
//   • or forget to fully reset state when switching providers.
//
// STATIC only — assert required invariants are present and forbidden regressions
// are absent across the preview wrapper, the reused portal, and its sub-panels.
//
// Usage:
//   node scripts/check-provider-portal-preview.mjs             # guard TEST source
//   node scripts/check-provider-portal-preview.mjs --self-test # prove the guard works
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const P = (...parts) => join(SRC, ...parts);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const FILES = {
  portal: P("pages", "provider-portal", "page.tsx"),
  wrapper: P("pages", "admin-orders", "components", "AdminProviderPreview.tsx"),
  orderDetail: P("pages", "provider-portal", "components", "ProviderOrderDetail.tsx"),
  license: P("pages", "provider-portal", "components", "ProviderLicensePanel.tsx"),
  profile: P("pages", "provider-portal", "components", "ProviderProfilePanel.tsx"),
  notes: P("components", "feature", "SharedNotesPanel.tsx"),
  doctorsTab: P("pages", "admin-orders", "components", "DoctorsTab.tsx"),
  orderModal: P("pages", "admin-orders", "components", "OrderDetailModal.tsx"),
};

function read(file) {
  return readFileSync(file, "utf8");
}

// REQUIRED: each regex must be found in the named file.
const REQUIRED = [
  // ── Portal reuse + read-only plumbing ──
  ["portal", "previewContext prop on the real portal", /previewContext\?\s*:\s*ProviderPreviewContext/],
  ["portal", "readOnly derived from preview mode", /const\s+readOnly\s*=\s*previewMode/],
  ["portal", "preview scopes to TARGET provider user_id", /\.eq\("user_id",\s*previewContext\.providerUserId\)/],
  ["portal", "FAIL CLOSED on missing target (no admin fallback)", /if\s*\(!target\)\s*\{\s*setProfile\(null\)/],
  ["portal", "markNotificationsRead guarded in-handler", /markNotificationsRead\s*=\s*async\s*\(\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/],
  ["portal", "handleSignOut guarded in-handler", /handleSignOut\s*=\s*async\s*\(\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/],
  ["portal", "persistent admin-preview banner", /Admin Preview — Provider Portal/],
  ["portal", "sub-panels receive readOnly (earnings)", /<ProviderEarnings[^>]*readOnly=\{readOnly\}/],
  ["portal", "sub-panels receive readOnly (license)", /<ProviderLicensePanel[^>]*readOnly=\{readOnly\}/],
  ["portal", "sub-panels receive readOnly (profile)", /<ProviderProfilePanel[^>]*readOnly=\{readOnly\}/],
  ["portal", "order detail receives readOnly", /readOnly=\{readOnly\}/],

  // ── Wrapper: server auth + audit + resolution + fail-closed + switch reset ──
  ["wrapper", "server-side admin authorization", /functions\/v1\/check-admin-status/],
  ["wrapper", "audit action logged", /action:\s*"provider_portal_preview_accessed"/],
  ["wrapper", "idempotent audit guard (StrictMode/remount safe)", /auditedKeys\.current\.has\(/],
  ["wrapper", "deep link keyed on provider user_id param", /searchParams\.get\("provider"\)/],
  ["wrapper", "provider resolved by user_id (not email)", /\.eq\("user_id",\s*providerUserId\)/],
  ["wrapper", "FAIL CLOSED when provider unresolved", /if\s*\(!prof\)\s*\{\s*setPhase\("not_found"\)/],
  ["wrapper", "order-ownership validation before opening", /doctor_user_id\s*===\s*resolved\.user_id/],
  ["wrapper", "order mismatch surfaced", /setOrderMismatch/],
  ["wrapper", "portal remounts on provider switch (state reset)", /key=\{provider\.user_id\}/],
  ["wrapper", "preview is read-only", /readOnly:\s*true/],

  // ── In-handler read-only enforcement in write-capable panels ──
  ["notes", "SharedNotesPanel accepts readOnly", /readOnly\?\s*:\s*boolean/],
  ["notes", "note send guarded in-handler", /handleSend\s*=\s*async\s*\(\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/],
  ["notes", "note delete guarded in-handler", /handleDelete\s*=\s*async\s*\([^)]*\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/],
  ["profile", "bio save guarded in-handler", /handleSave\s*=\s*async\s*\(\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/],

  // ── Entry points ──
  ["doctorsTab", "Providers-list Preview Portal entry", /\/admin\/provider-preview\?provider=/],
  ["orderModal", "Order Details Provider View entry", /\/admin\/provider-preview\?provider=/],
];

// COUNT: a regex that must appear at least `min` times in the named file.
const COUNTS = [
  ["orderDetail", "every order-detail write handler is guarded", /if\s*\(readOnly\)\s*return;/g, 4],
  ["license", "every license write handler is guarded", /if\s*\(readOnly\)\s*\{/g, 4],
];

// FORBIDDEN: each regex must be ABSENT in the named file.
const FORBIDDEN = [
  ["wrapper", "no service-role key in the browser preview", /SERVICE_ROLE/],
  ["portal", "no service-role key in the browser portal", /SERVICE_ROLE/],
  ["wrapper", "provider not authorized by email param", /get\("provider_email"\)/],
];

function runStatic() {
  const cache = {};
  const get = (k) => (cache[k] ??= read(FILES[k]));
  const failures = [];

  for (const [key, label, re] of REQUIRED) {
    if (!re.test(get(key))) failures.push(`REQUIRED missing [${key}]: ${label}`);
  }
  for (const [key, label, re, min] of COUNTS) {
    const n = (get(key).match(re) ?? []).length;
    if (n < min) failures.push(`COUNT too low [${key}]: ${label} (found ${n}, need ${min})`);
  }
  for (const [key, label, re] of FORBIDDEN) {
    if (re.test(get(key))) failures.push(`FORBIDDEN present [${key}]: ${label}`);
  }

  if (failures.length) {
    console.error(`${RED}✗ provider-portal-preview guard FAILED${RESET}`);
    for (const f of failures) console.error(`  ${RED}✗${RESET} ${f}`);
    return 1;
  }
  console.log(
    `${GREEN}✓ provider-portal-preview guard passed${RESET} ` +
    `(${REQUIRED.length} invariants, ${COUNTS.length} counts, ${FORBIDDEN.length} negative controls)`,
  );
  return 0;
}

// ── self-test: prove the detectors actually catch a regression ──────────────
function runSelfTest() {
  const results = [];
  const ok = (name, pass) => results.push({ name, pass });

  // A read-only handler with its guard REMOVED must be caught.
  const guardRe = /handleSend\s*=\s*async\s*\(\)\s*=>\s*\{\s*\n\s*if\s*\(readOnly\)\s*return;/;
  ok("detects present read-only guard", guardRe.test('handleSend = async () => {\n    if (readOnly) return;\n'));
  ok("negative control: missing read-only guard is caught",
    !guardRe.test('handleSend = async () => {\n    const text = noteText.trim();\n'));

  // Idempotent-audit detector.
  const auditRe = /auditedKeys\.current\.has\(/;
  ok("detects idempotent audit guard", auditRe.test("if (!auditedKeys.current.has(auditKey)) {"));
  ok("negative control: non-idempotent audit is caught",
    !auditRe.test("void logAudit({ action: 'x' });"));

  // Email-as-authorization detector (forbidden).
  const emailAuthRe = /get\("provider_email"\)/;
  ok("negative control: email-param authorization would be flagged",
    emailAuthRe.test('const providerEmail = searchParams.get("provider_email");'));
  ok("user_id param is NOT flagged as email auth",
    !emailAuthRe.test('const providerUserId = searchParams.get("provider");'));

  // Service-role leak detector (forbidden).
  const srRe = /SERVICE_ROLE/;
  ok("negative control: service-role token in browser is caught",
    srRe.test("const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;"));

  // Count detector: fewer than N guards must fail.
  const countRe = /if\s*\(readOnly\)\s*return;/g;
  ok("count detector matches multiple guards",
    ("if (readOnly) return; if (readOnly) return;".match(countRe) ?? []).length === 2);

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}`);
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
console.log(`${YELLOW}provider-portal-preview — ${selfTest ? "self-test (detectors + negative controls)" : "guard (static contract)"}${RESET}`);
process.exit(selfTest ? runSelfTest() : runStatic());
