// scripts/check-sample-letter-assets.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 — sample asset guard.
//
// Rasterises each published sample SVG and DECODES its QR with jsQR. A QR that
// was "drawn" proves nothing; only a decode proves a phone will resolve it. The
// decode is run AT PRINT SIZE (the page rasterised at 300dpi, so the code
// occupies its real 0.85in) — decoding a 1600px render would prove only that
// the geometry is well formed, not that the printed article scans.
//
// It also enforces the QR-ONLY presentation: the asset must carry no
// Verification ID, no verification URL, no token and no scan caption as VISIBLE
// TEXT. The destination may exist only inside the QR module geometry.
//
//   node scripts/check-sample-letter-assets.mjs
//   node scripts/check-sample-letter-assets.mjs --self-test

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const sharp = require_("sharp");
const jsQRmod = require_("jsqr");
const jsQR = jsQRmod.default ?? jsQRmod;
const SELF = process.argv.includes("--self-test");

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"); }

const CFG = JSON.parse(readFileSync(resolve(ROOT, "scripts/sample-letter-demos.json"), "utf8"));

// The canonical target is the Verification ID alone. Anchored at both ends so a
// reintroduced `?token=` (or any other query string) fails rather than passes.
const DEMOS = {
  esa: { id: CFG.esa.id, urlRe: new RegExp(`^${escapeRe(`${CFG.verifyBase}/${CFG.esa.id}`)}$`) },
  psd: { id: CFG.psd.id, urlRe: new RegExp(`^${escapeRe(`${CFG.verifyBase}/${CFG.psd.id}`)}$`) },
};
const ASSETS = {
  esa: ["public/images/checkout/esa-sample-letter.svg", "public/assets/documents/esa-sample-letter.svg"],
  psd: ["public/images/checkout/psd-sample-letter.svg"],
};

// Text that must appear on every published sample.
const REQUIRED = ["SAMPLE — DEMONSTRATION ONLY"];

// QR-related wording that must NOT be visible anywhere on the page.
const FORBIDDEN_CAPTIONS = [
  "Scan to verify", "Scan to see", "Verify at", "Verify this letter",
  "Verification ID", "Verification number", "verification code",
  "pawtenant.com/verify", "www.pawtenant.com", "/verify/",
];

// The polished site sample uses a FICTIONAL provider persona (Dr. Amelia Hart)
// on purpose: the homepage and checkout need a letter that looks like the real
// product, and a generic "Sample Provider Name" worksheet does not. So the
// forbidden list is no longer aimed at that persona - it is aimed at anything
// that could pass for ISSUABLE credentials or REAL contact details.
//
// Reserved-for-fiction values are required instead: 555-01xx phone numbers and
// example.com addresses can never belong to a real clinic.
const FORBIDDEN = [
  // A licence number that looks issuable.
  /Licen[cs]e\s*#\s*(?!SAMPLE)[A-Z]{2,5}-?\d{4,}/,
  // Any NPI.
  /NPI/i,
  // Real-looking contact details: a non-reserved phone range or a live domain.
  /\((?!555)\d{3}\)\s*\d{3}-\d{4}/,
  /@(?!example\.com)[a-z0-9-]+\.(com|net|org|health|care)/i,
  // A plausible street address.
  /\d{3,5}\s+[A-Z][a-z]+\s+(Avenue|Street|Road|Drive|Boulevard|Lane)/,
];
/** Only the human-readable text of the SVG — what a reader actually sees. */
function visibleText(svg) {
  return [...svg.matchAll(/<(?:text|tspan)\b[^>]*>([\s\S]*?)<\/(?:text|tspan)>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ""))
    .join("\n");
}

/**
 * Rasterise at a chosen output DPI and decode.
 * The page stands for US Letter (8.5in wide), so width = 8.5 * dpi.
 */
async function decodeSvgAtDpi(svgText, dpi) {
  const width = Math.round(8.5 * dpi);
  const { data, info } = await sharp(Buffer.from(svgText), { density: 300 })
    .resize({ width })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const v = data[i * info.channels];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  const res = jsQR(rgba, info.width, info.height);
  return res ? res.data : null;
}

