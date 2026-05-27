#!/usr/bin/env node
/**
 * scripts/optimize-phase7-images.mjs
 *
 * PageSpeed Phase 7 (2026-05-26) — one-off image optimization runner.
 *
 * Produces the following optimized variants from existing source files:
 *
 *   Brand logos (PageSpeed flagged the white-02 PNG at ~111 KB / 4500×1576):
 *     public/assets/brand/pawtenant-logo-white-320.webp
 *     public/assets/brand/pawtenant-logo-white-640.webp
 *     public/assets/brand/pawtenant-logo-black-320.webp
 *     public/assets/brand/pawtenant-logo-black-640.webp
 *
 *   Below-fold cat image (PageSpeed flagged ~78 KB / 1157×866):
 *     public/assets/breeds/cat-with-owner.webp           (responsive width)
 *
 *   Mobile hero LCP image (PageSpeed flagged ~42.6 KB, ~21 KB savings):
 *     public/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp
 *
 * The originals are NOT deleted — they remain available as PNG / JPG
 * fallbacks (and the PNG logo is still referenced by Supabase email
 * templates where WebP is not safely renderable in mail clients).
 *
 * Run with: `node scripts/optimize-phase7-images.mjs`
 *
 * Sharp is a devDependency (added 2026-05-26 for this task) — it is
 * NOT used at runtime by the production app. Generated files are
 * committed to the repo; sharp is only required to re-run this script.
 */

import sharp from "sharp";
import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");

async function fileSizeKB(p) {
  try {
    const s = await stat(p);
    return (s.size / 1024).toFixed(1);
  } catch {
    return "n/a";
  }
}

async function sourceMeta(p) {
  try {
    const m = await sharp(p).metadata();
    return `${m.width}×${m.height}`;
  } catch {
    return "n/a";
  }
}

async function generate(jobLabel, srcRel, destRel, transform) {
  const src = resolve(publicDir, srcRel);
  const dest = resolve(publicDir, destRel);
  const buf = await readFile(src);
  const out = await transform(sharp(buf)).toBuffer();
  await writeFile(dest, out);
  const inKB = await fileSizeKB(src);
  const outKB = await fileSizeKB(dest);
  const inDim = await sourceMeta(src);
  const outDim = await sourceMeta(dest);
  console.log(
    `  ${jobLabel.padEnd(48)} ${srcRel} ${inDim} ${inKB}KB  →  ${destRel} ${outDim} ${outKB}KB`,
  );
}

console.log("Phase 7 image optimization — generating variants...\n");

// ── Logos: white + black, 320 and 640 wide. Lossless WebP preserves
//    the crisp edge of a transparent PNG logo with much smaller payload
//    than the 4500×1576 source. ────────────────────────────────────────
await generate(
  "logo white 320",
  "assets/brand/pawtenant-logo-white-02.png",
  "assets/brand/pawtenant-logo-white-320.webp",
  (img) => img.resize({ width: 320, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }),
);
await generate(
  "logo white 640",
  "assets/brand/pawtenant-logo-white-02.png",
  "assets/brand/pawtenant-logo-white-640.webp",
  (img) => img.resize({ width: 640, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }),
);
await generate(
  "logo black 320",
  "assets/brand/pawtenant-logo-black-02.png",
  "assets/brand/pawtenant-logo-black-320.webp",
  (img) => img.resize({ width: 320, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }),
);
await generate(
  "logo black 640",
  "assets/brand/pawtenant-logo-black-02.png",
  "assets/brand/pawtenant-logo-black-640.webp",
  (img) => img.resize({ width: 640, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }),
);

// ── Below-fold "what is ESA" cat image. Display container is up to
//    lg:auto / 16:10 aspect on tablets / 4:3 on phones — at 2× DPR a
//    900×600 WebP is plenty. ─────────────────────────────────────────
await generate(
  "what-is-esa cat 900w",
  "assets/breeds/cat-with-owner.jpg",
  "assets/breeds/cat-with-owner.webp",
  (img) => img.resize({ width: 900, withoutEnlargement: true }).webp({ quality: 72, effort: 6 }),
);

// ── Mobile hero LCP. Target < 25 KB without making the image blurry.
//    Mobile viewport rarely exceeds 480px CSS width × 2 DPR = 960 source
//    pixels wide — but the hero is cropped tall, so we keep aspect by
//    width only and let height auto. ─────────────────────────────────
await generate(
  "mobile hero pomeranian smaller",
  "assets/blog/pawtenant-mobile-hero-pomeranian.webp",
  "assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp",
  (img) => img.resize({ width: 760, withoutEnlargement: true }).webp({ quality: 55, effort: 6 }),
);

console.log("\nDone.");
