#!/usr/bin/env node
/**
 * check-admin-orders-kpi-list-parity.mjs
 *
 * ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001.
 *
 * THE TWO DEFECTS THIS PINS SHUT
 *
 * 1. OPERATIONAL QUEUES WERE DATE-GATED. Lead (Unpaid), Paid (Unassigned),
 *    Under Review and Pending Delivery counted "in this queue now AND entered it
 *    inside the active month". An order that entered Pending Delivery on July 30
 *    and was still waiting on August 1 counted as ZERO. Observed on LIVE:
 *    Pending Delivery showed 0 with one order genuinely waiting. A queue is
 *    sized by what is IN it, never by when each item arrived.
 *
 * 2. THE CARD AND THE LIST BUILT THEIR OWN WINDOWS. Both derived (basis, from,
 *    to) from the same inputs in two different files — parity by coincidence.
 *    Now one exported function, kpiCardWindow(), answers for both.
 *
 * HOW THIS GUARD WORKS, AND WHY NOT REGEX
 *
 * It bundles the REAL orderFacetCounts module with the Supabase client replaced
 * by a RECORDING query builder, then runs the real fetchKpiCardCounts() and the
 * real list-predicate entry point and compares the PostgREST calls each one
 * actually emitted. A source scan can only see that a date filter is written
 * somewhere; this sees whether `gte("last_pending_delivery_entered_at", …)` was
 * genuinely applied to the Pending Delivery count — which is the defect.
 *
 * Because both sides are executed rather than described, "the count and the list
 * use the same predicate" is measured, not asserted.
 *
 * `--self-test` plants each real defect and proves the matching check fails.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FACETS = "src/pages/admin-orders/orderFacetCounts.ts";
const PAGE = "src/pages/admin-orders/page.tsx";

/** Single read point — CRLF normalised so \n anchors cannot silently miss. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** Strip COMMENTS ONLY. String literals are real code here (column names). */
function stripComments(src) {
  let out = "";
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const e = src.indexOf("\n", i); const stop = e === -1 ? src.length : e;
      out += blank(src.slice(i, stop)); i = stop;
    } else if (two === "/*") {
      const e = src.indexOf("*/", i + 2); const stop = e === -1 ? src.length : e + 2;
      out += blank(src.slice(i, stop)); i = stop;
    } else { out += src[i]; i++; }
  }
  return out;
}

// ── Load the REAL module with a RECORDING supabase client ───────────────────
const STUB = `
export const recorded = [];
function builder() {
  const ops = [];
  recorded.push(ops);
  const b = {
    ops,
    select: (...a) => { ops.push(["select", a]); return b; },
    eq: (...a) => { ops.push(["eq", a]); return b; },
    neq: (...a) => { ops.push(["neq", a]); return b; },
    is: (...a) => { ops.push(["is", a]); return b; },
    not: (...a) => { ops.push(["not", a]); return b; },
    or: (...a) => { ops.push(["or", a]); return b; },
    gte: (...a) => { ops.push(["gte", a]); return b; },
    lt: (...a) => { ops.push(["lt", a]); return b; },
    lte: (...a) => { ops.push(["lte", a]); return b; },
    gt: (...a) => { ops.push(["gt", a]); return b; },
    ilike: (...a) => { ops.push(["ilike", a]); return b; },
    in: (...a) => { ops.push(["in", a]); return b; },
    order: (...a) => { ops.push(["order", a]); return b; },
    range: (...a) => { ops.push(["range", a]); return b; },
    limit: (...a) => { ops.push(["limit", a]); return b; },
    then: (res) => res({ count: 0, data: [], error: null }),
  };
  return b;
}
export const supabase = { from: (t) => { const b = builder(); b.ops.push(["from", [t]]); return b; } };
`;

/**
 * Bundle the REAL module against the recording stub.
 *
 * The entry is a virtual module that re-exports BOTH the facets module and the
 * recorder. `lib/supabaseClient` and the recorder import resolve to the same
 * (path, namespace), so esbuild emits ONE stub instance and the array the
 * harness reads is the array the module wrote to — the whole point.
 */
