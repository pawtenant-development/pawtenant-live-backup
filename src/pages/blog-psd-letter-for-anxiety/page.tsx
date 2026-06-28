// Blog article — /blog/psd-letter-for-anxiety
//
// "Can You Get a PSD Letter for Anxiety?"
// Careful: anxiety may qualify only if it rises to a disability level AND the
// dog performs trained tasks. Strong medical/legal safety. Routes anxiety-only
// comfort cases toward ESA; task-trained cases toward PSD assessment.
//
// Compliance: no diagnosis language, no guaranteed approval, PSD requires
// qualifying disability + trained tasks, ESA/PSD kept distinct. SEO meta from
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

const CANONICAL = "https://pawtenant.com/blog/psd-letter-for-anxiety";
const TITLE = "Can You Get a PSD Letter for Anxiety?";
const DESC =
  "Can anxiety qualify for a psychiatric service dog letter? It can — but only if it rises to a disability level and your dog performs trained tasks. Here's how it works.";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/owner-with-dog-laptop.jpg";
const PUBLISHED = "2026-06-28";
const KEYWORDS =
  "PSD letter for anxiety, psychiatric service dog for anxiety, service dog for anxiety letter, does anxiety qualify for a service dog, anxiety service dog";

const faqs: BlogFaqItem[] = [
  {
    q: "Can you get a PSD letter for anxiety?",
    a: "Possibly. Anxiety can support a psychiatric service dog letter when it rises to a disability that substantially limits a major life activity and your dog is trained to perform specific tasks for it. A licensed provider decides. Everyday stress, or comfort without trained tasks, points toward an emotional support animal instead.",
  },
  {
    q: "Does anxiety automatically qualify for a service dog?",
    a: "No. Having anxiety isn't enough on its own. Two things must be true: the anxiety must rise to the level of a disability that substantially limits a major life activity, and the dog must be trained to perform specific tasks that mitigate it. Both are assessed individually.",
  },
  {
    q: "What tasks can a service dog perform for anxiety?",
    a: "Examples include recognizing the early signs of a panic attack and performing a trained calming response, applying deep-pressure grounding during a severe episode, interrupting repetitive anxious behaviors, or creating space in crowds. The task must be trained and tied to the disability — comfort by presence alone is an ESA function, not a service-dog task.",
  },
  {
    q: "What if my anxiety doesn't qualify for a PSD?",
    a: "You may still qualify for an emotional support animal (ESA) letter, which supports a comfort animal in housing and has no task-training requirement. A licensed provider can help identify which document fits, and you're refunded if you don't qualify for either.",
  },
  {
    q: "Is a PSD better than an ESA for anxiety?",
    a: "Neither is universally better — they fit different situations. If your dog is trained to perform tasks for disabling anxiety, a PSD fits and offers broader access potential. If your animal helps mainly through comfort, an ESA is the appropriate housing document. The right choice depends on your needs and a provider's evaluation.",
  },
  {
    q: "Can I get an anxiety PSD letter online?",
    a: "Yes. A provider licensed in your state can evaluate you by telehealth and, if you qualify, issue a PSD letter online. The format doesn't change the requirements — disabling anxiety and a task-trained dog are still needed.",
  },
];

