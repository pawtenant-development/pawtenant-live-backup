// scripts/check-breadcrumb-structured-data.mjs
// SEO-BREADCRUMB-MISSING-ITEM-AUDIT-AND-TEST-FIX-001
//
// Blocking guard for BreadcrumbList structured data. Roots out the GSC
// "Missing field 'item' (in 'itemListElement')" class of defect and prevents
// regressions. Validates breadcrumbs THREE ways:
//   A) builder fixtures — executes the shared builders (providerJsonLd.ts,
//      seoSchema.ts) via jiti and validates their BreadcrumbList output;
//   B) generated raw HTML — parses every out/**/index.html, finds every
//      BreadcrumbList entity, validates it, flags duplicates, and confirms the
//      final item's URL matches the page canonical (this is where Google reads
//      the provider schema);
//   C) source scan — every src file that emits an inline literal BreadcrumbList
//      (blog articles, condition cluster, blog-state, etc.) must give each
//      ListItem an item + name + position.
// Plus: the 404 / 410 responses must not carry breadcrumb schema.
//
// Contract enforced per ListItem: @type ListItem, numeric sequential unique
// position from 1, nonempty name, and a nonempty absolute item on the
// production non-www host (never www / vercel-preview / localhost / relative).
// item is required on EVERY item including the last — a site-wide consistency
// policy (Google allows item on the final crumb; when set it must equal the
// page's own canonical URL). ItemList (which uses `url`, not `item`) is NOT a
// breadcrumb and is intentionally out of scope.
//
// Exit 1 on any violation. `--self-test` runs negative controls. Wired into build.

import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://pawtenant.com";
const OUT = resolve(ROOT, "out");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const exists = (p) => access(resolve(ROOT, p)).then(() => true).catch(() => false);
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const isBreadcrumb = (n) =>
  n && (n["@type"] === "BreadcrumbList" || (Array.isArray(n["@type"]) && n["@type"].includes("BreadcrumbList")));

// ── Core contract: validate one parsed BreadcrumbList object ─────────────────
function auditBreadcrumb(bc, ctx, expectedCanonical) {
  const out = [];
  const items = bc.itemListElement;
  if (!Array.isArray(items) || items.length === 0) {
    out.push(`${ctx}: BreadcrumbList.itemListElement missing or empty`);
    return out;
  }
  const positions = [];
  items.forEach((li, i) => {
    const at = `${ctx} item#${i + 1}`;
    if (li["@type"] !== "ListItem") out.push(`${at}: @type must be "ListItem"`);
    if (typeof li.position !== "number") out.push(`${at}: position must be a number`);
    else positions.push(li.position);
    if (typeof li.name !== "string" || !li.name.trim()) out.push(`${at}: missing/empty name`);
    // item may be a URL string or a Thing with @id/url
    let url = li.item;
    if (url && typeof url === "object") url = url["@id"] || url.url;
    if (url === undefined || url === null || url === "") out.push(`${at}: missing field "item"`);
    else if (typeof url !== "string") out.push(`${at}: item must be a URL`);
    else {
      if (!/^https?:\/\//i.test(url)) out.push(`${at}: item must be an absolute URL (got "${url}")`);
      else {
        if (/\/\/www\.pawtenant\.com/i.test(url)) out.push(`${at}: item uses the www host`);
        if (/vercel\.app|localhost|127\.0\.0\.1|pawtenant-test/i.test(url)) out.push(`${at}: item uses a non-production host (${url})`);
        if (!url.startsWith(BASE)) out.push(`${at}: item not on ${BASE} (${url})`);
      }
    }
  });
  if (positions.length) {
    if (new Set(positions).size !== positions.length) out.push(`${ctx}: duplicate positions`);
    const sorted = [...positions].sort((a, b) => a - b);
    if (sorted.some((p, i) => p !== i + 1)) out.push(`${ctx}: positions must be sequential from 1`);
  }
  // final crumb should point at the page canonical, when known
  if (expectedCanonical) {
    const last = items[items.length - 1];
    let lastUrl = last && last.item;
    if (lastUrl && typeof lastUrl === "object") lastUrl = lastUrl["@id"] || lastUrl.url;
    if (lastUrl && lastUrl.replace(/\/$/, "") !== expectedCanonical.replace(/\/$/, ""))
      out.push(`${ctx}: final breadcrumb item (${lastUrl}) != page canonical (${expectedCanonical})`);
  }
  return out;
}

// ── Parse breadcrumbs out of rendered HTML ───────────────────────────────────
function nodesOf(data) {
  const nodes = [];
  for (const d of Array.isArray(data) ? data : [data]) {
    if (d && Array.isArray(d["@graph"])) nodes.push(...d["@graph"]);
    else if (d) nodes.push(d);
  }
  return nodes;
}
function breadcrumbsFromHtml(html) {
  const found = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const n of nodesOf(data)) if (isBreadcrumb(n)) found.push(n);
  }
  return found;
}
const canonicalOf = (html) => {
  const m = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
  return m ? m[1] : null;
};

