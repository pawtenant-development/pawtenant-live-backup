// scripts/check-state-canonical-redirects.mjs
//
// SEO-STATE-CANONICAL-REDIRECT-BATCH-001
//
// Deterministic, BLOCKING guard for state-page canonicals + PSD legacy flat
// redirects. Runs in `npm run build` AFTER the prerender step (so out/ exists)
// and exits non-zero on any violation. Read-only — never writes files.
//
// It proves, from the current repo (not from memory):
//
//   1. Every supported canonical state route (ESA /esa-letter/<state>, PSD
//      /psd-letter/<state>, state blog /blog/state/<state>) has a prerendered
//      file whose raw <head> carries exactly ONE self-referencing, non-www
//      canonical — never the homepage, never another state, never a TEST/Vercel
//      host — and is not noindex.
//   2. Every confirmed legacy FLAT PSD route (/psd-letter-<state>, 10) has a
//      one-hop permanent (308) redirect straight to /psd-letter/<state>, and is
//      absent from both the XML and HTML sitemaps.
//   3. Every redirect target is a registered, indexable route with a correct
//      self-canonical (no two-hop chains, no missing targets).
//   4. The XML sitemap contains the canonical ESA state routes, excludes every
//      flat/legacy alias, and has no duplicate normalized URLs.
//   5. The HTML sitemap links to canonical state routes only.
//   6. No internal <Link to>/<a href> points at a confirmed legacy flat-state URL.
//   7. Invalid state slugs are NOT silently redirected to the homepage and stay
//      404/noindex (route-status classifier returns notfound).
//   8. Every canonical/redirect URL uses https://pawtenant.com (never www, never
//      a TEST/Vercel domain).
//
// Run:
//   node scripts/check-state-canonical-redirects.mjs              → blocking report
//   node scripts/check-state-canonical-redirects.mjs --self-test  → negative controls
//
// The build invokes the blocking form. The self-test mutates only in-memory
// copies of each source and asserts each check fires, then confirms the real
// repo passes clean — no file is ever written.

import { readFile, access, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const BASE = "https://pawtenant.com";

// The 10 legacy flat PSD states that MUST 308 → /psd-letter/<state>. Kept here as
// the authoritative expectation so the guard also catches a redirect silently
// dropped from vercel.json (negative control: "legacy route removed"). Mirrors
// PSD_STATE_SLUGS in src/router/config.tsx.
const EXPECTED_FLAT_PSD_STATES = [
  "arizona", "california", "florida", "georgia", "illinois", "new-york",
  "north-carolina", "ohio", "pennsylvania", "texas",
];

// Core (non-state) pages that legitimately begin with /esa-letter- or /psd-letter-
// and must NOT be mistaken for a flat state alias in sitemap checks.
const NON_STATE_LETTER_PATHS = new Set([
  "/esa-letter-cost", "/esa-letter-housing", "/esa-letter-for-apartments",
  "/esa-letter-for-landlord", "/esa-letter-vs-pet-policy",
  "/esa-letter-verification", "/esa-letter-verification-id",
  "/psd-letter-cost", "/psd-letter-for-apartments", "/psd-letter-requirements",
]);

// ── tiny reporter ────────────────────────────────────────────────────────────
const V = [];
const add = (m) => V.push(m);
const okline = (m) => console.log(`  ✓ ${m}`);

// ── generic helpers ──────────────────────────────────────────────────────────
async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}
const canonRoute = (p) => `${BASE}${p === "/" ? "/" : p}`;
const stripSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

function extractCanonicals(html) {
  return [...html.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/gi)]
    .map((m) => m[1]);
}
function extractRobots(html) {
  const m = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i);
  return m ? m[1] : "";
}

