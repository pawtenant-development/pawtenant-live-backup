import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import VerificationPillarsSection from "@/components/feature/VerificationPillarsSection";

const steps = [
  {
    number: "01",
    icon: "ri-file-text-line",
    title: "Provider Submits Your Letter",
    desc: "Once a licensed mental health professional finalizes and signs your ESA or PSD letter, it is submitted through our secure provider portal.",
  },
  {
    number: "02",
    icon: "ri-qr-code-line",
    title: "Unique Verification ID Is Issued",
    desc: "Our system automatically generates a unique Verification ID (e.g. ESA-CA-8F3K92) and stamps it directly onto your letter document.",
  },
  {
    number: "03",
    icon: "ri-send-plane-line",
    title: "You Receive Your Verified Letter",
    desc: "Your letter — with the Verification ID printed on it — is delivered to you. You share it with your landlord or housing provider as needed.",
  },
  {
    number: "04",
    icon: "ri-shield-check-line",
    title: "Landlord Verifies Instantly",
    desc: "Your landlord visits pawtenant.com/verify, enters the ID, and instantly sees the letter status, provider credentials, and license numbers — nothing else.",
  },
];

const privacyPoints = [
  {
    icon: "ri-eye-off-line",
    title: "No Diagnosis or Condition",
    desc: "Your mental health condition, diagnosis, or treatment details are never disclosed during verification.",
  },
  {
    icon: "ri-user-unfollow-line",
    title: "No Patient Identity",
    desc: "Your name, email, phone number, or any personal identifying information is never returned to the person verifying.",
  },
  {
    icon: "ri-hospital-line",
    title: "No Medical Records",
    desc: "Verification does not expose any assessment data, clinical notes, or health records of any kind.",
  },
  {
    icon: "ri-lock-password-line",
    title: "HIPAA-Aligned",
    desc: "The entire verification system is designed around HIPAA principles — only public professional credentials are shared.",
  },
];

const providerFields = [
  { icon: "ri-user-star-line", label: "Provider full name and title" },
  { icon: "ri-id-card-line", label: "NPI number (public registry)" },
  { icon: "ri-map-pin-2-line", label: "State license number(s)" },
  { icon: "ri-verified-badge-line", label: "Letter type (ESA or PSD)" },
  { icon: "ri-calendar-check-line", label: "Issue date" },
  { icon: "ri-map-2-line", label: "State the letter was issued for" },
];

const faqs = [
  {
    q: "Can my landlord see my diagnosis?",
    a: "No. The verification page only shows provider credentials and letter status. Your diagnosis, condition, and all health information are completely hidden.",
  },
  {
    q: "What if my landlord says the ID doesn't work?",
    a: "Verification IDs are only issued for letters finalized through our provider portal. If you received your letter recently, the ID should be active. Contact our support team if you experience any issues.",
  },
  {
    q: "Does the verification ID expire?",
    a: "Verification IDs remain valid as long as your letter is in good standing. If a letter is revoked or superseded, the ID will reflect that status — but your health information is still never disclosed.",
  },
  {
    q: "Is this accepted under the Fair Housing Act?",
    a: "Yes. Under the FHA, landlords may verify the authenticity of an ESA letter and confirm the provider is a licensed mental health professional. Our verification system provides exactly that — and nothing more.",
  },
  {
    q: "Can my landlord request my medical records through this system?",
    a: "No. The verification tool is read-only and returns only what is described above. It cannot be used to request, access, or retrieve any medical records.",
  },
];

