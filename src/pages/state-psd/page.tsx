import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { getPSDStateBySlug } from "../../mocks/statesPSD";
import { useSitePricing } from "../../hooks/useSitePricing";

// ── COMPLIANCE (PSD) ────────────────────────────────────────────────────────
// This template renders /psd-letter/<slug>. A Psychiatric Service Dog (PSD) is
// DIFFERENT from an Emotional Support Animal (ESA). Copy here must never imply
// guaranteed approval, guaranteed public access, instant approval, a "certified"
// or "registered" service dog, third-party acceptance guarantees, or that
// documentation trains/replaces task training. Safe framing only: a licensed
// provider evaluation, PSD documentation, a recommendation IF clinically
// appropriate, access that depends on the dog's training + behavior + law, a
// refund if you don't qualify, and no guarantee of acceptance by any third party.

const whyPawtenant = [
  { title: "Licensed Mental-Health Professionals", desc: "Your evaluation is conducted by a provider licensed in your state — thorough, confidential, and grounded in a real clinical review.", icon: "ri-mental-health-line" },
  { title: "Task-Training Guidance", desc: "We help you understand the kinds of tasks a PSD is trained to perform. Documentation does not train or certify your dog — that training is separate.", icon: "ri-guide-line" },
  { title: "Providers in Every State", desc: "PawTenant works with licensed providers across all 50 states, so your evaluation is handled by someone qualified where you live.", icon: "ri-map-pin-line" },
  { title: "HIPAA-Secure Telehealth", desc: "Consultations run over HIPAA-compliant telehealth. Your mental-health information stays private and protected.", icon: "ri-shield-check-line" },
  { title: "Refund If You Don't Qualify", desc: "If the licensed provider determines a PSD isn't clinically appropriate for you, you're refunded. We never promise an outcome before the evaluation.", icon: "ri-refund-2-line" },
];

const psdTasks = [
  { task: "Deep Pressure Therapy (DPT)", desc: "Applying body weight to help reduce the intensity of a panic or anxiety episode." },
  { task: "Grounding Techniques", desc: "Interrupting a dissociative episode through trained physical contact." },
  { task: "Alerting to Anxiety", desc: "Recognizing early signs of a psychiatric episode and alerting the handler." },
  { task: "Medication Reminders", desc: "Prompting the handler to take medication at scheduled times." },
  { task: "Room Searching", desc: "A trained check of a space to help reduce hypervigilance for some handlers with PTSD." },
  { task: "Creating Space", desc: "Positioning to create personal space in crowded environments." },
];

const evaluationSteps = [
  { step: "1", title: "Short Intake", desc: "Answer a brief questionnaire about your situation and how a psychiatric service dog might help.", icon: "ri-file-list-3-line" },
  { step: "2", title: "Licensed Provider Review", desc: "A mental-health professional licensed in your state reviews your information by secure telehealth.", icon: "ri-stethoscope-line" },
  { step: "3", title: "Clinical Decision", desc: "The provider decides whether a PSD is clinically appropriate. There is no pre-set outcome — if it isn't appropriate, you're refunded.", icon: "ri-mental-health-line" },
  { step: "4", title: "Documentation Issued", desc: "If appropriate, you receive PSD documentation reflecting the provider's evaluation — not a registration, certificate, or ID.", icon: "ri-mail-check-line" },
];

// Tasteful benefit pills (replaces the old full-width orange ribbon). Soft
// white pills, mixed orange/teal icons — premium and compliance-safe.
const benefitPills = [
  { label: "Licensed provider evaluation", icon: "ri-stethoscope-line", tone: "text-orange-500" },
  { label: "PSD is different from an ESA", icon: "ri-git-branch-line", tone: "text-teal-600" },
  { label: "Task-trained dog", icon: "ri-award-line", tone: "text-orange-500" },
  { label: "Refund if you don't qualify", icon: "ri-refund-2-line", tone: "text-teal-600" },
  { label: "HIPAA-secure telehealth", icon: "ri-shield-check-line", tone: "text-orange-500" },
];

