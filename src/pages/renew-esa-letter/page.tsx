import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import ExpiryChecker from "./components/ExpiryChecker";


const renewalPlans = [
  {
    name: "1 Pet",
    oneTime: "$100",
    annual: "$90",
    annualSavings: "Save $10/yr",
    pets: "Renew for 1 emotional support animal",
    popular: false,
    features: [
      "Updated ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "New Issue Date — Valid for 1 Year",
      "Licensed Professional Signature",
      "PDF Delivery via Email",
      "Landlord Verification Support",
    ],
    subscriptionExtras: [
      "Auto-Renewal 30 Days Before Expiry",
      "Priority Scheduling — No Waitlist",
      "Cancel Anytime",
    ],
  },
  {
    name: "2 Pets",
    oneTime: "$115",
    annual: "$94",
    annualSavings: "Save $21/yr",
    pets: "Renew for up to 2 emotional support animals",
    popular: true,
    features: [
      "Updated ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "New Issue Date — Valid for 1 Year",
      "Licensed Professional Signature",
      "PDF Delivery via Email",
      "Landlord Verification Support",
      "Covers Both Pets on One Letter",
    ],
    subscriptionExtras: [
      "Auto-Renewal 30 Days Before Expiry",
      "Priority Scheduling — No Waitlist",
      "Cancel Anytime",
    ],
  },
  {
    name: "3 Pets",
    oneTime: "$135",
    annual: "$109",
    annualSavings: "Save $26/yr",
    pets: "Renew for up to 3 emotional support animals",
    popular: false,
    features: [
      "Updated ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "New Issue Date — Valid for 1 Year",
      "Licensed Professional Signature",
      "PDF Delivery via Email",
      "Landlord Verification Support",
      "Covers All 3 Pets on One Letter",
    ],
    subscriptionExtras: [
      "Auto-Renewal 30 Days Before Expiry",
      "Priority Scheduling — No Waitlist",
      "Cancel Anytime",
    ],
  },
];

const renewalSteps = [
  {
    step: "01",
    icon: "ri-file-list-3-line",
    title: "Complete a Short Assessment",
    desc: "Answer a brief questionnaire about your current mental health situation. Takes under 5 minutes and helps your licensed professional prepare for your session.",
  },
  {
    step: "02",
    icon: "ri-video-chat-line",
    title: "Meet with a Licensed Therapist",
    desc: "Connect via secure video or phone call with a licensed mental health professional in your state. They'll review your condition and confirm your ongoing need for an ESA.",
  },
  {
    step: "03",
    icon: "ri-file-check-2-line",
    title: "Receive Your Renewed Letter",
    desc: "Your updated ESA letter — with a new issue date and your therapist's current credentials — is delivered to your inbox within 24 hours. Ready to use immediately.",
  },
];

const comparisonRows = [
  { feature: "Housing protection under FHA", current: true, expired: false },
  { feature: "Exempt from pet fees & deposits", current: true, expired: false },
  { feature: "ESA override for no-pet buildings", current: true, expired: false },
  { feature: "University dorm accommodation", current: true, expired: false },
  { feature: "Landlord verification support", current: true, expired: false },
  { feature: "Legally enforceable", current: true, expired: false },
];