// ── PURE audit #1: one prerendered state route's <head> canonical ────────────
// Returns violation strings (empty = clean). Self-referencing, single, non-www,
// non-homepage, non-TEST-host, indexable.
function auditCanonicalHtml(routePath, html) {
  const out = [];
  const cs = extractCanonicals(html);
  if (cs.length === 0) { out.push(`${routePath}: no <link rel="canonical"> in raw HTML`); return out; }
  if (cs.length > 1) out.push(`${routePath}: ${cs.length} canonical tags (must be exactly one)`);
  const c = cs[0];
  const expected = canonRoute(routePath);
  if (/^https?:\/\/www\./i.test(c)) out.push(`${routePath}: canonical uses www — "${c}"`);
  if (/pawtenant-test|vercel\.app|localhost/i.test(c)) out.push(`${routePath}: canonical uses a TEST/Vercel/localhost host — "${c}"`);
  if (!c.startsWith(BASE)) out.push(`${routePath}: canonical not on ${BASE} — "${c}"`);
  if (c === `${BASE}/` || c === BASE) out.push(`${routePath}: canonical is the HOMEPAGE (leak) — "${c}"`);
  if (stripSlash(c) !== stripSlash(expected)) out.push(`${routePath}: canonical "${c}" is not self-referencing (expected "${expected}")`);
  const robots = extractRobots(html);
  if (/noindex/i.test(robots)) out.push(`${routePath}: robots is noindex (supported state route must be indexable) — "${robots}"`);
  return out;
}

// ── PURE audit #2/#3: vercel.json redirects for flat PSD legacy routes ───────
// redirects = parsed vercel.json .redirects array. Verifies each expected flat
// PSD state has a permanent one-hop redirect to a registered nested route.
function auditVercelRedirects(redirects, { psdNestedStates, expectedFlatPsd }) {
  const out = [];
  const sources = new Set(redirects.map((r) => stripSlash(r.source)));
  const bySource = new Map();
  for (const r of redirects) bySource.set(stripSlash(r.source), r);

  for (const s of expectedFlatPsd) {
    const src = `/psd-letter-${s}`;
    const dest = `/psd-letter/${s}`;
    const r = bySource.get(src);
    if (!r) { out.push(`flat PSD redirect MISSING: ${src} → ${dest}`); continue; }
    if (r.permanent !== true) out.push(`${src}: redirect must be permanent (308) — got permanent=${r.permanent}`);
    if (stripSlash(r.destination) !== dest) out.push(`${src}: destination "${r.destination}" (expected "${dest}")`);
    // one-hop: the destination must not itself be a redirect source (no chain)
    if (sources.has(stripSlash(r.destination))) out.push(`${src}: target ${r.destination} is itself redirected (two-hop chain)`);
    // target must be a registered, valid nested route
    const targetState = dest.split("/")[2];
    if (!psdNestedStates.includes(targetState)) out.push(`${src}: redirect target ${dest} is not a registered PSD route`);
    // target must not be the homepage
    if (stripSlash(r.destination) === "" || r.destination === "/") out.push(`${src}: redirect points at the homepage`);
  }
  return out;
}

// ── PURE audit: no state-pattern source redirects to the homepage ────────────
function auditInvalidStateRedirects(redirects) {
  const out = [];
  const stateSrc = /^\/(esa-letter|psd-letter)-[a-z-]+$|^\/(esa-letter|psd-letter)\/[a-z-]+$|^\/blog\/state\/[a-z-]+$/;
  for (const r of redirects) {
    const src = stripSlash(r.source);
    if (stateSrc.test(src) && (r.destination === "/" || stripSlash(r.destination) === "")) {
      out.push(`state route ${r.source} redirects to the HOMEPAGE (must go to its canonical state page)`);
    }
  }
  return out;
}

// ── PURE audit #4: XML sitemap ───────────────────────────────────────────────
function auditXmlSitemap(xml, { esaStates, flatEsaStates, flatPsdStates }) {
  const out = [];
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  // 4a. canonical ESA state routes present
  for (const s of esaStates) {
    if (!locs.includes(`${BASE}/esa-letter/${s}`)) out.push(`XML sitemap missing canonical ESA route ${BASE}/esa-letter/${s}`);
  }
  // 4b. no flat/legacy state aliases (guard against the real core /esa-letter-cost etc.)
  const forbidden = new Set([
    ...flatEsaStates.map((s) => `/esa-letter-${s}`),
    ...flatPsdStates.map((s) => `/psd-letter-${s}`),
  ]);
  for (const loc of locs) {
    let path;
    try { path = new URL(loc).pathname; } catch { path = loc.replace(BASE, ""); }
    path = stripSlash(path);
    if (forbidden.has(path) && !NON_STATE_LETTER_PATHS.has(path)) {
      out.push(`XML sitemap contains a FLAT/legacy state alias: ${loc}`);
    }
  }
  // 4c. no duplicate normalized URLs
  const seen = new Set();
  for (const loc of locs) {
    const norm = stripSlash(loc).toLowerCase();
    if (seen.has(norm)) out.push(`XML sitemap has a duplicate URL: ${loc}`);
    seen.add(norm);
  }
  return out;
}

