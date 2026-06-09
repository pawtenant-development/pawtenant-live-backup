// HUD 2026 ESA enforcement-change notice — reusable, state-aware, compliance-safe.
//
// Context: On 2026-05-22 HUD/FHEO rescinded its prior ESA guidance and now
// pursues accommodation complaints only where the animal is individually
// trained to perform disability-related work/tasks (ADA service-animal
// standard). The Fair Housing Act itself is unchanged: blanket denials are
// still off-limits, individualized review is still required, state law / housing
// type / private legal rights may still matter. See
// docs/hud-2026-esa-compliance-notes.md for sources + approved wording.
//
// Wording here is deliberately cautious. Do NOT add guarantees, "HUD approved",
// "landlords must accept", or "ESAs are no longer legal" framing.
//
// Branding: PawTenant orange / warm cream / dark navy text with subtle orange
// borders — a trust/compliance section, NOT a cold government warning.
//
// Variants:
//   "full"    — richer warm-cream section for public/SEO pages (2 CTAs).
//   "compact" — slim inline note for the assessment funnel (Step 2 / Step 3).
//
// Icon note: only uses ri-* glyphs already present in the build subset
// (public/assets/remixicon-subset.css). Do not introduce new glyphs here
// without regenerating the subset.

import { Link } from "react-router-dom";
import { normalizeStateToCode, US_STATE_CODE_TO_NAME } from "../../lib/usStates";

export const HUD_UPDATE_PATH = "/are-esa-letters-still-valid-after-hud-change";

// Map a canonical 2-letter code to its /esa-letter/<slug> guide slug.
// All 50 state names slugify by lowercasing + hyphenating; DC is the only
// special case (stored name "District of Columbia", guide slug "washington-dc").
function stateGuideSlug(code: string): string {
  if (code === "DC") return "washington-dc";
  const name = US_STATE_CODE_TO_NAME[code];
  return name ? name.toLowerCase().replace(/\s+/g, "-") : "";
}

interface Hud2026UpdateBannerProps {
  /** 2-letter code OR full state name. When recognized, a state-aware line +
   *  link to that state's ESA guide are shown. Optional. */
  state?: string | null;
  variant?: "full" | "compact";
  /** "esa" (default) or "psd" — swaps the full-variant copy + secondary CTA to
   *  PSD/trained-task framing for service-dog pages. */
  audience?: "esa" | "psd";
  className?: string;
}

export default function Hud2026UpdateBanner({
  state,
  variant = "full",
  audience = "esa",
  className = "",
}: Hud2026UpdateBannerProps) {
  const code = normalizeStateToCode(state ?? "");
  const stateName = code ? US_STATE_CODE_TO_NAME[code] : null;
  const slug = code ? stateGuideSlug(code) : "";
  const isPsd = audience === "psd";

  if (variant === "compact") {
    return (
      <div
        role="note"
        aria-label="2026 housing update"
        className={`rounded-xl border border-orange-200 bg-[#fdf6ee] px-4 py-3.5 flex items-start gap-3 ${className}`}
      >
        <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5 ring-1 ring-orange-200">
          <i className="ri-government-line text-orange-600 text-base"></i>
        </div>
        <div className="min-w-0 text-gray-700">
          <p className="text-xs font-bold leading-snug text-gray-900">2026 Support Animal Housing Update</p>
          <p className="text-[11px] mt-1 leading-relaxed">
            HUD's federal enforcement approach for untrained emotional support animals changed in
            2026. {stateName ? <><strong className="text-gray-900">{stateName}</strong> state law and your housing type</> : <>State law and your housing type</>}{" "}
            may still matter. Your licensed provider evaluates whether documentation may be
            clinically appropriate — approval is not guaranteed.
          </p>
        </div>
      </div>
    );
  }

  // ── full ─────────────────────────────────────────────────────────────────
  return (
    <section
      aria-label="2026 HUD support animal update"
      className={`py-12 sm:py-16 ${className}`}
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-6">
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-[#fff7ed] via-[#fdf6ee] to-white p-6 md:p-8 shadow-[0_8px_30px_-12px_rgba(122,78,45,0.18)]">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0 ring-1 ring-orange-200">
              <i className="ri-government-line text-orange-600 text-2xl"></i>
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-600 bg-white border border-orange-200 rounded-full px-2.5 py-0.5 mb-3">
                2026 Update
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2.5 leading-tight">
                {isPsd
                  ? "The trained-task distinction matters more in 2026"
                  : "Support animal housing rules changed in 2026"}
              </h2>
              {isPsd ? (
                <p className="text-[13.5px] sm:text-sm text-gray-600 leading-relaxed mb-5 max-w-2xl">
                  The 2026 HUD update makes the <strong className="text-gray-800">trained-task
                  distinction</strong> more important for housing accommodation requests. PawTenant
                  does not train, register, or certify service animals. If your animal is trained to
                  perform disability-related tasks, a licensed provider may evaluate whether
                  documentation is clinically appropriate.
                </p>
              ) : (
                <p className="text-[13.5px] sm:text-sm text-gray-600 leading-relaxed mb-5 max-w-2xl">
                  HUD's federal enforcement approach changed, but <strong className="text-gray-800">state
                  law, housing type, Section 504, private legal rights, and individual facts may still
                  matter</strong>. PawTenant helps customers understand their options through licensed,
                  state-aware support-animal documentation — issued only when clinically appropriate.{" "}
                  {stateName && (
                    <>Rules in <strong className="text-gray-800">{stateName}</strong> may differ from the federal baseline.</>
                  )}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Link
                  to={HUD_UPDATE_PATH}
                  className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold text-[13.5px] sm:text-sm rounded-md hover:bg-orange-600 transition-colors shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-article-line"></i> Read the 2026 HUD Update
                </Link>
                {isPsd ? (
                  <Link
                    to="/how-to-get-psd-letter"
                    className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-700 font-semibold text-[13.5px] sm:text-sm rounded-md border border-orange-300 hover:bg-orange-50 transition-colors"
                  >
                    <i className="ri-shield-star-line"></i> How a PSD letter works
                  </Link>
                ) : slug ? (
                  <Link
                    to={`/esa-letter/${slug}`}
                    className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-700 font-semibold text-[13.5px] sm:text-sm rounded-md border border-orange-300 hover:bg-orange-50 transition-colors"
                  >
                    <i className="ri-map-pin-line"></i> {stateName} ESA Guide
                  </Link>
                ) : (
                  <Link
                    to="/esa-laws"
                    className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-700 font-semibold text-[13.5px] sm:text-sm rounded-md border border-orange-300 hover:bg-orange-50 transition-colors"
                  >
                    <i className="ri-scales-3-line"></i> Check ESA Laws by State
                  </Link>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-4 leading-relaxed max-w-2xl">
                Educational information only — not legal advice. PawTenant does not certify or train
                service animals, and approval depends on your housing provider, state law, housing
                type, and individual facts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
