// Blog article — /blog/2026-hud-esa-guidelines
//
// "The New 2026 HUD ESA Guidelines: Is Your Emotional Support Animal Letter
// Still Valid?" — converted from the owner's DOCX draft with legal-safety
// edits: no unverified direct HUD quotes (paraphrased with attribution),
// pet-fee claims softened to "state-law dependent / legally unsettled",
// no "rights are gone" framing, no guaranteed-approval promises.
// Facts verified against the May 22, 2026 FHEO enforcement memorandum
// coverage (rescinds FHEO-2020-01 and FHEO-2013-01; ADA-style trained-task
// standard; FHA statute unchanged; private right of action and state/local
// laws unaffected).
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/FAQ JSON-LD.
// Styling follows /are-esa-letters-still-valid-after-hud-change (orange /
// warm cream / navy education page, ri-* icons already in the build subset).

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/2026-hud-esa-guidelines";

const topicChips = ["HUD ESA Guidelines", "Fair Housing", "ESA Letter", "Psychiatric Service Dog"];

// ── Comparison data: trained PSD / service animal vs untrained ESA ───────────
const comparisonRows = [
  {
    feature: "Federal HUD enforcement priority",
    psd: "High — treated as presumptively reasonable",
    esa: "Low — complaints expected to be dismissed or closed with no-cause findings",
  },
  {
    feature: "Pet fees & deposits",
    psd: "Waivers still required for trained assistance animals",
    esa: "May be charged in some situations — depends on state and local law, and the law here is unsettled",
  },
  {
    feature: "Primary legal qualifier",
    psd: "Individually trained to do work or perform specific disability-related tasks",
    esa: "Comfort or companionship through presence alone",
  },
  {
    feature: "State & local protections",
    psd: "Protected broadly",
    esa: "Protected in states with their own ESA or fair-housing laws",
  },
  {
    feature: "Private lawsuits under the FHA",
    psd: "Available — denials carry significant litigation exposure for housing providers",
    esa: "Still available — courts, not HUD, decide these claims, and outcomes depend on the facts",
  },
  {
    feature: "Documentation that holds up best",
    psd: "A licensed mental health professional with a real clinical relationship",
    esa: "Same — but federal administrative enforcement is now limited",
  },
];

// ── Recognized PSD task examples ─────────────────────────────────────────────
const psdTasks = [
  {
    title: "Deep Pressure Therapy (DPT)",
    desc: "The dog uses its body weight — lying across the handler's lap or chest — to help calm the nervous system during a severe panic attack or PTSD episode.",
  },
  {
    title: "Tactile grounding & interrupting behaviors",
    desc: "The dog recognizes physical signs of escalating anxiety, such as leg shaking or skin picking, and physically interrupts by pawing or nudging the handler.",
  },
  {
    title: "Medication and routine alerts",
    desc: "The dog is trained to retrieve a medication pouch or perform a specific behavior at a consistent time to remind the handler to take prescribed medication.",
  },
  {
    title: "Nightmare interruption",
    desc: "The dog detects physical signs of night terrors — breathing changes, thrashing — and wakes the handler by applying pressure or pawing repeatedly.",
  },
  {
    title: "Crowd buffering and spatial support",
    desc: "The dog positions itself between the handler and others in crowded spaces (\"blocking\"), creating a buffer that helps with agoraphobia and hypervigilance.",
  },
];

