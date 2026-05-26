import { Link } from "react-router-dom";

const STATE_IMAGE_FALLBACKS = [
  "/assets/lifestyle/owner-with-dog-laptop.jpg",
  "/assets/lifestyle/woman-with-dog-new-apartment.jpg",
  "/assets/lifestyle/senior-with-pet-home.jpg",
  "/assets/lifestyle/woman-telehealth-with-dog.jpg",
  "/assets/lifestyle/freelancer-with-dog-laptop.jpg",
  "/assets/lifestyle/person-paperwork-with-dog.jpg",
  "/assets/lifestyle/woman-with-dog-office.jpg",
  "/assets/lifestyle/woman-laptop-clean.jpg",
] as const;

function isLocalAssetPath(src: string | undefined | null): boolean {
  return typeof src === "string" && src.startsWith("/") && !src.startsWith("//");
}

function resolveStateImageByIndex(rawSrc: string | undefined, index: number): string {
  if (isLocalAssetPath(rawSrc)) return rawSrc as string;
  return STATE_IMAGE_FALLBACKS[index % STATE_IMAGE_FALLBACKS.length];
}

const topStates = [
  {
    name: "California",
    slug: "california",
    abbr: "CA",
    tagline: "Strongest ESA protections in the US",
    highlight: "AB 468 compliant letters",
    facts: ["No pet fees or deposits", "30-day provider relationship required", "Fraud penalties for fake letters"],
    image: "/assets/states/california.jpg",
    color: "from-orange-50 to-amber-50",
    border: "border-orange-200 hover:border-orange-400",
    badge: "bg-orange-100 text-orange-700",
  },
  {
    name: "Texas",
    slug: "texas",
    abbr: "TX",
    tagline: "Protect your Texas tenant rights",
    highlight: "Statewide landlord compliance",
    facts: ["FHA protections statewide", "No breed restrictions on ESAs", "24-hour letter delivery"],
    image: "/assets/states/texas.jpg",
    color: "from-red-50 to-orange-50",
    border: "border-red-200 hover:border-red-400",
    badge: "bg-red-100 text-red-700",
  },
  {
    name: "Florida",
    slug: "florida",
    abbr: "FL",
    tagline: "Dual state & federal protections",
    highlight: "Florida Fair Housing Act",
    facts: ["State + FHA dual coverage", "Anti-fraud provisions", "No pet rent allowed"],
    image: "/assets/states/florida.jpg",
    color: "from-teal-50 to-cyan-50",
    border: "border-teal-200 hover:border-teal-400",
    badge: "bg-teal-100 text-teal-700",
  },
  {
    name: "New York",
    slug: "new-york",
    abbr: "NY",
    tagline: "Triple-layer protections in NYC",
    highlight: "NYC Human Rights Law + FHA",
    facts: ["Federal + State + City laws", "No-pet buildings covered", "30-day response rule"],
    image: "/assets/states/new-york.jpg",
    color: "from-slate-50 to-gray-50",
    border: "border-slate-200 hover:border-slate-400",
    badge: "bg-slate-100 text-slate-700",
  },
  {
    name: "North Carolina",
    slug: "north-carolina",
    abbr: "NC",
    tagline: "FHA-backed ESA rights across NC",
    highlight: "Licensed clinician coverage",
    facts: ["FHA protections statewide", "No pet deposits on ESAs", "Same-day letter available"],
    image: "/assets/states/north-carolina.jpg",
    color: "from-emerald-50 to-green-50",
    border: "border-emerald-200 hover:border-emerald-400",
    badge: "bg-emerald-100 text-emerald-700",
  },
  {
    name: "Pennsylvania",
    slug: "pennsylvania",
    abbr: "PA",
    tagline: "Strong tenant protections in PA",
    highlight: "PHRA + FHA dual coverage",
    facts: ["State + federal dual protection", "No breed or weight restrictions", "Landlord must accommodate"],
    image: "/assets/states/pennsylvania.jpg",
    color: "from-amber-50 to-yellow-50",
    border: "border-amber-200 hover:border-amber-400",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    name: "Virginia",
    slug: "virginia",
    abbr: "VA",
    tagline: "VHDA & FHA protections for VA renters",
    highlight: "Virginia Fair Housing Law",
    facts: ["State + FHA dual coverage", "No extra pet fees allowed", "Clinician-signed letters accepted"],
    image: "/assets/states/virginia.jpg",
    color: "from-sky-50 to-blue-50",
    border: "border-sky-200 hover:border-sky-400",
    badge: "bg-sky-100 text-sky-700",
  },
  {
    name: "Illinois",
    slug: "illinois",
    abbr: "IL",
    tagline: "Strong renter protections statewide",
    highlight: "IL Human Rights Act + FHA",
    facts: ["Federal + state ESA coverage", "No pet rent or deposits", "Provider-signed letters honored"],
    image: "/assets/states/illinois.jpg",
    color: "from-indigo-50 to-blue-50",
    border: "border-indigo-200 hover:border-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
  },
];

export default function TopStatesSection() {
  return (
    <section className="py-20 bg-white" id="state-guides">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
            State ESA Guides
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
            ESA Letters by State — Know <span className="text-orange-500">Your Local Rights</span>
          </h2>
          <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            ESA housing laws vary by state. Our most popular guides break down exactly what protections apply where you live — and what landlords can and cannot do.
          </p>
        </div>

        {/* State Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {topStates.map((state, index) => (
            <Link
              key={state.slug}
              to={`/esa-letter-${state.slug}`}
              className={`group bg-gradient-to-b ${state.color} rounded-2xl border ${state.border} overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-sm hover:shadow-md hover:-translate-y-0.5`}
            >
              {/* Image */}
              <div className="w-full h-36 overflow-hidden bg-orange-50">
                <img
                  src={resolveStateImageByIndex(state.image, index)}
                  alt={`ESA letter ${state.name}`}
                  title={`ESA letter ${state.name} guide`}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  decoding="async"
                />
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                {/* State badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${state.badge}`}>
                    {state.abbr}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">{state.highlight}</span>
                </div>

                <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:text-orange-600 transition-colors">
                  {state.name} ESA Letter Guide
                </h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">{state.tagline}</p>

                {/* Facts */}
                <ul className="space-y-1.5 mb-5 flex-1">
                  {state.facts.map((fact) => (
                    <li key={fact} className="flex items-start gap-2">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-check-fill text-orange-500 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-600 leading-relaxed">{fact}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="flex items-center gap-1 text-xs font-semibold text-orange-500 group-hover:text-orange-700 transition-colors mt-auto">
                  <span>View {state.name} Guide</span>
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-right-line text-xs group-hover:translate-x-1 transition-transform"></i>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom link */}
        <div className="text-center">
          <Link
            to="/explore-esa-letters-all-states"
            className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 border border-orange-300 text-orange-600 font-semibold text-sm rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-map-2-line"></i>
            </div>
            View All 50 States &amp; Washington DC
          </Link>
        </div>
      </div>
    </section>
  );
}