// ── PURE audit #5: HTML sitemap links canonical state routes only ────────────
function auditHtmlSitemap(src, { flatEsaStates, flatPsdStates }) {
  const out = [];
  const hrefs = [...src.matchAll(/href:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const forbidden = new Set([
    ...flatEsaStates.map((s) => `/esa-letter-${s}`),
    ...flatPsdStates.map((s) => `/psd-letter-${s}`),
  ]);
  for (const h of hrefs) {
    const path = stripSlash(h.split("#")[0].split("?")[0]);
    if (forbidden.has(path) && !NON_STATE_LETTER_PATHS.has(path)) {
      out.push(`HTML sitemap links to a FLAT/legacy state alias: ${h}`);
    }
  }
  return out;
}

// ── PURE audit #6: no internal link uses a legacy flat-state URL ──────────────
// files: Map<relPath, text>. forbidden: array of legacy flat-state paths.
function findLegacyInternalLinks(files, forbidden) {
  const out = [];
  for (const [rel, text] of files) {
    for (const p of forbidden) {
      // Match an actual navigation link (to=/href=), not a route definition.
      const re = new RegExp(`(?:to|href)=["']${p.replace(/[/.]/g, "\\$&")}(?:["'/?#])`);
      if (re.test(text)) out.push(`${rel}: internal link points at legacy flat-state URL ${p}`);
    }
  }
  return out;
}

// ── source loading ───────────────────────────────────────────────────────────
async function walkSrcFiles() {
  // Read link-bearing source, skipping route definitions + generated manifests.
  const SKIP = new Set(["node_modules", "generated"]);
  const SKIP_FILES = new Set(["config.tsx"]); // router route defs (paths, not links)
  const files = new Map();
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (SKIP.has(ent.name)) continue;
        await walk(join(dir, ent.name));
      } else if (/\.(tsx|ts)$/.test(ent.name) && !SKIP_FILES.has(ent.name)) {
        const full = join(dir, ent.name);
        files.set(full.slice(ROOT.length + 1).replace(/\\/g, "/"), await readFile(full, "utf8"));
      }
    }
  }
  await walk(join(ROOT, "src"));
  return files;
}

async function loadSources() {
  const manifest = await jiti.import(resolve(ROOT, "src/generated/routeManifest.ts"));
  const { classifyRoute } = await jiti.import(resolve(ROOT, "src/lib/routeStatus.ts"));
  const vercel = JSON.parse(await readFile(resolve(ROOT, "vercel.json"), "utf8"));
  const xmlSitemap = await readFile(resolve(ROOT, "public/sitemap.xml"), "utf8");
  const htmlSitemap = await readFile(resolve(ROOT, "src/pages/sitemap/page.tsx"), "utf8");
  return {
    esaStates: [...manifest.ESA_STATES],
    psdNestedStates: [...manifest.PSD_STATES],
    blogStateStates: [...manifest.BLOG_STATE_SLUGS],
    redirects: vercel.redirects || [],
    xmlSitemap,
    htmlSitemap,
    classifyRoute,
  };
}

