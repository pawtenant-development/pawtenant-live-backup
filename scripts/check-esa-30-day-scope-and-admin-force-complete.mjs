// scripts/check-esa-30-day-scope-and-admin-force-complete.mjs
//
// ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 regression guard.
//
// OWNER DECISIONS (2026-09-04):
//   1. The 30-day official-letter rule applies to ESA orders ONLY. A PSD order
//      never enters the workflow, never gets a due date, never reopens, and
//      never triggers a 30-day provider/customer/admin notification.
//   2. An authenticated PawTenant admin can mark ANY order Completed, whatever
//      its status and whether or not a provider file exists — enforced by the
//      server, not by a button.
//
// ROOT CAUSE this guard pins: every gate in the workflow was
//     is_thirty_day_official_letter_state(state) AND paid AND has-provider
// i.e. it keyed on the CUSTOMER'S STATE and on nothing about the PRODUCT, so a
// PSD order in CA/AR/IA/LA/MT satisfied it exactly as an ESA order does.
//
// Four independent layers are asserted:
//   A. BEHAVIOUR — the real classifiers (client + edge) are transpiled and
//      EXECUTED against one fixture table, so a value change cannot slip past a
//      regex and the two copies cannot drift apart.
//   B. SQL WIRING — the migration is scanned with `--` comments stripped, so the
//      assertions are about the SQL that runs, not the prose above it.
//   C. UI / EDGE WIRING — TS/TSX scans strip comments AND string literals, so
//      they assert the USE of an identifier, never a mention of it in a comment
//      or a piece of copy.
//   D. HONESTY — completion without a customer-visible document must not send a
//      delivery email, must not manufacture a document, and must not let the
//      portal claim delivery.
//
// Usage:
//   node scripts/check-esa-30-day-scope-and-admin-force-complete.mjs             -> exit 1 on failure
//   node scripts/check-esa-30-day-scope-and-admin-force-complete.mjs --warn-only -> always exit 0
//   node scripts/check-esa-30-day-scope-and-admin-force-complete.mjs --self-test -> prove the controls trip
//
// PT_GUARD_ROOT redirects every repo read at a single point, so --self-test can
// run this guard (from the real node_modules) against a planted temp copy.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { build } from "esbuild";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, "..");
const ROOT = process.env.PT_GUARD_ROOT || REPO;
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const CLIENT_FAMILY = "src/lib/serviceFamily.ts";
const SERVER_FAMILY = "supabase/functions/_shared/serviceFamily.ts";
const MIGRATION = "supabase/migrations/20260904170000_esa_only_30_day_rule_and_admin_force_complete.sql";
const MODAL = "src/pages/admin-orders/components/OrderDetailModal.tsx";
const STATUS_FN = "supabase/functions/notify-order-status/index.ts";
const THIRTY_CUSTOMER = "supabase/functions/notify-thirty-day-customer/index.ts";
const THIRTY_PROVIDER = "supabase/functions/notify-thirty-day-reissue/index.ts";
const BOOKING = "src/lib/bookingProgress.ts";
const DELIVERY_CARD = "src/pages/my-orders/components/LetterDeliveryCard.tsx";
const CUSTOMER_DOCS = "src/lib/customerDocuments.ts";
const LIFECYCLE = "src/lib/orderLifecycle.ts";
const ADMIN_PAGE = "src/pages/admin-orders/page.tsx";
const PORTAL_PAGE = "src/pages/my-orders/page.tsx";

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

