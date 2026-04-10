import { useState, useEffect, useRef, useCallback } from "react";

const testimonials = [
  { id: 1, name: "Alyssa M.", location: "Los Angeles, CA", rating: 5, text: "PawTenant made the whole process incredibly easy. I had my letter the same day, and my landlord approved it without any issues. My anxiety has improved so much having Biscuit with me.", petName: "Biscuit", petType: "Golden Retriever" },
  { id: 2, name: "Jordan K.", location: "Austin, TX", rating: 5, text: "PawTenant's letter was accepted by my university's disability office on the first try. The therapist was compassionate and really understood my situation. Having Luna in the dorm changed everything.", petName: "Luna", petType: "Cat" },
  { id: 3, name: "Priya R.", location: "New York, NY", rating: 5, text: "My NYC landlord initially said no pets, but after submitting my ESA letter they had to reconsider. Professional, legally sound, and delivered fast. Couldn't imagine life here without Mochi.", petName: "Mochi", petType: "Rabbit" },
  { id: 4, name: "Derek W.", location: "Chicago, IL", rating: 5, text: "The therapist took time to really understand my situation, not just tick boxes. I felt genuinely heard. Got my letter the next morning and now Max sleeps at my feet every night.", petName: "Max", petType: "Mixed Breed Dog" },
  { id: 5, name: "Sofia L.", location: "Miami, FL", rating: 5, text: "I was skeptical of online ESA services after reading horror stories, but PawTenant is the real deal. Actual licensed therapist, real letter. My strict no-pets building accepted it immediately.", petName: "Coco", petType: "Chihuahua" },
  { id: 6, name: "Tyler B.", location: "Denver, CO", rating: 5, text: "When I moved to a place with pet restrictions, PawTenant helped me get my ESA letter in under 24 hours. The whole thing was smooth, private, and professional. Hank keeps me grounded.", petName: "Hank", petType: "Aussie Mix" },
  { id: 7, name: "Rachel T.", location: "Seattle, WA", rating: 5, text: "Renewed my ESA letter for the second year running. The process gets easier each time. My property management company has never questioned it. Worth every penny for the peace of mind.", petName: "Olive", petType: "Tabby Cat" },
  { id: 8, name: "Marcus H.", location: "Phoenix, AZ", rating: 5, text: "After my divorce I really struggled, and Ranger was the only thing keeping me stable. PawTenant helped me keep him in my new apartment. The whole evaluation felt caring, not transactional.", petName: "Ranger", petType: "Border Collie" },
  { id: 9, name: "Brianna C.", location: "Nashville, TN", rating: 5, text: "I was nervous about the process but the licensed therapist put me completely at ease. My ESA letter arrived the very next morning and my landlord accepted it without any pushback. Pepper and I are so grateful.", petName: "Pepper", petType: "Beagle" },
  { id: 10, name: "Ethan V.", location: "Portland, OR", rating: 5, text: "The online assessment was thorough but never felt intrusive. I genuinely felt like the provider cared. My no-pets apartment complex approved my ESA letter within 48 hours. Absolutely the best decision I made.", petName: "Scout", petType: "Labrador Mix" },
  { id: 11, name: "Jasmine W.", location: "Atlanta, GA", rating: 5, text: "PawTenant delivered my ESA letter faster than I expected and the quality was top-notch. My property manager even commented on how professionally it was written. Couldn't recommend them more — Bella is staying!", petName: "Bella", petType: "French Bulldog" },
];

const ACCENT_COLORS = [
  "bg-orange-100 text-orange-600",
  "bg-amber-100 text-amber-600",
  "bg-green-100 text-green-700",
  "bg-teal-100 text-teal-700",
  "bg-rose-100 text-rose-600",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-600",
  "bg-lime-100 text-lime-700",
  "bg-sky-100 text-sky-700",
  "bg-purple-100 text-purple-700",
];

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={`${i < count ? "ri-star-fill" : "ri-star-line"} text-amber-400 text-sm`} />
      ))}
    </div>
  );
}

const STATS = [
  { value: "4.9 / 5", label: "Average Rating", icon: "ri-star-fill" },
  { value: "12,400+", label: "Happy Clients", icon: "ri-user-heart-line" },
  { value: "98.7%", label: "Approval Rate", icon: "ri-checkbox-circle-line" },
  { value: "100%", label: "Money-Back Guarantee", icon: "ri-shield-check-line" },
];

// Desktop shows 6 cards (2 rows × 3 cols), paginated in groups of 6
const DESKTOP_PAGE_SIZE = 6;
const MOBILE_TOTAL = testimonials.length;

