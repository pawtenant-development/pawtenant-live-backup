// scripts/check-additional-pet-automatic-eligibility.mjs
//
// ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002 (owner correction)
//
// ROOT CAUSE THIS GUARD PINS: manual_review was acting as a CATCH-ALL rather
// than an exception. Measured on TEST before the fix, 23 of 50 open (clinically
// mutable) paid orders returned manual_review — 12 because the list price
// matched no hardcoded era, 10 because the plan was annual, 1 with no snapshot.
// Every one of those 23 had locked=false, so the completion gate was NOT the
// cause; the defect was entirely inside ENTITLEMENT classification:
//
//   BUG 1  classify_order_entitlement trusted the frozen registered pet count in
//          the `esa_standard`/`psd_standard` package_key branch but demoted to
//          ambiguous_manual_review in the null-package_key branch. Same
//          evidence, opposite verdict.
//   BUG 2  plan_family fell to 'unknown' (-> manual review) when billing_plan,
//          plan_type AND subscription_id were all absent, even though the
//          absence of a subscription_id is itself deterministic evidence of a
//          one-off charge.
//
// After the fix: 35 paid_upgrade / 11 included / 3 max_pets / 1 manual_review.
//
// This guard makes the corrected behaviour NON-REGRESSABLE and, critically,
// makes it impossible to re-weaken the completion lock in the process.
//
//   A1  provider assignment state (unassigned / pending_review / under review)
//       is NEVER consulted by the engine.
//   A2  a PARTIAL refund is explicitly not a block.
//   A3  Additional Documentation / RA never forces manual review.
//   A4  annual/subscription is no longer a manual-review reason (owner 2026-07-28).
//   A5  pet-count inference exists in BOTH null-package_key branches.
//   A6  every manual_review carries a machine-readable code.
//   A7  the COMPLETION LOCK is evaluated BEFORE the Admin override.
//   A8  Admin resolution refuses outright on a completed / locked order.
//   A9  Admin resolution is authorised on is_admin_staff() and is audited.
//   A10 the customer cannot self-resolve a manual review.
//   A11 the $20 stays server-computed on the Admin-resolved path.
//   A12 no provider earning anywhere.
//   A13 Admin renders manual_review as an ENABLED action, not a dead row.
//   A14 the customer manual-review copy is the owner-approved text.
//   A15 the override tables are fail-closed (no JWT-role write).
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-additional-pet-automatic-eligibility.mjs             → guard (exit 1 on fail)
//   node scripts/check-additional-pet-automatic-eligibility.mjs --warn-only → audit (exit 0)
//   node scripts/check-additional-pet-automatic-eligibility.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  eligibility: "supabase/migrations/20260728140000_additional_pet_automatic_eligibility_and_admin_resolution.sql",
  gating:      "supabase/migrations/20260728120000_additional_pet_completed_order_gating.sql",
  createFn:    "supabase/functions/create-additional-pet-request/index.ts",
  shared:      "supabase/functions/_shared/completeAdditionalPetPayment.ts",
  decision:    "supabase/functions/provider-additional-pet-decision/index.ts",
  adminMenu:   "src/pages/admin-orders/components/OrderAdditionalPetMenuAction.tsx",
  customerUi:  "src/pages/my-orders/components/AdditionalPetRequest.tsx",
  priceMig:    "supabase/migrations/20260728160000_additional_pet_price_v2_30_and_grandfathering.sql",
  frozen:      "src/pages/admin-orders/components/OrderDetailModal.tsx",
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
    // CRLF-SAFE (GATING-002) — see the note in check-additional-pet-upgrade.mjs.
    // "\r" is a JS regex line terminator, so splitting on "\n" alone left `//`
    // comments unstripped in a CRLF checkout.
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, "").replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Body of one SQL function, so a check cannot be satisfied by an unrelated
 *  function elsewhere in the same migration (the review payload function, for
 *  example, legitimately mentions doctor_status for DISPLAY). */
function fnBody(sql, name) {
  const c = stripComments(sql);
  const start = c.indexOf(`create or replace function public.${name}`);
  if (start < 0) return "";
  const rest = c.slice(start + 10);
  const end = rest.indexOf("\ncreate or replace function ");
  return end < 0 ? rest : rest.slice(0, end);
}

/** The JSX branch the Admin component renders for a manual-review order.
 *  Bounded by the NEXT branch — a fixed-length slice overruns into the blocked
 *  branch, whose aria-disabled would make the "is it enabled?" check pass for
 *  the wrong reason. */
function adminReviewBranch(src) {
  const i = src.indexOf("if (needsReview)");
  if (i < 0) return "";
  const rest = src.slice(i);
  const end = rest.indexOf("if (!actionable)");
  return end < 0 ? rest : rest.slice(0, end);
}

/** Where the engine actually CONSULTS the override — not the `v_ovr` DECLARE
 *  line, which necessarily sits above every branch and would make any
 *  "X happens before the override" ordering check pass vacuously. */
const OVERRIDE_READ = "select * into v_ovr from public.order_additional_pet_eligibility_overrides";

/**
 * `resolve_additional_pet_pricing` is redefined by a later migration (the
 * 2026-07-28 $30 pricing change). Asserting against the ORIGINAL definition
 * would keep passing while the deployed one silently lost the invariant, so
 * every resolver check must read the LAST definition in migration order.
 */
