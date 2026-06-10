// scripts/prerender-seo.mjs
//
// Post-build SEO prerender. Runs after `vite build`.
// Reads out/index.html and writes route-specific copies under out/<route>/index.html
// with only the <head> SEO tags rewritten per route. App body, scripts, assets
// are preserved verbatim so the SPA hydrates identically.
//
// Single source of truth: imports CORE_PAGE_META, ESA_STATE_META, getSEO,
// buildCanonical, and BASE_URL directly from src/config/seoConfig.ts via jiti
// (jiti is already a devDependency). Runtime SEOManager and this script now
// share the same data — change a title once in seoConfig.ts and both update.
//
// Affects only static head tags for crawlers / view-source. Runtime SEOManager
// continues to update meta on client-side navigation. No business logic touched.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const OUT_DIR = join(ROOT, "out");
const TEMPLATE_PATH = join(OUT_DIR, "index.html");
const SEO_CONFIG_PATH = resolve(ROOT, "src/config/seoConfig.ts");

// ── Load seoConfig.ts at runtime via jiti ───────────────────────────────────
const jiti = createJiti(import.meta.url, { interopDefault: true });
const seoConfig = await jiti.import(SEO_CONFIG_PATH);

const {
  BASE_URL,
  CORE_PAGE_META,
  ESA_STATE_META,
  getSEO,
  buildCanonical: buildCanonicalFromConfig,
} = seoConfig;

if (!BASE_URL || !CORE_PAGE_META || !ESA_STATE_META || !getSEO) {
  console.error(
    "[prerender-seo] ERROR: seoConfig.ts did not export the expected symbols."
  );
  process.exit(1);
}

