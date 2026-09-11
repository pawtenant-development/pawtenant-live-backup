#!/usr/bin/env node
// STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — daily payment
// business-day guard.
//
// THE INCIDENT (2026-09-11): Admin Orders showed four orders under "Today"
// while the Stripe Dashboard showed two payments dated Sep 11. All four were
// genuine successful payments made on Sep 11 in America/New_York; the Stripe
// account renders in America/Chicago, so the two 00:06/00:10 ET payments read
// "11:06 PM / 11:10 PM Sep 10" there. Investigating that exposed a REAL defect:
// stripe-payment-history bucketed daily revenue by the UTC calendar day and
// parsed from/to as UTC midnight / 23:59:59Z; Payments/Accounts used the UTC
// "today"; Analytics presets used the operator's browser day; the Dashboard
// sparkline used rolling 24-hour windows keyed on orders.created_at.
//
// THE CONTRACT this guard locks:
//   • one canonical business day — America/New_York, IANA-resolved, DST-safe;
//   • periods are start-INCLUSIVE, end-EXCLUSIVE — no 23:59:59 sentinels;
//   • the payment instant is Stripe `created` (server) / orders.paid_at (client),
//     NEVER orders.created_at, webhook receipt, assignment or contact time;
//   • only succeeded charges count, one per PaymentIntent;
//   • partner-funded / manual / test / cancelled rows are not Stripe payments;
//   • operational lists may group by creation date but must SAY so.
//
// Three layers:
//   1. LOGIC — executes the REAL modules (browser AND edge twins) via jiti with
//      fixtures: 11:59 PM ET, 12:01 AM ET, the Chicago-vs-New York case, both
//      DST transitions, refunded / failed / uncaptured / duplicate / partner rows.
//   2. STATIC — the consumers resolve through the canonical helpers and the old
//      UTC / browser-local / fixed-offset idioms are gone; labels name the zone.
//   3. SELF-TEST (--self-test) — planted negative controls, each of which MUST
//      trip the battery: UTC grouping, browser-local grouping, fixed-offset
//      grouping, created_at as payment time, inclusive end-of-day double count,
//      duplicate PaymentIntent counting, partner-funded orders counted, failed
//      charges counted, twin drift, and every static idiom re-planted.
//
// Usage:
//   node scripts/check-stripe-daily-payment-timezone.mjs             # guard
//   node scripts/check-stripe-daily-payment-timezone.mjs --self-test # prove power

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F = {
  timeBrowser: join(ROOT, "src", "lib", "businessTime.ts"),
  timeEdge: join(ROOT, "supabase", "functions", "_shared", "businessTime.ts"),
  bucketsEdge: join(ROOT, "supabase", "functions", "_shared", "stripeDailyBuckets.ts"),
  bucketsBrowser: join(ROOT, "src", "lib", "paymentDayBuckets.ts"),
  edgeFn: join(ROOT, "supabase", "functions", "stripe-payment-history", "index.ts"),
  paymentsTab: join(ROOT, "src", "pages", "admin-orders", "components", "PaymentsTab.tsx"),
  accountsPanel: join(ROOT, "src", "pages", "admin-orders", "components", "PaymentsAccountsPanel.tsx"),
  analytics: join(ROOT, "src", "pages", "admin-orders", "components", "AnalyticsTab.tsx"),
  dashboard: join(ROOT, "src", "pages", "admin-orders", "components", "AdminDashboard.tsx"),
  ordersPage: join(ROOT, "src", "pages", "admin-orders", "page.tsx"),
};

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
// Single read point, CRLF normalised (guard-negative-controls-need-newline-normalisation).
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : String(d));
// Strip block + line comments AND string literals so a check asserts the USE,
// not the mention (guard-assertions-must-test-use-not-mention).
const code = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const codeNoStrings = (s) => code(s)
  .replace(/`(?:\\.|[^`\\])*`/g, "``")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''");

// ─── Layer 1: LOGIC ─────────────────────────────────────────────────────────

function runDayLogic(m, label) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(`[${label}] ${msg}`); };
  const sec = (isoStr) => Math.floor(Date.parse(isoStr) / 1000);

  // A. 11:59 PM New York on Sep 11 (EDT, 03:59Z Sep 12) is STILL Sep 11.
  ok(m.businessIsoDate(new Date("2026-09-12T03:59:59Z")) === "2026-09-11",
    "23:59:59 ET on Sep 11 must belong to 2026-09-11");
  ok(m.businessIsoDateOfUnix(sec("2026-09-12T03:59:59Z")) === "2026-09-11",
    "businessIsoDateOfUnix: 23:59:59 ET on Sep 11 must belong to 2026-09-11");
  // B. 12:01 AM New York on Sep 12 (04:01Z) is Sep 12.
  ok(m.businessIsoDate(new Date("2026-09-12T04:01:00Z")) === "2026-09-12",
    "00:01 ET on Sep 12 must belong to 2026-09-12");
  ok(m.businessIsoDateOfUnix(sec("2026-09-12T04:01:00Z")) === "2026-09-12",
    "businessIsoDateOfUnix: 00:01 ET on Sep 12 must belong to 2026-09-12");
  // C. The real Sep 11 case: 04:06:41Z reads 11:06 PM Sep 10 in America/Chicago
  //    (the Stripe account zone) and 00:06 Sep 11 in New York. It COUNTS on Sep 11.
  const chicagoDay = new Date(1789099601 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  ok(chicagoDay === "2026-09-10", `control: the Chicago display day for 1789099601 must be 2026-09-10, got ${chicagoDay}`);
  ok(m.businessIsoDateOfUnix(1789099601) === "2026-09-11",
    "a Stripe payment shown as Sep 10 in America/Chicago but paid 00:06 ET must count on 2026-09-11");
  // A UTC grouping would also say Sep 11 here — so add the case where UTC is WRONG:
  // 02:50:16Z Sep 10 = 22:50 ET Sep 9 (a real Sep 2026 LIVE charge).
  ok(m.businessIsoDateOfUnix(sec("2026-09-10T02:50:16Z")) === "2026-09-09",
    "a payment at 22:50 ET on Sep 9 (02:50Z Sep 10) must count on 2026-09-09, not the UTC day");

  // D. Day bounds: inclusive start, EXCLUSIVE end, summer (EDT) and winter (EST).
  ok(iso(m.businessDayStart("2026-09-11")) === "2026-09-11T04:00:00.000Z", `Sep 11 start must be 04:00Z (EDT), got ${iso(m.businessDayStart("2026-09-11"))}`);
  ok(iso(m.businessDayEndExclusive("2026-09-11")) === "2026-09-12T04:00:00.000Z", `Sep 11 end-exclusive must be 04:00Z next day, got ${iso(m.businessDayEndExclusive("2026-09-11"))}`);
  ok(iso(m.businessDayStart("2026-01-15")) === "2026-01-15T05:00:00.000Z", `Jan 15 start must be 05:00Z (EST) — a fixed -4 offset is wrong here`);
  ok(m.businessDayEndExclusive("2026-09-10").getTime() === m.businessDayStart("2026-09-11").getTime(),
    "end-exclusive of Sep 10 must be exactly the start of Sep 11 (no gap, no overlap, no 23:59:59 sentinel)");
  // E. DST transitions use the IANA zone: spring-forward day is 23h, fall-back day is 25h.
  const spring = m.businessDayEndExclusive("2026-03-08").getTime() - m.businessDayStart("2026-03-08").getTime();
  const fall = m.businessDayEndExclusive("2026-11-01").getTime() - m.businessDayStart("2026-11-01").getTime();
  ok(spring === 23 * 3_600_000, `2026-03-08 (spring forward) must be 23h long, got ${spring / 3_600_000}h`);
  ok(fall === 25 * 3_600_000, `2026-11-01 (fall back) must be 25h long, got ${fall / 3_600_000}h`);
  // 01:30 ET on Nov 1 occurs twice; both instants belong to Nov 1.
  ok(m.businessIsoDate(new Date("2026-11-01T05:30:00Z")) === "2026-11-01" && m.businessIsoDate(new Date("2026-11-01T06:30:00Z")) === "2026-11-01",
    "both 01:30 ET instants on the fall-back day belong to 2026-11-01");
  // F. Date arithmetic is calendar arithmetic (month end, leap year, DST all safe).
  ok(m.shiftBusinessIsoDate("2026-09-01", -1) === "2026-08-31", "shift -1 across a month boundary");
  ok(m.shiftBusinessIsoDate("2028-02-28", 1) === "2028-02-29", "shift +1 into a leap day");
  ok(m.shiftBusinessIsoDate("2026-11-01", 1) === "2026-11-02", "shift across the fall-back day is exactly one calendar day");
  const range = m.businessDateRange("2026-09-10", "2026-09-11");
  ok(range.length === 2 && range[0] === "2026-09-10" && range[1] === "2026-09-11", `date range Sep 10–11 must be exactly two days, got ${JSON.stringify(range)}`);
  ok(m.businessDateRange("2026-09-11", "2026-09-10").length === 0, "a reversed range is empty, never negative");
  ok(m.isBusinessIsoDate("2026-09-11") && !m.isBusinessIsoDate("2026-9-11") && !m.isBusinessIsoDate("2026-09-11T00:00:00Z"),
    "isBusinessIsoDate accepts only YYYY-MM-DD");
  return f;
}

function runEdgeBucketLogic(m) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(`[edge buckets] ${msg}`); };
  const sec = (isoStr) => Math.floor(Date.parse(isoStr) / 1000);

  // Window resolution: explicit from/to are NY business days, exclusive upper bound.
  const w = m.resolveStripeReportWindow({ from: "2026-09-10", to: "2026-09-11", now: new Date("2026-09-11T12:00:00Z") });
  ok(w.timezone === "America/New_York", `window timezone must be America/New_York, got ${w.timezone}`);
  ok(w.sinceSec === sec("2026-09-10T04:00:00Z"), `since must be Sep 10 04:00Z, got ${new Date(w.sinceSec * 1000).toISOString()}`);
  ok(w.untilExclusiveSec === sec("2026-09-12T04:00:00Z"), `until-exclusive must be Sep 12 04:00Z, got ${w.untilExclusiveSec && new Date(w.untilExclusiveSec * 1000).toISOString()}`);
  ok(w.days === 2 && w.dates.join(",") === "2026-09-10,2026-09-11", `two business days expected, got ${w.days}: ${w.dates.join(",")}`);
  ok(w.explicit === true, "explicit window flagged");
  // Malformed dates never fall back to UTC parsing — they fall back to the rolling preset.
  const bad = m.resolveStripeReportWindow({ from: "2026-09-10T00:00:00Z", period: "7d", now: new Date("2026-09-11T12:00:00Z") });
  ok(bad.explicit === false && bad.days === 7 && bad.toIso === "2026-09-11" && bad.fromIso === "2026-09-05",
    `a malformed from must fall back to the rolling 7-day preset ending today (NY), got ${JSON.stringify({ e: bad.explicit, d: bad.days, f: bad.fromIso, t: bad.toIso })}`);
  // Rolling preset at 01:00Z Sep 12 (= 21:00 ET Sep 11): "today" is still Sep 11 in NY.
  const roll = m.resolveStripeReportWindow({ period: "7d", now: new Date("2026-09-12T01:00:00Z") });
  ok(roll.toIso === "2026-09-11" && roll.untilExclusiveSec === null,
    `rolling preset at 21:00 ET Sep 11 must end on 2026-09-11 with an open upper bound, got ${roll.toIso}`);
  ok(roll.sinceSec === sec("2026-09-05T04:00:00Z"), "rolling 7d must start at the NY midnight of the 7th day back");
  // Winter: Jan window uses EST (05:00Z) — a fixed -4 offset would be wrong.
  const jan = m.resolveStripeReportWindow({ from: "2026-01-10", to: "2026-01-10", now: new Date("2026-01-11T12:00:00Z") });
  ok(jan.sinceSec === sec("2026-01-10T05:00:00Z") && jan.untilExclusiveSec === sec("2026-01-11T05:00:00Z"),
    "January window must use EST (05:00Z) bounds");

  // Bucketing fixtures — the Sep 11 reconciliation set plus every exclusion.
  const dates = m.businessDateRange ? m.businessDateRange("2026-09-10", "2026-09-11") : w.dates;
  const charges = [
    { id: "ch_A", status: "succeeded", amount: 115, created: 1789099601, payment_intent: "pi_A" }, // 00:06 ET Sep 11 (Chicago: Sep 10)
    { id: "ch_B", status: "succeeded", amount: 109, created: 1789099833, payment_intent: "pi_B" }, // 00:10 ET Sep 11
    { id: "ch_C", status: "succeeded", amount: 109, created: 1789113503, payment_intent: "pi_C" }, // 03:58 ET Sep 11
    { id: "ch_D1", status: "failed", amount: 129, created: 1789120419, payment_intent: "pi_D" },  // declined retry
    { id: "ch_D2", status: "failed", amount: 129, created: 1789120476, payment_intent: "pi_D" },  // declined retry
    { id: "ch_D3", status: "succeeded", amount: 129, created: 1789120521, payment_intent: "pi_D" }, // 05:55 ET Sep 11
    { id: "ch_E", status: "succeeded", amount: 159, created: sec("2026-09-10T02:50:16Z"), payment_intent: "pi_E" }, // 22:50 ET Sep 9 → OUTSIDE window
    { id: "ch_F", status: "succeeded", amount: 129, created: sec("2026-09-11T00:25:00Z"), payment_intent: "pi_F" }, // 20:25 ET Sep 10 → Sep 10 (UTC says Sep 11)
    { id: "ch_G", status: "pending", amount: 99, created: sec("2026-09-11T15:00:00Z"), payment_intent: "pi_G" }, // uncaptured / pending
    { id: "ch_H", status: "succeeded", amount: 89, created: sec("2026-09-11T15:00:00Z"), payment_intent: "pi_H", refunded: true, amount_refunded: 89 }, // refunded later: gross counts once
    { id: "ch_A", status: "succeeded", amount: 115, created: 1789099601, payment_intent: "pi_A" }, // duplicate charge row
    { id: "ch_A2", status: "succeeded", amount: 115, created: 1789099601, payment_intent: "pi_A" }, // second "success" on the same PI
  ];
  const r = m.bucketSucceededChargesByBusinessDay(charges, dates);
  const byDate = Object.fromEntries(r.daily.map((d) => [d.date, d]));
  ok(byDate["2026-09-11"]?.revenue === 115 + 109 + 109 + 129 + 89 && byDate["2026-09-11"]?.count === 5,
    `Sep 11 must total $551 across 5 payments (four reconciled orders + one later-refunded), got ${JSON.stringify(byDate["2026-09-11"])}`);
  ok(byDate["2026-09-10"]?.revenue === 129 && byDate["2026-09-10"]?.count === 1,
    `Sep 10 must hold only the 20:25 ET payment ($129), got ${JSON.stringify(byDate["2026-09-10"])}`);
  ok(r.gross === 551 + 129 && r.count === 6, `gross must be $680 over 6 payments, got $${r.gross} / ${r.count}`);
  const reasons = Object.fromEntries(r.skipped.map((x) => [x.id + ":" + x.reason, true]));
  ok(reasons["ch_D1:not_succeeded"] && reasons["ch_D2:not_succeeded"] && reasons["ch_G:not_succeeded"], "failed and pending charges must be skipped as not_succeeded");
  ok(reasons["ch_A:duplicate_charge"], "a duplicate charge row must be skipped");
  ok(reasons["ch_A2:duplicate_payment_intent"], "a second success on one PaymentIntent must be skipped");
  ok(reasons["ch_E:outside_window"], "a charge outside the window must be skipped, not silently filed elsewhere");
  ok(r.daily.length === dates.length && r.daily[0].date === "2026-09-10", "every window date is present, zero-filled, in order");
  return f;
}

function runBrowserBucketLogic(m) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(`[orders buckets] ${msg}`); };
  const dates = ["2026-09-10", "2026-09-11"];
  const orders = [
    // The four reconciled orders — paid_at is the payment time; created_at is earlier.
    { id: "o1", created_at: "2026-09-11T04:04:52Z", paid_at: "2026-09-11T04:06:44Z", payment_intent_id: "pi_A", price: 115, status: "processing" },
    { id: "o2", created_at: "2026-09-11T04:06:21Z", paid_at: "2026-09-11T04:10:34Z", payment_intent_id: "pi_B", price: 109, status: "processing" },
    { id: "o3", created_at: "2026-09-11T07:48:03Z", paid_at: "2026-09-11T07:58:25Z", payment_intent_id: "pi_C", price: 109, status: "processing" },
    { id: "o4", created_at: "2026-09-11T09:39:50Z", paid_at: "2026-09-11T09:55:23Z", payment_intent_id: "pi_D", price: 129, status: "processing" },
    // created on Sep 11 (NY) but PAID on Sep 10 (NY) — must land on Sep 10.
    { id: "o5", created_at: "2026-09-11T04:30:00Z", paid_at: "2026-09-11T03:30:00Z", payment_intent_id: "pi_F", price: 129, status: "processing" },
    // created Sep 10 NY, paid Sep 11 NY at 00:20 ET — must land on Sep 11 by paid_at.
    { id: "o6", created_at: "2026-09-10T20:00:00Z", paid_at: "2026-09-11T04:20:00Z", payment_intent_id: "pi_X", price: 89, status: "processing" },
    // exclusions
    { id: "lead", created_at: "2026-09-11T05:00:00Z", paid_at: null, payment_intent_id: null, price: 109, status: "pending" },
    { id: "partner", created_at: "2026-09-11T05:00:00Z", paid_at: "2026-09-11T05:00:00Z", payment_intent_id: "pi_P", price: 149, status: "processing", order_origin: "partner" },
    { id: "manual", created_at: "2026-09-11T05:00:00Z", paid_at: "2026-09-11T05:00:00Z", payment_intent_id: null, price: 129, status: "processing" },
    { id: "test", created_at: "2026-09-11T05:00:00Z", paid_at: "2026-09-11T05:00:00Z", payment_intent_id: "pi_T", price: 129, status: "processing", is_test: true },
    { id: "cancelled", created_at: "2026-09-11T05:00:00Z", paid_at: "2026-09-11T05:00:00Z", payment_intent_id: "pi_Z", price: 129, status: "cancelled" },
    { id: "dupe", created_at: "2026-09-11T05:00:00Z", paid_at: "2026-09-11T05:00:00Z", payment_intent_id: "pi_A", price: 115, status: "processing" },
    // failed-only: has a PI (attempt) but never paid
    { id: "failed", created_at: "2026-09-11T05:00:00Z", paid_at: null, payment_intent_id: "pi_FAIL", price: 129, status: "payment_failed" },
  ];
  const r = m.paidOrdersByBusinessDay(orders, dates);
  const d = Object.fromEntries(r.daily.map((x) => [x.date, x]));
  ok(d["2026-09-11"]?.payments === 5 && d["2026-09-11"]?.revenue === 115 + 109 + 109 + 129 + 89,
    `Sep 11 must count 5 payments / $551 (four reconciled + o6 by paid_at), got ${JSON.stringify(d["2026-09-11"])}`);
  ok(d["2026-09-10"]?.payments === 1 && d["2026-09-10"]?.revenue === 129,
    `Sep 10 must count only o5 (paid 23:30 ET Sep 10), got ${JSON.stringify(d["2026-09-10"])}`);
  const ex = Object.fromEntries(r.excluded.map((x) => [x.id, x.reason]));
  ok(ex.lead === "no_paid_at", "an unpaid lead is excluded");
  ok(ex.partner === "partner_funded", "a partner-funded order is never a Stripe payment");
  ok(ex.manual === "no_payment_intent", "a paid_at without a PaymentIntent fails closed");
  ok(ex.test === "test_row", "a test row is excluded");
  ok(ex.cancelled === "cancelled", "a cancelled row is excluded");
  ok(ex.dupe === "duplicate_payment_intent", "a duplicate order on one PaymentIntent counts the payment once");
  ok(ex.failed === "no_paid_at", "a failed-only attempt is excluded");
  ok(r.payments === 6 && r.gross === 680, `six payments / $680 expected, got ${r.payments} / $${r.gross}`);
  ok(m.isStripePaidOrder(orders[0]) && !m.isStripePaidOrder(orders[7]) && !m.isStripePaidOrder(orders[8]), "isStripePaidOrder agrees with the bucketing exclusions");
  // Creation-date buckets are a DIFFERENT number and must not read paid_at.
  const created = m.ordersCreatedByBusinessDay(orders, dates);
  const c = Object.fromEntries(created.map((x) => [x.date, x.payments]));
  ok(c["2026-09-11"] === 12 && c["2026-09-10"] === 1, `orders CREATED: Sep 11 = 12, Sep 10 = 1, got ${JSON.stringify(c)}`);
  // recentBusinessDates ends on the NY date of "now", not the UTC date.
  const recent = m.recentBusinessDates(7, new Date("2026-09-12T01:00:00Z"));
  ok(recent.length === 7 && recent[6] === "2026-09-11" && recent[0] === "2026-09-05",
    `recentBusinessDates at 21:00 ET Sep 11 must end on 2026-09-11, got ${recent.join(",")}`);
  return f;
}

// ─── Layer 2: STATIC ────────────────────────────────────────────────────────

function runStatic(src) {
  const f = [];
  const need = (s, name, re, why) => { if (!re.test(s)) f.push(`${name}: ${why}`); };
  const forbid = (s, name, re, why) => { if (re.test(s)) f.push(`${name}: ${why}`); };
  const UTC_DAY = /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/;
  const BROWSER_DAY = /toDateString\(\)|setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|setHours\(\s*23/;
  const FIXED_OFFSET = /UTC-[45]\b|[+-]0[45]:00|getTimezoneOffset\(\)|T23:59:59|T00:00:00Z/;

  // Edge function — the server-side grouping that actually shipped broken.
  const fn = codeNoStrings(src.edgeFn);
  need(src.edgeFn, "stripe-payment-history", /from ["']\.\.\/_shared\/stripeDailyBuckets\.ts["']/, "must import the shared business-day bucketing module");
  need(fn, "stripe-payment-history", /resolveStripeReportWindow\(\s*\{/, "must resolve the window through resolveStripeReportWindow()");
  need(fn, "stripe-payment-history", /bucketSucceededChargesByBusinessDay\(/, "must bucket through bucketSucceededChargesByBusinessDay()");
  forbid(fn, "stripe-payment-history", UTC_DAY, "must not key any day on the UTC date");
  forbid(codeNoStrings(src.edgeFn).replace(/\$\{[^}]*\}/g, ""), "stripe-payment-history", /createdFilter\.lte\s*=/, "the upper bound must be EXCLUSIVE (lt), never lte");
  need(fn, "stripe-payment-history", /createdFilter\.lt\s*=/, "must pass the exclusive upper bound as created[lt]");
  forbid(code(src.edgeFn), "stripe-payment-history", /T00:00:00Z|T23:59:59Z/, "must not parse from/to as UTC midnight / 23:59:59Z");
  forbid(fn, "stripe-payment-history", /setUTCDate\(/, "must not step days with setUTCDate");
  need(fn, "stripe-payment-history", /timezone:\s*reportWindow\.timezone/, "the response must name the timezone it bucketed in");
  need(fn, "stripe-payment-history", /to_inclusive:\s*reportWindow\.toIso/, "the response must expose the inclusive business-day bounds");

  // Shared bucketing module — the executable contract.
  const b = codeNoStrings(src.bucketsEdge);
  need(src.bucketsEdge, "stripeDailyBuckets", /from ["']\.\/businessTime\.ts["']/, "must resolve days through the canonical edge business clock");
  need(b, "stripeDailyBuckets", /businessIsoDateOfUnix\(\s*c\.created\s*\)/, "a charge's day must be the business date of Stripe `created`");
  forbid(b, "stripeDailyBuckets", UTC_DAY, "must not use the UTC day");
  forbid(b, "stripeDailyBuckets", FIXED_OFFSET, "must not use a fixed offset or sentinel");
  need(b, "stripeDailyBuckets", /c\.status\s*!==\s*""/, "only succeeded charges may count (status check present)");
  need(b, "stripeDailyBuckets", /seenPi/, "must de-duplicate by PaymentIntent");

  // Browser-side orders bucketing.
  const pb = codeNoStrings(src.bucketsBrowser);
  need(src.bucketsBrowser, "paymentDayBuckets", /from ["']\.\/businessTime["']/, "must resolve days through the canonical browser business clock");
  need(pb, "paymentDayBuckets", /new Date\(\s*o\.paid_at\s*\)/, "the payment instant must be paid_at");
  forbid(pb.replace(/ordersCreatedByBusinessDay[\s\S]*$/, ""), "paymentDayBuckets", /new Date\(\s*o\.created_at\s*\)/, "paidOrdersByBusinessDay must never read created_at as a payment time");
  need(pb, "paymentDayBuckets", /o\.payment_intent_id/, "a Stripe payment requires a PaymentIntent");
  need(pb, "paymentDayBuckets", /order_origin/, "partner-funded orders must be recognised and excluded");
  need(pb, "paymentDayBuckets", /o\.is_test/, "test rows must be excluded");
  need(pb, "paymentDayBuckets", /seenPi/, "duplicate orders on one PaymentIntent must count once");

  // Payments tab — Accounts "today" + daily chart label.
  const pt = codeNoStrings(src.paymentsTab);
  need(src.paymentsTab, "PaymentsTab", /from ["']\.\.\/\.\.\/\.\.\/lib\/businessTime["']/, "must import the canonical business clock");
  forbid(pt, "PaymentsTab", UTC_DAY, "must not compute 'today' from the UTC day");
  need(pt, "PaymentsTab", /const accountsFrom = customFrom \|\| businessIsoDate\(new Date\(\)\)/, "accountsFrom fallback must be the NY business date");
  need(pt, "PaymentsTab", /const accountsTo = customTo \|\| businessIsoDate\(new Date\(\)\)/, "accountsTo fallback must be the NY business date");
  need(pt, "PaymentsTab", /const isToday = d\.date === businessIsoDate\(new Date\(\)\)/, "the daily chart's 'today' bar must be the NY business date");
  need(code(src.paymentsTab), "PaymentsTab", /Succeeded Stripe payments by payment date · \{data\.summary\.timezone \?\? BUSINESS_TIMEZONE\}/, "the daily chart must be labelled with its basis and timezone");

  // Accounts panel "today".
  const ap = codeNoStrings(src.accountsPanel);
  need(ap, "PaymentsAccountsPanel", /const todayIso = \(\) => businessIsoDate\(new Date\(\)\)/, "todayIso must be the NY business date");
  forbid(ap, "PaymentsAccountsPanel", UTC_DAY, "must not compute 'today' from the UTC day");

  // Analytics (frozen — surgical hunks only): presets + custom range + ISO strings.
  const an = codeNoStrings(src.analytics);
  need(src.analytics, "AnalyticsTab", /from ["']@\/lib\/businessTime["']/, "must import the canonical business clock");
  need(an, "AnalyticsTab", /function businessDayRange\(fromIso: string, toIso: string\)/, "presets must resolve through a business-day range helper");
  need(an, "AnalyticsTab", /businessDayEndExclusive\(toIso\)\.getTime\(\) - 1/, "the inclusive `to` must be derived from the EXCLUSIVE next-day bound");
  need(code(src.analytics), "AnalyticsTab", /case "today": return businessDayRange\(today, today\)/, "'Today' must be the NY business day");
  need(an, "AnalyticsTab", /return businessDayRange\(customFrom, customTo\)/, "custom bounds must be NY business days");
  need(an, "AnalyticsTab", /const dateFromStr = businessIsoDate\(rangeFrom\)/, "dateFromStr must be a business date");
  need(an, "AnalyticsTab", /const dateToStr = businessIsoDate\(rangeTo\)/, "dateToStr must be a business date");
  forbid(an, "AnalyticsTab", /function dayStart\(|function dayEnd\(|setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|setHours\(\s*23/, "browser-local day helpers must be gone");
  forbid(an, "AnalyticsTab", /rangeFrom\.toISOString\(\)\.slice\(0, 10\)|rangeTo\.toISOString\(\)\.slice\(0, 10\)/, "range bounds must not be reduced to UTC dates");
  forbid(an, "AnalyticsTab", /new Date\(customTo \+ ""\)/, "custom `to` must not be parsed with a 23:59:59 sentinel");
  need(code(src.analytics), "AnalyticsTab", /timeZone: BUSINESS_TIMEZONE/, "range labels must render in the business zone");

  // Dashboard sparklines.
  const db = codeNoStrings(src.dashboard);
  need(src.dashboard, "AdminDashboard", /from ["']\.\.\/\.\.\/\.\.\/lib\/paymentDayBuckets["']/, "must import the shared payment-day buckets");
  need(db, "AdminDashboard", /paidOrdersByBusinessDay\(orders, last7BusinessDates\)/, "the revenue sparkline must bucket by paid date");
  need(db, "AdminDashboard", /ordersCreatedByBusinessDay\(orders, last7BusinessDates\)/, "the order-count sparkline must bucket by creation date");
  forbid(db, "AdminDashboard", /counts\[6 - diffDays\]/, "rolling 24-hour sparkline windows must be gone");
  forbid(db, "AdminDashboard", /monthEnd\s*=\s*new Date\([^)]*23, 59, 59, 999\)/, "the browser-local month sentinel must be gone");
  need(db, "AdminDashboard", /currentBusinessMonth\(new Date\(\)\)/, "'this month' must be the NY business month");
  need(code(src.dashboard), "AdminDashboard", /7-day bars · by paid date · \{BUSINESS_TIMEZONE\}/, "the revenue card must name its basis and zone");

  // Orders list ribbons — grouping by creation is allowed, but must be LABELLED.
  need(code(src.ordersPage), "admin-orders/page.tsx", /· \{effDateBasisLabel\} · America\/New_York/, "every day ribbon must name the date basis and the zone");
  need(code(src.ordersPage).split("· {effDateBasisLabel} · America/New_York").length - 1 >= 2 ? "ok" : "", "admin-orders/page.tsx", /ok/, "both the desktop and the mobile ribbon must carry the basis + zone label");
  need(codeNoStrings(src.ordersPage), "admin-orders/page.tsx", /businessDayGroupLabel\(ts, businessDayKey\)/, "ribbons must still group by the NY business day");

  // Twins: both clocks expose the same day primitives.
  for (const [name, s] of [["src/lib/businessTime.ts", src.timeBrowser], ["_shared/businessTime.ts", src.timeEdge]]) {
    for (const fnName of ["businessIsoDateOfUnix", "businessDayStart", "businessDayEndExclusive", "shiftBusinessIsoDate", "businessDateRange", "isBusinessIsoDate"]) {
      need(s, name, new RegExp(`export function ${fnName}\\(`), `must export ${fnName}`);
    }
    forbid(codeNoStrings(s), name, /getTimezoneOffset\(\)|Asia\/Karachi/, "must not use the host offset or Asia/Karachi");
  }
  return f;
}

// ─── Twin parity on the new primitives ──────────────────────────────────────

function runTwinParity(a, b) {
  const f = [];
  const probes = ["2026-01-15", "2026-03-08", "2026-03-09", "2026-06-30", "2026-09-10", "2026-09-11", "2026-11-01", "2026-11-02", "2026-12-31", "2028-02-29"];
  for (const d of probes) {
    if (a.businessDayStart(d).getTime() !== b.businessDayStart(d).getTime()) f.push(`twin drift businessDayStart(${d})`);
    if (a.businessDayEndExclusive(d).getTime() !== b.businessDayEndExclusive(d).getTime()) f.push(`twin drift businessDayEndExclusive(${d})`);
    if (a.shiftBusinessIsoDate(d, 1) !== b.shiftBusinessIsoDate(d, 1)) f.push(`twin drift shiftBusinessIsoDate(${d})`);
  }
  for (const u of [1789099601, 1789099833, 1789113503, 1789120521, 1767225599, 1767225600]) {
    if (a.businessIsoDateOfUnix(u) !== b.businessIsoDateOfUnix(u)) f.push(`twin drift businessIsoDateOfUnix(${u})`);
  }
  return f;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const jiti = createJiti(import.meta.url);
  const timeBrowser = await jiti.import(F.timeBrowser);
  const timeEdge = await jiti.import(F.timeEdge);
  const bucketsEdge = await jiti.import(F.bucketsEdge);
  const bucketsBrowser = await jiti.import(F.bucketsBrowser);
  const src = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, read(p)]));

  const runAll = (tb, te, be, bb, s) => [
    ...runDayLogic(tb, "browser clock"),
    ...runDayLogic(te, "edge clock"),
    ...runEdgeBucketLogic({ ...be, businessDateRange: te.businessDateRange }),
    ...runBrowserBucketLogic(bb),
    ...runTwinParity(tb, te),
    ...runStatic(s),
  ];

  if (selfTest) {
    const utcDay = (d) => d.toISOString().slice(0, 10);
    const sec = (s) => Math.floor(Date.parse(s) / 1000);
    const plants = [
      // LOGIC plants
      ["UTC grouping (businessIsoDate = UTC day)", () => [{ ...timeBrowser, businessIsoDate: utcDay, businessIsoDateOfUnix: (u) => utcDay(new Date(u * 1000)) }, timeEdge, bucketsEdge, bucketsBrowser, src]],
      ["browser-local grouping (toDateString day)", () => [{ ...timeBrowser, businessIsoDate: (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; } }, timeEdge, bucketsEdge, bucketsBrowser, src]],
      ["fixed UTC-4 offset day bounds (wrong every winter)", () => [{ ...timeBrowser, businessDayStart: (d) => new Date(`${d}T04:00:00Z`), businessDayEndExclusive: (d) => new Date(new Date(`${d}T04:00:00Z`).getTime() + 86_400_000) }, timeEdge, bucketsEdge, bucketsBrowser, src]],
      ["inclusive end-of-day (23:59:59 sentinel) double count", () => [{ ...timeBrowser, businessDayEndExclusive: (d) => new Date(timeBrowser.businessDayEndExclusive(d).getTime() + 1000) }, timeEdge, bucketsEdge, bucketsBrowser, src]],
      ["edge: charge day keyed on UTC", () => [timeBrowser, timeEdge, { ...bucketsEdge, bucketSucceededChargesByBusinessDay: (charges, dates) => {
        const map = new Map(dates.map((d) => [d, { date: d, revenue: 0, count: 0 }]));
        const seen = new Set(); const skipped = []; const counted = []; let gross = 0;
        for (const c of charges) { if (c.status !== "succeeded" || seen.has(c.id)) continue; seen.add(c.id); const k = utcDay(new Date(c.created * 1000)); const b = map.get(k); if (!b) continue; b.revenue += c.amount; b.count++; gross += c.amount; counted.push(c.id); }
        return { daily: [...map.values()], gross, count: counted.length, skipped, counted };
      } }, bucketsBrowser, src]],
      ["edge: duplicate PaymentIntent counted twice", () => [timeBrowser, timeEdge, { ...bucketsEdge, bucketSucceededChargesByBusinessDay: (charges, dates) => {
        const seen = new Set(); const dedup = charges.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; }).map((c, i) => ({ ...c, payment_intent: `${c.payment_intent}_${i}` }));
        return bucketsEdge.bucketSucceededChargesByBusinessDay(dedup, dates);
      } }, bucketsBrowser, src]],
      ["edge: failed charges counted as revenue", () => [timeBrowser, timeEdge, { ...bucketsEdge, bucketSucceededChargesByBusinessDay: (charges, dates) => bucketsEdge.bucketSucceededChargesByBusinessDay(charges.map((c) => ({ ...c, status: "succeeded" })), dates) }, bucketsBrowser, src]],
      ["edge: from/to parsed as UTC midnight / 23:59:59Z", () => [timeBrowser, timeEdge, { ...bucketsEdge, resolveStripeReportWindow: (o) => { const r = bucketsEdge.resolveStripeReportWindow(o); return r.explicit ? { ...r, sinceSec: sec(`${o.from}T00:00:00Z`), untilExclusiveSec: sec(`${o.to}T23:59:59Z`) } : r; } }, bucketsBrowser, src]],
      ["edge: rolling preset ends on the UTC day", () => [timeBrowser, timeEdge, { ...bucketsEdge, resolveStripeReportWindow: (o) => { const r = bucketsEdge.resolveStripeReportWindow(o); return r.explicit ? r : { ...r, toIso: utcDay(o.now ?? new Date()) }; } }, bucketsBrowser, src]],
      ["orders: created_at used as the payment time", () => [timeBrowser, timeEdge, bucketsEdge, { ...bucketsBrowser, paidOrdersByBusinessDay: (orders, dates) => bucketsBrowser.paidOrdersByBusinessDay(orders.map((o) => ({ ...o, paid_at: o.paid_at ? o.created_at : null })), dates) }, src]],
      ["orders: partner-funded orders counted as Stripe revenue", () => [timeBrowser, timeEdge, bucketsEdge, { ...bucketsBrowser, paidOrdersByBusinessDay: (orders, dates) => bucketsBrowser.paidOrdersByBusinessDay(orders.map((o) => ({ ...o, order_origin: null, payment_intent_id: o.payment_intent_id ?? "pi_fake" })), dates), isStripePaidOrder: () => true }, src]],
      ["orders: duplicate orders on one PaymentIntent double-counted", () => [timeBrowser, timeEdge, bucketsEdge, { ...bucketsBrowser, paidOrdersByBusinessDay: (orders, dates) => bucketsBrowser.paidOrdersByBusinessDay(orders.map((o, i) => ({ ...o, payment_intent_id: o.payment_intent_id ? `${o.payment_intent_id}#${i}` : null })), dates) }, src]],
      ["orders: today ends on the UTC day", () => [timeBrowser, timeEdge, bucketsEdge, { ...bucketsBrowser, recentBusinessDates: (n, now = new Date()) => { const t = utcDay(now); return timeBrowser.businessDateRange(timeBrowser.shiftBusinessIsoDate(t, -(n - 1)), t); } }, src]],
      ["twin drift (edge clock shifted one hour)", () => [timeBrowser, { ...timeEdge, businessDayStart: (d) => new Date(timeEdge.businessDayStart(d).getTime() + 3_600_000) }, bucketsEdge, bucketsBrowser, src]],
      // STATIC plants — re-introduce each retired idiom in its consumer.
      ["static: edge fn buckets by UTC day again", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, edgeFn: src.edgeFn.replace("bucketSucceededChargesByBusinessDay(charges, reportWindow.dates)", "((cs) => { const m = {}; cs.forEach((c) => { const k = new Date(c.created * 1000).toISOString().slice(0, 10); m[k] = (m[k] ?? 0) + c.amount; }); return { daily: [], count: 0, skipped: [] }; })(charges)") }]],
      ["static: edge fn inclusive lte upper bound", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, edgeFn: src.edgeFn.replace("createdFilter.lt = reportWindow.untilExclusiveSec", "createdFilter.lte = reportWindow.untilExclusiveSec") }]],
      ["static: PaymentsTab today from UTC", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, paymentsTab: src.paymentsTab.replace("const isToday = d.date === businessIsoDate(new Date());", "const isToday = d.date === new Date().toISOString().slice(0, 10);") }]],
      ["static: Accounts panel today from UTC", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, accountsPanel: src.accountsPanel.replace("const todayIso = () => businessIsoDate(new Date());", "const todayIso = () => new Date().toISOString().slice(0, 10);") }]],
      ["static: Analytics browser-local day helpers restored", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, analytics: src.analytics.replace("function businessDayRange(fromIso: string, toIso: string): { from: Date; to: Date } {", "function dayStart(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }\nfunction businessDayRange(fromIso: string, toIso: string): { from: Date; to: Date } {") }]],
      ["static: Analytics custom `to` with 23:59:59 sentinel", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, analytics: src.analytics.replace("return businessDayRange(customFrom, customTo);", 'return { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") };') }]],
      ["static: Dashboard rolling 24h windows restored", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, dashboard: src.dashboard.replace("paidOrdersByBusinessDay(orders, last7BusinessDates)", "((os) => { const counts = Array(7).fill(0); const now = Date.now(); os.forEach((o) => { const diffDays = Math.floor((now - new Date(o.created_at).getTime()) / 86400000); if (diffDays < 7) counts[6 - diffDays] += (o.price ?? 0); }); return { daily: counts.map((revenue) => ({ revenue })), payments: 0 }; })(orders)") }]],
      ["static: Orders ribbon loses its basis + zone label", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, ordersPage: src.ordersPage.split("· {effDateBasisLabel} · America/New_York").join("· {effDateBasisLabel}") }]],
      ["static: edge clock drops businessDayEndExclusive export", () => [timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, { ...src, timeEdge: src.timeEdge.replace("export function businessDayEndExclusive(", "function businessDayEndExclusive(") }]],
    ];
    let total = 0;
    for (const [name, make] of plants) {
      const found = runAll(...make());
      if (found.length === 0) {
        console.error(`${RED}✗ SELF-TEST FAILED: "${name}" passed the battery${RESET}`);
        process.exitCode = 1;
        return;
      }
      total += found.length;
    }
    console.log(`${GREEN}✓ self-test: battery detected ${total} defect(s) across ${plants.length} planted controls${RESET}`);
  }

  const failures = runAll(timeBrowser, timeEdge, bucketsEdge, bucketsBrowser, src);
  // Count the assertions actually evaluated for the report line.
  const assertionCount = (() => {
    let n = 0;
    const count = (fn, ...args) => { try { fn(...args); } catch { /* counted below */ } };
    count(() => {});
    // Rough but honest: each layer's `ok/need/forbid` call is one check.
    const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
    n = (text.match(/\bok\(|\bneed\(|\bforbid\(/g) ?? []).length;
    return n;
  })();
  if (failures.length > 0) {
    console.error(`${RED}✗ check-stripe-daily-payment-timezone: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${GREEN}✓ check-stripe-daily-payment-timezone: America/New_York business days, paid_at/Stripe created as the payment time, exclusive bounds, dedup by PaymentIntent, partner/test/failed excluded, labels present (${assertionCount} assertion sites)${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-stripe-daily-payment-timezone crashed: ${e?.stack ?? e}${RESET}`);
  process.exitCode = 1;
});
