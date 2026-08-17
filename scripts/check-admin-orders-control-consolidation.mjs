#!/usr/bin/env node
// ADMIN-ORDERS-CONTROL-CONSOLIDATION-001 — regression guard.
// EXTENDED by ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001.
//
// Item 9: the Orders controls live in ONE grouped Filters panel. Sequence
// Status, the date basis/range and the exports are all inside it; nothing floats
// in a separate strip above the table any more.
//
// The interesting assertions here are POSITIONAL, not "does this string exist".
// A control that is merely PRESENT tells us nothing — the whole point of the
// task is WHERE it is. So each check resolves character offsets and asserts the
// control sits inside (or outside) the collapsible panel's bounds.
//
// The sequence half additionally asserts PROVENANCE: the six chip counts must
// come from the server facet result, and the sequence group must contain no
// `.filter(` at all — the loaded-row arithmetic that made the old external
// strip's numbers wrong once the list became server-paged.
//
// Usage:
//   node scripts/check-admin-orders-control-consolidation.mjs
//   node scripts/check-admin-orders-control-consolidation.mjs --self-test

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAGE = join(ROOT, "src", "pages", "admin-orders", "page.tsx");
const FACET = join(ROOT, "src", "pages", "admin-orders", "orderFacetCounts.ts");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const PANEL_OPEN = '<div id="orders-filters-panel"';
// The panel's own closing marker: the summary line that ends it.
const PANEL_CLOSE_MARKER = "{/* ── The default scope, stated plainly ──";

// The Sequence chip group's own bounds inside the panel.
const SEQ_GROUP_OPEN = "{/* ── Sequence Status — ONE counted chip group, inside Filters ──";
const SEQ_GROUP_CLOSE = "{/* ── Date Basis —";
// The group's rendered identity (assistive-tech label). Exactly one may exist.
const SEQ_GROUP_ANCHOR = 'aria-label="Sequence status filter"';

