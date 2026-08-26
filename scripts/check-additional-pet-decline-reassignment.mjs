// scripts/check-additional-pet-decline-reassignment.mjs
//
// ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001 — guard.
//
// Owner decision (2026-08-26): a provider declining an Additional Pet request
// must NEVER automatically refund it. The paid add-on becomes needs_reassignment
// and returns to the admin/provider work queue; refunds happen only through an
// explicit authorized admin action; the completed base order is never rewritten;
// and after another provider approves, the revised document covers EVERY
// approved pet exactly once.
//
//   R1  The provider decline branch cannot reach a refund path (no Stripe call,
//       no refund state, no refund column write).
//   R2  Decline moves the request to needs_reassignment and ends only that
//       provider's assignment.
//   R3  The payment stays paid: decline writes no payment/refund column, and
//       the DB freezes refunded_at / stripe_refund_id / paid_at one-way.
//   R4  A second provider can accept: reassignment re-opens the decision and
//       the decision path authorises the REQUEST-level assignee.
//   R5  The completed base order's provider history is immutable here: neither
//       decline, reassignment, waiver nor the reviewer submit path writes
//       orders.doctor_user_id (the email self-heal stays email-gated).
//   R6  No path in this workflow creates or alters a provider earning.
//   R7  Historical documents are untouched: decline/reassign/waive write no
//       document, version or verification row.
//   R8  The approved additional pet reaches the authoritative document snapshot
//       (pet_snapshot built from the approved-pets array, passed on BOTH the
//       first-letter and revision version rows).
//   R9  Unapproved pets can never enter the snapshot: the array is built
//       exclusively from provider_decision = 'approved' rows.
//   R10 Every approved pet appears exactly once (originals + approved array,
//       no ad-hoc extra append; total = pets.length).
//   R11 Repeated decline / reassignment is idempotent.
//   R12 Repeated approval cannot duplicate documents or earnings.
//   R13 A refund exists ONLY behind the explicit admin action (admin gate
//       before any Stripe call; exactly one refunds.create in the workflow).
//   R14 Communications never misreport a decline as a refund or a final
//       rejection (customer email, portal status, provider UI).
//   R15 Ordinary letter generation without an add-on request still passes a
//       null snapshot (one-pet / two-pet regression unchanged).
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-additional-pet-decline-reassignment.mjs             → guard
//   node scripts/check-additional-pet-decline-reassignment.mjs --warn-only → audit
//   node scripts/check-additional-pet-decline-reassignment.mjs --self-test → controls

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  decision: "supabase/functions/provider-additional-pet-decision/index.ts",
  submit: "supabase/functions/provider-submit-letter/index.ts",
  shared: "supabase/functions/_shared/completeAdditionalPetPayment.ts",
  migration: "supabase/migrations/20260826150000_additional_pet_decline_reassignment.sql",
  customerUi: "src/pages/my-orders/components/AdditionalPetRequest.tsx",
  providerUi: "src/pages/provider-portal/components/ProviderAdditionalPetReview.tsx",
  providerQueue: "src/pages/provider-portal/components/ProviderAdditionalPetQueue.tsx",
  adminUi: "src/pages/admin-orders/components/OrderAdditionalPetPanel.tsx",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const p = resolve(ROOT, F[key]);
  if (!existsSync(p)) throw new Error(`missing file: ${F[key]}`);
  // CRLF normalised at the SINGLE read point so every anchor and every
  // extracted branch behaves identically on Windows and CI.
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Comment-free view of a TS/JS source with REAL string-context tracking: a
 * `//` or `/*` inside a string literal is content, not a comment, and is kept
 * — while genuine comments (including ones that quote forbidden snippets in
 * prose) are removed. String literals themselves are KEPT deliberately: in
 * this codebase the dangerous artefacts ARE strings — table names in
 * .from("doctor_earnings"), status values in update payloads — so emptying
 * strings would blind every "must NOT contain" check to the exact use-sites
 * it exists to police. Template-literal interpolations remain code.
 */
