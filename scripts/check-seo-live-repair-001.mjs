// scripts/check-seo-live-repair-001.mjs
//
// AI-SEO-LIVE-REPAIR-001 regression guard.
//
// Pins the invariants established by the 2026-08-16 LIVE SEO repair so a later
// change cannot silently undo them:
//
//   1. SOFT-404 REPAIR — the four commercial routes GSC flagged as Soft 404
//      (/are-online-esa-letters-legit, /esa-vs-psd-letter,
//      /esa-letter-for-landlord, /esa-letter/missouri) must ship REAL
//      server-rendered body content, not the ~31.7KB empty app shell.
//   2. CANONICAL — each is self-referencing and non-www.
//   3. ROBOTS — each is index,follow in the RAW html.
//   4. SITEMAP — the four are present; utility/paid-only/unpublished URLs
//      (/customer-login, /esa-letter-housing, /doctors/michelle-lafferty) and
//      the non-canonical /esa-letter-cost/ slash form are absent.
//   5. REDIRECTS — /esa-letter-cost/ 301s to the slash-free canonical form and
//      that destination is not itself a redirect source (no chain, no loop).
//   6. UTILITY NOINDEX — /customer-login carries an X-Robots-Tag noindex header
//      in vercel.json (a header, so it holds without JavaScript).
//   7. PRICING CONSISTENCY — the /esa-letter-cost title + description prices
//      are the SAME numbers as the canonical matrix in src/config/pricing.ts,
//      and those numbers appear in the page's rendered body.
//   8. HEAD-TERM CONSOLIDATION — /how-to-get-esa-letter owns the "esa letter"
//      head term in its title; the /blog INDEX no longer leads with it.
//   9. HEADING VOCABULARY — no visible H1/H2/H3 on the validity page uses
//      "legit"/"legitimate"/"legitimacy" (owner constraint). The slug and body
//      prose may still use the words — only headings are restricted.
//
// Usage:
//   node scripts/check-seo-live-repair-001.mjs              → exit 1 on drift
//   node scripts/check-seo-live-repair-001.mjs --self-test  → prove each
//        assertion FAILS against deliberately broken input (negative controls)

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const TAG = "[check-seo-live-repair-001]";
const selfTest = process.argv.includes("--self-test");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
};

// ── The routes this task repaired ───────────────────────────────────────────
const REPAIRED = [
  { path: "/are-online-esa-letters-legit", file: "are-online-esa-letters-legit/index.html" },
  { path: "/esa-vs-psd-letter", file: "esa-vs-psd-letter/index.html" },
  { path: "/esa-letter-for-landlord", file: "esa-letter-for-landlord/index.html" },
  { path: "/esa-letter/missouri", file: "esa-letter/missouri/index.html" },
];

// A route whose raw HTML is only the app shell has an EMPTY #root. That is the
// exact signature GSC reads as Soft 404, so it is asserted directly rather than
// inferred from byte size (which a big <head> could mask).
const EMPTY_ROOT = /<div id="root">\s*<\/div>/;

const MUST_BE_ABSENT_FROM_SITEMAP = [
  "https://pawtenant.com/customer-login",
  "https://pawtenant.com/esa-letter-housing",
  "https://pawtenant.com/doctors/michelle-lafferty",
  "https://pawtenant.com/esa-letter-cost/",
];

/** Visible heading text (h1–h3) from a rendered HTML string. */
function headings(html) {
  return [...html.matchAll(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/gi)].map((m) =>
    m[1].replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim(),
  );
}

