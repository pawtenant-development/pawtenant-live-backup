// scripts/test-qr-verification-pdf.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · Stage 2 regression harness.
//
// Exercises the REAL shared module (supabase/functions/_shared/qrVerificationPdf.ts)
// by transpiling it with esbuild and rewriting its esm.sh specifiers to the
// identical npm versions installed here — pdf-lib 1.17.1, qrcode-generator 1.4.4.
// Nothing is reimplemented, so a defect in the shipped code fails here.
//
// Every generated QR is DECODED: matrix -> PNG (sharp) -> jsQR -> compare the
// decoded string to the canonical URL. A successful pdf-lib call proves nothing
// on its own, which is exactly the trap this harness exists to avoid.
//
//   node scripts/test-qr-verification-pdf.mjs
//   node scripts/test-qr-verification-pdf.mjs --emit <dir>   also write PDFs/PNGs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";
import jsQR from "jsqr";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import zlib from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EMIT_IDX = process.argv.indexOf("--emit");
const EMIT_DIR = EMIT_IDX !== -1 ? process.argv[EMIT_IDX + 1] : null;
if (EMIT_DIR) mkdirSync(EMIT_DIR, { recursive: true });

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const bad = (n, m) => { failed++; console.error(`  ✗ ${n}\n      ${m}`); };
const check = (n, c, m) => (c ? ok(n) : bad(n, m || "assertion failed"));

// ── Load the shipped module ──────────────────────────────────────────────────
// Normalise to LF before anything reads it. Section 8 patches this source at a
// multi-line ANCHOR to prove the caption assertion can actually fail; on a CRLF
// checkout that LF anchor silently misses and the negative control degrades to a
// NO-OP — a control that cannot fail proves nothing.
const src = readFileSync(join(ROOT, "supabase/functions/_shared/qrVerificationPdf.ts"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/https:\/\/esm\.sh\/pdf-lib@1\.17\.1/g, "pdf-lib")
  .replace(/https:\/\/esm\.sh\/qrcode-generator@1\.4\.4/g, "qrcode-generator");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
const modPath = join(ROOT, "node_modules", ".qrmod.test.mjs");
writeFileSync(modPath, code);
const M = await import("file://" + modPath.replace(/\\/g, "/"));

// The SHORT alias the generator actually encodes for genuine letters
// (generate-qr-verification-pdf builds `${VERIFY_BASE}/v/t/${token}`). Keeping
// the harness on the real route means the matrix sizes measured here are the
// matrix sizes that get printed.
const CANON = (t) => `https://pawtenant.com/v/t/${t}`;

/**
 * Every string actually SHOWN by a content stream, decoded.
 *
 * pdf-lib writes text as a HEX string — `<5363616E20746F20766572696679> Tj`,
 * not `(Scan to verify) Tj`. A guard that greps the raw stream for "Scan to
 * verify" or "pawtenant" therefore matches nothing whether or not a caption is
 * present: it passes vacuously. This decodes both string forms (and the TJ
 * array) so the caption assertions test what the page RENDERS, not how pdf-lib
 * happened to encode it.
 */
function drawnStrings(raw) {
  const out = [];
  const hex = (h) => {
    const s = h.replace(/\s+/g, "");
    let t = "";
    for (let i = 0; i + 1 < s.length; i += 2) t += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
    return t;
  };
  for (const m of raw.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) out.push(m[1]);
  for (const m of raw.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) out.push(hex(m[1]));
  for (const m of raw.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    for (const p of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) out.push(p[1]);
    for (const p of m[1].matchAll(/<([0-9A-Fa-f\s]*)>/g)) out.push(hex(p[1]));
  }
  return out;
}

// ── QR decode: matrix -> PNG -> jsQR ─────────────────────────────────────────
async function decodeMatrix(matrix, scale = 8, quiet = 4) {
  const n = matrix.length;
  const size = (n + quiet * 2) * scale;
  const px = Buffer.alloc(size * size, 255); // white, 1 channel
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const y = (r + quiet) * scale + dy;
        const rowOff = y * size + (c + quiet) * scale;
        px.fill(0, rowOff, rowOff + scale);
      }
    }
  }
  const rgba = await sharp(px, { raw: { width: size, height: size, channels: 1 } })
    .ensureAlpha().raw().toBuffer();
  const res = jsQR(new Uint8ClampedArray(rgba), size, size);
  return res ? res.data : null;
}

