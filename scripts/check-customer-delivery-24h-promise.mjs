// scripts/check-customer-delivery-24h-promise.mjs
//
// CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001 regression guard.
//
// OWNER DECISION (2026-09-04): PawTenant no longer offers a 2–3-day letter
// delivery option. Every ESA and PSD customer-facing surface says the same
// thing, and never describes approval or delivery as guaranteed:
//
//   short — "Typically within 24 hours after provider review"
//   long  — "If you qualify after clinical review, your letter is typically
//            delivered within 24 hours."
//
// ROOT CAUSE this guard pins: the portal and several email functions BRANCHED
// on `orders.delivery_speed`. Only "24h"/"24hours" reached the 24-hour copy;
// NULL, "", "standard", "priority" and "2-3days" all fell through to a 2–3-day
// promise — and that is the majority of the table (373 NULL + 88 "" ESA rows,
// 15 "priority" PSD rows). Changing page copy alone could never fix it.
//
// Three independent layers are asserted:
//   A. BEHAVIOUR — the real normalizers are transpiled and EXECUTED, so a value
//      change cannot slip past a regex.
//   B. WIRING    — source scans that strip comments AND string literals, so they
//      assert the USE of an identifier, never a mention of it in prose.
//   C. COPY      — a scan of active UI/email/function sources for retired
//      delivery promises, scoped by scripts/delivery-copy-scan-scope.json with
//      an explicit per-file, per-phrase allowlist. Immutable migrations and
//      unrelated timelines (refunds, landlord response, provider applications,
//      support response, bank settlement) are out of scope by construction.
//
// Usage:
//   node scripts/check-customer-delivery-24h-promise.mjs             -> exit 1 on failure
//   node scripts/check-customer-delivery-24h-promise.mjs --warn-only -> always exit 0
//   node scripts/check-customer-delivery-24h-promise.mjs --self-test -> prove the controls trip
//
// PT_GUARD_ROOT redirects every repo read at a single point, so --self-test can
// run this guard (from the real node_modules) against a planted temp copy.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { transform } from "esbuild";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, "..");
const ROOT = process.env.PT_GUARD_ROOT || REPO;
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const CLIENT_HELPER = "src/lib/deliveryPromise.ts";
const SERVER_HELPER = "supabase/functions/_shared/deliveryPromise.ts";
const CLIENT_PRICING = "src/config/pricing.ts";
const SERVER_PRICING = "supabase/functions/_shared/pricingMatrix.ts";
const SCAN_SCOPE = "scripts/delivery-copy-scan-scope.json";
// LIVE carries its OWN migration: the TEST one assumes the unpromoted PSD
// two-dog offer, so its wording would write a price LIVE does not charge.
const MIGRATION = "supabase/migrations/20260904190000_delivery_24_hour_promise_pricing_copy_live.sql";

const PORTAL = "src/pages/my-orders/page.tsx";
const PORTAL_CARD = "src/pages/my-orders/components/OrderOverviewCard.tsx";
const CPI = "supabase/functions/create-payment-intent/index.ts";
const CCS = "supabase/functions/create-checkout-session/index.ts";
const ASSIGN = "supabase/functions/assign-doctor/index.ts";
const STATUS = "supabase/functions/notify-order-status/index.ts";
const RESEND = "supabase/functions/resend-confirmation-email/index.ts";
const TEMPLATED = "supabase/functions/send-templated-email/index.ts";
const RESUME = "supabase/functions/get-resume-order/index.ts";
const THIRTY = "supabase/functions/notify-thirty-day-customer/index.ts";

// The approved wording, verbatim. A drift here is a copy change the owner has
// not approved, so it fails.
const APPROVED_SHORT = "Typically within 24 hours after provider review";
const APPROVED_LONG =
  "If you qualify after clinical review, your letter is typically delivered within 24 hours.";

// Every value that has ever been written to orders.delivery_speed, plus the
// NULL/undefined the column actually holds for most ESA orders.
const LEGACY_SPEEDS = [null, undefined, "", "2-3days", "standard", "priority", "24h", "24hours"];

