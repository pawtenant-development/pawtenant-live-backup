import { Link } from "react-router-dom";
import { useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const siteStructure = [
  {
    title: "ESA Services",
    color: "orange",
    links: [
      { label: "Home", href: "/" },
      { label: "How to Get an ESA Letter", href: "/how-to-get-esa-letter" },
      { label: "ESA Letter Cost & Pricing", href: "/esa-letter-cost" },
      { label: "Housing Rights & Your ESA", href: "/housing-rights-esa" },
      { label: "No Risk Guarantee", href: "/no-risk-guarantee" },
      { label: "Renew ESA Letter", href: "/renew-esa-letter" },
      { label: "Apply Now", href: "/assessment" }
    ]
  },
  {
    title: "ESA Letters by State",
    color: "teal",
    links: [
      { label: "Explore All States", href: "/explore-esa-letters-all-states" },
      { label: "Alabama ESA Letter", href: "/esa-letter/alabama" },
      { label: "Alaska ESA Letter", href: "/esa-letter/alaska" },
      { label: "Arizona ESA Letter", href: "/esa-letter/arizona" },
      { label: "Arkansas ESA Letter", href: "/esa-letter/arkansas" },
      { label: "California ESA Letter", href: "/esa-letter/california" },
      { label: "Colorado ESA Letter", href: "/esa-letter/colorado" },
      { label: "Connecticut ESA Letter", href: "/esa-letter/connecticut" },
      { label: "Delaware ESA Letter", href: "/esa-letter/delaware" },
      { label: "Florida ESA Letter", href: "/esa-letter/florida" },
      { label: "Georgia ESA Letter", href: "/esa-letter/georgia" },
      { label: "Hawaii ESA Letter", href: "/esa-letter/hawaii" },
      { label: "Idaho ESA Letter", href: "/esa-letter/idaho" },
      { label: "Illinois ESA Letter", href: "/esa-letter/illinois" },
      { label: "Indiana ESA Letter", href: "/esa-letter/indiana" },
      { label: "Iowa ESA Letter", href: "/esa-letter/iowa" },
      { label: "Kansas ESA Letter", href: "/esa-letter/kansas" },
      { label: "Kentucky ESA Letter", href: "/esa-letter/kentucky" },
      { label: "Louisiana ESA Letter", href: "/esa-letter/louisiana" },
      { label: "Maine ESA Letter", href: "/esa-letter/maine" },
      { label: "Maryland ESA Letter", href: "/esa-letter/maryland" },
      { label: "Massachusetts ESA Letter", href: "/esa-letter/massachusetts" },
      { label: "Michigan ESA Letter", href: "/esa-letter/michigan" },
      { label: "Minnesota ESA Letter", href: "/esa-letter/minnesota" },
      { label: "Mississippi ESA Letter", href: "/esa-letter/mississippi" },
      { label: "Missouri ESA Letter", href: "/esa-letter/missouri" },
      { label: "Montana ESA Letter", href: "/esa-letter/montana" },
      { label: "Nebraska ESA Letter", href: "/esa-letter/nebraska" },
      { label: "Nevada ESA Letter", href: "/esa-letter/nevada" },
      { label: "New Hampshire ESA Letter", href: "/esa-letter/new-hampshire" },
      { label: "New Jersey ESA Letter", href: "/esa-letter/new-jersey" },
      { label: "New Mexico ESA Letter", href: "/esa-letter/new-mexico" },
      { label: "New York ESA Letter", href: "/esa-letter/new-york" },
      { label: "North Carolina ESA Letter", href: "/esa-letter/north-carolina" },
      { label: "North Dakota ESA Letter", href: "/esa-letter/north-dakota" },
      { label: "Ohio ESA Letter", href: "/esa-letter/ohio" },
      { label: "Oklahoma ESA Letter", href: "/esa-letter/oklahoma" },
      { label: "Oregon ESA Letter", href: "/esa-letter/oregon" },
      { label: "Pennsylvania ESA Letter", href: "/esa-letter/pennsylvania" },
      { label: "Rhode Island ESA Letter", href: "/esa-letter/rhode-island" },
      { label: "South Carolina ESA Letter", href: "/esa-letter/south-carolina" },
      { label: "South Dakota ESA Letter", href: "/esa-letter/south-dakota" },
      { label: "Tennessee ESA Letter", href: "/esa-letter/tennessee" },
      { label: "Texas ESA Letter", href: "/esa-letter/texas" },
      { label: "Utah ESA Letter", href: "/esa-letter/utah" },
      { label: "Vermont ESA Letter", href: "/esa-letter/vermont" },
      { label: "Virginia ESA Letter", href: "/esa-letter/virginia" },
      { label: "Washington ESA Letter", href: "/esa-letter/washington" },
      { label: "Washington DC ESA Letter", href: "/esa-letter/washington-dc" },
      { label: "West Virginia ESA Letter", href: "/esa-letter/west-virginia" },
      { label: "Wisconsin ESA Letter", href: "/esa-letter/wisconsin" },
      { label: "Wyoming ESA Letter", href: "/esa-letter/wyoming" },
    ]
  },
  {
    title: "College & University",
    color: "violet",
    links: [
      { label: "College Pet Policy Guide", href: "/college-pet-policy" },
      { label: "UNC Chapel Hill", href: "/college-pet-policy/unc-chapel-hill" },
      { label: "Georgetown University", href: "/college-pet-policy/georgetown" },
      { label: "Emory University", href: "/college-pet-policy/emory" },
      { label: "Vanderbilt University", href: "/college-pet-policy/vanderbilt" },
      { label: "Carnegie Mellon University", href: "/college-pet-policy/carnegie-mellon" },
      { label: "Rice University", href: "/college-pet-policy/rice" },
      { label: "Dartmouth College", href: "/college-pet-policy/dartmouth" },
      { label: "Brown University", href: "/college-pet-policy/brown" },
      { label: "Cornell University", href: "/college-pet-policy/cornell" },
      { label: "Johns Hopkins University", href: "/college-pet-policy/johns-hopkins" },
      { label: "NYU", href: "/college-pet-policy/nyu" },
      { label: "UCLA", href: "/college-pet-policy/ucla" }
    ]
  },
  {
    title: "Discover",
    color: "green",
    links: [
      { label: "All About Service Dogs", href: "/all-about-service-dogs" },
      { label: "How to Get a PSD Letter", href: "/how-to-get-psd-letter" },
      { label: "Service Animal vs ESA", href: "/service-animal-vs-esa" },
      { label: "Airline Pet Policy", href: "/airline-pet-policy" }
    ]
  },
  {
    title: "Blog",
    color: "amber",
    links: [
      { label: "All Blog Articles", href: "/blog" },
      { label: "How to Request ESA from University", href: "/blog/how-to-request-esa-accommodation-university-2026" },
      { label: "ESA in College Dorms Guide", href: "/blog/can-you-have-esa-in-college-dorms" },
      { label: "ESA Letter for College Students", href: "/blog/esa-letter-college-students-dorm-rights-federal-laws" },
      { label: "Renters Insurance for Pet Owners", href: "/blog/renters-insurance-pet-owners-complete-guide" },
      { label: "Flying with Your ESA Guide", href: "/blog/flying-with-esa-travel-letter-guide" },
      { label: "How to Get an ESA Letter from Doctor", href: "/blog/how-to-get-esa-letter-from-doctor" }
    ]
  },
  {
    title: "Company",
    color: "gray",
    links: [
      { label: "About Us", href: "/about-us" },
      { label: "FAQs", href: "/faqs" },
      { label: "No Risk Guarantee", href: "/no-risk-guarantee" },
      { label: "Contact Us", href: "/#contact-form" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Use", href: "/terms-of-use" },
      { label: "Sitemap", href: "/sitemap" }
    ]
  }
];

const colorMap: Record<string, string> = {
  orange: "bg-orange-50 border-orange-100",
  teal: "bg-teal-50 border-teal-100",
  violet: "bg-violet-50 border-violet-100",
  green: "bg-green-50 border-green-100",
  amber: "bg-amber-50 border-amber-100",
  gray: "bg-gray-50 border-gray-100"
};

const textColorMap: Record<string, string> = {
  orange: "text-orange-600",
  teal: "text-teal-600",
  violet: "text-violet-600",
  green: "text-green-600",
  amber: "text-amber-600",
  gray: "text-gray-600"
};

const toggleBtnColorMap: Record<string, string> = {
  teal: "text-teal-600 border-teal-200 hover:bg-teal-100",
};

export default function SitemapPage() {
  const [statesExpanded, setStatesExpanded] = useState(false);

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="bg-[#fdf8f3] pt-32 pb-14">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
            Navigation
          </span>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Sitemap</h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            A complete overview of all pages on PawTenant.com to help you find exactly what you need.
          </p>
        </div>
      </section>

      {/* Sitemap Grid */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {siteStructure.map((section) => {
              const isStates = section.title === "ESA Letters by State";
              const displayLinks = isStates && !statesExpanded
                ? section.links.slice(0, 7)
                : section.links;

              return (
                <div
                  key={section.title}
                  className={`rounded-2xl p-6 border ${colorMap[section.color]} flex flex-col`}
                >
                  <h2 className={`text-sm font-bold uppercase tracking-widest mb-4 ${textColorMap[section.color]}`}>
                    {section.title}
                  </h2>
                  <ul className="space-y-2 flex-1">
                    {displayLinks.map((link) => (
                      <li key={link.href}>
                        <Link
                          to={link.href}
                          className="flex items-center gap-2 text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
                        >
                          <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                            <i className="ri-arrow-right-s-line text-gray-400 text-xs"></i>
                          </div>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {isStates && (
                    <button
                      onClick={() => setStatesExpanded(!statesExpanded)}
                      className={`mt-4 w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 px-4 rounded-lg border transition-colors cursor-pointer ${toggleBtnColorMap.teal}`}
                    >
                      <i className={`${statesExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
                      {statesExpanded
                        ? "Show Less"
                        : `Show All ${section.links.length} States`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
