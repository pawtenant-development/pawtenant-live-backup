#!/usr/bin/env node
// PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-001 — replay guard.
//
// THE DEFECT THIS MAKES UN-SHIPPABLE
// ----------------------------------
// LIVE Operations QA replayed an IDENTICAL provider submission against an order
// that had already been auto-delivered under a disabled approval gate. The RPC
// recognised the replay (`replayed = true`) and the function correctly avoided a
// second document, a second customer notification and a second auto-delivery
// audit event — and then ran every downstream write anyway, because nothing
// consulted the flag:
//
//   • an ACTIVE version row now existed for (order, doc_type), so the revision
//     probe classified the replay as version 2 and the revision path minted its
//     OWN new verification id BY DESIGN,
//   • the footer was re-injected with that new id,
//   • orders.letter_id was overwritten, so the id stamped into the PDF the
//     customer already holds no longer matched the order and public verification
//     of their real document broke,
//   • a second order_document_versions row was inserted for ONE document,
//   • and the unconditional order patch reset doctor_status to
//     'pending_admin_approval', dragging a completed, customer-visible,
//     already-notified order back into Pending Delivery as a phantom card.
//
// No single statement was at fault, so a guard that pins one line proves
// nothing. What has to hold is an ORDERING invariant: the replay branch must
// return before ANY mutation-capable operation is reachable.
//
// Run:  node scripts/check-provider-submission-replay-idempotency.mjs [--self-test]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const FN = "supabase/functions/provider-submit-letter/index.ts";

// CRLF/LF normalised on read. A guard matching raw bytes silently degrades on a
// Windows checkout with core.autocrlf=true — planted mutations become no-ops and
// the self-test passes while proving nothing.
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`  ${GREEN}PASS${RESET}  ${name}`); return true; }
  failures++;
  console.log(`  ${RED}FAIL${RESET}  ${name}`);
  if (detail) console.log(`        ${DIM}${detail}${RESET}`);
  return false;
}

/**
 * Index of the replay early-return — the `return json({` that sits inside the
 * `if (isReplay) {` block.
 *
 * Returns -1 when absent, and EVERY ordering check below treats -1 as a
 * FAILURE rather than as "nothing to compare". Anchor-ordering tricks of the
 * form indexOf(a) < indexOf(b) are deliberately avoided: they pass when BOTH
 * anchors are missing, which is fail-open — exactly how a previous guard in
 * this repo let a removed gate through.
 */
