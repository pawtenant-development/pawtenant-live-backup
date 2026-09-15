// scripts/check-state-blog-sitemap.mjs
//
// SEO-SITEMAP-STATE-BLOG-HUBS-001 (2026-09-16)
//
// A Semrush crawl on 2026-09-15 reported 51 indexable PawTenant state-blog
// URLs — /blog/state/<slug> for the 50 states + Washington, DC — that returned
// 200, were self-canonical and carried "index, follow", yet appeared in no
// sitemap at all. Google could only ever reach them through the single /blog
// inlink.
//
// public/sitemap.xml IS the source for this site (it is hand-maintained and
// served verbatim; there is no generator step). The real source of truth for
// WHICH state hubs exist is STATE_BLOG_MAP in src/mocks/stateBlogMap.ts — the
// same module the router, the page component and scripts/prerender-seo.mjs all
// read. This guard binds the two together so the class of drift that caused
// the original omission cannot ship again.
//
// Static assertions (always run, no network):
//   1. Every STATE_BLOG_MAP slug appears in the sitemap EXACTLY once.
//   2. No /blog/state/ URL in the sitemap is absent from STATE_BLOG_MAP
//      (a sitemap entry with no page behind it would 404 for a crawler).
//   3. No www. host anywhere in the sitemap — canonical is the bare apex.
//   4. No http:// URL and no non-pawtenant.com host.
//   5. No trailing-slash duplicate of a slash-less URL (and vice versa).
//   6. No duplicate <loc> anywhere in the sitemap.
//   7. No route declared noindex/not-in-sitemap (the paid landing pages and
//      the recovery funnel) appears in the sitemap.
//
// Network assertion (opt-in, --verify-http): every /blog/state/ URL in the
// sitemap answers 200, without redirecting, with a self-referencing canonical
// and an indexable robots meta. Kept opt-in so `npm run build` stays offline-
// safe; run it manually (or in a scheduled SEO job) for live evidence.
//
// Usage:
//   node scripts/check-state-blog-sitemap.mjs               → static checks
//   node scripts/check-state-blog-sitemap.mjs --self-test   → planted negative
//                                                             controls
//   node scripts/check-state-blog-sitemap.mjs --verify-http → also fetch live
//
// Negative controls (--self-test) plant each failure mode into an IN-MEMORY
// copy of the sitemap text and assert the checker reports it. Nothing on disk
// is ever mutated, so an interrupted run cannot leave a damaged sitemap behind.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SITEMAP_FILE = "public/sitemap.xml";
const STATE_BLOG_MAP_FILE = "src/mocks/stateBlogMap.ts";
const CANONICAL_HOST = "pawtenant.com";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

// Routes the router explicitly documents as noindex / not-in-sitemap.
const MUST_NOT_BE_IN_SITEMAP = [
  "/esa-letter-housing",
  "/meta-esa-letter",
  "/consultation-request",
];

// ── Single read point: normalise CRLF→LF exactly once so a Windows checkout
// and a Linux CI runner see byte-identical text for every assertion below. ───
function normalise(text) {
  return text.replace(/\r\n/g, "\n");
}

async function readSource(rel) {
  return normalise(await readFile(resolve(ROOT, rel), "utf8"));
}

function expectedSlugs(stateBlogMapText) {
  const slugs = [...stateBlogMapText.matchAll(/stateSlug:\s*"([a-z-]+)"/g)].map(
    (m) => m[1],
  );
  return slugs;
}