// ── Source scan: literal inline BreadcrumbList arrays ────────────────────────
function balancedArray(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") { depth--; if (depth === 0) return s.slice(openIdx, i + 1); }
  }
  return null;
}
function auditSourceBreadcrumbs(src, file) {
  const out = [];
  const re = /BreadcrumbList/g;
  let m;
  while ((m = re.exec(src))) {
    const window = src.slice(m.index, m.index + 4000);
    const ile = window.match(/itemListElement"?\s*:\s*\[/);
    if (!ile) continue; // e.g. itemListElement built via .map() — covered by builder fixtures
    const openIdx = m.index + ile.index + ile[0].length - 1;
    const arr = balancedArray(src, openIdx);
    if (!arr) continue;
    // Split the array on each ListItem marker; each part spans exactly one
    // ListItem's fields (up to the next ListItem, or the array end for the last).
    // We check the WHOLE part — NOT up to the first "}" — because a `name` may be
    // a template literal like `${state.name} …` whose ${…} contains a brace.
    const parts = arr.split(/@type"?\s*:\s*"ListItem"/).slice(1);
    if (!parts.length) continue;
    parts.forEach((obj, i) => {
      if (!/\bitem"?\s*:/.test(obj)) out.push(`${file}: inline BreadcrumbList ListItem #${i + 1} missing "item"`);
      if (!/\bname"?\s*:/.test(obj)) out.push(`${file}: inline BreadcrumbList ListItem #${i + 1} missing "name"`);
      if (!/\bposition"?\s*:/.test(obj)) out.push(`${file}: inline BreadcrumbList ListItem #${i + 1} missing "position"`);
    });
  }
  return out;
}

async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log("[check-breadcrumb-structured-data] validating BreadcrumbList schema\n");
  const failures = [];
  const pass = (m) => console.log(`  ✓ ${m}`);
  const add = (arr) => { for (const v of arr) { failures.push(v); console.error(`  ✗ ${v}`); } };

  // A) Builder fixtures ------------------------------------------------------
  const pj = await jiti.import(resolve(ROOT, "src/lib/providerJsonLd.ts"));
  const providers = (await jiti.import(resolve(ROOT, "src/data/publicProviders.ts"))).PUBLIC_PROVIDERS;
  const seo = await jiti.import(resolve(ROOT, "src/lib/seoSchema.ts"));

  const profileGraph = pj.buildProviderJsonLd(providers[0]);
  const profBc = profileGraph["@graph"].find(isBreadcrumb);
  add(auditBreadcrumb(profBc, "builder:buildProviderJsonLd", pj.providerProfileUrl(providers[0].slug)));

  const dirGraph = pj.buildOurProvidersJsonLd(providers);
  const dirBc = dirGraph["@graph"].find(isBreadcrumb);
  add(auditBreadcrumb(dirBc, "builder:buildOurProvidersJsonLd", `${BASE}/our-providers`));

  const helperBc = seo.breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Guides", path: "/blog" },
    { name: "Sample", path: "/blog/sample" },
  ]);
  add(auditBreadcrumb(helperBc, "builder:seoSchema.breadcrumbSchema", `${BASE}/blog/sample`));
  pass("builder fixtures (providerJsonLd + seoSchema) emit valid breadcrumbs");

  // B) Generated raw HTML ----------------------------------------------------
  if (await exists("out/index.html")) {
    const htmlFiles = (await walk(OUT)).filter((f) => f.endsWith("index.html"));
    let bcPages = 0;
    const providerRoutesSeen = new Set();
    for (const f of htmlFiles) {
      const html = await readFile(f, "utf8");
      const bcs = breadcrumbsFromHtml(html);
      if (!bcs.length) continue;
      bcPages++;
      const rel = f.slice(OUT.length).replace(/\\/g, "/");
      if (bcs.length > 1) add([`out${rel}: ${bcs.length} BreadcrumbList entities (expected 1)`]);
      const canon = canonicalOf(html);
      for (const bc of bcs) add(auditBreadcrumb(bc, `out${rel}`, canon));
      if (/\/doctors\//.test(rel) || /\/our-providers\//.test(rel)) providerRoutesSeen.add(rel);
    }
    // every approved provider profile + directory must ship a valid breadcrumb in raw HTML
    const expectDoctors = providers.map((p) => `/doctors/${p.slug}/index.html`);
    for (const want of [...expectDoctors, "/our-providers/index.html"]) {
      if (![...providerRoutesSeen].some((r) => r === want)) {
        if (await exists(`out${want}`)) add([`out${want}: expected a BreadcrumbList in raw HTML, none found`]);
      }
    }
    pass(`generated raw HTML: ${bcPages} page(s) with breadcrumbs validated (incl. provider profiles + /our-providers)`);
  } else {
    console.log("  • out/ not built — skipping raw-HTML pass (run after `npm run build`)");
  }

  // C) Source scan of inline literal BreadcrumbLists -------------------------
  const srcFiles = (await walk(resolve(ROOT, "src"))).filter((f) => /\.(ts|tsx)$/.test(f));
  let scanned = 0;
  for (const f of srcFiles) {
    const src = await readFile(f, "utf8");
    if (!src.includes("BreadcrumbList")) continue;
    scanned++;
    add(auditSourceBreadcrumbs(src, f.slice(resolve(ROOT, "src").length + 1).replace(/\\/g, "/")));
  }
  pass(`source scan: ${scanned} breadcrumb-emitting file(s) checked for item/name/position`);

  // D) 404 / 410 responses must carry NO breadcrumb schema -------------------
  const routeStatus = await rd("src/lib/routeStatus.ts");
  for (const marker of ["NOT_FOUND_HTML", "GONE_HTML"]) {
    const idx = routeStatus.indexOf(marker);
    const block = idx >= 0 ? routeStatus.slice(idx, idx + 4000) : "";
    if (/BreadcrumbList|application\/ld\+json/.test(block)) add([`routeStatus.ts: ${marker} must not contain breadcrumb / JSON-LD schema`]);
  }
  pass("404/410 responses carry no breadcrumb schema");

  if (failures.length) {
    console.error(`\n[check-breadcrumb-structured-data] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("\n[check-breadcrumb-structured-data] PASSED — all BreadcrumbList schema is valid.");
}

// ── self-test: negative controls ─────────────────────────────────────────────
function selfTest() {
  console.log("[check-breadcrumb-structured-data] SELF-TEST — negative controls\n");
  const failures = [];
  const ctl = (label, cond) => (cond ? console.log(`  ✓ ${label}`) : (failures.push(label), console.error(`  ✗ ${label}`)));

  const good = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Our Providers", item: `${BASE}/our-providers` },
      { "@type": "ListItem", position: 3, name: "Robert Staaf", item: `${BASE}/doctors/robert-staaf` },
    ],
  };
  const clone = () => JSON.parse(JSON.stringify(good));
  const canon = `${BASE}/doctors/robert-staaf`;

  ctl("baseline: valid breadcrumb passes", auditBreadcrumb(good, "x", canon).length === 0);

  let b = clone(); delete b.itemListElement[2].item;
  ctl("NC: missing item on final crumb detected", auditBreadcrumb(b, "x", canon).some((v) => /missing field "item"/.test(v)));
  b = clone(); delete b.itemListElement[1].item;
  ctl("NC: missing item on intermediate crumb detected", auditBreadcrumb(b, "x", canon).some((v) => /missing field "item"/.test(v)));
  b = clone(); b.itemListElement[2].item = "";
  ctl("NC: empty item detected", auditBreadcrumb(b, "x").some((v) => /missing field "item"/.test(v)));
  b = clone(); b.itemListElement[2].item = "https://www.pawtenant.com/doctors/robert-staaf";
  ctl("NC: www item detected", auditBreadcrumb(b, "x").some((v) => /www host/.test(v)));
  b = clone(); b.itemListElement[2].item = "https://pawtenant-test.vercel.app/doctors/robert-staaf";
  ctl("NC: TEST/preview item detected", auditBreadcrumb(b, "x").some((v) => /non-production host/.test(v)));
  b = clone(); b.itemListElement[2].item = "/doctors/robert-staaf";
  ctl("NC: relative item detected", auditBreadcrumb(b, "x").some((v) => /absolute URL/.test(v)));
  b = clone(); delete b.itemListElement[1].name;
  ctl("NC: missing name detected", auditBreadcrumb(b, "x").some((v) => /name/.test(v)));
  b = clone(); b.itemListElement[2].position = 2;
  ctl("NC: duplicate position detected", auditBreadcrumb(b, "x").some((v) => /duplicate positions/.test(v)));
  b = clone(); b.itemListElement[0].position = 5;
  ctl("NC: non-sequential positions detected", auditBreadcrumb(b, "x").some((v) => /sequential/.test(v)));
  ctl("NC: final item != canonical detected", auditBreadcrumb(good, "x", `${BASE}/wrong-canonical`).some((v) => /!= page canonical/.test(v)));

  // duplicate BreadcrumbList in one HTML page
  const dupHtml = `<script type="application/ld+json">${JSON.stringify(good)}</script><script type="application/ld+json">${JSON.stringify(good)}</script>`;
  ctl("NC: duplicate BreadcrumbList entities in HTML detected", breadcrumbsFromHtml(dupHtml).length === 2);

  // source scan negative control (the exact original defect)
  const badSrc = `const x = { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "${BASE}/" }, { "@type": "ListItem", position: 2, name: "Our Providers" } ] };`;
  ctl("NC: source scan catches inline ListItem missing item", auditSourceBreadcrumbs(badSrc, "bad.ts").some((v) => /missing "item"/.test(v)));
  const goodSrc = `const x = { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "${BASE}/" }, { "@type": "ListItem", position: 2, name: "Our Providers", item: "${BASE}/our-providers" } ] };`;
  ctl("NC: source scan passes a fixed inline BreadcrumbList", auditSourceBreadcrumbs(goodSrc, "good.ts").length === 0);
  // ItemList (uses url, not item) must NOT be treated as a breadcrumb defect
  const itemListSrc = `const x = { "@type": "ItemList", itemListElement: [ { "@type": "ListItem", position: 1, url: "${BASE}/doctors/x", name: "X" } ] };`;
  ctl("NC: ItemList (url, not item) is not flagged", auditSourceBreadcrumbs(itemListSrc, "list.ts").length === 0);

  if (failures.length) {
    console.error(`\n[check-breadcrumb-structured-data] SELF-TEST FAILED — ${failures.length} control(s) misbehaved.`);
    process.exit(1);
  }
  console.log("\n[check-breadcrumb-structured-data] SELF-TEST PASSED — all negative controls fire; baseline clean.");
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isMain) {
  const p = process.argv.includes("--self-test") ? Promise.resolve(selfTest()) : run();
  p.catch((err) => { console.error("[check-breadcrumb-structured-data] fatal:", err); process.exit(1); });
}
