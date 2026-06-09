// Homepage 2026 HUD update section — calm, brand-styled, below-the-fold.
//
// Intentionally NOT in the hero and NOT a scary legal block: a warm, reassuring
// "rules changed, we'll help you understand your options" section that links to
// the full explainer and the assessment. Lazy-loaded with the rest of the
// below-fold tree (see home/page.tsx showBelow), so it adds no above-the-fold
// PageSpeed cost.
//
// Compliance-safe: HUD's enforcement approach changed (not "ESAs are illegal"),
// state law / housing type may still matter, approval not guaranteed, PawTenant
// does not certify or train service animals. See
// docs/hud-2026-esa-compliance-notes.md.
//
// Icons: only ri-* glyphs already present in the build subset.

import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const points = [
  {
    icon: "ri-map-pin-line",
    title: "State-aware",
    desc: "Your state, housing type, and individual facts may still matter.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Licensed telehealth",
    desc: "A licensed provider evaluates whether documentation is clinically appropriate.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Honest expectations",
    desc: "Approval is never guaranteed, and we don't certify or train service animals.",
  },
];

export default function HudUpdateSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section
      aria-label="2026 HUD support animal update"
      className="py-14 sm:py-20 bg-[#fdf6ee] border-y border-orange-100"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">
          {/* Left — message + CTAs */}
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 mb-4">
              <i className="ri-government-line"></i> 2026 Update
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              Support animal housing rules changed.
              <br className="hidden sm:block" /> We&rsquo;ll help you understand your options.
            </h2>
            <p className="text-[14px] sm:text-base text-gray-600 leading-relaxed mb-6 max-w-xl">
              HUD&rsquo;s federal enforcement approach for untrained ESAs changed in 2026 — but that
              does not mean support animals stopped mattering. State law, housing type, Section 504,
              private legal rights, and your individual facts may still affect your options.
              PawTenant provides licensed, state-aware telehealth evaluations and support-animal
              documentation when clinically appropriate.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Link
                to="/are-esa-letters-still-valid-after-hud-change"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3.5 bg-orange-500 text-white font-semibold text-[14px] sm:text-sm rounded-md hover:bg-orange-600 transition-colors shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-article-line"></i> Read the 2026 HUD Update
              </Link>
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3.5 bg-white text-gray-800 font-semibold text-[14px] sm:text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors"
              >
                <i className="ri-file-text-line"></i> Start ESA Assessment
              </Link>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed max-w-xl">
              Educational information only — not legal advice. Approval is not guaranteed.
            </p>
          </div>

          {/* Right — calm trust card */}
          <div className="bg-white rounded-2xl border border-orange-100 p-6 shadow-[0_8px_30px_-12px_rgba(122,78,45,0.15)]">
            <ul className="space-y-4">
              {points.map((p) => (
                <li key={p.title} className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <i className={`${p.icon} text-orange-500 text-lg`}></i>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{p.title}</p>
                    <p className="text-[12.5px] text-gray-600 leading-relaxed">{p.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