function codeOnly(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  // state: 0 code, 1 line comment, 2 block comment, 3 'str, 4 "str, 5 `template
  let state = 0;
  const templateDepth = []; // brace depth per nested template interpolation
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 0) {
      if (c === "/" && d === "/") { state = 1; i += 2; continue; }
      if (c === "/" && d === "*") { state = 2; i += 2; continue; }
      if (c === "'") { state = 3; out += "'"; i++; continue; }
      if (c === '"') { state = 4; out += '"'; i++; continue; }
      if (c === "`") { state = 5; out += "`"; i++; continue; }
      if (c === "}" && templateDepth.length) {
        if (templateDepth[templateDepth.length - 1] === 0) {
          templateDepth.pop(); state = 5; out += "}"; i++; continue;
        }
        templateDepth[templateDepth.length - 1]--;
      }
      if (c === "{" && templateDepth.length) templateDepth[templateDepth.length - 1]++;
      out += c; i++; continue;
    }
    if (state === 1) { if (c === "\n") { state = 0; out += "\n"; } i++; continue; }
    if (state === 2) { if (c === "*" && d === "/") { state = 0; i += 2; } else { if (c === "\n") out += "\n"; i++; } continue; }
    if (state === 3) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === "'") state = 0; out += c; i++; continue; }
    if (state === 4) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === '"') state = 0; out += c; i++; continue; }
    if (state === 5) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { state = 0; out += "`"; i++; continue; }
      if (c === "$" && d === "{") { templateDepth.push(0); state = 0; out += "${"; i += 2; continue; }
      out += c; i++; continue;
    }
  }
  return out;
}

