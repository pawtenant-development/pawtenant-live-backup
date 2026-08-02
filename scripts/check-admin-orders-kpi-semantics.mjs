// scripts/check-admin-orders-kpi-semantics.mjs
//
// ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001 — KPI semantics guard.
//
// ROOT CAUSE THIS GUARD PINS: the Lead (Unpaid) card was mapped to
// `leadUnpaidCurrent` — every currently-open lead ever created — and labelled
// "now". On LIVE that displayed **1257**, the entire historical unpaid backlog,
// instead of the 4 leads created in the current America/New_York month. The RPC
// was already correct and already returned the monthly `leadUnpaid` field; only
// the client mapping was wrong.
//
// The three QUEUE cards are correctly "now": queue DEPTH must not reset at month
// rollover — an order paid 31 July and still unassigned on 1 August is still
// unassigned. Lead is an acquisition metric and does reset. Completed is monthly
// and must use the completion timestamp, never created_at/paid_at/updated_at.
//
//   K1  Lead reads the MONTHLY field, not the all-time current field.
//   K2  Lead is labelled "this month".
//   K3  Paid (Unassigned) reads the current-queue field and is labelled "now".
//   K4  Under Review reads the current-queue field and is labelled "now".
//   K5  Pending Delivery reads the current-queue field and is labelled "now".
//   K6  Completed reads the monthly completion field and is labelled "this month".
//   K7  the RPC computes Completed from last_completed_at, never created_at /
//       paid_at / updated_at.
//   K8  the RPC pins America/New_York.
//   K9  the RPC keeps the fully-refunded / unpaid / failed exclusion on all three
//       queue counts.
//   K10 the monthly Lead count excludes archived orders (matching the "now" one).
//   K11 a month-scoped card applies its month range on click so the list
//       reconciles with the number (card↔tab parity).
//   K12 a "now" card still applies its own status filter on click.
//   K13 custom-range mode never shows "now" — it shows the range labels.
//   K14 no KPI value is derived from the loaded browser rows.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-admin-orders-kpi-semantics.mjs             → guard (exit 1 on fail)
//   node scripts/check-admin-orders-kpi-semantics.mjs --warn-only → audit (exit 0)
//   node scripts/check-admin-orders-kpi-semantics.mjs --self-test → prove controls trip

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

/** Newest migration that defines get_admin_orders_monthly_kpis. */
function findKpiMigration() {
  const dir = resolve(ROOT, "supabase/migrations");
  if (!existsSync(dir)) throw new Error("missing supabase/migrations");
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes("get_admin_orders_monthly_kpis"))
    .sort();
  if (hits.length === 0) throw new Error("no migration defines get_admin_orders_monthly_kpis");
  return join("supabase/migrations", hits[hits.length - 1]);
}

