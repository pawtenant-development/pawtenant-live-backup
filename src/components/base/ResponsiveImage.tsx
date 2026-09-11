// src/components/base/ResponsiveImage.tsx
//
// PERFORMANCE-RUM-AND-LOW-RISK-OPTIMIZATION-001 — Slice 2.
//
// Emits a <picture> that offers AVIF and WebP variants alongside the ORIGINAL
// file, which stays the <img src> fallback. Variants are produced by
// scripts/build-responsive-images.mjs and committed; this component only
// references them by the naming convention that script guarantees.
//
// ── DESIGN AND CROP ARE PRESERVED ───────────────────────────────────────────
// Every variant is a pure downscale of the same source (fit: inside), so the
// crop, subject framing and aspect ratio are identical at every width. This
// component changes only which BYTES the browser downloads — never which
// picture it shows, and never how the picture is laid out. `className` is
// applied to the <img> exactly as it was before, so existing Tailwind
// object-cover / rounded / sizing classes keep working unchanged.
//
// ── WHY <picture> AND NOT JUST srcset ───────────────────────────────────────
// srcset alone cannot express format fallback. <picture> lets Safari take
// WebP, modern Chrome/Firefox take AVIF, and anything older fall through to
// the untouched original JPEG/PNG — with exactly ONE request, because the
// browser picks a single <source> and never downloads the others. Conflicting
// <source> entries are the classic way to accidentally double-download here,
// so the sources are strictly ordered avif → webp → original and each type is
// declared exactly once.
//
// ── LAYOUT STABILITY ────────────────────────────────────────────────────────
// `width` and `height` are REQUIRED props. They are the intrinsic dimensions
// of the original, and the browser uses their ratio to reserve the box before
// any byte arrives. Making them required is deliberate: this task exists
// because of an unexplained field CLS, and an unsized image is the most common
// cause of one.
//
// ── LCP ─────────────────────────────────────────────────────────────────────
// `priority` marks the true above-fold LCP image: it sets fetchpriority="high"
// and, critically, does NOT lazy-load. Everything else defaults to
// loading="lazy" + decoding="async". Never pass priority to more than one
// image per page — competing high-priority fetches make LCP worse, not better.

import { variantsFor } from "@/generated/responsiveImages";

export interface ResponsiveImageProps {
  /** Path to the ORIGINAL asset, e.g. "/assets/blog/fp-curly-woman-fun-dog.jpg". */
  src: string;
  /** Required. Accessible description — never decorative-empty by accident. */
  alt: string;
  /** Intrinsic width of the original, in px. Reserves the layout box. */
  width: number;
  /** Intrinsic height of the original, in px. Reserves the layout box. */
  height: number;
  /**
   * Override the variant widths. Normally omitted — the generated manifest is
   * the source of truth, so a source with no variants degrades to a plain
   * <img> instead of 404-ing a srcset candidate.
   */
  variants?: number[];
  /** Forwarded to the <img>, e.g. the /blog pool's fallback handler. */
  onError?: React.ReactEventHandler<HTMLImageElement>;
  /** Forwarded to the <img>. */
  title?: string;
  /**
   * The `sizes` attribute — how wide this image renders at each breakpoint.
   * Getting this right is what actually saves the bytes: without it the
   * browser assumes 100vw and picks the largest candidate every time.
   */
  sizes?: string;
  /** Applied to the <img>, exactly as before. */
  className?: string;
  /** True ONLY for the above-fold LCP image. Disables lazy loading. */
  priority?: boolean;
  /** Escape hatch for wrappers that need to style the <picture> itself. */
  pictureClassName?: string;
}

/** `/a/b/name.jpg` + 800 + "avif" -> `/a/b/name-800.avif` */
function variantUrl(src: string, width: number, ext: string): string {
  const dot = src.lastIndexOf(".");
  const stem = dot === -1 ? src : src.slice(0, dot);
  return `${stem}-${width}.${ext}`;
}

function buildSrcSet(src: string, widths: number[], ext: string): string {
  return widths.map((w) => `${variantUrl(src, w, ext)} ${w}w`).join(", ");
}

export default function ResponsiveImage({
  src,
  alt,
  width,
  height,
  variants,
  sizes = "100vw",
  className,
  priority = false,
  pictureClassName,
  onError,
  title,
}: ResponsiveImageProps) {
  // The manifest is authoritative. An explicit `variants` prop is only an
  // override for a caller that knows better; a source with neither renders as
  // a plain <img>, byte-for-byte the behaviour it had before this component
  // existed.
  const available = variants ?? variantsFor(src);
  const widths = available ? [...available].sort((a, b) => a - b) : null;

  const img = (
    <img
      src={src}
      alt={alt}
      title={title}
      width={width}
      height={height}
      className={className}
      onError={onError}
      // The LCP image must paint as early as possible; everything else must
      // stay out of the LCP window entirely.
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
    />
  );

  if (!widths || widths.length === 0) return img;

  return (
    <picture className={pictureClassName}>
      <source type="image/avif" srcSet={buildSrcSet(src, widths, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={buildSrcSet(src, widths, "webp")} sizes={sizes} />
      {img}
    </picture>
  );
}
