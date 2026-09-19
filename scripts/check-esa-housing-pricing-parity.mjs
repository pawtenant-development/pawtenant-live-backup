#!/usr/bin/env node
// scripts/check-esa-housing-pricing-parity.mjs
//
// ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001 (owner, 2026-09-19)
//
// /esa-letter-housing used to carry a BESPOKE two-card pricing grid built only
// for that page. It has been replaced by the canonical homepage pricing block:
// the same <PlanPricingSection> component fed by the same buildEsaPlanCards() +
// ESA_PLAN_COPY from src/data/planPricingCards.ts that
// src/pages/home/components/HomePricingSection.tsx uses.
//
// This guard exists because "two pages that look the same today" is not the
// same as "two pages that cannot drift". It pins the SHARED-SOURCE property,
// not a snapshot of the markup:
//
//   1. the housing page renders the canonical PlanPricingSection;
//   2. the retired bespoke card block is gone and cannot come back;
//   3. no $109 annual claim (a retired price — see check-machine-facts.mjs);
//   4. every amount is derived from src/config/pricing.ts, never hardcoded;
//   5. the housing page and the homepage pass the SAME card set and the SAME
//      copy object, executed for real via jiti — so a card added, removed or
//      re-priced on one page is impossible without the other;
//   6. the card CTAs route to a real, registered assessment route;
//   7. exactly ONE pricing section exists on the housing page.
//
// Usage:
//   node scripts/check-esa-housing-pricing-parity.mjs
//   node scripts/check-esa-housing-pricing-parity.mjs --self-test
//
// --self-test plants each defect into the REAL source, re-runs this guard as a
// child process, requires a non-zero exit, then restores every file and proves
// the tree is byte-identical (sha256). process.exitCode is used throughout:
// process.exit() inside the plant loop would terminate before the restore.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-esa-housing-pricing-parity]";

const F = {
  lp: join(ROOT, "src/pages/lp-esa-housing/page.tsx"),
  home: join(ROOT, "src/pages/home/components/HomePricingSection.tsx"),
  cards: join(ROOT, "src/data/planPricingCards.ts"),
  section: join(ROOT, "src/components/feature/PlanPricingSection.tsx"),
  router: join(ROOT, "src/router/config.tsx"),
};

/** Single read point: normalise CRLF→LF exactly once, so a Windows checkout and
 *  a Linux runner see byte-identical text for every pattern below. */
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");

/** Comments stripped, string/template literals KEPT (copy lives in literals). */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/** Extract a self-closing `<PlanPricingSection … />` element. */
function pricingSectionElement(src) {
  const i = src.indexOf("<PlanPricingSection");
  if (i === -1) return null;
  const end = src.indexOf("/>", i);
  return end === -1 ? null : src.slice(i, end + 2);
}

/** The value passed to one JSX prop, e.g. cards={…}. Brace-balanced. */
function propValue(el, name) {
  const m = new RegExp(`${name}=\\{`).exec(el);
  if (!m) {
    const s = new RegExp(`${name}="([^"]*)"`).exec(el);
    return s ? s[1] : null;
  }
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < el.length && depth > 0) {
    if (el[i] === "{") depth++;
    else if (el[i] === "}") depth--;
    i++;
  }
  return el.slice(start, i - 1).trim();
}

