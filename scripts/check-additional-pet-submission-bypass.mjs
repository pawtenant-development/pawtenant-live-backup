// scripts/check-additional-pet-submission-bypass.mjs
//
// ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001 — guard.
//
// A manual admin reopen of a completed order used to unlock an ORDINARY
// replacement letter while an Additional Pet review was still awaiting a
// clinical decision. The reopen flag (orders.last_reopened_at) is PERSISTENT,
// so restoring the order to Completed does not close it. The resulting letter
// carried a NULL pet snapshot, left the add-on request untouched, and could
// name the added pet with no recorded approval.
//
//   B1  A manual reopen cannot bypass an active Additional Pet review — the
//       gate is evaluated before, and independently of, the reopen flag.
//   B2  A provider cannot submit a letter while an Additional Pet decision is
//       owed (pending_provider_review / clarification_requested / resubmitted).
//   B3  A letter version fulfilling an APPROVED add-on can never carry a null
//       pet snapshot — enforced by a table trigger, not by caller discipline.
//   B4  An unapproved added pet can never enter the snapshot a PDF is built
//       from: the array is built exclusively from provider_decision='approved'.
//   B5  The base-letter path REFUSES and REDIRECTS to the Additional Pet
//       workflow (its own reason code + its own provider-facing message).
//   B6  provider-additional-pet-decision remains the canonical clinical
//       authorization — it is the only writer of approved_pending_document.
//   B7  After approval the revision includes every approved pet exactly once.
//   B8  The gate and the trigger touch no order, provider, earning, document
//       or verification history.
//
// Static assertions only — no runtime, no network, no DB. The behavioural
// counterpart (the gate actually rejecting on a real database) is proven by
// rollback-contained probes recorded in the task report.
//
// Usage:
//   node scripts/check-additional-pet-submission-bypass.mjs             → guard
//   node scripts/check-additional-pet-submission-bypass.mjs --warn-only → audit
//   node scripts/check-additional-pet-submission-bypass.mjs --self-test → controls

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  bypassMig: "supabase/migrations/20260826180000_additional_pet_submission_bypass_protection.sql",
  reassignMig: "supabase/migrations/20260826150000_additional_pet_decline_reassignment.sql",
  submit: "supabase/functions/provider-submit-letter/index.ts",
  decision: "supabase/functions/provider-additional-pet-decision/index.ts",
  shared: "supabase/functions/_shared/completeAdditionalPetPayment.ts",
  createFn: "supabase/functions/create-additional-pet-request/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const p = resolve(ROOT, F[key]);
  if (!existsSync(p)) throw new Error(`missing file: ${F[key]}`);
  // CRLF normalised at the SINGLE read point so ordering comparisons and
  // multi-line anchors behave identically on Windows and CI.
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

/** SQL with comments stripped, so a check can never be satisfied — or tripped —
 *  by the prose that documents the very rule it enforces. String literals are
 *  KEPT: in this migration the dangerous artefacts ARE literals (status values,
 *  reason codes, table names). */
function sqlCode(src) {
  return src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Comment-free view of TS with real string-context tracking. */
function codeOnly(src) {
  let out = ""; let i = 0; const n = src.length;
  let state = 0; const td = [];
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 0) {
      if (c === "/" && d === "/") { state = 1; i += 2; continue; }
      if (c === "/" && d === "*") { state = 2; i += 2; continue; }
      if (c === "'") { state = 3; out += c; i++; continue; }
      if (c === '"') { state = 4; out += c; i++; continue; }
      if (c === "`") { state = 5; out += c; i++; continue; }
      if (c === "}" && td.length) {
        if (td[td.length - 1] === 0) { td.pop(); state = 5; out += c; i++; continue; }
        td[td.length - 1]--;
      }
      if (c === "{" && td.length) td[td.length - 1]++;
      out += c; i++; continue;
    }
    if (state === 1) { if (c === "\n") { state = 0; out += "\n"; } i++; continue; }
    if (state === 2) { if (c === "*" && d === "/") { state = 0; i += 2; } else { if (c === "\n") out += "\n"; i++; } continue; }
    if (state === 3) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === "'") state = 0; out += c; i++; continue; }
    if (state === 4) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === '"') state = 0; out += c; i++; continue; }
    if (state === 5) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { state = 0; out += c; i++; continue; }
      if (c === "$" && d === "{") { td.push(0); state = 0; out += "${"; i += 2; continue; }
      out += c; i++; continue;
    }
  }
  return out;
}

/** Extract a dollar-quoted plpgsql body by function name. */
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

/**
 * TEST states the patched function literally; LIVE rebuilds it from its own
 * pg_get_functiondef and carries the gate as a dollar-quoted literal (so no
 * byte of LIVE's body is retyped across repos). Both shapes contain the SAME
 * gate text, so every assertion below is identical in meaning — only the
 * extraction differs.
 */
