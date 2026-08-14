// scripts/build-test-scan-artifacts.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 — TEST-ONLY physical-scan QA.
//
// Produces the two artifacts the owner prints and scans with a real phone:
//   docs/qa-artifacts/esa-test-scan-artifact.pdf  (+ .png)
//   docs/qa-artifacts/psd-test-scan-artifact.pdf  (+ .png)
//
// WHY THESE ARE SEPARATE FROM THE PUBLIC SAMPLES
//   The published samples encode the PRODUCTION host (pawtenant.com). Those QRs
//   cannot complete a verification until the matching demo records exist on
//   LIVE, and LIVE is out of scope. These artifacts therefore target the TEST
//   host, where the two canonical demo records already resolve. Keeping them in
//   docs/ (never public/) is what stops a TEST-targeted QR from being served as
//   a customer-facing sample.
//
// WHAT THEY ENCODE
//   https://pawtenant-test.vercel.app/verify/<VERIFICATION_ID>
//   Verification ID only — the same decision-A contract as the public samples.
//   No token is involved anywhere in this script, so nothing secret can reach
//   the repository, a filename, a log line or the shell history.
//
// PRESENTATION
//   The QR is bare: no caption, no ID, no URL, no branding. The "TEST QA" and
//   "PHYSICAL PHONE SCAN TEST" wording is a full-page diagonal WATERMARK across
//   the upper page, deliberately far from the bottom-right QR so it can never
//   read as a caption for it.
//
// The PDF is drawn with the SHIPPED module (supabase/functions/_shared/
// qrVerificationPdf.ts, transpiled), so the printed geometry is byte-for-byte
// the geometry a genuine letter gets — not a lookalike reimplementation.
//
//   node scripts/build-test-scan-artifacts.mjs
//   node scripts/build-test-scan-artifacts.mjs --check

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import esbuild from "esbuild";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const qrcode = require_("qrcode-generator");
const jsQRmod = require_("jsqr");
const jsQR = jsQRmod.default ?? jsQRmod;
const CHECK = process.argv.includes("--check");

const CFG = JSON.parse(readFileSync(resolve(ROOT, "scripts/sample-letter-demos.json"), "utf8"));
const TEST_BASE = CFG.testVerifyBase;
if (!TEST_BASE) throw new Error("sample-letter-demos.json is missing testVerifyBase");

const OUT_DIR = resolve(ROOT, "docs/qa-artifacts");
mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTS = {
  esa: { id: CFG.esa.id, label: "Emotional Support Animal", animal: "Support Animal" },
  psd: { id: CFG.psd.id, label: "Psychiatric Service Dog", animal: "Service Dog" },
};

// ── Load the SHIPPED QR module ───────────────────────────────────────────────
const modSrc = readFileSync(resolve(ROOT, "supabase/functions/_shared/qrVerificationPdf.ts"), "utf8")
  .replace(/https:\/\/esm\.sh\/pdf-lib@1\.17\.1/g, "pdf-lib")
  .replace(/https:\/\/esm\.sh\/qrcode-generator@1\.4\.4/g, "qrcode-generator");