async function run(overrides = {}) {
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  for (const kind of ["esa", "psd"]) {
    const K = kind.toUpperCase();
    const svg = overrides[kind] ?? readFileSync(resolve(ROOT, ASSETS[kind][0]), "utf8");
    const expect = DEMOS[kind];
    const other = DEMOS[kind === "esa" ? "psd" : "esa"];

    // Print-size decode: 300dpi is the real article; 200 and 150 are margin.
    // The lower-DPI passes run only against the REAL published asset. In
    // self-test mode every mutated control would re-rasterise a 2550px page
    // three times over, which made the negative-control run take minutes
    // without testing anything the 300dpi pass does not already cover.
    const at300 = await decodeSvgAtDpi(svg, 300);
    const at200 = overrides[kind] ? at300 : await decodeSvgAtDpi(svg, 200);
    const at150 = overrides[kind] ? at300 : await decodeSvgAtDpi(svg, 150);

    add(`${K}1`, `${K} QR decodes at 300dpi print size`, !!at300);
    add(`${K}2`, `${K} QR decodes to EXACTLY ${CFG.verifyBase}/<ID> (no query, no token)`,
      !!at300 && expect.urlRe.test(at300));
    add(`${K}3`, `${K} QR host is pawtenant.com (not the TEST origin)`,
      !!at300 && at300.startsWith("https://pawtenant.com/verify/") && !/vercel\.app/.test(at300));
    add(`${K}4`, `${K} QR carries its OWN Verification ID`, !!at300 && at300.includes(expect.id));
    add(`${K}5`, `${K} QR does NOT carry the other product's ID`, !!at300 && !at300.includes(other.id));
    add(`${K}6`, `${K} QR still decodes at 200dpi and 150dpi`, !!at200 && !!at150);

    const vis = visibleText(svg);
    add(`${K}7`, `${K} required sample wording present`, REQUIRED.every((t) => svg.includes(t)));
    add(`${K}8`, `${K} NO visible Verification ID anywhere on the page`, !vis.includes(expect.id));
    add(`${K}9`, `${K} NO visible verification URL anywhere on the page`,
      !/pawtenant\.com\s*\/\s*verify/i.test(vis) && !/https?:\/\//i.test(vis));
    add(`${K}10`, `${K} NO QR caption or verification wording is visible`,
      !FORBIDDEN_CAPTIONS.some((t) => vis.toLowerCase().includes(t.toLowerCase())));
    add(`${K}11`, `${K} NO 22-char token-like literal appears in the file`,
      !/[?&]token=/.test(svg) && !/\b[A-Za-z0-9_-]{22}\b/.test(vis));
    add(`${K}12`, `${K} carries no issuable licence, NPI or real-looking contact details`,
      !FORBIDDEN.some((re) => re.test(svg)));
    add(`${K}13`, `${K} no genuine TEST verification id appears`,
      !/ESA-(?!ZZ-)[A-Z]{2}-[A-HJ-NP-Z2-9]{7}/.test(svg) && !/PSD-(?!ZZ-)[A-Z]{2}-[A-HJ-NP-Z2-9]{7}/.test(svg));
    add(`${K}14`, `${K} no NPI or plausible state licence number`,
      !/\bNPI\b/i.test(svg) && !/\b(LPC|LCSW|LMFT|PSY|MD)-?\d{4,}/i.test(svg));

    // Every published path for this product must be byte-identical to the first.
    if (!overrides[kind]) {
      const all = ASSETS[kind].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
      add(`${K}15`, `${K} all ${ASSETS[kind].length} published path(s) are in sync`,
        all.every((s) => s === all[0]));
    }
  }
  return r;
}

const base = readFileSync(resolve(ROOT, ASSETS.esa[0]), "utf8");

if (SELF) {
  console.log("[check-sample-letter-assets] self-test — each control must TRIP\n");
  const CONTROLS = [
    ["ESA7", "the SAMPLE mark is removed", base.replaceAll("SAMPLE — DEMONSTRATION ONLY", "Verified Letter")],
    ["ESA12", "an issuable-looking licence is reintroduced", base.replaceAll("SAMPLE-NOT-ISSUABLE", "LPC-204817-CA")],
    ["ESA12", "a real-looking clinic email is reintroduced", base.replace("provider@example.com", "amelia.hart@harborclinic.com")],
    ["ESA14", "an NPI is added", base.replace(">Sincerely,<", ">NPI 1234567890<")],
    // The QR-only controls: each reintroduces exactly one thing the owner banned.
    ["ESA8", "the Verification ID is printed again",
      base.replace(">Sincerely,<", `>${DEMOS.esa.id}<`)],
    ["ESA9", "the verification URL is printed again",
      base.replace(">Sincerely,<", `>${CFG.verifyBase}/${DEMOS.esa.id}<`)],
    ["ESA10", "a 'Scan to verify' caption comes back",
      base.replace(">Sincerely,<", ">Scan to verify<")],
  ];
  let bad = 0;
  for (const [target, label, mutated] of CONTROLS) {
    const changed = mutated !== base;
    const hit = (await run({ esa: mutated })).find((x) => x.id === target);
    const tripped = changed && hit && !hit.ok;
    if (!tripped) bad++;
    console.log(`  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(6)} ${label}`);
  }
  console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
  process.exit(bad === 0 ? 0 : 1);
}

const results = await run();
for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(6)} ${x.desc}`);
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
