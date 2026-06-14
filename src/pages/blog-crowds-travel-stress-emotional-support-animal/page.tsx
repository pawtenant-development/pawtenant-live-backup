// Blog article — /blog/crowds-travel-stress-emotional-support-animal
//
// "Crowds, Travel Stress, and Emotional Support Animals: What to Know"
//
// Educational article targeting crowds / anxiety / stress, using major events
// as the news hook (situational context only).
//
// COMPLIANCE (do NOT loosen without owner sign-off): no FIFA/World Cup/team/
// stadium marks; no claim of affiliation with FIFA, the World Cup, host cities,
// venues, airlines, hotels, or Airbnb; no "FIFA/World Cup ESA letter" wording;
// no promise of stadium/venue/airline access or guaranteed approval; ESA is NOT
// public-access; "licensed provider" not "doctor"; no guarantee language.
//
// SEO from CORE_PAGE_META via SEOManager + prerender. Adds keyword/OG/Twitter
// meta + BlogPosting/Breadcrumb/FAQ JSON-LD. Styling follows the HUD blog.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/crowds-travel-stress-emotional-support-animal";
const HERO_IMG = "https://pawtenant.com/assets/travel/walk-with-puppy-city.jpg";

const topicChips = ["Crowds", "Travel Stress", "Sensory Overload", "Emotional Support Animal"];

