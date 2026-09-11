#!/usr/bin/env node
/**
 * scripts/build-responsive-images.mjs
 *
 * PERFORMANCE-RUM-AND-LOW-RISK-OPTIMIZATION-001 — Slice 2.
 *
 * Generates modern AVIF + WebP variants for the heavy public images, at the
 * widths those images are actually DISPLAYED at. Follows the pattern
 * scripts/optimize-phase7-images.mjs established: a one-off runner whose
 * outputs are committed to the repo, sharp stays a devDependency, and the
 * ORIGINAL FILES ARE NEVER TOUCHED.
 *
 * Why the originals are left alone
 * ---------------------------------------------------------------------------
 * `woman-telehealth-with-dog.jpg` alone has 20+ call sites, several of which
 * are Open Graph tags and JSON-LD `image` values. Social scrapers and search
 * crawlers want a stable, absolute JPEG URL, and rewriting those would be a
 * real SEO/social risk for no rendering benefit. So every original keeps its
 * exact path, bytes and dimensions, and the variants sit ALONGSIDE it under a
 * predictable name. A call site opts in by switching to <ResponsiveImage>;
 * every call site that does not opt in behaves exactly as before.
 *
 * Naming: `<dir>/<base>-<width>.<avif|webp>`
 *   /assets/blog/fp-curly-woman-fun-dog.jpg
 *     -> /assets/blog/fp-curly-woman-fun-dog-400.avif
 *     -> /assets/blog/fp-curly-woman-fun-dog-400.webp   (etc.)
 *
 * Crop is preserved absolutely: every variant is a pure downscale of the
 * original, `fit: inside`, no cropping, no art direction, no aspect change.
 *
 * Run with: npm run build:responsive-images
 */

import sharp from "sharp";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "public");

/**
 * The widths generated for each source, chosen from the MEASURED display size
 * of that image (see the task doc for the browser measurements), not guessed.
 *
 * A 333 px-wide card on a DPR-2 phone needs ~666 px of pixels — so 400 is the
 * small-phone variant, 800 covers DPR-2 phones and tablets, and 1600 keeps the
 * full-bleed desktop hero sharp.
 */
const WIDTHS = [400, 800, 1600];

/**
 * Sources to process. Every entry was picked because the browser measured it
 * as a real cost on a priority page, NOT because the file looked big on disk.
 */
const SOURCES = [
  // /blog card grid + ~20 shared call sites. 1600x1067 served into a 333x160 box.
  "assets/lifestyle/woman-telehealth-with-dog.jpg",
  // /esa-letter-housing mobile hero (CSS background, LCP element on the paid LP).
  "assets/blog/fp-woman-dog-floor.jpg",
  // /esa-letter-housing below-fold lifestyle images.
  "assets/lifestyle/woman-with-dog-new-apartment.jpg",
  "assets/blog/fp-curly-woman-fun-dog.jpg",
  "assets/testimonials/couple-with-dog-home.jpg",
];

/**
 * PNG screenshots that are really photographs. A 245 KB PNG of a UI screenshot
 * is pure waste — the same pixels are ~21 KB as WebP with no visible
 * difference. Kept separate because these need lossless-ish quality settings
 * to keep text crisp.
 */
const SCREENSHOT_SOURCES = ["assets/ui/verification-cropped.png"];

/**
 * Provider avatars. Rendered into a 56–64 px circle but stored at 300×300+,
 * so a DPR-2 phone needs 128 px and nothing more. Separate widths because the
 * photo widths above would all be upscales here.
 */
const AVATAR_SOURCES = [
  "assets/providers/provider-robert-staaf.jpg",
  "assets/providers/provider-michelle-lafferty.jpg",
  "assets/providers/provider-lytara-garcia.jpg",
  "assets/providers/provider-stephanie-white.jpg",
];
const AVATAR_WIDTHS = [128, 256];

/**
 * Pet Care Planner marketing previews (ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001).
 * Rendered from the planner PDF at 720 px wide (never the full-resolution
 * page), shown at <= 240 px in the /esa-letter-cost preview strip and as a
 * 96-112 px thumbnail in the Customer Portal. Text-heavy pages, so they use
 * the screenshot quality settings.
 */
const PLANNER_SOURCES = [
  "assets/planner/pet-care-planner-cover.jpg",
  "assets/planner/pet-care-planner-daily-checklist.jpg",
  "assets/planner/pet-care-planner-calendar.jpg",
  // ESA-PSD-PLANNERS-MARKETING-LIVE-001: pages rendered from the PSD workbook.
  "assets/planner/psd-workbook-cover.jpg",
  "assets/planner/psd-workbook-public-access.jpg",
  "assets/planner/psd-workbook-milestones.jpg",
];
const PLANNER_WIDTHS = [240, 480, 720];

/**
 * The owner-supplied Pet Care Planner marketing artwork (originals preserved
 * as PNG under design-sources/planner/; these JPEGs are the served fallbacks).
 * The collage is shown from the sm breakpoint at <= 640px CSS width; the
 * portrait cover replaces it on phones (<= 88vw), so each gets its own widths.
 */
const PLANNER_HERO_SOURCES = [
  ["assets/planner/pet-care-planner-collage.jpg", [640, 960, 1280, 1536]],
  ["assets/planner/pet-care-planner-cover-page.jpg", [360, 540, 720, 1024]],
];

const AVIF_OPTS = { quality: 52, effort: 6 };
const WEBP_OPTS = { quality: 76 };
// Screenshots carry small text; a higher quality keeps it legible and still
// lands an order of magnitude below the source PNG.
const SCREENSHOT_AVIF = { quality: 62, effort: 6 };
const SCREENSHOT_WEBP = { quality: 86 };

