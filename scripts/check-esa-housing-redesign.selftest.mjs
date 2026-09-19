#!/usr/bin/env node
// scripts/check-esa-housing-redesign.selftest.mjs
//
// PAWTENANT-ESA-HOUSING-CRO-RAW-HTML-LEGAL-001 — negative controls for
// scripts/check-esa-housing-redesign.mjs.
//
// A guard that only ever passes proves nothing. This runner plants each defect
// the guard claims to catch into the REAL source files, re-runs the guard as a
// child process, and requires it to EXIT NON-ZERO. Every file is then restored
// and re-hashed: the tree must come back byte-identical (sha256), or this
// script fails loudly rather than leaving a half-planted defect behind.
//
// Read-only in effect. Run it whenever the guard or the page changes:
//
//   node scripts/check-esa-housing-redesign.selftest.mjs
//
// Exit 0 = every control was rejected AND the tree was restored byte-identical.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = join(ROOT, "scripts/check-esa-housing-redesign.mjs");

const F = {
  page: join(ROOT, "src/pages/lp-esa-housing/page.tsx"),
  sticky: join(ROOT, "src/components/feature/MobileStickyApplyCTA.tsx"),
  router: join(ROOT, "src/router/config.tsx"),
  store: join(ROOT, "src/lib/attributionStore.ts"),
  scrolltop: join(ROOT, "src/components/feature/ScrollTopButton.tsx"),
};

// Raw bytes, never normalised — restoration has to be byte-exact, so the
// original buffer is what gets written back. (The GUARD normalises CRLF at its
// own read point; this runner must not.)
const original = Object.fromEntries(
  Object.entries(F).map(([k, p]) => [k, readFileSync(p)]),
);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const originalHash = Object.fromEntries(
  Object.entries(original).map(([k, b]) => [k, sha(b)]),
);

/** Replace the first occurrence of `find` in a file, as text. Returns false
 *  when the anchor is missing or ambiguous, so a control can never be a
 *  silent no-op. */
function patch(key, find, replace) {
  const text = original[key].toString("utf8");
  const crlf = text.includes("\r\n");
  const from = crlf ? find.replace(/\n/g, "\r\n") : find;
  const to = crlf ? replace.replace(/\n/g, "\r\n") : replace;
  const hits = text.split(from).length - 1;
  if (hits !== 1) return hits;
  writeFileSync(F[key], text.replace(from, to));
  return true;
}

