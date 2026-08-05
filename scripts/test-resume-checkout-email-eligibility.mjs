#!/usr/bin/env node
// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002 — Phase B.
//
// RUNTIME test for the Resume Checkout Email eligibility rule.
//
// This rule decides whether the Admin More-menu item is enabled AND whether the
// send endpoint will proceed — the SAME function answers both, which is the
// point: a browser-side copy of the rule could drift and offer an action the
// server then refuses (or worse, allow one it should not).
//
// Executed, not inspected. `evaluate` is exported from the edge function and
// run here through esbuild, so this is the shipping source, not a transcription.
//
// Run:  node scripts/test-resume-checkout-email-eligibility.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", RESET = "\x1b[0m";
const SRC = join(ROOT, "supabase/functions/send-resume-checkout-email/index.ts");

// The module calls Deno.serve at load and reads Deno.env — stub both so the
// pure rule can be imported without standing up a server.
globalThis.Deno = { env: { get: () => "" }, serve: () => {} };

const tmpDir = join(ROOT, "node_modules", ".rce-test");
mkdirSync(tmpDir, { recursive: true });
const tmpFile = join(tmpDir, "rce.mjs");

// Strip the imports — Node cannot resolve the https:// specifiers, and none of
// them are needed to exercise a pure rule. `createClient` is the only stripped
// binding actually CALLED at module scope, so it gets a stub; everything else
// is only reachable inside the request handler, which never runs here.
const src = readFileSync(SRC, "utf8").replace(/^import\s[\s\S]*?;$/gm, "");
const stubbed = `const createClient = () => ({});\n${src}`;
writeFileSync(tmpFile, transformSync(stubbed, { loader: "ts", format: "esm" }).code);

const { evaluate } = await import(pathToFileURL(tmpFile).href);
rmSync(tmpDir, { recursive: true, force: true });

const base = {
  id: "o1", confirmation_id: "PT-TEST", email: "customer@example.com",
  first_name: "Sam", last_name: "Doe", letter_type: "esa",
  package_display_name: "ESA Letter — 1 Pet", package_key: "esa_1pet",
  price: 129, status: "pending", paid_at: null, refunded_at: null,
  refund_status: "none", payment_intent_id: null,
};

const results = [];
const check = (name, order, expectEligible, expectReason) => {
  const v = evaluate(order);
  const ok = v.eligible === expectEligible &&
    (expectReason === undefined || v.reason === expectReason);
  results.push({ name, ok, got: v, want: { eligible: expectEligible, reason: expectReason } });
};

// ── Eligible ────────────────────────────────────────────────────────────────
check("current unpaid lead", { ...base }, true);
// AGE MUST NOT MATTER. An old lead is exactly as resumable as a new one; the
// automated drip's 14-day lookback is about unattended sending, not about
// whether a human may contact this customer.
check("July unpaid lead (old, still payable)",
  { ...base, created_at: "2026-07-11T14:00:00Z" }, true);
check("unpaid lead with a payment_intent but never paid",
  { ...base, payment_intent_id: "pi_abandoned" }, true);
check("status pending_review is still resumable", { ...base, status: "pending_review" }, true);

// ── Ineligible ──────────────────────────────────────────────────────────────
check("paid order", { ...base, paid_at: "2026-08-01T00:00:00Z" }, false, "already_paid");
check("paid order even if status still says pending",
  { ...base, status: "pending", paid_at: "2026-08-01T00:00:00Z" }, false, "already_paid");
check("completed order", { ...base, status: "completed" }, false, "completed");
check("cancelled order", { ...base, status: "cancelled" }, false, "cancelled");
check("refunded by status", { ...base, status: "refunded" }, false, "refunded");
check("refunded by refunded_at alone",
  { ...base, refunded_at: "2026-08-01T00:00:00Z" }, false, "refunded");
check("archived order", { ...base, status: "archived" }, false, "archived");
check("void order", { ...base, status: "void" }, false, "archived");
check("order not found", null, false, "order_not_found");

// `orders.email` is NOT NULL in the schema, so a genuinely absent email shows
// up as an empty or malformed string — the null case alone would miss it.
check("empty email", { ...base, email: "" }, false, "missing_email");
check("whitespace-only email", { ...base, email: "   " }, false, "missing_email");
check("malformed email (no @)", { ...base, email: "not-an-email" }, false, "missing_email");
check("null email", { ...base, email: null }, false, "missing_email");

// Status casing must not create an eligibility hole.
check("uppercase CANCELLED", { ...base, status: "CANCELLED" }, false, "cancelled");
check("mixed-case Completed", { ...base, status: "Completed" }, false, "completed");

for (const r of results) {
  console.log(`  ${r.ok ? GREEN + "PASS" : RED + "FAIL"}${RESET}  ${r.name}` +
    (r.ok ? "" : ` — got ${JSON.stringify(r.got)}, want ${JSON.stringify(r.want)}`));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? GREEN : RED}${results.length - failed}/${results.length} passed.${RESET}`);
if (failed) {
  console.log(`${RED}✗ Resume Checkout Email eligibility test FAILED${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ Resume Checkout Email: eligibility gating verified (age-independent, fails closed)${RESET}`);
