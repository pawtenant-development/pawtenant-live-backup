// Blog article — /blog/psychiatric-service-dog-housing-rights
//
// "Psychiatric Service Dog Housing Rights: What Renters Should Know"
// Housing-first, landlord-facing language. Internal links to PSD apartment page
// + ESA landlord pages. Conversion to /psd-assessment.
//
// Compliance: Fair Housing framing, "must consider not must accept", no
// guaranteed outcome, PSD requires qualifying disability + trained tasks,
// ESA/PSD kept distinct. SEO meta from CORE_PAGE_META via SEOManager + prerender.

import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  inlineLink,
  SectionHeading,
  SubHeading,
  Para,
  CheckList,
  BlogMeta,
  BlogJsonLd,
  BlogHero,
  BlogFaq,
  BlogKeepReading,
  PsdBlogLegalDisclaimer,
  type BlogFaqItem,
} from "../../components/feature/BlogProse";

const CANONICAL = "https://pawtenant.com/blog/psychiatric-service-dog-housing-rights";
const TITLE = "Psychiatric Service Dog Housing Rights: What Renters Should Know";
const DESC =
  "Psychiatric service dog housing rights explained for renters: Fair Housing Act protections, what a landlord can ask, no pet fees for assistance animals, and how to request.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg";
const PUBLISHED = "2026-06-28";
const KEYWORDS =
  "psychiatric service dog housing rights, PSD housing rights, service dog Fair Housing Act, psychiatric service dog apartment rights, service dog landlord rules";

const faqs: BlogFaqItem[] = [
  {
    q: "What housing rights does a psychiatric service dog have?",
    a: "Under the Fair Housing Act, a psychiatric service dog can be requested as a reasonable accommodation, even in no-pet housing. A landlord must consider the request, generally can't charge pet fees for an assistance animal, and can't deny it based on breed, weight, or a no-pets policy. \"Must consider\" is not \"must accept\" — denials are limited to specific, individualized reasons.",
  },
  {
    q: "Can a landlord charge pet rent or a deposit for a psychiatric service dog?",
    a: "Generally no. An approved assistance animal — including a psychiatric service dog — is not treated as a pet under the Fair Housing Act, so pet rent, pet deposits, and pet fees typically don't apply. You can still be held responsible for actual damage the dog causes.",
  },
  {
    q: "What can a landlord ask about my psychiatric service dog?",
    a: "If your disability isn't obvious, a landlord may ask whether the dog is needed because of a disability and what task it's trained to perform. They can request documentation that reasonably supports a non-obvious disability, but generally can't demand your diagnosis, medical records, or a live demonstration.",
  },
  {
    q: "Does a no-pets policy override my service dog rights?",
    a: "No. A reasonable accommodation can apply even where a building has a no-pets policy, breed ban, or weight limit, because a service dog approved as an accommodation isn't a pet. The request is still considered individually.",
  },
  {
    q: "Can a landlord deny a psychiatric service dog?",
    a: "Only for limited, individualized reasons — a documented direct threat to others' safety, substantial property damage that can't be reduced by another accommodation, an undue burden, or documentation that can't be verified. A denial can't be based on breed, weight, fear, or a no-pets policy. See our guide on whether a landlord can deny a PSD letter.",
  },
  {
    q: "How do I request a psychiatric service dog accommodation?",
    a: "Submit a written reasonable-accommodation request to your landlord and include a PSD letter from a licensed provider that documents your disability-related need. Keep a record, and offer the provider's license details so the landlord can verify the letter. No service can guarantee approval, but verifiable documentation strengthens your request.",
  },
];

