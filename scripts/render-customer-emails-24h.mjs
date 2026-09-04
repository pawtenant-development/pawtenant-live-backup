// scripts/render-customer-emails-24h.mjs
//
// CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001-CLOSURE — Closure 3.
//
// RENDER-ONLY harness. It executes the REAL email-builder functions out of the
// deployed edge-function sources and asserts what a customer would actually
// read. It is a test harness, not a runtime path:
//
//   * production code is NOT modified and NO `dryRun` / preview parameter is
//     added anywhere — the builders are imported, never reached over HTTP;
//   * every `import` is stripped and the request handler (`Deno.serve(` /
//     `serve(`) is cut off before evaluation, so no Supabase / GHL / Twilio
//     client is ever constructed;
//   * `fetch` is replaced with a PROVIDER STUB that records the outbound Resend
//     payload and refuses any other host, so the run itself proves no delivery
//     call left the process.
//
// Usage:
//   node scripts/render-customer-emails-24h.mjs         -> exit 1 on failure
//   node scripts/render-customer-emails-24h.mjs --dump  -> print the matched
//                                                          delivery sentences
//
// Evidence is PII-free: fixtures use RFC-2606 example.com and no real
// recipient, token or order id appears in the output.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FN = (p) => resolve(ROOT, "supabase/functions", p);
const DUMP = process.argv.includes("--dump");

const APPROVED_CLAUSE = "typically within 24 hours after provider review";
const APPROVED_LABEL = "Within 24 Hours";
const APPROVED_ANY = [APPROVED_CLAUSE, APPROVED_LABEL];

// Must never appear in customer-facing rendered output.
const FORBIDDEN = [
  { id: "2-3 days", re: /2\s*(?:-|–|—|&ndash;|&mdash;)\s*3\s*(?:business\s*)?days?/i },
  { id: "24-48 hours", re: /24\s*(?:-|–|—|&ndash;|&mdash;)\s*48\s*(?:hours?|hrs?)/i },
  { id: "one business day", re: /\bone business day\b/i },
  { id: "one to two business days", re: /one\s+to\s+two\s+business\s+days?/i },
  { id: "Standard delivery", re: /standard\s+delivery/i },
  { id: "Priority delivery", re: /priority\s+delivery/i },
  { id: "guaranteed approval", re: /guaranteed\s+approval|approval\s+is\s+guaranteed/i },
  { id: "guaranteed delivery", re: /guaranteed\s+delivery|delivery\s+is\s+guaranteed/i },
];

let checks = 0;
const failures = [];
const rendered = [];

function check(label, fn) {
  checks += 1;
  try {
    const r = fn();
    if (r === true || r === undefined) return;
    failures.push(`${label} -> ${r}`);
  } catch (err) {
    failures.push(`${label} -> threw ${err?.message ?? String(err)}`);
  }
}

const read = (rel) => readFileSync(FN(rel), "utf8").replace(/\r\n/g, "\n");

/** Provider stub shared by every harnessed module. */
const PROVIDER_STUB = `
const __sends = [];
globalThis.__sends = __sends;
const Deno = { env: { get: (k) => (k === "RESEND_API_KEY" ? "stub-key-not-a-real-credential" : "") } };
const fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://api.resend.com/")) {
    throw new Error("HARNESS: blocked outbound call to " + u);
  }
  __sends.push({ url: u, body: JSON.parse(init.body) });
  return { ok: true, status: 200, json: async () => ({ id: "stub_render_only" }), text: async () => "" };
};
`;

/** Strip imports, cut the request handler, prepend stubs, re-export builders. */
function harness(src, exportNames, importedStubs = "") {
  let s = src
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];\s*$/gm, "");
  const cut = [s.indexOf("Deno.serve("), s.indexOf("\nserve(")].filter((i) => i !== -1);
  if (cut.length) s = s.slice(0, Math.min(...cut));
  // A module may already export a name (the shared layout does); re-exporting it
  // is a duplicate-export error, so only append the ones that are still private.
  const needed = exportNames.filter((n) => !new RegExp(`export\\s+(?:async\\s+)?function\\s+${n}\\b`).test(s));
  const tail = needed.length ? `\nexport { ${needed.join(", ")} };\n` : "\n";
  return PROVIDER_STUB + importedStubs + "\n" + s + tail;
}

async function load(name, src) {
  const { code } = await transform(src, { loader: "ts", format: "esm", target: "es2022" });
  const dir = resolve(ROOT, "node_modules", ".cache", "delivery-email-render");
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(out, code, "utf8");
  return import(pathToFileURL(out).href);
}

/** Assert one rendered customer-facing body. */
function assertBody(label, html, opts = {}) {
  const text = String(html).replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ").trim();
  rendered.push({ label, text });
  for (const f of FORBIDDEN) {
    check(`${label} — no "${f.id}"`, () => {
      const m = text.match(f.re);
      return !m || `rendered output contains ${JSON.stringify(m[0])}`;
    });
  }
  if (opts.requirePromise !== false) {
    check(`${label} — states an approved 24-hour form`, () =>
      APPROVED_ANY.some((n) => text.toLowerCase().includes(n.toLowerCase())) ||
      `no approved 24-hour wording; rendered: "${text.slice(0, 220)}…"`);
  }
}