// ── Comment stripping ───────────────────────────────────────────────────────
// Every "must NOT contain" scan runs on comment-stripped source, so a comment
// RECORDING that the external strip was removed can never be mistaken for the
// strip itself. String literals are deliberately KEPT: for a UI label, a string
// literal IS the use (`title="Sequence Stage"` would put the words back on
// screen), so stripping them would make these checks vacuous.
function stripComments(s) {
  return s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ") // {/* jsx comment */}
    .replace(/\/\*[\s\S]*?\*\//g, " ")           // /* block comment */
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");  // // line comment (not a URL)
}

// Resolve the collapsible panel's character range. Everything the operator can
// only see with Filters OPEN lives between these two offsets.
function panelBounds(src) {
  const open = src.indexOf(PANEL_OPEN);
  const close = src.indexOf(PANEL_CLOSE_MARKER);
  return { open, close };
}

function inPanel(src, needle) {
  const { open, close } = panelBounds(src);
  const at = src.indexOf(needle);
  if (open < 0 || close < 0 || at < 0) return false;
  return at > open && at < close;
}

function outsidePanel(src, needle) {
  const { open, close } = panelBounds(src);
  const at = src.indexOf(needle);
  if (open < 0 || close < 0 || at < 0) return false;
  return at > close || at < open;
}

// The Sequence group's source slice (empty string when the group is missing).
function sequenceGroupSlice(src) {
  const a = src.indexOf(SEQ_GROUP_OPEN);
  if (a < 0) return "";
  const b = src.indexOf(SEQ_GROUP_CLOSE, a);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

const count = (src, re) => (src.match(re) || []).length;

// The six canonical sequence values + their friendly labels. Values are the
// STORED ones (`30min_sent` still keys on seq_30min_sent_at); only the label
// reads "5min Sent".
const SEQUENCE_VALUES = ["all", "no_sequence", "30min_sent", "24h_sent", "3day_sent", "opted_out"];
const SEQUENCE_LABELS = ["All Leads", "Not Started", "5min Sent", "24h Sent", "3-Day Sent", "Opted Out"];

function checks(src, facetSrc) {
  const out = [];
  const add = (name, pass) => out.push({ name, pass: !!pass });

  const bare = stripComments(src);
  const bareFacet = stripComments(facetSrc);
  const group = sequenceGroupSlice(src);
  const bareGroup = stripComments(group);

  // ── Consolidation: these controls belong INSIDE the one panel ────────────
  add("Meta Audience — Paid export is inside the Filters panel",
    inPanel(src, 'onClick={() => exportMetaAudience("paid")}'));
  add("Meta Audience — Paid + Refunded export is inside the Filters panel",
    inPanel(src, 'onClick={() => exportMetaAudience("paid_or_refunded")}'));
  add("the full Orders CSV export is inside the Filters panel",
    inPanel(src, "onClick={exportFilteredAll}"));
  add("the date basis/range controls stayed inside the panel",
    inPanel(src, "<input type=\"date\" value={dateFrom}"));

  // ── SEQUENCE STATUS: exactly ONE group, and it is inside Filters ─────────
  add("exactly one Sequence Status group exists",
    count(bare, /aria-label="Sequence status filter"/g) === 1);
  add("the Sequence Status group is nested inside the Filters panel",
    inPanel(src, SEQ_GROUP_ANCHOR));
  add("no external Sequence Stage strip survives",
    !/Sequence Stage/.test(bare));
  add("the duplicate Sequence <select> is gone",
    !/<select value=\{sequenceFilter\}/.test(bare));
  add("the chip group is the only writer of the sequence filter besides Clear",
    count(bare, /setSequenceFilter\(/g) >= 2 && !/<select[^>]*sequenceFilter/.test(bare));

  // ── All six values + friendly labels, defined canonically ONCE ───────────
  add("all six sequence values are declared in orderFacetCounts",
    SEQUENCE_VALUES.every((v) => new RegExp(`"${v}"`).test(bareFacet)));
  add("all six friendly labels are declared in orderFacetCounts",
    SEQUENCE_LABELS.every((l) => bareFacet.includes(`"${l}"`)));
  add("SEQUENCE_FACET_KEYS holds exactly six keys",
    /SEQUENCE_FACET_KEYS: SequenceFacetKey\[\] = \[\s*"all", "no_sequence", "30min_sent", "24h_sent", "3day_sent", "opted_out",\s*\]/.test(facetSrc));
  add("the chips are rendered by mapping the canonical key list (no hand-written copy)",
    /SEQUENCE_FACET_KEYS\.map\(/.test(bareGroup)
    && /SEQUENCE_FACET_LABEL\[key\]/.test(bareGroup));

  // ── Count PROVENANCE: server facet result, never the loaded rows ─────────
  add("chip counts read the server sequence facet result",
    /sequenceFacetCounts\.counts\[key\]/.test(bareGroup));
  add("page.tsx fetches the sequence counts server-side",
    /fetchSequenceFacetCounts\(/.test(bare));
  // The old strip's shape was `leads.filter(...).length` over the loaded rows.
  // Forbidding BOTH the operation and the row arrays means no future edit can
  // reintroduce it under a different variable name.
  // `.filter(` is the operation, and these are the code-only names of the loaded
  // row arrays. Prose-prone words ("orders", "leads") are deliberately NOT in
  // the list — they appear in the group's own tooltip copy, and a check that
  // trips on its own help text gets deleted rather than fixed.
  add("no loaded-row arithmetic anywhere in the sequence group",
    group.length > 0
    && !/\.filter\(/.test(bareGroup)
    && !/\b(orderRows|orderFacts|visibleOrders)\b/.test(bareGroup));
  add("the sequence facet counts are narrow COUNT(head) queries",
    /newCountQuery\(\)\.neq\("status", "archived"\)/.test(facetSrc)
    && /count: "exact", head: true/.test(facetSrc));
  add("ONE sequence predicate serves both the rows and the counts",
    /q = applySequenceFilter\(q, f\.sequence\)/.test(facetSrc)
    && /applySequenceFilter\(\s*\n?\s*\/\/[\s\S]*?applyNonStatusFilters\(newCountQuery\(\)\.neq\("status", "archived"\), \{ \.\.\.f, sequence: "all" \}\),/.test(facetSrc));
  add("the sequence facet excludes the sequence filter itself (faceted semantics)",
    /\{ \.\.\.f, sequence: "all" \}/.test(facetSrc));
  add("blocked client-only filters yield NULL counts, never a loaded-row number",
    /if \(blockedClientFilters\.length > 0\) \{\s*\n\s*return \{ counts: \{ \.\.\.EMPTY_SEQUENCE_COUNTS \}, blockedClientFilters, error: false \};/.test(facetSrc));
  add("the UI renders an explicit unavailable state for blocked counts",
    /sequenceFacetCounts\.blockedClientFilters\.length > 0/.test(bare)
    && /count === null \? "—"/.test(bareGroup));

  // ── Stale-response protection on the count state ─────────────────────────
  add("sequence counts are committed through the latest-request guard",
    /runLatest\(\s*\n\s*sequenceCountGuard,/.test(bare));
  add("the sequence count guard is a stable per-mount ref",
    /const sequenceCountGuard = useRef\(createRequestGuard\(\)\)\.current;/.test(bare));

  // ── Exports are SEPARATED from ordinary filters, not another checkbox ────
  add("exports sit behind their own rule + heading",
    /border-t border-gray-200">\s*\n\s*<div className="flex items-center gap-1\.5 mb-2">\s*\n\s*<i className="ri-download-2-line/.test(src));

  // ── The strip above the table no longer carries export clutter ───────────
  // Asserts the USE is gone, not the mention: the comment recording the move is
  // allowed to survive, a second call site is not.
  add("exactly one call site per export mode (nothing left in the strip)",
    count(src, /onClick=\{\(\) => exportMetaAudience\("paid"\)\}/g) === 1
    && count(src, /onClick=\{\(\) => exportMetaAudience\("paid_or_refunded"\)\}/g) === 1
    && count(src, /onClick=\{exportFilteredAll\}/g) === 1);

  // ── Counts, chips, intersection semantics and Clear Filters preserved ────
  add("the Filters badge still counts active filters",
    /const activeFilterCount = \[/.test(src));
  add("the sequence filter still contributes to the Filters badge",
    /sequenceFilter !== "all",/.test(src));
  add("Clear Filters is preserved", /clearAdvancedFilters/.test(src));
  add("Clear Filters resets the sequence selection",
    /setSequenceFilter\("all"\);/.test(src));
  add("the active sequence has a removable chip",
    /onClick=\{\(\) => setSequenceFilter\("all"\)\}/.test(bareGroup));
  add("filter intersection semantics preserved (single AND predicate)",
    /return matchStatus && matchState && matchDoctor && matchSelectedProvider && matchPayment && matchRef && matchSequence && matchDateBasis && matchSearch && matchDuplicates && matchNonGhl && matchSource && matchPackage;/.test(src));

  // ── §11 keyboard + outside-click dismissal ───────────────────────────────
  add("Escape closes the panel", /if \(e\.key === "Escape"\) \{\s*\n\s*setShowAdvancedFilters\(false\);/.test(src));
  add("focus returns to the Filters button on Escape",
    /filtersButtonRef\.current\?\.focus\(\);/.test(src));
  add("an outside click closes the panel",
    /document\.addEventListener\("mousedown", onPointer\)/.test(src));
  add("a click on the toggle button is not double-handled",
    /if \(filtersButtonRef\.current\?\.contains\(t\)\) return;/.test(src));
  add("a click INSIDE the panel does not close it",
    /if \(filtersPanelRef\.current\?\.contains\(t\)\) return;/.test(src));
  add("both listeners are removed when the panel closes",
    /removeEventListener\("keydown", onKey\)/.test(src)
    && /removeEventListener\("mousedown", onPointer\)/.test(src));
  add("the toggle is wired to the panel for assistive tech",
    /aria-expanded=\{showAdvancedFilters\}/.test(src)
    && /aria-controls="orders-filters-panel"/.test(src));

  // ── §8 exports cover the COMPLETE matching set ───────────────────────────
  // BOTH export paths, not just one: a single-occurrence assertion passed
  // while the other export had already been switched back to the loaded page.
  add("every export reads the complete matching server-side dataset",
    count(bare, /const all = await fetchAllMatchingOrders\(\);/g) === 2);
  // On COMMENT-STRIPPED source: a comment explaining that the export drops the
  // window is not the code that drops it. (This assertion silently passed on a
  // planted regression until the stripping was added.)
  add("exports explicitly drop the 60-day default window",
    /\{ defaultScopeCutoff: null \}/.test(bare));

  // ── Server-backed Orders loading remains intact ──────────────────────────
  add("the row read still goes through the shared predicate builder",
    /applyListPredicates\(\s*\n\s*supabase\.from\("orders"\)\.select\(ORDERS_LIST_COLUMNS\),/.test(src));
  add("the list total is still a server count",
    /fetchListScopeTotal\(listFilters, statusFilter, \{/.test(src));
  add("pagination is still server-side (ranged pages, not a client slice)",
    /\.range\(from, from \+ ORDERS_PAGE_SIZE - 1\)/.test(src)
    && /const visibleOrders = filtered;/.test(src));

  // ── The scope notice must NOT be hidden behind the panel ─────────────────
  // It was, briefly: it is the operator's only signal that the list is
  // narrowed, so a notice only visible with Filters open is worse than none.
  add("the default-scope notice renders OUTSIDE the collapsible panel",
    outsidePanel(src, "Last {DEFAULT_SCOPE_DAYS} days + all open work"));

  return out;
}

function report(results, header) {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}`);
  }
  if (failed.length) {
    console.error(`${RED}✗ ${header} FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ ${header} passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

// NORMALISE LINE ENDINGS ON READ. core.autocrlf=true means these files can be on
// disk as CRLF (a `git apply` rewrite is enough to flip them), while every
// multi-line anchor and every negative-control plant below is written with \n.
// Without this the plants match nothing, the controls report NO-OP, and the guard
// looks like it is protecting code it has stopped touching. Both layers read
// through here so static and self-test can never disagree about the source.
function readSources() {
  const norm = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  return { page: norm(PAGE), facet: norm(FACET) };
}

function runStatic() {
  const { page, facet } = readSources();
  return report(checks(page, facet), "admin-orders control-consolidation guard");
}

// ── NEGATIVE CONTROLS ───────────────────────────────────────────────────────
// Each plants one specific regression and asserts the guard rejects it. A
// control whose anchor has moved reports NO-OP rather than passing silently.
// `target` names which file the mutation applies to.
const CONTROLS = [
  ["an export is put back in the strip above the table", "page",
    (s) => s.replace(
      "                    {audienceMsg && (\n                      <span className=\"hidden sm:inline font-semibold text-emerald-600\">{audienceMsg}</span>",
      "                    <button onClick={() => exportMetaAudience(\"paid\")} />\n                    {audienceMsg && (\n                      <span className=\"hidden sm:inline font-semibold text-emerald-600\">{audienceMsg}</span>")],

  // ── Sequence-specific controls ──
  ["the external Sequence Stage strip is added back above the table", "page",
    (s) => s.replace(
      "            {/* ── Follow-up sent filter (leads only) ── */}",
      '            <div className="bg-white rounded-xl border px-4 py-3 mb-2">\n'
      + '              <span className="text-xs font-bold">Sequence Stage</span>\n'
      + '            </div>\n'
      + "            {/* ── Follow-up sent filter (leads only) ── */}")],
  ["a second Sequence <select> is reintroduced", "page",
    (s) => s.replace(
      "                  <div className=\"col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-7\">",
      "                  <div>\n"
      + "                    <select value={sequenceFilter} onChange={(e) => setSequenceFilter(e.target.value)}>\n"
      + "                      <option value=\"all\">All Sequences</option>\n"
      + "                    </select>\n"
      + "                  </div>\n"
      + "                  <div className=\"col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-7\">")],
  ["the chip counts fall back to the loaded rows", "page",
    (s) => s.replace(
      "const count = sequenceFacetCounts.counts[key];",
      "const count = orderRows.filter((o) => !o.payment_intent_id).length;")],
  ["a sequence value is dropped from the canonical key list", "facet",
    (s) => s.replace(
      '"all", "no_sequence", "30min_sent", "24h_sent", "3day_sent", "opted_out",\n];',
      '"all", "no_sequence", "30min_sent", "24h_sent", "3day_sent",\n];')],
  ["a friendly chip label is lost", "facet",
    (s) => s.replace('"30min_sent": "5min Sent",', '"30min_sent": "30min_sent",')],
  ["a stale count response can overwrite newer filters", "page",
    (s) => s.replace(
      "      void runLatest(\n        sequenceCountGuard,\n        () => fetchSequenceFacetCounts(",
      "      void (async () => setSequenceFacetCounts(await fetchSequenceFacetCounts(")],
  ["the sequence group is moved OUTSIDE the Filters dropdown", "page",
    (s) => {
      const a = s.indexOf(SEQ_GROUP_OPEN);
      const b = s.indexOf(SEQ_GROUP_CLOSE, a);
      if (a < 0 || b < 0) return s;
      const block = s.slice(a, b);
      return (s.slice(0, a) + s.slice(b)).replace(PANEL_OPEN, block + "\n" + PANEL_OPEN);
    }],
  ["the sequence facet applies the sequence filter to itself (chips self-zero)", "facet",
    (s) => s.replace('{ ...f, sequence: "all" }', "f")],
  ["a blocked client-only filter publishes counts anyway", "facet",
    (s) => s.replace(
      "  if (blockedClientFilters.length > 0) {\n    return { counts: { ...EMPTY_SEQUENCE_COUNTS }, blockedClientFilters, error: false };\n  }",
      "  // blocked check removed")],
  ["the list and the counts stop sharing one sequence predicate", "facet",
    (s) => s.replace(
      "  if (f.sequence && f.sequence !== \"all\") q = applySequenceFilter(q, f.sequence);",
      "  if (f.sequence && f.sequence !== \"all\") q = q.or(\"payment_intent_id.is.null,status.eq.lead\");")],

  // ── Pre-existing consolidation controls ──
  ["exports lose their separating rule and heading", "page",
    (s) => s.replace('border-t border-gray-200">', 'border-transparent">')],
  ["Escape no longer closes the panel", "page",
    (s) => s.replace('if (e.key === "Escape") {', "if (false) {")],
  ["an outside click no longer closes the panel", "page",
    (s) => s.replace('document.addEventListener("mousedown", onPointer)', "void onPointer")],
  ["a click inside the panel starts closing it", "page",
    (s) => s.replace("if (filtersPanelRef.current?.contains(t)) return;", "")],
  ["listeners leak after the panel closes", "page",
    (s) => s.replace('document.removeEventListener("mousedown", onPointer);', "")],
  ["one export silently falls back to the loaded page", "page",
    (s) => s.replace("const all = await fetchAllMatchingOrders();", "const all = orderRows;")],
  ["every export falls back to the loaded page", "page",
    (s) => s.replaceAll("const all = await fetchAllMatchingOrders();", "const all = orderRows;")],
  ["exports inherit the 60-day default window", "page",
    (s) => s.replace("{ defaultScopeCutoff: null }", "{ defaultScopeCutoff: defaultScopeCutoff }")],
  ["server-backed row loading is replaced by a client slice", "page",
    (s) => s.replace("const visibleOrders = filtered;", "const visibleOrders = filtered.slice(0, 100);")],
  ["the scope notice is hidden behind the Filters panel again", "page",
    (s) => {
      const needle = "Last {DEFAULT_SCOPE_DAYS} days + all open work";
      return s.replace(needle, "moved").replace(PANEL_OPEN, PANEL_OPEN + " data-x=\"" + needle + "\"");
    }],
  ["filter intersection semantics become an OR", "page",
    (s) => s.replace(
      "return matchStatus && matchState && matchDoctor",
      "return matchStatus || matchState || matchDoctor")],
  ["the Filters badge stops counting active filters", "page",
    (s) => s.replace("const activeFilterCount = [", "const activeFilterCount = 0 && [")],
];

function runSelfTest() {
  const { page, facet } = readSources();
  const results = [];
  for (const [name, target, mutate] of CONTROLS) {
    const base = target === "facet" ? facet : page;
    let mutated;
    try { mutated = mutate(base); } catch { mutated = base; }
    if (mutated === base) {
      results.push({ name: `NEGATIVE CONTROL (no-op — anchor moved): ${name}`, pass: false });
      continue;
    }
    const stillPasses = target === "facet"
      ? checks(page, mutated).every((c) => c.pass)
      : checks(mutated, facet).every((c) => c.pass);
    results.push({ name: `negative control caught: ${name}`, pass: !stillPasses });
  }
  return report(results, "control-consolidation self-test");
}

const selfTest = process.argv.includes("--self-test");
if (selfTest) {
  console.log(`${YELLOW}admin-orders control-consolidation — self-test (negative controls)${RESET}`);
  process.exit(runSelfTest());
} else {
  process.exit(runStatic());
}