function isDynamicShape(s) {
  return /pg_get_functiondef/.test(s.bypassMig)
      && !/create\s+or\s+replace\s+function\s+public\.provider_submit_document_slot/i.test(s.bypassMig);
}

/** The §1 gate block: from the v_review_due probe to its closing return. */
function gateBlock(s) {
  if (isDynamicShape(s)) {
    // The whole dollar-quoted literal IS the gate block: unlike the literal
    // shape it carries no surrounding function body to slice away, and its
    // first `v_review_due` mention is the assignment, not the declaration.
    const m = s.bypassMig.match(/\$gate\$([\s\S]*?)\$gate\$/);
    if (!m) throw new Error("gate anchor missing: $gate$ literal");
    const g = sqlCode(m[1]);
    if (!/v_review_due/.test(g) || !/additional_pet_review_pending/.test(g)) {
      throw new Error("gate literal is missing its own anchors");
    }
    return g;
  }
  const body = sqlCode(fnBody(s.bypassMig, "provider_submit_document_slot"));
  const a = body.indexOf("v_review_due");
  if (a < 0) throw new Error("gate anchor missing: v_review_due");
  const b = body.indexOf("additional_pet_review_pending", a);
  if (b < 0) throw new Error("gate anchor missing: additional_pet_review_pending");
  return body.slice(a, b + 200);
}

