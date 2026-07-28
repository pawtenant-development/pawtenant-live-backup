// scripts/check-provider-headshot-privacy.mjs
//
// PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001
//
// Blocking guard: provider-headshot storage object keys must never be derived
// from a provider's email address (or any other PII), every upload path must go
// through the central versioned key generator, and no browser code may hold
// service-role credentials.
//
// The original defect was:
//     const safeName = email.replace(/[^a-z0-9]/gi, "_");
//     const path = `${safeName}.${ext}`;
// in a PUBLIC bucket, which published provider email addresses in page markup,
// in every image request, and through anonymous bucket LISTING.
//
// Guard scope note: checks run against COMMENT-STRIPPED source, so the migration
// notes that necessarily describe the old pattern cannot fail the guard that
// bans it.
//
// Exit 1 on any failure. `--self-test` runs planted negative controls.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const failures = [];
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`); };
const check = (name, cond) => (cond ? pass(name) : fail(name));

/** Strip comments so prose describing the defect cannot trip the ban. */
const code = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const KEYGEN = "src/lib/providerHeadshotKey.ts";
const DRAWER = "src/pages/admin-orders/components/ProviderDrawer.tsx";
const APPROVE_FN = "supabase/functions/approve-provider-application/index.ts";
const HARDENING = "supabase/migrations/20260729090000_provider_headshots_storage_hardening.sql";

// ── Predicates shared with the self-test ─────────────────────────────────────

/** An email being transformed into a storage path. */
export const derivesKeyFromEmail = (src) =>
  /email[^;\n]{0,40}\.replace\s*\([^)]*\)[^;\n]{0,60}(path|key|dest|name)\s*=/i.test(src) ||
  /(path|key|dest|destPath|safeName)\s*=\s*[`"'][^`"']*\$\{\s*email/i.test(src) ||
  /\$\{\s*email\s*\.replace/i.test(src) ||
  /(path|key|destPath)\s*=\s*`\$\{safeName\}/.test(src);

/** A literal email-shaped object key. */
export const hasEmailShapedKey = (src) =>
  /["'`][^"'`]*@[^"'`]*\.(jpg|jpeg|png|webp|gif)["'`]/i.test(src) ||
  /["'`][^"'`]*_(gmail|yahoo|outlook|hotmail|aol|icloud)_com[^"'`]*["'`]/i.test(src);

/** Trusting a caller-supplied complete object path. */
export const trustsClientPath = (src) =>
  /\.upload\(\s*(req\.|body\.|params\.|input\.|opts\.path|userPath|clientPath)/.test(src);

/** Writing to a fixed (unversioned) headshot path. */
export const usesUnversionedUpsert = (src) =>
  /provider-headshots[\s\S]{0,400}?upsert:\s*true/.test(src);

export const hasServiceRoleInBrowserCode = (src) =>
  /SERVICE_ROLE|service_role_key|serviceRoleKey/i.test(src);

async function main(selfTest) {
  console.log("[check-provider-headshot-privacy] headshot PII guard\n");

  const keygenSrc = await rd(KEYGEN);
  const drawerSrc = await rd(DRAWER);
  const approveSrc = await rd(APPROVE_FN);

  // ── 1) The central key generator exists and enforces the standard ──────────
  const kg = await jiti.import(resolve(ROOT, KEYGEN));
  check("key generator exports buildProviderHeadshotKey", typeof kg.buildProviderHeadshotKey === "function");
  check("key generator exports isNeutralHeadshotKey", typeof kg.isNeutralHeadshotKey === "function");

  const uuidA = "1219f06b-309a-432d-a607-406f926e6e3e";
  const built = kg.buildProviderHeadshotKey(uuidA, "image/png", 1234);
  check("generator accepts a UUID + valid image", built.ok === true);
  check("generated key is <uuid>/<uuid>.<ext>", built.ok && kg.isNeutralHeadshotKey(built.key));
  check("generated key is namespaced by the provider id", built.ok && built.key.startsWith(`${uuidA}/`));
  check("generated key carries no PII", built.ok && !kg.looksLikeEmailDerivedKey(built.key));

  // Versioning: two calls for the same provider must differ.
  const b2 = kg.buildProviderHeadshotKey(uuidA, "image/png", 1234);
  check("each upload gets a NEW version key (cache-safe replacement)",
    built.ok && b2.ok && built.key !== b2.key);

  // Rejections.
  check("generator REFUSES an email as the provider id",
    kg.buildProviderHeadshotKey("someone@gmail.com", "image/png", 10).ok === false);
  check("generator REFUSES a provider name as the id",
    kg.buildProviderHeadshotKey("Robert Staaf", "image/png", 10).ok === false);
  check("generator REFUSES a traversal path",
    kg.buildProviderHeadshotKey("../../etc/passwd", "image/png", 10).ok === false);
  check("generator REFUSES an unsupported type",
    kg.buildProviderHeadshotKey(uuidA, "application/pdf", 10).ok === false);
  check("generator REFUSES an oversized file",
    kg.buildProviderHeadshotKey(uuidA, "image/png", 6 * 1024 * 1024).ok === false);
  check("generator REFUSES an empty file",
    kg.buildProviderHeadshotKey(uuidA, "image/png", 0).ok === false);
  check("extension comes from the MIME type, not the filename",
    kg.headshotExtensionForType("image/webp") === "webp" && kg.headshotExtensionForType("image/jpg") === "jpg");
  check("image/jpg alias normalises to image/jpeg",
    kg.normalizeHeadshotContentType("image/jpg") === "image/jpeg");

  // ── 2) No upload path may derive a key from an email ───────────────────────
  for (const [label, src] of [["admin drawer", drawerSrc], ["approval edge function", approveSrc]]) {
    const body = code(src);
    check(`${label}: does not derive a key from an email`, !derivesKeyFromEmail(body));
    check(`${label}: contains no email-shaped object key`, !hasEmailShapedKey(body));
    check(`${label}: does not trust a client-supplied path`, !trustsClientPath(body));
    check(`${label}: does not upsert onto a fixed headshot path`, !usesUnversionedUpsert(body));
  }
  check("admin drawer uses the central key generator",
    /buildProviderHeadshotKey/.test(code(drawerSrc)));
  check("admin drawer keys on an internal id, not doc.email",
    !/uploadPhotoToStorage\(\s*photoFile\s*,\s*doc\.email\s*\)/.test(code(drawerSrc)));
  check("approval edge function keys on a UUID",
    /providerId\.toLowerCase\(\)/.test(code(approveSrc)) && /crypto\.randomUUID\(\)/.test(code(approveSrc)));
  check("approval edge function validates the id is a UUID",
    /publishHeadshot[\s\S]{0,600}?\[0-9a-f\]\{8\}-/.test(approveSrc));

  // ── 3) Failure behaviour preserves the existing photo ──────────────────────
  check("drawer keeps the existing photo when upload fails",
    /let finalPhotoUrl = form\.photo_url/.test(drawerSrc) && /if \(uploaded\)/.test(drawerSrc));

  // ── 4) No service-role credential in browser code ─────────────────────────
  check("admin drawer has no service-role credential", !hasServiceRoleInBrowserCode(drawerSrc));
  check("key generator has no service-role credential", !hasServiceRoleInBrowserCode(keygenSrc));

  // ── 5) Storage hardening migration is present and admin-scoped ────────────
  const hard = await rd(HARDENING);
  check("hardening drops the anonymous listing policy",
    /drop policy if exists "Public read headshots"/i.test(hard));
  check("hardening drops the any-authenticated write policies",
    /drop policy if exists "Authenticated upload headshots"/i.test(hard) &&
    /drop policy if exists "Authenticated update headshots"/i.test(hard));
  for (const verb of ["select", "insert", "update", "delete"]) {
    check(`hardening scopes ${verb.toUpperCase()} to an admin predicate`,
      new RegExp(`provider_headshots_admin_${verb}[\\s\\S]{0,240}?is_admin_staff\\(\\)`, "i").test(hard));
  }

  // ── 6) Public surfaces must not hardcode a headshot object key ────────────
  const publicFiles = [
    "src/lib/publicProviderDirectory.ts",
    "src/pages/home/components/DoctorsSection.tsx",
    "src/pages/our-providers/page.tsx",
    "src/pages/doctor-profile/page.tsx",
    "src/data/publicProviders.ts",
  ];
  for (const f of publicFiles) {
    const body = code(await rd(f));
    check(`${f}: no hardcoded headshot object key`, !/provider-headshots\//.test(body));
    check(`${f}: no email-shaped literal`, !hasEmailShapedKey(body));
  }

  // ── 7) Repo-wide: no email-shaped headshot key may be COMMITTED ───────────
  // This caught a real leak during this task: a doc file authored by the
  // previous task quoted an actual provider's normalised email as the example
  // key, and it had already been pushed to a public GitHub repository.
  {
    const { execSync } = await import("node:child_process");
    // Normalised-email shape: <something>_<provider>_com.<imageExt>
    const pattern = "[a-z0-9._-]\\+_\\(gmail\\|yahoo\\|outlook\\|hotmail\\|aol\\|icloud\\)_com\\.\\(jpg\\|jpeg\\|png\\|webp\\|gif\\)";
    let hits = "";
    try {
      hits = execSync(`git grep -lI "${pattern}" -- . ":(exclude)scripts/check-provider-headshot-privacy.mjs"`, {
        cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      hits = ""; // git grep exits 1 when there are no matches
    }
    check(
      `no committed file contains an email-shaped headshot key${hits ? ` (found in: ${hits.split("\n").join(", ")})` : ""}`,
      hits === "",
    );
  }

  // ── Self-test: planted negative controls ─────────────────────────────────
  if (selfTest) {
    console.log("\n[self-test] planted negative controls");
    const neg = (name, cond) => (cond ? pass(`caught: ${name}`) : fail(`MISSED: ${name}`));

    neg("original defect (safeName from email)",
      derivesKeyFromEmail('const safeName = email.replace(/[^a-z0-9]/gi, "_");\nconst path = `${safeName}.${ext}`;'));
    neg("template-literal email key",
      derivesKeyFromEmail('const destPath = `${email.replace(/[^a-z0-9]/gi,"_")}.${ext}`;'));
    neg("interpolated raw email",
      derivesKeyFromEmail('const key = `${email}-photo.jpg`;'));
    neg("literal email-shaped key",
      hasEmailShapedKey('const p = "someone@gmail.com.jpg";'));
    neg("literal normalised email key",
      hasEmailShapedKey('const p = "someone_gmail_com.jpg";'));
    neg("client-supplied upload path",
      trustsClientPath('await supabase.storage.from("provider-headshots").upload(req.path, file);'));
    neg("fixed-path upsert",
      usesUnversionedUpsert('storage.from("provider-headshots").upload(p, f, { upsert: true });'));
    neg("service-role key in browser code",
      hasServiceRoleInBrowserCode('const k = import.meta.env.SERVICE_ROLE_KEY;'));
    neg("generator rejects email id",
      kg.buildProviderHeadshotKey("a@b.com", "image/png", 5).ok === false);
    neg("isNeutralHeadshotKey rejects a legacy key",
      kg.isNeutralHeadshotKey("someone_gmail_com.jpg") === false);
    neg("looksLikeEmailDerivedKey spots a normalised email",
      kg.looksLikeEmailDerivedKey("someone_example_com.jpg") === true);
    // Positive controls — the SHIPPED shape must not trip any ban.
    neg("neutral key passes isNeutralHeadshotKey",
      kg.isNeutralHeadshotKey(`${uuidA}/2e4cefd6-15be-48fa-a8c0-b20dc4556495.jpg`) === true);
    neg("shipped drawer source passes the email-derivation ban",
      !derivesKeyFromEmail(code(drawerSrc)));
    neg("shipped edge function passes the email-derivation ban",
      !derivesKeyFromEmail(code(approveSrc)));
  }

  console.log("");
  if (failures.length) {
    console.error(`[check-provider-headshot-privacy] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("[check-provider-headshot-privacy] PASSED — neutral versioned keys, no PII in object paths, admin-scoped storage policies.");
}

main(process.argv.includes("--self-test")).catch((e) => {
  console.error("[check-provider-headshot-privacy] FATAL", e);
  process.exit(1);
});
