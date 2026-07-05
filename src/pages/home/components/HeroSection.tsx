import { useAttributionParams } from "@/hooks/useAttributionParams";

export default function HeroSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section
      id="get-started"
      className="relative min-h-[100svh] flex items-center overflow-hidden"
      // PageSpeed Phase 2 (2026-06-08): inline min-height so the hero reserves a
      // full-viewport box even before the (async) app stylesheet applies its
      // Tailwind classes. The app CSS lands AFTER the React bundle executes on
      // throttled mobile, so without this the React hero rendered with an inert
      // min-h-[100svh] (collapsed) for a beat, then re-expanded when the CSS
      // arrived — shifting the whole page down (the ~0.31 mobile CLS PSI
      // flagged). Inline styles apply immediately, independent of the CSS race.
      style={{ minHeight: "100svh", display: "flex", alignItems: "center" }}
    >
      {/* Background Image — Phase 1D responsive WebP delivery (2026-05-18).
          Phase 7 PageSpeed (2026-05-26): mobile variant downsized from
          900×1350 / 42.6 KB to 760×1140 / 22.6 KB. Desktop variant
          unchanged.
          Browsers that support WebP pick the matching <source> based on
          viewport media query; legacy browsers fall back to the JPG <img>.
          The two <source> tags are mime-typed image/webp so a future swap
          of either variant only touches the URL string. */}
      {/* Inline absolute + overflow:hidden so this background layer takes NO
          flow height and the oversized hero <img> can't cause horizontal
          scroll during the brief pre-CSS window (see the section style note).
          This keeps the hero a deterministic 100svh box regardless of when the
          app stylesheet applies — eliminating the whole-page CLS. */}
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
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/65 to-gray-900/25"></div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-900/70 to-transparent md:hidden"></div>
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 py-20 sm:py-28 md:py-32">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <i className="ri-shield-check-line"></i>
            HIPAA Compliant
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-5">
            Get an <span className="text-orange-400">ESA Letter</span> Online
            <br className="hidden sm:block" />
            {" "}Fast, Simple &amp; Stress Free
          </h1>

          <p className="text-gray-200 text-base sm:text-lg mb-7 leading-relaxed">
            Get your <strong className="text-white font-semibold">ESA letter online</strong> from licensed mental health professionals — accepted for housing nationwide under the Fair Housing Act. No waiting rooms, no hassle.
          </p>

          {/* 50 States Trust Badge — single calm trust signal.
              Pre-cleanup-2026-05-24 the hero stacked a 4-icon stats grid,
              a separate "Signed by..." trust line, a state-abbrev list,
              How-It-Works mini-cards, and a Provider Credibility Strip
              above this badge. All duplicated content from the StepsSection
              / DoctorsSection / TrustFeatures sections below. Removed to
              calm the desktop hero per pre-LIVE cleanup spec. */}
          <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-2.5 rounded-full mb-7">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-map-2-line text-orange-400"></i>
            </div>
            <span className="text-white text-xs font-semibold whitespace-nowrap">Serving all 50 US states</span>
          </div>

          {/* CTA Buttons — mobile: single full-width primary CTA, larger
              tap target. Desktop/tablet: primary + secondary side-by-side.
              Color softened from orange-500 to orange-400 so the CTA feels
              warm without being aggressive. */}
          <div className="flex flex-col sm:flex-row gap-3 mb-3 sm:mb-8">
            <a
              href={withAttribution("/assessment")}
              className="w-full sm:w-auto px-8 py-4 sm:py-3.5 bg-orange-400 text-white font-bold text-base sm:text-sm rounded-md hover:bg-orange-500 transition-colors cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-400/25 sm:shadow-none"
            >
              Get Your ESA Letter Now
              <i className="ri-arrow-right-line"></i>
            </a>
            <a
              href="#how-it-works"
              className="hidden sm:inline-flex whitespace-nowrap px-7 py-3.5 border border-white/40 text-white font-semibold text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer items-center justify-center gap-2"
            >
              <i className="ri-play-circle-line"></i>
              How It Works
            </a>
          </div>

          {/* Mobile-only refund reassurance — centered under the CTA,
              "Full Refund" bolded so the safety-net reads in a single
              glance without re-adding visual clutter above the CTA. */}
          <p className="sm:hidden text-white/85 text-[13px] leading-snug mb-5 text-center">
            <i className="ri-shield-check-line text-orange-300 mr-1.5"></i>
            <strong className="font-bold text-white">Full Refund</strong> if you don&rsquo;t qualify
          </p>

          {/* How-It-Works mini-cards (pre-cleanup) and Provider Credibility
              Strip (pre-cleanup) used to render here. Both removed in the
              2026-05-24 pre-LIVE cleanup — they duplicated the StepsSection
              and DoctorsSection / TrustFeatures sections that sit directly
              below the hero in the decision-journey order. The hero now
              carries: badge, h1, subtitle, single 50-states trust pill,
              one primary CTA + one secondary CTA, and a desktop scroll
              cue at the bottom. Mobile gets the refund line + sticky CTA. */}

        </div>
      </div>

      {/* Calm scroll cue at the bottom of the hero cover. Hidden until sm:
          on mobile the hero already feels full-cover via min-h-[100svh]
          and the sticky apply CTA gives the user a clear next action;
          stacking another cue would crowd the fold. */}
      <a
        href="#how-it-works"
        aria-label="Scroll to see how it works"
        className="hidden sm:flex absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex-col items-center gap-1 text-white/55 hover:text-white/85 transition-colors cursor-pointer"
      >
        <span className="text-[10.5px] uppercase tracking-[0.18em] font-semibold">Scroll to see how it works</span>
        <i className="ri-arrow-down-s-line text-xl leading-none -my-1"></i>
      </a>
    </section>
  );
}
