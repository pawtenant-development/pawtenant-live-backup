// scripts/check-machine-facts.mjs
//
// Deterministic, BLOCKING guard for AI-facing machine-readable facts + schema
// hygiene. Exits non-zero on any violation so `npm run build` fails fast.
// Task: AI-SEO-MACHINE-FACTS-SCHEMA-HYGIENE-001.
//
// Covers:
//   1. public/llms.txt: no stale prices ($99/year, $110 one-time, $109/year);
//      all approved current prices present.
//   2. index.html static <head>: no "#1 Legitimate" and no unconditional
//      "same-day delivery" machine-readable claim.
//   3. src/pages/esa-letter-cost/page.tsx: no hardcoded <title> (so the
//      prerendered raw title and the runtime SEOManager title share one source
//      — seoConfig — and cannot drift).
//   4. src/pages/state-esa/page.tsx: no broken "knows state and has years"
//      sentence.
//   5. Generated out/ route files (only when out/ exists, i.e. after
//      `vite build && prerender`):
//        - homepage (out/index.html) RETAINS Organization + WebSite + WebPage
//          + Service (its own, corrected);
//        - inner routes + out/app.html do NOT inherit the homepage WebPage /
//          Service / "$129" Offer / "#1 Legitimate" / "same-day delivery",
//          but DO keep the global Organization + WebSite.
//
// Read-only: never writes files.

import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`  ✗ ${m}`);
};

const readRepo = (p) => readFile(join(ROOT, p), "utf8");
async function fileExists(p) {
  try {
    await access(join(ROOT, p));
    return true;
  } catch {
    return false;
  }
}

const APPROVED_PRICES = ["$129", "$115", "$100", "$149", "$135", "$179", "$159"];
const STALE_PRICES = ["$99/year", "$110 one-time", "$109/year"];

const hasWebPage = (h) => /"@type"\s*:\s*"WebPage"/.test(h);
const hasService = (h) => /"@type"\s*:\s*"Service"/.test(h);
const hasOrg = (h) => /"@type"\s*:\s*"Organization"/.test(h);
const hasWebSite = (h) => /"@type"\s*:\s*"WebSite"/.test(h);
const has129Offer = (h) => /"price"\s*:\s*"129"/.test(h);
const hasNumberOne = (h) => /#1 Legitimate/i.test(h);
const hasSameDay = (h) => /same-day delivery/i.test(h);

async function main() {
  console.log("[check-machine-facts] AI-facing facts + schema hygiene\n");

  // ── 1. llms.txt ──────────────────────────────────────────────────────────
  console.log("llms.txt pricing:");
  const llms = await readRepo("public/llms.txt");
  for (const stale of STALE_PRICES) {
    if (llms.includes(stale)) fail(`llms.txt contains stale price "${stale}"`);
    else pass(`llms.txt has no "${stale}"`);
  }
  for (const price of APPROVED_PRICES) {
    if (llms.includes(price)) pass(`llms.txt includes approved price ${price}`);
    else fail(`llms.txt is missing approved price ${price}`);
  }

  // ── 2. index.html static head ────────────────────────────────────────────
  console.log("\nindex.html static <head>:");
  const index = await readRepo("index.html");
  if (hasNumberOne(index)) fail('index.html contains "#1 Legitimate"');
  else pass('index.html has no "#1 Legitimate"');
  if (hasSameDay(index)) fail('index.html contains unconditional "same-day delivery"');
  else pass('index.html has no "same-day delivery"');

  // ── 3. esa-letter-cost single title source ───────────────────────────────
  console.log("\nesa-letter-cost title source:");
  const costPage = await readRepo("src/pages/esa-letter-cost/page.tsx");
  if (/<title[\s>]/i.test(costPage))
    fail("esa-letter-cost/page.tsx hardcodes a <title> (raw vs runtime title will drift)");
  else pass("esa-letter-cost/page.tsx has no hardcoded <title> (seoConfig is the single source)");

  // ── 4. state-esa broken sentence ─────────────────────────────────────────
  console.log("\nstate-esa copy:");
  const stateEsa = await readRepo("src/pages/state-esa/page.tsx");
  if (/knows state and has years/.test(stateEsa))
    fail('state-esa/page.tsx still has the broken "knows state and has years" sentence');
  else pass("state-esa/page.tsx broken sentence is fixed");

  // ── 5. generated route files (post-build only) ───────────────────────────
  console.log("\ngenerated out/ route schema:");
  if (!(await fileExists("out/index.html"))) {
    console.warn(
      "  ! out/ not built — skipping generated-file checks. Run after `vite build && node scripts/prerender-seo.mjs`."
    );
  } else {
    const home = await readRepo("out/index.html");
    if (hasOrg(home) && hasWebSite(home)) pass("homepage retains Organization + WebSite");
    else fail("homepage is missing global Organization/WebSite");
    if (hasWebPage(home) && hasService(home)) pass("homepage retains its own WebPage + Service");
    else fail("homepage lost its WebPage/Service schema");
    if (hasNumberOne(home)) fail('homepage still contains "#1 Legitimate"');
    else pass('homepage has no "#1 Legitimate"');
    if (hasSameDay(home)) fail('homepage still contains "same-day delivery"');
    else pass('homepage has no "same-day delivery"');

    const innerRoutes = [
      "out/faqs/index.html",
      "out/no-risk-guarantee/index.html",
      "out/esa-letter-cost/index.html",
      "out/psd-letter/california/index.html",
      "out/esa-letter/california/index.html",
      "out/blog/what-is-an-esa-letter/index.html",
      "out/app.html",
    ];
    for (const route of innerRoutes) {
      if (!(await fileExists(route))) {
        fail(`expected generated file missing: ${route}`);
        continue;
      }
      const h = await readRepo(route);
      const problems = [];
      if (hasWebPage(h)) problems.push("inherits homepage WebPage");
      if (hasService(h)) problems.push("inherits homepage Service");
      if (has129Offer(h)) problems.push('inherits "$129" Offer');
      if (hasNumberOne(h)) problems.push('"#1 Legitimate"');
      if (hasSameDay(h)) problems.push('"same-day delivery"');
      if (!hasOrg(h)) problems.push("missing global Organization");
      if (!hasWebSite(h)) problems.push("missing global WebSite");
      if (problems.length) fail(`${route} → ${problems.join(", ")}`);
      else pass(`${route} clean (Organization + WebSite only)`);
    }
  }

  // ── verdict ──────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(`\n[check-machine-facts] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("\n[check-machine-facts] PASSED — all machine-fact + schema guards green.");
}

main().catch((err) => {
  console.error("[check-machine-facts] fatal:", err);
  process.exit(1);
});