export default function BlogPsdLetterForAnxietyPage() {
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
        breadcrumbName="Can You Get a PSD Letter for Anxiety?"
        faqs={faqs}
        keywords={KEYWORDS}
        articleSection="Psychiatric Service Dogs"
      />

      <SharedNavbar />

      <BlogHero
        chips={["PSD letters", "Anxiety", "Eligibility"]}
        breadcrumbName="Can You Get a PSD Letter for Anxiety?"
        h1="Can You Get a PSD Letter"
        h1Accent="for Anxiety?"
        publishedLabel="June 28, 2026"
        readMins={8}
        summaryItems={[
          <>Anxiety <strong>can</strong> support a PSD letter — but only when it rises to a <strong>disability</strong> level.</>,
          <>Your dog must be <strong>trained to perform specific tasks</strong> for it — comfort alone isn&rsquo;t enough.</>,
          <>A <strong>licensed provider</strong> decides; it isn&rsquo;t automatic and can&rsquo;t be self-certified.</>,
          <>If a PSD doesn&rsquo;t fit, an <strong>ESA letter</strong> may — and you&rsquo;re refunded if you don&rsquo;t qualify.</>,
        ]}
        image={HERO_IMG}
        alt="A person with anxiety sitting calmly at home beside their dog"
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="short-answer">The short answer</SectionHeading>
          <Para>
            Yes — anxiety can qualify for a psychiatric service dog letter, but not automatically.
            Two things have to be true at the same time: your anxiety has to rise to the level of a{" "}
            <strong>disability that substantially limits a major life activity</strong>, and your dog
            has to be <strong>trained to perform specific tasks</strong> that help with it. If only
            one of those is true, a PSD usually isn&rsquo;t the right fit.
          </Para>
          <Para>
            This is an important distinction, because a lot of anxiety is real and difficult without
            rising to a disability — and a dog that simply provides comfort is doing the work of an{" "}
            emotional support animal, not a service dog.
          </Para>

          <SectionHeading id="disability-level">When anxiety rises to a disability</SectionHeading>
          <Para>
            A licensed provider looks at how much your anxiety affects daily functioning — things
            like working, sleeping, leaving home, concentrating, or being in public. When anxiety
            substantially limits one or more of those, it may meet the disability threshold. This is
            a clinical judgment, made during an evaluation. It can&rsquo;t be self-certified, and no
            quiz or registry can grant it.
          </Para>

          <SectionHeading id="tasks">The task requirement</SectionHeading>
          <Para>
            This is the part many people miss. For a psychiatric service dog, the dog must be trained
            to do something specific — not just be present. Examples for anxiety include:
          </Para>
          <CheckList
            items={[
              "Sensing the early signs of a panic attack and performing a trained calming response.",
              "Applying deep-pressure grounding during a severe episode.",
              "Interrupting repetitive or escalating anxious behaviors.",
              "Creating physical space between the handler and a crowd to reduce overwhelm.",
            ]}
          />
          <Para>
            If your dog doesn&rsquo;t (yet) perform a trained task, that&rsquo;s the gap to close —
            see the full list in{" "}
            <Link to="/psd-letter-requirements" className={inlineLink}>PSD letter requirements</Link>.
          </Para>

          <SectionHeading id="psd-or-esa">PSD or ESA for anxiety?</SectionHeading>
          <SubHeading>A PSD may fit if…</SubHeading>
          <CheckList
            items={[
              "Your anxiety rises to a disability that substantially limits a major life activity.",
              "Your dog is trained (or being trained) to perform a specific task for it.",
              "You want documentation that reflects a service dog and broader access potential.",
            ]}
          />
          <SubHeading>An ESA may fit if…</SubHeading>
          <CheckList
            items={[
              "Your animal helps mainly through comfort and companionship.",
              "Your goal is housing — keeping your animal in no-pet or pet-restricted housing.",
              "There's no trained, disability-related task involved.",
            ]}
          />
          <Para>
            Compare both clearly in{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>ESA vs PSD letter</Link>.
          </Para>

          {/* Inline CTA */}
          <div className="my-10 rounded-2xl border border-[#4A8472]/30 bg-[#4A8472]/[0.06] p-6 sm:p-7 text-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-2">
              Find out which one fits your anxiety
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-xl mx-auto">
              A licensed mental health professional reviews your situation and tells you whether a PSD
              or an ESA is the right path — with a refund if you don&rsquo;t qualify for either.
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

      <BlogFaq heading="PSD letter for anxiety: FAQ" faqs={faqs} />

      <BlogKeepReading
        links={[
          { to: "/psd-letter-requirements", icon: "ri-list-check-2", label: "PSD letter requirements" },
          { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
          { to: "/psychiatric-service-dog-letter-online", icon: "ri-computer-line", label: "PSD letter online" },
          { to: "/psd-letter-for-apartments", icon: "ri-home-heart-line", label: "PSD letter for apartments" },
          { to: "/blog/psychiatric-service-dog-letter-explained", icon: "ri-book-open-line", label: "PSD letters explained" },
          { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
        ]}
      />

      <PsdBlogLegalDisclaimer />

      <SharedFooter />
    </main>
  );
}
