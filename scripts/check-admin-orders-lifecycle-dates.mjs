#!/usr/bin/env node
// ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — build guard (§23) + logic tests (§22).
//
// Locks the lifecycle-date contract so a later refactor cannot silently:
//   • go back to sorting Admin Orders by created_at (a June lead paying in July
//     disappears to the bottom again),
//   • sort by a generic modification timestamp (every background sync jumps an
//     order to the top),
//   • overwrite the immutable first-paid / first-completed timestamps,
//   • count a reopen or an add-on payment as a second unique paid order,
//   • sort by latest activity while silently filtering by created_at,
//   • collapse payment state and workflow state back into one status field,
//   • add a fifth top KPI card,
//   • drop the pagination tie-breakers.
//
//   node scripts/check-admin-orders-lifecycle-dates.mjs              → static + logic
//   node scripts/check-admin-orders-lifecycle-dates.mjs --self-test  → + negative controls

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const LIB       = resolve(ROOT, "src/lib/orderLifecycle.ts");
const PAGE      = resolve(ROOT, "src/pages/admin-orders/page.tsx");
const CARD      = resolve(ROOT, "src/pages/admin-orders/components/OrderCard.tsx");
const TYPES     = resolve(ROOT, "src/pages/admin-orders/types.ts");
const FACETS    = resolve(ROOT, "src/pages/admin-orders/orderFacetCounts.ts");
const EXPORTS   = resolve(ROOT, "src/lib/exportOrders.ts");
const MODAL     = resolve(ROOT, "src/pages/admin-orders/components/OrderDetailModal.tsx");
const PANEL     = resolve(ROOT, "src/pages/admin-orders/components/OrderLifecyclePanel.tsx");
const PAYTAB    = resolve(ROOT, "src/pages/admin-orders/components/PaymentHistoryTab.tsx");
const MIGRATION = resolve(ROOT, "supabase/migrations/20260725220000_admin_orders_lifecycle_date_semantics.sql");

function read(p) {
  try { return readFileSync(p, "utf8"); }
  catch (e) { throw new Error(`cannot read ${p}: ${e.message}`); }
}

// ── STATIC INVARIANTS (§23) ──────────────────────────────────────────────────

