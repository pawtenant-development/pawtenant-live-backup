// qrVerificationPdf — QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001
//
// Places a BARE QR CODE on a copy of the provider's letter WITHOUT ever
// covering provider content, and WITHOUT ever adding a page.
//
// QR-ONLY PRESENTATION. Nothing here draws text: no "Scan to verify", no
// Verification ID, no URL, no token, no border, no branding. A recipient must
// not be able to read the vendor or the verification route off a clinical
// letter. The destination exists ONLY inside the QR module geometry. The guard
// in scripts/check-letter-qr-presentation.mjs asserts this module emits no
// drawText call at all.
//
// ── WHY THE PLACEMENT MODEL WAS REBUILT ─────────────────────────────────────
// The previous version had two rules that together made it useless on real
// provider letters:
//
//   1. ANY XObject on the page (`Do`) aborted the analysis outright, and
//   2. every located item was merged into ONE union bounding box, so "is the
//      footer free?" was really asking "is the whole page empty below the
//      topmost thing I saw?".
//
// Both failed CLOSED onto "append a dedicated page". Since practically every
// real letter carries a letterhead logo, that meant a near-blank extra page on
// almost every document — a small QR silently adding a sheet to a clinical
// letter.
//
// A logo in the letterhead says nothing about whether the bottom-right corner
// is free. So now:
//
//   • XObjects are RESOLVED and measured, not treated as a fatal unknown. An
//     image is placed by mapping the unit square through the CTM; a form is
//     placed by mapping its BBox through its Matrix and then the CTM. Only an
//     XObject we genuinely cannot resolve, or a transform we cannot model
//     (rotation/skew), still marks the page unknown.
//   • Occupancy is kept as a LIST of rectangles, never a union, and placement
//     asks the narrow question that actually matters: does anything intersect
//     THIS candidate rectangle, plus a clearance margin?
//   • Nothing is ever appended. If no page offers a provably free candidate,
//     the build reports mode "none" and the caller fails safe. Overlaying the
//     code on content, or reflowing the letter, is never an option.
//
// Text is bounded horizontally from a GENEROUS glyph-count width estimate, not
// assumed to span the page. Assuming full width rejected corners that were
// demonstrably empty: on real intake letters the top-right corner is clear by
// 54pt, yet a header line on the LEFT at the same height blocked it. The
// estimate errs high (0.75 em/glyph plus a pad) so it can only ever cost a
// placement, never let the code touch text.
//
// QR ENCODER. `qrcode-generator` by Kazuhiko Arase, MIT licensed, loaded from
// esm.sh the same way this repo already loads pdf-lib and supabase-js. It is
// deterministic (no randomness in mask selection), which is what makes the
// decode regression tests meaningful.
//   https://github.com/kazuhikoarase/qrcode-generator  (MIT)
//
// WHY THE MODULES ARE DRAWN AS RECTANGLES. Drawing each dark module as a filled
// pdf-lib rectangle keeps the QR as pure vector geometry: sharp at any print
// DPI, no image to recompress, and identical in grayscale.

import {
  PDFDocument, PDFPage, PDFName, PDFArray, PDFDict, rgb, StandardFonts, PDFFont,
} from "https://esm.sh/pdf-lib@1.17.1";
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";

// ── Layout constants ─────────────────────────────────────────────────────────
// The owner's printed target is 0.75–0.9 inch square. At 72pt/inch that is
// 54–64.8pt, so the DRAWN SIZE is fixed and the module pitch derived from it.
export const QR_TARGET_PT = 61;        // 0.847in — centre of the 0.75–0.9in band
export const QR_MIN_PT = 54;           // 0.75in
export const QR_MAX_PT = 64.8;         // 0.90in
// Floor on the module pitch, not the QR size. 1.8pt = 0.635mm per module, above
// the ~0.5mm a phone camera needs.
export const QR_MODULE_MIN_PT = 1.8;
export const QUIET_ZONE_MODULES = 4;   // spec minimum — never trimmed
const PAD = 0;

/** Distance kept between the QR block and anything else on the page. */
export const CLEARANCE_PT = 10;
/** Distance kept from the trimmed page edge. */
export const MARGIN_PT = 18;

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface VerificationBlockSpec {
  letterId: string;
  verifyUrl: string;
}

export interface BlockMetrics {
  width: number;
  height: number;
  qrSize: number;
  moduleCount: number;
  modulePt: number;
  quietZonePt: number;
}

/** Deterministic QR matrix for `text`. Error correction M survives ~15% loss,
 *  which matters on a letter that may be creased, folded or smudged. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  return m;
}

/** Measured size of the QR block. The fonts are unused (nothing is drawn as
 *  text) but stay in the signature so call sites do not churn. */
export function measureBlock(spec: VerificationBlockSpec, _font?: PDFFont, _fontBold?: PDFFont): BlockMetrics {
  const matrix = qrMatrix(spec.verifyUrl);
  const n = matrix.length;
  const modulePt = Math.max(QR_TARGET_PT / n, QR_MODULE_MIN_PT);
  const qrSize = modulePt * n;
  const quietZonePt = QUIET_ZONE_MODULES * modulePt;
  const side = qrSize + quietZonePt * 2 + PAD * 2;
  return { width: side, height: side, qrSize, moduleCount: n, modulePt, quietZonePt };
}

/** Printed size of the drawn QR in inches. Excludes the quiet zone. */
export function qrInches(m: BlockMetrics): number {
  return m.qrSize / 72;
}

