#!/usr/bin/env node
// LIVE-ACCOUNTS-DATE-RANGE-ALIGNMENT-001 — regression guard (static contract).
//
// Locks in the fix that keeps the Accounts view's DISPLAYED date range and the
// range sent to every Accounts data query aligned on initial load. The bug was
// a double-fetch race on mount: the preset-driven effect fired `period=30d`
// (because customActive started false) and raced the Accounts current-month
// fetch, and a stale response could overwrite the newer range.
//
// Invariants asserted on PaymentsTab.tsx:
//   1. Accounts is the default subtab; the default Accounts preset is current_month.
//   2. The preset-driven load effect early-returns for the Accounts view (which
//      owns its range via applyAccountsPreset) and depends on activeView.
//   3. fetchData carries a monotonic request sequence so a superseded response
//      cannot overwrite a newer selected range.
//   4. applyAccountsPreset is the SINGLE canonical resolver — used by the
//      accounts-init effect, the preset buttons, and "Reset to Current Month".
//   5. Every Accounts child panel receives the canonical customFrom/customTo range.
//   6. The fix does not force a page reload.
//
// Usage:
//   node scripts/check-accounts-date-range-alignment.mjs             # guard
//   node scripts/check-accounts-date-range-alignment.mjs --self-test # prove the checks discriminate

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F = join(ROOT, "src", "pages", "admin-orders", "components", "PaymentsTab.tsx");
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

// Each check: name + predicate over the file text.
const CHECKS = [
  ["Accounts is the default subtab", (s) => /useState<ActiveView>\("accounts"\)/.test(s)],
  ["default Accounts preset is current_month", (s) => /useState<AccountsPreset>\("current_month"\)/.test(s)],
  ["preset-driven effect early-returns for the Accounts view",
    (s) => /if \(activeView === "accounts"\) return;\s*[\r\n]+\s*if \(customActive\) return;\s*[\r\n]+\s*fetchData\(`period=\$\{period\}`\)/.test(s)],
  ["preset-driven effect depends on activeView",
    (s) => /fetchData\(`period=\$\{period\}`\);\s*[\r\n]+\s*\}, \[fetchData, period, customActive, activeView\]\)/.test(s)],
  ["fetchData increments a request sequence", (s) => /const seq = \+\+fetchSeq\.current;/.test(s) && /const fetchSeq = useRef\(0\)/.test(s)],
  ["fetchData ignores superseded responses (success + error)",
    (s) => (s.match(/if \(seq !== fetchSeq\.current\) return;/g) || []).length >= 2],
  ["fetchData only clears loading for the latest request", (s) => /if \(seq === fetchSeq\.current\) setLoading\(false\);/.test(s)],
  ["accounts-init effect uses the canonical resolver", (s) => /!accountsInit\.current[\s\S]{0,120}applyAccountsPreset\("current_month"\)/.test(s)],
  ['"Reset to Current Month" uses the canonical resolver',
    (s) => /applyAccountsPreset\("current_month"\)[\s\S]{0,300}Reset to Current Month/.test(s)],
  ["preset buttons use the canonical resolver", (s) => /onClick=\{\(\) => applyAccountsPreset\(b\.key\)\}/.test(s)],
  ["Channel Contribution receives canonical from/to",
    (s) => /<ChannelContributionPanel[\s\S]{0,160}from=\{customFrom[\s\S]{0,80}to=\{customTo/.test(s)],
  ["Marketing ROI Health receives canonical from/to",
    (s) => /<MarketingROIHealthPanel[\s\S]{0,160}from=\{customFrom[\s\S]{0,80}to=\{customTo/.test(s)],
  ["Marketing Spend receives canonical from/to",
    (s) => /<MarketingSpendPanel[\s\S]{0,200}from=\{customFrom[\s\S]{0,80}to=\{customTo/.test(s)],
  ["fix does not force a page reload", (s) => !/location\.reload\s*\(/.test(s)],
];

// Negative controls — deliberately broken snippets each check MUST reject,
// proving the checks have discriminating power.
const NEG = [
  ["ungated preset effect (original bug)",
    "if (customActive) return;\n    fetchData(`period=${period}`);\n  }, [fetchData, period, customActive]);",
    "preset-driven effect early-returns for the Accounts view"],
  ["no stale-response guard",
    "const result = await res.json();\n      if (!result.ok) throw new Error(x);\n      setData(result);",
    "fetchData ignores superseded responses (success + error)"],
  ["payments-default regression",
    'useState<ActiveView>("payments")',
    "Accounts is the default subtab"],
];

function run(s) { return CHECKS.filter(([, p]) => !p(s)).map(([n]) => n); }

const selfTest = process.argv.includes("--self-test");
const src = readFileSync(F, "utf8");

if (selfTest) {
  console.log(`${YELLOW}accounts-date-range-alignment — self-test${RESET}`);
  const results = [];
  results.push({ name: "real source passes all checks", pass: run(src).length === 0, detail: run(src).join(" | ") });
  for (const [label, , mustFailCheck] of NEG) {
    // Apply the specific poison for this control.
    let poisoned = src;
    if (label.includes("ungated")) poisoned = src.replace(/if \(activeView === "accounts"\) return;\s*[\r\n]+\s*/, "");
    else if (label.includes("stale-response")) poisoned = src.replace(/if \(seq !== fetchSeq\.current\) return;/g, "");
    else if (label.includes("payments-default")) poisoned = src.replace(/useState<ActiveView>\("accounts"\)/, 'useState<ActiveView>("payments")');
    const fails = run(poisoned).includes(mustFailCheck);
    results.push({ name: `negative control caught: ${label}`, pass: fails, detail: fails ? "" : `check "${mustFailCheck}" did not fire` });
  }
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"} ${r.name}${RESET}${r.detail ? " — " + r.detail : ""}`));
  if (failed.length) { console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`); process.exit(1); }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
} else {
  console.log(`${YELLOW}accounts-date-range-alignment — guard (static contract)${RESET}`);
  const failures = run(src);
  if (failures.length) {
    console.error(`${RED}✗ accounts date-range alignment guard FAILED${RESET}`);
    failures.forEach((f) => console.error(`  ${RED}✗${RESET} ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}✓ all ${CHECKS.length} date-range alignment invariants passed${RESET}`);
}
