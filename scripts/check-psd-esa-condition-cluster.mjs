// scripts/check-psd-esa-condition-cluster.mjs
// SEO-PSD-ESA-CONDITION-ARTICLE-BATCH-001
//
// Factual-consistency + integration guard for the 3-article PSD/ESA condition
// cluster:
//   /blog/can-anxiety-qualify-you-for-a-psd
//   /blog/can-depression-qualify-psychiatric-service-dog
//   /blog/can-depression-qualify-you-for-an-esa
//
// It reads SOURCE files (deterministic, no build required) and verifies the
// pages exist, self-canonicalize non-www, carry exactly one H1 + one JSON-LD
// @graph (BlogPosting + BreadcrumbList + FAQPage, no HowTo/MedicalWebPage/fake
// reviewer), contain a disclaimer, are registered in CORE_PAGE_META + the XML
// sitemap, interlink per the approved cluster plan (reciprocally with the two
// existing articles), and contain NONE of the YMYL-forbidden claims or the
// broken-infographic / placeholder text.
//
// Exit 1 on any violation. Wired into `npm run build`. Run negative-control
// self-test with `--self-test` (also: `npm run test:psd-esa-cluster`).

import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://pawtenant.com";
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const exists = (p) => access(resolve(ROOT, p)).then(() => true).catch(() => false);

// ── Cluster definition ───────────────────────────────────────────────────────
const NEW = [
  {
    key: "anxiety-psd",
    slug: "can-anxiety-qualify-you-for-a-psd",
    file: "src/pages/blog-can-anxiety-qualify-you-for-a-psd/page.tsx",
    // §13A: HUD (housing), travel (air travel), depression-PSD (conditions), depression-ESA (ESA vs PSD)
    links: [
      "/blog/2026-hud-esa-guidelines",
      "/blog/emotional-support-animal-travel-anxiety",
      "/blog/can-depression-qualify-psychiatric-service-dog",
      "/blog/can-depression-qualify-you-for-an-esa",
    ],
  },
  {
    key: "depression-psd",
    slug: "can-depression-qualify-psychiatric-service-dog",
    file: "src/pages/blog-can-depression-qualify-psychiatric-service-dog/page.tsx",
    // §13B: anxiety-PSD, depression-ESA, HUD, travel
    links: [
      "/blog/can-anxiety-qualify-you-for-a-psd",
      "/blog/can-depression-qualify-you-for-an-esa",
      "/blog/2026-hud-esa-guidelines",
      "/blog/emotional-support-animal-travel-anxiety",
    ],
  },
  {
    key: "depression-esa",
    slug: "can-depression-qualify-you-for-an-esa",
    file: "src/pages/blog-can-depression-qualify-you-for-an-esa/page.tsx",
    // §13C: HUD, travel, depression-PSD, anxiety-PSD
    links: [
      "/blog/2026-hud-esa-guidelines",
      "/blog/emotional-support-animal-travel-anxiety",
      "/blog/can-depression-qualify-psychiatric-service-dog",
      "/blog/can-anxiety-qualify-you-for-a-psd",
    ],
  },
];

// Existing articles that must link back into the new cluster (§13D, §13E).
const RECIPROCAL = [
  {
    key: "hud-guidelines",
    file: "src/pages/blog-2026-hud-esa-guidelines/page.tsx",
    links: [
      "/blog/can-depression-qualify-you-for-an-esa",
      "/blog/can-depression-qualify-psychiatric-service-dog",
      "/blog/can-anxiety-qualify-you-for-a-psd",
    ],
  },
  {
    key: "travel-anxiety",
    file: "src/pages/blog-emotional-support-animal-travel-anxiety/page.tsx",
    links: [
      "/blog/can-anxiety-qualify-you-for-a-psd",
      "/blog/can-depression-qualify-psychiatric-service-dog",
      "/blog/can-depression-qualify-you-for-an-esa",
    ],
  },
];

const BROKEN_PNG = "psd-depression-qualify";

