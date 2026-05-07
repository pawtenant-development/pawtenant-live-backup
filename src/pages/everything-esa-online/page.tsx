import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const PAGE_PATH = "/everything-you-need-to-know-about-obtaining-an-esa-letter-online";
const CANONICAL = `https://www.pawtenant.com${PAGE_PATH}`;
const TITLE = "Everything You Need to Know About Obtaining an ESA Letter Online | PawTenant";
const DESCRIPTION =
  "The complete 2026 guide to obtaining a legitimate ESA letter online. Learn who qualifies, how online evaluations work with licensed mental health professionals, what makes a letter housing-valid, and how to spot sketchy ESA websites.";

// PawTenant Supabase public asset library
const ASSET_BASE = "https://cvwbozlbbmrjxznknouq.supabase.co/storage/v1/object/public/ad-assets";
const ASSETS = {
  esaLetterMockup: `${ASSET_BASE}/ESA%20Letter/esa_letter_1080x1920.png`,
  verificationScreen: `${ASSET_BASE}/verification/verification_screen_1080x1920.png`,
  assessmentClip1: `${ASSET_BASE}/assessment-ui/assessment_clip_1.mp4`,
  petBeagle: `${ASSET_BASE}/pets/portrait-thoughtful-beagle-dog-sitting-indoors.jpg`,
  petCloseUp: `${ASSET_BASE}/pets/close-up-dog-looking-away.jpg`,
  heroImg: `${ASSET_BASE}/pets/close-up-dog-looking-away.jpg`,
};

const heroBenefits = [
  "Evaluated by a state-licensed mental health professional",
  "Housing-focused ESA letters under the Fair Housing Act",
  "Issued in 24–48 hours after evaluation",
];

const overviewPoints = [
  {
    icon: "ri-file-text-line",
    title: "Real Documentation",
    desc: "An ESA letter is a written recommendation from a licensed mental health professional — not a registry or certificate.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing-Focused",
    desc: "ESA letters are primarily relevant for housing accommodations under the Fair Housing Act.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Requires Evaluation",
    desc: "A legitimate letter follows a real evaluation by a licensed clinician — never an instant-approval form.",
  },
  {
    icon: "ri-time-line",
    title: "Time-Limited",
    desc: "ESA letters typically remain current for 12 months and are renewed annually if your circumstances continue.",
  },
];

const qualifyingConditions = [
  { icon: "ri-mental-health-line", label: "Anxiety Disorders" },
  { icon: "ri-cloudy-line", label: "Depression" },
  { icon: "ri-heart-pulse-line", label: "PTSD" },
  { icon: "ri-brain-line", label: "Bipolar Disorder" },
  { icon: "ri-alarm-warning-line", label: "Panic Disorder" },
  { icon: "ri-group-line", label: "Social Anxiety" },
  { icon: "ri-contrast-drop-line", label: "OCD" },
  { icon: "ri-emotion-unhappy-line", label: "Phobias" },
  { icon: "ri-focus-3-line", label: "ADHD" },
  { icon: "ri-user-unfollow-line", label: "Other DSM-5 Conditions" },
];

const onlineProcessSteps = [
  {
    number: "01",
    icon: "ri-file-list-3-line",
    title: "Online Assessment",
    desc: "You complete a short questionnaire about your symptoms, daily functioning, and your interest in an emotional support animal. This is the intake — it does not approve or deny a letter on its own.",
  },
  {
    number: "02",
    icon: "ri-stethoscope-line",
    title: "Telehealth Evaluation",
    desc: "A licensed mental health professional in your state reviews your intake and conducts a real one-on-one evaluation by video or phone. They decide whether an ESA may be supportive for your treatment plan.",
  },
  {
    number: "03",
    icon: "ri-shield-check-line",
    title: "Letter Issuance",
    desc: "If the licensed clinician determines that an ESA is appropriate, they issue a signed letter on official letterhead — including their license number, state, and signature — for housing accommodation requests.",
  },
  {
    number: "04",
    icon: "ri-customer-service-2-line",
    title: "Verification Support",
    desc: "If your housing provider asks to verify the letter, our team can support a privacy-safe license verification process — without exposing your medical information.",
  },
];

