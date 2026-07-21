// scripts/check-full-body-prerender.mjs
//
// AI-SEO-FULL-BODY-PRERENDER-SPIKE-001
//
// Deterministic, BLOCKING guard for the full-body prerender spike. Runs after
// scripts/prerender-full-body-spike.mjs in `npm run build` and exits non-zero on
// any violation so a regression fails the build. Read-only (never writes files).
//
// For each approved spike route it verifies the generated out/<route>/index.html
// carries real, route-specific body content in the raw HTML (not an empty #root,
// not a loading shell), with the correct <head>, canonical, and no schema/secret
// leakage. Uses route-SPECIFIC assertions (exact H1 + distinctive content phrase
// + required internal links), not a generic word count alone.
//
// It also re-asserts the sibling invariants this spike must never regress:
//   - the route-status classifier still marks every spike route valid, and still
//     discriminates (unknown → notfound, retired WP → gone);
//   - every indexable spike route is still present in the sitemap;
//   - no homepage WebPage/Service/$129 schema leaked into an inner route body
//     (the machine-facts guard owns the authoritative check; this is a mirror).

import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const failures = [];
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`  ✗ ${m}`);
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Balanced <div id="root"> … </div> extraction (root contains nested divs).
function rootInner(html) {
  const marker = '<div id="root">';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const contentStart = start + marker.length;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = contentStart;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === "</div>") {
      depth--;
      if (depth === 0) return html.slice(contentStart, m.index);
    } else depth++;
  }
  return html.slice(contentStart);
}

function visibleText(fragment) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const firstCap = (re, s) => {
  const m = s.match(re);
  return m ? m[1].trim() : "";
};

// ── Route → expectations. H1 + a distinctive content phrase make each check
//    route-specific; minText guards against a stub; mustLink proves contextual
//    internal linking. The homepage keeps its tuned static hero, so its
//    thresholds reflect the above-the-fold hero content only. ──────────────────
const SPIKE = [
  {
    path: "/", file: "index.html", homepage: true,
    titleHas: "ESA Letter Online",
    h1Has: "Get an ESA Letter Online",
    minText: 120,
    mustLink: ["/assessment"],
    mustText: ["ESA Letter"],
  },
  {
    path: "/how-to-get-esa-letter", file: "how-to-get-esa-letter/index.html",
    titleHas: "How to Get an ESA Letter",
    h1Has: "How to Get an ESA Letter",
    minText: 2500,
    mustLink: ["/assessment"],
    mustText: ["ESA letter"],
  },
  {
    path: "/esa-letter-cost", file: "esa-letter-cost/index.html",
    titleHas: "ESA Letter Cost",
    h1Has: "Money Back Guarantee",
    minText: 2500,
    mustLink: ["/assessment"],
    mustText: ["Money Back"],
  },
  {
    path: "/how-to-get-psd-letter", file: "how-to-get-psd-letter/index.html",
    titleHas: "PSD Letter",
    h1Has: "Psychiatric Service Dog Letter",
    minText: 2500,
    mustLink: ["/psd-assessment"],
    mustText: ["Psychiatric Service Dog"],
  },
  {
    path: "/esa-letter/california", file: "esa-letter/california/index.html",
    titleHas: "ESA Letter California",
    h1Has: "Get an ESA Letter in California",
    minText: 2500,
    mustLink: ["/assessment", "/housing-rights-esa"],
    mustText: ["California ESA Laws"],
  },
  {
    path: "/esa-letter/washington", file: "esa-letter/washington/index.html",
    titleHas: "ESA Letter Washington",
    h1Has: "Get an ESA Letter in Washington",
    minText: 2500,
    mustLink: ["/assessment", "/housing-rights-esa"],
    mustText: ["Washington ESA Laws"],
  },
  {
    path: "/esa-letter/new-york", file: "esa-letter/new-york/index.html",
    titleHas: "ESA Letter New York",
    h1Has: "Get an ESA Letter in New York",
    minText: 2500,
    mustLink: ["/assessment", "/housing-rights-esa"],
    mustText: ["New York ESA Laws"],
  },
  {
    path: "/esa-letter-for-apartments", file: "esa-letter-for-apartments/index.html",
    titleHas: "ESA Letter for Apartments",
    h1Has: "ESA Letter for Apartments",
    minText: 2500,
    mustLink: ["/assessment"],
    mustText: ["apartment"],
  },
  {
    path: "/blog/esa-letter-requirements", file: "blog/esa-letter-requirements/index.html",
    titleHas: "ESA Letter Requirements",
    h1Has: "ESA Letter Requirements",
    minText: 3000,
    mustLink: ["/assessment"],
    mustText: ["Requirements"],
  },
  {
    path: "/explore-esa-letters-all-states", file: "explore-esa-letters-all-states/index.html",
    titleHas: "ESA Letter by State",
    h1Has: "Explore ESA Letter",
    minText: 1500,
    mustLink: ["/esa-letter/california"],
    mustText: ["Explore ESA Letter"],
  },
  // ── Provider directory + curated provider profiles ─────────────────────────
  // AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001. Exactly 8 provider routes
  // prerendered + the /our-providers directory.
  {
    path: "/our-providers", file: "our-providers/index.html",
    titleHas: "Our Providers",
    h1Has: "Our Providers",
    minText: 1500,
    mustLink: ["/doctors/eve-rosno", "/doctors/robert-staaf"],
    mustText: ["Our Providers", "Eve Rosno"],
  },
  {
    path: "/doctors/robert-staaf", file: "doctors/robert-staaf/index.html",
    titleHas: "Robert Staaf", h1Has: "Robert Staaf", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Robert Staaf"],
  },
  {
    path: "/doctors/michelle-lafferty", file: "doctors/michelle-lafferty/index.html",
    titleHas: "Michelle Lafferty", h1Has: "Michelle Lafferty", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Michelle Lafferty"],
  },
  {
    path: "/doctors/lytara-garcia", file: "doctors/lytara-garcia/index.html",
    titleHas: "Lytara Garcia", h1Has: "Lytara Garcia", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Lytara Garcia"],
  },
  {
    path: "/doctors/stephanie-white", file: "doctors/stephanie-white/index.html",
    titleHas: "Stephanie White", h1Has: "Stephanie White", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Stephanie White"],
  },
  {
    path: "/doctors/eve-rosno", file: "doctors/eve-rosno/index.html",
    titleHas: "Eve Rosno", h1Has: "Eve Rosno", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Eve Rosno"],
  },
  {
    path: "/doctors/henry-smith", file: "doctors/henry-smith/index.html",
    titleHas: "Henry Smith", h1Has: "Henry Smith", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Henry Smith"],
  },
  {
    path: "/doctors/chad-cunningham", file: "doctors/chad-cunningham/index.html",
    titleHas: "Chad Cunningham", h1Has: "Chad Cunningham", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Chad Cunningham"],
  },
  {
    path: "/doctors/karla-delgado", file: "doctors/karla-delgado/index.html",
    titleHas: "Karla Delgado", h1Has: "Karla Delgado", minText: 400,
    mustLink: ["/assessment", "/our-providers"], mustText: ["Karla Delgado"],
  },
];

