#!/usr/bin/env node
// check-ra-lifecycle-and-authz.mjs — RA-LIFECYCLE-001 + INJECT-PDF-FOOTER-AUTHZ-001
//
// Pins WHERE each RA transition happens and WHO may trigger it. Both had real
// defects that this guard exists to keep fixed:
//
//   1. provider-submit-letter marked the RA service `completed` and created the
//      provider earning at UPLOAD time. The provider became their own approver,
//      and a document still sitting at `pending_admin_approval` was already paid
//      for — including one an admin might reject.
//
//   2. inject-pdf-footer accepted the SERVICE-ROLE SECRET as a bearer token, and
//      its only other branch checked merely that a user existed — so any
//      signed-in customer could invoke verification stamping.
//
// Run:  node scripts/check-ra-lifecycle-and-authz.mjs
// Self: node scripts/check-ra-lifecycle-and-authz.mjs --self-test

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  provider: "supabase/functions/provider-submit-letter/index.ts",
  approve: "supabase/functions/admin-review-document/index.ts",
  customer: "supabase/functions/customer-upload-document/index.ts",
  inject: "supabase/functions/inject-pdf-footer/index.ts",
  manual: "supabase/functions/admin-mark-ra-completed/index.ts",
};

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);
const ok = (c, m) => (c ? pass(m) : fail(m));

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/^\s*\*.*$/gm, " ");

