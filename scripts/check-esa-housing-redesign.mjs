#!/usr/bin/env node
// check-esa-housing-redesign.mjs
// Focused, source-level guard for the /esa-letter-housing Revision-3 challenger
// (ESA-HOUSING-LANDING-PAGE-REVISION-3-TEST-IMPLEMENTATION-001).
//
// Asserts the stable, business-critical invariants — NOT pixel/wording detail:
//   route registered · single H1 · noindex preserved · no canonical/JSON-LD added
//   · primary ESA CTA via withAttribution · pricing from the shared source
//   · NO PSD price anywhere · PSD alternative carries no currency · payment logos
//   via the shared PlanPricingSection (not text pills) · verification demo is a
//   labelled, non-networked sample fixture with no real PII · three distinct local
//   image assets · no remote hotlinks / no giant base64 · no misleading claims.
//
// Exit 0 = pass, 1 = fail. Read-only.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "src/pages/lp-esa-housing/page.tsx");
const ROUTER = join(ROOT, "src/router/config.tsx");
const PUBLIC = join(ROOT, "public");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const src = read(PAGE);
const router = read(ROUTER);

ok(src.length > 0, "page.tsx not found at src/pages/lp-esa-housing/page.tsx");

// 1 · route registered
ok(/path:\s*["']\/esa-letter-housing["']/.test(router), "route /esa-letter-housing not registered in router/config.tsx");

// 2 · exactly one H1
const h1Count = (src.match(/<h1[\s>]/g) || []).length;
ok(h1Count === 1, `expected exactly one <h1>, found ${h1Count}`);

// 3 · noindex preserved + no canonical / JSON-LD added on this page
ok(/ensureMeta\(\s*["']robots["']\s*,\s*["']noindex,\s*nofollow["']/.test(src), "robots noindex,nofollow meta was removed/changed");
ok(!/rel=["']canonical["']/.test(src), "a canonical link was added to the page (not allowed in this task)");
ok(!/application\/ld\+json/.test(src), "JSON-LD / structured data was added to the page (not allowed in this task)");

// 4 · primary ESA CTA exists  5 · via withAttribution("/assessment")
ok(/Check If You Qualify/.test(src), "primary CTA label 'Check If You Qualify' missing");
ok(/withAttribution\(\s*["']\/assessment["']\s*\)/.test(src), "CTA does not use withAttribution('/assessment')");

// 6/20 · pricing from shared source, NO PSD price
ok(/buildEsaPlanCards\(/.test(src) && /PlanPricingSection/.test(src), "pricing must reuse the shared PlanPricingSection + buildEsaPlanCards");
ok(!/buildPsdPlanCards/.test(src), "PSD pricing (buildPsdPlanCards) must not appear on this ESA page");
ok(!/PsdPricingSection/.test(src), "PsdPricingSection must not appear on this ESA page");
// 17 · no hardcoded pricing card amounts (shared config is the source of truth)
ok(!/text-4xl[^>]*>\s*\$\d{2,3}/.test(src) && !/From&nbsp;\$\d/.test(src), "hardcoded pricing-card amounts found — pricing must come from buildEsaPlanCards");

// 7 · PSD alternative section carries NO currency
const psdIdx = src.indexOf("trained Psychiatric Service Dog");
if (psdIdx >= 0) {
  const psdBlock = src.slice(psdIdx, psdIdx + 800);
  ok(!/\$\d/.test(psdBlock), "the PSD alternative section must not contain a price");
} else {
  fails.push("PSD alternative section ('trained Psychiatric Service Dog') not found");
}

// 8 · verification demo labelled sample data
ok(/sample data only/i.test(src), "verification demo must be labelled 'sample data only'");
// 9 · no production verification API / network in the page
ok(!/fetch\s*\(/.test(src), "page must not call fetch() (verification demo must be non-networked)");
ok(!/verify-letter/.test(src) && !/functions\/v1/.test(src), "page must not reference the production verification API");
// 10 · fixture has no real PII (no email / long phone) and uses the synthetic id
ok(/ESA-CA-8F3K92/.test(src), "expected synthetic sample verification id ESA-CA-8F3K92");
ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src), "an email address appears in the page source (possible real PII)");
ok(!/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(src), "a phone-number-like string appears in the page source");

// 11/12 · payment logos come from the shared strip, not text pills, in this page
ok(!/>\s*(VISA|AMEX|DISC|VER)\s*</.test(src), "text payment-pill placeholders (VISA/AMEX/DISC/VER) must not be used — use the shared PaymentTrustStrip");

// 13 · no remote image hotlinks
ok(!/(src|srcSet)=\{?["'`]https?:\/\//.test(src), "remote image hotlink found — assets must be local");
ok(!/url\(\s*['"]?https?:\/\//.test(src), "remote background-image url() found — assets must be local");
// 14 · no giant base64 image blobs
ok(!/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{200,}/.test(src), "large base64 image data embedded in the page source");

// 15 · three distinct local image assets referenced + present on disk
const ASSETS = [
  "esa-housing-hero-owner-dog",
  "esa-housing-couple-moving-in",
  "esa-housing-provider-review",
];
for (const a of ASSETS) {
  ok(src.includes(a), `image asset '${a}' not referenced in page`);
  ok(
    existsSync(join(PUBLIC, "assets/lifestyle", a + ".webp")),
    `image asset public/assets/lifestyle/${a}.webp missing`
  );
}

// 16 · required sections present
const REQUIRED = [
  "No-pet buildings",                        // housing problems
  "three-step process",                      // process
  "Everything your housing request needs",   // what you receive
  "verify the letter in under 60 seconds",   // verification
  "Not everyone qualifies",                  // qualification
  "TestimonialsSection",                     // reviews (reused)
  "Common questions",                        // FAQ
];
for (const r of REQUIRED) ok(src.includes(r), `required section marker missing: '${r}'`);

// 22 · SAMPLE-LETTER section must render BEFORE the interactive landlord-verification
// section (visitor learns what the Verification ID is, then how a landlord uses it).
const sampleIdx = src.indexOf("Every letter carries a Verification ID");
const verifyIdx = src.indexOf("verify the letter in under 60 seconds");
ok(sampleIdx >= 0 && verifyIdx >= 0 && sampleIdx < verifyIdx,
  "sample-letter section ('Every letter carries a Verification ID') must appear before the landlord-verification section");

// 23 · mobile hero simplified: the hero's verification link + Klarna line are
// desktop-only (class-gated, not pixel), so the mobile hero keeps one dominant CTA
// and no verification/payment copy competing with it.
ok(/href="#verification"[^>]*className="[^"]*\bhidden\b[^"]*\bmd:/.test(src),
  "hero verification link ('See how landlord verification works') must be desktop-only (hidden md:*) so it is not in the mobile hero");
ok(/className="hidden md:inline-flex[^"]*"[\s\S]{0,400}Start for as low as \$32\.25 with Klarna/.test(src),
  "hero Klarna line must be desktop-only (hidden md:*) — Klarna belongs with pricing, not the mobile hero");

// 18/19 · no misleading claims. NB: the FAQ legitimately *warns against* services
// that "promise instant approval, guaranteed letters" — that cautionary copy is
// compliance-positive, so only genuine positive-promise forms are flagged here.
ok(!/guaranteed approval|approval guaranteed|guarantee your approval|guaranteed to qualify/i.test(src), "misleading 'guaranteed approval' claim found");
ok(!/no charge without approval/i.test(src), "'No charge without approval' claim found (misleading — customer is charged at checkout, refunded if not qualified)");

// verification ID format matches the real product (not the stale PT-YYYY form)
ok(!/PT-YYYY-XXXXXX/.test(src), "stale verification-ID format 'PT-YYYY-XXXXXX' still present — use ESA-XX-XXXXXXX");
ok(/ESA-XX-XXXXXXX/.test(src), "expected the real verification-ID format hint 'ESA-XX-XXXXXXX'");

// ============================================================================
// ESA-HOUSING-HOMEPAGE-MOBILE-HERO-PARITY-001 — hero parity invariants.
// Stable, source-level assertions (no pixel values / no generated-class matches).
// ============================================================================

// P1 · the green "ESA LETTER FOR HOUSING" hero eyebrow is removed (case-sensitive:
//      the lowercase eyebrow string, distinct from the title-case H1/<title>).
ok(!/ESA letter for housing/.test(src), "the green hero eyebrow 'ESA letter for housing' must be removed — the hero begins with the H1");

// P2 · the ESA housing H1 wording is retained INSIDE the <h1> (NOT swapped for
//      the homepage H1), with ONLY "ESA Letter" wrapped in the orange span.
//      Anchored to the <h1> element so changing the visible headline — not just
//      the <title>/<meta> — is required to satisfy it.
ok(/<h1[^>]*>\s*Get an\s*<span[^>]*>ESA Letter<\/span>\s*for Housing — Reviewed by Licensed Providers\s*<\/h1>/.test(src),
  "ESA housing H1 wording must be retained inside the <h1>, with only 'ESA Letter' wrapped in a <span>");
// P3 · the homepage H1 phrase must NOT appear here (mobile hero keeps ESA copy).
ok(!/Your Landlord Can Verify/.test(src), "homepage H1 phrase 'Your Landlord Can Verify' must not appear — keep the ESA housing copy");

// P4 · the mobile hero <source> uses the homepage hero image, gated to the mobile
//      breakpoint (max-width) — the same asset index.html already preloads, so the
//      preload is used (no stale-preload warning) and there is no second download.
ok(/media="\(max-width:\s*768px\)"\s+srcSet="[^"]*pawtenant-mobile-hero-pomeranian[^"]*"/.test(src),
  "mobile hero <source> must use the homepage image (pawtenant-mobile-hero-pomeranian*) at (max-width: 768px)");
// P5 · the OLD ESA mobile hero image (tall variant) is no longer referenced.
ok(!/esa-housing-hero-owner-dog-tall/.test(src), "the old ESA mobile hero image 'esa-housing-hero-owner-dog-tall' must no longer be referenced");
// P5b · desktop still keeps the approved ESA hero image (preserved, not replaced).
ok(/media="\(min-width:\s*769px\)"\s+srcSet="[^"]*esa-housing-hero-owner-dog\.webp"/.test(src),
  "desktop hero <source> must keep the approved ESA image (esa-housing-hero-owner-dog.webp) at (min-width: 769px)");

// ── ESA-HOUSING-MOBILE-HERO-CONVERSION-PARITY-002 — homepage conversion details ──
// These SUPERSEDE the 001 assertions that prohibited $32.25 + the states pill in
// the mobile hero; the owner now explicitly wants both inside the mobile hero.

// C1 · ONLY "ESA Letter" wears the homepage hero orange token (text-orange-400):
//      the <h1> is white and contains exactly one <span> (the orange phrase).
const h1Block = (src.match(/<h1[^>]*>[\s\S]*?<\/h1>/) || [""])[0];
ok(/text-white/.test((src.match(/<h1[^>]*>/) || [""])[0])
   && (h1Block.match(/<span/g) || []).length === 1
   && /<span className="text-orange-400">ESA Letter<\/span>/.test(h1Block),
  "H1 must be white with exactly one orange span — 'ESA Letter' in the homepage token text-orange-400");

// C2 · mobile price teaser present as a mobile-only (md:hidden) homepage line; the
//      desktop-only Klarna line stays, so $32.25 appears exactly twice (one mobile
//      price + one desktop price) — no extra/duplicate price lines.
ok(/<p className="md:hidden[^"]*"[\s\S]{0,140}Start for as low as[\s\S]{0,160}\$32\.25/.test(src),
  "mobile hero must include the homepage price teaser 'Start for as low as $32.25' as a mobile-only (md:hidden) line");
ok((src.match(/\$32\.25/g) || []).length === 2,
  "$32.25 must appear exactly twice — the mobile teaser + the desktop-only Klarna line — no extra price lines");
ok(!/\d\.\d{2}\s*\$/.test(src), "price must use US currency format ($32.25), never a trailing-dollar form (32.25$)");

// C3 · the homepage-style "Serving all 50 US states" pill is present as a mobile-only
//      (md:hidden, rounded-full) element, exactly once (not duplicated on desktop).
ok(/className="md:hidden[^"]*rounded-full[\s\S]{0,240}Serving all 50 US states/.test(src),
  "mobile hero must include the homepage 'Serving all 50 US states' pill (mobile-only rounded-full element)");
ok((src.match(/Serving all 50 US states/g) || []).length === 1,
  "'Serving all 50 US states' must appear exactly once (the mobile pill)");

// C4 · refund reassurance wording unchanged.
ok(/Full refund if you don't qualify after review\./.test(src), "refund reassurance wording must remain exact");
// C5 · mobile refund uses the homepage emerald status icon; desktop keeps its check.
ok(/ri-checkbox-circle-fill text-emerald-300 md:hidden/.test(src),
  "mobile refund indicator must be the homepage emerald status icon (ri-checkbox-circle-fill text-emerald-300), mobile-only");
ok(/<Check className="hidden md:inline-block/.test(src),
  "desktop refund must keep its existing check (hidden md:inline-block) so the approved desktop hero is unchanged");

// C6 · the homepage hero rating row is NOT copied into this hero.
ok(!/★★★★★/.test(src), "homepage hero star row (★★★★★) must not be copied into the hero");
ok(!/Trusted by 15,000\+ pet owners/.test(src), "homepage hero rating text 'Trusted by 15,000+ pet owners' must not be copied");

// P8 · the four-point trust strip stays OUTSIDE and BELOW the hero — after the
//      hero's last element and before the housing-problems section.
const heroEndIdx = src.indexOf("Serving all 50 US states");               // hero's last element (mobile pill)
const trustStripIdx = src.indexOf("Reviewed in your state");              // unique trust-strip copy
const housingProblemsIdx = src.indexOf("No-pet buildings. Pet rent.");    // next section
ok(heroEndIdx >= 0 && trustStripIdx > heroEndIdx && housingProblemsIdx > trustStripIdx,
  "the trust strip ('Reviewed in your state') must sit below the hero (after its last element) and above the housing-problems section");

// P9 · CTA attribution behavior unchanged — the hero CTA uses the attribution-safe
//      CTA_HREF derived from withAttribution('/assessment').
ok(/href=\{CTA_HREF\}/.test(src) && /const CTA_HREF = withAttribution\(\s*["']\/assessment["']\s*\)/.test(src),
  "hero CTA must use the attribution-safe CTA_HREF (withAttribution('/assessment'))");

// P10 · process-connector regression guard: the absolute connector stays desktop-
//       only (hidden md:block) and the in-flow connector stays mobile-only
//       (md:hidden), so the mobile connector never crosses the step titles.
ok(/hidden md:block[^"]*bg-\[#DCD2C0\]/.test(src), "desktop process connector must stay desktop-only (hidden md:block)");
ok(/md:hidden[^"]*bg-\[#DCD2C0\]/.test(src), "mobile process connector must stay in-flow and mobile-only (md:hidden) — process-line overlap regression guard");

if (fails.length) {
  console.error("❌ check-esa-housing-redesign: " + fails.length + " failure(s):");
  for (const f of fails) console.error("   • " + f);
  process.exit(1);
}
console.log("✅ check-esa-housing-redesign: all ESA housing Revision-3 invariants hold.");
