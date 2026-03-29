import { Link } from "react-router-dom";

const topStates = [
  {
    name: "California",
    slug: "california",
    abbr: "CA",
    tagline: "Strongest ESA protections in the US",
    highlight: "AB 468 compliant letters",
    facts: ["No pet fees or deposits", "30-day provider relationship required", "Fraud penalties for fake letters"],
    image: "https://readdy.ai/api/search-image?query=California%20golden%20coast%20sunny%20beach%20palm%20trees%20blue%20sky%20ocean%20warm%20afternoon%20light%20scenic%20landscape%20vibrant%20colors&width=600&height=400&seq=state-ca01&orientation=landscape",
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
    image: "https://readdy.ai/api/search-image?query=Texas%20lone%20star%20state%20wide%20open%20skyline%20sunset%20dramatic%20clouds%20rolling%20plains%20warm%20orange%20golden%20light%20scenic%20landscape&width=600&height=400&seq=state-tx01&orientation=landscape",
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
    image: "https://readdy.ai/api/search-image?query=Florida%20tropical%20palm%20trees%20blue%20sky%20sunny%20warm%20vibrant%20colors%20waterway%20scenic%20beautiful%20coastal%20landscape%20bright%20daylight&width=600&height=400&seq=state-fl01&orientation=landscape",
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
    image: "https://readdy.ai/api/search-image?query=New%20York%20City%20skyline%20urban%20buildings%20sunset%20golden%20hour%20warm%20light%20dramatic%20clouds%20cityscape%20beautiful%20architecture%20professional&width=600&height=400&seq=state-ny01&orientation=landscape",
    color: "from-slate-50 to-gray-50",
    border: "border-slate-200 hover:border-slate-400",
    badge: "bg-slate-100 text-slate-700",
  },
];

export default function TopStatesSection() {
  return (
    <section className="py-20 bg-white" id="state-guides">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
            State ESA Guides
          </span>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            ESA Letters by State — Know <span className="text-orange-500">Your Local Rights</span>
          </h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto leading-relaxed">
            ESA housing laws vary by state. Our most popular guides break down exactly what protections apply where you live — and what landlords can and cannot do.
          </p>
        </div>

        {/* State Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {topStates.map((state) => (
            <Link
              key={state.slug}
              to={`/esa-letter/${state.slug}`}
              className={`group bg-gradient-to-b ${state.color} rounded-2xl border ${state.border} overflow-hidden transition-all duration-300 cursor-pointer flex flex-col`}
            >
              {/* Image */}
              <div className="w-full h-36 overflow-hidden">
                <img
                  src={state.image}
                  alt={`ESA letter ${state.name}`}
                  title={`ESA letter ${state.name} guide`}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
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
