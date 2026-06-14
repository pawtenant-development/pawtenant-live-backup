// Conversion-friendly educational hub — /travel-anxiety-esa-letter
//
// "ESA Letters for Travel Anxiety, Temporary Housing, and Routine Disruption"
//
// Timely context only: this page may reference "major travel seasons and large
// sporting events" and the "2026 World Cup travel season" purely as situational
// background for why more people are traveling, relocating, and facing crowds.
//
// COMPLIANCE GUARDRAILS (do NOT loosen without owner sign-off):
//  - NO FIFA / World Cup / team / stadium / host-city logos or official marks.
//  - NO claim of affiliation with, or endorsement by, FIFA, the World Cup,
//    host cities, stadiums, airlines, hotels, or Airbnb.
//  - NO "FIFA ESA letter" / "World Cup ESA letter" headings, metadata, or keywords.
//  - NO promise of stadium access, airline access, hotel/Airbnb acceptance, or
//    guaranteed landlord approval.
//  - ESA letters center on HOUSING accommodation under applicable rules — NOT
//    public-venue or stadium access.
//  - "licensed provider" / "licensed mental health professional" (not "doctor").
//  - Klarna copy (via EsaPricingMini) stays neutral; no "pay in 4 / pay later".
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + a JSON-LD @graph.

import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
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

const PATH = "/travel-anxiety-esa-letter";
const TITLE = "ESA Letters for Travel Anxiety & Temporary Housing | PawTenant";
const DESC =
  "Travel anxiety, crowded airports, and temporary housing during busy travel seasons can be hard. Learn how an emotional support animal may help emotionally — and what an ESA letter can and cannot do.";
const UPDATED_HUMAN = "June 15, 2026";
const UPDATED_ISO = "2026-06-15";

const heroBadges = [
  { icon: "ri-heart-3-line", label: "Comfort & routine support" },
  { icon: "ri-user-star-line", label: "Licensed provider review" },
  { icon: "ri-home-heart-line", label: "Housing-focused documentation" },
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
];

const helpsWith = [
  {
    icon: "ri-flight-takeoff-line",
    title: "Being away from home and support",
    desc: "Travel and longer stays can pull you away from the people, places, and routines that keep you grounded. A familiar animal companion offers a steady source of comfort while everything else feels unfamiliar.",
  },
  {
    icon: "ri-group-line",
    title: "Crowds and sensory overload",
    desc: "Packed airports, busy public transportation, and large events can be overwhelming. Many people find that focusing on caring for their animal helps them stay present and calmer in crowded, high-stimulation spaces.",
  },
  {
    icon: "ri-time-line",
    title: "Routine disruption",
    desc: "Changing time zones, sleeping in new places, and unpredictable schedules can unsettle anyone managing anxiety. The daily rhythm of feeding, walking, and resting with an animal can restore a small, dependable structure.",
  },
  {
    icon: "ri-building-line",
    title: "Temporary and extended-stay housing",
    desc: "Relocations, work assignments, and longer trips often mean short-term rentals or extended stays. Where housing rules apply, an ESA accommodation can be part of staying with your companion — though each request is decided individually.",
  },
];

const canDo = [
  "Support a reasonable-accommodation request in covered housing under the federal Fair Housing Act.",
  "Document that a licensed provider evaluated you and found an emotional support animal clinically appropriate.",
  "Name the licensed provider, their license details, and the date — the elements housing providers look for.",
  "Be issued for many housing types, including some short-term and extended-stay rentals where housing rules apply.",
];

const cannotDo = [
  "Grant access to stadiums, sporting events, concerts, or other public venues.",
  "Guarantee a seat, cabin space, or any rights on an airline — air travel has its own separate rules.",
  "Force a hotel, Airbnb, or short-term host to accept an animal — these are not always covered the same way as housing.",
  "Guarantee that a landlord will approve your request — every accommodation request is reviewed individually.",
];