const CHECKS = [
  // ── B1 · a manual reopen cannot unlock the gate ───────────────────────────
  ["B1a", "the gate is decided BEFORE the reopen/delivered-document branch",
    (s) => {
      if (isDynamicShape(s)) {
        // The rebuild refuses to run unless its injection point precedes the
        // reopen computation, and re-reads the stored definition afterwards to
        // confirm the gate actually landed there.
        const c = sqlCode(s.bypassMig);
        return /position\(v_anchor in v_def\) > position\('v_reopened :=' in v_def\)[\s\S]{0,160}?raise exception/.test(c)
            && /position\('additional_pet_review_pending' in v_def\) > position\('v_reopened :=' in v_def\)[\s\S]{0,160}?raise exception/.test(c);
      }
      const body = sqlCode(fnBody(s.bypassMig, "provider_submit_document_slot"));
      const gate = body.indexOf("additional_pet_review_pending");
      const reopen = body.indexOf("v_reopened :=");
      return gate > 0 && reopen > 0 && gate < reopen;
    }],
  ["B1b", "the gate reads neither the reopen flag nor last_reopened_at",
    (s) => {
      const g = gateBlock(s);
      return !/v_reopened/.test(g) && !/last_reopened_at/.test(g)
          && !/official_letter_reopened_at/.test(g);
    }],
  ["B1c", "the gate returns rejected unconditionally once a decision is owed",
    (s) => {
      const g = gateBlock(s);
      return /if\s+v_review_due\s+then/.test(g) && /'rejected',\s*true/.test(g);
    }],

  // ── B2 · no letter while a decision is owed ───────────────────────────────
  ["B2a", "the gate blocks exactly the decision-owed statuses",
    (s) => {
      const g = gateBlock(s).replace(/\s+/g, " ");
      return /status in \( 'pending_provider_review', 'clarification_requested', 'resubmitted' \)/.test(g)
          || /status in \('pending_provider_review', 'clarification_requested', 'resubmitted'\)/.test(g);
    }],
  ["B2b", "an approved request does NOT block (it is what owes the revision)",
    (s) => !/approved_pending_document/.test(gateBlock(s))],
  ["B2c", "the gate applies to ESA and PSD letters",
    (s) => /p_doc_type in \('esa_letter', 'psd_letter'\)/.test(gateBlock(s))],
  ["B2d", "the gate sits AFTER the replay short-circuit so retries stay no-ops",
    (s) => {
      if (isDynamicShape(s)) {
        const c = sqlCode(s.bypassMig);
        return /position\(v_anchor in v_def\) < position\('identical_submission_already_pending' in v_def\)[\s\S]{0,160}?raise exception/.test(c)
            && /position\('additional_pet_review_pending' in v_def\) < position\('identical_submission_already_pending' in v_def\)[\s\S]{0,160}?raise exception/.test(c);
      }
      const body = sqlCode(fnBody(s.bypassMig, "provider_submit_document_slot"));
      return body.indexOf("identical_submission_already_pending") < body.indexOf("additional_pet_review_pending");
    }],

  // ── B3 · an approved add-on's version must carry a snapshot ───────────────
  ["B3a", "a table trigger enforces the snapshot, not caller discipline",
    (s) => /create trigger trg_document_version_requires_pet_snapshot\s+before insert on public\.order_document_versions/i
      .test(sqlCode(s.bypassMig))],
  ["B3b", "the trigger raises on a null snapshot for an approved add-on",
    (s) => {
      const b = sqlCode(fnBody(s.bypassMig, "tg_document_version_requires_pet_snapshot"));
      return /new\.pet_snapshot is null/.test(b)
          && /status = 'approved_pending_document'/.test(b)
          && /raise\s+exception/i.test(b)
          && /check_violation/.test(b);
    }],
  ["B3c", "both letter paths still pass the snapshot through",
    (s) => (codeOnly(s.submit).match(/p_pet_snapshot:\s*addPetSnapshot/g) || []).length >= 2],

  // ── B4 · an unapproved pet can never reach the snapshot ───────────────────
  ["B4a", "the approved-pets array is built only from approved decisions",
    (s) => {
      const b = sqlCode(fnBody(s.reassignMig, "additional_pet_effective_state"));
      const m = b.match(/into v_approved[\s\S]*?;/);
      return !!m && /provider_decision = 'approved'/.test(m[0])
          && /status in \('approved_pending_document','completed'\)/.test(m[0]);
    }],
  ["B4b", "the snapshot builder consumes that array and adds nothing ad hoc",
    (s) => {
      const c = codeOnly(s.submit);
      return /const pets = \[\.\.\.originals, \.\.\.approvedAdded\];/.test(c)
          && !/\[\.\.\.originals,\s*apr\.new_pet\]/.test(c)
          && !/\.\.\.approvedAdded,\s*apr\.new_pet/.test(c);
    }],
  ["B4c", "the snapshot lookup only ever selects an APPROVED pending request",
    (s) => {
      const c = codeOnly(s.submit);
      return /\.eq\("status", "approved_pending_document"\)/.test(c);
    }],

  // ── B5 · refuse AND redirect ──────────────────────────────────────────────
  ["B5a", "the refusal carries its own reason code",
    (s) => /'reason',\s*'additional_pet_review_pending'/.test(gateBlock(s))],
  ["B5b", "the provider is redirected to the Additional Pet workflow, not to a reopen",
    (s) => {
      const c = codeOnly(s.submit);
      const m = c.match(/slotReason === "additional_pet_review_pending"[\s\S]{0,600}?:\s*"This order already has/);
      if (!m) return false;
      const branch = m[0];
      return /Additional Pet review/.test(branch)
          && /approve or decline it first/.test(branch)
          && !/reopen/i.test(branch.slice(0, branch.indexOf(': "This order already has')));
    }],
  ["B5c", "the rejection is surfaced as 409 with the server's reason",
    (s) => {
      const c = codeOnly(s.submit);
      return /reason:\s*slotReason/.test(c) && /\}, 409\);/.test(c);
    }],

  // ── B6 · the decision function stays canonical ────────────────────────────
  ["B6a", "provider-additional-pet-decision is the only writer of approved_pending_document",
    (s) => {
      // The lookbehind matters: `from_status: "approved_pending_document"` is an
      // EVENT-history field, not a state write, and it legitimately appears in
      // provider-submit-letter. Matching bare `status:` counted it as a second
      // writer and made this check fail against correct code.
      const writes = /(?<![_A-Za-z])status:\s*"approved_pending_document"/;
      const writers = [];
      for (const key of ["decision", "submit", "shared", "createFn"]) {
        if (writes.test(codeOnly(s[key]))) writers.push(key);
      }
      return writers.length === 1 && writers[0] === "decision";
    }],
  ["B6b", "approval still requires a null standing decision (no silent re-approval)",
    (s) => /\.is\("provider_decision", null\)/.test(codeOnly(s.decision))],

  // ── B7 · every approved pet exactly once ──────────────────────────────────
  ["B7", "the revision totals the real pet list, not a computed count",
    (s) => /total_pets:\s*pets\.length/.test(codeOnly(s.submit))],

  // ── B8 · history stays immutable ──────────────────────────────────────────
  ["B8a", "the gate mutates nothing at all",
    (s) => {
      const g = gateBlock(s);
      return !/\b(update|insert|delete)\b/i.test(g);
    }],
  ["B8b", "the snapshot trigger mutates nothing and touches no history table",
    (s) => {
      const b = sqlCode(fnBody(s.bypassMig, "tg_document_version_requires_pet_snapshot"));
      return !/\b(update|insert|delete)\b/i.test(b)
          && !/doctor_earnings|orders\b|letter_verifications/.test(b);
    }],
  ["B8c", "the bypass migration never writes provider, earning or order history",
    (s) => {
      const c = sqlCode(s.bypassMig);
      return !/update\s+public\.orders/i.test(c)
          && !/doctor_earnings/i.test(c)
          && !/update\s+public\.letter_verifications/i.test(c)
          && !/delete\s+from\s+public\./i.test(c);
    }],
];

