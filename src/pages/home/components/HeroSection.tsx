import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * HeroSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * One integrated hero: content rendered OVER the background image (owner
 * correction A — no detached image block). Reuses the proven treatment from
 * the previous hero verbatim: 100svh inline-styled box, mobile/desktop WebP
 * <picture> split (same preloaded LCP assets), img opacity-80, gray-900
 * gradient overlay + mobile bottom band. Only the CONTENT stack changed:
 *   rating line → H1 → "Start for as low as $32.25" → CTA → refund line → states pill
 * Copy mirrors scripts/prerender-seo.mjs HOME_HERO_SKELETON — keep in sync.
 *
 * Removed vs old hero (approved redesign): HIPAA badge pill, long sub
 * paragraph, secondary "How It Works" button, Klarna hover popover, scroll cue.
 */
export default function HeroSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section
      id="get-started"
      className="relative min-h-[100svh] flex items-center overflow-hidden"
      // Inline min-height so the hero reserves a full-viewport box even before
      // the async app stylesheet applies (prevents the pre-CSS CLS — see the
      // PageSpeed Phase 2 notes in the previous revision of this file).
      style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}
    >
      {/* Background image — same assets, preloads and opacity as before. */}
      <div className="absolute inset-0" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <picture>
          <source
            media="(max-width: 768px)"
            srcSet="/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp"
            type="image/webp"
          />
          <source
            media="(min-width: 769px)"
            srcSet="/assets/blog/fp-woman-sitting-floor-desktop.webp"
            type="image/webp"
          />
          <img
            src="/assets/blog/fp-woman-sitting-floor.jpg"
            alt="Pet owner with dog at home applying for an ESA letter online"
            className="w-full h-full object-cover hero-img-position opacity-80"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width={1920}
            height={1280}
          />
        </picture>
        {/* Centered-content overlay: symmetric vertical gradient (same gray-900
            family/opacities as the previous left-weighted treatment). */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/60 to-gray-900/75"></div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-900/70 to-transparent md:hidden"></div>
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 py-20 sm:py-28 md:py-32">
        <div className="max-w-2xl mx-auto text-center">
          {/* Rating / trust line */}
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <span className="text-amber-400 text-[15px] tracking-[2px]" aria-hidden>
              ★★★★★
            </span>
            <span className="text-white text-[13.5px] sm:text-sm font-bold">
              4.9 · Trusted by 15,000+ pet owners
            </span>
          </div>

          <h1
            className="text-[34px] leading-[1.15] sm:text-4xl lg:text-[54px] lg:leading-[1.12] font-semibold text-white mb-5"
            style={{ fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' }}
          >
            Get an <span className="text-orange-400">ESA Letter</span> Online
            <br className="hidden sm:block" />
            <em className="not-italic sm:italic"> Your Landlord Can Verify</em>
          </h1>

          {/* Installment anchor — the ONLY price signal in the hero. */}
          <p className="text-gray-100 text-[17px] sm:text-lg mb-7">
            Start for as low as{" "}
            <strong
              className="text-white font-bold text-[21px] sm:text-[23px]"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              $32.25
            </strong>
          </p>

          {/* Primary CTA — single conversion path. */}
          <div className="flex flex-col items-center gap-0">
            <a
              href={withAttribution("/assessment")}
              className="w-full sm:w-auto min-w-0 sm:min-w-[260px] px-8 py-4 bg-orange-500 text-white font-extrabold text-base rounded-md hover:bg-orange-600 transition-colors cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30"
            >
              Check If You Qualify
              <i className="ri-arrow-right-line" aria-hidden></i>
            </a>
            <p className="text-white/90 text-[13px] font-semibold mt-3 flex items-center gap-1.5">
              <i className="ri-checkbox-circle-fill text-emerald-300" aria-hidden></i>
              Full refund if you don&rsquo;t qualify
            </p>
          </div>

          {/* Coverage pill — preserved trust copy. */}
          <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-2.5 rounded-full mt-7">
            <i className="ri-map-2-line text-orange-400" aria-hidden></i>
            <span className="text-white text-xs font-semibold whitespace-nowrap">Serving all 50 US states</span>
          </div>
        </div>
      </div>
    </section>
  );
}
