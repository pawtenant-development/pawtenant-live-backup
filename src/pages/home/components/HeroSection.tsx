import { useAttributionParams } from "@/hooks/useAttributionParams";
import { DOCTORS } from "@/mocks/doctors";

const PROVIDERS = DOCTORS.map((d) => ({
  name: d.name,
  cred: d.title,
  role: d.role,
  img: d.image,
}));

const HOW_STEPS = [
  { icon: "ri-file-list-3-line", label: "Complete Assessment", step: "01" },
  { icon: "ri-stethoscope-line", label: "Provider Review", step: "02" },
  { icon: "ri-mail-check-line", label: "Receive ESA Letter", step: "03" },
];

export default function HeroSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section
      id="get-started"
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet="https://readdy.ai/api/search-image?query=warm%20cozy%20living%20room%20with%20a%20happy%20smiling%20woman%20sitting%20on%20sofa%20and%20her%20golden%20retriever%20dog%20sitting%20right%20next%20to%20her%20both%20clearly%20visible%20in%20frame%2C%20soft%20morning%20light%2C%20home%20interior%2C%20natural%20warm%20tones%2C%20lifestyle%20photography%2C%20professional%20photography%2C%20wide%20shot%20showing%20both%20subjects%20equally&width=600&height=900&seq=hero-mobile-v2&orientation=portrait"
            width={600}
            height={900}
          />
          <img
            src="https://readdy.ai/api/search-image?query=warm%20cozy%20living%20room%20with%20a%20happy%20woman%20sitting%20on%20sofa%20using%20laptop%20while%20her%20golden%20retriever%20dog%20rests%20beside%20her%2C%20soft%20morning%20light%2C%20home%20interior%20with%20plants%2C%20natural%20warm%20tones%2C%20lifestyle%20photography%2C%20shallow%20depth%20of%20field%2C%20professional%20photography&width=1440&height=900&seq=hero001&orientation=landscape"
            alt="Woman with dog getting ESA letter online"
            className="w-full h-full object-cover hero-img-position"
            width={1440}
            height={900}
            fetchPriority="high"
            loading="eager"
            decoding="async"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/60 to-gray-900/20"></div>
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 py-28 md:py-32">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <i className="ri-shield-check-line"></i>
            HIPAA Compliant &amp; 100% Legal
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-5">
            Get a <span className="text-orange-400">Legit ESA Letter</span> Online
            <br className="hidden sm:block" />
            {" "}Fast, Simple &amp; Stress Free
          </h1>

          <p className="text-gray-300 text-base sm:text-lg mb-7 leading-relaxed">
            Get your <strong className="text-white font-semibold">legitimate ESA letter online</strong> from licensed mental health professionals — accepted for housing nationwide under the Fair Housing Act. No waiting rooms, no hassle.
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-4 sm:gap-6 mb-6">
            {[
              { icon: "ri-shield-star-line", label: "HIPAA", value: "100% Compliant" },
              { icon: "ri-award-line", label: "Licensed", value: "Professionals" },
              { icon: "ri-timer-flash-line", label: "Fast", value: "Same-Day Delivery" },
              { icon: "ri-calendar-check-line", label: "3+ Years", value: "Of Experience" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
                  <i className={`${s.icon} text-white text-base`}></i>
                </div>
                <div>
                  <p className="text-white text-sm font-bold leading-tight">{s.value}</p>
                  <p className="text-gray-300 text-xs">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Legit ESA trust note */}
          <p className="text-orange-300 text-xs font-semibold mb-4 flex items-center gap-1.5">
            <i className="ri-shield-check-line"></i>
            100% legit ESA letter — signed by a licensed clinician, accepted by landlords nationwide
          </p>

          {/* 50 States Trust Badge */}
          <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-2.5 rounded-full mb-7">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-map-2-line text-orange-400"></i>
            </div>
            <span className="text-white text-xs font-semibold whitespace-nowrap">Serving all 50 US states</span>
            <div className="flex items-center gap-1">
              {["CA","TX","FL","NY","IL","PA","OH","GA","NC","MI"].map((s) => (
                <span key={s} className="text-white/60 text-xs font-medium hidden sm:inline">{s}</span>
              ))}
              <span className="text-white/50 text-xs hidden sm:inline">&amp; more</span>
            </div>
          </div>

          {/* CTA Buttons — unchanged */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <a
              href={withAttribution("/assessment")}
              className="whitespace-nowrap px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              Get Your Legit ESA Letter Now
              <i className="ri-arrow-right-line"></i>
            </a>
            <a
              href="#how-it-works"
              className="whitespace-nowrap px-7 py-3.5 border border-white/40 text-white font-semibold text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <i className="ri-play-circle-line"></i>
              How It Works
            </a>
          </div>

          {/* ── How It Works Mini-Cards ── */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {HOW_STEPS.map((s, i) => (
              <div key={s.step} className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm rounded-xl px-3 py-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
                    <i className={`${s.icon} text-white text-sm`}></i>
                  </div>
                  <div>
                    <p className="text-white/50 text-[10px] font-semibold leading-none">Step {s.step}</p>
                    <p className="text-white text-xs font-bold leading-tight">{s.label}</p>
                  </div>
                </div>
                {i < HOW_STEPS.length - 1 && (
                  <i className="ri-arrow-right-s-line text-white/30 text-sm flex-shrink-0"></i>
                )}
              </div>
            ))}
          </div>

          {/* ── Provider Credibility Strip ── */}
          <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl px-4 py-3">
            {/* Stacked avatars */}
            <div className="flex items-center">
              {PROVIDERS.map((p, i) => (
                <div
                  key={p.name}
                  className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/60 flex-shrink-0"
                  style={{ marginLeft: i === 0 ? 0 : "-10px", zIndex: PROVIDERS.length - i }}
                >
                  <img
                    src={p.img}
                    alt="Licensed clinician"
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
            {/* Text */}
            <div>
              <p className="text-white text-xs font-bold leading-tight">Licensed clinician review</p>
              <p className="text-white/60 text-[11px] leading-tight">100% online &middot; Real clinical evaluation</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
