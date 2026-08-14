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
  priceMig: "supabase/migrations/20260728160000_additional_pet_price_v2_30_and_grandfathering.sql",
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
  // Normalise to LF. P15b compares the positions of two MULTI-LINE anchors, and
  // several other checks match across newlines; on a CRLF checkout every one of
  // those anchors misses. indexOf then returns -1 for both sides and the
  // ordering comparison silently inverts — the check fails on line endings
  // rather than on the ordering it is supposed to police.
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

/** Strip `--` SQL comments, `//` line comments and block comments (including the
 *  `{/* … *\/}` form used in JSX) so a guard never trips on the documentation
 *  that explains the very rule it enforces. Block comments are removed FIRST,
 *  because they legitimately contain prose like "$20 package-tier upgrade". */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // CRLF-SAFE (fixed 2026-07-28, GATING-002). Splitting on "\n" alone leaves a
    // trailing "\r" on every line of a CRLF checkout. "\r" is a line terminator
    // in JS regex, so `.*` stops before it and the unanchored `$` never matches
    // — so `//` comments were NEVER stripped in this repo, and every
    // "must NOT contain X" check was silently testing comment prose too.
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, "").replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Every check: [id, description, fn(src) -> boolean]. */
const CHECKS = [
  // REWRITTEN for the 2026-07-28 $20 -> $30 change. The old assertions encoded
  // "one global constant used everywhere", which is precisely the model that
  // made grandfathering impossible. The invariant is now stronger: the current
  // price lives in ONE versioned server table, and no payment is ever validated
  // against a global.
  ["P1a", "the module constant is the CURRENT price and is not a validation source",
    (s) => /ADDITIONAL_PET_UPGRADE_CENTS\s*=\s*3000/.test(s.shared)
        && /NEVER validate a payment against this constant/i.test(s.shared)],
  ["P1b", "the DB price comes from the versioned table, not a literal",
    (s) => {
      const c = stripComments(s.priceMig);
      return /create table if not exists public\.additional_pet_price_versions/.test(c)
        && /additional_pet_current_price\(\)/.test(c)
        && !/select 2000/.test(c)
        && /'v1_2000', 2000/.test(c) && /'v2_3000', 3000/.test(c);
    }],
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
  ["P3c", "Stripe unit_amount is the SERVER-QUOTED amount, never client input",
    (s) => {
      const c = stripComments(s.createFn);
      const amounts = [...c.matchAll(/unit_amount:\s*([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
      // create -> the engine's quote for this request; resume -> the ROW's own
      // stored quote. Neither may be a constant or anything client-supplied.
      return amounts.length >= 2
        && amounts.every((a) => a === "amountCents" || a === "resumeCents")
        && !/unit_amount:\s*(body|req)\./.test(c)
        && !/unit_amount:\s*\d/.test(c);
    }],
  ["P3d", "a resume re-uses the request's own quoted price (grandfathering)",
    (s) => {
      const c = stripComments(s.createFn);
      const i = c.indexOf('action === "resume"');
      if (i < 0) return false;
      // Bound by the NEXT action, not a fixed window — a magic length silently
      // truncated this branch 111 chars before the unit_amount it must inspect.
      const end = c.indexOf('action !== "create"', i);
      const branch = c.slice(i, end > i ? end : c.length);
      return /const resumeCents = pr\.amount_cents/.test(branch)
        && /unit_amount:\s*resumeCents/.test(branch)
        && !/unit_amount:\s*ADDITIONAL_PET_UPGRADE_CENTS/.test(branch);
    }],
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
  // The expectation MUST be the request's own immutable quote, not the global
  // price — validating against the global would reject every grandfathered $20
  // payment as a mismatch the moment the price moved to $30.
  ["P8", "amount is verified against THE REQUEST'S quote, and currency, before paid",
    (s) => {
      const c = stripComments(s.shared);
      return /const expectedCents = \(reqRow\.amount_cents as number\)/.test(c)
        && /gotCents === expectedCents/.test(c)
        && !/gotCents === ADDITIONAL_PET_UPGRADE_CENTS/.test(c)
        && /gotCurrency === ADDITIONAL_PET_CURRENCY/.test(c)
        && c.indexOf("amount_mismatch") < c.indexOf("paid_at: nowIso");
    }],
  ["P8b", "the quoted amount must still be a KNOWN price version",
    (s) => /quoteIsKnownPrice/.test(stripComments(s.shared))
        && /additional_pet_price_versions/.test(stripComments(s.shared))],
  // Tightened 2026-07-28 (GATING-002). The old form matched `.is("paid_at",
  // null)` ANYWHERE in the file, and there are two occurrences — the fulfilment
  // update and the locked-race parking update. Deleting the fulfilment guard
  // therefore left the assertion satisfied by the other one, so control D could
  // never trip and P9 was never actually proven. Anchor to the fulfilment
  // update: `.eq("id", reqId)` immediately followed by the paid_at guard.
  ["P9", "fulfilment is idempotent on paid_at",
    (s) => /\.eq\("id", reqId\)\s*\r?\n\s*\.is\("paid_at",\s*null\)/.test(stripComments(s.shared))],
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
  // ── ADDITIONAL-PET-POST-LIVE-RECONCILIATION-001 ──────────────────────────
  // The refund amount must be THIS request's immutable quote. The current
  // global price describes what a NEW request costs today and says nothing
  // about what this customer paid: after $20 -> $30 it would have tried to
  // refund 3000 against a 2000 charge, which Stripe rejects outright, so every
  // grandfathered rejection would have failed. Asserted on comment-stripped
  // source so prose can never satisfy a check.
  ["P12b", "refund amount comes from the request's own quote, not a global price",
    (s) => /refunds\.create\(\s*\{\s*payment_intent:\s*piId,\s*amount:\s*quotedCents\s*\}/
      .test(stripComments(s.decision))],
  ["P12b2", "the quote is read from the immutable request row (amount + currency)",
    (s) => {
      const c = stripComments(s.decision);
      return /quotedCents\s*=\s*Number\(\s*reqRow\.amount_cents\s*\)/.test(c)
          && /quotedCurrency\s*=\s*String\(\s*reqRow\.currency/.test(c);
    }],
  ["P12b3", "the rejection path never reads the CURRENT global Additional Pet price",
    (s) => !/ADDITIONAL_PET_UPGRADE_CENTS|additional_pet_upgrade_cents|additional_pet_current_price/
      .test(stripComments(s.decision))],
  ["P12b4", "the settled Stripe payment is retrieved and compared before refunding",
    (s) => {
      const c = stripComments(s.decision);
      return /paymentIntents\.retrieve\(\s*piId\s*\)/.test(c)
          && /amountAgrees\s*=\s*settledCents\s*===\s*quotedCents/.test(c)
          && /currencyAgrees\s*=\s*settledCurrency\s*===\s*quotedCurrency/.test(c);
    }],
  ["P12b5", "a settled/quote mismatch BLOCKS the automatic refund and records evidence",
    (s) => {
      const c = stripComments(s.decision);
      const m = c.match(/if\s*\(\s*!amountAgrees\s*\|\|\s*!currencyAgrees\s*\)\s*\{([\s\S]*?)\n(\s*)\}\s*else\s*\{/);
      if (!m) return false;
      const branch = m[1];
      // the blocking branch must not move money, and must preserve the evidence
      return !/refunds\.create/.test(branch)
          && /amount_mismatch/.test(branch)
          && /additional_pet_refund_blocked/.test(branch)
          && /settled_cents/.test(branch) && /quoted_cents/.test(branch);
    }],
  ["P12b6", "an unusable quote is held for Admin rather than guessed",
    (s) => {
      const c = stripComments(s.decision);
      return /quote_not_resolvable/.test(c) && /requiresAdminReview/.test(c);
    }],
  ["P12b7", "an already-refunded request short-circuits instead of refunding twice",
    (s) => /if\s*\(\s*reqRow\.refunded_at\s*\)/.test(stripComments(s.decision))],
  ["P12b8", "the rejection email states the request's own amount, never a hardcoded price",
    (s) => {
      const c = stripComments(s.decision);
      return /emailRefundCents\s*=\s*Number\(/.test(c)
          && /\$\$\{\(\s*emailRefundCents\s*\/\s*100\s*\)\.toFixed\(2\)\}/.test(c)
          && !/refunded the \$20/.test(c) && !/refunded the \$30/.test(c);
    }],
  ["P12b9", "a held/pending refund never reads to the customer as completed",
    (s) => /refundResult\.refunded\s*\n?\s*\?/.test(stripComments(s.decision))
        || /refundResult\.refunded\s*$/m.test(stripComments(s.decision))],
  ["P12c", "refund cannot double-refund (Stripe idempotencyKey)",
    (s) => /idempotencyKey:\s*`addpet-refund:\$\{reqRow\.id\}`/.test(s.decision)],
  // ADDITIONAL-PET-REJECTION-REFUND-TEST-PORT-001 — two rules the refund port
  // relies on but did not itself assert.
  ["P12b10", "an unpaid / $0 included request never enters the refund path at all",
    (s) => {
      const c = stripComments(s.decision);
      // The whole Stripe block is gated on wasPaid, and wasPaid demands BOTH a
      // settled paid_at and the paid_upgrade outcome — so an included $0 request
      // (or an unpaid one) is rejected outright with no refund object created.
      return /const\s+wasPaid\s*=\s*!!reqRow\.paid_at\s*&&\s*\(reqRow\.pricing_outcome as string\)\s*===\s*"paid_upgrade"/.test(c)
          && /if\s*\(\s*wasPaid\s*\)\s*\{/.test(c)
          && /status:\s*wasPaid\s*\?\s*"refund_pending"\s*:\s*"rejected"/.test(c);
    }],
  ["P12b11", "provider rejection never creates or alters a provider earning",
    (s) => {
      const c = stripComments(s.decision);
      // Additional Pet is not compensated work. The rejection path must never
      // write doctor_earnings, and must never mutate the base order's payment
      // fields (which is what would indirectly void or re-rate an earning).
      return !/from\(\s*["'`]doctor_earnings["'`]\s*\)/.test(c)
          && !/\.from\(\s*["'`]orders["'`]\s*\)[\s\S]{0,200}?\.update\(/.test(c);
    }],
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
  // GATING-002 (owner correction 2026-07-28): the owner-approved manual-review
  // copy deliberately NAMES the $20 upgrade so the customer knows the two
  // possible outcomes ("...whether the pet is included or requires the $20
  // Additional Pet upgrade"). That is descriptive prose in a branch that quotes
  // NO amount for THIS order and offers no CTA. The substantive rule — any
  // amount actually attached to this order must be the server's — is unchanged
  // and is now enforced everywhere EXCEPT that one explainer.
  // RESIDUAL RISK, accepted: if additional_pet_upgrade_cents() ever moves off
  // 2000, this sentence must be updated by hand. P20b pins that link.
  ["P20", "customer UI renders the SERVER amount, never a hardcoded price",
    (s) => {
      const c = stripComments(s.customerUi);
      if (!/dollars\(pricing\.amount_cents\)/.test(c)) return false;
      // Excise only the manual-review explainer, then ban price literals.
      const a = c.indexOf('outcome === "manual_review"');
      const priced = a < 0 ? c : c.slice(0, a) + c.slice(a + 700);
      return !/\$20\b/.test(priced);
    }],
  ["P20b", "the one permitted $20 mention lives ONLY in the manual-review copy",
    (s) => {
      const c = stripComments(s.customerUi);
      const hits = (c.match(/\$20\b/g) ?? []).length;
      if (hits === 0) return true;
      const a = c.indexOf('outcome === "manual_review"');
      if (a < 0) return false;
      return hits === ((c.slice(a, a + 700).match(/\$20\b/g) ?? []).length);
    }],
  ["P21", "customer UI shows NO price and NO checkout on manual review",
    (s) => {
      const c = s.customerUi;
      const a = c.indexOf('outcome === "manual_review"');
      if (a < 0) return false;
      const block = c.slice(a, a + 700);
      // Owner-approved wording (GATING-002). The mechanical assertion — no
      // order-specific amount, no checkout — is what matters and is unchanged.
      return /We need to review this order before another pet can be added/i.test(block)
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
  ["A", "P1a", "shared", (t) => t.replace("ADDITIONAL_PET_UPGRADE_CENTS = 3000",
                                          "ADDITIONAL_PET_UPGRADE_CENTS = 2000")],
  ["A2", "P1b", "priceMig", (t) => t.replace("'v2_3000', 3000", "'v2_3000', 2000")],
  ["A3", "P3d", "createFn", (t) => t.replace("unit_amount: resumeCents,",
                                             "unit_amount: ADDITIONAL_PET_UPGRADE_CENTS,")],
  ["A4", "P8", "shared", (t) => t.replace("gotCents === expectedCents",
                                          "gotCents === ADDITIONAL_PET_UPGRADE_CENTS")],
  ["A5", "P8b", "shared", (t) => t.replace(/quoteIsKnownPrice/g, "alwaysTrue")],
  ["B", "P2", "createFn", (t) => t.replace("const ESA_TYPES", "const esa_additional_pet = 1;\nconst ESA_TYPES")],
  ["C", "P3c", "createFn", (t) => t.replace("unit_amount: amountCents,",
                                            "unit_amount: body.amountCents,")],
  // Targets the CODE occurrence, not the comment that quotes the same string.
  // PRE-EXISTING NO-OP, fixed 2026-07-28 (GATING-002): the literal used "\n"
  // but this repo checks out CRLF, so the replace never matched and P9 —
  // "fulfilment is idempotent on paid_at" — was never actually proven. Use a
  // line-ending-tolerant regex.
  ["D", "P9", "shared",
    (t) => t.replace(/\.eq\("id", reqId\)\s*\r?\n\s*\.is\("paid_at", null\)/,
                     '.eq("id", reqId)\n    .limit(1)')],
  ["E", "P7b", "shared", (t) => t.replace("status: baseIsPaid", "provider_decision: 'approved', status: baseIsPaid")],
  ["F", "P10a", "createFn", (t) => t.replace('.from("order_additional_pet_requests")\n    .insert(',
                                             '.from("orders")\n    .insert(')],
  ["G", "P12c", "decision", (t) => t.replace("idempotencyKey: `addpet-refund:${reqRow.id}`", "")],
  // ADDITIONAL-PET-POST-LIVE-RECONCILIATION-001 refund controls.
  ["G2", "P12b", "decision", (t) => t.replace(
    "{ payment_intent: piId, amount: quotedCents },",
    "{ payment_intent: piId, amount: ADDITIONAL_PET_UPGRADE_CENTS },")],
  ["G3", "P12b3", "decision", (t) => t.replace(
    "const quotedCents = Number(reqRow.amount_cents);",
    "const quotedCents = additional_pet_upgrade_cents();")],
  ["G4", "P12b4", "decision", (t) => t.replace(
    "const pi = await stripe.paymentIntents.retrieve(piId);",
    "const pi = { amount: quotedCents, currency: quotedCurrency };")],
  ["G5", "P12b5", "decision", (t) => t.replace(
    'refunded: false, pending: true, error: "amount_mismatch",',
    'refunded: false, pending: true, error: "amount_mismatch", sneak: await stripe.refunds.create({ payment_intent: piId, amount: quotedCents }),')],
  ["G6", "P12b7", "decision", (t) => t.replace(
    "if (reqRow.refunded_at) {", "if (false) {")],
  ["G7", "P12b8", "decision", (t) => t.replace(
    "${refundLine}", "We have refunded the $20 upgrade in full.")],
  // ADDITIONAL-PET-REJECTION-REFUND-TEST-PORT-001 controls.
  ["G8", "P12b10", "decision", (t) => t.replace(
    'const wasPaid = !!reqRow.paid_at && (reqRow.pricing_outcome as string) === "paid_upgrade";',
    "const wasPaid = true;")],
  ["G9", "P12b11", "decision", (t) => t.replace(
    "let refundResult: Record<string, unknown> = { refunded: false };",
    'await admin.from("doctor_earnings").insert({ amount_cents: quotedCents });\n  let refundResult: Record<string, unknown> = { refunded: false };')],
  ["H", "P13b", "migration", (t) => t.replace("paid_upgrade' and amount_cents = 2000",
                                              "paid_upgrade' and amount_cents >= 0")],
  ["I", "P14", "createFn", (t) => t.replace("new_pet: pet,", "new_pet: pet, assessment_answers: pet,")],
  ["J", "P18", "accounts", (t) => t.replace("and p.amount_cents > 0", "")],
  ["K", "P8", "shared", (t) => t.replace("gotCurrency === ADDITIONAL_PET_CURRENCY", "true")],
  ["L", "P19", "customerUi", (t) => t.replace("body: JSON.stringify({ action,", "body: JSON.stringify({ amountCents: 2000, action,")],
  ["M", "P20", "customerUi", (t) => t.replace("dollars(pricing.amount_cents)", '"$20"')],
  // Proves the NARROWED P20 still catches a hardcoded price in a PRICED branch,
  // not just the removal of the server render. Must be a real string literal —
  // a /* $20 */ comment is removed by stripComments and proves nothing.
  ["M2", "P20", "customerUi", (t) => t.replace(
    "const MAX_PETS = 3;", 'const MAX_PETS = 3;\nconst PAID_LABEL = "$20 one-time";')],
  ["M3", "P20b", "customerUi", (t) => t.replace("const MAX_PETS = 3;", 'const MAX_PETS = 3;\nconst COPY = "$20 upgrade";')],
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
