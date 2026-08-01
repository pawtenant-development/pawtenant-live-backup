#!/usr/bin/env node
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 — canonical-payload guard.
//
// THE INVARIANT
// -------------
// There is ONE month-end payload (get_monthly_business_report(p_month), v2) and
// every consumer — email, workbook, previews — renders it verbatim. No consumer
// recomputes a financial number; there is exactly one Operating Net formula
// (computeOperatingNet = business_net − other − salary − ad_spend), realised
// once in SQL and once in TS, and this guard proves the two agree on shared
// vectors (including negative nets, which must never be clamped).
//
// Layers:
//   1. SQL     — the payload migration derives the period server-side in
//                America/New_York, computes Operating Net from business_net,
//                embeds to-the-cent reconciliation checks, keeps the QA markers
//                exact, and revokes anon EXECUTE by name.
//   2. EMAIL   — §J sections present; Operating Net never shown positively when
//                paid media is unavailable; non-LIVE builds banner as previews.
//   3. WORKBOOK— §K: the eleven required sheets, no fabricated zeros for
//                unavailable sources, reconciliation table rendered.
//   4. FORMULA — computeOperatingNet (TS) vs the SQL arithmetic on shared
//                vectors, via esbuild transform of the REAL module.
//
// Usage:
//   node scripts/check-month-end-canonical-payload.mjs             # guard
//   node scripts/check-month-end-canonical-payload.mjs --self-test # prove power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MIG = "supabase/migrations/20260801172000_month_end_report_stack.sql";
const FN = "supabase/functions/send-monthly-business-report/index.ts";
const WB = "supabase/functions/send-monthly-business-report/workbook.ts";
const FLOW = "src/lib/accountsFinancialFlow.ts";
const CRON = "docs/SCHEDULE_MONTHLY_REPORT_CRON.sql";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

export const REQUIRED_SHEETS = [
  "Executive Summary", "Profit & Loss", "Orders", "Paid Marketing",
  "Organic Search", "Traffic & Attribution", "Providers", "States",
  "Refunds", "Expenses", "Data Quality & Reconciliation",
];

const EMAIL_SECTIONS = [
  "Executive Financials", "Operations", "Acquisition", "Owner Insights",
  "Month over Month", "Data Quality", "Attachment",
];

const RECON_CHECK_NAMES = [
  "cross_channel_orders_equal_paid_orders",
  "cross_channel_revenue_equals_gross",
  "business_net_identity",
  "operating_net_one_formula",
  "expense_components_sum_to_total",
  "gross_minus_total_expenses_equals_operating_net",
  "google_block_matches_channel_bucket",
];

