// scripts/check-provider-document-approval-gate.mjs
//
// PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §25
//
// WHAT THIS GUARD PINS
// ────────────────────
// Before this task, a provider upload WAS a customer delivery. provider-submit-
// letter inserted the document with customer_visible=true, set the order to
// completed / patient_notified, repointed orders.signed_letter_url at the
// freshly uploaded file, and called notify-patient-letter — all in the same
// request, with no human ever having looked at the document.
//
// Three of those are independent delivery channels, and closing only one leaves
// the letter reachable:
//
//   1. the order_documents row          (RLS + get-document-signed-url)
//   2. orders.signed_letter_url         (resolveCustomerDocuments LEGACY FALLBACK
//                                        — reached precisely WHEN the document
//                                        row is hidden, so hiding the row alone
//                                        would have made this the leak)
//   3. order_document_versions.file_url (a long-lived signed URL of its own)
//
// The checks below make each closure non-regressable, and make it impossible to
// re-attribute an automated action to a human or to trust a client-supplied
// actor name.
//
//   A1  provider submission inserts customer_visible: false
//   A2  provider submission stamps review_status pending_admin_approval
//   A3  provider submission does NOT call notify-patient-letter
//   A4  provider submission does NOT set status completed / patient_notified
//   A5  provider submission does NOT repoint orders.signed_letter_url
//   A6  a DB trigger rejects releasing a pending / needs_correction row
//   A7  approval is authorised on is_admin_staff() only (no provider self-approval)
//   A8  approval is idempotent — it transitions only FROM pending_admin_approval
//   A9  correction requires a note, enforced in the RPC (not just in React)
//   A10 the review RPCs are revoked from anon
//   A11 the customer version projection follows the released document
//   A12 the review endpoint refuses a service-role bearer as an approver
//   A13 the customer notification is gated on the single state transition
//   A14 historical documents are backfilled to not_applicable, never hidden
//   A15 assignment records a server-resolved actor, never a body field
//   A16 SMS/email ignore the client-supplied `sentBy` for attribution
//   A17 order status changes go through the audited RPC
//   A18 the audit timeline never invents an actor for a legacy row
//   A19 Additional Pet files are untouched by this task
//   A20 no LIVE project ref is introduced
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-provider-document-approval-gate.mjs
//   node scripts/check-provider-document-approval-gate.mjs --self-test
//   node scripts/check-provider-document-approval-gate.mjs --warn-only

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");
const NAME = "check-provider-document-approval-gate";

const LIVE_PROJECT_REF = "cvwbozlbbmrjxznknouq";

const FILES = {
  submit:      "supabase/functions/provider-submit-letter/index.ts",
  review:      "supabase/functions/admin-review-document/index.ts",
  assign:      "supabase/functions/assign-doctor/index.ts",
  ghlSms:      "supabase/functions/ghl-send-sms/index.ts",
  sms:         "supabase/functions/send-sms/index.ts",
  email:       "supabase/functions/send-templated-email/index.ts",
  actor:       "supabase/functions/_shared/auditActor.ts",
  gateSql:     "supabase/migrations/20260729120000_provider_document_admin_approval_gate.sql",
  rpcSql:      "supabase/migrations/20260729120500_provider_document_review_rpcs.sql",
  deliverSql:  "supabase/migrations/20260729121500_approve_order_document_releases_order_state.sql",
  auditSql:    "supabase/migrations/20260729121000_order_audit_actor_attribution.sql",
  reviewPanel: "src/pages/admin-orders/components/OrderDocumentReviewPanel.tsx",
  timeline:    "src/pages/admin-orders/components/OrderAuditTimeline.tsx",
  modal:       "src/pages/admin-orders/components/OrderDetailModal.tsx",
  myOrders:    "src/pages/my-orders/page.tsx",
  notifyPatient: "supabase/functions/notify-patient-letter/index.ts",
};

function loadAll() {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) throw new Error(`missing required file: ${rel}`);
    out[key] = readFileSync(abs, "utf8");
  }
  return out;
}

