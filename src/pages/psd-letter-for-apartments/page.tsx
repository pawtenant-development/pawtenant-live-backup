import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import PsdPricingMini from "../../components/feature/PsdPricingMini";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
  ComparisonTable,
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

const PATH = "/psd-letter-for-apartments";
const TITLE = "PSD Letter for Apartments and Housing Requests | PawTenant";
const DESC =
  "How a psychiatric service dog (PSD) letter supports an apartment or housing request: what a landlord can ask, Fair Housing framing, and when an ESA letter fits better.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-shield-check-line", label: "Signed PSD letter" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const landlordCanAsk = [
  {
    icon: "ri-question-line",
    title: "Is the dog needed because of a disability?",
    desc: "When the disability isn't obvious, a housing provider may ask whether the animal is needed because of a disability — but not for your diagnosis or medical records.",
  },
  {
    icon: "ri-shield-star-line",
    title: "What task is the dog trained to perform?",
    desc: "They may ask what work or task the dog is trained to do. This is the line that separates a psychiatric service dog from an emotional support animal.",
  },
  {
    icon: "ri-file-text-line",
    title: "Reasonable supporting documentation",
    desc: "For a disability that isn't obvious, a landlord can request documentation that reasonably supports the disability-related need — which is where a PSD letter helps.",
  },
];

const docChecklist = [
  { criterion: "Licensed provider", good: "The letter names a mental health professional licensed in your state, with their license type and number." },
  { criterion: "Disability-related need", good: "It states you have a disability-related need for a service dog — without disclosing your specific diagnosis." },
  { criterion: "Housing framing", good: "It frames a reasonable-accommodation request under the Fair Housing Act, the right context for a rental." },
  { criterion: "Recent date & signature", good: "A recent issue date and the provider's signature so it reads as current, genuine documentation." },
];

const faqs: FaqItem[] = [
  {
    q: "Can I use a PSD letter for an apartment?",
    a: "Yes. A psychiatric service dog letter can support a reasonable-accommodation request for housing under the Fair Housing Act. It documents that a licensed provider evaluated you, that you have a disability-related need, and that your dog is trained to perform tasks for that disability. A landlord must consider the request, though decisions are made individually.",
  },
  {
    q: "Can a landlord charge pet rent or a pet deposit for a psychiatric service dog?",
    a: "Generally no. Under the Fair Housing Act, assistance animals — including psychiatric service dogs approved as a reasonable accommodation — are not pets, so pet fees, pet rent, and pet deposits typically don't apply. You can still be held responsible for any actual damage the dog causes. Always confirm specifics with your housing provider.",
  },
  {
    q: "What can a landlord ask about my psychiatric service dog?",
    a: "If your disability isn't obvious, a housing provider may ask two things: whether the dog is needed because of a disability, and what task the dog is trained to perform. They generally cannot demand your diagnosis, medical records, or a live demonstration, and cannot require certification or registration.",
  },
  {
    q: "Do I need a PSD letter or an ESA letter for housing?",
    a: "For housing alone, an ESA letter is often the simpler fit — it supports a comfort animal with no task-training requirement. A PSD letter is appropriate when you have a qualifying disability and a dog trained to perform specific tasks, and you want documentation that reflects a service dog. A licensed provider can help determine which fits during your evaluation.",
  },
  {
    q: "Does a PSD letter guarantee my landlord will approve the dog?",
    a: "No. A landlord must consider a reasonable-accommodation request supported by valid documentation, but no service can guarantee approval. Requests can be denied in limited, individualized situations — for example, a documented direct threat to others or substantial physical damage that can't be reduced by another reasonable accommodation.",
  },
  {
    q: "Is an online PSD letter valid for a housing request?",
    a: "Yes, when it comes from a provider licensed in your state who actually evaluated you. The online (telehealth) delivery doesn't make it less valid. What isn't valid is an instant \"registration\" or certificate sold with no evaluation.",
  },
  {
    q: "What if my building has a no-pets policy or breed and weight limits?",
    a: "A reasonable accommodation under the Fair Housing Act can apply even where a building has a no-pets policy or breed and weight restrictions, because an assistance animal is not treated as a pet. The accommodation is considered individually, so outcomes still depend on the specific situation.",
  },
];

