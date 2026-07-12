import { Link } from "react-router-dom";

/**
 * TopStatesSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Compact link grid replacing the previous heavy image cards (8 large photos
 * cost mobile scroll + bandwidth and added no decision value). ALL internal
 * links and heading wording preserved for SEO:
 *   H2  "ESA Letters by State — Know Your Local Rights"
 *   H3  "{State} ESA Letter Guide" ×8 → /esa-letter/:slug
 *   H3  "Psychiatric Service Dog Letters by State" + 10 PSD pills → /psd-letter/:slug
 *   hub links → /explore-esa-letters-all-states, /how-to-get-psd-letter
 * Section ID #state-guides preserved. Honest CA/AR/IA/LA/MT 30-day note kept
 * (matches the 30-day reopen flow already live in the product).
 *
 * PSD state list mirrors src/mocks/statesPSD.ts (the /psd-letter/:state data
 * source) — kept as a lightweight name/slug list instead of importing the
 * ~42 KB data module into the homepage chunk (PageSpeed). If a new PSD state
 * page is added to statesPSD.ts, add it here too.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const ESA_STATES = [
  { name: "California", slug: "california" },
  { name: "Texas", slug: "texas" },
  { name: "Florida", slug: "florida" },
  { name: "New York", slug: "new-york" },
  { name: "North Carolina", slug: "north-carolina" },
  { name: "Pennsylvania", slug: "pennsylvania" },
  { name: "Virginia", slug: "virginia" },
  { name: "Illinois", slug: "illinois" },
];

const PSD_STATES = [
  { name: "Arizona", slug: "arizona" },
  { name: "California", slug: "california" },
  { name: "Florida", slug: "florida" },
  { name: "Georgia", slug: "georgia" },
  { name: "Illinois", slug: "illinois" },
  { name: "New York", slug: "new-york" },
  { name: "North Carolina", slug: "north-carolina" },
  { name: "Ohio", slug: "ohio" },
  { name: "Pennsylvania", slug: "pennsylvania" },
  { name: "Texas", slug: "texas" },
];

export default function TopStatesSection() {
  return (
    <section id="state-guides" className="py-14 sm:py-20 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <p className="text-[#4A8472] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
          Coverage
        </p>
        <h2
          className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight mb-2"
          style={FONT_DISPLAY}
        >
          ESA Letters by State — Know Your Local Rights
        </h2>
        <p className="text-[#6B6359] text-[15.5px] sm:text-base leading-relaxed max-w-xl">
          Requirements differ by state. Our providers are licensed where you live, and your letter
          follows your state&rsquo;s rules.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 mt-7 mb-2">
          {ESA_STATES.map((s) => (
            <Link
              key={s.slug}
              to={`/esa-letter/${s.slug}`}
              className="flex items-center justify-between bg-white border border-[#EAE3D7] rounded-xl px-4 py-3.5 hover:border-[#B5AC9F] transition-colors"
            >
              <h3 className="text-sm font-extrabold text-[#231F1A]">
                {s.name}
                <span className="sr-only"> ESA Letter Guide</span>
              </h3>
              <i className="ri-arrow-right-line text-[#B5AC9F]" aria-hidden></i>
            </Link>
          ))}
        </div>

        <h3 className="text-[15px] font-extrabold text-[#231F1A] mt-7 mb-3">
          Psychiatric Service Dog Letters by State
        </h3>
        <div className="flex flex-wrap gap-2">
          {PSD_STATES.map((s) => (
            <Link
              key={s.slug}
              to={`/psd-letter/${s.slug}`}
              className="inline-flex items-center min-h-[44px] bg-white border border-[#EAE3D7] rounded-full px-4 py-2.5 text-[13px] font-bold text-[#4A443C] hover:border-[#B5AC9F] transition-colors"
            >
              {s.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-7">
          <Link
            to="/explore-esa-letters-all-states"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white border-[1.5px] border-[#DCD2C0] text-[#231F1A] font-extrabold text-[14.5px] rounded-xl hover:border-[#B5AC9F] transition-colors"
          >
            Explore ESA State Guides — All 50 States &amp; DC
            <i className="ri-arrow-right-line" aria-hidden></i>
          </Link>
          <Link
            to="/how-to-get-psd-letter"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white border-[1.5px] border-[#DCD2C0] text-[#231F1A] font-extrabold text-[14.5px] rounded-xl hover:border-[#B5AC9F] transition-colors"
          >
            Explore PSD State Guides &amp; How It Works
          </Link>
        </div>

        <p className="text-[12.5px] text-[#6B6359] leading-relaxed mt-5 max-w-2xl">
          <b className="text-[#231F1A]">Honest note:</b> California, Arkansas, Iowa, Louisiana and
          Montana require a 30-day provider relationship before an ESA letter can be issued. We handle
          that for you — your provider relationship starts at your assessment, and your letter is
          issued the moment it&rsquo;s legally allowed.
        </p>
      </div>
    </section>
  );
}
