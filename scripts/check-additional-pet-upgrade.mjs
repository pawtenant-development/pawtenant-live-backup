// scripts/check-additional-pet-upgrade.mjs
//
// ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 — integrity guard.
//
// The Additional Pet upgrade has a small number of invariants that, if they
// drift, cost real money or corrupt issued legal documents. This guard pins
// every one of them as a static source assertion over the real files.
//
//   P1  $20 lives in ONE place server-side (2000 cents) and is a PACKAGE-TIER
//       upgrade, never a per-pet fee.
//   P2  RETIRED pricing keys stay dead (esa_additional_pet,
//       esa_subscription_addon, $25/pet, $20/pet-annual).
//   P3  The amount is NEVER client-supplied — the request body's money fields
//       are explicitly ignored and the outcome comes from the server RPC.
//   P4  A manual-review order is never given an automated price.
//   P5  The $0 path creates NO Stripe object.
//   P6  Max 3 pets, enforced before any price is shown.
//   P7  PAYMENT IS NOT APPROVAL — fulfilment moves to provider review, never
//       to approved/completed, and never activates a document version.
//   P8  Amount AND currency are verified before a request is marked paid.
//   P9  Fulfilment is idempotent (`.is("paid_at", null)`).
//   P10 The flow creates NO new order row and NO acquisition conversion.
//   P11 A provider never receives a financial field.
//   P12 A refund is ADD-ON ONLY and cannot double-refund.
//   P13 One active request per order (partial unique index) + amount bound to
//       outcome by check constraint.
//   P14 orders.assessment_answers is never written by this flow (it is the
//       entitlement evidence).
//   P15 Every revision keeps the closed architecture: a new version, its OWN
//       verification ID, linked only AFTER activation succeeds.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-additional-pet-upgrade.mjs             → guard (exit 1 on fail)
//   node scripts/check-additional-pet-upgrade.mjs --warn-only → audit (exit 0)
//   node scripts/check-additional-pet-upgrade.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  migration: "supabase/migrations/20260727150000_additional_pet_requests.sql",
  createFn: "supabase/functions/create-additional-pet-request/index.ts",
  shared: "supabase/functions/_shared/completeAdditionalPetPayment.ts",
  decision: "supabase/functions/provider-additional-pet-decision/index.ts",
  webhook: "supabase/functions/stripe-webhook/index.ts",
  submit: "supabase/functions/provider-submit-letter/index.ts",
  accounts: "supabase/migrations/20260727160000_accounts_additional_pet_addon.sql",
  // UI surfaces (ORDER-ADDITIONAL-PET-UI-STRIPE-QA-CLOSURE-001)
  customerUi: "src/pages/my-orders/components/AdditionalPetRequest.tsx",
  adminUi: "src/pages/admin-orders/components/OrderAdditionalPetPanel.tsx",
  providerUi: "src/pages/provider-portal/components/ProviderAdditionalPetReview.tsx",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const p = resolve(ROOT, F[key]);
  if (!existsSync(p)) throw new Error(`missing file: ${F[key]}`);
  return readFileSync(p, "utf8");
}

/** Strip `--` SQL comments, `//` line comments and block comments (including the
 *  `{/* … *\/}` form used in JSX) so a guard never trips on the documentation
 *  that explains the very rule it enforces. Block comments are removed FIRST,
 *  because they legitimately contain prose like "$20 package-tier upgrade". */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Every check: [id, description, fn(src) -> boolean]. */