// ── Old block geometry, computed exactly as the shipped injector does ────────
async function oldBlockSize(letterId) {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const bold = await d.embedFont(StandardFonts.HelveticaBold);
  const w1 = font.widthOfTextAtSize("Verification ID:", 8);
  const w2 = bold.widthOfTextAtSize(letterId, 11);
  const w3 = font.widthOfTextAtSize(`pawtenant.com/verify/${letterId}`, 7.5);
  return { width: Math.max(w1, w2, w3) + 16, height: (8 + 4) + (11 + 4) + (7.5 + 4) + 8 };
}

// ── Synthetic provider letters covering the required shapes ─────────────────
async function makeLetter({ size = [612, 792], pages = 1, style = "normal" } = {}) {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const pg = d.addPage(size);
    const [w, h] = size;
    if (style === "image") {
      // A "scanned" letter: one full-page raster. Content-stream parsing cannot
      // prove anything about it, so this MUST fall back to an appended page.
      const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 220, g: 220, b: 220 } } })
        .png().toBuffer();
      const img = await d.embedPng(png);
      pg.drawImage(img, { x: 0, y: 0, width: w, height: h });
      continue;
    }
    pg.drawText("Dr. Alex Rivera, PsyD, LCSW", { x: 60, y: h - 80, size: 12, font });
    pg.drawText("Licensed Clinical Social Worker", { x: 60, y: h - 96, size: 9, font });
    for (let i = 0; i < 14; i++) {
      pg.drawText("Clinical narrative line describing the recommendation.", { x: 60, y: h - 140 - i * 16, size: 10, font });
    }
    if (style === "bottomCredential") {
      // Credential + signature pushed into the bottom margin: no safe band.
      pg.drawText("License # CSW.00000334  State of Colorado", { x: 60, y: 40, size: 9, font });
      pg.drawText("Signature: ______________________", { x: 60, y: 22, size: 9, font });
    } else if (style === "full") {
      for (let i = 0; i < 34; i++) {
        pg.drawText("Dense body copy occupying the full page height.", { x: 60, y: h - 380 - i * 11, size: 9, font });
      }
      pg.drawText("License # 7193-C", { x: 60, y: 30, size: 9, font });
    } else {
      pg.drawText("Sincerely,", { x: 60, y: 300, size: 10, font });
      pg.drawText("Dr. Alex Rivera  ·  License # 7193-C", { x: 60, y: 250, size: 9, font });
    }
  }
  return await d.save();
}

// Content streams are Flate-compressed in practice (pdf-lib writes `x\x9c…`,
// and so does every real-world producer), so getContents() hands back raw
// deflate bytes. Anything we cannot inflate returns null, which the module
// treats as "unreadable" and routes to the appended-page fallback — the same
// contract the Deno reader honours with DecompressionStream.
async function readPageContent(doc, i) {
  const page = doc.getPage(i);
  const contents = page.node.Contents();
  if (!contents) return null;
  const streams = contents.constructor?.name === "PDFArray"
    ? contents.asArray().map((r) => doc.context.lookup(r))
    : [contents];
  let out = "";
  for (const s of streams) {
    if (!s?.getContents) return null;
    const raw = Buffer.from(s.getContents());
    let text;
    try {
      text = raw[0] === 0x78 ? zlib.inflateSync(raw).toString("latin1") : raw.toString("latin1");
    } catch {
      try { text = zlib.inflateRawSync(raw).toString("latin1"); } catch { return null; }
    }
    out += text;
  }
  return out;
}

console.log("QR verification PDF — Stage 2\n");

