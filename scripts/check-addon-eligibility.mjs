// scripts/check-addon-eligibility.mjs
//
// PORTAL-ADDON-ELIGIBILITY-PARITY-001 — deterministic add-on eligibility guard.
//
// The standalone "Additional Documentation" / Reasonable-Accommodation add-on
// invoice (create-additional-doc-invoice) may only be created for a GENUINELY
// PAID original order, and only by the order's owner (or an authorized admin).
// These are SERVER-side gates — client-side hiding alone is not sufficient.
//
// This guard pins the enforced eligibility contract so it cannot silently
// regress (and documents the exact checks LIVE must gain to reach parity):
//
//   E1  the order query SELECTS the canonical payment fields (payment_intent_id, paid_at)
//   E2  base-paid gate: baseIsPaid = !!payment_intent_id || !!paid_at → 409 base_order_unpaid
//   E3  the base-paid + reversed gates run BEFORE any Stripe session / email (ineligible ⇒ no side effect)
//   E4  refunded/cancelled gate: status ∈ {refunded,cancelled} → 409 base_order_reversed
//   E5  ownership: a non-admin caller's authenticated email MUST equal the order email
//   E6  duplicate guard: a second PENDING invoice for the same order is refused
//   E7  eligibility is NEVER read from the client (no body.eligible/paid/isPaid/baseIsPaid/amount)
//   E8  the charge is the server constant ADDON_AMOUNT_CENTS (never a client value)
//   E9  the portal shows the add-on and the bundle-upload MUTUALLY EXCLUSIVELY
//   E10 the portal add-on CTA gate = paid && !refunded && !lead
//   E11 bundle / RA-entitled orders see the RA upload, not the paid add-on
//   E12 the function does its OWN auth (service-role OR getUser) — why verify_jwt=false is correct
//
// NOT statically enforced here (documented as owner decisions in the task doc):
//   - server-side hard-block of bundle/RA-entitled orders (today frontend-only)
//   - blocking repeat purchase after a PAID/completed add-on ("reopen my case" appears intentional)
//   - a DB unique partial index to close the TOCTOU duplicate race (needs a migration)
//   - verify_jwt is a DEPLOY-time property, verified at deploy, not from source
//
// Static source assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-addon-eligibility.mjs             → guard real files (exit 1 on fail)
//   node scripts/check-addon-eligibility.mjs --warn-only → audit (always exit 0)
//   node scripts/check-addon-eligibility.mjs --self-test → prove every control trips

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-addon-eligibility]";

const PATHS = {
  server: "supabase/functions/create-additional-doc-invoice/index.ts",
  page: "src/pages/my-orders/page.tsx",
  addonReq: "src/pages/my-orders/components/AdditionalDocRequest.tsx",
  raUpload: "src/pages/my-orders/components/RaDocumentUpload.tsx",
};
const REQUIRED = ["server", "page", "addonReq", "raUpload"];

async function readAll() {
  const files = {};
  for (const [k, p] of Object.entries(PATHS)) {
    try { files[k] = await readFile(resolve(ROOT, p), "utf8"); }
    catch { files[k] = null; }
  }
  // The migration that creates the one-active-per-order race-hardening index.
  files.indexMigration = null;
  try {
    const migDir = resolve(ROOT, "supabase/migrations");
    for (const n of (await readdir(migDir)).filter((n) => n.endsWith(".sql")).sort()) {
      const c = await readFile(resolve(migDir, n), "utf8");
      if (c.includes("uq_addon_doc_active_per_order")) { files.indexMigration = c; break; }
    }
  } catch { /* no migrations dir */ }
  return files;
}

