// scripts/check-additional-pet-completed-order-gating.mjs
//
// ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002 — integrity guard.
//
// ROOT CAUSE THIS GUARD PINS: resolve_additional_pet_pricing — the engine every
// surface trusts — had no completion/clinical-lock gate, so a COMPLETED,
// letter-issued order still returned `paid_upgrade` ($20 Stripe checkout) or
// `included` ($0 pet added to a finalised evaluation). Measured on TEST before
// the fix: 3 locked orders priced at $20 and 2 more added free.
//
//   G1  ONE shared server-side lock predicate exists (additional_pet_order_locked).
//   G2  The predicate is a UNION of clinical judgement AND issued documentation —
//       orders.status alone is NOT sufficient (TEST holds issued letters on
//       under-review / processing orders).
//   G3  The engine consults the lock BEFORE any actionable outcome or amount.
//   G4  The completed branch never returns an amount.
//   G5  Every mutation entry point rechecks the lock at MUTATION time
//       (resume, update_pet) — not only when the UI first loaded.
//   G6  Webhook fulfilment rechecks the lock immediately before applying the
//       payment (the race), and never mutates the completed order.
//   G7  The race path creates NO provider earning and NO document change, and
//       leaves an actionable audit record.
//   G8  Admin surfaces `Add Additional Pet` and FAILS CLOSED.
//   G9  The Admin menu item does not mutate on click.
//   G10 Admin never derives price/eligibility client-side — it calls the same
//       server engine as the customer.
//   G11 A completed order renders a DISABLED, non-actionable Admin item.
//   G12 The customer shows `Start a New Evaluation` for a completed order and
//       offers no form, no price and no checkout.
//   G13 The frozen OrderDetailModal receives a MOUNT ONLY.
//   G14 No provider earning is introduced anywhere by this feature.
//   G15 Documents / verification IDs are never mutated by the gating paths.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-additional-pet-completed-order-gating.mjs             → guard (exit 1 on fail)
//   node scripts/check-additional-pet-completed-order-gating.mjs --warn-only → audit (exit 0)
//   node scripts/check-additional-pet-completed-order-gating.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  gating:     "supabase/migrations/20260728120000_additional_pet_completed_order_gating.sql",
  createFn:   "supabase/functions/create-additional-pet-request/index.ts",
  shared:     "supabase/functions/_shared/completeAdditionalPetPayment.ts",
  decision:   "supabase/functions/provider-additional-pet-decision/index.ts",
  adminMenu:  "src/pages/admin-orders/components/OrderAdditionalPetMenuAction.tsx",
  frozen:     "src/pages/admin-orders/components/OrderDetailModal.tsx",
  customerUi: "src/pages/my-orders/components/AdditionalPetRequest.tsx",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const p = resolve(ROOT, F[key]);
  if (!existsSync(p)) throw new Error(`missing file: ${F[key]}`);
  return readFileSync(p, "utf8");
}