const faqs: FaqItem[] = [
  {
    q: "Can an emotional support animal help with travel anxiety?",
    a: "Many people find that the presence of a familiar animal brings comfort and a sense of routine during stressful travel — crowded airports, long road trips, time-zone changes, and unfamiliar places. An emotional support animal is not a medical treatment and does not cure anxiety, and whether an ESA is appropriate for you is a clinical decision made by a licensed provider after a real evaluation.",
  },
  {
    q: "Does an ESA letter let my animal into stadiums or large events?",
    a: "No. An ESA letter is about housing accommodation, not public access. It does not grant entry to stadiums, sporting events, arenas, concerts, or other public venues. Trained service dogs under the Americans with Disabilities Act have public-access rights that emotional support animals do not. PawTenant does not promise venue or event access of any kind.",
  },
  {
    q: "Will an ESA letter guarantee a hotel or Airbnb accepts my animal during a busy travel season?",
    a: "No. Hotels, Airbnbs, and other short-term hosts are not always covered by the same housing rules, and an ESA letter does not force any host to accept an animal. Always confirm a property's pet and accommodation policy directly before you travel. An ESA letter centers on covered housing under the Fair Housing Act — not guaranteed acceptance by every host.",
  },
  {
    q: "Is this connected to the World Cup, FIFA, or any host city?",
    a: "No. PawTenant is an independent service that connects people with licensed mental health providers. We are not affiliated with, endorsed by, or connected to FIFA, the World Cup, any host city, stadium, airline, hotel, or booking platform. We mention the 2026 travel season only as general context for why more people are traveling, relocating, and facing crowds.",
  },
  {
    q: "What does an ESA letter actually do?",
    a: "An ESA letter is documentation from a licensed mental health professional supporting a reasonable-accommodation request in covered housing. It supports — but does not guarantee — a housing provider's approval. It is not a registration, certificate, ID card, or vest, and no such item is legally required. There is no official government ESA registry.",
  },
  {
    q: "Can PawTenant help with ESA or PSD support during stressful travel seasons?",
    a: "PawTenant can help people explore ESA and PSD-related support options through licensed provider evaluations. ESA letters are generally tied to housing accommodation needs, while psychiatric service dog considerations are different and may involve a psychiatric disability and task-trained support. Either way, ESA or PSD documentation does not guarantee access to stadiums, airlines, hotels, short-term rentals, or other public venues, and approval is never guaranteed.",
  },
  {
    q: "How do I start with PawTenant?",
    a: "Complete a short, private assessment. A provider licensed in your state reviews it and applies clinical judgment. If an emotional support animal is clinically appropriate, you receive a letter — usually digitally. You're only charged if you qualify, and approval is never guaranteed.",
  },
];