const F = {
  page: "src/pages/admin-orders/page.tsx",
  kpiLib: "src/lib/adminOrdersMonthlyKpis.ts",
  rpc: findKpiMigration(),
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF: under autocrlf=true a byte-anchored guard behaves
  // differently on Windows and Linux, and \n-anchored controls silently no-op.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip comments so prose can never satisfy a code assertion. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The object literal for one KPI card, located by its label and bounded by the
 * next card boundary — never an unbounded slice.
 */
function cardBlock(src, label) {
  const c = code(src);
  const needle = `label: "${label}"`;
  // Several labels ("Lead (Unpaid)", "Paid (Unassigned)", "Under Review") also
  // appear in an earlier status-chip/legend map. Walk EVERY occurrence and keep
  // the one that is actually a KPI banner card — identified by carrying both
  // `timeframe:` and `rangeBasis:`. Anchoring on the first match silently read
  // the chip map instead, which is exactly the kind of false PASS/FAIL a guard
  // must not produce.
  let from = 0;
  for (;;) {
    const i = c.indexOf(needle, from);
    if (i < 0) return "";
    from = i + needle.length;
    const start = c.lastIndexOf("{", i);
    if (start < 0) continue;
    let depth = 0, j = start;
    while (j < c.length) {
      if (c[j] === "{") depth++;
      else if (c[j] === "}") {
        depth--;
        if (depth === 0) {
          const block = c.slice(start, j + 1);
          if (/timeframe:/.test(block) && /rangeBasis:/.test(block)) return block;
          break;
        }
      }
      j++;
    }
  }
}

/**
 * The KPI card block for a given PERIOD-EVENT label.
 *
 * ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9 replaced the dual-semantics card shape
 * (label/value + rangeLabel/rangeValue + timeframe + rangeBasis + filter) with a
 * single {label, value, icon, color}. The old locator keyed on `timeframe:` and
 * `rangeBasis:`, both of which are gone.
 */
function cardBlockByLabel(src, label) {
  const c = code(src);
  const i = c.indexOf(`label: "${label}"`);
  if (i < 0) return "";
  const start = c.lastIndexOf("{", i);
  const end = c.indexOf("},", i);
  return start < 0 || end < 0 ? "" : c.slice(start, end + 1);
}

// ── Ownership note ───────────────────────────────────────────────────────────
// The PAGE-facing half of this guard (the old K1–K6, K11–K13: which card reads
// which queue-depth field, what each card does ON CLICK, and how the two KPI
// universes swap labels) protected a contract that no longer exists. The cards
// are display-only and single-semantics now, and that contract is owned by
// scripts/check-admin-orders-ny-clock-kpi-status.mjs (N15–N34), which also
// carries the planted negative controls for it.
//
// What remains here is the half that is still real and still LIVE-critical: the
// SERVER contract of get_admin_orders_monthly_kpis(), plus the invariant that no
// card value is ever derived from the loaded browser rows.
const CHECKS = [
  // ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 restored the
  // OPERATIONAL cards. They are declared by KEY on the page; the human labels
  // live in orderFacetCounts.KPI_CARD_LABEL so the card, the status tab and the
  // result summary can never disagree about what a queue is called.
  ["K1", "the five cards are the OPERATIONAL queues, declared by key", (s) => {
    const c = code(s.page);
    const want = ["lead_unpaid", "paid_unassigned", "under_review", "pending_delivery", "completed"];
    return want.every((k) => c.includes('key: "' + k + '" as KpiCardKey'))
      && !/timeframe:/.test(c);
  }],

  ["K2", "no card reads a queue-DEPTH (*Current) aggregate field", (s) => {
    const c = code(s.page);
    return !/(?:paidUnassigned|underReview|pendingDelivery|leadUnpaid)Current/.test(c);
  }],

  ["K7", "the RPC computes Completed from last_completed_at only", (s) => {
    const c = s.rpc;
    const i = c.indexOf("into v_done");
    if (i < 0) return false;
    const branch = c.slice(i, i + 500);
    return /o\.last_completed_at\s*>=\s*v_ps/.test(branch)
      && !/o\.(?:created_at|paid_at|updated_at)\s*>=\s*v_ps/.test(branch);
  }],

  ["K8", "the RPC pins America/New_York", (s) =>
    /v_tz\s+constant\s+text\s*:=\s*'America\/New_York'/.test(s.rpc)],

  ["K9", "the RPC keeps the refunded/unpaid/failed exclusion on the queue counts", (s) => {
    const c = s.rpc;
    const n = (c.match(/not in \('fully_refunded', 'unpaid', 'failed'\)/g) || []).length;
    return n >= 3;
  }],

  ["K10", "the monthly Lead count excludes archived orders", (s) => {
    const c = s.rpc;
    const i = c.indexOf("into v_lead\n");
    if (i < 0) return false;
    const branch = c.slice(i, i + 400);
    return /o\.status <> 'archived'/.test(branch) && /o\.created_at >= v_ps/.test(branch);
  }],

  ["K14", "no KPI card value is derived from the loaded browser rows", (s) => {
    const c = code(s.page);
    // The value is bound ONCE inside the card map, from the SERVER count result
    // (fetchKpiCardCounts). Previously each card carried its own `value:`
    // property; the shape changed, the invariant did not.
    if (!/const value = kpiCounts\?\.counts\[s\.key\] \?\? null;/.test(c)) return false;
    return !/const value = (?:orders|filtered\w*|loaded\w*|rows)\s*\.\s*(?:filter|length)/.test(c);
  }],
];

// ── Planted negative controls — each MUST trip its own check ────────────────
const CONTROLS = [
  ["K1", "a card key replaced by an event-era metric", (b) => ({
    page: b.page.replace('key: "under_review" as KpiCardKey', 'key: "entered_under_review" as KpiCardKey'),
  })],
  ["K2", "a card value switched back to a queue-depth aggregate field", (b) => ({
    page: b.page.replace("const value = kpiCounts?.counts[s.key] ?? null;", "const value = monthlyKpis?.underReviewCurrent ?? null;"),
  })],
  ["K7", "Completed switched to paid_at in the RPC", (b) => ({
    rpc: b.rpc.replace("where o.last_completed_at >= v_ps", "where o.paid_at >= v_ps"),
  })],
  ["K8", "the New York timezone is removed from the RPC", (b) => ({
    rpc: b.rpc.replace("v_tz        constant text := 'America/New_York';", "v_tz        constant text := 'UTC';"),
  })],
  ["K9", "the refunded exclusion is removed from the queue counts", (b) => ({
    rpc: b.rpc.replace(/not in \('fully_refunded', 'unpaid', 'failed'\)/g, "is not null"),
  })],
  ["K10", "the monthly Lead count stops excluding archived", (b) => ({
    rpc: b.rpc.replace(
      "   where public.order_workflow_state(o) = 'lead'\n     and o.status <> 'archived'\n     and o.created_at >= v_ps",
      "   where public.order_workflow_state(o) = 'lead'\n     and o.created_at >= v_ps"),
  })],
  ["K14", "a card value is derived from the loaded rows", (b) => ({
    page: b.page.replace("const value = kpiCounts?.counts[s.key] ?? null;", "const value = orders.filter(o => !o.paid_at).length;"),
  })],
];

function loadAll(override) {
  const out = {};
  for (const k of Object.keys(F)) out[k] = read(k, override);
  return out;
}

function runChecks(src) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok;
    try { ok = !!fn(src); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-admin-orders-kpi-semantics";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to actually modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