function runGuard() {
  const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function restoreAll() {
  for (const [k, p] of Object.entries(F)) writeFileSync(p, original[k]);
}

// ── The controls ───────────────────────────────────────────────────────────
// Each one is a defect the task brief explicitly names, expressed as the
// smallest edit that would really produce it.
const CONTROLS = [
  {
    name: "the raw H1 disappears (approved heading replaced)",
    file: "page",
    find: "              ESA Letter for Housing From a Licensed Professional",
    replace: "              Get your ESA paperwork today",
  },
  {
    name: "a second H1 is introduced",
    file: "page",
    find: "          <h2 className=\"text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.18]\">\n            What an ESA housing letter is",
    replace: "          <h1>What an ESA housing letter is</h1>\n          <h2 className=\"text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.18]\">\n            What an ESA housing letter is",
  },
  {
    name: "noindex,nofollow returns as a runtime robots meta",
    file: "page",
    find: "    const el = document.createElement(\"script\");",
    replace:
      "    const rb = document.createElement(\"meta\");\n" +
      "    rb.setAttribute(\"name\", \"robots\");\n" +
      "    rb.setAttribute(\"content\", \"noindex, nofollow\");\n" +
      "    document.head.appendChild(rb);\n" +
      "    const el = document.createElement(\"script\");",
  },
  {
    name: "the page writes a second canonical of its own",
    file: "page",
    find: "      {/* ─────────── 0. Site-wide navbar ─────────── */}",
    replace: "      <link rel=\"canonical\" href=\"https://pawtenant.com/esa-letter-housing\" />",
  },
  {
    name: "the route is unregistered from the router",
    file: "router",
    find: '{ path: "/esa-letter-housing", element: <P C={LpEsaHousingPage} /> },',
    replace: '{ path: "/esa-letter-housing-x", element: <P C={LpEsaHousingPage} /> },',
  },
  {
    name: "CTA destination broken (hero CTA bypasses the attributed href)",
    file: "page",
    find: 'const ASSESSMENT_HREF = withAttribution("/assessment");',
    replace: 'const ASSESSMENT_HREF = "/assessment";',
  },
  {
    name: "attribution parameters dropped from the sticky CTA",
    file: "page",
    find: "        to={ASSESSMENT_HREF}\n        label=\"Start Free Assessment\"",
    replace: "        to=\"/assessment\"\n        label=\"Start Free Assessment\"",
  },
  {
    name: "a hardcoded price is reintroduced (page stops deriving from config/pricing)",
    file: "page",
    find: "                  <span className=\"font-semibold text-slate-900\">{ESA_ONE_TIME}</span> one-time, up to 2 pets",
    replace: "                  <span className=\"font-semibold text-slate-900\">$129</span> one-time, up to 2 pets",
  },
  {
    name: "a Klarna instalment figure is anchored as the headline price",
    file: "page",
    find: "              Starting the assessment is free. You pay when you choose a package",
    replace: "              From as low as $32 a month. Starting the assessment is free. You pay when you choose a package",
  },
  {
    name: "an unsupported 'guaranteed approval' claim is added",
    file: "page",
    find: "              Complete a confidential online assessment. A professional licensed",
    replace: "              Guaranteed approval for every applicant. Complete a confidential online assessment. A professional licensed",
  },
  {
    name: "the landlord-decision non-guarantee is deleted",
    file: "page",
    find: "                <PlainPoint>It does not decide or guarantee a landlord's answer</PlainPoint>\n",
    replace: "",
  },
  {
    name: "the public-access non-guarantee is deleted",
    file: "page",
    find: "                <PlainPoint>It does not create public-access rights in stores, restaurants, hotels or workplaces</PlainPoint>\n",
    replace: "",
  },
  {
    name: "the FAQ schema is decoupled from the visible FAQ",
    file: "page",
    find: "      mainEntity: FAQ_ITEMS.map((item) => ({",
    replace: "      mainEntity: [{ q: \"Is it fast?\", a: \"Yes.\" }].map((item) => ({",
  },
  {
    name: "a required section is removed from the page architecture",
    file: "page",
    find: '<section id="housing-use"',
    replace: '<section id="housing-notes"',
  },
  {
    // ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001: the strip now arrives with the
    // shared PlanPricingSection, so "unmount the page-local strip" is no longer
    // a reachable defect. The reachable ones are dropping the shared section
    // and adding a second, page-local strip.
    name: "the canonical shared pricing section is unmounted",
    file: "page",
    find: "      <PlanPricingSection\n        theme=\"esa\"",
    replace: "      <div\n        data-was=\"pricing\"",
  },
  {
    name: "a second, page-local PaymentTrustStrip is added (double strip)",
    file: "page",
    find: "      <PlanPricingSection\n        theme=\"esa\"",
    replace: "      <PaymentTrustStrip className=\"mt-8\" />\n      <PlanPricingSection\n        theme=\"esa\"",
  },
  {
    name: "decorative lifestyle photography returns as a hero background",
    file: "page",
    find: "      <section className=\"relative bg-white border-b border-slate-200\">",
    replace: "      <section className=\"relative bg-white border-b border-slate-200\" style={{ backgroundImage: \"url('/assets/lifestyle/woman-telehealth-with-dog.jpg')\" }}>",
  },
  {
    name: "the owner's verification snapshot is routed through a lossy re-encode",
    file: "page",
    find: "      <img\n        src=\"/assets/ui/verification-cropped.png\"",
    replace: "      <ResponsiveImage\n        src=\"/assets/ui/verification-cropped.png\"",
  },
  {
    name: "the approved delivery promise is replaced by a same-day claim",
    file: "page",
    find: "                label=\"Typically within 24 hours after provider review\"",
    replace: "                label=\"Same-day approval\"",
  },
  {
    name: "copy starts implying a FREE LETTER rather than a free assessment",
    file: "page",
    find: "              Starting the assessment is free.",
    replace: "              Your free ESA letter is waiting. Starting the assessment is free.",
  },
  {
    name: "a raw click ID joins the link-appended attribution fields",
    file: "store",
    find: '    ["utm_source",   data.utm_source],',
    replace: '    ["gclid",        data.gclid],\n    ["utm_source",   data.utm_source],',
  },
  {
    name: "ScrollTopButton becomes focusable while hidden (keyboard trap)",
    file: "scrolltop",
    find: "tabIndex={show ? 0 : -1}",
    replace: "tabIndex={0}",
  },
  {
    name: "the mobile sticky CTA loses its consent-safe z-index band",
    file: "sticky",
    find: 'consentSafe ? "z-[9990]" : "z-[9999]"',
    replace: '"z-[9999]"',
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────
// process.exitCode is used throughout rather than process.exit(): calling
// process.exit() inside the plant/restore loop would terminate the process
// BEFORE restoreAll() runs and leave a planted defect on disk.
let failures = 0;

console.log("check-esa-housing-redesign.selftest — negative controls\n");

const baseline = runGuard();
if (baseline.code !== 0) {
  console.error("ABORTED: the guard already fails on the clean tree. Fix that first.\n");
  console.error(baseline.out);
  process.exitCode = 1;
} else {
  for (const c of CONTROLS) {
    let planted = false;
    try {
      const res = patch(c.file, c.find, c.replace);
      if (res !== true) {
        console.error(`  ✗ ${c.name} — anchor matched ${res}x in ${relative(ROOT, F[c.file])} (need exactly 1); the control proves nothing`);
        failures++;
        continue;
      }
      planted = true;
      const r = runGuard();
      if (r.code === 0) {
        console.error(`  ✗ ${c.name} — the guard PASSED with the defect planted`);
        failures++;
      } else {
        console.log(`  ✓ detected: ${c.name}`);
      }
    } finally {
      if (planted) writeFileSync(F[c.file], original[c.file]);
    }
  }

  restoreAll();

  // The tree must come back byte-identical.
  for (const [k, p] of Object.entries(F)) {
    const now = sha(readFileSync(p));
    if (now !== originalHash[k]) {
      console.error(`  ✗ RESTORE FAILED for ${relative(ROOT, p)} — the file is NOT byte-identical`);
      failures++;
    }
  }

  const after = runGuard();
  if (after.code !== 0) {
    console.error("  ✗ the guard does not pass again after restore");
    console.error(after.out);
    failures++;
  }

  if (failures) {
    console.error(`\n[check-esa-housing-redesign.selftest] FAILED — ${failures} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`\n[check-esa-housing-redesign.selftest] OK — all ${CONTROLS.length} planted negative controls were detected and the tree was restored byte-identical.`);
  }
}