const renewalFaqs = [
  {
    q: "How often do I need to renew my ESA letter?",
    a: "ESA letters are valid for 12 months from the date of issue. Most landlords and housing providers require a letter dated within the last year. We recommend renewing 30 days before your current letter expires to avoid any gap in protection.",
  },
  {
    q: "Can I use the same ESA letter from last year?",
    a: "No — an ESA letter older than 12 months is generally not accepted by landlords and housing providers. An expired letter does not legally protect your housing rights under the Fair Housing Act. You must obtain a current letter from a licensed mental health professional.",
  },
  {
    q: "Is the renewal process different from getting my first letter?",
    a: "The process is very similar but often shorter. Your licensed professional will review your current mental health status and confirm your ongoing need for an ESA. Since you've been through the process before, consultations typically take less time.",
  },
  {
    q: "Does my ESA change between renewals?",
    a: "No — if your ESA is the same animal, your renewed letter will cover the same animal. If you have a new ESA or need to add an animal, simply select the appropriate plan (1, 2, or 3 pets) during your renewal assessment.",
  },
  {
    q: "What if I moved to a new state — do I need a renewal?",
    a: "If your existing letter is still within its 12-month validity window, it remains valid in your new state. However, for your next renewal, your letter must be issued by a licensed mental health professional who is licensed in your current state.",
  },
  {
    q: "My landlord just asked for an updated letter. How quickly can I get one?",
    a: "Most PawTenant clients receive their renewed ESA letter within 24 hours of completing their assessment. If you need it urgently, reach out to our support team after completing your assessment and we'll prioritize your case.",
  },
  {
    q: "Is the renewal covered by PawTenant's money-back guarantee?",
    a: "Yes. PawTenant's 100% money-back guarantee applies to renewals just as it does to first-time letters. If your renewed letter is denied by a housing provider for a covered reason, we will provide a full refund.",
  },
];

const schemaFaqData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": renewalFaqs.map((faq) => ({
    "@type": "Question",
    "name": faq.q,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.a,
    },
  })),
});

const serviceSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "ESA Letter Renewal",
  "description": "Renew your Emotional Support Animal letter with a licensed mental health professional. FHA-compliant, valid for 1 year, delivered within 24 hours.",
  "provider": {
    "@type": "Organization",
    "name": "PawTenant",
    "url": "https://www.pawtenant.com",
  },
  "offers": [
    { "@type": "Offer", "name": "1 Pet Renewal", "price": "100", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "2 Pets Renewal", "price": "115", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "3 Pets Renewal", "price": "135", "priceCurrency": "USD" },
  ],
  "url": "https://www.pawtenant.com/renew-esa-letter",
});

interface SelectedPlan {
  name: string;
  petTier: "1" | "2" | "3";
  billingCycle: "onetime" | "annual";
  price: string;
}

