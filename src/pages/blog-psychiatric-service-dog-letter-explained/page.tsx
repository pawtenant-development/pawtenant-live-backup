// Blog article — /blog/psychiatric-service-dog-letter-explained
//
// "Psychiatric Service Dog Letters Explained: What They Are and When They Help"
// PSD education → who qualifies → PSD vs ESA → conversion to /psd-assessment.
//
// Compliance: PSD requires a qualifying disability + trained tasks; no fake
// registration/certificate language; ESA and PSD kept distinct; no guaranteed
// housing/airline outcome. SEO title/description/canonical come from
// CORE_PAGE_META via SEOManager + prerender.

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

const CANONICAL = "https://pawtenant.com/blog/psychiatric-service-dog-letter-explained";
const TITLE = "Psychiatric Service Dog Letters Explained: What They Are & When They Help";
const DESC =
  "A plain-English guide to psychiatric service dog (PSD) letters — what they are, who qualifies, how they differ from an ESA, and when the documentation actually helps.";
const HERO_IMG = "https://pawtenant.com/assets/psd/man-working-holding-dog.jpg";
const PUBLISHED = "2026-06-28";
const KEYWORDS =
  "psychiatric service dog letter, PSD letter explained, what is a PSD letter, psychiatric service dog documentation, PSD vs ESA";

const faqs: BlogFaqItem[] = [
  {
    q: "What is a psychiatric service dog letter?",
    a: "It's a signed document from a licensed mental health professional confirming that you have a qualifying psychiatric disability and that a service dog trained to perform specific tasks supports your condition. It documents the provider's clinical evaluation — it does not train, certify, or register your dog.",
  },
  {
    q: "Who qualifies for a PSD letter?",
    a: "Someone with a psychiatric disability that substantially limits a major life activity, whose dog is trained to perform specific tasks tied to that disability. A licensed provider makes the determination. Comfort and companionship alone point to an emotional support animal, not a PSD.",
  },
  {
    q: "How is a PSD letter different from an ESA letter?",
    a: "An ESA letter supports a comfort animal for housing, with no task-training requirement. A PSD letter is for a dog trained to perform specific tasks for a psychiatric disability, which can carry broader access. Task training is the deciding line.",
  },
  {
    q: "Does the letter make my dog an official service dog?",
    a: "No. The letter documents your clinical need. Your dog's service-dog role comes from its task training, not from any paperwork or registry. There is no official certification or registration for service dogs.",
  },
  {
    q: "When does a PSD letter actually help?",
    a: "Most often with housing. When you request to keep a service dog in no-pet housing, a landlord can ask for documentation that reasonably supports a non-obvious disability — and a PSD letter from a licensed provider meets that need with verifiable documentation.",
  },
  {
    q: "Can I get a PSD letter online?",
    a: "Yes. A provider licensed in your state can evaluate you by telehealth and issue a PSD letter if you qualify. The online format doesn't change the requirements: a real evaluation and a task-trained dog.",
  },
];

