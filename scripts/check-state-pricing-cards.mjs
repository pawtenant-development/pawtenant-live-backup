// scripts/check-state-pricing-cards.mjs
//
// STATE-PAGE-PRICING-HOMEPAGE-PARITY-TRUST-STRIP-001 corrective guard.
// (Supersedes the rejected STATE-PAGE-PRICING-CARDS-PARITY-001 three-tier+RA guard.)
//
// BLOCKING in the normal build (`npm run build`) — fails the build (exit 1) if:
//   - the ESA/PSD state pages stop mirroring the homepage / PSD-landing pricing
//     (shared src/data/planPricingCards.ts, consumed via PlanPricingSection),
//   - a Reasonable Accommodation / $179 card reappears on a public pricing card,
//   - the canonical ESA/PSD prices drift,
//   - ESA/PSD terminology bleeds across products,
//   - the presentation data could leak toward a charge path,
//   - the PaymentTrustStrip payment marks regress to plain text (no real logos).
//
// It executes the REAL shared builders via jiti so the task's negative controls
// genuinely fail (RA/$179 card added, annual card removed, a price changed,
// Visa/Mastercard turned back into text, PSD leaking ESA wording, …).
//
// Usage:
//   node scripts/check-state-pricing-cards.mjs             → exit 1 on failure
//   node scripts/check-state-pricing-cards.mjs --warn-only → always exit 0 (audit)

import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const TAG = "[check-state-pricing-cards]";
const jiti = createJiti(import.meta.url, { alias: { "@": resolve(ROOT, "src") } });

const DATA = "src/data/planPricingCards.ts";
const PLAN_SECTION = "src/components/feature/PlanPricingSection.tsx";
const TRUST = "src/components/feature/PaymentTrustStrip.tsx";
const HOME = "src/pages/home/components/HomePricingSection.tsx";
const PSD_LANDING = "src/components/feature/PsdPricingSection.tsx";
const STATE_ESA = "src/pages/state-esa/page.tsx";
const STATE_PSD = "src/pages/state-psd/page.tsx";

// Approved ESA/PSD 3-card shape (whole dollars). Same numbers for ESA and PSD.
const EXPECT = [
  { idx: 0, price: 129, suffix: "one-time" },
  { idx: 1, price: 115, suffix: "first year" }, // annual, renews $100
  { idx: 2, price: 149, suffix: "one-time · fixed total" }, // multi, $135→$115
];

