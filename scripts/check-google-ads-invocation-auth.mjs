// scripts/check-google-ads-invocation-auth.mjs
//
// GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-CLOSURE — release-safety guard.
//
// WHY THIS EXISTS (verified defect):
// sync-google-ads-conversions is deployed with verify_jwt=true, which reads as
// "authenticated" but is not: the PUBLIC anon key is a valid project JWT, so the
// Supabase gateway admits it. Every admin-UI call site was ALSO sending
// `Authorization: Bearer <VITE_PUBLIC_SUPABASE_ANON_KEY>` instead of the signed-in
// admin's session token — a key that ships inside the published JS bundle. Anyone
// who read that bundle could POST mode:"backfill" / "retry_failed" /
// "retry_gclid_upgraded" / "single" and drive uploads into the PRIMARY,
// bidding-critical Google Ads conversion action.
//
// WHAT IT PROVES
//   A. BEHAVIOUR — the real invocationAuth.ts is bundled with esbuild and EXECUTED
//      against the full role x mode matrix with stubbed dependencies. Not a text scan.
//   B. ORDERING  — authorization runs before order selection, email hashing, the
//      Google OAuth token request, payload construction and any status mutation.
//   C. NO BYPASS — no mode, and not forceUpload, routes around it.
//   D. NO TRUST  — an unprovisioned cron secret cannot be satisfied by merely
//      sending the header; the anon key is never treated as an identity.
//   E. CALLERS   — no admin call site sends the anon key as Authorization any more.
//
// Usage:
//   node scripts/check-google-ads-invocation-auth.mjs             → guard (exit 1 on fail)
//   node scripts/check-google-ads-invocation-auth.mjs --warn-only → audit (exit 0)
//   node scripts/check-google-ads-invocation-auth.mjs --self-test → prove the controls trip
//
// LIVE ADAPTATION (GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION):
// LIVE's uploader carries a read-only inspect_conversion_action mode that no Admin
// UI calls (internal-only), and has NO apply_refund_adjustments handler — so a
// known-but-unimplemented mode (or a "single" call with no confirmationId) must be
// refused explicitly instead of falling through into the default backfill. Control
// N16 plants that fall-through.

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const AUTH     = "supabase/functions/sync-google-ads-conversions/invocationAuth.ts";
const UPLOADER = "supabase/functions/sync-google-ads-conversions/index.ts";
const HELPER   = "src/lib/adminFunctionAuth.ts";
const CALLERS  = [
  "src/pages/admin-orders/components/GoogleAdsSyncPanel.tsx",
  "src/pages/admin-orders/components/GoogleOAuthPanel.tsx",
  "src/pages/admin-orders/components/UnifiedBackfillPanel.tsx",
];

