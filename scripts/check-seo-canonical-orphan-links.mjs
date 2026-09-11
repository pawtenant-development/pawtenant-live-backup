// SEO-CANONICAL-ORPHAN-LINKS-001
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const BASE = "https://pawtenant.com";
const CANONICAL_PATHS = [
  "/blog/florida-esa-letter-renters-2026",
  "/blog/how-esas-help-ptsd-2026",
  "/blog/esa-georgia-atlanta-2026-guide",
  "/blog/esa-virginia-northern-va-richmond-2026-guide",
  "/blog/esa-new-jersey-newark-jersey-city-2026-guide",
  "/blog/exotic-esa-rules-whats-realistically-allowed",
  "/blog/esa-maryland-baltimore-2026-guide",
  "/blog/esa-colorado-denver-2026-guide",
  "/blog/psd-texas-2026-guide",
  "/college-pet-policy/brown",
  "/blog/how-to-get-esa-letter-from-doctor",
  "/blog/esa-road-trip-guide-2026",
  "/blog/florida-esa-laws-what-landlords-can-ask-for",
  "/blog/california-esa-laws-explained-2025-update",
  "/blog/esa-california-2026-update",
  "/blog/mental-health-conditions-qualify-esa-2026",
  "/blog/can-landlord-evict-me-for-having-esa-2026",
  "/blog/esa-complete-guide-2026-whats-updated",
  "/college-pet-policy/vanderbilt",
  "/college-pet-policy/emory",
  "/college-pet-policy/dartmouth",
  "/college-pet-policy/georgetown",
  "/blog/why-pawtenant-best-verifiable-esa-letter-service",
  "/blog/psd-florida-2026-guide",
  "/blog/esa-for-anxiety-depression-mental-health-guide-2026",
  "/blog/esa-michigan-detroit-grand-rapids-2026-guide",
  "/blog/esa-florida-2026-update",
  "/college-pet-policy/nyu",
  "/blog/esa-ohio-2026-guide",
  "/blog/esa-illinois-chicago-2026-guide",
  "/blog/esa-housing-denial-rights-2026",
  "/blog/esa-letter-verification-protects-housing-rights-2026",
  "/blog/esa-new-york-2026-update",
  "/blog/are-online-esa-letters-legit",
  "/blog/how-to-request-esa-accommodation-university-2026",
  "/blog/psd-california-2026-guide",
  "/blog/esa-letter-college-students-dorm-rights-federal-laws",
  "/blog/texas-esa-landlord-rights-2026",
  "/college-pet-policy/rice",
  "/blog/how-to-get-certification-for-emotional-support-dog",
  "/blog/new-york-esa-laws-housing-protections",
  "/blog/esa-letter-apartments-complete-renters-guide-2026",
  "/blog/esa-airline-compliance-guide-all-airlines-2026",
  "/blog/psd-complete-guide-2026-whats-updated",
  "/blog/hoa-esa-rights-2026",
  "/blog/flying-with-esa-travel-letter-guide",
  "/blog/what-landlords-cannot-legally-do-esa",
  "/blog/esa-texas-2026-update",
  "/blog/esa-nyc-apartments-coop-rent-stabilized-2026-guide",
  "/blog/esa-pennsylvania-philadelphia-pittsburgh-2026-guide",
  "/college-pet-policy/ucla",
  "/blog/esa-letter-college-dorms-2026-complete-guide",
  "/blog/new-york-esa-letter-apartment-2026",
  "/blog/what-a-legit-esa-letter-looks-like-checklist-examples",
  "/blog/esa-annual-renewal-subscription-stay-compliant-2026",
  "/blog/how-to-choose-the-right-esa-for-your-needs",
  "/blog/esa-washington-state-2026-guide",
  "/college-pet-policy/johns-hopkins",
  "/college-pet-policy/unc-chapel-hill",
  "/blog/esa-travel-readiness-consultation-guide-2026",
  "/blog/esa-south-florida-miami-fort-lauderdale-2026-guide",
  "/blog/esa-vs-service-animal-key-differences-2026",
  "/blog/renters-insurance-pet-owners-complete-guide",
  "/blog/how-to-renew-esa-letter-2026",
  "/blog/esa-letters-for-veterans-2026",
  "/blog/landlord-verification-esa-letter-guide-2026",
  "/blog/esa-friendly-hotels-travel-guide-2026",
  "/blog/psd-new-york-2026-guide",
  "/college-pet-policy/carnegie-mellon",
  "/blog/pet-therapy-vs-esa-difference-2026",
  "/blog/esa-letter-cost-california-2026",
  "/blog/esa-arizona-phoenix-tucson-2026-guide",
  "/blog/can-you-have-esa-in-college-dorms",
  "/blog/how-esa-letter-verification-works-pawtenant",
  "/blog/multiple-esas-one-apartment-2026",
  "/college-pet-policy/cornell"
];
const ORPHAN_PATHS = [
  "/psd-letter/california",
  "/psd-letter/north-carolina",
  "/psd-letter/new-york",
  "/psd-letter/texas",
  "/psd-letter/ohio",
  "/psd-letter/illinois",
  "/psd-letter/pennsylvania",
  "/psd-letter/georgia",
  "/psd-letter/arizona",
  "/psd-letter/florida",
  "/psd-letter/new-jersey",
  "/blog/how-to-train-psychiatric-service-dog-tasks",
  "/psd-letter/minnesota",
  "/blog/psychiatric-service-dog-letter-explained",
  "/states/california-esa-psd-guide",
  "/blog/california-pet-rent-and-esa-letters",
  "/blog/new-york-pet-rent-and-esa-letters",
  "/landlord-says-esa-letter-is-fake",
  "/blog/emotional-support-animal-travel-anxiety",
  "/blog/can-depression-qualify-you-for-an-esa",
  "/states/san-diego-telehealth-guide",
  "/california-esa-letter-30-day-rule",
  "/states/san-francisco-hoa-psd-guide",
  "/psd-letter/colorado",
  "/blog/can-depression-qualify-psychiatric-service-dog",
  "/blog/pet-deposit-vs-pet-rent",
  "/esa-letter-verification-id",
  "/blog/crowds-travel-stress-emotional-support-animal",
  "/blog/psd-letter-for-anxiety",
  "/blog/apartment-pet-rent-and-esa-letters",
  "/psd-letter/michigan",
  "/blog/psd-letter-vs-service-dog-certificate",
  "/psd-letter/virginia",
  "/blog/temporary-housing-emotional-support-animal",
  "/blog/pet-rent-explained",
  "/blog/texas-pet-rent-and-esa-letters",
  "/blog/can-anxiety-qualify-you-for-a-psd",
  "/iowa-esa-letter-housing-rules",
  "/blog/psychiatric-service-dog-housing-rights",
  "/blog/esa-letter-requirements",
  "/states/texas-esa-psd-guide",
  "/blog/florida-pet-rent-and-esa-letters",
  "/states/los-angeles-esa-landlord-guide",
  "/what-documents-can-landlord-ask-for-esa",
  "/esa-letter-vs-pet-policy",
  "/psd-letter/oregon",
  "/blog/colorado-pet-rent-and-esa-letters",
  "/is-pawtenant-legit",
  "/can-landlord-reject-esa-letter",
  "/blog/texas-service-animal-laws-penalties",
  "/everything-you-need-to-know-about-obtaining-an-esa-letter-online",
  "/psd-letter/washington",
  "/blog/washington-pet-rent-and-esa-letters"
];
const HUBS = ["/blog", "/resource-center", "/college-pet-policy"];