// ── blocking run ─────────────────────────────────────────────────────────────
async function run() {
  console.log("[check-state-canonical-redirects] state canonical + PSD legacy redirect guard\n");
  const s = await loadSources();
  const flatEsaStates = s.esaStates;
  const flatPsdStates = EXPECTED_FLAT_PSD_STATES;

  // 1 + 3. Prerendered canonical for every supported state route (needs out/).
  if (await exists(join(OUT_DIR, "index.html"))) {
    const routes = [
      ...s.esaStates.map((x) => `/esa-letter/${x}`),
      ...s.psdNestedStates.map((x) => `/psd-letter/${x}`),
      ...s.blogStateStates.map((x) => `/blog/state/${x}`),
    ];
    let checked = 0;
    for (const rp of routes) {
      const file = join(OUT_DIR, rp.replace(/^\//, ""), "index.html");
      if (!(await exists(file))) { add(`${rp}: prerendered file missing (${rp}/index.html)`); continue; }
      const html = await readFile(file, "utf8");
      auditCanonicalHtml(rp, html).forEach(add);
      checked++;
    }
    okline(`prerendered self-canonical audited for ${checked}/${routes.length} state routes`);
  } else {
    console.log("  • out/ not built — prerendered-canonical checks skipped (run in `npm run build`).");
  }

  // 2. Flat PSD legacy redirects (one-hop, permanent, correct registered target).
  auditVercelRedirects(s.redirects, { psdNestedStates: s.psdNestedStates, expectedFlatPsd: flatPsdStates }).forEach(add);
  okline(`vercel.json flat-PSD redirects audited (${flatPsdStates.length} expected)`);

  // 2b + 7. No state route redirects to the homepage.
  auditInvalidStateRedirects(s.redirects).forEach(add);

  // 4. XML sitemap.
  auditXmlSitemap(s.xmlSitemap, { esaStates: s.esaStates, flatEsaStates, flatPsdStates }).forEach(add);
  okline("XML sitemap audited (canonical present, no aliases, no dupes)");

  // 5. HTML sitemap.
  auditHtmlSitemap(s.htmlSitemap, { flatEsaStates, flatPsdStates }).forEach(add);
  okline("HTML sitemap audited (canonical state links only)");

  // 6. Internal links.
  const forbidden = [
    ...flatEsaStates.map((x) => `/esa-letter-${x}`),
    ...flatPsdStates.map((x) => `/psd-letter-${x}`),
  ];
  findLegacyInternalLinks(await walkSrcFiles(), forbidden).forEach(add);
  okline("internal links audited (no legacy flat-state links)");

  // 7. Invalid state slugs stay 404 (classifier), redirect targets stay valid.
  const fake = "zznotarealstate";
  for (const pat of [`/esa-letter/${fake}`, `/psd-letter/${fake}`, `/blog/state/${fake}`]) {
    const c = s.classifyRoute(pat);
    if (c !== "notfound") add(`${pat}: classifier returns "${c}" (invalid state must be notfound, not silently 200/homepage)`);
  }
  for (const st of flatPsdStates) {
    const c = s.classifyRoute(`/psd-letter/${st}`);
    if (c !== "valid") add(`/psd-letter/${st}: redirect target classifies "${c}" (must be valid/indexable)`);
  }
  okline("route-status classifier audited (invalid → notfound, targets → valid)");

  return finish("PASSED — state canonicals + PSD legacy redirects verified.");
}

function finish(okMsg) {
  console.log("");
  if (V.length) {
    console.error(`[check-state-canonical-redirects] FAILED — ${V.length} violation(s):`);
    for (const m of V) console.error(`  ✗ ${m}`);
    process.exit(1);
  }
  console.log(`[check-state-canonical-redirects] ${okMsg}`);
}

// ── self-test / negative controls ────────────────────────────────────────────
function assert(cond, label, failures) {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures.push(label); console.error(`  ✗ ${label}`); }
}

async function selfTest() {
  console.log("[check-state-canonical-redirects] SELF-TEST — negative controls\n");
  const s = await loadSources();
  const failures = [];
  const flatPsd = EXPECTED_FLAT_PSD_STATES;
  const flatEsa = s.esaStates;

  // Baseline: real repo must pass every pure audit clean.
  const goodHtml = `<head><link rel="canonical" href="${BASE}/esa-letter/california" /><meta name="robots" content="index, follow" /></head>`;
  assert(auditCanonicalHtml("/esa-letter/california", goodHtml).length === 0, "baseline: good state canonical passes", failures);
  assert(auditVercelRedirects(s.redirects, { psdNestedStates: s.psdNestedStates, expectedFlatPsd: flatPsd }).length === 0, "baseline: real vercel.json flat-PSD redirects pass", failures);
  assert(auditInvalidStateRedirects(s.redirects).length === 0, "baseline: no state→homepage redirect", failures);
  assert(auditXmlSitemap(s.xmlSitemap, { esaStates: s.esaStates, flatEsaStates: flatEsa, flatPsdStates: flatPsd }).length === 0, "baseline: real XML sitemap passes", failures);
  assert(auditHtmlSitemap(s.htmlSitemap, { flatEsaStates: flatEsa, flatPsdStates: flatPsd }).length === 0, "baseline: real HTML sitemap passes", failures);

  // NC1: state canonical changed to "/".
  assert(auditCanonicalHtml("/esa-letter/california", goodHtml.replace(`${BASE}/esa-letter/california`, `${BASE}/`)).length > 0,
    "NC1: canonical → homepage is detected", failures);
  // NC2: canonical changed to www.
  assert(auditCanonicalHtml("/esa-letter/california", goodHtml.replace(`${BASE}/esa-letter/california`, "https://www.pawtenant.com/esa-letter/california")).length > 0,
    "NC2: www canonical is detected", failures);
  // NC2b: canonical → another state.
  assert(auditCanonicalHtml("/esa-letter/california", goodHtml.replace("/esa-letter/california", "/esa-letter/texas")).length > 0,
    "NC2b: canonical → another state is detected", failures);
  // NC3: legacy redirect removed from the map.
  const dropped = s.redirects.filter((r) => stripSlash(r.source) !== "/psd-letter-texas");
  assert(auditVercelRedirects(dropped, { psdNestedStates: s.psdNestedStates, expectedFlatPsd: flatPsd }).length > 0,
    "NC3: removed flat-PSD redirect is detected", failures);
  // NC4: redirect turned into a two-hop chain.
  const chained = [...s.redirects, { source: "/psd-letter/california", destination: "/somewhere-else", permanent: true }];
  assert(auditVercelRedirects(chained, { psdNestedStates: s.psdNestedStates, expectedFlatPsd: flatPsd }).length > 0,
    "NC4: two-hop redirect chain is detected", failures);
  // NC5: alias inserted into the XML sitemap.
  const badXml = s.xmlSitemap.replace("</urlset>", `<url><loc>${BASE}/psd-letter-california</loc></url></urlset>`);
  assert(auditXmlSitemap(badXml, { esaStates: s.esaStates, flatEsaStates: flatEsa, flatPsdStates: flatPsd }).length > 0,
    "NC5: flat alias in XML sitemap is detected", failures);
  // NC6: redirect target changed to a missing route.
  const badTarget = s.redirects.map((r) =>
    stripSlash(r.source) === "/psd-letter-texas" ? { ...r, destination: "/psd-letter/atlantis" } : r);
  assert(auditVercelRedirects(badTarget, { psdNestedStates: s.psdNestedStates, expectedFlatPsd: flatPsd }).length > 0,
    "NC6: redirect to a missing route is detected", failures);
  // NC7: internal link reverted to a legacy URL.
  const badFiles = new Map([["src/pages/fake/page.tsx", `<a href="/psd-letter-california">x</a>`]]);
  assert(findLegacyInternalLinks(badFiles, flatPsd.map((x) => `/psd-letter-${x}`)).length > 0,
    "NC7: internal legacy flat-state link is detected", failures);
  // NC8: invalid/state route redirected to the homepage.
  const toHome = [...s.redirects, { source: "/psd-letter-california", destination: "/", permanent: true }];
  assert(auditInvalidStateRedirects(toHome).length > 0,
    "NC8: state route → homepage redirect is detected", failures);

  console.log("");
  if (failures.length) {
    console.error(`[check-state-canonical-redirects] SELF-TEST FAILED — ${failures.length} control(s) did not behave as expected.`);
    process.exit(1);
  }
  console.log("[check-state-canonical-redirects] SELF-TEST PASSED — all negative controls fire; baseline clean.");
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isMain) {
  const p = process.argv.includes("--self-test") ? selfTest() : run();
  p.catch((err) => {
    console.error("[check-state-canonical-redirects] fatal:", err);
    process.exit(1);
  });
}