/**
 * Draw the QR with the block's bottom-left corner at (x, y). QR ONLY.
 * White plate carries the quiet zone; borderless, because a boxed code reads
 * as a vendor stamp. Modules are pure black so it survives grayscale printing.
 */
export function drawVerificationBlock(
  page: PDFPage,
  spec: VerificationBlockSpec,
  x: number,
  y: number,
  font?: PDFFont,
  fontBold?: PDFFont,
): BlockMetrics {
  const m = measureBlock(spec, font, fontBold);
  const matrix = qrMatrix(spec.verifyUrl);

  page.drawRectangle({ x, y, width: m.width, height: m.height, color: rgb(1, 1, 1) });

  const qrX = x + PAD + m.quietZonePt;
  const qrY = y + PAD + m.quietZonePt;
  for (let r = 0; r < m.moduleCount; r++) {
    for (let c = 0; c < m.moduleCount; c++) {
      if (!matrix[r][c]) continue;
      page.drawRectangle({
        x: qrX + c * m.modulePt,
        // PDF y grows upward; matrix row 0 is the TOP row.
        y: qrY + (m.moduleCount - 1 - r) * m.modulePt,
        width: m.modulePt,
        height: m.modulePt,
        color: rgb(0, 0, 0),
      });
    }
  }
  return m;
}

// ── XObject resolution ───────────────────────────────────────────────────────
//
// Returns, per XObject name on the page, the box its content occupies in its
// OWN space before the CTM is applied:
//   • Image  -> the unit square [0,0,1,1]; an image is always painted into the
//               unit square and scaled entirely by the CTM.
//   • Form   -> its BBox mapped through its own Matrix. A form's marks are
//               CLIPPED to that BBox, so this is an upper bound on what it can
//               paint, which is the safe direction.
// Returns null if resources cannot be read at all — the caller then treats the
// page as not understood rather than assuming there is nothing there.

function num(v: unknown): number | null {
  // deno-lint-ignore no-explicit-any
  const n = (v as any)?.asNumber?.() ?? (v as any)?.value ?? (typeof v === "number" ? v : null);
  return typeof n === "number" && isFinite(n) ? n : null;
}

