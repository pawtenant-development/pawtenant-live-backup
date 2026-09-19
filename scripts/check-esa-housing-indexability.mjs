#!/usr/bin/env node
// scripts/check-esa-housing-indexability.mjs
//
// PAWTENANT-ESA-HOUSING-CRO-RAW-HTML-LEGAL-001 (owner, 2026-09-17)
//
// OUTPUT-level guard for /esa-letter-housing. The source guard
// (check-esa-housing-redesign.mjs) pins what the component says; this one pins
// what the SERVER ACTUALLY SHIPS, because the defect it exists to prevent was
// invisible in source:
//
//   * the route had no entry in CORE_PAGE_META, so prerender-seo.mjs generated
//     no file for it;
//   * the Vercel catch-all therefore answered it with out/app.html — the
//     neutral SPA shell whose #root is a spinner and the word "Loading…";
//   * that shell carries the HOMEPAGE <title> and the HOMEPAGE canonical
//     (https://pawtenant.com/) and `robots: index, follow`;
//   * the page's own `noindex, nofollow` meta was written by JavaScript after
//     hydration, which no raw-HTML crawler executes.
//
// So the live raw response was an indexable, crawlable page with zero <h1>,
// the homepage's title and a canonical pointing at the homepage. Every part of
// that is asserted against here.
//
// Fails when:
//    1. the route is missing from CORE_PAGE_META, the prerender entry, the
//       sitemap or the raw-H1 coverage list;
//    2. the route is listed in the sitemap zero times, more than once, on the
//       www host, or with a trailing slash;
//    3. the prerendered file is missing;
//    4. #root is empty, or carries the app-shell loading marker;
//    5. there is not exactly one non-empty <h1>, or it is not the approved one;
//    6. the canonical is absent, duplicated, www, or points anywhere but this
//       route (the homepage-canonical regression);
//    7. robots is absent, duplicated, or is not index,follow;
//    8. the raw <title>/description do not match seoConfig exactly;
//    9. the OG / Twitter metadata disagrees with them;
//   10. a FAQ question rendered by the page is missing from the raw HTML
//       (the visible FAQ and the FAQ schema are built from one array, so this
//       is what proves the pair reached the crawler);
//   11. the assessment CTA is not present in the raw HTML;
//   12. a control route regressed (app.html stopped being the shell, or
//       /esa-letter-cost lost its self-canonical).
//
// Usage:
//   node scripts/check-esa-housing-indexability.mjs             → check out/
//   node scripts/check-esa-housing-indexability.mjs --self-test → planted controls
//
// The negative controls mutate IN-MEMORY copies of the real prerendered file,
// so nothing in out/ is ever touched.

import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = join(ROOT, "out");

const ROUTE = "/esa-letter-housing";
const BASE_URL = "https://pawtenant.com";
const CANONICAL = `${BASE_URL}${ROUTE}`;
const APPROVED_H1 = "ESA Letter for Housing From a Licensed Professional";
// The neutral SPA shell's marker (scripts/prerender-seo.mjs → APP_BOOT_SHELL).
const APP_SHELL_MARKER = "pt-boot-spin";

const TAG = "[check-esa-housing-indexability]";

/** Single read point: normalise CRLF→LF exactly once. */
const read = async (p) => (await readFile(p, "utf8")).replace(/\r\n/g, "\n");
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

/* ─────────────────────────── pure checkers ─────────────────────────────── */

/**
 * Balanced <div id="root"> … </div> extraction. The prerendered body contains
 * hundreds of nested <div>s, so a non-greedy regex stops at the FIRST </div>
 * and reports an empty root for every page — walk the depth instead.
 */
export function rootInner(html) {
  const marker = '<div id="root">';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = start + marker.length;
  let depth = 1;
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return html.slice(from, m.index);
    } else if (!m[0].endsWith("/>")) {
      depth++;
    }
  }
  return null;
}

// Attribute values are captured with a BACK-REFERENCED quote character, never
// with [^"']*. Real page copy contains apostrophes ("refund if you don't
// qualify"), and a character class that excludes BOTH quote marks truncates the
// value at the first apostrophe — which reads as a metadata mismatch when the
// metadata is in fact identical.
const ATTR = (name) => `${name}=(["'])([\\s\\S]*?)\\1`;
const allAttrs = (html, re) => [...html.matchAll(re)].map((m) => m[2]);

export const canonicals = (html) =>
  allAttrs(html, new RegExp(`<link\\s[^>]*rel=["']canonical["'][^>]*${ATTR("href")}`, "gi"));
