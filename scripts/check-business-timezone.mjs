#!/usr/bin/env node
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §C + §11 — business clock guard.
//
// Locks the canonical business timezone contract:
//   • America/New_York, always — never browser-local, never a fixed UTC offset,
//     never Asia/Karachi, never the server's zone.
//   • start-INCLUSIVE, end-EXCLUSIVE periods, converted to real UTC instants.
//   • DST-safe across both US transitions.
//
// Two layers:
//   1. LOGIC — imports the REAL src/lib/businessTime.ts via jiti and runs the
//      §11 boundary matrix, including the cases that actually shipped broken:
//      the minute before New York midnight, month-end, year-end, both DST
//      transitions, and an operator whose own clock is in Karachi.
//   2. STATIC — asserts the Accounts date layer resolves through this module
//      and no longer reads browser-local components.
//
// Usage:
//   node scripts/check-business-timezone.mjs             # guard source
//   node scripts/check-business-timezone.mjs --self-test # prove the battery has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_TIME = join(ROOT, "src", "lib", "businessTime.ts");
// Edge-runtime twin. Deno cannot import from src/ and the browser bundle cannot
// import from supabase/functions/, so the clock exists twice on purpose. Both
// copies run the SAME battery below and must agree, or the report would quietly
// keep a different calendar from Accounts.
const F_TIME_EDGE = join(ROOT, "supabase", "functions", "_shared", "businessTime.ts");
const F_PERIODS = join(ROOT, "src", "lib", "accountsPeriods.ts");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const jiti = createJiti(import.meta.url);
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : String(d));

