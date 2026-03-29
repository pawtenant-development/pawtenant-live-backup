import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

const guarantees = [
  {
    icon: "ri-user-unfollow-line",
    title: "Deemed Ineligible After Consultation",
    desc: "If our licensed mental health professional determines you do not qualify for an ESA letter after your consultation, you will receive a full and immediate refund — no questions asked, no hassle.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Landlord Unlawfully Denies Your ESA Letter",
    desc: "If your landlord refuses to honor your valid PawTenant ESA letter and a HUD complaint has been filed confirming unlawful denial, we will refund your full purchase price.",
  },
];

const steps = [
  { step: "01", title: "Contact Our Support Team", desc: "Reach out to us at hello@pawtenant.com or call (409) 965-5885 within 30 days of your letter issuance." },
  { step: "02", title: "Provide Documentation", desc: "Share relevant documentation (e.g., landlord denial notice, HUD complaint reference number)." },
  { step: "03", title: "Receive Your Refund", desc: "Once reviewed, your full refund is processed within 3–5 business days to your original payment method." },
];

export default function NoRiskGuaranteePage() {
  return (
    <main>
      <title>PawTenant No-Risk Guarantee | 100% Money-Back ESA Letter Promise</title>
      <meta name="description" content="PawTenant's 100% money-back guarantee on every ESA letter. If you don't qualify or your landlord unlawfully denies your letter, you get a full refund — no questions asked." />
      <meta name="keywords" content="ESA letter money back guarantee, PawTenant guarantee, no risk ESA letter, ESA letter refund, emotional support animal letter guarantee" />
      <link rel="canonical" href="https://www.pawtenant.com/no-risk-guarantee" />
      <meta property="og:title" content="PawTenant 100% Money-Back Guarantee | No-Risk ESA Letter" />
      <meta property="og:description" content="Every PawTenant ESA letter is backed by a 100% money-back guarantee. If your letter is denied or you don't qualify, you get a full refund." />
      <meta property="og:url" content="https://www.pawtenant.com/no-risk-guarantee" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="PawTenant 100% Money-Back Guarantee | No-Risk ESA Letter" />
      <meta name="twitter:description" content="Every PawTenant ESA letter comes with a 100% money-back guarantee. Don't qualify? Full refund. Landlord denies? Full refund. No questions asked." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "PawTenant No-Risk Guarantee",
        "url": "https://www.pawtenant.com/no-risk-guarantee",
        "description": "PawTenant offers a 100% money-back guarantee on all ESA letters. Full refund if you don't qualify or if your landlord unlawfully denies a valid letter.",
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "No-Risk Guarantee", "item": "https://www.pawtenant.com/no-risk-guarantee" }
          ]
        }
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="pt-24 pb-12 md:pt-32 md:pb-16 bg-[#fdf8f3]">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i className="ri-shield-check-line"></i>
            100% Money-Back Guarantee
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Our <span className="text-orange-500">No-Risk</span> Promise to You
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed max-w-2xl mx-auto">
            We stand behind every ESA letter we issue. If your letter doesn't work for you in the situations outlined below, we'll give you every penny back — period.
          </p>
        </div>
      </section>

      {/* Guarantee Stamp Visual */}
      <section className="py-10 md:py-12 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
          <div className="flex-shrink-0">
            <div className="w-48 h-48 flex flex-col items-center justify-center rounded-full border-[6px] border-orange-400 relative">
              <div className="absolute inset-2 rounded-full border-2 border-dashed border-orange-300"></div>
              <p className="text-orange-500 font-black text-lg uppercase tracking-widest relative z-10 text-center leading-tight">
                100%<br />Money<br />Back
              </p>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest relative z-10">Guarantee</p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-4">
              A Guarantee as Solid as Our Letters
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              At PawTenant, we take pride in offering a money-back guarantee that goes beyond the ordinary. In the unlikely event that your legitimate Emotional Support Animal letter fails to serve its intended purpose, we are here to provide a full refund.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Our commitment to your satisfaction extends to two specific scenarios described below. Rest assured — we stand firmly behind the effectiveness of our ESA letters and are dedicated to your contentment.
            </p>
          </div>
        </div>
      </section>

      {/* Two Scenarios */}
      <section className="py-16 md:py-20 bg-[#fdf8f3]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">When We Refund You</span>
            <h2 className="text-3xl font-extrabold text-gray-900">The Guarantee Covers Two Scenarios</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {guarantees.map((g, i) => (
              <div key={g.title} className="bg-white rounded-2xl p-8 border border-gray-100">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0">
                    <i className={`${g.icon} text-orange-500 text-2xl`}></i>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Scenario {i + 1}</span>
                    <h3 className="text-lg font-bold text-gray-900 mt-0.5">{g.title}</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Claim */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Simple Process</span>
            <h2 className="text-3xl font-extrabold text-gray-900">How to Claim Your Refund</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto rounded-full bg-orange-500 mb-4">
                  <span className="text-white font-black text-lg">{s.step}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{s.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's NOT covered */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
              <i className="ri-information-line text-amber-500"></i>
              Important Limitations
            </h3>
            <ul className="space-y-3">
              {[
                "This guarantee applies only to letters issued for housing purposes under the Fair Housing Act.",
                "The guarantee does not apply to ESA letters intended for air travel, employment, or other non-housing purposes.",
                "Refund requests must be submitted within 30 days of your letter issuance date.",
                "Fraudulent or misrepresented refund claims will be reviewed and may be denied.",
                "The guarantee does not apply if a landlord denial is later overturned through a legal process.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-600">
                  <i className="ri-arrow-right-s-line text-orange-400 mt-0.5 flex-shrink-0"></i>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-orange-500">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Apply With Complete Confidence</h2>
          <p className="text-orange-100 mb-8 text-base">Your satisfaction is fully guaranteed. Start your assessment today — risk-free.</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-white text-orange-600 font-bold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Get My ESA Letter — Risk Free <i className="ri-arrow-right-line"></i>
            </Link>
            <a
              href="mailto:hello@pawtenant.com"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 border border-white/40 text-white font-semibold text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer"
            >
              <i className="ri-mail-line"></i> Contact Us
            </a>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
