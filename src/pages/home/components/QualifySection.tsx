import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * QualifySection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Self-identification (condition checklist) + registry myth-bust (owns the
 * converting "register my dog" search intent while disqualifying registry-scam
 * shoppers) + the SEO-preserved ESA definition block
 * ("What Is an Emotional Support Animal (ESA)?" — H2 kept verbatim).
 *
 * Owner correction E: the cat image is a new high-resolution licensed stock
 * photo (Freepik premium, author "New Africa", item 38688883 — downloaded via
 * the connected account) delivered as responsive WebP with JPEG fallback.
 * Rendered on mobile AND desktop.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const CONDITIONS = ["Anxiety", "Depression", "PTSD", "Panic disorder", "Chronic stress", "Other conditions"];

export default function QualifySection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section className="py-14 sm:py-20 bg-[#F7F2E9]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-14 items-stretch">
        <div>
          <p className="text-[#6B6359] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            Do I Qualify?
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight mb-4"
            style={FONT_DISPLAY}
          >
            Do You Qualify for an ESA Letter?
          </h2>
          <p className="text-[#6B6359] text-[15.5px] sm:text-base leading-relaxed max-w-xl">
            If you live with any of these — and your pet helps you cope — you may qualify. A licensed
            clinician makes the final call, and most people find out within a day.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-6">
            {CONDITIONS.map((c) => (
              <div
                key={c}
                className="flex items-center gap-2.5 bg-white border border-[#EAE3D7] rounded-xl px-3.5 py-3 text-[13.5px] font-bold text-[#4A443C]"
              >
                <i className="ri-checkbox-circle-fill text-[#4A8472]" aria-hidden></i>
                {c}
              </div>
            ))}
          </div>

          {/* Registry myth-bust */}
          <div className="mt-6 bg-white border border-[#EAE3D7] border-l-4 border-l-[#4A8472] rounded-xl px-5 py-5">
            <h3 className="text-[15px] font-extrabold text-[#231F1A] mb-1.5">
              Don&rsquo;t pay for fake &ldquo;ESA registries&rdquo;
            </h3>
            <p className="text-[13.5px] text-[#6B6359] leading-relaxed">
              There is <b className="text-[#231F1A]">no official ESA registry</b> in the U.S. Sites
              selling &ldquo;registration&rdquo; or &ldquo;certificates&rdquo; are selling paper with
              no legal standing. Under the Fair Housing Act, what counts is{" "}
              <b className="text-[#231F1A]">a letter from a licensed mental health professional</b> —
              which is exactly what this is.
            </p>
          </div>

          {/* ESA definition — SEO H2 preserved verbatim. */}
          <div className="mt-6">
            <h2 className="text-[19px] font-extrabold text-[#231F1A] mb-2">
              What Is an Emotional Support Animal (ESA)?
            </h2>
            <p className="text-[13.5px] text-[#6B6359] leading-relaxed max-w-xl">
              An ESA is a companion animal that provides therapeutic benefit for a mental or emotional
              condition. Unlike service animals, ESAs need no special training — and with a valid
              letter, they&rsquo;re protected in housing under the Fair Housing Act.{" "}
              <Link
                to="/how-to-get-esa-letter"
                className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]"
              >
                Read the full ESA guide →
              </Link>
            </p>
          </div>

          <div className="mt-7">
            <a
              href={withAttribution("/assessment")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-extrabold text-base rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-lg shadow-orange-500/25"
            >
              Check If You Qualify
              <i className="ri-arrow-right-line" aria-hidden></i>
            </a>
            <p className="text-[#6B6359] text-[13px] font-semibold mt-3 flex items-center gap-1.5">
              <i className="ri-checkbox-circle-fill text-[#4A8472]" aria-hidden></i>
              Free to start · refund if you don&rsquo;t qualify
            </p>
          </div>
        </div>

        {/* Photo — visible on all viewports (owner: images on mobile too). */}
        <div className="rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(35,31,26,0.05),0_10px_30px_-14px_rgba(35,31,26,0.14)]">
          {/* Responsive crops from the same licensed original: wide frame on
              mobile/tablet, dedicated 3:4 face-centered crop on the tall
              desktop column so the cat's face and ears are never cut. */}
          <picture>
            <source
              media="(min-width: 1024px)"
              srcSet="/assets/lifestyle/esa-cat-relaxing-home-tall.webp"
              type="image/webp"
            />
            <source
              media="(max-width: 640px)"
              srcSet="/assets/lifestyle/esa-cat-relaxing-home-sm.webp"
              type="image/webp"
            />
            <source srcSet="/assets/lifestyle/esa-cat-relaxing-home.webp" type="image/webp" />
            <img
              src="/assets/lifestyle/esa-cat-relaxing-home.jpg"
              alt="Cat relaxing on a blanket by a sunny apartment window"
              width={1200}
              height={800}
              loading="lazy"
              decoding="async"
              className="w-full h-56 sm:h-72 lg:h-full lg:min-h-[420px] object-cover object-[70%_42%] lg:object-top"
            />
          </picture>
        </div>
      </div>
    </section>
  );
}