function runLogic(m) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(msg); };

  ok(m.BUSINESS_TIMEZONE === "America/New_York",
    `BUSINESS_TIMEZONE must be America/New_York, got ${m.BUSINESS_TIMEZONE}`);

  // ── A. Month boundaries resolve to the right UTC instants ─────────────────
  // July 2026 is EDT (UTC-4): [Jul 1 04:00Z, Aug 1 04:00Z).
  const july = m.businessMonth(2026, 6);
  ok(iso(july.start) === "2026-07-01T04:00:00.000Z", `July start must be 04:00Z (EDT), got ${iso(july.start)}`);
  ok(iso(july.endExclusive) === "2026-08-01T04:00:00.000Z", `July end-exclusive must be 04:00Z, got ${iso(july.endExclusive)}`);
  ok(july.from === "2026-07-01", `July from must be 2026-07-01, got ${july.from}`);
  ok(july.toInclusive === "2026-07-31", `July toInclusive must be 2026-07-31, got ${july.toInclusive}`);
  ok(july.key === "2026-07" && july.label === "July 2026", `July key/label wrong: ${july.key} / ${july.label}`);

  // January 2026 is EST (UTC-5): [Jan 1 05:00Z, Feb 1 05:00Z). A fixed -4 offset
  // would be an hour wrong here — this is the DST-safety assertion.
  const jan = m.businessMonth(2026, 0);
  ok(iso(jan.start) === "2026-01-01T05:00:00.000Z", `January start must be 05:00Z (EST), got ${iso(jan.start)}`);
  ok(iso(jan.endExclusive) === "2026-02-01T05:00:00.000Z", `January end-exclusive must be 05:00Z, got ${iso(jan.endExclusive)}`);
  ok(iso(july.start) === iso(m.businessWallClockToUtc(2026, 6, 1, 0, 0)),
    "businessMonth start and businessWallClockToUtc must agree");

  // Year end: December rolls into the next YEAR, not month 12.
  const dec = m.businessMonth(2026, 11);
  ok(iso(dec.endExclusive) === "2027-01-01T05:00:00.000Z", `December end-exclusive must be 2027-01-01T05:00Z, got ${iso(dec.endExclusive)}`);
  ok(dec.toInclusive === "2026-12-31", `December toInclusive wrong: ${dec.toInclusive}`);

  // Leap year February.
  const feb28 = m.businessMonth(2028, 1);
  ok(feb28.toInclusive === "2028-02-29", `Feb 2028 is a leap month, expected 2028-02-29, got ${feb28.toInclusive}`);

  // ── B. The exact instants that shipped broken ─────────────────────────────
  // One minute BEFORE New York midnight on Jul 31 = still July.
  const beforeMidnight = new Date("2026-08-01T03:59:00Z");
  ok(m.businessMonthKey(beforeMidnight) === "2026-07",
    `23:59 New York on Jul 31 must be July, got ${m.businessMonthKey(beforeMidnight)}`);
  // Exactly New York midnight = August.
  const atMidnight = new Date("2026-08-01T04:00:00Z");
  ok(m.businessMonthKey(atMidnight) === "2026-08",
    `00:00 New York on Aug 1 must be August, got ${m.businessMonthKey(atMidnight)}`);
  // One minute after.
  ok(m.businessMonthKey(new Date("2026-08-01T04:01:00Z")) === "2026-08", "00:01 New York on Aug 1 must be August");

  // The report generated at 2026-07-31 18:59Z. In Karachi that is 23:59 on
  // Jul 31, which is why it fired; in New York it is only 14:59 on Jul 31, so
  // the month was NOT over and the tail was truncated.
  const reportRan = new Date("2026-07-31T18:59:00Z");
  ok(m.businessParts(reportRan).day === 31 && m.businessParts(reportRan).hour === 14,
    `the July report instant must read as Jul 31 14:xx in New York, got day ${m.businessParts(reportRan).day} hour ${m.businessParts(reportRan).hour}`);
  ok(m.isBusinessPeriodComplete(july, reportRan) === false,
    "July must NOT be complete at the instant the July report actually generated");
  ok(m.isBusinessPeriodComplete(july, new Date("2026-08-01T04:00:00Z")) === true,
    "July must be complete at New York midnight on Aug 1");
  ok(m.isBusinessPeriodComplete(july, new Date("2026-08-01T03:59:59Z")) === false,
    "July must NOT be complete one second before New York midnight");

  // A Stripe charge at 21:30 New York on Jul 31 is a JULY charge, even though it
  // is already Aug 1 in UTC and in Karachi.
  const lateCharge = Math.floor(new Date("2026-08-01T01:30:00Z").getTime() / 1000);
  ok(m.businessMonthKeyOfUnix(lateCharge) === "2026-07",
    `a 21:30 New York charge on Jul 31 must bucket to July, got ${m.businessMonthKeyOfUnix(lateCharge)}`);

  // ── C. DST transitions ────────────────────────────────────────────────────
  // Spring forward 2026-03-08: 02:00 EST -> 03:00 EDT. March has 31 days and the
  // month must still span exactly Mar 1 .. Mar 31 with correct offsets on each end.
  const mar = m.businessMonth(2026, 2);
  ok(iso(mar.start) === "2026-03-01T05:00:00.000Z", `March start must be EST 05:00Z, got ${iso(mar.start)}`);
  ok(iso(mar.endExclusive) === "2026-04-01T04:00:00.000Z", `April 1 boundary must be EDT 04:00Z, got ${iso(mar.endExclusive)}`);
  ok(mar.toInclusive === "2026-03-31", `March toInclusive wrong: ${mar.toInclusive}`);
  // Fall back 2026-11-01: 02:00 EDT -> 01:00 EST.
  const nov = m.businessMonth(2026, 10);
  ok(iso(nov.start) === "2026-11-01T04:00:00.000Z", `November start must be EDT 04:00Z, got ${iso(nov.start)}`);
  ok(iso(nov.endExclusive) === "2026-12-01T05:00:00.000Z", `December 1 boundary must be EST 05:00Z, got ${iso(nov.endExclusive)}`);
  ok(nov.toInclusive === "2026-11-30", `November toInclusive wrong: ${nov.toInclusive}`);
  // A month spanning a transition is NOT a whole number of 24h days.
  const marHours = (mar.endExclusive - mar.start) / 3_600_000;
  ok(marHours === 31 * 24 - 1, `March must be 743h across spring-forward, got ${marHours}`);
  const novHours = (nov.endExclusive - nov.start) / 3_600_000;
  ok(novHours === 30 * 24 + 1, `November must be 721h across fall-back, got ${novHours}`);

  // ── D. Independent of the process timezone ────────────────────────────────
  // The helpers must not consult the host clock's zone at all. Same instant,
  // same answer, regardless of what TZ the build machine runs in.
  ok(m.businessMonthKey(new Date("2026-08-01T03:00:00Z")) === "2026-07",
    "23:00 New York must read as July no matter the host timezone");

  // ── E. previous / current month ───────────────────────────────────────────
  const prev = m.previousBusinessMonth(new Date("2026-08-15T12:00:00Z"));
  ok(prev.key === "2026-07", `previous month of Aug must be July, got ${prev.key}`);
  const prevJan = m.previousBusinessMonth(new Date("2026-01-15T12:00:00Z"));
  ok(prevJan.key === "2025-12", `previous month of Jan must be Dec of the prior year, got ${prevJan.key}`);
  const cur = m.currentBusinessMonth(new Date("2026-08-01T03:59:00Z"));
  ok(cur.key === "2026-07", `at 23:59 New York on Jul 31 the CURRENT business month is July, got ${cur.key}`);

  // ── F. recentBusinessMonths walks back correctly across a year boundary ───
  const recent = m.recentBusinessMonths(3, new Date("2026-01-15T12:00:00Z")).map((x) => x.key);
  ok(JSON.stringify(recent) === JSON.stringify(["2026-01", "2025-12", "2025-11"]),
    `recentBusinessMonths across a year boundary wrong: ${JSON.stringify(recent)}`);

  return f;
}