async function loadFacets() {
  const stubPlugin = {
    name: "stub-supabase",
    setup(b) {
      b.onResolve({ filter: /(lib\/supabaseClient|^stub-recorder$)/ },
        () => ({ path: "stub-supabase", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
    },
  };
  const entry = `
    export * from ${JSON.stringify(join(ROOT, FACETS).replace(/\\/g, "/"))};
    export { recorded as __recorded } from "stub-recorder";
  `;
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: "js" },
    bundle: true, write: false, format: "esm", platform: "neutral",
    logLevel: "silent", plugins: [stubPlugin],
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const results = [];
const add = (name, ok, detail = "") => results.push({ name, ok, detail });

const DATE_COLUMNS = [
  "created_at", "paid_at", "last_completed_at",
  "last_under_review_entered_at", "last_pending_delivery_entered_at",
  "last_meaningful_activity_at",
];

// ADMIN-ORDERS-UNPAID-LEADS-MONTHLY-KPI-001 (owner decision): Lead moved out of
// the queue set. It is now PERIOD-scoped on created_at, like Completed but on a
// different event. The other three remain all-date queues.
const OPERATIONAL = ["paid_unassigned", "under_review", "pending_delivery"];
const PERIOD_SCOPED = ["lead_unpaid", "completed"];

async function runChecks() {
  results.length = 0;

  const mod = await loadFacets();

  // ── kpiCardWindow: the single window authority ────────────────────────────
  const RANGE = { from: "2026-08-01", to: "2026-08-31" };

  const kinds = mod.KPI_CARD_KIND;
  add("K1  Paid-Unassigned/Under-Review/Pending-Delivery are OPERATIONAL queues",
    OPERATIONAL.every((k) => kinds?.[k] === "operational"),
    JSON.stringify(kinds));
  add("K2  Lead and Completed are the EVENT (period-scoped) cards — and only those",
    PERIOD_SCOPED.every((k) => kinds?.[k] === "event") &&
      Object.entries(kinds ?? {}).filter(([, v]) => v === "event").length === PERIOD_SCOPED.length,
    JSON.stringify(kinds));

  // Operational cards must carry NO range — current inventory across all dates.
  const opWindows = OPERATIONAL.map((k) => [k, mod.kpiCardWindow(k, RANGE)]);
  add("K3  operational cards are windowless (current workload, ALL dates)",
    opWindows.every(([, w]) => w.dateFrom === undefined && w.dateTo === undefined),
    opWindows.map(([k, w]) => `${k}:${w.dateFrom ?? "-"}..${w.dateTo ?? "-"}`).join(" "));

  // …but keep their stage-entry basis, which still drives sort/ribbons/CSV.
  add("K4  operational cards keep their stage-entry basis for sort/grouping",
    mod.kpiCardWindow("under_review", RANGE).dateBasis === "under_review_entered" &&
    mod.kpiCardWindow("pending_delivery", RANGE).dateBasis === "pending_delivery_entered" &&
    mod.kpiCardWindow("paid_unassigned", RANGE).dateBasis === "first_paid");

  // ── Lead: the selected period, on created_at, from the SAME window authority ──
  const leadW = mod.kpiCardWindow("lead_unpaid", RANGE);
  add("K4b Lead is period-scoped on created_at over the SELECTED range",
    leadW.dateBasis === "created" && leadW.dateFrom === RANGE.from && leadW.dateTo === RANGE.to,
    JSON.stringify(leadW));

  const compW = mod.kpiCardWindow("completed", RANGE);
  add("K5  Completed keeps the selected period on the COMPLETION timestamp",
    compW.dateBasis === "completed" && compW.dateFrom === RANGE.from && compW.dateTo === RANGE.to,
    JSON.stringify(compW));

  // ── EXECUTED predicates: what SQL each card actually builds ───────────────
  const rec = mod.__recorded ?? mod.recorded;
  const hasRecorder = Array.isArray(rec);
  add("K6  harness observes the real PostgREST calls (recorder wired)", hasRecorder);

  if (hasRecorder) {
    rec.length = 0;
    await mod.fetchKpiCardCounts({}, RANGE);
    // fetchKpiCardCounts issues the five card counts in KPI_CARD_KEYS order.
    const keys = mod.KPI_CARD_KEYS;
    const perCard = {};
    keys.forEach((k, i) => { perCard[k] = rec[i] ?? []; });

    const dateOps = (ops) =>
      ops.filter(([m, a]) => (m === "gte" || m === "lt" || m === "lte" || m === "gt")
        && DATE_COLUMNS.includes(a[0]));

    const gatedOperational = OPERATIONAL.filter((k) => dateOps(perCard[k] ?? []).length > 0);
    add("K7  no operational card applies ANY date bound (the LIVE defect)",
      gatedOperational.length === 0,
      gatedOperational.map((k) => `${k}:${JSON.stringify(dateOps(perCard[k]).map((o) => o[1][0]))}`).join(" "));

    const compOps = dateOps(perCard.completed ?? []);
    add("K8  Completed count IS bounded, on last_completed_at only",
      compOps.length === 2 && compOps.every(([, a]) => a[0] === "last_completed_at"),
      JSON.stringify(compOps.map((o) => o[1][0])));

    // America/New_York boundaries: Aug 1 EDT = 04:00Z, Sep 1 EDT = 04:00Z.
    const bounds = compOps.map(([, a]) => a[1]);
    add("K9  Completed bounds are America/New_York business days, not UTC midnight",
      bounds.length === 2 &&
      bounds[0] === "2026-08-01T04:00:00.000Z" &&
      bounds[1] === "2026-09-01T04:00:00.000Z",
      JSON.stringify(bounds));

    // ── ADMIN-ORDERS-UNPAID-LEADS-MONTHLY-KPI-001: the same two proofs for Lead ──
    const leadDateOps = dateOps(perCard.lead_unpaid ?? []);
    add("K8b Lead count IS bounded, on created_at only (never paid_at/activity)",
      leadDateOps.length === 2 && leadDateOps.every(([, a]) => a[0] === "created_at"),
      JSON.stringify(leadDateOps.map((o) => o[1][0])));

    const leadBounds = leadDateOps.map(([, a]) => a[1]);
    add("K9b Lead bounds are America/New_York business days, not UTC midnight",
      leadBounds.length === 2 &&
      leadBounds[0] === "2026-08-01T04:00:00.000Z" &&
      leadBounds[1] === "2026-09-01T04:00:00.000Z",
      JSON.stringify(leadBounds));

    // Every card is a server COUNT(head) — never derived from loaded rows.
    add("K10 every KPI count is a server-side COUNT(head), not loaded rows",
      keys.every((k) => (perCard[k] ?? []).some(([m, a]) =>
        m === "select" && a[0] === "id" && a[1] && a[1].head === true && a[1].count === "exact")));

    // LIVE ADAPTATION. On TEST this position asserted that every retail KPI pins
    // order_origin="direct" (Rapid partner isolation). LIVE has NO order_origin
    // column and no partner schema, so the correct assertion here is the exact
    // INVERSE: the shipped KPI path must never emit that predicate, because a
    // filter on a column that does not exist would fail every count query.
    const originOps = keys.flatMap((k) => (perCard[k] ?? []))
      .filter(([, a]) => JSON.stringify(a).includes("order_origin"));
    add("K11 no order_origin predicate is emitted (column absent on LIVE)",
      originOps.length === 0, JSON.stringify(originOps).slice(0, 120));

    // ── PARITY: the clicked list must build the same predicate set ──────────
    // For each card, the list is applyListPredicates(filters, statusFilter=key)
    // with the window kpiCardWindow() returns — the exact object page.tsx feeds it.
    const norm = (ops) => JSON.stringify(
      ops.filter(([m]) => m !== "select" && m !== "from" && m !== "order" && m !== "range")
         .map(([m, a]) => [m, a]).sort());

    const mismatches = [];
    for (const k of keys) {
      rec.length = 0;
      await mod.fetchListScopeTotal({ ...mod.kpiCardWindow(k, RANGE) }, k, {});
      const listOps = rec[0] ?? [];
      if (norm(listOps) !== norm(perCard[k] ?? [])) mismatches.push(k);
    }
    add("K12 KPI count and clicked LIST build an identical predicate set",
      mismatches.length === 0, mismatches.join(", "));

    // The list total must be a server count too — not the rendered page.
    rec.length = 0;
    await mod.fetchListScopeTotal({ ...mod.kpiCardWindow("under_review", RANGE) }, "under_review", {});
    add("K13 list total is a server COUNT(head) (pagination cannot change it)",
      (rec[0] ?? []).some(([m, a]) => m === "select" && a[0] === "id" && a[1]?.head === true));

    // A default 60-day scope on a clicked card would silently shrink the list
    // below the KPI. Prove it is NOT eligible once a card is active.
    add("K14 60-day default scope cannot narrow a selected KPI list",
      mod.isDefaultScopeEligible({ ...mod.kpiCardWindow("pending_delivery", RANGE) }, "pending_delivery") === false);

    // ── Lead (Unpaid): stale failure metadata must not invent an unpaid order ──
    rec.length = 0;
    await mod.fetchListScopeTotal({ ...mod.kpiCardWindow("lead_unpaid", RANGE) }, "lead_unpaid", {});
    const leadOps = rec[0] ?? [];
    const leadSrc = JSON.stringify(leadOps);
    add("K15 Lead predicate keys on payment, never on payment_failure_reason",
      !leadSrc.includes("payment_failure_reason") &&
      leadOps.some(([m, a]) => m === "or" && a[0] === "payment_intent_id.is.null,status.eq.lead"),
      leadSrc.includes("payment_failure_reason") ? "failure metadata leaked into Lead" : "");

    // Paid (Unassigned): paid, unassigned, not completed/refunded/cancelled.
    rec.length = 0;
    await mod.fetchListScopeTotal({ ...mod.kpiCardWindow("paid_unassigned", RANGE) }, "paid_unassigned", {});
    const pu = JSON.stringify(rec[0] ?? []);
    add("K16 Paid (Unassigned) = paid ∧ unassigned ∧ not completed/refunded/cancelled",
      pu.includes('["not",["payment_intent_id","is",null]]') &&
      pu.includes('["is",["doctor_email",null]]') &&
      pu.includes('["is",["doctor_user_id",null]]') &&
      pu.includes('["neq",["status","cancelled"]]') &&
      pu.includes('["neq",["status","refunded"]]') &&
      pu.includes("doctor_status.neq.patient_notified"));
  }

  // ── page.tsx wiring: one window authority, and aggregates follow the rows ──
  const page = stripComments(read(PAGE));
  add("K17 page.tsx derives its effective window from kpiCardWindow()",
    /kpiWindow\s*=\s*activeKpi\s*\?\s*kpiCardWindow\(/.test(page) &&
    /effDateFrom\s*=\s*kpiWindow\s*\?\s*kpiWindow\.dateFrom/.test(page) &&
    /effDateTo\s*=\s*kpiWindow\s*\?\s*kpiWindow\.dateTo/.test(page));

  add("K18 page.tsx no longer builds its own KPI window from kpiFrom/kpiTo",
    !/effDateFrom\s*=\s*activeKpi\s*\?\s*kpiFrom/.test(page) &&
    !/effDateTo\s*=\s*activeKpi\s*\?\s*kpiTo/.test(page));

  // THE STALE-AGGREGATE DEFECT: a realtime push patched the row and left the
  // cards frozen, which is what produced the reported 2-vs-1 and 0-vs-1.
  // Scoped to the UPDATE handler specifically. Slicing from the first
  // "postgres_changes" swept in the INSERT handler, which has its own
  // invalidate call — so deleting the UPDATE one still passed. The UPDATE
  // handler is the one that carries the reported defect (a provider submitting
  // a letter moves the row without creating one).
  const rtUpdateStart = page.indexOf('event: "UPDATE", schema: "public", table: "orders"');
  const rtUpdate = rtUpdateStart === -1
    ? ""
    : page.slice(rtUpdateStart, page.indexOf(".subscribe()", rtUpdateStart));
  // LIVE ADAPTATION. LIVE already invalidated on a realtime push, through the
  // COALESCED scheduleAggregateInvalidation() (one invalidation per 2.5s burst)
  // rather than TEST's direct call. LIVE's version is the better one and this
  // rollout deliberately did NOT overwrite it, so the assertion accepts either.
  add("K19 realtime order UPDATE pushes invalidate the KPI/facet aggregates",
    rtUpdateStart !== -1 && /(scheduleAggregateInvalidation|invalidateOrderAggregates)\(\)/.test(rtUpdate),
    "a realtime row patch must not leave the counts describing a stale world");

  // LIVE ADAPTATION. TEST filters pushes by lifecycle column to avoid a refetch
  // storm; LIVE achieves the same end by COALESCING them on a timer, which does
  // not depend on payload.old at all. Assert LIVE's mechanism, not TEST's.
  add("K20 realtime invalidation is coalesced, so a burst cannot storm the counts",
    /const scheduleAggregateInvalidation = useCallback/.test(page) &&
    /externalInvalidateTimerRef\.current !== null\) return;/.test(page));

  // LIVE ADAPTATION. TEST needed a fail-safe because it inspected `payload.old`,
  // which carries only the primary key at REPLICA IDENTITY DEFAULT and so can
  // never prove a lifecycle column changed. LIVE never inspects `old` — it
  // invalidates on ANY orders push — making it fail-safe by construction. Pin
  // that it does not start conditionally skipping.
  add("K21 LIVE invalidates on ANY orders push (no payload.old dependence)",
    rtUpdateStart !== -1 && !/payload\.old/.test(rtUpdate) && !/AGGREGATE_RELEVANT/.test(rtUpdate));

  // The cards must be re-read at the same moment the rows are, or they describe
  // an older world than the list beside them — the reported 2-vs-"1 of 1".
  add("K23 KPI counts refetch whenever the LIST refetches (no stale card)",
    /\}, \[listQueryKey, kpiFrom, kpiTo,/.test(page));

  // Truthful copy: an operational card must not be labelled as a period count.
  add("K22 banner copy distinguishes all-date queues from the period cards",
    /activeKpiKind === "operational"/.test(page) &&
    /in this queue right now — all dates/.test(page) &&
    /queues — Paid, Under Review, Pending Delivery: now, all dates/.test(page) &&
    /Lead \+ Completed: /.test(page));

  // The two EVENT cards are period-scoped on DIFFERENT events, so the banner
  // must not call a Lead arrival a "completion".
  add("K24 Lead banner says CREATED (not completed) for the selected period",
    /activeKpi === "lead_unpaid" \? "created" : "completed"/.test(page));

  // The visible description must state Lead is the selected period, and must not
  // still describe it as all-date workload.
  add("K25 tooltip states Lead is period-scoped, not an all-date queue",
    /Lead counts unpaid leads CREATED in the period/.test(page) &&
    /Lead = unpaid leads created in the selected period/.test(page) &&
    !/Lead \(Unpaid\), Paid \(Unassigned\), Under Review and Pending Delivery are WORK QUEUES/.test(page));
}

function report(title) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${title}`);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  [${r.detail}]`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  return failed.length;
}

const SELF = process.argv.includes("--self-test");

if (SELF) {
  const CONTROLS = [
    { name: "KPI uses lifecycle-entry date while the list uses current status", file: FACETS, expect: "K7",
      from: "  if (KPI_CARD_KIND[key] === \"operational\") {\n    return { dateBasis, dateFrom: undefined, dateTo: undefined };\n  }",
      to: "  if (false) {\n    return { dateBasis, dateFrom: undefined, dateTo: undefined };\n  }" },
    { name: "Pending Delivery KPI excludes an older active order (queue re-gated)", file: FACETS, expect: "K3",
      from: "  pending_delivery: \"operational\",",
      to: "  pending_delivery: \"event\"," },
    { name: "Completed KPI uses payment date instead of completion date", file: FACETS, expect: "K8",
      from: "  completed: \"completed\",\n};\n\n// ─── ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001",
      to: "  completed: \"first_paid\",\n};\n\n// ─── ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001" },
    { name: "KPI counts only the currently loaded page (not a server count)", file: FACETS, expect: "K10",
      from: 'return supabase.from("orders").select("id", { count: "exact", head: true });',
      to: 'return supabase.from("orders").select("id", { count: "exact", head: false }).limit(50);' },
    { name: "Lead includes a paid order via stale failure metadata", file: FACETS, expect: "K15",
      from: '    case "lead_unpaid": // isLeadOrder\n      return q.or("payment_intent_id.is.null,status.eq.lead");',
      to: '    case "lead_unpaid": // isLeadOrder\n      return q.or("payment_intent_id.is.null,status.eq.lead,payment_failure_reason.not.is.null");' },
    { name: "UTC boundaries used instead of America/New_York", file: "src/lib/orderLifecycle.ts", expect: "K9",
      from: "export function businessDayStartUtcIso",
      to: "export function businessDayStartUtcIso_UNUSED_SHADOW" },
    // LIVE ADAPTATION of TEST's partner-leak control: here the defect is the
    // opposite one — a promoted line that references a column LIVE does not have.
    { name: "an order_origin reference is reintroduced (column absent on LIVE)", file: FACETS, expect: "K11",
      from: '  if (f.payment === "paid") q = q.not("payment_intent_id", "is", null);',
      to: '  q = q.eq("order_origin", "direct");\n  if (f.payment === "paid") q = q.not("payment_intent_id", "is", null);' },
    { name: "count and list windows drift apart again", file: PAGE, expect: "K17",
      from: "  const kpiWindow = activeKpi ? kpiCardWindow(activeKpi, { from: kpiFrom, to: kpiTo }) : null;",
      to: "  const kpiWindow = activeKpi ? { dateBasis: KPI_CARD_BASIS[activeKpi], dateFrom: kpiFrom, dateTo: kpiTo } : null;" },
    // LIVE ADAPTATION: LIVE's UPDATE handler ends in the coalesced scheduler.
    { name: "realtime push stops invalidating the aggregates (the reported bug)", file: PAGE, expect: "K19",
      from: "          // called invalidateOrderAggregates().\n          scheduleAggregateInvalidation();",
      to: "          // called invalidateOrderAggregates().\n          /* aggregates left stale */" },
    // LIVE ADAPTATION of TEST's REPLICA-IDENTITY control. LIVE is fail-safe
    // because it never inspects payload.old; the equivalent defect here is
    // making invalidation conditional on an `old` payload that cannot prove
    // anything (it carries only the primary key).
    { name: "invalidation becomes conditional on a payload.old comparison", file: PAGE, expect: "K21",
      from: "          // called invalidateOrderAggregates().\n          scheduleAggregateInvalidation();",
      to: "          // called invalidateOrderAggregates().\n          if (payload.old) scheduleAggregateInvalidation();" },
    { name: "cards stop refetching when the list refetches (stale card returns)", file: PAGE, expect: "K23",
      from: "  }, [listQueryKey, kpiFrom, kpiTo,",
      to: "  }, [kpiFrom, kpiTo," },
    // ── ADMIN-ORDERS-UNPAID-LEADS-MONTHLY-KPI-001 controls ────────────────
    // 1. The Lead month restriction removed outright (back to all-date backlog).
    { name: "Lead month restriction removed (all-date backlog returns)", file: FACETS, expect: "K2",
      from: '  lead_unpaid: "event",',
      to: '  lead_unpaid: "operational",' },
    // 2. Month applied to the CARD but not the LIST: the card keeps kpiCardWindow
    //    while page.tsx hard-codes a windowless Lead.
    { name: "month on the CARD but not the LIST (Lead list loses the window)", file: PAGE, expect: "K17",
      from: "  const kpiWindow = activeKpi ? kpiCardWindow(activeKpi, { from: kpiFrom, to: kpiTo }) : null;",
      to: "  const kpiWindow = activeKpi ? (activeKpi === \"lead_unpaid\" ? { dateBasis: \"created\", dateFrom: undefined, dateTo: undefined } : kpiCardWindow(activeKpi, { from: kpiFrom, to: kpiTo })) : null;" },
    // 3. Month applied to the LIST but not the CARD: the count builder stops
    //    using the shared window for Lead.
    { name: "month on the LIST but not the CARD (Lead count loses the window)", file: FACETS, expect: "K8b",
      from: "              ...kpiCardWindow(k, range),",
      to: "              ...(k === \"lead_unpaid\" ? { dateBasis: \"created\" } : kpiCardWindow(k, range))," },
    // 5. Lead measured on the wrong timestamp.
    { name: "Lead uses the wrong timestamp (paid_at instead of created_at)", file: FACETS, expect: "K8b",
      from: '  lead_unpaid: "created",',
      to: '  lead_unpaid: "first_paid",' },
    // 7. A paid operational queue accidentally made monthly.
    { name: "a paid operational queue accidentally becomes monthly", file: FACETS, expect: "K7",
      from: '  paid_unassigned: "operational",',
      to: '  paid_unassigned: "event",' },
    { name: "banner re-labels a work queue as a period count", file: PAGE, expect: "K22",
      from: "                        ? \"in this queue right now — all dates\"",
      to: "                        ? \"in the selected period\"" },
  ];

  let missed = 0;
  const originals = new Map();
  try {
    await runChecks();
    if (report("BASELINE (must be clean before planting)")) {
      console.log("\n  baseline dirty — controls would be meaningless");
      missed++;
    } else {
      for (const c of CONTROLS) {
        const path = join(ROOT, c.file);
        if (!originals.has(c.file)) originals.set(c.file, readFileSync(path, "utf8"));
        const src = read(c.file);
        if (!src.includes(c.from)) { console.log(`  ANCHOR MISSING  ${c.name}`); missed++; continue; }
        writeFileSync(path, src.replace(c.from, c.to), "utf8");
        let caught = false;
        try {
          await runChecks();
          const t = results.find((r) => r.name.startsWith(c.expect));
          caught = Boolean(t && !t.ok);
        } catch { caught = true; } // a control that breaks the module counts as detected
        console.log(`  ${caught ? "DETECTED" : "MISSED  "}  ${c.name}  → ${c.expect}`);
        if (!caught) missed++;
        writeFileSync(path, originals.get(c.file), "utf8");
      }
    }
  } finally {
    // NEVER process.exit() here — `finally` would be skipped and a planted
    // mutation would stay on disk.
    for (const [rel, content] of originals) writeFileSync(join(ROOT, rel), content, "utf8");
  }

  await runChecks();
  const after = report("AFTER RESTORE (must be clean)");
  console.log(`\nSELF-TEST: ${CONTROLS.length - missed}/${CONTROLS.length} controls detected${after ? ", RESTORE FAILED" : ", tree restored"}`);
  process.exitCode = missed || after ? 1 : 0;
} else {
  await runChecks();
  process.exitCode = report("ADMIN ORDERS · KPI-TO-LIST CONSISTENCY") ? 1 : 0;
}