const { code } = await esbuild.transform(modSrc, { loader: "ts", format: "esm" });
const modPath = join(ROOT, "node_modules", ".qrmod.artifacts.mjs");
writeFileSync(modPath, code);
const M = await import("file://" + modPath.replace(/\\/g, "/"));

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// ── PDF ──────────────────────────────────────────────────────────────────────
async function buildPdf(kind) {
  const p = PRODUCTS[kind];
  const url = `${TEST_BASE}/${p.id}`;

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Letterhead-ish body so the print resembles a real letter for scan realism.
  page.drawText("Sample Provider Name", { x: 56, y: 720, size: 16, font: bold, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("Licensed Mental Health Professional (illustrative placeholder)", {
    x: 56, y: 702, size: 10, font, color: rgb(0.28, 0.33, 0.41),
  });
  page.drawText(`${p.label} documentation`, { x: 56, y: 688, size: 10, font, color: rgb(0.28, 0.33, 0.41) });
  page.drawLine({ start: { x: 56, y: 674 }, end: { x: 556, y: 674 }, thickness: 0.7, color: rgb(0.89, 0.91, 0.94) });

  const body = [
    "To Whom It May Concern:",
    "",
    "This page is an INTERNAL TEST ARTIFACT produced to check that the printed QR code",
    `scans with a physical phone camera. It is not a clinical letter, it names no person,`,
    "and it certifies no animal. Every credential shown is a placeholder.",
    "",
    `Product under test: ${p.label}.`,
    `${p.animal}: placeholder — no real animal is described.`,
    "",
    "Scanning the printed code should open the TEST verification result for this product",
    "and show a Sample Verification marked DEMONSTRATION ONLY.",
  ];
  let y = 640;
  for (const line of body) {
    if (line) page.drawText(line, { x: 56, y, size: 10.5, font, color: rgb(0.12, 0.16, 0.22) });
    y -= 16;
  }

  page.drawText("Sincerely,", { x: 56, y: 300, size: 10.5, font, color: rgb(0.2, 0.25, 0.33) });
  page.drawText("Sample Provider Name", { x: 56, y: 276, size: 11, font: bold, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("No signature appears: a test artifact is not signed by any provider.", {
    x: 56, y: 260, size: 9, font, color: rgb(0.42, 0.47, 0.55),
  });

  // ── Watermark: UPPER/CENTRE of the page, diagonal, far from the QR ─────────
  // The QR lands at the bottom-right (18pt margin). Anchoring the watermark
  // around y=430-560 keeps a wide gap so it cannot read as a QR caption.
  for (const [text, wy, size] of [
    ["TEST QA - NOT FOR PUBLICATION", 560, 26],
    ["PHYSICAL PHONE SCAN TEST", 470, 26],
  ]) {
    page.drawText(text, {
      x: 70, y: wy, size, font: bold, color: rgb(0.86, 0.15, 0.15),
      opacity: 0.16, rotate: degrees(-24),
    });
  }

  // Footer identifies the artifact class — never the QR.
  page.drawLine({ start: { x: 56, y: 92 }, end: { x: 556, y: 92 }, thickness: 0.7, color: rgb(0.89, 0.91, 0.94) });
  page.drawText("TEST QA ARTIFACT - NOT FOR PUBLICATION. NOT A CLINICAL LETTER.", {
    x: 56, y: 76, size: 8.5, font: bold, color: rgb(0.86, 0.15, 0.15),
  });
  page.drawText("No real patient, provider, licence, signature or clinical assessment appears on this page.", {
    x: 56, y: 64, size: 8, font, color: rgb(0.42, 0.47, 0.55),
  });

  // ── The QR, drawn by the SHIPPED module at the production position ─────────
  const metrics = M.measureBlock({ letterId: p.id, verifyUrl: url }, font, bold);
  const MARGIN = 18;
  M.drawVerificationBlock(page, { letterId: p.id, verifyUrl: url }, 612 - MARGIN - metrics.width, MARGIN, font, bold);

  return { bytes: await doc.save(), url, metrics };
}

// ── PNG (300dpi raster of the same page, for a true print-size decode) ───────
function buildSvg(kind, url, inches) {
  const p = PRODUCTS[kind];
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const W = 2550, H = 3300;              // 8.5 x 11in at 300dpi
  const code = inches * 300;             // drawn code size in px
  const unit = code / n;
  const quiet = 4 * unit;
  const qx = W - 75 - code - quiet, qy = H - 75 - code - quiet;
  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      rects += `<rect x="${(qx + quiet + c * unit).toFixed(2)}" y="${(qy + quiet + r * unit).toFixed(2)}" width="${unit.toFixed(2)}" height="${unit.toFixed(2)}" fill="#000000"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g font-family="Helvetica, Arial, sans-serif" fill="#0f172a">
    <text x="233" y="300" font-size="66" font-weight="700">Sample Provider Name</text>
    <text x="233" y="352" font-size="42" fill="#475569">Licensed Mental Health Professional (illustrative placeholder)</text>
    <text x="233" y="400" font-size="42" fill="#475569">${p.label} documentation</text>
    <line x1="233" y1="440" x2="2317" y2="440" stroke="#e2e8f0" stroke-width="3"/>
    <text x="233" y="520" font-size="44">To Whom It May Concern:</text>
    <text x="233" y="596" font-size="44">This page is an INTERNAL TEST ARTIFACT for physical QR scan testing.</text>
    <text x="233" y="660" font-size="44">It is not a clinical letter and names no person.</text>
    <text x="233" y="724" font-size="44">Product under test: ${p.label}.</text>
    <text x="233" y="2500" font-size="44" fill="#334155">Sincerely,</text>
    <text x="233" y="2570" font-size="46" font-weight="700">Sample Provider Name</text>
  </g>
  <g transform="rotate(-24 700 1500)" opacity="0.16">
    <text x="200" y="1480" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="700" fill="#dc2626">TEST QA - NOT FOR PUBLICATION</text>
    <text x="200" y="1650" font-family="Helvetica, Arial, sans-serif" font-size="108" font-weight="700" fill="#dc2626">PHYSICAL PHONE SCAN TEST</text>
  </g>
  <g font-family="Helvetica, Arial, sans-serif">
    <line x1="233" y1="3060" x2="2317" y2="3060" stroke="#e2e8f0" stroke-width="3"/>
    <text x="233" y="3120" font-size="36" font-weight="700" fill="#dc2626">TEST QA ARTIFACT - NOT FOR PUBLICATION. NOT A CLINICAL LETTER.</text>
    <text x="233" y="3170" font-size="32" fill="#64748b">No real patient, provider, licence, signature or clinical assessment appears on this page.</text>
  </g>
  <rect x="${qx.toFixed(2)}" y="${qy.toFixed(2)}" width="${(code + quiet * 2).toFixed(2)}" height="${(code + quiet * 2).toFixed(2)}" fill="#ffffff"/>
  ${rects}
</svg>`;
}

// ── Decode the QR back OUT of the produced PDF ───────────────────────────────
async function readPageContent(doc, index) {
  const page = doc.getPage(index);
  const c = page.node.Contents();
  if (!c) return null;
  const list = c.constructor?.name === "PDFArray"
    ? c.asArray().map((r) => doc.context.lookup(r))
    : [c];
  let out = "";
  for (const s of list) {
    const raw = s.getContents();
    out += raw[0] === 0x78
      ? zlib.inflateSync(Buffer.from(raw)).toString("latin1")
      : Buffer.from(raw).toString("latin1");
  }
  return out;
}

async function decodeFromPdf(bytes, metrics) {
  const doc = await PDFDocument.load(bytes);
  const raw = await readPageContent(doc, 0);
  const pitch = metrics.modulePt;
  const re = /1 0 0 1 ([-\d.]+) ([-\d.]+) cm[\s\S]{0,80}?0 0 m\s*\n\s*0 ([\d.]+) l\s*\n\s*\3 \3 l\s*\n\s*\3 0 l\s*\n\s*h\s*\n\s*f/g;
  const rects = [];
  for (const m of raw.matchAll(re)) {
    if (Math.abs(Number(m[3]) - pitch) > 1e-6) continue;
    rects.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  if (!rects.length) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const n = metrics.moduleCount;
  const grid = Array.from({ length: n }, () => Array(n).fill(false));
  for (const r of rects) {
    const c = Math.round((r.x - minX) / pitch);
    const row = n - 1 - Math.round((r.y - minY) / pitch);
    if (row >= 0 && row < n && c >= 0 && c < n) grid[row][c] = true;
  }
  const scale = 8, quiet = 4, size = (n + quiet * 2) * scale;
  const px = Buffer.alloc(size * size, 255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const off = ((r + quiet) * scale + dy) * size + (c + quiet) * scale;
        px.fill(0, off, off + scale);
      }
    }
  }
  const rgba = await sharp(px, { raw: { width: size, height: size, channels: 1 } }).ensureAlpha().raw().toBuffer();
  const res = jsQR(new Uint8ClampedArray(rgba), size, size);
  return res ? res.data : null;
}

async function decodePng(buf) {
  const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).grayscale().raw()
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

let failed = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); failed++; };

for (const kind of ["esa", "psd"]) {
  const p = PRODUCTS[kind];
  const { bytes, url, metrics } = await buildPdf(kind);
  const inches = M.qrInches(metrics);
  const png = await sharp(Buffer.from(buildSvg(kind, url, inches))).png().toBuffer();

  const pdfPath = join(OUT_DIR, `${kind}-test-scan-artifact.pdf`);
  const pngPath = join(OUT_DIR, `${kind}-test-scan-artifact.png`);

  // Proofs, run before anything is written.
  const fromPdf = await decodeFromPdf(bytes, metrics);
  const fromPng = await decodePng(png);
  if (fromPdf !== url) fail(`${kind}: PDF QR decoded to ${fromPdf}, expected ${url}`);
  if (fromPng !== url) fail(`${kind}: PNG QR decoded to ${fromPng}, expected ${url}`);
  if (inches < 0.75 || inches > 0.9) fail(`${kind}: QR prints at ${inches.toFixed(3)}in, outside 0.75-0.90in`);
  if (!url.startsWith("https://pawtenant-test.")) fail(`${kind}: artifact must target the TEST host`);
  if (url.includes("token")) fail(`${kind}: artifact URL must carry no token`);

  const other = PRODUCTS[kind === "esa" ? "psd" : "esa"];
  if (fromPdf?.includes(other.id)) fail(`${kind}: artifact resolves to the other product's record`);

  // No visible ID / URL / token in the rendered PDF text.
  const doc = await PDFDocument.load(bytes);
  const rawStream = await readPageContent(doc, 0);
  const hexToStr = (h) => {
    const s = h.replace(/\s+/g, "");
    let t = ""; for (let i = 0; i + 1 < s.length; i += 2) t += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
    return t;
  };
  const shown = [
    ...[...rawStream.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1]),
    ...[...rawStream.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)].map((m) => hexToStr(m[1])),
  ].join("   ");
  for (const [what, needle] of [
    ["the Verification ID", p.id],
    ["a verification URL", "verify/"],
    ["the vercel host", "vercel.app"],
    ["a 'Scan to verify' caption", "Scan to verify"],
  ]) {
    if (shown.includes(needle)) fail(`${kind}: artifact visibly renders ${what}`);
  }

  if (CHECK) {
    console.log(`  CHECK ${kind}: decodes to ${url} at ${inches.toFixed(3)}in — not written`);
  } else {
    writeFileSync(pdfPath, bytes);
    writeFileSync(pngPath, png);
    console.log(`  wrote ${kind}-test-scan-artifact.pdf  ${bytes.length} bytes  sha256=${sha(bytes).slice(0, 16)}…`);
    console.log(`  wrote ${kind}-test-scan-artifact.png  ${png.length} bytes  sha256=${sha(png).slice(0, 16)}…`);
    console.log(`        QR -> ${url}   (${metrics.moduleCount} modules, ${inches.toFixed(3)}in)`);
  }
}

console.log(failed === 0 ? "\nAll artifact proofs passed." : `\n${failed} proof(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