function runStatic() {
  const f = [];
  const time = read(F_TIME);
  const per = read(F_PERIODS);
  const need = (src, name, re, why) => { if (!re.test(src)) f.push(`${name}: ${why}`); };
  const forbid = (src, name, re, why) => { if (re.test(src)) f.push(`${name}: ${why}`); };

  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  need(time, "businessTime.ts", /BUSINESS_TIMEZONE\s*=\s*"America\/New_York"/,
    "the canonical timezone must be America/New_York");
  forbid(code(time), "businessTime.ts", /Asia\/Karachi/,
    "the business clock must never reference Asia/Karachi");
  forbid(code(time), "businessTime.ts", /UTC-[45]|[+-]0[45]:00["']|getTimezoneOffset\(\)/,
    "a fixed UTC offset or the host offset must never stand in for the IANA zone");
  need(time, "businessTime.ts", /Intl\.DateTimeFormat/,
    "offsets must be resolved from the IANA database");
  need(time, "businessTime.ts", /endExclusive/,
    "periods must expose an EXCLUSIVE upper bound");

  // Accounts must resolve through the business clock, not browser-local getters.
  need(per, "accountsPeriods.ts", /from ["']\.\/businessTime["']/,
    "Accounts periods must resolve through the canonical business clock");
  forbid(code(per), "accountsPeriods.ts", /\bnew Date\([^)]*\)\.getFullYear\(\)|now\.getFullYear\(\)|now\.getMonth\(\)|d\.getDate\(\)/,
    "Accounts periods must not read browser-local date components");
  forbid(code(per), "accountsPeriods.ts", /setDate\(/,
    "date arithmetic must go through the business wall clock, not local setDate");

  return f;
}

// Both copies must behave identically. Runs the full battery against the edge
// twin and additionally compares every boundary value directly.
function runTwinParity(browser, edge) {
  const f = [];
  if (edge.BUSINESS_TIMEZONE !== browser.BUSINESS_TIMEZONE) {
    f.push(`edge twin uses ${edge.BUSINESS_TIMEZONE}, browser uses ${browser.BUSINESS_TIMEZONE}`);
  }
  for (let y = 2025; y <= 2028; y++) {
    for (let m = 0; m < 12; m++) {
      const a = browser.businessMonth(y, m);
      const b = edge.businessMonth(y, m);
      for (const k of ["key", "label", "from", "toInclusive"]) {
        if (a[k] !== b[k]) f.push(`twin drift ${y}-${m + 1} .${k}: browser ${a[k]} vs edge ${b[k]}`);
      }
      if (a.start.getTime() !== b.start.getTime()) f.push(`twin drift ${y}-${m + 1} .start`);
      if (a.endExclusive.getTime() !== b.endExclusive.getTime()) f.push(`twin drift ${y}-${m + 1} .endExclusive`);
    }
  }
  return f;
}

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const mod = await jiti.import(F_TIME);
  const edgeMod = await jiti.import(F_TIME_EDGE);

  if (selfTest) {
    const plants = [
      ["fixed UTC-4 offset (breaks every winter month)", {
        ...mod,
        businessMonth: (y, m0) => {
          const r = mod.businessMonth(y, m0);
          return { ...r, start: new Date(Date.UTC(y, m0, 1, 4, 0)) };
        },
      }],
      ["browser-local month key", {
        ...mod,
        businessMonthKey: (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      }],
      ["period treated as complete while still running", {
        ...mod,
        isBusinessPeriodComplete: () => true,
      }],
      ["inclusive upper bound (end shifted back a day)", {
        ...mod,
        businessMonth: (y, m0) => {
          const r = mod.businessMonth(y, m0);
          return { ...r, endExclusive: new Date(r.endExclusive.getTime() - 86_400_000) };
        },
      }],
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

  const failures = [
    ...runLogic(mod),
    // The edge twin runs the ENTIRE battery too, not just a spot check.
    ...runLogic(edgeMod).map((x) => `[edge twin] ${x}`),
    ...runTwinParity(mod, edgeMod),
    ...runStatic(),
  ];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-business-timezone: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-business-timezone: America/New_York, inclusive-start/exclusive-end, DST-safe, browser+edge twins agree${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-business-timezone crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