const routeFile = (route) => join(OUT, route.replace(/^\//, ""), "index.html");
const canonicalOf = (html) => html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
const hreflangOf = (html, language) => html.match(new RegExp(`<link\\s+rel=["']alternate["'][^>]*hreflang=["']${language}["'][^>]*href=["']([^"']+)["'][^>]*>`, "i"))?.[1] ?? null;
const hrefsOf = (html) => new Set([...html.matchAll(/<a\s[^>]*href=["']([^"'#?]+)[^"']*["']/gi)].map((match) => match[1]));
function assert(ok, message) { if (!ok) throw new Error(message); }

async function verifyBuild() {
  const failures = [];
  for (const route of CANONICAL_PATHS) {
    try {
      const html = await readFile(routeFile(route), "utf8");
      const actual = canonicalOf(html);
      const expected = BASE + route;
      if (actual !== expected) failures.push(`${route}: canonical ${actual ?? "missing"}; expected ${expected}`);
      for (const language of ["en-us", "x-default"]) {
        const alternate = hreflangOf(html, language);
        if (alternate !== expected) failures.push(`${route}: ${language} alternate ${alternate ?? "missing"}; expected ${expected}`);
      }
    } catch (error) {
      failures.push(`${route}: generated HTML missing (${error.message})`);
    }
  }

  const incoming = new Set();
  for (const hub of HUBS) {
    for (const href of hrefsOf(await readFile(routeFile(hub), "utf8"))) incoming.add(href);
  }
  for (const route of ORPHAN_PATHS) {
    if (!incoming.has(route)) failures.push(`${route}: no crawler-visible incoming link from a public hub`);
  }

  const resourceHtml = await readFile(routeFile("/resource-center"), "utf8");
  for (const state of ["California", "Texas", "Florida", "New York"]) {
    if (!resourceHtml.includes(`PSD Letter in ${state}`)) failures.push(`missing descriptive PSD anchor: ${state}`);
  }
  if (resourceHtml.includes('<div id="root"></div>')) failures.push("resource hub was not full-body prerendered");

  if (failures.length) {
    console.error(`[seo-canonical-orphans] FAIL (${failures.length})`);
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log(`[seo-canonical-orphans] PASS: ${CANONICAL_PATHS.length} self-canonicals; ${ORPHAN_PATHS.length} incoming-link targets`);
}

function selfTest() {
  let controls = 0;
  const reject = (fn, label) => {
    let failed = false;
    try { fn(); } catch { failed = true; }
    assert(failed, `negative control escaped: ${label}`);
    controls += 1;
  };
  reject(() => assert(canonicalOf('<link rel="canonical" href="https://pawtenant.com/" />') === BASE + "/blog/example", "homepage leak"), "homepage canonical");
  reject(() => assert(canonicalOf("<html></html>"), "missing canonical"), "missing canonical");
  reject(() => assert(hreflangOf('<link rel="alternate" hreflang="en-us" href="https://pawtenant.com/" />', "en-us") === BASE + "/blog/example", "homepage alternate"), "homepage hreflang");
  reject(() => assert(hrefsOf('<a href="/blog/a">A</a>').has("/blog/b"), "missing link"), "missing incoming link");
  reject(() => assert("California" === "PSD Letter in California", "generic anchor"), "generic PSD anchor");
  reject(() => assert(!'<div id="root"></div>'.includes('<div id="root"></div>'), "empty body"), "empty hub body");
  console.log(`[seo-canonical-orphans] self-test PASS: ${controls}/6 planted controls rejected`);
}

if (process.argv.includes("--self-test")) selfTest();
else await verifyBuild();
