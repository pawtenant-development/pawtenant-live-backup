import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import VerificationPillarsSection from "@/components/feature/VerificationPillarsSection";
import PublicPageHero from "@/components/feature/PublicPageHero";
import EsaLetterVerificationWidget from "@/components/feature/EsaLetterVerificationWidget";
import SampleLetterShowcase from "@/components/feature/SampleLetterShowcase";
import NotaryCoordinationSection from "@/components/feature/NotaryCoordinationSection";

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
    title: "Scan-To-Verify QR Code Is Added",
    desc: "Our system records the letter and places a discreet verification QR code on the letter document. Scanning it opens the verification result — no ID is printed on the letter.",
  },
  {
    number: "03",
    icon: "ri-send-plane-line",
    title: "You Receive Your Verified Letter",
    desc: "Your letter — carrying a discreet verification QR code — is delivered to you. You share it with your landlord or housing provider as needed.",
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
    a: "Verification records are only created for letters finalized through our provider portal. If you received your letter recently, scanning its QR code should return an active result. Contact our support team if you experience any issues.",
  },
  {
    q: "Does the verification result expire?",
    a: "A verification result stays valid as long as your letter is in good standing. If a letter is revoked or superseded, the result reflects that status — but your health information is still never disclosed.",
  },
  {
    q: "Is this accepted under the Fair Housing Act?",
    a: "Yes. Under the FHA, landlords may verify the authenticity of an ESA letter and confirm the provider is a licensed mental health professional. Our verification system provides exactly that — and nothing more.",
  },
  {
    q: "Can my landlord request my medical records through this system?",
    a: "No. The verification tool is read-only and returns only what is described above. It cannot be used to request, access, or retrieve any medical records.",
  },
  {
    q: "How does my landlord verify my letter?",
    a: "Your landlord scans the discreet QR code on your letter, lands on pawtenant.com/verify, and sees the letter status plus the provider's licensed credentials — name, NPI number, state license, letter type, and issue date. The whole confirmation takes a few seconds and never exposes your health information, diagnosis, or contact details.",
  },
  {
    q: "Why does PawTenant use a scan-to-verify QR code instead of just a printed letter?",
    a: "A printed letter alone cannot prove on its own that the provider is real, that the license is active, or that the letter has not been altered. The QR code gives landlords a privacy-respecting way to confirm those things directly from PawTenant's records, which makes a valid ESA letter easier to trust and harder to fake — protecting both legitimate tenants and the property owner.",
  },
];