/** Strip // and /* *​/ comments so a check can never pass on prose alone. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*--.*$/gm, "")   // SQL line comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const has = (s, needle) => code(s).includes(needle);
const hasRe = (s, re) => re.test(code(s));

function runChecks(f) {
  const submit = code(f.submit);
  const review = code(f.review);
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  // ── Part A · submission no longer delivers ────────────────────────────────
  add("A1", "provider submission inserts customer_visible: false",
    /customer_visible:\s*false/.test(submit) && !/customer_visible:\s*true/.test(submit));

  add("A2", "provider submission stamps review_status pending_admin_approval",
    /review_status:\s*["']pending_admin_approval["']/.test(submit)
    && /submitted_by:\s*user\.id/.test(submit));

  // A3 — ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 TIGHTENED this
  // rather than relaxing it. Submission MAY now email the customer, but only on
  // the gate-disabled path, so "never calls notify-patient-letter" became "calls
  // it exactly once, and only downstream of a real auto-delivery transition".
  //   * exactly ONE call site — a second one anywhere is an unconditional send;
  //   * it sits after auto_deliver_order_document() AND after the
  //     transitioned === true check, so a replay or a gate-on refusal
  //     (transitioned:false) cannot reach it;
  //   * the gate resolves fail-CLOSED (`!== false`), so a null/errored RPC result
  //     keeps the letter in review instead of delivering it.
  //
  // `before()` deliberately requires BOTH anchors to be present. The bare
  // `indexOf(a) < indexOf(b)` idiom FAILS OPEN: deleting `a` yields -1, which is
  // less than any real index, so the assertion would pass precisely when the gate
  // it guards had been removed.
  const before = (a, b) => {
    const ia = submit.indexOf(a);
    const ib = submit.indexOf(b);
    return ia !== -1 && ib !== -1 && ia < ib;
  };
  const NOTIFY = "functions/v1/notify-patient-letter";
  add("A3", "provider submission emails the customer only on a real auto-delivery",
    (submit.match(/functions\/v1\/notify-patient-letter/g) ?? []).length === 1
    && before("auto_deliver_order_document", NOTIFY)
    && before("transitioned === true", NOTIFY)
    && /const gateEnabled\s*=\s*gateData !== false/.test(submit)
    && /if \(!gateEnabled\)/.test(submit));

  // A4 is scoped to the FINAL-LETTER order patch. Two other matches for the same
  // literals are legitimate and must not be flagged:
  //   • order_additional_pet_requests.status = 'completed' — a different table,
  //     owned by the Additional Pet workstream, out of scope for this task.
  //   • the housing late-upload branch restores completed/patient_notified ONLY
  //     when order.letter_id already exists, i.e. when the BASE LETTER IS ALREADY
  //     DELIVERED. That restores a genuinely delivered order's status after a
  //     reopen; the housing document itself still stays gated. A6 (the trigger)
  //     is what actually prevents that document from being released.
  const letterPatch = (submit.match(/const\s+orderUpdatePatch[\s\S]*?\n\s*};/) ?? [""])[0];
  add("A4", "final-letter submission does NOT set completed / patient_notified",
    letterPatch.length > 0
    && !/status:\s*["']completed["']/.test(letterPatch)
    && !/doctor_status:\s*["']patient_notified["']/.test(letterPatch)
    && /doctor_status:\s*["']pending_admin_approval["']/.test(letterPatch)
    && !/patient_notification_sent_at/.test(letterPatch)
    // the housing restore must stay conditional on an already-delivered letter
    && /if\s*\(order\.letter_id\)\s*\{[\s\S]{0,240}housingOrderPatch\.doctor_status\s*=\s*["']patient_notified["']/.test(submit));

  add("A5", "provider submission does NOT repoint orders.signed_letter_url",
    !/signed_letter_url:/.test(submit));

  // ── Part A · server enforcement ───────────────────────────────────────────
  add("A6", "DB trigger rejects releasing a pending / needs_correction row",
    hasRe(f.gateSql, /create\s+trigger\s+trg_order_document_release_gate/i)
    && hasRe(f.gateSql, /raise\s+exception/i)
    && has(f.gateSql, "cannot be customer_visible"));

  add("A7", "approval authorised on is_admin_staff() only — no self-approval",
    hasRe(f.deliverSql, /if\s+not\s+public\.is_admin_staff\(\)\s+then/i)
    && hasRe(f.deliverSql, /insufficient_privilege/));

  add("A8", "approval transitions ONLY from pending_admin_approval (idempotent)",
    hasRe(f.deliverSql, /v_doc\.review_status\s*<>\s*'pending_admin_approval'/)
    && has(f.deliverSql, "'transitioned', false"));

  add("A9", "correction requires a note, enforced in the RPC",
    hasRe(f.rpcSql, /length\(v_note\)\s*<\s*5/)
    && hasRe(f.rpcSql, /raise\s+exception/i));

  add("A10", "review RPCs are revoked from anon",
    hasRe(f.rpcSql, /revoke\s+all\s+on\s+function\s+public\.approve_order_document\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i)
    && hasRe(f.rpcSql, /revoke\s+all\s+on\s+function\s+public\.request_order_document_correction\(uuid,\s*text\)\s+from\s+public,\s*anon,\s*authenticated/i));

  add("A11", "customer version projection follows the released document",
    hasRe(f.deliverSql, /create\s+policy\s+docver_customer_select/i)
    && has(f.deliverSql, "od.customer_visible = true")
    && has(f.deliverSql, "od.review_status not in ('pending_admin_approval', 'needs_correction')"));

  add("A12", "review endpoint refuses a service-role bearer as an approver",
    hasRe(review, /bearer\s*===\s*SERVICE_ROLE_KEY/)
    && has(review, "cannot approve"));

  // Both review actions must early-return on a non-transition, and the APPROVE
  // early-return specifically must report customerNotified: false — that is the
  // line that makes a replayed approval provably send no second email.
  add("A13", "customer notification is gated on the single state transition",
    (review.match(/if\s*\(!r\.transitioned\)/g) ?? []).length === 2
    && review.includes("functions/v1/notify-patient-letter")
    && hasRe(review, /if\s*\(!r\.transitioned\)\s*\{[\s\S]{0,600}customerNotified:\s*false/));

  add("A14", "historical documents backfilled to not_applicable, never hidden",
    hasRe(f.gateSql, /set\s+review_status\s*=\s*'not_applicable'\s*\n?\s*where\s+review_status\s+is\s+null/i)
    && !hasRe(f.gateSql, /update\s+public\.order_documents[\s\S]{0,200}set\s+customer_visible\s*=\s*false/i));

  // ── Part B · actor attribution ────────────────────────────────────────────
  add("A15", "assignment records a server-resolved actor, never a body field",
    has(f.assign, "supabase.auth.getUser(bearer)")
    && hasRe(f.assign, /action:\s*isReassignment\s*\?\s*["']provider_reassigned["']/)
    && !hasRe(f.assign, /actor_name:\s*body\./));

  add("A16", "SMS/email ignore the client-supplied sentBy for attribution",
    has(f.actor, "resolveAuditActor")
    && has(f.ghlSms, "resolveAuditActor(req, supabase)")
    && has(f.email, "resolveAuditActor(req, supabase)")
    && !hasRe(f.ghlSms, /sent_by:\s*sentBy\s*\?\?/)
    && !has(f.email, 'sentBy: "admin_comms"'));

  add("A17", "order status changes go through the audited RPC",
    has(f.modal, 'supabase.rpc("record_order_status_action"')
    && hasRe(f.auditSql, /v_actor_id\s+uuid\s*:=\s*auth\.uid\(\)/)
    && hasRe(f.auditSql, /actor_type[\s\S]{0,400}'employee'/));

  add("A18", "audit timeline never invents an actor for a legacy row",
    has(f.timeline, "actorUnknown")
    && has(f.timeline, "Legacy event")
    && has(f.timeline, "actor unavailable"));

  // A21 — found in authenticated browser QA. `pending_admin_approval` was a NEW
  // doctor_status value that the customer portal's status mapping did not know,
  // so it fell through to the `under-review` branch and the customer was shown
  // "Assigned to Provider" plus "your case is being queued for provider
  // assignment" — actively false, because the provider had already submitted.
  // Both the status chip and the explanatory banner must classify it with the
  // in_review family.
  // A22 — found in authenticated browser QA. The Documents tab still offered two
  // manual overrides on a document awaiting review: a customer_visible toggle
  // (which the DB trigger rejects, but which the UI invited and then swallowed)
  // and a "Notify Patient" banner that appeared for ANY footer-injected document.
  // The banner is the serious one: it emailed the customer "your documents are
  // ready" before approval, and since notify-patient-letter only attaches
  // customer_visible docs, that email would have carried ZERO documents.
  // A22 — ADMIN-ORDER-PENDING-DELIVERY-...-001 §10 closes the FOURTH instance.
  // Keying the customer-notification controls on review_status left one shape
  // open: a document that went pending_admin_approval -> superseded (provider
  // resubmitted before any approval) is NOT in REVIEW_GATED_STATUSES yet was
  // never released, so it keeps customer_visible = false. Those orders passed
  // "has a non-gated document" with ZERO deliverable documents. The controls now
  // key on customer_visible — the same fact the RLS policy, the release trigger
  // and notify-patient-letter's attachment query use — so a future enum value
  // cannot reopen the hole. The per-document visibility toggle legitimately
  // stays on review_status: it asks "may I change this document's state?".
  add("A22", "customer-notification controls are gated on a deliverable document",
    has(f.modal, "hasDeliverableDocument")
    && hasRe(f.modal, /const hasDeliverableDocument[\s\S]{0,240}d\.customer_visible === true/)
    && hasRe(f.modal, /disabled=\{togglingVisibility === doc\.id \|\| REVIEW_GATED_STATUSES\.has\(doc\.review_status \?\? ""\)\}/)
    // Notify Patient banner.
    && has(f.modal, 'orderDocs.some((d) => d.footer_injected && d.customer_visible === true)')
    // "Send All to Customer" — calls notify-patient-letter directly.
    && has(f.modal, "disabled={sendingAll || (orderDocs.length > 0 && !hasDeliverableDocument(orderDocs))}")
    // The post-footer-injection "Notify Patient Now" shortcut carries the gate
    // too; footer injection is a stamping fact, not a release fact.
    && hasRe(f.modal, /reinjectFooterMsg\.includes\("stamped"\)\) && hasDeliverableDocument\(orderDocs\)/)
    // review_status must no longer be what any notification control keys on.
    && !hasRe(f.modal, /!orderDocs\.some\(\(d\) => !REVIEW_GATED_STATUSES\.has/)
    && !hasRe(f.modal, /footer_injected && !REVIEW_GATED_STATUSES\.has/));

  // A23 — UI gating is advisory. notify-patient-letter is also reachable by a
  // replayed request, a provider-scoped caller or a direct curl, and sending
  // "your documents are ready" with nothing attached also stamps
  // patient_notification_sent_at, which suppresses the REAL delivery email
  // later. The server must refuse an empty deliverable list itself.
  add("A23", "notify-patient-letter refuses an empty deliverable list server-side",
    hasRe(f.notifyPatient, /if\s*\(allDocs\.length === 0\)/)
    && has(f.notifyPatient, "no_deliverable_documents")
    && hasRe(f.notifyPatient, /allDocs\.length === 0[\s\S]{0,700}return jsonResp\([\s\S]{0,400}409\)/));

  add("A21", "customer portal maps pending_admin_approval to Under Review + quality-check copy",
    // status chip: classified with the in_review family (never "Assigned to Provider")
    hasRe(f.myOrders, /ds === "in_review" \|\| ds === "approved" \|\| ds === "pending_admin_approval"/)
    // banner: its OWN branch, evaluated BEFORE the in_review branch, carrying the
    // owner-approved copy. It must never reach the "queued for provider
    // assignment" fallback, which is false once the provider has submitted.
    && has(f.myOrders, 'doctor_status === "pending_admin_approval"')
    && has(f.myOrders, "Your provider has completed their review and your documents are undergoing a final quality check.")
    // the internal review step is never disclosed to the customer
    && !has(f.myOrders, "PawTenant reviewer is checking")
  );

  // ── Blast radius ──────────────────────────────────────────────────────────
  const petFiles = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((n) => n.includes("additional_pet"));
  add("A19", "Additional Pet migrations still present and untouched by this task",
    petFiles.length > 0
    && !has(f.gateSql, "additional_pet")
    && !has(f.rpcSql, "additional_pet")
    && !has(f.deliverSql, "additional_pet")
    && !has(f.auditSql, "additional_pet"));

  add("A20", "no LIVE project ref introduced by this task",
    !Object.values(f).some((s) => s.includes(LIVE_PROJECT_REF)));

  return r;
}

// ── Planted negative controls ────────────────────────────────────────────────
// Each mutation reintroduces the exact defect its check exists to prevent.
const CONTROLS = [
  ["A1", "submission releases the document immediately",
    (f) => ({ ...f, submit: f.submit.replace("customer_visible: false", "customer_visible: true") })],
  ["A2", "submission does not mark the document pending",
    (f) => ({ ...f, submit: f.submit.replaceAll('review_status: "pending_admin_approval"', 'review_status: "approved"') })],
  ["A3", "submission emails the customer again",
    (f) => ({ ...f, submit: f.submit + '\nawait fetch(`${SUPABASE_URL}/functions/v1/notify-patient-letter`);\n' })],
  ["A3b", "the gate resolves fail-OPEN, so an RPC error auto-delivers",
    (f) => ({ ...f, submit: f.submit.replace("const gateEnabled = gateData !== false", "const gateEnabled = gateData === true") })],
  ["A3c", "the customer email escapes the transitioned check",
    (f) => ({ ...f, submit: f.submit.replace("transitioned === true", "transitioned !== undefined") })],
  ["A4", "the final-letter patch marks the order delivered again",
    (f) => ({ ...f, submit: f.submit.replace('doctor_status: "pending_admin_approval",', 'doctor_status: "patient_notified",\n      status: "completed",') })],
  ["A5", "submission repoints signed_letter_url again",
    (f) => ({ ...f, submit: f.submit + "\nawait supabase.from('orders').update({ signed_letter_url: documentUrl });\n" })],
  ["A6", "the release-gate trigger is dropped",
    (f) => ({ ...f, gateSql: f.gateSql.replace(/create\s+trigger\s+trg_order_document_release_gate/i, "-- removed trigger") })],
  ["A7", "approval drops its authorisation check",
    (f) => ({ ...f, deliverSql: f.deliverSql.replace(/if\s+not\s+public\.is_admin_staff\(\)\s+then/i, "if false then") })],
  ["A8", "approval loses its idempotency gate",
    (f) => ({ ...f, deliverSql: f.deliverSql.replace(/v_doc\.review_status\s*<>\s*'pending_admin_approval'/, "false") })],
  ["A9", "correction no longer requires a note",
    (f) => ({ ...f, rpcSql: f.rpcSql.replace(/length\(v_note\)\s*<\s*5/, "false") })],
  ["A10", "the approval RPC is left executable by anon",
    (f) => ({ ...f, rpcSql: f.rpcSql.replace(/revoke\s+all\s+on\s+function\s+public\.approve_order_document\(uuid\)\s+from\s+public,\s*anon,\s*authenticated;/i, "") })],
  ["A11", "the version projection stops following the document",
    (f) => ({ ...f, deliverSql: f.deliverSql.replace("od.customer_visible = true", "true") })],
  ["A12", "a service-role key can approve",
    (f) => ({ ...f, review: f.review.replace(/bearer\s*===\s*SERVICE_ROLE_KEY/, "false") })],
  ["A13", "the customer email fires regardless of the transition",
    (f) => ({ ...f, review: f.review.replace(/if\s*\(!r\.transitioned\)/g, "if (false)") })],
  ["A14", "the migration retro-hides historical documents",
    (f) => ({ ...f, gateSql: f.gateSql + "\nupdate public.order_documents set customer_visible = false;\n" })],
  ["A15", "assignment takes its actor from the request body",
    (f) => ({ ...f, assign: f.assign.replace("supabase.auth.getUser(bearer)", "null").replace(/actor_name:\s*actor\.name,/, "actor_name: body.actorName,") })],
  ["A16", "email attribution reverts to the hard-coded sender",
    (f) => ({ ...f, email: f.email.replace(/sentBy:\s*actor\.name,/, 'sentBy: "admin_comms",') })],
  ["A17", "status changes revert to an unaudited client update",
    (f) => ({ ...f, modal: f.modal.replace('supabase.rpc("record_order_status_action"', 'supabase.from("orders").update(patch' ) })],
  ["A18", "the timeline invents an actor for legacy rows",
    (f) => ({ ...f, timeline: f.timeline.replace(/Legacy event/g, "Admin") })],
  ["A19", "a task migration reaches into Additional Pet",
    (f) => ({ ...f, gateSql: f.gateSql + "\nalter table public.order_additional_pet_requests add column x int;\n" })],
  ["A20", "a LIVE project ref is introduced",
    (f) => ({ ...f, review: f.review + `\nconst p = "${LIVE_PROJECT_REF}";\n` })],
  ["A21", "pending_admin_approval falls back to 'Assigned to Provider' again",
    (f) => ({ ...f, myOrders: f.myOrders.replaceAll(' || ds === "pending_admin_approval"', "")
      .replace('Your provider has completed their review and your documents are undergoing a final quality check.', 'x') })],
  ["A22b", "Send All to Customer stops being gated",
    (f) => ({ ...f, modal: f.modal.replace(
      "disabled={sendingAll || (orderDocs.length > 0 && !hasDeliverableDocument(orderDocs))}",
      "disabled={sendingAll}") })],
  ["A22", "Notify Patient reappears for a document awaiting review",
    (f) => ({ ...f, modal: f.modal.replace(
      'orderDocs.some((d) => d.footer_injected && d.customer_visible === true)',
      "orderDocs.some((d) => d.footer_injected)") })],
  // The FOURTH bypass, planted exactly as it existed: revert both notification
  // controls to keying on review_status. `superseded` is not in
  // REVIEW_GATED_STATUSES, so a never-approved superseded document (which keeps
  // customer_visible = false) re-enables both controls with nothing deliverable.
  ["A22c", "notification controls revert to keying on review_status (superseded bypass)",
    (f) => ({ ...f, modal: f.modal
      .replace(
        "disabled={sendingAll || (orderDocs.length > 0 && !hasDeliverableDocument(orderDocs))}",
        'disabled={sendingAll || (orderDocs.length > 0 && !orderDocs.some((d) => !REVIEW_GATED_STATUSES.has(d.review_status ?? "")))}')
      .replace(
        'orderDocs.some((d) => d.footer_injected && d.customer_visible === true)',
        'orderDocs.some((d) => d.footer_injected && !REVIEW_GATED_STATUSES.has(d.review_status ?? ""))') })],
  ["A22d", "the post-footer-injection Notify shortcut drops the gate",
    (f) => ({ ...f, modal: f.modal.replace(
      'reinjectFooterMsg.includes("stamped")) && hasDeliverableDocument(orderDocs)',
      'reinjectFooterMsg.includes("stamped"))') })],
  ["A23", "notify-patient-letter sends with zero resolved documents",
    (f) => ({ ...f, notifyPatient: f.notifyPatient.replace(/if\s*\(allDocs\.length === 0\)/, "if (false)") })],
];

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const results = runChecks(mutate(base));
      // A suffixed control id (A22b, A3b, A3c, ...) is an ADDITIONAL plant against
      // the base check of the same number, so strip the trailing letters to find
      // it. Previously this was hardcoded to /^A22[bcd]$/, which meant any other
      // suffixed control looked for a check id that does not exist, so `hit` was
      // undefined and the control reported MISSED-BY-CONSTRUCTION — i.e. it could
      // never pass no matter how good the check was. Derive it instead.
      const baseId = target.replace(/[a-z]+$/, "");
      const hit = results.find((x) => x.id === target) ?? results.find((x) => x.id === baseId);
      const tripped = hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : "MISSED "} ${target.padEnd(4)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} ${x.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
