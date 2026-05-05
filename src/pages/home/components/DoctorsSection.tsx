import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { DOCTORS } from "../../../mocks/doctors";
import { useDynamicDoctors } from "../../../hooks/useDynamicDoctors";
import type { Doctor } from "../../../mocks/doctors";

const MAX_STATES_SHOWN = 4;
const SKELETON_COUNT = 4;

export default function DoctorsSection() {
  const { doctors: dynamicDoctors, loading, hasProviderRows } = useDynamicDoctors();
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
    checkScroll();
    const el = scrollRef.current;
    el?.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el?.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [allDoctors.length]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 288 + 24; // card min-w + gap
    el.scrollBy({ left: dir === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" });
  };

  return (
    <section className="py-20 bg-[#f8f7f4]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
              Choose Your Provider
            </h2>
            <p className="text-gray-500 text-sm max-w-xl leading-relaxed">
              Select the licensed mental health professional you&apos;d like to work with. Availability depends on the states where the provider is currently licensed.
            </p>
          </div>
          {/* Scroll controls */}
          {showScrollControls && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                className={`whitespace-nowrap w-10 h-10 flex items-center justify-center rounded-full border transition-all cursor-pointer ${canScrollLeft ? "border-gray-300 text-gray-700 hover:bg-white" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-arrow-left-s-line text-lg"></i>
              </button>
              <button
                type="button"
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                className={`whitespace-nowrap w-10 h-10 flex items-center justify-center rounded-full border transition-all cursor-pointer ${canScrollRight ? "border-gray-300 text-gray-700 hover:bg-white" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}
              >
                <i className="ri-arrow-right-s-line text-lg"></i>
              </button>
            </div>
          )}
        </div>

        {/* Scrollable row */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {showSkeleton
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="bg-white rounded-2xl p-6 flex flex-col items-center text-center flex-shrink-0 animate-pulse"
                  style={{ minWidth: "288px", maxWidth: "288px" }}
                >
                  <div className="w-24 h-24 rounded-full bg-orange-50 mb-4" />
                  <div className="h-3 w-20 rounded-full bg-gray-100 mb-3" />
                  <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded mb-4" />
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-3/4 bg-gray-100 rounded mb-5" />
                  <div className="w-full mb-5">
                    <div className="h-2 w-16 bg-gray-100 rounded mb-2" />
                    <div className="flex gap-1.5">
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                      <div className="h-5 w-10 bg-gray-100 rounded-full" />
                    </div>
                  </div>
                  <div className="mt-auto w-full flex flex-col gap-2">
                    <div className="h-9 w-full bg-gray-200 rounded-xl" />
                    <div className="h-9 w-full bg-gray-100 rounded-xl" />
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
                    className="bg-white rounded-2xl p-6 flex flex-col items-center text-center transition-transform hover:-translate-y-1 duration-200 flex-shrink-0"
                    style={{ minWidth: "288px", maxWidth: "288px" }}
                  >
                    {/* Photo — real uploaded photo OR neutral initials fallback */}
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-orange-100 mb-4 flex-shrink-0 bg-orange-50 flex items-center justify-center">
                      {hasValidImage ? (
                        <img
                          src={doctor.image}
                          alt={doctor.name}
                          className="w-full h-full object-cover object-top"
                          onError={() => markImageBroken(doctor.id)}
                        />
                      ) : (
                        <span className="text-2xl font-extrabold text-orange-400 select-none">
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
                    <p className="text-orange-500 font-semibold text-xs mb-3">
                      {doctor.title} — {doctor.role}
                    </p>

                    {/* Bio */}
                    <p className="text-gray-500 text-xs leading-relaxed mb-5 line-clamp-3">{doctor.bio}</p>

                    {/* Licensed In */}
                    <div className="w-full text-left mb-5">
                      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Licensed In</p>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleStates.map((state) => (
                          <span key={state} className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium">
                            {state}
                          </span>
                        ))}
                        {extraCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-xs font-medium">
                            +{extraCount} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CTAs */}
                    <div className="mt-auto w-full flex flex-col gap-2">
                      <Link
                        to={`/doctors/${doctor.id}`}
                        className="whitespace-nowrap w-full py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer text-center block"
                      >
                        View Profile
                      </Link>
                      <Link
                        to={`/assessment?doctor=${doctor.id}`}
                        className="whitespace-nowrap w-full py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer text-center block"
                      >
                        Book Consultation
                      </Link>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