// ── FAQs (rendered + FAQPage JSON-LD) ────────────────────────────────────────
const faqs = [
  {
    q: "Is my existing ESA letter still valid after the 2026 HUD memo?",
    a: "An ESA letter is documentation from a licensed mental health professional — it was never a government registration, and the 2026 memo did not invalidate existing letters or make emotional support animals illegal. What changed is HUD's federal enforcement priority: complaints about untrained ESAs are no longer a federal enforcement focus. Your letter may still support a reasonable-accommodation request, especially where state or local law protects ESAs. Approval is never guaranteed.",
  },
  {
    q: "Can my landlord now charge pet fees for my untrained ESA?",
    a: "It depends, and the law here is unsettled. HUD's 2026 memo reduced the federal enforcement deterrent for untrained ESAs, so some housing providers may begin charging fees. But many states have their own fair-housing or assistance-animal laws that still restrict fees, and private lawsuits under the Fair Housing Act remain possible. For trained assistance animals, including psychiatric service dogs, fee waivers are still required. If you are facing new fees, check your state law and consider speaking with a fair-housing attorney.",
  },
  {
    q: "Did the 2026 memo change the Fair Housing Act itself?",
    a: "No. The memo is an agency enforcement document, not a statute. Congress has not amended the Fair Housing Act, and no court ruling has excluded ESAs from housing protections. The memo changes how HUD prioritizes and investigates complaints — tenants can still file private civil lawsuits, and state and local fair-housing laws continue to apply independently.",
  },
  {
    q: "What is the difference between an ESA and a psychiatric service dog under the new standard?",
    a: "An emotional support animal provides comfort through its presence and is not trained to perform a specific task. A psychiatric service dog (PSD) is individually trained to do work or perform tasks directly related to a mental health disability — for example, deep pressure therapy during panic attacks or interrupting harmful repetitive behaviors. Under HUD's 2026 enforcement posture, trained tasks are the key federal qualifier. PawTenant does not train or certify service animals; a licensed provider may issue documentation only where clinically appropriate.",
  },
  {
    q: "Do I need professional certification for a psychiatric service dog?",
    a: "Neither HUD nor the ADA requires professional third-party training or certification — handlers may train their own dogs. What matters most, especially in housing, is being able to describe the specific trained task your dog performs and having documentation from a licensed mental health professional with a genuine clinical relationship. There is no official government ESA or PSD registry, and no certificate by itself makes an animal a service animal.",
  },
  {
    q: "What should I do right now if I rent with an ESA?",
    a: "Four sensible steps: (1) check whether your state has its own fair-housing or assistance-animal law — in some states the practical change may be limited; (2) consider whether your animal already performs, or could be trained to perform, a specific disability-related task; (3) make sure your documentation comes from a licensed mental health professional with a real clinical relationship; (4) if you face an immediate denial or new fees, consult a fair-housing attorney about your options, including private legal action.",
  },
];

// ── Small reusable bits ──────────────────────────────────────────────────────
function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base md:text-lg font-bold text-gray-900 mt-8 mb-3">{children}</h3>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}