// Retired PawTenant delivery promises. Deliberately does NOT match unrelated
// timelines: refunds ("5–10 business days"), landlord response periods, airline
// or university processing, bank settlement, provider application review, or
// support-response estimates.
const BANNED = [
  { id: "2-3 business days", re: /2\s*(?:-|–|—|&ndash;|&mdash;)\s*3\s*business\s*days?/i },
  { id: "2-3 days", re: /\b2\s*(?:-|–|—|&ndash;|&mdash;)\s*3\s*days?\b/i },
  { id: "2-3days token", re: /["'`]2-3days["'`]/ },
  { id: "one to two business days", re: /one\s+to\s+two\s+business\s+days?/i },
  { id: "1-2 business days", re: /\b1\s*(?:-|–|—|&ndash;|&mdash;)\s*2\s*business\s*days?/i },
  { id: "24-48 hours", re: /24\s*(?:-|–|—|&ndash;|&mdash;)\s*48\s*(?:hours?|hrs?)/i },
  { id: "24-72 hours", re: /24\s*(?:-|–|—|&ndash;|&mdash;)\s*72\s*(?:hours?|hrs?)/i },
  { id: "1-3 business days", re: /\b1\s*(?:-|–|—|&ndash;|&mdash;)\s*3\s*business\s*days?/i },
  { id: "standard delivery", re: /standard\s+delivery/i },
  { id: "standard (2-3", re: /standard\s*\(\s*2\s*(?:-|–|—)\s*3/i },
  { id: "2 business days letter promise", re: /(?:complete|deliver|issue)[^.]{0,60}within\s*<?[a-z/]*>?\s*2\s*business\s*days?/i },
];

let checks = 0;
const failures = [];

function check(label, fn) {
  checks += 1;
  try {
    const r = fn();
    if (r === true || r === undefined) return;
    failures.push(`${label} -> ${r}`);
  } catch (err) {
    failures.push(`${label} -> threw ${err?.message ?? String(err)}`);
  }
}
function eq(label, actual, expected) {
  check(label, () =>
    actual === expected ? true : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function rejects(label, fn) {
  checks += 1;
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) failures.push(`${label} -> did NOT reject`);
}

/** SINGLE read point. CRLF is normalised HERE and nowhere else. */
function read(root, rel) {
  return readFileSync(resolve(root, rel), "utf8").replace(/\r\n/g, "\n");
}
function readOr(root, rel, fallback = "") {
  try { return read(root, rel); } catch { return fallback; }
}

/**
 * Strip COMMENTS only — string and template literals are kept, because customer
 * copy LIVES in string literals and JSX text. Used by the copy scan, which must
 * see the copy but must not fail on a comment that merely names the retired
 * wording it exists to forbid. `[^:]` keeps `https://` intact.
 */
function commentsStripped(src) {
  // Blanking (not deleting) keeps byte offsets and newlines intact so the
  // reported line numbers still point at the real source line.
  const blank = (t) => t.replace(/[^\n]/g, " ");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, pre, c) => pre + blank(c));
}

/**
 * Decode \uXXXX escapes so an ESCAPED dash cannot hide a retired promise.
 *
 * CLOSURE: the deployed-bundle sweep found
 * `"✓ Delivered within 24 hours (or 2–3 days at a reduced rate)"`
 * in a customer follow-up email. The source held the literal characters
 * `2–3 days`, so every dash pattern missed it while the SHIPPED bundle
 * rendered a real en dash and offered the retired tier to customers.
 *
 * Length is preserved (the 6-char escape becomes the char plus 5 spaces) so
 * reported line and column numbers still point at the real source position.
 */
function decodeUnicodeEscapes(src) {
  return src.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)) + "     ");
}

