// Blog article — /blog/psd-letter-vs-service-dog-certificate
//
// "PSD Letter vs Service Dog Certificate: What's Actually Useful?"
// Attacks certificate/registration confusion → redirects to proper PSD letter
// + licensed provider review → conversion to /psd-assessment.
//
// Compliance: no fake registration/certificate language endorsed; PSD requires
// qualifying disability + trained tasks; ESA/PSD kept distinct; no guaranteed
// outcome. SEO meta from CORE_PAGE_META via SEOManager + prerender.

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

const CANONICAL = "https://pawtenant.com/blog/psd-letter-vs-service-dog-certificate";
const TITLE = "PSD Letter vs Service Dog Certificate: What's Actually Useful?";
const DESC =
  "PSD letter vs service dog certificate compared: why online certificates and registrations carry no legal weight, and what documentation from a licensed provider actually does.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg";
const PUBLISHED = "2026-06-28";
const KEYWORDS =
  "PSD letter vs service dog certificate, service dog certificate, service dog registration, fake service dog certificate, psychiatric service dog letter";

const faqs: BlogFaqItem[] = [
  {
    q: "Is a service dog certificate real or required?",
    a: "No. There is no official certification or registration that makes a dog a service dog, and websites selling \"certificates\" or \"registrations\" provide nothing of legal value. A service dog's status comes from being trained to perform tasks for a disability — not from a certificate.",
  },
  {
    q: "What's the difference between a PSD letter and a service dog certificate?",
    a: "A PSD letter is signed by a licensed mental health professional after evaluating you, and documents a real disability-related need. A service dog \"certificate\" is typically a printout sold online with no clinician, no evaluation, and no legal standing. One is verifiable documentation; the other is decoration.",
  },
  {
    q: "Do landlords accept service dog certificates?",
    a: "A landlord can reject documentation that can't be reasonably verified — which is exactly what a paid certificate is. A PSD letter from a licensed provider, by contrast, names the provider and their license details so a landlord can confirm it's genuine.",
  },
  {
    q: "Does my dog need any certificate to be a service dog?",
    a: "No. Service dogs can be owner-trained, and no certificate, ID card, vest, or registry is required. What matters is that the dog is trained to perform specific tasks tied to your disability.",
  },
  {
    q: "What should I get instead of a certificate?",
    a: "Two things: real task training for your dog, and — if you have a qualifying disability — a PSD letter from a licensed provider that documents your clinical need. That combination is what actually supports a housing accommodation request.",
  },
  {
    q: "Are online PSD letters also a scam?",
    a: "Not if they come from a real licensed provider who evaluates you. The red flag isn't \"online\" — it's the absence of a clinician. Instant documents issued with no evaluation are the scam; a telehealth evaluation by a state-licensed provider is legitimate.",
  },
];

