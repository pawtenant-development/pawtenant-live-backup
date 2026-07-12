/**
 * TestimonialsSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * One consistent stat set (4.9★ · 15,000+ letters · 50 states — replaces the
 * old contradictory 12,000/12,400/15,000 + "98.7% approval" mix) and three
 * lead reviews with varied arcs (skeptic-converted, landlord-approved,
 * caring-evaluation). Review copy reused verbatim from the existing set.
 *
 * Owner correction G: circular initials avatars (safe fallback — no stock or
 * generated portraits presented as real reviewers, no fabricated "verified"
 * identity claims).
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const TESTIMONIALS = [
  {
    name: "Sofia L.",
    location: "Miami, FL",
    text: "I was skeptical of online ESA services after reading horror stories, but PawTenant is the real deal. Actual licensed therapist, real letter. My strict no-pets building accepted it immediately.",
    petName: "Coco",
  },
  {
    name: "Alyssa M.",
    location: "Los Angeles, CA",
    text: "PawTenant made the whole process incredibly easy. I had my letter the same day, and my landlord approved it without any issues. My anxiety has improved so much having Biscuit with me.",
    petName: "Biscuit",
  },
  {
    name: "Marcus H.",
    location: "Phoenix, AZ",
    text: "After my divorce I really struggled, and Ranger was the only thing keeping me stable. PawTenant helped me keep him in my new apartment. The whole evaluation felt caring, not transactional.",
    petName: "Ranger",
  },
];

const STATS = [
  { n: "4.9", star: true, label: "Average rating" },
  { n: "15,000+", label: "Letters issued" },
  { n: "50", label: "States covered" },
];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TestimonialsSection() {
  return (
    <section className="py-14 sm:py-20 bg-[#F7F2E9]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="text-center">
          <p className="text-[#6B6359] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            Real Stories
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight"
            style={FONT_DISPLAY}
          >
            What Our Clients Are Saying
          </h2>
        </div>

        {/* One consistent number set. */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap my-8 sm:my-10 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-[28px] sm:text-3xl font-bold text-[#231F1A]" style={FONT_DISPLAY}>
                {s.n}
                {s.star && <span className="text-base text-[#E19C24]"> ★</span>}
              </div>
              <div className="text-[11.5px] font-bold text-[#6B6359] uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="bg-white border border-[#EAE3D7] rounded-2xl px-5 py-5 sm:px-6 sm:py-6 shadow-[0_1px_2px_rgba(35,31,26,0.05),0_10px_30px_-14px_rgba(35,31,26,0.14)] flex flex-col"
            >
              <div className="text-[#E19C24] text-[13px] tracking-[2px] mb-2.5" aria-label="5 out of 5 stars">
                ★★★★★
              </div>
              <p className="text-sm text-[#4A443C] leading-relaxed mb-4 flex-1">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-full bg-[#EDF4F0] text-[#3F7061] font-extrabold text-[13px] flex items-center justify-center flex-shrink-0"
                  aria-hidden
                >
                  {initialsOf(t.name)}
                </div>
                <div>
                  <div className="text-[13.5px] font-extrabold text-[#231F1A] leading-tight">{t.name}</div>
                  <div className="text-[12.5px] font-semibold text-[#6B6359]">{t.location}</div>
                </div>
                <span className="ml-auto bg-[#F7F2E9] text-[#4A443C] text-[11px] font-extrabold rounded-full px-2.5 py-1">
                  {t.petName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
