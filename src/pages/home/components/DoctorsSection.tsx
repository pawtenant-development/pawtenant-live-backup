import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { DOCTORS } from "../../../mocks/doctors";
import { useDeactivatedProviderEmails } from "../../../hooks/useActiveProviders";
import { useDynamicDoctors } from "../../../hooks/useDynamicDoctors";
import type { Doctor } from "../../../mocks/doctors";

const MAX_STATES_SHOWN = 4;

export default function DoctorsSection() {
  const { deactivated } = useDeactivatedProviderEmails();
  const { doctors: dynamicDoctors } = useDynamicDoctors();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Merge static + dynamic, filter deactivated
  const allDoctors: Doctor[] = [
    ...DOCTORS.filter((d) => !deactivated.has(d.email.toLowerCase())),
    ...dynamicDoctors.filter((d) => !deactivated.has(d.email.toLowerCase())),
  ];

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
              Choose Your Doctor
            </h2>
            <p className="text-gray-500 text-sm max-w-xl leading-relaxed">
              Select the licensed mental health professional you&apos;d like to work with. Availability depends on the states where the provider is currently licensed.
            </p>
          </div>
          {/* Scroll controls */}
          {allDoctors.length > 4 && (
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
          {allDoctors.map((doctor) => {
            const visibleStates = doctor.states.slice(0, MAX_STATES_SHOWN);
            const extraCount = doctor.states.length - MAX_STATES_SHOWN;

            return (
              <div
                key={doctor.id}
                className="bg-white rounded-2xl p-6 flex flex-col items-center text-center transition-transform hover:-translate-y-1 duration-200 flex-shrink-0"
                style={{ minWidth: "288px", maxWidth: "288px" }}
              >
                {/* Photo */}
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-orange-100 mb-4 flex-shrink-0 bg-orange-50 flex items-center justify-center">
                  {doctor.image ? (
                    <img
                      src={doctor.image}
                      alt={doctor.name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.parentElement as HTMLElement).setAttribute("data-initials", "true"); }}
                    />
                  ) : (
                    <span className="text-2xl font-extrabold text-orange-400 select-none">
                      {doctor.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </span>
                  )}
                </div>

                {/* Badge */}
                <a
                  href={doctor.verificationUrl}
                  target="_blank"
                  rel="nofollow noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold mb-3 hover:bg-green-100 transition-colors cursor-pointer"
                >
                  <i className="ri-shield-check-line text-green-500"></i>
                  Verified Professional
                </a>

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

        {/* Scroll indicator dots (when more than 4 doctors) */}
        {allDoctors.length > 4 && (
          <div className="flex items-center justify-center gap-1.5 mt-8">
            <div className="text-xs text-gray-400">{allDoctors.length} providers available — scroll to see more</div>
          </div>
        )}
      </div>
    </section>
  );
}
