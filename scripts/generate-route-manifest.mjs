// scripts/generate-route-manifest.mjs
//
// AI-SEO-SOFT-404-ROUTE-STATUS-001
//
// Generates src/generated/routeManifest.ts — the SINGLE canonical list of valid
// public + private route patterns, derived from the same sources the router,
// prerender, and sitemap already use. The edge middleware (middleware.ts) and
// the route-status guard (scripts/check-route-status.mjs) both consume it so the
// three can never drift.
//
// Sources (read-only, regex-extracted — no side-effect imports):
//   - src/router/config.tsx      → every exact `path:` literal (the router IS the
//                                    route registry) + ESA_STATE_SLUGS (51) +
//                                    PSD_STATE_SLUGS (10) for the legacy flat routes.
//   - src/mocks/blogPosts*.ts (4)→ /blog/<slug> valid slugs (86).
//   - src/mocks/stateBlogMap.ts  → /blog/state/<slug> valid slugs (51).
//   - src/mocks/colleges.ts      → /college-pet-policy/<slug> valid slugs (12).
//
// Dynamic collections whose valid set is Supabase-backed and cannot be enumerated
// at build time (/verify/:letterId) + the tracking bridge (/r/:stage) are
// PASS-THROUGH prefixes — always treated valid. Unknown ids there stay a
// client-rendered 200 (a documented residual — see the task card).
//
// /doctors/<slug> is the EXCEPTION: it is fail-closed. Only the eight curated
// approved provider slugs (src/data/publicProviders.ts) are valid; every other
// /doctors/* URL (unknown, excluded, alias, DB-only) classifies notfound -> real
// HTTP 404. AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001.
//
// Run: npm run gen:routes   (also runs at the start of `npm run build`)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const uniqSort = (a) => [...new Set(a)].sort();

// ── Curated, hand-maintained lists (kept next to their evidence) ─────────────
// Dynamic / Supabase-backed / tracking route prefixes → always valid (pass-through).
// NOTE: /doctors/ is deliberately NOT here — provider profiles are fail-closed and
// enumerated via DOCTOR_SLUGS below (see header).
const PASS_THROUGH_PREFIXES = ["/verify/", "/r/"];

// Retired WordPress / WooCommerce infrastructure — permanently gone → HTTP 410.
// Matched on the FIRST path segment. None of these collide with a real route.
// Mirrors the negative-lookahead the vercel.json rewrite already excludes.
const GONE_SEGMENTS = [
  "category", "tag", "product", "cartflows_step", "cartflows_flow",
  "author", "feed", "comments", "wp-admin", "wp-content", "wp-includes",
  "wp-json", "wp-login", "xmlrpc",
  "2019", "2020", "2021", "2022", "2023", "2024",
];