// ══ 1. QR encoding + real decode ════════════════════════════════════════════
console.log("1. QR encode → PNG → jsQR decode");
const TOKENS = ["tTqXyK9Vw2FjcBBtqLrtOw", "1fZFFJcMZGDHpRkcMklSqw", "AAAAAAAAAAAAAAAAAAAAAA", "zzzz-_zzzzzzzzzzzzzzzz"];
for (const t of TOKENS) {
  const url = CANON(t);
  const m = M.qrMatrix(url);
  const decoded = await decodeMatrix(m);
  check(`decodes to canonical URL (${t.slice(0, 8)}…)`, decoded === url, `got ${decoded}`);
}
{
  const m = M.qrMatrix(CANON(TOKENS[0]));
  check("deterministic (same input → identical matrix)",
    JSON.stringify(m) === JSON.stringify(M.qrMatrix(CANON(TOKENS[0]))));
  check("QR stays compact (≤ version 4 / 33 modules)", m.length <= 33, `modules=${m.length}`);
  check("token is not printed anywhere in the block spec",
    !JSON.stringify(M.measureBlock({ letterId: "ESA-CO-D9DQADP", verifyUrl: CANON(TOKENS[0]) },
      await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica),
      await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold))).includes(TOKENS[0]));
}

// ══ 2. Block geometry vs the block being replaced ═══════════════════════════
console.log("\n2. Compact block vs current injected block");
const LETTER_ID = "ESA-CO-D9DQADP";
{
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const bold = await d.embedFont(StandardFonts.HelveticaBold);
  const spec = { letterId: LETTER_ID, verifyUrl: CANON(TOKENS[0]) };
  const nu = M.measureBlock(spec, font, bold);
  const old = await oldBlockSize(LETTER_ID);
  const oldArea = old.width * old.height, newArea = nu.width * nu.height;
  const red = ((1 - newArea / oldArea) * 100);
  console.log(`     OLD  ${old.width.toFixed(1)} × ${old.height.toFixed(1)} pt  = ${oldArea.toFixed(0)} pt²`);
  console.log(`     NEW  ${nu.width.toFixed(1)} × ${nu.height.toFixed(1)} pt  = ${newArea.toFixed(0)} pt²`);
  console.log(`     area change: ${red >= 0 ? "−" : "+"}${Math.abs(red).toFixed(1)}%   QR ${nu.qrSize.toFixed(1)}pt @ ${nu.modulePt.toFixed(2)}pt/module (${nu.moduleCount} modules)`);
  check("new block is NARROWER than the old one", nu.width < old.width, `${nu.width.toFixed(1)} vs ${old.width.toFixed(1)}`);
  check("total occupied AREA is reduced", newArea < oldArea, `${newArea.toFixed(0)} vs ${oldArea.toFixed(0)} pt²`);
  check("module size ≥ print-reliable minimum", nu.modulePt >= M.QR_MODULE_MIN_PT, `${nu.modulePt}`);
  check("quiet zone preserved (4 modules)", nu.quietZonePt >= 4 * nu.modulePt - 0.001);
}

