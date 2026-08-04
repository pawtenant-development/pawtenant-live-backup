#!/usr/bin/env node
// check-esa-housing-redesign.mjs
// Source-level guard for /esa-letter-housing.
//
// GOOGLE-ADS-ESA-HOUSING-FUNNEL-CONVERSION-RECOVERY-001
// -----------------------------------------------------
// The Revision-3 rewrite (LIVE 3913bc3, 2026-07-23) halved this page's
// lead-to-paid rate: 24.2% -> 9.7% on an IDENTICAL keyword set, while every
// other landing page held or improved in the same window. The page has been
// restored to the pre-2026-07-23 structure that converted at 24-28% under real
// paid traffic, with three deliberate carry-forwards from the newer work:
//
//   1. attribution-safe CTAs  (withAttribution -> gclid/gbraid/wbraid/UTM)
//   2. the corrected verification-ID format ESA-XX-XXXXXXX (not PT-YYYY-XXXXXX)
//   3. no standalone installment price anchor in the hero
//
// This guard pins THAT contract. It deliberately no longer asserts the
// Revision-3 hero (mobile $32.25 teaser, states pill, lifestyle hero assets) —
// those are the elements the restoration removes.
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

// Negative ("must NOT contain") assertions run against source with comments
// stripped, so a comment that merely NAMES a forbidden token — including the
// header above — can never satisfy or break them. Assert the USE, not the
// mention.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
  .replace(/^[ \t]*\/\/.*$/gm, " ")    // whole-line // comments
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " "); // JSX comments

ok(src.length > 0, "page.tsx not found at src/pages/lp-esa-housing/page.tsx");

