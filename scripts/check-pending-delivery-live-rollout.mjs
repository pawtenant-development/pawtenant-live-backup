#!/usr/bin/env node
// ADMIN-ORDER-PENDING-DELIVERY-REOPEN-NOTIFICATIONS-REALTIME-001
// Guards for Phases 2-6: Pending Delivery projections, KPI exclusivity, reopen
// reason, aggregate invalidation, stale-response ordering, default sort, filters.
//
// Phase 1 (the approval-gate toggle) is guarded by
// check-provider-document-approval-gate.mjs (T1-T9) alongside the gate it
// extends; keeping it there means the toggle and the gate cannot drift apart.
//
// Run:  node scripts/check-pending-delivery-admin-orders.mjs
// Self: node scripts/check-pending-delivery-admin-orders.mjs --self-test

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");
const NAME = "check-pending-delivery-live-rollout";
const LIVE_PROJECT_REF = "cvwbozlbbmrjxznknouq";
// Built by concatenation so this guard file does not itself contain the literal
// TEST ref it is scanning for — otherwise a repo-wide grep for the TEST project
// would flag the very check that forbids it.
const TEST_PROJECT_REF_LITERAL = "opudhofj" + "bydrljgleofq";
/** Drop SQL (--), JS (//) and block-comment lines before scanning for refs. */
const stripComments = (src) => src
  .split(/\r?\n/)
  .filter((ln) => !/^\s*(--|\/\/|\*|\/\*)/.test(ln))
  .join("\n");

const FILES = {
  page:        "src/pages/admin-orders/page.tsx",
  lifecycle:   "src/lib/orderLifecycle.ts",
  classify:    "src/lib/orderClassification.ts",
  facets:      "src/pages/admin-orders/orderFacetCounts.ts",
  kpiLib:      "src/lib/adminOrdersMonthlyKpis.ts",
  guardLib:    "src/lib/latestRequestGuard.ts",
  modal:       "src/pages/admin-orders/components/OrderDetailModal.tsx",
  provider:    "src/pages/provider-portal/page.tsx",
  customer:    "src/pages/my-orders/page.tsx",
  notifyDoc:   "supabase/functions/notify-patient-letter/index.ts",
  reissue:     "supabase/functions/notify-thirty-day-reissue/index.ts",
  bell:        "src/pages/admin-orders/components/CompanyNotificationsBell.tsx",
  notifSql:    "supabase/migrations/20260730240000_notification_categories.sql",
  gateRbacSql: "supabase/migrations/20260730200000_provider_approval_gate_toggle.sql",
  gatePanel:   "src/pages/admin-orders/components/LetterQualityCheckPanel.tsx",
  submit:      "supabase/functions/provider-submit-letter/index.ts",
  reissueFn:   "supabase/functions/notify-thirty-day-reissue/index.ts",
  assignFn:    "supabase/functions/assign-doctor/index.ts",
  stateSql:    "supabase/migrations/20260730210000_pending_delivery_workflow_state.sql",
  correctSql:  "supabase/migrations/20260730220000_correction_returns_order_to_review.sql",
  reopenSql:   "supabase/migrations/20260730230000_reopen_order_reason_and_provider_notify.sql",
};

function loadAll() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) throw new Error(`missing required file: ${rel}`);
    // NORMALISE CRLF -> LF at the read boundary. The LIVE repo checks out with
    // core.autocrlf=true, so every source file is CRLF on disk, while every
    // anchor and planted mutation in this guard is written with \n. Without this
    // the string anchors silently fail to match: the CHECKS still pass (they are
    // mostly regex with \s*), but the negative-control MUTATIONS become no-ops,
    // so each control reports MISSED-by-construction and the guard looks weaker
    // than it is. Normalising once here makes the whole file line-ending
    // agnostic.
    out[k] = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  }
  return out;
}

/** Strip comments so no check can pass on prose alone. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*--.*$/gm, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const has = (s, n) => code(s).includes(n);
const hasRe = (s, re) => re.test(code(s));
/**
 * "`a` appears BEFORE `b`" — and BOTH must be present.
 *
 * Written as a helper because the naive `indexOf(a) < indexOf(b)` form FAILS
 * OPEN: deleting `a` makes indexOf return -1, and -1 is less than any real
 * index, so the assertion passes precisely when the thing it guards is gone.
 * The suppression self-test caught exactly that.
 */
