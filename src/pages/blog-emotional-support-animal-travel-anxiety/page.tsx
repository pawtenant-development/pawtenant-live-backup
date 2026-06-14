// Blog article — /blog/emotional-support-animal-travel-anxiety
//
// "Can an Emotional Support Animal Help With Travel Anxiety?"
//
// Educational article targeting travel-anxiety + ESA searches. Uses the busy
// 2026 travel season only as situational context.
//
// COMPLIANCE (do NOT loosen without owner sign-off): no FIFA/World Cup/team/
// stadium marks; no claim of affiliation with FIFA, the World Cup, host cities,
// airlines, hotels, or Airbnb; no "FIFA/World Cup ESA letter" wording; no
// promise of stadium/airline/hotel access or guaranteed approval; ESA centers
// on HOUSING, not public access; "licensed provider" not "doctor".
//
// SEO title/description/canonical from CORE_PAGE_META via SEOManager + prerender.
// This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ JSON-LD.
// Styling follows /blog/2026-hud-esa-guidelines.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/emotional-support-animal-travel-anxiety";
const HERO_IMG = "https://pawtenant.com/assets/travel/dog-walk-street.jpg";

const topicChips = ["Travel Anxiety", "Emotional Support Animal", "Housing", "Mental Health"];

const faqs = [
  {
    q: "Can an emotional support animal help with travel anxiety?",
    a: "Many people find that having a familiar animal nearby brings comfort and a steadier routine during stressful travel — crowded airports, long road trips, time-zone changes, and unfamiliar places. An ESA is not a medical treatment and does not cure anxiety. Whether an emotional support animal is appropriate for you is a clinical decision made by a licensed mental health professional after a real evaluation.",
  },
  {
    q: "Can I bring my emotional support animal on a flight?",
    a: "An ESA letter does not guarantee any airline rights. Since 2021, U.S. airlines are no longer required to treat emotional support animals as service animals, and most now handle ESAs under their standard pet policies. Air travel has its own separate rules — always check directly with your airline before booking. An ESA letter centers on housing accommodation, not air travel.",
  },
  {
    q: "Does an ESA letter let my animal into stadiums or events?",
    a: "No. An ESA letter is about housing accommodation, not public access. It does not grant entry to stadiums, sporting events, arenas, concerts, or other public venues. Trained service dogs under the Americans with Disabilities Act have public-access rights that emotional support animals do not.",
  },
  {
    q: "What helps with travel anxiety besides an ESA?",
    a: "Planning ahead, arriving early to avoid rushing, keeping familiar items with you, building in rest, and staying connected to your support system all help. Official travel guidance also encourages preparing for busier-than-usual conditions during major travel seasons. An emotional support animal can be one part of a broader plan — not a substitute for professional care.",
  },
  {
    q: "How do I find out if I qualify for an ESA?",
    a: "Complete a short, private assessment. A provider licensed in your state reviews it and applies clinical judgment. If an emotional support animal is clinically appropriate, you receive a letter — usually digitally. You're only charged if you qualify, and approval is never guaranteed.",
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

export default function BlogESATravelAnxietyPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="emotional support animal travel anxiety, ESA travel anxiety, does an ESA help with anxiety, ESA on flights, travel stress emotional support animal, ESA road trip anxiety, emotional support animal crowds"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Can an Emotional Support Animal Help With Travel Anxiety?" />
      <meta
        property="og:description"
        content="How an emotional support animal may ease travel anxiety on flights, road trips, and in crowds — plus the legal limits: ESAs center on housing, not airline or stadium access."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-15" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="Can an Emotional Support Animal Help With Travel Anxiety?" />
      <meta
        name="twitter:description"
        content="What an ESA can and can't do for travel anxiety — explained without hype."
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
                headline: "Can an Emotional Support Animal Help With Travel Anxiety?",
                description:
                  "How an emotional support animal may help with travel anxiety during flights, road trips, crowds, and routine changes — and the legal limits every traveler should know.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: [HERO_IMG],
                datePublished: "2026-06-15",
                dateModified: "2026-06-15",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Travel & ESA",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "ESA & Travel Anxiety", item: CANONICAL },
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
            <span className="text-gray-500">ESA & Travel Anxiety</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            Can an Emotional Support Animal Help With{" "}
            <span className="text-orange-500">Travel Anxiety?</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Published June 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~8 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick answer
            </p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              For many people, a familiar animal brings comfort and a steadier routine during
              stressful travel — but an emotional support animal is not a cure for anxiety, and an
              ESA letter is about{" "}
              <Link to="/housing-rights-esa" className={inlineLink}>housing accommodation</Link>, not
              airline rights or stadium access. Whether an ESA fits your situation is a clinical
              decision made by a licensed mental health professional.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/travel/dog-walk-street.jpg"
              alt="A traveler walking their dog calmly along a city street"
              width={1400}
              height={1051}
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
          <SectionHeading id="why-travel-is-hard">Why travel can be so hard on anxiety</SectionHeading>
          <Para>
            Travel asks a lot of the nervous system all at once: early starts, packed terminals,
            security lines, delays, unfamiliar beds, and a schedule you don&apos;t fully control.
            During major travel seasons and large sporting events — the 2026 World Cup travel season
            is one example — those pressures stack up as more people move through airports, stations,
            and city centers. For someone already managing anxiety, that can feel like a lot to carry.
          </Para>
          <Para>
            It helps to name what&apos;s actually stressful, because each piece responds to different
            coping tools: being away from your support system, navigating crowds, and losing your
            daily routine. An emotional support animal speaks most directly to the first and the last.
          </Para>

          <SectionHeading id="how-esa-helps">How an emotional support animal may help</SectionHeading>
          <SubHeading>Comfort and a familiar presence</SubHeading>
          <Para>
            When everything around you is new, a familiar companion is a small constant. Many people
            describe their animal as something to focus on and care for — a way to stay anchored
            instead of spiraling into &quot;what if&quot; thinking during a delay or a crowded transfer.
          </Para>
          <SubHeading>Routine and grounding</SubHeading>
          <Para>
            Feeding, walking, and settling an animal creates a dependable rhythm even when time zones
            and schedules are scrambled. That structure can be steadying on a long road trip or an
            extended stay, where the loss of routine is often what unsettles people the most.
          </Para>
          <SubHeading>A reason to slow down</SubHeading>
          <Para>
            Caring for an animal naturally builds in pauses — a walk, a quiet moment, a break from
            the screens and the noise. For travelers who tend to push through until they&apos;re
            overwhelmed, those built-in breaks matter.
          </Para>
          <Para>
            None of this replaces professional care. An emotional support animal is a source of
            comfort, not a treatment, and it works best alongside the coping strategies and support
            that a licensed provider can help you build.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Wondering if an ESA is right for you?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate your situation and decide whether an
              emotional support animal is clinically appropriate. No outcome is guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-clipboard-line"></i> Learn about an ESA evaluation
              </Link>
              <Link to="/travel-anxiety-esa-letter" className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-suitcase-line"></i> Travel & ESA overview
              </Link>
            </div>
          </div>

          <SectionHeading id="flights-roadtrips">Flights, road trips, and crowds: what to expect</SectionHeading>
          <SubHeading>Flights</SubHeading>
          <Para>
            This is where expectations matter most. Since 2021, U.S. airlines are no longer required
            to treat emotional support animals as service animals, and most now handle ESAs under
            their standard pet policies. An ESA letter does <strong>not</strong> guarantee an airline
            will accommodate your animal. If you&apos;re flying, contact your airline directly and
            plan around their specific rules — well before you book.
          </Para>
          <SubHeading>Road trips</SubHeading>
          <Para>
            Road travel often gives ESA owners more flexibility: you control the schedule, the stops,
            and the environment. Build in regular breaks, keep water and familiar items on hand, and
            secure your animal safely. The steadier pace can make routine support easier to maintain.
          </Para>
          <SubHeading>Crowds and busy hubs</SubHeading>
          <Para>
            Packed airports and public transportation can be overwhelming, especially during peak
            seasons. We cover crowds and sensory overload in depth in our guide to{" "}
            <Link to="/blog/crowds-travel-stress-emotional-support-animal" className={inlineLink}>
              crowds, travel stress, and emotional support animals
            </Link>
            .
          </Para>

          <SectionHeading id="limits">The legal limits: what an ESA letter does not do</SectionHeading>
          <Para>
            Being clear about this protects you from disappointment — and from services that overpromise.
          </Para>
          <ul className="space-y-2.5 my-5">
            {[
              "It does not grant access to stadiums, sporting events, arenas, concerts, or other public venues.",
              "It does not give your animal any guaranteed rights on an airline — air travel has separate rules.",
              "It does not force a hotel, Airbnb, or short-term host to accept your animal.",
              "It does not guarantee a landlord's approval — every housing request is reviewed individually.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
          <Para>
            What an ESA letter <em>does</em> do is support a reasonable-accommodation request in
            covered housing under the federal Fair Housing Act — documentation from a licensed
            provider who evaluated you. If you&apos;re relocating or staying somewhere new, our guide
            to{" "}
            <Link to="/blog/temporary-housing-emotional-support-animal" className={inlineLink}>
              ESAs in temporary and extended-stay housing
            </Link>{" "}
            covers how that works.
          </Para>

          {/* Sources */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>UK government travel advice for the USA — <a href="https://www.gov.uk/foreign-travel-advice/usa" target="_blank" rel="noopener noreferrer" className={inlineLink}>gov.uk/foreign-travel-advice/usa</a></span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>UK government safety guidance for the 2026 tournament season — <a href="https://www.gov.uk/government/news/keeping-safe-as-home-nations-gear-up-for-world-cup-2026-countdown" target="_blank" rel="noopener noreferrer" className={inlineLink}>gov.uk 2026 travel safety</a></span>
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">See if an ESA is right for you</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional reviews your assessment and decides whether an
            emotional support animal is clinically appropriate. You&apos;re only charged if you
            qualify — approval is never guaranteed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-file-text-line"></i> Start assessment
            </Link>
            <Link to="/travel-anxiety-esa-letter" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-suitcase-line"></i> Travel & ESA guide
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
              { to: "/blog/crowds-travel-stress-emotional-support-animal", icon: "ri-group-line", label: "Crowds, travel stress & ESAs" },
              { to: "/blog/temporary-housing-emotional-support-animal", icon: "ri-building-line", label: "ESAs in temporary & extended-stay housing" },
              { to: "/travel-anxiety-esa-letter", icon: "ri-suitcase-line", label: "Travel anxiety ESA overview" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights explained" },
              { to: "/how-to-get-esa-letter-online", icon: "ri-computer-line", label: "How to get an ESA letter online" },
              { to: "/service-animal-vs-esa", icon: "ri-service-line", label: "Service animal vs ESA" },
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
              PawTenant connects you with licensed mental health professionals; whether an ESA is
              appropriate is decided by a licensed provider after a real evaluation. An ESA letter
              supports — but does not guarantee — a housing provider&apos;s decision, and it does not
              grant airline, stadium, or public-venue access. PawTenant is independent and is not
              affiliated with, endorsed by, or connected to FIFA, the World Cup, any host city,
              stadium, airline, hotel, or booking platform.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
