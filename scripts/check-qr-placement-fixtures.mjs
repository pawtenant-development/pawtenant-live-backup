// scripts/check-qr-placement-fixtures.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 — QR PLACEMENT regression suite.
//
// WHAT THIS PINS. inject-pdf-footer stamps the letter customers download. The
// QR must land in whitespace, never on content, and must NEVER cost a page. The
// first placement model failed both ways at once: any XObject aborted the
// analysis, so practically every real letter (they all carry a letterhead logo)
// fell through to "append a dedicated page" — a small QR silently adding a
// near-blank sheet to a clinical document.
//
// Fixtures are built with pdf-lib and driven through the REAL shipped module
// (supabase/functions/_shared/qrVerificationPdf.ts, transpiled), so a defect in
// the shipped code fails here.
//
// The verifier is shared by the positive fixtures and the negative controls:
// each control hands it a deliberately BROKEN artifact and requires the
// matching violation to be reported. A guard that only ever passes proves
// nothing, so every control must trip.
//
//   node scripts/check-qr-placement-fixtures.mjs
//   node scripts/check-qr-placement-fixtures.mjs --self-test

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";
import esbuild from "esbuild";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, PDFOperator, PDFNumber } from "pdf-lib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const jsQRmod = require_("jsqr");
const jsQR = jsQRmod.default ?? jsQRmod;
const SELF = process.argv.includes("--self-test");

const QR_URL = "https://pawtenant.com/v/t/FIXTUREfixtureFIXTUR";
const LETTER_ID = "ESA-QA-0000001";

// ── Load the shipped module ──────────────────────────────────────────────────
const MOD_SRC = readFileSync(join(ROOT, "supabase/functions/_shared/qrVerificationPdf.ts"), "utf8")
  .replace(/https:\/\/esm\.sh\/pdf-lib@1\.17\.1/g, "pdf-lib")
  .replace(/https:\/\/esm\.sh\/qrcode-generator@1\.4\.4/g, "qrcode-generator");

async function loadModule(src = MOD_SRC, tag = "fixtures") {
  const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
  const p = join(ROOT, "node_modules", `.qrmod.${tag}.mjs`);
  writeFileSync(p, code);
  return await import("file://" + p.replace(/\\/g, "/") + "?v=" + code.length);
}
const M = await loadModule();

async function readPageContent(doc, index) {
  try {
    const page = doc.getPage(index);
    const c = page.node.Contents();
    if (!c) return "";
    const list = c.constructor?.name === "PDFArray"
      ? c.asArray().map((r) => doc.context.lookup(r))
      : [c];
    let out = "";
    for (const s of list) {
      if (!s?.getContents) return null;
      const raw = Buffer.from(s.getContents());
      if (raw[0] === 0x78) { out += zlib.inflateSync(raw).toString("latin1"); continue; }
      const t = raw.toString("latin1");
      if (/[A-Za-z]/.test(t.slice(0, 32))) { out += t; continue; }
      try { out += zlib.inflateRawSync(raw).toString("latin1"); } catch { return null; }
    }
    return out;
  } catch { return null; }
}

