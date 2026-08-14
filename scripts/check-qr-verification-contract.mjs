// scripts/check-qr-verification-contract.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · Stage 1 guard.
//
// WHAT THIS PINS. The public verification endpoint is the one surface a stranger
// can hit with nothing but a scanned URL. Three things must stay true:
//
//   Q1  the response is built from an explicit allowlist, not the raw RPC row.
//   Q2  no PHI / customer / order / payment / storage field is ever allowlisted.
//   Q3  the opaque QR token is never echoed back to the caller.
//   Q4  every failure mode returns ONE indistinguishable message (no enumeration
//       oracle separating "malformed" from "well-formed but unknown").
//   Q5  verification responses are uncacheable and noindex.
//   Q6  the durable (database) rate limit is called — the in-memory Map alone
//       measured 15/15 requests allowed against a declared 10/60s limit.
//   Q7  the name check returns only {checked, matches} and never the stored name.
//   Q8  the token is CSPRNG-derived, not `random()`.
//   Q9  expiry is never fabricated from issued_at.
//   Q10 the RPCs are revoked from public/anon/authenticated by name.
//
// F3 (QR-…-001 · Stage 3) added Q11-Q17. A demo used to render INSIDE the
// genuine result card — emerald shield, emerald border, "Verification Result"
// bar — with only the heading and badge swapped. A landlord scanning a sample
// saw the chrome a real letter produces. The sample now has its own branch:
//
//   Q11 the demo branch is structurally separate and precedes the valid branch.
//   Q12 it carries the required sample wording.
//   Q13 it borrows NO green/emerald success chrome or genuine status language.
//   Q14 it renders NO genuine metadata rows and NO "—"/"Not available" holes.
//   Q15 product and ID come only from the server response, never the URL.
//   Q16 genuine valid / revoked / expired / not-found are untouched.
//   Q17 the shared StatusBadge has no `demo` entry.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-qr-verification-contract.mjs             → guard
//   node scripts/check-qr-verification-contract.mjs --warn-only → audit
//   node scripts/check-qr-verification-contract.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "check-qr-verification-contract";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  fn: "supabase/functions/verify-letter/index.ts",
  mig: "supabase/migrations/20260810092452_qr_verification_public_token_contract.sql",
  // The verifier's CURRENT definition. verify_letter_public has been replaced
  // since the token-contract migration, so contract checks about what it
  // publishes must read the latest definition, not the historical one.
  migRateLimit: "supabase/migrations/20260810092953_qr_verification_durable_rate_limit.sql",
  migContact: "supabase/migrations/20260812231736_provider_contact_current_consent_gate.sql",
  page: "src/pages/verify-result/page.tsx",
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

