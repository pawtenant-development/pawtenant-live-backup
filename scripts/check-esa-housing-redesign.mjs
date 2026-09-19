#!/usr/bin/env node
// check-esa-housing-redesign.mjs
// SOURCE-level guard for /esa-letter-housing (src/pages/lp-esa-housing/page.tsx).
//
// PAWTENANT-ESA-HOUSING-CRO-RAW-HTML-LEGAL-001 (owner, 2026-09-17)
// ----------------------------------------------------------------
// The page was rebuilt as a focused housing landing page and the route joined
// the prerender/indexability contract. This guard pins the SOURCE half of that
// work: the page's structure, its copy safety, its attribution-carrying CTAs
// and its pricing provenance.
//
// The OUTPUT half — prerendered file, raw <h1>, self-canonical, robots,
// sitemap membership — lives in scripts/check-esa-housing-indexability.mjs,
// because a source scan cannot prove what the server actually shipped.
//
// What deliberately CHANGED from the previous revision of this guard:
//   * it no longer requires a runtime `robots: noindex, nofollow` meta. That
//     meta was applied by JavaScript after hydration, so no raw-HTML crawler
//     ever saw it; the route was served the app shell with the HOMEPAGE
//     canonical and `index, follow`. It is now genuinely indexable and
//     self-canonical, and the page writes no robots meta of its own.
//   * it no longer accepts a hardcoded dollar amount anywhere on the page.
//     Every figure is derived from src/config/pricing.ts at render time, so the
//     page cannot quote an amount the checkout will not honour.
//   * it no longer pins the lifestyle hero photography, the side-by-side
//     ESA+PSD pricing pair or the ESA-vs-PSD comparison table — the redesign
//     removed all three.
//
// Exit 0 = pass, 1 = fail. Read-only.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "src/pages/lp-esa-housing/page.tsx");
const ROUTER = join(ROOT, "src/router/config.tsx");
const PUBLIC = join(ROOT, "public");
const STICKY = join(ROOT, "src/components/feature/MobileStickyApplyCTA.tsx");
const SEO_CONFIG = join(ROOT, "src/config/seoConfig.ts");
const STORE = join(ROOT, "src/lib/attributionStore.ts");
const SCROLLTOP = join(ROOT, "src/components/feature/ScrollTopButton.tsx");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// CRLF is normalised HERE, at the single read point. core.autocrlf is true in
// this repo, so a fresh checkout hands every file back with \r\n — and every
// \n-anchored pattern below (and therefore every planted negative control)
// would silently stop matching.
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");

const src = read(PAGE);
const router = read(ROUTER);
const sticky = read(STICKY);
const seoConfig = read(SEO_CONFIG);
const store = read(STORE);
const scrolltop = read(SCROLLTOP);

/** Comments removed, string/template literals KEPT. Customer copy lives in
 *  string literals, so every copy scan has to run over this. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/** Comments, template literals and DOUBLE-quoted strings removed. "Must NOT
 *  contain" scans for CODE shapes run over this, so a comment or a piece of
 *  copy that merely NAMES an old pattern is documentation, not a regression.
 *
 *  Single-quoted strings are deliberately NOT collapsed. Customer copy is full
 *  of apostrophes ("a landlord's decision", "Klarna's own terms") sitting in
 *  JSX text, and a single-quote stripper treats the first of them as an opening
 *  quote and swallows every assertion until the next one — which is exactly how
 *  an earlier revision of this guard reported present code as missing. This
 *  codebase writes its TSX attributes and imports with double quotes, so
 *  nothing of value is left behind. */
const stripCommentsAndStrings = (s) =>
  stripComments(s)
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

const copy = stripComments(src);      // copy scans
const code = stripCommentsAndStrings(src); // code-shape scans
const stickyCode = stripCommentsAndStrings(sticky);
const scrolltopCode = stripCommentsAndStrings(scrolltop);

// ── 0 · the page and its route still exist ──────────────────────────────────
ok(src.length > 0, "page.tsx not found at src/pages/lp-esa-housing/page.tsx");
if (!src) { report(); }