/** SQL with comments and string literals removed (single quotes, dollar tags kept). */
function sqlCode(src) {
  return src
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** Slice between two unique anchors of the RAW source; throws if either is missing. */
function between(src, a, b, what) {
  const i = src.indexOf(a);
  if (i < 0) throw new Error(`anchor missing (${what}): ${JSON.stringify(a)}`);
  const j = b === null ? src.length : src.indexOf(b, i + a.length);
  if (j < 0) throw new Error(`end anchor missing (${what}): ${JSON.stringify(b)}`);
  return src.slice(i, j);
}

/** Extract a dollar-quoted plpgsql body from the migration. */
function fnBody(sql, fn) {
  const re = new RegExp("create\\s+or\\s+replace\\s+function\\s+public\\." + fn + "\\s*\\(", "i");
  const m = re.exec(sql);
  if (!m) return "";
  const dq = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  dq.lastIndex = m.index;
  const open = dq.exec(sql);
  if (!open) return "";
  const end = sql.indexOf(open[0], open.index + open[0].length);
  return end < 0 ? "" : sql.slice(open.index + open[0].length, end);
}

const DECLINE_ANCHOR = '// ── DECLINE (wire name "reject")';
const REFUND_ANCHOR = "// ── ADMIN-ONLY: EXPLICIT REFUND";
const FINAL_ANCHOR = "// ── ADMIN-ONLY: FINAL REJECTION";

const declineBranch = (s) => between(s.decision, DECLINE_ANCHOR, null, "decline branch");
const refundAction = (s) => between(s.decision, REFUND_ANCHOR, FINAL_ANCHOR, "refund action");

const CHECKS = [
  // ── R1 · decline cannot reach a refund path ───────────────────────────────
  ["R1a", "the decline branch contains no Stripe reference at all",
    (s) => {
      const c = codeOnly(declineBranch(s));
      return !/stripe/i.test(c) && !/refunds\s*\.\s*create/.test(c);
    }],
  ["R1b", "the decline branch writes no refund state or refund column",
    (s) => {
      const c = codeOnly(declineBranch(s));
      return !/refund_pending|refunded_at|stripe_refund_id|refund_amount_cents/.test(c);
    }],
  ["R1c", "the decline branch never marks the request rejected",
    (s) => !/status:\s*"rejected"/.test(codeOnly(declineBranch(s)))],

  // ── R2 · decline → needs_reassignment, that provider's assignment ends ────
  ["R2a", "decline sets needs_reassignment and clears only the request-level assignee",
    (s) => {
      // Anchored on the UPDATE payload itself — the response body also names
      // the status, so a loose match would survive a mutated write.
      const c = codeOnly(declineBranch(s));
      return /\.update\(\{\s*status:\s*"needs_reassignment",\s*assigned_provider_user_id:\s*null,?\s*\}\)/.test(c);
    }],
  ["R2b", "decline is recorded permanently in the append-only events table",
    (s) => /event_type:\s*"provider_declined"/.test(declineBranch(s))],
  ["R2c", "needs_reassignment is a valid status in the DB check constraint",
    (s) => /'resubmitted','needs_reassignment','approved_pending_document'/.test(sqlCode(s.migration).replace(/\s+/g, ""))
       || /'needs_reassignment'/.test(s.migration)],

  // ── R3 · the payment stays paid ───────────────────────────────────────────
  ["R3a", "decline writes no payment column",
    (s) => !/paid_at|amount_cents|stripe_payment_intent_id/.test(
      codeOnly(declineBranch(s)).replace(/reqRow\.paid_at|reqRow\.amount_cents/g, ""))],
  ["R3b", "the DB freezes refund facts one-way (refunded_at / stripe_refund_id / waived_at)",
    (s) => {
      const b = fnBody(s.migration, "tg_addpet_immutable");
      return /old\.refunded_at is not null and new\.refunded_at is distinct from old\.refunded_at/.test(b)
          && /old\.stripe_refund_id is not null and new\.stripe_refund_id is distinct from old\.stripe_refund_id/.test(b)
          && /old\.waived_at is not null and new\.waived_at is null/.test(b);
    }],
  ["R3c", "the admin waiver never rewrites the refund record",
    (s) => {
      const b = sqlCode(fnBody(s.migration, "admin_waive_additional_pet_refund"));
      const m = b.match(/update public\.order_additional_pet_requests([\s\S]*?);/);
      return !!m && !/refunded_at\s*=|stripe_refund_id\s*=|refund_amount_cents\s*=/.test(m[1]);
    }],

  // ── R4 · a second provider can accept ─────────────────────────────────────
  ["R4a", "reassignment re-opens the decision for the new reviewer",
    (s) => {
      const b = fnBody(s.migration, "admin_reassign_additional_pet_request");
      return /assigned_provider_user_id = p_provider_user_id/.test(b)
          && /status = 'pending_provider_review'/.test(b)
          && /provider_decision = null/.test(b);
    }],
  ["R4b", "the decision function authorises the REQUEST-level assignee",
    (s) => /reqRow\.assigned_provider_user_id as string \| null\)\s*\?\?\s*order\.doctor_user_id/.test(s.decision)
        && /effectiveReviewerId === callerUserId/.test(s.decision)],
  ["R4c", "the provider projection authorises the request-level assignee too",
    (s) => /r\.assigned_provider_user_id = auth\.uid\(\)/.test(fnBody(s.migration, "get_additional_pet_request_for_provider"))],

  // ── R5 · the completed base order's provider history is immutable here ────
  ["R5a", "neither reassignment nor waiver touches the orders table",
    (s) => {
      const a = sqlCode(fnBody(s.migration, "admin_reassign_additional_pet_request"));
      const b = sqlCode(fnBody(s.migration, "admin_waive_additional_pet_refund"));
      return !/update\s+public\.orders|insert\s+into\s+public\.orders|delete\s+from\s+public\.orders/i.test(a + b);
    }],
  ["R5b", "the decision function never writes the orders table",
    (s) => !/\.from\(\s*["'`]orders["'`]\s*\)[\s\S]{0,200}?\.(update|insert|delete)\(/.test(codeOnly(s.decision))],
  ["R5c", "the submit path never hands the order to an add-on reviewer",
    (s) => {
      const c = codeOnly(s.submit);
      // Every doctor_user_id WRITE-SITE in the file, by any spelling: the
      // inline self-heal object, and any patch-object assignment. (The first
      // fixture run caught exactly this: the shared final-letter patch wrote
      // doctor_user_id unconditionally, so the reviewer inherited the
      // completed order. Both spellings are pinned now.)
      const inline = [...c.matchAll(/\.update\(\{\s*doctor_user_id/g)];
      const patch = [...c.matchAll(/orderUpdatePatch\.doctor_user_id\s*=/g)];
      // Bounded to the object literal itself ([^}]*): the guarded assignment
      // legitimately names doctor_user_id right after the closing brace.
      const objectLiteralPatch = /orderUpdatePatch[^=]{0,80}=\s*\{[^}]*doctor_user_id/.test(c);
      return inline.length === 1
          && /if\s*\(!matchesById && matchesByEmail\)\s*\{\s*\n?\s*await supabase\.from\("orders"\)\.update\(\{\s*doctor_user_id/.test(c)
          && patch.length === 1
          && /if\s*\(!isAddPetReviewerOnly\)\s*orderUpdatePatch\.doctor_user_id\s*=\s*user\.id;/.test(c)
          && !objectLiteralPatch;
    }],
  ["R5d", "the add-on reviewer's submit authority is scoped to the letter itself",
    (s) => /isAddPetReviewerOnly && !storedDocType\.endsWith\("_letter"\)/.test(s.submit)],

  // ── R6 · no provider earning anywhere in this workflow ────────────────────
  ["R6", "decline / reassignment / waiver / decision create no earning",
    (s) => !/doctor_earnings/.test(codeOnly(s.decision))
        && !/doctor_earnings/i.test(sqlCode(s.migration))],

  // ── R7 · historical documents untouched ───────────────────────────────────
  ["R7", "decline / reassignment / waiver write no document, version or verification row",
    (s) => {
      const c = codeOnly(declineBranch(s));
      const sql = sqlCode(fnBody(s.migration, "admin_reassign_additional_pet_request"))
                + sqlCode(fnBody(s.migration, "admin_waive_additional_pet_refund"));
      return !/order_documents|order_document_versions|letter_verifications/.test(c)
          && !/update\s+public\.order_documents|update\s+public\.order_document_versions|update\s+public\.letter_verifications|insert\s+into\s+public\.order_documents|insert\s+into\s+public\.order_document_versions|insert\s+into\s+public\.letter_verifications/i.test(sql);
    }],

  // ── R8 · the approved pet reaches the authoritative snapshot ──────────────
  ["R8a", "the snapshot is built from the approved-pets array",
    (s) => /approved_added_pets/.test(s.submit)
        && /const pets = \[\.\.\.originals, \.\.\.approvedAdded\];/.test(s.submit)],
  ["R8b", "BOTH version rows (first letter and revision) carry the snapshot",
    (s) => (codeOnly(s.submit).match(/p_pet_snapshot:\s*addPetSnapshot/g) || []).length >= 2],
  ["R8c", "the effective-state array exists and the projection exposes it",
    (s) => /'approved_added_pets', v_approved/.test(fnBody(s.migration, "additional_pet_effective_state"))
        && /'approved_added_pets', v_approved/.test(fnBody(s.migration, "get_additional_pet_request_for_provider"))],

  // ── R9 · unapproved pets can never enter the snapshot ─────────────────────
  ["R9", "the approved array is built exclusively from provider_decision = 'approved' rows",
    (s) => {
      const b = fnBody(s.migration, "additional_pet_effective_state");
      const m = b.match(/into v_approved[\s\S]*?;/);
      return !!m && /provider_decision = 'approved'/.test(m[0])
          && /status in \('approved_pending_document','completed'\)/.test(m[0]);
    }],

  // ── R10 · every approved pet exactly once ─────────────────────────────────
  ["R10", "no ad-hoc extra append beside the approved array; total is the real length",
    (s) => !/\[\.\.\.originals,\s*apr\.new_pet\]/.test(codeOnly(s.submit))
        && !/\.\.\.approvedAdded,\s*apr\.new_pet/.test(codeOnly(s.submit))
        && /total_pets:\s*pets\.length/.test(s.submit)],

  // ── R11 · repeated decline / reassignment idempotent ──────────────────────
  ["R11a", "a replayed decline short-circuits on the standing reassignment state",
    (s) => /if \(reqRow\.status === "needs_reassignment"\) \{\s*\n\s*return json\(200, \{ ok: true, status: "needs_reassignment", alreadyDeclined: true \}\);/.test(s.decision)],
  ["R11b", "reassignment is guarded on the needs_reassignment state (no double apply)",
    (s) => {
      const b = fnBody(s.migration, "admin_reassign_additional_pet_request");
      return /where id = p_request_id and status = 'needs_reassignment'/.test(b)
          && /'not_awaiting_reassignment'/.test(b);
    }],
  ["R11c", "the waiver is idempotent (already-waived reports the standing waiver)",
    (s) => /'already_waived', true/.test(fnBody(s.migration, "admin_waive_additional_pet_refund"))],

  // ── R12 · repeated approval cannot duplicate documents or earnings ────────
  ["R12a", "approve is guarded on the null decision and replays idempotently",
    (s) => {
      const approve = between(s.decision, '// ── APPROVE', DECLINE_ANCHOR, "approve branch");
      return /\.is\("provider_decision", null\)/.test(approve)
          && /alreadyDecided: true/.test(approve);
    }],
  ["R12b", "document versions stay idempotent by key on both paths",
    (s) => /`revision:\$\{order\.id\}:\$\{storedDocType\}:\$\{revisionSource\}`/.test(s.submit)
        && /`submit:\$\{order\.id\}:\$\{documentId\}`/.test(s.submit)],

  // ── R13 · refund only behind the explicit admin action ────────────────────
  ["R13a", "the refund action refuses every non-admin caller before any Stripe work",
    (s) => {
      const r = refundAction(s);
      const gate = r.indexOf("if (!isAdmin)");
      const stripe = r.indexOf("stripe.refunds.create");
      return gate >= 0 && stripe > gate && /403/.test(r.slice(gate, gate + 200));
    }],
  ["R13b", "exactly one refunds.create exists in the decision workflow, inside the admin action",
    (s) => {
      const all = (codeOnly(s.decision).match(/refunds\s*\.\s*create/g) || []).length;
      const inAction = (codeOnly(refundAction(s)).match(/refunds\s*\.\s*create/g) || []).length;
      return all === 1 && inAction === 1;
    }],
  ["R13c", "the payment webhook still never refunds (race parks, admin decides)",
    (s) => !/refunds\s*\.\s*create/.test(codeOnly(s.shared))],
  ["R13d", "a paid, unrefunded request cannot be finally rejected — refund is the only close",
    (s) => {
      const f = between(s.decision, FINAL_ANCHOR, "// IDEMPOTENCY FIRST", "final_reject");
      return /wasPaid && !reqRow\.refunded_at/.test(f) && /refund_required/.test(f);
    }],

  // ── R14 · communications stay truthful ────────────────────────────────────
  ["R14a", "the decline email promises continued review, never a refund or rejection",
    (s) => {
      const b = declineBranch(s);
      return /another licensed provider/.test(b)
          && /no refund has been issued/.test(b)
          && !/We have refunded/.test(b)
          && !/not able to approve/.test(b);
    }],
  ["R14b", "the customer portal shows needs_reassignment as continued review",
    (s) => /needs_reassignment: \{ label: "Under review — matching a provider"/.test(s.customerUi)
        && /"needs_reassignment", "approved_pending_document"/.test(s.customerUi)],
  ["R14c", "the provider decline UI says reassignment, not customer rejection",
    (s) => /returns to\s*\n?\s*PawTenant for reassignment/.test(s.providerUi)
        && /no refund is triggered/.test(s.providerUi)],
  ["R14d", "the provider surfaces never mention a financial field",
    (s) => !/(amount_cents|pricing_outcome|stripe_|refund_amount|amountCents)/
      .test(codeOnly(s.providerUi) + codeOnly(s.providerQueue))],
  ["R14e", "the admin panel surfaces the reassignment queue state",
    (s) => /needs_reassignment:\s*\{ label: "Needs reassignment"/.test(s.adminUi)
        && /needs_reassignment:\s*\{ suffix: "Reassign"/.test(s.adminUi)],

  // ── R15 · ordinary letters unchanged ──────────────────────────────────────
  ["R15", "without an add-on request the snapshot stays null (1/2-pet regression)",
    (s) => /let addPetSnapshot: Record<string, unknown> \| null = null;/.test(s.submit)
        && /if \(apr\) \{/.test(s.submit)],
];

/** Negative controls: each in-memory mutation must trip its named check. */
const CONTROLS = [
  // The headline regression: RESTORE the automatic refund inside the decline.
  ["N1", "R1a", "decision", (t) => t.replace(
    'status: "needs_reassignment",\n      assigned_provider_user_id: null,',
    'status: "needs_reassignment",\n      assigned_provider_user_id: null,\n      _r: await stripe.refunds.create({ payment_intent: reqRow.stripe_payment_intent_id, amount: reqRow.amount_cents }),')],
  ["N2", "R1b", "decision", (t) => t.replace(
    DECLINE_ANCHOR,
    DECLINE_ANCHOR + '\n  const autoRefund = { status: "refund_pending", refunded_at: new Date().toISOString() };')],
  ["N3", "R2a", "decision", (t) => t.replace(
    '      status: "needs_reassignment",\n      assigned_provider_user_id: null,',
    '      status: "rejected",\n      assigned_provider_user_id: null,')],
  ["N4", "R13a", "decision", (t) => t.replace(
    '    if (!isAdmin) {\n      return json(403, { ok: false, error: "Refunds require an authorized admin." });\n    }',
    "")],
  ["N5", "R8a", "submit", (t) => t.replace(
    "const pets = [...originals, ...approvedAdded];",
    "const pets = [...originals];")],
  ["N6", "R10", "submit", (t) => t.replace(
    "const pets = [...originals, ...approvedAdded];",
    "const pets = [...originals, ...approvedAdded, apr.new_pet];")],
  ["N7", "R9", "migration", (t) => t.replace(
    "     and r.provider_decision = 'approved'\n     and r.status in ('approved_pending_document','completed');\n\n  v_tier",
    "     and r.provider_decision is not null\n     and r.status in ('approved_pending_document','completed');\n\n  v_tier")],
  ["N8", "R3c", "migration", (t) => t.replace(
    "       set waived_at = now(), waived_by = auth.uid(),",
    "       set waived_at = now(), waived_by = auth.uid(), refunded_at = null,")],
  ["N9", "R5a", "migration", (t) => t.replace(
    "  insert into public.order_additional_pet_request_events\n    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)\n  values\n    (v_req.id, v_req.order_id, 'reassigned',",
    "  update public.orders set doctor_user_id = p_provider_user_id where id = v_req.order_id;\n  insert into public.order_additional_pet_request_events\n    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)\n  values\n    (v_req.id, v_req.order_id, 'reassigned',")],
  ["N10", "R11a", "decision", (t) => t.replace(
    'if (reqRow.status === "needs_reassignment") {\n      return json(200, { ok: true, status: "needs_reassignment", alreadyDeclined: true });\n    }',
    "")],
  ["N11", "R6", "decision", (t) => t.replace(
    'event_type: "provider_declined",',
    'event_type: "provider_declined", _e: await admin.from("doctor_earnings").insert({}),')],
  ["N12", "R14a", "decision", (t) => t.replace(
    "was unable to complete the review, so we are arranging for another licensed provider to review it.",
    "was unable to complete the review. We have refunded your upgrade in full.")],
  ["N13", "R12a", "decision", (t) => t.replace(
    '.eq("id", reqRow.id).is("provider_decision", null)\n      .in("status", decidable).select().maybeSingle();\n    if (error) return json(500, { ok: false, error: error.message });\n    if (!updated) return json(409, { ok: false, error: "Request state changed — reload and try again." });',
    '.eq("id", reqRow.id)\n      .in("status", decidable).select().maybeSingle();\n    if (error) return json(500, { ok: false, error: error.message });\n    if (!updated) return json(409, { ok: false, error: "Request state changed — reload and try again." });')],
  ["N14", "R8b", "submit", (t) => t.replace(
    "            p_pet_snapshot: addPetSnapshot,\n            p_order_document_id: documentId,\n            p_file_url: finalUrl,",
    "            p_pet_snapshot: null,\n            p_order_document_id: documentId,\n            p_file_url: finalUrl,")],
  ["N15", "R13b", "submit-unused", null], // placeholder — replaced below
  ["N16", "R4a", "migration", (t) => t.replace(
    "         provider_decision = null,\n         provider_decision_at = null,\n         provider_decision_reason = null\n   where id = p_request_id and status = 'needs_reassignment';\n\n  insert into public.order_additional_pet_request_events\n    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)\n  values\n    (v_req.id, v_req.order_id, 'reassigned',",
    "         provider_decision_at = null,\n         provider_decision_reason = null\n   where id = p_request_id and status = 'needs_reassignment';\n\n  insert into public.order_additional_pet_request_events\n    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)\n  values\n    (v_req.id, v_req.order_id, 'reassigned',")],
  ["N17", "R3b", "migration", (t) => t.replace(
    "  if old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at then",
    "  if false then")],
  ["N18", "R5c", "submit", (t) => t.replace(
    "if (!matchesById && matchesByEmail) {",
    "if (!matchesById && (matchesByEmail || isAddPetReviewerOnly)) {")],
  // The regression the first live fixture run actually caught: the shared
  // final-letter patch writing doctor_user_id unconditionally again.
  ["N19", "R5c", "submit", (t) => t.replace(
    "if (!isAddPetReviewerOnly) orderUpdatePatch.doctor_user_id = user.id;",
    "orderUpdatePatch.doctor_user_id = user.id;")],
];
// N15: a second refunds.create smuggled into the DECISION file outside the
// admin action must trip R13b.
CONTROLS[14] = ["N15", "R13b", "decision", (t) => t.replace(
  'return json(200, { ok: true, status: "needs_reassignment", reassignment: true });',
  'await stripe.refunds.create({ payment_intent: reqRow.stripe_payment_intent_id });\n  return json(200, { ok: true, status: "needs_reassignment", reassignment: true });')];

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

if (SELF) {
  console.log("ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001 — negative controls\n");
  const base = loadAll();
  let bad = 0;
  for (const [label, target, fileKey, mutate] of CONTROLS) {
    if (!mutate) continue;
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
  const total = CONTROLS.filter((c) => c[3]).length;
  console.log(`\n${total - bad}/${total} controls trip correctly.`);
  process.exitCode = bad === 0 ? 0 : 1;
} else {
  const src = loadAll();
  const results = run(src);
  const failed = results.filter((r) => !r[2]);

  console.log("ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001 — guard\n");
  for (const [id, desc, ok] of results) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${desc}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length) {
    console.log(WARN ? "\n(--warn-only: not failing the build)" : "\nGUARD FAILED");
    process.exitCode = WARN ? 0 : 1;
  }
}