export function replayReturnIndex(src) {
  const branch = src.indexOf("if (isReplay) {");
  if (branch < 0) return -1;
  const ret = src.indexOf("return json({", branch);
  if (ret < 0) return -1;
  // The return must belong to the replay branch, not to some later block: no
  // other `if (` at column 4 (handler top level) may intervene.
  const between = src.slice(branch, ret);
  if (/\n    if \(/.test(between)) return -1;
  return ret;
}

/** Every mutation-capable operation that MUST sit after the replay return. */
const MUTATIONS = [
  ["verification id generation", "await generateVerificationId("],
  ["order state patch (doctor_status)", 'doctor_status: "pending_admin_approval"'],
  ["order update write", 'from("orders").update(orderUpdatePatch)'],
  ["document-version creation", "create_document_version"],
  ["approval-gate branch / auto-delivery", "is_provider_approval_gate_enabled"],
  // Anchored on the DISPATCH, not the bare slug: the slug also appears in an
  // explanatory comment far above, and matching that made this check a false
  // negative that would have masked a real regression.
  ["customer notification dispatch", "/functions/v1/notify-patient-letter"],
  ["provider earning creation", "ensureRaCompletionEarning("],
];

console.log("\nPROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-001 — replay guard\n");

function run(src) {
  failures = 0;

  const ret = replayReturnIndex(src);
  check(
    "R1   the replay branch returns before falling through",
    ret >= 0,
    "no `return json({` found inside `if (isReplay) {` — a replay would fall through into the mutation path",
  );

  // R2..R8 — the ordering invariant, one assertion per mutation class.
  MUTATIONS.forEach(([label, needle], i) => {
    const at = src.indexOf(needle);
    check(
      `R${i + 2}   replay returns BEFORE ${label}`,
      ret >= 0 && at >= 0 && ret < at,
      at < 0
        ? `anchor not found: ${needle}`
        : `replay return at ${ret}, ${label} at ${at}`,
    );
  });

  // The response must be READ from storage, never asserted.
  const body = ret >= 0 ? src.slice(ret, src.indexOf("});", ret)) : "";

  check(
    "R9   replay response reads the STORED document row",
    /storedDoc\?\./.test(body),
    "replay response does not read a stored document record",
  );
  check(
    "R10  replay response reads the STORED order row",
    /storedOrder\?\./.test(body),
    "replay response does not read a stored order record",
  );
  check(
    "R11  replay response does not hardcode a review status",
    ret >= 0 && !/reviewStatus:\s*"/.test(body),
    "reviewStatus is a literal — the LIVE defect returned 'pending_admin_approval' for a DELIVERED letter",
  );
  check(
    "R12  replay response does not hardcode customerVisible:false",
    ret >= 0 && !/customerVisible:\s*false/.test(body),
    "customerVisible is a literal false — a delivered replay must report the stored true",
  );
  check(
    "R13  replay response reports the STORED letter id",
    /letterId:\s*storedOrder/.test(body),
    "letterId is not read from the stored order — a replay must never surface a fresh id",
  );
  check(
    "R14  replay branch performs no order write",
    ret >= 0 && !/from\("orders"\)\s*\.update/.test(src.slice(src.indexOf("if (isReplay) {"), ret)),
    "the replay branch writes to orders before returning",
  );
  check(
    "R15  replay branch inserts no document version",
    ret >= 0 && !/order_document_versions/.test(src.slice(src.indexOf("if (isReplay) {"), ret)),
    "the replay branch touches order_document_versions",
  );
  check(
    "R16  replay discards the duplicate upload (no orphan storage)",
    /if \(isReplay\) \{\s*\n\s*await discardUploadedObject\(/.test(src),
    "the freshly uploaded duplicate is not discarded — replays would accumulate orphan objects",
  );

  // The one-current-pending invariant and the approved-replacement protection
  // must survive this change.
  check(
    "R17  approved replacement still requires a formal reopen",
    /slot\.rejected === true/.test(src) && /approved_document_requires_reopen/.test(src),
    "the approved-document rejection arm was weakened",
  );
  check(
    "R18  the atomic slot RPC is still the single decision point",
    /"provider_submit_document_slot"/.test(src),
    "the advisory-locked slot RPC is no longer called",
  );

  return failures;
}

const src = read(FN);

if (process.argv.includes("--self-test")) {
  // Planted negative controls — each reproduces one arm of the LIVE corruption.
  // Every one MUST fail the guard, or the guard proves nothing.
  const controls = [
    ["verification generation moved before the replay return",
      (s) => s.replace("if (isReplay) {", "if (false) {")],
    ["replay return deleted entirely (falls through to mutations)",
      (s) => s.replace(/if \(isReplay\) \{[\s\S]*?\n    \}\n/, "if (isReplay) { /* removed */ }\n")],
    ["review status hardcoded to pending_admin_approval",
      (s) => s.replace("reviewStatus: storedReviewStatus,", 'reviewStatus: "pending_admin_approval",')],
    ["customerVisible hardcoded to false",
      (s) => s.replace("customerVisible: storedVisible,", "customerVisible: false,")],
    ["letter id recomputed instead of read from the order",
      (s) => s.replace(/letterId: storedOrder\?\.letter_id[^,]*,/, "letterId: crypto.randomUUID(),")],
    ["duplicate upload no longer discarded on replay",
      (s) => s.replace(/if \(isReplay\) \{\n      await discardUploadedObject\([^\n]*\n/, "if (isReplay) {\n")],
  ];

  let bad = 0;
  for (const [label, mutate] of controls) {
    const mutated = mutate(src);
    if (mutated === src) { console.log(`  ${RED}FAIL${RESET}  self-test: control did not apply — ${label}`); bad++; continue; }
    const quiet = console.log; console.log = () => {};
    const f = run(mutated);
    console.log = quiet;
    if (f > 0) console.log(`  ${GREEN}PASS${RESET}  self-test caught: ${label}`);
    else { console.log(`  ${RED}FAIL${RESET}  self-test MISSED: ${label}`); bad++; }
  }
  console.log(bad === 0 ? `\n${GREEN}Self-test: all negative controls caught.${RESET}\n`
                        : `\n${RED}Self-test: ${bad} control(s) not caught.${RESET}\n`);
  process.exit(bad === 0 ? 0 : 1);
}

const f = run(src);
console.log(f === 0 ? `\n${GREEN}All replay-idempotency checks passed.${RESET}\n`
                    : `\n${RED}${f} check(s) failed.${RESET}\n`);
process.exit(f === 0 ? 0 : 1);
