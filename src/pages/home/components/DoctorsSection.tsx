import { useRef, useState, useEffect } from "react";
import { DOCTORS } from "../../../mocks/doctors";
import { useDynamicDoctors } from "../../../hooks/useDynamicDoctors";
import type { Doctor } from "../../../mocks/doctors";

const MAX_STATES_SHOWN = 4;
const SKELETON_COUNT = 4;

export default function DoctorsSection() {
  // Section root — used by the IntersectionObserver below to defer the
  // three provider Supabase queries (doctor_profiles, approved_providers,
  // doctor_contacts) and the carousel scroll measurement until the section
  // is close to the viewport. The section shell itself still renders on
  // first paint so Speed Index and visual completeness are unaffected.
  const sectionRef = useRef<HTMLElement | null>(null);

  // `nearViewport` flips true once the section is within ~one viewport of
  // entering the screen. Until then the hook below stays inert so the
  // three provider REST calls never fire in the LCP path — PageSpeed had
  // flagged this exact source as the 142 ms forced-reflow.
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // No IO support (rare) — fall back to immediate enable so legacy
      // browsers and Googlebot WRS still see provider data.
      setNearViewport(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNearViewport(true);
            io.disconnect();
            break;
          }
        }
      },
      // ~one full mobile viewport of lead-time so provider data is ready
      // by the time the user scrolls the section into view — no skeleton
      // flash for real users, but no upfront cost on first paint.
      { rootMargin: "0px 0px 800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { doctors: dynamicDoctors, loading, hasProviderRows } = useDynamicDoctors({ enabled: nearViewport });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // Per-card image error tracking — a card with a broken photo URL renders
  // the neutral initials fallback instead of an empty orange circle.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const byEmail = new Map<string, Doctor>();

  // Static DOCTORS fallback only seeds once we are CERTAIN the DB has no real
  // providers (loading finished AND no provider rows exist). Doing this during
  // the loading window caused a static→dynamic swap on first paint — the
  // homepage flicker / "two sliders fighting" symptom.
  if (!loading && !hasProviderRows) {
    for (const d of DOCTORS) {
      const key = d.email.trim().toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, d);
      }
    }
  }

  for (const d of dynamicDoctors) {
    const key = d.email.trim().toLowerCase();
    byEmail.set(key, d); // DB overrides static (only relevant when fallback is allowed)
  }

  // Homepage visibility rule (Phase 4 final):
  //   * is_published (enforced in useDynamicDoctors) → shown
  //   * PUBLIC_HIDDEN_PROVIDER_EMAILS blocklist (enforced in useDynamicDoctors) → hidden
  //   * is_active / availability → NOT used here (that controls assignment only).
  const allDoctors: Doctor[] = Array.from(byEmail.values());

  const showSkeleton = loading && allDoctors.length === 0;
  const showScrollControls = !showSkeleton && allDoctors.length > 4;

  const markImageBroken = (id: string) => {
    setBrokenImages((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
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
    // Don't run the carousel layout read or attach listeners until the
    // section is near the viewport. This is the path PageSpeed flagged
    // as "Forced reflow ~142 ms" — checkScroll() reads scrollWidth /
    // clientWidth, which forces a layout if it runs during initial
    // render. By gating on nearViewport, the measurement runs after
    // LCP and only when the user can actually see the section.
    if (!nearViewport) return;
    // Defer the first measurement one frame so any pending layout
    // settles first (avoids the layout-read-after-write pattern that
    // creates the forced reflow).
    const rafId = window.requestAnimationFrame(checkScroll);
    const el = scrollRef.current;
    el?.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll, { passive: true } as AddEventListenerOptions);
    return () => {
      window.cancelAnimationFrame(rafId);
      el?.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [allDoctors.length, nearViewport]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 260 + 24; // card min-w + gap (mobile-tighter)
    el.scrollBy({ left: dir === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="py-12 sm:py-20 bg-[#FDFBF7]">
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
          {showSkeleton
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="bg-white rounded-2xl p-5 sm:p-6 flex flex-col items-center text-center border border-gray-100 shadow-sm flex-shrink-0 snap-start animate-pulse"
                  style={{ minWidth: "260px", maxWidth: "260px" }}
                >
                  <div className="w-24 h-24 rounded-full bg-slate-50 mb-4" />
                  <div className="h-3 w-20 rounded-full bg-gray-100 mb-3" />
                  <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded mb-4" />
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-3/4 bg-gray-100 rounded mb-5" />
                  <div className="w-full mt-auto">
                    <div className="h-2 w-16 bg-gray-100 rounded mb-2" />
                    <div className="flex gap-1.5">
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                    </div>
                  </div>
                </div>
              ))
            : allDoctors.map((doctor) => {
                const visibleStates = doctor.states.slice(0, MAX_STATES_SHOWN);
                const extraCount = doctor.states.length - MAX_STATES_SHOWN;
                const initials = doctor.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                const hasValidImage = !!doctor.image && !brokenImages.has(doctor.id);

                return (
                  <div
                    key={doctor.id}
                    className="bg-white rounded-2xl p-5 sm:p-6 flex flex-col items-center text-center border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 duration-200 flex-shrink-0 snap-start"
                    style={{ minWidth: "260px", maxWidth: "260px" }}
                  >
                    {/* Photo — real uploaded photo OR neutral initials fallback */}
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-200 mb-4 flex-shrink-0 bg-slate-50 flex items-center justify-center">
                      {hasValidImage ? (
                        <img
                          src={doctor.image}
                          alt={doctor.name}
                          width={96}
                          height={96}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-top"
                          onError={() => markImageBroken(doctor.id)}
                        />
                      ) : (
                        <span className="text-2xl font-extrabold text-slate-500 select-none">
                          {initials}
                        </span>
                      )}
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
                      <a
                        href={doctor.verificationUrl}
                        target="_blank"
                        rel="nofollow noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors cursor-pointer"
                      >
                        <i className="ri-shield-check-line text-green-500"></i>
                        Verified
                      </a>
                      {doctor.npi_number && (
                        <a
                          href={`https://npiregistry.cms.hhs.gov/search?number=${doctor.npi_number}`}
                          target="_blank"
                          rel="nofollow noreferrer"
                          title={`NPI # ${doctor.npi_number} — verified via CMS NPPES`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF7ED] border border-orange-200 text-[#92400e] text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer"
                        >
                          <i className="ri-medal-line text-[#92400e] text-xs"></i>
                          NPI Verified
                        </a>
                      )}
                    </div>

                    {/* Name & Title */}
                    <h3 className="text-gray-900 font-bold text-base leading-snug mb-1">{doctor.name}</h3>
                    <p className="text-[#4A8472] font-semibold text-xs mb-3">
                      {doctor.title} — {doctor.role}
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
      </div>
    </section>
  );
}
