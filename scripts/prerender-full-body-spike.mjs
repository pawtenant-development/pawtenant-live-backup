// scripts/prerender-full-body-spike.mjs
//
// AI-SEO-FULL-BODY-PRERENDER-SPIKE-001
//
// Runs AFTER `vite build` + `scripts/prerender-seo.mjs`. For each approved
// INNER spike route it renders the REAL page component to a static HTML string
// (via Vite's SSR pipeline + src/prerender/entry.tsx) and injects that markup
// into the route's already-generated out/<route>/index.html — replacing the
// empty `<div id="root"></div>` with meaningful, route-specific body content.
//
// The homepage ("/") is NOT handled here: it keeps its tuned static-hero /
// lazy-section architecture from prerender-seo.mjs (full SSR of the homepage
// would regress its carefully-optimised mobile LCP).
//
// Contract (see task card + owner constraints):
//   - Real components are the single source of truth. No hand-authored copy.
//   - Vite SSR via ssrLoadModule so unplugin-auto-import + "@/" alias apply.
//   - Placeholder Supabase env values (below) exist ONLY so the module-scope
//     createClient() in src/lib/supabaseClient.ts can instantiate; no network
//     or Supabase call is made — every query lives in useEffect, which
//     renderToStaticMarkup never runs. The values are build-time env only,
//     never written into source.
//   - JSON-LD + head-belonging tags are stripped from the SSR body so schema
//     stays emitted exactly once (by prerender-seo.mjs's <head> + the runtime
//     SEOManager/page effects on the client). No duplicate JSON-LD.
//   - Client still uses createRoot(); this markup is an SSR-only first paint
//     that React clears and re-renders with an identical tree on mount.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");

// ── Placeholder Supabase env (module-init only) ──────────────────────────────
// Only set if absent, so a real env (Vercel/CI) still wins. Vite exposes VITE_*
// vars already present in process.env to import.meta.env, which is what
// src/lib/supabaseClient.ts reads. createClient() with these values instantiates
// the client object but makes no request; no query runs during static render.
process.env.VITE_PUBLIC_SUPABASE_URL ||= "https://prerender-placeholder.supabase.co";
process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||= "prerender-placeholder-anon-key";

