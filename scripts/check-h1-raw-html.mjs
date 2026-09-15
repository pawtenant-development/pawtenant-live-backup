// scripts/check-h1-raw-html.mjs
//
// SEO-H1-RAW-HTML-COVERAGE-001 — 2026-09-16
//
// A Semrush crawl on 2026-09-15 reported 270 indexable PawTenant URLs with
// "No. of H1 = 0". None of those pages was actually missing a heading: each one
// renders exactly one <h1> as soon as React mounts, most of them through a
// shared layout component. What they were missing was a BODY in the raw HTML —
// scripts/prerender-seo.mjs gave them a correct <head> and left
// <div id="root"></div> empty, so a crawler that does not execute JavaScript
// saw no heading at all.
//
// scripts/prerender-full-body-spike.mjs now renders the real component tree for
// every one of those routes. This guard is what stops that coverage from
// silently regressing — a route dropped from src/prerender/entry.tsx would go
// straight back to an empty #root with no other symptom.
//
// It reads the GENERATED output in out/, never the source, because the whole
// defect was a gap between what the components render and what the server ships.
//
// Fails when, for any route in scripts/data/h1-coverage-routes.json:
//   1. the prerendered file is missing entirely;
//   2. #root is empty — the H1 would only appear after client-side JavaScript;
//   3. there is no <h1> in the raw HTML;
//   4. the <h1> is empty / whitespace-only;
//   5. there is more than one <h1>;
//   6. the <h1> is hidden (hidden attr, display:none, visibility:hidden,
//      aria-hidden, or an sr-only utility class);
//   7. the wrong shared template was rendered — the page carries the app-shell
//      fallback marker, or its <h1> is the homepage's;
//   8. the canonical link is absent or does not self-reference the route.
//
// Usage:
//   node scripts/check-h1-raw-html.mjs              → check out/
//   node scripts/check-h1-raw-html.mjs --self-test  → planted negative controls
//   node scripts/check-h1-raw-html.mjs --summary    → per-template coverage table
//
// The negative controls mutate IN-MEMORY copies of a real prerendered file, so
// nothing in out/ is ever touched.

import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = join(ROOT, "out");
const ROUTES_FILE = join(__dirname, "data", "h1-coverage-routes.json");

const BASE_URL = "https://pawtenant.com";

// A route that falls through to the homepage template (or to the app shell)
// renders the HOMEPAGE's heading instead of its own. The comparison must be on
// the WHOLE heading text, read from out/index.html at run time — matching on a
// fragment such as "Emotional Support Animal Letter" produces false positives,
// because plenty of genuine article headings contain that exact phrase.
let homepageH1Text = null;

function routeToFile(route) {
  return route === "/"
    ? join(OUT_DIR, "index.html")
    : join(OUT_DIR, route.replace(/^\//, ""), "index.html");
}

/** Single read point: normalise CRLF→LF exactly once. */
async function readHtml(route) {
  return (await readFile(routeToFile(route), "utf8")).replace(/\r\n/g, "\n");
}

/**
 * Balanced <div id="root"> … </div> extraction. The prerendered body contains
 * hundreds of nested <div>s, so a non-greedy regex stops at the FIRST </div>
 * and reports an empty root for every page — walk the depth instead.
 * Same technique as scripts/check-full-body-prerender.mjs.
 */
function rootInnerRange(html) {
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
      if (depth === 0) return { start: contentStart, end: m.index };
    } else {
      depth++;
    }
  }
  return null;
}

function rootInnerHtml(html) {
  const range = rootInnerRange(html);
  return range ? html.slice(range.start, range.end) : null;
}

/** Blank out #root the way an unregistered route would ship. Test-only. */
function withEmptyRoot(html) {
  const range = rootInnerRange(html);
  if (!range) return html;
  return html.slice(0, range.start) + html.slice(range.end);
}

function findH1s(html) {
  return [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)].map((m) => ({
    attrs: m[1] ?? "",
    inner: m[2] ?? "",
  }));
}