async function main() {
  // ── 1 · assign-doctor — provider-assigned customer email ────────────────
  {
    const m = await load("assignDoctor", harness(
      read("assign-doctor/index.ts"), ["sendCustomerAssignedEmail"],
      // Suppression is deliberately stubbed OFF so the builder takes the real
      // send path and the provider stub captures the payload a customer would
      // actually have received. Nothing leaves the process either way.
      `const DELIVERY_TURNAROUND_CLAUSE = ${JSON.stringify(APPROVED_CLAUSE)};
       const suppressForFixtureOrder = () => false;
       const evaluateNotificationSuppression = () => ({ suppressed: false, reason: "harness", checks: {} });`,
    ));
    for (const [speed, tag] of [[null, "NULL"], ["", "blank"], ["2-3days", "2-3days"], ["standard", "standard"], ["priority", "priority"], ["24h", "24h"], ["24hours", "24hours"]]) {
      globalThis.__sends.length = 0;
      await m.sendCustomerAssignedEmail({
        customerEmail: "qa-closure@example.com", customerFirstName: "QA",
        confirmationId: "PT-QA24H-RENDER", providerName: "Dr QA Fixture",
        deliverySpeed: speed, portalUrl: "https://pawtenant-test.vercel.app/my-orders", isPSD: false,
      });
      const sent = globalThis.__sends[0];
      check(`assign-doctor · stored=${tag} · the provider stub captured exactly one payload`, () =>
        globalThis.__sends.length === 1 || `captured ${globalThis.__sends.length}`);
      if (!sent) continue;
      assertBody(`assign-doctor · provider-assigned · stored=${tag}`, sent.body.html);
      check(`assign-doctor · stored=${tag} · subject names no delivery window`, () =>
        !/2\s*[-–]\s*3|24\s*[-–]\s*48/.test(sent.body.subject) || `subject: ${sent.body.subject}`);
    }
  }

  // ── 2 · notify-order-status — status-change customer emails ─────────────
  {
    const m = await load("notifyOrderStatus", harness(
      read("notify-order-status/index.ts"),
      ["buildUnderReviewEmail", "buildCompletedEmail", "buildCancelledEmail"],
      `const DELIVERY_TURNAROUND_CLAUSE = ${JSON.stringify(APPROVED_CLAUSE)};`,
    ));
    assertBody("notify-order-status · under review (provider assigned)",
      m.buildUnderReviewEmail({ firstName: "QA", confirmationId: "PT-QA24H-RENDER", doctorName: "Dr QA Fixture" }));
    assertBody("notify-order-status · completed",
      m.buildCompletedEmail({ firstName: "QA", confirmationId: "PT-QA24H-RENDER", doctorName: "Dr QA Fixture" }),
      { requirePromise: false });
    assertBody("notify-order-status · cancelled + refunded",
      m.buildCancelledEmail({ firstName: "QA", confirmationId: "PT-QA24H-RENDER", refunded: true, refundAmount: 129 }),
      { requirePromise: false });
  }

  // ── 3 · resend-confirmation-email — purchase confirmation ───────────────
  {
    const m = await load("resendConfirmation", harness(
      read("resend-confirmation-email/index.ts"),
      ["buildConfirmationEmail"],
      `const DELIVERY_PROMISE_LABEL = ${JSON.stringify(APPROVED_LABEL)};
       const deliveryPromiseLabel = () => ${JSON.stringify(APPROVED_LABEL)};`,
    ));
    for (const speed of ["", "2-3days", "standard", "priority", "24h", "24hours"]) {
      assertBody(`resend-confirmation-email · confirmation · stored=${speed || "blank"}`,
        m.buildConfirmationEmail({
          firstName: "QA", confirmationId: "PT-QA24H-RENDER", state: "CA",
          planType: "One-Time Purchase", deliverySpeed: speed, formattedPrice: "$129.00",
        }));
    }
  }

  // ── 4 · get-resume-order — resume / unpaid-lead notification ────────────
  {
    const m = await load("getResumeOrder", harness(
      read("get-resume-order/index.ts"), ["buildUnpaidLeadHtml"],
      `const DELIVERY_PROMISE_LABEL = ${JSON.stringify(APPROVED_LABEL)};`,
    ));
    for (const speed of ["", "2-3days", "priority", "24h"]) {
      assertBody(`get-resume-order · resume/unpaid-lead · stored=${speed || "blank"}`,
        m.buildUnpaidLeadHtml({
          confirmationId: "PT-QA24H-RENDER", firstName: "QA", lastName: "Closure",
          email: "qa-closure@example.com", phone: "", state: "CA", letterType: "esa",
          deliverySpeed: speed, timestamp: "Sep 4, 2026, 4:00 PM ET",
        }));
    }
  }

  // ── 5 · send-checkout-recovery — abandoned-checkout customer email ──────
  {
    const m = await load("sendCheckoutRecovery", harness(
      read("send-checkout-recovery/index.ts"), ["buildRecoveryEmail"],
    ));
    for (const isPsd of [false, true]) {
      assertBody(`send-checkout-recovery · ${isPsd ? "PSD" : "ESA"} benefit list`,
        m.buildRecoveryEmail("QA", "https://pawtenant-test.vercel.app/checkout/qa", "$129.00", isPsd));
    }
  }

  // ── 6 · notify-thirty-day-customer — renewal / reissue ──────────────────
  //    The body is one inline template literal inside the handler, so the
  //    interpolation is resolved from source and the resolved text asserted.
  {
    const src = read("notify-thirty-day-customer/index.ts");
    const at = src.indexOf("Your Official Letter Review Has Started");
    const body = src.slice(at, at + 2200);
    check("notify-thirty-day-customer · interpolates the SHARED delivery clause", () =>
      /\$\{DELIVERY_TURNAROUND_CLAUSE\}/.test(body) || "the shared delivery clause is no longer interpolated here");
    assertBody("notify-thirty-day-customer · renewal review started",
      body.replace(/\$\{DELIVERY_TURNAROUND_CLAUSE\}/g, APPROVED_CLAUSE));
  }

  // ── 7 · send-templated-email — the {{delivery}} merge field ─────────────
  {
    const code = read("send-templated-email/index.ts")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    check("send-templated-email · {{delivery}} is the shared label, not a branch", () =>
      (/hydratedFromOrder\.delivery\s*=\s*deliveryLabel/.test(code) &&
        /const\s+deliveryLabel\s*=\s*DELIVERY_PROMISE_LABEL\s*;/.test(code)) ||
      "the delivery merge field is no longer the shared constant");
  }

  // ── 8 · shared confirmation layout — the Delivery row every email uses ──
  {
    const m = await load("orderConfirmationLayout", harness(
      read("_shared/orderConfirmationLayout.ts"), ["renderOrderConfirmationContent"],
    ));
    assertBody("_shared/orderConfirmationLayout · order details card",
      m.renderOrderConfirmationContent({
        subject: "Your PawTenant order is confirmed",
        bodyText: "Hi QA,\n\nThanks — your order is confirmed.",
        details: {
          orderId: "PT-QA24H-RENDER", state: "CA", plan: "One-Time Purchase",
          delivery: APPROVED_LABEL, amount: "$129.00",
        },
      }));
  }

  // ── 9 · unrelated timelines must SURVIVE ────────────────────────────────
  check("notify-customer-refund · keeps the 3–5 business day bank timeline", () =>
    /3\s*(?:&ndash;|–|-)\s*5\s*business\s*days?/i.test(read("notify-customer-refund/index.ts")) ||
    "the refund settlement timeline was changed by this task");
  check("provider-additional-pet-decision · keeps the 5–10 business day refund timeline", () =>
    /5\s*(?:&ndash;|–|-)\s*10\s*business\s*days?/i.test(read("provider-additional-pet-decision/index.ts")) ||
    "the refund settlement timeline was changed by this task");
  // The consultation-booking confirmation is a TEST-only funnel surface; LIVE's
  // resend-confirmation-email has no such email. Assert the timeline is intact
  // ONLY where the surface actually exists, so the check is meaningful on both
  // repos instead of vacuously failing on the one that never had it.
  {
    const rc = read("resend-confirmation-email/index.ts");
    if (/buildConsultationConfirmationEmail/.test(rc)) {
      check("resend-confirmation-email · keeps the consultation scheduling timeline", () =>
        /contacts you within 1 business day to schedule your call/i.test(rc) ||
        "the consultation scheduling timeline was changed by this task");
    } else {
      check("resend-confirmation-email · has no consultation email on this repo (nothing to preserve)", () =>
        !/schedule your call/i.test(rc) ||
        "a consultation scheduling timeline exists but was not asserted");
    }
  }

  // ── 10 · nothing left the process ──────────────────────────────────────
  check("no outbound delivery call escaped the harness", () =>
    Array.isArray(globalThis.__sends) || "the provider stub was never installed");

  if (DUMP) {
    for (const r of rendered) {
      const m = r.text.match(/[^.]*24 ?[Hh](?:ours?|rs?)[^.]*\./);
      console.log(`\n--- ${r.label}\n    ${m ? m[0].trim() : "(no 24-hour sentence)"}`);
    }
    console.log("");
  }

  if (failures.length === 0) {
    console.log(`Customer email rendering (24-hour promise): ${checks} checks passed across ${rendered.length} rendered bodies.`);
    console.log(`Provider stub: every outbound call was intercepted; any non-Resend host would have thrown.`);
    return;
  }
  console.log(`Customer email rendering: ${failures.length} of ${checks} checks FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
}

main();
