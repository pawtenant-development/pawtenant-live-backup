// San Francisco HOA & PSD guide — /states/san-francisco-hoa-psd-guide
//
// Regional guide in the California ESA/PSD cluster (SEO-CA-ESA-PSD-CLUSTER-001).
// Converted from `san-francisco-hoa-psd-guide.md`. Compliance: no
// "legit/legitimate" in headings/meta; a PSD's status comes from task training,
// not a letter/vest; PSD documentation supports housing; no guaranteed approval.
// Links back to /states/california-esa-psd-guide near the PSD/HOA/accommodation
// discussion.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + Article/Breadcrumb/FAQ JSON-LD.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/states/san-francisco-hoa-psd-guide";
const PARENT = "/states/california-esa-psd-guide";

const topicChips = ["San Francisco", "HOA & Davis-Stirling", "Psychiatric Service Dog", "FEHA"];

// ── FAQs — mirror faq-schema.json → sanFranciscoGuide (visible + FAQPage JSON-LD) ─
const faqs = [
  {
    q: "Can a San Francisco HOA enforce weight or breed limits on a Psychiatric Service Dog?",
    a: "No. A genuine Psychiatric Service Dog that has been trained to perform a disability-mitigating task is treated as a medical assistive device rather than a pet, so standard HOA weight or breed restrictions do not apply to it.",
  },
  {
    q: "What can a San Francisco HOA board legally ask me about my Psychiatric Service Dog?",
    a: "Under federal and state law, if the disability isn't obvious, an HOA board may only ask whether the dog is a service animal required because of a disability and what work or task it has been trained to perform. The board cannot demand medical records or certification.",
  },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-10 mb-3 scroll-mt-28">{children}</h2>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function SanFranciscoHoaPsdGuidePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="San Francisco HOA psychiatric service dog, HOA breed weight limit PSD, Davis-Stirling service animal, PSD accommodation San Francisco, HOA pet fees PSD, common interest development service dog California"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="San Francisco HOA Restrictions & PSD Accommodations | PawTenant" />
      <meta property="og:description" content="How federal and California disability law limits San Francisco HOA pet policies — breed bans, weight caps, and fees — when a resident has a task-trained Psychiatric Service Dog." />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg" />
      <meta name="twitter:title" content="San Francisco HOA Restrictions & PSD Accommodations | PawTenant" />
      <meta name="twitter:description" content="How the Davis-Stirling Act, FEHA, and the ADA limit HOA restrictions on a task-trained Psychiatric Service Dog." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                "@id": `${CANONICAL}#article`,
                headline: "San Francisco HOA Restrictions & PSD Accommodations",
                description: "How federal and California disability law limits how far San Francisco HOA pet policies can reach when a resident has a task-trained Psychiatric Service Dog.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg"],
                datePublished: "2026-07-08",
                dateModified: "2026-07-08",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Legal & Rights",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "California ESA & PSD Guide", item: `https://pawtenant.com${PARENT}` },
                  { "@type": "ListItem", position: 3, name: "San Francisco HOA & PSD Accommodations", item: CANONICAL },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
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
            <Link to={PARENT} className="hover:text-orange-600">California ESA &amp; PSD Guide</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">San Francisco HOA &amp; PSD</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[40px] font-extrabold text-gray-900 leading-tight mb-4">
            San Francisco HOA Restrictions &amp; <span className="text-orange-500">PSD Accommodations</span>
          </h1>
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Homeowners associations and condo boards in San Francisco often enforce tight pet policies —
              breed bans, weight caps, per-unit limits. Federal and California disability law sharply limits
              how far those rules can reach when a resident has a task-trained Psychiatric Service Dog (PSD).
              It&apos;s the task training — not a letter or a vest — that establishes the legal status; the{" "}
              <Link to={PARENT} className={inlineLink}>California ESA &amp; PSD guide</Link> covers how PSDs and
              ESAs differ.
            </p>
          </div>
        </div>
      </section>

      {/* ===== BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading>Can a San Francisco HOA enforce weight or breed limits on a Psychiatric Service Dog?</SectionHeading>
          <Para>
            No. A PSD that has been individually trained to perform a task mitigating its handler&apos;s
            disability is legally treated as a medical assistive device, not a pet — comparable to a wheelchair
            or a hearing aid. Standard HOA bylaws capping dog weight (say, under 25 pounds) or excluding certain
            breeds have no legal force against a genuine PSD, because those rules were written to govern pets and
            a service animal isn&apos;t one under the ADA or California&apos;s Fair Employment and Housing Act
            (FEHA).
          </Para>
          <Para>
            It&apos;s worth being precise about what makes a dog a PSD in the first place, since this is where
            disputes often start: it&apos;s the task training, not a letter or a vest, that establishes the legal
            status. A dog that hasn&apos;t been trained to perform a specific disability-related task —
            interrupting a panic episode, providing tactile grounding during dissociation, retrieving
            medication — doesn&apos;t qualify as a PSD regardless of what documentation says, and an HOA is not
            obligated to waive its pet policy for an untrained companion animal. If your dog has genuinely
            received that training, though, the HOA&apos;s bylaws simply don&apos;t reach it. Our guide on{" "}
            <Link to="/blog/how-to-train-psychiatric-service-dog-tasks" className={inlineLink}>
              training a psychiatric service dog
            </Link>{" "}
            explains what qualifies as a task.
          </Para>

          <SectionHeading>What can a San Francisco HOA board legally ask me about my Psychiatric Service Dog?</SectionHeading>
          <Para>If the disability isn&apos;t obvious, an HOA board is limited to two questions under federal and state law:</Para>
          <ol className="list-decimal pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Is the dog a service animal required because of a disability?</li>
            <li>What work or task has the dog been trained to perform?</li>
          </ol>
          <Para>
            The board cannot demand medical records, a specific diagnosis, or third-party
            &quot;certification&quot; — none of which is a legal prerequisite for a service animal in California
            or under the ADA. If a board is requesting more than these two questions allow, that request itself
            may not be compliant with fair housing law.
          </Para>

          <SectionHeading>Do common-area access rights apply?</SectionHeading>
          <Para>
            Yes. Under California civil law governing common-interest developments, an HOA cannot bar a PSD from
            any common area a resident is otherwise permitted to use — gyms, pools, courtyards, clubhouses,
            lobbies. The dog must stay under the handler&apos;s control, typically via leash or harness, though
            the ADA allows for voice or signal control instead of a physical leash when a leash would interfere
            with the dog&apos;s trained tasks (for example, a dog trained to apply deep pressure during an
            episode may need to work off-leash in that moment).
          </Para>

          <SectionHeading>How does the Davis-Stirling Act factor in?</SectionHeading>
          <Para>
            California&apos;s Davis-Stirling Common Interest Development Act governs how HOAs are formed and
            operated, including their authority to write and enforce CC&amp;Rs (covenants, conditions, and
            restrictions). Davis-Stirling gives HOAs real authority over pet policy in general — but that
            authority is subordinate to federal and state disability law. An HOA can still restrict ordinary
            pets under its bylaws; it cannot apply those same restrictions to a genuine service animal, because
            FEHA and the ADA function as an override in that specific case.
          </Para>

          <SectionHeading>Can the HOA charge pet fees for a PSD?</SectionHeading>
          <Para>
            No. Because a PSD isn&apos;t a pet under fair housing law, an HOA can&apos;t impose pet deposits, pet
            rent, or added fees tied to having the animal in a unit. As with rental housing, the resident remains
            responsible for actual damage the dog causes to common property.
          </Para>

          <SectionHeading>What should San Francisco residents do if their HOA pushes back?</SectionHeading>
          <Para>
            Put the accommodation request in writing, note the specific two questions the board asked (or
            exceeded), and if the board continues to enforce a weight, breed, or fee restriction against a
            genuinely trained PSD, that&apos;s a matter California&apos;s Civil Rights Department (CRD) or a fair
            housing attorney can address directly. Because much of this comes down to whether the dog has
            actually been trained to perform a qualifying task, it also helps to have documentation of that
            training on hand, not just a general letter — that&apos;s the fact an HOA is legally entitled to ask
            about. For the statewide framework these rights sit on top of, see the{" "}
            <Link to={PARENT} className={inlineLink}>California ESA &amp; PSD legal guide</Link>.
          </Para>

          {/* ── CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-shield-star-line text-orange-500"></i> Exploring the PSD route in San Francisco?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A PSD&apos;s legal status comes from real task training. A California-licensed mental health
              professional can evaluate whether PSD documentation is clinically appropriate for your situation —
              documentation supports the disability side; the task training is separate. No outcome is
              guaranteed, and you get a refund if you don&apos;t qualify.
            </p>
            <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
              <i className="ri-clipboard-line"></i> Start a PSD assessment
            </Link>
          </div>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors" aria-expanded={openFaq === i}>
                  <span className="text-sm font-bold text-gray-900">{f.q}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}></i>
                </button>
                {openFaq === i && (<div className="px-5 pb-4 -mt-1"><p className="text-sm text-gray-600 leading-relaxed">{f.a}</p></div>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== KEEP READING ===== */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: PARENT, icon: "ri-map-pin-2-line", label: "California ESA & PSD legal guide (AB 468)" },
              { to: "/states/los-angeles-esa-landlord-guide", icon: "ri-building-line", label: "Los Angeles landlord ESA rules" },
              { to: "/states/san-diego-telehealth-guide", icon: "ri-video-chat-line", label: "San Diego telehealth & AB 468" },
              { to: "/blog/how-to-train-psychiatric-service-dog-tasks", icon: "ri-shield-star-line", label: "How to train a psychiatric service dog" },
              { to: "/psd-letter/california", icon: "ri-file-text-line", label: "California PSD letter guide" },
              { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
            ].map((r) => (
              <Link key={r.to} to={r.to} className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all">
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DISCLAIMER ===== */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Informational only — not legal advice.</strong>{" "}
              This guide summarizes San Francisco, California, and federal housing rules and is not a substitute
              for advice from a licensed attorney. A PSD&apos;s legal status comes from individual task training,
              not from documentation, a vest, or an ID card. PawTenant connects you with licensed mental health
              professionals and does not train, certify, or register service animals, sell registrations, or
              guarantee any landlord or HOA decision. For your specific situation, consult a fair-housing attorney
              or California&apos;s Civil Rights Department.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