export const CHECKS = [
  // ── 1. SQL: the payload ────────────────────────────────────────────────────
  { name: "payload RPC takes the month key, not caller-computed dates", file: MIG,
    run: (s) => /create or replace function public\.get_monthly_business_report\(p_month text\)/.test(s)
      ? null : "get_monthly_business_report(p_month text) not defined" },
  { name: "the v1 date-args signature is dropped", file: MIG,
    run: (s) => /drop function if exists public\.get_monthly_business_report\(date, date\)/.test(s)
      ? null : "old (p_from date, p_to date) signature must be dropped — two payload functions = two truths" },
  { name: "period derived server-side in America/New_York, DST-safe", file: MIG,
    run: (s) => /make_timestamptz\([\s\S]{0,80}?v_tz\)/.test(s) && /'America\/New_York'/.test(s)
      ? null : "both period bounds must come from make_timestamptz(..., America/New_York)" },
  { name: "Operating Net is derived FROM business_net (the ONE formula)", file: MIG,
    run: (s) => /v_operating_net\s+:= round\(v_business_net - round\(v_other_exp,2\) - v_salary_usd - v_ad_spend, 2\)/.test(s)
      ? null : "operating net must be business_net − other − salary − ad_spend (computeOperatingNet)" },
  { name: "the payload names its formula", file: MIG,
    run: (s) => /'operating_net_formula'/.test(s) && /computeOperatingNet/.test(s)
      ? null : "payload must carry the formula contract string" },
  { name: "every reconciliation check is present", file: MIG,
    run: (s) => {
      const missing = RECON_CHECK_NAMES.filter((n) => !s.includes(`'${n}'`));
      return missing.length === 0 ? null : `reconciliation check(s) missing: ${missing.join(", ")}`;
    } },
  { name: "reconciled verdict is the AND of every check", file: MIG,
    run: (s) => /bool_and\(\(c->>'pass'\)::boolean\)/.test(s) ? null : "reconciled must be bool_and over the checks" },
  { name: "ad spend deducted from the synced source only", file: MIG,
    run: (s) => /not in \('employee_salary','provider_payout','google_ads','facebook_meta'\)/.test(s)
      ? null : "other-expenses must exclude ads/salary/payout categories or paid media double-counts" },
  { name: "missing spend is a state, never $0", file: MIG,
    run: (s) => /'not_connected'/.test(s) && /'connected_stale'/.test(s) && /v_ad_spend_available/.test(s)
      ? null : "platform connection states + ad_spend_available flag are required" },
  { name: "QA markers are exact, never broad", file: MIG,
    run: (s) => /PT-LIVE-PENDINGQA-\\d\{2,4\}\$/.test(s) && !/ilike\s*'%test%'/i.test(s)
      ? null : "QA fixture scan must use the reserved patterns only" },
  { name: "payload RPC is SECURITY DEFINER, pinned, anon revoked by name", file: MIG,
    run: (s) => /security definer/i.test(s) && /set search_path to 'public'/i.test(s)
      && /revoke all on function public\.get_monthly_business_report\(text\) from public, anon/.test(s)
      ? null : "definer + pinned search_path + revoke-by-name required" },
  { name: "cancellations are counted on the EVENT timestamp", file: MIG,
    run: (s) => /last_cancelled_at >= v_start and last_cancelled_at < v_end/.test(s)
      ? null : "cancelled_orders must key on last_cancelled_at (v1 wrongly used created_at)" },

  // ── 2. EMAIL (§J) ──────────────────────────────────────────────────────────
  { name: "email contains every required section", file: FN,
    run: (s) => {
      const missing = EMAIL_SECTIONS.filter((n) => !s.includes(`"${n}"`) && !s.includes(`(\"${n}\")`) && !s.includes(`sectionTitle("${n}")`));
      return missing.length === 0 ? null : `email section(s) missing: ${missing.join(", ")}`;
    } },
  { name: "Operating Net is never shown positively without paid media", file: FN,
    run: (s) => /adSpendAvailable\s*\n?\s*\?/.test(s.replace(/\r/g, "")) && /paid media not synced/.test(s)
      ? null : "the Operating Net cell must degrade to an 'unavailable' state when ad spend is missing" },
  { name: "non-LIVE builds banner as previews, LIVE states its source", file: FN,
    run: (s) => /PREVIEW — NOT PRODUCTION DATA/.test(s) && /LIVE PawTenant production data/.test(s)
      ? null : "environment statement / TEST banner missing" },
  { name: "insights are derived and capped at five", file: FN,
    run: (s) => /export function buildInsights/.test(s) && /\.slice\(0, 5\)/.test(s)
      ? null : "buildInsights must exist and cap at 5 bullets" },
  { name: "email layout is table-based (no flex — Gmail strips it)", file: FN,
    run: (s) => {
      const emailStart = s.indexOf("export function buildEmail");
      const emailEnd = s.indexOf("Deno.serve", emailStart);
      const body = s.slice(emailStart, emailEnd);
      return /display:\s*flex/.test(body) ? "buildEmail uses display:flex — Gmail drops it and the strip collapses" : null;
    } },
  { name: "the email never recomputes the Stripe-fee estimate", file: FN,
    run: (s) => /0\.029/.test(s) ? "index.ts contains the 2.9% fee arithmetic — consumers must render, not recompute" : null },
  { name: "the workbook never recomputes the Stripe-fee estimate", file: WB,
    run: (s) => /0\.029/.test(s) ? "workbook.ts contains the 2.9% fee arithmetic — consumers must render, not recompute" : null },
  { name: "negative currency renders with an explicit minus", file: FN,
    run: (s) => /n < 0 \? `-\$\$\{abs\}` : `\$\$\{abs\}`/.test(s.replace(/\r/g, ""))
      ? null : "usd() must render negatives visibly (leading minus)" },

  // ── 3. WORKBOOK (§K) ───────────────────────────────────────────────────────
  { name: "the eleven required sheets are declared AND appended in order", file: WB,
    run: (s) => {
      const missingDecl = REQUIRED_SHEETS.filter((n) => !s.includes(`"${n}"`));
      if (missingDecl.length) return `sheet name(s) missing: ${missingDecl.join(", ")}`;
      let last = -1;
      for (const n of REQUIRED_SHEETS) {
        const i = s.indexOf(`append("${n}"`);
        if (i < 0) return `sheet never appended: ${n}`;
        if (i < last) return `sheet out of order: ${n}`;
        last = i;
      }
      return null;
    } },
  { name: "REQUIRED_SHEETS is exported for cross-checks", file: WB,
    run: (s) => /export const REQUIRED_SHEETS/.test(s) ? null : "REQUIRED_SHEETS export missing" },
  { name: "GSC metrics are marked, never zeroed", file: WB,
    run: (s) => /not integrated/.test(s) ? null : "Organic Search sheet must mark GSC metrics as not integrated" },
  { name: "the reconciliation table renders PASS/FAIL per check", file: WB,
    run: (s) => /chk\.pass \? "PASS" : "FAIL"/.test(s) ? null : "Data Quality & Reconciliation must render the payload's checks" },
  { name: "every sheet header carries period, timezone, generated stamp and env", file: WB,
    run: (s) => /Generated \$\{new Date\(\)\.toISOString/.test(s) && /envTag/.test(s) && /\(\$\{tz\}\)/.test(s)
      ? null : "titleBlock must stamp period, timezone, generated time and environment" },
  { name: "freeze panes + autofilters survive", file: WB,
    run: (s) => /injectFreeze/.test(s) && /autofilter/.test(s) ? null : "frozen headers / autofilters missing" },

  // ── 5. CRON (§M) ───────────────────────────────────────────────────────────
  { name: "cron v2 is the bounded-window + NY-gate strategy", file: CRON,
    run: (s) => /0 6-13 1-5 \* \*/.test(s) && /DST/.test(s) && /active := false/.test(s)
      ? null : "cron doc must carry the hourly bounded window, the DST rationale, and TEST-disabled containment" },
  { name: "cron never uses a single fixed UTC hour", file: CRON,
    run: (s) => /'59 18 \* \* \*'[\s\S]*cron\.schedule/.test(s)
      ? "the v1 daily-Karachi schedule is being re-created" : null },
];

// ── 4. FORMULA TWIN — computeOperatingNet(TS) vs the SQL arithmetic ──────────
async function loadComputeOperatingNet(sourceOverride) {
  const src = (sourceOverride ?? read(FLOW));
  const start = src.indexOf("export function computeOperatingNet");
  if (start < 0) throw new Error("computeOperatingNet not found");
  const end = src.indexOf("}", src.indexOf("return", start)) + 1;
  // The function depends on round2 + numOr0 — extract them too.
  const helper = (name) => {
    const i = src.indexOf(`function ${name}`);
    if (i < 0) throw new Error(`${name} not found`);
    let j = src.indexOf("{", i), depth = 0, k = j;
    for (; k < src.length; k++) {
      if (src[k] === "{") depth++;
      else if (src[k] === "}") { depth--; if (depth === 0) { k++; break; } }
    }
    return src.slice(i, k).replace(/^export /, "");
  };
  const snippet = `${helper("round2")}\n${helper("numOr0")}\n${src.slice(start, end)}`;
  const { transform } = await import("esbuild");
  const { code } = await transform(snippet, { loader: "ts", format: "esm", target: "es2022" });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`);
  return mod.computeOperatingNet;
}

// The SQL side: round(bn − round(e,2) − s − a, 2). Vectors chosen so 2dp
// rounding is exercised and a genuine loss appears (never clamped).
const sqlOperatingNet = (bn, e, s, a) =>
  Math.round((bn - Math.round(e * 100) / 100 - s - a) * 100) / 100;

const VECTORS = [
  { businessNet: 15669.32, expenses: 870.75, salary: 438.02, adSpend: 9909.17 },  // LIVE July 2026
  { businessNet: 2513.27, expenses: 0, salary: 405.95, adSpend: 0 },              // TEST July 2026
  { businessNet: 1000, expenses: 2000, salary: 500, adSpend: 700 },               // a real LOSS
  { businessNet: 0.115, expenses: 0.005, salary: 0.055, adSpend: 0.045 },         // rounding edges
  { businessNet: -50.5, expenses: 10.333, salary: 0, adSpend: 0 },                // negative input
];

async function runFormulaTwin(computeOperatingNet) {
  const f = [];
  for (const v of VECTORS) {
    const ts = computeOperatingNet(v);
    const sql = sqlOperatingNet(v.businessNet, v.expenses, v.salary, v.adSpend);
    if (Math.abs(ts - sql) > 0.005) {
      f.push(`formula twins disagree on ${JSON.stringify(v)}: TS=${ts} SQL=${sql}`);
    }
  }
  const loss = computeOperatingNet({ businessNet: 1000, expenses: 2000, salary: 500, adSpend: 700 });
  if (loss >= 0) f.push(`a genuine loss was clamped to ${loss} — losses must render as losses`);
  return f;
}

function runStatic() {
  const failures = [];
  for (const c of CHECKS) {
    let res;
    try { res = c.run(c.file ? read(c.file) : undefined); }
    catch (e) { res = `check threw: ${e.message}`; }
    if (res) failures.push(`${c.name} — ${res}`);
  }
  return failures;
}

async function main() {
  const selfTest = process.argv.includes("--self-test");

  if (selfTest) {
    // Every plant must be DETECTED (produce ≥1 failure) or the guard is decorative.
    const plants = [
      ["Organic Search sheet dropped", () => {
        const s = read(WB).replace(/append\("Organic Search", organicSheet\(\)\);/, "");
        const chk = CHECKS.find((c) => c.name.includes("eleven required sheets"));
        return chk.run(s) ? 1 : 0;
      }],
      ["fee arithmetic recomputed in the email", () => {
        const s = read(FN) + "\nconst fee = num(pnl.gross_revenue) * 0.029 + 0.30;\n";
        const chk = CHECKS.find((c) => c.name === "the email never recomputes the Stripe-fee estimate");
        return chk.run(s) ? 1 : 0;
      }],
      ["Operating Net formula bypasses business_net", () => {
        const s = read(MIG).replace(/v_operating_net\s+:= round\(v_business_net/, "v_operating_net  := round(v_gross");
        const chk = CHECKS.find((c) => c.name.includes("derived FROM business_net"));
        return chk.run(s) ? 1 : 0;
      }],
      ["anon revoke removed from the payload RPC", () => {
        const s = read(MIG).replace(/revoke all on function public\.get_monthly_business_report\(text\) from public, anon;?/, "");
        const chk = CHECKS.find((c) => c.name.includes("anon revoked by name"));
        return chk.run(s) ? 1 : 0;
      }],
      ["TEST preview banner removed from the email", () => {
        const s = read(FN).replace(/PREVIEW — NOT PRODUCTION DATA/g, "");
        const chk = CHECKS.find((c) => c.name.includes("banner as previews"));
        return chk.run(s) ? 1 : 0;
      }],
      ["reconciliation check silently dropped", () => {
        const s = read(MIG).replace(/'operating_net_one_formula',/g, "'renamed_check',");
        const chk = CHECKS.find((c) => c.name.includes("every reconciliation check"));
        return chk.run(s) ? 1 : 0;
      }],
      ["computeOperatingNet clamps losses", async () => {
        const sab = read(FLOW).replace(
          /return round2\(\s*numOr0\(i\.businessNet\) - numOr0\(i\.expenses\) - numOr0\(i\.salary\) - numOr0\(i\.adSpend\),?\s*\);/,
          "return Math.max(0, round2(numOr0(i.businessNet) - numOr0(i.expenses) - numOr0(i.salary) - numOr0(i.adSpend)));");
        const fn = await loadComputeOperatingNet(sab);
        return (await runFormulaTwin(fn)).length > 0 ? 1 : 0;
      }],
    ];
    for (const [name, run] of plants) {
      const hit = await run();
      if (!hit) {
        console.error(`${RED}✗ SELF-TEST FAILED: plant "${name}" was not detected${RESET}`);
        process.exit(1);
      }
    }
    console.log(`${GREEN}✓ self-test: ${plants.length}/${plants.length} planted defects detected${RESET}`);
  }

  const computeOperatingNet = await loadComputeOperatingNet();
  const failures = [...runStatic(), ...(await runFormulaTwin(computeOperatingNet))];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-month-end-canonical-payload: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-month-end-canonical-payload: one payload, one formula, ${REQUIRED_SHEETS.length} sheets, §J sections, exact QA markers, DST-safe cron${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-month-end-canonical-payload crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