async function main() {
  const problems = [];
  const add = (cond, msg) => { if (!cond) problems.push(msg); };

  const lp = read(F.lp);
  const home = read(F.home);
  const router = read(F.router);
  add(lp.length > 0, "src/pages/lp-esa-housing/page.tsx not found");
  add(home.length > 0, "src/pages/home/components/HomePricingSection.tsx not found");
  if (!lp || !home) return finish(problems);

  const lpCopy = stripComments(lp);
  const homeCopy = stripComments(home);

  // ── 1 · the housing page renders the CANONICAL component ──────────────────
  add(/import PlanPricingSection from "@\/components\/feature\/PlanPricingSection";/.test(lp),
    "the housing page no longer imports the canonical PlanPricingSection");
  add(/import \{ buildEsaPlanCards, ESA_PLAN_COPY \} from "@\/data\/planPricingCards";/.test(lp),
    "the housing page no longer imports the shared card set (buildEsaPlanCards + ESA_PLAN_COPY)");
  const lpEl = pricingSectionElement(lpCopy);
  const homeEl = pricingSectionElement(homeCopy);
  add(!!lpEl, "no <PlanPricingSection … /> element on the housing page");
  add(!!homeEl, "no <PlanPricingSection … /> element on the homepage section");
  if (!lpEl || !homeEl) return finish(problems);

  // ── 2 · the retired bespoke card block cannot come back ───────────────────
  // The shapes that defined it: a page-local PriceFeat list item, the two card
  // headers, and the page-local CTA labels that the shared cards now own.
  for (const [pat, what] of [
    [/<PriceFeat[\s>]/, "the retired page-local <PriceFeat> card bullet"],
    [/function PriceFeat\b/, "the retired PriceFeat component"],
    [/One-time letter<\/div>/, "the retired bespoke \"One-time letter\" card header"],
    [/Annual plan<\/div>/, "the retired bespoke \"Annual plan\" card header"],
    [/Choose the annual plan/, "the retired bespoke annual CTA label"],
    // The bespoke cards' own price display. Deliberately NOT a generic grid
    // class: "grid md:grid-cols-2 gap-5" is used by the Quick Answer and
    // Housing Use sections too, so matching on it would fail for the wrong
    // reason and would not prove anything about the pricing block.
    [/text-\[34px\] font-bold tracking-tight text-slate-900/, "the retired bespoke card price display"],
    [/Covers up to 2 pets on one document/, "the retired bespoke card scope line"],
  ]) {
    add(!pat.test(lpCopy), `the housing page still renders ${what} — the bespoke pricing cards must be gone`);
  }
  // And there must be no SECOND card implementation anywhere on the page.
  add(!/cards=\{\[/.test(lpCopy),
    "the housing page passes an inline card array — cards must come from buildEsaPlanCards()");

  // ── 3 · no retired $109 annual claim ──────────────────────────────────────
  add(!/\$109/.test(lpCopy), "a $109 claim is present on the housing page (a RETIRED price)");
  add(!/\$109/.test(stripComments(read(F.cards))), "a $109 claim is present in the shared card set");

  // ── 4 · amounts are DERIVED, never hardcoded ──────────────────────────────
  const literals = [...lpCopy.matchAll(/\$\d{2,4}(?:\.\d\d)?/g)].map((m) => m[0]);
  add(literals.length === 0,
    `a hardcoded dollar amount is present on the housing page (${literals.join(", ")}) — every figure must derive from src/config/pricing.ts`);
  const cardsSrc = read(F.cards);
  add(/from "\.\.\/config\/pricing"/.test(cardsSrc) || /from "@\/config\/pricing"/.test(cardsSrc),
    "planPricingCards no longer derives its amounts from src/config/pricing.ts");
  add(!/\b(129|149|115|135|100|179|159)\b/.test(stripComments(cardsSrc).replace(/\/\/.*$/gm, "")),
    "planPricingCards hardcodes a dollar amount instead of calling the pricing helpers");

  // ── 5 · the two pages CANNOT silently drift ───────────────────────────────
  // Compare the PROPS each page passes, then EXECUTE the shared builder so a
  // changed card set fails even if the call sites still look identical.
  for (const prop of ["theme", "eyebrow", "heading", "subheading", "cards", "footnote"]) {
    const a = propValue(lpEl, prop);
    const b = propValue(homeEl, prop);
    add(a !== null && a === b,
      `the housing page and the homepage disagree on the pricing prop \`${prop}\` (housing=${JSON.stringify(a)} homepage=${JSON.stringify(b)}) — the two card sets would drift`);
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const cards = await jiti.import(resolve(ROOT, "src/data/planPricingCards.ts"));
  const built = cards.buildEsaPlanCards("/assessment");
  add(Array.isArray(built) && built.length === 3,
    `the shared ESA card set should have exactly 3 cards, found ${built?.length}`);
  add(built.every((c) => Number.isFinite(c.price) && c.price > 0),
    "a shared ESA card has no usable price");
  add(built.filter((c) => c.highlight).length === 1,
    "exactly one shared ESA card must carry the highlight / popular treatment");
  add(built.some((c) => typeof c.renewalLine === "string" && /year two/i.test(c.renewalLine)),
    "the annual card no longer discloses the renewal price explicitly");
  // Whatever the amounts are, they must be the pricing module's amounts.
  const pricing = await jiti.import(resolve(ROOT, "src/config/pricing.ts"));
  const expected = [
    pricing.getEsaOneTimeTotal(1),
    pricing.getEsaAnnualTotal(1),
    pricing.getEsaOneTimeTotal(3),
  ];
  add(JSON.stringify(built.map((c) => c.price)) === JSON.stringify(expected),
    `the shared card prices ${JSON.stringify(built.map((c) => c.price))} do not match src/config/pricing.ts ${JSON.stringify(expected)}`);

  // ── 6 · the card CTAs route somewhere real ────────────────────────────────
  for (const c of built) {
    const path = String(c.ctaHref).split("?")[0];
    add(new RegExp(`path:\\s*["']${path}["']`).test(router),
      `a shared pricing card points at ${c.ctaHref}, which is not a registered route`);
  }
  add(built.every((c) => String(c.ctaHref).startsWith("/assessment")),
    "a shared ESA pricing card no longer routes to the ESA assessment");
  // PlanPricingSection must keep appending attribution itself (both pages rely
  // on it: neither passes an already-attributed href).
  add(/withAttribution\(c\.ctaHref\)/.test(stripComments(read(F.section))),
    "PlanPricingSection no longer appends attribution to the card CTA — ad params would be dropped on BOTH pages");
  // The annual path is owned by the shared card, not by a page-local deep link.
  add(!/plan=subscription/.test(lpCopy),
    "the housing page reintroduced a page-local ?plan=subscription CTA — its annual path would differ from the identical homepage card");

  // ── 7 · exactly ONE pricing section, and the anchor still clears the navbar ─
  add((lpCopy.match(/<PlanPricingSection/g) || []).length === 1,
    "the housing page mounts more than one pricing section");
  add((lpCopy.match(/id="pricing"/g) || []).length === 1,
    "the housing page has zero or duplicate #pricing anchors");
  add(/id="pricing"[\s\S]{0,200}?className="scroll-mt-24/.test(lpEl),
    "the #pricing section lost scroll-mt-24 — the anchor would land under the fixed navbar");
  // The strip is rendered BY the shared section; a page-local one would double it.
  add(!/<PaymentTrustStrip/.test(lpCopy),
    "the housing page mounts its own PaymentTrustStrip — the shared pricing section already renders one");
  add(/<PaymentTrustStrip className="mt-8" \/>/.test(read(F.section)),
    "PlanPricingSection no longer renders the shared PaymentTrustStrip below the cards");

  return finish(problems);
}

function finish(problems) {
  if (problems.length) {
    console.error(`${TAG} FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exitCode = 1;
    return false;
  }
  console.log(
    `${TAG} OK — /esa-letter-housing renders the canonical homepage PlanPricingSection with the ` +
      `identical shared card set and copy; the bespoke cards are gone; prices derive from ` +
      `src/config/pricing.ts; one pricing section; anchor offset intact; CTAs route to /assessment.`,
  );
  return true;
}

/* ─────────────────────────── negative controls ─────────────────────────── */

function selfTest() {
  const SELF = fileURLToPath(import.meta.url);
  const original = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, readFileSync(p)]));
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const originalHash = Object.fromEntries(Object.entries(original).map(([k, b]) => [k, sha(b)]));

  const run = () => spawnSync(process.execPath, [SELF], { cwd: ROOT, encoding: "utf8" });

  /** Replace exactly once; returns the hit count when it is not exactly 1 so a
   *  control can never be a silent no-op. */
  const patch = (key, find, replace) => {
    const text = original[key].toString("utf8");
    const crlf = text.includes("\r\n");
    const from = crlf ? find.replace(/\n/g, "\r\n") : find;
    const to = crlf ? replace.replace(/\n/g, "\r\n") : replace;
    const hits = text.split(from).length - 1;
    if (hits !== 1) return hits;
    writeFileSync(F[key], text.replace(from, to));
    return true;
  };

  const CONTROLS = [
    {
      name: "the retired bespoke pricing block is restored",
      file: "lp",
      find: "      <PlanPricingSection\n        theme=\"esa\"",
      replace:
        "      <div className=\"grid md:grid-cols-2 gap-5\">\n" +
        "        <div><div>One-time letter</div><PriceFeat>Licensed professional review</PriceFeat></div>\n" +
        "      </div>\n" +
        "      <PlanPricingSection\n        theme=\"esa\"",
    },
    {
      name: "a price is hardcoded on the housing page",
      file: "lp",
      find: "const ESA_ONE_TIME = `$${getEsaOneTimeTotal(1)}`;",
      replace: "const ESA_ONE_TIME = \"$129\";",
    },
    {
      name: "one housing card is changed independently of the homepage",
      file: "lp",
      find: "        cards={buildEsaPlanCards(\"/assessment\")}",
      replace: "        cards={buildEsaPlanCards(\"/assessment\").map((c, i) => (i === 0 ? { ...c, price: 99 } : c))}",
    },
    {
      name: "a homepage card is removed from the housing page only",
      file: "lp",
      find: "        cards={buildEsaPlanCards(\"/assessment\")}",
      replace: "        cards={buildEsaPlanCards(\"/assessment\").slice(0, 2)}",
    },
    {
      name: "the housing heading is changed away from the homepage copy",
      file: "lp",
      find: "        heading={ESA_PLAN_COPY.heading}",
      replace: "        heading=\"Housing pricing\"",
    },
    {
      name: "the pricing anchor offset is broken",
      file: "lp",
      find: "        className=\"scroll-mt-24 bg-[#fdf8f3] border-t border-orange-100\"",
      replace: "        className=\"bg-[#fdf8f3] border-t border-orange-100\"",
    },
    {
      name: "a card CTA destination is changed",
      file: "lp",
      find: "        cards={buildEsaPlanCards(\"/assessment\")}",
      replace: "        cards={buildEsaPlanCards(\"/psd-assessment\")}",
    },
    {
      name: "a second pricing section is mounted on the housing page",
      file: "lp",
      find: "      <PlanPricingSection\n        theme=\"esa\"",
      replace: "      <PlanPricingSection theme=\"esa\" cards={buildEsaPlanCards(\"/assessment\")} eyebrow=\"x\" heading=\"y\" />\n      <PlanPricingSection\n        theme=\"esa\"",
    },
    {
      name: "a page-local PaymentTrustStrip is reintroduced (double strip)",
      file: "lp",
      find: "      <PlanPricingSection\n        theme=\"esa\"",
      replace: "      <PaymentTrustStrip className=\"mt-8\" />\n      <PlanPricingSection\n        theme=\"esa\"",
    },
    {
      name: "the shared card set stops deriving from config/pricing",
      file: "cards",
      find: "      price: getEsaOneTimeTotal(1), // $129 — covers 1 OR 2 pets",
      replace: "      price: 129,",
    },
    {
      name: "PlanPricingSection stops appending attribution to card CTAs",
      file: "section",
      find: "                to={withAttribution(c.ctaHref)}",
      replace: "                to={c.ctaHref}",
    },
    {
      name: "a retired $109 annual claim is added",
      file: "lp",
      find: "            Klarna is available at checkout",
      replace: "            Annual plans start at $109. Klarna is available at checkout",
    },
  ];

  console.log(`${TAG} negative controls (each planted defect must be REJECTED)\n`);
  let bad = 0;

  const baseline = run();
  if (baseline.status !== 0) {
    console.error(`${TAG} --self-test ABORTED: the guard already fails on the clean tree.\n`);
    console.error((baseline.stdout || "") + (baseline.stderr || ""));
    process.exitCode = 1;
    return;
  }

  for (const c of CONTROLS) {
    let planted = false;
    try {
      const res = patch(c.file, c.find, c.replace);
      if (res !== true) {
        console.error(`  ✗ ${c.name} — anchor matched ${res}x in ${relative(ROOT, F[c.file])} (need exactly 1); the control proves nothing`);
        bad++;
        continue;
      }
      planted = true;
      if (run().status === 0) {
        console.error(`  ✗ ${c.name} — the guard PASSED with the defect planted`);
        bad++;
      } else {
        console.log(`  ✓ detected: ${c.name}`);
      }
    } finally {
      if (planted) writeFileSync(F[c.file], original[c.file]);
    }
  }

  for (const [k, p] of Object.entries(F)) writeFileSync(p, original[k]);
  for (const [k, p] of Object.entries(F)) {
    if (sha(readFileSync(p)) !== originalHash[k]) {
      console.error(`  ✗ RESTORE FAILED for ${relative(ROOT, p)} — not byte-identical`);
      bad++;
    }
  }
  if (run().status !== 0) {
    console.error(`  ✗ the guard does not pass again after restore`);
    bad++;
  }

  if (bad) {
    console.error(`\n${TAG} --self-test FAILED — ${bad} problem(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${TAG} --self-test OK — all ${CONTROLS.length} planted negative controls were detected and the tree was restored byte-identical.`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  await main();
}