// ── HTML helpers ────────────────────────────────────────────────────────────
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(s) {
  return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rewrite SEO tags inside the <head> of the built index.html.
 * Only touches: <title>, meta[name=description], link[rel=canonical],
 * og:title, og:description, og:url, twitter:title, twitter:description.
 * Everything else (preloads, scripts, schema, pixels) is preserved.
 */
function rewriteHead(html, { title, description, canonical }) {
  let out = html;

  out = out.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeText(title)}</title>`
  );

  out = replaceOrInsertMetaName(out, "description", description);
  out = replaceOrInsertCanonical(out, canonical);

  out = replaceOrInsertMetaProp(out, "og:title", title);
  out = replaceOrInsertMetaProp(out, "og:description", description);
  out = replaceOrInsertMetaProp(out, "og:url", canonical);

  out = replaceOrInsertMetaName(out, "twitter:title", title);
  out = replaceOrInsertMetaName(out, "twitter:description", description);

  return out;
}

function replaceOrInsertMetaName(html, name, content) {
  const re = new RegExp(
    `<meta\\s+name=["']${escapeRegex(name)}["'][^>]*\\/?>`,
    "i"
  );
  const tag = `<meta name="${name}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceOrInsertMetaProp(html, prop, content) {
  const re = new RegExp(
    `<meta\\s+property=["']${escapeRegex(prop)}["'][^>]*\\/?>`,
    "i"
  );
  const tag = `<meta property="${prop}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceOrInsertCanonical(html, href) {
  const re = /<link\s+rel=["']canonical["'][^>]*\/?>/i;
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCanonical(routePath) {
  // Prefer the config's helper so canonical normalization stays consistent
  // with runtime SEOManager. Fall back if absent.
  if (typeof buildCanonicalFromConfig === "function") {
    return buildCanonicalFromConfig(routePath);
  }
  return `${BASE_URL}${routePath}`;
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeRoute(template, routePath, meta, canonicalOverride) {
  const canonical = canonicalOverride ?? buildCanonical(routePath);
  const html = rewriteHead(template, {
    title: meta.title,
    description: meta.description,
    canonical,
  });

  let target;
  if (routePath === "/") {
    target = TEMPLATE_PATH;
  } else {
    const dir = join(OUT_DIR, routePath.replace(/^\//, ""));
    await mkdir(dir, { recursive: true });
    target = join(dir, "index.html");
  }

  await writeFile(target, html, "utf8");
  return target;
}

// ── App-CSS-non-blocking helper (PageSpeed mirror from TEST) ──────────────
// Make the render-blocking app stylesheet non-blocking for this route only.
// media=print → browser does not block paint; onload swaps it back to all.
// <noscript> keeps no-JS visitors fully styled. Returns the html unchanged if
// the expected tag isn't found (safe fallback — page still works, just not
// optimized), and logs a warning so a future Vite output change is noticed.
function makeAppCssNonBlocking(html) {
  const re = /<link rel="stylesheet" crossorigin href="(\/assets\/index-[^"]+\.css)">/;
  if (!re.test(html)) {
    console.warn(
      "[prerender-seo] WARN: app stylesheet <link> not matched for /meta-esa-letter — left render-blocking."
    );
    return html;
  }
  return html.replace(
    re,
    (_m, href) =>
      `<link rel="stylesheet" crossorigin href="${href}" media="print" onload="this.media='all'" />` +
      `<noscript><link rel="stylesheet" crossorigin href="${href}" /></noscript>`
  );
}

// ── Homepage (/) static hero skeleton — PageSpeed Phase 9 (2026-06-08) ──────
// Same proven technique as /meta-esa-letter above: inject a self-styled static
// above-the-fold hero into #root and make the app stylesheet non-render-
// blocking so the homepage LCP (the hero H1 over the background WebP) paints on
// HTML parse instead of after the ~145 KB-gzip React bundle downloads and
// executes on throttled mobile. This is why /meta-esa-letter scores 90+ mobile
// while the CSR-only homepage was stuck ~78-81 with the SAME bundle.
//
// Safety / no-flash / no-CLS rationale (identical to the meta LP):
//   • main.tsx uses createRoot(), which clears #root and re-renders the React
//     hero on mount. The background image is the same preloaded WebP (served
//     from cache → no second request, no flash).
//   • The skeleton reserves the same full-viewport (100svh) hero box, so CLS
//     stays ~0 when React takes over.
//   • SharedNavbar is `fixed top-0` and overlays the hero, so mounting it does
//     not shift the skeleton's H1 (the LCP element).
//   • Homepage stays INDEXABLE — robots is NOT forced to noindex here (unlike
//     the paid meta LP). view-source shows the real hero H1/subtitle copy.
//
// Inline critical CSS is fully self-contained (pt-h-* classes, NOT Tailwind)
// so the hero renders correctly WITHOUT the now-async app stylesheet. Mirrors
// src/pages/home/components/HeroSection.tsx — keep visually in sync if that
// hero's wording/layout changes.
const HOME_CRITICAL_CSS = `<style id="pt-home-critical">
/* Reset the default 8px body margin immediately. Tailwind's preflight sets
   body{margin:0}, but it ships in the ASYNC app stylesheet — so until that
   loads the body keeps its UA 8px margin and then snaps to 0 when the CSS
   applies, a small whole-page shift on top of the navbar one. Inlining it
   here removes that residual shift without waiting for the app CSS. */
html,body{margin:0;padding:0}
.pt-h-hero{position:relative;min-height:100svh;display:flex;align-items:center;overflow:hidden;background:#0b1220;font-family:'Nunito',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.pt-h-bg{position:absolute;inset:0}
.pt-h-bg picture{display:block;width:100%;height:100%}
.pt-h-bg img{width:100%;height:100%;object-fit:cover;object-position:center;opacity:.8}
.pt-h-ov{position:absolute;inset:0;background:linear-gradient(to right,rgba(17,24,39,.85),rgba(17,24,39,.65),rgba(17,24,39,.25))}
.pt-h-wrap{position:relative;z-index:10;width:100%;max-width:80rem;margin:0 auto;padding:5rem 1.25rem;box-sizing:border-box}
.pt-h-inner{max-width:42rem}
.pt-h-badge{display:inline-flex;align-items:center;gap:.5rem;background:rgba(249,115,22,.2);border:1px solid rgba(251,146,60,.4);color:#fdba74;font-size:.75rem;font-weight:600;padding:.375rem .75rem;border-radius:9999px;margin-bottom:1.25rem}
.pt-h-h1{font-size:1.875rem;line-height:1.15;font-weight:800;color:#fff;margin:0 0 1.25rem}
.pt-h-h1 span{color:#fb923c}
.pt-h-br{display:none}
.pt-h-sub{color:#e5e7eb;font-size:1rem;line-height:1.6;margin:0 0 1.75rem;max-width:36rem}
.pt-h-pill{display:inline-flex;align-items:center;gap:.625rem;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);padding:.625rem 1rem;border-radius:9999px;margin-bottom:1.75rem}
.pt-h-pill span{color:#fff;font-size:.75rem;font-weight:600;white-space:nowrap}
.pt-h-cta{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%;box-sizing:border-box;background:#fb923c;color:#fff;font-weight:700;font-size:1rem;padding:1rem 2rem;border-radius:.375rem;text-decoration:none;box-shadow:0 10px 15px -3px rgba(251,146,60,.25)}
@media(min-width:640px){.pt-h-wrap{padding:7rem 1.25rem}.pt-h-h1{font-size:2.25rem}.pt-h-br{display:block}.pt-h-sub{font-size:1.125rem}.pt-h-cta{width:auto;font-size:.875rem;padding:.875rem 2rem}}
@media(min-width:768px){.pt-h-wrap{padding:8rem 1.25rem}}
@media(min-width:1024px){.pt-h-h1{font-size:3rem}}
</style>`;

// Static, self-styled above-the-fold hero (uses the pt-h-* inline CSS above,
// NOT Tailwind). The <img> is the same preloaded WebP the React hero uses and
// the <h1> is the LCP text element. Below-the-fold is rendered by React after
// mount. Copy mirrors HeroSection.tsx exactly so the React re-render is a
// no-op visually.
const HOME_HERO_SKELETON = `<section class="pt-h-hero" id="get-started">
  <div class="pt-h-bg">
    <picture>
      <source media="(max-width: 768px)" srcset="/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp" type="image/webp" />
      <source media="(min-width: 769px)" srcset="/assets/blog/fp-woman-sitting-floor-desktop.webp" type="image/webp" />
      <img src="/assets/blog/fp-woman-sitting-floor.jpg" alt="Pet owner with dog at home applying for an ESA letter online" fetchpriority="high" decoding="async" width="1920" height="1280" />
    </picture>
    <div class="pt-h-ov"></div>
  </div>
  <div class="pt-h-wrap">
    <div class="pt-h-inner">
      <div class="pt-h-badge">HIPAA Compliant</div>
      <h1 class="pt-h-h1">Get an <span>ESA Letter</span> Online<br class="pt-h-br" /> Fast, Simple &amp; Stress Free</h1>
      <p class="pt-h-sub">Get your ESA letter online from licensed mental health professionals &mdash; accepted for housing nationwide under the Fair Housing Act. No waiting rooms, no hassle.</p>
      <div class="pt-h-pill"><span>Serving all 50 US states</span></div>
      <a class="pt-h-cta" href="/assessment">Get Your ESA Letter Now</a>
    </div>
  </div>
</section>`;

// Writes out/index.html (the homepage) with the static hero skeleton injected
// and the app stylesheet made non-render-blocking. Mirrors writeMetaLandingRoute
// but keeps the homepage indexable (no forced noindex) and uses the homepage
// SEO meta. Returns the written target path.
// Build <link rel="modulepreload"> tags for the Home route chunk + its static
// import chunks, resolved from the Vite manifest. This lets the homepage's JS
// load IN PARALLEL with the main entry bundle instead of strictly after it —
// the post-index.js load of the Home chunk was forcing a Suspense/PageLoader
// gap (orange spinner) before React could render the hero, inflating the
// homepage LCP (huge LCP render-delay). Lazy below-fold sections are listed
// under `dynamicImports` (NOT `imports`), so they are intentionally excluded.
// Returns "" (safe no-op) if the manifest or the home entry is missing.
async function buildHomeModulePreloads() {
  const manifestPath = join(OUT_DIR, ".vite", "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    console.warn(
      "[prerender-seo] WARN: out/.vite/manifest.json not found — homepage modulepreload skipped."
    );
    return "";
  }
  const homeEntry = manifest["src/pages/home/page.tsx"];
  if (!homeEntry || !homeEntry.file) {
    console.warn(
      "[prerender-seo] WARN: home entry missing in manifest — homepage modulepreload skipped."
    );
    return "";
  }
  const files = new Set([homeEntry.file]);
  const visit = (key) => {
    const node = manifest[key];
    if (!node) return;
    if (node.file) files.add(node.file);
    (node.imports || []).forEach(visit);
  };
  (homeEntry.imports || []).forEach(visit);
  // Exclude the main entry chunk — it is already loaded via the <script
  // type="module" src> tag, so a modulepreload for it is redundant noise.
  const entryNode = Object.values(manifest).find((n) => n.isEntry);
  if (entryNode && entryNode.file) files.delete(entryNode.file);
  return Array.from(files)
    .map((f) => `<link rel="modulepreload" crossorigin href="/${f}" />`)
    .join("\n    ");
}

async function writeHomeRoute(template) {
  const homeMeta = CORE_PAGE_META["/"];
  let html = rewriteHead(template, {
    title: homeMeta.title,
    description: homeMeta.description,
    canonical: buildCanonical("/"),
  });
  // Inject the inline critical CSS for the static hero.
  html = html.replace(/<\/head>/i, `    ${HOME_CRITICAL_CSS}\n  </head>`);
  // Make the app stylesheet non-render-blocking so the static hero paints now.
  html = makeAppCssNonBlocking(html);
  // PageSpeed Phase 2 (2026-06-08): ALSO preload the app stylesheet at HIGH
  // priority so it is fetched + ready BEFORE the React bundle executes and
  // re-renders the hero. The media=print swap above loads the CSS at LOW
  // priority, so on throttled mobile React can re-render the Tailwind-classed
  // hero before the app CSS arrives — the hero briefly collapses (min-h-[100svh]
  // is inert without the CSS) then re-expands when the CSS lands, producing the
  // ~0.31 whole-page layout shift PSI flagged. `rel=preload as=style` fetches
  // high-priority WITHOUT render-blocking the inline-CSS skeleton, so FCP stays
  // fast (skeleton paints immediately) while CLS drops. Homepage-scoped only.
  const cssHref = (html.match(/href="(\/assets\/index-[^"]+\.css)"/) || [])[1];
  if (cssHref) {
    html = html.replace(
      /<\/head>/i,
      `    <link rel="preload" as="style" crossorigin href="${cssHref}" />\n  </head>`
    );
  } else {
    console.warn(
      "[prerender-seo] WARN: app stylesheet href not found for / — CSS preload skipped."
    );
  }
  // Preload the Home route chunk (+ its static imports) so the homepage JS loads
  // in parallel with the main bundle — closing the Suspense/PageLoader gap that
  // delayed the hero render / LCP.
  const homePreloads = await buildHomeModulePreloads();
  if (homePreloads) {
    html = html.replace(/<\/head>/i, `    ${homePreloads}\n  </head>`);
  }
  // Inject the static hero (the LCP element) into #root.
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${HOME_HERO_SKELETON}</div>`
  );

  await writeFile(TEMPLATE_PATH, html, "utf8");
  return TEMPLATE_PATH;
}

// ── Neutral SPA fallback shell (out/app.html) — refresh-flash fix (2026-06-10) ─
// The Vercel catch-all rewrite (vercel.json: "/(.*)" → "/app") serves this
// file for every route WITHOUT a prerendered file — i.e. internal/protected
// routes (/company, /admin-orders, provider/admin) and dynamic routes. Before
// this, that rewrite pointed at "/" (out/index.html), which carries the homepage
// HERO SKELETON in #root — so refreshing /company or /admin-orders painted the
// public homepage for a beat before React mounted the real route. This shell is
// byte-identical to the built template (same scripts, assets, tracking — so
// conversion/checkout routes behave the same) EXCEPT #root holds a neutral
// loading spinner instead of the homepage hero. React's createRoot() clears it
// on mount. The homepage itself is UNAFFECTED: "/" is served directly from
// out/index.html (filesystem wins over rewrites) and keeps its hero skeleton.
// Self-contained inline styles (no Tailwind/app-CSS dependency); keyframes live
// inside #root so the markup is one drop-in replacement.
const APP_BOOT_SHELL = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fafaf9;font-family:'Nunito',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><style>@keyframes pt-boot-spin{to{transform:rotate(360deg)}}</style><div style="display:flex;flex-direction:column;align-items:center;gap:14px"><div style="width:34px;height:34px;border:3px solid #fed7aa;border-top-color:#f97316;border-radius:9999px;animation:pt-boot-spin .7s linear infinite"></div><div style="font-size:13px;font-weight:600;color:#78716c">Loading…</div></div></div>`;

async function writeAppShell(template) {
  const html = template.replace(
    '<div id="root"></div>',
    `<div id="root">${APP_BOOT_SHELL}</div>`
  );
  const target = join(OUT_DIR, "app.html");
  await writeFile(target, html, "utf8");
  return target;
}


// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!(await pathExists(TEMPLATE_PATH))) {
    console.error(
      `[prerender-seo] ERROR: ${TEMPLATE_PATH} not found. Run \`vite build\` first.`
    );
    process.exit(1);
  }

  const template = await readFile(TEMPLATE_PATH, "utf8");
  const written = [];
  const errors = [];

  // 1) Core public routes from CORE_PAGE_META — homepage handled last
  const coreRoutes = Object.entries(CORE_PAGE_META).filter(
    ([p]) => p !== "/"
  );
  for (const [routePath, meta] of coreRoutes) {
    try {
      const target = await writeRoute(template, routePath, meta);
      written.push(target);
    } catch (err) {
      errors.push({ route: routePath, error: String(err) });
    }
  }

  // 2) Per-state ESA → /esa-letter/<slug>, sourced from ESA_STATE_META
  for (const [slug, meta] of Object.entries(ESA_STATE_META)) {
    const routePath = `/esa-letter/${slug}`;
    try {
      const target = await writeRoute(template, routePath, meta);
      written.push(target);
    } catch (err) {
      errors.push({ route: routePath, error: String(err) });
    }
  }

  // 3) Per-state PSD → /psd-letter/<slug>, sourced from getSEO()
  //    (PSD entries are formulaic via buildPSDEntry inside seoConfig.ts).
  //    We iterate the same slug set used for ESA — both lists are 1:1 in
  //    seoConfig.ts. getSEO returns null for unknown slugs, so we skip those.
  for (const slug of Object.keys(ESA_STATE_META)) {
    const routePath = `/psd-letter/${slug}`;
    const meta = getSEO(routePath);
    if (!meta) continue;
    try {
      const target = await writeRoute(template, routePath, meta);
      written.push(target);
    } catch (err) {
      errors.push({ route: routePath, error: String(err) });
    }
  }

  // 4) Legacy redirect-style state routes (/esa-letter-<slug>) — write a
  //    matching prerendered file for crawlers that hit the legacy URL before
  //    the Vercel 308 redirect. Canonical points to the preferred route.
  for (const [slug, meta] of Object.entries(ESA_STATE_META)) {
    const legacyPath = `/esa-letter-${slug}`;
    const canonical = `${BASE_URL}/esa-letter/${slug}`;
    try {
      const target = await writeRoute(template, legacyPath, meta, canonical);
      written.push(target);
    } catch (err) {
      errors.push({ route: legacyPath, error: String(err) });
    }
  }

  // 5) Homepage LAST — rewrite out/index.html so view-source on / has the
  //    correct, normalized homepage <head>.
  try {
    const target = await writeHomeRoute(template);
    written.push(target);
  } catch (err) {
    errors.push({ route: "/", error: String(err) });
  }

  // 6) Neutral SPA fallback shell (out/app.html) — served by the Vercel
  //    catch-all rewrite for fileless routes so refreshing a protected/internal
  //    route shows a neutral loader, not the homepage hero. Uses the CLEAN
  //    template (writeHomeRoute only mutated out/index.html on disk, not the
  //    in-memory `template`).
  try {
    const target = await writeAppShell(template);
    written.push(target);
  } catch (err) {
    errors.push({ route: "/app.html", error: String(err) });
  }

  console.log(
    `[prerender-seo] wrote ${written.length} files (${errors.length} errors) — source: src/config/seoConfig.ts`
  );
  if (errors.length) {
    for (const e of errors) {
      console.error(`  - ${e.route}: ${e.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[prerender-seo] fatal:", err);
  process.exit(1);
});