/** SINGLE read point. CRLF is normalised HERE and nowhere else. */
function read(root, rel) {
  return readFileSync(resolve(root, rel), "utf8").replace(/\r\n/g, "\n");
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

/**
 * SQL: strip `--` line comments and /* *​/ blocks only. A PL/pgSQL body lives
 * inside a $$-quoted string, so stripping string literals the way the TS scan
 * does would delete every function this guard exists to inspect.
 */
function sqlCodeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** The body of one CREATE [OR REPLACE] FUNCTION, comments stripped. */
function sqlFunctionBody(src, name) {
  const stripped = sqlCodeOnly(src);
  const start = stripped.indexOf(`FUNCTION public.${name}(`);
  if (start < 0) return null;
  // Body runs to the terminating `$$;` of that definition.
  const end = stripped.indexOf("$$;", start);
  return end < 0 ? null : stripped.slice(start, end + 3);
}

/**
 * BUNDLE, don't just transpile. These modules import each other and use the
 * `@/` alias, so a bare transform would leave unresolvable specifiers. Bundling
 * against `root` is also what makes --self-test honest: a planted edit to any
 * module in the graph reaches the executed code.
 */
async function loadTs(root, rel, tmpDir, name) {
  const result = await build({
    entryPoints: [resolve(root, rel)],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
    platform: "neutral",
    logLevel: "silent",
    alias: { "@": resolve(root, "src") },
  });
  const out = resolve(tmpDir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(out, result.outputFiles[0].text, "utf8");
  return import(pathToFileURL(out).href);
}

// ─────────────────────────────────────────────────────────────────────────────
// The fixture table — every product shape that exists or has ever existed.
// `confirmation_id` is carried ONLY so the id-prefix traps can be expressed; no
// classifier is allowed to read it.
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURES = [
  // ── ESA — must classify as esa ──
  { id: "esa one-time (current)", expect: "esa",
    o: { letter_type: "esa", package_key: "esa_standard", package_display_name: "ESA Letter", plan_type: "One-Time Purchase" } },
  { id: "esa annual", expect: "esa",
    o: { letter_type: "esa", package_key: "esa_standard", package_display_name: "ESA Letter", plan_type: "Subscription (Annual)" } },
  { id: "esa + reasonable accommodation", expect: "esa",
    o: { letter_type: "esa", package_key: "esa_ra_bundle", package_display_name: "ESA + Reasonable Accommodation Letter", plan_type: "One-Time Purchase" } },
  { id: "esa legacy — letter_type only", expect: "esa",
    o: { letter_type: "esa", package_key: null, package_display_name: null, plan_type: null } },
  { id: "esa legacy package esa_1pet", expect: "esa",
    o: { letter_type: "esa", package_key: "esa_1pet", package_display_name: "ESA Letter — 1 Pet", plan_type: null } },
  { id: "esa by display name only", expect: "esa",
    o: { letter_type: null, package_key: null, package_display_name: "ESA Letter", plan_type: null } },
  { id: "esa by long-form wording", expect: "esa",
    o: { letter_type: null, package_key: null, package_display_name: "Emotional Support Animal Letter", plan_type: null } },
  { id: "esa with mixed case + whitespace", expect: "esa",
    o: { letter_type: "  ESA  ", package_key: "ESA_Standard", package_display_name: null, plan_type: null } },

  // ── PSD — must classify as psd ──
  { id: "psd one-time (current)", expect: "psd",
    o: { letter_type: "psd", package_key: "psd_standard", package_display_name: "PSD Documentation", plan_type: "One-Time Purchase" } },
  { id: "psd annual", expect: "psd",
    o: { letter_type: "psd", package_key: null, package_display_name: null, plan_type: "Subscription (Annual)" } },
  { id: "psd + reasonable accommodation", expect: "psd",
    o: { letter_type: "psd", package_key: "psd_ra_bundle", package_display_name: "PSD + Reasonable Accommodation Letter", plan_type: "One-Time Purchase" } },
  { id: "psd consultation (legacy letter_type)", expect: "psd",
    o: { letter_type: "psd-consultation", package_key: null, package_display_name: null, plan_type: "PSD Consultation" } },
  { id: "psd by display name only", expect: "psd",
    o: { letter_type: null, package_key: null, package_display_name: "PSD Documentation", plan_type: null } },
  { id: "psd by long-form wording", expect: "psd",
    o: { letter_type: null, package_key: null, package_display_name: "Psychiatric Service Dog Letter", plan_type: null } },
  // The REAL contradiction row in TEST. PSD evidence must win.
  { id: "contradiction: letter_type psd + package esa_standard + display ESA Letter", expect: "psd",
    o: { letter_type: "psd", package_key: "esa_standard", package_display_name: "ESA Letter", plan_type: null } },
  { id: "contradiction: letter_type esa + package psd_standard", expect: "psd",
    o: { letter_type: "esa", package_key: "psd_standard", package_display_name: null, plan_type: null } },

  // ── Unknown — must fail CLOSED ──
  { id: "entirely blank legacy row", expect: "unknown",
    o: { letter_type: null, package_key: null, package_display_name: null, plan_type: null } },
  { id: "empty strings", expect: "unknown",
    o: { letter_type: "", package_key: "  ", package_display_name: "", plan_type: "" } },
  { id: "unrelated product wording", expect: "unknown",
    o: { letter_type: "housing", package_key: "housing_form", package_display_name: "Housing Form", plan_type: null } },

  // ── ID-PREFIX TRAPS — the id is a display reference and must never classify ──
  { id: "TRAP: ESA order whose confirmation id contains -PSD", expect: "esa",
    o: { letter_type: "esa", package_key: "esa_standard", package_display_name: "ESA Letter", plan_type: null,
         confirmation_id: "PT-PSDFIARSPET" } },
  { id: "TRAP: blank product fields with a PSD-looking id stays unknown", expect: "unknown",
    o: { letter_type: null, package_key: null, package_display_name: null, plan_type: null,
         confirmation_id: "PT-PSD977033Z3" } },
  { id: "TRAP: blank product fields with an ESA-looking id stays unknown", expect: "unknown",
    o: { letter_type: null, package_key: null, package_display_name: null, plan_type: null,
         confirmation_id: "PT-ESA12345" } },
];

/** Product × state eligibility. Only ESA in a 30-day state qualifies. */
const ELIGIBILITY = [
  { id: "ESA in CA", state: "CA", o: FIXTURES[0].o, expect: true },
  { id: "ESA in AR", state: "AR", o: FIXTURES[0].o, expect: true },
  { id: "ESA annual in CA", state: "ca", o: FIXTURES[1].o, expect: true },
  { id: "ESA+RA in MT", state: "MT", o: FIXTURES[2].o, expect: true },
  { id: "ESA legacy in IA", state: "IA", o: FIXTURES[3].o, expect: true },
  { id: "ESA in NY (not a 30-day state)", state: "NY", o: FIXTURES[0].o, expect: false },
  { id: "PSD one-time in CA", state: "CA", o: FIXTURES[8].o, expect: false },
  { id: "PSD annual in CA", state: "CA", o: FIXTURES[9].o, expect: false },
  { id: "PSD+RA in LA", state: "LA", o: FIXTURES[10].o, expect: false },
  { id: "PSD consultation in CA", state: "CA", o: FIXTURES[11].o, expect: false },
  { id: "contradiction row in CA", state: "CA", o: FIXTURES[14].o, expect: false },
  { id: "unknown legacy row in CA", state: "CA", o: FIXTURES[16].o, expect: false },
  { id: "PSD with no state at all", state: null, o: FIXTURES[8].o, expect: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// A. BEHAVIOUR — execute the real modules
// ─────────────────────────────────────────────────────────────────────────────
async function runBehaviour(root) {
  const tmpDir = resolve(REPO, "node_modules", ".cache", "esa-30day-guard");
  mkdirSync(tmpDir, { recursive: true });

  const client = await loadTs(root, CLIENT_FAMILY, tmpDir, "clientFamily");
  const server = await loadTs(root, SERVER_FAMILY, tmpDir, "serverFamily");

  // 1 · Classification, on BOTH copies, for every product shape.
  for (const f of FIXTURES) {
    eq(`1. client classifies ${f.id}`, client.classifyServiceFamily(f.o), f.expect);
    eq(`1. edge classifies ${f.id}`, server.classifyServiceFamily(f.o), f.expect);
  }

  // 2 · The two copies can never disagree — a drift here is the whole risk of
  //     keeping a mirror at all.
  for (const f of FIXTURES) {
    eq(`2. client and edge agree on ${f.id}`,
      client.classifyServiceFamily(f.o), server.classifyServiceFamily(f.o));
  }

  // 3 · Only ESA is a 30-day product. PSD and unknown both fail closed.
  for (const f of FIXTURES) {
    eq(`3. client 30-day product gate for ${f.id}`, client.isEsaThirtyDayProduct(f.o), f.expect === "esa");
    eq(`3. edge 30-day product gate for ${f.id}`, server.isEsaThirtyDayProduct(f.o), f.expect === "esa");
  }

  // 4 · Full eligibility = ESA product AND a 30-day relationship state.
  for (const e of ELIGIBILITY) {
    eq(`4. eligibility — ${e.id}`,
      client.isOfficialLetter30DayEligible({ ...e.o, state: e.state }), e.expect);
  }

  // 5 · The state list itself is the canonical five, and nothing else.
  eq("5. thirty-day states are exactly AR CA IA LA MT",
    [...client.THIRTY_DAY_OFFICIAL_LETTER_STATES].sort().join(","), "AR,CA,IA,LA,MT");
  for (const s of ["NY", "TX", "FL", "", null, undefined, "  "]) {
    eq(`5. ${JSON.stringify(s)} is not a 30-day state`, client.isThirtyDayOfficialLetterState(s), false);
  }

  // 6 · A 30-day MARKER is believed only on an ESA order — this is what stops a
  //     stale official_letter_reopened_at projecting a PSD order as "reopened".
  for (const f of FIXTURES) {
    eq(`6. thirtyDayMarkersApply for ${f.id}`, client.thirtyDayMarkersApply(f.o), f.expect === "esa");
  }

  // 7 · Neither classifier may read the confirmation id. Proven twice: by the
  //     traps above, and by the source itself.
  for (const [side, rel] of [["client", CLIENT_FAMILY], ["edge", SERVER_FAMILY]]) {
    check(`7. ${side} classifier never reads confirmation_id`, () =>
      !/confirmation_id/.test(codeOnly(read(root, rel)))
      || "the classifier source references confirmation_id — an order id is a display reference, not a product record");
  }

  // 8 · The column contract both sides publish is the same four fields.
  eq("8. client publishes the four classifier columns",
    [...client.SERVICE_FAMILY_COLUMNS].join(","),
    "letter_type,package_key,package_display_name,plan_type");
  eq("8. edge publishes the four classifier columns",
    server.SERVICE_FAMILY_COLUMNS.replace(/\s+/g, ""),
    "letter_type,package_key,package_display_name,plan_type");

  // 9 · The customer lifecycle must not claim delivery without a document.
  const booking = await loadTs(root, BOOKING, tmpDir, "booking");
  const deliveredOrder = {
    payment_intent_id: "pi_test", paid_at: "2026-09-01T00:00:00Z",
    doctor_status: "patient_notified", status: "completed",
    doctor_email: "provider@example.com", letter_id: "PT-VER-1",
  };
  const withDoc = booking.resolveLifecycle(deliveredOrder, { hasCustomerDocument: true });
  const withoutDoc = booking.resolveLifecycle(deliveredOrder, { hasCustomerDocument: false });
  const legacy = booking.resolveLifecycle(deliveredOrder);
  const last = (steps) => steps[steps.length - 1];

  eq("9. delivered WITH a document keeps the delivered label", last(withDoc).label, "Letter Delivered");
  check("9. delivered WITH a document keeps the ready hint", () =>
    /ready in your portal/i.test(last(withDoc).hint) || `got ${JSON.stringify(last(withDoc).hint)}`);
  check("9. delivered WITHOUT a document never says the documents are ready", () =>
    !/ready in your portal/i.test(last(withoutDoc).hint)
    || `the final step still tells the customer ${JSON.stringify(last(withoutDoc).hint)}`);
  check("9. delivered WITHOUT a document never says Letter Delivered", () =>
    last(withoutDoc).label !== "Letter Delivered"
    || "the final step still claims the letter was delivered");
  check("9. delivered WITHOUT a document points the customer at support", () =>
    /support/i.test(last(withoutDoc).hint) || `got ${JSON.stringify(last(withoutDoc).hint)}`);
  eq("9. omitting the option preserves the previous behaviour exactly",
    JSON.stringify(legacy), JSON.stringify(withDoc));

  // 10 · The document resolver's live answer is what the portal keys on, and a
  //      completed order with no rows must resolve to nothing to open.
  const docs = await loadTs(root, CUSTOMER_DOCS, tmpDir, "customerDocs");
  eq("10. completed order with no documents has no deliverable",
    docs.hasCustomerDeliverable({ confirmation_id: "PT-X", letter_type: "esa",
      doctor_status: "patient_notified", status: "completed", documents: [] }), false);
  eq("10. completed order with a live approved document has one",
    docs.hasCustomerDeliverable({ confirmation_id: "PT-X", letter_type: "esa",
      doctor_status: "patient_notified", status: "completed", letter_id: "V1",
      documents: [{ id: "d1", label: "Signed ESA Letter", doc_type: "esa_letter",
        file_url: "https://x/a.pdf", processed_file_url: null, footer_injected: false,
        uploaded_at: "2026-09-01T00:00:00Z", customer_visible: true,
        superseded_by_document_id: null, review_status: "approved" }] }), true);
  eq("10. a document still awaiting approval is not a deliverable",
    docs.hasCustomerDeliverable({ confirmation_id: "PT-X", letter_type: "esa",
      doctor_status: "patient_notified", status: "completed", letter_id: "V1",
      documents: [{ id: "d1", label: "Signed ESA Letter", doc_type: "esa_letter",
        file_url: "https://x/a.pdf", processed_file_url: null, footer_injected: false,
        uploaded_at: "2026-09-01T00:00:00Z", customer_visible: true,
        superseded_by_document_id: null, review_status: "pending_admin_approval" }] }), false);

  // 11 · The lifecycle classifier believes a 30-day reopen marker only on ESA.
  const lifecycle = await loadTs(root, LIFECYCLE, tmpDir, "orderLifecycle");
  const reopenedShape = {
    payment_intent_id: "pi_test", status: "under-review", doctor_status: "thirty_day_reissue",
    doctor_email: "p@example.com",
    official_letter_reopened_at: "2026-08-01T00:00:00Z", official_letter_final_completed_at: null,
  };
  eq("11. an ESA order with a 30-day reopen marker is 'reopened'",
    lifecycle.orderWorkflowState({ ...reopenedShape, letter_type: "esa" }), "reopened");
  eq("11. a PSD order carrying a stale 30-day reopen marker is NOT 'reopened'",
    lifecycle.orderWorkflowState({ ...reopenedShape, letter_type: "psd" }), "under_review");
  eq("11. an unknown-product order carrying the marker is NOT 'reopened'",
    lifecycle.orderWorkflowState({ ...reopenedShape, letter_type: null }), "under_review");
  eq("11. isReopenedOrder ignores a PSD 30-day marker",
    lifecycle.isReopenedOrder({ ...reopenedShape, letter_type: "psd" }), false);
  eq("11. isReopenedOrder honours a generic reopen on any product",
    lifecycle.isReopenedOrder({ ...reopenedShape, letter_type: "psd", last_reopened_at: "2026-08-02T00:00:00Z" }), true);
}

// ─────────────────────────────────────────────────────────────────────────────
// B. SQL WIRING — the migration that actually runs
// ─────────────────────────────────────────────────────────────────────────────
function runSqlWiring(root) {
  const sql = read(root, MIGRATION);
  const code = sqlCodeOnly(sql);

  const eligible = sqlFunctionBody(sql, "is_official_letter_30_day_eligible");
  const trigger = sqlFunctionBody(sql, "handle_official_letter_completion");
  const cron = sqlFunctionBody(sql, "reopen_due_official_letter_orders");
  const repair = sqlFunctionBody(sql, "repair_psd_official_letter_state");
  const force = sqlFunctionBody(sql, "admin_force_complete_order");
  const preview = sqlFunctionBody(sql, "admin_force_complete_preview");
  const classify = sqlFunctionBody(sql, "classify_order_service_family");

  check("B1. the eligibility predicate exists", () => !!eligible || "is_official_letter_30_day_eligible is missing");
  check("B1. eligibility requires the ESA family", () =>
    /order_service_family\([\s\S]*?\)\s*=\s*'esa'/.test(eligible ?? "")
    || "eligibility does not require order_service_family(...) = 'esa'");
  check("B1. eligibility still requires a 30-day state", () =>
    /is_thirty_day_official_letter_state\(/.test(eligible ?? "")
    || "eligibility dropped the 30-day state requirement — ESA behaviour must be unchanged");

  // 1/5. PSD admitted into the workflow · ESA accidentally excluded.
  check("B2. the completion trigger gates on the service family", () =>
    /order_service_family\(/.test(trigger ?? "") || "handle_official_letter_completion does not classify the product");
  check("B2. the completion trigger admits ONLY esa", () =>
    /v_family\s*<>\s*'esa'/.test(trigger ?? "")
    || "the completion trigger does not fail closed for anything that is not esa");
  // 2. PSD assigned a 30-day due date.
  check("B2. a non-ESA order never gets a due date, and stale state is cleared", () =>
    /official_letter_30_day_required\s*:=\s*false/.test(trigger ?? "")
    && /official_letter_due_at\s*:=\s*null/.test(trigger ?? "")
    || "the trigger does not clear stale 30-day scheduling on a non-ESA order");
  check("B2. ESA enrollment still schedules day 29", () =>
    /interval\s*'29 days'/.test(trigger ?? "") || "the ESA day-29 schedule was changed or lost");

  // 3. PSD selected by the cron/sweeper · 4. PSD reopened after 30 days.
  check("B3. the cron selects on the eligibility predicate", () =>
    /WHERE\s+public\.is_official_letter_30_day_eligible\(/i.test(cron ?? "")
    || "reopen_due_official_letter_orders does not gate its SELECT on the eligibility predicate");
  check("B3. the cron no longer selects on the bare state predicate", () =>
    !/WHERE\s+public\.is_thirty_day_official_letter_state\(state\)/i.test(cron ?? "")
    || "the cron still admits any order in a 30-day STATE regardless of product");
  check("B3. the cron still enforces the once-per-cycle reopen gate", () =>
    /official_letter_reopened_at\s+IS\s+NULL/i.test(cron ?? "")
    || "the cron lost its idempotency gate — an order could reopen twice");
  check("B3. the cron is not exposed to clients", () =>
    /REVOKE ALL ON FUNCTION public\.reopen_due_official_letter_orders\(\) FROM authenticated/.test(code)
    || "reopen_due_official_letter_orders is not revoked from authenticated");

  // 16. Historical PSD repair touching payment or document fields.
  check("B4. the repair exists and defaults to a dry run", () =>
    /repair_psd_official_letter_state\(p_dry_run boolean DEFAULT true\)/.test(code)
    || "the repair function is missing or does not default to a dry run");
  check("B4. the repair writes ONLY the two scheduling columns", () => {
    const updates = [...(repair ?? "").matchAll(/UPDATE\s+public\.orders[\s\S]*?WHERE/gi)].map((m) => m[0]);
    if (updates.length === 0) return "the repair contains no orders UPDATE at all";
    const forbidden = /(price|payment_intent_id|paid_at|refund|signed_letter_url|letter_url|letter_id|doctor_user_id|doctor_email|doctor_status|status\s*=|coupon|subscription)/i;
    for (const u of updates) {
      if (forbidden.test(u)) return `the repair UPDATE touches a protected column: ${u.slice(0, 160)}`;
    }
    return true;
  });
  check("B4. the repair never touches documents or earnings", () =>
    !/order_documents|doctor_earnings|order_document_versions/i.test(repair ?? "")
    || "the repair reads or writes documents/earnings — it must only clear scheduling");
  check("B4. already-reopened orders are reported, never guessed back", () =>
    /already_reopened_needs_owner_review/.test(repair ?? "")
    || "the repair does not separate already-reopened orders for owner review");
  check("B4. the repairable set EXCLUDES anything already reopened", () => {
    // The repairable loop must be the one that writes. If it can select a row
    // whose reopen already happened, the repair is guessing at a lifecycle state
    // that has to come out of audit history instead.
    const loop = (repair ?? "").match(/FOR r IN[\s\S]*?LOOP/);
    if (!loop) return "the repair has no selection loop";
    return /official_letter_reopened_at IS NULL/i.test(loop[0])
      || "the repair's writing loop can select an order the rule already reopened";
  });
  check("B4. the repair is idempotent by construction", () =>
    /official_letter_30_day_required\s*=\s*true\s+OR\s+official_letter_due_at IS NOT NULL/i.test(repair ?? "")
    || "the repair does not restrict itself to rows that still carry 30-day state");

  // 9. Provider or customer granted the override · 15. UI-only authorization.
  check("B5. force complete is gated on the canonical admin predicate", () =>
    /IF NOT public\.is_admin_staff\(\) THEN[\s\S]{0,200}RAISE EXCEPTION/i.test(force ?? "")
    || "admin_force_complete_order does not fail closed on is_admin_staff()");
  check("B5. force complete never authorizes through user_metadata", () =>
    !/user_metadata|raw_user_meta_data/i.test(force ?? "")
    || "admin_force_complete_order reads editable user metadata");
  check("B5. the preview is admin-gated too", () =>
    /IF NOT public\.is_admin_staff\(\) THEN/i.test(preview ?? "")
    || "admin_force_complete_preview leaks order consequences to a non-admin");
  check("B5. anon can never execute the override", () =>
    /REVOKE ALL ON FUNCTION public\.admin_force_complete_order\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated/.test(code)
    || "the override is not revoked from PUBLIC/anon/authenticated before being granted");
  check("B5. only the two admin RPCs are granted to authenticated", () => {
    const grants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort();
    return grants.join(",") === "admin_force_complete_order,admin_force_complete_preview"
      || `unexpected grants: ${grants.join(",") || "(none)"}`;
  });
  check("B5. every new function pins its search_path", () => {
    const defs = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$/g)];
    const bad = defs.filter(([, name, head]) =>
      name !== "handle_official_letter_completion" && !/SET search_path/i.test(head)).map(([, n]) => n);
    return bad.length === 0 || `functions without a pinned search_path: ${bad.join(", ")}`;
  });

  // 6. Order classification based only on ID prefix.
  check("B6. the SQL classifier never reads confirmation_id", () =>
    !/confirmation_id/i.test(classify ?? "")
    || "classify_order_service_family reads confirmation_id");
  check("B6. PSD evidence is evaluated BEFORE ESA evidence", () => {
    const psdAt = (classify ?? "").search(/THEN 'psd'/);
    const esaAt = (classify ?? "").search(/THEN 'esa'/);
    return (psdAt >= 0 && esaAt >= 0 && psdAt < esaAt)
      || "the classifier does not let PSD evidence win over ESA evidence";
  });
  check("B6. an unprovable row is 'unknown', not 'esa'", () =>
    /ELSE 'unknown'/.test(classify ?? "")
    || "the classifier falls back to something other than 'unknown'");

  // 10. Completion manufacturing a document · 13. Unassigned completion creating earnings.
  check("B7. the override never writes a document or a verification record", () =>
    !/INSERT INTO public\.(order_documents|order_document_versions|letter_verifications)/i.test(force ?? "")
    && !/(signed_letter_url|letter_url|letter_id)\s*=/i.test(force ?? "")
    || "admin_force_complete_order manufactures a document, URL or verification id");
  check("B7. the override never creates a provider earning", () =>
    !/INSERT INTO public\.doctor_earnings/i.test(force ?? "")
    || "admin_force_complete_order inserts a provider earning");
  check("B7. the override never assigns a provider", () =>
    !/doctor_user_id\s*=|doctor_email\s*=/i.test(force ?? "")
    || "admin_force_complete_order writes a provider assignment");
  check("B7. the override reports that no earning was created", () =>
    /'provider_earning_created',\s*false/.test(force ?? "")
    || "the override does not state its payout consequence in its result");

  // 12. Duplicate completion creating duplicate audit/events/earnings.
  check("B8. the override is idempotent on an already-completed order", () =>
    /IF v_order\.status = 'completed' AND v_order\.doctor_status = 'patient_notified' THEN[\s\S]{0,600}?'already_completed'/i.test(force ?? "")
    || "a repeated submission is not short-circuited before the write");
  check("B8. the idempotent path returns BEFORE the update and the audit row", () => {
    const idx = (force ?? "").search(/'already_completed'/);
    const upd = (force ?? "").search(/UPDATE public\.orders/i);
    const aud = (force ?? "").search(/INSERT INTO public\.audit_logs/i);
    return (idx >= 0 && upd > idx && aud > idx)
      || "the already-completed return does not precede the order write and the audit insert";
  });
  check("B8. the idempotent path suppresses the customer notification", () => {
    const seg = (force ?? "").slice((force ?? "").search(/'already_completed'/));
    return /'notify_customer',\s*false/.test(seg.slice(0, 800))
      || "a repeated submission could still ask the client to send a completion email";
  });

  // 14. Stale edit returning a retryable/hanging error.
  check("B9. a stale edit is refused cleanly, not by raising", () =>
    /'stale_order'/.test(force ?? "") && /RETURN jsonb_build_object\([\s\S]{0,200}'stale_order'/.test(force ?? "")
    || "the stale-edit path does not RETURN a stated refusal");
  check("B9. the stale refusal is marked non-retryable", () =>
    /'retryable',\s*false/.test(force ?? "")
    || "the stale refusal does not tell the caller to stop retrying");
  check("B9. the stale check happens before any write", () => {
    const stale = (force ?? "").search(/'stale_order'/);
    const upd = (force ?? "").search(/UPDATE public\.orders/i);
    return (stale >= 0 && upd > stale) || "the stale check does not precede the order write";
  });
  check("B9. the row is locked for the duration", () =>
    /FROM public\.orders WHERE id = p_order_id FOR UPDATE/i.test(force ?? "")
    || "the override does not take a row lock");

  // A reason is genuinely required.
  check("B10. the override validates a required reason", () =>
    /validate_reopen_reason\(p_reason\)/.test(force ?? "")
    || "admin_force_complete_order does not run the shared reason validator");
  check("B10. the reason is recorded on the order and in the audit row", () =>
    /admin_force_complete_reason\s*=\s*v_reason/.test(force ?? "")
    && /'reason',\s*v_reason/.test(force ?? "")
    || "the reason is not persisted on both the order and the audit entry");

  // The audit contract the owner asked for, field by field.
  check("B11. the audit row carries every required field", () => {
    const missing = [
      ["admin user id", /actor_id/],
      ["previous status", /'status',\s*v_prev_s/],
      ["new status", /'status',\s*v_order\.status/],
      ["reason", /'reason',\s*v_reason/],
      ["document-present flag", /'document_present',\s*v_has_doc/],
      ["provider-present flag", /'provider_present',\s*v_provider/],
      ["override type", /'override_type',\s*'admin_force_complete'/],
    ].filter(([, re]) => !re.test(force ?? "")).map(([n]) => n);
    return missing.length === 0 || `audit row is missing: ${missing.join(", ")}`;
  });

  // 11. Missing-document completion must be recorded canonically.
  check("B12. the no-document condition is stamped on the order", () =>
    /completed_without_customer_document\s*=\s*NOT v_has_doc/.test(force ?? "")
    || "the override does not record completed_without_customer_document");
  check("B12. document presence is resolved server-side, never supplied", () =>
    /public\.order_has_customer_visible_document\(v_order\.id\)/.test(force ?? "")
    || "the override does not compute document presence itself");
  check("B12. the notification flag follows document presence", () =>
    /'notify_customer',\s*v_has_doc/.test(force ?? "")
    || "the override does not tie the customer notification to document presence");
}

// ─────────────────────────────────────────────────────────────────────────────
// C. UI + EDGE WIRING — comments AND string literals stripped
// ─────────────────────────────────────────────────────────────────────────────
function runWiring(root) {
  const modal = codeOnly(read(root, MODAL));
  const modalRaw = read(root, MODAL);

  // 7. Admin completion button disabled for Under Review.
  // 8. Admin completion disabled when no document exists.
  check("C1. the completion control calls the override dialog", () =>
    /onClick=\{openForceComplete\}/.test(modal) || /openForceComplete\(\)/.test(modal)
    || "no completion control opens the force-complete dialog");
  check("C1. no completion control is disabled by hasProviderDocs", () => {
    const bad = [...modal.matchAll(/disabled=\{[^}]*hasProviderDocs[^}]*\}/g)].map((m) => m[0]);
    return bad.length === 0 || `a control is still gated on the provider document: ${bad.join(" | ")}`;
  });
  check("C1. every completion control is disabled ONLY by the in-flight request", () => {
    // Each <button> that opens the override, and what it is disabled by. The
    // ONLY legitimate reason to disable it is a request already in flight —
    // never the order status, never the presence of a provider document.
    const buttons = [...modal.matchAll(/<button[\s\S]{0,600}?openForceComplete[\s\S]{0,200}?>/g)].map((m) => m[0]);
    if (buttons.length < 2) return `expected at least 2 override entry points, found ${buttons.length}`;
    for (const b of buttons) {
      const d = b.match(/disabled=\{([^}]*)\}/);
      if (!d) continue;
      if (d[1].trim() !== "forceCompleteBusy") {
        return `a completion control is gated on more than the in-flight request: disabled={${d[1].trim()}}`;
      }
    }
    return true;
  });
  check("C1. no completion path bypasses the audited override", () =>
    !/handleSetStatus\(\s*"completed"/.test(modalRaw)
    || "a completion still goes through the un-reasoned handleSetStatus path");
  check("C1. the override is reachable for an UNPAID lead", () => {
    // The unpaid-lead panel must carry its own entry point. (The header item is
    // outside the payment gate too, but that is asserted separately below.)
    const at = modalRaw.indexOf("<strong>Unpaid lead</strong>");
    if (at < 0) return "the unpaid-lead panel could not be located";
    return /openForceComplete/.test(modalRaw.slice(at, at + 2500))
      || "an unpaid lead has no completion control at all";
  });
  check("C1. the header completion item sits OUTSIDE the paid-only block", () => {
    const headerItem = modal.indexOf("openForceComplete");
    const paidGate = modal.indexOf("!!order.payment_intent_id &&");
    return (headerItem >= 0 && paidGate >= 0 && headerItem < paidGate)
      || "the header completion item is inside the paid-only block";
  });

  // 15. UI-only authorization with no backend enforcement.
  check("C2. the client calls the server override, not a bare table update", () =>
    /rpc\(\s*""\s*,/.test(modal) && /admin_force_complete_order/.test(modalRaw)
    || "the modal does not call the admin_force_complete_order RPC");
  check("C2. the modal never completes an order with a direct orders update", () => {
    const seg = modalRaw.slice(modalRaw.indexOf("const confirmForceComplete"), modalRaw.indexOf("const handleGhlRefire"));
    return !/from\(\s*["']orders["']\s*\)\s*\.update/.test(seg)
      || "the override writes orders directly from the client";
  });
  check("C2. the dialog reads its consequences from the server preview", () =>
    /admin_force_complete_preview/.test(modalRaw)
    || "the confirmation dialog derives consequences on the client");
  check("C2. a stale edit is detected with an expected-state token", () =>
    /p_expected_status/.test(modalRaw) && /p_expected_doctor_status/.test(modalRaw)
    || "the client sends no optimistic-concurrency token");
  check("C2. the client sends the delivery email ONLY when the server allows it", () =>
    /if \(r\.notify_customer\) \{/.test(modal)
    || "the client does not condition the completion email on the server's notify_customer verdict");

  // The dialog must display all six required facts.
  check("C3. the confirmation dialog RENDERS every required consequence", () => {
    // Reading the field off the preview object — not merely declaring it in the
    // TypeScript interface — is what proves the operator actually sees it.
    const missing = [
      "current_status", "current_doctor_status", "resulting_status",
      "has_provider", "has_customer_document", "will_notify_customer",
      "existing_provider_earnings",
    ].filter((f) => !new RegExp(`forceCompletePreview\\.${f}\\b`).test(modalRaw));
    return missing.length === 0 || `the dialog does not display: ${missing.join(", ")}`;
  });
  check("C3. the missing-document warning is rendered before confirmation", () => {
    const at = modalRaw.indexOf("!forceCompletePreview.has_customer_document");
    const confirm = modalRaw.indexOf("onClick={confirmForceComplete}");
    return (at >= 0 && confirm > at)
      || "there is no missing-document warning ahead of the confirm button";
  });
  check("C3. a reason is required before the dialog can be confirmed", () =>
    /disabled=\{forceCompleteBusy \|\| !forceReasonValid/.test(modal)
    || "the confirm button does not require a valid reason");
  check("C3. the client reason rule mirrors validate_reopen_reason", () =>
    /trimmedForceReason\.length >= 5/.test(modal) && /trimmedForceReason\.length <= 1000/.test(modal)
    || "the client reason rule does not mirror the server contract");

  // 1/5 on the admin surface: the 30-day panel is ESA-gated.
  check("C4. the 30-day admin panel uses the shared eligibility predicate", () =>
    /isThirtyDayState\s*=\s*isOfficialLetter30DayEligible\(order\)/.test(modal)
    || "the admin 30-day control still derives eligibility from a local state list");
  check("C4. the modal no longer keeps its own 30-day state array", () =>
    !/const THIRTY_DAY_STATES\s*=/.test(modal)
    || "a local THIRTY_DAY_STATES array survives in the modal — a second source of truth");

  // The list query must carry what the surfaces need.
  const page = read(root, ADMIN_PAGE);
  // Scoped to the ORDERS_LIST_COLUMNS projection itself — a mention of the
  // column anywhere else in the file is not the same as selecting it.
  const listColumns = (() => {
    const at = page.indexOf("const ORDERS_LIST_COLUMNS");
    if (at < 0) return "";
    const end = page.indexOf(";", page.indexOf('"', at) + 1);
    return page.slice(at, page.indexOf("\n\n", at) > at ? page.indexOf("\n\n", at) : end);
  })();
  for (const col of ["letter_type", "package_key", "package_display_name", "plan_type",
                     "completed_without_customer_document"]) {
    check(`C5. the admin orders projection selects ${col}`, () =>
      new RegExp(`[",]${col}[,"]`).test(listColumns)
      || `${col} is not in ORDERS_LIST_COLUMNS — the classification would silently weaken to "unknown"`);
  }

  // ── Edge functions ──
  const statusFn = read(root, STATUS_FN);
  const statusCode = codeOnly(statusFn);
  // 11. Missing-document completion sending a delivery email.
  check("D1. notify-order-status refuses the completion email with no document", () =>
    /completed_without_customer_document/.test(statusCode)
    || "the completion email has no server-side missing-document refusal");
  check("D1. the refusal is the branch condition, not merely mentioned in it", () =>
    /if \(newStatus === "" && order\.completed_without_customer_document === true\) \{/.test(statusCode)
    || "the missing-document refusal is not the whole condition of its own branch");
  check("D1. the refusal re-checks live document presence", () =>
    /order_documents/.test(statusFn) && /customer_visible/.test(statusFn)
    || "the refusal trusts the stored flag alone and can never self-heal");
  check("D1. the refusal happens before the email is composed", () => {
    const refusal = statusFn.indexOf("completed_without_customer_document");
    const compose = statusFn.indexOf("buildCompletedEmail({");
    return (refusal >= 0 && compose > refusal) || "the refusal does not precede composing the email";
  });

  for (const [label, rel] of [["customer", THIRTY_CUSTOMER], ["provider", THIRTY_PROVIDER]]) {
    const src = read(root, rel);
    const code = codeOnly(src);
    check(`D2. the 30-day ${label} notification imports the shared classifier`, () =>
      /_shared\/serviceFamily\.ts/.test(src) && /classifyServiceFamily/.test(code)
      || `notify-thirty-day-${label} has no product gate`);
    check(`D2. the 30-day ${label} notification admits ONLY esa`, () =>
      /classifyServiceFamily\(order\) !== \s*""|classifyServiceFamily\(order\);?[\s\S]{0,120}family !== \s*""/.test(code)
      || `notify-thirty-day-${label} does not fail closed on a non-ESA order`);
    check(`D2. the 30-day ${label} notification selects the classifier columns`, () =>
      /SERVICE_FAMILY_COLUMNS/.test(code)
      || `notify-thirty-day-${label} classifies from columns it did not select`);
    check(`D2. the 30-day ${label} refusal precedes the Resend call`, () => {
      const gate = src.indexOf("classifyServiceFamily");
      const send = src.indexOf("api.resend.com");
      return (gate >= 0 && send > gate) || `the ${label} gate does not precede the send`;
    });
  }
  // The manual employee reopen email must stay available for EVERY product.
  check("D3. the manual reopen provider email is not ESA-gated", () =>
    /!isManualReopen && classifyServiceFamily\(order\) !== \s*""/.test(codeOnly(read(root, THIRTY_PROVIDER)))
    || "the ESA gate also blocks the generic manual-reopen provider email");

  // ── Customer portal honesty ──
  const card = codeOnly(read(root, DELIVERY_CARD));
  check("E1. the delivery card asks whether a deliverable exists", () =>
    /hasCustomerDeliverable\(order\)/.test(card)
    || "LetterDeliveryCard still keys delivery purely on doctor_status");
  check("E1. the card only steps aside when there IS something to download", () =>
    /patient_notified\s*""?\s*&& hasDeliverable\) return null/.test(card.replace(/\s+/g, " "))
    || /&& hasDeliverable\) return null/.test(card)
    || "the card returns null for a completed order even when nothing exists to open");
  check("E1. the missing-document card offers no download control", () => {
    const raw = read(root, DELIVERY_CARD);
    const seg = raw.slice(raw.indexOf("!hasDeliverable"), raw.indexOf("const letter ="));
    return !/<button/.test(seg)
      || "the missing-document card renders a button that cannot lead anywhere";
  });
  const booking = codeOnly(read(root, BOOKING));
  check("E2. the lifecycle accepts a document-presence signal", () =>
    /hasCustomerDocument/.test(booking) || "resolveLifecycle cannot be told a document is missing");

  // ── The portal's own "documents were sent" banner ──────────────────────────
  // It used to key on `patient_notified` ALONE, which an admin force-complete
  // sets with no document and no email — so it claimed both a delivery and a
  // send that never happened. Every surface that asserts delivery must ask
  // whether a deliverable exists.
  const portalPage = codeOnly(read(root, PORTAL_PAGE));
  check("E4. the documents-were-sent banner requires a real deliverable", () => {
    const at = portalPage.indexOf('doctor_status === "" && ');
    const idx = portalPage.search(/doctor_status === ""\s*&&\s*hasCustomerDeliverable\(order\)/);
    if (idx >= 0) return true;
    // Locate whatever the banner IS gated on, to report it precisely.
    const m = portalPage.match(/\{\s*order\.doctor_status === ""[^&|]*(&&[^)]*)?\s*&&\s*\(/);
    return `the banner is not gated on hasCustomerDeliverable(order)${m ? ` — found: ${m[0].trim().slice(0, 90)}` : ""}${at >= 0 ? "" : ""}`;
  });
  check("E4. the portal page imports the shared deliverable check", () =>
    /hasCustomerDeliverable/.test(portalPage)
    || "my-orders/page.tsx does not use hasCustomerDeliverable — a delivery claim can drift again");

}

async function runAll(root) {
  await runBehaviour(root).catch((e) => failures.push(`behaviour threw: ${e?.message ?? e}`));
  try { runSqlWiring(root); } catch (e) { failures.push(`sql wiring threw: ${e?.message ?? e}`); }
  try { runWiring(root); } catch (e) { failures.push(`wiring threw: ${e?.message ?? e}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative controls — one per protection the owner named
// ─────────────────────────────────────────────────────────────────────────────
const CONTROLS = [
  {
    name: "N1 — PSD is admitted into the 30-day workflow (classifier lets ESA evidence win)",
    file: CLIENT_FAMILY,
    apply: (s) => s.replace(
      '  if (\n    lt.startsWith("psd") || pk.startsWith("psd") || pdn.startsWith("psd") || pt.startsWith("psd")',
      '  if (\n    false && (lt.startsWith("psd") || pk.startsWith("psd") || pdn.startsWith("psd") || pt.startsWith("psd"))'),
  },
  {
    name: "N2 — PSD is assigned a 30-day due date (trigger stops gating on the family)",
    file: MIGRATION,
    apply: (s) => s.replace(
      "  IF v_family <> 'esa' THEN\n    IF NEW.official_letter_30_day_required OR NEW.official_letter_due_at IS NOT NULL THEN",
      "  IF v_family = 'never' THEN\n    IF NEW.official_letter_30_day_required OR NEW.official_letter_due_at IS NOT NULL THEN"),
  },
  {
    name: "N3 — PSD is selected by the cron sweeper (state-only predicate restored)",
    file: MIGRATION,
    apply: (s) => s.replace(
      "    WHERE public.is_official_letter_30_day_eligible(\n            letter_type, package_key, package_display_name, plan_type,\n            parent_order_id, state)                     -- ESA-ONLY (see header)",
      "    WHERE public.is_thirty_day_official_letter_state(state)"),
  },
  {
    name: "N4 — PSD is reopened after 30 days (the once-per-cycle gate is dropped)",
    file: MIGRATION,
    apply: (s) => s.replace(
      "      AND official_letter_reopened_at IS NULL\n    FOR UPDATE SKIP LOCKED",
      "    FOR UPDATE SKIP LOCKED"),
  },
  {
    name: "N5 — ESA is accidentally excluded (eligibility demands psd)",
    file: MIGRATION,
    apply: (s) => s.replace(
      "           p_parent_order_id) = 'esa';\n$$;",
      "           p_parent_order_id) = 'psd';\n$$;"),
  },
  {
    name: "N6 — classification falls back to the confirmation id prefix",
    file: SERVER_FAMILY,
    apply: (s) => s.replace(
      "  return \"unknown\";\n}",
      "  const cid = norm((o as { confirmation_id?: string }).confirmation_id);\n  if (cid.includes(\"-psd\")) return \"psd\";\n  if (cid.includes(\"-esa\")) return \"esa\";\n  return \"unknown\";\n}"),
  },
  {
    name: "N7 — the admin completion button is disabled for a non-under-review status",
    file: MODAL,
    apply: (s) => s.replace(
      "                          disabled={forceCompleteBusy}\n                          onClick={openForceComplete}",
      "                          disabled={forceCompleteBusy || order.status !== \"under-review\"}\n                          onClick={openForceComplete}"),
  },
  {
    name: "N8 — the admin completion button is disabled when no document exists",
    file: MODAL,
    apply: (s) => s.replace(
      "                          disabled={forceCompleteBusy}\n                          onClick={openForceComplete}",
      "                          disabled={forceCompleteBusy || !hasProviderDocs}\n                          onClick={openForceComplete}"),
  },
  {
    name: "N9 — a provider or customer is granted the override (admin gate removed)",
    file: MIGRATION,
    apply: (s) => s.replace(
      "  IF NOT public.is_admin_staff() THEN\n    RAISE EXCEPTION 'admin_force_complete_order: not authorised' USING errcode = 'insufficient_privilege';\n  END IF;",
      "  -- authorization removed"),
  },
  {
    name: "N9b — the override authorizes through editable user_metadata",
    file: MIGRATION,
    apply: (s) => s.replace(
      "  IF NOT public.is_admin_staff() THEN\n    RAISE EXCEPTION 'admin_force_complete_order: not authorised' USING errcode = 'insufficient_privilege';\n  END IF;",
      "  IF NOT coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) THEN\n    RAISE EXCEPTION 'admin_force_complete_order: not authorised' USING errcode = 'insufficient_privilege';\n  END IF;"),
  },
  {
    name: "N10 — completion manufactures a document URL",
    file: MIGRATION,
    apply: (s) => s.replace(
      "         completed_without_customer_document = NOT v_has_doc\n   WHERE id = v_order.id",
      "         completed_without_customer_document = NOT v_has_doc,\n         signed_letter_url = coalesce(v_order.signed_letter_url, 'https://pawtenant.com/pending.pdf')\n   WHERE id = v_order.id"),
  },
  {
    name: "N11 — a missing-document completion still sends the delivery email",
    file: STATUS_FN,
    apply: (s) => s.replace(
      "  if (newStatus === \"completed\" && order.completed_without_customer_document === true) {",
      "  if (false && newStatus === \"completed\" && order.completed_without_customer_document === true) {"),
  },
  {
    name: "N11b — the client sends the delivery email regardless of the server verdict",
    file: MODAL,
    apply: (s) => s.replace(
      "    if (r.notify_customer) {",
      "    if (true) {"),
  },
  {
    name: "N12 — a repeated completion writes a second audit row",
    file: MIGRATION,
    apply: (s) => s.replace(
      "  IF v_order.status = 'completed' AND v_order.doctor_status = 'patient_notified' THEN\n    RETURN jsonb_build_object(\n      'transitioned', false, 'reason', 'already_completed', 'idempotent', true,",
      "  IF false THEN\n    RETURN jsonb_build_object(\n      'transitioned', false, 'reason', 'already_completed', 'idempotent', true,"),
  },
  {
    name: "N13 — an unassigned completion creates a provider earning",
    file: MIGRATION,
    apply: (s) => s.replace(
      "  INSERT INTO public.audit_logs (\n    actor_id, actor_name, actor_role, actor_type, category, source,",
      "  INSERT INTO public.doctor_earnings (order_id, confirmation_id, status, earning_type)\n  VALUES (v_order.id, v_order.confirmation_id, 'pending', 'base');\n\n  INSERT INTO public.audit_logs (\n    actor_id, actor_name, actor_role, actor_type, category, source,"),
  },
  {
    name: "N14 — a stale edit raises instead of refusing cleanly",
    file: MIGRATION,
    apply: (s) => s.replace(
      "    RETURN jsonb_build_object(\n      'transitioned', false, 'reason', 'stale_order', 'retryable', false,",
      "    RAISE EXCEPTION 'admin_force_complete_order: stale order, please retry' USING errcode = '40001';\n    RETURN jsonb_build_object(\n      'transitioned', false, 'reason', 'stale_edit', 'retryable', true,"),
  },
  {
    name: "N15 — the override becomes UI-only (client writes orders directly)",
    file: MODAL,
    apply: (s) => s.replace(
      "    const { data, error } = await supabase.rpc(\"admin_force_complete_order\", {",
      "    const { data, error } = await supabase.from(\"orders\").update({ status: \"completed\", doctor_status: \"patient_notified\" }).eq(\"id\", order.id).then((r) => ({ data: { transitioned: true }, error: r.error }));\n    const _unused = await Promise.resolve({\n      p_ignored: true, ...{"),
  },
  {
    name: "N16 — the historical PSD repair also rewrites payment state",
    file: MIGRATION,
    apply: (s) => s.replace(
      "      UPDATE public.orders\n         SET official_letter_30_day_required = false,\n             official_letter_due_at          = null\n       WHERE id = r.id;",
      "      UPDATE public.orders\n         SET official_letter_30_day_required = false,\n             official_letter_due_at          = null,\n             status                          = 'completed'\n       WHERE id = r.id;"),
  },
  {
    name: "N17 — the repair sweeps in orders the rule ALREADY reopened",
    file: MIGRATION,
    apply: (s) => s.replace(
      "       AND official_letter_reopened_at IS NULL\n       AND (official_letter_30_day_required = true OR official_letter_due_at IS NOT NULL)",
      "       AND (official_letter_30_day_required = true OR official_letter_due_at IS NOT NULL)"),
  },
  {
    name: "N18 — the admin 30-day panel goes back to a local state list",
    file: MODAL,
    apply: (s) => s.replace(
      "  const isThirtyDayState = isOfficialLetter30DayEligible(order);",
      "  const THIRTY_DAY_STATES = [\"CA\", \"AR\", \"IA\", \"LA\", \"MT\"];\n  const isThirtyDayState = THIRTY_DAY_STATES.includes(order.state ?? \"\");"),
  },
  {
    name: "N19 — the customer lifecycle claims delivery with no document",
    file: BOOKING,
    apply: (s) => s.replace(
      "  const deliveredWithoutDocument = delivered && opts?.hasCustomerDocument === false;",
      "  const deliveredWithoutDocument = false;"),
  },
  {
    name: "N20 — the portal hides the completed-with-no-document case entirely",
    file: DELIVERY_CARD,
    apply: (s) => s.replace(
      "  if (order.doctor_status === \"patient_notified\" && hasDeliverable) return null;",
      "  if (order.doctor_status === \"patient_notified\") return null;"),
  },
  {
    name: "N21 — a stale PSD reopen marker projects the order as Reopened again",
    file: LIFECYCLE,
    apply: (s) => s.replace(
      "  if (thirtyDayMarkersApply(o) && o.official_letter_reopened_at && !o.official_letter_final_completed_at) return \"reopened\";",
      "  if (o.official_letter_reopened_at && !o.official_letter_final_completed_at) return \"reopened\";"),
  },
  {
    name: "N22 — the 30-day customer email loses its ESA gate",
    file: THIRTY_CUSTOMER,
    apply: (s) => s.replace(
      "      const family = classifyServiceFamily(order);\n      if (family !== \"esa\") {",
      "      const family = classifyServiceFamily(order);\n      if (family === \"never\") {"),
  },
  {
    name: "N23 — the 30-day provider email loses its ESA gate",
    file: THIRTY_PROVIDER,
    apply: (s) => s.replace(
      "    if (!isManualReopen && classifyServiceFamily(order) !== \"esa\") {",
      "    if (!isManualReopen && classifyServiceFamily(order) === \"never\") {"),
  },
  {
    name: "N24 — the ESA gate also blocks the generic manual-reopen provider email",
    file: THIRTY_PROVIDER,
    apply: (s) => s.replace(
      "    if (!isManualReopen && classifyServiceFamily(order) !== \"esa\") {",
      "    if (classifyServiceFamily(order) !== \"esa\") {"),
  },
  {
    name: "N25 — the admin orders query stops selecting a classifier column",
    file: ADMIN_PAGE,
    apply: (s) => s.replace(
      "\"refund_amount,refund_status,letter_type,dispute_id,dispute_status,dispute_reason,\" +",
      "\"refund_amount,refund_status,dispute_id,dispute_status,dispute_reason,\" +"),
  },
  {
    name: "N26 — the two classifier copies drift apart",
    file: SERVER_FAMILY,
    apply: (s) => s.replace(
      '    || pdn.includes("emotional support animal") || pt.includes("emotional support animal")',
      '    || pdn.includes("emotional support animal") || pt.includes("emotional support animal")\n    || pdn.includes("housing")'),
  },
  {
    name: "N27 — a new function loses its pinned search_path",
    file: MIGRATION,
    apply: (s) => s.replace(
      "RETURNS boolean\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path TO 'public', 'pg_temp'\nAS $$\n  SELECT public.is_thirty_day_official_letter_state(p_state)",
      "RETURNS boolean\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nAS $$\n  SELECT public.is_thirty_day_official_letter_state(p_state)"),
  },
  {
    name: "N28 — the override is granted to anon",
    file: MIGRATION,
    apply: (s) => s.replace(
      "GRANT EXECUTE ON FUNCTION public.admin_force_complete_preview(uuid) TO authenticated;",
      "GRANT EXECUTE ON FUNCTION public.reopen_due_official_letter_orders() TO authenticated;\nGRANT EXECUTE ON FUNCTION public.admin_force_complete_preview(uuid) TO authenticated;"),
  },
  {
    name: "N29 — the confirmation dialog stops showing the payout consequence",
    file: MODAL,
    apply: (s) => s.replace(
      "                        {forceCompletePreview.has_provider\n                          ? `No new earning created · ${forceCompletePreview.existing_provider_earnings} existing preserved`\n                          : \"None — no provider on this order\"}",
      "                        {forceCompletePreview.has_provider ? \"Provider assigned\" : \"None\"}"),
  },
  {
    name: "N32 — the portal claims documents were sent for a completion with none",
    file: PORTAL_PAGE,
    apply: (s) => s.replace(
      '{order.doctor_status === "patient_notified" && hasCustomerDeliverable(order) && (',
      '{order.doctor_status === "patient_notified" && ('),
  },
  {
    name: "N30 — the reason stops being required",
    file: MODAL,
    apply: (s) => s.replace(
      "                disabled={forceCompleteBusy || !forceReasonValid || !forceCompletePreview}",
      "                disabled={forceCompleteBusy || !forceCompletePreview}"),
  },
];

async function selfTest() {
  const results = [];
  for (const ctl of CONTROLS) {
    const dir = mkdtempSync(join(tmpdir(), "pt-esa30-ctl-"));
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
    console.log(`ESA-only 30-day scope + admin force complete: ${checks} checks passed.`);
    return;
  }
  console.log(`ESA-only 30-day scope + admin force complete: ${failures.length} of ${checks} checks FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (!WARN) process.exitCode = 1;
}

main();
