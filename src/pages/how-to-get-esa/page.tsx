import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import EsaPricingMini from "@/components/feature/EsaPricingMini";
import EsaVsPsdCard from "@/components/feature/EsaVsPsdCard";
import { Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

const steps = [
  {
    num: "01",
    title: "Complete Your Assessment",
    desc: "Fill out our simple online form about your situation and ESA requirements. It only takes a few minutes and helps us understand your needs so we can assist you in discovering if your favorite emotional support animal qualifies.",
    icon: "ri-file-list-3-line",
  },
  {
    num: "02",
    title: "Consult with a Licensed Provider",
    desc: "After filling in all necessary documents or forms, you will be connected with a licensed mental health provider to speak with you one-on-one and evaluate you regarding your potential to qualify for an ESA.",
    icon: "ri-stethoscope-line",
  },
  {
    num: "03",
    title: "Receive Your ESA Letter",
    desc: "Our licensed medical professional will validate your letter and you will receive your ESA letter in as little as 24 hours. The letter is certified by an LHCF which includes legal weight just for you.",
    icon: "ri-mail-check-line",
  },
];

const stats = [
  { value: "23%", label: "of Americans suffer from some form of mental illness" },
  { value: "60%", label: "claimed that having a therapy pet helped their mental health" },
  { value: "80%+", label: "pet owners don't know they can qualify for an ESA letter" },
];

const esaTips = [
  {
    icon: "ri-file-text-line",
    color: "orange",
    title: "Verify Your Letter Contains Key Information",
    tips: [
      "License number, issue date, state, and the license type must be clearly stated",
      "Your name plus a statement confirming a recognized mental/emotional disability",
      "A clear declaration that the animal is necessary for your treatment or recovery",
      "Provider's signature in ink and on official letterhead",
    ],
  },
  {
    icon: "ri-home-heart-line",
    color: "teal",
    title: "Know Your Housing Rights",
    tips: [
      "Under the Fair Housing Act, landlords must make reasonable accommodations for ESA owners",
      "You cannot be charged a pet deposit or pet fee for your ESA",
      "Your landlord may request documentation but cannot demand medical records",
      "If denied, you have the right to file a complaint with HUD",
    ],
  },
  {
    icon: "ri-refresh-line",
    color: "amber",
    title: "Keep Your Letter Current",
    tips: [
      "ESA letters are typically valid for 12 months — renew annually",
      "Some landlords and airlines may require a letter dated within the past year",
      "Keep a digital copy saved securely and a printed backup at home",
      "Notify your provider promptly if your situation or animal changes",
    ],
  },
  {
    icon: "ri-shield-check-line",
    color: "green",
    title: "Protect Yourself from Scams",
    tips: [
      "Never purchase from sites that skip the mental health evaluation entirely",
      "Legitimate letters require a real consultation with a licensed professional",
      "Avoid any service that guarantees approval without an assessment",
      "Always verify the license number of the signing professional",
    ],
  },
  {
    icon: "ri-user-heart-line",
    color: "rose",
    title: "Communicate Effectively with Your Landlord",
    tips: [
      "Submit your ESA request in writing and keep a copy for your records",
      "Provide your ESA letter promptly when requested — don't delay",
      "Introduce your animal calmly and demonstrate responsible ownership",
      "If issues arise, contact a housing advocacy group for guidance",
    ],
  },
  {
    icon: "ri-heart-pulse-line",
    color: "violet",
    title: "Maximize Your ESA's Benefits",
    tips: [
      "Establish a consistent daily routine with your ESA to maximize emotional benefits",
      "Pair your ESA support with ongoing therapy or counseling for best results",
      "Ensure your animal is properly trained, socialized, and well cared for",
      "Talk to your mental health professional about integrating your ESA into your treatment plan",
    ],
  },
];

const tipColorMap: Record<string, { bg: string; icon: string; badge: string; dot: string }> = {
  orange: { bg: "bg-orange-50 border-orange-100", icon: "text-orange-500 bg-orange-100", badge: "bg-orange-500 text-white", dot: "text-orange-500" },
  teal: { bg: "bg-teal-50 border-teal-100", icon: "text-teal-600 bg-teal-100", badge: "bg-teal-500 text-white", dot: "text-teal-500" },
  amber: { bg: "bg-amber-50 border-amber-100", icon: "text-amber-600 bg-amber-100", badge: "bg-amber-500 text-white", dot: "text-amber-500" },
  green: { bg: "bg-green-50 border-green-100", icon: "text-green-600 bg-green-100", badge: "bg-green-600 text-white", dot: "text-green-500" },
  rose: { bg: "bg-rose-50 border-rose-100", icon: "text-rose-500 bg-rose-100", badge: "bg-rose-500 text-white", dot: "text-rose-500" },
  violet: { bg: "bg-violet-50 border-violet-100", icon: "text-violet-600 bg-violet-100", badge: "bg-violet-600 text-white", dot: "text-violet-500" },
};

const whyItems = [
  {
    title: "Experienced Professionals You Can Trust",
    desc: "Our licensed team knows the laws in every state and has years of experience providing ESA letters that meet all legal standards.",
    icon: "ri-shield-check-line",
  },
  {
    title: "A Support Team That Cares",
    desc: "We are here to help you every step of the way — from setting up your appointment to making sure your ESA letter is legally valid.",
    icon: "ri-heart-line",
  },
  {
    title: "Available Across the State",
    desc: "No matter where you are, we have licensed professionals ready to assist in your area.",
    icon: "ri-map-pin-line",
  },
  {
    title: "Honest and Lawful Process",
    desc: "All evaluations follow all legal rules. We only issue ESA letters after a proper mental health review — no shortcuts.",
    icon: "ri-scales-line",
  },
  {
    title: "Quick and Safe Delivery",
    desc: "Once your letter is approved, we will send it to you digitally. It is fast, secure, and ready to use right away.",
    icon: "ri-send-plane-line",
  },
  {
    title: "100% Money-Back Guarantee",
    desc: "Your satisfaction is guaranteed. If your legitimate ESA letter doesn't work for any reason, we will give you a full refund.",
    icon: "ri-refund-2-line",
  },
];

const faqs = [
  { q: "What is an Emotional Support Animal?", a: "An ESA is a companion animal that provides emotional support to individuals with mental or emotional disabilities. Unlike service animals, ESAs do not require specific training, but they do require a valid ESA letter from a licensed mental health professional." },
  { q: "Who qualifies for an ESA letter?", a: "Anyone experiencing a mental or emotional health condition recognized by the DSM-5 may qualify, including anxiety, depression, PTSD, bipolar disorder, phobias, and many others. Our licensed professionals will conduct a proper evaluation to determine eligibility." },
  { q: "How long does the process take?", a: "The online assessment takes about 5–10 minutes. Once connected with our licensed professional and your evaluation is complete, you'll receive your ESA letter digitally within 24 hours." },
  { q: "Is an online ESA evaluation legitimate?", a: "Yes — telehealth consultations are fully legal and accepted. What matters is that your evaluation is conducted by a licensed mental health professional who follows proper protocols." },
  { q: "How long is an ESA letter valid?", a: "ESA letters are typically valid for one year. We recommend annual renewal to ensure your letter remains current and compliant with your landlord's requirements." },
  { q: "Can my landlord refuse my ESA?", a: "Under the Fair Housing Act, landlords must make reasonable accommodations for tenants with ESAs. They can only refuse if the animal poses a direct safety threat or would cause undue hardship to the property." },
  { q: "What are the requirements for a valid ESA letter?", a: "A valid ESA letter is issued on the licensed mental health professional's letterhead and includes their full name, signature, license type, license number, the state they are licensed in, and the issue date. It confirms that you have a mental or emotional health condition recognized in clinical practice and that an emotional support animal is part of your treatment plan. Letters issued without an actual evaluation by a licensed provider are not considered valid ESA letter documentation." },
  { q: "Can I get an ESA letter for anxiety or depression?", a: "Anxiety, depression, PTSD, panic disorder, and other DSM-recognized conditions are among the most common reasons people qualify for an ESA letter. Eligibility is determined by a licensed mental health professional after a clinical evaluation — no service can promise you will qualify in advance. If you do not qualify after the review, PawTenant refunds your fee." },
  { q: "What are the steps to obtain an ESA letter online?", a: "The ESA letter application process has three steps. First, complete a short online assessment about your situation and your support animal. Second, a licensed mental health professional reviews your responses and conducts a telehealth evaluation to determine clinical appropriateness. Third, if you qualify, your signed ESA letter is delivered digitally, typically within 24 hours, with a Verification ID your landlord can confirm online." },
];

export default function HowToGetESAPage() {
  // ── 2026-05-21 HOWTO-MOBILE-REVAMP ──────────────────────────────────────
  // Mobile-only collapse state for the long Tips / Why-Choose card grids.
  // Both arrays stay rendered in the DOM (so SEO content is preserved); the
  // tail cards are simply `display: none` on mobile until the user taps the
  // "Show more" button. Desktop (sm+) always shows all cards.
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);

  // ── 2026-05-21 HOWTO-HERO-REFINE ────────────────────────────────────────
  // Scroll-aware sticky mobile CTA. The bottom-fixed CTA is hidden while the
  // hero is in view (the hero already has a primary CTA — two CTAs above the
  // fold compete and clutter), then fades up once the hero scrolls out.
  // IntersectionObserver is preferred over scroll listeners for perf — the
  // browser does the math off the main thread.
  const heroRef = useRef<HTMLElement>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // Server-side render or no IO support — keep sticky hidden by default.
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        setShowStickyCTA(!entry.isIntersecting);
      },
      // rootMargin lifts the trigger line slightly above the bottom of the
      // hero so the sticky CTA appears just before the hero CTA leaves view —
      // the handoff feels intentional rather than abrupt.
      { rootMargin: "0px 0px -40% 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <main className="pb-24 md:pb-0">
      <title>How to Get an ESA Letter Online | Step-by-Step Guide | PawTenant</title>
      <meta name="keywords" content="how to get an ESA letter, how to get an ESA letter online, get ESA letter online, steps to obtain an ESA letter, ESA letter application process, qualifying for an ESA letter, licensed mental health professional ESA letter, ESA letter requirements, emotional support animal letter online, legitimate online ESA evaluation, avoiding ESA letter scams" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      }) }} />

      <SharedNavbar />

      {/* Hero — 2026-05-21 HOWTO-HERO-REFINE
          Rebuilt to mirror the new homepage hero (`src/pages/home/components/
          HeroSection.tsx`) so /how-to-get-esa-letter inherits the same premium
          mobile rhythm:
            • `<picture>` with the same mobile WebP (`pawtenant-mobile-hero-
              pomeranian.webp`) the homepage uses, plus the desktop WebP, plus
              a JPG fallback for legacy browsers.
            • Calm dark overlay (gray-900 stops, not muddy black) + a bottom-
              fade on mobile so the hero blends into the sage reassurance strip
              below instead of butting against it abruptly.
            • Calm orange-tinted eyebrow pill matching the homepage HIPAA badge
              treatment (orange-500/20 bg + orange-400/40 border + orange-300
              text).
            • H1 unchanged ("How to Get an ESA Letter Online"). Mobile subhead
              shortened; long desktop paragraph preserved in DOM via hidden
              sm:block (so the keywords/SEO body still indexes).
            • Single full-width primary CTA above the fold. The earlier
              "100% Money-Back Guarantee" inline trust chip is replaced with
              a calmer "Money-back protection if you don't qualify" line
              centered directly under the CTA — mirrors the homepage refund
              reassurance pattern. */}
      <section
        ref={heroRef}
        className="relative min-h-[100svh] flex items-center overflow-hidden"
      >
        <div className="absolute inset-0">
          <picture>
            <source
              media="(max-width: 768px)"
              srcSet="/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp"
              type="image/webp"
            />
            <source
              media="(min-width: 769px)"
              srcSet="/assets/blog/fp-woman-sitting-floor-desktop.webp"
              type="image/webp"
            />
            <img
              src="/assets/blog/fp-woman-sitting-floor.jpg"
              alt="Pet owner with dog at home applying for an ESA letter online"
              className="w-full h-full object-cover object-top opacity-80"
              fetchPriority="high"
              loading="eager"
              decoding="async"
              width={1920}
              height={1280}
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/65 to-gray-900/25"></div>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-900/70 to-transparent md:hidden"></div>
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 py-20 sm:py-28 md:py-32">
          <div className="max-w-2xl">
            {/* Eyebrow badge — matches homepage HIPAA pill treatment. */}
            <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              <i className="ri-shield-check-line"></i>
              Simple 3-Step Process
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-5">
              How to Get an ESA Letter Online
            </h1>

            {/* Single subtitle — short, scan-friendly across viewports.
                Pre-2026-05-24 cleanup the hero had 2 separate paragraphs
                (one long desktop, one short mobile). The longer process
                detail still appears in the Intro Text + Steps sections
                below the hero. */}
            <p className="text-gray-200 text-[15px] sm:text-lg leading-relaxed mb-7 max-w-xl">
              A short assessment, a licensed provider review, and your letter delivered in as little as 24 hours.
            </p>

            {/* Calm 50-states trust pill — mirrors the homepage hero badge. */}
            <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-2.5 rounded-full mb-7">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-user-star-line text-orange-400"></i>
              </div>
              <span className="text-white text-xs font-semibold whitespace-nowrap">Licensed clinicians in all 50 US states</span>
            </div>

            {/* Single primary CTA — full-width on mobile, auto on desktop.
                No secondary button on mobile so the CTA hierarchy is unambiguous
                and the sticky bottom CTA (which fades in only after the hero
                scrolls out of view) never overlaps with this one above the fold. */}
            <div className="mb-3 sm:mb-8">
              <Link
                to="/assessment"
                className="w-full sm:w-auto px-8 py-4 sm:py-3.5 bg-orange-400 text-white font-bold text-base sm:text-sm rounded-md hover:bg-orange-500 transition-colors cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-400/25 sm:shadow-none"
              >
                Find Out If You Qualify
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>

            {/* Mobile-only refund reassurance — centered under the CTA. The
                "Money-back protection" phrase is bolded so the safety-net
                reads in a single glance without re-adding trust-spam chips
                above the CTA. Hidden on desktop because desktop already
                surfaces the Money-Back card later in the Why-Choose grid. */}
            <p className="sm:hidden text-white/85 text-[13px] leading-snug text-center max-w-xs mx-auto">
              <i className="ri-shield-check-line text-orange-300 mr-1.5"></i>
              <strong className="font-bold text-white">Money-back protection</strong> if you don&rsquo;t qualify
            </p>
          </div>
        </div>
      </section>

      {/* Reassurance Strip — 2026-05-21 HOWTO-HERO-REFINE
          Calm sage 2x2 mobile / 4-up desktop grid sitting directly under the
          hero. Same pattern as `src/pages/home/components/ReassuranceStrip.tsx`
          so the visual language carries over from the homepage to this page.
          Absorbs the four questions a visitor asks before tapping the CTA —
          clinician review, refund, Fair Housing fit, privacy — without
          re-introducing trust-spam chips in the hero itself. */}
      <section
        aria-label="Reassurance"
        className="bg-[#f8fafc] border-b border-slate-200"
      >
        <div className="max-w-6xl mx-auto px-5 py-10 sm:py-12">
          <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4 sm:gap-7">
            {[
              {
                icon: "ri-stethoscope-line",
                title: "Licensed Review",
                body: "Every case is reviewed by a Licensed Mental Health Practitioner in your state.",
              },
              {
                icon: "ri-shield-check-line",
                title: "Money-Back Protection",
                body: "If you don't qualify after review, your payment is refunded.",
              },
              {
                icon: "ri-home-heart-line",
                title: "Built for Housing",
                body: "Documentation prepared with Fair Housing Act standards in mind.",
              },
              {
                icon: "ri-lock-2-line",
                title: "Secure & Private",
                body: "Your intake is encrypted in transit and kept confidential.",
              },
            ].map((p) => (
              <li key={p.title} className="flex flex-col items-start">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span
                    aria-hidden
                    className="w-7 h-7 rounded-full bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0"
                  >
                    <i className={`${p.icon} text-base`} />
                  </span>
                  <h3 className="text-[13.5px] sm:text-sm font-bold text-slate-900 leading-tight">
                    {p.title}
                  </h3>
                </div>
                <p className="text-[12.5px] sm:text-[13px] text-slate-600 leading-snug">
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Stats — hidden on mobile per 2026-05-21 HOWTO-MOBILE-REVAMP.
          Decorative orange-band stat row was a heavy first-fold blast on
          mobile; removing it lets the page flow Hero → Reassurance → Steps
          with the calm rhythm the homepage hero established. Section stays
          in the DOM for desktop + crawlers (`display: none` only at <sm). */}
      <section className="hidden sm:block py-14 md:py-16 bg-orange-500">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {stats.map((s) => (
              <div key={s.value} className="text-center">
                <p className="text-5xl font-black text-white mb-2">{s.value}</p>
                <p className="text-orange-100 text-sm leading-relaxed max-w-xs mx-auto">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro Text — hidden on mobile (duplicates hero messaging on a
          small screen and pushes the Steps section further down). Still
          in DOM for desktop + crawlers. */}
      <section className="hidden sm:block py-14 md:py-16 bg-[#fdf6ee]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Our Mission</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">We Make Getting Your ESA Letter Simple</h2>
          <p className="text-gray-600 text-base leading-relaxed">
            Get your ESA letter swiftly through PawTenant. Your feedback is precious to us. Feel free to ask your queries, or share any concern. We are here to help you in every case — dedicated to offering the finest customer service so you can easily get your ESA letter.
          </p>
        </div>
      </section>

      {/* Steps — 2026-05-21 HOWTO-HERO-REFINE
          Adopts the centered-circle timeline pattern from the homepage
          `StepsSection.tsx` so this page no longer feels like generic
          orange-tinted stacked cards. Visual ingredients (mirrored 1:1):
            • 80×80 white circle with sage `#4A8472` icon + sage border
            • Small sage number badge in the top-right of the circle
            • Centered text below
            • Desktop horizontal connector line between circles
            • bg-white section, calm vertical rhythm
          Mobile H2 swaps to a short "How it works" headline; the long
          original H2 stays in the DOM via `hidden sm:block` for SEO. */}
      <section id="how-it-works" className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12 sm:mb-14">
            <p className="text-[#4A8472] text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">Simple Process</p>
            {/* Mobile-only headline — short, calm, scannable. */}
            <h2 className="sm:hidden text-[26px] leading-tight font-extrabold text-slate-900 px-4">
              How it works
            </h2>
            {/* Original long H2 preserved for desktop + crawlers. */}
            <h2 className="hidden sm:block text-3xl font-extrabold text-slate-900">
              Explore Quick and Easy Way to Obtain Your ESA Letter With PawTenant
            </h2>
            <p className="hidden sm:block text-slate-500 mt-3 max-w-xl mx-auto text-sm">
              A streamlined process for getting a legitimate ESA letter online — no waiting rooms, no in-person visits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-8 relative">
            {/* Desktop-only horizontal connector between the three circles. */}
            <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-0.5 bg-[#4A8472]/40 z-0"></div>
            {steps.map((step, idx) => (
              <div
                key={step.num}
                className="relative z-10 flex flex-col items-center text-center"
              >
                <div className="relative mb-5 sm:mb-6">
                  <div className="w-20 h-20 flex items-center justify-center bg-white rounded-full border-2 border-[#4A8472]/40">
                    <i className={`${step.icon} text-3xl text-[#4A8472]`}></i>
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center bg-[#4A8472] text-white text-xs font-bold rounded-full">
                    {idx + 1}
                  </span>
                </div>
                <h3 className="text-slate-900 font-bold text-base mb-3">{step.title}</h3>
                <p className="text-slate-500 text-[13.5px] sm:text-sm leading-relaxed max-w-xs">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10 sm:mt-12">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Start Your ESA Letter Online
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* ESA pricing snapshot — clear cost upfront so visitors don't
          have to scroll through the full education content first.
          Added in mobile-cleanup pass. */}
      <EsaPricingMini className="bg-white border-t border-orange-100" />

      {/* What Is ESA — 2026-05-21 HOWTO-MOBILE-REVAMP
          Mobile: only the first paragraph shows; paragraphs 2 + 3 stay in
          the DOM (display: none) so crawlers still index the full body. Image
          gets a fixed mobile aspect ratio so it never dominates the column.
          Heading shrinks. */}
      <section className="py-12 sm:py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Understanding ESAs</span>
              <h2 className="text-[24px] sm:text-3xl font-bold text-slate-900 mb-4 sm:mb-5 leading-tight">What Is an Emotional Support Animal?</h2>
              <p className="text-slate-600 leading-relaxed mb-4 text-[14.5px] sm:text-base">
                An ESA is a supportive companion for people who have emotional and mental disabilities. These animals provide invaluable comfort and assistance, which improves mental wellbeing of people.
              </p>
              <p className="hidden sm:block text-gray-600 leading-relaxed mb-4">
                As the body of knowledge about mental health matters grows, it is more likely a physician has to diagnose conditions he or she may have recognized before. Frequently, an ESA is part of someone's path to recovery.
              </p>
              <p className="hidden sm:block text-gray-600 leading-relaxed mb-6">
                Although ESAs are not service animals trained to do specific tasks, they have a noticeable impact on a person's life. ESAs give people a sense of calming comfort that can help them get through their mental health challenges.
              </p>
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm mt-2 sm:mt-0 self-start"
              >
                <i className="ri-file-text-line"></i>
                Get an ESA Letter Now
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden aspect-[16/10] sm:aspect-auto sm:min-h-80">
              <img
                src="/assets/testimonials/man-with-dog-home.jpg"
                alt="Emotional Support Animal"
                width={1200}
                height={675}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why Do I Need — hidden on mobile per 2026-05-21 HOWTO-MOBILE-REVAMP.
          The full-bleed orange gradient + three white/10 cards was the loudest
          block on the mobile scroll and largely duplicated the "What Is an
          ESA?" and Why-Choose narratives. Section stays in the DOM so the
          three short subheads + bodies remain indexable; only the
          orange-screaming mobile rendering is suppressed. */}
      <section className="hidden sm:block py-16 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="/assets/testimonials/home-together-with-pet.jpg"
                alt="Why need an ESA letter"
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-200 mb-3">Why It Matters</span>
              <h2 className="text-3xl font-bold text-white mb-8">Why Do I Need an ESA Letter?</h2>
              {[
                { title: "Your Emotional Support", desc: "Having an emotional support animal gives a therapeutic effect on your life. A valid ESA letter confirms that an emotional support animal can help you improve your mental health. Healthcare professionals also recommend ESAs for depression, anxiety, and PTSD patients." },
                { title: "Your Mental Health", desc: "Your letter will be reviewed by a qualified mental health professional before they offer an ESA letter. They shall conduct a thorough assessment of your mental health and then conclude if an ESA should be a suitable treatment for you." },
                { title: "Your Right to Quality of Life", desc: "Discuss your symptoms, challenges, and reasons why you think an emotional support animal would improve your quality of life with your therapist. If the professional agrees, they will write a legally accepted ESA letter." },
              ].map((item) => (
                <div key={item.title} className="mb-6 bg-white/10 rounded-xl px-5 py-4">
                  <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-orange-100 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-white text-orange-600 font-semibold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-sm mt-2"
              >
                <i className="ri-search-line"></i>
                Find Out If You Qualify
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tips for ESA Letter Holder — 2026-05-21 HOWTO-MOBILE-REVAMP
          The biggest mobile-wall offender on this page: 6 multi-colored cards
          × 4 bullets each = 24 dense mobile lines. Mobile now shows the first
          2 cards by default; cards 3-6 stay rendered in the DOM
          (`display: none` via `hidden sm:block`) so the SEO content is fully
          indexable, and a "Show all 6 tips" button reveals them inline.
          Desktop (sm+) always shows all 6 cards. */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Expert Advice</span>
            <h2 className="text-[26px] sm:text-3xl font-bold text-slate-900 mb-3 sm:mb-4 leading-tight">Tips for an ESA Letter Holder</h2>
            <p className="hidden sm:block text-gray-500 text-sm max-w-xl mx-auto leading-relaxed">
              Once you receive your ESA letter, knowing how to use it properly is just as important. Here is everything you need to know to protect your rights and get the most out of your ESA.
            </p>
            <p className="sm:hidden text-slate-500 text-[13.5px] max-w-sm mx-auto leading-relaxed">
              Practical tips to protect your rights and get the most from your letter.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {esaTips.map((tip, i) => {
              const colors = tipColorMap[tip.color];
              // Mobile: first 2 cards visible, remaining 4 hidden until expanded.
              // Desktop (sm+): all cards always visible.
              const hideOnMobile = i >= 2 && !tipsExpanded;
              return (
                <div
                  key={i}
                  className={`rounded-2xl p-5 sm:p-6 border ${colors.bg} ${hideOnMobile ? "hidden sm:block" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-4 sm:mb-5">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${colors.icon}`}>
                      <i className={`${tip.icon} text-lg`}></i>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{tip.title}</h3>
                  </div>
                  <ul className="space-y-2.5 sm:space-y-3">
                    {tip.tips.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className={`ri-checkbox-circle-fill text-sm ${colors.dot}`}></i>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">{item}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {/* Mobile-only "Show all tips" toggle. Hidden on desktop. */}
          {!tipsExpanded && (
            <div className="sm:hidden mt-6 text-center">
              <button
                type="button"
                onClick={() => setTipsExpanded(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-expanded={tipsExpanded}
              >
                Show all 6 tips
                <i className="ri-arrow-down-s-line"></i>
              </button>
            </div>
          )}
          <div className="mt-8 sm:mt-10 text-center">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-file-text-line"></i>
              Get Your ESA Letter Now
            </Link>
          </div>
        </div>
      </section>

      {/* What to Avoid */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-red-500 mb-3">Stay Protected</span>
            <h2 className="text-2xl font-bold text-gray-900">What to Avoid When Getting an ESA Letter</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-white border border-red-100 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center bg-red-50 rounded-lg">
                  <i className="ri-close-circle-line text-red-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm">Don&apos;t Fake ESA Letters</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Don&apos;t get ESA Letters from websites offering them without any assessment by a licensed professional. An authentic ESA letter involves consultation with a mental health professional.
              </p>
            </div>
            <div className="bg-white border border-red-100 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center bg-red-50 rounded-lg">
                  <i className="ri-alert-line text-red-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm">Be Wary of Online Scams</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Some websites guarantee your ESA letter without proper assessment. Deal only with trusted services like PawTenant which offer your ESA letter after a licensed professional&apos;s consultation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* State-aware requirements — small contextual section that
          connects the process explainer to the per-state guides. The core
          process is the same nationwide; the rules layered on top vary
          by state. Six curated states + the all-states hub. No
          repetitive anchor text, no doorway-style block. */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6 md:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5">
                <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                  By State
                </span>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 leading-tight">
                  ESA letter requirements can vary by state
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  The application steps are the same anywhere in the US — assessment, licensed evaluation, signed letter. What changes by state is who can legally sign your letter (a clinician licensed in your state of residence) and which state-level statutes layer on top of the federal Fair Housing Act.
                </p>
                {/* 2026-05-21 HOWTO-MOBILE-REVAMP: secondary paragraph hidden
                    on mobile, kept in DOM for desktop + crawlers. */}
                <p className="hidden sm:block text-gray-600 text-sm leading-relaxed mb-5">
                  Each state guide below covers the licensed-provider requirement, the relevant state statute, and the documentation a landlord in that state is most likely to ask for.
                </p>
                <Link
                  to="/explore-esa-letters-all-states"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  See guides for all 50 states
                  <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              </div>
              <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { slug: "california", name: "California" },
                  { slug: "texas", name: "Texas" },
                  { slug: "florida", name: "Florida" },
                  { slug: "new-york", name: "New York" },
                  { slug: "pennsylvania", name: "Pennsylvania" },
                  { slug: "georgia", name: "Georgia" },
                ].map((s) => (
                  <Link
                    key={s.slug}
                    to={`/esa-letter/${s.slug}`}
                    className="flex items-center gap-2 px-3.5 py-3 rounded-lg bg-white border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-colors cursor-pointer group"
                  >
                    <i className="ri-map-pin-2-line text-orange-500 text-sm flex-shrink-0"></i>
                    <span className="text-sm text-gray-700 group-hover:text-orange-600 transition-colors leading-tight">
                      {s.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose — 2026-05-21 HOWTO-MOBILE-REVAMP
          Mobile: first 3 cards visible, remaining 3 hidden under
          "Show more reasons". All 6 stay in DOM. Cards on mobile use a calm
          white shell with sage `#4A8472` icon background (matching the new
          homepage palette); desktop keeps the existing orange-tinted shell. */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Why PawTenant</span>
            <h2 className="text-[26px] sm:text-3xl font-bold text-slate-900 leading-tight">Why Choose Us?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {whyItems.map((item, i) => {
              const hideOnMobile = i >= 3 && !whyExpanded;
              return (
                <div
                  key={i}
                  className={`bg-white sm:bg-[#fdf6ee] rounded-xl p-5 sm:p-6 border border-slate-200 sm:border-orange-100 ${hideOnMobile ? "hidden sm:block" : ""}`}
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-[#4A8472] sm:bg-orange-500 rounded-lg mb-4">
                    <i className={`${item.icon} text-white text-lg`}></i>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2 text-sm">{item.title}</h3>
                  <p className="text-slate-600 text-[13.5px] sm:text-sm leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
          {!whyExpanded && (
            <div className="sm:hidden mt-6 text-center">
              <button
                type="button"
                onClick={() => setWhyExpanded(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-expanded={whyExpanded}
              >
                Show more reasons
                <i className="ri-arrow-down-s-line"></i>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* PSD awareness — ESA vs PSD comparison before the FAQ so
          visitors who came searching for "esa letter" also see that
          PawTenant supports PSD for qualifying individuals. Added in
          mobile-cleanup pass. */}
      <EsaVsPsdCard className="bg-[#fafbfb]" />

      {/* FAQ — 2026-05-21 HOWTO-MOBILE-REVAMP
          First 4 questions visible on mobile (matches the homepage FAQSection
          pattern); items 5-6 stay in the DOM and the FAQPage JSON-LD schema
          remains a full iteration of the `faqs` array. */}
      <section className="py-12 sm:py-16 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-[26px] sm:text-3xl font-bold text-slate-900 leading-tight">Frequently Asked Questions</h2>
          </div>
          <FAQAccordion faqs={faqs} mobileShowCount={4} />
        </div>
      </section>

      {/* CTA — 2026-05-21 HOWTO-MOBILE-REVAMP
          Tighter mobile padding so the section doesn't dwarf the sticky CTA
          (which is anchored 64px from the bottom on mobile). Copy unchanged. */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-[26px] sm:text-3xl font-bold text-white mb-3 sm:mb-4 leading-tight">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-orange-100 mb-7 sm:mb-8 text-sm sm:text-base">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="inline-flex items-center justify-center gap-2 px-6 sm:px-10 py-4 bg-white text-orange-600 font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-center w-full sm:w-auto"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      {/* Related Resources — natural internal links to help readers continue
          their research without leaving the funnel. Bottom-of-page placement
          keeps the page focused on the primary how-to flow above. */}
      <section className="py-12 sm:py-16 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-tight">
              Related Resources
            </h2>
            <p className="text-[14px] text-slate-600 leading-relaxed">
              Helpful guides for the rest of your ESA letter journey.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Link
              to="/housing-rights-esa"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                Fair Housing Act Rights
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                How federal Fair Housing law supports reasonable accommodation requests for tenants with a qualifying ESA.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
            <Link
              to="/esa-letter-cost"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                ESA Letter Pricing
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                Transparent pricing for a clinically reviewed ESA letter, with a refund if you don&rsquo;t qualify after review.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
            <Link
              to="/esa-letter-verification"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                Landlord Verification
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                How landlords confirm an ESA letter&rsquo;s authenticity using its unique verification ID.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />

      {/* Mobile sticky CTA — 2026-05-21 HOWTO-HERO-REFINE
          Scroll-aware: hidden while the hero is in view (so it never competes
          with the hero CTA above the fold), fades up the moment the hero
          scrolls out via the IntersectionObserver effect at the top of this
          component. `aria-hidden` and `pointer-events: none` are toggled in
          sync with the visual state so the button is fully inert when off-
          screen. */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))] transition-all duration-300 ease-out ${
          showStickyCTA
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
        aria-hidden={!showStickyCTA}
      >
        <Link
          to="/assessment"
          tabIndex={showStickyCTA ? 0 : -1}
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
        >
          <i className="ri-file-text-line"></i>
          Get Your ESA Letter — From $99
        </Link>
      </div>
    </main>
  );
}

function FAQAccordion({
  faqs,
  mobileShowCount,
}: {
  faqs: { q: string; a: string }[];
  // Number of questions to show by default on mobile. Items beyond this index
  // are kept in the DOM (so FAQPage JSON-LD schema + crawler indexability is
  // preserved) but rendered with `display: none` until the user taps
  // "Show more questions". Desktop (sm+) always shows everything.
  mobileShowCount?: number;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const [showAllMobile, setShowAllMobile] = useState(false);
  const threshold = mobileShowCount ?? faqs.length;
  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => {
        const hideOnMobile = i >= threshold && !showAllMobile;
        return (
          <div
            key={i}
            className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${hideOnMobile ? "hidden sm:block" : ""}`}
          >
            <button
              className="w-full flex items-center justify-between px-5 sm:px-6 py-4 text-left cursor-pointer"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              aria-controls={`howto-faq-answer-${i}`}
              id={`howto-faq-question-${i}`}
            >
              <span className={`text-sm font-semibold pr-3 ${open === i ? "text-orange-500" : "text-slate-900"}`}>
                {faq.q}
              </span>
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2 sm:ml-4">
                <i className={`${open === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
              </div>
            </button>
            {open === i && (
              <div
                id={`howto-faq-answer-${i}`}
                role="region"
                aria-labelledby={`howto-faq-question-${i}`}
                className="px-5 sm:px-6 pb-4"
              >
                <p className="text-slate-600 text-sm leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        );
      })}
      {/* Mobile-only "Show more questions" toggle. */}
      {!showAllMobile && faqs.length > threshold && (
        <div className="sm:hidden pt-1 text-center">
          <button
            type="button"
            onClick={() => setShowAllMobile(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            aria-expanded={showAllMobile}
          >
            Show more questions
            <i className="ri-arrow-down-s-line"></i>
          </button>
        </div>
      )}
    </div>
  );
}
