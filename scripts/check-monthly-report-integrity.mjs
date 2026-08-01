#!/usr/bin/env node
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §H/§I/§J — report guard.
//
// THE INCIDENT THIS PREVENTS
// --------------------------
// send-monthly-business-report existed ONLY in TEST, wired to a TEST cron and
// pointed at the owner's real inbox. For three months it emailed TEST database
// figures as PawTenant's actual performance. It computed environment = "TEST"
// correctly and even emitted "TEST has no ad-spend rows synced" — and sent
// anyway. Reporting the environment is not refusing to send from it.
//
// It also gated on the last day of the month in Asia/Karachi and reported the
// CURRENT month, so it generated at 14:59 America/New_York on the last day and
// permanently truncated the tail of every month it reported.
//
// Two layers:
//   1. LOGIC — imports the REAL assertSendable() from the function and proves
//      each blocker fires, that a clean LIVE case passes, and that no single
//      condition can be talked out of blocking.
//   2. STATIC — asserts the wiring: previous-completed-month gating, environment
//      resolved from the project ref only, no Asia/Karachi, dry runs never send,
//      QA markers exact rather than broad.
//
// Usage:
//   node scripts/check-monthly-report-integrity.mjs             # guard source
//   node scripts/check-monthly-report-integrity.mjs --self-test # prove it has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_FN = join(ROOT, "supabase", "functions", "send-monthly-business-report", "index.ts");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// The function imports Deno-only specifiers (jsr:/https:) at module scope and
// calls Deno.serve, so it cannot simply be imported here. The pure gate is
// extracted from the REAL source text and transpiled with esbuild — never
// reimplemented, so it cannot drift from what ships.
async function loadAssertSendable() {
  const src = read(F_FN);
  const start = src.indexOf("export function assertSendable");
  if (start < 0) throw new Error("assertSendable not found in the function source");
  // The parameter list contains an inline object TYPE, whose braces would fool a
  // naive matcher into ending the function at the end of the signature. So:
  // first walk the parameter list to its closing paren, THEN brace-match the body.
  let i = src.indexOf("(", start);
  if (i < 0) throw new Error("assertSendable signature not found");
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") paren++;
    else if (src[i] === ")") { paren--; if (paren === 0) { i++; break; } }
  }
  const bodyStart = src.indexOf("{", i);
  if (bodyStart < 0) throw new Error("assertSendable body not found");
  let depth = 0, end = -1;
  for (let j = bodyStart; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error("could not delimit assertSendable");

  // The gate references only this one module-scope constant.
  const tzLiteral = (src.match(/BUSINESS_TIMEZONE\s*=\s*("[^"]+")/) ?? [])[1] ?? '"America/New_York"';
  const snippet =
    `type EnvLabel = string;\ntype Report = Record<string, unknown>;\n` +
    `const BUSINESS_TIMEZONE = ${tzLiteral};\n` +
    src.slice(start, end);

  const { transform } = await import("esbuild");
  const { code } = await transform(snippet, { loader: "ts", format: "esm", target: "es2022" });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`;
  const mod = await import(dataUrl);
  if (typeof mod.assertSendable !== "function") throw new Error("assertSendable did not export cleanly");
  return mod.assertSendable;
}

const LIVE_OK = () => ({
  environment: "LIVE",
  period: { endExclusiveMs: Date.parse("2026-08-01T04:00:00Z") },
  now: new Date("2026-08-01T06:00:00Z"),
  report: { pnl: { gross_revenue: 1 } },
  adSpendAvailable: true,
  reconciled: true,
  qaRowsInScope: 0,
  recipients: ["owner@example.com"],
});

function runLogic(assertSendable) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(msg); };
  const blocks = (patch, why) => {
    const b = assertSendable({ ...LIVE_OK(), ...patch });
    ok(b.length > 0, `MUST BLOCK but did not: ${why}`);
    return b;
  };

  // A clean LIVE, completed-period case must actually be sendable, or the gate
  // is useless in the other direction (nothing would ever send).
  ok(assertSendable(LIVE_OK()).length === 0,
    `a clean LIVE case must be sendable, got: ${JSON.stringify(assertSendable(LIVE_OK()))}`);

  // ── The incident itself ───────────────────────────────────────────────────
  const testBlock = blocks({ environment: "TEST" }, "environment is TEST");
  ok(testBlock.some((x) => /not LIVE/i.test(x)), "the TEST blocker must say the environment is not LIVE");
  blocks({ environment: "UNKNOWN" }, "environment is UNKNOWN (unrecognised project ref)");

  // ── Period not finished in business time ──────────────────────────────────
  // The exact instant the July report actually generated: 2026-07-31 18:59Z,
  // which is 14:59 in New York — the month had ~9 hours left.
  const early = blocks({ now: new Date("2026-07-31T18:59:00Z") }, "period had not ended in America/New_York");
  ok(early.some((x) => /truncate/i.test(x)), "the early-send blocker must explain the truncation");
  // One second before New York midnight is still too early.
  blocks({ now: new Date("2026-08-01T03:59:59Z") }, "one second before the period ends");
  // Exactly at the boundary is fine (end is EXCLUSIVE).
  ok(assertSendable({ ...LIVE_OK(), now: new Date("2026-08-01T04:00:00Z") }).length === 0,
    "exactly at the exclusive boundary the period IS complete and must be sendable");

  // ── Data-integrity blockers ───────────────────────────────────────────────
  blocks({ report: null }, "canonical payload missing");
  const adBlock = blocks({ adSpendAvailable: false }, "paid-media spend unavailable");
  ok(adBlock.some((x) => /not zero spend/i.test(x)),
    "the ad-spend blocker must state that missing data is not zero spend");
  blocks({ qaRowsInScope: 1 }, "a QA fixture falls inside the period");
  blocks({ recipients: [] }, "no recipients resolved");

  // ── Reconciliation contract: a payload whose internal to-the-cent checks
  //     failed must never be emailed, no matter how healthy everything else is.
  const recBlock = blocks({ reconciled: false }, "canonical payload failed reconciliation");
  ok(recBlock.some((x) => /reconciliation|to the cent/i.test(x)),
    "the reconciliation blocker must say the payload failed its internal checks");

  // ── Blockers accumulate; none masks another ───────────────────────────────
  const many = assertSendable({
    ...LIVE_OK(), environment: "TEST", report: null, adSpendAvailable: false, reconciled: false, qaRowsInScope: 3, recipients: [],
  });
  ok(many.length >= 6, `every failing condition must be reported, got ${many.length}: ${JSON.stringify(many)}`);

  return f;
}

function runStatic() {
  const f = [];
  const s = read(F_FN);
  const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const need = (re, why) => { if (!re.test(code)) f.push(why); };
  const forbid = (re, why) => { if (re.test(code)) f.push(why); };

  // ── Timezone ──
  forbid(/Asia\/Karachi/, "the report must never reference Asia/Karachi");
  forbid(/pktParts|\bpkt\b/, "the PKT helper must be gone, not merely unused");
  need(/from "\.\.\/_shared\/businessTime\.ts"/, "the report must use the canonical shared business clock");
  need(/previousBusinessMonth\(/, "the default period must be the PREVIOUS business month, not the current one");
  need(/isBusinessPeriodComplete\(/, "the report must verify the period is actually over");

  // ── Environment ──
  need(/function resolveEnvironment/, "environment must be resolved by a dedicated function");
  need(/supabaseUrl\.includes\(LIVE_PROJECT_REF\)/, "LIVE must be identified by project ref");
  forbid(/Deno\.env\.get\("ENVIRONMENT"\)/,
    "a mislabelled ENVIRONMENT variable must not be able to promote TEST into LIVE");

  // ── Fail-closed send ──
  need(/export function assertSendable/, "the send gate must be an exported, testable function");
  need(/if \(blockers\.length > 0\)/, "a real send must be gated on the blocker list");
  need(/status: "blocked"/, "a blocked run must be recorded as blocked, not left looking successful");
  // force must not be able to bypass the gate.
  forbid(/blockers\.length > 0 && !force|!force && blockers\.length/,
    "force must never bypass the environment/period gate — it exists only for idempotency");

  // ── Dry run never sends ──
  const dryIdx = code.indexOf("if (dryRun)");
  const sendIdx = code.indexOf("await sendViaResend(");
  if (dryIdx < 0 || sendIdx < 0) f.push("could not locate the dry-run branch and the send call");
  else if (dryIdx > sendIdx) f.push("the dry-run early return must precede the send call");

  // ── QA exclusion is exact, not broad ──
  need(/PT-LIVE-PENDINGQA/, "QA fixtures must be matched by the reserved confirmation-id pattern");
  forbid(/ilike\s*['"]%test%|toLowerCase\(\)\.includes\(["']test["']\)|\/test\/i\.test\(/,
    "QA exclusion must not be a broad text match — a real customer must never be dropped from financial reporting");

  // ── Canonical payload wiring (v2) ──
  need(/rpc\("get_monthly_business_report", \{ p_month: target\.month \}\)/,
    "the report must load THE canonical payload by month key (server-side America/New_York period)");
  forbid(/rpc\("get_monthly_business_report", \{ p_from/,
    "the v1 date-args payload call must be gone — caller-computed periods are the bug this task removed");
  need(/reconciliation\?\.reconciled === true/,
    "the reconciliation verdict must be read from the payload and default to NOT reconciled");
  need(/ad_spend_available === true/,
    "paid-media availability must come from the payload's explicit boolean, never inferred from warning text");
  need(/qa_fixture_rows_in_period/,
    "the QA fixture count must come from the payload's server-side scan");
  need(/buildWorkbook\([\s\S]{0,220}?ENV_LABEL\)/,
    "the workbook must receive the resolved environment so every sheet carries the env indicator");

  return f;
}

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const assertSendable = await loadAssertSendable();

  if (selfTest) {
    const plants = [
      ["environment blocker removed (the actual incident)",
        (i) => assertSendable(i).filter((x) => !/not LIVE/i.test(x))],
      ["period completeness blocker removed",
        (i) => assertSendable(i).filter((x) => !/truncate/i.test(x))],
      ["ad-spend blocker removed",
        (i) => assertSendable(i).filter((x) => !/zero spend/i.test(x))],
      ["gate always passes",
        () => []],
    ];
    let total = 0;
    for (const [name, sabotaged] of plants) {
      const found = runLogic(sabotaged);
      if (found.length === 0) {
        console.error(`${RED}✗ SELF-TEST FAILED: "${name}" passed the battery${RESET}`);
        process.exit(1);
      }
      total += found.length;
    }
    console.log(`${GREEN}✓ self-test: battery detected ${total} defect(s) across ${plants.length} plants${RESET}`);
  }

  const failures = [...runLogic(assertSendable), ...runStatic()];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-monthly-report-integrity: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-monthly-report-integrity: LIVE-only, period-complete, fail-closed; dry runs never send${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-monthly-report-integrity crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
