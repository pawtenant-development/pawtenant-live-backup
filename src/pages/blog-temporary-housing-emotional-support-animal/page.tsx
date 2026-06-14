// Blog article — /blog/temporary-housing-emotional-support-animal
//
// "Can You Have an Emotional Support Animal in Temporary Housing or Extended Stays?"
//
// Educational article targeting temporary-housing / extended-stay / rental /
// housing-accommodation searches. Busy 2026 travel/relocation season = context.
//
// COMPLIANCE (do NOT loosen without owner sign-off): no FIFA/World Cup/team/
// stadium marks; no claim of affiliation with FIFA, the World Cup, host cities,
// hotels, or Airbnb; no "FIFA/World Cup ESA letter" wording; no promise of
// hotel/Airbnb acceptance or guaranteed landlord approval; ESA centers on
// HOUSING; "licensed provider" not "doctor"; no guarantee language.
//
// SEO from CORE_PAGE_META via SEOManager + prerender. Adds keyword/OG/Twitter
// meta + BlogPosting/Breadcrumb/FAQ JSON-LD. Styling follows the HUD blog.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/temporary-housing-emotional-support-animal";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg";

const topicChips = ["Temporary Housing", "Extended Stays", "Rentals", "Fair Housing Act"];

const faqs = [
  {
    q: "Can I have an emotional support animal in temporary or short-term housing?",
    a: "It depends on the property and how it's classified. The Fair Housing Act covers most rental housing, including many short-term and extended-stay rentals — but pure hotel stays and some vacation rentals may not be covered the same way. Where the housing is covered, a valid ESA letter can support a reasonable-accommodation request. Always confirm the property's status and policy directly, because no letter forces acceptance.",
  },
  {
    q: "Does an ESA letter work for a hotel or Airbnb during a busy travel season?",
    a: "Not necessarily. Hotels and many short-term hosts are not always covered by the same housing rules, and an ESA letter does not force any host to accept an animal. Confirm each property's pet and accommodation policy before you book. An ESA letter centers on covered housing, not guaranteed acceptance by every host.",
  },
  {
    q: "I'm relocating temporarily for work. Can I bring my ESA?",
    a: "Often yes, where you're renting covered housing. The Fair Housing Act applies to most rentals regardless of lease length, so a corporate or extended-stay rental that qualifies as housing is generally subject to reasonable-accommodation rules. Get documentation from a provider licensed in the state you're moving to, and start early — a few states require a 30-day provider relationship first.",
  },
  {
    q: "What documentation do I need for a temporary rental?",
    a: "A current ESA letter from a licensed mental health professional — ideally issued within the past 12 months — that names the provider, their license details, and is signed and dated. You submit it with a written reasonable-accommodation request. You do not need to share your full medical records or a specific diagnosis, and there is no official ESA registry, certificate, or ID card requirement.",
  },
  {
    q: "Can my landlord deny my ESA in a short-term lease?",
    a: "A housing provider can deny an accommodation only on limited, lawful grounds — for example, a direct threat to others' safety or substantial property damage that can't be reduced, or an undue burden. They cannot deny simply because the lease is short or the building has a no-pet policy. Every request is reviewed individually, and approval is never automatic or guaranteed.",
  },
];

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

export default function BlogTemporaryHousingESAPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="emotional support animal temporary housing, ESA extended stay, ESA short term rental, ESA letter relocation, ESA corporate housing, ESA furnished rental, temporary housing ESA rights"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Can You Have an Emotional Support Animal in Temporary Housing or Extended Stays?" />
      <meta
        property="og:description"
        content="How emotional support animal rules apply to temporary housing, extended stays, and short-term rentals — what the Fair Housing Act covers, how landlord policies differ, and the documentation basics."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-15" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="ESAs in Temporary Housing & Extended Stays: What to Know" />
      <meta name="twitter:description" content="What the Fair Housing Act covers for temporary and extended-stay rentals — and what it doesn't." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "Can You Have an Emotional Support Animal in Temporary Housing or Extended Stays?",
                description:
                  "How emotional support animal rules apply to temporary housing, extended stays, and short-term rentals — what the Fair Housing Act covers, how policies differ, and documentation basics.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: [HERO_IMG],
                datePublished: "2026-06-15",
                dateModified: "2026-06-15",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Housing Rights",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "ESA in Temporary Housing", item: CANONICAL },
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

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-[#fffaf4] to-white pt-28 pb-12 sm:pt-32 sm:pb-14">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <nav className="text-xs text-gray-400 mb-5" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-orange-600">Home</Link>
            <span className="mx-1.5">/</span>
            <Link to="/blog" className="hover:text-orange-600">Blog</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">ESA in Temporary Housing</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[40px] font-extrabold text-gray-900 leading-tight mb-4">
            Can You Have an Emotional Support Animal in{" "}
            <span className="text-orange-500">Temporary Housing or Extended Stays?</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Published June 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~9 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick answer
            </p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Often, yes — where the property counts as covered housing. The{" "}
              <Link to="/housing-rights-esa" className={inlineLink}>Fair Housing Act</Link> applies to
              most rentals regardless of lease length, so many extended-stay and short-term rentals
              are subject to reasonable-accommodation rules. Pure hotel stays and some vacation
              rentals may not be covered the same way, and no ESA letter forces acceptance — always
              confirm the property&apos;s policy directly.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
              alt="A renter settling into a temporary apartment with her emotional support dog"
              width={1600}
              height={1067}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover object-center rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>
        </div>
      </section>

      {/* BODY */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading id="why-now">More people are in temporary housing right now</SectionHeading>
          <Para>
            Busy travel seasons and large sporting events push a lot of people into short-term and
            extended-stay housing all at once — the 2026 World Cup travel season is one example of
            when demand for furnished rentals, corporate stays, and sublets rises in popular
            destinations. If you rely on an emotional support animal, a natural question follows: do
            the same housing protections apply when the stay is temporary?
          </Para>
          <Para>
            The short version: it depends far less on how <em>long</em> you&apos;re staying and far
            more on <em>what kind of housing</em> it is.
          </Para>

          <SectionHeading id="what-counts">What counts as covered housing</SectionHeading>
          <Para>
            The Fair Housing Act covers most rental housing — apartments, houses, condos, many
            furnished and corporate rentals — and it generally doesn&apos;t turn on lease length. A
            three-month furnished lease and a twelve-month lease are both rentals. That means a valid
            ESA letter can support a reasonable-accommodation request in many temporary and
            extended-stay situations.
          </Para>
          <SubHeading>Where it gets murkier</SubHeading>
          <Para>
            Some short-term arrangements aren&apos;t treated like rental housing. Pure hotel and
            motel stays, and certain owner-occupied or very short vacation rentals, may fall outside
            the usual housing-accommodation rules. This is exactly why you should confirm a
            property&apos;s classification and policy <strong>before</strong> you commit — and never
            assume a letter guarantees acceptance anywhere.
          </Para>

          <SubHeading>Short-term vs longer-term considerations</SubHeading>
          <Para>
            For a longer extended stay, you have time to submit documentation, engage in the
            interactive process with the housing provider, and resolve questions. For a very short
            stay, there may be little time for back-and-forth — so it&apos;s worth confirming the
            policy in advance and having your documentation ready before you arrive.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-home-heart-line text-orange-500"></i> Relocating temporarily with your ESA?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              Start with documentation from a provider licensed in the state you&apos;re moving to. A
              licensed mental health professional decides whether an ESA is clinically appropriate —
              approval is never guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-clipboard-line"></i> Start your ESA assessment
              </Link>
              <Link to="/explore-esa-letters-all-states" className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-map-pin-line"></i> ESA rules by state
              </Link>
            </div>
          </div>

          <SectionHeading id="landlord-policies">How landlord and property policies differ</SectionHeading>
          <Para>
            Even within covered housing, you&apos;ll encounter different approaches. Some property
            managers handle ESA accommodations routinely and quickly. Others — especially in
            furnished or corporate housing — may be less familiar and ask more questions. A few
            things stay constant:
          </Para>
          <ul className="space-y-2.5 my-5">
            {[
              "A no-pet policy alone is not a lawful reason to deny a valid accommodation request in covered housing.",
              "Providers can ask for documentation of a disability-related need, but not your full medical records or specific diagnosis.",
              "Requests are evaluated individually — there is an interactive process, not an automatic yes or no.",
              "Pet deposits and pet fees are treated differently from accommodations; rules here can depend on state and local law.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
          <Para>
            State rules add another layer. A few states (for example, California and Iowa) require a
            30-day provider relationship before an ESA letter can be issued, so plan ahead if
            you&apos;re moving there. Start with your destination&apos;s guide:{" "}
            <Link to="/esa-letter/new-york" className={inlineLink}>New York</Link>,{" "}
            <Link to="/esa-letter/texas" className={inlineLink}>Texas</Link>,{" "}
            <Link to="/esa-letter/california" className={inlineLink}>California</Link>, or{" "}
            <Link to="/esa-letter/florida" className={inlineLink}>Florida</Link> — or browse{" "}
            <Link to="/explore-esa-letters-all-states" className={inlineLink}>all states</Link>.
          </Para>

          <SectionHeading id="documentation">ESA documentation basics for temporary stays</SectionHeading>
          <Para>
            Whether your stay is three weeks or three months, the documentation is the same: a
            current letter from a licensed mental health professional that names the provider, their
            license details, and is signed and dated — ideally issued within the past 12 months. You
            submit it with a short written reasonable-accommodation request. There is no official ESA
            registry, and a certificate, ID card, or vest is never legally required.
          </Para>
          <Para>
            For the full step-by-step, see{" "}
            <Link to="/how-to-get-esa-letter-online" className={inlineLink}>how to get an ESA letter online</Link>{" "}
            and{" "}
            <Link to="/esa-letter-for-landlord" className={inlineLink}>how to share an ESA letter with your landlord</Link>
            .
          </Para>
          <Para>
            One honest caveat: nothing here guarantees approval. Every reasonable-accommodation
            request is decided individually by the housing provider, and a valid letter supports —
            but does not guarantee — a yes. If you&apos;re turned down, our guide to{" "}
            <Link to="/landlord-denied-esa-letter" className={inlineLink}>what to do when a landlord denies an ESA</Link>{" "}
            covers calm next steps.
          </Para>

          {/* Sources */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>PawTenant: <Link to="/housing-rights-esa" className={inlineLink}>ESA housing rights under the Fair Housing Act</Link></span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>UK government travel advice for the USA — <a href="https://www.gov.uk/foreign-travel-advice/usa" target="_blank" rel="noopener noreferrer" className={inlineLink}>gov.uk/foreign-travel-advice/usa</a></span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>PawTenant overview: <Link to="/travel-anxiety-esa-letter" className={inlineLink}>ESA letters for travel anxiety & temporary housing</Link></span>
              </li>
            </ul>
          </div>
        </div>
      </article>

      {/* FAQ */}
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
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1"><p className="text-sm text-gray-600 leading-relaxed">{f.a}</p></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Documentation for your move</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            Get evaluated by a provider licensed in your state. If an emotional support animal is
            clinically appropriate, you receive a letter to support a housing request — approval is
            never guaranteed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-file-text-line"></i> Start assessment
            </Link>
            <Link to="/explore-esa-letters-all-states" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-map-pin-line"></i> ESA rules by state
            </Link>
          </div>
        </div>
      </section>

      {/* KEEP READING */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: "/blog/emotional-support-animal-travel-anxiety", icon: "ri-flight-takeoff-line", label: "Can an ESA help with travel anxiety?" },
              { to: "/blog/crowds-travel-stress-emotional-support-animal", icon: "ri-group-line", label: "Crowds, travel stress & ESAs" },
              { to: "/travel-anxiety-esa-letter", icon: "ri-suitcase-line", label: "Travel anxiety ESA overview" },
              { to: "/esa-letter-for-landlord", icon: "ri-mail-send-line", label: "Sharing an ESA letter with your landlord" },
              { to: "/landlord-denied-esa-letter", icon: "ri-close-circle-line", label: "Landlord denied your ESA?" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights explained" },
            ].map((r) => (
              <Link key={r.to} to={r.to} className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all">
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Educational information, not legal or medical advice.</strong>{" "}
              Housing coverage depends on the property and on state and local law. PawTenant connects
              you with licensed mental health professionals; whether an ESA is appropriate is decided
              by a licensed provider after a real evaluation. An ESA letter supports — but does not
              guarantee — a housing provider&apos;s decision, and it does not force a hotel, Airbnb,
              or short-term host to accept an animal. PawTenant is independent and is not affiliated
              with, endorsed by, or connected to FIFA, the World Cup, any host city, hotel, or
              booking platform.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