export const robotsMetas = (html) =>
  allAttrs(html, new RegExp(`<meta\\s[^>]*name=["']robots["'][^>]*${ATTR("content")}`, "gi"));
export const titleOf = (html) => html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null;
export const descOf = (html) =>
  html.match(new RegExp(`<meta\\s[^>]*name=["']description["'][^>]*${ATTR("content")}`, "i"))?.[2] ?? null;
export const metaProp = (html, prop) =>
  html.match(new RegExp(`<meta\\s[^>]*(?:property|name)=["']${prop}["'][^>]*${ATTR("content")}`, "i"))?.[2] ?? null;

export function h1s(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
}

/** Everything this guard asserts about ONE prerendered document. */
export function checkDocument(html, { title, description }) {
  const out = [];
  const add = (cond, msg) => { if (!cond) out.push(msg); };

  const root = rootInner(html);
  add(root !== null, "no <div id=\"root\"> in the prerendered file");
  add((root ?? "").trim().length > 0, "#root is EMPTY — the body would only appear after client JavaScript");
  add(!(root ?? "").includes(APP_SHELL_MARKER),
    "#root carries the SPA app-shell loading spinner — the route fell through to out/app.html again");
  add(!/>\s*Loading…\s*</.test(root ?? ""),
    "the raw body is the generic \"Loading…\" shell");

  const heads = h1s(html);
  add(heads.length === 1, `expected exactly one <h1> in the raw HTML, found ${heads.length}`);
  add(heads.length > 0 && heads[0].length > 0, "the raw <h1> is empty / whitespace-only");
  add(heads[0] === APPROVED_H1,
    `the raw <h1> is not the approved heading (got ${JSON.stringify(heads[0] ?? null)})`);

  const cans = canonicals(html);
  add(cans.length === 1, `expected exactly one canonical link, found ${cans.length}`);
  add(cans[0] === CANONICAL,
    `canonical is ${JSON.stringify(cans[0] ?? null)} — it must self-reference ${CANONICAL}`);
  add(!/https:\/\/www\.pawtenant\.com/.test(html), "a www. PawTenant URL appears in the prerendered file");
  add(!cans.some((c) => c === `${CANONICAL}/`), "a trailing-slash canonical variant is present");

  const robots = robotsMetas(html);
  add(robots.length === 1, `expected exactly one robots meta, found ${robots.length}`);
  const r = (robots[0] ?? "").toLowerCase();
  add(/\bindex\b/.test(r) && !/\bnoindex\b/.test(r), `robots is not indexable (${JSON.stringify(robots[0] ?? null)})`);
  add(/\bfollow\b/.test(r) && !/\bnofollow\b/.test(r), `robots is not follow (${JSON.stringify(robots[0] ?? null)})`);

  add(titleOf(html) === title, `raw <title> does not match seoConfig (got ${JSON.stringify(titleOf(html))})`);
  add(descOf(html) === description, "raw meta description does not match seoConfig");
  add(metaProp(html, "og:title") === title, "og:title does not match the page title");
  add(metaProp(html, "og:description") === description, "og:description does not match the page description");
  add(metaProp(html, "og:url") === CANONICAL, `og:url is not ${CANONICAL}`);
  add(metaProp(html, "twitter:title") === title, "twitter:title does not match the page title");
  add(metaProp(html, "twitter:description") === description, "twitter:description does not match the page description");

  return out;
}