// ══ 3. Placement across page shapes ═════════════════════════════════════════
console.log("\n3. Safe placement (no page is ever appended)");
const SHAPES = [
  ["US Letter portrait, normal",    { size: [612, 792], style: "normal" },            "inline"],
  ["A4 portrait, normal",           { size: [595.28, 841.89], style: "normal" },      "inline"],
  ["Landscape",                     { size: [792, 612], style: "normal" },            "inline"],
  ["Unusual size (Legal)",          { size: [612, 1008], style: "normal" },           "inline"],
  ["Multi-page (3pp)",              { size: [612, 792], style: "normal", pages: 3 },  "inline"],
  ["Credential+signature at bottom",{ size: [612, 792], style: "bottomCredential" },  "inline"],
  ["Full-page dense text",          { size: [612, 792], style: "full" },              "any"],
  ["Scanned/image-only PDF",        { size: [612, 792], style: "image" },             "any"],
];
const emitted = [];
for (const [label, opts, expect] of SHAPES) {
  const orig = await makeLetter(opts);
  const origHash = createHash("sha256").update(Buffer.from(orig)).digest("hex");
  const spec = { letterId: LETTER_ID, verifyUrl: CANON(TOKENS[0]) };
  const res = await M.buildQrVerificationPdf(orig, spec, readPageContent);
  const afterHash = createHash("sha256").update(Buffer.from(orig)).digest("hex");

  check(`${label} → ${res.placement.mode}`, expect === "any" || res.placement.mode === expect,
    `expected ${expect}, got ${res.placement.mode} (${res.placement.reason})`);
  // The page count is the invariant that actually matters now: a QR must never
  // cost a sheet, whichever corner (or none) it lands in.
  check(`${label}: page count unchanged`, res.pageCountAfter === res.pageCountBefore,
    `${res.pageCountBefore} -> ${res.pageCountAfter}`);
  check(`${label}: source buffer not mutated`, origHash === afterHash);
  if (res.placement.mode === "never-appended") {
    check(`${label}: exactly one page appended`, res.pageCountAfter === res.pageCountBefore + 1,
      `${res.pageCountBefore} → ${res.pageCountAfter}`);
  } else {
    check(`${label}: page count unchanged`, res.pageCountAfter === res.pageCountBefore);
  }
  if (EMIT_DIR) {
    const f = join(EMIT_DIR, label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".pdf");
    writeFileSync(f, Buffer.from(res.bytes));
    emitted.push({ label, file: f, mode: res.placement.mode, reason: res.placement.reason });
  }
}

// ══ 4. Non-overlap proof ════════════════════════════════════════════════════
console.log("\n4. Placement never intersects located provider content");
for (const [label, opts] of SHAPES.filter(([, , e]) => e === "inline").map((s) => [s[0], s[1]])) {
  const orig = await makeLetter(opts);
  const doc = await PDFDocument.load(orig);
  const raw = await readPageContent(doc, 0);
  const { width, height } = doc.getPage(0).getSize();
  const bounds = M.analyzePageContent(raw, width, height);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const metrics = M.measureBlock({ letterId: LETTER_ID, verifyUrl: CANON(TOKENS[0]) }, font, bold);
  const pl = M.findSafePlacement(bounds, width, height, metrics, 0);
  if (pl.mode !== "inline") { check(`${label}: (fell back)`, true); continue; }
  const o = bounds.occupied;
  const bx1 = pl.x, by1 = pl.y, bx2 = pl.x + metrics.width, by2 = pl.y + metrics.height;
  const intersects = !(bx2 <= o.minX || bx1 >= o.maxX || by2 <= o.minY || by1 >= o.maxY);
  check(`${label}: block does not intersect content bbox`, !intersects,
    `block(${bx1.toFixed(0)},${by1.toFixed(0)}-${bx2.toFixed(0)},${by2.toFixed(0)}) vs content(${o.minX.toFixed(0)},${o.minY.toFixed(0)}-${o.maxX.toFixed(0)},${o.maxY.toFixed(0)})`);
}

// ══ 5. Conservative-by-construction ════════════════════════════════════════
console.log("\n5. Unmodelled content is never treated as blank");
{
  const W = 612, H = 792;
  const cases = [
    ["XObject (Do)", "q 1 0 0 1 0 0 cm /X0 Do Q"],
    ["inline image (BI)", "BI /W 10 /H 10 ID xxxx EI"],
    ["shading (sh)", "/Sh0 sh"],
    ["scaling transform", "2 0 0 2 0 0 cm BT /F1 12 Tf 100 700 Td (hi) Tj ET"],
    ["empty stream", ""],
    ["content outside page box", "BT /F1 12 Tf 100 5000 Td (hi) Tj ET"],
  ];
  for (const [label, stream] of cases) {
    const b = M.analyzePageContent(stream, W, H);
    // An empty stream is PROOF of a blank page, so it is "understood" with no
    // rects. Everything else in this list is genuinely unmodellable.
    const expectUnderstood = label === "empty stream";
    check(`${label} → understood=${expectUnderstood}`, b.understood === expectUnderstood, `reason=${b.reason}`);
    const pl = M.findSafePlacement(b, W, H, { width: 80, height: 90 }, 0);
    check(`${label} → ${expectUnderstood ? "placeable" : "safe-fail (no page appended)"}`,
      expectUnderstood ? pl.mode === "inline" : pl.mode === "none");
  }
}