const legitimacySignals = [
  {
    icon: "ri-user-star-line",
    title: "Real Licensed Clinician",
    desc: "The letter is signed by a real, state-licensed mental health professional — psychologist, therapist, LCSW, LPC, or psychiatrist — with a verifiable license number.",
  },
  {
    icon: "ri-checkbox-circle-line",
    title: "Actual Evaluation Took Place",
    desc: "There was a real telehealth visit (video or phone) where you spoke directly with the clinician. No legitimate letter is issued without one.",
  },
  {
    icon: "ri-file-shield-2-line",
    title: "Letter on Official Letterhead",
    desc: "The letter appears on the clinician's letterhead with their name, credentials, contact information, and signature — not a generic template.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "Recent and Dated",
    desc: "The letter is dated and remains current — typically within the last 12 months. Housing providers can reasonably request a recent letter.",
  },
];

const redFlags = [
  {
    icon: "ri-flashlight-line",
    title: "Instant or Same-Hour Approval Without an Evaluation",
    desc: "If a website promises a letter in minutes without a clinician speaking with you, that is not how legitimate ESA letters work — and a housing provider can challenge it.",
  },
  {
    icon: "ri-medal-line",
    title: "Selling Registries, Certificates, or ID Cards",
    desc: "There is no official US ESA registry. Plastic ID cards, vests, and registry numbers do not confer legal protection — only a clinician's letter does.",
  },
  {
    icon: "ri-question-line",
    title: "No Information About the Clinician",
    desc: "Legitimate services name the clinician, their credentials, and their license number on the letter. If you can't see who is signing, that is a red flag.",
  },
  {
    icon: "ri-money-dollar-circle-line",
    title: "100% Approval Guarantees",
    desc: "No legitimate clinician can guarantee approval before evaluating you. Approval depends on a real clinical assessment of your situation.",
  },
  {
    icon: "ri-spam-2-line",
    title: "High-Pressure Upsells",
    desc: "Be cautious of sites that aggressively upsell vests, certifications, or premium tiers that have no legal weight. The letter itself is what matters.",
  },
  {
    icon: "ri-shield-cross-line",
    title: "Promises of Public Access for an ESA",
    desc: "ESA letters are mainly for housing. Any site promising restaurant, store, or full airline access for an ESA is misleading — that is service-dog territory.",
  },
];

const housingContext = [
  {
    icon: "ri-scales-3-line",
    title: "Fair Housing Act Coverage",
    desc: "Most rental housing in the US is covered by the Fair Housing Act, which addresses reasonable accommodation requests for emotional support animals.",
  },
  {
    icon: "ri-bank-card-line",
    title: "Pet Fees and Deposits",
    desc: "An ESA is not classified as a pet for housing accommodation purposes. Pet fees and pet deposits typically do not apply once an accommodation request is granted.",
  },
  {
    icon: "ri-question-answer-line",
    title: "What a Landlord May Ask",
    desc: "Housing providers may ask for documentation of the disability-related need but cannot demand medical records or specific diagnostic details.",
  },
  {
    icon: "ri-error-warning-line",
    title: "Reasonable Accommodation, Not Automatic Approval",
    desc: "Accommodation requests are reviewed individually. PawTenant's letters are written to support a clean accommodation request, but final acceptance is up to your housing provider.",
  },
];

const whyPawTenant = [
  {
    icon: "ri-user-star-line",
    title: "Only Licensed Mental Health Professionals",
    desc: "Every evaluation is conducted by a state-licensed clinician — never a chatbot or non-licensed staff.",
  },
  {
    icon: "ri-shield-keyhole-line",
    title: "HIPAA-Aware Process",
    desc: "Your intake answers and evaluation notes are handled in line with HIPAA standards. We do not sell your data.",
  },
  {
    icon: "ri-time-line",
    title: "24–48 Hour Turnaround",
    desc: "After your telehealth evaluation, eligible letters are typically issued within one to two business days.",
  },
  {
    icon: "ri-refresh-line",
    title: "Annual Renewal Support",
    desc: "Renewing an existing ESA letter through PawTenant is straightforward when your situation continues year over year.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Verification Help for Housing Providers",
    desc: "If your landlord asks to verify the letter, we can support privacy-safe verification of the clinician's license — no medical details exposed.",
  },
  {
    icon: "ri-refund-2-line",
    title: "No-Risk Guarantee",
    desc: "If you do not qualify after the evaluation, you do not pay for the letter. See our money-back details on the No Risk Guarantee page.",
  },
];

