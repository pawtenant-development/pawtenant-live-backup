#!/usr/bin/env node
// ADMIN-ORDERS-EXPORT-PACKAGE-ADDONS-001 — regression guard.
//
// Locks in the `Package / Add-ons` column of the Admin Orders CSV:
//
//   • ONE canonical package definition. The column reuses
//     classifyOrderPackage() (the same classifier the Orders list chips and the
//     Package filter use) plus the child-row entitlements in
//     src/lib/orderAddonEntitlements.ts. No competing package logic in the CSV.
//   • ENTITLEMENT, NOT ACTIVITY. RA is never inferred from an uploaded document,
//     a pending/unpaid request, a note, or a cancelled/expired/refunded add-on.
//     Additional Pet counts only from the post-checkout, not-unwound statuses
//     (which is also how the $0 "included" path is honoured).
//   • DETERMINISTIC ORDER: base (+RA) → Additional Pet → [Notarization] → other.
//   • Indeterminate history exports "Unknown" — never guessed into ESA.
//   • Every cell keeps spreadsheet-formula-injection protection, and that
//     protection is NUMERIC-SAFE so negative financial columns stay numeric.
//   • The Meta Audience export is NOT touched by any of this.
//
// Layers: LOGIC (behavioural mirror + negative controls) + STATIC (source
// invariants) + --self-test.
//
// Usage:
//   node scripts/check-admin-orders-export-package-addons.mjs
//   node scripts/check-admin-orders-export-package-addons.mjs --self-test

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_ENT = join(ROOT, "src", "lib", "orderAddonEntitlements.ts");
const F_EXPORT = join(ROOT, "src", "lib", "exportOrders.ts");
const F_META = join(ROOT, "src", "lib", "exportMetaAudience.ts");
const F_PKG = join(ROOT, "src", "pages", "admin-orders", "orderPackage.ts");
const F_PAGE = join(ROOT, "src", "pages", "admin-orders", "page.tsx");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC MIRROR — must stay behaviourally identical to
//   src/pages/admin-orders/orderPackage.ts::classifyOrderPackage / packageAddonsLabel
//   src/lib/orderAddonEntitlements.ts::computeAddonEntitlements
// The STATIC layer ties the real source to the same invariants so the two
// cannot drift apart silently.
// ─────────────────────────────────────────────────────────────────────────────
const s = (v) => (v === null || v === undefined ? "" : String(v));

const isRaBundleKey = (pk) => pk === "esa_ra_bundle" || pk === "psd_ra_bundle";
const packageProduct = (pk) => (pk === "psd_standard" || pk === "psd_ra_bundle" ? "psd" : "esa");
const isPsdEvidence = (o) => {
  const lt = s(o.letter_type).trim().toLowerCase();
  return lt === "psd" || lt.startsWith("psd-") || s(o.confirmation_id).toUpperCase().includes("-PSD");
};
const isEsaEvidence = (o) => s(o.letter_type).trim().toLowerCase() === "esa";

function classifyOrderPackage(o, opts = {}) {
  const hasAddon = opts.hasPaidStandaloneAddon === true;
  const pk = s(o.package_key).trim().toLowerCase();
  if (isRaBundleKey(pk)) return packageProduct(pk) === "psd" ? "psd_ra" : "esa_ra";
  if (o.includes_reasonable_accommodation_letter === true) return isPsdEvidence(o) ? "psd_ra" : "esa_ra";
  const isPsd = isPsdEvidence(o);
  const isEsa = isEsaEvidence(o);
  const hasBaseIdentity = pk === "esa_standard" || pk === "psd_standard" || isPsd || isEsa;
  if (hasAddon && hasBaseIdentity) return "ra_addon";
  if (pk === "esa_standard") return "esa";
  if (pk === "psd_standard") return "psd";
  if (isPsd) return "psd";
  if (isEsa) return "esa";
  return "unknown";
}