function routeToFile(route) {
  return route === "/"
    ? join(OUT_DIR, "index.html")
    : join(OUT_DIR, route.replace(/^\//, ""), "index.html");
}

// Resolve the client chunk (+ its static-import chunks) for a route's page from
// the Vite manifest and return <link rel="modulepreload"> tags. Preloading the
// lazily-loaded route chunk makes it ready by the time createRoot() mounts, so
// the client render is immediate (no Suspense/PageLoader gap after the SSR'd
// first paint). Excludes the main entry chunk (already loaded via <script>).
// Returns "" (safe no-op) if the manifest or the page entry is missing.
async function buildRouteModulePreloads(manifest, sourceKey) {
  if (!manifest || !sourceKey) return "";
  const entry = manifest[sourceKey];
  if (!entry || !entry.file) return "";
  const files = new Set([entry.file]);
  const visit = (key) => {
    const node = manifest[key];
    if (!node) return;
    if (node.file) files.add(node.file);
    (node.imports || []).forEach(visit);
  };
  (entry.imports || []).forEach(visit);
  const mainEntry = Object.values(manifest).find((n) => n.isEntry);
  if (mainEntry && mainEntry.file) files.delete(mainEntry.file);
  return Array.from(files)
    .map((f) => `<link rel="modulepreload" crossorigin href="/${f}" />`)
    .join("\n    ");
}

async function loadManifest() {
  const path = join(OUT_DIR, ".vite", "manifest.json");
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    console.warn("[prerender-full-body] WARN: out/.vite/manifest.json not found — modulepreload skipped.");
    return null;
  }
}

// Strip document-metadata tags React rendered inline in the body: ALL JSON-LD
// (schema is owned by the <head> + runtime), plus any <title>/<meta>/<link> a
// page emits in JSX (they belong in <head>, already authoritative there). Leaves
// all visible content untouched.
function cleanSsrBody(html) {
  return html
    .replace(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*?\/?>/gi, "")
    .replace(/<link\b[^>]*?\/?>/gi, "");
}

async function main() {
  const server = await createServer({
    root: ROOT,
    logLevel: "warn",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true },
  });

  let mod;
  try {
    mod = await server.ssrLoadModule("/src/prerender/entry.tsx");
  } catch (err) {
    await server.close();
    console.error(
      "[prerender-full-body] FATAL: could not load SSR entry — the app is not " +
        "SSR-safe for the spike routes without invasive changes. Reporting rather " +
        "than substituting hand-authored copy (per task constraint #11).",
    );
    console.error(err);
    process.exit(1);
  }

  const { renderRoute, SPIKE_ROUTES, ROUTE_SOURCE, getRouteHeadJsonLd } = mod;
  if (typeof renderRoute !== "function" || !Array.isArray(SPIKE_ROUTES)) {
    await server.close();
    console.error("[prerender-full-body] FATAL: entry did not export renderRoute/SPIKE_ROUTES.");
    process.exit(1);
  }

  const manifest = await loadManifest();
  const written = [];
  const failed = [];

  for (const route of SPIKE_ROUTES) {
    const file = routeToFile(route);
    let template;
    try {
      template = await readFile(file, "utf8");
    } catch {
      failed.push({ route, why: `generated file missing (${file}) — run prerender-seo first` });
      continue;
    }
    if (!template.includes('<div id="root"></div>')) {
      failed.push({ route, why: `no empty <div id="root"></div> to inject into (${file})` });
      continue;
    }

    let rawBody;
    try {
      rawBody = renderRoute(route);
    } catch (err) {
      // Per constraint #11: stop on this route and report — never substitute copy.
      failed.push({ route, why: `SSR render threw: ${err?.message || err}` });
      continue;
    }

    const body = cleanSsrBody(rawBody);
    // Sanity: a real page must produce a non-trivial body with an <h1>. A bare
    // Suspense/PageLoader fallback ("Loading…", no <h1>) means the component
    // could not render statically — report it, don't ship an empty shell.
    if (!body.trim() || !/<h1[\s/>]/i.test(body)) {
      failed.push({ route, why: "SSR body empty or has no <h1> (Suspense fallback / not SSR-safe)" });
      continue;
    }

    let html = template.replace('<div id="root"></div>', `<div id="root">${body}</div>`);

    // Inject <link rel="modulepreload"> for this route's client chunk so the
    // lazy route module is ready when createRoot() mounts (no spinner gap).
    const preloads = await buildRouteModulePreloads(manifest, ROUTE_SOURCE?.[route]);
    if (preloads) html = html.replace(/<\/head>/i, `    ${preloads}\n  </head>`);

    // Inject provider structured data into <head> (ProfilePage/Person/Breadcrumb
    // for /doctors/<slug>; CollectionPage/ItemList for /our-providers). Emitted
    // here — not in JSX — because the body's JSON-LD is stripped by cleanSsrBody,
    // so the head is the single authoritative copy in the raw HTML.
    // AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001.
    if (typeof getRouteHeadJsonLd === "function") {
      const headLd = getRouteHeadJsonLd(route);
      if (headLd) html = html.replace(/<\/head>/i, `    ${headLd}\n  </head>`);
    }

    await writeFile(file, html, "utf8");
    written.push({ route, bytes: Buffer.byteLength(body, "utf8") });
  }

  await server.close();

  for (const w of written) {
    console.log(`[prerender-full-body] ✓ ${w.route} — injected ${w.bytes} bytes of body`);
  }
  for (const f of failed) {
    console.error(`[prerender-full-body] ✗ ${f.route} — ${f.why}`);
  }
  console.log(
    `[prerender-full-body] wrote ${written.length}/${SPIKE_ROUTES.length} spike routes ` +
      `(${failed.length} failed) — source: real components via src/prerender/entry.tsx`,
  );

  // Force exit: the placeholder Supabase client may schedule internal timers
  // that would otherwise keep the event loop alive after writes complete.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[prerender-full-body] fatal:", err);
  process.exit(1);
});