/** Strip block comments first, then `--` / `//` line comments, so the guard
 *  never trips on the prose that documents the rule it enforces. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // CRLF-SAFE (fixed 2026-07-28, GATING-002) — see the note in
    // check-additional-pet-upgrade.mjs. "\r" is a JS regex line terminator, so
    // splitting on "\n" alone left `//` comments unstripped in a CRLF checkout.
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, "").replace(/\/\/.*$/, ""))
    .join("\n");
}

const LOCK_MSG = /Additional pets cannot be added after the evaluation is completed/i;

const CHECKS = [
  // ── G1/G2 the shared predicate ──────────────────────────────────────────
  ["G1", "one shared server-side lock predicate is defined",
    (s) => /create or replace function public\.additional_pet_order_locked\(p_order_id uuid\)/.test(s.gating)],
  ["G2a", "lock is a UNION incl. issued-document signals, not status alone",
    (s) => {
      const c = stripComments(s.gating);
      return /status = 'completed'/.test(c)
        && /doctor_status = 'patient_notified'/.test(c)
        && /letter_id is not null/.test(c)
        && /signed_letter_url is not null/.test(c)
        && /letter_verifications/.test(c)
        && /order_document_versions/.test(c);
    }],
  ["G2b", "predicate is SECURITY DEFINER with a pinned search_path",
    (s) => /additional_pet_order_locked[\s\S]{0,400}?security definer[\s\S]{0,200}?set search_path to 'public'/.test(s.gating)],
  ["G2c", "predicate is revoked from public, anon and authenticated",
    (s) => /revoke all on function public\.additional_pet_order_locked\(uuid\)\s+from public, anon, authenticated/.test(s.gating)],

  // ── G3/G4 the engine ────────────────────────────────────────────────────
  ["G3a", "engine consults the lock predicate",
    (s) => /v_lock := public\.additional_pet_order_locked\(p_order_id\)/.test(s.gating)],
  ["G3b", "lock is checked BEFORE any actionable outcome is produced",
    (s) => {
      const c = stripComments(s.gating);
      const lock = c.indexOf("additional_pet_order_locked(p_order_id)");
      const paid = c.indexOf("tier_upgrade_required");
      const incl = c.indexOf("'already_covered'");
      return lock > 0 && paid > lock && incl > lock;
    }],
  ["G4", "the completed branch returns amount_cents 0 and never a price",
    (s) => /'code', 'order_completed', 'amount_cents', 0/.test(s.gating.replace(/\s+/g, " "))],

  // ── G5 mutation-time rechecks ───────────────────────────────────────────
  ["G5a", "resume rechecks the lock at mutation time",
    (s) => {
      const c = stripComments(s.createFn);
      const i = c.indexOf('action === "resume"');
      if (i < 0) return false;
      return /additional_pet_order_locked/.test(c.slice(i, i + 1400));
    }],
  ["G5b", "update_pet rechecks the lock at mutation time",
    (s) => {
      const c = stripComments(s.createFn);
      const i = c.indexOf('action === "update_pet"');
      if (i < 0) return false;
      return /additional_pet_order_locked/.test(c.slice(i, i + 1400));
    }],
  ["G5c", "create still blocks on the engine's blocked outcome",
    (s) => /if \(!pr\.eligible \|\| pr\.outcome === "blocked"\)[\s\S]{0,200}?return json\(409/.test(s.createFn)],

  // ── G6/G7 the race ──────────────────────────────────────────────────────
  ["G6a", "fulfilment rechecks the lock before applying the payment",
    (s) => /additional_pet_order_locked/.test(stripComments(s.shared))],
  ["G6b", "the lock recheck happens BEFORE the row is marked paid",
    (s) => {
      const c = stripComments(s.shared);
      const lock = c.indexOf("additional_pet_order_locked");
      const paid = c.search(/paid_at:\s*(new Date|now)/);
      return lock > 0 && (paid < 0 || lock < paid);
    }],
  ["G6c", "a locked order short-circuits with order_locked, not completed",
    (s) => /status:\s*"order_locked"/.test(s.shared)],
  ["G7a", "the race path records an actionable audit event",
    (s) => /additional_pet_payment_after_order_locked/.test(s.shared)],
  ["G7b", "the race path parks the money for reconciliation, not silently",
    (s) => /refund_pending/.test(s.shared) && /reconciliation/i.test(s.shared)],

  // ── G8..G11 Admin ───────────────────────────────────────────────────────
  ["G8a", "Admin surfaces the approved label",
    (s) => /Add Additional Pet/.test(s.adminMenu)],
  ["G8b", "Admin fails closed when eligibility cannot be resolved",
    (s) => /if \(!pricing\) return null/.test(s.adminMenu)],
  ["G8c", "Admin renders a disabled placeholder while eligibility loads",
    (s) => /if \(loading\)[\s\S]{0,400}?disabled/.test(s.adminMenu)],
  // Rewritten 2026-07-28 (GATING-002). The old form pinned the literal
  // `onClick={() => { onCloseMenu(); … }}`. That handler had to change — closing
  // the menu unmounted the component and the dialog never opened — and a check
  // keyed to exact handler text fails on a correct refactor while proving
  // nothing about the actual rule. Assert the RULE: no inline menu-item click
  // handler may perform a mutation; it may only set local UI state.
  ["G9", "the Admin menu item does not mutate on click (opens a dialog only)",
    (s) => {
      const c = stripComments(s.adminMenu);
      const inline = c.match(/onClick=\{\(\) => \{[^}]*\}\}/g) ?? [];
      if (!inline.length) return false;
      return inline.every((h) => !/callFn\(|fetch\(|supabase\.from|admin_resolve|\.insert\(|\.update\(/.test(h));
    }],
  ["G10a", "Admin uses the SAME server engine as the customer",
    (s) => /functions\/v1\/create-additional-pet-request/.test(s.adminMenu)],
  ["G10b", "Admin never hardcodes a price into the request body",
    (s) => {
      const c = stripComments(s.adminMenu);
      return !/amount(_cents)?\s*:\s*\d+/.test(c) && !/2000/.test(c);
    }],
  ["G11a", "a completed order yields a NON-button (non-actionable) Admin item",
    (s) => /if \(locked\)[\s\S]{0,600}?aria-disabled="true"/.test(s.adminMenu)
        && /if \(locked\)[\s\S]{0,900}?<\/div>/.test(s.adminMenu)],
  ["G11b", "the locked Admin item carries the owner-approved explanation",
    (s) => LOCK_MSG.test(s.adminMenu)],
  ["G11c", "locked is derived from the SERVER code, not a client status guess",
    (s) => /code === "order_completed"/.test(s.adminMenu)
        && !/order\.status\s*===\s*["']completed["']/.test(stripComments(s.adminMenu))],

  // ── G12 Customer ────────────────────────────────────────────────────────
  ["G12a", "customer shows Start a New Evaluation for a completed order",
    (s) => /Start a New Evaluation/.test(s.customerUi)],
  ["G12b", "the completed customer branch is keyed on the server code",
    (s) => /code === "order_completed"/.test(s.customerUi)],
  ["G12c", "the generic blocked branch no longer swallows the completed case",
    (s) => /code !== "order_completed"/.test(s.customerUi)],
  ["G12d", "the completed customer branch offers no price and no checkout",
    (s) => {
      const c = stripComments(s.customerUi);
      const i = c.indexOf('code === "order_completed"');
      if (i < 0) return false;
      const branch = c.slice(i, i + 1400);
      return !/checkoutUrl|\$20|amount_cents|Continue to payment/.test(branch);
    }],

  // ── G13 frozen file ─────────────────────────────────────────────────────
  ["G13a", "the frozen modal mounts the isolated Admin component",
    (s) => /<OrderAdditionalPetMenuAction/.test(s.frozen)],
  ["G13b", "the frozen modal contains no Additional Pet gating logic itself",
    (s) => {
      const c = stripComments(s.frozen);
      return !/additional_pet_order_locked/.test(c)
        && !/create-additional-pet-request/.test(c);
    }],

  // ── G14/G15 money + document integrity ──────────────────────────────────
  ["G14", "no provider earning is created by any Additional Pet path",
    (s) => {
      const c = stripComments(s.shared) + stripComments(s.createFn) + stripComments(s.decision);
      return !/doctor_earnings/.test(c);
    }],
  ["G15a", "the gating migration mutates no order/document/verification row",
    (s) => !/(insert into|update|delete from)\s+public\.(orders|order_documents|letter_verifications|doctor_earnings)/i
      .test(stripComments(s.gating))],
  ["G15b", "the race path never writes orders/documents/verifications",
    (s) => {
      const c = stripComments(s.shared);
      const i = c.indexOf("additional_pet_order_locked");
      const branch = c.slice(i, i + 2600);
      return !/from\("orders"\)[\s\S]{0,80}?\.update|letter_verifications|order_document_versions/.test(branch);
    }],
];

// ── Planted negative controls — each MUST trip its check ───────────────────
const CONTROLS = [
  ["G1",    "predicate deleted",            (s) => ({ ...s, gating: s.gating.replace(/create or replace function public\.additional_pet_order_locked\(p_order_id uuid\)/, "create or replace function public.some_other_fn(p_order_id uuid)") })],
  ["G2a",   "status-only predicate",        (s) => ({ ...s, gating: s.gating.replace(/signed_letter_url is not null/g, "false") })],
  ["G2c",   "grant left open",              (s) => ({ ...s, gating: s.gating.replace(/revoke all on function public\.additional_pet_order_locked\(uuid\)\s+from public, anon, authenticated/, "-- revoked") })],
  ["G3b",   "lock checked AFTER pricing",   (s) => ({ ...s, gating: s.gating.replace(/v_lock := public\.additional_pet_order_locked\(p_order_id\)/, "-- moved") + "\nv_lock := public.additional_pet_order_locked(p_order_id);\n" })],
  ["G4",    "completed branch given a price", (s) => ({ ...s, gating: s.gating.replace(/'code', 'order_completed', 'amount_cents', 0/, "'code', 'order_completed', 'amount_cents', 2000") })],
  // NOTE: the recheck call is byte-identical in `update_pet` and `resume`, and
  // `update_pet` appears FIRST in the file — a non-global replace would strip the
  // wrong one and leave `resume` intact (the control would silently pass). Remove
  // every occurrence so the mutation genuinely deletes the resume-branch recheck.
  ["G5a",   "resume recheck removed",       (s) => ({ ...s, createFn: s.createFn.replace(/const \{ data: lock \} = await admin\.rpc\("additional_pet_order_locked", \{ p_order_id: o\.id \}\);/g, "const lock = null;") })],
  ["G6a",   "fulfilment recheck removed",   (s) => ({ ...s, shared: s.shared.replace(/additional_pet_order_locked/g, "some_other_rpc") })],
  ["G7a",   "race audit removed",           (s) => ({ ...s, shared: s.shared.replace(/additional_pet_payment_after_order_locked/g, "noop_event") })],
  ["G8b",   "Admin fails OPEN",             (s) => ({ ...s, adminMenu: s.adminMenu.replace(/if \(!pricing\) return null;/, "if (!pricing) { /* render anyway */ }") })],
  ["G9",    "menu item mutates on click",   (s) => ({ ...s, adminMenu: s.adminMenu.replace(/onClick=\{\(\) => \{ setError\(""\); setSuccess\(""\); setPet\(EMPTY_PET\); setOpen\(true\); \}\}/, 'onClick={() => { callFn("create"); }}') })],
  ["G10b",  "Admin hardcodes the price",    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/const EMPTY_PET/, "const HARDCODED = 2000;\nconst EMPTY_PET") })],
  ["G11b",  "locked explanation removed",   (s) => ({ ...s, adminMenu: s.adminMenu.replace(/Additional pets cannot be added after the evaluation is completed[^"]*/g, "Unavailable") })],
  ["G12a",  "new-evaluation CTA removed",   (s) => ({ ...s, customerUi: s.customerUi.replace(/Start a New Evaluation/g, "Add another pet") })],
  ["G12d",  "checkout offered when completed", (s) => ({ ...s, customerUi: s.customerUi.replace(/(code === "order_completed" && \()/, "$1 checkoutUrl && ") })],
  ["G13b",  "gating logic leaks into frozen file", (s) => ({ ...s, frozen: s.frozen + '\nconst leak = "create-additional-pet-request";\n' })],
  ["G14",   "provider earning added",       (s) => ({ ...s, shared: s.shared + '\nawait supabase.from("doctor_earnings").insert({});\n' })],
];

function loadAll(override) {
  const s = {};
  for (const k of Object.keys(F)) s[k] = read(k, override);
  return s;
}

function runChecks(src) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok = false;
    try { ok = !!fn(src); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-additional-pet-completed-order-gating";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const results = runChecks(mutate(base));
      const hit = results.find((r) => r.id === target);
      const tripped = hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : "MISSED "} ${target.padEnd(6)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(6)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
