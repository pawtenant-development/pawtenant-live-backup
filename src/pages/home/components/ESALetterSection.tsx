import { useEffect, useRef, useState } from "react";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const SAMPLE_IMG = "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8496bb5f-3256-4901-86f7-84bbb2ec3596_PawTenant-ESA-document-with-callouts.png?v=56e54caa565cc010fb19c7679d66a2b4";

const badges = [
  { icon: "ri-shield-check-fill", label: "Legally Compliant", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
  { icon: "ri-medal-fill", label: "LMHP Signed", color: "text-orange-500", bg: "bg-orange-50 border-orange-100" },
  { icon: "ri-time-fill", label: "24hr Delivery", color: "text-sky-500", bg: "bg-sky-50 border-sky-100" },
  { icon: "ri-home-heart-fill", label: "Fair Housing Act", color: "text-rose-500", bg: "bg-rose-50 border-rose-100" },
];

export default function ESALetterSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { withAttribution } = useAttributionParams();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-8");
          }
        });
      },
      { threshold: 0.15 }
    );
    const els = sectionRef.current?.querySelectorAll(".animate-reveal");
    els?.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    if (lightboxOpen) {
      document.addEventListener("keydown", handler);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  return (
    <section ref={sectionRef} className="py-24 bg-[#fdf8f3] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <div className="text-center mb-16 animate-reveal opacity-0 translate-y-8 transition-all duration-700">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
            What's Inside
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Your Official ESA Letter from PawTenant
          </h2>
          <p className="text-gray-500 text-base max-w-2xl mx-auto leading-relaxed">
            Every letter we issue is legally compliant, signed by a licensed mental health professional, and includes all the details your landlord needs.
          </p>
        </div>

        {/* Letter Showcase */}
        <div className="animate-reveal opacity-0 translate-y-8 transition-all duration-700 delay-200">

          {/* Floating Badges Row */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {badges.map((b) => (
              <div key={b.label} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${b.bg}`}>
                <div className={`w-4 h-4 flex items-center justify-center ${b.color}`}>
                  <i className={`${b.icon} text-base`}></i>
                </div>
                <span className="text-gray-700 whitespace-nowrap">{b.label}</span>
              </div>
            ))}
          </div>

          {/* Image Stage */}
          <div className="relative max-w-2xl mx-auto">

            {/* Letter card */}
            <div
              className="relative rounded-2xl overflow-hidden cursor-zoom-in group"
              style={{ boxShadow: "0 4px 0 0 #f97316, 0 24px 64px -8px rgba(122,78,45,0.22), 0 8px 24px -4px rgba(0,0,0,0.10)" }}
              onClick={() => setLightboxOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setLightboxOpen(true)}
              aria-label="View annotated sample ESA letter with key sections highlighted"
            >
              {/* Sample badge */}
              <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                Sample
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 pointer-events-none">
                <div className="flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                  <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full">
                    <i className="ri-zoom-in-line text-orange-500 text-xl"></i>
                  </div>
                  <span className="text-white text-sm font-semibold tracking-wide">View Sample</span>
                </div>
              </div>

              <img
                src={SAMPLE_IMG}
                alt="PawTenant ESA Letter sample document with callouts highlighting licensed provider signature, NPI number, and patient details"
                className="w-full h-auto object-top block"
              />
            </div>

            {/* Bottom caption */}
            <p className="text-center text-xs text-gray-400 mt-4 tracking-wide">
              Sample ESA letter — your letter will include your name, pet, and licensed provider details
            </p>
          </div>
        </div>

        {/* Included features */}
        <div className="mt-16 animate-reveal opacity-0 translate-y-8 transition-all duration-700 delay-400">
          <div className="bg-white rounded-2xl p-8 border border-orange-100/60">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-gray-900">
                Included with Your ESA Letter from PawTenant
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                "Thorough evaluation by licensed mental health professionals",
                "Legally enforced for rentals, vacation homes, and college dorms",
                "Compliant with Fair Housing Act for housing",
                "Affordable pricing from $99 — no hidden fees",
                "100% Money Back Guarantee for stress-free experience",
                "Dedicated customer support throughout the process",
                "Fast digital delivery — receive within 24 hours",
                "Licensed clinician signature with NPI & license number",
                "Legitimate ESA letter for complete peace of mind",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="ri-checkbox-circle-fill text-orange-500 text-lg"></i>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <a
                href={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line"></i>
                Get Your ESA Letter Now
              </a>
            </div>
          </div>
        </div>

      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-10"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer z-10"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
          <div
            className="relative max-w-3xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10 bg-white border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Sample
            </div>
            <img
              src={SAMPLE_IMG}
              alt="PawTenant ESA Letter sample document — full view with annotated callouts showing key sections"
              className="w-full h-auto block rounded-2xl"
            />
          </div>
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 text-xs tracking-wide whitespace-nowrap">
            Click anywhere outside to close · Press Esc to dismiss
          </p>
        </div>
      )}
    </section>
  );
}
