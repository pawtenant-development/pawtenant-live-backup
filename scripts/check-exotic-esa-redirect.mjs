// scripts/check-exotic-esa-redirect.mjs
//
// PAWTENANT-EXOTIC-ESA-404-REPAIR-001 — 2026-09-16
//
// `/exotic-esa` and `/exotic-esa/` both returned a hard 404 in production.
// Investigation proved the top-level route has NEVER existed: no route, no page
// component, no manifest entry, no internal link, in the entire history of
// either repo — and no GSC/Semrush/Ads row for the URL. There was nothing to
// restore, so instead of inventing a page the owner chose a permanent redirect
// to the real exotic-ESA content, the blog article.
//
// This guard owns that decision. It fails when:
//   1. either source form loses its redirect rule (route missing);
//   2. the redirect stops being permanent;
//   3. the destination changes, stops classifying as a valid route, or the hop
//      would chain/loop (destination is itself a redirect source, or a source
//      appears as some rule's destination);
//   4. the destination's prerendered output is the generic 404 body;
//   5. the destination's raw HTML has zero or more than one <h1>;
//   6. the destination's canonical is missing, points at www, or points at the
//      wrong route;
//   7. the destination falls out of the sitemap / prerender contract;
//   8. either redirected form is listed in the sitemap — a redirected URL must
//      never be advertised as indexable, or the slash and non-slash forms
//      become duplicate indexable pages;
//   9. an unrelated redirect is changed as collateral damage.
//
// Usage:
//   node scripts/check-exotic-esa-redirect.mjs             → check
//   node scripts/check-exotic-esa-redirect.mjs --self-test → planted controls
//
// The out/-dependent assertions (4, 5, 6) run only when out/ exists, so the
// guard is useful before a build and fully binding inside `npm run build`,
// where it runs after the prerender. The negative controls mutate IN-MEMORY
// copies only; nothing on disk is ever touched.

import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");
const jiti = createJiti(import.meta.url, { interopDefault: true });

const BASE_URL = "https://pawtenant.com";
const SOURCES = ["/exotic-esa", "/exotic-esa/"];
const DESTINATION = "/blog/exotic-esa-rules-whats-realistically-allowed";

// Sentinels: unrelated rules that must survive untouched. If a future edit
// disturbs one of these, this task's guard says so rather than letting the
// collateral damage ship silently.
const UNRELATED_SENTINELS = [
  { source: "/apply-now", destination: "/assessment" },
  { source: "/apply-now/", destination: "/assessment" },
  { source: "/housing-rights-and-your-esa", destination: "/housing-rights-esa" },
];

/** Single read point: normalise CRLF→LF exactly once. */
async function rd(rel) {
  return (await readFile(resolve(ROOT, rel), "utf8")).replace(/\r\n/g, "\n");
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ── prerendered-HTML helpers (same technique as check-h1-raw-html.mjs) ──────
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
    } else depth++;
  }
  return null;
}
const rootInner = (html) => {
  const r = rootInnerRange(html);
  return r ? html.slice(r.start, r.end) : null;
};
const findH1s = (html) =>
  [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)].map((m) => ({
    attrs: m[1] ?? "",
    inner: m[2] ?? "",
  }));
const visibleText = (s) =>
  s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const canonicalOf = (html) =>
  html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] ?? null;

/**
 * Every assertion. Pure: takes the already-read inputs, returns findings.
 * `out` may be null when the build output is not present.
 */