export function readXObjectBoxes(doc: PDFDocument, pageIndex: number): Record<string, Rect> | null {
  try {
    const page = doc.getPage(pageIndex);
    // deno-lint-ignore no-explicit-any
    const res = (page as any).node.Resources?.();
    if (!res) return {};                       // no resources at all = no XObjects
    const xoRef = res.get(PDFName.of("XObject"));
    if (!xoRef) return {};
    // deno-lint-ignore no-explicit-any
    const xo = (xoRef instanceof PDFDict ? xoRef : (doc as any).context.lookup(xoRef)) as PDFDict;
    if (!xo?.keys) return {};

    const out: Record<string, Rect> = {};
    for (const key of xo.keys()) {
      const name = key.asString().replace(/^\//, "");
      // deno-lint-ignore no-explicit-any
      const stream: any = (doc as any).context.lookup(xo.get(key));
      const dict = stream?.dict ?? stream;
      if (!dict?.get) return null;             // unresolvable -> unknown page

      const subtype = dict.get(PDFName.of("Subtype"))?.asString?.() ?? "";
      if (subtype.includes("Image")) {
        out[name] = { x0: 0, y0: 0, x1: 1, y1: 1 };
        continue;
      }
      // Form XObject: BBox (required) optionally pre-transformed by Matrix.
      // deno-lint-ignore no-explicit-any
      const bboxRaw: any = dict.get(PDFName.of("BBox"));
      // deno-lint-ignore no-explicit-any
      const bbox = (bboxRaw instanceof PDFArray ? bboxRaw : (doc as any).context.lookup(bboxRaw)) as PDFArray;
      const b = bbox?.asArray?.().map(num) ?? [];
      if (b.length < 4 || b.some((v: number | null) => v === null)) return null;
      let [x0, y0, x1, y1] = b as number[];
      if (x1 < x0) [x0, x1] = [x1, x0];
      if (y1 < y0) [y0, y1] = [y1, y0];

      // deno-lint-ignore no-explicit-any
      const mRaw: any = dict.get(PDFName.of("Matrix"));
      // deno-lint-ignore no-explicit-any
      const mArr = (mRaw instanceof PDFArray ? mRaw : (mRaw ? (doc as any).context.lookup(mRaw) : null)) as PDFArray | null;
      const mv = mArr?.asArray?.().map(num) ?? null;
      if (mv && mv.length >= 6 && !mv.some((v) => v === null)) {
        const [a, bb, c, d, e, f] = mv as number[];
        if (bb !== 0 || c !== 0) return null;  // rotation/skew inside the form
        const cx = [x0 * a + e, x1 * a + e];
        const cy = [y0 * d + f, y1 * d + f];
        x0 = Math.min(...cx); x1 = Math.max(...cx);
        y0 = Math.min(...cy); y1 = Math.max(...cy);
      }
      out[name] = { x0, y0, x1, y1 };
    }
    return out;
  } catch {
    return null;
  }
}

// ── Content-bounds detection ─────────────────────────────────────────────────

export interface ContentBounds {
  understood: boolean;
  reason?: string;
  /** Every drawn thing we could locate, as its own rectangle. Never merged. */
  rects?: Rect[];
  /** Union of `rects`, kept for reporting only — never used for placement. */
  occupied?: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * Content-stream tokenizer.
 *
 * WHY THIS IS NOT LINE-BASED. The first version split the stream on newlines
 * and matched operators with anchored regexes. Measured against real TEST
 * provider letters that was simply wrong: a perfectly ordinary page can be a
 * SINGLE line — `BT /F1 16 Tf 72 720 Td (…) Tj ET` — so the parser entered no
 * text block, located nothing, and declared the page unreadable. Producers put
 * any number of operators on a line, or none. A PDF content stream is a token
 * stream, not a line-oriented format, so it has to be tokenized as one.
 *
 * Strings are consumed properly (balanced parens, escapes, hex) so that a `)`
 * or a `Q` inside letter text can never be mistaken for an operator.
 */
type Tok =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "str"; len: number }
  | { t: "other" };

export function* tokenize(s: string): Generator<Tok> {
  const isWS = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const isDelim = (c: string) => "()<>[]{}/%".includes(c);
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (isWS(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {                       // literal string
      let depth = 1; i++; let len = 0;
      while (i < n && depth > 0) {
        if (s[i] === "\\") { i += 2; len++; continue; }
        if (s[i] === "(") { depth++; len++; }
        else if (s[i] === ")") { depth--; if (depth > 0) len++; }
        else len++;
        i++;
      }
      yield { t: "str", len }; continue;
    }
    if (c === "<" && s[i + 1] === "<") { i += 2; yield { t: "other" }; continue; }
    if (c === ">" && s[i + 1] === ">") { i += 2; yield { t: "other" }; continue; }
    if (c === "<") {                       // hex string: 2 digits per glyph
      const j0 = ++i;
      while (i < n && s[i] !== ">") i++;
      const hexLen = s.slice(j0, i).replace(/\s/g, "").length;
      i++;
      yield { t: "str", len: Math.ceil(hexLen / 2) }; continue;
    }
    if (c === "[" || c === "]" || c === "{" || c === "}") { i++; yield { t: "other" }; continue; }
    if (c === "/") {
      i++; let j = i;
      while (j < n && !isWS(s[j]) && !isDelim(s[j])) j++;
      const v = s.slice(i, j); i = j;
      yield { t: "name", v }; continue;
    }
    if (/[-+.\d]/.test(c)) {
      let j = i;
      while (j < n && /[-+.\dEe]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      i = j;
      yield isFinite(v) ? { t: "num", v } : { t: "other" };
      continue;
    }
    let j = i;
    while (j < n && !isWS(s[j]) && !isDelim(s[j])) j++;
    const op = s.slice(i, j);
    i = j || i + 1;
    yield { t: "op", v: op };
  }
}

export function analyzePageContent(
  raw: string,
  pageW: number,
  pageH: number,
  xobjBoxes?: Record<string, Rect> | null,
): ContentBounds {
  // A page whose /Contents key is absent draws nothing at all. That is PROOF of
  // a blank page, not a failure to read one, and the two must not be conflated:
  // real TEST letters were being rejected as "unreadable" when they were simply
  // empty. An empty stream yields no rects and every corner is free.
  if (raw.trim() === "") return { understood: true, rects: [], occupied: null };

  const rects: Rect[] = [];
  const note = (x0: number, y0: number, x1: number, y1: number) => {
    if (![x0, y0, x1, y1].every((v) => isFinite(v))) return;
    rects.push({
      x0: Math.min(x0, x1), y0: Math.min(y0, y1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1),
    });
  };

  let tx = 0, ty = 0, lead = 0, size = 12, tmA = 1, tmD = 1;
  let inText = false;
  let unsupportedCm = false;
  let unresolvedXObject = false;
  let unmeasurable = "";

  // CTM, restricted to scale + translate (a, d, e, f). `b`/`c` non-zero means
  // rotation or skew, which we do not compose — the page becomes unknown.
  let ca = 1, cd = 1, ce = 0, cf = 0;
  const gsStack: Array<[number, number, number, number]> = [];

  // Operand stack: PDF is postfix, so operands accumulate until an operator.
  let st: number[] = [];
  let lastName: string | null = null;
  // Glyphs shown by the pending operator. Tj/'/" take one string; TJ takes an
  // array of strings interleaved with kerning numbers (kerning only ever pulls
  // glyphs closer, so ignoring it overestimates the width — the safe way).
  let glyphs = 0;
  let fullWidthText = false;
  // Pending path. A path is only OCCUPIED once it is PAINTED. `re ... W n` is a
  // CLIPPING path and paints nothing — real letters open with a page-sized clip
  // rect, and recording that as content marked the entire page occupied, so no
  // corner could ever be found. Points accumulate here and are committed only
  // on a painting operator; `n` discards them.
  let path: Rect[] = [];
  /**
   * Commit the pending path as ONE bounding box.
   *
   * WHY A UNION AND NOT EACH POINT. `m`/`l`/`c` contribute DEGENERATE rects —
   * single points. Committing them individually records a filled box as four
   * zero-area corner marks with nothing in between, so an intersection test
   * against the interior finds nothing and the QR can be placed INSIDE a solid
   * filled shape. That is exactly how pdf-lib (and many real producers) emit a
   * rectangle: `1 0 0 1 x y cm / 0 0 m / 0 h l / w h l / w 0 l / h / f`, with no
   * `re` operator anywhere. Text and XObjects were unaffected — they already
   * note true boxes — which is why the earlier fixtures never caught this.
   *
   * The union is also the conservative reading for curves: `c`/`v`/`y` control
   * points bound the curve they describe, so the box can only be too large,
   * never too small.
   */
  const commitPath = () => {
    if (!path.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of path) {
      if (r.x0 < x0) x0 = r.x0;
      if (r.y0 < y0) y0 = r.y0;
      if (r.x1 > x1) x1 = r.x1;
      if (r.y1 > y1) y1 = r.y1;
    }
    note(x0, y0, x1, y1);
  };
  // Non-stroking (fill) colour. A WHITE fill paints nothing a reader can see -
  // and converted PDFs almost always open with a page-sized white background
  // wash. Recording that as occupancy marked the entire page full and no corner
  // could ever be found, which is exactly what blocked a real provider letter
  // whose lower-right corner pdf.js confirmed was empty. Tracked so fill-only
  // paints in white can be skipped; strokes always count, and any colour we
  // cannot interpret is assumed visible.
  let fillIsWhite = false;

  // Glyph-count-based width estimate. Font metrics are not available here, so
  // the estimate is deliberately GENEROUS: 0.75 em per glyph is well above the
  // ~0.5 em average of the proportional faces letters actually use and above
  // Courier's 0.6, and a further pad is added on top. Overestimating blocks a
  // little more of the page than necessary, which only ever costs a placement;
  // underestimating would let the QR touch text, which is the outcome that
  // matters. Anything that makes the estimate untrustworthy (horizontal
  // scaling via Tz) falls back to the full page width.
  const EM_PER_GLYPH = 0.75;
  const WIDTH_PAD_PT = 12;

  const showText = (glyphs: number) => {
    if (!inText) return;
    const baseY = cf + ty * cd;
    const h = Math.abs(size * cd * tmD);
    const x = ce + tx * ca;
    let x1: number;
    if (fullWidthText || glyphs <= 0) {
      x1 = pageW;
    } else {
      const w = glyphs * size * EM_PER_GLYPH * Math.abs(tmA) * Math.abs(ca) + WIDTH_PAD_PT;
      x1 = Math.min(pageW, x + w);
    }
    note(Math.max(0, Math.min(x, x1)), baseY - h * 0.28, x1, baseY + h);
  };

  for (const tok of tokenize(raw)) {
    if (tok.t === "num") { st.push(tok.v); continue; }
    if (tok.t === "name") { lastName = tok.v; continue; }
    if (tok.t === "str") { glyphs += tok.len; continue; }
    if (tok.t === "other") { continue; }

    const op = tok.v;
    switch (op) {
      case "q": gsStack.push([ca, cd, ce, cf]); break;
      case "Q": {
        const p = gsStack.pop();
        if (p) [ca, cd, ce, cf] = p; else { ca = cd = 1; ce = cf = 0; }
        break;
      }
      case "cm": {
        if (st.length >= 6) {
          const [a, b, c, d, e, f] = st.slice(-6);
          if (b === 0 && c === 0) {
            ce = ce + e * ca; cf = cf + f * cd; ca = ca * a; cd = cd * d;
          } else unsupportedCm = true;
        }
        break;
      }
      case "BT": inText = true; tx = 0; ty = 0; tmA = 1; tmD = 1; break;
      case "ET": inText = false; break;
      case "Tf": if (st.length) size = st[st.length - 1]; break;
      case "TL": if (st.length) lead = st[st.length - 1]; break;
      case "Tm":
        if (st.length >= 6) {
          const [a, , , d, e, f] = st.slice(-6);
          tmA = a; tmD = d; tx = e; ty = f;
        }
        break;
      case "TD": if (st.length >= 2) { tx += st[st.length - 2]; ty += st[st.length - 1]; lead = -st[st.length - 1]; } break;
      case "Td": if (st.length >= 2) { tx += st[st.length - 2]; ty += st[st.length - 1]; } break;
      case "T*": ty -= lead; break;
      case "Tj": case "TJ": showText(glyphs); break;
      case "'": ty -= lead; showText(glyphs); break;
      case '"': ty -= lead; showText(glyphs); break;
      // Horizontal scaling makes a glyph-count width estimate meaningless.
      case "Tz": if (st.length && st[st.length - 1] !== 100) fullWidthText = true; break;
      case "Do": {
        const box = lastName ? xobjBoxes?.[lastName] : undefined;
        if (!box) unresolvedXObject = true;
        else note(ce + box.x0 * ca, cf + box.y0 * cd, ce + box.x1 * ca, cf + box.y1 * cd);
        break;
      }
      // Shadings and inline images have no extent we can bound from the stream.
      case "sh": unmeasurable = "shading"; break;
      case "BI": unmeasurable = "inline image"; break;
      case "re":
        if (st.length >= 4) {
          const [x, y, w, h] = st.slice(-4);
          const x0 = ce + x * ca, y0 = cf + y * cd;
          const x1 = ce + (x + w) * ca, y1 = cf + (y + h) * cd;
          path.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
        }
        break;
      // Path-construction points. Each is recorded as a degenerate rect and is
      // only ever committed through commitPath(), which unions the whole
      // subpath into ONE bounding box — see the note there.
      case "m": case "l": case "c": case "v": case "y":
        for (let i = 0; i + 1 < st.length; i += 2) {
          const px = ce + st[i] * ca, py = cf + st[i + 1] * cd;
          path.push({ x0: px, y0: py, x1: px, y1: py });
        }
        break;
      // Painting operators commit the pending path.
      // Colour operators, tracked only well enough to recognise plain white.
      case "g": fillIsWhite = st.length >= 1 && st[st.length - 1] === 1; break;
      case "rg": fillIsWhite = st.length >= 3 && st.slice(-3).every((v) => v === 1); break;
      case "k": fillIsWhite = st.length >= 4 && st.slice(-4).every((v) => v === 0); break;
      // Colour-space paints (sc/scn/cs) are not interpreted: assume visible.
      case "cs": case "sc": case "scn": fillIsWhite = false; break;
      // Fill-only paints: a white fill is invisible, so it is not occupancy.
      case "f": case "F": case "f*":
        if (!fillIsWhite) commitPath();
        path = [];
        break;
      // A stroke always marks the page, whatever the fill colour is.
      case "S": case "s":
      case "B": case "B*": case "b": case "b*":
        commitPath();
        path = [];
        break;
      // End path with no painting — this is the clip-only case (W n / W* n).
      case "n":
        path = [];
        break;
      default: break;
    }
    st = [];
    glyphs = 0;
    if (op !== "Do") lastName = null;
  }

  if (unmeasurable) return { understood: false, reason: `page draws a ${unmeasurable} with no measurable extent` };
  if (unsupportedCm) return { understood: false, reason: "page uses a rotated or skewed coordinate transform" };
  if (unresolvedXObject) return { understood: false, reason: "page paints an XObject whose extent could not be resolved" };
  if (!rects.length) return { understood: false, reason: "content stream present but nothing could be located — cannot prove the page is blank" };

  const minX = Math.min(...rects.map((r) => r.x0));
  const minY = Math.min(...rects.map((r) => r.y0));
  const maxX = Math.max(...rects.map((r) => r.x1));
  const maxY = Math.max(...rects.map((r) => r.y1));
  if (minX < -1 || minY < -1 || maxX > pageW + 1 || maxY > pageH + 1) {
    return { understood: false, reason: "located content falls outside the page box" };
  }
  return { understood: true, rects, occupied: { minX, minY, maxX, maxY } };
}

// ── Placement ────────────────────────────────────────────────────────────────

export interface Placement {
  /** "inline" = drawn on an existing page. "none" = no safe spot; nothing drawn. */
  mode: "inline" | "none";
  pageIndex?: number;
  x?: number;
  y?: number;
  /**
   * Which approved region won, recorded rather than parsed back out of `reason`.
   * "lower-right" includes every raised rung of the lower ladder; the exact rung
   * is still in `reason`.
   */
  region?: "lower-right" | "upper-right";
  reason: string;
}

const intersects = (a: Rect, b: Rect) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Candidate positions, in the owner-approved preference order.
 *
 * TWO REGIONS ONLY, both on the RIGHT edge:
 *
 *   1. LOWER-RIGHT, climbing UP. Across the genuine provider letters reviewed
 *      as layout references, signatures and credential blocks concentrate on
 *      the LOWER-LEFT, leaving the lower-right the most reliably free region —
 *      but letters end at different heights, so a single hard-coded coordinate
 *      would be wrong for most of them. It is therefore scanned as a LADDER:
 *      start at the approved position (~0.50in from the right, ~0.42in from the
 *      bottom) and climb in 6pt steps ONLY as far as needed to clear whatever
 *      is there.
 *
 *   2. UPPER-RIGHT, descending. Reached only when every lower-right rung is
 *      blocked. It starts at the mirror of the approved position (~0.50in from
 *      the right, ~0.42in from the TOP) and moves DOWN in the same 6pt steps.
 *      "Place it on top" means the upper portion of the page, so the descent is
 *      bounded to the upper half: a candidate is only offered while its bottom
 *      edge stays at or above the page midpoint. Below that we would be
 *      drifting into the body of the letter, and a safe-fail is the correct
 *      answer instead.
 *
 * There is no third region and no appended page. BOTTOM-LEFT WAS REMOVED: the
 * approved order is lower-right then upper-right, and the lower-left is exactly
 * where signature and credential blocks live on these letters.
 *
 * Every candidate here is only a PROPOSAL. findSafePlacement() still has to
 * prove the rectangle plus clearance is free of located content before any of
 * them is used, so ordering changes which safe spot wins — never whether the
 * occupancy check runs.
 */
// Margins are measured to the CODE, not to the white plate. The plate carries a
// 4-module quiet zone (~7.4pt at the sizes we encode), so anchoring on the plate
// silently pushed the code ~0.1in further in than intended and put the right
// margin at 0.60in when 0.45-0.55in was wanted.
export const QR_CODE_RIGHT_PT = 36;      // 0.50in from the trimmed right edge
export const QR_CODE_BOTTOM_PT = 30;     // 0.42in from the trimmed bottom edge
export const QR_CODE_TOP_PT = 30;        // 0.42in from the trimmed top edge
const LADDER_STEP_PT = 6;
const LADDER_RUNGS = 30;                 // climbs up to 174pt from its anchor

export function candidates(
  pageW: number,
  pageH: number,
  block: BlockMetrics,
): Array<{ x: number; y: number; label: string; region: "lower-right" | "upper-right" }> {
  const out: Array<{ x: number; y: number; label: string; region: "lower-right" | "upper-right" }> = [];
  const quiet = block.quietZonePt;
  // Plate origin that puts the CODE at the requested margins.
  const rightX = pageW - QR_CODE_RIGHT_PT - block.width + quiet;
  const floorY = QR_CODE_BOTTOM_PT - quiet;
  // Mirror of floorY: the CODE sits QR_CODE_TOP_PT below the trimmed top edge.
  const ceilY = pageH - QR_CODE_TOP_PT - block.height + quiet;

  // 1 · lower-right, climbing
  for (let i = 0; i < LADDER_RUNGS; i++) {
    const y = floorY + i * LADDER_STEP_PT;
    if (y + block.height > pageH - MARGIN_PT) break;
    out.push({
      x: rightX, y, region: "lower-right",
      label: i === 0 ? "lower-right (lowest)" : `lower-right +${i * LADDER_STEP_PT}pt`,
    });
  }

  // 2 · upper-right, descending, bounded to the upper half of the page
  for (let i = 0; i < LADDER_RUNGS; i++) {
    const y = ceilY - i * LADDER_STEP_PT;
    if (y < MARGIN_PT) break;             // never below the bottom margin
    if (y < pageH / 2) break;             // stay in the UPPER portion of the page
    out.push({
      x: rightX, y, region: "upper-right",
      label: i === 0 ? "upper-right (highest)" : `upper-right -${i * LADDER_STEP_PT}pt`,
    });
  }

  return out;
}

/**
 * Find a placement on ONE page whose safety we can actually demonstrate.
 * Asks only "does anything intersect this candidate rectangle plus clearance?",
 * so content elsewhere on the page — a letterhead logo, a body paragraph — is
 * irrelevant to a free footer corner.
 */
export function findSafePlacement(
  bounds: ContentBounds,
  pageW: number,
  pageH: number,
  block: BlockMetrics,
  pageIndex: number,
): Placement {
  if (!bounds.understood || !bounds.rects) {
    return { mode: "none", reason: bounds.reason ?? "page content could not be modelled" };
  }
  if (block.width + MARGIN_PT * 2 > pageW || block.height + MARGIN_PT * 2 > pageH) {
    return { mode: "none", reason: "block does not fit inside the page margins" };
  }

  for (const c of candidates(pageW, pageH, block)) {
    const guard: Rect = {
      x0: c.x - CLEARANCE_PT,
      y0: c.y - CLEARANCE_PT,
      x1: c.x + block.width + CLEARANCE_PT,
      y1: c.y + block.height + CLEARANCE_PT,
    };
    const hit = bounds.rects.find((r) => intersects(r, guard));
    if (!hit) {
      return {
        mode: "inline", pageIndex, x: c.x, y: c.y, region: c.region,
        reason: `${c.label} of page ${pageIndex + 1} verified clear (${block.width.toFixed(1)}x${block.height.toFixed(1)}pt + ${CLEARANCE_PT}pt clearance)`,
      };
    }
  }
  return {
    mode: "none",
    reason: `no clear lower-right or upper-right space on page ${pageIndex + 1}`,
  };
}

// ── Document integrity ───────────────────────────────────────────────────────
//
// WHY THIS GATE EXISTS. pdf-lib is deliberately forgiving: when a file has no
// cross-reference table it RECONSTRUCTS the object graph by scanning for
// `N M obj` markers, and will hand back a usable PDFDocument for a file no
// conforming reader accepts. A real TEST fixture proved the danger — 407 bytes,
// no `xref`, no `startxref`, `%%EOF` followed by 200 bytes of `xxxx` garbage.
// pdf-lib reported a clean 1-page 612x792 document; pdf.js refused it outright
// ("Command token too long"). The earlier code stamped a QR onto it and called
// that a success.
//
// If the structure cannot be trusted, neither can any conclusion drawn from it:
// not the page count, not the geometry, and not "this corner is empty". Writing
// a pdf-lib-REPAIRED rewrite to processed_file_url would also republish a
// clinical letter whose fidelity to the provider's original we cannot
// demonstrate. So this fails CLOSED rather than guessing.
export type FailureCode =
  | "no_pdf_header"
  | "no_eof_marker"
  | "trailing_garbage"
  | "no_xref_table"
  | "bad_startxref"
  | "encrypted_or_unparseable"
  | "no_pages"
  | "page_geometry_unknown"
  | "no_safe_qr_placement"
  | "output_reopen_failed"
  | "output_structure_changed"
  | "output_qr_verification_failed";

export interface IntegrityResult { ok: boolean; code?: FailureCode; detail: string }

const ASCII = (b: Uint8Array, from: number, to: number) =>
  Array.from(b.subarray(Math.max(0, from), Math.min(b.length, to)))
    .map((c) => String.fromCharCode(c)).join("");

/**
 * Structural integrity of the ORIGINAL bytes, checked before anything is drawn.
 * Cheap, deterministic, and independent of pdf-lib's leniency.
 */
export function assessPdfIntegrity(bytes: Uint8Array): IntegrityResult {
  if (bytes.length < 32) return { ok: false, code: "no_pdf_header", detail: "file too small to be a PDF" };
  if (ASCII(bytes, 0, 5) !== "%PDF-") {
    return { ok: false, code: "no_pdf_header", detail: "missing %PDF- header" };
  }

  // The trailer of a conforming file lives at its end, so only the tail is read.
  const tailFrom = Math.max(0, bytes.length - 4096);
  const tail = ASCII(bytes, tailFrom, bytes.length);

  const eofAt = tail.lastIndexOf("%%EOF");
  if (eofAt === -1) return { ok: false, code: "no_eof_marker", detail: "no %%EOF trailer marker" };

  // Nothing but whitespace may follow the final %%EOF. Appended junk means the
  // file was truncated, concatenated or corrupted somewhere upstream.
  const after = tail.slice(eofAt + 5);
  if (after.trim().length > 0) {
    return { ok: false, code: "trailing_garbage", detail: `${after.trim().length} bytes follow the final %%EOF` };
  }

  const sxAt = tail.lastIndexOf("startxref");
  if (sxAt === -1 || sxAt > eofAt) {
    return { ok: false, code: "no_xref_table", detail: "no startxref before %%EOF" };
  }
  const offsetText = tail.slice(sxAt + 9, eofAt).trim();
  const offset = Number(offsetText.split(/\s+/)[0]);
  if (!Number.isInteger(offset) || offset <= 0 || offset >= bytes.length) {
    return { ok: false, code: "bad_startxref", detail: "startxref offset outside the file" };
  }
  // The offset must land on a real cross-reference structure: a classic `xref`
  // table, or an object header for a cross-reference STREAM.
  const at = ASCII(bytes, offset, offset + 40).replace(/^[\s\0]+/, "");
  if (!(at.startsWith("xref") || /^\d+\s+\d+\s+obj/.test(at))) {
    return { ok: false, code: "bad_startxref", detail: "startxref does not point at an xref table or stream" };
  }
  return { ok: true, detail: "structure verified" };
}

/** Page geometry we are willing to reason about at all. */
export function assessPageGeometry(width: number, height: number): IntegrityResult {
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, code: "page_geometry_unknown", detail: "page has no usable MediaBox" };
  }
  // 1in..200in per side. Outside that it is not a letter we can place a code on.
  if (width < 72 || height < 72 || width > 14400 || height > 14400) {
    return { ok: false, code: "page_geometry_unknown", detail: "page dimensions implausible for a letter" };
  }
  return { ok: true, detail: "geometry verified" };
}

/**
 * Re-extract the QR modules from a FINISHED page and compare them to the matrix
 * the URL should produce.
 *
 * This is the post-injection proof: reopen the output, find the module
 * rectangles actually written to the content stream, rebuild the grid from their
 * geometry, and require an exact match. A partial draw, a wrong module pitch, a
 * y-flip regression or a corrupted save fails here instead of shipping.
 */
export function verifyDrawnQr(
  raw: string,
  spec: VerificationBlockSpec,
  metrics: BlockMetrics,
  placement: Placement,
): IntegrityResult {
  const expected = qrMatrix(spec.verifyUrl);
  const n = metrics.moduleCount;
  if (expected.length !== n) {
    return { ok: false, code: "output_qr_verification_failed", detail: "matrix size disagrees with metrics" };
  }
  const pitch = metrics.modulePt;
  const originX = (placement.x ?? 0) + PAD + metrics.quietZonePt;
  const originY = (placement.y ?? 0) + PAD + metrics.quietZonePt;

  const found = Array.from({ length: n }, () => Array(n).fill(false));
  let count = 0;
  const re = /1 0 0 1 ([-\d.]+) ([-\d.]+) cm[\s\S]{0,120}?0 0 m\s*\n\s*0 ([\d.]+) l\s*\n\s*\3 \3 l\s*\n\s*\3 0 l\s*\n\s*h\s*\n\s*f/g;
  for (const m of raw.matchAll(re)) {
    if (Math.abs(Number(m[3]) - pitch) > 1e-6) continue;
    const c = Math.round((Number(m[1]) - originX) / pitch);
    const rowFromBottom = Math.round((Number(m[2]) - originY) / pitch);
    const r = n - 1 - rowFromBottom;
    if (r < 0 || r >= n || c < 0 || c >= n) {
      // Module-pitch squares exist somewhere else on the page. Most often this
      // means the page ALREADY carries a verification code (someone re-fed a
      // stamped copy as if it were the provider original). Either way we cannot
      // certify that the output shows exactly one code, so we refuse rather than
      // publish a document with two.
      return {
        ok: false, code: "output_qr_verification_failed",
        detail: "page carries QR modules outside the expected grid (already stamped?)",
      };
    }
    found[r][c] = true;
    count++;
  }
  if (count === 0) {
    return { ok: false, code: "output_qr_verification_failed", detail: "no QR modules found in the output" };
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (found[r][c] !== expected[r][c]) {
        return { ok: false, code: "output_qr_verification_failed", detail: "drawn modules differ from the encoded matrix" };
      }
    }
  }
  return { ok: true, detail: `all ${count} modules verified against the encoded matrix` };
}

