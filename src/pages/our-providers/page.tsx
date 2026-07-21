import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import ProviderJsonLd from "../../components/feature/ProviderJsonLd";
import { PUBLIC_PROVIDERS } from "../../data/publicProviders";
import { buildOurProvidersJsonLd } from "../../lib/providerJsonLd";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function OurProvidersPage() {
  return (
    <>
      <ProviderJsonLd graph={buildOurProvidersJsonLd(PUBLIC_PROVIDERS)} />
      <SharedNavbar />

      <div className="bg-[#f8f7f4] pt-32 pb-10 px-6">
        <div className="max-w-5xl mx-auto">
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">Our Providers</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            Our Providers
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed mt-3 max-w-2xl">
            PawTenant works with licensed mental health professionals who conduct individual
            telehealth evaluations, including assessments for emotional support animal (ESA)
            documentation. Each provider is licensed in the states listed on their profile.
          </p>
        </div>
      </div>

      <div className="bg-[#f8f7f4] pb-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PUBLIC_PROVIDERS.map((p) => (
            <Link
              key={p.slug}
              to={`/doctors/${p.slug}`}
              className="group bg-white rounded-2xl border border-gray-100 p-6 flex flex-col hover:border-orange-200 hover:shadow-[0_10px_30px_-16px_rgba(15,23,42,0.25)] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-orange-100 flex-shrink-0 bg-orange-50 flex items-center justify-center">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-xl font-extrabold text-orange-400 select-none">{initialsOf(p.name)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-extrabold text-gray-900 leading-tight truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {p.name}, {p.title}
                  </p>
                  <p className="text-orange-500 font-semibold text-xs mt-0.5">{p.role}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium">
                  <i className="ri-map-pin-2-line text-orange-400"></i>
                  Licensed in {p.states.length} state{p.states.length !== 1 ? "s" : ""}
                </span>
                {p.npi && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#e8f0f9] border border-[#b8cce4] text-[#2c5282] text-xs font-semibold">
                    <i className="ri-medal-line text-[#2c5282]"></i>
                    NPI Verified
                  </span>
                )}
              </div>

              <p className="text-gray-500 text-sm leading-relaxed mt-4 line-clamp-3">{p.bio}</p>

              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 group-hover:text-orange-500 transition-colors">
                View profile
                <i className="ri-arrow-right-line"></i>
              </span>
            </Link>
          ))}
        </div>

        <div className="max-w-5xl mx-auto mt-10 bg-white rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-amber-800 text-xs leading-relaxed">
            <strong>Please note:</strong> ESA letters are issued only when clinically appropriate
            after an individual evaluation. State availability depends on each provider&apos;s active
            licensure and applicable telehealth rules.
          </p>
        </div>
      </div>

      <SharedFooter />
    </>
  );
}