const CHECKS = [
  ["P1a", "$20 defined once server-side as 2000 cents",
    (s) => /ADDITIONAL_PET_UPGRADE_CENTS\s*=\s*2000/.test(s.shared)],
  ["P1b", "DB constant function returns 2000",
    (s) => /additional_pet_upgrade_cents\(\)[\s\S]{0,200}?select 2000/.test(s.migration)],
  ["P1c", "priced as a PACKAGE-TIER upgrade, not a per-pet fee",
    (s) => /package[- ]tier upgrade/i.test(s.migration) && /not a per-pet fee/i.test(s.shared + s.migration)],
  // Comments are stripped first: these files DOCUMENT that the retired keys are
  // dead, and the guard must not trip on its own documentation. Only live code
  // is scanned.
  ["P2", "retired per-pet pricing keys stay dead (in CODE, not comments)",
    (s) => !/esa_additional_pet|esa_subscription_addon/.test(
      stripComments(s.createFn) + stripComments(s.shared)
      + stripComments(s.decision) + stripComments(s.migration))],
  ["P3a", "client-supplied money fields are explicitly ignored",
    (s) => /Deliberately IGNORED[\s\S]{0,200}?amount\?:\s*unknown/.test(s.createFn)],
  ["P3b", "the amount comes from the server RPC, not the body",
    (s) => /rpc\("resolve_additional_pet_pricing"/.test(s.createFn)],
  ["P3c", "Stripe unit_amount is the server constant only",
    (s) => /unit_amount:\s*ADDITIONAL_PET_UPGRADE_CENTS/.test(s.createFn)
        && !/unit_amount:\s*(body|req)\./.test(s.createFn)],
  ["P4a", "manual review returns before any request/Stripe object",
    (s) => /outcome === "manual_review"[\s\S]{0,400}?return json\(409/.test(s.createFn)],
  ["P4b", "annual + ambiguous resolve to manual_review with 0 cents",
    (s) => /'annual_plan'[\s\S]{0,200}?'amount_cents', 0/.test(s.migration)],
  // Structural, not window-based: the entire $0 branch (between its banner and
  // the $20 banner) must contain no Stripe reference whatsoever.
  ["P5", "the $0 path creates no Stripe object",
    (s) => {
      const a = s.createFn.indexOf("$0 INCLUDED PATH");
      const b = s.createFn.indexOf("$20 PAID PATH");
      if (a < 0 || b < 0 || b <= a) return false;
      const branch = s.createFn.slice(a, b);
      return !/stripe\.|sessions\.create|payment_intent|unit_amount/i.test(branch)
        && /NO Stripe object/i.test(s.createFn);
    }],
  ["P6a", "max total is 3",
    (s) => /additional_pet_max_total\(\)[\s\S]{0,200}?select 3/.test(s.migration)],
  ["P6b", "max pets is checked BEFORE any price is produced",
    (s) => s.migration.indexOf("max_pets_reached") < s.migration.indexOf("tier_upgrade_required")],
  ["P7a", "fulfilment moves to provider review, never to approved",
    (s) => /PAYMENT IS NOT APPROVAL/.test(s.shared)
        && /"pending_provider_review"\s*:\s*"paid_pending_details"/.test(s.shared)],
  ["P7b", "fulfilment never sets provider_decision or activates a version",
    (s) => !/provider_decision\s*:/.test(s.shared)
        && !/activate_document_version/.test(s.shared)],
  ["P7c", "approval sets approved_pending_document, not completed",
    (s) => /status:\s*"approved_pending_document"/.test(s.decision)
        && !/provider_decision: "approved"[\s\S]{0,200}?status:\s*"completed"/.test(s.decision)],
  ["P8", "amount AND currency verified before marking paid",
    (s) => /gotCents === ADDITIONAL_PET_UPGRADE_CENTS/.test(s.shared)
        && /gotCurrency === ADDITIONAL_PET_CURRENCY/.test(s.shared)
        && s.shared.indexOf("amount_mismatch") < s.shared.indexOf("paid_at: nowIso")],
  ["P9", "fulfilment is idempotent on paid_at",
    (s) => /\.is\("paid_at",\s*null\)/.test(stripComments(s.shared))],
  ["P10a", "no order row is ever inserted by the add-on flow",
    (s) => !/from\("orders"\)\s*\.insert/.test(s.createFn + s.shared + s.decision)],
  ["P10b", "the add-on never writes orders.price / paid_at / payment_intent_id",
    (s) => !/from\("orders"\)[\s\S]{0,300}?\.update\(\{[^}]*\b(price|paid_at|payment_intent_id)\b/
      .test(s.createFn + s.shared + s.decision)],
  ["P10c", "acquisition exclusion is stated and structural",
    (s) => /Google Ads/i.test(s.shared) && /no acquisition conversion/i.test(s.shared)],
  ["P11a", "provider projection has an explicit safe field list",
    (s) => /get_additional_pet_request_for_provider/.test(s.migration)
        && /explicit safe field list/i.test(s.migration)],
  ["P11b", "provider projection returns no financial column",
    (s) => {
      const m = s.migration.match(
        /create or replace function public\.get_additional_pet_request_for_provider[\s\S]*?\n\$\$;/);
      if (!m) return false;
      // The body legitimately names financial keys inside jsonb "minus"
      // expressions that STRIP them from the event detail. Remove those
      // subtractions first, then assert nothing financial is left.
      const body = stripComments(m[0]).replace(/-\s*'[a-z_]+'/g, " ");
      return !/(amount_cents|pricing_outcome|stripe_payment_intent_id|stripe_checkout_session_id|stripe_refund_id|refund_amount_cents|customer_email|entitlement_snapshot_id)/
        .test(body);
    }],
  ["P11c", "NO provider RLS policy on the base table (a row policy cannot hide a column)",
    (s) => !/create policy\s+\w*provider\w*\s+on public\.order_additional_pet_requests/i.test(s.migration)],
  ["P12a", "refund is add-on only and never touches the base order",
    (s) => /ADD-ON-ONLY REFUND/.test(s.decision) && /addon_only/.test(s.decision)],
  ["P12b", "refund targets the add-on payment intent for exactly $20",
    (s) => /refunds\.create\(\s*\{\s*payment_intent:\s*piId,\s*amount:\s*ADDITIONAL_PET_UPGRADE_CENTS/
      .test(s.decision)],
  ["P12c", "refund cannot double-refund (Stripe idempotencyKey)",
    (s) => /idempotencyKey:\s*`addpet-refund:\$\{reqRow\.id\}`/.test(s.decision)],
  ["P13a", "one active request per order (partial unique index)",
    (s) => /uq_addpet_one_active_per_order[\s\S]{0,240}?where status not in/.test(s.migration)],
  ["P13b", "amount is bound to the pricing outcome by check constraint",
    (s) => /ck_addpet_amount_matches_outcome[\s\S]{0,320}?paid_upgrade' and amount_cents = 2000/
      .test(s.migration)],
  ["P14", "the flow never writes orders.assessment_answers",
    (s) => !/assessment_answers\s*:/.test(s.createFn + s.shared + s.decision)],
  ["P15a", "the revision passes an immutable combined pet snapshot",
    (s) => /p_pet_snapshot:\s*addPetSnapshot/.test(s.submit)],
  ["P15b", "the request is linked only AFTER activation succeeds",
    (s) => s.submit.indexOf("activate_document_version") <
           s.submit.indexOf('status: "completed",\n                  document_version_id')],
  ["P15c", "the revision mints its OWN verification ID",
    (s) => /ensure_revision_verification_id/.test(s.submit)],
  ["P16", "webhook routes additional_pet on all three payment events",
    (s) => (s.webhook.match(/type === "additional_pet"/g) || []).length >= 3],
  ["P17", "Accounts labels the add-on with its own subtype",
    (s) => /'Additional pet'::text as subtype/.test(s.accounts)
        && /'Order add-on payments'::text as category/.test(s.accounts)],
  ["P18", "$0 pets produce no Accounts revenue row",
    (s) => /p\.amount_cents > 0/.test(s.accounts)],

  // ── UI invariants ────────────────────────────────────────────────────────
  ["P19", "customer UI never sends a client-derived amount",
    (s) => !/amountCents\s*:/.test(stripComments(s.customerUi))
        && !/amount\s*:\s*\d/.test(stripComments(s.customerUi))],
  ["P20", "customer UI renders the SERVER amount, never a hardcoded price",
    (s) => /dollars\(pricing\.amount_cents\)/.test(s.customerUi)
        && !/\$20\b/.test(stripComments(s.customerUi))],
  ["P21", "customer UI shows NO price and NO checkout on manual review",
    (s) => {
      const c = s.customerUi;
      const a = c.indexOf('outcome === "manual_review"');
      if (a < 0) return false;
      const block = c.slice(a, a + 700);
      return /requires a manual review/i.test(block)
        && !/amount_cents|checkoutUrl|dollars\(/.test(block);
    }],
  ["P22", "customer UI hides the CTA while a request is active",
    (s) => /activeRequest \?/.test(s.customerUi) && /const ACTIVE = new Set\(/.test(s.customerUi)],
  ["P23", "customer modal is accessible (dialog + aria-modal + focus trap)",
    (s) => /role="dialog"/.test(s.customerUi) && /aria-modal="true"/.test(s.customerUi)
        && /aria-labelledby=/.test(s.customerUi)
        // Accept either the match form (=== "Tab") or the guard-clause form
        // (!== "Tab" ... return), which is what the component actually uses.
        && /e\.key\s*[!=]==\s*"Tab"/.test(s.customerUi)],
  ["P24", "provider UI reads ONLY the safe projection, never the base table",
    (s) => /rpc\(\s*"get_additional_pet_request_for_provider"/.test(s.providerUi)
        && !/from\(\s*"order_additional_pet_requests"\s*\)/.test(s.providerUi)],
  ["P25", "provider UI references no financial field at all",
    (s) => !/(amount_cents|pricing_outcome|stripe_|refund_amount|amountCents)/
      .test(stripComments(s.providerUi))],
  ["P26", "admin payments variant is separate from the order price",
    (s) => /Separate add-on transaction/i.test(s.adminUi)
        && /Included \/ No charge/.test(s.adminUi)
        && /Manual review — no price/.test(s.adminUi)],
  ["P27", "no emoji in any Additional Pet UI surface",
    (s) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
      .test(s.customerUi + s.adminUi + s.providerUi)],
];

/** Negative controls: mutation applied in memory must trip the named check. */
const CONTROLS = [
  ["A", "P1a", "shared", (t) => t.replace("ADDITIONAL_PET_UPGRADE_CENTS = 2000",
                                          "ADDITIONAL_PET_UPGRADE_CENTS = 2500")],
  ["B", "P2", "createFn", (t) => t.replace("const ESA_TYPES", "const esa_additional_pet = 1;\nconst ESA_TYPES")],
  ["C", "P3c", "createFn", (t) => t.replace("unit_amount: ADDITIONAL_PET_UPGRADE_CENTS,",
                                            "unit_amount: body.amountCents,")],
  // Targets the CODE occurrence, not the comment that quotes the same string.
  ["D", "P9", "shared",
    (t) => t.replace('.eq("id", reqId)\n    .is("paid_at", null)',
                     '.eq("id", reqId)\n    .limit(1)')],
  ["E", "P7b", "shared", (t) => t.replace("status: baseIsPaid", "provider_decision: 'approved', status: baseIsPaid")],
  ["F", "P10a", "createFn", (t) => t.replace('.from("order_additional_pet_requests")\n    .insert(',
                                             '.from("orders")\n    .insert(')],
  ["G", "P12c", "decision", (t) => t.replace("idempotencyKey: `addpet-refund:${reqRow.id}`", "")],
  ["H", "P13b", "migration", (t) => t.replace("paid_upgrade' and amount_cents = 2000",
                                              "paid_upgrade' and amount_cents >= 0")],
  ["I", "P14", "createFn", (t) => t.replace("new_pet: pet,", "new_pet: pet, assessment_answers: pet,")],
  ["J", "P18", "accounts", (t) => t.replace("and p.amount_cents > 0", "")],
  ["K", "P8", "shared", (t) => t.replace("gotCurrency === ADDITIONAL_PET_CURRENCY", "true")],
  ["L", "P19", "customerUi", (t) => t.replace("body: JSON.stringify({ action,", "body: JSON.stringify({ amountCents: 2000, action,")],
  ["M", "P20", "customerUi", (t) => t.replace("dollars(pricing.amount_cents)", '"$20"')],
  ["N", "P24", "providerUi", (t) => t.replace('.rpc("get_additional_pet_request_for_provider"', '.from("order_additional_pet_requests").select("*"')],
  ["O", "P25", "providerUi", (t) => t.replace("const DECIDABLE", "const amount_cents = 2000;\nconst DECIDABLE")],
  ["Q", "P23", "customerUi", (t) => t.replace('aria-modal="true"', "")],
];

function loadAll(override) {
  const s = {};
  for (const k of Object.keys(F)) s[k] = read(k, override);
  return s;
}

function run(src) {
  const results = [];
  for (const [id, desc, fn] of CHECKS) {
    let ok = false;
    try { ok = !!fn(src); } catch { ok = false; }
    results.push([id, desc, ok]);
  }
  return results;
}

let exitCode = 0;

if (SELF) {
  console.log("ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 — negative controls\n");
  const base = loadAll();
  let bad = 0;
  for (const [label, target, fileKey, mutate] of CONTROLS) {
    const mutated = { ...base, [fileKey]: mutate(base[fileKey]) };
    if (mutated[fileKey] === base[fileKey]) {
      console.log(`  ?? ${label}: mutation was a no-op (guard text drifted) — target ${target}`);
      bad++; continue;
    }
    const res = run(mutated).find((r) => r[0] === target);
    const tripped = res && res[2] === false;
    console.log(`  ${tripped ? "OK" : "XX"} ${label}: ${target} ${tripped ? "trips" : "DID NOT TRIP"}`);
    if (!tripped) bad++;
  }
  console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} controls trip correctly.`);
  process.exit(bad === 0 ? 0 : 1);
}

const src = loadAll();
const results = run(src);
const failed = results.filter((r) => !r[2]);

console.log("ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 — integrity guard\n");
for (const [id, desc, ok] of results) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${desc}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

if (failed.length) {
  exitCode = WARN ? 0 : 1;
  console.log(WARN ? "\n(--warn-only: not failing the build)" : "\nGUARD FAILED");
}
process.exit(exitCode);