/** The `q:` strings inside the page's FAQ_ITEMS array — the SINGLE FAQ source. */
export function faqQuestions(pageSrc) {
  const start = pageSrc.indexOf("const FAQ_ITEMS = [");
  if (start === -1) return [];
  const end = pageSrc.indexOf("\n];", start);
  if (end === -1) return [];
  const block = pageSrc.slice(start, end);
  return [...block.matchAll(/^\s*q:\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) =>
    m[1].replace(/\\"/g, '"'),
  );
}

/** HTML-escape the way React does, so copy can be located in the rendered output. */
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/* ─────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const problems = [];
  const add = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── A · wiring (source) ───────────────────────────────────────────────────
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const seo = await jiti.import(resolve(ROOT, "src/config/seoConfig.ts"));
  const meta = seo.CORE_PAGE_META?.[ROUTE];
  add(!!meta, `${ROUTE} is missing from CORE_PAGE_META — prerender-seo.mjs would generate no file for it`);
  add(!!meta?.title && meta.title.length > 10, "the route has no usable title in CORE_PAGE_META");
  add(!!meta?.description && meta.description.length > 40, "the route has no usable description in CORE_PAGE_META");
  add(seo.BASE_URL === BASE_URL, "seoConfig.BASE_URL is no longer the canonical non-www host");

  const entry = await read(join(ROOT, "src/prerender/entry.tsx"));
  add(/import Pg_esa_letter_housing from "@\/pages\/lp-esa-housing\/page";/.test(entry),
    "src/prerender/entry.tsx no longer imports the housing page");
  add(/\{ path: "\/esa-letter-housing", element: <Pg_esa_letter_housing \/>, source: "src\/pages\/lp-esa-housing\/page.tsx" \}/.test(entry),
    "src/prerender/entry.tsx no longer registers /esa-letter-housing — the body would go back to an empty #root");

  const sitemap = await read(join(ROOT, "public/sitemap.xml"));
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const mine = locs.filter((l) => l === CANONICAL);
  add(mine.length === 1, `${ROUTE} appears in the sitemap ${mine.length}x — it must be listed exactly once`);
  add(!locs.includes(`${CANONICAL}/`), "a trailing-slash duplicate of the route is in the sitemap");
  add(!locs.some((l) => l === `https://www.pawtenant.com${ROUTE}`), "a www duplicate of the route is in the sitemap");

  const coverage = JSON.parse(await read(join(ROOT, "scripts/data/h1-coverage-routes.json")));
  add(coverage.routes.some((r) => r.path === ROUTE),
    "the route is missing from scripts/data/h1-coverage-routes.json — the generic raw-H1 guard would stop covering it");

  const sitemapGuard = await read(join(ROOT, "scripts/check-state-blog-sitemap.mjs"));
  const mustNot = /const MUST_NOT_BE_IN_SITEMAP = \[([\s\S]*?)\];/.exec(sitemapGuard)?.[1] ?? "";
  add(!mustNot.includes(ROUTE),
    "the route is still on check-state-blog-sitemap's MUST_NOT_BE_IN_SITEMAP list — the two contracts contradict each other");

  // ── B · output (out/) ─────────────────────────────────────────────────────
  const file = join(OUT_DIR, ROUTE.replace(/^\//, ""), "index.html");
  const built = await exists(file);
  add(built, `${file} is missing — run \`vite build && node scripts/prerender-seo.mjs && node scripts/prerender-full-body-spike.mjs\``);

  let html = null;
  if (built && meta) {
    html = await read(file);
    for (const p of checkDocument(html, meta)) problems.push(p);

    // The visible FAQ must have reached the crawler. Both the accordion and the
    // FAQPage JSON-LD are generated from FAQ_ITEMS, so proving the questions are
    // in the raw HTML proves the pair agrees in what actually shipped.
    const pageSrc = await read(join(ROOT, "src/pages/lp-esa-housing/page.tsx"));
    const qs = faqQuestions(pageSrc);
    add(qs.length >= 8, `expected at least 8 FAQ questions in FAQ_ITEMS, found ${qs.length}`);
    for (const q of qs) {
      add(html.includes(esc(q)) || html.includes(q), `FAQ question missing from the raw HTML: "${q}"`);
    }

    // The conversion path itself must be in the raw HTML.
    add(/href="\/assessment(\?|")/.test(html), "the assessment CTA is not present in the raw HTML");

    // ── C · control routes must be unaffected ──────────────────────────────
    const shell = join(OUT_DIR, "app.html");
    if (await exists(shell)) {
      const shellHtml = await read(shell);
      add(shellHtml.includes(APP_SHELL_MARKER), "out/app.html is no longer the neutral SPA shell");
    } else {
      problems.push("out/app.html is missing");
    }
    const cost = join(OUT_DIR, "esa-letter-cost", "index.html");
    if (await exists(cost)) {
      const costHtml = await read(cost);
      add(canonicals(costHtml)[0] === `${BASE_URL}/esa-letter-cost`,
        "control route /esa-letter-cost lost its self-referencing canonical");
      add(h1s(costHtml).length === 1, "control route /esa-letter-cost no longer has exactly one raw <h1>");
    } else {
      problems.push("control route out/esa-letter-cost/index.html is missing");
    }
  }

  // ── D · negative controls ────────────────────────────────────────────────
  if (process.argv.includes("--self-test")) {
    if (!html || !meta) {
      console.error(`${TAG} --self-test ABORTED: needs a built out/ and CORE_PAGE_META.`);
      process.exitCode = 1;
      return;
    }
    if (problems.length) {
      console.error(`${TAG} --self-test ABORTED: the real output already fails.`);
      for (const p of problems) console.error(`    - ${p}`);
      process.exitCode = 1;
      return;
    }

    const CONTROLS = [
      {
        // The regression this guard exists for: the route loses its generated
        // file and the Vercel catch-all answers with out/app.html instead.
        // Built by swapping the REAL #root contents for the real shell markup —
        // a regex across a body with hundreds of nested <div>s cannot do it.
        name: "the route falls back to the SPA shell (empty #root + spinner)",
        html: html.replace(
          rootInner(html),
          `<div style="animation:pt-boot-spin .7s linear infinite"></div><div>Loading…</div>`,
        ),
        expect: /app-shell loading spinner|Loading…/,
      },
      {
        name: "the raw H1 disappears",
        html: html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, ""),
        expect: /found 0/,
      },
      {
        name: "a second H1 is introduced",
        html: html.replace(/<h1\b/i, "<h1>Another heading</h1><h1"),
        expect: /found 2/,
      },
      {
        name: "the H1 becomes a different heading",
        html: html.replace(APPROVED_H1, "Cheap ESA paperwork"),
        expect: /not the approved heading/,
      },
      {
        name: "the canonical regresses to the homepage",
        html: html.replace(`href="${CANONICAL}"`, `href="${BASE_URL}/"`),
        expect: /must self-reference/,
      },
      {
        name: "the canonical becomes the www host",
        html: html.replace(`href="${CANONICAL}"`, `href="https://www.pawtenant.com${ROUTE}"`),
        expect: /www\.|must self-reference/,
      },
      {
        name: "noindex returns",
        html: html.replace(/(<meta\s[^>]*name="robots"[^>]*content=")[^"]*(")/i, "$1noindex, nofollow$2"),
        expect: /not indexable/,
      },
      {
        name: "nofollow returns",
        html: html.replace(/(<meta\s[^>]*name="robots"[^>]*content=")[^"]*(")/i, "$1index, nofollow$2"),
        expect: /not follow/,
      },
      {
        name: "a second robots meta is appended",
        html: html.replace(/<\/head>/i, '<meta name="robots" content="noindex" /></head>'),
        expect: /exactly one robots meta/,
      },
      {
        name: "the title regresses to the homepage title",
        html: html.replace(/<title>[\s\S]*?<\/title>/i, "<title>ESA Letter Online | Licensed Professionals</title>"),
        expect: /<title> does not match/,
      },
      {
        name: "og:url points somewhere else",
        html: html.replace(`content="${CANONICAL}"`, `content="${BASE_URL}/"`),
        expect: /og:url is not/,
      },
      {
        name: "a visible FAQ question is dropped from the body",
        html: null, // built below, needs the question text
        expect: /FAQ question missing/,
      },
    ];

    // Build the FAQ control from a real question.
    const pageSrc = await read(join(ROOT, "src/pages/lp-esa-housing/page.tsx"));
    const firstQ = faqQuestions(pageSrc)[0];
    CONTROLS[CONTROLS.length - 1].html = html.split(esc(firstQ)).join("REMOVED").split(firstQ).join("REMOVED");

    let bad = 0;
    console.log(`${TAG} negative controls (each planted defect must be REJECTED)\n`);
    for (const c of CONTROLS) {
      if (c.html === html || c.html == null) {
        console.error(`  \u2717 ${c.name} — the plant did not change the document; the control proves nothing`);
        bad++;
        continue;
      }
      const found = checkDocument(c.html, meta);
      // The FAQ control is checked by the caller-level loop, not checkDocument.
      const extra = [];
      if (/FAQ question missing/.test(String(c.expect))) {
        for (const q of faqQuestions(pageSrc)) {
          if (!c.html.includes(esc(q)) && !c.html.includes(q)) extra.push(`FAQ question missing from the raw HTML: "${q}"`);
        }
      }
      const all = [...found, ...extra];
      if (all.some((m) => c.expect.test(m))) {
        console.log(`  \u2713 detected: ${c.name}`);
      } else {
        console.error(`  \u2717 ${c.name} — NOT detected. Reported: ${all.join(" | ") || "(nothing)"}`);
        bad++;
      }
    }
    if (bad) {
      console.error(`\n${TAG} --self-test FAILED — ${bad} control(s) were not detected.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n${TAG} --self-test OK — all ${CONTROLS.length} planted negative controls were detected.`);
    return;
  }

  if (problems.length) {
    console.error(`${TAG} FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  \u2717 ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `${TAG} OK — ${ROUTE} is prerendered with a real body, exactly one approved <h1>, ` +
      `a self-referencing canonical, index,follow, matching title/description/OG/Twitter, ` +
      `its full visible FAQ in the raw HTML, and exactly one sitemap entry.`,
  );
}

main().catch((err) => {
  console.error(`${TAG} fatal:`, err);
  process.exitCode = 1;
});