export default function BlogPsychiatricServiceDogHousingRightsPage() {
  const { withAttribution } = useAttributionParams();

  return (
    <main className="bg-white">
      <BlogMeta
        title={TITLE}
        description={DESC}
        canonical={CANONICAL}
        image={HERO_IMG}
        keywords={KEYWORDS}
        published={PUBLISHED}
      />
      <BlogJsonLd
        canonical={CANONICAL}
        headline={TITLE}
        description={DESC}
        image={HERO_IMG}
        datePublished={PUBLISHED}
        breadcrumbName="Psychiatric Service Dog Housing Rights"
        faqs={faqs}
        keywords={KEYWORDS}
        articleSection="Psychiatric Service Dogs"
      />

      <SharedNavbar />

      <BlogHero
        chips={["PSD letters", "Housing rights", "Fair Housing Act"]}
        breadcrumbName="Psychiatric Service Dog Housing Rights"
        h1="Psychiatric Service Dog Housing Rights:"
        h1Accent="What Renters Should Know"
        publishedLabel="June 28, 2026"
        readMins={9}
        summaryItems={[
          <>Under the <strong>Fair Housing Act</strong>, a psychiatric service dog can be requested as a <strong>reasonable accommodation</strong> — even in no-pet housing.</>,
          <>A landlord generally <strong>can&rsquo;t charge pet fees</strong> for an assistance animal and <strong>can&rsquo;t deny by breed or weight</strong>.</>,
          <>They <strong>must consider</strong> a valid request — but that isn&rsquo;t the same as &ldquo;must accept.&rdquo;</>,
          <>A <strong>verifiable PSD letter</strong> from a licensed provider strengthens the request — approval is never guaranteed.</>,
        ]}
        image={HERO_IMG}
        alt="A renter and their psychiatric service dog in a new apartment"
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="the-basics">The basics: service dogs and the Fair Housing Act</SectionHeading>
          <Para>
            For housing, a psychiatric service dog is handled under the{" "}
            <strong>Fair Housing Act</strong> as an <strong>assistance animal</strong>. That means
            you can request to keep the dog as a <strong>reasonable accommodation</strong>, even in a
            building with a no-pets policy. The landlord must give the request fair consideration —
            but, importantly, &ldquo;must consider&rdquo; is not the same as &ldquo;must accept.&rdquo;
            Decisions are made individually.
          </Para>

          <SectionHeading id="no-pet-fees">No pet fees for assistance animals</SectionHeading>
          <Para>
            Because an approved assistance animal isn&rsquo;t a pet, the usual pet charges generally
            don&rsquo;t apply:
          </Para>
          <CheckList
            items={[
              "No pet rent for the service dog.",
              "No pet deposit or non-refundable pet fee.",
              "No breed or weight restriction used to deny the accommodation.",
            ]}
          />
          <Para>
            You&rsquo;re still responsible for any <strong>actual damage</strong> the dog causes —
            the protection covers the accommodation, not damage. The practical side of this is in{" "}
            <Link to="/psd-letter-for-apartments" className={inlineLink}>PSD letter for apartments</Link>.
          </Para>

          <SectionHeading id="what-landlord-can-ask">What a landlord can — and can&rsquo;t — ask</SectionHeading>
          <SubHeading>They can</SubHeading>
          <CheckList
            items={[
              "Ask whether the dog is needed because of a disability (when it isn't obvious).",
              "Ask what task the dog is trained to perform.",
              "Request documentation that reasonably supports a non-obvious disability.",
            ]}
          />
          <SubHeading>They generally can&rsquo;t</SubHeading>
          <CheckList
            items={[
              "Demand your specific diagnosis or full medical records.",
              "Require certification, registration, or a live task demonstration.",
              "Deny the request because of breed, weight, or a no-pets policy.",
            ]}
          />

          <SectionHeading id="denials">When a request can be denied</SectionHeading>
          <Para>
            Lawful denials are narrow and based on the specific animal and situation — for example, a
            documented direct threat to others&rsquo; safety, substantial property damage that
            can&rsquo;t be reduced by another accommodation, an undue burden, or documentation that
            can&rsquo;t be verified. We cover the details, and the steps to take if you&rsquo;re
            denied, in{" "}
            <Link to="/can-a-landlord-deny-a-psd-letter" className={inlineLink}>can a landlord deny a PSD letter</Link>.
          </Para>

          <SectionHeading id="how-to-request">How to make the request</SectionHeading>
          <CheckList
            items={[
              "Put your reasonable-accommodation request in writing.",
              "Include a PSD letter from a licensed provider documenting your disability-related need.",
              "Offer the provider's license details so the landlord can verify it.",
              "Keep copies of everything you send and receive.",
            ]}
          />
          <Para>
            If a comfort animal fits your situation better than a task-trained service dog, the ESA
            path may be simpler — compare them in{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>ESA vs PSD letter</Link>, and see the
            ESA landlord side in{" "}
            <Link to="/esa-letter-for-landlord" className={inlineLink}>ESA letter for a landlord</Link>.
          </Para>

          {/* Inline CTA */}
          <div className="my-10 rounded-2xl border border-[#4A8472]/30 bg-[#4A8472]/[0.06] p-6 sm:p-7 text-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-2">
              Get a verifiable letter for your housing request
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-xl mx-auto">
              If you qualify, a licensed provider issues a signed psychiatric service dog letter a
              landlord can verify — with a refund if you don&rsquo;t qualify.
            </p>
            <Link
              to={withAttribution("/psd-assessment")}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-[#4A8472] text-white font-bold text-sm rounded-md hover:bg-[#3F7061] transition-colors cursor-pointer"
            >
              <i className="ri-stethoscope-line"></i>
              Start PSD Assessment
            </Link>
          </div>
        </div>
      </article>

      <BlogFaq heading="Psychiatric service dog housing rights: FAQ" faqs={faqs} />

      <BlogKeepReading
        links={[
          { to: "/psd-letter-for-apartments", icon: "ri-home-heart-line", label: "PSD letter for apartments" },
          { to: "/can-a-landlord-deny-a-psd-letter", icon: "ri-scales-line", label: "Can a landlord deny a PSD letter?" },
          { to: "/psychiatric-service-dog-letter-online", icon: "ri-computer-line", label: "PSD letter online" },
          { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
          { to: "/esa-letter-for-landlord", icon: "ri-user-3-line", label: "ESA letter for a landlord" },
          { to: "/housing-rights-esa", icon: "ri-government-line", label: "ESA housing rights" },
        ]}
      />

      <PsdBlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