const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function Blog2026HudEsaGuidelinesPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="2026 HUD ESA guidelines, HUD ESA memo May 2026, is my ESA letter still valid, FHEO-2020-01 rescinded, emotional support animal housing 2026, ESA pet fees 2026, psychiatric service dog letter, ESA vs PSD housing, ESA housing rights, trained assistance animal"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="2026 HUD ESA Guidelines: Is Your ESA Letter Still Valid?" />
      <meta
        property="og:description"
        content="HUD's 2026 ESA enforcement memo may change how untrained emotional support animals are handled in federal housing complaints. Learn what changed, what rights may remain, and how PSD documentation differs."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta property="article:published_time" content="2026-06-12" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta name="twitter:title" content="2026 HUD ESA Guidelines: Is Your ESA Letter Still Valid?" />
      <meta
        name="twitter:description"
        content="What HUD's May 2026 enforcement memo changes for ESA owners — and what rights may remain. Explained without hype."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "The New 2026 HUD ESA Guidelines: Is Your Emotional Support Animal Letter Still Valid?",
                description:
                  "HUD's May 22, 2026 enforcement memorandum changed how federal complaints about untrained emotional support animals are handled. What changed, what rights may remain, and how psychiatric service dog documentation differs.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg"],
                datePublished: "2026-06-12",
                dateModified: "2026-06-12",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Legal & Rights",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "2026 HUD ESA Guidelines", item: CANONICAL },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        }}
      />

      <SharedNavbar />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-[#fffaf4] to-white pt-28 pb-12 sm:pt-32 sm:pb-14">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <nav className="text-xs text-gray-400 mb-5" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-orange-600">Home</Link>
            <span className="mx-1.5">/</span>
            <Link to="/blog" className="hover:text-orange-600">Blog</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">2026 HUD ESA Guidelines</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span
                key={chip}
                className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm"
              >
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            The New 2026 HUD ESA Guidelines:{" "}
            <span className="text-orange-500">Is Your Emotional Support Animal Letter Still Valid?</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-calendar-line text-orange-400"></i> Published June 2026
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-time-line text-orange-400"></i> ~10 min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy
            </span>
          </div>

          {/* Quick answer callout */}
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick answer
            </p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              If your ESA is untrained — meaning it helps through its presence alone — the federal
              enforcement backstop you may have relied on has changed. HUD&apos;s May 22, 2026
              memorandum no longer prioritizes federal enforcement for untrained emotional support
              animals. But your{" "}
              <Link to="/housing-rights-esa" className={inlineLink}>
                emotional support animal housing rights
              </Link>{" "}
              are not entirely gone: the Fair Housing Act itself is unchanged, private legal action
              remains available, and state or local protections may still apply. Here is what you
              need to know.
            </p>
          </div>

          {/* Hero image — explicit width/height + fixed responsive heights prevent layout shift */}
          <figure className="mt-8">
            <img
              src="/assets/lifestyle/person-paperwork-with-dog.jpg"
              alt="Person with their emotional support dog reviewing housing documents at home"
              width={1400}
              height={1051}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">

          <SectionHeading id="the-2026-shift">The 2026 shift in federal ESA enforcement</SectionHeading>
          <Para>
            For more than six years, a single document shaped how renters, landlords, and emotional
            support animals interacted across the United States. HUD&apos;s January 2020 guidance —
            officially titled Notice FHEO-2020-01 — was the playbook housing providers, property
            managers, and tenants turned to when navigating ESA accommodation requests, including
            requests built on an{" "}
            <Link to="/esa-letter-housing" className={inlineLink}>
              ESA letter for housing
            </Link>
            .
          </Para>
          <Para>
            On May 22, 2026, that playbook was rescinded. HUD&apos;s Office of Fair Housing and Equal
            Opportunity (FHEO) issued a new enforcement memorandum that does not merely tweak the old
            framework — it withdraws it and sets a different federal enforcement posture. If you
            currently hold an ESA letter, or you were planning to request a housing accommodation,
            this change is worth understanding carefully.
          </Para>
          <Para>
            The questions most ESA owners are asking are the same: Does my existing letter still
            mean anything? Can my landlord charge me pet fees now? What can I do to keep my housing
            situation stable? This guide walks through each one — carefully, and without hype.
          </Para>

          <SectionHeading id="what-the-memo-says">What the May 22, 2026 HUD memo actually says</SectionHeading>
          <Para>
            To understand how the landscape changed, it helps to look at what the memorandum
            actually does — not what you may have heard secondhand. Three core points stand out.
          </Para>

          <SubHeading>1. The old 2020 guidance was rescinded</SubHeading>
          <Para>
            The memorandum does not suspend or pause the 2020 framework — it rescinds Notice
            FHEO-2020-01 (and the earlier 2013 guidance, FHEO-2013-01). HUD&apos;s stated reasoning:
            the old framework did not draw clear enough lines between pets and assistance animals,
            and it enabled a large industry of websites generating instant accommodation letters
            with little or no clinical relationship between the provider and the animal owner. The
            memo cites accommodation requests HUD viewed as straining credibility, including a
            single household seeking protection for eight puppies and a cat at once.
          </Para>
          <Para>
            That criticism is aimed at the instant-letter model — not at legitimate clinical
            evaluation. It is also why documentation from a licensed mental health professional with
            a genuine clinical relationship matters more now, not less. If you are researching{" "}
            <Link to="/how-to-get-esa-letter" className={inlineLink}>
              how to get an ESA letter
            </Link>{" "}
            the right way, that clinical relationship is the part to take seriously.
          </Para>

          <SubHeading>2. Federal enforcement now centers on trained animals</SubHeading>
          <Para>
            This is the central shift. Going forward, FHEO will assess animal-related accommodation
            complaints using the training concept from the Americans with Disabilities Act (ADA):
            to be a federal enforcement priority, an animal must be individually trained to do work
            or perform tasks directly related to a disability. According to the memorandum, HUD will
            find reasonable cause on pet-policy waiver complaints only where the animal has that
            kind of individual task training.
          </Para>
          <Para>
            This is not a minor procedural update — it changes which complaints the federal agency
            will investigate and pursue when a landlord denies an accommodation request.
          </Para>

          <SubHeading>3. Untrained ESAs are no longer presumptively reasonable — federally</SubHeading>
          <Para>
            Under the previous guidance, ESA accommodation requests were treated as presumptively
            reasonable, with the burden largely on the landlord to justify denial. Under the new
            posture, that presumption applies to trained assistance animals. For untrained ESAs —
            animals that provide comfort or companionship through presence alone — HUD has indicated
            that complaints are expected to be dismissed or closed with no-cause findings, and open
            cases are being reviewed individually. In practical terms, the HUD complaint pathway is
            no longer a reliable enforcement route for purely comfort-based ESAs.
          </Para>

          <SectionHeading id="pet-fees">Can landlords now charge pet fees for ESAs?</SectionHeading>
          <Para>
            For many tenants the most immediate concern is money: pet fees, deposits, and monthly
            pet rent can add thousands of dollars to housing costs, and ESA accommodations were
            widely used to have those charges waived.
          </Para>
          <Para>
            <strong className="text-gray-800">For untrained ESAs:</strong> the federal enforcement
            deterrent that discouraged these charges has been reduced. Whether a landlord may
            actually charge fees for an untrained ESA in your situation depends on your state and
            local law — several states still restrict it — and legal commentators describe this
            area as unsettled. Do not assume fees are automatically allowed, and do not assume they
            are automatically barred: check your state&apos;s rules, and if real money is at stake,
            consult a fair-housing attorney.
          </Para>
          <Para>
            <strong className="text-gray-800">For trained PSDs and service animals:</strong> nothing
            changed. Fee waivers remain required for animals individually trained to perform
            disability-related tasks. And while the ADA limits service animals to dogs (and certain
            miniature horses), HUD&apos;s 2026 framework recognizes that under the Fair Housing Act
            other species may still qualify — provided they are individually trained to perform
            specific disability-related tasks.
          </Para>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Not sure where your documentation stands now?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can review your situation and determine whether
              ESA or PSD documentation is clinically appropriate for you. No outcome is guaranteed —
              every housing request is decided individually.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                <i className="ri-clipboard-line"></i> Check your documentation options
              </Link>
              <Link
                to="/housing-rights-esa"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-home-heart-line"></i> ESA housing rights guide
              </Link>
            </div>
          </div>

          <SectionHeading id="rights-remaining">Why your housing rights aren&apos;t entirely gone</SectionHeading>
          <Para>
            Before concluding that ESA protections have simply been eliminated, it is essential to
            understand what the May 2026 memorandum is — and what it is not. An agency enforcement
            memo is not a statutory change. The text of the Fair Housing Act has not been amended,
            and Congress has not passed legislation removing ESA protections. HUD changed how it
            prioritizes and investigates complaints — it did not rewrite the law that governs
            housing discrimination. That distinction leaves three meaningful protections in place.
          </Para>

          <SubHeading>Private rights of action still exist</SubHeading>
          <Para>
            The Fair Housing Act allows tenants to file private civil lawsuits in state or federal
            court — a path that does not run through HUD at all, generally within two years of an
            alleged discriminatory act. The memo does not remove this right. A landlord who issues
            blanket, automatic denials of every ESA request without an individualized review still
            faces real litigation risk, and years of case law support tenants in many fact patterns.
            HUD declining to pursue a complaint is not the same as having no legal recourse — but
            outcomes depend on your facts, so an experienced fair-housing attorney is the right
            person to assess a specific case.
          </Para>

          <SubHeading>State and local protections may still apply</SubHeading>
          <Para>
            HUD&apos;s memo does not override state or local fair-housing laws. A number of states
            have statutes that are more protective than the federal enforcement floor — California,
            for example, has its own fair-housing framework enforced by a state agency, entirely
            independent of HUD&apos;s posture. If your state law protects ESA accommodations, your
            landlord must still comply with state law regardless of federal enforcement priorities.
            Before assuming you have lost protection, review the{" "}
            <Link to="/esa-laws" className={inlineLink}>
              state emotional support animal laws
            </Link>{" "}
            that apply to you — and if you are in California, see the dedicated{" "}
            <Link to="/esa-letter/california" className={inlineLink}>
              California ESA letter
            </Link>{" "}
            guide.
          </Para>

          <figure className="my-6">
            <img
              src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
              alt="Woman with her emotional support dog settling into a new apartment"
              width={1600}
              height={1067}
              loading="lazy"
              decoding="async"
              className="w-full h-48 sm:h-72 object-cover rounded-2xl border border-gray-100"
            />
            <figcaption className="text-xs text-gray-400 mt-2 text-center">
              State and local fair-housing laws may still protect ESA accommodations independently
              of HUD&apos;s federal enforcement posture.
            </figcaption>
          </figure>

          <SubHeading>The individualized review obligation remains</SubHeading>
          <Para>
            Even under the new federal posture, housing providers are still expected to engage in an
            interactive, individualized assessment of accommodation requests rather than imposing
            blanket bans. What changed is that the outcome of that process for untrained animals no
            longer carries the same federal enforcement backup at HUD. If your request was refused,
            our guide on{" "}
            <Link to="/landlord-denied-esa-letter" className={inlineLink}>
              what to do when a landlord denies your ESA letter
            </Link>{" "}
            walks through sensible next steps.
          </Para>

          <SectionHeading id="psd-path">A stronger path under the new standard: task-trained psychiatric service dogs</SectionHeading>
          <Para>
            For people whose mental health genuinely benefits from an animal&apos;s help, the
            clearest route to strong federal protection under the 2026 standard is a dog that is
            individually trained to perform disability-related tasks — a psychiatric service dog
            (PSD).
          </Para>
          <SubHeading>What is a psychiatric service dog?</SubHeading>
          <Para>
            A PSD is a dog individually trained to perform specific tasks that mitigate the symptoms
            of a mental health disability. It is a recognized category of service animal — not a
            marketing label. Commonly associated conditions include PTSD, major depressive disorder,
            generalized anxiety disorder, bipolar disorder, OCD, and other diagnoses that
            substantially limit major life activities. Whether any individual qualifies is a
            clinical and legal question — there is no automatic qualification. You can read more in
            our{" "}
            <Link to="/how-to-get-psd-letter" className={inlineLink}>
              psychiatric service dog letter
            </Link>{" "}
            guide and our{" "}
            <Link to="/all-about-service-dogs" className={inlineLink}>
              service dog overview
            </Link>
            .
          </Para>
          <SubHeading>Why trained tasks matter in 2026</SubHeading>
          <Para>
            Because PSDs are individually trained to perform tasks, they align with the standard
            HUD&apos;s new enforcement framework uses. A PSD handler is not asking for a presumption
            — they can point to specific, observable, trained behaviors. The key distinction is
            passive versus active: a dog whose presence is comforting has not performed a trained
            task; a dog that takes a specific trained action in response to a trigger or command
            has. Recognized examples include:
          </Para>
          <div className="grid gap-3 sm:grid-cols-2 my-5">
            {psdTasks.map((t) => (
              <div key={t.title} className="bg-[#fafafa] border border-gray-100 rounded-xl p-4">
                <p className="text-[13px] font-bold text-gray-900 mb-1 flex items-start gap-2">
                  <i className="ri-shield-star-line text-orange-500 mt-0.5"></i>
                  {t.title}
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <SubHeading>Does a PSD need professional certification?</SubHeading>
          <Para>
            Neither HUD nor the ADA requires professional third-party training or certification — a
            handler may train their own dog. What carries the most weight, especially in housing, is
            documentation from a licensed mental health professional who has an actual clinical
            relationship with the handler: someone who has evaluated the person and can speak to the
            disability and the disability-related need. That is exactly the element the
            instant-letter model lacked — and exactly what HUD criticized. PawTenant does not train
            or certify service animals, and documentation alone does not make any animal a service
            animal.
          </Para>

          <figure className="my-6">
            <img
              src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
              alt="Licensed mental health professional speaking with a client and her dog during a telehealth evaluation"
              width={1600}
              height={1067}
              loading="lazy"
              decoding="async"
              className="w-full h-48 sm:h-72 object-cover rounded-2xl border border-gray-100"
            />
            <figcaption className="text-xs text-gray-400 mt-2 text-center">
              Documentation from a licensed mental health professional with a genuine clinical
              relationship carries the most weight in housing reviews.
            </figcaption>
          </figure>

          {/* ── PSD CTA ── */}
          <div className="my-8 rounded-2xl border border-gray-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 mb-1">Considering the PSD route?</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Start with an evaluation by a licensed mental health professional. Documentation is
                issued only where clinically appropriate.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 flex-shrink-0">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-xs"
              >
                <i className="ri-stethoscope-line"></i> Start your ESA/PSD assessment
              </Link>
              <Link
                to="/how-to-get-psd-letter"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-xs"
              >
                <i className="ri-book-open-line"></i> PSD documentation guide
              </Link>
            </div>
          </div>

          <SectionHeading id="comparison">2026 landscape at a glance</SectionHeading>
          <Para>
            How trained psychiatric service dogs and untrained ESAs compare under the new federal
            enforcement framework:
          </Para>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[26%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="ri-shield-star-line text-orange-500"></i> Trained PSDs & service animals
                    </span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="ri-heart-3-line text-orange-400"></i> Untrained ESAs
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.psd}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.esa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3 my-5">
            {comparisonRows.map((row) => (
              <div key={row.feature} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">
                  {row.feature}
                </p>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <i className="ri-shield-star-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Trained PSD / service animal</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.psd}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <i className="ri-heart-3-line text-orange-400 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Untrained ESA</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.esa}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="what-to-do">What you should do now</SectionHeading>
          <Para>
            The era of waiving pet fees with an instantly generated online certificate is over —
            HUD&apos;s May 2026 memorandum made individual task training the center of federal
            enforcement. But people with genuine psychiatric disabilities have not been abandoned by
            the law: the Fair Housing Act&apos;s text is unchanged, private civil litigation remains
            available, and many state and local laws continue to protect ESA accommodations
            independently. If your mental health genuinely benefits from an animal companion, four
            steps matter most right now:
          </Para>
          <ol className="space-y-3 my-5">
            {[
              {
                title: "Understand your state's fair-housing law.",
                desc: "If your state independently protects ESA accommodations, your practical situation may be less changed than headlines suggest.",
              },
              {
                title: "Consider whether your animal can be task-trained.",
                desc: "Some animals already exhibit learned behaviors that, with deliberate training and honest documentation, may qualify as disability-related tasks. Others will not — and no service can change that.",
              },
              {
                title: "Establish or renew a real clinical relationship.",
                // Rendered via the i === 2 branch below so the landlord-guide link stays inline.
                desc: "",
              },
              {
                title: "Consult a fair-housing attorney for urgent disputes.",
                desc: "Private rights of action remain available, and existing case law still supports many tenant claims. An attorney can assess your specific facts.",
              },
            ].map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{step.title}</p>
                  <p className="text-xs md:text-[13px] text-gray-600 leading-relaxed">
                    {i === 2 ? (
                      <>
                        Documentation from a licensed mental health professional who actually
                        evaluates and treats you is the element that most reliably holds up when
                        questioned — and how you present it matters too; see our guide to{" "}
                        <Link to="/esa-letter-for-landlord" className={inlineLink}>
                          sharing an ESA letter with your landlord
                        </Link>
                        .
                      </>
                    ) : (
                      step.desc
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Para>
            The rules have shifted — but the path to genuine, defensible housing accommodation for
            people who need animal assistance remains open. It runs through honest training, honest
            documentation, and a real clinical relationship.
          </Para>

          {/* ── Sources ── */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  HUD Office of Fair Housing and Equal Opportunity, enforcement memorandum on assistance animals (May 22, 2026) —{" "}
                  <a href="https://www.hud.gov/program_offices/fair_housing_equal_opp" target="_blank" rel="noopener noreferrer" className={inlineLink}>
                    hud.gov / FHEO
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  Disability Rights Education & Defense Fund, analysis of HUD&apos;s 2026 ESA enforcement change —{" "}
                  <a href="https://dredf.org/huds-esa-policy-reversal/" target="_blank" rel="noopener noreferrer" className={inlineLink}>
                    dredf.org
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  PawTenant&apos;s plain-English explainer:{" "}
                  <Link to="/are-esa-letters-still-valid-after-hud-change" className={inlineLink}>
                    Are ESA letters still valid after the 2026 HUD change?
                  </Link>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span className="text-sm font-bold text-gray-900">{f.q}</span>
                  <i
                    className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  ></i>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Need updated ESA or PSD documentation?
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional can evaluate your situation and determine whether
            documentation is clinically appropriate under the 2026 landscape. Every housing request
            is decided individually — no outcome is guaranteed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link
              to="/housing-rights-esa"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-home-heart-line"></i> ESA housing rights guide
            </Link>
          </div>
        </div>
      </section>

      {/* ===== KEEP READING ===== */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">
            Keep reading
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: "/are-esa-letters-still-valid-after-hud-change", icon: "ri-government-line", label: "Are ESA letters still valid after the HUD change?" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights explained" },
              { to: "/landlord-denied-esa-letter", icon: "ri-close-circle-line", label: "Landlord denied your ESA letter?" },
              { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
              { to: "/how-to-get-esa-letter-online", icon: "ri-computer-line", label: "Getting an ESA letter online" },
              { to: "/esa-laws", icon: "ri-scales-3-line", label: "ESA laws by state" },
            ].map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all"
              >
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LEGAL DISCLAIMER ===== */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Informational only — not legal advice.</strong>{" "}
              This article summarizes a developing area of housing policy and is not a substitute
              for advice from a licensed attorney. State and local law vary and may provide
              protections beyond the federal enforcement posture described here. PawTenant connects
              you with licensed mental health professionals; it does not train or certify service
              animals, claim any government affiliation, or guarantee landlord approval, fee
              waivers, HUD action, or any legal outcome. Documentation alone does not resolve every
              housing situation. For your specific circumstances, consult a fair-housing attorney or
              your state fair-housing agency.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
