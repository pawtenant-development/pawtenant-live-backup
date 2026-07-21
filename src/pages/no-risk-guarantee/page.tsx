import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

// REFUND-POLICY-HOUSING-DENIAL-IMPLEMENTATION-001
// Concise, two-scenario guarantee page. Detailed rules live in /refund-policy
// (the single source of truth). No unconditional denial-refund claims, and no
// wording that PawTenant decides the lawfulness of a landlord's decision.

const guarantees = [
  {
    icon: "ri-user-unfollow-line",
    title: "If You Don't Qualify",
    desc: "If a licensed mental health professional determines you don't qualify for an ESA letter after your consultation, you receive a full refund — you're never charged for a letter you can't use.",
  },
  {
    icon: "ri-home-heart-line",
    title: "If a Housing Provider Denies Your Valid Letter",
    desc: "You can submit a housing-denial claim for review under our Refund Policy. A denial doesn't automatically qualify for a refund, and PawTenant reviews only whether its own guarantee applies — it doesn't decide whether any law was violated.",
  },
];

export default function NoRiskGuaranteePage() {
  return (
    <main>
      <meta name="keywords" content="ESA letter refund, PawTenant guarantee, no risk ESA letter, ESA letter money back, emotional support animal letter refund" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="PawTenant No-Risk Guarantee | ESA Letter Refund" />
      <meta name="twitter:description" content="If a licensed provider determines you don't qualify, you get a full refund. Housing-denial refund requests are reviewed under PawTenant's Refund Policy." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "PawTenant No-Risk Guarantee",
        "url": "https://pawtenant.com/no-risk-guarantee",
        "description": "If a licensed provider determines you don't qualify, you get a full refund. Housing-denial refund requests are reviewed under PawTenant's Refund Policy.",
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "No-Risk Guarantee", "item": "https://pawtenant.com/no-risk-guarantee" }
          ]
        }
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="pt-24 pb-12 md:pt-32 md:pb-16 bg-[#fdf8f3]">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i className="ri-shield-check-line"></i>
            Refund if you don't qualify
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Our <span className="text-orange-500">No-Risk</span> Promise to You
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed max-w-2xl mx-auto">
            If a licensed provider determines you don't qualify, you're refunded in full. And if a housing provider denies your valid letter, you can request a review under our Refund Policy.
          </p>
        </div>
      </section>

      {/* Guarantee Stamp Visual */}
      <section className="py-10 md:py-12 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
          <div className="flex-shrink-0">
            <div className="w-48 h-48 flex flex-col items-center justify-center rounded-full border-[6px] border-orange-400 relative">
              <div className="absolute inset-2 rounded-full border-2 border-dashed border-orange-300"></div>
              <p className="text-orange-500 font-black text-base uppercase tracking-widest relative z-10 text-center leading-tight px-4">
                Refund<br />If You<br />Don't Qualify
              </p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-4">
              You're Never Charged for a Letter You Can't Use
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Approval is never automatic. Your assessment is reviewed by a licensed provider, and if they determine you don't qualify, you receive a full refund. That's the promise this page is built on.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Housing-denial situations are different: a landlord's decision doesn't automatically trigger a refund, but you can ask us to review your claim under our Refund Policy.
            </p>
          </div>
        </div>
      </section>

      {/* Two Scenarios */}
      <section className="py-16 md:py-20 bg-[#fdf8f3]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Two Ways You're Protected</span>
            <h2 className="text-3xl font-extrabold text-gray-900">How the Guarantee Works</h2>
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

      {/* Full terms pointer */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-[#fdf6ee] rounded-2xl border border-orange-100 p-8 text-center">
            <div className="w-12 h-12 flex items-center justify-center bg-white rounded-xl border border-orange-100 mx-auto mb-5">
              <i className="ri-file-list-3-line text-orange-500 text-2xl"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Read the Full Refund Policy</h3>
            <p className="text-gray-600 text-sm leading-relaxed max-w-2xl mx-auto mb-6">
              Our Refund Policy is the complete source of truth — it covers every refund category, how housing-denial claims are reviewed, what evidence we may consider, refund timing, and more. To request a refund, email{" "}
              <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>.
            </p>
            <Link
              to="/refund-policy"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              View the Refund Policy <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-orange-500">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Apply With Confidence</h2>
          <p className="text-orange-100 mb-8 text-base">If a licensed provider determines you don't qualify, you're refunded in full. Start your assessment today.</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-white text-orange-600 font-bold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Get My ESA Letter <i className="ri-arrow-right-line"></i>
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