ok(/path:\s*["']\/esa-letter-housing["']/.test(router),
  "route /esa-letter-housing not registered in router/config.tsx");

// ── 1 · exactly one H1, and it is the approved heading ──────────────────────
const H1 = "ESA Letter for Housing From a Licensed Professional";
const h1Count = (copy.match(/<h1[\s>]/g) || []).length;
ok(h1Count === 1, `expected exactly one <h1>, found ${h1Count}`);
ok(copy.includes(H1), `the approved H1 copy is gone — expected "${H1}"`);
// "legit"/"legitimate" is banned in headings (owner wording decision).
const headings = [...copy.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) => m[1]);
ok(headings.length > 0, "no <h1>/<h2> headings found to scan");
ok(!headings.some((h) => /\blegit(imate)?\b/i.test(h)),
  "a heading uses 'legit'/'legitimate' — banned wording on this page");

// ── 2 · the page owns NO head tags ──────────────────────────────────────────
// Title, description, canonical and robots for this route come from
// seoConfig.ts (raw <head> via prerender-seo.mjs, runtime via SEOManager). A
// tag written here could only disagree with them.
// Scanned on `copy` (comments stripped, literals kept): the tag names live in
// string literals, so the code view would blank exactly what must be caught.
// "robots" has no legitimate use anywhere in this page once the runtime
// noindex is gone, so the strictest possible form is also the correct one.
ok(!/\brobots\b/i.test(copy),
  "the page writes its own robots meta — robots is owned by index.html + the prerender contract");