export default function PsdLetterForApartmentsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Psychiatric service dog (PSD) letter for housing",
      description:
        "Connects people with licensed mental health providers who can issue a psychiatric service dog letter supporting a reasonable-accommodation request for housing when clinically appropriate. No guaranteed approval — eligibility depends on a provider's evaluation.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "PSD Letter for Apartments and Housing Requests",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "PSD Letter for Apartments", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="PSD letter for apartment, psychiatric service dog letter for housing, service dog letter for landlord, PSD housing letter, psychiatric service dog apartment"
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
                <i className="ri-home-heart-line"></i>
                PSD letter for housing
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                PSD Letter for Apartments and Housing Requests
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A psychiatric service dog letter can support a reasonable-accommodation request for
                your apartment. Here&rsquo;s how it works with a landlord, what they can and
                can&rsquo;t ask, and when an ESA letter is the better fit.
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
                  href="#landlord"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-information-line"></i>
                  What Landlords Can Ask
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="A renter moving into a new apartment with their psychiatric service dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-home-heart-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Fair Housing Act request</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can you use a PSD letter for an apartment?">
            <p>
              Yes. A <strong>psychiatric service dog letter</strong> can support a{" "}
              <strong>reasonable-accommodation request</strong> for housing under the{" "}
              <strong>Fair Housing Act</strong>. It documents that a licensed provider evaluated you,
              that you have a disability-related need, and that your dog is trained to perform tasks
              for that disability.
            </p>
            <p>
              A landlord <strong>must consider</strong> the request and generally{" "}
              <strong>cannot charge pet fees</strong> for an assistance animal — but decisions are
              made individually, and <strong>no service can guarantee approval</strong>. For a comfort
              animal with no task training, an{" "}
              <Link to="/esa-letter-for-apartments" className="text-orange-600 font-semibold hover:underline">
                ESA letter for apartments
              </Link>{" "}
              may fit better.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHAT LANDLORD CAN ASK */}
      <section id="landlord" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The two questions
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a landlord can ask about a psychiatric service dog
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              When a disability isn&rsquo;t obvious, a housing provider can ask a limited set of
              questions — not for your diagnosis or medical records.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {landlordCanAsk.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            If a request is pushed back, see{" "}
            <Link to="/can-a-landlord-deny-a-psd-letter" className="text-orange-600 font-semibold hover:underline">
              can a landlord deny a PSD letter
            </Link>
            .
          </p>
        </div>
      </section>

      {/* DOC CHECKLIST */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What good documentation looks like
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              A housing-ready PSD letter
            </h2>
          </div>
          <ComparisonTable
            caption="What a landlord looks for"
            rows={docChecklist}
          />
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A renter preparing a reasonable-accommodation request for their psychiatric service dog"
        eyebrow="No pet fees for assistance animals"
        heading="A service dog is not a pet"
        body="Under the Fair Housing Act, an approved assistance animal — including a psychiatric service dog — is not treated as a pet. That generally means no pet rent, pet deposits, or pet fees, even in a no-pets building. You're still responsible for any actual damage."
        bullets={[
          "Reasonable accommodation, not a pet request.",
          "Pet fees generally don't apply to assistance animals.",
          "No-pets and breed/weight limits can still be accommodated.",
        ]}
      />

      {/* PRICING */}
      <PsdPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="PSD letter for apartments FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get housing documentation for your service dog
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Start the online assessment. If you qualify, a licensed provider issues a signed
            psychiatric service dog letter you can use for your apartment request — with a refund if
            you don&rsquo;t qualify.
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
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/psychiatric-service-dog-letter-online", title: "Psychiatric service dog letter online", desc: "How the online PSD evaluation and letter work." },
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "What you need to qualify for a PSD letter." },
              { to: "/can-a-landlord-deny-a-psd-letter", title: "Can a landlord deny a PSD letter?", desc: "What a landlord can verify — and when they can't reject." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Which document fits your housing situation." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "The housing route for a comfort animal with no task training." },
              { to: "/blog/psychiatric-service-dog-housing-rights", title: "Psychiatric service dog housing rights", desc: "What renters should know about service dogs and housing." },
            ]}
          />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
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