const before = (src, a, b) => {
  const c = code(src);
  const ia = c.indexOf(a), ib = c.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
};

function runChecks(f) {
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  // ── Phase 2 · projections ────────────────────────────────────────────────
  add("P1", "SQL classifier emits pending_delivery, behind completed and ahead of reopened",
    hasRe(f.stateSql, /doctor_status = 'pending_admin_approval'\s*\)?\s*then 'pending_delivery'/)
    && code(f.stateSql).indexOf("then 'completed'") < code(f.stateSql).indexOf("then 'pending_delivery'")
    && code(f.stateSql).indexOf("then 'pending_delivery'") < code(f.stateSql).indexOf("then 'reopened'"));

  add("P2", "TS mirror matches the SQL branch order exactly",
    hasRe(f.lifecycle, /"pending_delivery"/)
    && hasRe(f.lifecycle, /doctor_status === "pending_admin_approval"\) return "pending_delivery"/)
    && code(f.lifecycle).indexOf('return "completed"') < code(f.lifecycle).indexOf('return "pending_delivery"')
    && code(f.lifecycle).indexOf('return "pending_delivery"') < code(f.lifecycle).indexOf('return "reopened"'));

  // Under Review must EXCLUDE Pending Delivery in BOTH count universes and in
  // the row classifier, or the two tabs claim the same order.
  add("P3", "Under Review excludes Pending Delivery everywhere it is counted",
    hasRe(f.classify, /export function isPendingDelivery/)
    && hasRe(f.classify, /isUnderReview[\s\S]{0,220}!isPendingDelivery\(o\)/)
    && hasRe(f.facets, /doctor_status\.is\.null,doctor_status\.neq\.pending_admin_approval/)
    && hasRe(f.stateSql, /order_workflow_state\(o\) <> 'pending_delivery'/));

  add("P4", "the KPI RPC returns five buckets and Completed excludes Pending Delivery",
    has(f.stateSql, "'pendingDelivery',    v_pd")
    && hasRe(f.stateSql, /new_doctor_status = 'pending_admin_approval'/)
    && hasRe(f.stateSql, /o\.last_completed_at[\s\S]{0,300}order_workflow_state\(o\) <> 'pending_delivery'/)
    && has(f.kpiLib, "pendingDelivery: d.pendingDelivery ?? 0"));

  add("P5", "the list filter handles pending_delivery explicitly, not via the else fallback",
    hasRe(f.page, /statusFilter === "pending_delivery"[\s\S]{0,400}isPendingDelivery\(o\)/)
    && has(f.page, 'isPendingDelivery,')
    && has(f.facets, '"pending_delivery"')
    && has(f.page, '{ value: "pending_delivery", label: "Pending Delivery" }'));

  // ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001 — the card now reads
  // `pendingDeliveryCurrent` (queue depth) instead of `pendingDelivery` (entered
  // the queue this month). What P6 actually owns is unchanged: the fifth card
  // exists, it is fed by the server aggregate rather than loaded rows, and the
  // grid has five columns so it is not clipped. WHICH aggregate field is correct
  // is owned by check-admin-orders-current-workload-kpi.mjs.
  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9 renamed the cards to their
  // PERIOD-EVENT names and replaced the queue-depth aggregate with the single
  // period aggregate. Pending Delivery still has its OWN card on the five-column
  // grid — which is all this check was ever protecting.
  add("P6", "the banner renders five cards on a five-column grid",
    has(f.page, 'label: "Entered Pending Delivery"')
    && has(f.page, "periodKpis?.enteredPendingDelivery ?? null")
    && hasRe(f.page, /lg:grid-cols-5/));

  // Customer must NEVER see the internal label, and must not be told the
  // provider is still reviewing after the provider has finished.
  add("P7", "customer sees Under Review with its own copy, never the internal state",
    !hasRe(f.customer, /Pending Delivery/)
    && hasRe(f.customer, /ds === "pending_admin_approval"\) return \{ label: "Under Review"|ds === "in_review" \|\| ds === "approved" \|\| ds === "pending_admin_approval"\) return \{ label: "Under Review"/)
    && has(f.customer, "final quality check")
    && !hasRe(f.customer, /pending_admin_approval\s*$[\s\S]{0,200}employee approval/m));

  add("P8", "provider sees Completed and stays in the Completed queue",
    has(f.provider, 'pending_admin_approval: "Completed"')
    && hasRe(f.provider, /filter === "completed"[\s\S]{0,200}doctorStatus === "pending_admin_approval"/)
    && !hasRe(f.provider, /filter === "in_progress"[\s\S]{0,220}doctorStatus === "pending_admin_approval"/));

  // Phase 2b — without this the rejected letter stays in the employee queue AND
  // lands in the provider's done pile.
  add("P9", "requesting a correction hands the order back to the provider",
    hasRe(f.correctSql, /update public\.orders\s*set doctor_status = 'in_review'\s*where id = v_doc\.order_id\s*and doctor_status = 'pending_admin_approval'/)
    // the original safety behaviour must survive the rewrite
    && hasRe(f.correctSql, /customer_visible\s*=\s*false/)
    && has(f.correctSql, "document_correction_requested")
    && hasRe(f.correctSql, /if length\(v_note\) < 5 then/));

  // ── Phase 3 · reopen reason ──────────────────────────────────────────────
  add("P10", "the reopen is a server RPC with a server-resolved actor",
    hasRe(f.reopenSql, /create or replace function public\.reopen_order_under_review/)
    && hasRe(f.reopenSql, /if not public\.is_admin_staff\(\) then/)
    && hasRe(f.reopenSql, /select display_name, role into v_name, v_role from public\.current_staff_actor\(\)/)
    // the actor must never arrive as an argument
    && !hasRe(f.reopenSql, /reopen_order_under_review\([\s\S]{0,200}p_actor/));

  add("P11", "the reason is validated server-side and markup is REJECTED not stripped",
    hasRe(f.reopenSql, /length\(v\) < 5/)
    && hasRe(f.reopenSql, /length\(v\) > 1000/)
    && hasRe(f.reopenSql, /'<\[a-zA-Z\/!\]'/)
    && !hasRe(f.reopenSql, /regexp_replace\(v, *'<\[\^>\]\*>'/)
    && hasRe(f.reopenSql, /v_reason := public\.validate_reopen_reason\(p_reason\)/));

  add("P12", "reopen is idempotent and notifies the provider exactly once",
    hasRe(f.reopenSql, /if v_order\.status = 'under-review' then[\s\S]{0,220}'already_under_review'/)
    && hasRe(f.reopenSql, /doctor_notifications/)
    && hasRe(f.reopenSql, /notify-thirty-day-reissue/)
    && hasRe(f.reopenSql, /'customer_emailed', false/)
    && hasRe(f.reopenSql, /last_reopen_reason    = v_reason/));

  add("P13", "reopen defers to Needs Correction when a document awaits approval",
    hasRe(f.reopenSql, /review_status = 'pending_admin_approval'[\s\S]{0,300}'document_pending_approval'/));

  add("P14", "the modal requires a reason and never claims an unsent notification",
    has(f.modal, "Return Order to Under Review")
    && has(f.modal, "Confirm &amp; Notify Provider")
    && hasRe(f.modal, /reopen_order_under_review/)
    && hasRe(f.modal, /trimmedReopenReason\.length >= 5/)
    && has(f.modal, "no provider assigned, so nobody was notified")
    // the old client-side write must be gone
    && !hasRe(f.modal, /action: "manual_reopen_under_review"/));

  add("P15", "the provider reopen email reuses the existing sender with a variant",
    has(f.reissue, 'payload.variant === "manual_reopen"')
    && has(f.reissue, "reasonHtml")
    && has(f.reissue, '.replace(/</g, "&lt;")')
    && has(f.reissue, "manual_reopen_provider_notice"));

  // ── Phase 5 · aggregate consistency + stale responses ────────────────────
  add("P16", "every order mutation invalidates BOTH aggregates through one entry point",
    hasRe(f.page, /const invalidateOrderAggregates = useCallback/)
    && hasRe(f.page, /invalidateOrderAggregates[\s\S]{0,200}setMonthlyKpiReloadToken[\s\S]{0,120}setAggregateReloadToken/)
    // assignment was the reported bug
    && hasRe(f.page, /"Assigned & notified"[\s\S]{0,400}invalidateOrderAggregates\(\)/)
    // the modal funnel
    && hasRe(f.page, /handleOrderUpdated[\s\S]{0,700}invalidateOrderAggregates\(\)/));

  add("P17", "faceted counts react to mutations, not only to filter changes",
    hasRe(f.page, /aggregateReloadToken, facetGuard\]/));

  add("P18", "both aggregate fetches are ordered by a monotonic request guard",
    has(f.guardLib, "createRequestGuard")
    && hasRe(f.guardLib, /isLatest: \(gen(: number)?\) => gen === seq/)
    // The monthly aggregate was folded into ONE period-event aggregate
    // (ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9); its guard is periodKpiGuard.
    // The invariant is unchanged: both aggregate fetches are ordered.
    && hasRe(f.page, /runLatest\(\s*periodKpiGuard/)
    && hasRe(f.page, /runLatest\(facetGuard/)
    // the weaker effect-cleanup flag must be gone from these two paths
    && !hasRe(f.page, /let cancelled = false;[\s\S]{0,400}fetchAdminOrdersRangeEventKpis/)
    && !hasRe(f.page, /let cancelled = false;[\s\S]{0,400}fetchOrderFacetCounts/));

  // The false 409 my own empty-list refusal introduced.
  add("P19", "the deliverable-list dedupe cannot drop a document when signed_letter_url is NULL",
    hasRe(f.notifyDoc, /const signedUrl = order\.signed_letter_url \?\? null/)
    && hasRe(f.notifyDoc, /signedUrl === null\s*\|\|/)
    && !hasRe(f.notifyDoc, /d\.customer_visible && d\.file_url !== order\.signed_letter_url && d\.processed_file_url !== order\.signed_letter_url/)
    // the genuine refusal must still exist
    && has(f.notifyDoc, "no_deliverable_documents"));

  // ── Phase 6 · default sort + filter drawer ───────────────────────────────
  add("P20", "Created date is the DEFAULT basis without overriding a saved choice",
    hasRe(f.page, /localStorage\.getItem\("adminOrdersDateBasis"\)[\s\S]{0,140}isOrderDateBasis\(saved\) \? saved : "created"/)
    && hasRe(f.page, /catch \{ return "created"; \}/)
    && !hasRe(f.page, /isOrderDateBasis\(saved\) \? saved : "activity"/));

  {
    // "Date Basis" also appears in the KPI banner aria-label earlier in the file,
    // so anchor on aria-pressed, which exists ONLY on the moved control.
    const c = code(f.page);
    const drawerAt = c.indexOf("showAdvancedFilters && (");
    const basisAt = c.indexOf("aria-pressed={dateBasis === b}");
    const seqAt = c.indexOf("Sequence Status");
    add("P21", "Date Basis and Sequence live INSIDE the Filters drawer",
      drawerAt > 0 && basisAt > drawerAt && seqAt > drawerAt
      && !hasRe(f.page, /uppercase tracking-wider whitespace-nowrap">Date basis</)
      && has(f.page, "activeFilterCount"));
  }

  // ── Phase 4 · notification categories + order-modal navigation ───────────
  add("P24", "the two employee workflow categories exist end to end",
    has(f.notifSql, "'order_pending_delivery'")
    && has(f.notifSql, "'order_correction'")
    && hasRe(f.notifSql, /order_workflow_state\(o\) = 'pending_delivery'/)
    && hasRe(f.notifSql, /review_status = 'needs_correction'/)
    && has(f.bell, "order_pending_delivery:")
    && has(f.bell, "order_correction:")
    && has(f.bell, 'label: "Pending Delivery"'));

  add("P25", "an order notification opens the order modal on the mapped tab",
    hasRe(f.bell, /onOpenOrder\?: \(orderId: string, modalTab: "overview" \| "documents" \| "comms"\) => void/)
    && hasRe(f.bell, /sms: "comms"/)
    && hasRe(f.bell, /call: "comms"/)
    && hasRe(f.bell, /order_paid: "overview"/)
    && hasRe(f.bell, /order_pending_delivery: "documents"/)
    && hasRe(f.bell, /order_correction: "documents"/)
    && hasRe(f.bell, /item\.entity_type === "order"[\s\S]{0,160}onOpenOrder\(item\.entity_id/)
    && hasRe(f.page, /onOpenOrder=\{\(orderId, modalTab\)/)
    && hasRe(f.page, /orders\.find\(\(o\) => o\.id === orderId\)/)
    && has(f.modal, "initialSection?: Section;"));

  add("P26", "opening a notification preserves the current Orders filters",
    // the handler may set the modal + its tab, but must not touch list state
    !hasRe(f.page, /onOpenOrder=\{\(orderId, modalTab\)[\s\S]{0,700}(setStatusFilter|setSearch)\(/)
    // ambiguous groups fall back to a chooser (the filtered list), never a guess
    && hasRe(f.bell, /g\.items\.length === 1 && openItem\(latest\)/)
    // no order in the loaded snapshot -> Orders tab, never the wrong order
    && hasRe(f.page, /if \(!match\)[\s\S]{0,220}setActiveTab\("orders"\)/));

  // ── LIVE INVERSE of the TEST-only suppression checks ────────────────
  // TEST asserts that three senders DO gate on testNotificationSuppression and
  // that TEST_PROJECT_REF is pinned. On LIVE the requirement is the exact
  // opposite: production notification functions must keep their REAL behaviour,
  // and neither the TEST project ref nor the suppression secret may be
  // introduced by this task.
  //
  // Scoped to the three senders THIS task touches. The shared helper itself is
  // pre-existing on LIVE (imported by admin-review-document,
  // provider-submit-letter and completeAdditionalPetPayment from an earlier
  // rollout) and is deliberately out of scope - it pins the TEST ref internally
  // so it can never suppress on LIVE.
  add("L1", "this task did NOT add TEST suppression to the three senders",
    !has(f.reissueFn, "testNotificationSuppression")
    && !has(f.assignFn, "testNotificationSuppression"));

  add("L2", "no TEST suppression secret is wired into any task-owned source",
    !Object.values(f).some((src) => /TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS/.test(src)));

  add("L3", "the manual reopen calls the LIVE project, never TEST",
    has(f.reopenSql, "cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-reissue")
    // the TEST ref may appear in an explanatory comment, but never in the
    // executable string literal that pg_net actually posts to.
    && !hasRe(f.reopenSql, /v_fn_url\s+text\s*:=\s*'https:\/\/opudhofjbydrljgleofq/));

  // ── §2 · approval-gate reader RBAC ────────────────────────────────────────
  // R1 — admin staff OR service_role only. Customers/providers/anon must get a
  // denial, not a boolean. The EXECUTE grant to `authenticated` is retained on
  // purpose (PostgREST resolves the admin's own session to `authenticated`), so
  // the function BODY is the real authorisation -- same shape as
  // approve_order_document().
  add("R1", "the gate reader is admin-or-service-role only",
    hasRe(f.gateRbacSql, /if not \(public\.is_admin_staff\(\) or coalesce\(auth\.role\(\), ''\) = 'service_role'\) then/)
    && hasRe(f.gateRbacSql, /raise exception[\s\S]{0,120}insufficient_privilege/)
    && hasRe(f.gateRbacSql, /revoke all on function public\.is_provider_approval_gate_enabled\(\) from public, anon/)
    && hasRe(f.gateRbacSql, /grant execute on function public\.is_provider_approval_gate_enabled\(\) to authenticated, service_role/));

  // R2 — THE subtle one. The body ends with `exception when others then return
  // true` (the fail-closed default for an unreadable settings table). If the
  // authorisation RAISE were inside that handler's scope it would be SWALLOWED
  // and the caller would receive `true` instead of a denial -- the disclosure
  // would survive, just harder to see. So insufficient_privilege must be
  // re-raised explicitly, and the check must precede the value read.
  add("R2", "the authorisation denial cannot be swallowed by the fail-closed handler",
    hasRe(f.gateRbacSql, /when insufficient_privilege then\s*raise;/)
    && hasRe(f.gateRbacSql, /when others then\s*return true;/)
    && before(f.gateRbacSql, "is_admin_staff() or coalesce(auth.role()", "select value into v_raw"));

  // R3 — both client callers must treat an unreadable/denied gate as ENABLED, so
  // losing the read can never auto-deliver an unreviewed letter.
  add("R3", "a failed gate read defaults to the gate being ON",
    hasRe(f.submit, /const gateEnabled\s*=\s*gateData !== false/)
    && hasRe(f.gatePanel, /setEnabled\(error \? true : data !== false\)/));

  // INVERTED FOR LIVE. On TEST this asserted the LIVE ref must never appear.
  // Here the LIVE ref is the correct one; what must never appear is the TEST ref
  // in an EXECUTABLE position. Comments explaining the port are allowed (and are
  // valuable), so the check strips line comments before scanning.
  add("P22", "no TEST project ref in executable code",
    !Object.entries(f).some(([, src]) => stripComments(src).includes(TEST_PROJECT_REF_LITERAL)));

  return r;
}

// ── Runtime proof for §9: an OLDER response must never overwrite a newer one ──
// Exercises the REAL src/lib/latestRequestGuard.ts by stripping its TS
// annotations and importing it, rather than reimplementing the rule here (which
// would prove nothing about the shipped code).
async function loadGuardModule() {
  // Compile the REAL module with tsc rather than hand-stripping types. A regex
  // strip that silently half-works would make this test pass against code that
  // is not what ships -- the whole point is to exercise the shipped rule.
  const outDir = mkdtempSync(join(tmpdir(), "pdguard-"));
  // shell:true — on Windows `npx` is a .cmd shim that spawnSync cannot exec
  // directly, and the repo path contains spaces, so arguments are quoted.
  const q = (v) => `"${v}"`;
  const res = spawnSync(
    ["npx", "tsc", q(join(ROOT, FILES.guardLib)), "--outDir", q(outDir),
     "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler"].join(" "),
    { encoding: "utf8", cwd: ROOT, shell: true },
  );
  const jsPath = join(outDir, "latestRequestGuard.js");
  if (!existsSync(jsPath)) {
    throw new Error(
      `tsc did not emit the guard module (status ${res.status}): ${res.error?.message ?? ""} ${res.stderr ?? ""} ${res.stdout ?? ""}`.trim(),
    );
  }
  const mod = await import(pathToFileURL(jsPath).href);
  if (typeof mod.createRequestGuard !== "function" || typeof mod.runLatest !== "function") {
    throw new Error("compiled guard module is missing its exports");
  }
  return mod;
}

async function outOfOrderTest() {
  const { createRequestGuard, runLatest } = await loadGuardModule();
  const guard = createRequestGuard();
  const committed = [];

  let releaseSlow;
  const slow = new Promise((res) => { releaseSlow = () => res("STALE"); });

  // Request A (older, slow) starts first.
  const a = runLatest(guard, () => slow, (v) => committed.push(v));
  // Request B (newer, fast) starts second and finishes FIRST.
  const b = runLatest(guard, () => Promise.resolve("FRESH"), (v) => committed.push(v));
  await b;
  releaseSlow();
  await a;

  const pass = committed.length === 1 && committed[0] === "FRESH";
  return {
    pass,
    detail: `committed=[${committed.join(",")}] (expected exactly [FRESH])`,
  };
}

const CONTROLS = [
  ["P1", "the SQL classifier orders pending_delivery ahead of completed",
    (f) => ({ ...f, stateSql: f.stateSql
      .replace("when o.doctor_status = 'patient_notified'                       then 'completed'", "-- moved")
      .replace("then 'pending_delivery'", "then 'pending_delivery'\n    when o.doctor_status = 'patient_notified' then 'completed'") })],
  ["P2", "the TS mirror drops the pending_delivery branch",
    (f) => ({ ...f, lifecycle: f.lifecycle.replace('if (o.doctor_status === "pending_admin_approval") return "pending_delivery";', "") })],
  ["P3", "Under Review stops excluding Pending Delivery",
    (f) => ({ ...f, classify: f.classify.replace("&& !isPendingDelivery(o)", "") })],
  ["P4", "Completed double-counts a Pending Delivery order",
    (f) => ({ ...f, stateSql: f.stateSql.replace("     and public.order_workflow_state(o) <> 'pending_delivery';", ";") })],
  ["P5", "the Pending Delivery tab falls through to the else fallback",
    (f) => ({ ...f, page: f.page.replace('matchStatus = isPendingDelivery(o);', 'matchStatus = false;') })],
  ["P6", "the banner keeps four columns so the fifth card is clipped",
    (f) => ({ ...f, page: f.page.replace("lg:grid-cols-5", "lg:grid-cols-4") })],
  ["P7", "the customer is shown the internal Pending Delivery label",
    (f) => ({ ...f, customer: f.customer.replace('return { label: "Under Review"', 'return { label: "Pending Delivery"') })],
  ["P8", "the provider keeps the order in the In Progress queue",
    (f) => ({ ...f, provider: f.provider.replace(
      'if (filter === "in_progress") return (doctorStatus === "in_review" || doctorStatus === "approved" || doctorStatus === "thirty_day_reissue")',
      'if (filter === "in_progress") return (doctorStatus === "in_review" || doctorStatus === "approved" || doctorStatus === "thirty_day_reissue" || doctorStatus === "pending_admin_approval")') })],
  ["P9", "a correction no longer hands the order back to the provider",
    (f) => ({ ...f, correctSql: f.correctSql.replace("set doctor_status = 'in_review'", "set doctor_status = doctor_status") })],
  ["P9b", "the correction rewrite loses customer_visible = false",
    // LIVE keeps the DEPLOYED body's compact `correction_note=v_note,
    // customer_visible=false` on one line, so the plant strips just that clause.
    (f) => ({ ...f, correctSql: f.correctSql.replace(/,\s*customer_visible\s*=\s*false/, "") })],
  ["P10", "the reopen takes its actor from an argument",
    (f) => ({ ...f, reopenSql: f.reopenSql.replace("select display_name, role into v_name, v_role from public.current_staff_actor();", "v_name := 'Employee';") })],
  ["P11", "the reason is sanitised instead of rejected",
    (f) => ({ ...f, reopenSql: f.reopenSql.replace("if v ~ '<[a-zA-Z/!]' then", "if false then") })],
  ["P12", "the reopen loses its idempotency gate",
    (f) => ({ ...f, reopenSql: f.reopenSql.replace("if v_order.status = 'under-review' then", "if false then") })],
  ["P13", "the reopen creates a second correction path alongside a pending document",
    (f) => ({ ...f, reopenSql: f.reopenSql.replace("'document_pending_approval'", "'ignored'") })],
  ["P14", "Mark Under Review executes immediately again",
    (f) => ({ ...f, modal: f.modal.replace("Return Order to Under Review", "Reopen") })],
  ["P15", "the reopen email interpolates the reason unescaped",
    (f) => ({ ...f, reissue: f.reissue.replace('.replace(/</g, "&lt;").replace(/>/g, "&gt;")', "") })],
  ["P16", "assignment stops invalidating the KPI (the original bug)",
    (f) => ({ ...f, page: f.page.replace(
      '        invalidateOrderAggregates();\n        setTimeout(() => setAssignMsg', "        setTimeout(() => setAssignMsg") })],
  ["P17", "faceted counts stop reacting to mutations",
    (f) => ({ ...f, page: f.page.replace("aggregateReloadToken, facetGuard]", "facetGuard]") })],
  ["P18", "the period KPI reverts to an unordered effect-cleanup flag",
    (f) => ({ ...f, page: f.page.replace(
      /void runLatest\(\s*periodKpiGuard,[\s\S]{0,400}?\);\n/,
      "let cancelled = false;\n    void (async () => { const k = await fetchAdminOrdersRangeEventKpis({ from: kpiFrom, to: kpiTo }); if (!cancelled) setPeriodKpis(k); })();\n") })],
  ["P19", "the NULL signed_letter_url dedupe hole comes back (false 409)",
    (f) => ({ ...f, notifyDoc: f.notifyDoc.replace(
      /const signedUrl = order\.signed_letter_url \?\? null;[\s\S]*?\.forEach\(\(doc\) => allDocs\.push\(\{ label: doc\.label, url: resolveUrl\(doc\), id: doc\.id \}\)\);/,
      "docs\n    .filter((d) => d.customer_visible && d.file_url !== order.signed_letter_url && d.processed_file_url !== order.signed_letter_url)\n    .forEach((doc) => allDocs.push({ label: doc.label, url: resolveUrl(doc), id: doc.id }));") })],
  ["P20", "the default basis reverts to activity",
    (f) => ({ ...f, page: f.page.replace('isOrderDateBasis(saved) ? saved : "created"', 'isOrderDateBasis(saved) ? saved : "activity"') })],
  ["P21", "the standalone Date basis row returns above the list",
    (f) => ({ ...f, page: f.page.replace(
      '<label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">\n                      Date Basis',
      '<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date basis</span><label className="hidden">\n                      Date Basis') })],
  ["P24", "the Pending Delivery notification category is removed",
    (f) => ({ ...f, bell: f.bell.replaceAll("order_pending_delivery:", "order_pending_delivery_x:") })],
  ["P25", "an order notification reverts to switching to a filtered list",
    (f) => ({ ...f, bell: f.bell.replace(/item\.entity_type === "order" && item\.entity_id && onOpenOrder/, "false") })],
  ["P25b", "Pending Delivery opens Overview instead of Documents",
    (f) => ({ ...f, bell: f.bell.replace('order_pending_delivery: "documents"', 'order_pending_delivery: "overview"') })],
  ["P26", "opening a notification clobbers the operator's status filter",
    (f) => ({ ...f, page: f.page.replace(
      "              setOrderDetailSection(modalTab);",
      '              setStatusFilter("all"); setOrderDetailSection(modalTab);') })],
  ["R1", "the gate reader drops its authorisation check",
    (f) => ({ ...f, gateRbacSql: f.gateRbacSql.replace(
      "if not (public.is_admin_staff() or coalesce(auth.role(), '') = 'service_role') then", "if false then") })],
  ["R2", "the denial is swallowed by the fail-closed handler",
    (f) => ({ ...f, gateRbacSql: f.gateRbacSql.replace("when insufficient_privilege then", "when sqlstate 'XX000' then") })],
  ["R2b", "the value read is reachable BEFORE the authorisation check",
    // Hoists the read above the check -- exactly what before() guards. Anchored
    // on the check line alone (comment lines sit between `begin` and it), and
    // newlines are built with String.fromCharCode(10) because a backslash-n
    // written into this file by tooling has repeatedly become a REAL newline and
    // broken the plant silently.
    (f) => ({ ...f, gateRbacSql: f.gateRbacSql.replace(
      "  if not (public.is_admin_staff()",
      "  select value into v_raw from public.workflow_settings where key = 'x';" + String.fromCharCode(10) + "  if not (public.is_admin_staff()") })],
  ["R3", "the submission path treats a failed gate read as OFF",
    (f) => ({ ...f, submit: f.submit.replace("const gateEnabled = gateData !== false", "const gateEnabled = gateData === true") })],
  ["R3b", "the Settings panel treats a failed read as OFF",
    (f) => ({ ...f, gatePanel: f.gatePanel.replace("setEnabled(error ? true : data !== false)", "setEnabled(data === true)") })],
  // INVERTED FOR LIVE alongside the P22 check itself: the LIVE ref is correct
  // here, so the regression to plant is a TEST ref appearing in EXECUTABLE code.
  ["P22", "a TEST project ref is introduced in executable code",
    (f) => ({ ...f, page: `${f.page}\nconst p = "${TEST_PROJECT_REF_LITERAL}";\n` })],
  ["P22b", "a TEST ref hides on a line that only looks like a comment",
    // Proves the comment-stripper is anchored (^\s*--|//) and cannot be fooled
    // by a trailing comment on an executable line.
    (f) => ({ ...f, page: `${f.page}\nconst q = "${TEST_PROJECT_REF_LITERAL}"; // not a comment line\n` })],
];

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const id = target.replace(/^([A-Z]+\d+)[a-z]$/, "$1");
      const hit = runChecks(mutate(base)).find((x) => x.id === id);
      const tripped = hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : "MISSED "} ${target.padEnd(5)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} ${x.desc}`);

  // §9 runtime proof, against the real module.
  const oo = await outOfOrderTest();
  console.log(`  ${oo.pass ? "PASS" : "FAIL"}  P23  stale response is ignored when two resolve out of order — ${oo.detail}`);

  const failed = results.filter((x) => !x.ok).length + (oo.pass ? 0 : 1);
  const total = results.length + 1;
  console.log(`\n${total - failed}/${total} checks passed.`);
  if (failed && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
