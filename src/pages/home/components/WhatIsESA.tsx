const benefits = [
  "Provides emotional support for anxiety, depression, PTSD, and other mental health conditions",
  "Legally protected under the Fair Housing Act for housing accommodations",
  "Allows you to live with your pet in no-pet housing without extra fees",
  "Prescribed by licensed mental health professionals",
  "Not the same as a service animal — no special training required",
  "Can be any domesticated animal, not just dogs",
];

const petTypes = [
  { name: "Dogs", icon: "ri-bear-smile-line" },
  { name: "Cats", icon: "ri-bear-smile-line" },
  { name: "Rabbits", icon: "ri-rest-time-line" },
  { name: "Birds", icon: "ri-bird-line" },
  { name: "Hamsters", icon: "ri-leaf-line" },
  { name: "Reptiles", icon: "ri-shield-cross-line" },
];

// Warm, premium home-lifestyle companion-animal photography (dogs/cats in
// comfortable apartment settings) — supports the housing-focused ESA message.
// Below the fold → lazy, with explicit width/height to avoid CLS.
const petPhotos = [
  {
    src: "/assets/lifestyle/esa-golden-retriever-home.jpg",
    alt: "Emotional support dog resting comfortably on the couch at home",
    width: 1000,
    height: 750,
  },
  {
    src: "/assets/lifestyle/esa-cat-apartment-window.jpg",
    alt: "Cat relaxing peacefully by an apartment window in the sun",
    width: 1000,
    height: 750,
  },
  {
    src: "/assets/lifestyle/esa-owner-hugging-dog-home.jpg",
    alt: "Owner sharing a calm, comforting moment with her dog at home",
    width: 1000,
    height: 750,
  },
];

export default function WhatIsESA() {
  return (
    <section className="py-12 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-stretch">
          {/* Image — mobile-first: aspect-ratio container prevents CLS and
              keeps the image from feeling oversized on narrow phones.
              Warm, premium home-lifestyle photo (owner + calm dog in a sunlit
              apartment) reinforces the housing-focused ESA message. WebP via
              <picture> with a JPG fallback; lazy-loaded (below the fold). */}
          <div className="rounded-2xl overflow-hidden aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:min-h-80 shadow-sm ring-1 ring-slate-200/60">
            <picture>
              <source
                type="image/webp"
                srcSet="/assets/lifestyle/esa-owner-dog-apartment.webp"
              />
              <img
                src="/assets/lifestyle/esa-owner-dog-apartment.jpg"
                alt="Woman relaxing at home with her emotional support dog in a sunlit apartment"
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
            </picture>
          </div>

          {/* Content */}
          <div className="flex flex-col">
            <p className="text-orange-500 text-[12px] sm:text-sm font-semibold tracking-widest uppercase mb-3">Understanding ESAs</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4 sm:mb-5 leading-tight">
              What Is an Emotional Support Animal (ESA)?
            </h2>
            <p className="text-gray-600 text-[14px] sm:text-sm leading-relaxed mb-5 sm:mb-6">
              An Emotional Support Animal (ESA) is a companion animal that provides therapeutic benefit to its owner through affection and companionship. Unlike service animals, ESAs do not need specialized training. Their presence alone provides significant mental health benefits for people struggling with emotional or psychological conditions.
            </p>
            <p className="hidden sm:block text-gray-600 text-sm leading-relaxed mb-8">
              With a <strong className="text-gray-800">legitimate ESA letter</strong> signed by a licensed mental health professional, you gain legal protections allowing you to live with your emotional support animal even in no-pet housing — without additional pet fees. You can get your <strong className="text-gray-800">legit ESA letter online</strong> in as little as 24 hours through our simple, fully digital process.
            </p>

            <ul className="space-y-3 mb-8">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-gray-700">
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-orange-500 text-lg"></i>
                  </div>
                  {b}
                </li>
              ))}
            </ul>

            <a
              href="#pricing"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Learn More &amp; Get Started
              <i className="ri-arrow-right-line"></i>
            </a>
          </div>
        </div>

        {/* Any Pet Qualifies strip — simplified: plain-text pills, no eyebrow, no icons */}
        <div className="mt-10 pt-8 sm:mt-16 sm:pt-12 border-t border-slate-200">
          <div className="text-center mb-6 sm:mb-8">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">Any Domesticated Animal Can Be an ESA</h3>
            <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
              Dogs, cats, rabbits, birds — if your pet provides emotional comfort, they may qualify. No special training required.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {petTypes.map((pet) => (
              <span
                key={pet.name}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-gray-700"
              >
                {pet.name}
              </span>
            ))}
          </div>

          {/* Warm pet visual strip — keeps the section grounded with real
              companion-animal imagery instead of text-and-chips only.
              Compact 3-up grid so the section stays short on every breakpoint. */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto mt-6 sm:mt-8">
            {petPhotos.map((p) => (
              <div
                key={p.src}
                className="rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100"
              >
                <picture>
                  <source
                    type="image/webp"
                    srcSet={p.src.replace(/\.jpg$/, ".webp")}
                  />
                  <img
                    src={p.src}
                    alt={p.alt}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center"
                  />
                </picture>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            <i className="ri-information-line mr-1"></i>
            ESA letters cover dogs, cats, rabbits, birds, hamsters, and other domesticated animals
          </p>
        </div>
      </div>
    </section>
  );
}