function visibleText(innerHtml) {
  return innerHtml
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHidden(attrs) {
  if (/\bhidden\b(?!-)/i.test(attrs)) return "hidden attribute";
  if (/aria-hidden\s*=\s*["']true["']/i.test(attrs)) return "aria-hidden=true";
  if (/style\s*=\s*["'][^"']*display\s*:\s*none/i.test(attrs)) return "display:none";
  if (/style\s*=\s*["'][^"']*visibility\s*:\s*hidden/i.test(attrs)) return "visibility:hidden";
  if (/class\s*=\s*["'][^"']*\bsr-only\b/i.test(attrs)) return "sr-only class";
  if (/class\s*=\s*["'][^"']*\bhidden\b/i.test(attrs)) return "hidden utility class";
  return null;
}

function canonicalOf(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] ?? null;
}

/**
 * Assert one route's prerendered HTML. Pure: takes html text, returns findings.
 */
function checkHtml(route, html, expectedTemplate) {
  const findings = [];
  const label = `${route}${expectedTemplate ? ` [${expectedTemplate}]` : ""}`;

  const root = rootInnerHtml(html);
  if (root === null) {
    findings.push(`${label}: could not locate <div id="root"> in the prerendered HTML.`);
    return findings;
  }
  if (root.trim() === "") {
    findings.push(
      `${label}: #root is EMPTY — the <h1> would only exist after client-side JavaScript runs. ` +
        "Register the route in src/prerender/entry.tsx.",
    );
    return findings;
  }

  const h1s = findH1s(root);
  if (h1s.length === 0) {
    findings.push(`${label}: no <h1> in the raw prerendered body.`);
    return findings;
  }
  if (h1s.length > 1) {
    findings.push(
      `${label}: ${h1s.length} <h1> elements in the raw body (expected exactly 1): ` +
        h1s.map((h) => JSON.stringify(visibleText(h.inner).slice(0, 40))).join(", "),
    );
  }

  const h1 = h1s[0];
  const text = visibleText(h1.inner);
  if (!text) {
    findings.push(`${label}: the <h1> is empty / whitespace-only.`);
  }

  const hidden = isHidden(h1.attrs);
  if (hidden) {
    findings.push(`${label}: the <h1> is hidden (${hidden}). A hidden heading does not count.`);
  }

  // Wrong shared template / app-shell fallback.
  if (route !== "/" && text && homepageH1Text && text === homepageH1Text) {
    findings.push(
      `${label}: renders the HOMEPAGE heading verbatim (${JSON.stringify(text.slice(0, 60))}) — ` +
        "the route fell through to the wrong template.",
    );
  }
  if (/id="app-shell"|class="pt-app-shell"/i.test(root)) {
    findings.push(`${label}: renders the neutral app-shell fallback, not its own page component.`);
  }

  // Canonical must self-reference this exact route.
  const canonical = canonicalOf(html);
  const expected = `${BASE_URL}${route}`;
  if (!canonical) {
    findings.push(`${label}: no <link rel="canonical"> in the prerendered head.`);
  } else if (canonical !== expected) {
    findings.push(
      `${label}: canonical is ${canonical}, expected ${expected} — the canonical route changed unexpectedly.`,
    );
  }

  return findings;
}

/** Read the homepage's own <h1> text once, for the wrong-template comparison. */
async function loadHomepageH1() {
  try {
    const html = await readHtml("/");
    const root = rootInnerHtml(html);
    const h1s = findH1s(root ?? html);
    homepageH1Text = h1s.length ? visibleText(h1s[0].inner) : null;
  } catch {
    homepageH1Text = null;
  }
}

async function loadRoutes() {
  const raw = JSON.parse(await readFile(ROUTES_FILE, "utf8"));
  if (!Array.isArray(raw.routes) || raw.routes.length === 0) {
    throw new Error(`${ROUTES_FILE} has no routes`);
  }
  return raw;
}

async function run() {
  await loadHomepageH1();
  const { routes, count } = await loadRoutes();
  const findings = [];
  const okByTemplate = new Map();
  let checked = 0;

  for (const r of routes) {
    let html;
    try {
      html = await readHtml(r.path);
    } catch {
      findings.push(
        `${r.path} [${r.template}]: prerendered file missing (${routeToFile(r.path)}). ` +
          "Run `npx vite build && node scripts/prerender-seo.mjs && node scripts/prerender-full-body-spike.mjs` first.",
      );
      continue;
    }
    checked++;
    const f = checkHtml(r.path, html, r.template);
    if (f.length) findings.push(...f);
    else okByTemplate.set(r.template, (okByTemplate.get(r.template) ?? 0) + 1);
  }

  return { findings, checked, total: count, okByTemplate };
}

async function summary() {
  const { findings, checked, total, okByTemplate } = await run();
  const rows = [...okByTemplate.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[check-h1-raw-html] ${checked}/${total} routes read from out/`);
  for (const [tpl, n] of rows) console.log(`  ${String(n).padStart(4)}  ${tpl}`);
  if (findings.length) {
    console.log(`\n  ${findings.length} finding(s):`);
    for (const f of findings) console.log(`    - ${f}`);
  }
}

async function selfTest() {
  await loadHomepageH1();
  const { routes } = await loadRoutes();

  // Use a real, currently-passing prerendered page as the fixture.
  let fixture = null;
  for (const r of routes) {
    try {
      const html = await readHtml(r.path);
      if (checkHtml(r.path, html, r.template).length === 0) {
        fixture = { route: r.path, template: r.template, html };
        break;
      }
    } catch {
      /* keep looking */
    }
  }
  if (!fixture) {
    console.error(
      "[check-h1-raw-html] --self-test ABORTED: no passing prerendered route to plant controls into. " +
        "Build first, and make sure the real check passes.",
    );
    process.exitCode = 1;
    return;
  }

  const { route, template, html } = fixture;
  const h1Match = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  const h1 = h1Match?.[0];
  if (!h1) {
    console.error("[check-h1-raw-html] --self-test ABORTED: fixture has no <h1> to mutate.");
    process.exitCode = 1;
    return;
  }
  const h1Attrs = h1.match(/<h1\b([^>]*)>/i)[1];
  const h1Inner = h1.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)[1];

  const controls = [
    {
      name: "H1 missing (element removed)",
      html: html.replace(h1, "<p>heading removed</p>"),
      expect: /no <h1> in the raw prerendered body/,
    },
    {
      name: "H1 empty",
      html: html.replace(h1, `<h1${h1Attrs}>   </h1>`),
      expect: /empty \/ whitespace-only/,
    },
    {
      name: "more than one H1",
      html: html.replace(h1, `${h1}<h1>A second heading</h1>`),
      expect: /2 <h1> elements in the raw body/,
    },
    {
      name: "H1 only after client-side JavaScript (empty #root)",
      html: withEmptyRoot(html),
      expect: /#root is EMPTY/,
    },
    {
      name: "hidden H1 (sr-only)",
      html: html.replace(h1, `<h1 class="sr-only">${h1Inner}</h1>`),
      expect: /the <h1> is hidden \(sr-only class\)/,
    },
    {
      name: "hidden H1 (display:none)",
      html: html.replace(h1, `<h1 style="display:none">${h1Inner}</h1>`),
      expect: /the <h1> is hidden \(display:none\)/,
    },
    {
      name: "wrong shared template rendered (homepage heading leaks in)",
      html: html.replace(h1, `<h1>${homepageH1Text ?? "Get Your Emotional Support Animal Letter Today"}</h1>`),
      expect: /renders the HOMEPAGE heading verbatim/,
    },
    {
      name: "canonical route changed unexpectedly",
      html: html.replace(
        /<link rel="canonical" href="[^"]+"/i,
        `<link rel="canonical" href="${BASE_URL}/somewhere-else"`,
      ),
      expect: /canonical is .*somewhere-else.*expected/,
    },
  ];

  console.log(`  fixture: ${route} [${template}]`);
  let failed = 0;
  for (const c of controls) {
    const found = checkHtml(route, c.html, template);
    if (found.some((f) => c.expect.test(f))) {
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
      `[check-h1-raw-html] --self-test FAILED — ${failed}/${controls.length} planted control(s) went undetected.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-h1-raw-html] --self-test OK — all ${controls.length} planted negative controls were detected.`,
  );
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (process.argv.includes("--summary")) return summary();

  const { findings, checked, total } = await run();
  if (findings.length) {
    console.error(`[check-h1-raw-html] FAILED — ${findings.length} finding(s):`);
    for (const f of findings) console.error(`    - ${f}`);
    console.error(
      "\n  → Every route in scripts/data/h1-coverage-routes.json must render exactly one" +
        "\n    non-empty, visible <h1> in the RAW prerendered HTML. Routes get their body from" +
        "\n    src/prerender/entry.tsx via scripts/prerender-full-body-spike.mjs.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-h1-raw-html] OK — all ${checked}/${total} workbook routes carry exactly one non-empty, ` +
      "visible <h1> in raw prerendered HTML, with a self-referencing canonical.",
  );
}

main().catch((err) => {
  console.error("[check-h1-raw-html] fatal:", err);
  process.exitCode = 1;
});
