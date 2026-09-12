// PlannerMarketingSection — the ONE reusable, responsive marketing section for
// the free customer resources: the Pet Care Planner (ESA / general pet care)
// and the Psychiatric Service Dog Training Workbook (PSD).
// ESA-PSD-PLANNERS-MARKETING-LIVE-001.
//
// Service-specific content comes from PLANNER_MARKETING[family] in
// src/data/plannerBenefit.ts — the single copy source — so every page renders
// the same wording and disclaimers and nothing drifts. The section is mounted
// on the homepage, the ESA housing / Google Ads landing pages, the ESA cost
// and how-to pages (family="esa") and on the PSD cost / how-to pages
// (family="psd"). Package cards elsewhere link to the `anchorId` here.
//
// Imagery is honest per family: the ESA variant shows the supplied Pet Care
// Planner artwork (collage on tablet/desktop, portrait cover on phones where
// the collage's page text would be illegible) plus three rendered planner
// pages; the PSD variant shows ONLY pages rendered from the actual PSD
// workbook. Every image is lazy, sized (no layout shift) and described. The
// full PDFs never appear here — they live in private storage behind the
// portal's eligibility check.
//
// CTA is context-aware without any eligibility claim: a signed-in visitor is
// pointed at My Orders (where Included Resources decides), everyone else at
// the relevant assessment. Copy always says ELIGIBLE customers receive it.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ResponsiveImage from "@/components/base/ResponsiveImage";
import { variantsFor } from "@/generated/responsiveImages";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { supabase } from "@/lib/supabaseClient";
import { PLANNER_HERO_IMAGES, PLANNER_MARKETING, type PlannerFamily } from "@/data/plannerBenefit";

interface Props {
  family: PlannerFamily;
  className?: string;
  /** Override the anchor id when the canonical preview lives on another page. */
  id?: string;
  /** Tighter vertical rhythm for conversion landing pages. */
  compact?: boolean;
}

const THEME: Record<PlannerFamily, { eyebrow: string; check: string; ring: string; cta: string; border: string; soft: string }> = {
  esa: {
    eyebrow: "text-orange-500",
    check: "text-orange-500",
    ring: "ring-orange-100",
    cta: "bg-orange-500 hover:bg-orange-600 shadow-[0_2px_6px_rgba(249,115,22,0.25)]",
    border: "border-orange-100",
    soft: "bg-[#fff7ed] border-[#ffedd5] text-[#9a3412]",
  },
  psd: {
    eyebrow: "text-amber-600",
    check: "text-amber-500",
    ring: "ring-amber-100",
    cta: "bg-[#0E2A47] hover:bg-[#091B30] shadow-[0_2px_6px_rgba(14,42,71,0.25)]",
    border: "border-amber-100",
    soft: "bg-amber-50 border-amber-100 text-amber-900",
  },
};

/** `/a/b/name.jpg` + 800 + "avif" -> `/a/b/name-800.avif` (mirrors ResponsiveImage). */
function variantUrl(src: string, width: number, ext: string): string {
  const dot = src.lastIndexOf(".");
  return `${dot === -1 ? src : src.slice(0, dot)}-${width}.${ext}`;
}
function srcSet(src: string, ext: string): string | undefined {
  const widths = variantsFor(src);
  if (!widths || widths.length === 0) return undefined;
  return [...widths].sort((a, b) => a - b).map((w) => `${variantUrl(src, w, ext)} ${w}w`).join(", ");
}

/** Art-directed hero for the ESA variant: portrait cover on phones, the wide
 *  collage from the `sm` breakpoint up. One request either way. */
function EsaHeroPicture() {
  const { collage, cover } = PLANNER_HERO_IMAGES;
  const coverAvif = srcSet(cover.src, "avif"), coverWebp = srcSet(cover.src, "webp");
  const collageAvif = srcSet(collage.src, "avif"), collageWebp = srcSet(collage.src, "webp");
  return (
    <picture>
      {coverAvif && <source media="(max-width: 639px)" type="image/avif" srcSet={coverAvif} sizes="(max-width: 639px) 88vw" />}
      {coverWebp && <source media="(max-width: 639px)" type="image/webp" srcSet={coverWebp} sizes="(max-width: 639px) 88vw" />}
      {collageAvif && <source type="image/avif" srcSet={collageAvif} sizes="(max-width: 1024px) 92vw, 640px" />}
      {collageWebp && <source type="image/webp" srcSet={collageWebp} sizes="(max-width: 1024px) 92vw, 640px" />}
      {/* Fallback <img>: the collage, sized so the box is reserved before any byte arrives. */}
      <img
        src={collage.src}
        alt={collage.alt}
        width={collage.width}
        height={collage.height}
        loading="lazy"
        decoding="async"
        className="w-full h-auto block"
      />
    </picture>
  );
}