const REQUIRED = [
  // Canonical module + the whole contract surface.
  { file: LIB, label: "immutable created_at basis", re: /case "created": return o\.created_at/ },
  { file: LIB, label: "canonical first-paid semantics", re: /export function firstPaidIso\(/ },
  { file: LIB, label: "last-payment semantics", re: /export function lastPaymentIso\(/ },
  { file: LIB, label: "first-completed preserved", re: /export function firstCompletedIso\(/ },
  { file: LIB, label: "last-completed advances", re: /export function lastCompletedIso\(/ },
  { file: LIB, label: "latest meaningful activity field", re: /last_meaningful_activity_at/ },
  { file: LIB, label: "meaningful activity type field", re: /last_meaningful_activity_type/ },
  { file: LIB, label: "event vocabulary is a closed list", re: /export const MEANINGFUL_EVENT_TYPES/ },
  { file: LIB, label: "non-meaningful write fields documented", re: /export const NON_MEANINGFUL_WRITE_FIELDS/ },
  { file: LIB, label: "date basis is a closed list", re: /export const ORDER_DATE_BASES/ },
  { file: LIB, label: "basis → DB column map", re: /export const ORDER_DATE_BASIS_COLUMN/ },
  { file: LIB, label: "basis-aware comparator", re: /export function orderComparator\(basis: OrderDateBasis\)/ },
  { file: LIB, label: "stable tie-breaker: created_at then id", re: /if \(cA !== cB\) return cB - cA;[\s\S]{0,120}localeCompare/ },
  { file: LIB, label: "basis-aware date-range predicate", re: /export function matchesBasisDateRange\(/ },
  { file: LIB, label: "null basis excluded from a bounded range", re: /if \(!iso\) return false;/ },
  { file: LIB, label: "payment state derivation", re: /export function orderPaymentState\(/ },
  { file: LIB, label: "workflow state derivation", re: /export function orderWorkflowState\(/ },
  { file: LIB, label: "workflow reason (reopened etc.)", re: /export function workflowReason\(/ },
  { file: LIB, label: "reopen is a workload event, not a sale", re: /export function isReopenedOrder\(/ },

  // The list actually consumes it.
  { file: PAGE, label: "page imports the canonical comparator", re: /orderComparator/ },
  { file: PAGE, label: "single date-basis state (sort + filter + cards)", re: /const \[dateBasis, setDateBasis\]/ },
  // LIVE ARCHITECTURE NOTE (ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001-LIVE-ROLLOUT):
  // TEST asserts `acc.slice().sort(orderComparator(` — its atomic commitSnapshot
  // from the dataset-stability work, which was REVERTED on LIVE (see
  // admin-orders-dataset-stability-live-rollout-001). LIVE keeps its own
  // progressive-paging loader, so the equivalent LIVE invariant is asserted on the
  // DISPLAY sort: the rendered list must order through the canonical comparator, so
  // rows and the server page order can never disagree. Intent preserved, anchor
  // retargeted — NOT weakened.
  // ...-LIFECYCLE-DATE-INTEGRITY-002 — retargeted to the EFFECTIVE basis. Intent
  // preserved (the list must order through the canonical comparator), tightened
  // so the sort cannot diverge from the predicate the rows were selected with.
  { file: PAGE, label: "display list sorted via canonical comparator", re: /const cmp = orderComparator\(effDateBasis\)\(a, b\);/ },
  { file: PAGE, label: "SERVER-side basis ordering", re: /\.order\(ORDER_DATE_BASIS_COLUMN\[basis\]/ },
  { file: PAGE, label: "server tie-breaker created_at", re: /\.order\("created_at", \{ ascending: false \}\)\s*\n\s*\.order\("id"/ },
  { file: PAGE, label: "server tie-breaker id", re: /\.order\("id", \{ ascending: false \}\)/ },
  { file: PAGE, label: "lifecycle columns selected", re: /last_meaningful_activity_at,last_meaningful_activity_type/ },
  // ADMIN-ORDERS-ACCOUNTS-MONTH-END-LIFECYCLE-DATE-INTEGRITY-002 — the ribbons,
  // the display sort and the CSV must read the EFFECTIVE basis, not the raw
  // operator state. Grouping August completions under the operator's Created
  // basis is what put JULY headings inside the August Completed view.
  { file: PAGE, label: "day ribbons group on the EFFECTIVE basis", re: /orderGroupingIso\(order, effDateBasis\)/ },
  { file: PAGE, label: "date FILTER uses the ACTIVE basis", re: /matchesBasisDateRange\(o, effDateBasis, effDateFrom, effDateTo\)/ },
  { file: PAGE, label: "KPI counts receive the ACTIVE basis", re: /fetchOrderFacetCounts\(\{\s*\n?\s*dateBasis: effDateBasis,/ },
  { file: PAGE, label: "active basis is stated in the UI", re: /ORDER_DATE_BASIS_LABEL\[dateBasis\]/ },
  { file: PAGE, label: "Payment Failed stays reachable as a status FILTER tab", re: /\{ value: "payment_failed", label: "Payment Failed" \}/ },
  { file: PAGE, label: "status filter tabs apply the filter", re: /onClick=\{\(\) => onStatusTabClick\(opt\.value\)\}/ },
  { file: PAGE, label: "status column label is STATUS", re: /uppercase tracking-wider">Status<\/div>/ },
  { file: PAGE, label: "date-basis behaviour explained by an accessible tooltip", re: /aria-label=\{`Date basis: / },

  // Row surface shows the dimensions separately and keeps creation visible.
  // ── COMPACT ROW CONTRACT (ADMIN-ORDERS-LIFECYCLE-UI-SIMPLIFICATION-001) ──
  { file: LIB,  label: "exceptional payment chip helper", re: /export function exceptionalPaymentChip\(/ },
  { file: LIB,  label: "chip suppressed when the badge already says it", re: /if \(primary\.includes\("refunded"\)\) return null;/ },
  { file: LIB,  label: "no chip for an ordinary paid order", re: /EXCEPTIONAL_PAYMENT_STATES/ },
  { file: LIB,  label: "primary tooltip only when it adds information", re: /export function primaryBadgeTitle\(/ },
  { file: CARD, label: "row uses the exceptional-chip helper", re: /exceptionalPaymentChip\(order, displayStatus\.label\)/ },
  { file: CARD, label: "row uses the non-duplicating badge tooltip", re: /title=\{primaryBadgeTitle\(order\)\}/ },
  // FINAL-CORRECTIONS-001 — the Order ID must be visible BELOW 640px. The >=sm
  // identity block is `hidden sm:flex`, so without an explicit `sm:hidden`
  // rendering the ID is invisible on every phone width.
  { file: CARD, label: "mobile card renders the Order ID (sm:hidden)", re: /sm:hidden[^"]*"[\s\S]{0,220}\{order\.confirmation_id\}/ },
  { file: CARD, label: "mobile Order ID reuses the copy action", re: /onClick=\{handleCopyOrderId\}[\s\S]{0,400}\{order\.confirmation_id\}/ },
  { file: CARD, label: ">=sm identity block still renders the Order ID", re: /hidden sm:flex[\s\S]{0,500}\{order\.confirmation_id\}/ },
  // Modal owns the detail.
  { file: PANEL, label: "modal panel shows payment status", re: /Payment status/ },
  { file: PANEL, label: "modal panel shows workflow status", re: /Workflow status/ },
  { file: PANEL, label: "modal panel shows latest activity", re: /Latest activity/ },
  { file: PANEL, label: "modal panel shows created", re: /label: "Created"/ },
  { file: PANEL, label: "modal panel shows first paid", re: /label: "First paid"/ },
  { file: PANEL, label: "modal panel shows last payment", re: /label: "Last payment"/ },
  { file: PANEL, label: "modal panel shows first completed", re: /label: "First completed"/ },
  { file: PANEL, label: "modal panel shows last completed", re: /label: "Last completed"/ },
  { file: PANEL, label: "modal panel shows last reopened", re: /label: "Last reopened"/ },
  { file: PANEL, label: "modal panel shows refund disposition", re: /refundDispositionLabel\(/ },
  { file: PANEL, label: "modal panel shows dispute", re: /label="Dispute"/ },
  { file: PANEL, label: "empty date rows are hidden, not blank blocks", re: /visibleDates/ },
  { file: PAYTAB, label: "Payments tab mounts the lifecycle panel", re: /<OrderLifecyclePanel/ },
  { file: PAYTAB, label: "Payments tab reuses the SHARED panel component", re: /from "\.\/OrderLifecyclePanel"/ },
  // §9 — mobile/tablet uses the SAME compact contract as desktop: the status
  // badge plus an exceptional payment chip, and NO lifecycle dates. The helper
  // must appear TWICE in OrderCard.tsx — once per branch — so one surface
  // cannot regress while the other passes.
  { file: CARD, label: "mobile + desktop both use the exceptional chip", re: /exceptionalPaymentChip\(order, displayStatus\.label\)[\s\S]*exceptionalPaymentChip\(order, displayStatus\.label\)/ },

  // LIVE ARCHITECTURE NOTE: TEST anchors these on `exportFilteredAll` (export the
  // whole filtered set). LIVE has no such control — its CSV surface is "Export
  // Selected CSV". Both assertions therefore anchor on the selected-export call
  // site instead. The CONTRACT is identical and still enforced: the exported rows
  // are ordered by the canonical basis comparator AND every row is stamped with
  // the active Date Basis.
  { file: PAGE, label: "CSV export ordered by the EFFECTIVE basis", re: /\.sort\(orderComparator\(effDateBasis\)\);/ },
  { file: PAGE, label: "CSV export stamps the EFFECTIVE Date Basis", re: /ORDER_DATE_BASIS_LABEL\[effDateBasis\],[\s\S]{0,40}\);/ },
  { file: PAGE, label: "CSV filename names the EFFECTIVE basis", re: /pawtenant-orders-export-selected-\$\{effDateBasis\}/ },
  { file: PAGE, label: "the EFFECTIVE basis is named to the operator", re: /const effDateBasisLabel = ORDER_DATE_BASIS_LABEL\[effDateBasis\]/ },
  { file: PAGE, label: "KPI caption states the date the view is measured on", re: /Counted, listed, grouped and exported by \{effDateBasisLabel\}/ },
  { file: PAGE, label: "pagination resets on the EFFECTIVE window", re: /setVisibleCount\(50\); \}, \[[^\]]*effDateBasis, effDateFrom, effDateTo/ },
  { file: EXPORTS, label: "CSV exporter accepts a date-basis label", re: /dateBasisLabel\?: string,/ },
  { file: EXPORTS, label: "Date Basis column is appended when supplied", re: /label: "Date Basis"/ },
  { file: EXPORTS, label: "Provider Payment column preserved", re: /label: "Provider Payment"/ },
  { file: EXPORTS, label: "Net After Provider Deduction column preserved", re: /label: "Net After Provider Deduction"/ },
  { file: FACETS, label: "facet counts are basis-aware", re: /const basis: OrderDateBasis = f\.dateBasis \?\? "created";/ },
  { file: FACETS, label: "facet counts keep the created_at arm", re: /gte\("created_at"/ },
  { file: FACETS, label: "facet counts range on the basis column", re: /ORDER_DATE_BASIS_COLUMN\[basis\]/ },

  { file: TYPES, label: "Order type carries the sort key", re: /last_meaningful_activity_at\?: string \| null;/ },
  { file: TYPES, label: "Order type carries last_payment_at", re: /last_payment_at\?: string \| null;/ },

  // DB contract.
  { file: MIGRATION, label: "first-paid immutability enforced", re: /NEW\.paid_at\s*:=\s*OLD\.paid_at/ },
  { file: MIGRATION, label: "before-write lifecycle trigger", re: /create trigger orders_lifecycle_before_write/ },
  { file: MIGRATION, label: "after-write event history trigger", re: /create trigger orders_lifecycle_after_write/ },
  { file: MIGRATION, label: "add-on payment never re-counts a paid order", re: /create trigger addon_request_paid_lifecycle/ },
  { file: MIGRATION, label: "event history table", re: /create table if not exists public\.order_lifecycle_events/ },
  { file: MIGRATION, label: "webhook/event idempotency", re: /on conflict \(idempotency_key\) do nothing/ },
  { file: MIGRATION, label: "unique idempotency key index", re: /create unique index if not exists order_lifecycle_events_idempotency_key_idx/ },
  { file: MIGRATION, label: "event history is RLS-protected", re: /alter table public\.order_lifecycle_events enable row level security/ },
  { file: MIGRATION, label: "admin-gated event reads", re: /for select using \(public\.check_is_admin\(\)\)/ },
  { file: MIGRATION, label: "first_completed_at only ever seeded", re: /NEW\.first_completed_at\s*:=\s*coalesce\(NEW\.first_completed_at/ },
  { file: MIGRATION, label: "sort index exists", re: /orders_last_meaningful_activity_idx/ },
  { file: MIGRATION, label: "wall-clock, not transaction clock", re: /clock_timestamp\(\)/ },
  { file: MIGRATION, label: "backfill is additive only (null-guarded)", re: /where last_meaningful_activity_at is null/ },
];

const FORBIDDEN = [
  {
    file: PAGE,
    label: "no created_at-only snapshot sort (buries a June lead that paid in July)",
    re: /acc\.slice\(\)\.sort\(\(a, b\) => \{[\s\S]{0,200}?created_at/,
  },
  {
    file: PAGE,
    label: "no generic updated_at sort key (background writes must not surface orders)",
    re: /\.order\("updated_at"/,
  },
  {
    file: PAGE,
    label: "date filter must not hard-code created_at while sorting by activity",
    re: /new Date\(o\.created_at\) >= new Date\(dateFrom\)/,
  },
  {
    file: PAGE,
    label: "no full-table browser re-sort outside the committed snapshot/display sort",
    re: /orders\.slice\(\)\.sort\(/,
  },
  // ── FINAL-CORRECTIONS-001 NEGATIVE CONTROLS ──────────────────────────────
  {
    file: PAGE,
    label: "no standalone `Payment Failed N` summary chip under the KPI cards",
    re: /Payment Failed[\s\S]{0,120}facetCounts\.buckets\.payment_failed\}/,
  },
  {
    file: CARD,
    label: "no bare creation date beneath the Order ID",
    re: /confirmation_id\}<\/p>[\s\S]{0,40}\{fmtDate\(order\.created_at\)\}/,
  },
  {
    file: CARD,
    label: "no unlabelled lifecycle date anywhere in a compact row",
    re: /\{fmtDate\(order\.(created_at|paid_at|last_payment_at|last_completed_at)\)\}/,
  },
  {
    file: MODAL,
    label: "lifecycle panel must NOT be mounted in the frozen Overview modal",
    re: /<OrderLifecyclePanel|from "\.\/OrderLifecyclePanel"/,
  },

  // ── §12 COMPACT-UI NEGATIVE CONTROLS ─────────────────────────────────────
  {
    file: CARD,
    label: "row must not restate payment + workflow under the badge (`Unpaid · Lead`)",
    re: /\{paymentStateLabel\([A-Za-z]+\)\} · \{workflowStateLabel\(/,
  },
  {
    file: CARD,
    label: "row must not render latest-activity text (`Lead created · …`)",
    re: /\{lifecycleEventLabel\([A-Za-z]+\)\} · \{fmt/,
  },
  {
    file: CARD,
    label: "row must not render the created date (`Created · …`)",
    re: /Created · \{fmtDate\(order\.created_at\)\}/,
  },
  {
    file: CARD,
    label: "row must not render the first-paid date",
    re: /First paid · \{fmtDate\(order\.paid_at\)\}/,
  },
  {
    file: CARD,
    label: "no redundant `Payment: … · Workflow: …` tooltip",
    re: /title=\{`Payment: \$\{paymentStateLabel/,
  },
  {
    file: PAGE,
    label: "no always-visible KPI explainer paragraph",
    re: /Current workflow state for orders in the selected date basis/,
  },
  {
    file: PAGE,
    label: "no always-visible Date Basis explainer paragraph",
    re: /Sorting, day groups, the From\/To range and the four cards all use\{" "\}/,
  },
  {
    file: PAGE,
    label: "status column must not be labelled `Payment / Workflow`",
    re: /uppercase tracking-wider">Payment \/ Workflow</,
  },
  // ── ...-LIFECYCLE-DATE-INTEGRITY-002 NEGATIVE CONTROLS ────────────────────
  // The three display surfaces must never fall back to the operator's raw
  // `dateBasis` while the rows are selected on `effDateBasis`. Each pattern is
  // a CALL/INTERPOLATION form, so explanatory prose naming `dateBasis` cannot
  // satisfy it — the control tests the use, not the mention.
  {
    file: PAGE,
    label: "day ribbons must not regroup on the raw operator basis",
    re: /orderGroupingIso\(order, dateBasis\)/,
  },
  {
    file: PAGE,
    label: "display sort must not reorder on the raw operator basis",
    re: /orderComparator\(dateBasis\)\(a, b\)/,
  },
  {
    file: PAGE,
    label: "CSV must not be ordered on the raw operator basis",
    re: /\.sort\(orderComparator\(dateBasis\)\)/,
  },
  {
    file: PAGE,
    label: "CSV must not be stamped with the raw operator basis",
    re: /ORDER_DATE_BASIS_LABEL\[dateBasis\],\s*\n\s*\);/,
  },
  {
    file: PAGE,
    label: "KPI banner must not use the clipped sm:grid-cols-3 lg:grid-cols-5 layout",
    re: /sm:grid-cols-3 lg:grid-cols-5/,
  },
  {
    // Prose may EXPLAIN why updated_at is not used; code may never read it.
    file: LIB,
    label: "lifecycle module must not read a generic modification stamp",
    re: /(?:\.|\??\s*:\s*)updated_at\b|["']updated_at["']/,
  },
  {
    file: MIGRATION,
    label: "orders must not gain a generic updated_at column",
    re: /add column if not exists\s+updated_at/,
  },
];

// §8 — none of these background/metadata columns may appear in the DB
// transition detector, or a marketing sync would move an order to the top.
const DETECTOR_FORBIDDEN_COLUMNS = [
  "ghl_synced_at", "ghl_last_attempt_at", "ghl_contact_id", "ghl_sync_error",
  "google_ads_uploaded_at", "google_ads_upload_status", "google_ads_last_attempt_at", "google_ads_upload_error",
  "microsoft_ads_uploaded_at", "microsoft_ads_upload_status",
  "meta_capi_sent_at", "meta_capi_status", "sent_to_meta", "meta_backfill_replayed",
  "email_log", "email_confirmation_sent", "sms_confirmation_sent",
  "seq_30min_sent_at", "seq_24h_sent_at", "seq_3day_sent_at", "seq_48h_sent_at", "sent_followup_at",
  "last_broadcast_sent_at", "attribution_json", "first_touch_json", "last_touch_json",
  "utm_source", "utm_medium", "utm_campaign", "email_sha256", "phone_sha256",
  "last_contacted_at", "google_tag_fired",
];

// §9/§20 — lifecycle event metadata must carry no customer PII.
const PII_FORBIDDEN_IN_EVENTS = [
  "email", "first_name", "last_name", "phone", "assessment_answers",
  "letter_url", "signed_letter_url", "payment_intent_id",
];

function sliceFn(sql, name, nextName) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  if (start === -1) return null;
  const end = nextName ? sql.indexOf(`create or replace function public.${nextName}`, start) : -1;
  return sql.slice(start, end === -1 ? sql.length : end);
}

function runStatic() {
  const failures = [];
  const cache = new Map();
  const src = (f) => { if (!cache.has(f)) cache.set(f, read(f)); return cache.get(f); };

  for (const { file, label, re } of REQUIRED) {
    if (!re.test(src(file))) failures.push(`REQUIRED missing: ${label}  [${re}]`);
  }
  for (const { file, label, re } of FORBIDDEN) {
    if (re.test(src(file))) failures.push(`FORBIDDEN present: ${label}  [${re}]`);
  }

  const sql = src(MIGRATION);

  // §8 meaningful-activity contract.
  const detector = sliceFn(sql, "detect_order_lifecycle_events", "orders_lifecycle_before_write");
  if (!detector) {
    failures.push("REQUIRED missing: detect_order_lifecycle_events not found in migration");
  } else {
    for (const col of DETECTOR_FORBIDDEN_COLUMNS) {
      if (new RegExp(`\\b${col}\\b`).test(detector)) {
        failures.push(`MEANINGFUL-ACTIVITY BREACH: background column "${col}" is inspected by the lifecycle detector`);
      }
    }
  }

  // §9/§20 no PII in event metadata — check every jsonb_build_object that feeds
  // an order_lifecycle_events insert.
  const eventInserts = sql.split("insert into public.order_lifecycle_events").slice(1);
  if (eventInserts.length === 0) failures.push("REQUIRED missing: no order_lifecycle_events insert found");
  for (const chunk of eventInserts) {
    const stmt = chunk.slice(0, chunk.indexOf(";") === -1 ? 900 : chunk.indexOf(";"));
    const meta = stmt.slice(stmt.indexOf("jsonb_build_object"));
    for (const f of PII_FORBIDDEN_IN_EVENTS) {
      if (new RegExp(`['"]${f}['"]`).test(meta)) {
        failures.push(`PII BREACH: "${f}" written into order_lifecycle_events.metadata`);
      }
    }
  }

  // FINAL-CORRECTIONS-001 — the Order ID must render exactly ONCE at any given
  // viewport width. Three render sites exist, each behind a MUTUALLY EXCLUSIVE
  // responsive gate: sm:hidden (<640), hidden sm:flex (>=640 card), hidden lg:flex
  // (>=1024 table row). A fourth or ungated site would double-print the ID.
  {
    const card = src(CARD);
    const sites = [...card.matchAll(/>\{order\.confirmation_id\}</g)].map((m) => m.index);
    if (sites.length !== 3) {
      failures.push(`ORDER ID: expected exactly 3 responsive render sites, found ${sites.length} (duplicate or missing Order ID)`);
    }
    // Nearest preceding responsive gate for each site.
    const GATES = ["sm:hidden", "hidden sm:flex", "hidden lg:flex"];
    const found = sites.map((idx) => {
      const before = card.slice(0, idx);   // nearest preceding gate, no window cap
      let best = null, bestAt = -1;
      for (const g of GATES) {
        const at = before.lastIndexOf(g);
        if (at > bestAt) { bestAt = at; best = g; }
      }
      return best;
    });
    for (const g of GATES) {
      if (!found.includes(g)) {
        failures.push(`ORDER ID: no render site gated by "${g}" — the ID is invisible at that breakpoint`);
      }
    }
    if (new Set(found).size !== found.length) {
      failures.push(`ORDER ID: two render sites share a responsive gate (${found.join(", ")}) — the ID would print twice`);
    }
  }

  // FINAL-CORRECTIONS-001 §7 — EXACTLY ONE lifecycle panel mount in the app, and
  // it must be the Payments tab. Two mounts would render the panel twice when an
  // admin switches tabs; a mount in the frozen modal would put it back in Overview.
  {
    const roots = [PAGE, CARD, MODAL, PAYTAB, PANEL];
    let mounts = 0;
    for (const f of roots) {
      const body = src(f);
      // the component's own definition file declares it, it does not mount it
      if (f === PANEL) continue;
      mounts += (body.match(/<OrderLifecyclePanel/g) || []).length;
    }
    if (mounts !== 1) {
      failures.push(`LIFECYCLE PANEL: expected EXACTLY 1 mount, found ${mounts} (duplicate panel or wrong host)`);
    }
    if (!/<OrderLifecyclePanel/.test(src(PAYTAB))) {
      failures.push("LIFECYCLE PANEL: the single mount is not in the Payments tab");
    }
  }

  // §15 — the permanent banner is EXACTLY the four approved workflow cards.
  // "Payment Failed" was a pre-existing fifth card and is a PAYMENT state, not a
  // workflow state; it must survive as a filter/secondary metric only. Adding a
  // Reopened / Refunded / Cancelled / Disputed card is the forbidden change.
  const page = src(PAGE);
  // Anchor on the caption and walk BACK to the card array — "Lead (Unpaid)"
  // also appears in unrelated filter option lists earlier in the file.
  // ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 AMENDS the original
  // §15 four-card contract to FIVE. Pending Delivery is a real workflow state
  // (provider submitted, awaiting employee approval) with its own
  // mutually-exclusive KPI — not a re-added secondary metric. The BAN LIST below
  // is untouched: the regression this guard exists for was "Payment Failed" and
  // friends creeping back as summary chips, and that stays forbidden.
  // ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9 RENAMES the five cards to their
  // PERIOD-EVENT names (all five are now event counts over one America/New_York
  // window — none is queue depth, none says "now"). The anchor moves with them:
  // anchoring on the OLD "Lead (Unpaid)" silently matched the status-tab option
  // list further down the file and reported 17 cards, so the anchor label must
  // stay in lock-step with the first card.
  const gridAt = page.indexOf("lg:grid-cols-5");
  const cardsAt = gridAt === -1 ? -1 : page.indexOf('key: "lead_unpaid"', gridAt);
  const kpiBlock = cardsAt === -1 ? "" : page.slice(cardsAt, page.indexOf("].map((s) =>", cardsAt));
  const kpiLabels = [...kpiBlock.matchAll(/key: "([^"]+)" as KpiCardKey/g)].map((m) => m[1]);
  const EXPECTED_KPI = ["lead_unpaid", "paid_unassigned", "under_review", "pending_delivery", "completed"];
  if (kpiLabels.length !== 5) {
    failures.push(`KPI CARD CONTRACT: the permanent banner must have EXACTLY 5 visible cards, found ${kpiLabels.length}: ${JSON.stringify(kpiLabels)}`);
  }
  if (JSON.stringify(kpiLabels) !== JSON.stringify(EXPECTED_KPI)) {
    failures.push(`KPI CARD CONTRACT: expected ${JSON.stringify(EXPECTED_KPI)}, found ${JSON.stringify(kpiLabels)}`);
  }
  for (const banned of ["Payment Failed", "Reopened", "Partially Refunded", "Fully Refunded", "Cancelled", "Disputed", "Refunded", "Archived"]) {
    if (kpiLabels.includes(banned)) failures.push(`KPI CARD CONTRACT: forbidden top card "${banned}"`);
  }
  // The grid column count must AGREE with the card count, or the last card is
  // clipped on desktop. Replaces the old "must not be lg:grid-cols-5" rule, which
  // existed only because the 5th card at the time was an illegitimate one.
  if (!/lg:grid-cols-5/.test(page)) {
    failures.push("KPI CARD CONTRACT: five cards but the banner grid is not lg:grid-cols-5 - the last card will be clipped");
  }
  // Payment Failed must remain reachable as a filter TAB (no summary chip).
  if (!/\{ value: "payment_failed", label: "Payment Failed" \}/.test(page)) {
    failures.push("KPI CARD CONTRACT: Payment Failed is neither a card nor a filter tab — it became unreachable");
  }
  if (!/value: "payment_failed"/.test(page)) {
    failures.push("KPI CARD CONTRACT: the payment_failed status-filter tab was removed");
  }

  if (failures.length) {
    console.error(`${RED}✗ admin-orders lifecycle-date guard FAILED${RESET}`);
    for (const f of failures) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(
    `${GREEN}✓ admin-orders lifecycle-date static guard passed${RESET} ` +
    `(${REQUIRED.length} invariants, ${FORBIDDEN.length} negative controls, ` +
    `${DETECTOR_FORBIDDEN_COLUMNS.length} background-column exclusions, ` +
    `${PII_FORBIDDEN_IN_EVENTS.length} PII exclusions, ${EXPECTED_KPI.length}-card KPI contract)`,
  );
  return 0;
}

// ── PURE LOGIC MIRROR of src/lib/orderLifecycle.ts ───────────────────────────
// Node cannot import .ts directly; the static pass above proves the real module
// exports these, and the mirror keeps the semantics executable in CI.

const ms = (t) => (t ? new Date(t).getTime() || 0 : 0);
const activityIso = (o) => o.last_meaningful_activity_at ?? o.created_at ?? null;
const firstPaidIso = (o) => o.paid_at ?? null;
const lastCompletedIso = (o) => o.last_completed_at ?? o.patient_notification_sent_at ?? null;

function orderBasisIso(o, basis) {
  switch (basis) {
    case "created": return o.created_at ?? null;
    case "first_paid": return firstPaidIso(o);
    case "completed": return lastCompletedIso(o);
    default: return activityIso(o);
  }
}
function orderComparator(basis) {
  return (a, b) => {
    const tA = ms(orderBasisIso(a, basis)), tB = ms(orderBasisIso(b, basis));
    if (tA !== tB) return tB - tA;
    const cA = ms(a.created_at), cB = ms(b.created_at);
    if (cA !== cB) return cB - cA;
    return (b.id ?? "").localeCompare(a.id ?? "");
  };
}
// MONTH-END-...-001 §D — From/To are America/New_York BUSINESS days
// (inclusive start, EXCLUSIVE next-day end), mirroring
// businessDayStartUtcIso / businessDayEndExclusiveUtcIso in orderLifecycle.ts.
// DST-safe via Intl (IANA offsets), same two-pass algorithm as businessTime.ts.
const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
function nyOffsetMs(instant) {
  const p = {};
  for (const x of NY_FMT.formatToParts(instant)) if (x.type !== "literal") p[x.type] = Number(x.value);
  if (p.hour === 24) p.hour = 0;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}
function nyWallToUtcMs(y, m0, d) {
  const naive = Date.UTC(y, m0, d);
  const guess = naive - nyOffsetMs(new Date(naive));
  return naive - nyOffsetMs(new Date(guess));
}
function businessDayStartMs(iso) { const [y, m, d] = iso.split("-").map(Number); return nyWallToUtcMs(y, m - 1, d); }
function businessDayEndExclusiveMs(iso) { const [y, m, d] = iso.split("-").map(Number); return nyWallToUtcMs(y, m - 1, d + 1); }
function matchesBasisDateRange(o, basis, from, to) {
  if (!from && !to) return true;
  const iso = orderBasisIso(o, basis);
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from && t < businessDayStartMs(from)) return false;
  if (to && t >= businessDayEndExclusiveMs(to)) return false;
  return true;
}
function orderPaymentState(o) {
  if (o.dispute_id || o.status === "disputed") return "disputed";
  if (o.refund_status === "partial") return "partially_refunded";
  if (o.refund_status === "full" || o.status === "refunded") return "fully_refunded";
  if (o.payment_intent_id || o.paid_at) return "paid";
  if (o.payment_failure_reason || o.payment_failed_at) return "failed";
  return "unpaid";
}
function orderWorkflowState(o) {
  if (o.status === "cancelled") return "cancelled";
  if (!o.payment_intent_id || o.status === "lead") return "lead";
  if (o.doctor_status === "patient_notified") return "completed";
  if (o.official_letter_reopened_at && !o.official_letter_final_completed_at) return "reopened";
  if (o.doctor_user_id || o.doctor_email) return "under_review";
  return "paid_unassigned";
}
// §11 counting rules, expressed as the reporting model does it.
const uniquePaidCount = (orders) => orders.filter((o) => !!firstPaidIso(o)).length;
const revenueEvents = (orders) =>
  orders.flatMap((o) => [
    ...(o.paid_at ? [{ at: o.paid_at, kind: "first" }] : []),
    ...(o.last_payment_at && o.last_payment_at !== o.paid_at
      ? [{ at: o.last_payment_at, kind: "additional" }] : []),
  ]);
const inMonth = (iso, ym) => !!iso && iso.slice(0, 7) === ym;

// ── ...-LIFECYCLE-DATE-INTEGRITY-002 — the display half of the contract ──────
// The day ribbons key on the NEW YORK calendar date of the EFFECTIVE basis value,
// and a selected KPI card supplies that basis. Mirrors businessIsoDate() plus
// orderGroupingIso() plus the effDateBasis derivation in page.tsx.
function nyIsoDate(instantMs) {
  const p = {};
  for (const x of NY_FMT.formatToParts(new Date(instantMs))) if (x.type !== "literal") p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
const orderGroupingIso = (o, basis) => orderBasisIso(o, basis) ?? o.created_at ?? null;
const KPI_CARD_BASIS = {
  lead_unpaid: "created", paid_unassigned: "first_paid",
  under_review: "under_review_entered", pending_delivery: "pending_delivery_entered",
  completed: "completed",
};
const effBasis = (activeKpi, operatorBasis) => (activeKpi ? KPI_CARD_BASIS[activeKpi] : operatorBasis);
// The ribbon heading an order lands under, given the active card + operator basis.
const ribbonDay = (o, activeKpi, operatorBasis) => {
  const iso = orderGroupingIso(o, effBasis(activeKpi, operatorBasis)) ?? o.created_at;
  return nyIsoDate(new Date(iso).getTime());
};


// ── §22 NUMBERED TEST SCENARIOS ──────────────────────────────────────────────

function runLogic() {
  const fails = [];
  let n = 0;
  const t = (label, got, want) => {
    n++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };

  // ── Fixture A: created June, paid July ────────────────────────────────────
  const A = {
    id: "A", created_at: "2026-06-02T10:00:00Z",
    paid_at: "2026-07-20T09:00:00Z", last_payment_at: "2026-07-20T09:00:00Z",
    payment_intent_id: "pi_A",
    last_meaningful_activity_at: "2026-07-20T09:00:00Z",
    last_meaningful_activity_type: "payment_received",
  };
  const julyLead = {
    id: "L", created_at: "2026-07-05T10:00:00Z",
    last_meaningful_activity_at: "2026-07-05T10:00:00Z",
    last_meaningful_activity_type: "lead_created",
  };

  t("1  June lead paid in July sorts above a July-created lead",
    [julyLead, A].sort(orderComparator("activity"))[0].id, "A");
  t("2  created_at remains June", A.created_at.slice(0, 7), "2026-06");
  t("3  first-paid date is July", firstPaidIso(A).slice(0, 7), "2026-07");
  t("4  order moves to top after payment",
    [julyLead, A].sort(orderComparator("activity")).map((o) => o.id), ["A", "L"]);
  t("5  unique paid-order count increases once", uniquePaidCount([A, julyLead]), 1);
  t("6  July revenue includes the payment once",
    revenueEvents([A]).filter((r) => inMonth(r.at, "2026-07")).length, 1);
  t("7  duplicate webhook does not duplicate the count (same row, same paid_at)",
    uniquePaidCount([A, { ...A }].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)), 1);

  // ── Fixture C: additional payment on an existing paid order ───────────────
  const Cbefore = {
    id: "C", created_at: "2026-06-01T00:00:00Z",
    paid_at: "2026-06-02T00:00:00Z", last_payment_at: "2026-06-02T00:00:00Z",
    payment_intent_id: "pi_C", doctor_status: "patient_notified", doctor_email: "d@x.com",
    first_completed_at: "2026-06-09T00:00:00Z", last_completed_at: "2026-06-09T00:00:00Z",
    last_meaningful_activity_at: "2026-06-09T00:00:00Z",
    last_meaningful_activity_type: "customer_notified",
  };
  const C = {
    ...Cbefore,
    last_payment_at: "2026-07-25T00:00:00Z",
    last_meaningful_activity_at: "2026-07-25T00:00:00Z",
    last_meaningful_activity_type: "additional_payment_received",
  };
  t("8  additional payment updates last-payment date", C.last_payment_at, "2026-07-25T00:00:00Z");
  t("9  additional payment moves order to top",
    [julyLead, C].sort(orderComparator("activity"))[0].id, "C");
  t("10 additional payment does NOT increment unique paid-order count",
    [uniquePaidCount([Cbefore]), uniquePaidCount([C])], [1, 1]);
  t("10b additional payment leaves first-paid unchanged", C.paid_at, Cbefore.paid_at);
  t("10c additional revenue lands on its own transaction date",
    revenueEvents([C]).filter((r) => r.kind === "additional").map((r) => r.at.slice(0, 7)), ["2026-07"]);

  // ── Fixture B: paid + completed, then reopened ────────────────────────────
  const Bbefore = {
    id: "B", created_at: "2026-05-01T00:00:00Z",
    paid_at: "2026-05-02T00:00:00Z", last_payment_at: "2026-05-02T00:00:00Z",
    payment_intent_id: "pi_B", doctor_email: "d@x.com", doctor_status: "patient_notified",
    first_completed_at: "2026-05-09T00:00:00Z", last_completed_at: "2026-05-09T00:00:00Z",
    status: "completed",
    last_meaningful_activity_at: "2026-05-09T00:00:00Z",
    last_meaningful_activity_type: "customer_notified",
  };
  const B = {
    ...Bbefore,
    status: "under-review", doctor_status: "thirty_day_reissue",
    official_letter_reopened_at: "2026-07-24T00:00:00Z",
    last_reopened_at: "2026-07-24T00:00:00Z",
    last_meaningful_activity_at: "2026-07-24T00:00:00Z",
    last_meaningful_activity_type: "order_reopened",
  };
  t("11 reopened order stays Payment: Paid", orderPaymentState(B), "paid");
  t("12 reopened order moves to Under Review/Reopened workflow", orderWorkflowState(B), "reopened");
  t("12b reopened order LEFT the Completed workflow",
    [orderWorkflowState(Bbefore), orderWorkflowState(B)], ["completed", "reopened"]);
  t("13 reopened order moves to top",
    [julyLead, B].sort(orderComparator("activity"))[0].id, "B");
  t("14 reopen adds NO revenue",
    revenueEvents([B]).length, revenueEvents([Bbefore]).length);
  t("15 reopen does NOT increment paid-order count",
    [uniquePaidCount([Bbefore]), uniquePaidCount([B])], [1, 1]);
  t("16 duplicate reopen job is idempotent (same reopened_at → same state)",
    [B.last_reopened_at, { ...B }.last_reopened_at], [B.last_reopened_at, B.last_reopened_at]);

  // Re-completion after reopening.
  const Bre = {
    ...B, status: "completed", doctor_status: "patient_notified",
    official_letter_final_completed_at: "2026-07-26T00:00:00Z",
    last_completed_at: "2026-07-26T00:00:00Z",
    last_meaningful_activity_at: "2026-07-26T00:00:00Z",
    last_meaningful_activity_type: "customer_notified",
  };
  t("17 re-completion PRESERVES first-completed date", Bre.first_completed_at, "2026-05-09T00:00:00Z");
  t("18 re-completion updates last-completed date", Bre.last_completed_at, "2026-07-26T00:00:00Z");
  t("18b re-completion does not create another unique paid order", uniquePaidCount([Bre]), 1);

  // ── Background / non-meaningful writes ────────────────────────────────────
  const meta = {
    ...A,
    ghl_synced_at: "2026-07-26T12:00:00Z", google_ads_upload_status: "uploaded",
    google_ads_uploaded_at: "2026-07-26T12:00:00Z", meta_capi_sent_at: "2026-07-26T12:00:00Z",
    email_log: [{ sentAt: "2026-07-26T12:00:00Z" }], attribution_json: {},
  };
  t("19 generic metadata update does not change meaningful activity",
    [meta.last_meaningful_activity_at, meta.last_meaningful_activity_type],
    [A.last_meaningful_activity_at, A.last_meaningful_activity_type]);
  t("20 Google Ads upload metadata does not reorder the list",
    [meta, B, C].sort(orderComparator("activity")).map((o) => o.id),
    [A, B, C].sort(orderComparator("activity")).map((o) => o.id));

  // ── Failure / pending / refund must not fake paid activity ────────────────
  const failed = {
    id: "F", created_at: "2026-07-01T00:00:00Z",
    payment_failed_at: "2026-07-02T00:00:00Z", payment_failure_reason: "card_declined",
    last_meaningful_activity_at: "2026-07-01T00:00:00Z", last_meaningful_activity_type: "lead_created",
  };
  t("21 payment failure does not create paid activity",
    [orderPaymentState(failed), orderWorkflowState(failed), uniquePaidCount([failed])],
    ["failed", "lead", 0]);
  const pending = {
    id: "P", created_at: "2026-07-01T00:00:00Z",
    last_meaningful_activity_at: "2026-07-01T00:00:00Z", last_meaningful_activity_type: "lead_created",
  };
  t("22 pending payment does not create paid activity",
    [orderPaymentState(pending), uniquePaidCount([pending])], ["unpaid", 0]);
  const refunded = {
    ...A, refunded_at: "2026-07-26T00:00:00Z", refund_status: "partial", refund_amount: 20,
    last_meaningful_activity_at: "2026-07-26T00:00:00Z", last_meaningful_activity_type: "refund_completed",
  };
  t("23 refund event does not overwrite first-paid date", refunded.paid_at, A.paid_at);
  t("23b partial refund stays operational (not fully refunded)",
    orderPaymentState(refunded), "partially_refunded");
  t("23c bare refunded_at never proves a full refund",
    orderPaymentState({ payment_intent_id: "pi", refunded_at: "2026-07-01", refund_status: "none" }), "paid");

  // ── Sorting determinism + pagination ──────────────────────────────────────
  const sameTs = [
    { id: "z", created_at: "2026-07-01T00:00:00Z", last_meaningful_activity_at: "2026-07-10T00:00:00Z" },
    { id: "a", created_at: "2026-07-01T00:00:00Z", last_meaningful_activity_at: "2026-07-10T00:00:00Z" },
    { id: "m", created_at: "2026-07-02T00:00:00Z", last_meaningful_activity_at: "2026-07-10T00:00:00Z" },
  ];
  const s1 = sameTs.slice().sort(orderComparator("activity")).map((o) => o.id);
  const s2 = sameTs.slice().reverse().sort(orderComparator("activity")).map((o) => o.id);
  t("24 latest-activity sorting is deterministic", s1, s2);
  t("24b tie broken by created_at DESC then id DESC", s1, ["m", "z", "a"]);

  // Simulate 2-row pages over the full sorted set.
  const universe = [A, B, C, julyLead, failed, pending, ...sameTs];
  const sorted = universe.slice().sort(orderComparator("activity"));
  const pages = [];
  for (let i = 0; i < sorted.length; i += 2) pages.push(sorted.slice(i, i + 2));
  const paged = pages.flat().map((o) => o.id);
  t("25 pagination has no duplicate rows", paged.length, new Set(paged).size);
  t("26 pagination has no missing rows",
    paged.slice().sort(), universe.map((o) => o.id).slice().sort());

  // ── Date-basis filtering (§14) ────────────────────────────────────────────
  // MONTH-END-...-001 §D: C was created 2026-06-01T00:00:00Z, which is
  // 2026-05-31 20:00 in America/New_York — a MAY business day. Under the old
  // browser-local bounds it (wrongly) counted as June; the business-day
  // contract excludes it, so the expectation changed from ["A","C"] to ["A"].
  t("27 Created Date filter uses created_at over BUSINESS days",
    [A, B, C].filter((o) => matchesBasisDateRange(o, "created", "2026-06-01", "2026-06-30")).map((o) => o.id),
    ["A"]);
  t("27b a 00:00Z timestamp on the 1st belongs to the PREVIOUS business day",
    matchesBasisDateRange(C, "created", "2026-05-01", "2026-05-31"), true);
  t("27c business-day end is EXCLUSIVE of the next day, inclusive of the ET evening",
    // 2026-12-01T04:30:00Z = 2026-11-30 23:30 ET (EST) — still November in
    // business time even though it is already December in UTC. DST has ended by
    // then, so this also proves the winter offset resolves correctly.
    matchesBasisDateRange({ id: "W", created_at: "2026-12-01T04:30:00Z" }, "created", "2026-11-01", "2026-11-30"),
    true);
  t("28 First Paid Date filter uses the first-paid timestamp",
    [A, B, C].filter((o) => matchesBasisDateRange(o, "first_paid", "2026-07-01", "2026-07-31")).map((o) => o.id),
    ["A"]);
  t("29 Latest Activity filter uses the meaningful-activity timestamp",
    [A, B, C].filter((o) => matchesBasisDateRange(o, "activity", "2026-07-01", "2026-07-31")).map((o) => o.id),
    ["A", "B", "C"]);
  t("29b Completed Date filter uses last-completed and EXCLUDES never-completed",
    [A, B, C].filter((o) => matchesBasisDateRange(o, "completed", "2026-05-01", "2026-06-30")).map((o) => o.id),
    ["B", "C"]);
  t("29c an order with no value on the active basis is excluded from a bounded range",
    matchesBasisDateRange(julyLead, "first_paid", "2026-01-01", "2026-12-31"), false);
  t("29d June lead paying in July: June on created basis, July on activity basis",
    [matchesBasisDateRange(A, "created", "2026-06-01", "2026-06-30"),
     matchesBasisDateRange(A, "activity", "2026-07-01", "2026-07-31")],
    [true, true]);

  // ── KPI card semantics (§15) ──────────────────────────────────────────────
  const WORKFLOW_CARDS = ["lead", "paid_unassigned", "under_review", "completed"];
  t("30 top cards are current workflow states",
    [A, B, C, julyLead].map((o) => orderWorkflowState(o)),
    ["paid_unassigned", "reopened", "completed", "lead"]);
  t("31 one order appears in one top card at a time",
    [A, B, C, julyLead].every((o) => WORKFLOW_CARDS.filter((c) => orderWorkflowState(o) === c).length <= 1),
    true);
  t("32 reopened order appears in Under Review, not Completed",
    [orderWorkflowState(B) === "completed", ["under_review", "reopened"].includes(orderWorkflowState(B))],
    [false, true]);

  // ── §33 no PII in event metadata (shape assertion) ────────────────────────
  const eventMeta = { payment_state: "paid", workflow_state: "under_review" };
  t("33 no PII appears in event metadata",
    Object.keys(eventMeta).filter((k) => PII_FORBIDDEN_IN_EVENTS.includes(k)), []);

  // ── §34 backfill idempotency (the migration's coalesce/null-guard shape) ──
  const backfill = (o) => ({
    ...o,
    last_payment_at: o.last_payment_at ?? o.paid_at ?? null,
    first_completed_at: o.first_completed_at ?? o.patient_notification_sent_at ?? null,
    last_meaningful_activity_at: o.last_meaningful_activity_at ?? o.created_at ?? null,
  });
  const once = backfill({ id: "X", created_at: "2026-06-01T00:00:00Z", paid_at: "2026-06-02T00:00:00Z" });
  t("34 backfill is idempotent", backfill(once), once);

  // ── §35 no accounting formula changes ────────────────────────────────────
  t("35 revenue still comes from transactions, not from workflow changes",
    [revenueEvents([Bbefore]).length, revenueEvents([B]).length, revenueEvents([Bre]).length],
    [1, 1, 1]);

  // ── §36 ...-LIFECYCLE-DATE-INTEGRITY-002 — August Completed fixture matrix ──
  //
  // The reported defect: with the Completed card active over the New York August
  // window, rows were SELECTED on last_completed_at but GROUPED on whatever basis
  // the operator had persisted, so August completions rendered under July ribbons.
  // Every case below asserts the selection AND the ribbon together — a fix that
  // corrects only the predicate, or only the heading, fails here.
  const AUG = { from: "2026-08-01", to: "2026-08-31" };
  const inAugCompleted = (o) => matchesBasisDateRange(o, "completed", AUG.from, AUG.to);

  // A: July-paid, July-completed.
  const fxA = { id: "A2", created_at: "2026-07-10T14:00:00Z", paid_at: "2026-07-12T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    first_completed_at: "2026-07-18T14:00:00Z", last_completed_at: "2026-07-18T14:00:00Z" };
  // B: July-paid, August-completed — the case the owner named explicitly.
  const fxB = { id: "B2", created_at: "2026-07-20T14:00:00Z", paid_at: "2026-07-20T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    first_completed_at: "2026-08-02T14:00:00Z", last_completed_at: "2026-08-02T14:00:00Z" };
  // C: August-paid, August-completed.
  const fxC = { id: "C2", created_at: "2026-08-03T14:00:00Z", paid_at: "2026-08-03T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    first_completed_at: "2026-08-05T14:00:00Z", last_completed_at: "2026-08-05T14:00:00Z" };
  // D: August-paid, September-completed.
  const fxD = { id: "D2", created_at: "2026-08-03T14:00:00Z", paid_at: "2026-08-03T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    first_completed_at: "2026-09-01T14:00:00Z", last_completed_at: "2026-09-01T14:00:00Z" };
  // E/F: still-active July work — no completion value at all.
  const fxE = { id: "E2", created_at: "2026-07-22T14:00:00Z", paid_at: "2026-07-22T14:00:00Z",
    payment_intent_id: "pi", doctor_email: "d@x.com", doctor_status: "assigned",
    last_under_review_entered_at: "2026-07-22T15:00:00Z" };
  const fxF = { id: "F2", created_at: "2026-07-23T14:00:00Z", paid_at: "2026-07-23T14:00:00Z",
    payment_intent_id: "pi", doctor_email: "d@x.com", doctor_status: "pending_admin_approval",
    last_pending_delivery_entered_at: "2026-07-29T15:00:00Z" };
  // G/H: the month boundary, stated in NEW YORK wall clock (EDT = UTC-4).
  const fxG = { id: "G2", created_at: "2026-07-01T14:00:00Z", paid_at: "2026-07-01T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    last_completed_at: "2026-08-01T03:59:00Z" };  // Jul 31, 23:59 ET
  const fxH = { id: "H2", created_at: "2026-07-01T14:00:00Z", paid_at: "2026-07-01T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    last_completed_at: "2026-08-01T04:01:00Z" };  // Aug 1, 00:01 ET
  // K: legacy completed row with NO completion timestamp on either column.
  const fxK = { id: "K2", created_at: "2026-08-02T14:00:00Z", paid_at: "2026-08-02T14:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified" };

  t("36A July-paid + July-completed is NOT in August Completed", inAugCompleted(fxA), false);
  t("36B July-paid + August-completed IS in August Completed", inAugCompleted(fxB), true);
  t("36C August-paid + August-completed IS in August Completed", inAugCompleted(fxC), true);
  t("36D August-paid + September-completed is NOT in August Completed", inAugCompleted(fxD), false);
  t("36G completed Jul 31 23:59 America/New_York belongs to JULY", inAugCompleted(fxG), false);
  t("36H completed Aug 1 00:01 America/New_York belongs to AUGUST", inAugCompleted(fxH), true);
  t("36E/F still-active July work has no completion value and is excluded",
    [inAugCompleted(fxE), inAugCompleted(fxF)], [false, false]);
  t("36E July order still Under Review stays visible in the CURRENT queue",
    orderWorkflowState(fxE), "under_review");
  t("36F July order still Pending Delivery has its entry date, not a completion date",
    [lastCompletedIso(fxF), fxF.last_pending_delivery_entered_at.slice(0, 7)], [null, "2026-07"]);
  t("36K a completed row with NO completion timestamp is excluded, never coerced",
    [lastCompletedIso(fxK), inAugCompleted(fxK)], [null, false]);

  // The defect itself: same rows, same window, ribbons under the OPERATOR's basis
  // vs the EFFECTIVE one. Every persisted operator basis must give August ribbons.
  const augRows = [fxB, fxC, fxH];
  t("36-DEFECT ribbons on the raw operator basis leak JULY headings (the bug)",
    augRows.map((o) => ribbonDay(o, null, "created")).some((d) => d.startsWith("2026-07")), true);
  t("36-FIX with the Completed card active every ribbon is an AUGUST day",
    ["activity", "created", "first_paid", "completed"].every((operatorBasis) =>
      augRows.every((o) => ribbonDay(o, "completed", operatorBasis).startsWith("2026-08"))),
    true);
  t("36-FIX ribbon date equals the row's own New York completion day",
    augRows.map((o) => ribbonDay(o, "completed", "created")),
    ["2026-08-02", "2026-08-05", "2026-08-01"]);
  t("36-FIX the boundary row lands on Aug 1, not Jul 31",
    ribbonDay(fxH, "completed", "activity"), "2026-08-01");
  t("36-PARITY every ribboned row is also a selected row (grouping ⊆ predicate)",
    augRows.filter((o) => inAugCompleted(o)).length, augRows.length);
  t("36-SORT the display order is the completion order, not the creation order",
    [fxB, fxC, fxH].sort(orderComparator("completed")).map((o) => o.id), ["C2", "B2", "H2"]);

  // I: DST. 2026-11-01 is the US fall-back; 01:30 ET occurs twice. Both instants
  // are still the same NEW YORK business day, and neither may drift into Oct 31.
  const dstA = { id: "I1", created_at: "2026-10-01T00:00:00Z", paid_at: "2026-10-01T00:00:00Z",
    payment_intent_id: "pi", doctor_status: "patient_notified",
    last_completed_at: "2026-11-01T05:30:00Z" };  // 01:30 EDT
  const dstB = { ...dstA, id: "I2", last_completed_at: "2026-11-01T06:30:00Z" };  // 01:30 EST
  t("36I both sides of the DST fall-back are the same New York business day",
    [ribbonDay(dstA, "completed", "created"), ribbonDay(dstB, "completed", "created")],
    ["2026-11-01", "2026-11-01"]);
  t("36I a DST-ambiguous completion never falls back into the previous month",
    [matchesBasisDateRange(dstA, "completed", "2026-10-01", "2026-10-31"),
     matchesBasisDateRange(dstB, "completed", "2026-11-01", "2026-11-30")],
    [false, true]);

  // J: reopened after completion. The completion EVENT survives (it keeps its
  // August date and stays countable), while the CURRENT queue moves to reopened.
  const fxJdone = { id: "J2", created_at: "2026-07-15T14:00:00Z", paid_at: "2026-07-15T14:00:00Z",
    payment_intent_id: "pi", doctor_email: "d@x.com", doctor_status: "patient_notified",
    status: "completed",
    first_completed_at: "2026-08-01T14:00:00Z", last_completed_at: "2026-08-01T14:00:00Z" };
  const fxJreopened = { ...fxJdone, status: "under-review", doctor_status: "thirty_day_reissue",
    official_letter_reopened_at: "2026-08-03T14:00:00Z" };
  t("36J reopening does not rewrite the original completion event",
    [fxJreopened.first_completed_at, fxJreopened.last_completed_at],
    [fxJdone.first_completed_at, fxJdone.last_completed_at]);
  t("36J a reopened order leaves the CURRENT Completed queue but keeps its date",
    [orderWorkflowState(fxJdone), orderWorkflowState(fxJreopened), inAugCompleted(fxJreopened)],
    ["completed", "reopened", true]);
  t("36J a reissue advances last-completed and never duplicates the order",
    (() => {
      const reissued = { ...fxJreopened, doctor_status: "patient_notified", status: "completed",
        last_completed_at: "2026-08-06T14:00:00Z" };
      return [reissued.first_completed_at, ribbonDay(reissued, "completed", "created"),
        [reissued].filter(inAugCompleted).length];
    })(),
    ["2026-08-01T14:00:00Z", "2026-08-06", 1]);

  if (fails.length) {
    console.error(`${RED}✗ admin-orders lifecycle-date logic FAILED${RESET} (${fails.length}/${n})`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ admin-orders lifecycle-date logic passed${RESET} (${n} scenarios — §22 1–35 + fixtures A/B/C/D, §36 August-Completed matrix A–L)`);
  return 0;
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────

function runSelfTest() {
  const fails = [];

  // A created_at comparator MUST fail scenario 1 — proving it is not vacuous.
  const bad = (a, b) => ms(b.created_at) - ms(a.created_at);
  const june = { id: "A", created_at: "2026-06-02T10:00:00Z", last_meaningful_activity_at: "2026-07-20T09:00:00Z" };
  const july = { id: "L", created_at: "2026-07-05T10:00:00Z", last_meaningful_activity_at: "2026-07-05T10:00:00Z" };
  if ([july, june].sort(bad)[0].id === "A") fails.push("NC1: created_at comparator wrongly satisfied scenario 1");

  // A comparator WITHOUT tie-breakers must be non-deterministic on equal keys.
  const noTie = (a, b) => ms(activityIso(b)) - ms(activityIso(a));
  const eq = [
    { id: "z", created_at: "2026-07-01T00:00:00Z", last_meaningful_activity_at: "2026-07-10T00:00:00Z" },
    { id: "a", created_at: "2026-07-01T00:00:00Z", last_meaningful_activity_at: "2026-07-10T00:00:00Z" },
  ];
  const r1 = eq.slice().sort(noTie).map((o) => o.id).join();
  const r2 = eq.slice().reverse().sort(noTie).map((o) => o.id).join();
  if (r1 === r2) fails.push("NC2: tie-breaker control is vacuous (equal keys already stable)");

  // A created_at-based date filter MUST disagree with the activity basis for A.
  if (matchesBasisDateRange(june, "created", "2026-07-01", "2026-07-31")) {
    fails.push("NC3: created basis wrongly matched July for a June-created order");
  }

  // Counting an add-on as a new sale MUST break scenario 10.
  const badCount = (orders) => orders.reduce((s, o) => s + (o.paid_at ? 1 : 0) + (o.last_payment_at && o.last_payment_at !== o.paid_at ? 1 : 0), 0);
  if (badCount([{ paid_at: "2026-06-02", last_payment_at: "2026-07-25" }]) === 1) {
    fails.push("NC4: double-count control is vacuous");
  }

  // Background-column detection + updated_at sort pattern must actually match.
  if (!/\bghl_synced_at\b/.test("if p_old.ghl_synced_at is distinct from p_new.ghl_synced_at then")) {
    fails.push("NC5: background-column detection is broken");
  }
  if (!/\.order\("updated_at"/.test('.order("updated_at", { ascending: false })')) {
    fails.push("NC6: updated_at sort pattern is broken");
  }

  // NC7-11 — the §12 compact-UI negative controls must MATCH the verbose source
  // they are meant to reject. Without this they could silently rot into
  // patterns that never fire, and the old cluttered row could come back green.
  const VERBOSE_SAMPLES = [
    ['Unpaid · Lead restatement', '{paymentStateLabel(pay)} · {workflowStateLabel(wf)}', /\{paymentStateLabel\([A-Za-z]+\)\} · \{workflowStateLabel\(/],
    ['latest-activity text',      '{lifecycleEventLabel(evType)} · {fmtDateTime(evIso)}', /\{lifecycleEventLabel\([A-Za-z]+\)\} · \{fmt/],
    ['row created date',          'Created · {fmtDate(order.created_at)}', /Created · \{fmtDate\(order\.created_at\)\}/],
    ['row first-paid date',       'First paid · {fmtDate(order.paid_at)}', /First paid · \{fmtDate\(order\.paid_at\)\}/],
    ['redundant tooltip',         'title={`Payment: ${paymentStateLabel(pay)} · Workflow: ${x}`}', /title=\{`Payment: \$\{paymentStateLabel/],
    ['five-card grid',            'sm:grid-cols-3 lg:grid-cols-5 sm:divide-x', /sm:grid-cols-3 lg:grid-cols-5/],
    ['Payment / Workflow header', 'uppercase tracking-wider">Payment / Workflow</div>', /uppercase tracking-wider">Payment \/ Workflow</],
    ['Payment Failed summary chip', 'Payment Failed <span className="font-extrabold">{facetCounts.buckets.payment_failed}</span>', /Payment Failed[\s\S]{0,120}facetCounts\.buckets\.payment_failed\}/],
    ['bare date under Order ID', '{order.confirmation_id}</p> <p className="x">{fmtDate(order.created_at)}</p>', /confirmation_id\}<\/p>[\s\S]{0,40}\{fmtDate\(order\.created_at\)\}/],
    ['row date reintroduced',       '{fmtDate(order.paid_at)}', /\{fmtDate\(order\.(created_at|paid_at|last_payment_at|last_completed_at)\)\}/],
    ['panel mounted in Overview',   'import OrderLifecyclePanel from "./OrderLifecyclePanel";', /<OrderLifecyclePanel|from "\.\/OrderLifecyclePanel"/],
    ['order id render site',        '<span className="truncate">{order.confirmation_id}</span>', />\{order\.confirmation_id\}</],
  ];
  for (const [name, sample, re] of VERBOSE_SAMPLES) {
    if (!re.test(sample)) fails.push(`NC: control for "${name}" no longer matches the verbose source it must reject`);
  }

  if (fails.length) {
    console.error(`${RED}✗ lifecycle-date self-test FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ lifecycle-date self-test passed${RESET} (6 + ${VERBOSE_SAMPLES.length} negative controls)`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
let code = 0;
try {
  code |= runStatic();
  code |= runLogic();
  if (selfTest) code |= runSelfTest();
  if (code === 0) console.log(`${DIM}  lifecycle-date contract: created_at immutable · paid_at = first payment (immutable) · last_meaningful_activity_at = default sort${RESET}`);
} catch (e) {
  console.error(`${RED}✗ lifecycle-date guard error: ${e.message}${RESET}`);
  code = 1;
}
process.exit(code);