// ── Fixture builders ─────────────────────────────────────────────────────────
async function pngLogo(w, h, color = "#1f5fbf") {
  return await sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

/**
 * @param opts.pageSize      [w,h]
 * @param opts.letterhead    draw a logo XObject in the header band
 * @param opts.signature     draw a signature-like image low on the page
 * @param opts.footerText    occupy the bottom band across the full width
 * @param opts.pages         page count
 * @param opts.bodyLines     lines of body text
 * @param opts.clipFirst     emit a page-sized clipping rect (real producers do)
 */
async function buildLetter(opts = {}) {
  const {
    pageSize = [612, 792], letterhead = false, signature = false,
    footerText = false, pages = 1, bodyLines = 12, clipFirst = false,
    // Region fixtures. `blocks` are explicit painted rectangles in page space,
    // used to occupy a chosen band of the right-hand column so the ladders can
    // be driven deterministically. `whiteWash` paints a page-sized WHITE fill,
    // which is invisible and must NOT count as occupancy. `strokeBlocks` are
    // stroked (not filled) rectangles — a stroke is visible in any colour, so
    // it must count even though a white FILL does not.
    blocks = [], whiteWash = false, strokeBlocks = [],
  } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = letterhead || signature ? await doc.embedPng(await pngLogo(240, 60)) : null;

  // GROUND TRUTH. Every rect below is computed from pdf-lib's own font metrics
  // and the exact image boxes we place, so overlap is judged against what was
  // really drawn - not against the analyzer's opinion of it. Verifying the
  // placement with the same code that chose it would be circular and would pass
  // even when both are wrong together.
  const truth = [];
  const T = (pageIndex, x0, y0, x1, y1) => truth.push({ pageIndex, x0, y0, x1, y1 });
  const TT = (pageIndex, str, x, y, size, f) =>
    T(pageIndex, x, y - size * 0.25, x + f.widthOfTextAtSize(str, size), y + size);

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage(pageSize);
    const [w, h] = pageSize;
    if (whiteWash) {
      // Page-sized white background wash — the construct converted PDFs open
      // with. Invisible, therefore not occupancy, therefore must not block.
      page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
    }
    if (clipFirst) {
      // A page-sized clip path. It paints nothing, and must not be treated as
      // occupancy — this is the exact construct that used to blank the page.
      page.pushOperators(
        PDFOperator.of("re", [PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(w), PDFNumber.of(h)]),
        PDFOperator.of("W"),
        PDFOperator.of("n"),
      );
    }
    if (letterhead && logo) {
      page.drawImage(logo, { x: 56, y: h - 90, width: 240, height: 60 });
      T(p, 56, h - 90, 296, h - 30);
    }
    page.drawText("Sample Provider Name", { x: 56, y: h - 120, size: 14, font: bold });
    TT(p, "Sample Provider Name", 56, h - 120, 14, bold);
    for (let i = 0; i < bodyLines; i++) {
      const line = `Body line ${i + 1} of the letter, describing the accommodation request.`;
      page.drawText(line, { x: 56, y: h - 160 - i * 16, size: 10, font });
      TT(p, line, 56, h - 160 - i * 16, 10, font);
    }
    if (signature && logo && p === pages - 1) {
      page.drawImage(logo, { x: 56, y: 150, width: 160, height: 40 });
      T(p, 56, 150, 216, 190);
      page.drawText("Provider signature above", { x: 56, y: 138, size: 9, font });
      TT(p, "Provider signature above", 56, 138, 9, font);
    }
    if (footerText) {
      const fl = "Clinic footer line that runs the whole width of the page bottom edge here";
      page.drawText(fl, { x: 40, y: 30, size: 9, font });
      TT(p, fl, 40, 30, 9, font);
      const pn = `${p + 1}/${pages}`;
      page.drawText(pn, { x: w - 60, y: 30, size: 9, font });
      TT(p, pn, w - 60, 30, 9, font);
    }
    for (const [x0, y0, x1, y1] of blocks) {
      page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color: rgb(0.1, 0.1, 0.1) });
      T(p, x0, y0, x1, y1);
    }
    for (const [x0, y0, x1, y1] of strokeBlocks) {
      page.drawRectangle({
        x: x0, y: y0, width: x1 - x0, height: y1 - y0,
        borderColor: rgb(1, 1, 1), borderWidth: 1,
      });
      T(p, x0, y0, x1, y1);
    }
  }
  return { bytes: await doc.save({ updateMetadata: false }), truth };
}

// ── Verifier (shared by fixtures and negative controls) ─────────────────────
async function decodeQrFromPdf(bytes, metrics, pageIndex) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const raw = await readPageContent(doc, pageIndex);
  if (!raw) return null;
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
  return out;
}

