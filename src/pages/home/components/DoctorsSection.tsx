import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PUBLIC_PROVIDERS, HOMEPAGE_PROVIDER_SLUGS, getPublicProvider } from "../../../data/publicProviders";

const MAX_STATES_SHOWN = 4;

// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001.
// The homepage provider carousel is driven by the OWNER-CURATED approved set
// (the same eight as /doctors and /our-providers) with CONTROLLED images —
// existing repo photos for the four flagship providers, branded initials for the
// four new providers. It is intentionally NOT the DB-published roster:
// unapproved providers (e.g. admin-only records) and not-yet-vetted provider
// photos must never surface here. Fail-closed: only the curated eight render.
const HOMEPAGE_PROVIDERS = HOMEPAGE_PROVIDER_SLUGS
  .map((s) => getPublicProvider(s))
  .filter((p): p is NonNullable<typeof p> => p !== null);

export default function DoctorsSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // A flagship photo that fails to load falls back to neutral initials rather
  // than an empty circle. New providers have no image and always show initials.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const providers = PUBLIC_PROVIDERS;
  const showScrollControls = providers.length > 4;

  const markImageBroken = (slug: string) => {
    setBrokenImages((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  };

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    const rafId = window.requestAnimationFrame(checkScroll);
    const el = scrollRef.current;
    el?.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(rafId);
      el?.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 260 + 24; // card min-w + gap (mobile-tighter)
    el.scrollBy({ left: dir === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" });
  };

  return (
    <section className="py-12 sm:py-20 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* Header — CRO redesign 2026-07-11: providers shown as credibility
            (checkable credentials), not a mid-funnel choice; per-card CTAs
            removed so the assessment stays the single conversion path. */}
        <div className="flex items-end justify-between mb-8 sm:mb-12 flex-wrap gap-4">
          <div className="max-w-xl">
            <p className="text-[#4A8472] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
              Real Clinicians
            </p>
            <h2
              className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] mb-2 sm:mb-3 leading-tight"
              style={{ fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' }}
            >
              Meet the Licensed Professionals
            </h2>
            <p className="text-[#6B6359] text-[14px] sm:text-base leading-relaxed">
              Every letter is reviewed and signed by a licensed mental health professional — with a public license record you can check yourself.
            </p>
          </div>
          {/* Scroll controls */}
          {showScrollControls && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                aria-label="Scroll provider list left"
                className={`whitespace-nowrap w-10 h-10 flex items-center justify-center rounded-full border transition-all cursor-pointer ${canScrollLeft ? "border-gray-300 text-gray-700 hover:bg-white" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-arrow-left-s-line text-lg" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                aria-label="Scroll provider list right"
                className={`whitespace-nowrap w-10 h-10 flex items-center justify-center rounded-full border transition-all cursor-pointer ${canScrollRight ? "border-gray-300 text-gray-700 hover:bg-white" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-arrow-right-s-line text-lg" aria-hidden="true"></i>
              </button>
            </div>
          )}
        </div>

        {/* Scrollable row — mobile-first: snap-scroll + smaller gap + slight
            negative margin so the card edge sits flush with the page padding
            and the next card peeks in on phones (cues swipeability). */}
        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory -mx-5 sm:mx-0 px-5 sm:px-0 pb-2 sm:pb-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {providers.map((p) => {
            const visibleStates = p.states.slice(0, MAX_STATES_SHOWN);
            const extraCount = p.states.length - MAX_STATES_SHOWN;
            const initials = p.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
            const showImage = !!p.image && !brokenImages.has(p.slug);

            return (
              <div
                key={p.slug}
                className="bg-white rounded-2xl p-5 sm:p-6 flex flex-col items-center text-center border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 duration-200 flex-shrink-0 snap-start"
                style={{ minWidth: "260px", maxWidth: "260px" }}
              >
                {/* Photo — flagship repo photo OR neutral initials (new providers) */}
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-200 mb-4 flex-shrink-0 bg-slate-50 flex items-center justify-center">
                  {showImage && p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover object-top"
                      onError={() => markImageBroken(p.slug)}
                    />
                  ) : (
                    <span className="text-2xl font-extrabold text-slate-500 select-none">
                      {initials}
                    </span>
                  )}
                </div>

                {/* NPI badge — the public verification signal (CMS NPPES). */}
                {p.npi && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
                    <a
                      href={`https://npiregistry.cms.hhs.gov/search?number=${p.npi}`}
                      target="_blank"
                      rel="nofollow noreferrer"
                      title={`NPI # ${p.npi} — verified via CMS NPPES`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF7ED] border border-orange-200 text-[#92400e] text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
                    >
                      <i className="ri-medal-line text-[#92400e] text-xs"></i>
                      NPI Verified
                    </a>
                  </div>
                )}

                {/* Name & Title */}
                <h3 className="text-gray-900 font-bold text-base leading-snug mb-1">{p.name}</h3>
                <p className="text-[#4A8472] font-semibold text-xs mb-3">
                  {p.title} — {p.role}
                </p>

                {/* Licensed In — credibility, no per-card conversion forks. */}
                <div className="w-full text-left mt-auto">
                  <p className="text-[#B5AC9F] text-xs font-bold uppercase tracking-widest mb-2">Licensed In</p>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleStates.map((state) => (
                      <span key={state} className="px-2 py-0.5 rounded-full bg-[#F7F2E9] border border-[#EAE3D7] text-[#4A443C] text-xs font-medium">
                        {state}
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#EDF4F0] border border-[#D6E5DF] text-[#3F7061] text-xs font-semibold">
                        +{extraCount} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Curated provider links — clean canonical links (incl. Eve Rosno) + directory. */}
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          {HOMEPAGE_PROVIDERS.map((p) => (
            <Link
              key={p.slug}
              to={`/doctors/${p.slug}`}
              className="text-[#4A8472] font-semibold hover:underline whitespace-nowrap"
            >
              {p.name}
            </Link>
          ))}
          <Link
            to="/our-providers"
            className="text-[#231F1A] font-bold hover:text-[#4A8472] whitespace-nowrap"
          >
            See all our providers &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
