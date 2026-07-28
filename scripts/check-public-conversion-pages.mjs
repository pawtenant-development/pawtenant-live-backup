// scripts/check-public-conversion-pages.mjs
//
// LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
//
// Blocking guard for the public conversion-page contract.
//
// Provider VISIBILITY and the public payload are covered by
// check-provider-entity.mjs; this guard covers everything else the task fixed:
// canonical pricing reuse, the complete three-variable calculator, verification
// presence, sample-letter readability, landlord-page differentiation, centered
// heroes, navigation, the homepage AI assistant, the unsupported-claim bans,
// the /esa-letter-housing noindex policy, and the deferral of site search.
//
// Exit 1 on any failure. `--self-test` runs planted negative controls proving
// each family of checks actually catches a violation.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");

const failures = [];
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`); };
const check = (name, cond) => (cond ? pass(name) : fail(name));

/** Strip comments so a rule can't be satisfied (or tripped) by prose. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

// ── Route → source file ──────────────────────────────────────────────────────
const COST = "src/pages/esa-letter-cost/page.tsx";
const LANDLORD = "src/pages/esa-letter-for-landlord/page.tsx";
const DENIED = "src/pages/landlord-denied-esa-letter/page.tsx";
const VERIFY = "src/pages/esa-letter-verification/page.tsx";
const HOWTO = "src/pages/how-to-get-esa/page.tsx";          // /how-to-get-esa-letter
const PSD = "src/pages/service-dogs/page.tsx";              // /all-about-service-dogs
const NAVBAR = "src/components/feature/SharedNavbar.tsx";
const HOME = "src/pages/home/page.tsx";
const HERO = "src/components/feature/PublicPageHero.tsx";
const CALC = "src/components/feature/PetCostSavingsCalculator.tsx";
const NOTARY = "src/components/feature/NotaryCoordinationSection.tsx";
const SHOWCASE = "src/components/feature/SampleLetterShowcase.tsx";

/** Pages that must render the CANONICAL homepage pricing cards. */
const PRICING_PAGES = [COST, DENIED, HOWTO, PSD];
/** Pages that must expose the real verification entry point. */
const VERIFY_PAGES = [COST, LANDLORD, DENIED, VERIFY];
/** Pages that must use the shared centered hero. */
const CENTERED_HERO_PAGES = [COST, LANDLORD, DENIED, VERIFY, HOWTO, PSD];
/** Pages carrying the informational notary section. */
const NOTARY_PAGES = [VERIFY, LANDLORD];

// ── Predicates (shared by real checks AND the self-test) ─────────────────────
export const usesCanonicalPricing = (src) =>
  /PlanPricingSection/.test(src) &&
  /(buildEsaPlanCards|buildPsdPlanCards)/.test(src);

/** A bare price literal outside a comment — the drift risk we are banning. */
export const hasStalePriceLiteral = (src) =>
  /\$\s?\d{2,4}(?:\/(?:yr|year|mo|month))?/.test(code(src));

export const calculatorHasAllThreeVariables = (src) =>
  /calc-pets/.test(src) && /calc-monthly/.test(src) && /calc-deposit/.test(src);

/** The formula must multiply BOTH terms by the pet count. */
export const calculatorFormulaUsesPetCount = (src) => {
  const rent = /const a = pets \* monthly \* 12;/.test(src);
  const dep = /const d = pets \* deposit;/.test(src);
  const total = /firstYear: a \+ d/.test(src);
  return rent && dep && total;
};

export const heroIsCentered = (src) => /text-center/.test(src) && /mx-auto/.test(src);

/** Unsupported support claim: "24/7" attached to HUMAN availability.
 *  Must catch the claim in either word order, while leaving the approved
 *  "24/7 access to your secure portal" wording alone. */
export const hasUnsupported247Support = (src) =>
  /24\s*\/\s*7[^.<]{0,40}(human|live|agent|phone|staff|team\s+available)/i.test(src) ||
  /(human|live|agent|phone|staff)[^.<]{0,40}24\s*\/\s*7/i.test(src);

/** Unsupported notary claims, in either word order.
 *  Leaves the approved "can help coordinate remote notarization ... available by
 *  request and subject to provider availability" wording alone. */
export const hasUnsupportedNotaryClaim = (src) =>
  /(instant|same[-\s]day|automatic|immediate|guaranteed)\w*[^.<]{0,40}notar/i.test(src) ||
  /notar\w*[^.<]{0,40}(instant|automatic|immediate|guaranteed|same[-\s]day)/i.test(src) ||
  /(included|free)\s+notariz/i.test(src);

async function main(selfTest) {
  console.log("[check-public-conversion-pages] public conversion contract\n");

  const srcs = {};
  for (const f of [COST, LANDLORD, DENIED, VERIFY, HOWTO, PSD, NAVBAR, HOME, HERO, CALC, NOTARY, SHOWCASE]) {
    srcs[f] = await rd(f);
  }

  // ── 1) Canonical pricing reuse ─────────────────────────────────────────────
  for (const f of PRICING_PAGES) {
    check(`${f}: renders canonical pricing cards`, usesCanonicalPricing(srcs[f]));
  }
  // No page may hand-roll a card grid with its own price literals.
  for (const f of PRICING_PAGES) {
    const body = code(srcs[f]);
    check(`${f}: no hand-rolled price card literal`,
      !/(text-4xl|text-5xl)[^"]*"[\s\S]{0,80}\$\{?\s?\d{2,4}/.test(body));
  }
  // PSD page must use the PSD deck, never the ESA one.
  check(`${PSD}: uses PSD cards (not ESA)`,
    /buildPsdPlanCards/.test(srcs[PSD]) && !/buildEsaPlanCards/.test(srcs[PSD]));

  // ── 2) Complete three-variable calculator ──────────────────────────────────
  check("calculator has pet count control", /calc-pets/.test(srcs[CALC]));
  check("calculator has monthly pet rent control", /calc-monthly/.test(srcs[CALC]));
  check("calculator has deposit/fee control", /calc-deposit/.test(srcs[CALC]));
  check("calculator has all three variables", calculatorHasAllThreeVariables(srcs[CALC]));
  check("calculator formula multiplies BOTH terms by pet count",
    calculatorFormulaUsesPetCount(srcs[CALC]));
  check("calculator labels rent per pet", /\(per pet\)/.test(srcs[CALC]));
  check("calculator labels deposit per pet", /per pet, one-time/.test(srcs[CALC]));
  check("calculator shows an annual-rent breakdown line", /Annual pet rent/.test(srcs[CALC]));
  check("calculator shows a deposits breakdown line", /One-time deposits/.test(srcs[CALC]));
  check("calculator shows a one-year total", /Estimated one-year total/.test(srcs[CALC]));
  check("calculator keeps estimate-only compliance copy",
    /informational only/i.test(srcs[CALC]) && /does not guarantee approval/i.test(srcs[CALC]));
  // The superseded two-variable teaser must not return to these pages.
  for (const f of [COST, LANDLORD]) {
    check(`${f}: uses the complete calculator (not the 2-var teaser)`,
      /PetCostSavingsCalculator/.test(srcs[f]) && !/PetRentSavingsMini/.test(code(srcs[f])));
  }

  // ── 3) Verification presence ───────────────────────────────────────────────
  for (const f of VERIFY_PAGES) {
    check(`${f}: exposes the verification widget`,
      /EsaLetterVerificationWidget/.test(srcs[f]));
  }
  // The widget must hand off to the real result screen, never render a verdict.
  const widget = await rd("src/components/feature/EsaLetterVerificationWidget.tsx");
  check("verification widget routes to the real /verify/<id> screen",
    /navigate\(`\/verify\/\$\{encodeURIComponent\(cleaned\)\}`\)/.test(widget));
  // Structural, not keyword-based: the widget must not talk to the database and
  // must not hold any result/verdict state of its own.
  check("verification widget performs no lookup itself",
    !/supabase|\.rpc\(|fetch\(/i.test(code(widget)));
  check("verification widget holds no result state",
    !/useState.*(result|verdict|status|valid|letter)/i.test(code(widget)));
  // No page may reintroduce a fabricated verification result.
  for (const f of [VERIFY, COST, LANDLORD, DENIED]) {
    const body = code(srcs[f]); // comments may legitimately cite the removed fake
    check(`${f}: no fabricated NPI / license specimen`,
      !/1234567890/.test(body) && !/CA-LCSW-\d+/.test(body) && !/MFC-\d+/.test(body));
  }

  // ── 4) Sample letter is readable, not a thumbnail ──────────────────────────
  check("sample showcase offers click-to-enlarge", /Click to enlarge/i.test(srcs[SHOWCASE]));
  check("sample showcase has a lightbox dialog", /aria-modal="true"/.test(srcs[SHOWCASE]));
  check("sample showcase closes on Escape", /e\.key === "Escape"/.test(srcs[SHOWCASE]));
  check("sample showcase gives the letter a real column", /max-w-\[520px\]/.test(srcs[SHOWCASE]));
  check("sample showcase captions the expected fields", /What to expect on the document/.test(srcs[SHOWCASE]));
  check("sample showcase labels the specimen as placeholder",
    /placeholder/i.test(srcs[SHOWCASE]));
  // The 220px thumbnail that triggered this task must not come back.
  for (const f of [LANDLORD, DENIED, VERIFY]) {
    check(`${f}: no tiny sample-letter thumbnail`,
      !/max-w-\[(?:1\d\d|2[0-4]\d)px\][\s\S]{0,160}SampleLetterCard/.test(code(srcs[f])));
  }

  // ── 5) Landlord pages are differentiated ───────────────────────────────────
  const heroImgOf = (src) => src.match(/backgroundImage="([^"]+)"/)?.[1] ?? null;
  const headingOf = (src) => src.match(/heading="([^"]+)"/)?.[1] ?? null;
  const lImg = heroImgOf(srcs[LANDLORD]);
  const dImg = heroImgOf(srcs[DENIED]);
  const lH1 = headingOf(srcs[LANDLORD]);
  const dH1 = headingOf(srcs[DENIED]);
  check("proactive landlord page declares a hero image", !!lImg);
  check("denial page declares a hero image", !!dImg);
  check("landlord pages do NOT share a hero image", !!lImg && !!dImg && lImg !== dImg);
  check("landlord pages do NOT share hero copy", !!lH1 && !!dH1 && lH1 !== dH1);
  check("denial page carries reactive next-steps", /id="next-steps"/.test(srcs[DENIED]));
  const deniedBody = code(srcs[DENIED]);
  check("denial page does not claim every denial is unlawful",
    !/(?<!not\s)every denial is (?:illegal|unlawful)/i.test(deniedBody));
  check("denial page states denials are not always unlawful",
    /not every (?:landlord )?denial is unlawful/i.test(deniedBody));
  check("denial page does not guarantee complaint success",
    !/(?<!does not )(?:guarantee[sd]?|will win|always wins)[^.<]{0,40}(HUD|complaint)/i.test(deniedBody));

  // ── 6) Centered public heroes ──────────────────────────────────────────────
  check("shared hero centers its content", heroIsCentered(srcs[HERO]));
  check("shared hero uses homepage heading font",
    /"Source Serif 4", Georgia/.test(srcs[HERO]));
  check("shared hero uses homepage heading weight", /font-semibold/.test(srcs[HERO]));
  check("shared hero image variant is full-bleed",
    /absolute inset-0/.test(srcs[HERO]) && /object-cover/.test(srcs[HERO]));
  check("shared hero applies a controlled overlay", /bg-gradient-to-b from-gray-900/.test(srcs[HERO]));
  for (const f of CENTERED_HERO_PAGES) {
    check(`${f}: uses the shared centered hero`, /PublicPageHero/.test(srcs[f]));
  }

  // ── 7) Navigation ──────────────────────────────────────────────────────────
  const navCode = code(srcs[NAVBAR]);
  check("navbar no longer links /esa-letter-for-landlord",
    !/href:\s*"\/esa-letter-for-landlord"/.test(navCode));
  check("navbar links the apartment guide",
    /href:\s*"\/esa-letter-for-apartments"/.test(navCode));
  check("apartment guide sits under Guides & Help",
    /"Guides & Help"[\s\S]{0,400}\/esa-letter-for-apartments/.test(navCode));
  check("landlord route is NOT redirected away",
    !/"source":\s*"\/esa-letter-for-landlord"/.test(await rd("vercel.json")));
  check("landlord page keeps contextual reachability",
    /\/esa-letter-for-landlord/.test(await rd("src/components/feature/SharedFooter.tsx")));

  // ── 8) Homepage AI assistant ───────────────────────────────────────────────
  check("homepage mounts the AI assistant", /AIAssistantTrustCard/.test(srcs[HOME]));
  check("homepage AI assistant uses the deciding headline",
    /Having a hard time deciding\?/.test(srcs[HOME]));
  const ai = await rd("src/components/feature/AIAssistantTrustCard.tsx");
  for (const p of ["chatgpt.com", "claude.ai", "perplexity.ai", "gemini.google.com"]) {
    check(`AI assistant supports ${p}`, ai.includes(p));
  }
  check("AI assistant keeps the clinical disclaimer",
    /licensed provider/i.test(ai) && /(cannot|does not|only a licensed)/i.test(ai));

  // ── 9) Unsupported claims ──────────────────────────────────────────────────
  const claimFiles = [COST, LANDLORD, DENIED, VERIFY, HOWTO, PSD, NOTARY, HOME];
  for (const f of claimFiles) {
    // Comments legitimately explain WHY a claim is banned; only shipped copy counts.
    const body = code(srcs[f]);
    check(`${f}: no unsupported 24/7 human-support claim`, !hasUnsupported247Support(body));
    check(`${f}: no unsupported instant/automatic notary claim`, !hasUnsupportedNotaryClaim(body));
  }
  // Notary section: informational only — no payment or write path.
  check("notary section links only to support", /SUPPORT_HREF = "\/contact-us"/.test(srcs[NOTARY]));
  check("notary section has no checkout path",
    !/\/assessment|\/checkout|stripe|package=|price_/i.test(code(srcs[NOTARY])));
  check("notary section performs no database write",
    !/supabase|\.rpc\(|insert\(|update\(/i.test(code(srcs[NOTARY])));
  check("notary section keeps the separateness note",
    /separate from Reasonable Accommodation/.test(srcs[NOTARY]));
  for (const f of NOTARY_PAGES) {
    check(`${f}: carries the notary section`, /NotaryCoordinationSection/.test(srcs[f]));
  }
  // Reasonable Accommodation must not be described as automatically included.
  check("RA is not claimed as automatically included",
    /not\s*<\/strong>?\s*automatically included|not automatically included/i.test(srcs[VERIFY]));

  // ── 10) /esa-letter-housing noindex policy is untouched ────────────────────
  const sitemapXml = await rd("public/sitemap.xml");
  check("/esa-letter-housing NOT in sitemap",
    !/<loc>https:\/\/pawtenant\.com\/esa-letter-housing<\/loc>/.test(sitemapXml));
  // NOTE: the /esa-letter-housing ROUTE is served by src/pages/lp-esa-housing/.
  const housing = await rd("src/pages/lp-esa-housing/page.tsx");
  check("/esa-letter-housing keeps noindex, nofollow", /noindex,\s*nofollow/.test(housing));
  check("/esa-letter-housing is not prerendered as indexable",
    !/"\/esa-letter-housing"/.test(await rd("src/prerender/entry.tsx")));

  // ── 11) Site-wide search stays DEFERRED (docs only) ────────────────────────
  const searchRuntime = [
    /SiteSearchDialog/, /useSiteSearch/, /buildSearchIndex/,
    /id="site-search"/, /searchIndex\.json/,
  ];
  check("no site-search runtime in the navbar", !searchRuntime.some((r) => r.test(srcs[NAVBAR])));
  check("no site-search runtime on the homepage", !searchRuntime.some((r) => r.test(srcs[HOME])));

  // ── Self-test: planted negative controls ──────────────────────────────────
  if (selfTest) {
    console.log("\n[self-test] planted negative controls");
    const neg = (name, cond) => (cond ? pass(`caught: ${name}`) : fail(`MISSED: ${name}`));

    neg("page without PlanPricingSection",
      !usesCanonicalPricing('const x = <div className="price">$129</div>;'));
    neg("page with a bare price literal",
      hasStalePriceLiteral('const s = "Only $115/year";'));
    neg("calculator missing the deposit control",
      !calculatorHasAllThreeVariables('id="calc-pets" id="calc-monthly"'));
    neg("formula ignoring pet count on rent",
      !calculatorFormulaUsesPetCount("const a = monthly * 12;\nconst d = pets * deposit;\nfirstYear: a + d"));
    neg("formula ignoring pet count on deposits",
      !calculatorFormulaUsesPetCount("const a = pets * monthly * 12;\nconst d = deposit;\nfirstYear: a + d"));
    neg("left-aligned hero", !heroIsCentered('<div className="text-left max-w-2xl">'));
    neg("24/7 human support claim", hasUnsupported247Support("24/7 human support available"));
    neg("24/7 live agents claim", hasUnsupported247Support("Our live agents are here 24/7"));
    neg("instant notarization claim", hasUnsupportedNotaryClaim("Get instant notarization today"));
    neg("automatic notarization claim", hasUnsupportedNotaryClaim("Notarization is automatic"));
    neg("free notarization claim", hasUnsupportedNotaryClaim("Free notarization included"));
    // Positive controls — approved wording must NOT trip the bans.
    neg("approved portal wording passes",
      !hasUnsupported247Support("24/7 access to your secure portal"));
    neg("approved notary wording passes",
      !hasUnsupportedNotaryClaim(
        "PawTenant can help coordinate remote notarization of your provider-signed document for $99. The service is available by request and is subject to provider availability."));
  }

  console.log("");
  if (failures.length) {
    console.error(`[check-public-conversion-pages] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("[check-public-conversion-pages] PASSED — pricing, calculator, verification, sample letter, heroes, navigation, AI assistant, claims and search-deferral all verified.");
}

main(process.argv.includes("--self-test")).catch((e) => {
  console.error("[check-public-conversion-pages] FATAL", e);
  process.exit(1);
});
