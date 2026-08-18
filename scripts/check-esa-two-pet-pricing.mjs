// scripts/check-esa-two-pet-pricing.mjs
//
// ESA-TWO-PET-129-PRICING-001 regression guard.
//
// Business rule under test — ESA Standard, ONE-TIME only:
//     1 pet  -> $129 (12900 cents)
//     2 pets -> $129 (12900 cents)
//     3 pets -> $149 (14900 cents)
//     any other count -> INVALID (rejected, never clamped)
//
// The $149 ESA Standard package is now exclusively for EXACTLY three pets.
//
// This guard EXECUTES the real resolvers (transpiled with esbuild) rather than
// regex-matching them, so a value change cannot slip past. Source-level scans
// are used only for "the charge path must / must not do X" properties, and those
// scans strip comments AND string literals first so they assert the USE of an
// identifier, never a mention of it in prose.
//
// Usage:
//   node scripts/check-esa-two-pet-pricing.mjs             -> exit 1 on failure
//   node scripts/check-esa-two-pet-pricing.mjs --warn-only -> always exit 0
//
// NOTE ON STRIPE: ESA one-time has NO Stripe Price ID. One-time charges are a
// server-computed PaymentIntent amount / inline price_data. The only Stripe
// Price IDs in this system are the eight SUBSCRIPTION prices. Assertions 8, 9
// and 12 are therefore expressed against the mechanism that actually exists.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const TAG = "[check-esa-two-pet-pricing]";

const CLIENT = "src/config/pricing.ts";
const SERVER = "supabase/functions/_shared/pricingMatrix.ts";
const CPI = "supabase/functions/create-payment-intent/index.ts";
const CCS = "supabase/functions/create-checkout-session/index.ts";
const PQ = "supabase/functions/_shared/priceQuote.ts";
const MIGRATION = "supabase/migrations/20260819120000_esa_two_pet_pricing_quote_pet_count.sql";
// The ads conversion-value source differs by environment: TEST resolves it in
// lib.ts (preferring stripe_gross_charged_cents), LIVE uploads order.price
// straight from the paid order row. Read whichever exist and assert the
// PROPERTY that matters in both: the value comes from the finalized order,
// never from a pricing tier constant.
const ADS_SOURCES = [
  "supabase/functions/sync-google-ads-conversions/lib.ts",
  "supabase/functions/sync-google-ads-conversions/index.ts",
];

// The eight provisioned SUBSCRIPTION Price IDs for THIS environment. Swapping in
// another environment's IDs must fail this guard.
const EXPECTED_SUBSCRIPTION_PRICE_IDS = [
  "price_1TubftGwm9wIWlgihMaXmYGZ", "price_1TubfuGwm9wIWlgidAJtAE2o",
  "price_1TubfxGwm9wIWlgiFi7NAeat", "price_1TubfyGwm9wIWlgighSd3lZZ",
  "price_1TubfzGwm9wIWlgiuuTxz8jS", "price_1Tubg1Gwm9wIWlgi4f1jlgP2",
  "price_1Tubg2Gwm9wIWlgi3oHvpal4", "price_1Tubg4Gwm9wIWlgiSvem8rOS",
];

const failures = [];

function check(label, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) return;
    failures.push(`${label} -> ${r}`);
  } catch (err) {
    failures.push(`${label} -> threw ${err && err.message ? err.message : String(err)}`);
  }
}