// ── Forbidden claims / placeholders (scanned on comment-stripped source) ─────
// Each pattern must NOT appear in correct content. Tuned so the clean articles
// pass (their wording uses negations / different phrasing) but a reintroduced
// bad claim is caught. See selfTest() for the negative controls.
const FORBIDDEN = [
  { label: "placeholder domain yourdomain.com", re: /yourdomain\.com/i },
  { label: "placeholder publisher 'Your Site Name'", re: /Your Site Name/i },
  { label: "placeholder author 'Editorial Team'", re: /"?Editorial Team"?/ },
  { label: "duplicated 'activities activities'", re: /activities activities/i },
  { label: "broken infographic wording ('Harming kin')", re: /Harming kin/i },
  { label: "MedicalWebPage schema type", re: /"@type":\s*"MedicalWebPage"/ },
  { label: "fabricated reviewer (reviewedBy)", re: /reviewedBy/ },
  { label: "PSD letter creates service-dog status", re: /letter\s+itself\s+(?:legally\s+)?establishes[^.]{0,40}service[- ]?(?:dog|animal)\s+status/i },
  { label: "PSD letter grants public access", re: /letter\s+(?:creates|grants)[^.]{0,30}(?:ada\s+)?public[- ]?access/i },
  { label: "must carry PSD letter in public", re: /must\s+carry\s+(?:your\s+|a\s+)?(?:psd\s+)?letter\s+in\s+public/i },
  { label: "PSD documentation required in stores/restaurants", re: /(?:psd\s+letter|documentation)\s+is\s+required\s+(?:in|at)\s+(?:stores|restaurants|public)/i },
  { label: "all ESA federal housing rights repealed", re: /all\s+(?:esa|emotional support animal)[^.]{0,40}(?:federal\s+)?(?:housing\s+)?(?:rights|protections)[^.]{0,20}(?:repealed|ended|eliminated)/i },
  { label: "every landlord must accept every ESA", re: /every\s+landlord\s+must\s+(?:accept|approve)\s+every\s+esa/i },
  { label: "HUD guidance changed the FHA statute", re: /(?:hud|guidance)[^.]{0,40}(?:changed|amended|rewrote)[^.]{0,25}fair\s+housing\s+act\s+statute/i },
  { label: "every airline uses the same/identical form", re: /every\s+airline\s+(?:uses|requires)\s+(?:the\s+same|identical)/i },
  { label: "guaranteed approval promise", re: /guaranteed\s+approval/i },
  { label: "nationwide acceptance promise", re: /nationwide\s+(?:housing\s+)?acceptance/i },
  { label: "'official registration' language", re: /official\s+registration/i },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const pass = (m) => console.log(`  ✓ ${m}`);
function stripComments(src) {
  // Remove /* … */ (incl. JSX {/* … */}) and full-line // comments. Leaves
  // https:// inside string literals intact (those // are not at line start).
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}
const count = (src, re) => (src.match(re) || []).length;

/** Forbidden-claim scan on comment-stripped text → array of violation labels. */
function auditForbidden(rawSrc, where) {
  const src = stripComments(rawSrc);
  const out = [];
  for (const { label, re } of FORBIDDEN) if (re.test(src)) out.push(`${where}: forbidden — ${label}`);
  return out;
}

/** Structural + canonical + schema + disclaimer + dates + interlinks audit. */
function auditPage(entry, rawSrc) {
  const out = [];
  const src = rawSrc;
  const expectCanon = `${BASE}/blog/${entry.slug}`;
  // one H1
  if (count(src, /<h1[\s>]/g) !== 1) out.push(`${entry.key}: expected exactly one <h1> (found ${count(src, /<h1[\s>]/g)})`);
  // one JSON-LD graph
  if (count(src, /application\/ld\+json/g) !== 1) out.push(`${entry.key}: expected exactly one JSON-LD block`);
  if (!/"@graph"/.test(src)) out.push(`${entry.key}: JSON-LD must use a single @graph`);
  // schema entity types
  if (!/"@type":\s*"BlogPosting"/.test(src)) out.push(`${entry.key}: missing BlogPosting schema`);
  if (!/"@type":\s*"BreadcrumbList"/.test(src)) out.push(`${entry.key}: missing BreadcrumbList schema`);
  if (count(src, /"@type":\s*"FAQPage"/g) !== 1) out.push(`${entry.key}: expected exactly one FAQPage (no duplicate)`);
  if (/"@type":\s*"HowTo"/.test(src)) out.push(`${entry.key}: HowTo schema not permitted for this cluster`);
  // publisher must be the real PawTenant org
  if (!/publisher:\s*\{\s*"@type":\s*"Organization",\s*name:\s*"PawTenant"/.test(src.replace(/\s+/g, " ")))
    out.push(`${entry.key}: publisher must be Organization "PawTenant"`);
  // FAQ schema derived from same array the visible accordion renders
  if (!/faqs\.map\(\(f\)\s*=>\s*\(\{/.test(src) || !/faqs\.map\(\(f,\s*i\)\s*=>/.test(src))
    out.push(`${entry.key}: FAQ schema must be built from the same faqs[] the visible FAQ renders`);
  // non-www self canonical
  if (!src.includes(`const CANONICAL = "${expectCanon}"`)) out.push(`${entry.key}: CANONICAL must equal ${expectCanon}`);
  if (/www\.pawtenant\.com/.test(src)) out.push(`${entry.key}: must not reference www.pawtenant.com`);
  if (/pawtenant-test\.vercel\.app/.test(src)) out.push(`${entry.key}: must not reference the TEST vercel domain`);
  // disclaimer present
  if (!/not\s+legal\s+or\s+medical\s+advice/i.test(src)) out.push(`${entry.key}: missing legal/medical disclaimer`);
  // dates valid + not the source July-21 backdate
  if (!/datePublished:\s*"2026-07-22"/.test(src)) out.push(`${entry.key}: datePublished must be 2026-07-22`);
  if (!/dateModified:\s*"2026-07-22"/.test(src)) out.push(`${entry.key}: dateModified must be 2026-07-22`);
  if (/2026-07-21/.test(stripComments(src))) out.push(`${entry.key}: must not carry the July-21 source backdate`);
  // interlinks per cluster plan
  for (const link of entry.links)
    if (!src.includes(`to="${link}"`)) out.push(`${entry.key}: missing cluster link to ${link}`);
  return out;
}

/** Reciprocal links from an existing article into the new cluster. */
function auditReciprocal(entry, src) {
  const out = [];
  for (const link of entry.links)
    if (!src.includes(`to="${link}"`)) out.push(`${entry.key}: missing reciprocal link to ${link}`);
  return out;
}

/** Every new slug present in the XML sitemap as a non-www loc. */
function auditSitemap(xml) {
  const out = [];
  for (const e of NEW) {
    if (!xml.includes(`<loc>${BASE}/blog/${e.slug}</loc>`)) out.push(`sitemap: missing <loc> for ${e.slug}`);
    if (xml.includes(`<loc>https://www.pawtenant.com/blog/${e.slug}</loc>`)) out.push(`sitemap: ${e.slug} uses www host`);
  }
  return out;
}

/** Every new slug registered in CORE_PAGE_META with title + description. */
function auditSeoConfig(src) {
  const out = [];
  for (const e of NEW) {
    const re = new RegExp(`"/blog/${e.slug.replace(/[-/]/g, "\\$&")}":\\s*\\{[\\s\\S]*?title:[\\s\\S]*?description:`);
    if (!re.test(src)) out.push(`seoConfig: missing CORE_PAGE_META entry (title+description) for /blog/${e.slug}`);
  }
  return out;
}

/** Broken PNG must not be referenced by any public article code/metadata. */
function auditNoPngRef(named) {
  const out = [];
  for (const [where, src] of named)
    if (src.includes(BROKEN_PNG)) out.push(`${where}: references the broken infographic PNG (${BROKEN_PNG})`);
  return out;
}

async function walk(dir) {
  const abs = resolve(ROOT, dir);
  let entries = [];
  try { entries = await readdir(abs, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

// ── main run ─────────────────────────────────────────────────────────────────
async function run() {
  console.log("[check-psd-esa-condition-cluster] verifying the PSD/ESA condition cluster\n");
  const failures = [];
  const add = (arr) => { for (const v of arr) { failures.push(v); console.error(`  ✗ ${v}`); } };

  // 1) new pages exist + structural/schema/canonical/disclaimer/dates/interlinks
  const pageSrc = {};
  for (const e of NEW) {
    if (!(await exists(e.file))) { failures.push(`${e.key}: page file missing (${e.file})`); console.error(`  ✗ ${e.key}: page file missing`); continue; }
    const src = await rd(e.file);
    pageSrc[e.key] = src;
    add(auditPage(e, src));
    add(auditForbidden(src, e.key));
  }
  if (Object.keys(pageSrc).length === NEW.length) pass("all 3 article pages exist and passed structure/schema/canonical/date/interlink/forbidden checks");

  // 2) infographic component present + clean + broken PNG not committed anywhere in public/
  const infoPath = "src/components/feature/PsdTaskInfographic.tsx";
  if (!(await exists(infoPath))) { failures.push("infographic component missing (PsdTaskInfographic.tsx)"); console.error("  ✗ infographic component missing"); }
  else { add(auditForbidden(await rd(infoPath), "infographic")); pass("infographic component present and clean (no baked-in image, no broken wording)"); }

  const publicFiles = await walk("public");
  const strayPng = publicFiles.filter((p) => p.toLowerCase().includes(BROKEN_PNG));
  if (strayPng.length) add(strayPng.map((p) => `broken PNG committed to public/: ${p}`));
  else pass("broken PNG (psd-depression-qualify.png) not committed to public/");

  // 3) reciprocal links from the two existing articles
  for (const e of RECIPROCAL) {
    if (!(await exists(e.file))) { failures.push(`${e.key}: existing article missing`); continue; }
    add(auditReciprocal(e, await rd(e.file)));
  }
  pass("reciprocal links from the HUD + travel-anxiety articles verified");

  // 4) discovery surfaces: sitemap + seoConfig + no PNG reference in public metadata
  const sitemap = await rd("public/sitemap.xml");
  add(auditSitemap(sitemap));
  add(auditSeoConfig(await rd("src/config/seoConfig.ts")));
  const llms = await rd("public/llms.txt");
  add(auditNoPngRef([
    ["sitemap.xml", sitemap],
    ["llms.txt", llms],
    ["seoConfig.ts", await rd("src/config/seoConfig.ts")],
    ...NEW.map((e) => [`${e.key} page`, pageSrc[e.key] || ""]),
  ]));
  pass("sitemap + CORE_PAGE_META registration verified; broken PNG not referenced in public metadata");

  if (failures.length) {
    console.error(`\n[check-psd-esa-condition-cluster] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("\n[check-psd-esa-condition-cluster] PASSED — PSD/ESA condition cluster is consistent and integrated.");
}

// ── self-test: negative controls (prove each audit fires on bad input) ───────
async function selfTest() {
  console.log("[check-psd-esa-condition-cluster] SELF-TEST — negative controls\n");
  const failures = [];
  const ctl = (label, cond) => (cond ? console.log(`  ✓ ${label}`) : (failures.push(label), console.error(`  ✗ ${label}`)));

  // Baseline: the real repo passes clean.
  const anx = await rd(NEW[0].file);
  ctl("baseline: real anxiety-PSD page passes structure+forbidden", auditPage(NEW[0], anx).length === 0 && auditForbidden(anx, "x").length === 0);
  const realSitemap = await rd("public/sitemap.xml");
  ctl("baseline: real sitemap passes", auditSitemap(realSitemap).length === 0);
  ctl("baseline: real seoConfig passes", auditSeoConfig(await rd("src/config/seoConfig.ts")).length === 0);

  // Forbidden-claim controls.
  ctl("NC: yourdomain.com detected", auditForbidden("canonical https://www.yourdomain.com/x", "x").length > 0);
  ctl("NC: 'Your Site Name' detected", auditForbidden('publisher name "Your Site Name"', "x").length > 0);
  ctl("NC: 'Editorial Team' author detected", auditForbidden('author name "Editorial Team"', "x").length > 0);
  ctl("NC: 'activities activities' detected", auditForbidden("prompt activities activities daily", "x").length > 0);
  ctl("NC: broken 'Harming kin' wording detected", auditForbidden("Harming kin meditins", "x").length > 0);
  ctl("NC: MedicalWebPage schema detected", auditForbidden('{ "@type": "MedicalWebPage" }', "x").length > 0);
  ctl("NC: fabricated reviewer detected", auditForbidden('"reviewedBy": { "@type": "Person", "name": "Dr. Fake" }', "x").length > 0);
  ctl("NC: 'letter itself establishes service-dog status' detected", auditForbidden("a PSD letter itself legally establishes service-dog status", "x").length > 0);
  ctl("NC: 'letter grants public access' detected", auditForbidden("the letter grants ADA public-access rights", "x").length > 0);
  ctl("NC: 'must carry letter in public' detected", auditForbidden("you must carry your PSD letter in public", "x").length > 0);
  ctl("NC: 'documentation required in stores' detected", auditForbidden("a PSD letter is required in stores and restaurants", "x").length > 0);
  ctl("NC: 'all ESA housing rights repealed' detected", auditForbidden("all ESA federal housing rights were repealed", "x").length > 0);
  ctl("NC: 'every landlord must accept every ESA' detected", auditForbidden("every landlord must accept every ESA letter", "x").length > 0);
  ctl("NC: 'HUD changed the FHA statute' detected", auditForbidden("the guidance changed the Fair Housing Act statute", "x").length > 0);
  ctl("NC: 'every airline uses the same form' detected", auditForbidden("every airline uses the same form", "x").length > 0);
  ctl("NC: 'guaranteed approval' detected", auditForbidden("we offer guaranteed approval for housing", "x").length > 0);
  ctl("NC: comment-only mention does NOT trip forbidden scan", auditForbidden("// avoids the 'every airline uses the same form' claim", "x").length === 0);

  // Structural controls (mutate the real page).
  ctl("NC: homepage canonical detected", auditPage(NEW[0], anx.replace(`const CANONICAL = "${BASE}/blog/${NEW[0].slug}"`, `const CANONICAL = "${BASE}/"`)).some((v) => /CANONICAL/.test(v)));
  ctl("NC: www canonical detected", auditPage(NEW[0], anx.replace(`${BASE}/blog/${NEW[0].slug}`, `https://www.pawtenant.com/blog/${NEW[0].slug}`)).length > 0);
  ctl("NC: duplicate FAQPage detected", auditPage(NEW[0], anx.replace(`"@type": "FAQPage"`, `"@type": "FAQPage" }, { "@type": "FAQPage"`)).some((v) => /FAQPage/.test(v)));
  ctl("NC: HowTo schema detected", auditPage(NEW[0], anx.replace(`"@type": "FAQPage"`, `"@type": "HowTo" }, { "@type": "FAQPage"`)).some((v) => /HowTo/.test(v)));
  ctl("NC: missing disclaimer detected", auditPage(NEW[0], anx.replace(/not\s+legal\s+or\s+medical\s+advice/i, "informational")).some((v) => /disclaimer/.test(v)));
  ctl("NC: missing cluster interlink detected", auditPage(NEW[0], anx.split(`to="/blog/2026-hud-esa-guidelines"`).join('to="/x"')).some((v) => /2026-hud-esa-guidelines/.test(v)));
  ctl("NC: July-21 backdate detected", auditPage(NEW[0], anx.replace(/datePublished:\s*"2026-07-22"/, 'datePublished: "2026-07-21"')).length > 0);

  // Reciprocal / sitemap / seoConfig / PNG controls.
  ctl("NC: missing reciprocal link detected", auditReciprocal(RECIPROCAL[0], "no links here").length > 0);
  ctl("NC: sitemap missing new slug detected", auditSitemap(realSitemap.split(`<loc>${BASE}/blog/${NEW[0].slug}</loc>`).join("<loc>x</loc>")).length > 0);
  ctl("NC: seoConfig missing entry detected", auditSeoConfig("export const CORE_PAGE_META = {}").length > 0);
  ctl("NC: broken PNG reference detected", auditNoPngRef([["x", `image "/assets/psd/${BROKEN_PNG}.png"`]]).length > 0);

  if (failures.length) {
    console.error(`\n[check-psd-esa-condition-cluster] SELF-TEST FAILED — ${failures.length} control(s) did not behave as expected.`);
    process.exit(1);
  }
  console.log("\n[check-psd-esa-condition-cluster] SELF-TEST PASSED — all negative controls fire; baseline clean.");
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isMain) {
  const p = process.argv.includes("--self-test") ? selfTest() : run();
  p.catch((err) => { console.error("[check-psd-esa-condition-cluster] fatal:", err); process.exit(1); });
}