/** Comments and string literals stripped — for "must NOT use" assertions. */
function codeOnly(src) {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
/** SQL with -- comments stripped, literals kept (grants/《names》matter). */
function sqlOnly(src) {
  return src.replace(/\r\n/g, "\n").replace(/(^|\n)\s*--[^\n]*/g, "$1 ");
}

/** Contents of the PUBLIC_ALLOWED_FIELDS Set literal. */
function allowlistEntries(fnSrc) {
  const m = fnSrc.replace(/\r\n/g, "\n").match(/PUBLIC_ALLOWED_FIELDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// ── F3 branch extraction ─────────────────────────────────────────────────────
// The page is one ternary chain. Each result state is the JSX between its own
// condition and the next condition, so the branches can be sliced apart and
// asserted independently — which is the whole point: "no emerald in the demo
// branch" is a different claim from "no emerald on the page".
const DEMO_COND  = "result?.found && result.status === \"demo\" ? (";
const VALID_COND = "result?.found && (result.status === \"valid\" || result.status === \"superseded\") ? (";
const REVOKED_COND = "result?.found && result.status === \"revoked\" ? (";
const EXPIRED_COND = "result?.found && result.status === \"expired\" ? (";

/**
 * Comments removed, string literals KEPT.
 *
 * The "must NOT contain" scans below have to assert the USE, not the mention:
 * the demo branch's own explanatory comment names `emerald`, `displayId` and
 * "Not available" precisely because it is documenting what a sample must never
 * render, and a naive scan reads that as the defect it forbids. String literals
 * cannot be stripped here — `label="State"` IS the thing being detected.
 */
function stripComments(src) {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")  // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, " ")            // /* block comment */
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1 ");      // // line comment
}

function slice(src, startMarker, endMarker) {
  const s = src.replace(/\r\n/g, "\n");
  const a = s.indexOf(startMarker);
  if (a === -1) return null;
  const b = endMarker ? s.indexOf(endMarker, a + startMarker.length) : -1;
  return s.slice(a + startMarker.length, b === -1 ? s.length : b);
}
const demoBranch    = (p) => slice(p, DEMO_COND, VALID_COND);
const validBranch   = (p) => slice(p, VALID_COND, REVOKED_COND);
const revokedBranch = (p) => slice(p, REVOKED_COND, EXPIRED_COND);
/** StatusBadge's config object literal. */
function badgeConfig(p) {
  const m = p.replace(/\r\n/g, "\n").match(/function StatusBadge[\s\S]*?const config[^=]*=\s*\{([\s\S]*?)\n\s*\};/);
  return m ? m[1] : null;
}

// Green/emerald success chrome and genuine-status language a sample must not borrow.
const GENUINE_CHROME = [
  /emerald/i, /\bbg-green-/i, /\btext-green-/i, /\bborder-green-/i,
  /ri-shield-check/i, /Letter Verified/, /Verification Result/,
  /currently valid/i, /is authentic/i, /StatusBadge/,
];
// Genuine metadata a sample must not render.
const GENUINE_ROWS = [
  /label="State"/, /label="Issue Date"/, /label="Expiration Date"/,
  /label="NPI Number"/, /State License/, /Issuing Provider/,
  /provider_name/, /provider_title/, /provider_npi/, /provider_license/,
  /provider_state_licenses/, /patient_name_masked/, /patient_name_checkable/,
  /PatientNameCheck/, /has_newer_version/, /superseded_at/,
  /result\.state/, /result\.issued_at/, /result\.expires_at/,
  /document_version/, /order_id/, /confirmation_id/,
  /Not available/, /Not provided/, /"—"/,
];

// Anything matching these must never be allowlisted.
const FORBIDDEN = [
  "first_name", "last_name", "patient_name\b", "email", "phone", "address",
  "date_of_birth", "dob", "diagnosis", "intake", "clinical", "note",
  "order_id", "confirmation_id", "price", "amount", "discount", "coupon",
  "paid", "payment", "file_url", "storage", "bucket", "path", "signature",
  "public_token", "token",
];

function runChecks(o) {
  const fnRaw = read("fn", o);
  const migRaw = read("mig", o);
  const pageRaw = read("page", o).replace(/\r\n/g, "\n");
  const fn = codeOnly(fnRaw);
  const mig = sqlOnly(migRaw);
  const migRateLimit = sqlOnly(read("migRateLimit", o));
  const migContact = sqlOnly(read("migContact", o));
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  const entries = allowlistEntries(fnRaw);

  add("Q1", "response is built through an explicit allowlist",
    !!entries && /applyAllowlist\s*\(/.test(fn) && /PUBLIC_ALLOWED_FIELDS/.test(fn));

  // patient_name_masked / patient_name_checkable are DERIVED and permitted; the
  // bare name fields are not. The \b in the pattern is what keeps them apart.
  //
  // provider_phone / provider_email are permitted by name and ONLY by name
  // (PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001). They carry the
  // consent-gated snapshot from letter_verifications.provider_professional_*,
  // which a provider typed into a dedicated professional field and explicitly
  // approved for publication. Q2b below is what stops this exception from being
  // widened into "any field with email/phone in its name".
  const CONSENTED_CONTACT = new Set(["provider_phone", "provider_email"]);
  const bad = (entries ?? []).filter((f) =>
    FORBIDDEN.some((p) => new RegExp(p).test(f)) &&
    f !== "patient_name_masked" && f !== "patient_name_checkable" &&
    !CONSENTED_CONTACT.has(f));
  add("Q2", "no PHI/customer/order/payment/storage field is allowlisted", !!entries && bad.length === 0);

  // Q2b — the consented-contact exception is exactly two keys. Anything else
  // that smells like a contact field (a login address, a legacy/unlabelled
  // number, a customer's email) must still be refused by Q2.
  const contactish = (entries ?? []).filter((f) => /email|phone/.test(f));
  add("Q2b", "only the two consent-gated provider contact keys are exempted",
    !!entries && contactish.every((f) => CONSENTED_CONTACT.has(f)));

  // Q2c — the published value must come from the verification snapshot, never
  // live from the provider profile (doctor_profiles.email is the LOGIN address).
  add("Q2c", "the verifier publishes the contact snapshot, never the profile",
    /provider_professional_email/.test(migContact) &&
    /provider_professional_phone/.test(migContact) &&
    !/v_dp\.(email|phone)\b/.test(mig));

  // Q2d — publication requires CURRENT consent, so a revocation suppresses a
  // historical result immediately.
  add("Q2d", "publication is gated on current consent",
    /professional_email_public_approved/.test(migContact) &&
    /professional_phone_public_approved/.test(migContact));

  add("Q3", "the opaque QR token is never returned to the caller",
    !!entries && !entries.includes("public_token") && !entries.includes("token"));

  add("Q4", "one indistinguishable message for every failure mode",
    /NOT_FOUND_MSG/.test(fn) &&
    (fnRaw.match(/NOT_FOUND_MSG/g) ?? []).length >= 5);

  add("Q5", "verification responses are no-store and noindex",
    /NO_STORE/.test(fn) &&
    /no-store/.test(fnRaw) && /noindex/.test(fnRaw));

  // The limiter's DDL lives in its own ledger-matching migration
  // (20260810092953) since the source-of-truth repair; the edge function must
  // still call it and the table must still be defined somewhere in the set.
  add("Q6", "the DURABLE database rate limit is invoked",
    /check_verification_rate_limit/.test(fnRaw) &&
    /check_verification_rate_limit/.test(migRateLimit) &&
    /verification_rate_limits/.test(migRateLimit));

  add("Q7", "name check returns only {checked, matches}",
    /verify_letter_name_match/.test(fnRaw) &&
    /checked:\s*raw\.checked\s*===\s*true/.test(fn) &&
    /matches:\s*raw\.matches\s*===\s*true/.test(fn));

  add("Q8", "QR token is CSPRNG-derived, not random()",
    /gen_random_bytes\(16\)/.test(mig) &&
    !/public_token[\s\S]{0,200}?\brandom\(\)/.test(mig));

  add("Q9", "expiry is never fabricated from issued_at",
    !/coalesce\s*\(\s*v_rec\.expires_at\s*,[\s\S]{0,80}?issued_at/i.test(mig) &&
    !/issued_at\s*\+\s*interval\s*'1 year'/i.test(mig));

  add("Q10", "public RPCs are revoked from public, anon AND authenticated by name",
    /revoke all on function public\.verify_letter_public\(text, text\)\s+from public, anon, authenticated/.test(mig) &&
    /revoke all on function public\.verify_letter_name_match\(text, text, text\)\s+from public, anon, authenticated/.test(mig) &&
    /revoke all on function public\.verify_letter_id\(text\)\s+from public, anon, authenticated/.test(mig));

  // ── F3: the sample presentation ────────────────────────────────────────────
  // Branches are sliced from the raw source (markers are real code) and then
  // comment-stripped, so the negative scans test the USE, not the mention.
  const demoRaw = demoBranch(pageRaw);
  const demo    = demoRaw === null ? null : stripComments(demoRaw);
  const valid   = validBranch(pageRaw);
  const revoked = revokedBranch(pageRaw);
  const badge   = badgeConfig(pageRaw);

  add("Q11", "a DEDICATED demo branch exists, precedes the valid branch, and the valid branch no longer accepts demo",
    !!demo && !!valid &&
    pageRaw.indexOf(DEMO_COND) < pageRaw.indexOf(VALID_COND) &&
    !/status === "demo"/.test(valid) &&
    !new RegExp('status === "valid"[^)]*status === "demo"').test(pageRaw));

  add("Q12", "the demo branch carries the required sample wording",
    !!demo &&
    /Sample Verification/.test(demo) &&
    /DEMONSTRATION ONLY/.test(demo) &&
    /This is a PawTenant sample used to demonstrate the verification system\. It is not a valid clinical letter\./.test(demo));

  add("Q13", "the demo branch borrows no green/emerald success chrome or genuine status language",
    !!demo && !GENUINE_CHROME.some((re) => re.test(demo)));

  add("Q14", "the demo branch renders no genuine metadata rows and no empty placeholders",
    !!demo && !GENUINE_ROWS.some((re) => re.test(demo)));

  add("Q15", "sample product and ID come only from the server response, never the URL",
    !!demo &&
    /result\.letter_type/.test(demo) &&
    /result\.letter_id/.test(demo) &&
    !/displayId/.test(demo) &&
    !/useParams|letterId\b|\btoken\b/.test(demo));

  add("Q16", "genuine valid / revoked / expired / not-found presentations are preserved",
    !!valid && !!revoked &&
    /Letter Verified/.test(valid) && /emerald/.test(valid) &&
    /ri-shield-check-fill/.test(valid) && /PatientNameCheck/.test(valid) &&
    /label="NPI Number"/.test(valid) && /Verification Result/.test(valid) &&
    /Letter Revoked/.test(revoked) &&
    /Letter Expired/.test(pageRaw) && /Unable to Verify/.test(pageRaw));

  add("Q17", "the shared StatusBadge has no demo entry — a sample cannot render through the genuine badge",
    !!badge && !/\bdemo\s*:/.test(badge) &&
    /\bvalid\s*:/.test(badge) && /\brevoked\s*:/.test(badge) && /\bexpired\s*:/.test(badge));

  return r;
}

const CONTROLS = [
  ["Q1", "response bypasses the allowlist", (b) => ({ fn: b.fn.replace(/applyAllowlist\s*\(/g, "rawPassthrough(") })],
  ["Q2", "a customer PHI field is allowlisted",
    (b) => ({ fn: b.fn.replace(/"is_demo",/, '"is_demo",\n  "patient_email",') })],
  ["Q2b", "the contact exception is widened to a provider login address",
    (b) => ({ fn: b.fn.replace(/"is_demo",/, '"is_demo",\n  "provider_login_email",') })],
  ["Q2c", "the verifier reads contact live from the provider profile",
    (b) => ({ migContact: b.migContact
      .replace(/v_rec\.provider_professional_email/g, "v_dp.email")
      .replace(/v_rec\.provider_professional_phone/g, "v_dp.phone") })],
  ["Q2d", "publication stops checking current consent",
    (b) => ({ migContact: b.migContact
      .replace(/professional_email_public_approved/g, "xx_email_flag")
      .replace(/professional_phone_public_approved/g, "xx_phone_flag") })],
  ["Q3", "the QR token is echoed in the response",
    (b) => ({ fn: b.fn.replace(/"is_demo",/, '"is_demo",\n  "public_token",') })],
  ["Q4", "failure modes get distinct messages",
    (b) => ({ fn: b.fn.replace(/NOT_FOUND_MSG/g, '"unique message"') })],
  ["Q5", "verification responses become cacheable",
    (b) => ({ fn: b.fn.replace(/NO_STORE/g, "{}") })],
  ["Q6", "durable rate limit removed (back to in-memory only)",
    (b) => ({ fn: b.fn.replace(/check_verification_rate_limit/g, "noop_rate_limit"),
              migRateLimit: b.migRateLimit.replace(/check_verification_rate_limit/g, "noop_rate_limit") })],
  ["Q7", "name check leaks more than a boolean",
    (b) => ({ fn: b.fn.replace(/matches:\s*raw\.matches\s*===\s*true/, "matches: raw.matches, stored: raw.stored_name") })],
  ["Q8", "token generated with random() instead of a CSPRNG",
    (b) => ({ mig: b.mig.replace(/gen_random_bytes\(16\)/g, "random()::text::bytea") })],
  ["Q9", "expiry fabricated from issued_at again",
    (b) => ({ mig: b.mig.replace(/'expires_at',   case when v_rec\.expires_at is not null/,
      "'expires_at', coalesce(v_rec.expires_at, v_rec.issued_at + interval '1 year'), 'x', case when v_rec.expires_at is not null") })],
  ["Q10", "RPC left granted to authenticated",
    (b) => ({ mig: b.mig.replace(/revoke all on function public\.verify_letter_public\(text, text\)\s+from public, anon, authenticated/,
      "revoke all on function public.verify_letter_public(text, text) from public") })],

  // ── F3 controls: each reintroduces the exact defect the check exists for ───
  ["Q11", "demo folded back into the genuine valid branch (the original F3 defect)",
    (b) => ({ page: b.page
      .replace('result?.found && result.status === "demo" ? (', 'result?.found && result.status === "__never" ? (')
      .replace('result?.found && (result.status === "valid" || result.status === "superseded") ? (',
               'result?.found && (result.status === "valid" || result.status === "demo" || result.status === "superseded") ? (') })],
  ["Q12", "required sample wording removed",
    (b) => ({ page: b.page.replace(/DEMONSTRATION ONLY/, "Verified Sample") })],
  ["Q13", "green success chrome reintroduced into the sample card",
    (b) => ({ page: b.page.replace(
      '<i className="ri-information-fill text-slate-500 text-3xl"></i>',
      '<i className="ri-shield-check-fill text-emerald-600 text-3xl"></i>') })],
  ["Q14", "a genuine metadata row with an empty placeholder added to the sample card",
    (b) => ({ page: b.page.replace(
      '                    <VerifyField\n                      label="Letter Type"\n                      value={result.letter_type?.toUpperCase() === "PSD"',
      '                    <VerifyField label="NPI Number" value="Not available" />\n                    <VerifyField\n                      label="Letter Type"\n                      value={result.letter_type?.toUpperCase() === "PSD"') })],
  ["Q15", "sample ID taken from the URL fallback instead of the server response",
    (b) => ({ page: b.page.replace(
      '                        value={result.letter_id}\n                        mono',
      '                        value={displayId}\n                        mono') })],
  ["Q16", "genuine valid presentation damaged",
    (b) => ({ page: b.page.replace(/Letter Verified/, "Letter Checked") })],
  ["Q17", "demo re-added to the shared StatusBadge",
    (b) => ({ page: b.page.replace(
      '    superseded: { label: "Superseded", icon: "ri-file-history-fill", cls: "bg-amber-100 text-amber-700 border-amber-200" },',
      '    superseded: { label: "Superseded", icon: "ri-file-history-fill", cls: "bg-amber-100 text-amber-700 border-amber-200" },\n    demo:       { label: "Sample",     icon: "ri-information-fill",  cls: "bg-blue-100 text-blue-700 border-blue-200" },') })],
];

try {
  const base = Object.fromEntries(Object.keys(F).map((k) => [k, read(k)]));

  if (SELF) {
    console.log(`[${NAME}] self-test — each control must TRIP its check\n`);
    let bad = 0;
    for (const [target, label, patchFn] of CONTROLS) {
      const patch = patchFn(base);
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((x) => x.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} ${x.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