export default function BlogPsychiatricServiceDogLetterExplainedPage() {
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
        breadcrumbName="Psychiatric Service Dog Letters Explained"
        faqs={faqs}
        keywords={KEYWORDS}
        articleSection="Psychiatric Service Dogs"
      />

      <SharedNavbar />

      <BlogHero
        chips={["PSD letters", "Service dogs", "Housing"]}
        breadcrumbName="Psychiatric Service Dog Letters Explained"
        h1="Psychiatric Service Dog Letters Explained:"
        h1Accent="What They Are and When They Help"
        publishedLabel="June 28, 2026"
        readMins={9}
        summaryItems={[
          <>A <strong>PSD letter</strong> is a signed document from a licensed provider confirming a qualifying disability and a task-trained dog.</>,
          <>It <strong>documents clinical need</strong> — it does not train, certify, or register a dog. No official registry exists.</>,
          <>A PSD differs from an ESA by one thing: <strong>trained tasks</strong>, not just comfort.</>,
          <>It helps most for <strong>housing</strong> requests — and approval is never guaranteed.</>,
        ]}
        image={HERO_IMG}
        alt="A person at home with their trained psychiatric service dog"
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="what-it-is">What a psychiatric service dog letter actually is</SectionHeading>
          <Para>
            A psychiatric service dog (PSD) letter is a signed letter from a licensed mental health
            professional. It confirms two things: that you have a qualifying psychiatric disability,
            and that a dog trained to perform specific tasks supports you because of it. In short, it
            documents a clinical determination — nothing more, nothing less.
          </Para>
          <Para>
            That last point matters. The letter does not train your dog, and it does not make your
            dog &ldquo;official.&rdquo; There is no government registry for service dogs, and any
            website selling a &ldquo;certificate&rdquo; or &ldquo;registration&rdquo; is selling
            something with no legal weight. What makes a dog a psychiatric service dog is its{" "}
            <strong>task training</strong> tied to your disability.
          </Para>

          <SectionHeading id="who-qualifies">Who qualifies</SectionHeading>
          <Para>
            A licensed provider looks at two things during the evaluation:
          </Para>
          <CheckList
            items={[
              <><strong>A qualifying psychiatric disability</strong> — a condition such as PTSD, severe anxiety, major depression, bipolar disorder, or panic disorder that substantially limits a major life activity.</>,
              <><strong>A task-trained dog</strong> — the dog performs specific tasks for that disability, like interrupting a panic attack, grounding during dissociation, or medication reminders.</>,
            ]}
          />
          <Para>
            If your animal helps mainly by being present and offering comfort, that points to an{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>emotional support animal rather than a PSD</Link>{" "}
            — which is a perfectly valid path for housing, just a different one.
          </Para>

          <SectionHeading id="tasks">What counts as a trained task</SectionHeading>
          <Para>
            The task doesn&rsquo;t have to be dramatic. It has to be trained and connected to your
            disability. Common examples include:
          </Para>
          <CheckList
            items={[
              "Recognizing the early signs of a panic attack and performing a trained calming response.",
              "Applying deep pressure or tactile grounding to interrupt dissociation or a flashback.",
              "Reminding the handler to take medication on schedule.",
              "Checking a room before entry for a handler with hypervigilance.",
            ]}
          />
          <Para>
            The full picture is in our{" "}
            <Link to="/psd-letter-requirements" className={inlineLink}>PSD letter requirements</Link>{" "}
            guide.
          </Para>

          <SectionHeading id="when-it-helps">When the letter actually helps</SectionHeading>
          <SubHeading>Housing</SubHeading>
          <Para>
            This is where a PSD letter earns its keep. When you ask a landlord to keep a service dog
            in no-pet or pet-restricted housing, that&rsquo;s a reasonable-accommodation request
            under the Fair Housing Act. If your disability isn&rsquo;t obvious, the landlord can ask
            for documentation that reasonably supports the need — and a PSD letter from a licensed
            provider is exactly that. See{" "}
            <Link to="/psd-letter-for-apartments" className={inlineLink}>PSD letter for apartments</Link>{" "}
            for how that conversation works.
          </Para>
          <SubHeading>What it doesn&rsquo;t do</SubHeading>
          <Para>
            A PSD letter is supporting documentation, not a guarantee. It does not force a landlord,
            airline, or business to say yes, and it does not replace actually training your dog. A
            housing provider must <em>consider</em> a valid request, but decisions are made
            individually.
          </Para>

          <SectionHeading id="getting-one">How to get a PSD letter online</SectionHeading>
          <Para>
            The process is straightforward: complete a short assessment, meet a licensed mental
            health professional for an evaluation, and — if you qualify — receive a signed letter
            with the provider&rsquo;s license details. The whole thing can happen online, and
            you&rsquo;re refunded if you don&rsquo;t qualify. Walk through it on{" "}
            <Link to="/psychiatric-service-dog-letter-online" className={inlineLink}>psychiatric service dog letter online</Link>.
          </Para>

          {/* Inline CTA */}
          <div className="my-10 rounded-2xl border border-[#4A8472]/30 bg-[#4A8472]/[0.06] p-6 sm:p-7 text-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-2">
              See if a PSD letter fits your situation
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-xl mx-auto">
              A licensed mental health professional reviews your answers and tells you whether a
              psychiatric service dog letter is right — with a refund if you don&rsquo;t qualify.
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

      <BlogFaq heading="Psychiatric service dog letters: FAQ" faqs={faqs} />

      <BlogKeepReading
        links={[
          { to: "/psychiatric-service-dog-letter-online", icon: "ri-computer-line", label: "PSD letter online" },
          { to: "/psd-letter-requirements", icon: "ri-list-check-2", label: "PSD letter requirements" },
          { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
          { to: "/psd-letter-for-apartments", icon: "ri-home-heart-line", label: "PSD letter for apartments" },
          { to: "/blog/psd-letter-vs-service-dog-certificate", icon: "ri-error-warning-line", label: "PSD letter vs certificate" },
          { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
        ]}
      />

      <PsdBlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