const BASE_LABEL = {
  esa: "ESA", psd: "PSD", esa_ra: "ESA + RA", psd_ra: "PSD + RA",
  ra_addon: "RA Add-on", unknown: "Unknown",
};

// opts flags exist ONLY so the self-test can synthesize deliberately-broken
// variants and prove the scenarios have discriminating power.
function packageAddonsLabel(o, ent, opts = {}) {
  const cat = classifyOrderPackage(o, { hasPaidStandaloneAddon: ent.raAddonPaid });
  const parts = [BASE_LABEL[cat]];
  if (ent.additionalPet) parts.push("Additional Pet");
  if (opts.petFirst) parts.reverse();
  if (opts.unknownAsEsa && cat === "unknown") parts[0] = "ESA";
  return parts.join(" + ");
}

const RA_ADDON_ENTITLED_STATUS = "paid";
const ADDITIONAL_PET_ENTITLED_STATUSES = [
  "paid_pending_details", "pending_provider_review", "clarification_requested",
  "resubmitted", "approved_pending_document", "completed",
];

function computeAddonEntitlements(orders, raRows, petRows, opts = {}) {
  // opts.anyRaRow / opts.anyPetRow model the "inferred from a request that
  // exists at all" regression this guard is here to prevent.
  const result = new Map();
  for (const o of orders) if (s(o.id)) result.set(s(o.id), { raAddonPaid: false, additionalPet: false });
  for (const r of raRows) {
    const cur = result.get(s(r.order_id));
    if (!cur) continue;
    if (opts.anyRaRow || s(r.status).trim().toLowerCase() === RA_ADDON_ENTITLED_STATUS) cur.raAddonPaid = true;
  }
  for (const r of petRows) {
    const cur = result.get(s(r.order_id));
    if (!cur) continue;
    if (opts.anyPetRow || ADDITIONAL_PET_ENTITLED_STATUSES.includes(s(r.status).trim().toLowerCase())) cur.additionalPet = true;
  }
  return result;
}