/** Strip comments and string/template literals: assert the USE, not the mention. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, '""')
    .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');
}

async function loadTs(root, rel, tmpDir, name) {
  const { code } = await transform(read(root, rel), { loader: "ts", format: "esm", target: "es2022" });
  const out = resolve(tmpDir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(out, code, "utf8");
  return import(pathToFileURL(out).href);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. BEHAVIOUR — execute the real modules
// ─────────────────────────────────────────────────────────────────────────────
async function runBehaviour(root) {
  const tmpDir = resolve(REPO, "node_modules", ".cache", "delivery-24h-guard");
  mkdirSync(tmpDir, { recursive: true });

  const client = await loadTs(root, CLIENT_HELPER, tmpDir, "clientDelivery");
  const server = await loadTs(root, SERVER_HELPER, tmpDir, "serverDelivery");
  const cPrice = await loadTs(root, CLIENT_PRICING, tmpDir, "clientPricing");
  const sPrice = await loadTs(root, SERVER_PRICING, tmpDir, "serverPricing");

  // 1 · One canonical stored value, agreed by client and server.
  eq("1. client canonical delivery value is 24h", client.CANONICAL_DELIVERY_SPEED, "24h");
  eq("1. server canonical delivery value is 24h", server.CANONICAL_DELIVERY_SPEED, "24h");

  // 2 · Every legacy stored value — including NULL and blank — reads as 24h.
  for (const v of LEGACY_SPEEDS) {
    eq(`2. legacy stored ${JSON.stringify(v)} normalizes to 24h (portal reader)`,
      client.normalizeDeliverySpeed(v), "24h");
    eq(`2. legacy client-supplied ${JSON.stringify(v)} is discarded by the server`,
      server.canonicalDeliverySpeed(v), "24h");
  }
  // 2b · A hostile / unknown client value cannot mint a slower promise either.
  for (const v of ["3-5days", "slow", "next-week", 42, {}, []]) {
    eq(`2b. unknown client value ${JSON.stringify(v)} is discarded by the server`,
      server.canonicalDeliverySpeed(v), "24h");
  }

  // 3 · Legacy blank ESA / priority PSD / 2-3days PSD orders all say 24 hours.
  for (const [label, v] of [
    ["legacy blank ESA order", ""],
    ["legacy NULL ESA order", null],
    ["legacy PSD priority order", "priority"],
    ["legacy PSD 2-3days order", "2-3days"],
    ["legacy standard order", "standard"],
  ]) {
    eq(`3. ${label} -> approved short promise`, client.deliveryPromiseShort(v), APPROVED_SHORT);
    eq(`3. ${label} -> approved long promise`, client.deliveryPromiseLong(v), APPROVED_LONG);
    eq(`3. ${label} -> one email delivery label`, server.deliveryPromiseLabel(v), "Within 24 Hours");
  }

  // 4 · The approved wording is verbatim, on BOTH sides, and hedged.
  eq("4. client short wording is the approved text", client.DELIVERY_PROMISE_SHORT, APPROVED_SHORT);
  eq("4. client long wording is the approved text", client.DELIVERY_PROMISE_LONG, APPROVED_LONG);
  eq("4. server short wording is the approved text", server.DELIVERY_PROMISE_SHORT, APPROVED_SHORT);
  eq("4. server long wording is the approved text", server.DELIVERY_PROMISE_LONG, APPROVED_LONG);
  for (const [side, mod] of [["client", client], ["server", server]]) {
    for (const key of Object.keys(mod)) {
      const v = mod[key];
      if (typeof v !== "string") continue;
      check(`4. ${side}.${key} never promises a guarantee`, () =>
        !/guarantee/i.test(v) || `"${v}" describes delivery as guaranteed`);
      for (const b of BANNED) {
        check(`4. ${side}.${key} carries no retired promise (${b.id})`, () =>
          !b.re.test(v) || `"${v}" still says ${b.id}`);
      }
    }
  }

  // 5 · Pricing is UNCHANGED by this task — pinned to the AUTHORITATIVE LIVE
  //     matrix, which is NOT the TEST one.
  //
  //     LIVE ESA one-time (esaOneTimeCents, ESA-TWO-PET-129-PRICING-001):
  //         1 pet $129 · 2 pets $129 · exactly 3 pets $149
  //     LIVE PSD one-time (oneTimeCents via the legacy petTier):
  //         1 dog $129 · 2 dogs $149 · 3 dogs $149
  //
  //     TEST additionally tiers PSD at two dogs ($129 for 1-2) under
  //     ESA-HOUSING-FABLE-51-CRO-TEST-003. That change is NOT promoted, so
  //     asserting the TEST numbers here would be asserting a price LIVE does
  //     not charge. These assertions therefore pin LIVE's real amounts and will
  //     fail if this delivery task ever moves one of them.
  eq("5. LIVE ESA 1 pet is 12900 cents (server)", sPrice.esaOneTimeCents(1), 12900);
  eq("5. LIVE ESA 2 pets is 12900 cents (server)", sPrice.esaOneTimeCents(2), 12900);
  eq("5. LIVE ESA 3 pets is 14900 cents (server)", sPrice.esaOneTimeCents(3), 14900);
  eq("5. LIVE PSD 1 dog is 12900 cents (server)", sPrice.oneTimeCents(1), 12900);
  eq("5. LIVE PSD 2 dogs is 14900 cents (server)", sPrice.oneTimeCents(2), 14900);
  eq("5. LIVE PSD 3 dogs is 14900 cents (server)", sPrice.oneTimeCents(3), 14900);
  eq("5. LIVE PSD 1 dog is $129 (client)", cPrice.getPsdOneTimeTotal(1), 129);
  eq("5. LIVE PSD 2 dogs is $149 (client)", cPrice.getPsdOneTimeTotal(2), 149);
  eq("5. LIVE PSD 3 dogs is $149 (client)", cPrice.getPsdOneTimeTotal(3), 149);
  eq("5. client and server agree on the PSD one-time amount", cPrice.getPsdOneTimeTotal(2) * 100, sPrice.oneTimeCents(2));

  // 0 and 4+ are rejected at the REQUEST layer on LIVE (parsePetCount), because
  // LIVE's petTier() clamps for display rather than throwing. Assert the layer
  // that actually enforces it, on both charge paths.
  for (const f of [CPI, CCS]) {
    const code = codeOnly(readOr(root, f));
    check(`5. ${f} validates the pet count instead of clamping it`, () =>
      /parsePetCount\s*\(/.test(code) || "parsePetCount() is not used");
    check(`5. ${f} rejects an out-of-range pet count`, () =>
      /petCount\s*===\s*null[\s\S]{0,120}?400/.test(code) ||
      "an invalid pet count no longer returns 400");
  }
  check("5. the delivery helper exposes no amount at all", () =>
    !Object.values(server).some((v) => typeof v === "number") ||
    "the delivery helper exports a number — it must never influence an amount");
}

// ─────────────────────────────────────────────────────────────────────────────
// B. WIRING — the promise cannot branch, and the server owns the stored value
// ─────────────────────────────────────────────────────────────────────────────
function runWiring(root) {
  const src = Object.fromEntries(
    [PORTAL, PORTAL_CARD, CPI, CCS, ASSIGN, STATUS, RESEND, TEMPLATED, RESUME, THIRTY]
      .map((f) => [f, readOr(root, f)]),
  );

  // 6 · Both order-creation paths let the SERVER own the stored value.
  for (const f of [CPI, CCS]) {
    const code = codeOnly(src[f]);
    check(`6. ${f} stamps the canonical delivery value`, () =>
      /canonicalDeliverySpeed\s*\(/.test(code) || "canonicalDeliverySpeed() is never called");
    check(`6. ${f} imports the shared delivery helper`, () =>
      /_shared\/deliveryPromise\.ts/.test(src[f]) || "the shared helper is not imported");
    check(`6. ${f} has no legacy delivery default left in code`, () =>
      !/["'`](?:2-3days|standard|priority)["'`]\s*(?:;|\)|,)/.test(code) ||
      "a legacy delivery literal is still used as a value in code");
    check(`6. ${f} never writes a raw client delivery value to the order`, () =>
      !/delivery_speed\s*:\s*\(?\s*body\.deliverySpeed/.test(code) ||
      "delivery_speed is written straight from the request body");
  }

  // 7 · Customer-visible Stripe / Klarna line item names no delivery speed.
  check("7. the PSD Klarna/Stripe line item drops the Standard/Priority split", () => {
    const m = src[CCS].match(/function buildPSDOneTimeKlarnaLineItem[\s\S]*?\n}/);
    if (!m) return "buildPSDOneTimeKlarnaLineItem() not found";
    const body = m[0];
    // Comments blanked: the function carries a comment NAMING the retired split
    // it removed, and a mention must never fail a "must not contain" scan.
    const copy = commentsStripped(body);
    if (/Standard\s*\(2-3/.test(copy)) return "the line item still says Standard (2-3 day)";
    if (/Priority\s*\(24-hour\)/.test(copy)) return "the line item still offers a Priority tier";
    if (/isPriority/.test(codeOnly(body))) return "the line item still branches on isPriority";
    if (!/psdOneTimeDeliveryDescriptor\s*\(/.test(body)) return "the shared descriptor is not used";
    if (!/getPSDOneTimeAmountCents\s*\(/.test(body)) return "the amount no longer comes from the pricing helper";
    return true;
  });

  // 8 · No customer-facing email branches on the stored speed.
  for (const f of [ASSIGN, STATUS, RESEND, TEMPLATED, RESUME, THIRTY]) {
    const code = codeOnly(src[f]);
    check(`8. ${f} imports the shared delivery promise`, () =>
      /_shared\/deliveryPromise\.ts/.test(src[f]) || "the shared helper is not imported");
    check(`8. ${f} never branches a delivery label on the stored speed`, () =>
      !/(?:deliverySpeed|delivery_speed)[^\n]{0,40}===[^\n]{0,40}\?/.test(code) ||
      "a ternary still selects the delivery label from the stored speed");
  }

  // 8b · CLOSURE: every NEW order is stamped, even when the caller omits the key.
  //
  // The deployed order-writer test found that a caller which simply left
  // `deliverySpeed` out created an order with delivery_speed NULL — so "new
  // orders store the canonical value" was not true, and the legacy NULL
  // population kept growing. The stamp must not be reachable ONLY through a
  // `body.deliverySpeed !== undefined` branch.
  {
    const code = codeOnly(src[RESUME]);
    const stamp = code.match(/if\s*\(([^)]*)\)\s*\{?\s*upsertPayload\.delivery_speed\s*=\s*canonicalDeliverySpeed/);
    check("8b. the lead upsert stamps the canonical value on a NEW order", () => {
      if (!stamp) return "the canonical delivery stamp is not guarded by a condition this guard can read";
      return /isNewOrder/.test(stamp[1]) ||
        "a new order is only stamped when the caller sends deliverySpeed — an omitted key still writes NULL";
    });
    check("8b. an existing order is not restamped unless the caller supplies a value", () =>
      (stamp && /body\.deliverySpeed\s*!==\s*undefined/.test(stamp[1])) ||
      "the upsert would rewrite a historical order's stored speed on every resume");
  }

  // 9 · The portal renders one promise for every order.
  const portalCode = codeOnly(src[PORTAL]);
  const cardCode = codeOnly(src[PORTAL_CARD]);
  check("9. the portal order page never compares delivery_speed", () =>
    !/delivery_speed\s*===/.test(portalCode) || "the portal still branches on delivery_speed");
  check("9. the portal overview card never compares delivery_speed", () =>
    !/delivery_speed\s*===/.test(cardCode) || "the overview card still branches on delivery_speed");
  check("9. the portal renders the approved long promise", () =>
    /DELIVERY_PROMISE_LONG/.test(portalCode) || "the portal does not use the shared long promise");
  check("9. the overview card renders the shared compact promise", () =>
    /DELIVERY_PROMISE_COMPACT/.test(cardCode) || "the overview card does not use the shared promise");

  // 10 · The migration exists, is idempotent, and touches no amount.
  // Assert the STATEMENTS, not the rationale: this migration's header explains
  // why the TEST wording ("up to 2 dogs") is wrong for LIVE, and a mention in a
  // comment must never satisfy or fail a "must contain" scan.
  const migRaw = readOr(root, MIGRATION);
  const mig = migRaw.replace(/^s*--.*$/gm, " ");
  check("10. the pricing-copy migration exists", () => migRaw.length > 0 || `${MIGRATION} is missing`);
  if (mig) {
    check("10. the migration never changes an amount", () =>
      !/amount_cents\s*=/.test(mig) || "the migration writes amount_cents");
    check("10. the migration is guarded (idempotent)", () =>
      (mig.match(/\bwhere\s+key\s*=/gi) || []).length >= 3 || "an update is not guarded by key");
    for (const key of ["psd_standard", "psd_priority", "psd_multi_dog"]) {
      check(`10. the migration updates ${key}`, () =>
        mig.includes(`'${key}'`) || `${key} is not updated`);
    }
    check("10. the migration states the 24-hour promise", () =>
      /typically delivered within 24 hours after provider review/i.test(mig) ||
      "the new copy does not carry the approved promise");
    check("10. the migration keeps LIVE's own dog-count semantics", () =>
      (/1 dog/i.test(mig) && /2 or 3 dogs/i.test(mig) && !/up to 2 dogs/i.test(mig)) ||
      "the migration does not state LIVE's 1-dog / 2-or-3-dog offer");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C. COPY — the customer-facing scan
// ─────────────────────────────────────────────────────────────────────────────
function walk(root, dir, exts, excludeAbs, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const abs = join(dir, name);
    if (excludeAbs.some((x) => abs === x || abs.startsWith(x + sep))) continue;
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) walk(root, abs, exts, excludeAbs, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(relative(root, abs).split(sep).join("/"));
  }
}

function runCopyScan(root) {
  let scope;
  try {
    scope = JSON.parse(read(root, SCAN_SCOPE));
  } catch (err) {
    checks += 1;
    failures.push(`11. the copy-scan scope is unreadable -> ${err?.message ?? err}`);
    return;
  }

  // 11 · The scope itself cannot be quietly disabled or widened.
  check("11. the scan declares at least one root", () =>
    (Array.isArray(scope.roots) && scope.roots.length > 0) || "roots is empty — the scan is disabled");
  check("11. the scan declares required coverage", () =>
    (Array.isArray(scope.requiredCoverage) && scope.requiredCoverage.length >= 25) ||
    "requiredCoverage was emptied or narrowed");
  check("11. every allowlist entry names one file and one phrase", () => {
    for (const a of scope.allowlist ?? []) {
      if (!a || typeof a.file !== "string" || typeof a.phrase !== "string") return "malformed allowlist entry";
      if (/[*?]/.test(a.file) || a.file.trim() === "") return `wildcard allowlist file: ${a.file}`;
      if (a.phrase.trim().length < 12) return `allowlist phrase too broad: ${JSON.stringify(a.phrase)}`;
      if (typeof a.reason !== "string" || a.reason.trim().length < 20) return `allowlist entry for ${a.file} has no reason`;
    }
    return true;
  });

  const excludeAbs = (scope.excludeDirs ?? []).map((d) => resolve(root, d));
  const files = [];
  for (const r of scope.roots ?? []) walk(root, resolve(root, r.dir), r.exts ?? [".ts"], excludeAbs, files);
  const scanned = new Set(files);

  // 12 · Coverage — narrowing the roots is itself a failure.
  for (const req of scope.requiredCoverage ?? []) {
    check(`12. the scan covers ${req}`, () =>
      scanned.has(req) || "not visited by the copy scan (roots narrowed or file moved)");
  }
  check("12. the scan visited a plausible number of files", () =>
    files.length >= 200 || `only ${files.length} files scanned — the scope was narrowed`);

  // 13 · No retired delivery promise survives in an active source.
  const allow = scope.allowlist ?? [];
  checks += 1;
  for (const rel of files) {
    const text = decodeUnicodeEscapes(commentsStripped(read(root, rel)));
    for (const b of BANNED) {
      const re = new RegExp(b.re.source, b.re.flags.includes("g") ? b.re.flags : b.re.flags + "g");
      let m;
      while ((m = re.exec(text)) !== null) {
        const ctx = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
        if (allow.some((a) => a.file === rel && ctx.includes(a.phrase))) continue;
        const line = text.slice(0, m.index).split("\n").length;
        failures.push(`13. ${rel}:${line} still carries a retired delivery promise (${b.id}): ${JSON.stringify(m[0])}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative controls
// ─────────────────────────────────────────────────────────────────────────────
const CONTROLS = [
  {
    name: "N1 — the portal 2–3-day fallback is restored",
    file: PORTAL,
    apply: (s) => s.replace(
      '                      {" "}{DELIVERY_PROMISE_LONG}',
      '                      {" "}{order.delivery_speed === "24h" ? "within 24 hours." : "within 2-3 business days."}'),
  },
  {
    name: "N2 — `priority` is misclassified in the resend email",
    file: RESEND,
    apply: (s) => s.replace(
      "  const deliveryLabel = deliveryPromiseLabel(opts.deliverySpeed);",
      '  const deliveryLabel = opts.deliverySpeed === "priority" ? "Priority — Within 24 Hours" : "Standard — 2-3 Business Days";'),
  },
  {
    name: "N3 — a server default returns to 2-3days",
    file: CPI,
    apply: (s) => s.replace(
      "  const deliverySpeed = canonicalDeliverySpeed(body.deliverySpeed);",
      '  const deliverySpeed = (body.deliverySpeed as string) ?? "2-3days";'),
  },
  {
    name: "N4 — Stripe/Klarna copy says Standard 2–3-day delivery",
    file: CCS,
    apply: (s) => s.replace(
      "        name: `PSD Letter — ${dogsLabel} (One-Time)`,",
      "        name: `PSD Letter — ${dogsLabel}, Standard (2-3 day)`,"),
  },
  {
    name: "N5 — a confirmation email says 2–3 days",
    file: TEMPLATED,
    apply: (s) => s.replace(
      "          const deliveryLabel = DELIVERY_PROMISE_LABEL;",
      '          const deliveryLabel = (o.delivery_speed as string) === "priority" ? "Priority" : "Standard — 2-3 Business Days";'),
  },
  {
    name: "N6 — the source scan is narrowed to the edge functions only",
    file: SCAN_SCOPE,
    apply: (s) => {
      const j = JSON.parse(s);
      j.roots = j.roots.filter((r) => r.dir !== "src");
      return JSON.stringify(j, null, 2) + "\n";
    },
  },
  {
    name: "N6b — the source scan is disabled outright (no roots)",
    file: SCAN_SCOPE,
    apply: (s) => {
      const j = JSON.parse(s);
      j.roots = [];
      return JSON.stringify(j, null, 2) + "\n";
    },
  },
  {
    name: "N6c — required coverage is gutted so a narrowed scan looks clean",
    file: SCAN_SCOPE,
    apply: (s) => {
      const j = JSON.parse(s);
      j.requiredCoverage = j.requiredCoverage.slice(0, 3);
      return JSON.stringify(j, null, 2) + "\n";
    },
  },
  {
    name: "N7 — the allowlist is widened to a blanket wildcard",
    file: SCAN_SCOPE,
    apply: (s) => s.replace('"file": "src/mocks/blogPosts.ts"', '"file": "*"'),
  },
  {
    name: "N8 — the portal reader lets `priority` through unchanged",
    file: CLIENT_HELPER,
    apply: (s) => s.replace(
      "export function normalizeDeliverySpeed(_raw?: string | null): typeof CANONICAL_DELIVERY_SPEED {\n  return CANONICAL_DELIVERY_SPEED;\n}",
      'export function normalizeDeliverySpeed(raw?: string | null): string {\n  return raw === "priority" ? "priority" : CANONICAL_DELIVERY_SPEED;\n}'),
  },
  {
    name: "N9 — the server trusts the client-supplied delivery option",
    file: SERVER_HELPER,
    apply: (s) => s.replace(
      "export function canonicalDeliverySpeed(_clientSupplied?: unknown): string {\n  return CANONICAL_DELIVERY_SPEED;\n}",
      'export function canonicalDeliverySpeed(clientSupplied?: unknown): string {\n  return typeof clientSupplied === "string" && clientSupplied ? clientSupplied : CANONICAL_DELIVERY_SPEED;\n}'),
  },
  {
    name: "N10 — a marketing page reinstates the 24–48 hour claim",
    file: "src/pages/how-to-get-psd-letter/page.tsx",
    apply: (s) => s.replace(
      "                Typically delivered within 24 hours",
      "                Delivered in 24–48 hours"),
  },
  // Anchored on the LIVE pricing API. psdOneTimeCents / psdOneTimeTier are
  // TEST-only symbols; planting against them here would silently NO-OP.
  {
    name: "N11 — LIVE PSD one-time pricing drifts (payment amount change)",
    file: SERVER_PRICING,
    apply: (s) => s.replace(
      "export function oneTimeCents(petCount: number): number {",
      "export function oneTimeCents(petCount: number): number {\n  if (petCount === 2) return 12900;"),
  },
  {
    name: "N11b — LIVE ESA one-time pricing drifts (payment amount change)",
    file: SERVER_PRICING,
    apply: (s) => s.replace(
      "export function esaOneTimeCents(petCount: number): number {",
      "export function esaOneTimeCents(petCount: number): number {\n  if (petCount === 2) return 14900;"),
  },
  {
    name: "N12 — an out-of-range dog count is accepted instead of rejected",
    file: CPI,
    apply: (s) => s.replace(
      'return json({ error: "petCount must be 1, 2 or 3" }, 400);',
      'return json({ error: "petCount must be 1, 2 or 3" }, 200);'),
  },
  {
    name: "N13 — the migration starts rewriting amounts",
    file: MIGRATION,
    // Anchored on the LIVE migration's own first statement.
    apply: (s) => s.replace(
      "   set label       = 'PSD Letter — One-Time (1 dog)',",
      "   set amount_cents = 14900,\n       label       = 'PSD Letter — One-Time (1 dog)',"),
  },
  {
    // LIVE has no ai-suggest-sms-reply function; the shared AI support
    // knowledge base is the LIVE-real equivalent surface.
    name: "N14 — the AI support knowledge source reinstates a slower window",
    file: "supabase/functions/_shared/aiSupport/knowledgeBase.ts",
    apply: (s) => s.replace(
      "Turnaround:",
      "Turnaround: some flows may mention 24–48 hours or 2–3 business days."),
  },
  {
    name: "N15 — the provider-assigned email quotes 2–3 business days again",
    file: ASSIGN,
    apply: (s) => s.replace(
      "  const turnaroundLabel = DELIVERY_TURNAROUND_CLAUSE;",
      '  const turnaroundLabel = opts.deliverySpeed === "24h" ? "within 24 hours" : "within 2–3 business days";'),
  },
  {
    name: "N16 — the resume-order lead email quotes Standard (2-3 days)",
    file: RESUME,
    apply: (s) => s.replace(
      '    ["Delivery", DELIVERY_PROMISE_LABEL],',
      '    ["Delivery", opts.deliverySpeed === "2-3days" ? "Standard (2-3 days)" : "Priority (24h)"],'),
  },
  {
    // The exact defect the deployed-bundle sweep caught: the retired 2-3-day
    // tier offered at a reduced rate in a customer follow-up email, hidden from
    // every dash pattern because the source stored the dash as –.
    name: "N20 — a retired 2-3-day offer hidden behind an escaped unicode dash",
    file: "src/pages/admin-orders/components/LeadActionsModal.tsx",
    // The source stores these as LITERAL \uXXXX escapes, so both the needle
    // and the plant are written as escape sequences, not as the characters.
    apply: (s) => s.replace(
      '"\\u2713 Typically delivered within 24 hours after provider review",',
      '"\\u2713 Delivered within 24 hours (or 2\\u20133 days at a reduced rate)",'),
  },
  {
    // The exact defect the deployed order-writer test caught: a caller that
    // omits `deliverySpeed` creates an order with delivery_speed NULL.
    name: "N18 — a new order is only stamped when the caller sends deliverySpeed (omitted key writes NULL)",
    file: RESUME,
    apply: (s) => s.replace(
      "      if (isNewOrder || body.deliverySpeed !== undefined) {",
      "      if (body.deliverySpeed !== undefined) {"),
  },
  {
    name: "N19 — the lead upsert restamps every historical order it touches",
    file: RESUME,
    apply: (s) => s.replace(
      "      if (isNewOrder || body.deliverySpeed !== undefined) {",
      "      if (isNewOrder || true) {"),
  },
  {
    name: "N17 — the order-status email restores its hardcoded 2–3-day promise",
    file: STATUS,
    apply: (s) => s.replace(
      '      ["Expected Delivery", DELIVERY_TURNAROUND_CLAUSE],',
      '      ["Expected Delivery", "within 2&ndash;3 business days"],'),
  },
];

async function runAll(root) {
  await runBehaviour(root).catch((e) => failures.push(`behaviour threw: ${e?.message ?? e}`));
  try { runWiring(root); } catch (e) { failures.push(`wiring threw: ${e?.message ?? e}`); }
  try { runCopyScan(root); } catch (e) { failures.push(`copy scan threw: ${e?.message ?? e}`); }
}

async function selfTest() {
  const results = [];
  for (const ctl of CONTROLS) {
    const dir = mkdtempSync(join(tmpdir(), "pt-delivery-ctl-"));
    let planted = false;
    let detected = false;
    try {
      cpSync(join(REPO, "supabase"), join(dir, "supabase"), { recursive: true });
      cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
      cpSync(join(REPO, "scripts"), join(dir, "scripts"), { recursive: true });

      const target = join(dir, ctl.file);
      const before = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
      const after = ctl.apply(before);
      planted = after !== before;
      writeFileSync(target, after, "utf8");

      failures.length = 0;
      await runAll(dir);
      detected = failures.length > 0;
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
  await runAll(ROOT);
  if (failures.length === 0) {
    console.log(`Customer delivery 24-hour promise parity: ${checks} checks passed.`);
    return;
  }
  console.log(`Customer delivery 24-hour promise parity: ${failures.length} of ${checks} checks FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (!WARN) process.exitCode = 1;
}

main();