const faqs = [
  {
    q: "What is an ESA letter, exactly?",
    a: "An ESA letter is a written recommendation from a licensed mental health professional that states a person has a qualifying mental or emotional condition and that an emotional support animal is part of their support plan. It is most commonly used to request a reasonable accommodation in housing. It is not a license, registry entry, or certification — it is a clinical recommendation on official letterhead.",
  },
  {
    q: "Can I obtain an ESA letter online legitimately?",
    a: "Yes. Telehealth evaluations are widely accepted. The legitimacy of an ESA letter depends on whether a real, state-licensed mental health professional actually evaluated you and signed the letter — not on whether the visit happened in person or by video. Avoid services that issue letters with no evaluation.",
  },
  {
    q: "Who qualifies for an ESA letter?",
    a: "You may qualify if you have a mental or emotional condition recognized in the DSM-5 — including anxiety, depression, PTSD, bipolar disorder, panic disorder, OCD, phobias, and others — and a licensed clinician determines that an ESA may be supportive of your daily functioning. Eligibility is decided during the evaluation, not before it.",
  },
  {
    q: "How long does the online process take?",
    a: "The intake assessment usually takes about 5–10 minutes. After that, a licensed clinician reaches out to schedule the telehealth evaluation. Letters for eligible clients are typically issued within 24–48 hours after the evaluation.",
  },
  {
    q: "How long is an ESA letter valid?",
    a: "ESA letters are commonly considered current for 12 months. Many housing providers prefer a letter dated within the past year. Annual renewal is straightforward if your circumstances continue.",
  },
  {
    q: "What's the difference between an ESA letter and a PSD letter?",
    a: "An ESA letter supports housing-related accommodation requests for an emotional support animal that provides comfort. A PSD (psychiatric service dog) letter supports a dog that has been task-trained to perform specific tasks related to a psychiatric disability — and PSDs may have additional public-access considerations under the ADA. PawTenant offers guidance on both. See our PSD letter guide for more.",
  },
  {
    q: "What are the signs of a sketchy ESA website?",
    a: "Common red flags include: instant approvals with no evaluation, registries and ID cards sold as if they had legal weight, no clinician name or license number on the letter, and 100% approval guarantees. A legitimate ESA letter requires a real evaluation with a real licensed mental health professional.",
  },
  {
    q: "Will my landlord automatically accept the letter?",
    a: "An accommodation request is reviewed by your housing provider on an individual basis. PawTenant's letters are written to support a clean reasonable-accommodation request, and we offer privacy-safe verification support if a housing provider asks to confirm the clinician's license. Final acceptance is decided by your housing provider.",
  },
  {
    q: "Do I need to register my ESA somewhere?",
    a: "No. There is no official ESA registry in the United States. Registries, plastic ID cards, and vests do not provide legal protection on their own. The clinician's letter is what matters for a housing accommodation request.",
  },
];