// Pricing — same card language as /how-to-get-psd-letter, with compliance-safe
// feature copy (no "ADA & FHA compliant", "airline", "same-day", or "100%
// money-back guarantee"). Prices mirror PSDStep3Checkout (1 dog).
const pricingPlans = [
  {
    name: "PSD Letter",
    speed: "One-time — from $129 for 1 dog",
    price: "$129",
    priceKey: "psd_standard",
    priceSuffix: "",
    note: "$149 total for 2–3 dogs",
    annualPill: false,
    highlight: true,
    features: [
      "Reviewed by a licensed provider (LMHP)",
      "PSD documentation if clinically appropriate",
      "Provider signature, license & NPI",
      "Same-day PDF delivery available",
      "Valid for 12 months",
      "Landlord documentation support",
      "Public-access documentation support where applicable",
      "Secure online assessment",
      "Refund if you don't qualify",
    ],
  },
  {
    name: "PSD Annual",
    speed: "Per year — renews automatically",
    price: "$109",
    priceKey: "psd_annual",
    priceSuffix: "/yr",
    note: "$129/year total for 2–3 dogs",
    annualPill: true,
    highlight: false,
    features: [
      "Reviewed by a licensed provider (LMHP)",
      "PSD documentation if clinically appropriate",
      "Provider signature, license & NPI",
      "Same-day PDF delivery available",
      "Valid for 12 months",
      "Landlord documentation support",
      "Public-access documentation support where applicable",
      "Secure online assessment",
      "Annual renewal keeps your letter current",
      "Refund if you don't qualify",
    ],
  },
];