function eq(label, actual, expected) {
  check(label, () =>
    actual === expected ? true : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Assert fn() throws — the "invalid pet count is REJECTED, not clamped" case. */
function rejects(label, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) failures.push(`${label} -> did NOT reject (it returned a price)`);
}

/** Read a repo file, normalising CRLF -> LF at the SINGLE read point. */
async function read(rel) {
  return (await readFile(resolve(ROOT, rel), "utf8")).replace(/\r\n/g, "\n");
}

/** Strip comments and string/template literals so a scan asserts the USE of an
 *  identifier rather than a mention of it in a comment or a message string. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, '""')
    .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');
}

/** Transpile a pure TS module and import it. */
async function loadTs(rel, tmpDir, name) {
  const src = await read(rel);
  const { code } = await transform(src, { loader: "ts", format: "esm", target: "es2022" });
  const out = resolve(tmpDir, `${name}.mjs`);
  await writeFile(out, code, "utf8");
  return import(pathToFileURL(out).href);
}

async function main() {
  const tmpDir = resolve(ROOT, "node_modules", ".cache", "esa-two-pet-guard");
  await mkdir(tmpDir, { recursive: true });

  let client;
  let server;
  try {
    client = await loadTs(CLIENT, tmpDir, "pricing");
    server = await loadTs(SERVER, tmpDir, "pricingMatrix");
  } catch (err) {
    console.error(`${TAG} FATAL: could not load pricing modules — ${err.message}`);
    process.exitCode = warnOnly ? 0 : 1;
    return;
  }

  const [cpi, ccs, pq, mig] = await Promise.all(
    [CPI, CCS, PQ, MIGRATION].map((f) => read(f).catch(() => "")),
  );
  const adsParts = await Promise.all(ADS_SOURCES.map((f) => read(f).catch(() => "")));
  const ads = adsParts.join("\n");

  // ── 1-3 · The tier table itself ──────────────────────────────────────────
  eq("1. one pet resolves to 12900 cents (server)", server.esaOneTimeCents(1), 12900);
  eq("1. one pet resolves to $129 (client)", client.getEsaOneTimeTotal(1), 129);
  eq("2. two pets resolve to 12900 cents (server)", server.esaOneTimeCents(2), 12900);
  eq("2. two pets resolve to $129 (client)", client.getEsaOneTimeTotal(2), 129);
  eq("2. two pets via canonical package resolver", client.getPackageTotal("esa_standard", "one_time", 2), 129);
  eq("3. three pets resolve to 14900 cents (server)", server.esaOneTimeCents(3), 14900);
  eq("3. three pets resolve to $149 (client)", client.getEsaOneTimeTotal(3), 149);
  eq("3. three pets via canonical package resolver", client.getPackageTotal("esa_standard", "one_time", 3), 149);

  // ── 4 · Zero pets rejected ───────────────────────────────────────────────
  rejects("4. zero pets rejected (server)", () => server.esaOneTimeCents(0));
  rejects("4. zero pets rejected (client)", () => client.getEsaOneTimeTotal(0));
  eq("4. zero pets has no tier", client.esaOneTimeTier(0), null);

  // ── 5 · Four or more rejected by the initial package resolver ────────────
  for (const n of [4, 5, 10, 99]) {
    rejects(`5. ${n} pets rejected (server)`, () => server.esaOneTimeCents(n));
    rejects(`5. ${n} pets rejected (client)`, () => client.getEsaOneTimeTotal(n));
  }

  // ── 6 · Decimal / negative / non-numeric rejected ────────────────────────
  for (const bad of [2.5, 1.0001, -1, -3, Number.NaN, Infinity, -Infinity]) {
    rejects(`6. ${String(bad)} rejected (server)`, () => server.esaOneTimeCents(bad));
    eq(`6. ${String(bad)} has no tier`, client.esaOneTimeTier(bad), null);
  }
  for (const bad of ["2", "abc", null, undefined, {}, [], true]) {
    eq(`6. non-numeric ${String(bad)} has no tier`, client.esaOneTimeTier(bad), null);
  }

  // ── 7 · Server ignores a client-supplied amount ──────────────────────────
  for (const [name, src] of [["create-payment-intent", cpi], ["create-checkout-session", ccs]]) {
    const code = codeOnly(src);
    check(`7. ${name} derives the ESA one-time amount from esaOneTimeCents`, () =>
      /esaOneTimeCents\s*\(/.test(code) || "esaOneTimeCents() is never called");
    for (const forbidden of [
      "body.amount", "body.price", "body.unitAmount", "body.unit_amount",
      "body.priceId", "body.stripePriceId", "body.amountCents",
    ]) {
      check(`7. ${name} never reads ${forbidden} as a charge basis`, () =>
        !code.includes(forbidden) || `${forbidden} is read in code`);
    }
    check(`7. ${name} validates the pet count instead of clamping it`, () =>
      /parsePetCount\s*\(/.test(code) || "parsePetCount() is not used");
    check(`7. ${name} no longer clamps petCount with Math.max(1, Number(body.petCount ...))`, () =>
      !/Math\.max\(\s*1\s*,\s*Number\(\s*body\.petCount/.test(code) || "old clamping parse still present");
  }

  // ── 8 · Three pets cannot use the $129 price ─────────────────────────────
  check("8. three pets never resolve to the $129 amount", () =>
    server.esaOneTimeCents(3) !== 12900 || "three pets resolved to 12900");
  check("8. ESA one-time never charges via a Stripe Price ID", () =>
    // The only Price IDs used are subscription first-year ones, resolved through
    // firstYearPriceId(). A literal price_... in a charge path would mean a
    // pre-created one-time Price could be selected by tier.
    !/["']price_[A-Za-z0-9]{6,}["']/.test(cpi + ccs) ||
    "a literal Stripe Price ID appears in a charge path");

  // ── 9 · Two pets cannot be forced onto $149 ──────────────────────────────
  check("9. two pets never resolve to the $149 amount", () =>
    server.esaOneTimeCents(2) !== 14900 || "two pets resolved to 14900");
  check("9. client and server agree for every valid count", () => {
    for (const n of [1, 2, 3]) {
      if (client.getEsaOneTimeTotal(n) * 100 !== server.esaOneTimeCents(n)) {
        return `client/server disagree at ${n} pets`;
      }
    }
    return true;
  });

  // ── 10 · Historical paid orders are never recalculated ───────────────────
  check("10. the trusted-quote resolver excludes paid orders", () =>
    (/paid_at\s+is\s+null/.test(mig) && /payment_intent_id\s+is\s+null/.test(mig)) ||
    "migration lost the unpaid-only predicate");
  check("10. the pricing change adds no UPDATE against orders", () =>
    !/update\s+public\.orders/i.test(mig) || "migration updates public.orders");

  // ── 11 · Unrelated product prices unchanged ──────────────────────────────
  eq("11. PSD one-time 1 dog still $129", client.getPsdOneTimeTotal(1), 129);
  eq("11. PSD one-time 2 dogs still $149", client.getPsdOneTimeTotal(2), 149);
  eq("11. PSD one-time 3 dogs still $149", client.getPsdOneTimeTotal(3), 149);
  eq("11. PSD one-time 2 dogs still 14900 cents (server)", server.oneTimeCents(2), 14900);
  eq("11. ESA annual first year 1 pet still $115", client.getEsaAnnualTotal(1), 115);
  eq("11. ESA annual first year 2 pets still $135", client.getEsaAnnualTotal(2), 135);
  eq("11. ESA annual first year 3 pets still $135", client.getEsaAnnualTotal(3), 135);
  eq("11. ESA renewal 1 pet still $100", client.getEsaRenewalTotal(1), 100);
  eq("11. ESA renewal 2 pets still $115", client.getEsaRenewalTotal(2), 115);
  eq("11. RA combo one-time still $179", client.getBundleOneTimeTotal(), 179);
  eq("11. RA combo annual still $159", client.getBundleAnnualTotal(), 159);
  eq("11. RA combo renewal still $159 (no year-two drop)", client.getBundleRenewalTotal(), 159);
  eq("11. ESA + RA bundle 2 pets still flat $179", client.getPackageTotal("esa_ra_bundle", "one_time", 2), 179);
  eq("11. PSD standard 2 dogs via package resolver still $149", client.getPackageTotal("psd_standard", "one_time", 2), 149);
  eq("11. Additional Documentation add-on still $50", client.ADDITIONAL_DOC_PRICING.addon, 50);
  eq("11. legacy petTier still tiers 2 pets as multi", client.petTier(2), "multi");

  // ── 12 · TEST and LIVE Stripe IDs cannot cross environments ──────────────
  const ids = [];
  for (const product of ["esa", "psd"]) {
    for (const tier of ["single", "multi"]) {
      ids.push(server.SUBSCRIPTION_PRICE_IDS[product][tier].first_year);
      ids.push(server.SUBSCRIPTION_PRICE_IDS[product][tier].renewal);
    }
  }
  eq("12. exactly eight subscription Price IDs", ids.length, 8);
  eq("12. all subscription Price IDs are distinct", new Set(ids).size, 8);
  check("12. subscription Price IDs match this environment's provisioned set", () => {
    const missing = EXPECTED_SUBSCRIPTION_PRICE_IDS.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !EXPECTED_SUBSCRIPTION_PRICE_IDS.includes(id));
    if (missing.length || extra.length) {
      return `cross-environment Price ID drift — missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`;
    }
    return true;
  });

  // ── 13 · Checkout resume recalculates from pet count ─────────────────────
  check("13. the trusted-quote RPC is pet-count aware", () =>
    /p_pet_count/.test(codeOnly(pq)) || "priceQuote.ts never passes p_pet_count");
  check("13. the migration matches a stored quote on pet_count", () =>
    /q\.pet_count\s*=\s*p_pet_count/.test(mig) || "migration does not compare pet_count");
  for (const [name, src] of [["create-payment-intent", cpi], ["create-checkout-session", ccs]]) {
    check(`13. ${name} passes the pet count into the resume price lock`, () =>
      /resolveLegacyQuoteLock\(\s*confirmationId\s*,\s*[A-Za-z0-9_]+\s*,\s*petCount\s*\)/.test(codeOnly(src)) ||
      "resolveLegacyQuoteLock is called without petCount");
  }

  // ── 14 · Discounts apply to the correct subtotal ─────────────────────────
  const q2 = client.quotePackage("esa_standard", "one_time", 2, 20);
  eq("14. two-pet subtotal before discount is $129", q2.amountDueToday, 129);
  eq("14. two-pet total after $20 discount is $109", q2.finalAmount, 109);
  eq("14. two-pet quote reports the priced tier", q2.tier, "single");
  const q3 = client.quotePackage("esa_standard", "one_time", 3, 20);
  eq("14. three-pet subtotal before discount is $149", q3.amountDueToday, 149);
  eq("14. three-pet total after $20 discount is $129", q3.finalAmount, 129);
  eq("14. three-pet quote reports the priced tier", q3.tier, "multi");
  eq("14. a discount never exceeds the subtotal",
    client.quotePackage("esa_standard", "one_time", 2, 999).finalAmount, 0);

  // ── 15 · Conversion values use the finalized order amount ────────────────
  check("15. an ads conversion-value source is present", () =>
    ads.trim().length > 0 || "no sync-google-ads-conversions source found");
  check("15. the ads conversion value derives from the finalized order amount", () =>
    /stripe_gross_charged_cents|order\.price|payload\.price|price:\s*order\.price/.test(codeOnly(ads)) ||
    "the conversion value is not read from the finalized order/Stripe amount");
  check("15. the ads conversion value is not hardcoded to a tier amount", () =>
    !/\b(12900|14900)\b/.test(codeOnly(ads)) ||
    "a tier amount is hardcoded in the conversion-value path");

  // ── 16 · No stale customer-facing "2-3 pets for $149" claim ─────────────
  // Scoped deliberately: "2 or 3 pets" is STILL correct for the ESA ANNUAL plan
  // ($135 first year / $115 renewal covering 2 or 3 pets), so this cannot be a
  // blanket ban on the phrase. What must never reappear is that phrasing tied to
  // the one-time $149 amount. PSD copy says "dogs" and is untouched by design.
  const ESA_COPY_FILES = [
    "src/pages/faqs/page.tsx",
    "src/pages/lp-esa-housing/page.tsx",
    "src/pages/esa-letter-cost/page.tsx",
    "src/pages/renew-esa-letter/page.tsx",
    "src/data/planPricingCards.ts",
    "src/config/pricing.ts",
    "src/lib/sitePricing.ts",
    "src/mocks/blogPosts.ts",
  ];
  const STALE_MULTI = /(2\s*(or|to|[-–—])\s*3\s*pets|two\s*(or|to)\s*three\s*pets)/i;
  for (const rel of ESA_COPY_FILES) {
    const src = await read(rel).catch(() => "");
    if (!src) { failures.push(`16. could not read ${rel}`); continue; }
    // Sentence-scoped, not a fixed character window: an adjacent ANNUAL clause
    // ("...renews at $115 per year covering 2 or 3 pets") legitimately sits next
    // to a one-time $149 mention, and a fixed window would flag it wrongly.
    const hits = [];
    for (const sentence of src.split(/(?<=[.;!?\n])\s+/)) {
      if (!/\$?149\b/.test(sentence)) continue;
      if (STALE_MULTI.test(sentence)) hits.push(sentence.replace(/\s+/g, " ").trim().slice(0, 150));
    }
    check(`16. ${rel} carries no stale "2-3 pets for $149" claim`, () =>
      hits.length === 0 || `stale copy near $149: "${hits[0]}"`);
  }
  // Positive side: the new coverage wording must actually be present.
  const lp = await read("src/pages/lp-esa-housing/page.tsx").catch(() => "");
  check("16. the ESA landing page states the up-to-2-pets coverage", () =>
    /up to (2|two) pets/i.test(lp) || "no 'up to 2 pets' wording on the ESA landing page");

  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  if (failures.length) {
    console.error(`${TAG} FAILED — ${failures.length} assertion(s):`);
    for (const f of failures) console.error(`  x ${f}`);
    process.exitCode = warnOnly ? 0 : 1;
    return;
  }
  console.log(`${TAG} OK — ESA one-time: 1-2 pets $129, exactly 3 pets $149; every other surface unchanged.`);
}

await main();