export async function buildManifestSource() {
  // 1) Router — exact static paths (drop :params and the "*" catch-all).
  const cfg = await rd("src/router/config.tsx");
  const rawPaths = [...cfg.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  const exactStatic = rawPaths.filter((p) => !p.includes(":") && p !== "*");

  function slugArray(name) {
    const m = cfg.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!m) throw new Error(`${name} not found in src/router/config.tsx`);
    return [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
  }
  const esaStates = slugArray("ESA_STATE_SLUGS"); // 51
  const psdFlatStates = slugArray("PSD_STATE_SLUGS"); // 10

  // Legacy flat state routes are generated in config.tsx via .map(), so add them.
  const legacyFlat = [
    ...esaStates.map((s) => `/esa-letter-${s}`),
    ...psdFlatStates.map((s) => `/psd-letter-${s}`),
  ];

  // 2) Blog slugs — 4 mock registries + any static /blog/<slug> router routes.
  const blogFiles = [
    "src/mocks/blogPosts.ts",
    "src/mocks/blogPostsExtended.ts",
    "src/mocks/blogPostsExtended2.ts",
    "src/mocks/blogPostsVerification.ts",
  ];
  const blogSlugs = new Set();
  for (const f of blogFiles) {
    for (const m of (await rd(f)).matchAll(/slug:\s*['"]([a-z0-9-]+)['"]/g)) {
      blogSlugs.add(m[1]);
    }
  }
  for (const p of exactStatic) {
    if (p.startsWith("/blog/") && !p.startsWith("/blog/state/")) {
      blogSlugs.add(p.slice("/blog/".length));
    }
  }

  // 3) /blog/state/<slug> — one per stateSlug entry.
  const blogStateSlugs = new Set(
    [...(await rd("src/mocks/stateBlogMap.ts")).matchAll(
      /stateSlug:\s*['"]([a-z0-9-]+)['"]/g
    )].map((m) => m[1])
  );

  // 4) /college-pet-policy/<slug>.
  const collegeSlugs = new Set(
    [...(await rd("src/mocks/colleges.ts")).matchAll(
      /^\s*slug:\s*['"]([a-z0-9-]+)['"]/gm
    )].map((m) => m[1])
  );

  // 5) /doctors/<slug> — EXACTLY the eight curated public providers. Fail-closed:
  // any /doctors/* slug not in this set classifies notfound (real 404). The
  // anchored `slug:` pattern skips the `dbSlug:` field on the next line.
  const doctorSlugs = new Set(
    [...(await rd("src/data/publicProviders.ts")).matchAll(
      /^\s*slug:\s*['"]([a-z0-9-]+)['"]/gm
    )].map((m) => m[1])
  );

  // /psd-letter/<slug> valid set = all 51 ESA slugs (matches prerender + seoConfig
  // buildPSDEntry, which write/emit prerendered <head> for all 51). The page body
  // only has content for 10; the other 41 rendering a thin body is a state-page
  // content concern owned by SEO-STATE-URL-CANONICAL-CONSOLIDATION-001, NOT this
  // task — so we keep all 51 VALID (pass-through) rather than 404 them here.
  const psdStates = esaStates;

  // Exact valid paths: router statics + generated legacy flat, lower-cased so the
  // classifier matches React Router's default case-insensitive behavior.
  const exactPaths = uniqSort(
    [...exactStatic, ...legacyFlat].map((p) => p.toLowerCase())
  );

  const manifest = {
    EXACT_PATHS: exactPaths,
    ESA_STATES: uniqSort(esaStates),
    PSD_STATES: uniqSort(psdStates),
    BLOG_SLUGS: uniqSort([...blogSlugs]),
    BLOG_STATE_SLUGS: uniqSort([...blogStateSlugs]),
    COLLEGE_SLUGS: uniqSort([...collegeSlugs]),
    DOCTOR_SLUGS: uniqSort([...doctorSlugs]),
    PASS_THROUGH_PREFIXES,
    GONE_SEGMENTS,
  };

  const counts = Object.fromEntries(
    Object.entries(manifest).map(([k, v]) => [k, v.length])
  );

  const body =
    `// GENERATED FILE — DO NOT EDIT BY HAND.\n` +
    `// Source of truth: src/router/config.tsx + src/mocks/*. Regenerate with:\n` +
    `//   npm run gen:routes\n` +
    `// Consumed by middleware.ts (edge 404/410) and scripts/check-route-status.mjs.\n` +
    `// Task: AI-SEO-SOFT-404-ROUTE-STATUS-001\n\n` +
    Object.entries(manifest)
      .map(
        ([k, v]) =>
          `export const ${k}: readonly string[] = ${JSON.stringify(v, null, 2)};`
      )
      .join("\n\n") +
    `\n`;

  return { body, counts };
}

export async function writeManifest() {
  const { body, counts } = await buildManifestSource();
  await mkdir(resolve(ROOT, "src/generated"), { recursive: true });
  await writeFile(resolve(ROOT, "src/generated/routeManifest.ts"), body, "utf8");
  console.log(
    `[gen:routes] wrote src/generated/routeManifest.ts — ` +
      Object.entries(counts)
        .map(([k, n]) => `${k}=${n}`)
        .join(" ")
  );
}

// CLI entry — only when invoked directly (not when imported by the guard).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  writeManifest().catch((err) => {
    console.error("[gen:routes] fatal:", err);
    process.exit(1);
  });
}