export default function ESALetterVerificationPage() {
  return (
    <>
      <SharedNavbar />

      <main>
        {/* Hero — calm, professional, trust-focused */}
        <section className="relative bg-white border-b border-gray-100 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#e8f5f1_0%,transparent_60%)] pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-6 pt-28 md:pt-36 pb-14 md:pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-7">
                <span className="inline-flex items-center gap-2 bg-[#1a5c4f]/10 text-[#1a5c4f] text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                  <i className="ri-verified-badge-line"></i>
                  Landlord Verification System
                </span>
                <h1 className="text-3xl md:text-4xl lg:text-[2.6rem] font-extrabold text-gray-900 mb-4 leading-[1.15] tracking-tight">
                  ESA Letter Verification —<br className="hidden md:block" />
                  <span className="text-[#1a5c4f]"> How Landlords Confirm Authenticity</span>
                </h1>
                <p className="text-gray-600 text-base md:text-[1.05rem] leading-relaxed max-w-xl mb-7">
                  Every ESA and PSD letter issued through PawTenant includes a unique Verification ID. Landlords can confirm the letter and provider credentials online in seconds — without seeing any of your private health information.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <Link
                    to="/verify"
                    className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-[#1a5c4f] text-white text-sm font-bold rounded-md hover:bg-[#164d42] transition-colors cursor-pointer"
                  >
                    <i className="ri-search-line"></i>
                    Verify a Letter ID
                  </Link>
                  <Link
                    to="/assessment"
                    className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-white border border-[#1a5c4f] text-[#1a5c4f] text-sm font-bold rounded-md hover:bg-[#f0faf7] transition-colors cursor-pointer"
                  >
                    Get a Verified ESA Letter
                    <i className="ri-arrow-right-line"></i>
                  </Link>
                </div>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="ri-shield-check-line text-[#1a5c4f]"></i>
                    HIPAA-aligned
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i className="ri-user-star-line text-[#1a5c4f]"></i>
                    Licensed clinicians
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i className="ri-home-heart-line text-[#1a5c4f]"></i>
                    Fair Housing Act compliant
                  </span>
                </div>
              </div>

              {/* Hero visual: mock verification result card */}
              <div className="lg:col-span-5">
                <div className="bg-white rounded-2xl border border-[#b8ddd5] shadow-[0_8px_30px_-12px_rgba(26,92,79,0.18)] overflow-hidden">
                  <div className="bg-[#1a5c4f] px-5 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-white/15 rounded-lg">
                      <i className="ri-verified-badge-line text-white text-base"></i>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white">Letter Verified</p>
                      <p className="text-xs text-white/70 mt-0.5">Status: Valid · ESA Letter</p>
                    </div>
                    <span className="ml-auto bg-emerald-400/15 text-emerald-200 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-300/40">
                      Valid
                    </span>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {[
                      { label: "Verification ID", value: "ESA-CA-8F3K92", mono: true },
                      { label: "Letter Type", value: "Emotional Support Animal", mono: false },
                      { label: "State", value: "California", mono: false },
                      { label: "Issue Date", value: "April 6, 2026", mono: false },
                      { label: "Provider", value: "Sarah Mitchell, LCSW", mono: false },
                      { label: "NPI Number", value: "1234567890", mono: true },
                      { label: "State License", value: "CA-LCSW-98234", mono: true },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-xs text-gray-400 font-medium flex-shrink-0">{row.label}</span>
                        <span className={`text-xs text-gray-800 font-bold text-right ${row.mono ? "font-mono" : ""}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 pb-5">
                    <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-lg px-4 py-3 flex items-start gap-2.5">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-lock-line text-[#1a5c4f] text-xs"></i>
                      </div>
                      <p className="text-xs text-[#1a5c4f]/85 leading-relaxed">
                        No patient health information is displayed on this page.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust pillars — large, professional cards */}
        <VerificationPillarsSection variant="full" />

        {/* How it works — 4 steps */}
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">
                How the Verification Process Works
              </h2>
              <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                From letter submission to landlord confirmation — the entire process is automatic, secure, and privacy-safe.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
              {steps.map((step) => (
                <div key={step.number} className="relative">
                  <div className="bg-[#f8faf9] rounded-xl border border-gray-100 p-6 h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs font-extrabold text-[#1a5c4f]/40 tracking-widest">{step.number}</span>
                      <div className="w-9 h-9 flex items-center justify-center bg-[#e8f5f1] rounded-lg">
                        <i className={`${step.icon} text-[#1a5c4f] text-base`}></i>
                      </div>
                    </div>
                    <h3 className="text-sm font-extrabold text-gray-900 mb-2 leading-snug">{step.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What landlords see */}
        <section className="py-16 md:py-20 bg-[#f8faf9]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
              <div>
                <span className="inline-flex items-center gap-2 bg-[#1a5c4f]/10 text-[#1a5c4f] text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
                  <i className="ri-eye-line"></i>
                  What Landlords See
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-4 leading-tight tracking-tight">
                  Only Public Professional Credentials
                </h2>
                <p className="text-gray-500 text-sm md:text-base leading-relaxed mb-6">
                  When a landlord enters a Verification ID at pawtenant.com/verify, they see exactly the following — and nothing else. No patient data. No health information. No diagnosis.
                </p>
                <ul className="space-y-3">
                  {providerFields.map((f) => (
                    <li key={f.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                        <i className={`${f.icon} text-[#1a5c4f] text-sm`}></i>
                      </div>
                      <span className="text-sm text-gray-700 font-medium">{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lifestyle visual — real existing asset */}
              <div className="relative">
                <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                  <img
                    src="/assets/blog/hands-typing-dog.jpg"
                    alt="Reviewing housing paperwork at home alongside an emotional support dog"
                    className="w-full h-full object-cover aspect-[4/3]"
                    loading="lazy"
                  />
                </div>
                <div className="absolute -bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-[78%] bg-white rounded-xl border border-[#b8ddd5] shadow-[0_8px_24px_-12px_rgba(26,92,79,0.25)] px-5 py-4 flex items-start gap-3">
                  <div className="w-9 h-9 flex items-center justify-center bg-[#1a5c4f] rounded-lg flex-shrink-0">
                    <i className="ri-shield-keyhole-line text-white text-base"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-gray-900 leading-snug">Privacy by design</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Verification confirms authenticity. It never exposes health information.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy protection */}
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 bg-[#1a5c4f]/10 text-[#1a5c4f] text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
                <i className="ri-shield-keyhole-line"></i>
                Privacy Protection
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">
                What Is Never Disclosed
              </h2>
              <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                The verification system is built with a strict allowlist — only explicitly approved fields are ever returned. Everything else is blocked at the database level.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {privacyPoints.map((p) => (
                <div key={p.title} className="bg-[#f8faf9] rounded-xl border border-gray-100 p-6">
                  <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg mb-3">
                    <i className={`${p.icon} text-red-400 text-lg`}></i>
                  </div>
                  <h3 className="text-sm font-extrabold text-gray-900 mb-1.5 leading-snug">{p.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-20 bg-[#f8faf9]">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-gray-500 text-sm md:text-base leading-relaxed">
                Common questions from tenants and landlords about the verification system.
              </p>
            </div>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q} className="bg-white rounded-xl border border-gray-100 p-6">
                  <h3 className="text-sm font-extrabold text-gray-900 mb-2 flex items-start gap-2">
                    <div className="w-5 h-5 flex items-center justify-center bg-[#e8f5f1] rounded-md flex-shrink-0 mt-0.5">
                      <i className="ri-question-line text-[#1a5c4f] text-xs"></i>
                    </div>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed pl-7">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related resources — light contextual cross-links to peer
            guides + the all-states hub. Keeps verification trust
            continuity by surfacing the FHA framing and process explainer
            landlords and tenants tend to look at together. Three cards
            only — not a giant link block. */}
        <section className="py-14 md:py-16 bg-white border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-2 bg-[#1a5c4f]/10 text-[#1a5c4f] text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-3">
                <i className="ri-links-line"></i>
                Related Guides
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">
                For tenants and housing providers
              </h2>
              <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                Verification confirms authenticity. The pages below cover the rest — federal protections, the application process, and per-state compliance.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {[
                {
                  to: "/housing-rights-esa",
                  icon: "ri-home-heart-line",
                  title: "ESA Letter for Housing",
                  desc: "Fair Housing Act protections, landlord obligations, and what valid ESA documentation must include.",
                },
                {
                  to: "/how-to-get-esa-letter",
                  icon: "ri-file-text-line",
                  title: "How to Get an ESA Letter",
                  desc: "The step-by-step application process — assessment, licensed evaluation, and signed letter.",
                },
                {
                  to: "/explore-esa-letters-all-states",
                  icon: "ri-map-pin-2-line",
                  title: "ESA Guidance by State",
                  desc: "State-specific accommodation rules and licensed-provider requirements for all 50 US states.",
                },
              ].map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className="group flex items-start gap-3 p-5 rounded-xl border border-gray-100 hover:border-[#b8ddd5] hover:bg-[#f0faf7]/40 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                    <i className={`${card.icon} text-[#1a5c4f] text-lg`}></i>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-gray-900 mb-1 leading-snug group-hover:text-[#1a5c4f] transition-colors">
                      {card.title}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-14 md:py-16 bg-[#1a5c4f]">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">
              Ready to Get a Verified ESA Letter?
            </h2>
            <p className="text-white/70 text-sm md:text-base leading-relaxed mb-8 max-w-xl mx-auto">
              Every letter we issue includes a Verification ID automatically. Start your assessment today and receive a letter your landlord can verify in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-white text-[#1a5c4f] text-sm font-bold rounded-md hover:bg-[#f0faf7] transition-colors cursor-pointer"
              >
                Start Your Assessment
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link
                to="/verify"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-white/10 border border-white/30 text-white text-sm font-bold rounded-md hover:bg-white/20 transition-colors cursor-pointer"
              >
                <i className="ri-search-line"></i>
                Verify an Existing Letter
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SharedFooter />
    </>
  );
}