export default function EverythingEsaOnlinePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta
        name="keywords"
        content="ESA letter online, obtain ESA letter online, legitimate ESA letter online, emotional support animal letter online, ESA housing letter, online ESA evaluation, licensed mental health professional ESA letter, ESA letter for housing, ESA letter 2026, how to get an ESA letter online"
      />
      <link rel="canonical" href={CANONICAL} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:type" content="article" />
      <meta property="og:locale" content="en_US" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: { "@type": "Answer", text: faq.a },
            })),
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Everything You Need to Know About Obtaining an ESA Letter Online",
            description: DESCRIPTION,
            mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
            url: CANONICAL,
            inLanguage: "en-US",
            author: {
              "@type": "Organization",
              name: "PawTenant",
              url: "https://www.pawtenant.com/",
            },
            publisher: {
              "@type": "Organization",
              name: "PawTenant",
              logo: {
                "@type": "ImageObject",
                url: "https://www.pawtenant.com/logo.png",
              },
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://www.pawtenant.com/" },
              {
                "@type": "ListItem",
                position: 2,
                name: "Everything You Need to Know About Obtaining an ESA Letter Online",
                item: CANONICAL,
              },
            ],
          }),
        }}
      />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-24">
        <div className="absolute inset-0">
          <img
            src={ASSETS.heroImg}
            alt="A close-up portrait of a calm dog looking away — emotional support animals provide comfort that supports housing accommodation requests"
            className="w-full h-full object-cover object-center"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20"></div>
        </div>
        <div className="relative w-full max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-400 mb-4">
              Complete Guide · Updated 2026
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Everything You Need to Know About Obtaining an ESA Letter Online
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              A complete, plain-English guide to legitimate ESA letters: who may qualify, how online evaluations actually work with licensed mental health professionals, what a housing-valid letter looks like, and how to spot the sketchy services that get people in trouble.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-heart-line"></i>
                Start Free Assessment
              </Link>
              <a
                href="#how-online-evaluations-work"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-white/15 border border-white/30 text-white font-semibold rounded-md hover:bg-white/25 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-down-line"></i>
                See How It Works
              </a>
            </div>
            <ul className="flex flex-wrap items-center gap-6 mt-8">
              {heroBenefits.map((b) => (
                <li key={b} className="flex items-center gap-2 text-white/80 text-xs">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-check-line text-orange-400"></i>
                  </div>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* On-this-page navigation */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-3">In This Guide</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
            <li><a href="#what-is-an-esa-letter" className="hover:text-orange-500 cursor-pointer">What an ESA letter is</a></li>
            <li><a href="#who-qualifies" className="hover:text-orange-500 cursor-pointer">Who may qualify</a></li>
            <li><a href="#how-online-evaluations-work" className="hover:text-orange-500 cursor-pointer">How online evaluations work</a></li>
            <li><a href="#legitimacy-signals" className="hover:text-orange-500 cursor-pointer">Legitimacy signals</a></li>
            <li><a href="#red-flags" className="hover:text-orange-500 cursor-pointer">Red flags to avoid</a></li>
            <li><a href="#housing-context" className="hover:text-orange-500 cursor-pointer">Housing &amp; FHA context</a></li>
            <li><a href="#why-pawtenant" className="hover:text-orange-500 cursor-pointer">Why PawTenant</a></li>
            <li><a href="#faq" className="hover:text-orange-500 cursor-pointer">FAQs</a></li>
          </ul>
        </div>
      </section>

      {/* What Is An ESA Letter */}
      <section id="what-is-an-esa-letter" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">The Basics</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">What an ESA Letter Is — and What It Isn&apos;t</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                An <strong>ESA letter</strong> (emotional support animal letter) is a written recommendation from a state-licensed mental health professional. It states that you have a qualifying mental or emotional condition and that an emotional support animal is part of your support plan. It is most commonly used when requesting a reasonable accommodation in housing.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                It is <strong>not</strong> a license, an ID card, a vest, a certificate, or a registry entry. There is no official US registry for ESAs. The letter from a licensed clinician — on letterhead, signed, dated, and tied to a real evaluation — is what carries weight when you make a housing accommodation request.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                A legitimate online ESA letter is identical in form and substance to one obtained at an in-person clinic. The only difference is that the evaluation happens by telehealth — which is widely accepted as an appropriate way for licensed professionals to assess clients in 2026.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/how-to-get-esa-letter"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  Step-by-step ESA letter guide
                  <i className="ri-arrow-right-line"></i>
                </Link>
                <Link
                  to="/housing-rights-esa"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  Housing rights and your ESA
                  <i className="ri-arrow-right-line"></i>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {overviewPoints.map((p) => (
                <div key={p.title} className="bg-orange-50/60 border border-orange-100 rounded-xl p-5">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-orange-100 mb-3">
                    <i className={`${p.icon} text-orange-500`}></i>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1.5">{p.title}</h3>
                  <p className="text-gray-600 text-xs leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What a Housing-Valid ESA Letter Looks Like */}
      <section id="what-a-letter-looks-like" className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">What It Looks Like</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">What a Housing-Valid ESA Letter Looks Like</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                A legitimate ESA letter is plain, professional documentation — not flashy. It is issued on the licensed clinician&apos;s official letterhead and includes the elements housing providers actually look for.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3 text-gray-700 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0 mt-0.5">
                    <i className="ri-check-line text-orange-500 text-xs"></i>
                  </span>
                  Clinician&apos;s name, credentials, license number, and state
                </li>
                <li className="flex items-start gap-3 text-gray-700 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0 mt-0.5">
                    <i className="ri-check-line text-orange-500 text-xs"></i>
                  </span>
                  Statement of a qualifying disability-related need
                </li>
                <li className="flex items-start gap-3 text-gray-700 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0 mt-0.5">
                    <i className="ri-check-line text-orange-500 text-xs"></i>
                  </span>
                  Recommendation that an emotional support animal is part of your support plan
                </li>
                <li className="flex items-start gap-3 text-gray-700 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0 mt-0.5">
                    <i className="ri-check-line text-orange-500 text-xs"></i>
                  </span>
                  Date of issue and clinician&apos;s signature
                </li>
              </ul>
              <p className="text-gray-500 text-xs leading-relaxed">
                Example shown is a representative format. Your letter will be customized by your licensed clinician.
              </p>
            </div>
            <div className="order-1 lg:order-2 flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                <div className="absolute -inset-4 bg-gradient-to-br from-orange-100/60 to-amber-100/40 rounded-3xl blur-xl"></div>
                <img
                  src={ASSETS.esaLetterMockup}
                  alt="Example of a legitimate ESA letter from a licensed mental health professional showing letterhead, license number, and signature"
                  className="relative w-full h-auto rounded-2xl shadow-xl border border-gray-100"
                  loading="lazy"
                  width={540}
                  height={960}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who Qualifies */}
      <section id="who-qualifies" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Eligibility</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Who May Qualify for an ESA Letter?</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              Eligibility is determined during the evaluation by a licensed mental health professional. Common DSM-5 conditions our network evaluates include:
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-10">
            {qualifyingConditions.map((c) => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-orange-50">
                  <i className={`${c.icon} text-orange-500 text-lg`}></i>
                </div>
                <span className="text-gray-800 text-xs font-semibold">{c.label}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-xs">
            Don&apos;t see your situation listed? <Link to="/assessment" className="text-orange-500 font-semibold hover:underline cursor-pointer">Start your free assessment</Link> — eligibility is decided during the licensed evaluation, not before it.
          </p>
        </div>
      </section>

      {/* How Online Evaluations Work */}
      <section id="how-online-evaluations-work" className="py-20 bg-[#fdf6ee]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">The Process</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How Online ESA Evaluations Actually Work</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              No magic instant approvals. Just a real, licensed clinical evaluation — done by telehealth.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {onlineProcessSteps.map((step) => (
                <div key={step.number} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 flex items-center justify-center rounded-full bg-orange-500">
                      <i className={`${step.icon} text-white text-xl`}></i>
                    </div>
                    <span className="bg-orange-50 text-orange-500 text-xs font-bold rounded-full px-2.5 py-1">Step {step.number}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">{step.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="lg:sticky lg:top-24">
              <div className="relative w-full max-w-xs mx-auto">
                <div className="absolute -inset-3 bg-gradient-to-br from-orange-100/60 to-amber-100/40 rounded-[2rem] blur-xl"></div>
                <div className="relative rounded-[2rem] overflow-hidden shadow-xl border-[6px] border-gray-900 bg-gray-900">
                  <video
                    src={ASSETS.assessmentClip1}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={ASSETS.petCloseUp}
                    className="w-full h-auto block"
                    aria-label="Preview of the PawTenant online ESA assessment flow"
                  />
                </div>
                <p className="text-center text-xs text-gray-500 mt-4">A quick look at the online assessment.</p>
              </div>
            </div>
          </div>
          <div className="text-center mt-12">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-arrow-right-line"></i>
              Begin Your Free Assessment
            </Link>
            <p className="text-gray-400 text-xs mt-3">5–10 minutes · Confidential · No charge for the assessment itself</p>
          </div>
        </div>
      </section>

      {/* Legitimacy Signals */}
      <section id="legitimacy-signals" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">What to Look For</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Signs of a Legitimate Online ESA Letter Provider</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              These are the simple, practical signals that separate a real clinical service from a sketchy form-and-checkout site.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {legitimacySignals.map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-5 border border-orange-100 flex items-start gap-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-orange-50 flex-shrink-0">
                  <i className={`${item.icon} text-orange-500`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Red Flags */}
      <section id="red-flags" className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-rose-500 mb-3">Buyer Beware</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Red Flags of Sketchy Online ESA Sites</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              If a site shows any of these, treat it as a strong warning. A letter from a sketchy site can fail when your housing provider scrutinizes it.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {redFlags.map((rf) => (
              <div key={rf.title} className="rounded-xl p-5 border border-rose-100 bg-rose-50/40">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-rose-100">
                    <i className={`${rf.icon} text-rose-500`}></i>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{rf.title}</h3>
                </div>
                <p className="text-gray-600 text-xs leading-relaxed">{rf.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 max-w-2xl mx-auto bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
            <p className="text-gray-700 text-sm leading-relaxed">
              <strong>Plain rule:</strong> if a site does not put a real licensed clinician on a real call with you, it is not a real ESA letter service. PawTenant&apos;s network is built around licensed mental health professionals — see our process below.
            </p>
          </div>
        </div>
      </section>

      {/* Housing Context */}
      <section id="housing-context" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Housing Context</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">ESA Letters and Housing Accommodation</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                ESA letters are primarily relevant in the housing context. They support a written request for a reasonable accommodation under the Fair Housing Act, which addresses how housing providers handle requests from tenants with disability-related needs.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Housing providers typically may ask for documentation that there is a disability-related need for the animal. They generally are not expected to demand specific medical records or particular diagnostic details. PawTenant supports privacy-safe verification of the licensed clinician&apos;s credentials when a housing provider asks to confirm the letter.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/housing-rights-esa"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  Full housing rights guide
                  <i className="ri-arrow-right-line"></i>
                </Link>
                <Link
                  to="/explore-esa-letters-all-states"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  Find your state
                  <i className="ri-arrow-right-line"></i>
                </Link>
                <Link
                  to="/esa-letter-cost"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  ESA letter cost
                  <i className="ri-arrow-right-line"></i>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {housingContext.map((p) => (
                <div key={p.title} className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 mb-3">
                    <i className={`${p.icon} text-orange-500`}></i>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1.5">{p.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-6 max-w-3xl">
            This page is informational and not a substitute for legal advice. Specific protections, exceptions, and procedures vary by state and by housing type.
          </p>

          {/* Landlord verification screen */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-10 items-center bg-orange-50/40 border border-orange-100 rounded-3xl p-6 lg:p-10">
            <div className="lg:col-span-3 order-2 lg:order-1">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Landlord Verification</span>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Privacy-Safe Letter Verification for Housing Providers</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                When a housing provider asks to confirm an ESA letter, they can verify the licensed clinician&apos;s credentials through our secure verification page — without seeing any of your medical information. The clinician&apos;s name, license number, state, and license status are surfaced; nothing more.
              </p>
              <Link
                to="/ESA-letter-verification"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
              >
                See how letter verification works
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
            <div className="lg:col-span-2 order-1 lg:order-2 flex items-center justify-center">
              <div className="relative w-full max-w-[260px]">
                <div className="absolute -inset-3 bg-gradient-to-br from-orange-100/70 to-amber-100/40 rounded-[2rem] blur-xl"></div>
                <img
                  src={ASSETS.verificationScreen}
                  alt="Landlord verification screen showing privacy-safe ESA letter verification on PawTenant"
                  className="relative w-full h-auto rounded-2xl shadow-xl border border-gray-100"
                  loading="lazy"
                  width={540}
                  height={960}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ESA vs PSD callout */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-orange-50/80 to-amber-50/60 p-8 md:p-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Need Public-Access Rights?</span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">ESA Letter vs. PSD Letter — Which Do You Actually Need?</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-6">
              An ESA letter is mainly for housing. If your dog has been task-trained to perform specific actions related to a psychiatric disability — for example, interrupting panic episodes or grounding during dissociation — a Psychiatric Service Dog (PSD) letter may be more appropriate, with broader public-access considerations under the ADA.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/how-to-get-psd-letter"
                className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-service-line"></i>
                How to Get a PSD Letter
              </Link>
              <Link
                to="/all-about-service-dogs"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-orange-200 text-orange-600 font-semibold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-information-line"></i>
                All About Service Dogs
              </Link>
              <Link
                to="/service-animal-vs-esa"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-orange-200 text-orange-600 font-semibold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-scales-line"></i>
                Service Animal vs ESA
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why PawTenant */}
      <section id="why-pawtenant" className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">The PawTenant Difference</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Why People Choose PawTenant for Their Online ESA Letter</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Built around licensed mental health professionals, real evaluations, and clean documentation that holds up to housing-provider scrutiny.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {whyPawTenant.map((p) => (
              <div key={p.title} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50">
                    <i className={`${p.icon} text-orange-500`}></i>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{p.title}</h3>
                </div>
                <p className="text-gray-500 text-xs leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/no-risk-guarantee"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
            >
              Read our No-Risk Guarantee
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Pet emotional moment */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="rounded-3xl overflow-hidden">
              <img
                src={ASSETS.petBeagle}
                alt="A calm beagle resting indoors — companionship that supports daily wellbeing"
                className="w-full h-72 md:h-80 object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Why It Matters</span>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-tight">Your Animal Is Part of Your Daily Wellbeing</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                For many people, an emotional support animal is a quiet, steady part of getting through hard days — long before any housing question comes up. A legitimate ESA letter exists to make sure that support is not torn away by a no-pet policy.
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">
                That&apos;s why a real evaluation by a licensed mental health professional matters: the documentation you receive should reflect a real care relationship, not a checkout flow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-20 bg-orange-500 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://readdy.ai/api/search-image?query=abstract%20warm%20pattern%20texture%20subtle%20organic%20shapes%20soft%20warm%20orange%20tones%20minimal%20background%20design&width=1440&height=400&seq=esaonline-cta01&orientation=landscape"
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="relative w-full max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Start Your Online ESA Evaluation?</h2>
          <p className="text-white/85 text-sm leading-relaxed mb-8 max-w-xl mx-auto">
            Begin with a free 5-minute assessment. A licensed mental health professional in your state will reach out to schedule a real telehealth evaluation — no instant-approval shortcuts.
          </p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-white text-orange-500 font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <i className="ri-heart-line"></i>
            Start Free Assessment
          </Link>
          <p className="text-white/70 text-xs mt-4">No commitment · Confidential · Eligibility decided during the evaluation</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Common Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>
                    {faq.q}
                  </span>
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

      {/* Related Resources */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-sm font-bold text-gray-900 mb-6">Related Resources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { to: "/how-to-get-esa-letter", icon: "ri-heart-line", title: "How to Get an ESA Letter", desc: "Step-by-step guide to qualifying and applying." },
              { to: "/how-to-get-psd-letter", icon: "ri-service-line", title: "How to Get a PSD Letter", desc: "When you need broader public-access support under the ADA." },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", title: "Housing Rights & ESA", desc: "FHA-related context for accommodation requests." },
              { to: "/explore-esa-letters-all-states", icon: "ri-map-pin-2-line", title: "ESA Letters by State", desc: "State-specific information for all 50 states." },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-colors cursor-pointer group"
              >
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 group-hover:bg-orange-100 transition-colors flex-shrink-0">
                  <i className={`${link.icon} text-orange-500`}></i>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm mb-1">{link.title}</div>
                  <div className="text-gray-500 text-xs leading-relaxed">{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
