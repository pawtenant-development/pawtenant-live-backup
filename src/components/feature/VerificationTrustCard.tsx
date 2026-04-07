import { Link } from "react-router-dom";

interface VerificationTrustCardProps {
  /** "section" = full-width section block, "card" = standalone card */
  variant?: "section" | "card";
  className?: string;
}

const points = [
  {
    icon: "ri-qr-code-line",
    title: "Unique Verification ID",
    desc: "Every finalized ESA or PSD letter includes a unique ID that landlords can verify instantly at pawtenant.com/verify.",
  },
  {
    icon: "ri-eye-off-line",
    title: "Privacy-Safe by Design",
    desc: "Verification only confirms authenticity and provider credentials — your diagnosis and health details are never disclosed.",
  },
  {
    icon: "ri-user-star-line",
    title: "Licensed Provider Documentation",
    desc: "Letters are signed by state-licensed mental health professionals. Provider license numbers are included for full transparency.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Accepted for Housing",
    desc: "Compliant with the Fair Housing Act. Landlords can verify your letter without requesting additional medical records.",
  },
];

export default function VerificationTrustCard({
  variant = "card",
  className = "",
}: VerificationTrustCardProps) {
  if (variant === "section") {
    return (
      <section className={`py-14 bg-[#FFF7ED] ${className}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-3">
              <i className="ri-verified-badge-line"></i>
              Landlord Verification
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mt-2">
              Your Letter Is Verifiable — Without Exposing Your Privacy
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
              Every letter issued through PawTenant includes a Verification ID. Landlords can confirm authenticity online in seconds — no health information is ever shared.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {points.map((p) => (
              <div key={p.title} className="bg-white rounded-xl p-5 border border-orange-200">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-100 rounded-lg mb-3">
                  <i className={`${p.icon} text-orange-600 text-base`}></i>
                </div>
                <h3 className="text-sm font-extrabold text-gray-900 mb-1.5">{p.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/ESA-letter-verification"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-verified-badge-line"></i>
              How Verification Works
            </Link>
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-orange-400 text-orange-600 text-sm font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Get Your Verified Letter
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-orange-200 overflow-hidden ${className}`}>
      <div className="bg-orange-500 px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-white/15 rounded-lg flex-shrink-0">
          <i className="ri-verified-badge-line text-white text-base"></i>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-white">Landlord Verification Included</p>
          <p className="text-xs text-white/70 mt-0.5">Privacy-safe · Instant online check</p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {points.map((p) => (
          <div key={p.title} className="flex items-start gap-3 min-w-0">
            <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
              <i className={`${p.icon} text-orange-600 text-xs`}></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-gray-800">{p.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 flex items-center gap-3 flex-wrap">
        <Link
          to="/ESA-letter-verification"
          className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:underline cursor-pointer"
        >
          <i className="ri-external-link-line text-xs"></i>
          How verification works
        </Link>
      </div>
    </div>
  );
}