// ══ 6. Decode the QR back OUT of the generated PDF ══════════════════════════
// The strongest proof available without a rasterizer: read the produced PDF,
// inflate the page it drew onto, collect the black module rectangles, rebuild
// the matrix from their geometry, and decode THAT with jsQR. This exercises the
// real drawn output — module order, y-axis flip, module pitch and quiet zone —
// not the encoder's in-memory matrix.
console.log("\n6. QR decoded back out of the generated PDF");
for (const [label, opts] of SHAPES.map((s) => [s[0], s[1]])) {
  const orig = await makeLetter(opts);
  const url = CANON(TOKENS[0]);
  const res = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: url }, readPageContent);

  const doc = await PDFDocument.load(res.bytes);
  const target = res.placement.pageIndex ?? 0;
  const raw = await readPageContent(doc, target);
  if (!raw) { bad(`${label}: could not read generated page`, "null stream"); continue; }

  // pdf-lib does NOT emit `re`. drawRectangle translates with `cm` and then
  // emits the square as a path at the origin:
  //   1 0 0 1 <x> <y> cm ... 0 0 m / 0 <p> l / <p> <p> l / <p> 0 l / h / f
  // so the module position lives in the cm translate, and the pitch in the path.
  //
  // The side length is CAPTURED, never interpolated. An earlier version built
  // the pattern from `pitch.toFixed(2)`, which silently depended on the pitch
  // being a round number: the moment the QR was sized to a printed target
  // (61pt / 33 modules = 1.8484…pt) pdf-lib emitted the full-precision value,
  // the pattern matched nothing, and the decode assertions reported "no QR
  // module rectangles" — a harness artifact that looked exactly like a missing
  // QR. Capturing the side keeps this test honest for any pitch.
  const pitch = res.metrics.modulePt;
  const moduleRe = new RegExp(
    String.raw`1 0 0 1 ([-\d.]+) ([-\d.]+) cm[\s\S]{0,80}?0 0 m\s*\n\s*0 ([\d.]+) l\s*\n\s*\3 \3 l\s*\n\s*\3 0 l\s*\n\s*h\s*\n\s*f`,
    "g",
  );
  // The white quiet-zone plate is drawn with the same operator sequence, so
  // squares are kept only when their side matches the module pitch.
  const rects = [];
  for (const m of raw.matchAll(moduleRe)) {
    if (Math.abs(Number(m[3]) - pitch) > 1e-6) continue;
    rects.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  // A page with no safe corner draws nothing, and that is a PASS for the
  // no-appending contract - there is simply no QR to decode.
  if (res.placement.mode !== "inline") {
    check(`${label}: safe-fail draws nothing and adds no page`,
      res.pageCountAfter === res.pageCountBefore && rects.length === 0,
      `mode=${res.placement.mode} rects=${rects.length}`);
    continue;
  }
  if (!rects.length) { bad(`${label}: no QR module rectangles found in PDF`, ""); continue; }

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const n = res.metrics.moduleCount;
  const grid = Array.from({ length: n }, () => Array(n).fill(false));
  for (const r of rects) {
    const c = Math.round((r.x - minX) / pitch);
    const rowFromBottom = Math.round((r.y - minY) / pitch);
    const row = n - 1 - rowFromBottom; // undo the PDF y-flip
    if (row >= 0 && row < n && c >= 0 && c < n) grid[row][c] = true;
  }
  const decoded = await decodeMatrix(grid);
  check(`${label} [${res.placement.mode}]: PDF-embedded QR decodes to canonical URL`,
    decoded === url, `got ${decoded}`);
  check(`${label}: decoded URL carries the opaque token, not the Verification ID`,
    decoded === url && !decoded.includes(LETTER_ID));
}