// Formula-injection mirror (exportOrders.ts::neutralizeFormula).
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
function neutralizeFormula(str, opts = {}) {
  if (opts.disabled) return str;
  if (!FORMULA_LEAD.test(str)) return str;
  if (!opts.numericUnsafe && PLAIN_NUMBER.test(str)) return str;
  return `'${str}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS — one per business rule, matching real TEST rows where they exist.
// ─────────────────────────────────────────────────────────────────────────────
const ord = (id, fields = {}) => ({ id, confirmation_id: id, ...fields });
const req = (order_id, status) => ({ order_id, status });

const SCENARIOS = [
  {
    name: "ESA only (legacy letter_type, no add-on rows)",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [], pet: [], expect: { o1: "ESA" },
  },
  {
    name: "PSD only",
    orders: [ord("o1", { letter_type: "psd" })],
    ra: [], pet: [], expect: { o1: "PSD" },
  },
  {
    name: "retired psd-consultation still reads PSD",
    orders: [ord("o1", { letter_type: "psd-consultation" })],
    ra: [], pet: [], expect: { o1: "PSD" },
  },
  {
    name: "ESA + RA combo (canonical package_key)",
    orders: [ord("o1", { package_key: "esa_ra_bundle", letter_type: "esa" })],
    ra: [], pet: [], expect: { o1: "ESA + RA" },
  },
  {
    name: "PSD + RA combo (canonical package_key)",
    orders: [ord("o1", { package_key: "psd_ra_bundle", letter_type: "psd" })],
    ra: [], pet: [], expect: { o1: "PSD + RA" },
  },
  {
    name: "ESA + RA combo via the explicit RA flag (no package_key)",
    orders: [ord("o1", { letter_type: "esa", includes_reasonable_accommodation_letter: true })],
    ra: [], pet: [], expect: { o1: "ESA + RA" },
  },
  {
    name: "separately purchased RA add-on on a standard order",
    orders: [ord("o1", { package_key: "esa_standard", letter_type: "esa" })],
    ra: [req("o1", "paid")], pet: [], expect: { o1: "RA Add-on" },
  },
  {
    name: "PENDING RA request is NOT an entitlement",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [req("o1", "pending")], pet: [], expect: { o1: "ESA" },
  },
  {
    name: "CANCELLED / EXPIRED / REFUNDED RA requests are NOT entitlements",
    orders: [ord("o1", { letter_type: "esa" }), ord("o2", { letter_type: "esa" }), ord("o3", { letter_type: "esa" })],
    ra: [req("o1", "cancelled"), req("o2", "expired"), req("o3", "refunded")],
    pet: [], expect: { o1: "ESA", o2: "ESA", o3: "ESA" },
  },
  {
    name: "an uploaded RA document alone never creates an entitlement",
    orders: [ord("o1", { letter_type: "esa", additional_documentation_status: "uploaded", additional_documentation_required: true })],
    ra: [], pet: [], expect: { o1: "ESA" },
  },
  {
    name: "paid Additional Pet upgrade",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [], pet: [req("o1", "pending_provider_review")], expect: { o1: "ESA + Additional Pet" },
  },
  {
    name: "INCLUDED ($0) Additional Pet is an entitlement too",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [], pet: [req("o1", "paid_pending_details")], expect: { o1: "ESA + Additional Pet" },
  },
  {
    name: "pre-payment Additional Pet states are NOT entitlements",
    orders: [ord("o1"), ord("o2"), ord("o3"), ord("o4")].map((o, i) => ({ ...o, letter_type: "esa", id: `o${i + 1}`, confirmation_id: `o${i + 1}` })),
    ra: [],
    pet: [req("o1", "draft"), req("o2", "payment_required"), req("o3", "checkout_created"), req("o4", "manual_review_required")],
    expect: { o1: "ESA", o2: "ESA", o3: "ESA", o4: "ESA" },
  },
  {
    name: "rejected / refund_pending / refunded / cancelled Additional Pet excluded",
    orders: [ord("o1", { letter_type: "esa" }), ord("o2", { letter_type: "esa" }), ord("o3", { letter_type: "esa" }), ord("o4", { letter_type: "esa" })],
    ra: [],
    pet: [req("o1", "rejected"), req("o2", "refund_pending"), req("o3", "refunded"), req("o4", "cancelled")],
    expect: { o1: "ESA", o2: "ESA", o3: "ESA", o4: "ESA" },
  },
  {
    name: "one cancelled AND one live Additional Pet → still entitled (real TEST row PT-MR5XUE92)",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [req("o1", "paid")],
    pet: [req("o1", "cancelled"), req("o1", "pending_provider_review")],
    expect: { o1: "RA Add-on + Additional Pet" },
  },
  {
    name: "combo + Additional Pet (multiple simultaneous add-ons)",
    orders: [ord("o1", { package_key: "esa_ra_bundle", letter_type: "esa" })],
    ra: [], pet: [req("o1", "completed")],
    expect: { o1: "ESA + RA + Additional Pet" },
  },
  {
    name: "historically indeterminate row exports Unknown, never ESA",
    orders: [ord("o1", {})],
    ra: [], pet: [], expect: { o1: "Unknown" },
  },
  {
    name: "a child row for an order NOT in the export is ignored",
    orders: [ord("o1", { letter_type: "esa" })],
    ra: [req("oX", "paid")], pet: [req("oX", "completed")],
    expect: { o1: "ESA" },
  },
];

function runScenario(sc, opts = {}) {
  const ents = computeAddonEntitlements(sc.orders, sc.ra, sc.pet, opts);
  for (const [id, want] of Object.entries(sc.expect)) {
    const o = sc.orders.find((x) => s(x.id) === id);
    const got = packageAddonsLabel(o, ents.get(id) ?? { raAddonPaid: false, additionalPet: false }, opts);
    if (got !== want) return { ok: false, id, got, want };
  }
  return { ok: true };
}

// Formula-injection cases: [input, expected, why]
const FORMULA_CASES = [
  ['=HYPERLINK("http://evil","refund")', `'=HYPERLINK("http://evil","refund")`, "= formula neutralised"],
  ["+1-555-CALL", "'+1-555-CALL", "+ formula neutralised"],
  ["@SUM(A1:A9)", "'@SUM(A1:A9)", "@ formula neutralised"],
  ["-cmd|' /C calc'!A0", "'-cmd|' /C calc'!A0", "- formula neutralised"],
  ["\tleading tab", "'\tleading tab", "leading tab neutralised"],
  ["-40.00", "-40.00", "NEGATIVE MONEY stays numeric"],
  ["0.00", "0.00", "zero stays numeric"],
  ["129", "129", "integer stays numeric"],
  ["ESA + RA + Additional Pet", "ESA + RA + Additional Pet", "ordinary text untouched"],
  ["", "", "empty untouched"],
];