function allLocs(sitemapText) {
  return [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Run every static assertion against the given text pair and return a list of
 * human-readable failures. Pure: takes text, returns findings, touches nothing.
 */
function collectFindings(sitemapText, stateBlogMapText) {
  const findings = [];
  const slugs = expectedSlugs(stateBlogMapText);
  const locs = allLocs(sitemapText);

  if (slugs.length !== 51) {
    findings.push(
      `STATE_BLOG_MAP has ${slugs.length} stateSlug entries, expected 51 (50 states + DC).`,
    );
  }

  // ── 1 + 2: exact parity between the map and the sitemap ──────────────────
  const stateLocs = locs.filter((u) => u.includes("/blog/state/"));
  const counts = new Map();
  for (const u of stateLocs) counts.set(u, (counts.get(u) ?? 0) + 1);

  for (const slug of slugs) {
    const want = `${CANONICAL_ORIGIN}/blog/state/${slug}`;
    const n = counts.get(want) ?? 0;
    if (n === 0) findings.push(`MISSING from sitemap: ${want}`);
    else if (n > 1) findings.push(`DUPLICATE in sitemap (${n}x): ${want}`);
  }

  const known = new Set(slugs.map((s) => `${CANONICAL_ORIGIN}/blog/state/${s}`));
  for (const u of new Set(stateLocs)) {
    if (!known.has(u)) {
      findings.push(
        `sitemap lists ${u} but no matching stateSlug exists in ${STATE_BLOG_MAP_FILE} — a crawler would 404.`,
      );
    }
  }

  // ── 3 + 4: canonical host discipline across the WHOLE sitemap ────────────
  for (const u of locs) {
    if (/^https?:\/\/www\./i.test(u)) findings.push(`www host in sitemap: ${u}`);
    else if (/^http:\/\//i.test(u)) findings.push(`insecure http:// in sitemap: ${u}`);
    else if (!u.startsWith(`${CANONICAL_ORIGIN}/`) && u !== `${CANONICAL_ORIGIN}/`) {
      findings.push(`non-canonical host in sitemap: ${u}`);
    }
  }

  // ── 5: trailing-slash duplicates ─────────────────────────────────────────
  const locSet = new Set(locs);
  for (const u of locs) {
    if (u === `${CANONICAL_ORIGIN}/`) continue; // the homepage legitimately ends in /
    if (u.endsWith("/") && locSet.has(u.slice(0, -1))) {
      findings.push(`trailing-slash duplicate of ${u.slice(0, -1)}: ${u}`);
    }
  }

  // ── 6: any duplicate <loc> at all ────────────────────────────────────────
  const allCounts = new Map();
  for (const u of locs) allCounts.set(u, (allCounts.get(u) ?? 0) + 1);
  for (const [u, n] of allCounts) {
    if (n > 1 && !u.includes("/blog/state/")) {
      findings.push(`duplicate <loc> (${n}x): ${u}`);
    }
  }

  // ── 7: noindex routes must never be listed ───────────────────────────────
  for (const path of MUST_NOT_BE_IN_SITEMAP) {
    if (locSet.has(`${CANONICAL_ORIGIN}${path}`)) {
      findings.push(`noindex route listed in sitemap: ${CANONICAL_ORIGIN}${path}`);
    }
  }

  return findings;
}

// ── Live verification (opt-in) ──────────────────────────────────────────────
async function verifyHttp(sitemapText) {
  const findings = [];
  const urls = allLocs(sitemapText).filter((u) => u.includes("/blog/state/"));
  console.log(`[check-state-blog-sitemap] fetching ${urls.length} state hub URLs…`);

  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, { redirect: "manual" });
    } catch (err) {
      findings.push(`${url} — fetch failed: ${err?.message ?? err}`);
      continue;
    }
    if (res.status !== 200) {
      findings.push(`${url} — HTTP ${res.status} (expected 200; redirected routes must not be listed)`);
      continue;
    }
    const html = await res.text();
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    if (canonical !== url) {
      findings.push(`${url} — canonical is ${canonical ?? "<none>"} (expected self)`);
    }
    const robots = html.match(/<meta name="robots" content="([^"]+)"/i)?.[1] ?? "";
    if (/noindex/i.test(robots)) {
      findings.push(`${url} — robots "${robots}" is non-indexable but the URL is in the sitemap`);
    }
  }
  return findings;
}

