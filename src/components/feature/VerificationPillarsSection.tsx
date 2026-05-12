import { Link } from "react-router-dom";

interface VerificationPillarsSectionProps {
  /** "full" = section header + intro + 4 large cards (used on /esa-letter-verification).
   *  "compact" = tighter section, smaller intro, no large eyebrow. Suitable for homepage/landing trust placement. */
  variant?: "full" | "compact";
  /** Show the "Verify a Letter ID" CTA below the cards. */
  showCTA?: boolean;
  /** Show the small "no health information is ever shared" privacy note below. */
  showPrivacyNote?: boolean;
  /** Override the surrounding background (defaults to neutral so it sits well between sections). */
  className?: string;
}

const pillars = [
  {
    icon: "ri-user-star-line",
    title: "Licensed Mental Health Practitioners",
    desc: "Every letter is signed by a state-licensed clinician — LCSW, LMHC, LMFT, LPC, or psychologist — verified against the relevant state licensing board before they join our network.",
    points: [
      "Active state license required",
      "Continuous license monitoring",
      "NPI number on every letter",
    ],
    accent: "from-[#1a5c4f]/10 to-[#1a5c4f]/0",
  },
  {
    icon: "ri-home-heart-line",
    title: "Fair Housing Act Compliant",
    desc: "Our documentation is structured to meet the Fair Housing Act and HUD reasonable-accommodation guidance, so landlords have a clear, lawful basis to honor your request.",
    points: [
      "FHA reasonable accommodation language",
      "Recognized by HUD guidance",
      "Used in all 50 states + DC",
    ],
    accent: "from-[#2c5282]/10 to-[#2c5282]/0",
  },
  {
    icon: "ri-vidicon-line",
    title: "Telehealth Clinical Process",
    desc: "Every letter follows a genuine telehealth evaluation with a licensed clinician — never an auto-generated form. The provider's name and credentials appear on the document.",
    points: [
      "Real video consultation",
      "HIPAA-secure platform",
      "Clinician-signed PDF",
    ],
    accent: "from-[#1a5c4f]/10 to-[#1a5c4f]/0",
  },
  {
    icon: "ri-shield-keyhole-line",
    title: "Verification ID Authenticity",
    desc: "Each finalized letter carries a unique Verification ID stamped on the document. Landlords confirm authenticity at /verify — no diagnosis, no health information shared.",
    points: [
      "Cryptographically unique ID",
      "Instant landlord lookup",
      "Privacy-safe by design",
    ],
    accent: "from-[#2c5282]/10 to-[#2c5282]/0",
  },
];

export default function VerificationPillarsSection({
  variant = "full",
  showCTA = false,
  showPrivacyNote = false,
  className = "",
}: VerificationPillarsSectionProps) {
  const isCompact = variant === "compact";

  return (
    <section
      className={`${isCompact ? "py-12 md:py-16" : "py-16 md:py-20"} ${className || "bg-[#f8faf9]"}`}
    >
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className={`text-center ${isCompact ? "mb-10" : "mb-12 md:mb-14"}`}>
          <span className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            Why Landlords Trust PawTenant Letters
          </span>
          <h2
            className={`${
              isCompact ? "text-2xl md:text-[1.7rem]" : "text-2xl md:text-3xl"
            } font-extrabold text-gray-900 mb-3 tracking-tight`}
          >
            Built on Four Pillars of Verification
          </h2>
          <p
            className={`text-gray-500 ${
              isCompact ? "text-sm" : "text-sm md:text-base"
            } max-w-2xl mx-auto leading-relaxed`}
          >
            Every letter we issue is grounded in licensed clinical practice, federal housing law,
            real telehealth evaluation, and a verifiable ID system landlords can check in seconds.
          </p>
        </div>

        {/* Pillar cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {pillars.map((card) => (
            <div
              key={card.title}
              className={`relative bg-white rounded-2xl border border-gray-100 ${
                isCompact ? "p-6 md:p-7" : "p-7 md:p-8"
              } hover:border-[#b8ddd5] transition-colors`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent} rounded-t-2xl`}
              />
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 flex items-center justify-center bg-[#e8f5f1] rounded-xl flex-shrink-0">
                  <i className={`${card.icon} text-[#1a5c4f] text-xl`}></i>
                </div>
                <div className="min-w-0">
                  <h3
                    className={`${
                      isCompact ? "text-base" : "text-base md:text-lg"
                    } font-extrabold text-gray-900 mb-2 leading-snug`}
                  >
                    {card.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-4">{card.desc}</p>
                  <ul className="space-y-1.5">
                    {card.points.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 text-xs text-gray-700 font-medium"
                      >
                        <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-sm"></i>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(showCTA || showPrivacyNote) && (
          <div className="mt-9 flex flex-col items-center gap-4">
            {showCTA && (
              <Link
                to="/esa-letter-verification"
                className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-[#1a5c4f] text-white text-sm font-bold rounded-md hover:bg-[#164d42] transition-colors cursor-pointer"
              >
                <i className="ri-shield-check-line"></i>
                See How Landlord Verification Works
              </Link>
            )}
            {showPrivacyNote && (
              <p className="text-xs text-gray-500 max-w-md text-center leading-relaxed">
                <i className="ri-lock-line text-[#1a5c4f] mr-1"></i>
                No diagnosis, treatment notes, or personal health information are ever disclosed
                during verification.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
