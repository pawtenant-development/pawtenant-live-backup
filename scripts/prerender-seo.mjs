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
    const target = await writeRoute(template, "/", CORE_PAGE_META["/"]);
    written.push(target);
  } catch (err) {
    errors.push({ route: "/", error: String(err) });
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