// ── Negative controls ───────────────────────────────────────────────────────
async function selfTest() {
  const sitemap = await readSource(SITEMAP_FILE);
  const map = await readSource(STATE_BLOG_MAP_FILE);

  const baseline = collectFindings(sitemap, map);
  if (baseline.length) {
    console.error(
      "[check-state-blog-sitemap] --self-test ABORTED: the real sitemap already fails.",
    );
    for (const f of baseline) console.error(`    - ${f}`);
    process.exitCode = 1;
    return;
  }

  const oregon = `${CANONICAL_ORIGIN}/blog/state/oregon`;
  const oregonLine = `  <url><loc>${oregon}</loc><lastmod>2026-09-16</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>`;
  if (!sitemap.includes(oregonLine)) {
    console.error(
      "[check-state-blog-sitemap] --self-test ABORTED: the Oregon anchor line moved; " +
        "update the planted controls so they still mutate real content.",
    );
    process.exitCode = 1;
    return;
  }

  const controls = [
    {
      name: "missing state page (Oregon dropped from the sitemap)",
      sitemap: sitemap.replace(oregonLine + "\n", ""),
      map,
      expect: /MISSING from sitemap: .*\/blog\/state\/oregon/,
    },
    {
      name: "duplicate URL (Oregon listed twice)",
      sitemap: sitemap.replace(oregonLine, oregonLine + "\n" + oregonLine),
      map,
      expect: /DUPLICATE in sitemap \(2x\): .*\/blog\/state\/oregon/,
    },
    {
      name: "non-indexable route added (/esa-letter-housing is noindex)",
      sitemap: sitemap.replace(
        oregonLine,
        oregonLine +
          `\n  <url><loc>${CANONICAL_ORIGIN}/esa-letter-housing</loc><priority>0.8</priority></url>`,
      ),
      map,
      expect: /noindex route listed in sitemap/,
    },
    {
      name: "canonical-host mismatch (www. duplicate added)",
      sitemap: sitemap.replace(
        oregonLine,
        oregonLine +
          `\n  <url><loc>https://www.${CANONICAL_HOST}/blog/state/oregon</loc><priority>0.8</priority></url>`,
      ),
      map,
      expect: /www host in sitemap/,
    },
    {
      name: "trailing-slash duplicate added",
      sitemap: sitemap.replace(
        oregonLine,
        oregonLine +
          `\n  <url><loc>${oregon}/</loc><priority>0.8</priority></url>`,
      ),
      map,
      expect: /trailing-slash duplicate of/,
    },
    {
      name: "sitemap entry with no page behind it",
      sitemap: sitemap.replace(
        oregonLine,
        oregonLine +
          `\n  <url><loc>${CANONICAL_ORIGIN}/blog/state/atlantis</loc><priority>0.8</priority></url>`,
      ),
      map,
      expect: /no matching stateSlug exists/,
    },
    {
      name: "a state added to STATE_BLOG_MAP but not to the sitemap",
      sitemap,
      map: map.replace(
        'stateSlug: "oregon"',
        'stateSlug: "atlantis"',
      ),
      expect: /MISSING from sitemap: .*\/blog\/state\/atlantis/,
    },
  ];

  let failed = 0;
  for (const c of controls) {
    const found = collectFindings(c.sitemap, c.map);
    const caught = found.some((f) => c.expect.test(f));
    if (caught) {
      console.log(`  ✓ detected: ${c.name}`);
    } else {
      failed++;
      console.error(`  ✗ NOT DETECTED: ${c.name}`);
      console.error(`      expected a finding matching ${c.expect}`);
      console.error(`      got: ${found.length ? found.join(" | ") : "<no findings>"}`);
    }
  }

  if (failed) {
    console.error(
      `[check-state-blog-sitemap] --self-test FAILED — ${failed}/${controls.length} planted control(s) went undetected.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-state-blog-sitemap] --self-test OK — all ${controls.length} planted negative controls were detected.`,
  );
}

async function main() {
  if (process.argv.includes("--self-test")) {
    await selfTest();
    return;
  }

  const sitemap = await readSource(SITEMAP_FILE);
  const map = await readSource(STATE_BLOG_MAP_FILE);
  const findings = collectFindings(sitemap, map);

  if (process.argv.includes("--verify-http")) {
    findings.push(...(await verifyHttp(sitemap)));
  }

  if (findings.length) {
    console.error("[check-state-blog-sitemap] FAILED:");
    for (const f of findings) console.error(`    - ${f}`);
    console.error(
      `\n  → ${SITEMAP_FILE} is the sitemap source. Keep its /blog/state/ block in` +
        `\n    exact parity with STATE_BLOG_MAP in ${STATE_BLOG_MAP_FILE}.`,
    );
    process.exitCode = 1;
    return;
  }

  const n = expectedSlugs(map).length;
  console.log(
    `[check-state-blog-sitemap] OK — all ${n} state blog hubs listed exactly once, ` +
      `canonical host only, no trailing-slash or www duplicates, no noindex routes.`,
  );
}

main().catch((err) => {
  console.error("[check-state-blog-sitemap] fatal:", err);
  process.exitCode = 1;
});