async function read(f) {
  try { return await readFile(resolve(ROOT, f), "utf8"); }
  catch { return null; }
}
// Strip comments so a doc-comment that NAMES a forbidden phrase (to warn against
// it) is not a false hit — only code that would actually render/execute counts.
const stripComments = (s) => (s ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
async function exists(f) {
  try { await access(resolve(ROOT, f)); return true; } catch { return false; }
}
async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(resolve(ROOT, dir), { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

async function main() {
  const problems = [];
  const need = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (!re.test(src)) problems.push(`${file} — ${msg}`);
  };
  const forbid = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (re.test(src)) problems.push(`${file} — ${msg}`);
  };

  // ── Behavioral: execute the REAL shared builders (jiti) ─────────────────────
  let buildEsaPlanCards, buildPsdPlanCards, PACKAGE_DISPLAY_NAMES;
  try {
    const mod = await jiti.import(resolve(ROOT, DATA));
    buildEsaPlanCards = mod.buildEsaPlanCards;
    buildPsdPlanCards = mod.buildPsdPlanCards;
    const pricing = await jiti.import(resolve(ROOT, "src/config/pricing.ts"));
    PACKAGE_DISPLAY_NAMES = pricing.PACKAGE_DISPLAY_NAMES;
  } catch (e) {
    problems.push(`could not load builders/pricing via jiti: ${e.message}`);
  }

  const checkSet = (label, cards, opts) => {
    if (!Array.isArray(cards) || cards.length !== 3) {
      problems.push(`${label}: expected exactly 3 cards, got ${Array.isArray(cards) ? cards.length : typeof cards}`);
      return;
    }
    cards.forEach((c, i) => {
      const exp = EXPECT[i];
      if (c.price !== exp.price) problems.push(`${label}[${i}] price ${c.price} ≠ ${exp.price}`);
      if (c.priceSuffix !== exp.suffix) problems.push(`${label}[${i}] priceSuffix "${c.priceSuffix}" ≠ "${exp.suffix}"`);
    });
    // Annual card discloses the $100 renewal; multi card discloses $135→$115.
    if (!/\$100\/year/.test(cards[1].renewalLine || "")) problems.push(`${label} annual card must disclose "$100/year" renewal`);
    if (!/\$135 first year, then \$115\/year/.test(cards[2].subNote || "")) problems.push(`${label} multi card must disclose "$135 first year, then $115/year"`);
    // NO Reasonable Accommodation / $179 card anywhere.
    const blob = JSON.stringify(cards);
    if (/Reasonable Accommodation/i.test(blob)) problems.push(`${label} must NOT contain a Reasonable Accommodation card`);
    if (cards.some((c) => c.price === 179)) problems.push(`${label} must NOT contain a $179 card`);
    if (cards.length !== 3) problems.push(`${label} must have exactly 3 cards (no 4th RA tier)`);
    // Terminology separation.
    if (opts.product === "esa") {
      if (/\bPSD\b/.test(blob)) problems.push(`${label} leaks PSD wording (must stay ESA-only)`);
      if (/\bdogs?\b/i.test(blob)) problems.push(`${label} leaks dog wording (must stay ESA-only)`);
    } else {
      if (/\bESA\b/.test(blob)) problems.push(`${label} leaks ESA wording (must stay PSD-only)`);
      if (/\banimals?\b/i.test(blob)) problems.push(`${label} leaks animal wording (must stay PSD-only)`);
    }
    // CTA routing.
    for (const c of cards) {
      if (!c.ctaHref || !c.ctaHref.startsWith(opts.hrefPrefix)) {
        problems.push(`${label} card "${c.name}" ctaHref "${c.ctaHref}" must start with ${opts.hrefPrefix}`);
      }
    }
  };

  if (typeof buildEsaPlanCards === "function") {
    checkSet("esa(home)", buildEsaPlanCards(), { product: "esa", hrefPrefix: "/assessment" });
    checkSet("esa(state)", buildEsaPlanCards("/assessment?state=CA&ref=state-page"),
      { product: "esa", hrefPrefix: "/assessment?state=" });
    // Homepage default href is the plain assessment.
    if (buildEsaPlanCards()[0].ctaHref !== "/assessment") problems.push("buildEsaPlanCards() default ctaHref must be /assessment");
  }
  if (typeof buildPsdPlanCards === "function") {
    checkSet("psd(home)", buildPsdPlanCards(), { product: "psd", hrefPrefix: "/psd-assessment" });
    checkSet("psd(state)", buildPsdPlanCards("/psd-assessment"), { product: "psd", hrefPrefix: "/psd-assessment" });
  }

  // RA bundle keys must remain in the canonical config (RA removed from the
  // pricing CARDS only — never from assessment / checkout identity).
  if (PACKAGE_DISPLAY_NAMES && typeof PACKAGE_DISPLAY_NAMES === "object") {
    for (const key of ["esa_standard", "esa_ra_bundle", "psd_standard", "psd_ra_bundle"]) {
      if (!(key in PACKAGE_DISPLAY_NAMES)) problems.push(`canonical package key missing: ${key} (RA must NOT be removed from checkout identity)`);
    }
  }

  // ── Static: single shared matrix, consumed by home + PSD landing + state ─────
  const data = await read(DATA);
  need(data, DATA, /from\s+["']\.\.\/config\/pricing["']/, "data module must derive prices from ../config/pricing");
  forbid(stripComments(data), DATA, /Reasonable Accommodation/i, "data module must not define a Reasonable Accommodation card");

  const home = await read(HOME);
  need(home, HOME, /buildEsaPlanCards/, "HomePricingSection must consume the shared buildEsaPlanCards (parity)");
  const psdLanding = await read(PSD_LANDING);
  need(psdLanding, PSD_LANDING, /buildPsdPlanCards/, "PsdPricingSection must consume the shared buildPsdPlanCards (parity)");

  const esa = await read(STATE_ESA);
  const psd = await read(STATE_PSD);
  need(esa, STATE_ESA, /<PlanPricingSection[\s\S]*?theme="esa"/, "state-esa must render <PlanPricingSection theme=\"esa\">");
  need(esa, STATE_ESA, /buildEsaPlanCards\(`\/assessment\?state=\$\{stateData\.abbreviation\}&ref=state-page`\)/, "state-esa must build cards with the state+ref ESA CTA");
  need(psd, STATE_PSD, /<PlanPricingSection[\s\S]*?theme="psd"/, "state-psd must render <PlanPricingSection theme=\"psd\">");
  need(psd, STATE_PSD, /buildPsdPlanCards\(/, "state-psd must build cards via buildPsdPlanCards");
  forbid(esa, STATE_ESA, /StatePricingCards/, "state-esa must not reference the rejected StatePricingCards");
  forbid(psd, STATE_PSD, /StatePricingCards/, "state-psd must not reference the rejected StatePricingCards");

  // Rejected files must be gone.
  if (await exists("src/components/feature/StatePricingCards.tsx")) problems.push("rejected src/components/feature/StatePricingCards.tsx still exists");
  if (await exists("src/lib/statePricingCards.ts")) problems.push("rejected src/lib/statePricingCards.ts still exists");

  // ── Static: PlanPricingSection injects no schema (machine-facts hygiene) ─────
  const plan = await read(PLAN_SECTION);
  forbid(plan, PLAN_SECTION, /application\/ld\+json|"@type"\s*:\s*"(Product|Offer|Service)"/, "PlanPricingSection must not inject pricing schema");

  // ── Static: PaymentTrustStrip renders REAL logo graphics, not plain text ─────
  const trust = await read(TRUST);
  need(trust, TRUST, /<svg\b/, "trust strip must render inline SVG logos");
  need(trust, TRUST, /role="img"\s+aria-label="Visa"/, "trust strip must render a Visa logo (svg with aria-label)");
  need(trust, TRUST, /role="img"\s+aria-label="Mastercard"/, "trust strip must render a Mastercard logo (svg with aria-label)");
  need(trust, TRUST, /aria-label="American Express"/, "trust strip must render an Amex logo");
  need(trust, TRUST, /aria-label="Discover"/, "trust strip must render a Discover logo");
  // Mastercard is the interlocking-circles mark → at least two <circle>.
  if (trust && (trust.match(/<circle\b/g) || []).length < 2) problems.push(`${TRUST} — Mastercard mark must use interlocking circles (≥2 <circle>)`);
  need(trust, TRUST, /Secure Checkout/, "trust strip must keep the Secure Checkout item");
  need(trust, TRUST, /100% Money-Back Guarantee/, "trust strip must keep the Money-Back Guarantee item");
  // The rejected plain-text-chip pattern must be gone.
  forbid(trust, TRUST, /const CARD_BRANDS/, "trust strip must not use the old plain-text CARD_BRANDS chips");

  // ── Import-scope: charge / payment paths never import the display modules ────
  const chargePaths = [
    "supabase/functions/create-payment-intent/index.ts",
    "supabase/functions/create-checkout-session/index.ts",
    "src/pages/assessment/components/Step3Checkout.tsx",
    "src/pages/psd-assessment/components/PSDStep3Checkout.tsx",
  ];
  const displayImport = /planPricingCards|PlanPricingSection|PaymentTrustStrip/;
  for (const f of chargePaths) {
    const src = await read(f);
    if (src == null) continue;
    if (displayImport.test(src)) problems.push(`${f} — charge/payment file must NOT import a public pricing display module`);
  }
  // Broad scan: only presentation files import the data module.
  const scanDirs = ["src", "supabase/functions"];
  const files = (await Promise.all(scanDirs.map(walk))).flat();
  const dataImportRe = /from\s+["'](?:@\/data\/planPricingCards|\.{1,2}\/(?:[^"']*\/)?data\/planPricingCards)["']/;
  const allowed = new Set([
    "src/data/planPricingCards.ts",
    "src/pages/home/components/HomePricingSection.tsx",
    "src/components/feature/PsdPricingSection.tsx",
    "src/pages/state-esa/page.tsx",
    "src/pages/state-psd/page.tsx",
    "src/pages/lp-esa-housing/page.tsx",
  ]);
  for (const rel of files) {
    const norm = rel.replace(/\\/g, "/");
    if (allowed.has(norm)) continue;
    const src = await read(rel);
    if (src == null) continue;
    if (dataImportRe.test(src)) problems.push(`${norm} — unexpected importer of the presentation-only planPricingCards (card prices could leak toward checkout)`);
  }

  if (problems.length === 0) {
    console.log(`${TAG} OK — ESA+PSD state pages mirror the homepage/PSD-landing pricing via the shared planPricingCards (3 cards: $129 one-time · $115 first-yr→$100 · $149 multi→$135/$115); NO Reasonable Accommodation/$179 card; ESA/PSD terminology separated; CTAs route correctly (ESA state+ref, PSD plain); RA package keys intact; PaymentTrustStrip uses real Visa/Mastercard/Amex/Discover SVG logos; display modules never imported by a charge path.`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