export default function BlogPsdLetterVsServiceDogCertificatePage() {
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
        breadcrumbName="PSD Letter vs Service Dog Certificate"
        faqs={faqs}
        keywords={KEYWORDS}
        articleSection="Psychiatric Service Dogs"
      />

      <SharedNavbar />

      <BlogHero
        chips={["PSD letters", "Avoid scams", "Service dogs"]}
        breadcrumbName="PSD Letter vs Service Dog Certificate"
        h1="PSD Letter vs Service Dog Certificate:"
        h1Accent="What's Actually Useful?"
        publishedLabel="June 28, 2026"
        readMins={8}
        summaryItems={[
          <>A <strong>service dog &ldquo;certificate&rdquo; or &ldquo;registration&rdquo;</strong> sold online carries <strong>no legal weight</strong>.</>,
          <>A <strong>PSD letter</strong> from a licensed provider documents a real, <strong>verifiable</strong> disability-related need.</>,
          <>Landlords can reject documentation they <strong>can&rsquo;t verify</strong> — a certificate is exactly that.</>,
          <>What makes a dog a service dog is <strong>task training</strong>, not paperwork.</>,
        ]}
        image={HERO_IMG}
        alt="A person comparing service dog documentation options at a desk with their dog"
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="the-confusion">The confusion the internet creates</SectionHeading>
          <Para>
            Search for &ldquo;service dog&rdquo; and you&rsquo;ll be flooded with sites offering
            certificates, ID cards, vests, and &ldquo;official registrations&rdquo; — often for a
            quick fee. It looks legal and reassuring. It isn&rsquo;t. None of those products give
            your dog any legal status, and buying one can leave you worse off when a landlord asks
            for real documentation.
          </Para>
          <Para>
            Here&rsquo;s the simple truth: there is <strong>no official service dog registry</strong>{" "}
            in the United States. A dog becomes a service dog through training, not registration.
          </Para>

          <SectionHeading id="side-by-side">PSD letter vs certificate, side by side</SectionHeading>
          <SubHeading>A service dog certificate or registration</SubHeading>
          <CheckList
            items={[
              "Sold online, usually with no clinician involved and no evaluation.",
              "Carries no legal weight — it doesn't grant any rights.",
              "Can't be meaningfully verified, so a landlord can reject it.",
              "Often paired with a vest or ID card that also means nothing legally.",
            ]}
          />
          <SubHeading>A PSD letter from a licensed provider</SubHeading>
          <CheckList
            items={[
              "Signed by a mental health professional licensed in your state, after a real evaluation.",
              "Documents a genuine disability-related need for a task-trained dog.",
              "Names the provider and their license details, so it's verifiable.",
              "Supports a reasonable-accommodation request for housing under the Fair Housing Act.",
            ]}
          />
          <Para>
            For a full breakdown of the two animal categories, see{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>ESA vs PSD letter</Link>.
          </Para>

          <SectionHeading id="why-landlords-care">Why landlords treat them so differently</SectionHeading>
          <Para>
            When you request to keep a service dog in no-pet housing and your disability isn&rsquo;t
            obvious, a landlord can ask for documentation that reasonably supports the need. The one
            kind of documentation they&rsquo;re allowed to reject is the kind they{" "}
            <em>can&rsquo;t verify</em>. A paid certificate fails that test instantly. A PSD letter
            from a licensed provider passes it, because the provider&rsquo;s license can be checked.
            More on that in{" "}
            <Link to="/can-a-landlord-deny-a-psd-letter" className={inlineLink}>can a landlord deny a PSD letter</Link>.
          </Para>

          <SectionHeading id="what-to-do">What to do instead</SectionHeading>
          <Para>
            Skip the certificate. Put your money and effort into the two things that actually matter:
          </Para>
          <CheckList
            items={[
              <><strong>Train your dog</strong> to reliably perform a specific task that helps with your disability.</>,
              <><strong>Get a real evaluation</strong> from a licensed provider and, if you qualify, a verifiable PSD letter. See <Link to="/psd-letter-requirements" className={inlineLink}>PSD letter requirements</Link>.</>,
            ]}
          />

          {/* Inline CTA */}
          <div className="my-10 rounded-2xl border border-[#4A8472]/30 bg-[#4A8472]/[0.06] p-6 sm:p-7 text-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-2">
              Get documentation that holds up
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-xl mx-auto">
              A licensed mental health professional reviews your situation and, if you qualify, issues
              a verifiable psychiatric service dog letter — with a refund if you don&rsquo;t qualify.
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

      <BlogFaq heading="PSD letter vs certificate: FAQ" faqs={faqs} />

      <BlogKeepReading
        links={[
          { to: "/do-you-need-a-psd-letter-for-a-service-dog", icon: "ri-question-answer-line", label: "Do you need a PSD letter?" },
          { to: "/psychiatric-service-dog-letter-online", icon: "ri-computer-line", label: "PSD letter online" },
          { to: "/psd-letter-requirements", icon: "ri-list-check-2", label: "PSD letter requirements" },
          { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
          { to: "/can-a-landlord-deny-a-psd-letter", icon: "ri-scales-line", label: "Can a landlord deny a PSD letter?" },
          { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
        ]}
      />

      <PsdBlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