ok(!/rel=["']canonical["']/.test(copy),
  "the page writes its own canonical link — the canonical is owned by prerender-seo.mjs + SEOManager");
ok(!/document\.title\s*=/.test(code),
  "the page sets document.title — the title is owned by seoConfig + SEOManager");
ok(!/ensureMeta\(\s*["']description["']/.test(src),
  "the page writes its own meta description — it is owned by seoConfig");

// ── 3 · FAQ and FAQ schema come from ONE array ──────────────────────────────
// The visible accordion and the FAQPage JSON-LD must be generated from the same
// FAQ_ITEMS, so they cannot disagree — the only way to keep "visible FAQ ==
// schema" true under future edits.
ok(/const FAQ_ITEMS = \[/.test(src), "FAQ_ITEMS (the single FAQ source) is gone");
const faqMapCount = (code.match(/FAQ_ITEMS\.map\(/g) || []).length;
ok(faqMapCount === 2,
  `FAQ_ITEMS.map( should be used exactly twice (visible list + JSON-LD), found ${faqMapCount}`);
ok(/"@type":\s*"FAQPage"/.test(copy), "the FAQPage JSON-LD was removed");
const ldCount = (copy.match(/application\/ld\+json/g) || []).length;
ok(ldCount === 1, `expected exactly one JSON-LD block (FAQPage), found ${ldCount}`);
ok(/mainEntity:\s*FAQ_ITEMS\.map\(/.test(code),
  "the FAQPage schema no longer builds mainEntity from FAQ_ITEMS — the schema could drift from the visible FAQ");
ok(FAQ_REQUIRED_TOPICS_PRESENT(copy),
  "the FAQ no longer covers every required topic (qualification, landlord acceptance, contents, timing, refund, multiple animals, renewal, ESA vs PSD, public access)");

function FAQ_REQUIRED_TOPICS_PRESENT(text) {
  return [
    /who may qualify/i,
    /landlord have to accept|must accept every/i,
    /what does the documentation contain/i,
    /how long does it take/i,
    /if i do not qualify|if you do not qualify/i,
    /more than one animal|multiple animals/i,
    /renew/i,
    /psychiatric service dog/i,
    /stores, restaurants or flights|public-access/i,
  ].every((re) => re.test(text));
}
// ── 4 · the required page architecture is present ───────────────────────────
for (const id of [
  "quick-answer", "how-it-works", "whats-included",
  "housing-use", "pricing", "why-pawtenant", "verify", "faq",
]) {
  ok(new RegExp(`id="${id}"`).test(src), `the "${id}" section is missing from the page`);
}

// ── 5 · attribution-safe CTA destinations ───────────────────────────────────
ok(/useAttributionParams/.test(code),
  "page must import/use useAttributionParams — CTAs have to carry ad attribution");
ok(/const\s+ASSESSMENT_HREF\s*=\s*withAttribution\(\s*["']\/assessment["']\s*\)/.test(src),
  "ASSESSMENT_HREF must be built with withAttribution('/assessment')");
ok(/const\s+PSD_ASSESSMENT_HREF\s*=\s*withAttribution\(\s*["']\/psd-assessment["']\s*\)/.test(src),
  "PSD_ASSESSMENT_HREF must be built with withAttribution('/psd-assessment')");
// ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001 (2026-09-19): there is no longer a
// page-local `?plan=subscription` CTA. The annual plan is chosen from the
// SHARED homepage card, whose CTA routes to the plain /assessment exactly as it
// does on the homepage, and PlanPricingSection attributes it itself. A
// page-local subscription deep link would make this page's CTA behave
// differently from the identical card on the homepage, so its absence is now
// the contract. Pricing-card parity is pinned by
// scripts/check-esa-housing-pricing-parity.mjs.
ok(!/plan=subscription/.test(code),
  "a page-local ?plan=subscription CTA is back — the shared pricing card must own the annual path");
ok(!/to=\{?["']\/assessment["']\}?/.test(src),
  "a bare to=\"/assessment\" CTA was reintroduced — it would drop gclid/UTM; use ASSESSMENT_HREF");
ok(!/to=\{?["']\/psd-assessment["']\}?/.test(src),
  "a bare to=\"/psd-assessment\" CTA was reintroduced — use PSD_ASSESSMENT_HREF");
ok(!/\$\{ASSESSMENT_HREF\}\?/.test(code),
  "a CTA appends '?' to ASSESSMENT_HREF — that produces a double query string and drops attribution");
ok(/ASSESSMENT_HREF/.test(code) && /PSD_ASSESSMENT_HREF/.test(code),
  "an attributed href constant is declared but never used");
// Raw click identifiers must never be written into the DOM.
ok(!/[?&](gclid|gbraid|wbraid|fbclid)=/.test(src),
  "a raw click identifier is written into the page source");

// ── 6 · analytics: existing event names only ────────────────────────────────
ok(/import \{ trackCtaClick \} from "@\/lib\/trackEvent"/.test(src),
  "the page no longer imports the canonical trackCtaClick helper");
for (const c of ["CTA_HERO", "CTA_STICKY", "CTA_SECTION"]) {
  ok(new RegExp(`trackCtaClick\\(${c}\\)`).test(code), `trackCtaClick(${c}) is no longer fired`);
}
// No second analytics pipeline / no new conversion action.
ok(!/gtag\(|dataLayer|fbq\(|window\.gtag/.test(code),
  "the page calls an analytics pipeline directly — it must only use trackEvent's helpers");

// ── 7 · pricing provenance: derived, never hardcoded ────────────────────────
ok(/from "@\/config\/pricing"/.test(src),
  "the page no longer imports src/config/pricing.ts — prices must come from the canonical source");
// Scanned against `copy`, not `code`: every derivation sits INSIDE a template
// literal (`$${getEsaOneTimeTotal(1)}`), which the code view blanks out.
//
// ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001: the annual and three-pet figures are
// no longer stated by this page at all — they are rendered by the SHARED
// homepage cards, which derive them from the same module. Only the hero offer
// line and the RA note still name a figure here, so only their helpers are
// required. check-esa-housing-pricing-parity.mjs executes the shared builder
// and asserts its prices equal src/config/pricing.ts.
for (const fn of ["getEsaOneTimeTotal", "getBundleOneTimeTotal", "getBundleAnnualTotal"]) {
  ok(new RegExp(`${fn}\\(`).test(copy), `the page no longer derives a price with ${fn}()`);
}
// A literal dollar amount in the COPY is the regression this replaces: it is how
// the page used to be able to quote a retired price.
const literalPrices = [...copy.matchAll(/\$\d{2,4}(?:\.\d\d)?/g)].map((m) => m[0]);
ok(literalPrices.length === 0,
  `a hardcoded dollar amount is present (${literalPrices.join(", ")}) — every figure must be derived from src/config/pricing.ts`);
ok(/up to 2 pets/i.test(copy),
  "the page no longer states the up-to-2-pets coverage rule");
// The renewal disclosure now lives on the SHARED annual card (renewalLine in
// src/data/planPricingCards.ts), which both this page and the homepage render.
// check-esa-housing-pricing-parity.mjs asserts that card still carries it.
ok(/renewal price shown/i.test(copy),
  "the FAQ no longer tells the reader the annual plan renews at the price shown");
ok(/Klarna/.test(copy), "Klarna availability should still be disclosed (as a checkout option)");
// An instalment figure must never become the headline price. This is the
// documented cause of the 2026-07-23 collapse (24.2% -> 9.7% lead-to-paid).
ok(!/\$32\.25/.test(src), "the Klarna instalment figure is anchored on the page");
ok(!/as low as\s*\$?\s*3[0-9](\.\d\d)?\b/i.test(copy), "an 'as low as $3x' instalment anchor is present");

// ── 8 · claim safety ────────────────────────────────────────────────────────
ok(!/guaranteed approval|approval guaranteed|guarantee your approval|guaranteed to qualify/i.test(copy),
  "misleading 'guaranteed approval' claim found");
ok(!/no charge without approval/i.test(copy),
  "'No charge without approval' claim found (misleading — the customer is charged at checkout and refunded if not qualified)");
ok(!/landlord-approved|landlords must accept|guaranteed acceptance/i.test(copy),
  "a guaranteed-landlord-outcome claim is present");
ok(!/100% Money-Back Guarantee/.test(copy),
  "a page-local money-back guarantee row is present — the canonical wording lives in PaymentTrustStrip");
// ESA is a HOUSING accommodation context only — never public access or air travel.
ok(!/\b(esa|emotional support animal)\b[^.!?]{0,90}\b(grants?|allows?|includes?|covers?|gives you|lets you)\b[^.!?]{0,60}\b(public access|air travel|airline|flight|fly)/i.test(copy),
  "an ESA public-access / air-travel entitlement claim is present");
ok(!/\b(fly|travel)\s+with\s+your\s+(esa|emotional support animal)\b/i.test(copy),
  "a 'travel with your ESA' claim is present");
ok(!/service dog registration|register (your )?service dog|certif(y|ied|ication) (your )?(esa|emotional support animal)/i.test(copy),
  "a registration / certification claim is present");
// The required non-guarantees must be stated, not merely not-contradicted.
ok(/does not decide or guarantee a landlord/i.test(copy),
  "the page no longer states that it does not guarantee the landlord's decision");
// Anchored on the "It does not …" form, which is the VISIBLE quick-answer
// bullet. The FAQ carries the same point as "…so ESA documentation does not
// create public-access rights", so a looser pattern would stay satisfied by the
// FAQ alone after the bullet was deleted — a control could not then fail.
ok(/It does not create public-access rights/i.test(copy),
  "the quick-answer no longer states that the documentation creates no public-access rights");
ok(/not every property is covered|Not every property is covered/i.test(copy),
  "the page no longer states that not every property is covered");
ok(/not always removed|are not always removed/i.test(copy),
  "the page no longer states that pet fees are not always removed");
ok(/never automatic/i.test(copy),
  "the page no longer states that approval is never automatic");
// Delivery wording must be the one approved promise.
ok(/typically within 24 hours after provider review/i.test(copy),
  "the approved delivery wording ('typically within 24 hours after provider review') is gone");
ok(!/same[- ]day (approval|letter)/i.test(copy), "a same-day approval claim is present");
// "Free" may describe the ASSESSMENT only, never the letter.
ok(/Start Free Assessment/.test(copy), "the approved primary CTA label 'Start Free Assessment' is gone");
ok(!/free (esa )?letter|letter is free|free documentation/i.test(copy),
  "copy implies a FREE LETTER — 'free' may describe the initial assessment only");
ok(/Starting the assessment is free/i.test(copy),
  "the page no longer clarifies that only the assessment is free");
// Refund wording must be the real policy.
ok(/refund if you do not qualify|refunded if you do not qualify|you are refunded/i.test(copy),
  "the approved refund wording ('refund if you do not qualify') is gone");

// ── 9 · verification contract ───────────────────────────────────────────────
ok(!/PT-YYYY-XXXXXX/.test(copy), "stale verification-ID format 'PT-YYYY-XXXXXX' present — the real format is ESA-XX-XXXXXXX");
ok(/ESA-XX-XXXXXXX/.test(copy), "expected the real verification-ID format hint 'ESA-XX-XXXXXXX'");
ok(!/fetch\s*\(/.test(code), "page must not call fetch() (the verification preview must be non-networked)");
ok(!/verify-letter/.test(code) && !/functions\/v1/.test(copy), "page must not reference the production verification API");
ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(copy.replace(/from ["']@\/[^"']+["']/g, "")),
  "an email address appears in the page source (possible real PII)");
ok(!/\b\d{3}[-.]\d{3}[-.]\d{4}\b/.test(copy), "a phone-number-like string appears in the page source");

// ── 10 · imagery budget ─────────────────────────────────────────────────────
// The redesign allows ONE document/sample visual and ONE verification snapshot,
// plus icon-scale provider avatars. Decorative lifestyle photography — the two
// CSS hero backgrounds this page used to carry — must not come back.
const imgCount = (copy.match(/<img\b/g) || []).length;
ok(imgCount === 2,
  `expected exactly 2 content <img> elements (sample letter + verification snapshot), found ${imgCount}`);
ok(!/backgroundImage|background-image|image-set\(/.test(src),
  "a decorative background image was reintroduced on the hero");
ok(!/pt-lph-bg-(desktop|mobile)/.test(src),
  "the retired lifestyle hero background classes are back");
const sampleSvgCount = (copy.match(/\/images\/checkout\/esa-sample-letter\.svg/g) || []).length;
ok(sampleSvgCount === 1, `expected exactly one sample-letter SVG reference, found ${sampleSvgCount}`);
// The owner-created verification snapshot must stay a byte-exact plain <img>:
// its AVIF/WebP variants are lossy re-encodes of the owner's screenshot.
ok(/<img\s[\s\S]{0,700}?src="\/assets\/ui\/verification-cropped\.png"/.test(copy),
  "the verification snapshot is no longer a plain <img> for /assets/ui/verification-cropped.png");
ok(!/<ResponsiveImage[\s\S]{0,700}?verification-cropped/.test(copy),
  "the verification snapshot was routed through ResponsiveImage (lossy re-encode of the owner's screenshot)");
// Provider avatars stay responsive at 56px (see check-hero-preload-scope.mjs).
ok(/<ResponsiveImage[\s\S]{0,400}?src=\{photo\}/.test(copy),
  "ProviderCard no longer renders the photo through ResponsiveImage");

// Assets must be local and must exist on disk.
ok(!/(src|srcSet)=\{?["'`]https?:\/\//.test(src), "remote image hotlink found — assets must be local");
ok(!/url\(\s*['"]?https?:\/\//.test(src), "remote background-image url() found — assets must be local");
ok(!/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{200,}/.test(src), "large base64 image data embedded in the page source");
const assetPaths = [...copy.matchAll(/["'](\/(?:assets|images)\/[^"']+\.(?:png|jpe?g|webp|avif|svg))["']/g)].map((m) => m[1]);
ok(assetPaths.length > 0, "no local image assets referenced by the page");
for (const a of new Set(assetPaths)) {
  ok(existsSync(join(PUBLIC, a.replace(/^\//, ""))), `referenced asset is missing from public/: ${a}`);
}

// ── 11 · shared components stay mounted ─────────────────────────────────────
// ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001: the strip arrives with the shared
// pricing section (PlanPricingSection renders it below the cards), so the page
// must NOT mount a second one. Both halves are asserted — the shared section is
// present, and no page-local strip is.
ok(/import PlanPricingSection from "@\/components\/feature\/PlanPricingSection"/.test(src),
  "the page no longer imports the canonical PlanPricingSection (which brings the shared trust strip)");
ok((copy.match(/<PlanPricingSection/g) || []).length === 1,
  "the canonical pricing section is not mounted exactly once");
ok(!/<PaymentTrustStrip/.test(copy),
  "a page-local PaymentTrustStrip is mounted — the shared pricing section already renders one");
ok((copy.match(/<PlannerMarketingSection\b/g) || []).length === 1 &&
   /<PlannerMarketingSection family="esa" \/>/.test(src),
  "the shared ESA planner marketing section is not mounted exactly once");
ok(/<SharedNavbar \/>/.test(src) && /<SharedFooter \/>/.test(src),
  "the shared site navbar/footer is no longer mounted");

// ── 12 · mobile sticky CTA ──────────────────────────────────────────────────
const stickyMount = /<MobileStickyApplyCTA[\s\S]{0,900}?\/>/.exec(src);
ok(!!stickyMount, "the mobile sticky CTA is not mounted on this page");
if (stickyMount) {
  const m = stickyMount[0];
  ok(/to=\{ASSESSMENT_HREF\}/.test(m), "the sticky CTA does not use the attributed ASSESSMENT_HREF");
  ok(/label="Start Free Assessment"/.test(m),
    "the sticky CTA no longer carries the page's primary CTA label (the component default anchors a lower figure)");
  ok(/consentSafe/.test(m), "the sticky CTA is no longer consent-safe — it could cover the cookie controls");
  ok(/onClick=\{\(\) => trackCtaClick\(CTA_STICKY\)\}/.test(m), "the sticky CTA no longer reports its click");
}
// The shared bar itself must keep sitting below the consent UI.
// Read from the RAW source: the z-index band lives inside a string literal.
ok(/consentSafe\s*\?\s*"z-\[999[0-7]\]"/.test(sticky),
  "MobileStickyApplyCTA's consent-safe z-index band was raised above the cookie banner");
ok(/cookie_consent/.test(sticky) && /cookie_banner_collapsed/.test(sticky),
  "MobileStickyApplyCTA no longer reads the consent state");
ok(/consentSafe\s*=\s*false/.test(stickyCode), "consentSafe is no longer opt-in by default");
ok(/md:hidden fixed bottom-0/.test(sticky), "the sticky bar is no longer mobile-only / bottom-anchored");

// ── 13 · accessibility invariants ───────────────────────────────────────────
ok(/<summary className="flex min-h-\[44px\]/.test(src),
  "the FAQ accordion trigger lost its 44px minimum tap target");
ok(/tabIndex=\{show \? 0 : -1\}/.test(scrolltopCode),
  "ScrollTopButton is focusable while hidden (keyboard trap on every page)");

// ── 14 · canonical host ─────────────────────────────────────────────────────
ok(/export const BASE_URL\s*=\s*["']https:\/\/pawtenant\.com["']/.test(seoConfig),
  "seoConfig.BASE_URL is no longer the canonical non-www host");
ok(!/https:\/\/www\.pawtenant\.com/.test(src), "a www. PawTenant URL appears on the page");

// ── 15 · raw click IDs stay OUT of the DOM ──────────────────────────────────
// (PT-MT1GWHXX) buildAttributionQueryString deliberately excludes click IDs
// from the fields appended to internal links. If a click ID ever joins that
// list, every internal link starts carrying paid-click credentials in the DOM
// again. Attribution still reaches the funnel — it is carried in the store and
// attached server-side by trackEvent, not written into hrefs.
const storeCode = store
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ");
const linkFieldsBlock = /const linkFields[\s\S]{0,1500}?\];/.exec(storeCode);
ok(!!linkFieldsBlock, "attributionStore.buildAttributionQueryString linkFields block not found");
if (linkFieldsBlock) {
  ok(!/["'](gclid|gbraid|wbraid|fbclid|msclkid|ttclid)["']/.test(linkFieldsBlock[0]),
    "a raw click ID joined the link-appended fields — CTA hrefs would expose paid-click credentials in the DOM");
  // The UTM fields the funnel actually needs must still be forwarded.
  for (const f of ["utm_source", "utm_medium", "utm_campaign"]) {
    ok(linkFieldsBlock[0].includes(`"${f}"`),
      `attributionStore no longer forwards ${f} to internal links`);
  }
}

report();

function report() {
  if (fails.length) {
    console.error(`[check-esa-housing-redesign] FAILED — ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  \u2717 ${f}`);
    process.exit(1);
  }
  console.log(
    "[check-esa-housing-redesign] OK — /esa-letter-housing: one approved H1, " +
      "required sections, head tags owned by seoConfig, FAQ == FAQPage schema from one array, " +
      "attribution-safe CTAs, prices derived from config/pricing, qualification-safe claims, " +
      "2-image budget, shared strip/planner/sticky mounted.",
  );
  process.exit(0);
}