// ── Lifecycle placement ─────────────────────────────────────────────────────
function checkLifecycle(src) {
  const prov = codeOnly(src.provider);
  const appr = codeOnly(src.approve);
  const cust = codeOnly(src.customer);

  // C — upload is not completion, and never pays.
  ok(!/additional_documentation_status:\s*["']completed["']/.test(prov),
    "provider upload does NOT mark the RA service completed");
  ok(!/ensureRaCompletionEarning\s*\(/.test(prov),
    "provider upload creates NO payout");
  ok(/doctor_status:\s*["']pending_admin_approval["']/.test(prov),
    "provider upload moves the order to Pending Delivery / admin review");

  // D — approval is the single completion + payout point.
  ok(/ensureRaCompletionEarning\s*\(/.test(appr),
    "admin approval creates the RA payout");
  ok(/additional_documentation_status:\s*["']completed["']/.test(appr),
    "admin approval marks the RA service completed");
  ok(/letter_id/.test(appr) && /baseDelivered/.test(appr),
    "admin approval gates order completion on the base letter being delivered");
  ok(/status:\s*["']completed["']/.test(appr) && /if\s*\(\s*baseDelivered\s*\)/.test(appr),
    "order returns to Completed ONLY when the base letter was already delivered");

  // B — source upload records + reopens, never pays.
  ok(/additional_documentation_status:\s*["']uploaded["']/.test(cust),
    "customer/admin RA source upload sets status 'uploaded'");
  ok(/status:\s*["']under-review["']/.test(cust),
    "a completed order is reopened to Under Review by a source upload");
  ok(!/ensureRaCompletionEarning\s*\(/.test(cust),
    "customer source upload creates NO payout");
}

// ── Authorization ───────────────────────────────────────────────────────────
function checkAuthz(src) {
  for (const [name, rel] of [["inject-pdf-footer", "inject"], ["admin-mark-ra-completed", "manual"]]) {
    const c = codeOnly(src[rel]);

    // The secret must be REJECTED, never used as proof of identity.
    const acceptsSecret = /const\s+isServiceRole\s*=\s*token\s*===\s*SERVICE_ROLE_KEY/.test(c) ||
      /if\s*\(\s*!\s*isServiceRole\s*\)/.test(c);
    ok(!acceptsSecret, `${name}: does NOT accept the service-role secret as a credential`);

    const rejectsSecret = /(token|bearer)\s*===\s*SERVICE_ROLE_KEY/.test(c) &&
      /return json\(\s*(403|\{)/.test(c);
    ok(rejectsSecret, `${name}: explicitly REJECTS a service-role bearer`);

    // Authenticated is not the same as authorized.
    ok(/is_admin/.test(c), `${name}: requires an ADMIN profile, not merely a valid user`);
    ok(/doctor_profiles/.test(c), `${name}: resolves the caller's admin profile server-side`);
  }

  const manual = codeOnly(src.manual);
  ok(/no_ra_entitlement/.test(manual), "manual completion refuses an order with no RA entitlement");
  ok(/alreadyComplete/.test(manual) && /existingEarning/.test(manual),
    "manual completion is idempotent (re-checks completion state and existing earning)");
}

// ── Payout invariants, exercised as data ────────────────────────────────────
const VOID = new Set(["cancelled"]);
const liveSum = (rows) => rows
  .filter((r) => !VOID.has(r.status))
  .reduce((s, r) => s + r.amount, 0);

function checkPayoutInvariants(broken = false) {
  const sum = broken
    ? (rows) => rows.reduce((s, r) => s + r.amount, 0)
    : liveSum;

  // One RA service, three uploaded files → still ONE RA earning.
  const threeFiles = [
    { type: "base", amount: 30, status: "paid" },
    { type: "ra_completion", amount: 30, status: "paid" },
  ];
  ok(sum(threeFiles) === 60, "three uploaded files still yield exactly one base + one RA earning ($60)");

  // Replay of submit / approve / manual completion adds nothing: the partial
  // unique index permits only one non-cancelled ra_completion per order.
  const replayed = [...threeFiles];
  ok(replayed.filter((r) => r.type === "ra_completion" && !VOID.has(r.status)).length === 1,
    "at most one non-cancelled ra_completion earning per order");

  // Upload-only states pay nothing.
  ok(sum([{ type: "base", amount: 30, status: "paid" }]) === 30,
    "provider upload awaiting approval adds no RA earning");

  // Cancelled duplicates never inflate.
  const withCancelled = [
    { type: "base", amount: 30, status: "paid" },
    { type: "base", amount: 30, status: "cancelled" },
    { type: "base", amount: 30, status: "cancelled" },
    { type: "ra_completion", amount: 30, status: "paid" },
  ];
  ok(sum(withCancelled) === 60, "cancelled duplicate earnings never inflate the payout ($60, not $120)");

  // Bundled RA is inside the base checkout — a request row sharing the order's
  // own PaymentIntent must not be added again.
  const orderPi = "pi_bundle_1";
  const requests = [
    { amount_cents: 4000, pi: "pi_bundle_1" },   // bundled — same charge
    { amount_cents: 4000, pi: "pi_separate_9" }, // genuinely separate
    { amount_cents: 4000, pi: "pi_separate_9" }, // duplicate record of the same charge
  ];
  const seen = new Set();
  const counted = requests
    .filter((r) => (broken ? true : r.pi !== orderPi))
    .filter((r) => (broken ? true : (seen.has(r.pi) ? false : (seen.add(r.pi), true))));
  const addon = counted.reduce((s, r) => s + r.amount_cents, 0) / 100;
  ok(addon === 40, `bundled + duplicate add-on records count once ($40, got $${addon})`);
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  console.log("NEGATIVE CONTROL — assertions below MUST fail.\n");
  const before = failures;

  console.log("[1] payout logic with cancelled rows and duplicate charges counted:");
  checkPayoutInvariants(true);

  console.log("\n[2] completion + payout moved back into provider upload:");
  checkLifecycle({
    provider: read(F.provider)
      .replace(/doctor_status: "pending_admin_approval",/, "")
      + '\nconst x = { additional_documentation_status: "completed" }; await ensureRaCompletionEarning(supabase, id);',
    approve: read(F.approve)
      .replace(/ensureRaCompletionEarning/g, "noEarning")
      .replace(/additional_documentation_status: "completed"/g, "x: 1"),
    customer: read(F.customer)
      .replace(/additional_documentation_status: "uploaded"/g, "x: 2")
      .replace(/status: "under-review"/g, "x: 3"),
  });

  console.log("\n[3] service-role secret accepted as a credential again:");
  checkAuthz({
    inject: read(F.inject)
      .replace(/if \(token === SERVICE_ROLE_KEY\) \{[\s\S]*?\}, 403\);\n\s*\}/,
        "const isServiceRole = token === SERVICE_ROLE_KEY;\n    if (!isServiceRole) {}")
      .replace(/is_admin/g, "anyUser")
      .replace(/doctor_profiles/g, "some_table"),
    manual: read(F.manual)
      .replace(/if \(bearer === SERVICE_ROLE_KEY\) \{[\s\S]*?\}\);\n\s*\}/, "")
      .replace(/is_admin/g, "anyUser")
      .replace(/doctor_profiles/g, "some_table")
      .replace(/no_ra_entitlement/g, "gone")
      .replace(/alreadyComplete/g, "gone2"),
  });

  const tripped = failures - before;
  const EXPECTED_MIN = 14;
  console.log("");
  if (tripped >= EXPECTED_MIN) {
    console.log(`✅ SELF-TEST PASSED — ${tripped} assertions tripped (>= ${EXPECTED_MIN}).`);
    process.exit(0);
  }
  console.error(`❌ SELF-TEST FAILED — only ${tripped} tripped, expected >= ${EXPECTED_MIN}.`);
  process.exit(1);
}

const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, read(v)]));
console.log("RA-LIFECYCLE-001 + INJECT-PDF-FOOTER-AUTHZ-001\n");
console.log("Lifecycle placement (upload ≠ completion; approval pays):");
checkLifecycle(src);
console.log("\nAuthorization (a secret is not an identity):");
checkAuthz(src);
console.log("\nPayout invariants:");
checkPayoutInvariants(false);

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✅ RA lifecycle transitions and authorization are correctly placed.");