function TestimonialCard({ t, idx }: { t: typeof testimonials[0]; idx: number }) {
  return (
    <div className="bg-[#fdf8f3] rounded-2xl border border-orange-100/70 p-5 flex flex-col gap-3 h-full">
      <Stars count={t.rating} />
      <p className="text-gray-700 text-sm leading-relaxed flex-1">
        &ldquo;{t.text}&rdquo;
      </p>
      <div className="flex items-center gap-3 pt-3 border-t border-orange-100">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ACCENT_COLORS[idx % ACCENT_COLORS.length]}`}>
          {initials(t.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 leading-tight">{t.name}</p>
          <p className="text-xs text-gray-400">{t.location}</p>
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1 bg-orange-50 text-orange-600 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap">
          <i className="ri-footprint-fill text-xs" />{t.petName}
        </span>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  // Desktop pagination
  const totalDesktopPages = Math.ceil(testimonials.length / DESKTOP_PAGE_SIZE);
  const [desktopPage, setDesktopPage] = useState(0);

  // Mobile slider
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goMobile = useCallback((next: number) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setMobileIndex(next);
    setTimeout(() => setIsAnimating(false), 400);
  }, [isAnimating]);

  useEffect(() => {
    autoRef.current = setTimeout(() => {
      goMobile((mobileIndex + 1) % MOBILE_TOTAL);
    }, 6000);
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, [mobileIndex, goMobile]);

  const desktopSlice = testimonials.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE,
  );

  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-5 md:px-6">

        {/* Header */}
        <div className="text-center mb-10 md:mb-12">
          <span className="inline-block px-4 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
            Real Stories
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            What Our Clients Are Saying
          </h2>
          <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Over 12,000 families have kept their beloved companions thanks to a PawTenant ESA letter.
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-stretch justify-center mb-10 md:mb-12 rounded-2xl border border-gray-100 overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center gap-1 px-8 py-5 bg-gray-50 flex-1 min-w-[160px]">
              <div className="w-8 h-8 flex items-center justify-center mb-1">
                <i className={`${stat.icon} text-orange-500 text-xl`} />
              </div>
              <p className="text-xl md:text-2xl font-extrabold text-gray-900 leading-none">{stat.value}</p>
              <p className="text-xs text-gray-400 text-center whitespace-nowrap">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── DESKTOP: 3-column grid ── */}
        <div className="hidden md:block">
          <div className="grid grid-cols-3 gap-5 mb-6">
            {desktopSlice.map((t, i) => (
              <TestimonialCard key={t.id} t={t} idx={desktopPage * DESKTOP_PAGE_SIZE + i} />
            ))}
          </div>
          {/* Desktop pagination dots */}
          {totalDesktopPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setDesktopPage((p) => (p - 1 + totalDesktopPages) % totalDesktopPages)}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-all cursor-pointer"
                aria-label="Previous page"
              >
                <i className="ri-arrow-left-s-line text-lg" />
              </button>
              <div className="flex items-center gap-2">
                {Array.from({ length: totalDesktopPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setDesktopPage(i)}
                    aria-label={`Page ${i + 1}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${i === desktopPage ? "bg-orange-500 w-6" : "bg-gray-200 w-2 hover:bg-gray-300"}`}
                  />
                ))}
              </div>
              <button
                onClick={() => setDesktopPage((p) => (p + 1) % totalDesktopPages)}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-all cursor-pointer"
                aria-label="Next page"
              >
                <i className="ri-arrow-right-s-line text-lg" />
              </button>
            </div>
          )}
        </div>

        {/* ── MOBILE: single-card slider ── */}
        <div className="md:hidden">
          <div className="mb-4">
            <TestimonialCard t={testimonials[mobileIndex]} idx={mobileIndex} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => goMobile((mobileIndex - 1 + MOBILE_TOTAL) % MOBILE_TOTAL)}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-all cursor-pointer"
              aria-label="Previous review"
            >
              <i className="ri-arrow-left-s-line text-lg" />
            </button>
            <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-xs">
              {Array.from({ length: MOBILE_TOTAL }, (_, i) => (
                <button
                  key={i}
                  onClick={() => goMobile(i)}
                  aria-label={`Go to review ${i + 1}`}
                  className={`h-2 rounded-full transition-all cursor-pointer ${i === mobileIndex ? "bg-orange-500 w-6" : "bg-gray-200 w-2 hover:bg-gray-300"}`}
                />
              ))}
            </div>
            <button
              onClick={() => goMobile((mobileIndex + 1) % MOBILE_TOTAL)}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-all cursor-pointer"
              aria-label="Next review"
            >
              <i className="ri-arrow-right-s-line text-lg" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">{mobileIndex + 1} of {MOBILE_TOTAL} reviews</p>
        </div>

        {/* Trust Badges */}
        <div className="mt-10 pt-8 border-t border-gray-100 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {[
            { icon: "ri-shield-check-fill", text: "HIPAA Compliant" },
            { icon: "ri-award-fill", text: "BBB Accredited" },
            { icon: "ri-lock-password-fill", text: "256-bit SSL" },
            { icon: "ri-medicine-bottle-fill", text: "Licensed Professionals" },
            { icon: "ri-money-dollar-circle-fill", text: "Money-Back Guarantee" },
          ].map((badge) => (
            <div key={badge.icon} className="flex items-center gap-2 text-gray-500">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className={`${badge.icon} text-orange-500`} />
              </div>
              <span className="text-xs font-medium">{badge.text}</span>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