const CANON = (p) => `https://pawtenant.com${p === "/" ? "/" : p}`;

// Secret-like patterns that must NEVER appear in generated output.
const SECRET_PATTERNS = [
  { re: /prerender-placeholder/i, label: "prerender placeholder env value" },
  { re: /service_role/i, label: "service_role key reference" },
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/, label: "Stripe secret key" },
  { re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, label: "JWT-like token" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key block" },
];

async function main() {
  console.log("[check-full-body-prerender] full-body raw-HTML spike guard\n");

  // Route-status classifier (item 17) — imported once via jiti.
  const { classifyRoute } = await jiti.import(resolve(ROOT, "src/lib/routeStatus.ts"));

  // Need a built out/ — this guard only runs post-prerender.
  if (!(await exists(join(OUT_DIR, "index.html")))) {
    fail("out/ not built — run `vite build && node scripts/prerender-seo.mjs && node scripts/prerender-full-body-spike.mjs` first");
    return finish();
  }

  const sitemap = (await exists(join(OUT_DIR, "sitemap.xml")))
    ? await readFile(join(OUT_DIR, "sitemap.xml"), "utf8")
    : "";

  for (const r of SPIKE) {
    console.log(`${r.path}:`);
    const file = join(OUT_DIR, r.file);

    // 1. file exists
    if (!(await exists(file))) {
      fail(`${r.path} → generated file missing (${r.file})`);
      continue;
    }
    const html = await readFile(file, "utf8");
    const root = rootInner(html);
    if (root === null) {
      fail(`${r.path} → no <div id="root"> in output`);
      continue;
    }
    const vtext = visibleText(root);

    // 2. route-status classifier still says valid
    if (classifyRoute(r.path) === "valid") pass(`${r.path} classifies valid`);
    else fail(`${r.path} → classifyRoute is not "valid" (${classifyRoute(r.path)})`);

    // 8. root not empty  +  9. not a generic loading shell
    if (root.trim() === "") fail(`${r.path} → #root is EMPTY`);
    else pass(`${r.path} #root not empty (${Buffer.byteLength(root)} bytes)`);
    if (/ri-loader-4-line/.test(root) || /^\s*(Loading[….]*)\s*$/i.test(vtext))
      fail(`${r.path} → #root is a generic loading shell`);
    else pass(`${r.path} not a loading shell`);

    // 3. route-specific title
    const title = firstCap(/<title>([\s\S]*?)<\/title>/i, html);
    if (title.includes(r.titleHas)) pass(`${r.path} <title> route-specific ("${r.titleHas}")`);
    else fail(`${r.path} → <title> missing "${r.titleHas}" (got "${title.slice(0, 70)}")`);

    // 4. non-www canonical, correct path, no TEST domain (items 4 + 15)
    const canonical = firstCap(/<link rel="canonical" href="([^"]+)"/i, html);
    if (canonical === CANON(r.path)) pass(`${r.path} canonical = ${canonical}`);
    else fail(`${r.path} → canonical is "${canonical}" (expected ${CANON(r.path)})`);
    if (/pawtenant-test/i.test(canonical)) fail(`${r.path} → canonical points at the TEST domain`);
    if (/^https:\/\/www\./i.test(canonical)) fail(`${r.path} → canonical is www (must be non-www)`);

    // 5. route-specific H1 in #root
    const h1 = firstCap(/<h1[^>]*>([\s\S]*?)<\/h1>/i, root)
      .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (h1 && h1.includes(r.h1Has)) pass(`${r.path} H1 route-specific ("${r.h1Has}")`);
    else fail(`${r.path} → H1 missing "${r.h1Has}" (got "${h1.slice(0, 70)}")`);

    // 6. minimum meaningful body text
    if (vtext.length >= r.minText) pass(`${r.path} body text ${vtext.length} ≥ ${r.minText}`);
    else fail(`${r.path} → body text ${vtext.length} < ${r.minText} (thin/loading body)`);

    // 6b. route-specific content phrase (not just word count)
    for (const phrase of r.mustText) {
      if (vtext.toLowerCase().includes(phrase.toLowerCase())) pass(`${r.path} contains "${phrase}"`);
      else fail(`${r.path} → missing route-specific phrase "${phrase}"`);
    }

    // 7. relevant internal link(s) in #root
    for (const href of r.mustLink) {
      if (root.includes(`href="${href}`)) pass(`${r.path} links to ${href}`);
      else fail(`${r.path} → missing internal link ${href}`);
    }

    // 10 + 11 + 19. no JSON-LD in #root (schema stays runtime/head only → no
    //     homepage WebPage/Service leak, no duplicate JSON-LD in body)
    if (!/application\/ld\+json/i.test(root)) pass(`${r.path} no JSON-LD in #root (schema emitted once)`);
    else fail(`${r.path} → JSON-LD present in #root (duplicate/leaked schema)`);
    if (/"@type"\s*:\s*"(?:WebPage|Service)"/.test(root) || /"price"\s*:\s*"129"/.test(root))
      fail(`${r.path} → homepage WebPage/Service/$129 schema leaked into #root`);

    // 12. no noindex on public routes
    const robots = firstCap(/<meta name="robots" content="([^"]+)"/i, html);
    if (/noindex/i.test(robots)) fail(`${r.path} → robots is noindex (public route must be indexable)`);
    else pass(`${r.path} robots indexable (${robots.slice(0, 40)})`);

    // 13. no secret-like values
    let secretHit = false;
    for (const s of SECRET_PATTERNS) {
      if (s.re.test(html)) {
        fail(`${r.path} → secret-like value in output (${s.label})`);
        secretHit = true;
      }
    }
    if (!secretHit) pass(`${r.path} no secret-like values`);

    // 14. no localhost URLs
    if (/localhost|127\.0\.0\.1|:3000/.test(root)) fail(`${r.path} → localhost URL in #root`);
    else pass(`${r.path} no localhost URLs`);

    // 16. no hydration/React error markers
    if (/Minified React error|Hydration failed|data-reactroot/i.test(root))
      fail(`${r.path} → hydration/React error marker in #root`);
    else pass(`${r.path} no hydration-error marker`);

    // 18. still present in sitemap
    if (sitemap.includes(`pawtenant.com${r.path}<`)) pass(`${r.path} present in sitemap`);
    else fail(`${r.path} → missing from sitemap.xml`);

    console.log("");
  }

  // 17. classifier still DISCRIMINATES (proves middleware behavior intact)
  console.log("route-status discrimination:");
  const notFound = classifyRoute("/this-is-not-a-real-pawtenant-route-xyz");
  const gone = classifyRoute("/feed");
  if (notFound === "notfound") pass("unknown path → notfound");
  else fail(`unknown path classified "${notFound}" (expected notfound)`);
  if (gone === "gone") pass("retired WordPress path (/feed) → gone");
  else fail(`/feed classified "${gone}" (expected gone)`);

  return finish();
}

function finish() {
  console.log("");
  if (failures.length) {
    console.error(`[check-full-body-prerender] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("[check-full-body-prerender] PASSED — all spike routes carry real full-body content.");
}

main().catch((err) => {
  console.error("[check-full-body-prerender] fatal:", err);
  process.exit(1);
});