// ── SINGLE read point; CRLF normalised HERE and nowhere else, so an LF-written
//    planted control can never silently "pass" against a CRLF file. ──
function read(root, rel) {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip ONLY comments, keeping string/template literals. Needed where the
 * assertion is about what a literal is assigned TO (e.g. the Authorization
 * header's value), which full literal-stripping would erase.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Strip comments and string/template literals — assert USE, never a mention. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const failures = [];
let checks = 0;
function ok(cond, label) {
  checks++;
  if (!cond) failures.push(label);
}

async function loadAuth(root) {
  const out = join(mkdtempSync(join(tmpdir(), "pt-authz-")), "authz.mjs");
  await build({
    entryPoints: [join(root, AUTH)],
    bundle: true, format: "esm", platform: "neutral", target: "es2022",
    outfile: out, logLevel: "silent",
  });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

// ── Stub identities. No network, no Supabase. ───────────────────────────────
const SERVICE_KEY = "service-role-key-value-aaaaaaaaaaaaaaaaaaaaaaaa";
const ANON_KEY    = "anon-public-key-value-bbbbbbbbbbbbbbbbbbbbbbbbbb";
const CRON_SECRET = "cron-secret-value-cccccccccccccccccccccccccccc";
const LEGACY_SERVICE_JWT = "legacy-service-role-jwt-dddddddddddddddddddd";

const USERS = {
  "tok-admin-flag":  { id: "u-admin-1", profile: { is_admin: true,  role: null } },
  "tok-admin-owner": { id: "u-admin-2", profile: { is_admin: false, role: "owner" } },
  "tok-admin-mgr":   { id: "u-admin-3", profile: { is_admin: null,  role: "admin_manager" } },
  "tok-admin-supp":  { id: "u-admin-4", profile: { is_admin: false, role: "support" } },
  "tok-customer":    { id: "u-cust-1",  profile: null },
  "tok-customer-2":  { id: "u-cust-2",  profile: { is_admin: false, role: "customer" } },
  "tok-provider":    { id: "u-doc-1",   profile: { is_admin: false, role: "doctor" } },
  "tok-staff":       { id: "u-staff-1", profile: { is_admin: false, role: "staff" } },
  "tok-finance":     { id: "u-fin-1",   profile: { is_admin: false, role: "finance" } },
};

function makeDeps(over = {}) {
  return {
    serviceRoleKey: SERVICE_KEY,
    cronSecret: CRON_SECRET,
    getUser: async (token) => (USERS[token] ? { id: USERS[token].id } : null),
    getAdminProfile: async (userId) => {
      const hit = Object.values(USERS).find((u) => u.id === userId);
      return hit ? hit.profile : null;
    },
    // Only a genuine service-role credential passes the capability probe.
    probeServiceRole: async (token) => token === LEGACY_SERVICE_JWT || token === SERVICE_KEY,
    ...over,
  };
}

const req = (headers = {}) => ({
  headers: {
    get(name) {
      const k = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
      return k === undefined ? null : headers[k];
    },
  },
});
const bearer = (t) => req({ Authorization: `Bearer ${t}` });

async function runBehaviour(root) {
  const A = await loadAuth(root);
  const call = (r, mode, deps = makeDeps()) => A.authorizeInvocation(r, mode, deps);

  const ADMIN_MODES = A.ADMIN_MODES;
  const INTERNAL_ONLY = A.INTERNAL_ONLY_MODES;

  ok(Array.isArray(ADMIN_MODES) && ADMIN_MODES.length >= 7, "ADMIN_MODES must enumerate the Admin UI's modes");
  for (const m of ["single", "backfill", "retry_failed", "retry_gclid_upgraded", "test_auth", "test_upload", "list_conversion_actions"]) {
    ok(ADMIN_MODES.includes(m), `ADMIN_MODES must contain the real UI mode "${m}"`);
  }
  ok(INTERNAL_ONLY.includes("apply_refund_adjustments"),
    "apply_refund_adjustments must be internal-only — it restates/retracts live conversions");
  ok(INTERNAL_ONLY.includes("inspect_conversion_action") && !ADMIN_MODES.includes("inspect_conversion_action"),
    "inspect_conversion_action (LIVE-only diagnostic, no UI caller) must be internal-only");

  // ── 1. No Authorization header at all → 401 ────────────────────────────────
  for (const m of [...ADMIN_MODES, ...INTERNAL_ONLY]) {
    const r = await call(req({}), m);
    ok(r.authorized === false && r.status === 401, `matrix 1: no bearer must be 401 for mode "${m}"`);
  }

  // ── 2. Public anon JWT → refused for EVERY mode ────────────────────────────
  for (const m of [...ADMIN_MODES, ...INTERNAL_ONLY]) {
    const r = await call(bearer(ANON_KEY), m);
    ok(r.authorized === false, `matrix 2: the PUBLIC ANON KEY must be refused for mode "${m}"`);
    ok(r.status === 401, `matrix 2: anon key must be 401 (not 200/403) for mode "${m}"`);
  }

  // ── 3/4/5. Authenticated but not admin → 403, never 200 ────────────────────
  for (const [tok, label] of [
    ["tok-customer", "customer with no profile row"],
    ["tok-customer-2", "customer with role=customer"],
    ["tok-provider", "provider (doctor)"],
    ["tok-staff", "non-admin staff"],
    ["tok-finance", "finance role (not an ads admin)"],
  ]) {
    for (const m of [...ADMIN_MODES, ...INTERNAL_ONLY]) {
      const r = await call(bearer(tok), m);
      ok(r.authorized === false, `matrix 3-5: ${label} must be refused for mode "${m}"`);
      ok(r.status === 403, `matrix 3-5: ${label} must be 403 for mode "${m}"`);
    }
  }

  // ── 6. Admin → allowed for UI modes, refused for internal-only ─────────────
  for (const tok of ["tok-admin-flag", "tok-admin-owner", "tok-admin-mgr", "tok-admin-supp"]) {
    for (const m of ADMIN_MODES) {
      const r = await call(bearer(tok), m);
      ok(r.authorized === true && r.status === 200 && r.kind === "admin_user",
        `matrix 6: admin "${tok}" must be allowed for UI mode "${m}"`);
      ok(typeof r.actorId === "string" && r.actorId.length > 0,
        `matrix 6: an authorized admin must carry an actorId for auditing (mode "${m}")`);
    }
    for (const m of INTERNAL_ONLY) {
      const r = await call(bearer(tok), m);
      ok(r.authorized === false && r.status === 403,
        `matrix 6: admin "${tok}" must NOT reach internal-only mode "${m}"`);
    }
  }

  // ── 7. Valid internal callers ──────────────────────────────────────────────
  for (const m of [...ADMIN_MODES, ...INTERNAL_ONLY]) {
    const svc = await call(bearer(SERVICE_KEY), m);
    ok(svc.authorized === true && svc.kind === "internal_service",
      `matrix 7: the service-role bearer must be allowed for mode "${m}"`);
    const cron = await call(req({ "x-cron-secret": CRON_SECRET }), m);
    ok(cron.authorized === true && cron.kind === "internal_cron",
      `matrix 7: a matching cron secret must be allowed for mode "${m}"`);
  }
  // A legacy service-role JWT that is NOT string-equal still passes by capability.
  const legacy = await call(bearer(LEGACY_SERVICE_JWT), "single");
  ok(legacy.authorized === true && legacy.kind === "internal_service",
    "matrix 7: a service-role credential proven by capability probe must be allowed");

  // ── 8. Invalid internal credentials ────────────────────────────────────────
  ok((await call(req({ "x-cron-secret": "wrong-secret-value" }), "backfill")).authorized === false,
    "matrix 8: a WRONG cron secret must be refused");
  ok((await call(req({ "x-cron-secret": "" }), "backfill")).authorized === false,
    "matrix 8: an EMPTY cron secret header must be refused");
  ok((await call(bearer("forged-token"), "backfill")).authorized === false,
    "matrix 8: a forged bearer must be refused");

  // An UNPROVISIONED secret must make the header branch unsatisfiable — merely
  // sending the header (even empty, even matching the empty config) proves nothing.
  const noCron = makeDeps({ cronSecret: "" });
  for (const v of ["", "anything", "true", "undefined", "null"]) {
    const r = await call(req({ "x-cron-secret": v }), "backfill", noCron);
    ok(r.authorized === false,
      `matrix 8: with NO cron secret provisioned, x-cron-secret:"${v}" must not authorize`);
  }
  // Same for an unprovisioned service key.
  const noSvc = makeDeps({ serviceRoleKey: "", probeServiceRole: async () => false });
  ok((await call(bearer(""), "backfill", noSvc)).authorized === false,
    "matrix 8: an empty bearer with an empty service key must not match by empty-string equality");
  ok((await call(bearer("x"), "backfill", noSvc)).authorized === false,
    "matrix 8: an unprovisioned service key must not authorize an arbitrary bearer");

  // ── 10. Unknown / injected modes are refused, never defaulted to backfill ──
  for (const m of ["", "wipe", "backfill ", "BACKFILL", "apply_refund_adjustments ", "__proto__"]) {
    ok((await call(bearer("tok-admin-flag"), m)).authorized === false,
      `matrix 10: unknown mode "${m}" must be refused rather than defaulting to backfill`);
  }

  // ── Robustness: a throwing dependency must fail CLOSED, never open ─────────
  const boom = makeDeps({
    getUser: async () => { throw new Error("network"); },
    probeServiceRole: async () => { throw new Error("network"); },
  });
  ok((await call(bearer("tok-admin-flag"), "backfill", boom)).authorized === false,
    "a throwing getUser/probe must fail closed");
  const boomProfile = makeDeps({ getAdminProfile: async () => { throw new Error("network"); } });
  ok((await call(bearer("tok-admin-flag"), "backfill", boomProfile)).authorized === false,
    "a throwing getAdminProfile must fail closed");

  // ── secretsMatch primitive ────────────────────────────────────────────────
  ok(A.secretsMatch("abc", "abc") === true, "secretsMatch must accept an exact match");
  ok(A.secretsMatch("", "") === false, "secretsMatch must REFUSE empty-vs-empty (unset secret)");
  ok(A.secretsMatch("abc", "") === false, "secretsMatch must refuse an unset expected secret");
  ok(A.secretsMatch("", "abc") === false, "secretsMatch must refuse an empty provided secret");
  ok(A.secretsMatch("abcd", "abc") === false, "secretsMatch must refuse a length mismatch");
  ok(A.secretsMatch(undefined, "abc") === false, "secretsMatch must refuse a non-string");

  // ── PRIVACY: no credential may appear in a result ─────────────────────────
  const results = [
    await call(bearer(SERVICE_KEY), "single"),
    await call(bearer(ANON_KEY), "single"),
    await call(req({ "x-cron-secret": CRON_SECRET }), "single"),
    await call(bearer("tok-admin-flag"), "single"),
  ];
  const blob = JSON.stringify(results);
  for (const secret of [SERVICE_KEY, ANON_KEY, CRON_SECRET, LEGACY_SERVICE_JWT]) {
    ok(!blob.includes(secret), "PRIVACY: an authorization result must never echo a key or secret");
  }

  // ── forceUpload can play no part: the decision never sees the body ─────────
  const authSrc = code(read(root, AUTH));
  ok(!authSrc.includes("forceUpload"),
    "forceUpload must not appear in the authorization module at all");
  ok(!/\bbody\b/.test(authSrc.replace(/[A-Za-z_$][\w$]*Body\b/g, "")),
    "the authorization decision must not read the request body beyond the mode it is given");
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiring + ordering inside the edge function.
// ─────────────────────────────────────────────────────────────────────────────
function runWiring(root) {
  const raw = read(root, UPLOADER);
  const src = code(raw);

  ok(raw.includes('from "./invocationAuth.ts"'), "the uploader must import ./invocationAuth.ts");
  ok(/authorizeInvocation\s*\(/.test(src), "the uploader must CALL authorizeInvocation");

  const serveAt = src.indexOf("serve(async (req)");
  ok(serveAt > 0, "the serve handler must exist");
  const serve = src.slice(serveAt);
  const rawServe = raw.slice(raw.indexOf("serve(async (req)"));

  const authAt = serve.indexOf("authorizeInvocation(");
  ok(authAt > 0, "authorizeInvocation must be called inside the request handler");

  ok(/if\s*\(\s*!\s*authz\.authorized\s*\)/.test(serve),
    "the handler must return early when authorization fails (an inverted or missing test fails here)");

  // Everything sensitive must come AFTER the authorization call.
  for (const [needle, label] of [
    ["sha256Hex(", "email hashing"],
    ["getAccessToken(", "the Google OAuth token request"],
    ["ensureAccessToken(", "the lazy OAuth token helper"],
    ["partitionByChannelGate(", "channel-gate order partitioning"],
    ["uploadConversionToGoogleAds(", "the Google Ads conversion upload"],
    ["uploadConversionAdjustmentToGoogleAds(", "the Google Ads adjustment upload"],
    ["listConversionActions(", "the Google Ads conversion-action listing"],
    ["persistChannelGateSkip(", "any upload-status mutation"],
    ['.from(""orders"")', "any order read"],
  ]) {
    const at = serve.indexOf(needle);
    if (at >= 0) ok(authAt < at, `authorization must run BEFORE ${label}`);
    else checks++;
  }
  // .from("orders") after literal-stripping becomes .from("")
  const firstOrderRead = serve.indexOf('.from(""');
  if (firstOrderRead >= 0) ok(authAt < firstOrderRead, "authorization must run BEFORE any table read");
  else checks++;

  // No mode branch may execute ahead of the authorization decision.
  const firstModeBranch = rawServe.search(/if \(mode === "/);
  const rawAuthAt = rawServe.indexOf("authorizeInvocation(");
  ok(rawAuthAt > 0 && firstModeBranch > 0 && rawAuthAt < firstModeBranch,
    "every mode branch must sit AFTER the authorization decision — no mode-specific bypass");

  // forceUpload must not be wired into the authorization call.
  const authCallBlock = serve.slice(authAt, authAt + 2000);
  ok(!authCallBlock.includes("forceUpload"),
    "forceUpload must not be passed into or consulted by the authorization decision");

  // The cron secret must be read from the environment, never hard-coded, and must
  // not silently fall back to another function's secret.
  ok(/Deno\.env\.get\(""\)/.test(code(raw).slice(0, code(raw).indexOf("serve(async"))) ||
     raw.includes('Deno.env.get("GOOGLE_ADS_CRON_SECRET")'),
    "the cron secret must come from Deno.env, not a literal");
  ok(!/PAYOUT_CRON_SECRET|LEAD_FOLLOWUP_CRON_SECRET/.test(raw),
    "this function must not borrow another function's cron secret — its credential is narrow by design");

  // verify_jwt must not be weakened anywhere in the repo config for this function.
  ok(!/verify_jwt\s*=\s*false/.test(raw), "the uploader must not declare verify_jwt=false");

  // LIVE: a known mode with no handler on this deployment must never reach the
  // default backfill block. The refusal must sit between the last explicit mode
  // branch and the backfill selection.
  const bfSel = rawServe.indexOf("let pendingQuery = supabase");
  const refuse = rawServe.indexOf('if (mode !== "backfill") return json(');
  ok(refuse > 0 && bfSel > 0 && refuse < bfSel,
    "only an explicit mode:\"backfill\" may reach the backfill block — an unhandled known mode must be refused, not defaulted");
}

// ─────────────────────────────────────────────────────────────────────────────
// Callers — no admin call site may present the public anon key as an identity.
// ─────────────────────────────────────────────────────────────────────────────
function runCallers(root) {
  const helper = read(root, HELPER);
  ok(/getSession\(\)/.test(helper), "the shared helper must read the caller's Supabase session");
  ok(/access_token/.test(helper), "the shared helper must send the session access token");
  // Comment-stripped, literals KEPT: this assertion is about what Authorization is
  // ASSIGNED, and the file's own header comment legitimately names the old defect.
  const helperCode = stripComments(helper);
  ok(!/Authorization[^\n]*ANON_KEY/i.test(helperCode),
    "the shared helper must NEVER put the anon key in Authorization");
  ok(/Authorization:\s*`Bearer \$\{accessToken\}`/.test(helperCode),
    "the shared helper must put the SESSION access token in Authorization");
  ok(/apikey/.test(helper), "the shared helper must still send the project apikey header for gateway routing");

  for (const rel of CALLERS) {
    const raw = read(root, rel);
    const name = rel.split("/").pop();
    // Locate every sync-google-ads-conversions fetch and inspect its own headers.
    const parts = raw.split("functions/v1/sync-google-ads-conversions");
    ok(parts.length > 1, `${name} must still call the sync function`);
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i].slice(0, 400);
      ok(!/Authorization:\s*`Bearer \$\{SUPABASE_KEY\}`/.test(block),
        `${name}: a sync call site must not send the public anon key as Authorization (site ${i})`);
      ok(/adminFunctionHeadersOrThrow\(\)/.test(block),
        `${name}: every sync call site must use the shared admin session headers (site ${i})`);
    }
    ok(raw.includes('from "@/lib/adminFunctionAuth"'),
      `${name} must import the shared admin-session header helper`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Planted negative controls — mutate a TEMP COPY, prove the guard trips.
// ─────────────────────────────────────────────────────────────────────────────
const CONTROLS = [
  {
    name: "N1  — authorization helper call removed",
    file: UPLOADER,
    apply: (s) => s.replace("const authz: AuthzResult = await authorizeInvocation(req, mode, {",
      "const authz: AuthzResult = { authorized: true, status: 200, kind: \"internal_service\", reason: \"\", actorId: null } as AuthzResult; const _unused = ((x: unknown) => x)({"),
  },
  {
    name: "N2  — authorization result inverted",
    file: UPLOADER,
    apply: (s) => s.replace("if (!authz.authorized) {", "if (false && !authz.authorized) {"),
  },
  {
    name: "N3  — anon JWT treated as trusted (no-identity bearer allowed)",
    file: AUTH,
    apply: (s) => s.replace(
      '  return deny(401, "not_an_authenticated_session");',
      '  return allow("internal_service", null, "not_an_authenticated_session");'),
  },
  {
    name: "N4  — customer/provider treated as admin",
    file: AUTH,
    apply: (s) => s.replace(
      "    if (!isAdminProfile(profile)) return deny(403, \"not_admin\");",
      "    if (false && !isAdminProfile(profile)) return deny(403, \"not_admin\");"),
  },
  {
    name: "N5  — a mode bypasses authorization (internal-only opened to admins)",
    file: AUTH,
    apply: (s) => s.replace(
      "  if (kind === \"internal_service\" || kind === \"internal_cron\") return true;\n  return ADMIN_MODES.includes(mode);",
      "  if (kind === \"internal_service\" || kind === \"internal_cron\") return true;\n  return true;"),
  },
  {
    name: "N6  — forceUpload wired into the authorization decision",
    file: UPLOADER,
    apply: (s) => s.replace(
      "    const authz: AuthzResult = await authorizeInvocation(req, mode, {",
      "    if (forceUpload) { /* bypass */ }\n    const authz: AuthzResult = await authorizeInvocation(req, forceUpload ? \"single\" : mode, {"),
  },
  {
    name: "N7  — authorization moved AFTER email hashing / OAuth",
    file: UPLOADER,
    apply: (s) => {
      const start = s.indexOf("    // ══ INVOCATION AUTHORIZATION");
      const end = s.indexOf("    console.info(`[google-ads] invocation authorized:");
      if (start < 0 || end < 0) return s;
      const endLine = s.indexOf("\n", end) + 1;
      const block = s.slice(start, endLine);
      const without = s.slice(0, start) + s.slice(endLine);
      const anchor = "    // ── List conversion actions ";
      const at = without.indexOf(anchor);
      if (at < 0) return s;
      return without.slice(0, at) + block + without.slice(at);
    },
  },
  {
    name: "N8  — a plain user header accepted as the internal secret",
    file: AUTH,
    apply: (s) => s.replace(
      "  const providedCronSecret = req.headers.get(\"x-cron-secret\") ?? \"\";\n  if (secretsMatch(providedCronSecret, deps.cronSecret)) {",
      "  const providedCronSecret = req.headers.get(\"x-cron-secret\") ?? \"\";\n  if (providedCronSecret !== null && providedCronSecret !== undefined) {"),
  },
  {
    name: "N9  — internal credential comparison weakened (empty matches empty)",
    file: AUTH,
    apply: (s) => s.replace(
      "  if (expected.length === 0 || provided.length === 0) return false;",
      "  // weakened"),
  },
  {
    name: "N10 — admin call site reverts to the public anon key",
    file: CALLERS[0],
    apply: (s) => s.replace(
      "headers: await adminFunctionHeadersOrThrow(),",
      "headers: { \"Content-Type\": \"application/json\", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },"),
  },
  {
    name: "N11 — shared helper falls back to the anon key when no session",
    file: HELPER,
    apply: (s) => s.replace(
      "  if (!accessToken) return null;",
      "  if (!accessToken) return { \"Content-Type\": \"application/json\", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };"),
  },
  {
    name: "N12 — unknown mode silently falls back to backfill",
    file: AUTH,
    apply: (s) => s.replace(
      '  if (!KNOWN_MODES.includes(mode)) return deny(403, "unknown_mode");',
      "  if (!KNOWN_MODES.includes(mode)) mode = \"backfill\";"),
  },
  {
    name: "N13 — this function borrows another function's cron secret",
    file: UPLOADER,
    apply: (s) => s.replace(
      'Deno.env.get("GOOGLE_ADS_CRON_SECRET") ?? ""',
      'Deno.env.get("GOOGLE_ADS_CRON_SECRET") ?? Deno.env.get("PAYOUT_CRON_SECRET") ?? ""'),
  },
  {
    name: "N16 — known-but-unimplemented mode falls through to the default backfill (LIVE)",
    file: UPLOADER,
    apply: (s) => s.replace(
      'if (mode !== "backfill") return json(',
      'if (false && mode !== "backfill") return json('),
  },
  // Cross-guard controls: the acquisition-channel work must stay enforced.
  {
    name: "N14 — acquisition-channel gating removed (cross-guard)",
    file: "supabase/functions/sync-google-ads-conversions/channelGate.ts",
    apply: (s) => s.replace(
      "    if (ftChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {",
      "    if (false && ftChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {"),
    crossGuard: true,
  },
  {
    name: "N15 — excluded statuses re-enter pending counts (cross-guard)",
    file: "src/pages/admin-orders/components/SyncHealthCards.tsx",
    apply: (s) => s.replace(
      /\.or\(\[[\s\S]*?\]\.join\(","\)\),/,
      '.neq("google_ads_upload_status", "skipped_website_tag"),'),
    crossGuard: true,
  },
];

/**
 * Run the sibling channel-gate guard AGAINST A TEMP COPY.
 *
 * The script itself is executed from the real repo (so `esbuild` resolves from the
 * real node_modules), but PT_GUARD_ROOT redirects every file it reads to `root`.
 * Running the copied script instead would resolve no node_modules and always
 * "fail", which would make these controls vacuously green.
 */
function runChannelGuard(root) {
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", "check-google-ads-primary-channel-gate.mjs")], {
      cwd: ROOT, stdio: "pipe", env: { ...process.env, PT_GUARD_ROOT: root },
    });
    return true; // exit 0 → channel guard passed (defect went undetected)
  } catch {
    return false; // non-zero → channel guard detected the defect
  }
}

async function selfTest() {
  const results = [];
  for (const ctl of CONTROLS) {
    const dir = mkdtempSync(join(tmpdir(), "pt-authz-ctl-"));
    let detected = false;
    let planted = false;
    try {
      cpSync(join(ROOT, "supabase"), join(dir, "supabase"), { recursive: true });
      cpSync(join(ROOT, "src"), join(dir, "src"), { recursive: true });
      cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });

      const target = join(dir, ctl.file);
      const before = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
      const after = ctl.apply(before);
      planted = after !== before;
      writeFileSync(target, after, "utf8");

      failures.length = 0;
      if (ctl.crossGuard) {
        // The channel-gate guard owns these two assertions; a passing run means
        // the planted defect went UNDETECTED.
        detected = !runChannelGuard(dir);
      } else {
        await runBehaviour(dir).catch((e) => failures.push(`behaviour threw: ${e?.message ?? e}`));
        try { runWiring(dir); } catch (e) { failures.push(`wiring threw: ${e?.message ?? e}`); }
        try { runCallers(dir); } catch (e) { failures.push(`callers threw: ${e?.message ?? e}`); }
        detected = failures.length > 0;
      }
    } catch (err) {
      detected = true;
      failures.push(`control harness error: ${err?.message ?? err}`);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    results.push({ name: ctl.name, planted, detected, sample: failures.slice(0, 1) });
  }

  let allOk = true;
  for (const r of results) {
    const bad = !r.planted || !r.detected;
    if (bad) allOk = false;
    const mark = !r.planted ? "NO-OP (plant did not apply)" : r.detected ? "detected" : "*** NOT DETECTED ***";
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${r.name} — ${mark}`);
    if (r.detected && r.sample.length) console.log(`          e.g. ${r.sample[0]}`);
  }
  console.log(`\n${results.filter((r) => r.planted && r.detected).length}/${results.length} planted negative controls detected.`);
  // process.exitCode, never process.exit() — the temp dirs above must finish cleanup.
  process.exitCode = allOk ? 0 : 1;
}

async function main() {
  if (SELF) { await selfTest(); return; }

  await runBehaviour(ROOT);
  runWiring(ROOT);
  runCallers(ROOT);

  if (failures.length === 0) {
    console.log(`Google Ads sync invocation authorization: ${checks} checks passed.`);
    return;
  }
  console.log(`Google Ads sync invocation authorization: ${failures.length} of ${checks} checks FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (!WARN) process.exitCode = 1;
}

main().catch((err) => {
  console.error("check-google-ads-invocation-auth crashed:", err);
  process.exitCode = WARN ? 0 : 1;
});