function collectFindings({ vercel, sitemap, h1Contract, classifyRoute, notFoundHtml, out }) {
  const findings = [];
  const redirects = Array.isArray(vercel.redirects) ? vercel.redirects : [];

  const exactSources = new Set(
    redirects.filter((r) => !(r.has || []).some((h) => h.type === "host")).map((r) => r.source),
  );

  // ── 1 + 2 + 3: the redirect rules themselves ─────────────────────────────
  for (const src of SOURCES) {
    const matches = redirects.filter((r) => r.source === src);
    if (matches.length === 0) {
      findings.push(
        `${src}: no redirect rule in vercel.json — the route would 404 again. ` +
          `Expected a permanent redirect to ${DESTINATION}.`,
      );
      continue;
    }
    if (matches.length > 1) {
      findings.push(`${src}: ${matches.length} redirect rules (expected exactly 1).`);
    }
    const rule = matches[0];
    if (rule.destination !== DESTINATION) {
      findings.push(
        `${src}: redirects to ${rule.destination}, expected ${DESTINATION}.`,
      );
    }
    if (rule.permanent !== true) {
      findings.push(`${src}: redirect is not permanent (permanent: ${rule.permanent}).`);
    }
  }

  // one hop — the destination must not itself be a redirect source
  if (exactSources.has(DESTINATION)) {
    findings.push(
      `${DESTINATION} is itself a redirect source — the hop would chain instead of landing.`,
    );
  }
  // no loop back — neither source may be some rule's destination
  for (const r of redirects) {
    if (SOURCES.includes(r.destination)) {
      findings.push(
        `redirect loop: ${r.source} → ${r.destination}, but ${r.destination} redirects away again.`,
      );
    }
  }
  // the destination must be a real route
  if (classifyRoute && classifyRoute(DESTINATION) !== "valid") {
    findings.push(
      `${DESTINATION} classifies as "${classifyRoute(DESTINATION)}" — a redirect must land on a valid route.`,
    );
  }

  // ── 9: no collateral damage to unrelated redirects ───────────────────────
  for (const s of UNRELATED_SENTINELS) {
    const rule = redirects.find((r) => r.source === s.source);
    if (!rule) findings.push(`unrelated redirect removed: ${s.source} is gone from vercel.json.`);
    else if (rule.destination !== s.destination) {
      findings.push(
        `unrelated redirect changed: ${s.source} now points to ${rule.destination}, expected ${s.destination}.`,
      );
    }
  }
  // nothing else in the file may claim the exotic namespace
  const exoticRules = redirects.filter((r) =>
    `${r.source} ${r.destination}`.includes("/exotic-esa"),
  );
  const strays = exoticRules.filter((r) => !SOURCES.includes(r.source));
  if (strays.length) {
    findings.push(
      `unexpected extra exotic redirect rule(s): ${strays.map((r) => r.source).join(", ")}.`,
    );
  }

  // ── 7 + 8: sitemap / prerender contract ──────────────────────────────────
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const destLocs = locs.filter((u) => u === `${BASE_URL}${DESTINATION}`);
  if (destLocs.length === 0) {
    findings.push(`${DESTINATION} is missing from public/sitemap.xml.`);
  } else if (destLocs.length > 1) {
    findings.push(`${DESTINATION} appears ${destLocs.length}x in public/sitemap.xml (expected once).`);
  }
  for (const src of SOURCES) {
    if (locs.some((u) => u === `${BASE_URL}${src}` || u === `${BASE_URL}${src}/`)) {
      findings.push(
        `${src} is listed in public/sitemap.xml — a redirected URL must never be advertised as indexable ` +
          "(it would make the slash and non-slash forms duplicate entries).",
      );
    }
  }
  const contractHits = (h1Contract.routes ?? []).filter((r) => r.path === DESTINATION);
  if (contractHits.length !== 1) {
    findings.push(
      `${DESTINATION} appears ${contractHits.length}x in the H1/prerender contract (expected exactly once) — ` +
        "the redirect would land on a page with no guaranteed raw-HTML heading.",
    );
  }

  // ── 4 + 5 + 6: the destination's prerendered output ──────────────────────
  if (out !== null) {
    if (notFoundHtml && out.includes(notFoundHtml.slice(0, 120))) {
      findings.push(`${DESTINATION}: prerendered output is the generic 404 body.`);
    }
    const root = rootInner(out);
    if (root === null) {
      findings.push(`${DESTINATION}: could not locate <div id="root"> in the prerendered HTML.`);
    } else if (root.trim() === "") {
      findings.push(
        `${DESTINATION}: #root is EMPTY — the redirect would land on a page whose heading only ` +
          "exists after client-side JavaScript.",
      );
    } else {
      const h1s = findH1s(root);
      if (h1s.length !== 1) {
        findings.push(
          `${DESTINATION}: ${h1s.length} <h1> in the raw prerendered body (expected exactly 1).`,
        );
      } else if (!visibleText(h1s[0].inner)) {
        findings.push(`${DESTINATION}: the <h1> is empty / whitespace-only.`);
      }
    }
    const canonical = canonicalOf(out);
    const expected = `${BASE_URL}${DESTINATION}`;
    if (!canonical) {
      findings.push(`${DESTINATION}: no <link rel="canonical"> in the prerendered head.`);
    } else if (/^https?:\/\/www\./i.test(canonical)) {
      findings.push(`${DESTINATION}: canonical uses the www host (${canonical}); must be the bare apex.`);
    } else if (canonical !== expected) {
      findings.push(`${DESTINATION}: canonical is ${canonical}, expected ${expected}.`);
    }
    if (/<meta name="robots" content="[^"]*noindex/i.test(out)) {
      findings.push(
        `${DESTINATION}: the destination is noindex — redirecting to it would strand the URL.`,
      );
    }
  }

  return findings;
}

