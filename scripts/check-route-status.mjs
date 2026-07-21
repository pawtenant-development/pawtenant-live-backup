// scripts/check-route-status.mjs
//
// AI-SEO-SOFT-404-ROUTE-STATUS-001 — blocking route-status guard.
//
// Verifies the deterministic route classifier (src/lib/routeStatus.ts) and the
// generated manifest (src/generated/routeManifest.ts) enforce correct HTTP
// status intent, and that the branded 404/410 bodies + vercel.json redirects
// are safe. Exit 1 on any failure. Runs in `npm run build` (blocking).
//
// NOTE: the machine-facts / pricing / package / state-pricing guards are enforced
// separately in the same build chain (they need the post-build out/); this guard
// owns route-status only.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { buildManifestSource } from "./generate-route-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFile(resolve(ROOT, p), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const failures = [];
function check(name, cond) {
  if (cond) return;
  failures.push(name);
  console.error(`  ✗ ${name}`);
}
function expectThrow(name, fn) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(`negative-control: ${name}`, threw);
}

async function main() {
  // ── 0) Manifest drift ──────────────────────────────────────────────────────
  const committed = await rd("src/generated/routeManifest.ts");
  const { body: fresh } = await buildManifestSource();
  check(
    "manifest has no drift (run `npm run gen:routes`)",
    committed.trim() === fresh.trim()
  );

  // ── Load classifier + config ────────────────────────────────────────────────
  const { classifyRoute, normalizePath, NOT_FOUND_HTML, GONE_HTML } =
    await jiti.import(resolve(ROOT, "src/lib/routeStatus.ts"));
  const { CORE_PAGE_META, ESA_STATE_META } = await jiti.import(
    resolve(ROOT, "src/config/seoConfig.ts")
  );
  const manifest = await jiti.import(
    resolve(ROOT, "src/generated/routeManifest.ts")
  );

  const isValid = (p) => classifyRoute(p) === "valid";
  const isNotFound = (p) => classifyRoute(p) === "notfound";
  const isGone = (p) => classifyRoute(p) === "gone";

  // ── 1) Known public routes → 200 (valid) ────────────────────────────────────
  for (const p of [
    "/",
    "/how-to-get-esa-letter",
    "/esa-letter-cost",
    "/how-to-get-psd-letter",
    "/faqs",
    "/no-risk-guarantee",
    "/esa-letter/california",
    "/psd-letter/california",
    "/blog",
    "/blog/what-is-an-esa-letter",
    "/blog/state/new-york",
    `/college-pet-policy/${manifest.COLLEGE_SLUGS[0]}`,
    "/states/california-esa-psd-guide",
  ]) {
    check(`known public route is valid: ${p}`, isValid(p));
  }
  // Every CORE_PAGE_META key must classify valid.
  for (const p of Object.keys(CORE_PAGE_META)) {
    check(`CORE_PAGE_META route valid: ${p}`, isValid(p));
  }
  // Every ESA state (both /esa-letter/ and /psd-letter/) must be valid.
  for (const s of Object.keys(ESA_STATE_META)) {
    check(`esa state valid: ${s}`, isValid(`/esa-letter/${s}`));
    check(`psd state valid: ${s}`, isValid(`/psd-letter/${s}`));
  }

  // ── 2/3) Private/app + funnel routes remain valid (served, not 404) ──────────
  for (const p of [
    "/assessment",
    "/psd-assessment",
    "/assessment/thank-you",
    "/customer-login",
    "/my-orders",
    "/account/checkout",
    "/admin-login",
    "/admin-orders",
    "/admin-orders/live",
    "/company",
    "/provider-portal",
    "/reset-password",
    "/verify",
    "/verify/abc123",
    "/our-providers",
    // Fail-closed provider profiles: ONLY the eight curated approved slugs are valid.
    "/doctors/robert-staaf",
    "/doctors/michelle-lafferty",
    "/doctors/lytara-garcia",
    "/doctors/stephanie-white",
    "/doctors/eve-rosno",
    "/doctors/henry-smith",
    "/doctors/chad-cunningham",
    "/doctors/karla-delgado",
    "/r/step1",
    "/esa-letter-housing",
    "/meta-esa-letter",
  ]) {
    check(`private/app route is valid: ${p}`, isValid(p));
  }

  // ── 5/6) Unknown routes → 404 (never valid / app.html) ──────────────────────
  for (const p of [
    "/this-route-does-not-exist-qa-001",
    "/random/deep/unknown-path-qa-001",
    "/what-is-an-emotional-support-dog",
    "/esa-letter/atlantis",
    "/psd-letter/atlantis",
    "/blog/not-a-real-post-qa-001",
    "/blog/state/atlantis",
    "/college-pet-policy/hogwarts",
    "/esa-letter/california/extra",
    // Fail-closed provider profiles: unknown, excluded (Edna), alias -hex, and
    // DB-only provider URLs must all 404 at the edge.
    "/doctors/any-supabase-provider-id",
    "/doctors/edna-kwan",
    "/doctors/edna-kwan-78e66",
    "/doctors/robert-staaf-c9240",
    "/doctors/jessica-bailey-12034d",
  ]) {
    check(`unknown route is 404: ${p}`, isNotFound(p));
  }

  // ── 7) Retired WordPress infra → 410 (gone) ─────────────────────────────────
  for (const p of [
    "/feed/",
    "/author/user/",
    "/category/esa",
    "/tag/housing",
    "/comments/feed",
    "/wp-login",
    "/wp-admin/",
    "/2021/05/some-old-post",
    "/product/esa-letter-legacy",
  ]) {
    check(`retired WP path is 410: ${p}`, isGone(p));
  }

  // ── 11/16) Everything in the sitemap must be a valid (200) route ────────────
  const sitemap = await rd("public/sitemap.xml");
  const sitemapPaths = [
    ...sitemap.matchAll(/<loc>\s*https:\/\/pawtenant\.com([^<\s]*)\s*<\/loc>/g),
  ].map((m) => m[1] || "/");
  check("sitemap has URLs", sitemapPaths.length > 50);
  for (const p of sitemapPaths) {
    check(`sitemap URL is a valid route: ${p}`, isValid(p));
  }

  // ── 12/13/14) Branded 404/410 bodies: noindex, branded, NO homepage
  //             canonical, NO Service/WebPage schema ──────────────────────────
  const public404 = await rd("public/404.html");
  for (const [label, html] of [
    ["NOT_FOUND_HTML", NOT_FOUND_HTML],
    ["GONE_HTML", GONE_HTML],
    ["public/404.html", public404],
  ]) {
    check(`${label} is noindex`, /name="robots"\s+content="noindex/i.test(html));
    check(`${label} is branded (PawTenant)`, /PawTenant/.test(html));
    check(
      `${label} has NO canonical link`,
      !/rel=["']canonical["']/i.test(html)
    );
    check(
      `${label} has NO Service/WebPage schema`,
      !/"@type"\s*:\s*"(Service|WebPage)"/.test(html)
    );
  }
  check("NOT_FOUND_HTML advertises 404", /404/.test(NOT_FOUND_HTML));
  check("GONE_HTML advertises 410", /410/.test(GONE_HTML));

  // ── 8/9/10) vercel.json redirects: permanent, non-www target, one hop ───────
  const vercel = JSON.parse(await rd("vercel.json"));
  const redirects = vercel.redirects || [];
  // Vercel matches redirect sources EXACTLY (case- and slash-sensitive), so the
  // chain check compares the exact destination string against exact sources.
  const exactSources = new Set(redirects.map((r) => r.source));
  for (const r of redirects) {
    check(`redirect permanent: ${r.source}`, r.permanent === true);
    check(
      `redirect target is non-www: ${r.source}`,
      !/www\.pawtenant\.com/i.test(r.destination || "")
    );
    const destRaw = String(r.destination || "").replace(/^https?:\/\/[^/]+/, "");
    const hostBased = (r.has || []).some((h) => h.type === "host");
    // one-hop: destination must not itself be a redirect source (would chain).
    if (!hostBased && destRaw && destRaw !== r.source) {
      check(
        `redirect is one hop (target not another source): ${r.source} → ${destRaw}`,
        !exactSources.has(destRaw)
      );
    }
    // target must be a real (valid) route, not a 404/410 — proxy for "returns 200"
    const destPath = normalizePath(destRaw);
    if (!hostBased && destPath.startsWith("/")) {
      check(
        `redirect target is a valid route: ${r.source} → ${destPath}`,
        classifyRoute(destPath) === "valid"
      );
    }
  }

  // ── 15) No conflicting rules: no EXACT path classifies as gone; sets disjoint ─
  for (const p of manifest.EXACT_PATHS) {
    check(`exact path not shadowed by gone: ${p}`, classifyRoute(p) !== "gone");
  }

  // ── 21) The unknown-route fallback must NOT capture a valid assessment/
  //        customer/admin route ─────────────────────────────────────────────
  for (const p of ["/assessment", "/my-orders", "/admin-orders", "/customer-login"]) {
    check(`fallback does not 404 app route: ${p}`, classifyRoute(p) !== "notfound");
  }

  // ── §19 NEGATIVE CONTROLS (in-memory counterfactuals — no repo files mutated) ─
  // Prove each assertion class actually fails on the bad case.
  const assertUnknownIs404 = (fn, p) => {
    if (fn(p) !== "notfound") throw new Error("unknown not 404");
  };
  const assertPublicValid = (fn, p) => {
    if (fn(p) !== "valid") throw new Error("public not valid");
  };
  const assertGone410 = (fn, p) => {
    if (fn(p) !== "gone") throw new Error("gone not 410");
  };
  const assertNonWwwTarget = (dest) => {
    if (/www\.pawtenant\.com/i.test(dest)) throw new Error("www target");
  };
  const assertOneHop = (dest, sources) => {
    if (sources.has(dest)) throw new Error("two hops");
  };
  const assert404Body = (html) => {
    if (/rel=["']canonical["']/i.test(html)) throw new Error("has canonical");
  };
  // A: unknown → app.html (valid) must be rejected.
  expectThrow("A unknown-maps-to-app-shell", () =>
    assertUnknownIs404(() => "valid", "/random-unknown")
  );
  // B: valid public route removed from manifest (classifier says notfound).
  expectThrow("B public-route-missing", () =>
    assertPublicValid(() => "notfound", "/esa-letter-cost")
  );
  // C: valid private route captured by 404 fallback.
  expectThrow("C private-route-404d", () =>
    assertPublicValid(() => "notfound", "/assessment")
  );
  // D: redirect target points to www.
  expectThrow("D redirect-target-www", () =>
    assertNonWwwTarget("https://www.pawtenant.com/esa-letter-cost")
  );
  // E: redirect requires two hops.
  expectThrow("E redirect-two-hops", () =>
    assertOneHop("/apply-now", new Set(["/apply-now"]))
  );
  // F: gone route returns 200 (valid).
  expectThrow("F gone-returns-200", () =>
    assertGone410(() => "valid", "/feed/")
  );
  // G: 404 page carries homepage canonical.
  expectThrow("G 404-has-canonical", () =>
    assert404Body('<link rel="canonical" href="https://pawtenant.com/" />')
  );
  // I: sitemap URL unreachable (classifier 404s a sitemap URL).
  expectThrow("I sitemap-url-unreachable", () =>
    assertPublicValid(() => "notfound", "/esa-letter/california")
  );

  // ── Result ──────────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(
      `\n[check-route-status] FAILED — ${failures.length} check(s) failed.`
    );
    process.exit(1);
  }
  console.log(
    `[check-route-status] OK — classifier + manifest + 404/410 + redirects verified ` +
      `(${sitemapPaths.length} sitemap URLs, ${redirects.length} redirects, ` +
      `${manifest.EXACT_PATHS.length} exact paths).`
  );
}

main().catch((err) => {
  console.error("[check-route-status] fatal:", err);
  process.exit(1);
});
