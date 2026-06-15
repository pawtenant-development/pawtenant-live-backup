import { Link } from "react-router-dom";

/**
 * ResourceLinksSection — compact homepage "Explore ESA & PSD Resources" block.
 *
 * Purpose: improve crawl discovery and internal-link authority flow to key ESA/PSD
 * SEO guides without turning the homepage into a blog directory. Intentionally
 * lightweight (text + ri-* icons, no images), below the fold, and visually calm so
 * the primary conversion CTA stays dominant. Mobile-first: 1 col → 2 → 3.
 *
 * Compliance: educational labels only — no guarantee / public-access / "legit"
 * wording. Links point to existing indexable pages.
 */

const resources = [
  { to: "/how-to-get-esa-letter-online", icon: "ri-computer-line", label: "How to Get an ESA Letter Online", desc: "The online process, step by step." },
  { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA Letter Cost", desc: "Transparent pricing and what's included." },
  { to: "/esa-letter-for-landlord", icon: "ri-home-heart-line", label: "ESA Letter for Landlords", desc: "How housing accommodation works." },
  { to: "/landlord-denied-esa-letter", icon: "ri-shield-keyhole-line", label: "Landlord Denied Your ESA?", desc: "Your rights and calm next steps." },
  { to: "/service-animal-vs-esa", icon: "ri-service-line", label: "ESA vs PSD Support", desc: "How emotional support and service animals differ." },
  { to: "/travel-anxiety-esa-letter", icon: "ri-suitcase-line", label: "Travel Anxiety & ESA Housing Support", desc: "Comfort, crowds, and temporary stays." },
];

export default function ResourceLinksSection() {
  return (
    <section className="py-12 sm:py-16 bg-[#f8f7f4] border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-8">
          <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
            Learn before you apply
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            Explore ESA &amp; PSD Resources
          </h2>
          <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto">
            Plain-English guides to ESA letters, housing rights, and how the process works.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {resources.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="group flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-4 sm:p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 text-orange-500 flex-shrink-0">
                <i className={`${r.icon} text-lg`}></i>
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-gray-900 group-hover:text-orange-600 leading-snug">
                  {r.label}
                </span>
                <span className="block text-[12.5px] text-gray-500 leading-relaxed mt-0.5">{r.desc}</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="text-center mt-7">
          <Link
            to="/resource-center"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            Browse the full resource center <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
      </div>
    </section>
  );
}