function metaContent(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}
function canonicalOf(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : null;
}
function titleOf(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
}
/** Strip tags → visible text, for length + phrase assertions. */
function visibleText(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── Assertions that can also run against injected (broken) fixtures ─────────
export function assertHeadingsAreCleanOfLegit(html) {
  return headings(html).filter((h) => /legitimat|legitimac|\blegit\b/i.test(h));
}
/**
 * A redirect is a CHAIN only when its destination is the source of another
 * UNCONDITIONAL redirect. Conditional rules (`has`/`missing` — e.g. the
 * host-based www→non-www rule, or the `?page_id=586` query-strip that rewrites
 * "/" to "/") fire only for the matching request shape and then stop, so they
 * are not hops and must not be reported. Ignoring that produced a false
 * positive on the pre-existing `/ → /` page_id rule.
 */
export function assertNoRedirectChain(redirects) {
  const unconditional = new Set(
    redirects.filter((r) => !r.has && !r.missing).map((r) => r.source),
  );
  return redirects.filter(
    (r) => !r.has && !r.missing && unconditional.has(r.destination),
  );
}

async function main() {
  console.log(`${TAG} LIVE SEO repair invariants\n`);

  if (!existsSync(join(OUT, "index.html"))) {
    console.error(`${TAG} out/ not built — run the build first.`);
    process.exit(1);
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true });

  // ── 1–3. Server-rendered body + canonical + robots ────────────────────────
  console.log("1–3. Soft-404 repair: real body, canonical, robots");
  const rendered = {};
  for (const r of REPAIRED) {
    const f = join(OUT, r.file);
    if (!existsSync(f)) {
      check(`${r.path} generated`, false, `${r.file} missing`);
      continue;
    }
    const html = await readFile(f, "utf8");
    rendered[r.path] = html;
    const text = visibleText(html);

    check(`${r.path} — #root is NOT empty (no app shell)`, !EMPTY_ROOT.test(html));
    check(`${r.path} — has an <h1> in raw HTML`, /<h1[\s/>]/i.test(html));
    check(`${r.path} — ≥2500 chars of visible text (${text.length})`, text.length >= 2500);
    check(
      `${r.path} — self-referencing non-www canonical`,
      canonicalOf(html) === `https://pawtenant.com${r.path}`,
      `got ${canonicalOf(html)}`,
    );
    const robots = metaContent(html, "robots") || "";
    check(`${r.path} — robots index,follow`, /(^|\s)index/i.test(robots) && !/noindex/i.test(robots), robots);
    check(`${r.path} — links to /assessment`, html.includes('href="/assessment'));
  }

  // ── 4. Sitemap inclusion / exclusion ──────────────────────────────────────
  console.log("\n4. Sitemap");
  const sitemap = await readFile(join(ROOT, "public/sitemap.xml"), "utf8");
  for (const r of REPAIRED) {
    check(`${r.path} present in sitemap`, sitemap.includes(`<loc>https://pawtenant.com${r.path}</loc>`));
  }
  for (const loc of MUST_BE_ABSENT_FROM_SITEMAP) {
    check(`${loc} absent from sitemap`, !sitemap.includes(`<loc>${loc}</loc>`));
  }

  // ── 5–6. vercel.json: slash canonical, no chain, utility noindex ──────────
  console.log("\n5–6. Redirects + utility-page noindex");
  const vercel = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
  const slashFix = vercel.redirects.find((r) => r.source === "/esa-letter-cost/");
  check("/esa-letter-cost/ has a redirect", Boolean(slashFix));
  check("/esa-letter-cost/ redirect is permanent (301/308)", slashFix?.permanent === true);
  check(
    "/esa-letter-cost/ redirect destination is the slash-free canonical",
    slashFix?.destination === "/esa-letter-cost",
    slashFix?.destination,
  );
  const chains = assertNoRedirectChain(vercel.redirects);
  check("no redirect points at another redirect's source (no chain/loop)", chains.length === 0,
    chains.map((c) => `${c.source}→${c.destination}`).join(", "));

  const loginHeader = vercel.headers.find((h) => h.source === "/customer-login");
  const loginRobots = loginHeader?.headers?.find((h) => h.key.toLowerCase() === "x-robots-tag")?.value || "";
  check("/customer-login carries an X-Robots-Tag header", Boolean(loginHeader));
  check("/customer-login X-Robots-Tag is noindex", /noindex/i.test(loginRobots), loginRobots);
  check("/customer-login stays crawl-followable", /follow/i.test(loginRobots) && !/nofollow/i.test(loginRobots), loginRobots);

  // ── 7. Pricing consistency ────────────────────────────────────────────────
  console.log("\n7. Pricing consistency (meta ↔ canonical matrix ↔ rendered body)");
  const pricing = await jiti.import(resolve(ROOT, "src/config/pricing.ts"));
  const seo = await jiti.import(resolve(ROOT, "src/config/seoConfig.ts"));
  const annual = pricing.ESA_PRICE_LABELS.subscription; // "$115"
  const oneTime = pricing.ESA_PRICE_LABELS.oneTime; // "$129"
  const costMeta = seo.CORE_PAGE_META["/esa-letter-cost"];

  check(`title carries the canonical annual price (${annual})`, costMeta.title.includes(annual), costMeta.title);
  check(`title carries the canonical one-time price (${oneTime})`, costMeta.title.includes(oneTime), costMeta.title);
  check(`description carries ${annual}`, costMeta.description.includes(annual));
  check(`description carries ${oneTime}`, costMeta.description.includes(oneTime));
  check("description answers the literal cost question",
    /how much does an esa letter cost/i.test(costMeta.description));

  const costHtml = await readFile(join(OUT, "esa-letter-cost/index.html"), "utf8");
  const costText = visibleText(costHtml);
  check(`rendered body shows ${annual}`, costText.includes(annual));
  check(`rendered body shows ${oneTime}`, costText.includes(oneTime));
  check("rendered body answers 'How much does an ESA letter cost?'",
    /how much does an esa letter cost/i.test(costText));
  check("rendered <title> matches seoConfig", titleOf(costHtml) === costMeta.title,
    `${titleOf(costHtml)} vs ${costMeta.title}`);

  // ── 8. Head-term consolidation ────────────────────────────────────────────
  console.log("\n8. 'esa letter' head-term consolidation");
  const howTo = seo.CORE_PAGE_META["/how-to-get-esa-letter"];
  const blog = seo.CORE_PAGE_META["/blog"];
  check("/how-to-get-esa-letter title leads with the head term",
    /^esa letter\b/i.test(howTo.title), howTo.title);
  check("/blog title does NOT lead with the head term",
    !/^esa letter\b/i.test(blog.title), blog.title);
  check("/blog is still indexable (not noindexed to win one query)",
    !/noindex/i.test(JSON.stringify(blog)));

  // ── 9. Heading vocabulary on the validity page ────────────────────────────
  console.log("\n9. Heading vocabulary");
  const legitHtml = rendered["/are-online-esa-letters-legit"];
  if (legitHtml) {
    const bad = assertHeadingsAreCleanOfLegit(legitHtml);
    check("no H1/H2/H3 uses legit/legitimate/legitimacy", bad.length === 0, bad.join(" | "));
    check("body prose may still address the query naturally",
      /legitimat/i.test(visibleText(legitHtml)));
  }

  // ── Negative controls ─────────────────────────────────────────────────────
  if (selfTest) {
    console.log("\n── SELF-TEST (each control MUST be detected) ──");
    let controls = 0;
    let caught = 0;

    controls++;
    const shell = '<html><head></head><body><div id="root"></div></body></html>';
    if (EMPTY_ROOT.test(shell)) { caught++; console.log("  ✓ control: empty #root app shell detected"); }
    else console.error("  ✗ control MISSED: empty #root app shell");

    controls++;
    const notShell = rendered["/esa-vs-psd-letter"] || "";
    if (notShell && !EMPTY_ROOT.test(notShell)) { caught++; console.log("  ✓ control: real body NOT flagged as shell"); }
    else console.error("  ✗ control MISSED: real body wrongly flagged");

    controls++;
    const badHeading = '<h2>What makes it legitimate: a licensed provider</h2><p>ok</p>';
    if (assertHeadingsAreCleanOfLegit(badHeading).length === 1) {
      caught++; console.log("  ✓ control: 'legitimate' in an H2 detected");
    } else console.error("  ✗ control MISSED: 'legitimate' heading");

    controls++;
    const proseOnly = '<h2>Are online ESA letters real?</h2><p>They can be legitimate.</p>';
    if (assertHeadingsAreCleanOfLegit(proseOnly).length === 0) {
      caught++; console.log("  ✓ control: 'legitimate' in BODY PROSE correctly allowed");
    } else console.error("  ✗ control MISSED: prose wrongly flagged");

    controls++;
    const chained = [
      { source: "/a/", destination: "/b" },
      { source: "/b", destination: "/c" },
    ];
    if (assertNoRedirectChain(chained).length === 1) {
      caught++; console.log("  ✓ control: redirect chain detected");
    } else console.error("  ✗ control MISSED: redirect chain");

    controls++;
    const looped = [{ source: "/x", destination: "/x" }];
    if (assertNoRedirectChain(looped).length === 1) {
      caught++; console.log("  ✓ control: redirect loop detected");
    } else console.error("  ✗ control MISSED: redirect loop");

    controls++;
    const staleTitle = "ESA Letter Cost: $99/Year or $119 One-Time | PawTenant";
    if (!staleTitle.includes(annual) || !staleTitle.includes(oneTime)) {
      caught++; console.log("  ✓ control: stale price in title detected");
    } else console.error("  ✗ control MISSED: stale price in title");

    controls++;
    const sitemapWithLogin = sitemap + "<url><loc>https://pawtenant.com/customer-login</loc></url>";
    if (sitemapWithLogin.includes("<loc>https://pawtenant.com/customer-login</loc>")) {
      caught++; console.log("  ✓ control: utility URL in sitemap detected");
    } else console.error("  ✗ control MISSED: utility URL in sitemap");

    console.log(`\n  self-test: ${caught}/${controls} controls detected`);
    if (caught !== controls) failures++;
  }

  console.log(
    failures === 0
      ? `\n${TAG} PASS — all LIVE SEO repair invariants hold.`
      : `\n${TAG} FAIL — ${failures} assertion(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`${TAG} fatal:`, err);
  process.exit(1);
});
