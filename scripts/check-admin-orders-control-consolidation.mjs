#!/usr/bin/env node
// ADMIN-ORDERS-CONTROL-CONSOLIDATION-001 — regression guard.
//
// Item 9: the Orders controls live in ONE grouped Filters panel. Sequence
// Status, the date basis/range and the Meta Audience exports are all inside it;
// nothing floats in a separate strip above the table any more.
//
// The interesting assertions here are POSITIONAL, not "does this string exist".
// A control that is merely PRESENT tells us nothing — the whole point of the
// task is WHERE it is. So each check resolves character offsets and asserts the
// control sits inside (or outside) the collapsible panel's bounds.
//
// Usage:
//   node scripts/check-admin-orders-control-consolidation.mjs
//   node scripts/check-admin-orders-control-consolidation.mjs --self-test

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, "..", "src", "pages", "admin-orders", "page.tsx");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const PANEL_OPEN = '<div id="orders-filters-panel"';
// The panel's own closing marker: the summary line that ends it.
const PANEL_CLOSE_MARKER = "{/* ── The default scope, stated plainly ──";

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

function checks(src) {
  const out = [];
  const add = (name, pass) => out.push({ name, pass: !!pass });

  // ── Consolidation: these controls belong INSIDE the one panel ────────────
  add("Sequence Status select is inside the Filters panel",
    inPanel(src, "<select value={sequenceFilter}"));
  add("Meta Audience — Paid export is inside the Filters panel",
    inPanel(src, 'onClick={() => exportMetaAudience("paid")}'));
  add("Meta Audience — Paid + Refunded export is inside the Filters panel",
    inPanel(src, 'onClick={() => exportMetaAudience("paid_or_refunded")}'));
  add("the date basis/range controls stayed inside the panel",
    inPanel(src, "<input type=\"date\" value={dateFrom}"));

  // ── Exports are SEPARATED from ordinary filters, not another checkbox ────
  add("exports sit behind their own rule + heading",
    /border-t border-gray-200">\s*\n\s*<div className="flex items-center gap-1\.5 mb-2">\s*\n\s*<i className="ri-download-2-line/.test(src));

  // ── The strip above the table no longer carries export clutter ───────────
  // Asserts the USE is gone, not the mention: the comment recording the move is
  // allowed to survive, a second call site is not.
  add("exactly one call site per export mode (nothing left in the strip)",
    (src.match(/onClick=\{\(\) => exportMetaAudience\("paid"\)\}/g) || []).length === 1
    && (src.match(/onClick=\{\(\) => exportMetaAudience\("paid_or_refunded"\)\}/g) || []).length === 1);

  // ── Counts, chips, intersection semantics and Clear Filters preserved ────
  add("the Filters badge still counts active filters",
    /const activeFilterCount = \[/.test(src));
  add("Clear Filters is preserved", /clearAdvancedFilters/.test(src));
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
    (src.match(/const all = await fetchAllMatchingOrders\(\);/g) || []).length === 2);
  add("exports explicitly drop the 60-day default window",
    /\{ defaultScopeCutoff: null \}/.test(src));

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

function runStatic() {
  const src = readFileSync(PAGE, "utf8");
  return report(checks(src), "admin-orders control-consolidation guard");
}

// ── NEGATIVE CONTROLS ───────────────────────────────────────────────────────
// Each plants one specific regression and asserts the guard rejects it. A
// control whose anchor has moved reports NO-OP rather than passing silently.
const CONTROLS = [
  ["an export is put back in the strip above the table",
    (s) => s.replace(
      "                    {audienceMsg && (\n                      <span className=\"hidden sm:inline font-semibold text-emerald-600\">{audienceMsg}</span>",
      "                    <button onClick={() => exportMetaAudience(\"paid\")} />\n                    {audienceMsg && (\n                      <span className=\"hidden sm:inline font-semibold text-emerald-600\">{audienceMsg}</span>")],
  ["Sequence Status is pulled back out into its own strip",
    (s) => {
      const needle = "<select value={sequenceFilter}";
      const at = s.indexOf(needle);
      const stmtEnd = s.indexOf("</select>", at) + "</select>".length;
      const block = s.slice(at, stmtEnd);
      // move it ABOVE the panel entirely
      return s.slice(0, at) + s.slice(stmtEnd)
        .replace(PANEL_OPEN, block + "\n" + PANEL_OPEN);
    }],
  ["exports lose their separating rule and heading",
    (s) => s.replace('border-t border-gray-200">', 'border-transparent">')],
  ["Escape no longer closes the panel",
    (s) => s.replace('if (e.key === "Escape") {', "if (false) {")],
  ["an outside click no longer closes the panel",
    (s) => s.replace('document.addEventListener("mousedown", onPointer)', "void onPointer")],
  ["a click inside the panel starts closing it",
    (s) => s.replace("if (filtersPanelRef.current?.contains(t)) return;", "")],
  ["listeners leak after the panel closes",
    (s) => s.replace('document.removeEventListener("mousedown", onPointer);', "")],
  ["one export silently falls back to the loaded page",
    (s) => s.replace("const all = await fetchAllMatchingOrders();", "const all = orderRows;")],
  ["every export falls back to the loaded page",
    (s) => s.replaceAll("const all = await fetchAllMatchingOrders();", "const all = orderRows;")],
  ["exports inherit the 60-day default window",
    (s) => s.replace("{ defaultScopeCutoff: null }", "{ defaultScopeCutoff: defaultScopeCutoff }")],
  ["the scope notice is hidden behind the Filters panel again",
    (s) => {
      const needle = "Last {DEFAULT_SCOPE_DAYS} days + all open work";
      return s.replace(needle, "moved").replace(PANEL_OPEN, PANEL_OPEN + " data-x=\"" + needle + "\"");
    }],
  ["filter intersection semantics become an OR",
    (s) => s.replace(
      "return matchStatus && matchState && matchDoctor",
      "return matchStatus || matchState || matchDoctor")],
  ["the Filters badge stops counting active filters",
    (s) => s.replace("const activeFilterCount = [", "const activeFilterCount = 0 && [")],
];

function runSelfTest() {
  const src = readFileSync(PAGE, "utf8");
  const results = [];
  for (const [name, mutate] of CONTROLS) {
    let mutated;
    try { mutated = mutate(src); } catch { mutated = src; }
    if (mutated === src) {
      results.push({ name: `NEGATIVE CONTROL (no-op — anchor moved): ${name}`, pass: false });
      continue;
    }
    const stillPasses = checks(mutated).every((c) => c.pass);
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