/** Returns a list of violation codes. Empty = artifact is acceptable. */
async function verify(originalBytes, built, expectUrl = QR_URL, truth = null) {
  const v = [];
  const { placement, metrics } = built;

  // A QR must never cost a page.
  if (built.pageCountAfter !== built.pageCountBefore) v.push("APPENDED_PAGE");
  if (placement.mode === "none") return v;              // safe-fail is acceptable

  const before = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const after = await PDFDocument.load(built.bytes, { updateMetadata: false });
  const pi = placement.pageIndex;

  // Page dimensions unchanged.
  const a = before.getPage(pi).getSize(), b = after.getPage(pi).getSize();
  if (Math.abs(a.width - b.width) > 0.01 || Math.abs(a.height - b.height) > 0.01) v.push("PAGE_RESIZED");

  // Printed size inside the owner's band.
  const inches = M.qrInches(metrics);
  if (inches < 0.75 || inches > 0.9) v.push("QR_SIZE_OUT_OF_RANGE");

  // The whole plate — code AND its 4-module quiet zone — must sit inside the
  // page box. A code that runs off the trimmed edge cannot be scanned, and the
  // upper-right ladder is the path most likely to push against the top edge.
  if (placement.x < 0 || placement.y < 0 ||
      placement.x + metrics.width > b.width + 0.01 ||
      placement.y + metrics.height > b.height + 0.01) {
    v.push("QR_OUTSIDE_PAGE_BOX");
  }

  // Decodes, and to the right destination.
  const decoded = await decodeQrFromPdf(built.bytes, metrics, pi);
  if (!decoded) v.push("QR_UNDECODABLE");
  else if (decoded !== expectUrl) v.push("QR_WRONG_DESTINATION");

  // Nothing new is drawn as TEXT (no caption / ID / URL).
  const rawBefore = (await readPageContent(before, pi)) ?? "";
  const rawAfter = (await readPageContent(after, pi)) ?? "";
  const seen = new Set(drawnStrings(rawBefore));
  const added = drawnStrings(rawAfter).filter((s) => !seen.has(s));
  if (added.length) v.push("VISIBLE_TEXT_ADDED");
  const rendered = drawnStrings(rawAfter).join("  ");
  const priorRendered = drawnStrings(rawBefore).join("  ");
  for (const [code, needle] of [
    ["VISIBLE_URL", "pawtenant.com"], ["VISIBLE_URL", "/verify"],
    ["VISIBLE_VERIFICATION_ID", LETTER_ID], ["VISIBLE_CAPTION", "Scan to verify"],
  ]) {
    if (rendered.includes(needle) && !priorRendered.includes(needle)) v.push(code);
  }

  // The QR must not intersect anything that was already on the page. Judged
  // against GROUND TRUTH (exact font metrics / image boxes from the builder)
  // when available, falling back to the analyzer only for artifacts we did not
  // construct ourselves.
  const q = {
    x0: placement.x, y0: placement.y,
    x1: placement.x + metrics.width, y1: placement.y + metrics.height,
  };
  const hits = (truth ?? [])
    .filter((r) => r.pageIndex === pi)
    .filter((r) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
  if (truth && hits.length) v.push("QR_OVERLAPS_CONTENT");
  if (!truth) {
    const bounds = M.analyzePageContent(rawBefore, a.width, a.height, M.readXObjectBoxes(before, pi));
    if (bounds.understood && bounds.rects &&
        bounds.rects.find((r) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) {
      v.push("QR_OVERLAPS_CONTENT");
    }
  }
  return [...new Set(v)];
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const FIXTURES = [
  ["F1  letterhead XObject, empty footer", { letterhead: true, clipFirst: true }, "inline", 1],
  ["F2  signature XObject with adjacent whitespace", { signature: true, bodyLines: 10 }, "inline", 1],
  ["F3  footer occupied across the bottom", { footerText: true, bodyLines: 30 }, "any", 1],
  ["F4  multi-page letter", { pages: 3, letterhead: true }, "inline", 3],
  ["F5  non-standard page size (A4)", { pageSize: [595.28, 841.89], letterhead: true }, "inline", 1],
  ["F6  landscape page", { pageSize: [792, 612] }, "inline", 1],
  ["F7  dense page, no whitespace anywhere", { bodyLines: 40, footerText: true }, "any", 1],
  ["F8  blank page (no /Contents)", { bodyLines: 0 }, "inline", 1],
];

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  PASS  ${n}`); };
const bad = (n, m) => { failed++; console.log(`  FAIL  ${n}\n          ${m}`); };

if (!SELF) {
  console.log("[check-qr-placement-fixtures] placement fixtures\n");
  for (const [name, opts, expectMode, expectPages] of FIXTURES) {
    const { bytes: orig, truth } = await buildLetter(opts);
    const built = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
    const v = await verify(orig, built, QR_URL, truth);
    const modeOk = expectMode === "any" || built.placement.mode === expectMode;
    const pagesOk = built.pageCountAfter === expectPages && built.pageCountBefore === expectPages;
    if (v.length === 0 && modeOk && pagesOk) {
      ok(`${name} -> ${built.placement.mode}${built.placement.mode === "inline" ? ` p${built.placement.pageIndex + 1}` : ""}, ${built.pageCountAfter}pp`);
    } else {
      bad(name, `violations=${JSON.stringify(v)} mode=${built.placement.mode} pages=${built.pageCountBefore}->${built.pageCountAfter}`);
    }
  }

  // Idempotency: same input twice is byte-identical, and re-processing an
  // already-stamped file never stacks a second code or grows the document.
  const { bytes: orig } = await buildLetter({ letterhead: true });
  const a1 = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  const a2 = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  const same = Buffer.from(a1.bytes).equals(Buffer.from(a2.bytes));
  same ? ok("F9  re-running on the same original is byte-identical")
       : bad("F9  re-running on the same original is byte-identical", "bytes differ");

  // ── Region fixtures ───────────────────────────────────────────────────────
  //
  // The approved order is LOWER-RIGHT (climbing) then UPPER-RIGHT (descending),
  // then refuse. These drive both ladders deterministically by painting an
  // explicit blocker across the right-hand column.
  //
  // "Climbs only as far as necessary" is judged by recomputing the FIRST free
  // candidate from GROUND TRUTH — the exact rectangles the builder painted —
  // and requiring the module to have chosen precisely that one. Comparing
  // against the analyzer's own opinion would be circular and would pass even
  // when both are wrong together.
  //
  // TWO independent judgements, because they answer different questions:
  //
  //   • SAFETY is judged against GROUND TRUTH (exact font metrics and image
  //     boxes from the builder). verify() raises QR_OVERLAPS_CONTENT if the
  //     chosen spot touches anything really drawn. Non-circular by construction.
  //   • "ONLY AS FAR AS NECESSARY" is judged against the analyzer's own bounds,
  //     because that is the model the placement logic is entitled to use — and
  //     it is deliberately MORE pessimistic than ground truth about text extent.
  //     Requiring it to match ground truth exactly would be demanding that the
  //     conservative model stop being conservative.
  //
  // Together: the module may not skip a rung its own model calls free, and may
  // not land on one that ground truth calls occupied.
  const firstFree = (pageW, pageH, metrics, rects) => {
    for (const c of M.candidates(pageW, pageH, metrics)) {
      const g = {
        x0: c.x - M.CLEARANCE_PT, y0: c.y - M.CLEARANCE_PT,
        x1: c.x + metrics.width + M.CLEARANCE_PT, y1: c.y + metrics.height + M.CLEARANCE_PT,
      };
      if (!rects.some((r) => r.x0 < g.x1 && r.x1 > g.x0 && r.y0 < g.y1 && r.y1 > g.y0)) return c;
    }
    return null;
  };
  const analyzerRects = async (bytes) => {
    const d = await PDFDocument.load(bytes, { updateMetadata: false });
    const raw = await readPageContent(d, 0);
    const sz = d.getPage(0).getSize();
    const b = M.analyzePageContent(raw ?? "", sz.width, sz.height, M.readXObjectBoxes(d, 0));
    return b.understood && b.rects ? b.rects : null;
  };

  // x-span of the right-hand column, widened past the clearance guard so a
  // blocker reliably occupies it.
  const COL = [497, 595];
  const REGION = [
    ["R1  lower-right clear -> lower-right, lowest rung", {}, "lower-right"],
    ["R2  lowest lower-right rung blocked -> climbs only as far as needed",
      { blocks: [[COL[0], 12, COL[1], 40]] }, "lower-right"],
    ["R3  every lower-right rung blocked, upper-right clear -> upper-right",
      { blocks: [[COL[0], 0, COL[1], 290]] }, "upper-right"],
    // bodyLines:0 — the analyzer models a text line pessimistically wide, so a
    // full body block would (correctly) close the whole upper ladder and this
    // fixture would only re-prove the safe-fail that R5 already covers.
    ["R4  upper-right top rung blocked too -> descends only as far as needed",
      { bodyLines: 0, blocks: [[COL[0], 0, COL[1], 290], [COL[0], 690, COL[1], 700]] }, "upper-right"],
    ["R5  lower AND upper right both occupied -> safe-fail",
      { blocks: [[COL[0], 0, COL[1], 290], [COL[0], 500, COL[1], 792]] }, null],
    ["R6  full-page white background wash does not block placement",
      { whiteWash: true }, "lower-right"],
    ["R7  a WHITE STROKE still blocks (a stroke is visible in any colour)",
      { strokeBlocks: [[COL[0], 12, COL[1], 40]] }, "lower-right"],
  ];

  for (const [name, opts, expectRegion] of REGION) {
    const { bytes: rb, truth: rt } = await buildLetter(opts);
    const rBuilt = await M.buildQrVerificationPdf(rb, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
    const viol = await verify(rb, rBuilt, QR_URL, rt);
    const aRects = await analyzerRects(rb);
    const want = aRects ? firstFree(612, 792, rBuilt.metrics, aRects) : null;

    if (expectRegion === null) {
      (rBuilt.placement.mode === "none" && want === null && viol.length === 0)
        ? ok(`${name} -> ${rBuilt.placement.mode}`)
        : bad(name, `mode=${rBuilt.placement.mode} modelSaysFree=${want && want.label} violations=${JSON.stringify(viol)}`);
      continue;
    }

    const regionOk = rBuilt.placement.region === expectRegion;
    const exact = want && rBuilt.placement.mode === "inline" &&
      Math.abs(rBuilt.placement.x - want.x) < 0.01 && Math.abs(rBuilt.placement.y - want.y) < 0.01;
    (regionOk && exact && viol.length === 0)
      ? ok(`${name} -> ${want.label} (y=${want.y.toFixed(1)})`)
      : bad(name, `region=${rBuilt.placement.region} chose=(${rBuilt.placement.x?.toFixed(1)},${rBuilt.placement.y?.toFixed(1)}) firstFree=${want ? `${want.label} (${want.x.toFixed(1)},${want.y.toFixed(1)})` : "none"} violations=${JSON.stringify(viol)}`);
  }

  // R2/R7 must actually have MOVED off the lowest rung, or they prove nothing.
  {
    const { bytes: clearB } = await buildLetter({});
    const clearBuilt = await M.buildQrVerificationPdf(clearB, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
    const { bytes: blockedB } = await buildLetter({ blocks: [[COL[0], 12, COL[1], 40]] });
    const blockedBuilt = await M.buildQrVerificationPdf(blockedB, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
    const moved = blockedBuilt.placement.y > clearBuilt.placement.y + 0.01;
    const step = (blockedBuilt.placement.y - clearBuilt.placement.y) % 6;
    (moved && Math.abs(step) < 0.01)
      ? ok(`R8  the climb is a whole number of 6pt rungs (+${(blockedBuilt.placement.y - clearBuilt.placement.y).toFixed(0)}pt)`)
      : bad("R8  the climb is a whole number of 6pt rungs", `clear=${clearBuilt.placement.y} blocked=${blockedBuilt.placement.y}`);
  }

  const re = await M.buildQrVerificationPdf(a1.bytes, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  const stacked = re.placement.mode === "inline" &&
    Math.abs(re.placement.x - a1.placement.x) < 1 && Math.abs(re.placement.y - a1.placement.y) < 1;
  (!stacked && re.pageCountAfter === a1.pageCountAfter)
    ? ok(`F10 reprocessing an already-stamped file does not stack (-> ${re.placement.mode}, ${re.pageCountAfter}pp)`)
    : bad("F10 reprocessing an already-stamped file does not stack", `mode=${re.placement.mode} samePos=${stacked} pages=${re.pageCountAfter}`);


// ── Fail-closed fixtures ────────────────────────────────────────────────────
// A PDF we cannot verify must never be rewritten. Each fixture below must be
// REFUSED with a specific code, must return the ORIGINAL bytes untouched, and
// must never report `verified`.
//
// The motivating case was real: a 407-byte TEST file with no xref, no
// startxref, and 200 bytes of `xxxx` after %%EOF. pdf-lib reconstructed it into
// a clean 1-page 612x792 document and the injector stamped a QR on it; pdf.js
// refused the same file outright.
console.log("\n[fail-closed] unverifiable documents must be refused\n");

/** A minimal PDF whose trailer can be damaged in specific ways. */
function rawPdf({ eof = true, startxref = true, garbage = 0, badOffset = false } = {}) {
  const body =
    "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>>>endobj\n";
  const xrefAt = body.length;
  let out = body + "xref\n0 4\n" + "0000000000 65535 f \n".repeat(4) +
    "trailer<</Size 4/Root 1 0 R>>\n";
  if (startxref) out += "startxref\n" + (badOffset ? 999999 : xrefAt) + "\n";
  if (eof) out += "%%EOF\n";
  if (garbage) out += "x".repeat(garbage);
  return Buffer.from(out, "latin1");
}

const FAIL_CLOSED = [
  ["S1  garbage appended after %%EOF (the real TEST fixture shape)",
    rawPdf({ garbage: 200 }), "trailing_garbage"],
  ["S2  no cross-reference table at all (pdf-lib reconstructs, we refuse)",
    rawPdf({ startxref: false }), "no_xref_table"],
  ["S3  startxref points outside the file",
    rawPdf({ badOffset: true }), "bad_startxref"],
  ["S4  truncated - no %%EOF trailer",
    rawPdf({ eof: false, startxref: false }), "no_eof_marker"],
  ["S5  not a PDF at all (JPEG bytes)",
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(0x41)]), "no_pdf_header"],
];

for (const [name, bytes, expectCode] of FAIL_CLOSED) {
  let built;
  try {
    built = await M.buildQrVerificationPdf(bytes, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  } catch (e) {
    bad(name, `threw instead of refusing cleanly: ${e.message}`); continue;
  }
  const untouched = Buffer.from(built.bytes).equals(Buffer.from(bytes));
  const okCode = built.failure === expectCode;
  const notVerified = built.verified !== true && built.placement.mode !== "inline";
  if (okCode && untouched && notVerified) ok(`${name} -> ${built.failure}`);
  else bad(name, `code=${built.failure} (want ${expectCode}) untouched=${untouched} verified=${built.verified}`);
}

// Page geometry we cannot reason about.
{
  const d = await PDFDocument.create();
  d.addPage([10, 10]);                       // 0.14in square - not a letter
  const tiny = await d.save({ updateMetadata: false });
  const built = await M.buildQrVerificationPdf(tiny, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  built.failure === "page_geometry_unknown" && built.verified !== true
    ? ok(`S6  implausible page geometry -> ${built.failure}`)
    : bad("S6  implausible page geometry", `code=${built.failure} verified=${built.verified}`);
}

// Output-side gates, driven through the exported verifier so a corrupted or
// mismatched save cannot be reported as a success.
{
  const { bytes: base } = await buildLetter({ letterhead: true });
  const good = await M.buildQrVerificationPdf(base, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  const doc = await PDFDocument.load(good.bytes, { updateMetadata: false });
  const raw = await readPageContent(doc, good.placement.pageIndex);

  const clean = M.verifyDrawnQr(raw, { letterId: LETTER_ID, verifyUrl: QR_URL }, good.metrics, good.placement);
  clean.ok ? ok("S7  a correctly drawn QR verifies out of the saved output")
           : bad("S7  a correctly drawn QR verifies out of the saved output", clean.detail);

  // Post-injection decode mismatch: same drawing, different encoded URL.
  const wrong = M.verifyDrawnQr(raw, { letterId: LETTER_ID, verifyUrl: QR_URL + "X" }, good.metrics, good.placement);
  !wrong.ok && wrong.code === "output_qr_verification_failed"
    ? ok(`S8  drawn modules that disagree with the encoded matrix -> ${wrong.code}`)
    : bad("S8  drawn modules that disagree with the encoded matrix", `ok=${wrong.ok} code=${wrong.code}`);

  // Corrupted output: modules stripped from the stream.
  const stripped = raw.replace(/1 0 0 1 [-\d.]+ [-\d.]+ cm[\s\S]{0,120}?0 0 m\s*\n\s*0 [\d.]+ l[\s\S]{0,80}?h\s*\n\s*f/g, "");
  const corrupt = M.verifyDrawnQr(stripped, { letterId: LETTER_ID, verifyUrl: QR_URL }, good.metrics, good.placement);
  !corrupt.ok ? ok(`S9  corrupted output with no modules -> ${corrupt.code}`)
              : bad("S9  corrupted output with no modules", "verification passed on a stripped stream");
}

// ── Injector side-effect ordering ───────────────────────────────────────────
// The strongest evidence available without invoking the deployed function: in
// inject-pdf-footer the refusal must RETURN before anything is uploaded, signed,
// or written to order_documents. If the refusal sits after those calls, a
// refused document would still publish a processed file.
{
  const v1 = readFileSync(join(ROOT, "supabase/functions/inject-pdf-footer/index.ts"), "utf8");
  const refuseAt = v1.indexOf("skipped: true");
  const sideEffects = [
    ["storage upload", v1.indexOf(".upload(")],
    ["signed URL", v1.indexOf("createSignedUrl(")],
    ["order_documents update", v1.indexOf("processed_file_url:")],
    ["success audit", v1.indexOf("success: true")],
  ];
  const late = sideEffects.filter(([, at]) => at !== -1 && at < refuseAt);
  refuseAt !== -1 && late.length === 0
    ? ok("S10 the refusal returns BEFORE any upload / signed URL / row update / success audit")
    : bad("S10 the refusal returns BEFORE any side effect", `refuseAt=${refuseAt} late=${JSON.stringify(late)}`);

  // A refusal must never be reported as a successful injection.
  const refusalBlock = v1.slice(refuseAt - 400, refuseAt + 400);
  /ok:\s*false/.test(refusalBlock) && !/injected:\s*true/.test(refusalBlock)
    ? ok("S11 the refusal response is ok:false and never claims injected:true")
    : bad("S11 the refusal response is ok:false", "refusal block looks like a success");

  // No notification surface may be touched anywhere in this function.
  const forbidden = ["doctor_notifications", "communications", "send-email", "sendEmail", "twilio", "resend"];
  const hits = forbidden.filter((f) => v1.includes(f));
  hits.length === 0
    ? ok("S12 the injector touches no notification / email / SMS surface at all")
    : bad("S12 the injector touches no notification surface", `found ${JSON.stringify(hits)}`);
}

  console.log(`\n${passed}/${passed + failed} checks passed.`);
  process.exit(failed ? 0 + (failed ? 1 : 0) : 0);
}

// ── Negative controls ───────────────────────────────────────────────────────
// Each hands the verifier a deliberately broken artifact and requires the
// matching violation code. If a control does not trip, the guard is blind.
console.log("[check-qr-placement-fixtures] self-test — each control must TRIP\n");

const { bytes: orig, truth: origTruth } = await buildLetter({ letterhead: true, signature: true });
const good = await M.buildQrVerificationPdf(orig, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);

async function mutate(fn) {
  const doc = await PDFDocument.load(good.bytes, { updateMetadata: false });
  await fn(doc);
  return { ...good, bytes: await doc.save({ updateMetadata: false }), pageCountAfter: doc.getPageCount() };
}

const CONTROLS = [];

// 1. QR drawn on top of the signature image.
CONTROLS.push(["QR_OVERLAPS_CONTENT", "QR placed over the signature", async () => {
  const { bytes: o2, truth: t2 } = await buildLetter({ signature: true });
  const doc = await PDFDocument.load(o2, { updateMetadata: false });
  M.drawVerificationBlock(doc.getPage(0), { letterId: LETTER_ID, verifyUrl: QR_URL }, 60, 152);
  return [o2, { ...good, bytes: await doc.save({ updateMetadata: false }),
    placement: { mode: "inline", pageIndex: 0, x: 60, y: 152, reason: "forced" },
    pageCountBefore: 1, pageCountAfter: 1 }, t2];
}]);

// 2. QR drawn on top of body text.
CONTROLS.push(["QR_OVERLAPS_CONTENT", "QR placed over body text", async () => {
  const { bytes: o2, truth: t2 } = await buildLetter({ bodyLines: 12 });
  const doc = await PDFDocument.load(o2, { updateMetadata: false });
  M.drawVerificationBlock(doc.getPage(0), { letterId: LETTER_ID, verifyUrl: QR_URL }, 60, 620);
  return [o2, { ...good, bytes: await doc.save({ updateMetadata: false }),
    placement: { mode: "inline", pageIndex: 0, x: 60, y: 620, reason: "forced" },
    pageCountBefore: 1, pageCountAfter: 1 }, t2];
}]);

// 3. A visible verification URL is printed next to the code.
CONTROLS.push(["VISIBLE_URL", "verification URL printed on the page", async () => {
  const m = await mutate(async (doc) => {
    const f = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText("pawtenant.com/verify/" + LETTER_ID, { x: 400, y: 100, size: 7, font: f, color: rgb(0.3, 0.3, 0.3) });
  });
  return [orig, m];
}]);

// 4. The Verification ID is printed.
CONTROLS.push(["VISIBLE_VERIFICATION_ID", "Verification ID printed on the page", async () => {
  const m = await mutate(async (doc) => {
    const f = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText(LETTER_ID, { x: 430, y: 96, size: 7, font: f });
  });
  return [orig, m];
}]);

// 5. A "Scan to verify" caption returns.
CONTROLS.push(["VISIBLE_CAPTION", "'Scan to verify' caption printed", async () => {
  const m = await mutate(async (doc) => {
    const f = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText("Scan to verify", { x: 430, y: 100, size: 6, font: f });
  });
  return [orig, m];
}]);

// 6. A page is appended just to carry the QR.
CONTROLS.push(["APPENDED_PAGE", "an extra page is appended for the QR", async () => {
  const m = await mutate(async (doc) => {
    const p = doc.addPage([612, 792]);
    M.drawVerificationBlock(p, { letterId: LETTER_ID, verifyUrl: QR_URL }, 500, 18);
  });
  return [orig, m];
}]);

// 7. The QR is drawn at the wrong printed size.
CONTROLS.push(["QR_SIZE_OUT_OF_RANGE", "QR drawn outside the 0.75-0.9in band", async () => {
  const bigMetrics = { ...good.metrics, qrSize: 120 };
  return [orig, { ...good, metrics: bigMetrics }];
}]);

// 8. The QR module GEOMETRY is corrupted, so the code cannot decode.
//    NOTE the corruption is geometric, not visual. decodeQrFromPdf() rebuilds
//    the matrix from the module rectangles in the CONTENT STREAM, so painting a
//    white box over the code would not trip it - the modules are still there in
//    the stream. Visual obliteration is covered instead by the real-PDF census,
//    which rasterises the finished page with pdf.js and decodes actual pixels.
CONTROLS.push(["QR_UNDECODABLE", "QR module geometry corrupted (undecodable)", async () => {
  const m = await mutate(async (doc) => {
    const page = doc.getPage(0);
    const pitch = good.metrics.modulePt;
    const ox = good.placement.x + good.metrics.quietZonePt;
    const oy = good.placement.y + good.metrics.quietZonePt;
    // A solid slab of extra modules straight through the data region.
    for (let r = 4; r < good.metrics.moduleCount - 4; r++) {
      for (let c = 4; c < good.metrics.moduleCount - 4; c++) {
        page.drawRectangle({
          x: ox + c * pitch, y: oy + r * pitch,
          width: pitch, height: pitch, color: rgb(0, 0, 0),
        });
      }
    }
  });
  return [orig, m];
}]);

// 9. ANALYZER / GROUND-TRUTH DISAGREEMENT. The analyzer is mutated so that
//    findSafePlacement accepts the first candidate no matter what occupies it.
//    Ground truth must still catch the overlap - otherwise the suite is only
//    ever asking the analyzer to grade its own work.
CONTROLS.push(["QR_OVERLAPS_CONTENT", "analyzer forced to call an occupied corner clear", async () => {
  const blind = MOD_SRC.replace(
    "    const hit = bounds.rects.find((r) => intersects(r, guard));",
    "    const hit = undefined;",
  );
  if (blind === MOD_SRC) throw new Error("blind-analyzer anchor no longer matches");
  const BM = await loadModule(blind, "blind");
  const { bytes: o2, truth: t2 } = await buildLetter({ footerText: true, bodyLines: 34 });
  const b2 = await BM.buildQrVerificationPdf(o2, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  return [o2, b2, t2];
}]);

// 10. PAINTED-PATH BOUNDING BOX. commitPath() unions a subpath into ONE box.
//     Reverted to noting each path POINT — which is what the module used to do —
//     a filled rectangle drawn with m/l (pdf-lib's own output, and that of many
//     real producers) is recorded as four zero-area corner marks with nothing
//     between them, so the QR can be placed INSIDE a solid filled shape and the
//     occupancy test sees nothing. Ground truth must catch it.
CONTROLS.push(["QR_OVERLAPS_CONTENT", "painted path committed as corner POINTS, not a box", async () => {
  const pointwise = MOD_SRC.replace(
    "    note(x0, y0, x1, y1);\n  };",
    "    for (const r of path) note(r.x0, r.y0, r.x1, r.y1);\n  };",
  );
  if (pointwise === MOD_SRC) throw new Error("commitPath anchor no longer matches");
  const PM = await loadModule(pointwise, "pointwise");
  // A solid filled box straight across the lower-right column: the ONLY thing
  // standing between the QR and the interior of that box is the union.
  const { bytes: o2, truth: t2 } = await buildLetter({ blocks: [[497, 12, 595, 120]] });
  const b2 = await PM.buildQrVerificationPdf(o2, { letterId: LETTER_ID, verifyUrl: QR_URL }, readPageContent);
  return [o2, b2, t2];
}]);

let bad2 = 0;
for (const [expectCode, label, make] of CONTROLS) {
  let tripped = false, got = [];
  try {
    const [o, artifact, t] = await make();
    got = await verify(o, artifact, QR_URL, t ?? origTruth);
    tripped = got.includes(expectCode);
  } catch (e) { got = [`ERROR ${e.message}`]; }
  if (!tripped) bad2++;
  console.log(`  ${tripped ? "CAUGHT " : "MISSED "} ${expectCode.padEnd(24)} ${label}${tripped ? "" : `  (got ${JSON.stringify(got)})`}`);
}
console.log(`\n${CONTROLS.length - bad2}/${CONTROLS.length} negative controls caught.`);
process.exit(bad2 === 0 ? 0 : 1);