function resolverBody(s) {
  for (const src of [s.priceMig, s.eligibility]) {
    const b = fnBody(src, "resolve_additional_pet_pricing");
    if (b) return b;
  }
  return "";
}

const CHECKS = [
  // ── A1 provider state must never influence entitlement ──────────────────
  ["A1a", "the engine never reads doctor_status / provider assignment",
    (s) => {
      const b = resolverBody(s);
      return b.length > 0
        && !/doctor_status/.test(b)
        && !/doctor_user_id/.test(b)
        && !/assigned_provider/.test(b);
    }],
  ["A1b", "under-review / pending_review / unassigned are not engine branches",
    (s) => {
      const b = resolverBody(s);
      return b.length > 0 && !/'(under-review|pending_review|unassigned|in_review|processing)'/.test(b);
    }],
  ["A1c", "the completion lock predicate still excludes provider assignment states",
    (s) => {
      const b = stripComments(s.gating);
      return !/doctor_status\s*=\s*'(pending_review|unassigned|in_review)'/.test(b);
    }],

  // ── A2 partial refund stays eligible ────────────────────────────────────
  ["A2", "a PARTIAL refund is explicitly excluded from the reversed block",
    (s) => {
      const b = resolverBody(s);
      return /refund_status,''\)\s*<>\s*'partial'/.test(b.replace(/\s+/g, " "))
        || /coalesce\(v_order\.refund_status,''\) <> 'partial'/.test(b.replace(/\s+/g, " "));
    }],

  // ── A3 Additional Documentation never forces manual review ──────────────
  ["A3", "includes_ra / RA is never a manual-review or blocking branch",
    (s) => {
      const b = resolverBody(s);
      // includes_ra may only be PASSED THROUGH, never tested.
      return !/if[^\n]*includes_ra/.test(b) && !/includes_reasonable_accommodation[^\n]*then/.test(b);
    }],

  // ── A4 annual is no longer a manual-review reason ───────────────────────
  ["A4a", "the classifier does not send annual to manual_review_required",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return !/when v_plan = 'annual' then 'manual_review_required'/.test(b);
    }],
  ["A4b", "upgrade_policy is manual_review_required ONLY for ambiguous evidence",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /v_policy := case when v_conf = 'ambiguous_manual_review' then 'manual_review_required' else 'supported' end/.test(b);
    }],
  ["A4c", "no 'annual_plan' manual-review code survives anywhere",
    (s) => !/'annual_plan'/.test(stripComments(s.eligibility))],

  // ── A5 pet-count inference (the BUG 1 fix) ──────────────────────────────
  ["A5a", "pet-count inference exists in BOTH null-package_key branches",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement");
      return (b.match(/inferred_registered_pet_count/g) ?? []).length >= 2;
    }],
  ["A5b", "inference maps 1 pet -> single and 2-3 pets -> multi",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /if v_pets = 1 then v_tier := 'single'; v_limit := 1; elsif v_pets between 2 and 3 then v_tier := 'multi'; v_limit := 3;/.test(b);
    }],
  ["A5c", "an unusable pet count STILL falls to coded manual review",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /v_conf := 'ambiguous_manual_review'; v_code := 'legacy_package_unknown'/.test(b);
    }],
  ["A5d", "the contradiction guard is retained (count > derived limit)",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /if v_limit is not null and v_pets > v_limit then/.test(b)
        && /v_code := 'conflicting_pet_count'/.test(b);
    }],
  ["A5e", "missing subscription evidence resolves to one_time, not unknown (BUG 2)",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /when p_subscription_id is not null then 'annual' else 'one_time' end/.test(b);
    }],

  // ── A6 every manual review is coded ─────────────────────────────────────
  ["A6a", "every manual_review return in the engine carries a code",
    (s) => {
      const b = resolverBody(s);
      const branches = b.split(/'outcome',\s*'manual_review'/).slice(1);
      return branches.length > 0 && branches.every((x) => /'manual_review_code'/.test(x.slice(0, 700)));
    }],
  ["A6b", "the classifier never emits manual review without a code",
    (s) => {
      const b = fnBody(s.eligibility, "classify_order_entitlement").replace(/\s+/g, " ");
      return /v_code := coalesce\(v_code, 'legacy_package_unknown'\)/.test(b);
    }],

  // ── A7 lock precedence over the override ────────────────────────────────
  ["A7a", "the engine consults the completion lock BEFORE the admin override",
    (s) => {
      const b = resolverBody(s);
      const lock = b.indexOf("additional_pet_order_locked(p_order_id)");
      const ovr = b.indexOf(OVERRIDE_READ);
      return lock > 0 && ovr > lock;
    }],
  ["A7b", "the lock branch still returns order_completed with no amount",
    (s) => /'code', 'order_completed', 'amount_cents', 0/
      .test(resolverBody(s).replace(/\s+/g, " "))],
  ["A7c", "the pet ceiling is enforced BEFORE the override can grant a pet",
    (s) => {
      const b = resolverBody(s);
      const max = b.indexOf("max_pets_reached");
      const ovr = b.indexOf(OVERRIDE_READ);
      return max > 0 && ovr > max;
    }],

  // ── A8/A9 the Admin resolution RPC ──────────────────────────────────────
  ["A8a", "admin resolution re-evaluates the lock server-side",
    (s) => /additional_pet_order_locked/
      .test(fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility"))],
  ["A8b", "a locked order RAISES rather than being resolved",
    (s) => {
      const b = fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility").replace(/\s+/g, " ");
      return /if \(v_lock->>'locked'\)::boolean then raise exception/.test(b);
    }],
  ["A8c", "the lock check precedes any override write",
    (s) => {
      const b = fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility");
      const lock = b.indexOf("additional_pet_order_locked");
      const ins = b.indexOf("insert into public.order_additional_pet_eligibility_overrides");
      return lock > 0 && ins > lock;
    }],
  ["A9a", "admin resolution authorises on is_admin_staff() and fails closed",
    (s) => {
      const b = fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility").replace(/\s+/g, " ");
      return /if not public\.is_admin_staff\(\) then raise exception/.test(b);
    }],
  ["A9b", "only the three legal resolutions are accepted",
    (s) => {
      const b = fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility").replace(/\s+/g, " ");
      return /p_resolution not in \('paid_upgrade','included','blocked'\) then raise exception/.test(b);
    }],
  ["A9c", "every resolution writes an audit_logs row with the admin actor",
    (s) => {
      const b = fnBody(s.eligibility, "admin_resolve_additional_pet_eligibility");
      return /insert into public\.audit_logs/.test(b)
        && /additional_pet_eligibility_resolved/.test(b);
    }],
  ["A9d", "resolution history is append-only",
    (s) => {
      const c = stripComments(s.eligibility);
      return /tg_addpet_override_events_append_only/.test(c)
        && /before update or delete on public\.order_additional_pet_eligibility_override_events/.test(c);
    }],
  ["A9e", "the review payload is admin-authorised too",
    (s) => /if not public\.is_admin_staff\(\) then/
      .test(fnBody(s.eligibility, "get_additional_pet_eligibility_review").replace(/\s+/g, " "))],

  // ── A10 the customer cannot self-resolve ────────────────────────────────
  ["A10a", "the customer portal never calls the resolution RPC",
    (s) => !/admin_resolve_additional_pet_eligibility/.test(stripComments(s.customerUi))],
  ["A10b", "the customer portal never reads the admin review payload",
    (s) => !/get_additional_pet_eligibility_review/.test(stripComments(s.customerUi))],
  ["A10c", "the customer manual-review branch offers no price and no checkout",
    (s) => {
      const c = stripComments(s.customerUi);
      const i = c.indexOf('outcome === "manual_review"');
      if (i < 0) return false;
      const branch = c.slice(i, i + 700);
      return !/checkoutUrl|amount_cents|Continue to payment|<button/.test(branch);
    }],

  // ── A11 the $20 stays server-computed ───────────────────────────────────
  // Updated for the versioned-pricing model: the admin-resolved paid amount is
  // now read from the CURRENT price version rather than the legacy helper. The
  // invariant is unchanged — it must be server-derived, never a literal.
  ["A11a", "the admin-resolved paid path takes the amount from the server price",
    (s) => {
      const b = resolverBody(s);
      const i = b.indexOf(OVERRIDE_READ);
      if (i < 0) return false;
      const branch = b.slice(i, i + 1600);
      // NB: the blocked-override return legitimately contains
      // `'amount_cents', 0`, so a blanket "no numeric literal" test would flag
      // a correct file. Assert the PAID branch's expression instead.
      return /then \(v_price->>'amount_cents'\)::integer else 0 end/.test(branch.replace(/\s+/g, " "))
        || /then public\.additional_pet_upgrade_cents\(\) else 0 end/.test(branch.replace(/\s+/g, " "));
    }],
  ["A11b", "no price literal is introduced in the engine migration",
    (s) => !/\b2000\b/.test(stripComments(s.eligibility))],
  ["A11c", "the Admin UI renders the server amount with no client fallback",
    (s) => {
      const c = stripComments(s.adminMenu);
      return !/amount_cents\s*\?\?\s*\d+/.test(c) && !/\b2000\b/.test(c);
    }],
  ["A11d", "the Admin UI never sends a resolution-derived amount to the server",
    (s) => {
      const c = stripComments(s.adminMenu);
      const i = c.indexOf("admin_resolve_additional_pet_eligibility");
      if (i < 0) return false;
      return !/amount|price|cents/i.test(c.slice(i, i + 400));
    }],

  // ── A12 money integrity ─────────────────────────────────────────────────
  ["A12a", "no provider earning is created by any Additional Pet path",
    (s) => !/doctor_earnings/.test(
      stripComments(s.shared) + stripComments(s.createFn) + stripComments(s.decision))],
  // NOTE: the migration legitimately READS pre-existing stripe_* snapshot
  // columns, so a bare /stripe/ match is a false positive. What must hold is
  // that it creates no earning and writes no payment-bearing row — the engine
  // decides eligibility, it never mints a request or a charge.
  ["A12b", "the eligibility migration creates no earning and no payment row",
    (s) => {
      const c = stripComments(s.eligibility);
      return !/doctor_earnings/.test(c)
        && !/insert into public\.order_additional_pet_requests/i.test(c)
        && !/insert into[^\n]*stripe/i.test(c);
    }],
  ["A12c", "the eligibility migration mutates no order / document / verification row",
    (s) => !/(insert into|update|delete from)\s+public\.(orders|order_documents|letter_verifications|order_document_versions|doctor_earnings)\b/i
      .test(stripComments(s.eligibility))],

  // ── A13 Admin manual review is ACTIONABLE ───────────────────────────────
  ["A13a", "Admin renders an ENABLED button for manual review",
    (s) => {
      const b = adminReviewBranch(stripComments(s.adminMenu));
      return b.length > 0 && /<button/.test(b) && !/aria-disabled="true"/.test(b);
    }],
  ["A13b", "the Admin action is labelled Review Additional Pet Eligibility",
    (s) => /Review Additional Pet Eligibility/.test(s.adminMenu)],
  // Comments are stripped: the file's own header PROSE explains that Admin must
  // not get the "contact PawTenant Support" row, and must not trip its own rule.
  ["A13c", "Admin is NEVER told to contact PawTenant Support",
    (s) => !/Contact PawTenant Support/i.test(stripComments(s.adminMenu))],
  ["A13d", "the review dialog shows the machine-readable reason code",
    (s) => /REVIEW_CODE_LABEL/.test(s.adminMenu) && /manual_review_code/.test(s.adminMenu)],
  ["A13e", "the review dialog disables resolution when the order is locked",
    (s) => {
      const c = stripComments(s.adminMenu);
      return /disabled=\{submitting \|\| loading \|\| !!lock\?\.locked\}/.test(c);
    }],
  // The dialog is portaled to document.body but the order modal root is a
  // `fixed inset-0 z-[100]` overlay. At a lower z the dialog mounts, lays out
  // and reports itself visible while painting BEHIND the modal — invisible to
  // the operator with no error anywhere. Pin the relationship, don't hardcode.
  // Anchored to the order modal SHELL specifically (`p-2 sm:p-4`, currently
  // z-[100]) — not max() over the file, because the frozen modal also contains
  // a nested z-[200] overlay for a different modal that legitimately stacks
  // above and is never open at the same time as this dialog.
  ["A13g", "the Admin dialog overlay outranks the OrderDetailModal shell z-index",
    (s) => {
      const dz = (stripComments(s.adminMenu).match(/fixed inset-0 z-\[(\d+)\]/) ?? [])[1];
      const mz = (stripComments(s.frozen)
        .match(/fixed inset-0 z-\[(\d+)\] flex items-center justify-center p-2 sm:p-4/) ?? [])[1];
      return !!dz && !!mz && Number(dz) > Number(mz);
    }],
  ["A13h", "the dialog is portaled out of the dropdown so closing the menu cannot unmount it",
    (s) => {
      const c = stripComments(s.adminMenu);
      return /createPortal\(/.test(c) && /document\.body,/.test(c)
        // and the open handlers must NOT close the menu first
        && !/onClick=\{\(\) => \{ onCloseMenu\(\);/.test(c);
    }],
  ["A13f", "opening the review dialog mutates nothing (read-only RPC)",
    (s) => {
      const c = stripComments(s.adminMenu);
      const i = c.indexOf("const openReview");
      if (i < 0) return false;
      const body = c.slice(i, i + 700);
      return /get_additional_pet_eligibility_review/.test(body)
        && !/admin_resolve_additional_pet_eligibility/.test(body);
    }],

  // ── A14 customer copy ───────────────────────────────────────────────────
  ["A14a", "the customer manual-review copy is the owner-approved text",
    (s) => /We need to review this order before another pet can be added/.test(s.customerUi)],
  ["A14b", "the old dead-end 'Contact PawTenant Support for assistance' copy is gone",
    (s) => !/Contact\s+PawTenant Support for assistance/.test(s.customerUi)],

  // ── G: $30 pricing + $20 grandfathering (owner change 2026-07-28) ───────
  ["G1", "the current price is $30 and both versions are recorded",
    (s) => {
      const c = stripComments(s.priceMig);
      return /'v2_3000', 3000, 'usd'/.test(c) && /'v1_2000', 2000, 'usd'/.test(c)
        && /superseded_at/.test(c);
    }],
  ["G2", "exactly ONE effective-timestamp rule exists (no scattered date logic)",
    (s) => {
      const c = stripComments(s.priceMig);
      const windows = (c.match(/effective_from <= now\(\)/g) ?? []).length;
      return windows === 1 && /additional_pet_current_price/.test(c);
    }],
  ["G3", "the engine resumes an active request at ITS stored amount, not today's",
    (s) => {
      const b = fnBody(s.priceMig, "resolve_additional_pet_pricing");
      const i = b.indexOf("v_active");
      return i > 0
        && /'amount_cents', v_active\.amount_cents/.test(b)
        && /'outcome', 'resume_payment'/.test(b)
        && /'grandfathered'/.test(b);
    }],
  ["G4", "a NEW paid quote uses the current version, never a literal",
    (s) => {
      const b = fnBody(s.priceMig, "resolve_additional_pet_pricing").replace(/\s+/g, " ");
      return /'amount_cents', \(v_price->>'amount_cents'\)::integer/.test(b)
        && /'pricing_version', v_price->>'pricing_version'/.test(b);
    }],
  ["G5", "existing requests are NOT mass-repriced by the migration",
    (s) => {
      const c = stripComments(s.priceMig);
      // The only permitted UPDATE is the version LABEL backfill for rows that
      // are ALREADY 2000. Repricing any existing row is forbidden.
      //
      // The check must look only at each UPDATE's SET clause: the legitimate
      // backfill mentions `amount_cents = 2000` in its WHERE, and a naive
      // "does the statement contain amount_cents =" test flags it as a
      // repricing when it is the opposite — a filter that protects those rows.
      const setClauses = [...c.matchAll(/update\s+public\.order_additional_pet_requests\b([\s\S]*?)(?:\bwhere\b|;)/gi)]
        .map((m) => m[1]);
      const reprices = setClauses.some((clause) => /\bamount_cents\s*=/i.test(clause));
      return !reprices
        && /set pricing_version = 'v1_2000'[\s\S]{0,200}?amount_cents = 2000/.test(c);
    }],
  ["G6", "the quoted price is immutable — version included in the frozen facts",
    (s) => {
      const b = fnBody(s.priceMig, "tg_addpet_immutable");
      return /new\.amount_cents\s+is distinct from old\.amount_cents/.test(b)
        && /new\.pricing_version is distinct from old\.pricing_version/.test(b);
    }],
  ["G7", "amount must match a KNOWN price version on write",
    (s) => {
      const b = fnBody(s.priceMig, "tg_addpet_price_version_valid");
      return /from public\.additional_pet_price_versions/.test(b)
        && /amount_cents <> v_expected/.test(b)
        && /unknown pricing_version/.test(b);
    }],
  ["G8", "the amount CHECK no longer names a single hardcoded price",
    (s) => {
      const c = stripComments(s.priceMig);
      return /pricing_outcome = 'paid_upgrade' and amount_cents > 0/.test(c)
        && !/pricing_outcome = 'paid_upgrade' and amount_cents = 2000/.test(c);
    }],
  ["G9", "the create path stamps the server-quoted version on the row",
    (s) => {
      const c = stripComments(s.createFn);
      // Anchor on `created_by`, which is unique to the CREATE insert. Three
      // earlier anchors each matched the wrong statement: the first
      // `.from("order_additional_pet_requests")` is loadRequests() (a read),
      // the first `.insert({` is the cancel EVENT insert, and the first
      // `new_pet: pet,` is the update_pet UPDATE.
      const ins = c.indexOf('created_by: isAdmin ? "admin" : "customer",');
      const insertBlock = ins > 0 ? c.slice(Math.max(0, ins - 1200), ins + 200) : "";
      return /pricing_version: pricingVersion/.test(insertBlock)
        && /const amountCents = isPaid \? \(pr\.amount_cents \?\? 0\) : 0/.test(c);
    }],
  ["G10", "included stays $0 with no pricing version and no Stripe object",
    (s) => {
      const b = fnBody(s.priceMig, "resolve_additional_pet_pricing").replace(/\s+/g, " ");
      return /'outcome', 'included', 'code', 'already_covered', 'amount_cents', 0/.test(b);
    }],
  ["G11", "Admin surfaces a grandfathered resume and never a second request",
    (s) => {
      const c = stripComments(s.adminMenu);
      return /Resume Additional Pet Checkout/.test(c)
        && /previous \$\{amt\} price/.test(c)
        && /current price \$\{dollars\(pricing\.current_price_cents\)\}/.test(c);
    }],
  // The grandfather notice lives in the ACTIVE-REQUEST panel, not in a
  // `resume_payment` outcome branch. The server returns `resume_payment`
  // exactly when an active request exists, and the panel renders first in that
  // case — so an outcome branch for it is unreachable. Verified in the deployed
  // portal: the panel already showed "Complete payment ($20)" from the row's
  // own amount. Assert the reachable surface: the amount comes from the
  // REQUEST row and the explanation is gated on the SERVER's grandfathered flag.
  ["G12", "Customer surfaces the grandfathered amount from the server",
    (s) => {
      const c = stripComments(s.customerUi);
      return /pricing\?\.grandfathered/.test(c)
        && /dollars\(activeRequest\.amount_cents\)/.test(c)
        && /will remain valid at\s*\n?\s*that amount/.test(c)
        && !/outcome === "resume_payment"/.test(c);   // no unreachable branch
    }],
  ["G13", "no UI hardcodes a paid price label",
    (s) => {
      const a = stripComments(s.adminMenu), c = stripComments(s.customerUi);
      return !/\$20\.00|\$30\.00|"\$30"|"\$20"/.test(a + c);
    }],

  // ── C: customer card hierarchy (owner decision 2026-07-28) ──────────────
  // The card used the submitted PET NAME as its heading, so a QA fixture named
  // "VerifyTwenty" read as the workflow title.
  ["C1", "the workflow state is the card heading, not the pet name",
    (s) => {
      const c = stripComments(s.customerUi);
      return /\{cardState\.title\}/.test(c)
        && !/\{activeRequest\.new_pet\?\.name \|\| "Additional pet"\}/.test(c);
    }],
  ["C2", "the pet name survives as a LABELLED detail",
    (s) => {
      const c = stripComments(s.customerUi);
      return /Pet:<\/span>/.test(c) && /\{activeRequest\.new_pet\.name\}/.test(c);
    }],
  ["C3", "owner card titles exist for every required state",
    (s) => {
      const c = stripComments(s.customerUi);
      return /"Additional Pet Request"/.test(c)
        && /"Additional Pet Request — Payment Received"/.test(c)
        && /"Additional Pet Under Review"/.test(c)
        && /"Additional Pet Added"/.test(c);
    }],
  ["C4", "ONE mapper drives both the badge and the heading",
    (s) => {
      const c = stripComments(s.customerUi);
      return /function customerCardState\(/.test(c)
        && /<StatusChip status=\{cardState\.badgeStatus\} \/>/.test(c)
        && !/<StatusChip status=\{activeRequest\.status\} \/>/.test(c);
    }],
  ["C5", "'Payment in progress' cannot render once paid_at is set",
    (s) => {
      const b = stripComments(s.customerUi);
      const i = b.indexOf("function customerCardState(");
      const body = i > 0 ? b.slice(i, i + 900) : "";
      // the awaiting-payment branch must be gated on !paid, not on status alone
      return /const paid = !!r\.paid_at/.test(body)
        && /if \(!paid && AWAITING_PAYMENT\.has\(s\)\)/.test(body);
    }],
  ["C6", "owner badge wording is present",
    (s) => {
      const c = stripComments(s.customerUi);
      return /label: "Payment received"/.test(c)
        && /label: "Provider review"/.test(c)
        && /label: "Payment received — action required"/.test(c);
    }],
  // Comments are stripped: these files legitimately DOCUMENT that a fixture
  // named "VerifyTwenty" used to be rendered as the heading. The rule is that
  // no fixture name appears in rendered CODE.
  ["C7", "no QA fixture pet name is hardcoded in rendered code",
    (s) => !/NewTwenty|NewThirty|VerifyTwenty|VerifyZero|OldTwenty|ZeroTamper/
      .test(stripComments(s.customerUi) + stripComments(s.adminMenu))],
  ["C8", "the grandfather notice only shows while payment is still due",
    (s) => {
      const c = stripComments(s.customerUi);
      return /pricing\?\.grandfathered && activeRequest\.pricing_outcome === "paid_upgrade" && !activeRequest\.paid_at/.test(c);
    }],

  // ── R: completed-order race is idempotent (found by the live race, TEST) ─
  ["R1", "the race branch short-circuits when the exception is already recorded",
    (s) => {
      const c = stripComments(s.shared);
      const i = c.indexOf("locked");
      const b = c.indexOf('status: "order_locked_already_recorded"');
      return b > 0 && /if \(reqRow\.status === "refund_pending"\)/.test(c) && i > 0;
    }],
  ["R2", "the idempotency check precedes every exception WRITE",
    (s) => {
      const c = stripComments(s.shared);
      const guard = c.indexOf('if (reqRow.status === "refund_pending")');
      const evt = c.indexOf('event_type: "payment_after_order_locked"');
      const aud = c.indexOf('action: "additional_pet_payment_after_order_locked"');
      return guard > 0 && evt > guard && aud > guard;
    }],
  ["R3", "the race still records the payment reference and never sets paid_at",
    (s) => {
      const c = stripComments(s.shared);
      const i = c.indexOf('status: "refund_pending",');
      if (i < 0) return false;
      const blk = c.slice(i, i + 420);
      return /stripe_payment_intent_id: opts\.piId/.test(blk) && !/paid_at:/.test(blk);
    }],

  ["R4", "the race state never reads as success to the customer",
    (s) => {
      const c = stripComments(s.customerUi);
      const i = c.indexOf('if (s === "refund_pending")');
      if (i < 0) return false;
      // Bound by the NEXT branch — a fixed window runs into the later
      // "Additional Pet Under Review" / "Provider review" cases and fails a
      // correct file.
      const rest = c.slice(i);
      const end = rest.indexOf('if (s === "completed")');
      const blk = end > 0 ? rest.slice(0, end) : rest;
      return /could not be added because your evaluation was already completed/.test(blk)
        && !/Additional Pet Added/.test(blk)
        && !/Provider review/.test(blk);
    }],

  // ── A15 override tables fail closed ─────────────────────────────────────
  ["A15a", "both override tables enable AND force RLS",
    (s) => {
      const c = stripComments(s.eligibility);
      return /alter table public\.order_additional_pet_eligibility_overrides\s+enable row level security/.test(c)
        && /alter table public\.order_additional_pet_eligibility_overrides\s+force\s+row level security/.test(c)
        && /alter table public\.order_additional_pet_eligibility_override_events\s+enable row level security/.test(c)
        && /alter table public\.order_additional_pet_eligibility_override_events\s+force\s+row level security/.test(c);
    }],
  ["A15b", "no JWT role may write the override tables",
    (s) => {
      const c = stripComments(s.eligibility);
      return /revoke all on public\.order_additional_pet_eligibility_overrides\s+from public, anon, authenticated/.test(c)
        && /revoke all on public\.order_additional_pet_eligibility_override_events\s+from public, anon, authenticated/.test(c)
        && !/grant (insert|update|delete)[^\n]*order_additional_pet_eligibility/i.test(c);
    }],
  ["A15c", "the engine and classifier stay revoked from anon and authenticated",
    (s) => {
      const c = stripComments(s.eligibility);
      return /revoke all on function public\.resolve_additional_pet_pricing\(uuid\)\s+from public, anon, authenticated/.test(c)
        && /revoke all on function public\.classify_order_entitlement\([\s\S]{0,120}?\)\s+from public, anon, authenticated/.test(c);
    }],
  ["A15d", "the two admin RPCs are granted, and only after being revoked by name",
    (s) => {
      const c = stripComments(s.eligibility);
      const revA = c.indexOf("revoke all on function public.get_additional_pet_eligibility_review(uuid)");
      const grantA = c.indexOf("grant execute on function public.get_additional_pet_eligibility_review(uuid)");
      const revB = c.indexOf("revoke all on function public.admin_resolve_additional_pet_eligibility(uuid,text,text)");
      const grantB = c.indexOf("grant execute on function public.admin_resolve_additional_pet_eligibility(uuid,text,text)");
      return revA > 0 && grantA > revA && revB > 0 && grantB > revB;
    }],
  ["A15e", "the snapshot repair is service-role/admin only",
    (s) => {
      const b = fnBody(s.eligibility, "repair_order_entitlement_snapshots").replace(/\s+/g, " ");
      return /if auth\.uid\(\) is not null and not public\.is_admin_staff\(\) then raise exception/.test(b);
    }],
  ["A15f", "the repair dry-run predicate matches the apply predicate exactly",
    (s) => {
      // A rehearsal that under-reports lets an operator approve a bigger write
      // than they were shown (first cut: 41 dry-run vs 104 applied).
      const b = fnBody(s.eligibility, "repair_order_entitlement_snapshots");
      const fields = (x) => (x.match(/is distinct from/g) ?? []).length;
      const parts = b.split("else");
      if (parts.length < 2) return false;
      return fields(parts[0]) === fields(parts[parts.length - 1]);
    }],
];

// ── Planted negative controls — each MUST trip its check ───────────────────
const CONTROLS = [
  ["A1a",  "engine reads provider status",
    (s) => ({ ...s, priceMig: s.priceMig.replace(
      /if lower\(coalesce\(v_order\.letter_type,''\)\) not in \('esa','psd'\) then/,
      "if v_order.doctor_status = 'unassigned' then\n    return jsonb_build_object('outcome','manual_review');\n  end if;\n  if lower(coalesce(v_order.letter_type,'')) not in ('esa','psd') then") })],
  ["A2",   "partial refund treated as a full reversal",
    (s) => ({ ...s, priceMig: s.priceMig.replace(/coalesce\(v_order\.refund_status,''\) <> 'partial'/g, "true") })],
  ["A4b",  "annual sent back to manual review",
    (s) => ({ ...s, eligibility: s.eligibility.replace(
      /v_policy := case\s*\n\s*when v_conf = 'ambiguous_manual_review' then 'manual_review_required'\s*\n\s*else 'supported'\s*\n\s*end;/,
      "v_policy := case when v_plan = 'annual' then 'manual_review_required' else 'supported' end;") })],
  ["A4c",  "annual_plan code reintroduced",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/'legacy_package_unknown'/, "'annual_plan'") })],
  // Anchored to the ANNUAL branch specifically. Two earlier attempts proved
  // nothing: the assignment is column-aligned (`v_conf    :=`) so a
  // single-space regex never matched, and the first bare
  // 'inferred_registered_pet_count' in the file is the CHECK-constraint value,
  // not the classifier — mutating it leaves both real branches intact.
  ["A5a",  "pet-count inference removed from one branch",
    (s) => ({ ...s, eligibility: s.eligibility.replace(
      /('registered_pet_count\(annual[^']*';\s*\n\s*v_conf\s*:= )'inferred_registered_pet_count'/,
      "$1'ambiguous_manual_review'") })],
  ["A5d",  "contradiction guard removed",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/if v_limit is not null and v_pets > v_limit then/, "if false then") })],
  ["A5e",  "plan falls back to unknown again",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/when p_subscription_id is not null            then 'annual'\s*\n\s*else 'one_time'/, "when p_subscription_id is not null then 'annual'\n    else 'unknown'") })],
  ["A7a",  "override consulted BEFORE the completion lock",
    (s) => ({ ...s, priceMig: s.priceMig.replace(
      /  v_lock := public\.additional_pet_order_locked\(p_order_id\);/,
      "  select * into v_ovr from public.order_additional_pet_eligibility_overrides where order_id = p_order_id;\n  v_lock := public.additional_pet_order_locked(p_order_id);") })],
  ["A8b",  "admin allowed to resolve a locked order",
    (s) => ({ ...s, eligibility: s.eligibility.replace(
      /if \(v_lock->>'locked'\)::boolean then\s*\n\s*raise exception\s*\n\s*'admin_resolve_additional_pet_eligibility/,
      "if false then\n    raise exception\n      'admin_resolve_additional_pet_eligibility") })],
  ["A9a",  "resolution authorisation removed",
    (s) => ({ ...s, eligibility: s.eligibility.replace(
      /if not public\.is_admin_staff\(\) then\s*\n\s*raise exception 'admin_resolve_additional_pet_eligibility: not authorised'/,
      "if false then\n    raise exception 'admin_resolve_additional_pet_eligibility: not authorised'") })],
  ["A9c",  "resolution audit removed",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/additional_pet_eligibility_resolved/g, "noop_action") })],
  ["A9d",  "resolution history made mutable",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/before update or delete on public\.order_additional_pet_eligibility_override_events/, "before insert on public.order_additional_pet_eligibility_override_events") })],
  ["A10a", "customer can self-resolve",
    (s) => ({ ...s, customerUi: s.customerUi + '\nawait supabase.rpc("admin_resolve_additional_pet_eligibility", {});\n' })],
  // Must mutate the CURRENT resolver definition (the $30 pricing migration) —
  // mutating the superseded one proves nothing now that the check follows the
  // latest definition.
  ["A11a", "override path hardcodes the amount",
    (s) => ({ ...s, priceMig: s.priceMig.replace(
      "then (v_price->>'amount_cents')::integer else 0 end", "then 2500 else 0 end") })],
  ["A11c", "Admin UI reintroduces a client price fallback",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/dollars\(pricing\.amount_cents\)/, "dollars(pricing.amount_cents ?? 2000)") })],
  ["A12c", "eligibility migration mutates orders",
    (s) => ({ ...s, eligibility: s.eligibility + "\nupdate public.orders set status='completed';\n" })],
  ["A13a", "Admin manual review made a dead disabled row again",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/          type="button"\n          role="menuitem"\n          onClick=\{openReview\}/, '          type="button"\n          role="menuitem"\n          aria-disabled="true"\n          onClick={undefined}') })],
  // Must be GLOBAL: the first occurrence is inside the file header comment,
  // which stripComments removes — a non-global replace mutates only the prose
  // and leaves the rendered label intact (the control would pass silently).
  ["A13c", "Admin told to contact support",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/Review Additional Pet Eligibility/g, "Contact PawTenant Support") })],
  ["A13g", "dialog z-index sinks below the order modal",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/fixed inset-0 z-\[120\]/, "fixed inset-0 z-[80]") })],
  ["A13h", "dialog rendered inside the dropdown again",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/createPortal\(/g, "React.Fragment(") })],
  ["A13e", "resolution enabled on a locked order",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(/disabled=\{submitting \|\| loading \|\| !!lock\?\.locked\}/g, "disabled={submitting}") })],
  ["A14a", "owner-approved customer copy removed",
    (s) => ({ ...s, customerUi: s.customerUi.replace(/We need to review this order before another pet can be added/g, "Adding another pet requires a manual review") })],
  ["G1",  "current price reverted to 2000",
    (s) => ({ ...s, priceMig: s.priceMig.replace("'v2_3000', 3000, 'usd'", "'v2_3000', 2000, 'usd'") })],
  ["G3",  "resume uses today's price instead of the row's",
    (s) => ({ ...s, priceMig: s.priceMig.replace("'amount_cents', v_active.amount_cents",
                                                 "'amount_cents', (v_price->>'amount_cents')::integer") })],
  ["G5",  "migration mass-reprices existing requests",
    (s) => ({ ...s, priceMig: s.priceMig
      + "\nupdate public.order_additional_pet_requests set amount_cents = 3000;\n" })],
  ["G6",  "pricing_version made mutable",
    (s) => ({ ...s, priceMig: s.priceMig.replace(
      "or new.pricing_version is distinct from old.pricing_version", "or false") })],
  ["G7",  "version/amount agreement check removed",
    (s) => ({ ...s, priceMig: s.priceMig.replace("new.amount_cents <> v_expected", "false") })],
  ["G9",  "create stops stamping the quoted version",
    (s) => ({ ...s, createFn: s.createFn.replace("pricing_version: pricingVersion,", "") })],
  ["G12", "customer grandfather notice stops reading the server flag",
    (s) => ({ ...s, customerUi: s.customerUi.replace("pricing?.grandfathered", "false") })],
  ["G13", "UI hardcodes a price label",
    (s) => ({ ...s, adminMenu: s.adminMenu.replace(
      "const EMPTY_PET", 'const LABEL = "$30.00";\nconst EMPTY_PET') })],
  ["C1", "pet name restored as the card heading",
    (s) => ({ ...s, customerUi: s.customerUi.replace("{cardState.title}", '{activeRequest.new_pet?.name || "Additional pet"}') })],
  ["C2", "pet name detail removed",
    (s) => ({ ...s, customerUi: s.customerUi.replace("Pet:</span>", "</span>") })],
  ["C4", "badge decoupled from the mapper",
    (s) => ({ ...s, customerUi: s.customerUi.replace("<StatusChip status={cardState.badgeStatus} />", "<StatusChip status={activeRequest.status} />") })],
  ["C5", "awaiting-payment branch stops checking paid_at",
    (s) => ({ ...s, customerUi: s.customerUi.replace("if (!paid && AWAITING_PAYMENT.has(s))", "if (AWAITING_PAYMENT.has(s))") })],
  ["C7", "QA fixture name hardcoded",
    (s) => ({ ...s, customerUi: s.customerUi.replace(
      "const MAX_PETS = 3;", 'const DEMO = "NewThirty";\nconst MAX_PETS = 3;') })],
  ["C8", "grandfather notice leaks past payment",
    (s) => ({ ...s, customerUi: s.customerUi.replace(' && !activeRequest.paid_at', '') })],
  ["R1", "race idempotency guard removed",
    (s) => ({ ...s, shared: s.shared.replace('if (reqRow.status === "refund_pending")', "if (false)") })],
  ["R2", "idempotency guard moved after the exception writes",
    (s) => ({ ...s, shared: s.shared.replace(
      'if (reqRow.status === "refund_pending") {', 'if (false) {') })],
  ["R3", "race branch starts writing paid_at",
    (s) => ({ ...s, shared: s.shared.replace('status: "refund_pending",', 'status: "refund_pending", paid_at: new Date().toISOString(),') })],
  ["R4", "race state shown to the customer as success",
    (s) => ({ ...s, customerUi: s.customerUi.replace(
      "could not be added because your evaluation was already completed",
      "has been added") })],
  ["A15b", "override table opened to authenticated writes",
    (s) => ({ ...s, eligibility: s.eligibility + "\ngrant insert on public.order_additional_pet_eligibility_overrides to authenticated;\n" })],
  ["A15e", "repair opened to any caller",
    (s) => ({ ...s, eligibility: s.eligibility.replace(/if auth\.uid\(\) is not null and not public\.is_admin_staff\(\) then/, "if false then") })],
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

const NAME = "check-additional-pet-automatic-eligibility";

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