export default function StatePSDPage() {
  const { state: stateSlug } = useParams<{ state: string }>();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Admin-managed display prices (hydrates at runtime; falls back to the inline
  // plan price for prerender / offline safety). Display only — not checkout.
  const { price: getPrice } = useSitePricing();

  const stateData = getPSDStateBySlug(stateSlug || "");

  // Local asset map for PSD pages — state-specific image when available, warm fallback otherwise.
  const PSD_HERO_MAP: Record<string, string> = {
    CA: "/assets/states/california.jpg",
    TX: "/assets/states/texas.jpg",
    FL: "/assets/states/florida.jpg",
    NY: "/assets/states/new-york.jpg",
    NC: "/assets/states/north-carolina.jpg",
    PA: "/assets/states/pennsylvania.jpg",
    VA: "/assets/states/virginia.jpg",
    IL: "/assets/states/illinois.jpg",
  };
  const psdHeroSrc = (stateData && PSD_HERO_MAP[stateData.abbreviation]) || "/assets/lifestyle/woman-with-dog-new-apartment.jpg";
  const psdHandlerSrc = "/assets/blog/man-working-dog.jpg";
  const psdParkSrc = "/assets/blog/lady-pink-puppy-walk.jpg";
  const psdLabradorSrc = "/assets/blog/cafe-retriever.jpg";

  useEffect(() => {
    if (!stateData) return;

    const title = `PSD Letter in ${stateData.name} | Psychiatric Service Dog Evaluation | PawTenant`;
    const description = `Psychiatric Service Dog (PSD) documentation in ${stateData.name} through a licensed provider evaluation. Learn how a PSD differs from an ESA, what the letter can and can't do, and your ${stateData.name} options. Refund if you don't qualify.`;
    const canonical = `https://pawtenant.com/psd-letter/${stateData.slug}`;

    document.title = title;

    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    setMeta("description", description);
    setMeta("keywords", `PSD letter ${stateData.name}, psychiatric service dog ${stateData.name}, ${stateData.name} PSD letter online, PSD vs ESA ${stateData.name}, PSD letter ${stateData.abbreviation}, psychiatric service dog documentation ${stateData.name}, how to get a PSD letter in ${stateData.name}`);
    setLink("canonical", canonical);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("twitter:title", title, true);
    setMeta("twitter:description", description, true);

    const existingSchema = document.getElementById("state-psd-schema");
    if (existingSchema) existingSchema.remove();

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "mainEntity": stateData.faqs.map((faq) => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": { "@type": "Answer", "text": faq.a },
          })),
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "PSD Letters", "item": "https://pawtenant.com/how-to-get-psd-letter" },
            { "@type": "ListItem", "position": 3, "name": `PSD Letter in ${stateData.name}`, "item": canonical },
          ],
        },
        {
          "@type": "Service",
          "name": `Psychiatric Service Dog Evaluation in ${stateData.name}`,
          "description": description,
          "provider": { "@type": "Organization", "name": "PawTenant", "url": "https://pawtenant.com" },
          "areaServed": { "@type": "State", "name": stateData.name },
          "serviceType": "Psychiatric Service Dog documentation via licensed provider evaluation",
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "state-psd-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const schemaEl = document.getElementById("state-psd-schema");
      if (schemaEl) schemaEl.remove();
    };
  }, [stateData]);

  if (!stateData) {
    return (
      <main>
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">State Not Found</h1>
          <p className="text-gray-600 mb-8">We couldn&apos;t find PSD information for this state.</p>
          <Link to="/how-to-get-psd-letter" className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 cursor-pointer">
            PSD Letter Guide
          </Link>
        </div>
        <SharedFooter />
      </main>
    );
  }

  return (
    <main>
      <SharedNavbar />

      {/* Hero — clean full-cover poster, vertically centered, short copy.
          min-h keeps the next section from peeking; CTA pair stacks
          full-width on mobile so it's always visible above the fold. */}
      <section className="relative min-h-[88svh] flex flex-col justify-center pt-24 sm:pt-28 pb-12 sm:pb-16">
        <div className="absolute inset-0">
          <img
            src={psdHeroSrc}
            alt={`Psychiatric Service Dog documentation in ${stateData.name}`}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 w-full">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Link to="/how-to-get-psd-letter" className="text-white/70 hover:text-white text-[13px] sm:text-sm transition-colors">
                PSD Letters
              </Link>
              <i className="ri-arrow-right-s-line text-white/50 text-xs"></i>
              <span className="text-white/90 text-[13px] sm:text-sm">{stateData.name}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 bg-orange-500/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full mb-4">
              <i className="ri-shield-star-fill"></i> Psychiatric Service Dog
            </span>
            <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-[1.15]">
              PSD Letter in {stateData.name}
            </h1>
            <p className="text-white/90 text-[14.5px] sm:text-base leading-relaxed mb-6 sm:mb-7 max-w-md">
              Start with a {stateData.name}-licensed provider evaluation for Psychiatric Service Dog documentation. A PSD is different from an ESA and must be task-trained.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
              <Link
                to="/psd-assessment"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-[14px] sm:text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
              >
                <i className="ri-mental-health-line"></i>
                Start My PSD Evaluation
              </Link>
              <Link
                to="/how-to-get-psd-letter"
                className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto text-white/90 hover:text-white text-[13.5px] sm:text-sm font-semibold border border-white/30 hover:border-white/60 px-5 py-3 rounded-md transition-colors cursor-pointer"
              >
                Learn About PSDs
                <i className="ri-arrow-right-line text-xs"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefit pills — tasteful soft pills below the hero (replaces the old
          full-width orange ribbon). Wraps responsively; mixed orange/teal
          icons; compliance-safe labels. */}
      <section className="bg-[#fdf6ee] py-6 sm:py-8 border-b border-orange-100/70">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            {benefitPills.map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 sm:px-4 py-2 text-[12.5px] sm:text-[13px] font-semibold text-gray-700 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
              >
                <i className={`${p.icon} ${p.tone} text-sm`}></i>
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PSD vs ESA — placed early so the distinction is unmistakable */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Know the Difference</span>
            <h2 className="text-3xl font-bold text-gray-900">PSD vs ESA in {stateData.name}</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto mt-3">
              These are two different things. A psychiatric service dog is individually trained to perform tasks; an emotional support animal is not. They are not interchangeable.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-orange-500 rounded-xl p-6 text-white">
              <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-lg mb-4">
                <i className="ri-mental-health-line text-white text-lg"></i>
              </div>
              <h3 className="font-bold text-lg mb-4">Psychiatric Service Dog (PSD)</h3>
              <ul className="space-y-2">
                {["Individually trained to perform tasks", "Housing accommodation under the FHA", "May have ADA public access — if trained & well-behaved", "Not classified as a pet", "Requires a licensed provider evaluation"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/90">
                    <i className="ri-check-line text-white text-xs flex-shrink-0 mt-0.5"></i>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                <i className="ri-heart-line text-orange-500 text-lg"></i>
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Emotional Support Animal (ESA)</h3>
              <ul className="space-y-2">
                {["Provides comfort through companionship", "Housing accommodation under the FHA", "No public-access rights under the ADA", "No task training required", "Requires a licensed provider evaluation"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                    <i className="ri-check-line text-orange-400 text-xs flex-shrink-0 mt-0.5"></i>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-4 border-t border-gray-100">
                <Link to={`/esa-letter/${stateData.slug}`} className="text-orange-500 hover:text-orange-600 text-xs font-semibold cursor-pointer">
                  Looking for an ESA letter in {stateData.name}? &rarr;
                </Link>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 max-w-2xl mx-auto mt-6">
            Public access for a service dog depends on the dog being task-trained, under control, and well-behaved — and on applicable law. Documentation alone does not grant access.
          </p>
        </div>
      </section>

      {/* Laws Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Legal Framework</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">{stateData.name} PSD Laws &amp; Protections</h2>
              <p className="text-gray-600 leading-relaxed mb-6">{stateData.lawsSummary}</p>
              <div className="bg-[#fdf6ee] rounded-xl p-6 mb-6 flex-1">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Key points for {stateData.name}:</h3>
                <ul className="space-y-3">
                  {stateData.lawsBullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">{b}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm self-start"
              >
                <i className="ri-mental-health-line"></i>
                Start My PSD Evaluation
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden lg:self-center aspect-[4/3] sm:aspect-[16/10] lg:aspect-[5/4] lg:max-h-[480px] shadow-[0_14px_44px_-22px_rgba(15,23,42,0.35)]">
              <img
                src={psdHandlerSrc}
                alt={`Psychiatric service dog handler in ${stateData.name}`}
                loading="lazy"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Licensed Provider Evaluation Process */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">The Process</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How the {stateData.name} Evaluation Works</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">A licensed provider decides whether a psychiatric service dog is clinically appropriate. The outcome is never decided in advance.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {evaluationSteps.map((s) => (
              <div key={s.step} className="bg-white rounded-xl p-6 border border-gray-100 relative">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-lg mb-4 font-bold">
                  {s.step}
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5">{s.title}</h3>
                <p className="text-gray-600 text-xs leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What a PSD Letter Can / Cannot Do */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Set Expectations</span>
            <h2 className="text-3xl font-bold text-gray-900">What a PSD Letter Can &amp; Cannot Do in {stateData.name}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-emerald-500"></i> What it can do
              </h3>
              <ul className="space-y-3">
                {stateData.whatItCan.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-gray-700 leading-relaxed">
                    <i className="ri-check-line text-emerald-500 text-base flex-shrink-0 mt-0.5"></i>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-rose-50 rounded-xl p-6 border border-rose-100">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-close-circle-fill text-rose-500"></i> What it cannot do
              </h3>
              <ul className="space-y-3">
                {stateData.whatItCannot.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-gray-700 leading-relaxed">
                    <i className="ri-close-line text-rose-500 text-base flex-shrink-0 mt-0.5"></i>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PSD Tasks Section */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">What PSDs Do</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Examples of Psychiatric Service Dog Tasks</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">A PSD is individually trained to perform specific tasks that help with a psychiatric disability — this trained work is what distinguishes a PSD from an ESA. Task training is separate from documentation.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {psdTasks.map((item) => (
              <div key={item.task} className="bg-white rounded-xl p-5 border border-gray-100">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className="ri-mental-health-line text-orange-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5">{item.task}</h3>
                <p className="text-gray-600 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="rounded-2xl overflow-hidden lg:self-center aspect-[4/3] sm:aspect-[16/10] lg:aspect-[5/4] lg:max-h-[480px] shadow-[0_14px_44px_-22px_rgba(15,23,42,0.35)]">
              <img
                src={psdParkSrc}
                alt={`Psychiatric service dog support in ${stateData.name}`}
                loading="lazy"
                className="w-full h-full object-cover object-center"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Why It Matters</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-7">
                What a Psychiatric Service Dog May Mean in {stateData.name}
              </h2>
              <div className="space-y-5 flex-1">
                {stateData.advantages.map((adv) => (
                  <div key={adv.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{adv.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{adv.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to="/psd-assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-mental-health-line"></i>
                  Start My PSD Assessment
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — card language matched to /how-to-get-psd-letter */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Transparent Pricing</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">PSD Evaluation Pricing in {stateData.name}</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Pricing covers the licensed provider evaluation. PSD documentation is issued only if it&apos;s clinically appropriate for you — and you&apos;re refunded if you don&apos;t qualify. Final pricing is confirmed at checkout.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto items-stretch">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl p-8 flex flex-col ${
                  plan.highlight
                    ? "border-2 border-orange-400 shadow-[0_16px_44px_-18px_rgba(249,115,22,0.42)]"
                    : "border-2 border-gray-200"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                    Most Popular
                  </span>
                )}
                <div className="mb-5">
                  <h3 className="text-gray-900 font-bold text-base mb-1">{plan.name}</h3>
                  <p className="text-gray-400 text-xs mb-4">{plan.speed}</p>
                  {plan.annualPill ? (
                    <div className="flex flex-col gap-2">
                      <span className="self-start inline-flex items-center gap-1.5 rounded-full bg-[#4A8472]/10 text-[#2f5d50] border border-[#4A8472]/25 px-3.5 py-1.5 text-sm font-extrabold">
                        <i className="ri-refresh-line text-[13px]"></i>
                        Annual from {getPrice(plan.priceKey, plan.price)}{plan.priceSuffix}
                      </span>
                      <span className="self-start inline-flex items-center rounded-full bg-[#4A8472]/8 text-[#3F7061] border border-[#4A8472]/20 px-3 py-1 text-[12px] font-bold">
                        {plan.note}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end gap-1">
                        <p className="text-4xl font-extrabold text-gray-900">{getPrice(plan.priceKey, plan.price)}{plan.priceSuffix}</p>
                        <p className="text-sm text-gray-400 mb-1">/ 1 dog</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{plan.note}</p>
                    </>
                  )}
                </div>
                <ul className="space-y-2 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500 text-base"></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/psd-assessment"
                  className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${
                    plan.highlight
                      ? "bg-orange-500 text-white hover:bg-orange-600 shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
                      : "border-2 border-orange-500 text-orange-500 hover:bg-orange-50"
                  }`}
                >
                  Start My PSD Assessment
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <i className="ri-shield-check-line text-orange-500 text-lg"></i>
              <strong>Refund if you don&apos;t qualify</strong> — your evaluation decides the outcome.
            </div>
          </div>
        </div>
      </section>

      {/* Why PawTenant */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Why PawTenant for Your {stateData.name} PSD Evaluation?</h2>
              <div className="space-y-5 flex-1">
                {whyPawtenant.map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                      <i className={`${item.icon} text-orange-500`}></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to="/psd-assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-mental-health-line"></i>
                  Start My PSD Assessment
                </Link>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden lg:self-center aspect-[4/3] sm:aspect-[16/10] lg:aspect-[5/4] lg:max-h-[480px] shadow-[0_14px_44px_-22px_rgba(15,23,42,0.35)]">
              <img
                src={psdLabradorSrc}
                alt="Calm, well-trained dog resting in a cafe"
                loading="lazy"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Common Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">PSD Letter FAQ — {stateData.name}</h2>
          </div>
          <div className="space-y-3">
            {stateData.faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Links */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Related Resources for {stateData.name} Residents</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { to: "/how-to-get-psd-letter", label: "How to Get a PSD Letter", icon: "ri-guide-line" },
              { to: `/esa-letter/${stateData.slug}`, label: `ESA Letter in ${stateData.name}`, icon: "ri-heart-line" },
              { to: "/all-about-service-dogs", label: "Service Dogs Guide", icon: "ri-service-line" },
              { to: "/resource-center", label: "Full ESA & PSD Resource Center", icon: "ri-book-open-line" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 p-4 bg-[#fdf6ee] rounded-xl hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                  <i className={`${link.icon} text-orange-500 text-sm`}></i>
                </div>
                <span className="text-sm font-semibold text-gray-800">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance / disclaimer */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-6">
            <i className="ri-information-line text-orange-500 text-lg flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-700">Important:</strong> A PSD letter documents a licensed provider&apos;s evaluation. It is not a registration, certificate, or ID card, and it does not train your dog — there is no official U.S. service-dog registry. Under the ADA, a psychiatric service dog must be individually trained to perform tasks and be under the handler&apos;s control. Public access depends on the dog&apos;s training, behavior, and applicable law. No documentation can guarantee acceptance by any landlord, airline, hotel, business, or other third party. PawTenant provides educational information and connects you with licensed providers; it is not a law firm and does not provide legal advice.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Start Your {stateData.name} PSD Evaluation</h2>
          <p className="text-gray-400 mb-8">Licensed providers · HIPAA-secure telehealth · refund if you don&apos;t qualify</p>
          <Link
            to="/psd-assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-mental-health-line"></i>
            Start My PSD Assessment
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