// ── 1 · routing / indexing ──────────────────────────────────────────────────
ok(/path:\s*["']\/esa-letter-housing["']/.test(router), "route /esa-letter-housing not registered in router/config.tsx");

const h1Count = (src.match(/<h1[\s>]/g) || []).length;
ok(h1Count === 1, `expected exactly one <h1>, found ${h1Count}`);

// noindex,nofollow is policy for this paid LP — never index it.
ok(/ensureMeta\(\s*["']robots["']\s*,\s*["']noindex,\s*nofollow["']/.test(src), "robots noindex,nofollow meta was removed/changed");
ok(!/rel=["']canonical["']/.test(code), "a canonical link was added to the page (this LP is noindex by policy)");
ok(!/application\/ld\+json/.test(code), "JSON-LD / structured data was added to the page (this LP is noindex by policy)");

// ── 2 · ATTRIBUTION (the carry-forward that must never regress) ─────────────
// Every internal funnel CTA must route through withAttribution so paid clicks
// keep gclid/gbraid/wbraid/UTM into the assessment. Before 2026-07-23 these
// were bare string constants; that regression must not come back.
ok(/useAttributionParams/.test(code), "page must import/use useAttributionParams — CTAs have to carry ad attribution");
ok(/const\s+ASSESSMENT_HREF\s*=\s*withAttribution\(\s*["']\/assessment["']\s*\)/.test(code),
  "ASSESSMENT_HREF must be built with withAttribution('/assessment')");
ok(/const\s+PSD_ASSESSMENT_HREF\s*=\s*withAttribution\(\s*["']\/psd-assessment["']\s*\)/.test(code),
  "PSD_ASSESSMENT_HREF must be built with withAttribution('/psd-assessment')");
ok(/const\s+SUBSCRIPTION_HREF\s*=\s*withAttribution\(\s*["']\/assessment\?plan=subscription["']\s*\)/.test(code),
  "SUBSCRIPTION_HREF must be built with withAttribution('/assessment?plan=subscription')");

// Bare, unattributed funnel destinations must not be reintroduced as literals.
ok(!/to=\{?["']\/assessment["']\}?/.test(code), "a bare to=\"/assessment\" CTA was reintroduced — it would drop gclid/UTM; use ASSESSMENT_HREF");
ok(!/to=\{?["']\/psd-assessment["']\}?/.test(code), "a bare to=\"/psd-assessment\" CTA was reintroduced — use PSD_ASSESSMENT_HREF");

// An already-attributed href must never be concatenated with another "?" —
// that yields /assessment?gclid=..&utm=..?plan=subscription (invalid URL).
ok(!/\$\{ASSESSMENT_HREF\}\?/.test(code),
  "ASSESSMENT_HREF is concatenated with a second '?' — this produces a double-query URL; use SUBSCRIPTION_HREF");

// ── 3 · PRICE HONESTY (the conversion defect being repaired) ────────────────
// $129 is the real starting price and must be stated on the page. An
// installment figure must never stand alone as the headline anchor.
ok(/\$129/.test(code), "the real one-time starting price ($129) must appear on the page");
ok(/\$149/.test(code), "the 2-3 pet fixed total ($149) must appear on the page");
ok(!/\$32\.25/.test(code),
  "a standalone $32.25 installment anchor is present — Klarna must stay secondary and must not read as the service price");
ok(!/as low as\s*\$?\s*3[0-9](\.\d\d)?\b/i.test(code),
  "an 'as low as $3x' installment anchor is present — the headline price must be the real $129");
// Klarna may be named, but only as a checkout payment option.
ok(/Klarna/.test(code), "Klarna availability should still be disclosed (as a checkout option)");
ok(!/\d\.\d{2}\s*\$/.test(code), "price must use US currency format ($129), never a trailing-dollar form");

// ── 4 · claims / compliance ────────────────────────────────────────────────
ok(!/guaranteed approval|approval guaranteed|guarantee your approval|guaranteed to qualify/i.test(code), "misleading 'guaranteed approval' claim found");
ok(!/no charge without approval/i.test(code), "'No charge without approval' claim found (misleading — customer is charged at checkout, refunded if not qualified)");

// ── 5 · verification-ID format carried forward from the newer work ─────────
ok(!/PT-YYYY-XXXXXX/.test(code), "stale verification-ID format 'PT-YYYY-XXXXXX' present — the real format is ESA-XX-XXXXXXX");
ok(/ESA-XX-XXXXXXX/.test(code), "expected the real verification-ID format hint 'ESA-XX-XXXXXXX'");

// ── 6 · verification demo stays non-networked and PII-free ────────────────
ok(!/fetch\s*\(/.test(code), "page must not call fetch() (the verification preview must be non-networked)");
ok(!/verify-letter/.test(code) && !/functions\/v1/.test(code), "page must not reference the production verification API");
ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(code), "an email address appears in the page source (possible real PII)");
ok(!/\b\d{3}[-.]\d{3}[-.]\d{4}\b/.test(code), "a phone-number-like string appears in the page source");

// ── 7 · no remote assets / no inline blobs ────────────────────────────────
ok(!/(src|srcSet)=\{?["'`]https?:\/\//.test(code), "remote image hotlink found — assets must be local");
ok(!/url\(\s*['"]?https?:\/\//.test(code), "remote background-image url() found — assets must be local");
ok(!/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{200,}/.test(code), "large base64 image data embedded in the page source");

// Every local asset the page references must actually exist, or the restored
// hero renders broken (a conversion defect in its own right).
const assetPaths = [...src.matchAll(/"(\/(?:assets|images)\/[^"]+)"/g)].map((m) => m[1]);
ok(assetPaths.length > 0, "no local image assets referenced by the page");
for (const a of [...new Set(assetPaths)]) {
  ok(existsSync(join(PUBLIC, a)), `referenced asset public${a} is missing`);
}

// ── 8 · the proven page structure is present ──────────────────────────────
const REQUIRED = [
  "No-pet buildings",        // housing problem framing
  "Not everyone qualifies",  // honest qualification section
  "Common questions",        // FAQ
  "Verification ID",         // landlord verification story
  "Fair Housing Act",        // the legal basis this page sells on
];
for (const r of REQUIRED) ok(src.includes(r), `required section marker missing: '${r}'`);

// The dual ESA/PSD routing that this page carried while it converted: both
// assessment entry points remain reachable.
ok(/ASSESSMENT_HREF/.test(code) && /PSD_ASSESSMENT_HREF/.test(code),
  "both the ESA and PSD assessment entry points must remain on the page");

if (fails.length) {
  console.error("❌ check-esa-housing-redesign: " + fails.length + " failure(s):");
  for (const f of fails) console.error("   • " + f);
  process.exit(1);
}
console.log("✅ check-esa-housing-redesign: restored ESA housing conversion contract holds.");