export interface BuildResult {
  bytes: Uint8Array;
  placement: Placement;
  metrics: BlockMetrics;
  pageCountBefore: number;
  pageCountAfter: number;
  /** Why each page was rejected, for the layout census. */
  attempts: Array<{ pageIndex: number; reason: string }>;
  /** Set whenever the build refused to produce a publishable document. */
  failure?: FailureCode;
  /** Non-sensitive explanation, safe for the Admin surface. */
  failureDetail?: string;
  /** True only when the drawn QR was re-verified out of the saved output. */
  verified?: boolean;
}

/**
 * Build the QR-stamped copy from the ORIGINAL bytes. The input buffer is never
 * mutated and never written back — the caller stores the result at a NEW path.
 *
 * PAGE ORDER. The FINAL page is tried first: on a multi-page letter that is
 * where the signature block and the trailing whitespace live, and it is the
 * page the owner asked to prefer. Page 1 is tried next (a landlord looks there
 * first), then any remaining pages. NOTHING IS EVER APPENDED — if no page has a
 * provably clear corner the result carries mode "none" and identical bytes, and
 * the caller must fail safe rather than overlay the code on content.
 */
export async function buildQrVerificationPdf(
  originalBytes: ArrayBuffer | Uint8Array,
  spec: VerificationBlockSpec,
  readPageContent: (doc: PDFDocument, pageIndex: number) => Promise<string | null>,
): Promise<BuildResult> {
  const input = originalBytes instanceof Uint8Array ? originalBytes : new Uint8Array(originalBytes);
  const metrics = measureBlock(spec);
  // `pages` is reported for BOTH before and after on a refusal: nothing was
  // produced, so the only honest answer is the original page count unchanged.
  const refuse = (code: FailureCode, detail: string, pages = 0): BuildResult => ({
    // The ORIGINAL bytes are returned untouched so a caller that ignores
    // `failure` still cannot publish a half-made document.
    bytes: input,
    placement: { mode: "none", reason: `${code}: ${detail}` },
    metrics,
    pageCountBefore: pages,
    pageCountAfter: pages,
    attempts: [],
    failure: code,
    failureDetail: detail,
    verified: false,
  });

  // GATE 1 — structure. Before pdf-lib gets a chance to be helpful.
  const integrity = assessPdfIntegrity(input);
  if (!integrity.ok) return refuse(integrity.code!, integrity.detail);

  // GATE 2 — parse. An encrypted document, or one that only loads with the
  // leniency flags, is not a document we can verify, so it is not one we will
  // rewrite. updateMetadata:false is a LOAD option in pdf-lib, not a save
  // option: left on, save() rewrites ModDate to "now", the same input produces
  // different bytes every run, and idempotency cannot be asserted.
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false });
  } catch (e) {
    return refuse("encrypted_or_unparseable",
      e instanceof Error && /encrypt/i.test(e.message)
        ? "document is encrypted"
        : "document could not be parsed");
  }

  const pageCountBefore = doc.getPageCount();
  if (pageCountBefore === 0) return refuse("no_pages", "document has no pages", 0);

  // GATE 3 — geometry of EVERY page. A document carrying one page we cannot
  // reason about is not one we will republish, even if the target page is fine.
  for (let i = 0; i < pageCountBefore; i++) {
    const { width, height } = doc.getPage(i).getSize();
    const geo = assessPageGeometry(width, height);
    if (!geo.ok) return refuse(geo.code!, `page ${i + 1}: ${geo.detail}`);
  }

  const order: number[] = [pageCountBefore - 1];
  if (pageCountBefore > 1) order.push(0);
  for (let i = 1; i < pageCountBefore - 1; i++) order.push(i);

  let placement: Placement = { mode: "none", reason: "document has no pages" };
  const attempts: Array<{ pageIndex: number; reason: string }> = [];

  for (const idx of order) {
    const page = doc.getPage(idx);
    const { width, height } = page.getSize();
    let raw: string | null = null;
    try { raw = await readPageContent(doc, idx); } catch { raw = null; }
    const bounds: ContentBounds = raw === null
      ? { understood: false, reason: "page content stream unreadable (compressed or unsupported filter)" }
      : analyzePageContent(raw, width, height, readXObjectBoxes(doc, idx));

    const p = findSafePlacement(bounds, width, height, metrics, idx);
    if (p.mode === "inline") {
      drawVerificationBlock(page, spec, p.x!, p.y!);
      placement = p;
      break;
    }
    attempts.push({ pageIndex: idx, reason: p.reason });
    placement = p;
  }

  if (placement.mode !== "inline") {
    return {
      ...refuse("no_safe_qr_placement",
        `no page offered a clear corner (${attempts.map((a) => `p${a.pageIndex + 1}: ${a.reason}`).join("; ")})`,
        pageCountBefore),
      attempts,
    };
  }

  const bytes = await doc.save();

  // GATE 4 — the OUTPUT must reopen, keep its shape, and still contain exactly
  // the QR we meant to draw. Without this the function could report success for
  // a save that silently produced an unusable file.
  let out: PDFDocument;
  try {
    out = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return { ...refuse("output_reopen_failed", "the stamped copy could not be reopened", pageCountBefore), attempts };
  }
  if (out.getPageCount() !== pageCountBefore) {
    return { ...refuse("output_structure_changed", "page count changed during injection", pageCountBefore), attempts };
  }
  const before = doc.getPage(placement.pageIndex!).getSize();
  const afterSize = out.getPage(placement.pageIndex!).getSize();
  if (Math.abs(before.width - afterSize.width) > 0.01 || Math.abs(before.height - afterSize.height) > 0.01) {
    return { ...refuse("output_structure_changed", "page dimensions changed during injection", pageCountBefore), attempts };
  }

  let outRaw: string | null = null;
  try { outRaw = await readPageContent(out, placement.pageIndex!); } catch { outRaw = null; }
  if (outRaw === null) {
    return { ...refuse("output_reopen_failed", "the stamped page could not be re-read", pageCountBefore), attempts };
  }
  const drawn = verifyDrawnQr(outRaw, spec, metrics, placement);
  if (!drawn.ok) {
    return { ...refuse(drawn.code!, drawn.detail, pageCountBefore), attempts };
  }

  return {
    bytes, placement, metrics,
    pageCountBefore, pageCountAfter: out.getPageCount(),
    attempts, verified: true,
  };
}