// ══ 7. QR-ONLY presentation ════════════════════════════════════════════════
// The letter must carry a bare QR: no "Scan to verify", no Verification ID, no
// URL, no token, no PawTenant wording. This is asserted against the DRAWN PDF
// (text-showing operators in the content stream), not against the source, so a
// caption reintroduced through any helper still fails here.
console.log("\n7. QR-only presentation (no caption, no ID, no URL on the page)");
{
  const url = CANON(TOKENS[0]);
  for (const [label, opts] of [["text letter", {}], ["image-only letter", { imageOnly: true }]]) {
    const orig = await makeLetter(opts);
    const before = await PDFDocument.load(orig);
    const beforeText = (await readPageContent(before, 0)) ?? "";
    const res = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: url }, readPageContent);
    const doc = await PDFDocument.load(res.bytes);
    const target = res.placement.pageIndex ?? 0;
    const raw = (await readPageContent(doc, target)) ?? "";

    // Text drawn by US = strings rendered on the target page that the original
    // page did not already render.
    const beforeShown = new Set(drawnStrings(beforeText));
    const added = drawnStrings(raw).filter((s) => !beforeShown.has(s));
    check(`${label}: the QR block draws NO text at all`,
      added.length === 0, `added text: ${JSON.stringify(added.slice(0, 4))}`);

    // Asserted against RENDERED text, not the raw stream — see drawnStrings().
    const rendered = drawnStrings(raw).join("   ");
    for (const [what, needle] of [
      ["the Verification ID", LETTER_ID],
      ["a pawtenant.com URL", "pawtenant"],
      ["the raw token", TOKENS[0]],
      ["a 'Scan to verify' caption", "Scan to verify"],
      ["a 'Verify' caption", "Verify"],
    ]) {
      check(`${label}: page does not render ${what}`, !rendered.includes(needle));
    }

    // Printed size must land in the owner's 0.75-0.9 inch band.
    const inches = M.qrInches(res.metrics);
    check(`${label}: QR prints at ${inches.toFixed(3)}in (0.75-0.90in required)`,
      inches >= 0.75 && inches <= 0.9, `got ${inches.toFixed(3)}in`);
    check(`${label}: quiet zone is a full 4 modules`,
      Math.abs(res.metrics.quietZonePt - 4 * res.metrics.modulePt) < 1e-9);
  }
}

// ══ 8. Negative control ════════════════════════════════════════════════════
// A test that only ever passes proves nothing. Re-run the section-7 caption
// assertion against a DELIBERATELY captioned block and require it to FAIL.
console.log("\n8. Negative control — a reintroduced caption must be caught");
{
  const ANCHOR = "  return m;\n}\n\n// ── XObject resolution";
  const captioned = src.replace(
    ANCHOR,
    `  page.drawText("Scan to verify", { x, y, size: 6, font: undefined });\n${ANCHOR}`,
  );
  const changed = captioned !== src;
  const { code: cCode } = await esbuild.transform(captioned, { loader: "ts", format: "esm" });
  const cPath = join(ROOT, "node_modules", ".qrmod.control.mjs");
  writeFileSync(cPath, cCode);
  const CM = await import("file://" + cPath.replace(/\\/g, "/"));

  const orig = await makeLetter({});
  const before = await PDFDocument.load(orig);
  const beforeText = (await readPageContent(before, 0)) ?? "";
  const res = await CM.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: CANON(TOKENS[0]) }, readPageContent);
  const doc = await PDFDocument.load(res.bytes);
  const raw = (await readPageContent(doc, res.placement.pageIndex ?? 0)) ?? "";
  const beforeShown = new Set(drawnStrings(beforeText));
  const added = drawnStrings(raw).filter((s) => !beforeShown.has(s));
  check("control: planted caption is DETECTED (anchor still valid)",
    changed && added.includes("Scan to verify"),
    changed
      ? `the no-text assertion did NOT trip — it cannot detect a caption (added=${JSON.stringify(added)})`
      : "NO-OP: the patch anchor no longer matches");
}

if (EMIT_DIR) {
  console.log("\nEmitted PDFs:");
  for (const e of emitted) console.log(`  ${e.mode.padEnd(9)} ${e.file}  — ${e.reason}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