export default function PlannerMarketingSection({ family, className = "", id, compact = false }: Props) {
  const content = PLANNER_MARKETING[family];
  const t = THEME[family];
  const { withAttribution } = useAttributionParams();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSignedIn(!!data.session); })
      .catch(() => { /* anonymous by default */ });
    return () => { alive = false; };
  }, []);

  const anchorId = id ?? content.anchorId;
  const isEsa = family === "esa";

  return (
    <section
      id={anchorId}
      data-planner-marketing={family}
      className={`${compact ? "py-10 sm:py-12" : "py-12 sm:py-16"} bg-white border-t ${t.border} scroll-mt-24 ${className}`}
      aria-labelledby={`${anchorId}-heading`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center">
          {/* ── Copy ─────────────────────────────────────────────────────── */}
          <div>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${t.eyebrow} mb-3`}>
              <i className="ri-gift-line" aria-hidden="true"></i>{content.eyebrow}
            </span>
            <h2 id={`${anchorId}-heading`} className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
              {content.heading}
            </h2>
            <p className="text-gray-700 text-[15px] leading-relaxed mb-5">{content.intro}</p>
            <ul className="space-y-2.5 mb-6">
              {content.benefits.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className={`ri-checkbox-circle-fill ${t.check}`} aria-hidden="true"></i>
                  </div>
                  <p className="text-gray-700 text-[13.5px] sm:text-sm leading-relaxed">{item}</p>
                </li>
              ))}
            </ul>

            {content.scopeNotes.length > 0 && (
              <div className={`rounded-xl border px-4 py-3 mb-6 ${t.soft}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide mb-1.5">What this workbook is — and is not</p>
                <ul className="space-y-1">
                  {content.scopeNotes.map((n) => (
                    <li key={n} className="text-xs leading-relaxed flex items-start gap-2">
                      <i className="ri-information-line mt-0.5 flex-shrink-0" aria-hidden="true"></i>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Link
                  to="/my-orders"
                  className={`whitespace-nowrap inline-flex items-center gap-2 px-6 sm:px-7 py-3 text-white font-semibold rounded-md transition-colors cursor-pointer text-[13.5px] sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 ${t.cta}`}
                >
                  <i className="ri-folder-open-line" aria-hidden="true"></i>
                  Open My Orders
                </Link>
              ) : (
                <>
                  <Link
                    to={withAttribution(content.ctaHref)}
                    className={`whitespace-nowrap inline-flex items-center gap-2 px-6 sm:px-7 py-3 text-white font-semibold rounded-md transition-colors cursor-pointer text-[13.5px] sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 ${t.cta}`}
                  >
                    <i className="ri-file-text-line" aria-hidden="true"></i>
                    {content.ctaLabel}
                  </Link>
                  <Link
                    to="/customer-login"
                    className="whitespace-nowrap inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-gray-900 underline underline-offset-4 decoration-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-400 rounded-sm"
                  >
                    <i className="ri-user-line" aria-hidden="true"></i>
                    Already a customer? Sign in
                  </Link>
                </>
              )}
            </div>
            <p className="text-[12px] text-gray-500 mt-3 leading-relaxed max-w-md">{content.portalHint}</p>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed max-w-lg">{content.disclaimer}</p>
          </div>

          {/* ── Imagery ──────────────────────────────────────────────────── */}
          <div className="min-w-0">
            {isEsa && (
              <div className={`rounded-2xl overflow-hidden ring-1 ${t.ring} bg-white shadow-[0_14px_32px_-18px_rgba(122,78,45,0.35)] mb-4 sm:mb-5`}>
                <EsaHeroPicture />
              </div>
            )}
            {/* Three fixed-ratio frames rendered from the actual document —
                boxes reserved from width/height, so the strip never shifts. */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 items-start">
              {content.previews.map((p, i) => (
                <figure key={p.src} className={`m-0 ${i === 1 && !isEsa ? "mt-6 sm:mt-8" : ""}`}>
                  <div className={`aspect-[3/4] rounded-xl overflow-hidden ring-1 ${t.ring} bg-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)]`}>
                    <ResponsiveImage
                      src={p.src}
                      alt={p.alt}
                      width={p.width}
                      height={p.height}
                      sizes="(max-width: 640px) 30vw, (max-width: 1024px) 28vw, 200px"
                      className="w-full h-full object-contain block"
                    />
                  </div>
                  <figcaption className="text-[11px] text-gray-500 text-center mt-2">{p.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