const faqs = [
  {
    q: "Do emotional support animals help with crowds and sensory overload?",
    a: "Many people find that having a familiar animal to focus on and care for helps them stay grounded in crowded, high-stimulation spaces like packed airports and busy public transportation. An ESA is not a treatment for anxiety and does not remove the stress of crowds — it can be one source of comfort within a broader coping plan. Whether an ESA is appropriate for you is a clinical decision made by a licensed mental health professional.",
  },
  {
    q: "Can my emotional support animal come into a stadium or event with me?",
    a: "No. An ESA letter is about housing accommodation, not public access. It does not grant entry to stadiums, sporting events, arenas, concerts, or other public venues. Only trained service dogs under the Americans with Disabilities Act have public-access rights, and even those are subject to venue rules. PawTenant does not promise any venue or event access.",
  },
  {
    q: "How can I manage travel stress in crowds during a busy season?",
    a: "Plan ahead, travel during quieter windows where possible, arrive early so you're not rushing, use noise-reducing headphones, and build in breaks to step away from the crowd. Official travel guidance also encourages preparing for busier-than-usual conditions during major travel seasons. For some people, a familiar animal companion adds a steadying focus — alongside, not instead of, these strategies.",
  },
  {
    q: "Is an emotional support animal the same as a service animal in public?",
    a: "No. A service animal is individually trained to perform tasks for a person with a disability and has public-access rights under the ADA. An emotional support animal provides comfort through its presence and does not have those public-access rights. The two are protected by different rules — ESAs are centered on housing.",
  },
  {
    q: "How do I find out whether an ESA is right for me?",
    a: "Complete a short, private assessment. A provider licensed in your state reviews it and decides whether an emotional support animal is clinically appropriate. If it is, you receive a letter — usually digitally. You're only charged if you qualify, and approval is never guaranteed.",
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

export default function BlogCrowdsTravelStressESAPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="emotional support animal crowds, ESA sensory overload, travel stress emotional support animal, ESA crowded airport, ESA public transportation anxiety, managing crowds anxiety ESA"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Crowds, Travel Stress, and Emotional Support Animals: What to Know" />
      <meta
        property="og:description"
        content="Crowded airports, packed public transport, and sensory overload can overwhelm anyone. How an emotional support animal may help you stay grounded — and why an ESA is not public-venue access."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-15" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="Crowds, Travel Stress & Emotional Support Animals" />
      <meta name="twitter:description" content="Grounding in crowds — and the clear line between an ESA and public-venue access." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "Crowds, Travel Stress, and Emotional Support Animals: What to Know",
                description:
                  "How an emotional support animal may help with crowds, packed transit, and sensory overload during busy travel seasons — plus the clear line between an ESA and public-venue access.",
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
                  { "@type": "ListItem", position: 3, name: "Crowds, Travel Stress & ESAs", item: CANONICAL },
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
            <span className="text-gray-500">Crowds, Travel Stress & ESAs</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[40px] font-extrabold text-gray-900 leading-tight mb-4">
            Crowds, Travel Stress, and{" "}
            <span className="text-orange-500">Emotional Support Animals: What to Know</span>
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
              Crowded airports and packed transit can overwhelm anyone, and a familiar animal can be
              a grounding focus in those moments. But an emotional support animal is not a treatment,
              and an ESA letter is about{" "}
              <Link to="/housing-rights-esa" className={inlineLink}>housing</Link> — it does{" "}
              <strong>not</strong> grant access to stadiums, events, or any public venue. That line
              matters, so we&apos;ll keep it clear throughout.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/travel/walk-with-puppy-city.jpg"
              alt="A traveler walking calmly with their dog through a busy city during peak season"
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
          <SectionHeading id="why-crowds">Why crowds hit anxiety so hard</SectionHeading>
          <Para>
            Crowds aren&apos;t just busy — they&apos;re loud, fast, and unpredictable, and they take
            away two things people rely on to feel safe: personal space and a sense of control. In a
            packed terminal or a rush-hour train, your nervous system is processing noise, movement,
            and proximity all at once. For someone managing anxiety, that can tip quickly into
            overwhelm.
          </Para>
          <Para>
            Major sporting events like the 2026 World Cup make these moments more frequent. During
            the 2026 World Cup travel season, airports, stations, and city centers run busier than
            usual — official guidance encourages travelers to expect crowds and plan ahead. None of
            this is about any single event; it&apos;s about the conditions that come with peak travel.
          </Para>

          <SectionHeading id="where-it-shows">Where travel stress shows up most</SectionHeading>
          <SubHeading>Crowded airports</SubHeading>
          <Para>
            Security lines, gate changes, and dense terminals are classic anxiety triggers. Arriving
            early, knowing your route, and having a calm focal point can take the edge off the rush.
          </Para>
          <SubHeading>Packed public transportation</SubHeading>
          <Para>
            Trains, buses, and subways during peak times mean close quarters and little escape. Quiet
            cars, off-peak timing where possible, and grounding techniques help — as does a familiar
            companion to focus on.
          </Para>
          <SubHeading>Noise and sensory overload</SubHeading>
          <Para>
            Constant announcements, conversations, and movement can be exhausting. Noise-reducing
            headphones, a planned break away from the crowd, and steady breathing are simple,
            effective tools.
          </Para>

          <SectionHeading id="how-esa-helps">How an emotional support animal may help</SectionHeading>
          <Para>
            For many people, the value of an animal in these moments is <em>grounding</em>: something
            familiar and steady to focus on when the environment is chaotic. Caring for an animal —
            checking on it, keeping a routine, taking a quiet walk — pulls attention away from the
            spiral of overwhelm and back to the present.
          </Para>
          <Para>
            It&apos;s important to be honest about the limits, too. An emotional support animal is a
            source of comfort, not a medical treatment, and it doesn&apos;t make crowds disappear. It
            works best as one part of a plan that may include coping strategies and care from a
            licensed provider.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Curious whether an ESA fits your situation?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate you and decide whether an emotional
              support animal is clinically appropriate. No outcome is guaranteed.
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

          <SectionHeading id="the-line">The clear line: comfort at home, not access in public</SectionHeading>
          <Para>
            This is the part people most often get wrong, so we&apos;ll state it plainly: an
            emotional support animal does <strong>not</strong> have public-access rights.
          </Para>
          <ul className="space-y-2.5 my-5">
            {[
              "An ESA letter does not allow your animal into stadiums, arenas, sporting events, or concerts.",
              "It does not grant access to restaurants, shops, or other public venues that aren't required to allow pets.",
              "It does not give your animal guaranteed rights on an airline — air travel has its own separate rules.",
              "Only a trained service dog under the ADA has public-access rights, and even those are subject to venue rules.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
          <Para>
            A careful word on psychiatric service dogs, too: a{" "}
            <Link to="/how-to-get-psd-letter" className={inlineLink}>psychiatric service dog (PSD)</Link>{" "}
            is different from an emotional support animal — it relates to a psychiatric disability and
            a dog individually trained to perform disability-related tasks. A PSD should never be
            treated as an automatic claim to event, stadium, or public-venue access during a busy
            season; any access depends on the law and the specific venue&apos;s rules. PawTenant can
            help you explore ESA and PSD-related support options through a licensed provider
            evaluation, with no outcome guaranteed.
          </Para>
          <Para>
            What an ESA letter <em>does</em> do is support a reasonable-accommodation request in
            covered housing. If you want the difference spelled out, see{" "}
            <Link to="/service-animal-vs-esa" className={inlineLink}>service animal vs ESA</Link>, and
            for travel-day anxiety specifically, read{" "}
            <Link to="/blog/emotional-support-animal-travel-anxiety" className={inlineLink}>can an ESA help with travel anxiety?</Link>
          </Para>

          {/* Sources */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>UK government safety guidance for the 2026 tournament season — <a href="https://www.gov.uk/government/news/keeping-safe-as-home-nations-gear-up-for-world-cup-2026-countdown" target="_blank" rel="noopener noreferrer" className={inlineLink}>gov.uk 2026 travel safety</a></span>
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
            <Link to="/service-animal-vs-esa" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-service-line"></i> Service animal vs ESA
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
              { to: "/blog/temporary-housing-emotional-support-animal", icon: "ri-building-line", label: "ESAs in temporary & extended-stay housing" },
              { to: "/travel-anxiety-esa-letter", icon: "ri-suitcase-line", label: "Travel anxiety ESA overview" },
              { to: "/service-animal-vs-esa", icon: "ri-service-line", label: "Service animal vs ESA" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights explained" },
              { to: "/how-to-get-esa-letter-online", icon: "ri-computer-line", label: "How to get an ESA letter online" },
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
              appropriate is decided by a licensed provider after a real evaluation. An emotional
              support animal does not have public-access rights and an ESA letter does not grant
              stadium, venue, or airline access. PawTenant is independent and is not affiliated with,
              endorsed by, or connected to FIFA, the World Cup, any host city, stadium, airline,
              hotel, or booking platform.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