async function sizeKB(p) {
  try {
    return (await stat(p)).size / 1024;
  } catch {
    return 0;
  }
}

function variantPath(srcRel, width, ext) {
  const dir = dirname(srcRel);
  const base = basename(srcRel, extname(srcRel));
  return join(dir, `${base}-${width}.${ext}`);
}

let totalSrcKB = 0;
let generated = 0;

/**
 * src -> widths actually written. Emitted as a generated TS module so
 * <ResponsiveImage> can only ever reference a variant that EXISTS.
 *
 * This matters more than it looks. A <source srcset> pointing at a missing
 * file does NOT fall through to the next <source> — the browser shows a broken
 * image. Pages like /blog pick their card image from a rotating pool at
 * runtime, so the component cannot know in advance whether a given src was
 * processed. With the manifest it does: unlisted sources render as a plain
 * <img>, exactly as before, and adding variants later is a pure win with no
 * call-site change.
 */
const manifest = {};

async function processOne(srcRel, avifOpts, webpOpts, widths = WIDTHS) {
  const src = resolve(PUBLIC_DIR, srcRel);
  if (!existsSync(src)) {
    console.log(`  SKIP (missing)  ${srcRel}`);
    return;
  }
  const buf = await readFile(src);
  const meta = await sharp(buf).metadata();
  const srcKB = await sizeKB(src);
  totalSrcKB += srcKB;

  console.log(
    `\n  ${srcRel}  ${meta.width}x${meta.height}  ${srcKB.toFixed(1)}KB (original UNCHANGED)`,
  );

  for (const w of widths) {
    // Never upscale — a variant wider than the source would be pure waste and
    // would also make srcset lie about what resolution is available.
    if (meta.width && w > meta.width) continue;

    for (const [ext, opts] of [
      ["avif", avifOpts],
      ["webp", webpOpts],
    ]) {
      const outRel = variantPath(srcRel, w, ext);
      const out = resolve(PUBLIC_DIR, outRel);
      await mkdir(dirname(out), { recursive: true });

      const pipeline = sharp(buf).resize({
        width: w,
        withoutEnlargement: true,
        fit: "inside", // pure downscale — crop and aspect ratio preserved
      });
      const encoded =
        ext === "avif"
          ? await pipeline.avif(opts).toBuffer()
          : await pipeline.webp(opts).toBuffer();

      await writeFile(out, encoded);
      generated++;
      const key = "/" + srcRel.replace(/\\/g, "/");
      if (!manifest[key]) manifest[key] = new Set();
      manifest[key].add(w);
      const outKB = encoded.length / 1024;
      console.log(
        `      ${String(w).padStart(4)}px ${ext.padEnd(4)} ${outKB.toFixed(1).padStart(7)}KB` +
          `   (-${(100 - (outKB / srcKB) * 100).toFixed(0)}% vs original)`,
      );
    }
  }
}

console.log("Responsive image variants — AVIF + WebP, originals untouched\n");
console.log("Photographs:");
for (const s of SOURCES) await processOne(s, AVIF_OPTS, WEBP_OPTS);

console.log("\n\nUI screenshots (PNG sources):");
for (const s of SCREENSHOT_SOURCES)
  await processOne(s, SCREENSHOT_AVIF, SCREENSHOT_WEBP);

console.log("\n\nProvider avatars (rendered into a 56-64px circle):");
for (const s of AVATAR_SOURCES)
  await processOne(s, AVIF_OPTS, WEBP_OPTS, AVATAR_WIDTHS);

console.log("\n\nPet Care Planner previews (rendered from the PDF at 720px):");
for (const s of PLANNER_SOURCES)
  await processOne(s, SCREENSHOT_AVIF, SCREENSHOT_WEBP, PLANNER_WIDTHS);
for (const [s, widths] of PLANNER_HERO_SOURCES)
  await processOne(s, SCREENSHOT_AVIF, SCREENSHOT_WEBP, widths);

// ── Emit the generated manifest ─────────────────────────────────────────────

const manifestEntries = Object.keys(manifest)
  .sort()
  .map(
    (k) =>
      `  ${JSON.stringify(k)}: [${[...manifest[k]].sort((a, b) => a - b).join(", ")}],`,
  )
  .join("\n");

const manifestSrc = `// AUTO-GENERATED by scripts/build-responsive-images.mjs — DO NOT EDIT BY HAND.
//
// Maps an original asset path to the variant widths that exist on disk as
// AVIF and WebP. <ResponsiveImage> consults this so it can never emit a
// <source srcset> pointing at a file that was not generated — a missing
// variant would render as a BROKEN IMAGE rather than falling through to the
// next source.
//
// To add a source: add it to scripts/build-responsive-images.mjs and re-run
// \`npm run build:responsive-images\`. No call site needs to change.

export const RESPONSIVE_IMAGE_VARIANTS: Record<string, number[]> = {
${manifestEntries}
};

/** Variant widths available for \`src\`, or null when it has none. */
export function variantsFor(src: string): number[] | null {
  return RESPONSIVE_IMAGE_VARIANTS[src] ?? null;
}
`;

const manifestOut = resolve(__dirname, "..", "src", "generated", "responsiveImages.ts");
await mkdir(dirname(manifestOut), { recursive: true });
await writeFile(manifestOut, manifestSrc, "utf8");
console.log(`\n  manifest -> src/generated/responsiveImages.ts (${Object.keys(manifest).length} sources)`);

console.log(
  `\n\nDone — ${generated} variants generated from ` +
    `${SOURCES.length + SCREENSHOT_SOURCES.length + AVATAR_SOURCES.length} sources ` +
    `(${totalSrcKB.toFixed(0)}KB of originals, all left byte-identical).`,
);
