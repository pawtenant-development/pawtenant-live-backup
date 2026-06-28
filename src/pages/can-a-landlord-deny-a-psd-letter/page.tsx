import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
  LifestyleImageSection,
  JsonLd,
} from "../../components/feature/SeoKit";
import {
  graph,
  organizationSchema,
  serviceSchema,
  articleSchema,
  webPageSchema,
  faqSchema,
  breadcrumbSchema,
  type FaqItem,
} from "@/lib/seoSchema";

const PATH = "/can-a-landlord-deny-a-psd-letter";
const TITLE = "Can a Landlord Deny a PSD Letter? | PawTenant";
const DESC =
  "Can a landlord deny a psychiatric service dog letter? What a landlord can verify, the limited reasons a request can be denied, and the calm steps to take if it is.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-scales-3-line", label: "Your rights" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const canVerify = [
  {
    icon: "ri-question-line",
    title: "Ask if the dog is needed for a disability",
    desc: "When the disability isn't obvious, a landlord may ask whether the animal is needed because of a disability — not for your diagnosis.",
  },
  {
    icon: "ri-shield-star-line",
    title: "Ask what task the dog performs",
    desc: "They may ask what work or task the dog is trained to do — the question that distinguishes a service dog from a comfort animal.",
  },
  {
    icon: "ri-file-search-line",
    title: "Request reasonable documentation",
    desc: "For a non-obvious disability, they can ask for documentation that reasonably supports the need — which a PSD letter provides.",
  },
];

const validReasons = [
  {
    icon: "ri-alert-line",
    title: "A documented direct threat",
    desc: "If the specific animal poses a direct threat to others' health or safety that can't be reduced by another reasonable accommodation — based on real conduct, not breed or stereotype.",
  },
  {
    icon: "ri-home-gear-line",
    title: "Substantial physical damage",
    desc: "If the specific animal would cause substantial physical damage to property that can't be reduced by another reasonable accommodation.",
  },
  {
    icon: "ri-building-line",
    title: "Undue burden or fundamental change",
    desc: "In rare cases where the accommodation would impose an undue financial or administrative burden, or fundamentally alter the housing provider's operations.",
  },
  {
    icon: "ri-error-warning-line",
    title: "Documentation that can't be verified",
    desc: "If documentation can't be reasonably verified — for example, a paid \"registration\" with no licensed provider behind it. A letter from a licensed provider is verifiable.",
  },
];

const steps = [
  { icon: "ri-mail-send-line", title: "Put the request in writing", desc: "Submit a written reasonable-accommodation request with your PSD letter so there's a clear record." },
  { icon: "ri-chat-check-line", title: "Ask for the reason in writing", desc: "If denied, politely ask the landlord to state the specific reason in writing." },
  { icon: "ri-customer-service-2-line", title: "Offer verification", desc: "Provide the provider's license details so the landlord can confirm the letter is genuine." },
  { icon: "ri-government-line", title: "Know where to escalate", desc: "If a valid request is refused without a lawful reason, you can contact HUD or a fair housing agency." },
];

const faqs: FaqItem[] = [
  {
    q: "Can a landlord deny a PSD letter?",
    a: "A landlord must consider a reasonable-accommodation request supported by a valid psychiatric service dog letter and generally cannot deny it without a lawful, individualized reason. They can verify the documentation, but \"must consider\" is not \"must accept\" — denials are limited to specific situations like a documented direct threat, substantial property damage, undue burden, or documentation that can't be verified.",
  },
  {
    q: "What reasons can a landlord legally use to deny a service dog?",
    a: "Lawful reasons are narrow and individualized: the specific animal is a documented direct threat to others' safety, it would cause substantial physical damage that can't be reduced by another accommodation, the accommodation is an undue financial or administrative burden, or the documentation can't be reasonably verified. A denial can't be based on breed, weight, a no-pets policy, or general fear.",
  },
  {
    q: "Can a landlord reject my PSD because of a no-pets policy or breed restriction?",
    a: "Generally no. A psychiatric service dog approved as a reasonable accommodation is not treated as a pet, so a no-pets policy, breed ban, or weight limit by itself is not a lawful reason to deny it. The request is still considered individually.",
  },
  {
    q: "Can a landlord ask for my diagnosis or medical records?",
    a: "No. A landlord may ask whether the dog is needed because of a disability and what task it is trained to perform, and may request documentation that reasonably supports a non-obvious disability. They generally cannot demand your specific diagnosis, full medical records, or a live demonstration of the dog's task.",
  },
  {
    q: "What should I do if my landlord denies my psychiatric service dog?",
    a: "Put your request and the denial in writing, ask the landlord to state the specific reason, and offer to let them verify the provider's license details. If a valid request is refused without a lawful reason, you can file a complaint with HUD or a state or local fair housing agency. No service can guarantee the outcome.",
  },
  {
    q: "Does a PSD letter guarantee my landlord will approve the dog?",
    a: "No. A valid letter strengthens your reasonable-accommodation request and requires the landlord to consider it, but it cannot guarantee approval. Each request is decided individually based on the specific facts.",
  },
  {
    q: "Is an online PSD letter enough for a landlord?",
    a: "Yes, when it comes from a provider licensed in your state who actually evaluated you. The fact that it was issued online doesn't reduce its validity. What a landlord can reject is documentation that can't be verified — which is why a letter from a real licensed provider matters.",
  },
];

export default function CanALandlordDenyAPsdLetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Psychiatric service dog (PSD) letter for housing",
      description:
        "Connects people with licensed mental health providers who can issue a psychiatric service dog letter supporting a reasonable-accommodation request for housing when clinically appropriate. No guaranteed approval.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Can a Landlord Deny a PSD Letter?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Can a Landlord Deny a PSD Letter?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="can landlord deny PSD letter, can landlord deny psychiatric service dog, service dog letter landlord denial, PSD housing accommodation denied, landlord deny service dog reasons"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-scales-3-line"></i>
                Your housing rights
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Can a Landlord Deny a PSD Letter?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A landlord can verify your documentation — but generally can&rsquo;t simply reject a
                valid disability-related request. Here&rsquo;s what a landlord can and can&rsquo;t do,
                the limited reasons a request can be denied, and the calm steps to take.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  to={withAttribution("/psd-assessment")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-stethoscope-line"></i>
                  Start PSD Assessment
                </Link>
                <a
                  href="#valid-reasons"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-information-line"></i>
                  When It Can Be Denied
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A renter reviewing a reasonable-accommodation request for their psychiatric service dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-shield-check-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Must consider the request</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can a landlord deny a PSD letter?">
            <p>
              A landlord <strong>must consider</strong> a reasonable-accommodation request supported
              by a valid psychiatric service dog letter and generally{" "}
              <strong>cannot deny it without a lawful, individualized reason</strong>. They can{" "}
              <strong>verify</strong> the documentation — but &ldquo;must consider&rdquo; is not the
              same as &ldquo;must accept.&rdquo;
            </p>
            <p>
              Denials are limited to specific situations: a <strong>documented direct threat</strong>,{" "}
              <strong>substantial property damage</strong>, an <strong>undue burden</strong>, or{" "}
              <strong>documentation that can&rsquo;t be verified</strong>. A denial{" "}
              <strong>can&rsquo;t</strong> be based on breed, weight, or a no-pets policy — and no
              service can guarantee the outcome.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHAT A LANDLORD CAN VERIFY */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What they can do
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a landlord can verify
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {canVerify.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VALID REASONS TO DENY */}
      <section id="valid-reasons" className="scroll-mt-24 py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The limited exceptions
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              When a request can be lawfully denied
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              These are narrow and based on the specific animal and situation — never on breed,
              weight, or a no-pets policy.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {validReasons.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg mb-3 ring-1 ring-gray-100">
                  <i className={`${item.icon} text-[#4A8472] text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STEPS IF DENIED */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              If you&rsquo;re denied
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Calm steps to take
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((item, i) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg">
                    <i className={`${item.icon} text-orange-500 text-xl`}></i>
                  </div>
                  <span className="text-[11px] font-bold text-orange-300">0{i + 1}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            Working through an ESA denial instead? See{" "}
            <Link to="/how-to-respond-to-esa-letter-denial" className="text-orange-600 font-semibold hover:underline">
              how to respond to an ESA letter denial
            </Link>
            .
          </p>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
        alt="A renter settled into their home with their psychiatric service dog after an approved request"
        eyebrow="Verifiable beats deniable"
        heading="A letter a landlord can confirm"
        body="The documentation a landlord can lawfully reject is the kind they can't verify. A psychiatric service dog letter from a provider licensed in your state names the provider and their license details, so a landlord can confirm it's genuine — which removes one of the few lawful grounds for denial."
        bullets={[
          "Named, licensed provider with verifiable details.",
          "Frames a Fair Housing Act accommodation request.",
          "Refund if you don't qualify.",
        ]}
      />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Can a landlord deny a PSD letter? FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Start with verifiable documentation
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            If you qualify, a licensed provider issues a signed, verifiable psychiatric service dog
            letter that a landlord can confirm — with a refund if you don&rsquo;t qualify.
          </p>
          <Link
            to={withAttribution("/psd-assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
            Start PSD Assessment
          </Link>
          <div className="mt-5">
            <LastUpdated date={UPDATED_HUMAN} />
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a PSD letter for a housing request." },
              { to: "/psychiatric-service-dog-letter-online", title: "Psychiatric service dog letter online", desc: "How the online PSD evaluation and letter work." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Which document fits your situation." },
              { to: "/blog/psychiatric-service-dog-housing-rights", title: "Psychiatric service dog housing rights", desc: "What renters should know about service dogs and housing." },
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "The ESA version of this question." },
              { to: "/housing-rights-esa", title: "ESA housing rights", desc: "What landlords can and can't ask under the FHA." },
            ]}
          />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <SharedFooter />
      <MobileStickyApplyCTA
        to="/psd-assessment"
        label="Start PSD Assessment"
        icon="ri-stethoscope-line"
      />
    </main>
  );
}