export default function TravelAnxietyESALetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letters for Travel Anxiety, Temporary Housing, and Routine Disruption",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letters for Travel Anxiety & Temporary Housing", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA for travel anxiety, emotional support animal travel anxiety, ESA letter temporary housing, ESA extended stay, emotional support animal crowds, routine disruption ESA, travel stress emotional support animal, ESA letter for housing"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="ESA Letters for Travel Anxiety, Temporary Housing & Routine Disruption" />
      <meta
        property="og:description"
        content="How an emotional support animal may help with travel anxiety, crowds, and routine disruption — and what an ESA letter can and cannot do. Housing-focused. Not affiliated with any event."
      />
      <meta property="og:url" content="https://pawtenant.com/travel-anxiety-esa-letter" />
      <meta property="og:image" content="https://pawtenant.com/assets/travel/walk-with-puppy-city.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/travel/walk-with-puppy-city.jpg" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTA, then a calm travel/comfort visual */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-suitcase-line"></i>
                Travel, Crowds & Routine Support
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.14]">
                ESA Letters for Travel Anxiety, Temporary Housing, and Routine Disruption
              </h1>
              <p className="hidden sm:block text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Busy travel seasons and large sporting events — including the 2026 World Cup travel
                season — mean more crowds, more relocation, and more disrupted routines. Here&apos;s
                how an emotional support animal may help emotionally, and exactly what an ESA letter
                can and cannot do.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <Link
                to={withAttribution("/assessment")}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-file-text-line"></i>
                Start ESA Assessment
              </Link>
            </div>
            <div className="relative max-w-[420px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/travel/walk-with-puppy-city.jpg"
                  alt="A traveler walking calmly through a city with their dog during a busy season"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-home-heart-line text-orange-500"></i>
                <span className="text-[11px] font-bold text-gray-700">Housing-focused · not venue access</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can an emotional support animal help during stressful travel seasons?">
            <p>
              Many people find that a familiar animal brings <strong>comfort and a steadier
              routine</strong> when travel, crowds, and temporary housing make life feel
              unpredictable. An emotional support animal is not a medical treatment and does not cure
              anxiety — whether an ESA is appropriate for you is a clinical decision made by a
              licensed provider after a real evaluation.
            </p>
            <p>
              An ESA letter centers on <strong>housing accommodation</strong> under the Fair Housing
              Act. It does <strong>not</strong> grant stadium or event access, airline rights, or
              guaranteed acceptance by a hotel, Airbnb, or landlord. PawTenant is independent and is
              not affiliated with any event, host city, airline, or booking platform.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHY THIS SEASON */}
      <section className="py-12 sm:py-14 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
            Why travel seasons can be hard on anxiety
          </h2>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4">
            Major travel seasons and large sporting events bring more people through airports,
            stations, and city centers, and push many travelers into unfamiliar, short-term housing.
            With major events like the <strong>2026 World Cup</strong> drawing visitors to host
            cities across the country, crowds, long queues, and disrupted routines become more common
            during the 2026 World Cup travel season — official guidance encourages travelers to plan
            ahead and prepare for busier-than-usual conditions.
          </p>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed">
            For someone managing anxiety, the combination of being away from home, navigating
            crowds, and losing a daily routine can be a lot to carry at once. That&apos;s the
            backdrop this page speaks to — not any single event, and with no connection to any
            organizer, host city, or venue.
          </p>
        </div>
      </section>

      {/* HOW AN ESA MAY HELP */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center leading-tight">
            How an emotional support animal may help
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {helpsWith.map((h) => (
              <div key={h.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-3">
                  <i className={`${h.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm sm:text-base">{h.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Emotional lifestyle visual */}
      <LifestyleImageSection
        className="bg-[#f7f6f3] border-y border-gray-100"
        image="/assets/travel/petfriendly-cafe.jpg"
        alt="A traveler relaxing at a pet-friendly cafe with their dog during a trip"
        eyebrow="Comfort on the move"
        heading="A familiar companion can be a small anchor away from home"
        body="When you're sleeping in a new place, navigating a packed terminal, or adjusting to a new schedule, the simple rhythm of caring for your animal can offer grounding and a sense of the familiar. It doesn't replace care from a professional — but for many people, it helps."
        bullets={[
          "Steady daily routine: feeding, walking, resting.",
          "A calming focus during crowded, high-stimulation moments.",
          "A familiar presence while everything else is new.",
        ]}
        reverse
      />

      {/* CAN / CANNOT */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What an ESA letter can — and cannot — do
            </h2>
            <p className="text-gray-500 text-sm mt-2 max-w-2xl mx-auto">
              Being clear about this protects you. An ESA letter is housing documentation — not a
              ticket, pass, or guarantee.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#fafafa] rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-orange-500"></i>
                What it can do
              </h3>
              <ul className="space-y-3">
                {canDo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-check-line text-orange-500 font-bold mt-0.5"></i>
                    <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#fafafa] rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-error-warning-fill text-slate-400"></i>
                What it cannot do
              </h3>
              <ul className="space-y-3">
                {cannotDo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-close-line text-slate-400 font-bold mt-0.5"></i>
                    <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ESA vs PSD SUPPORT — two different paths */}
      <section className="py-12 sm:py-14 bg-[#f7f6f3] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-route-line text-orange-500"></i>
              ESA and PSD support: two different paths
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-3">
              PawTenant helps people explore ESA and PSD-related support options through licensed
              provider evaluations — useful to understand before an extended stay or temporary
              relocation. The two are not the same. An <strong>emotional support animal</strong>{" "}
              letter is generally tied to <strong>housing accommodation</strong> needs, where comfort
              comes from the animal&apos;s presence. A <strong>psychiatric service dog (PSD)</strong>{" "}
              is different: it relates to a psychiatric disability and to a dog individually trained
              to perform disability-related tasks. PSD considerations are handled carefully and are
              not a shortcut to event, stadium, airline, or public-venue access.
            </p>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4">
              A licensed mental health professional can help you understand which path may fit your
              situation. Eligibility is decided by the provider after a real evaluation — no outcome
              is guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                <i className="ri-clipboard-line"></i> Explore ESA or PSD support options
              </Link>
              <Link
                to="/how-to-get-psd-letter"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-shield-star-line"></i> PSD vs ESA explained
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* STATE NOTE + INTERNAL LINKS */}
      <section className="py-12 sm:py-14 bg-[#fdf6ee]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-orange-100 bg-white p-6 sm:p-7">
            <h2 className="text-lg font-bold text-gray-900 mb-2.5 flex items-center gap-2">
              <i className="ri-map-pin-line text-orange-500"></i>
              Traveling to or relocating in a specific state?
            </h2>
            <p className="text-gray-700 text-sm sm:text-[15px] leading-relaxed mb-4">
              The federal Fair Housing Act applies everywhere, but some states add their own rules
              (for example, California and Iowa require a 30-day provider relationship before an ESA
              letter can be issued). If you&apos;re heading to a popular destination, start with your
              state guide:
            </p>
            <div className="flex flex-wrap gap-2.5">
              {[
                { to: "/esa-letter/new-york", label: "New York" },
                { to: "/esa-letter/texas", label: "Texas" },
                { to: "/esa-letter/california", label: "California" },
                { to: "/esa-letter/florida", label: "Florida" },
                { to: "/explore-esa-letters-all-states", label: "All states" },
              ].map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-4 py-2 hover:bg-orange-100 transition-colors"
                >
                  <i className="ri-map-pin-2-line"></i>
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING / KLARNA — reusable, neutral Klarna copy already baked in */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Travel anxiety & ESA letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Start your ESA assessment
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            About five minutes. Reviewed by a licensed provider. Only charged if you qualify —
            approval is never guaranteed.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-file-text-line"></i>
            Start ESA Assessment
          </Link>
          <div className="mt-5">
            <LastUpdated date={UPDATED_HUMAN} />
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/blog/emotional-support-animal-travel-anxiety", title: "Can an ESA help with travel anxiety?", desc: "Flights, road trips, crowds, and routine changes — what helps and what an ESA can't do." },
              { to: "/blog/temporary-housing-emotional-support-animal", title: "ESAs in temporary & extended-stay housing", desc: "Short-term rentals, relocations, and how landlord policies differ." },
              { to: "/blog/crowds-travel-stress-emotional-support-animal", title: "Crowds, travel stress & ESAs", desc: "Packed airports, public transport, and sensory overload — grounding and routine support." },
              { to: "/housing-rights-esa", title: "ESA housing rights (FHA)", desc: "How the Fair Housing Act protects ESA owners in covered housing." },
              { to: "/blog/2026-hud-esa-guidelines", title: "2026 HUD ESA guidelines", desc: "What HUD's 2026 enforcement memo changed for emotional support animals." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The 4-step process from assessment to letter." },
            ]}
          />
        </div>
      </section>

      {/* SOURCES + COMPLIANCE NOTE */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-xl bg-white border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  2026 men&apos;s tournament official host-city information —{" "}
                  <a href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/host-cities" target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">fifa.com host cities</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  Tournament organizer brand-protection guidance (why independent services must not imply affiliation) —{" "}
                  <a href="https://inside.fifa.com/tournament-organisation/brand-protection" target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">inside.fifa.com brand protection</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  UK government travel advice for the USA —{" "}
                  <a href="https://www.gov.uk/foreign-travel-advice/usa" target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">gov.uk USA travel advice</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>
                  UK government safety guidance for the 2026 tournament season —{" "}
                  <a href="https://www.gov.uk/government/news/keeping-safe-as-home-nations-gear-up-for-world-cup-2026-countdown" target="_blank" rel="noopener noreferrer" className="text-orange-600 font-semibold hover:underline">gov.uk 2026 travel safety</a>
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-400 leading-relaxed mt-4 pt-3 border-t border-gray-100">
              PawTenant is an independent service and is not affiliated with, endorsed by, or
              connected to FIFA, the World Cup, any host city, stadium, airline, hotel, or booking
              platform. The 2026 travel season is referenced only as general context.
            </p>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" icon="ri-file-text-line" />
    </main>
  );
}