export default function RenewESALetterPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<"onetime" | "annual">("annual");
  const [checkoutPlan, setCheckoutPlan] = useState<SelectedPlan | null>(null);

  const openCheckout = (plan: typeof renewalPlans[0], cycle: "onetime" | "annual") => {
    const petTier = plan.name === "1 Pet" ? "1" : plan.name === "2 Pets" ? "2" : "3";
    setCheckoutPlan({
      name: plan.name,
      petTier: petTier as "1" | "2" | "3",
      billingCycle: cycle,
      price: cycle === "annual" ? plan.annual : plan.oneTime,
    });
  };

  const scrollToPricing = () => {
    document.getElementById("renewal-pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <title>Renew Your ESA Letter in 2026 — Fast &amp; FHA-Compliant | PawTenant</title>
      <meta name="description" content="ESA letters expire after 12 months. Renew your emotional support animal letter with a licensed therapist in 2026. Same-day delivery, 100% money-back guarantee. From $100." />
      <meta name="keywords" content="renew ESA letter, ESA letter renewal, emotional support animal letter renewal, expired ESA letter, ESA letter 2026 renewal" />
      <link rel="canonical" href="https://www.pawtenant.com/renew-esa-letter" />
      <meta property="og:title" content="Renew Your ESA Letter 2026 — Fast, Legal &amp; FHA-Compliant | PawTenant" />
      <meta property="og:description" content="Keep your ESA housing rights active. Renew your emotional support animal letter with a licensed mental health professional. From $100, delivered within 24 hours." />
      <meta property="og:url" content="https://www.pawtenant.com/renew-esa-letter" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Renew Your ESA Letter 2026 — Stay Protected | PawTenant" />
      <meta name="twitter:description" content="ESA letters expire after 12 months. Renew with a licensed therapist from $100. Same-day delivery, FHA-compliant, 100% money-back guarantee." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaFaqData }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serviceSchema }} />

      {/* Urgency Ribbon */}
      <div className="w-full bg-red-600 text-white py-2.5 text-xs font-semibold tracking-wide z-50 px-4">
        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-center">
          <i className="ri-alarm-warning-line text-yellow-300 flex-shrink-0"></i>
          <span>ESA letters expire after 12 months — an expired letter gives your landlord the right to deny your animal.</span>
          <Link to="/assessment" className="whitespace-nowrap underline font-bold hover:text-yellow-200 transition-colors cursor-pointer">
            Renew yours now →
          </Link>
        </div>
      </div>

      <SharedNavbar />

      {/* ===== HERO ===== */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=licensed%20therapist%20professional%20online%20consultation%20laptop%20telehealth%20mental%20health%20session%20person%20at%20home%20cozy%20desk%20warm%20ambient%20lighting%20calm%20neutral%20tones%20professional%20healthcare%202026&width=1440&height=680&seq=renewhero01&orientation=landscape"
            alt="ESA Letter Renewal consultation"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/40"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-start gap-10 lg:gap-16">
            {/* Left — Text */}
            <div className="flex-1 max-w-xl">
              <div className="flex items-center gap-2 mb-5">
                <Link to="/" className="text-white/60 hover:text-white text-xs transition-colors">Home</Link>
                <i className="ri-arrow-right-s-line text-white/40 text-xs"></i>
                <span className="text-white/80 text-xs">Renew ESA Letter</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 rounded-full px-4 py-1.5 mb-5">
                <i className="ri-refresh-line text-orange-400 text-xs"></i>
                <span className="text-orange-300 text-xs font-semibold tracking-wide uppercase">Annual Renewal Service</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
                Renew Your ESA Letter —<br />
                <span className="text-orange-400">Stay Protected in 2026</span>
              </h1>
              <p className="text-white/80 text-sm leading-relaxed mb-8 max-w-lg">
                ESA letters expire after 12 months. An expired letter gives landlords the right to deny your accommodation. Keep your housing rights active with a renewed FHA-compliant letter — delivered within 24 hours.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={scrollToPricing}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-refresh-line"></i>
                  Renew My ESA Letter — From $100
                </button>
                <a
                  href="#how-it-works"
                  className="whitespace-nowrap inline-flex items-center gap-2 text-white/80 text-sm hover:text-white transition-colors cursor-pointer"
                >
                  See how it works
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-arrow-down-line text-sm"></i>
                  </div>
                </a>
              </div>
              <div className="flex flex-wrap gap-5 mt-8">
                {[
                  { icon: "ri-time-line", text: "24-hour delivery" },
                  { icon: "ri-shield-check-line", text: "100% money-back guarantee" },
                  { icon: "ri-user-star-line", text: "Licensed therapists only" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2 text-white/70 text-xs">
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className={`${item.icon} text-orange-400`}></i>
                    </div>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Expiry Checker Widget */}
            <div className="w-full lg:w-auto lg:min-w-[360px] flex-shrink-0">
              <ExpiryChecker />
            </div>
          </div>
        </div>
      </section>

      {/* ===== EXPIRY WARNING ===== */}
      <section className="py-12 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Why Renewal Matters</span>
            <h2 className="text-3xl font-bold text-gray-900">What Happens When Your ESA Letter Expires</h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
              An expired ESA letter is legally equivalent to no letter at all. Here's what you risk if you let your letter lapse.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {[
              {
                icon: "ri-home-4-line",
                color: "bg-red-50 text-red-500",
                title: "Landlords Can Deny Your ESA",
                desc: "Without a current letter dated within 12 months, landlords are within their rights to refuse your ESA accommodation request — even if they previously approved it.",
              },
              {
                icon: "ri-money-dollar-circle-line",
                color: "bg-amber-50 text-amber-500",
                title: "Pet Fees Can Be Charged Again",
                desc: "An expired letter means your ESA loses its protected status. Landlords can legally start charging pet deposits, monthly pet rent, or move-in pet fees.",
              },
              {
                icon: "ri-error-warning-line",
                color: "bg-orange-50 text-orange-500",
                title: "Risk of Lease Violation Notice",
                desc: "If your landlord discovers your letter has expired during an inspection or routine review, they may issue a lease violation notice requiring you to remove your animal.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-100 p-6">
                <div className={`w-10 h-10 flex items-center justify-center ${item.color} rounded-xl mb-4`}>
                  <i className={`${item.icon} text-xl`}></i>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Timeline visual */}
          <div className="mt-10 md:mt-12 max-w-4xl mx-auto bg-[#fdf8f3] rounded-2xl border border-orange-100 p-6 md:p-8 overflow-x-auto">
            <h3 className="text-sm font-bold text-gray-900 mb-6 text-center">Your ESA Letter Validity Timeline</h3>
            <div className="flex items-start min-w-[500px]">
              {[
                { label: "Letter Issued", sub: "Day 1", color: "bg-orange-500", textColor: "text-orange-600" },
                { label: "6 Months", sub: "Still Valid", color: "bg-orange-400", textColor: "text-orange-500" },
                { label: "Renew Now", sub: "Month 11", color: "bg-amber-400", textColor: "text-amber-600" },
                { label: "Expires!", sub: "Month 12", color: "bg-red-400", textColor: "text-red-600" },
                { label: "No Protection", sub: "After 12 months", color: "bg-red-600", textColor: "text-red-700" },
              ].map((item, i, arr) => (
                <div key={item.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-3.5 h-3.5 rounded-full ${item.color} mb-2 flex-shrink-0`}></div>
                    <p className={`text-xs font-bold ${item.textColor} text-center whitespace-nowrap`}>{item.label}</p>
                    <p className="text-xs text-gray-400 text-center mt-0.5">{item.sub}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="h-0.5 flex-1 bg-gradient-to-r from-orange-300 to-red-300 mx-1 mb-5"></div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-500 mt-4">
              <strong className="text-amber-600">Best practice:</strong> Start your renewal at month 11 — 30 days before expiration — to ensure zero gap in protection.
            </p>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-14 md:py-16 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Simple Process</span>
            <h2 className="text-3xl font-bold text-gray-900">How ESA Letter Renewal Works</h2>
            <p className="text-gray-500 text-sm mt-3 max-w-lg mx-auto leading-relaxed">
              The renewal process is fast, straightforward, and completely online. Most clients finish in under an hour.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {renewalSteps.map((step, i) => (
              <div key={step.step} className="relative">
                {i < renewalSteps.length - 1 && (
                  <div className="absolute top-8 left-1/2 w-full h-0.5 bg-orange-200"></div>
                )}
                <div className="flex flex-col items-center text-center relative">
                  <div className="w-16 h-16 flex items-center justify-center bg-white rounded-2xl border-2 border-orange-200 mb-5 relative z-10">
                    <i className={`${step.icon} text-orange-500 text-2xl`}></i>
                  </div>
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">Step {step.step}</span>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <button
              onClick={scrollToPricing}
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-refresh-line"></i>
              Start My Renewal
            </button>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON TABLE ===== */}
      <section className="py-14 md:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Side by Side</span>
            <h2 className="text-3xl font-bold text-gray-900">Current Letter vs. Expired Letter</h2>
            <p className="text-gray-500 text-sm mt-3 max-w-md mx-auto">See exactly what protections you keep — and what you lose — based on your letter's status.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <div className="min-w-[480px]">
            {/* Header */}
            <div className="grid grid-cols-3 bg-gray-50">
              <div className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wide">Protection</div>
              <div className="p-4 text-center bg-orange-50 border-l border-orange-200">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-checkbox-circle-fill text-orange-500"></i>
                  </div>
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Current Letter</span>
                </div>
                <p className="text-xs text-gray-400">Updated within 12 months</p>
              </div>
              <div className="p-4 text-center bg-red-50 border-l border-red-100">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-close-circle-fill text-red-400"></i>
                  </div>
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Expired Letter</span>
                </div>
                <p className="text-xs text-gray-400">Older than 12 months</p>
              </div>
            </div>
            {/* Rows */}
            {comparisonRows.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
              >
                <div className="p-4 text-xs text-gray-700 font-medium flex items-center">{row.feature}</div>
                <div className="p-4 flex items-center justify-center border-l border-orange-100 bg-orange-50/30">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <i className="ri-checkbox-circle-fill text-orange-500 text-base"></i>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-center border-l border-red-50 bg-red-50/30">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <i className="ri-close-circle-fill text-red-400 text-base"></i>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
          <div className="mt-6 text-center">
            <button
              onClick={scrollToPricing}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-refresh-line"></i>
              Renew Now — Keep My Protections
            </button>
          </div>
        </div>
      </section>

      {/* ===== SUBSCRIPTION BANNER ===== */}
      <section className="py-14 md:py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/30 rounded-full px-4 py-1.5 mb-5">
                <i className="ri-loop-right-line text-orange-400 text-xs"></i>
                <span className="text-orange-300 text-xs font-semibold uppercase tracking-widest">Annual Subscription</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
                Stay Compliant —<br />
                <span className="text-orange-400">Renew Yearly, Automatically</span>
              </h2>
              <p className="text-white/70 text-sm leading-relaxed mb-7 max-w-lg">
                Your ESA letter expires every 12 months — and forgetting to renew puts your housing rights at risk. Our annual subscription handles renewal for you: 30 days before expiration we schedule your consultation, complete your updated letter, and deliver it to your inbox. Zero gaps. Zero stress.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { icon: "ri-notification-3-line", title: "Auto-Reminder", desc: "Get notified 30 days before your letter expires" },
                  { icon: "ri-calendar-check-line", title: "Pre-Scheduled Consult", desc: "Your therapist appointment is booked automatically" },
                  { icon: "ri-file-check-line", title: "Letter Delivered", desc: "Updated letter in your inbox before the old one expires" },
                  { icon: "ri-money-dollar-circle-line", title: "Members Save More", desc: "Annual subscribers pay less than one-time renewal clients" },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-500/20 rounded-lg flex-shrink-0 mt-0.5">
                      <i className={`${item.icon} text-orange-400 text-sm`}></i>
                    </div>
                    <div>
                      <p className="text-white text-xs font-bold mb-0.5">{item.title}</p>
                      <p className="text-white/50 text-xs leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openCheckout(renewalPlans[0], "annual")}
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-loop-right-line"></i>
                Start Annual Subscription — From $90/yr
              </button>
              <p className="text-white/40 text-xs mt-3">Cancel anytime &nbsp;·&nbsp; No contracts &nbsp;·&nbsp; 100% money-back guarantee</p>
            </div>

            {/* Visual comparison card */}
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-5 font-semibold">Cost Comparison — 1 Pet</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div>
                      <p className="text-white text-sm font-bold">One-Time Renewal</p>
                      <p className="text-white/50 text-xs">Pay each time you remember</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white text-xl font-bold">$100</p>
                      <p className="text-white/40 text-xs">per renewal</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl relative">
                    <div className="absolute -top-2.5 right-4">
                      <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">Best Value</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-bold">Annual Subscription</p>
                      <p className="text-orange-300 text-xs">Auto-renew, never miss a deadline</p>
                    </div>
                    <div className="text-right">
                      <p className="text-orange-400 text-xl font-bold">$90</p>
                      <p className="text-white/40 text-xs">per year</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 py-2">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-arrow-down-line text-orange-400 text-xs"></i>
                    </div>
                    <p className="text-orange-400 text-xs font-bold">Save $21 every year with a subscription</p>
                  </div>
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-3 font-semibold">What subscribers say</p>
                <div className="space-y-3">
                  {[
                    { name: "Lisa K., Florida", text: "Set it and forget it — my letter is always current and my landlord never has to ask twice." },
                    { name: "DeShawn P., Georgia", text: "Saved $20 and never had to worry about it expiring during my lease renewal. Worth it." },
                  ].map((t) => (
                    <div key={t.name} className="border-l-2 border-orange-500/40 pl-3">
                      <p className="text-white/70 text-xs italic leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                      <p className="text-white/40 text-xs mt-1">{t.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="renewal-pricing" className="py-14 md:py-16 bg-orange-50">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Renewal Pricing</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple Renewal Pricing — No Hidden Fees</h2>
            <p className="text-gray-500 text-sm max-w-lg mx-auto leading-relaxed mb-7">
              Choose between a one-time renewal or an annual subscription that keeps you protected automatically.
            </p>
            {/* Toggle */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-white border border-gray-200 rounded-2xl sm:rounded-full p-1 gap-1 w-full max-w-xs mx-auto sm:w-auto sm:max-w-none">
              <button
                onClick={() => setBillingCycle("onetime")}
                className={`whitespace-nowrap px-4 sm:px-5 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-xs font-bold transition-all cursor-pointer ${billingCycle === "onetime" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                One-Time Renewal
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`whitespace-nowrap flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-xs font-bold transition-all cursor-pointer ${billingCycle === "annual" ? "bg-orange-500 text-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                Annual Subscription
                {billingCycle !== "annual" && (
                  <span className="bg-orange-100 text-orange-600 text-xs px-2.5 py-1 rounded-full whitespace-nowrap">Save up to 21%</span>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 max-w-5xl mx-auto">
            {renewalPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl border-2 p-8 flex flex-col transition-all ${plan.popular ? "border-orange-500" : "border-gray-200"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">Most Popular</span>
                  </div>
                )}
                {billingCycle === "annual" && (
                  <div className="absolute top-4 right-4">
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">{plan.annualSavings}</span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-gray-900 font-bold text-base mb-1">{plan.name} Renewal</h3>
                  <p className="text-gray-400 text-xs mb-3">{plan.pets}</p>
                  <div className="flex items-end gap-1.5">
                    <span className="text-4xl font-extrabold text-gray-900">
                      {billingCycle === "annual" ? plan.annual : plan.oneTime}
                    </span>
                    <span className="text-gray-400 text-sm mb-1.5">
                      {billingCycle === "annual" ? "/ year" : "one-time"}
                    </span>
                  </div>
                  {billingCycle === "annual" && (
                    <p className="text-xs text-gray-400 mt-1">
                      vs. <span className="line-through">{plan.oneTime}</span> one-time
                    </p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500 text-base"></i>
                      </div>
                      {f}
                    </li>
                  ))}
                  {billingCycle === "annual" && plan.subscriptionExtras.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-loop-right-line text-green-500 text-base"></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => openCheckout(plan, billingCycle)}
                  className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${plan.popular ? "bg-orange-500 text-white hover:bg-orange-600" : "border-2 border-orange-500 text-orange-500 hover:bg-orange-50"}`}
                >
                  {billingCycle === "annual" ? `Subscribe — ${plan.annual}/yr` : `Renew for ${plan.oneTime}`}
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-shield-check-line text-orange-500"></i>
              </div>
              <strong>100% Money-Back Guarantee</strong> — If your renewed letter is rejected, you pay nothing.
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHY PAWTENANT FOR RENEWAL ===== */}
      <section className="py-14 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14 items-center">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Trusted by Thousands</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Why Renew With PawTenant?</h2>
              <div className="space-y-5">
                {[
                  {
                    icon: "ri-user-star-line",
                    title: "Real Licensed Therapists — Not Algorithms",
                    desc: "Every renewal involves a live consultation with a licensed mental health professional in your state. No auto-generated letters, no shortcuts.",
                  },
                  {
                    icon: "ri-map-pin-2-line",
                    title: "State-Compliant Letters in All 50 States",
                    desc: "Our network of LMHPs covers all 50 states including California (AB 468) and Florida — where specific state rules apply to renewal letters.",
                  },
                  {
                    icon: "ri-time-line",
                    title: "24-Hour Turnaround, Every Time",
                    desc: "Complete your assessment today, speak with your therapist, and receive your renewed letter in your inbox — all within 24 hours.",
                  },
                  {
                    icon: "ri-refresh-line",
                    title: "Returning Client Priority",
                    desc: "Returning PawTenant clients get expedited scheduling. Because you've been through the process before, your renewal consultation is typically shorter.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0 mt-0.5">
                      <i className={`${item.icon} text-orange-500`}></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">{item.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden h-[450px]">
              <img
                src="https://readdy.ai/api/search-image?query=happy%20person%20sitting%20at%20home%20desk%20laptop%20smiling%20just%20received%20important%20document%20relief%20satisfaction%20pet%20dog%20nearby%20cozy%20warm%20home%20office%20emotional%20support%20animal%20renewal%20approved&width=700&height=500&seq=renewwhy02&orientation=portrait"
                alt="Happy ESA letter renewal client"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-12 md:py-14 bg-[#fdf8f3]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">What Our Renewal Clients Say</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {[
              {
                name: "Amanda R.",
                location: "California",
                text: "I forgot to renew until my landlord asked. PawTenant had my new letter in 18 hours — literally saved my lease. The process was even faster the second time.",
                stars: 5,
              },
              {
                name: "James T.",
                location: "New York",
                text: "Was nervous my NY landlord would reject it but they verified everything and accepted it immediately. PawTenant's letters are clearly legit. This was my second renewal.",
                stars: 5,
              },
              {
                name: "Priya M.",
                location: "Texas",
                text: "The online consultation was quick — maybe 20 minutes total. Got my updated letter same evening. My property manager didn't even notice the old one expired.",
                stars: 5,
              },
            ].map((t) => (
              <div key={t.name} className="bg-white rounded-xl p-5 border border-gray-100">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <div key={i} className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-star-fill text-amber-400 text-xs"></i>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mb-4 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-full flex-shrink-0">
                    <i className="ri-user-line text-orange-500 text-xs"></i>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">FAQ</span>
            <h2 className="text-3xl font-bold text-gray-900">Renewal Questions Answered</h2>
          </div>
          <div className="space-y-3">
            {renewalFaqs.map((faq, i) => (
              <div key={i} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold pr-4 ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 border-t border-gray-50">
                    <p className="text-sm text-gray-500 leading-relaxed pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INTERNAL LINKS ===== */}
      <section className="py-10 bg-[#fdf8f3]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-sm font-bold text-gray-700 mb-5 text-center">Related Resources</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: "How to Get an ESA Letter", to: "/how-to-get-esa-letter" },
              { label: "ESA Housing Rights", to: "/housing-rights-esa" },
              { label: "ESA Letter Cost", to: "/esa-letter-cost" },
              { label: "ESA for College Students", to: "/college-pet-policy" },
              { label: "ESA Laws by State", to: "/explore-esa-letters-all-states" },
              { label: "Frequently Asked Questions", to: "/faqs" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="whitespace-nowrap px-4 py-2 bg-white border border-gray-200 text-xs text-gray-600 rounded-full hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-orange-100 rounded-2xl mx-auto mb-5">
            <i className="ri-refresh-line text-orange-500 text-3xl"></i>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Don&apos;t Let Your ESA Protection Lapse</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Renew your ESA letter today and stay fully protected under the Fair Housing Act. Takes less than 24 hours — and your landlord will never know there was a gap.
          </p>
          <button
            onClick={scrollToPricing}
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-refresh-line"></i>
            Renew My ESA Letter — From $100
          </button>
          <p className="text-xs text-gray-400 mt-4">100% money-back guarantee &nbsp;·&nbsp; Same-day delivery &nbsp;·&nbsp; Licensed therapists</p>
        </div>
      </section>

      <SharedFooter />

      {/* Checkout temporarily disabled — payment system being upgraded */}
      {checkoutPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCheckoutPlan(null)}>
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full mx-auto mb-4">
              <i className="ri-tools-line text-amber-600 text-2xl"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Payment System Maintenance</h3>
            <p className="text-sm text-gray-500 mb-6">We&apos;re upgrading our payment system. Please call us to complete your renewal.</p>
            <a href="tel:+14099655885" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 cursor-pointer">
              <i className="ri-phone-line"></i>Call 409-965-5885
            </a>
            <button onClick={() => setCheckoutPlan(null)} className="block mt-3 text-xs text-gray-400 hover:text-gray-600 mx-auto cursor-pointer">Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