export default function ESALetterVerificationPage() {
  return (
    <>
      {/* FAQPage JSON-LD for the visible verification FAQ below. Matches the
          existing pattern used on /how-to-get-esa-letter and the two cost +
          housing-rights SEO pages. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      }) }} />
      <SharedNavbar />

      <main>
        {/* Hero — centered, homepage typography, with the REAL verification tool
            above the fold (LIVE-PUBLIC-PAGES-...-001).

            The previous hero was left-aligned and its right column rendered a
            mock "Letter Verified" result card containing an invented provider
            name, a fake NPI (1234567890) and a fake state license number,
            presented without any sample labelling. Showing a fabricated
            verification result on the verification page is exactly what must not
            happen, so it is replaced by the actual entry point to /verify. */}
        <PublicPageHero
          eyebrow="Landlord Verification System"
          heading="Check That an ESA Letter Is Real"
          subheading="Every ESA and PSD letter issued through PawTenant carries a discreet verification QR code. Landlords and tenants scan it to confirm the document and the issuing provider's credentials in seconds — without any private health information being shown."
          trustPoints={[
            "Licensed clinicians",
            "Discreet verification QR code",
            "No health information disclosed",
          ]}
        >
          <EsaLetterVerificationWidget
            variant="card"
            className="shadow-[0_10px_40px_-24px_rgba(15,23,42,0.28)]"
            heading="Verify a letter now"
            copy="Scan the QR code on the document, or enter a supplied Verification ID."
          />
        </PublicPageHero>

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
                  When a landlord scans the QR code and lands on pawtenant.com/verify, they see exactly the following — and nothing else. No patient data. No health information. No diagnosis.
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
                    src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                    alt="Person reviewing housing paperwork at home with their dog"
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
              Every letter we issue carries a verification QR code automatically. Start your assessment today and receive a letter your landlord can verify in seconds.
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

        {/* Related Resources — tenants who arrive here often haven't yet
            applied; provide a natural path back to the how-to and housing
            rights pages without disturbing the verification-focused CTA. */}
        {/* Large, readable sample letter — replaces reliance on a small preview
            elsewhere on the page. Redacted specimen; placeholders only. */}
        <SampleLetterShowcase
          className="bg-white border-t border-gray-100"
          heading="What a verifiable PawTenant letter looks like"
          copy="A redacted specimen. The names, dates and identifiers on it are placeholders and do not belong to a real person, provider or issued letter."
          fields={[
            "The issuing provider's name, credential and license state",
            "The provider's signature and the date the letter was issued",
            "A unique letter verification ID your housing provider can check",
            "A statement of the need for the animal — never your diagnosis",
          ]}
        />

        {/* What makes a PawTenant letter verifiable — accurate trust signals only.
            Support wording is deliberately qualified: the published support
            contract is Mon-Fri 7am-6pm CT / Sat 9am-4pm CT (see SharedFooter),
            so "24/7 human support" would be false. Portal access and request
            submission ARE always available, and only that is claimed. */}
        <section className="py-14 sm:py-16 bg-[#f8faf9] border-t border-gray-100">
          <div className="max-w-5xl mx-auto px-5 sm:px-6">
            <div className="text-center mb-9">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
                What makes a PawTenant letter verifiable
              </h2>
              <p className="text-gray-500 text-sm max-w-2xl mx-auto leading-relaxed">
                Each of these is something a housing provider can check independently.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { i: "ri-user-star-line", t: "Licensed professional review", d: "Every letter is reviewed and signed by a state-licensed mental health professional after an individual evaluation." },
                { i: "ri-id-card-line", t: "Named provider and credentials", d: "The provider's name, credential and license state appear on the document — not a company signature." },
                { i: "ri-medal-line", t: "NPI lookup where available", d: "Where a provider has a National Provider Identifier, it can be looked up in the public CMS NPPES registry." },
                { i: "ri-qr-code-line", t: "Discreet verification QR code", d: "A QR code tied to your document — scanning it opens the result at pawtenant.com/verify." },
                { i: "ri-calendar-check-line", t: "Issuance date on the letter", d: "The date the provider issued the document is printed on it, so currency can be confirmed." },
                { i: "ri-lock-line", t: "Secure portal access", d: "Your documents stay available in your account portal, which you can reach at any time." },
              ].map((c) => (
                <div key={c.t} className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="w-9 h-9 rounded-lg bg-[#1a5c4f]/10 flex items-center justify-center mb-3">
                    <i className={`${c.i} text-[#1a5c4f]`} aria-hidden="true"></i>
                  </div>
                  <h3 className="text-[14px] font-bold text-gray-900 mb-1.5">{c.t}</h3>
                  <p className="text-[13px] text-gray-600 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>

            {/* Reasonable Accommodation — accurate scope. NOT automatically included. */}
            <div className="mt-8 grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-[15px] font-bold text-gray-900 mb-2">
                  Reasonable Accommodation documentation
                </h3>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Some housing providers ask a tenant to complete a <strong>separate</strong>{" "}
                  reasonable accommodation form in addition to the letter. PawTenant offers document
                  support for that form as an optional add-on. It is{" "}
                  <strong>not automatically included</strong> — it applies only if you purchased the
                  applicable package or add-on, and a housing provider&rsquo;s approval is never
                  guaranteed.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="text-[15px] font-bold text-gray-900 mb-2">Support access</h3>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  You have <strong>24/7 access to your secure portal</strong>, and you can{" "}
                  <strong>submit a support request at any time</strong> — self-service help is
                  available around the clock. Our support team replies during published business
                  hours (Mon&ndash;Fri 7am&ndash;6pm CT, Sat 9am&ndash;4pm CT).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Notarization — INFORMATIONAL ONLY (owner-approved copy verbatim).
            No checkout, no DB request, no provider notification.
            Operational build queued as ORDER-NOTARY-SERVICE-WORKFLOW-001. */}
        <NotaryCoordinationSection className="bg-white border-t border-gray-100" />

        <section className="py-12 sm:py-16 bg-slate-50 border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-tight">
                Related Resources
              </h2>
              <p className="text-[14px] text-slate-600 leading-relaxed">
                Learn more about how PawTenant ESA letters work and your housing rights.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <Link
                to="/how-to-get-esa-letter"
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
              >
                <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                  How to Get an ESA Letter
                </div>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  A step-by-step guide to getting a clinically reviewed ESA letter from a licensed mental health professional.
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                  Read more <i className="ri-arrow-right-line" />
                </span>
              </Link>
              <Link
                to="/housing-rights-esa"
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
              >
                <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                  Fair Housing Act Rights
                </div>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  How federal Fair Housing law supports reasonable accommodation requests for tenants with a qualifying ESA.
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                  Read more <i className="ri-arrow-right-line" />
                </span>
              </Link>
              <Link
                to="/esa-letter-cost"
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
              >
                <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                  ESA Letter Pricing
                </div>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  Transparent pricing for a clinically reviewed ESA letter, with a refund if you don&rsquo;t qualify after review.
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                  Read more <i className="ri-arrow-right-line" />
                </span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SharedFooter />
    </>
  );
}