async function loadInputs() {
  const vercelRaw = await rd("vercel.json");
  const sitemap = await rd("public/sitemap.xml");
  const h1Contract = JSON.parse(await rd("scripts/data/h1-coverage-routes.json"));
  const routeStatus = await jiti.import(resolve(ROOT, "src/lib/routeStatus.ts"));
  const destFile = join(OUT_DIR, DESTINATION.replace(/^\//, ""), "index.html");
  const out = (await exists(destFile))
    ? (await readFile(destFile, "utf8")).replace(/\r\n/g, "\n")
    : null;
  return {
    vercel: JSON.parse(vercelRaw),
    sitemap,
    h1Contract,
    classifyRoute: routeStatus.classifyRoute,
    notFoundHtml: routeStatus.NOT_FOUND_HTML,
    out,
    builtDestPath: destFile,
  };
}

async function selfTest() {
  const base = await loadInputs();
  const baseline = collectFindings(base);
  if (baseline.length) {
    console.error("[check-exotic-esa-redirect] --self-test ABORTED: the real tree already fails.");
    for (const f of baseline) console.error(`    - ${f}`);
    process.exitCode = 1;
    return;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const withVercel = (fn) => {
    const v = clone(base.vercel);
    fn(v);
    return { ...base, vercel: v };
  };

  const controls = [
    {
      name: "route removal — the /exotic-esa rule is dropped",
      input: withVercel((v) => {
        v.redirects = v.redirects.filter((r) => r.source !== "/exotic-esa");
      }),
      expect: /\/exotic-esa: no redirect rule in vercel\.json/,
    },
    {
      name: "trailing-slash form removed (slash/non-slash diverge)",
      input: withVercel((v) => {
        v.redirects = v.redirects.filter((r) => r.source !== "/exotic-esa/");
      }),
      expect: /\/exotic-esa\/: no redirect rule in vercel\.json/,
    },
    {
      name: "redirect downgraded from permanent to temporary",
      input: withVercel((v) => {
        v.redirects.find((r) => r.source === "/exotic-esa").permanent = false;
      }),
      expect: /redirect is not permanent/,
    },
    {
      name: "destination changed to the homepage",
      input: withVercel((v) => {
        v.redirects.find((r) => r.source === "/exotic-esa").destination = "/";
      }),
      expect: /redirects to \/, expected/,
    },
    {
      name: "redirect loop — the destination becomes a source",
      input: withVercel((v) => {
        v.redirects.push({ source: DESTINATION, destination: "/exotic-esa", permanent: true });
      }),
      expect: /redirect loop|is itself a redirect source/,
    },
    {
      name: "unrelated route accidentally changed (/apply-now)",
      input: withVercel((v) => {
        v.redirects.find((r) => r.source === "/apply-now").destination = "/psd-assessment";
      }),
      expect: /unrelated redirect changed: \/apply-now/,
    },
    {
      name: "a redirected form is advertised in the sitemap (duplicate indexable)",
      input: {
        ...base,
        sitemap: base.sitemap.replace(
          "</urlset>",
          `  <url><loc>${BASE_URL}/exotic-esa</loc></url>\n</urlset>`,
        ),
      },
      expect: /is listed in public\/sitemap\.xml/,
    },
    {
      name: "destination drops out of the sitemap",
      input: {
        ...base,
        sitemap: base.sitemap.replace(
          new RegExp(`\\s*<url><loc>${BASE_URL}${DESTINATION}</loc>[\\s\\S]*?</url>`),
          "",
        ),
      },
      expect: /missing from public\/sitemap\.xml/,
    },
    {
      name: "destination drops out of the prerender/H1 contract",
      input: {
        ...base,
        h1Contract: {
          ...base.h1Contract,
          routes: (base.h1Contract.routes ?? []).filter((r) => r.path !== DESTINATION),
        },
      },
      expect: /appears 0x in the H1\/prerender contract/,
    },
  ];

  if (base.out !== null) {
    controls.push(
      {
        name: "destination prerenders the generic 404 body",
        input: { ...base, out: base.notFoundHtml },
        expect: /generic 404 body|could not locate <div id="root">/,
      },
      {
        name: "wrong canonical — points at the www host",
        input: {
          ...base,
          out: base.out.replace(
            /<link rel="canonical" href="[^"]+"/i,
            `<link rel="canonical" href="https://www.pawtenant.com${DESTINATION}"`,
          ),
        },
        expect: /canonical uses the www host/,
      },
      {
        name: "wrong canonical — points at another route",
        input: {
          ...base,
          out: base.out.replace(
            /<link rel="canonical" href="[^"]+"/i,
            `<link rel="canonical" href="${BASE_URL}/exotic-esa"`,
          ),
        },
        expect: /canonical is .*\/exotic-esa, expected/,
      },
      {
        name: "destination loses its H1",
        input: {
          ...base,
          out: base.out.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "<p>heading removed</p>"),
        },
        expect: /0 <h1> in the raw prerendered body/,
      },
      {
        name: "destination grows a second H1",
        input: {
          ...base,
          out: base.out.replace(
            /(<h1\b[^>]*>[\s\S]*?<\/h1>)/i,
            "$1<h1>A second heading</h1>",
          ),
        },
        expect: /2 <h1> in the raw prerendered body/,
      },
    );
  } else {
    console.log(
      "  (out/ not built — the 404/canonical/H1 controls are skipped; run after a build for full coverage)",
    );
  }

  let failed = 0;
  for (const c of controls) {
    const found = collectFindings(c.input);
    if (found.some((f) => c.expect.test(f))) console.log(`  ✓ detected: ${c.name}`);
    else {
      failed++;
      console.error(`  ✗ NOT DETECTED: ${c.name}`);
      console.error(`      expected a finding matching ${c.expect}`);
      console.error(`      got: ${found.length ? found.join(" | ") : "<no findings>"}`);
    }
  }

  if (failed) {
    console.error(
      `[check-exotic-esa-redirect] --self-test FAILED — ${failed}/${controls.length} planted control(s) went undetected.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[check-exotic-esa-redirect] --self-test OK — all ${controls.length} planted negative controls were detected.`,
  );
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const inputs = await loadInputs();
  const findings = collectFindings(inputs);

  if (findings.length) {
    console.error("[check-exotic-esa-redirect] FAILED:");
    for (const f of findings) console.error(`    - ${f}`);
    console.error(
      `\n  → ${SOURCES.join(" and ")} must both carry a permanent vercel.json redirect to` +
        `\n    ${DESTINATION}, which must stay a valid, indexable, singly-listed page with` +
        "\n    exactly one raw-HTML <h1> and a non-www self-canonical.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[check-exotic-esa-redirect] OK — ${SOURCES.join(" + ")} redirect permanently (one hop, no loop) to ` +
      `${DESTINATION}` +
      (inputs.out === null
        ? "; out/ not built, so the 404/H1/canonical assertions were skipped."
        : ", which prerenders exactly one non-empty <h1> with a non-www self-canonical and is listed once in the sitemap."),
  );
}

main().catch((err) => {
  console.error("[check-exotic-esa-redirect] fatal:", err);
  process.exitCode = 1;
});