// ─────────────────────────────────────────────────────────────────────────────
// STATIC LAYER
// ─────────────────────────────────────────────────────────────────────────────
function stripComments(x) {
  return x
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function runStatic() {
  const failures = [];
  const assert = (cond, msg) => { if (!cond) failures.push(msg); };

  const ent = readSrc(F_ENT);
  const exp = readSrc(F_EXPORT);
  const meta = readSrc(F_META);
  const pkg = readSrc(F_PKG);
  const page = readSrc(F_PAGE);
  const bareExp = stripComments(exp);
  const barePkg = stripComments(pkg);
  const bareEnt = stripComments(ent);
  const barePage = stripComments(page);

  // ── The column itself ──
  assert(/\{ label: "Package \/ Add-ons", get: \(o, ctx\) => ctx\.packageAddons\(o\) \}/.test(exp),
    'exportOrders must define the exact "Package / Add-ons" column, fed by ctx.packageAddons');
  // Placement: with the other product columns — after Service Type, before Plan Type.
  const iService = exp.indexOf('"Service Type"');
  const iPkgCol = exp.indexOf('"Package / Add-ons"');
  const iPlan = exp.indexOf('"Plan Type"');
  assert(iService >= 0 && iPkgCol > iService && iPlan > iPkgCol,
    "column order must be: Service Type → Package / Add-ons → Plan Type");
  // Exactly one such column.
  assert((exp.match(/label: "Package \/ Add-ons"/g) || []).length === 1,
    "exactly one Package / Add-ons column may exist");

  // ── ONE canonical package definition ──
  assert(/from "\.\.\/pages\/admin-orders\/orderPackage"/.test(exp) && /packageAddonsLabel/.test(bareExp),
    "exportOrders must reuse the canonical packageAddonsLabel/classifyOrderPackage, not its own logic");
  assert(!/esa_ra_bundle|psd_ra_bundle|includes_reasonable_accommodation_letter/.test(bareExp),
    "FORBIDDEN: exportOrders must not re-implement package identity (no package_key / RA-flag literals)");
  assert(/classifyOrderPackage\(o, \{ hasPaidStandaloneAddon: ent\.raAddonPaid \}\)/.test(barePkg),
    "packageAddonsLabel must classify through classifyOrderPackage with the paid-add-on overlay");
  assert(/unknown: "Unknown"/.test(barePkg),
    "an indeterminate row must export Unknown (never guessed into ESA)");
  assert(!/PACKAGE_EXPORT_BASE[\s\S]{0,200}unknown: "ESA"/.test(barePkg),
    "FORBIDDEN: unknown must never map to ESA");

  // ── Deterministic order ──
  assert(/const parts: string\[\] = \[PACKAGE_EXPORT_BASE\[cat\]\];[\s\S]{0,400}?if \(ent\.additionalPet\) parts\.push\("Additional Pet"\);/.test(barePkg),
    "order must be base(+RA) FIRST, then Additional Pet");
  assert(/parts\.join\(" \+ "\)/.test(barePkg),
    'parts must join with " + "');

  // ── Entitlement, not activity ──
  assert(/RA_ADDON_ENTITLED_STATUS = "paid"/.test(bareEnt),
    "the RA add-on entitled status must be exactly 'paid'");
  for (const st of ADDITIONAL_PET_ENTITLED_STATUSES) {
    assert(new RegExp(`"${st}"`).test(bareEnt),
      `ADDITIONAL_PET_ENTITLED_STATUSES must list "${st}"`);
  }
  for (const st of ["draft", "payment_required", "checkout_created", "manual_review_required", "rejected", "refund_pending", "refunded", "cancelled"]) {
    assert(!new RegExp(`"${st}"`).test(bareEnt),
      `FORBIDDEN: "${st}" must never appear in the entitled allowlist`);
  }
  assert(/ADDITIONAL_PET_ENTITLED_STATUSES\.includes\(/.test(bareEnt),
    "Additional Pet entitlement must be an ALLOWLIST test (a denylist defaults new statuses to entitled)");
  assert(!/additional_documentation_status|letter_url|signed_letter_url|notes/.test(bareEnt),
    "FORBIDDEN: RA must never be inferred from a document/upload/notes field");
  assert(!/\bprice\b|amount_cents|coupon/.test(bareEnt),
    "FORBIDDEN: entitlement must never be inferred from price/amount/coupon");
  assert(/\.select\("order_id, status"\)/.test(ent),
    "the child-row read must project ONLY (order_id, status) — no financial fields");

  // ── No N+1, and a failure cancels the export ──
  assert(/for \(let i = 0; i < orderIds\.length; i \+= BATCH\)/.test(ent) && /const BATCH = 200;/.test(ent),
    "child rows must be fetched in bounded batches (no per-row query)");
  assert(/throw new Error\(`\$\{table\} query failed/.test(ent),
    "a child-row query error must THROW so the caller cancels the export");
  assert(/Promise\.all\(\[\s*\n\s*fetchProviderPaymentsForExport[\s\S]{0,200}?fetchAddonEntitlementsForExport/.test(barePage),
    "page.tsx must fetch provider payments and add-on entitlements together, before writing the file");

  // ── Every export call passes the entitlement map ──
  const callRe = /exportOrdersToCSV\(([^;]*?)\);/gs;
  let m, calls = 0, missing = 0;
  while ((m = callRe.exec(barePage)) !== null) {
    calls++;
    if (!/addonEntitlements/.test(m[1])) missing++;
  }
  assert(calls >= 2, "page.tsx must call exportOrdersToCSV for both the filtered and the selected export");
  assert(missing === 0, `every exportOrdersToCSV call must pass the addonEntitlements map (${missing}/${calls} missing)`);

  // ── The export covers the COMPLETE matching set, and has no row ceiling ──
  // BOTH export paths, counted: a bare `.test()` still passed while the Orders
  // CSV path alone had been switched back to the loaded rows.
  assert((barePage.match(/const all = await fetchAllMatchingOrders\(\);/g) || []).length === 2,
    "both exports must page the complete matching server-side dataset");
  assert(!/\.range\(0, 9999\)/.test(barePage) && !/10000/.test(barePage),
    "FORBIDDEN: no arbitrary 10,000-row export truncation");
  assert(/onClick=\{exportFilteredAll\}/.test(barePage),
    "the full Orders CSV export must be reachable in the UI (the callback existed unmounted for months)");

  // ── Formula-injection protection, numeric-safe ──
  assert(/export function neutralizeFormula/.test(exp),
    "exportOrders must expose neutralizeFormula");
  assert(/const s = neutralizeFormula\(raw\);/.test(bareExp),
    "csvEscape must neutralise EVERY cell, not selected columns");
  assert(/PLAIN_NUMBER\.test\(s\)\) return s;/.test(bareExp),
    "neutralisation must be numeric-safe (negative money must stay numeric)");
  assert(/\\r\\n/.test(exp) || /"\\r\\n"/.test(exp),
    "CRLF row separator preserved for Excel");
  assert(/s\.replace\(\/"\/g, '""'\)/.test(exp),
    "CSV double-quote escaping preserved");

  // ── The Meta Audience export is untouched ──
  assert(/const META_HEADERS = \["email", "phone", "fn", "ln", "st", "country", "dob", "doby", "age"\];/.test(meta),
    "Meta audience headers must remain the exact 9 identifiers");
  assert(!/Package|package|addon|Addon|neutralizeFormula/.test(meta),
    "FORBIDDEN: the Meta Audience export must not gain package/add-on data");

  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELF-TEST — every scenario passes with the correct logic, and each planted
// regression fails AT LEAST ONE.
// ─────────────────────────────────────────────────────────────────────────────
const BROKEN = [
  { flag: { anyRaRow: true }, label: "RA inferred from ANY request row (pending/cancelled counted)" },
  { flag: { anyPetRow: true }, label: "Additional Pet inferred from ANY request row (unpaid/cancelled counted)" },
  { flag: { petFirst: true }, label: "nondeterministic part order (Additional Pet before the base)" },
  { flag: { unknownAsEsa: true }, label: "indeterminate history guessed as ESA" },
];

function runSelfTest() {
  const results = [];
  for (const sc of SCENARIOS) {
    const r = runScenario(sc);
    results.push({ name: `correct: ${sc.name}`, pass: r.ok,
      detail: r.ok ? "" : `${r.id}: got "${r.got}" want "${r.want}"` });
  }
  for (const bv of BROKEN) {
    const anyFail = SCENARIOS.some((sc) => !runScenario(sc, bv.flag).ok);
    results.push({ name: `negative control caught: ${bv.label}`, pass: anyFail,
      detail: anyFail ? "" : `broken variant passed every scenario — scenarios lack power` });
  }
  // Formula injection: correct behaviour, then two planted regressions.
  for (const [input, want, why] of FORMULA_CASES) {
    const got = neutralizeFormula(input);
    results.push({ name: `formula guard: ${why}`, pass: got === want,
      detail: got === want ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}` });
  }
  const injectionOff = FORMULA_CASES.some(([i, w]) => neutralizeFormula(i, { disabled: true }) !== w);
  results.push({ name: "negative control caught: formula-injection protection removed", pass: injectionOff, detail: "" });
  const numericBroken = FORMULA_CASES.some(([i, w]) => neutralizeFormula(i, { numericUnsafe: true }) !== w);
  results.push({ name: "negative control caught: neutralisation stops being numeric-safe", pass: numericBroken, detail: "" });

  // STATIC negative controls — plant the regression in a COPY of the source and
  // assert runStatic's rules would reject it.
  const staticControls = [
    ["the Package / Add-ons column is removed", F_EXPORT,
      (x) => x.replace('  { label: "Package / Add-ons", get: (o, ctx) => ctx.packageAddons(o) },\n', "")],
    ["the export re-implements package identity", F_EXPORT,
      (x) => x.replace('{ label: "Service Type", get: (o) => serviceType(o) },',
        '{ label: "Service Type", get: (o) => serviceType(o) },\n  { label: "X", get: (o) => o.package_key === "esa_ra_bundle" ? "ESA + RA" : "" },')],
    ["formula-injection protection is removed", F_EXPORT,
      (x) => x.replace("const s = neutralizeFormula(raw);", "const s = raw;")],
    ["an unpaid Additional Pet status is added to the allowlist", F_ENT,
      (x) => x.replace('  "paid_pending_details",', '  "payment_required",\n  "paid_pending_details",')],
    ["RA is inferred from an uploaded document", F_ENT,
      (x) => x.replace('  return s(row.status).trim().toLowerCase() === RA_ADDON_ENTITLED_STATUS;',
        '  return s(row.additional_documentation_status) === "uploaded";')],
    ["the child-row read is unbatched", F_ENT,
      (x) => x.replace("const BATCH = 200;", "const CHUNK = 200;")],
    ["the Meta Audience export gains package data", F_META,
      (x) => x.replace('const META_HEADERS = ["email", "phone", "fn", "ln", "st", "country", "dob", "doby", "age"];',
        'const META_HEADERS = ["email", "phone", "fn", "ln", "st", "country", "dob", "doby", "age", "package"];')],
    ["Unknown is guessed as ESA", F_PKG,
      (x) => x.replace('  unknown: "Unknown",', '  unknown: "ESA",')],
    ["the export falls back to the rendered rows", F_PAGE,
      (x) => x.replace("      const all = await fetchAllMatchingOrders();", "      const all = orderRows;")],
    ["an export call stops passing the entitlement map", F_PAGE,
      (x) => x.replace('        providerPayments,\n        addonEntitlements,\n      );', "        providerPayments,\n      );")],
    ["the full Orders CSV export is unmounted again", F_PAGE,
      (x) => x.replace("onClick={exportFilteredAll}", "onClick={() => {}}")],
  ];
  const originals = new Map();
  // Through readSrc so the plants below see the same \n-normalised source the
  // static layer asserts against (see the note on readSrc).
  for (const f of [F_EXPORT, F_ENT, F_META, F_PKG, F_PAGE]) originals.set(f, readSrc(f));
  for (const [label, file, mutate] of staticControls) {
    const before = originals.get(file);
    const after = mutate(before);
    if (after === before) {
      results.push({ name: `NEGATIVE CONTROL (no-op — anchor moved): ${label}`, pass: false, detail: "" });
      continue;
    }
    const caught = runStaticOn({ ...Object.fromEntries(originals), [file]: after }).length > 0;
    results.push({ name: `negative control caught: ${label}`, pass: caught, detail: "" });
  }

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"} ${r.name}${RESET}${r.detail ? " — " + r.detail : ""}`));
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

// runStatic against an in-memory source map (used by the static negative controls).
let SOURCE_OVERRIDE = null;
// NORMALISE LINE ENDINGS ON READ — core.autocrlf=true can put these files on disk
// as CRLF while every multi-line anchor and every planted regression below is
// written with \n. Without this the plants match nothing and the static negative
// controls report NO-OP instead of protecting anything.
function readSrc(file) {
  if (SOURCE_OVERRIDE && SOURCE_OVERRIDE[file] !== undefined) return SOURCE_OVERRIDE[file];
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function runStaticOn(sources) {
  SOURCE_OVERRIDE = sources;
  try { return runStatic(); } finally { SOURCE_OVERRIDE = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  console.log(`${YELLOW}admin-orders export package/add-ons — self-test (logic + negative controls)${RESET}`);
  process.exit(runSelfTest());
} else {
  console.log(`${YELLOW}admin-orders export package/add-ons — guard (logic + static)${RESET}`);
  const logicFail = [];
  for (const sc of SCENARIOS) {
    const r = runScenario(sc);
    if (!r.ok) logicFail.push(`${sc.name} → ${r.id}: got "${r.got}" want "${r.want}"`);
  }
  for (const [input, want, why] of FORMULA_CASES) {
    const got = neutralizeFormula(input);
    if (got !== want) logicFail.push(`formula (${why}): got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
  const staticFail = runStatic();
  const all = [...logicFail.map((f) => `[logic] ${f}`), ...staticFail.map((f) => `[static] ${f}`)];
  if (all.length) {
    console.error(`${RED}✗ package/add-ons export guard FAILED${RESET}`);
    all.forEach((f) => console.error(`  ${RED}✗${RESET} ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}✓ ${SCENARIOS.length} logic scenarios + ${FORMULA_CASES.length} formula cases + all static invariants passed${RESET}`);
}