/** Negative controls — the five the owner named, plus the reopen bypass itself. */
const CONTROLS = [
  // Reopen the base order and submit normally: neuter the gate's decision so
  // the submission falls through to the reopen branch, which is exactly how the
  // LIVE bypass behaved.
  ["N1", "B1c", "bypassMig", (t) => t.replace(
    "    if v_review_due then", "    if false then")],
  ["N2", "B2a", "bypassMig", (t) => t.replace(
    "         and status in ('pending_provider_review', 'clarification_requested', 'resubmitted')",
    "         and status in ('cancelled')")],
  // Make the gate consult the reopen flag, which is exactly how the bypass worked.
  ["N3", "B1b", "bypassMig", (t) => t.replace(
    "    ) into v_review_due;",
    "    ) and (v_order.last_reopened_at is null) into v_review_due;")],
  // Allow a null snapshot.
  ["N4", "B3b", "bypassMig", (t) => t.replace(
    "     and new.pet_snapshot is null", "     and false")],
  ["N5", "B3a", "bypassMig", (t) => t.replace(
    "create trigger trg_document_version_requires_pet_snapshot",
    "create trigger trg_document_version_requires_pet_snapshot_disabled")],
  // Insert the added pet without approval.
  ["N6", "B4a", "reassignMig", (t) => t.replace(
    "     and r.provider_decision = 'approved'\n     and r.status in ('approved_pending_document','completed');\n\n  v_tier",
    "     and r.provider_decision is not null\n     and r.status in ('approved_pending_document','completed');\n\n  v_tier")],
  ["N7", "B4b", "submit", (t) => t.replace(
    "const pets = [...originals, ...approvedAdded];",
    "const pets = [...originals, ...approvedAdded, apr.new_pet];")],
  // Rewrite the original provider.
  ["N8", "B8c", "bypassMig", (t) => t.replace(
    "-- ── §2 · an approved add-on's version must carry a pet snapshot ─────────────",
    "update public.orders set doctor_user_id = null where id is not null;\n-- ── §2 · an approved add-on's version must carry a pet snapshot ─────────────")],
  // Change the original payout.
  ["N9", "B8c", "bypassMig", (t) => t.replace(
    "-- ── §2 · an approved add-on's version must carry a pet snapshot ─────────────",
    "update public.doctor_earnings set doctor_amount = 0;\n-- ── §2 · an approved add-on's version must carry a pet snapshot ─────────────")],
  // Provider-facing copy regresses to "ask for a reopen".
  ["N10", "B5b", "submit", (t) => t.replace(
    '? "This order has an Additional Pet request awaiting your clinical decision. " +\n          "Open the Additional Pet review on this case and approve or decline it first. " +\n          "Approving it is what authorises a revised letter covering the added pet."',
    '? "Ask PawTenant to reopen the order before uploading a replacement."')],
  // A second writer of the approval state would dethrone the decision function.
  ["N11", "B6a", "submit", (t) => t.replace(
    'status: "completed",\n                  document_version_id: createdVersion.id,',
    'status: "approved_pending_document",\n                  document_version_id: createdVersion.id,')],
  // The gate must stay after the replay short-circuit. In the literal shape
  // that means physically moving the block above it; in the dynamic-rebuild
  // shape it means dropping the post-condition that proves where it landed.
  ["N12", "B2d", "bypassMig", (t) => {
    if (/pg_get_functiondef/.test(t)
        && !/create\s+or\s+replace\s+function\s+public\.provider_submit_document_slot/i.test(t)) {
      return t.replace(
        "  if position('additional_pet_review_pending' in v_def) < position('identical_submission_already_pending' in v_def) then",
        "  if false then");
    }
    const gateStart = t.indexOf("  if p_doc_type in ('esa_letter', 'psd_letter') then");
    const gateEnd = t.indexOf("  select * into v_approved", gateStart);
    const gate = t.slice(gateStart, gateEnd);
    const without = t.slice(0, gateStart) + t.slice(gateEnd);
    const anchor = without.indexOf("  if v_fp is not null then");
    return without.slice(0, anchor) + gate + without.slice(anchor);
  }],
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

if (SELF) {
  console.log("ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001 — negative controls\n");
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
  process.exitCode = bad === 0 ? 0 : 1;
} else {
  const src = loadAll();
  const results = run(src);
  const failed = results.filter((r) => !r[2]);

  console.log("ADDITIONAL-PET-SUBMISSION-BYPASS-PROTECTION-001 — guard\n");
  for (const [id, desc, ok] of results) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${desc}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length) {
    console.log(WARN ? "\n(--warn-only: not failing the build)" : "\nGUARD FAILED");
    process.exitCode = WARN ? 0 : 1;
  }
}