const CHECKS = [
  { id: "E1-selects-payment-fields", run: (f) => /\.select\("[^"]*payment_intent_id[^"]*paid_at[^"]*"\)/.test(f.server ?? "") ? null : "order query must SELECT payment_intent_id AND paid_at (the canonical paid contract)" },
  { id: "E2-base-paid-gate", run: (f) => {
      const s = f.server ?? "";
      const ok = /const baseIsPaid = !!orderRow\.payment_intent_id \|\| !!orderRow\.paid_at;/.test(s) && /code: "base_order_unpaid"/.test(s);
      return ok ? null : "base-paid gate missing: require baseIsPaid = !!payment_intent_id || !!paid_at and reject unpaid with code base_order_unpaid";
    } },
  { id: "E3-gates-before-side-effects", run: (f) => {
      const s = f.server ?? "";
      const unpaid = s.indexOf('code: "base_order_unpaid"');
      const reversed = s.indexOf('code: "base_order_reversed"');
      // The CREATE action's Stripe session is the LAST checkout.sessions.create in
      // the file (an earlier one belongs to the resume action, which resumes an
      // already-gated pending request).
      const stripe = s.lastIndexOf("checkout.sessions.create");
      if (unpaid < 0 || reversed < 0 || stripe < 0) return "cannot verify gate ordering — a gate or the Stripe session create is missing";
      return (unpaid < stripe && reversed < stripe) ? null : "the base-paid / reversed gates must run BEFORE the Stripe session is created (ineligible orders must create no Stripe session or email)";
    } },
  { id: "E4-refunded-cancelled-gate", run: (f) => {
      const s = f.server ?? "";
      const ok = /orderRow\.status === "refunded" \|\| orderRow\.status === "cancelled"/.test(s) && /code: "base_order_reversed"/.test(s);
      return ok ? null : "refunded/cancelled gate missing: reject status refunded|cancelled with code base_order_reversed";
    } },
  { id: "E5-ownership", run: (f) => {
      const s = f.server ?? "";
      const ok = /if \(!callerEmail \|\| callerEmail !== orderEmail\)/.test(s) && /"Not authorized for this order"/.test(s);
      return ok ? null : "ownership gate missing: a non-admin caller's authenticated email must equal the order email (order id alone must not grant access)";
    } },
  { id: "E6-duplicate-pending", run: (f) => {
      const s = f.server ?? "";
      // Anchor on the create-action duplicate guard specifically: the existingPending
      // lookup filters status=pending, and `if (existingPending)` returns duplicate.
      // (order_id+pending alone is not unique — resume & cancel query it too.)
      const queriesPending = /const \{ data: existingPending \}[\s\S]{0,300}\.eq\("status", "pending"\)/.test(s);
      const guards = /if \(existingPending\)/.test(s) && /duplicate: true/.test(s);
      return (queriesPending && guards) ? null : "duplicate guard missing: the create action must look up existingPending (status=pending) and refuse a second PENDING invoice (duplicate: true)";
    } },
  { id: "E7-eligibility-not-client-supplied", run: (f) => {
      const bad = [...(f.server ?? "").matchAll(/body\.(eligible|paid|isPaid|baseIsPaid|amount|amountCents)\b/g)].map((m) => m[0]);
      return bad.length ? `eligibility/amount must NEVER be read from the client (found: ${[...new Set(bad)].join(", ")})` : null;
    } },
  { id: "E8-server-authoritative-amount", run: (f) => /amount_cents:\s*ADDON_AMOUNT_CENTS/.test(f.server ?? "") ? null : "the request row must record amount_cents: ADDON_AMOUNT_CENTS (server-authoritative, never a client value)" },
  { id: "E9-portal-mutual-exclusion", run: (f) => /!showRaDocumentUpload\(order\) && canRequestAdditionalDoc\(order\)/.test(f.page ?? "") ? null : "the portal must show the paid add-on and the bundle RA-upload MUTUALLY EXCLUSIVELY (bundle buyers never see the paid add-on)" },
  { id: "E10-cta-gate", run: (f) => /return isPaid && !isRefundedBucket\(order\) && !lead;/.test(f.addonReq ?? "") ? null : "canRequestAdditionalDoc must gate the CTA on paid && !refunded && !lead" },
  { id: "E11-bundle-upload-gate", run: (f) => /return order\.includes_reasonable_accommodation_letter === true;/.test(f.raUpload ?? "") ? null : "showRaDocumentUpload must gate on includes_reasonable_accommodation_letter === true (bundle/RA-entitled orders get the upload, not the paid add-on)" },
  { id: "E12-custom-auth", run: (f) => {
      const s = f.server ?? "";
      const ok = /bearer === serviceKey/.test(s) && /admin\.auth\.getUser\(bearer\)/.test(s);
      return ok ? null : "the function must do its OWN auth (service-role bearer OR getUser) — this is why verify_jwt=false is correct";
    } },
  // ── Owner decisions A/B/C (PORTAL-ADDON-ELIGIBILITY-PARITY-001) ──────────────
  { id: "E13-bundle-exclusion", run: (f) => {
      const s = f.server ?? "";
      const gate = /const raIncluded = orderRow\.includes_reasonable_accommodation_letter === true[\s\S]{0,200}package_key === "esa_ra_bundle"[\s\S]{0,80}"psd_ra_bundle"/.test(s);
      if (!gate) return "server must reject RA-included/bundle orders via the explicit entitlement/package fields (includes_reasonable_accommodation_letter, esa_ra_bundle, psd_ra_bundle) — never price";
      if (!/code: "ra_already_included"/.test(s)) return "the bundle gate must return code ra_already_included";
      // The bundle exclusion applies to BOTH paths — no admin override.
      const gStart = s.indexOf("const raIncluded"), gEnd = s.indexOf('code: "ra_already_included"');
      const block = gStart >= 0 && gEnd > gStart ? s.slice(gStart, gEnd) : "";
      if (/isAdmin/.test(block)) return "the bundle exclusion must have NO admin override (do not gate raIncluded on isAdmin)";
      return null;
    } },
  { id: "E14-owned-block", run: (f) => {
      const s = f.server ?? "";
      const gStart = s.indexOf("const { data: ownedReq }"), gEnd = s.indexOf('code: "addon_already_owned"');
      if (gStart < 0 || gEnd <= gStart) return "server must block repurchase when a PAID add-on already exists (ownedReq → addon_already_owned)";
      if (!/\.eq\("status", "paid"\)/.test(s.slice(gStart, gEnd))) return "the owned gate must query .eq(status, paid)";
      return null;
    } },
  { id: "E15-new-gates-before-side-effects", run: (f) => {
      const s = f.server ?? "";
      const ra = s.indexOf('code: "ra_already_included"'), owned = s.indexOf('code: "addon_already_owned"'), stripe = s.lastIndexOf("checkout.sessions.create");
      if (ra < 0 || owned < 0 || stripe < 0) return "cannot verify new-gate ordering — a gate or the Stripe create is missing";
      return (ra < stripe && owned < stripe) ? null : "the bundle + owned gates must run BEFORE the Stripe session is created (ineligible ⇒ no Stripe/email)";
    } },
  { id: "E16-refunded-retry-allowed", run: (f) => {
      const s = f.server ?? "";
      const gStart = s.indexOf("const { data: ownedReq }"), gEnd = s.indexOf('code: "addon_already_owned"');
      const block = gStart >= 0 && gEnd > gStart ? s.slice(gStart, gEnd) : "";
      if (!block) return "cannot verify refunded-retry — owned gate not found";
      return /refunded|cancelled/.test(block) ? "the owned gate must NOT block refunded/cancelled requests (owner decision: a refund lets the customer retry)" : null;
    } },
  { id: "E17-active-per-order-index", run: (f) => {
      const m = f.indexMigration;
      if (!m) return "no migration creates uq_addon_doc_active_per_order (one-active-per-order race hardening missing)";
      if (!/create unique index if not exists uq_addon_doc_active_per_order/i.test(m)) return "the index migration must be idempotent (create unique index IF NOT EXISTS)";
      if (!/where status in \('pending',\s*'paid'\)/i.test(m)) return "the index predicate must be WHERE status IN ('pending','paid') (refunded/cancelled excluded so retries are allowed)";
      if (/\bdrop\s+(table|index)\b|\bdelete\s+from\b|\btruncate\b|update\s+public\.order_additional_documentation_requests\s+set/i.test(m)) return "the index migration must be NON-destructive (no drop/delete/truncate/row update)";
      return null;
    } },
];

function runChecks(files) {
  return CHECKS.map((c) => ({ id: c.id, problem: c.run(files) })).filter((r) => r.problem);
}

// ── Negative controls: (label, mutator, expected check id that must trip) ───────
const CONTROLS = [
  ["A: order query stops selecting the payment fields", (f) => ({ ...f, server: f.server.replace("payment_intent_id, paid_at", "status") }), "E1-selects-payment-fields"],
  ["B: an UNPAID base order is allowed", (f) => ({ ...f, server: f.server.replace("const baseIsPaid = !!orderRow.payment_intent_id || !!orderRow.paid_at;", "const baseIsPaid = true;") }), "E2-base-paid-gate"],
  ["C: a REFUNDED base order is allowed", (f) => ({ ...f, server: f.server.replace('orderRow.status === "refunded" || orderRow.status === "cancelled"', "false") }), "E4-refunded-cancelled-gate"],
  ["D: a CANCELLED base order is allowed", (f) => ({ ...f, server: f.server.replace('orderRow.status === "cancelled"', 'orderRow.status === "cancxxx"') }), "E4-refunded-cancelled-gate"],
  ["E: an ESA+RA / PSD+RA bundle order is offered the paid add-on", (f) => ({ ...f, raUpload: f.raUpload.replace("return order.includes_reasonable_accommodation_letter === true;", "return false;") }), "E11-bundle-upload-gate"],
  ["F: the portal shows the paid add-on to bundle buyers (not mutually exclusive)", (f) => ({ ...f, page: f.page.replace("!showRaDocumentUpload(order) && canRequestAdditionalDoc(order)", "canRequestAdditionalDoc(order)") }), "E9-portal-mutual-exclusion"],
  ["G: a second PENDING invoice can be created (duplicate guard disabled)", (f) => ({ ...f, server: f.server.replace("if (existingPending) {", "if (false) {") }), "E6-duplicate-pending"],
  ["H: a customer can act on another customer's order", (f) => ({ ...f, server: f.server.replace("callerEmail !== orderEmail", "false") }), "E5-ownership"],
  ["I: a client-supplied eligibility flag is trusted", (f) => ({ ...f, server: f.server.replace("const baseIsPaid = !!orderRow.payment_intent_id || !!orderRow.paid_at;", "const baseIsPaid = body.baseIsPaid ?? (!!orderRow.payment_intent_id || !!orderRow.paid_at);") }), "E7-eligibility-not-client-supplied"],
  ["J: the base-paid gate marker is removed (ineligible could reach Stripe/email)", (f) => ({ ...f, server: f.server.replace('code: "base_order_unpaid",', 'code: "base_order_unpaid_MOVED",') }), "E3-gates-before-side-effects"],
  ["K: the CTA gate stops checking paid/refunded/lead", (f) => ({ ...f, addonReq: f.addonReq.replace("return isPaid && !isRefundedBucket(order) && !lead;", "return true;") }), "E10-cta-gate"],
  ["L: the admin/service-role auth check is removed", (f) => ({ ...f, server: f.server.replace("bearer === serviceKey", "false") }), "E12-custom-auth"],
  ["M: the add-on charge drifts from the server constant", (f) => ({ ...f, server: f.server.replace("amount_cents: ADDON_AMOUNT_CENTS", "amount_cents: 6000") }), "E8-server-authoritative-amount"],
  ["N: an ESA+RA/PSD+RA bundle order is allowed (bundle gate removed)", (f) => ({ ...f, server: f.server.replace('code: "ra_already_included",', 'code: "ra_x",') }), "E13-bundle-exclusion"],
  ["O: an admin bypasses the bundle exclusion", (f) => ({ ...f, server: f.server.replace("const raIncluded = orderRow.includes_reasonable_accommodation_letter", "const raIncluded = !isAdmin && orderRow.includes_reasonable_accommodation_letter") }), "E13-bundle-exclusion"],
  ["P: a PAID (owned) request may be purchased again (owned gate removed)", (f) => ({ ...f, server: f.server.replace('code: "addon_already_owned",', 'code: "owned_x",') }), "E14-owned-block"],
  ["Q: the new gates run AFTER the Stripe session (marker removed)", (f) => ({ ...f, server: f.server.replace('code: "addon_already_owned",', 'code: "addon_already_owned_moved",') }), "E15-new-gates-before-side-effects"],
  ["R: a refunded request is wrongly blocked", (f) => ({ ...f, server: f.server.replace('.eq("status", "paid")', '.in("status", ["paid", "refunded"])') }), "E16-refunded-retry-allowed"],
  ["S: the index predicate wrongly includes refunded (blocks legit retry)", (f) => ({ ...f, indexMigration: f.indexMigration.replace("where status in ('pending', 'paid')", "where status in ('pending', 'paid', 'refunded')") }), "E17-active-per-order-index"],
  ["T: the index migration is not idempotent", (f) => ({ ...f, indexMigration: f.indexMigration.replace("create unique index if not exists", "create unique index") }), "E17-active-per-order-index"],
  ["U: the index migration does destructive cleanup", (f) => ({ ...f, indexMigration: f.indexMigration + "\ndelete from public.order_additional_documentation_requests where status = 'cancelled';" }), "E17-active-per-order-index"],
];

async function main() {
  const files = await readAll();
  const missing = REQUIRED.filter((k) => files[k] == null).map((k) => PATHS[k]);
  if (missing.length) {
    console.error(`${TAG} FAIL — missing required files: ${missing.join(", ")}`);
    if (!warnOnly) process.exit(1);
    return;
  }

  if (selfTest) {
    const failures = [];
    const baseProblems = runChecks(files);
    for (const p of baseProblems) failures.push(`baseline unexpectedly failed: ${p.id} — ${p.problem}`);
    for (const [label, mutate, expectedId] of CONTROLS) {
      const problems = runChecks(mutate(files));
      if (!problems.some((p) => p.id === expectedId)) failures.push(`control "${label}" did NOT trip ${expectedId} (guard would miss this regression)`);
    }
    if (failures.length) {
      console.error(`${TAG} SELF-TEST FAIL — ${failures.length} problem(s):`);
      for (const p of failures) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log(`${TAG} SELF-TEST OK — baseline passes; all ${CONTROLS.length} negative controls (A–U) trip their guard. No file mutated on disk.`);
    return;
  }

  const problems = runChecks(files);
  if (problems.length === 0) {
    console.log(`${TAG} OK — add-on eligibility enforced server-side: base order must be paid (payment_intent_id/paid_at), refunded/cancelled rejected, gates precede Stripe/email, owner-only (admin via role), duplicate-pending refused, eligibility never client-supplied, charge server-authoritative; portal shows add-on and bundle-upload mutually exclusively.`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ [${p.id}] ${p.problem}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
