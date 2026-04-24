import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";
import { DOCTORS } from "../../mocks/doctors";

// ... existing code ...

const stats = [
  { value: "12,000+", label: "ESA Letters Issued" },
  { value: "98.7%", label: "Approval Rate" },
  { value: "50", label: "States Covered" },
  { value: "3+", label: "Years of Service" },
];

const values = [
  { icon: "ri-heart-pulse-line", title: "Compassionate Care", desc: "We believe mental health access should never be complicated. Every patient deserves warmth, speed, and professionalism." },
  { icon: "ri-shield-check-line", title: "Legal Integrity", desc: "Every letter is issued by a state-licensed mental health professional, fully compliant with HIPAA and the Fair Housing Act." },
  { icon: "ri-time-line", title: "Speed & Convenience", desc: "No waiting rooms. No long delays. Most patients receive their ESA letter the same day as their consultation." },
  { icon: "ri-team-line", title: "Patient-First Always", desc: "Our team of licensed professionals and support staff work tirelessly to put your needs and your pet's wellbeing first." },
];

const credentials = [
  { label: "Licensed Clinical Social Workers (LCSW)", icon: "ri-user-star-line" },
  { label: "Licensed Professional Counselors (LPC)", icon: "ri-user-star-line" },
  { label: "Licensed Marriage & Family Therapists (LMFT)", icon: "ri-user-star-line" },
  { label: "Psychologists (Ph.D. / Psy.D.)", icon: "ri-user-star-line" },
  { label: "Psychiatrists (M.D. / D.O.)", icon: "ri-user-star-line" },
  { label: "Licensed Mental Health Counselors (LMHC)", icon: "ri-user-star-line" },
];

const methodology = [
  {
    step: "01",
    title: "Proper Clinical Evaluation",
    desc: "Every PawTenant evaluation is conducted by a licensed mental health professional (LMHP) who reviews your history, symptoms, and therapeutic need before any letter is issued.",
  },
  {
    step: "02",
    title: "State Licensure Verification",
    desc: "Every provider in our network is verified to hold an active, unencumbered license in the state where you reside. We check licensure status regularly and remove providers who let licenses lapse.",
  },
  {
    step: "03",
    title: "HIPAA-Compliant Record Keeping",
    desc: "Your evaluation records are stored in encrypted, HIPAA-compliant systems. We never sell your data, and you can request deletion at any time.",
  },
  {
    step: "04",
    title: "Legally Compliant Documentation",
    desc: "PawTenant letters include every required element: provider name, license number, license type, state of licensure, and official letterhead — meeting standards like California AB 468.",
  },
];

const trustSignals = [
  { label: "HIPAA Compliant", icon: "ri-shield-check-line" },
  { label: "SSL Encrypted", icon: "ri-lock-line" },
  { label: "Licensed Professionals Only", icon: "ri-user-star-line" },
  { label: "All 50 States", icon: "ri-map-pin-line" },
  { label: "100% Money-Back Guarantee", icon: "ri-refund-2-line" },
  { label: "3+ Years in Service", icon: "ri-calendar-check-line" },
  { label: "12,000+ Patients Helped", icon: "ri-group-line" },
  { label: "Fair Housing Act Compliant", icon: "ri-home-heart-line" },
];

export default function AboutUsPage() {
  return (
    <main>
      <title>About PawTenant | Our Network of Licensed Professionals</title>
      <meta name="description" content="Meet the network of licensed mental health providers at PawTenant. We prioritize clinical integrity and legal compliance to ensure your ESA is 100% valid in USA." />
      <meta name="keywords" content="about pawtenant, licensed ESA providers, clinical integrity, ESA letter providers" />
      <link rel="canonical" href="https://www.pawtenant.com/about-us" />
      <meta property="og:title" content="About PawTenant | Our Network of Licensed Professionals" />
      <meta property="og:description" content="Meet the network of licensed mental health providers at PawTenant. We prioritize clinical integrity and legal compliance to ensure your ESA is 100% valid in USA." />
      <meta property="og:url" content="https://www.pawtenant.com/about-us" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="About PawTenant | Licensed ESA & PSD Letter Provider" />
      <meta name="twitter:description" content="PawTenant connects people with licensed mental health professionals for legitimate ESA and PSD letters. 12,000+ patients helped. All 50 states covered." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "AboutPage",
            "name": "About PawTenant",
            "url": "https://www.pawtenant.com/about-us",
            "description": "PawTenant connects people with licensed mental health professionals to get legitimate ESA and PSD letters online for housing and ADA rights.",
            "mainEntity": {
              "@type": "Organization",
              "name": "PawTenant",
              "url": "https://www.pawtenant.com",
              "description": "PawTenant is a telehealth platform connecting patients with licensed mental health professionals for ESA and PSD letters.",
              "foundingDate": "2021",
              "areaServed": { "@type": "Country", "name": "United States" },
              "knowsAbout": ["Emotional Support Animals", "Psychiatric Service Dogs", "Fair Housing Act", "ADA Rights", "Mental Health"],
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+14099655885",
                "email": "hello@pawtenant.com",
                "contactType": "customer support"
              }
            }
          },
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
              { "@type": "ListItem", "position": 2, "name": "About Us", "item": "https://www.pawtenant.com/about-us" }
            ]
          }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-24 pb-14 md:pt-32 md:pb-20 overflow-hidden bg-[#fdf8f3]">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=warm%20cozy%20veterinary%20office%20interior%2C%20soft%20natural%20light%20through%20large%20windows%2C%20wooden%20furniture%2C%20plants%2C%20calm%20soothing%20atmosphere%2C%20professional%20healthcare%20environment%2C%20neutral%20tones%20beige%20and%20white&width=1440&height=600&seq=aboutbg01&orientation=landscape"
            alt="PawTenant licensed mental health professionals"
            className="w-full h-full object-cover object-top opacity-20"
          />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-5 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 bg-orange-50 px-3 py-1 rounded-full mb-4">Our Story</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            We Help People &amp; Their Pets{" "}
            <span className="text-orange-500">Stay Together</span>
          </h1>
          <p className="text-gray-600 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            PawTenant was founded with a simple belief — no one should have to choose between their mental health, their home, and the animal that brings them comfort. We make legitimate ESA and PSD letters accessible, affordable, and fast.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-orange-500 py-10">
        <div className="max-w-5xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-black text-white mb-1">{s.value}</p>
              <p className="text-orange-100 text-sm font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Signals Bar */}
      <section className="bg-white border-b border-gray-100 py-6">
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            {trustSignals.map(ts => (
              <div key={ts.label} className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`${ts.icon} text-orange-500 text-sm`}></i>
                </div>
                <span className="text-xs font-semibold text-gray-700">{ts.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Our Mission</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-5">Removing Barriers Between People &amp; Their Support Animals</h2>
            <p className="text-gray-600 leading-relaxed mb-5">
              Too many people with genuine mental health needs are denied the comfort and support of their animals because they don&apos;t know their rights or can&apos;t access a licensed professional to evaluate them.
            </p>
            <p className="text-gray-600 leading-relaxed mb-5">
              PawTenant was built to fix that. Our telehealth platform connects patients with state-licensed mental health professionals in minutes — no insurance required, no waiting rooms, no judgment.
            </p>
            <p className="text-gray-600 leading-relaxed mb-8">
              We&apos;ve helped over <strong>12,000 patients</strong> in all 50 states exercise their rights under the Fair Housing Act. And we&apos;re just getting started.
            </p>
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Get Your ESA Letter <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
          <div className="rounded-2xl overflow-hidden">
            <img
              src="https://readdy.ai/api/search-image?query=woman%20sitting%20at%20home%20desk%20doing%20telehealth%20video%20consultation%20on%20laptop%20with%20golden%20retriever%20dog%20sitting%20beside%20her%2C%20warm%20home%20office%20setting%2C%20natural%20light%2C%20cozy%20comfortable%20atmosphere%2C%20lifestyle%20photography&width=700&height=500&seq=aboutmission01&orientation=landscape"
              alt="PawTenant telehealth ESA consultation with licensed LMHP"
              className="w-full h-64 md:h-[400px] object-cover object-top"
            />
          </div>
        </div>
      </section>

      {/* E-E-A-T: Our Provider Credentials */}
      <section className="py-16 md:py-20 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Credentials &amp; Expertise</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Our Licensed Provider Network</h2>
            <p className="text-gray-500 mt-3 text-sm max-w-xl mx-auto">Every PawTenant evaluation is conducted by a fully licensed mental health professional. We only work with LMHPs who hold active, verified state licenses.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {credentials.map(c => (
              <div key={c.label} className="flex items-center gap-3 bg-white rounded-xl p-4 border border-orange-100">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                  <i className="ri-checkbox-circle-fill text-orange-500"></i>
                </div>
                <span className="text-sm font-semibold text-gray-800">{c.label}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-6 md:p-8 border border-orange-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-3">
                  <i className="ri-verified-badge-line text-orange-500 text-xl"></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Active License Verified</h3>
                <p className="text-gray-500 text-sm">We verify each provider&apos;s state license is current, active, and in good standing before they join our network.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-3">
                  <i className="ri-map-pin-line text-orange-500 text-xl"></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">State-Matched Evaluations</h3>
                <p className="text-gray-500 text-sm">You&apos;re always evaluated by a professional licensed in your state — ensuring your ESA or PSD letter is legally valid where you live.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-orange-100 rounded-full mx-auto mb-3">
                  <i className="ri-refresh-line text-orange-500 text-xl"></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Ongoing Quality Audits</h3>
                <p className="text-gray-500 text-sm">We conduct regular audits of provider licensure, patient satisfaction, and evaluation quality to maintain our network standards.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* E-E-A-T: Methodology */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Our Process</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">How We Ensure Legal Compliance</h2>
            <p className="text-gray-500 mt-3 text-sm max-w-xl mx-auto">Our evaluation methodology is built to meet the strictest state and federal requirements — including California AB 468, ADA, and Fair Housing Act standards.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {methodology.map(step => (
              <div key={step.step} className="flex gap-5">
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-orange-500 rounded-xl text-white font-black text-base">
                  {step.step}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 md:py-20 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">What We Stand For</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Our Core Values</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((v) => (
              <div key={v.title} className="bg-white rounded-xl p-6 border border-gray-100">
                <div className="w-11 h-11 flex items-center justify-center bg-orange-50 rounded-xl mb-4">
                  <i className={`${v.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{v.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-10 md:mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">The People Behind PawTenant</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Meet Our Licensed Providers</h2>
            <p className="text-gray-500 mt-3 text-sm">State-licensed mental health professionals committed to your wellbeing — all with verified, active licenses.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {DOCTORS.map((doctor) => (
              <div key={doctor.id} className="text-center">
                <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-4 border-4 border-orange-100">
                  <img src={doctor.image} alt={`${doctor.name} — licensed mental health professional`} title={`${doctor.name}, ${doctor.title}`} className="w-full h-full object-cover object-top" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm md:text-base mb-0.5">{doctor.name}</h3>
                <p className="text-orange-500 text-xs font-semibold mb-1">{doctor.title} — {doctor.role}</p>
                <p className="text-gray-600 text-xs leading-relaxed line-clamp-3 md:line-clamp-none">{doctor.bio}</p>
                <div className="flex flex-col items-center gap-1.5 mt-3">
                  <a
                    href={doctor.verificationUrl}
                    target="_blank"
                    rel="nofollow noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-semibold cursor-pointer"
                  >
                    <i className="ri-shield-check-line text-xs"></i> License Verified
                  </a>
                  <Link to={`/doctors/${doctor.id}`} className="text-xs text-orange-500 hover:text-orange-600 font-medium cursor-pointer">
                    View Profile
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-gray-500 text-sm mb-4">PawTenant&apos;s network includes licensed professionals across all 50 states. These are just a few of our featured providers.</p>
            <Link to="/join-our-network" className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 border border-orange-300 text-orange-600 font-semibold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer">
              Are you a licensed LMHP? Join our network
            </Link>
          </div>
        </div>
      </section>

      {/* Editorial Standards */}
      <section className="py-14 md:py-16 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Content Standards</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-5">Our Editorial &amp; Content Policy</h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                All educational content on PawTenant — including blog posts, state guides, and resource articles — is reviewed by licensed mental health professionals for clinical accuracy. We follow strict editorial guidelines to ensure our information is current, accurate, and legally compliant.
              </p>
              <ul className="space-y-3">
                {[
                  "All clinical content reviewed by licensed LMHPs",
                  "State law information updated regularly for 2026",
                  "Sources cited to HUD, ADA.gov, and state housing agencies",
                  "No sponsored content on medical or legal information",
                  "Corrections policy — errors corrected within 48 hours",
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500 text-sm"></i>
                    </div>
                    <span className="text-gray-700 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "HUD Guidelines", sub: "Fair Housing Act compliance", icon: "ri-government-line" },
                { label: "ADA.gov", sub: "Service animal laws", icon: "ri-scales-line" },
                { label: "State Licensing Boards", sub: "Provider verification", icon: "ri-verified-badge-line" },
                { label: "HIPAA Compliant", sub: "Patient data protection", icon: "ri-lock-line" },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-100 text-center">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mx-auto mb-3">
                    <i className={`${card.icon} text-orange-500`}></i>
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm">{card.label}</h4>
                  <p className="text-gray-500 text-xs mt-1">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Telehealth commitment */}
      <section className="py-14 md:py-16 bg-gray-900">
        <div className="max-w-5xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">
            Telehealth You Can <span className="text-orange-400">Trust</span>
          </h2>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-8">
            All consultations are conducted via HIPAA-compliant video or phone sessions by state-licensed mental health professionals. Your privacy and wellbeing are always protected — and your letter is backed by our 100% money-back guarantee.
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:gap-6">
            {["HIPAA Compliant", "SSL Encrypted", "Licensed Professionals", "50-State Coverage", "100% Money-Back"].map((badge) => (
              <div key={badge} className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                <i className="ri-checkbox-circle-fill text-orange-400 text-sm"></i>
                <span className="text-white text-sm font-medium">{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Resource Links */}
      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Explore Our Resources</h3>
          <div className="flex flex-wrap gap-3">
            {[
              { to: "/resource-center", label: "ESA & PSD Resource Center" },
              { to: "/blog", label: "Blog & Guides" },
              { to: "/explore-esa-letters-all-states", label: "ESA Letters by State" },
              { to: "/how-to-get-psd-letter", label: "PSD Letter Guide" },
              { to: "/housing-rights-esa", label: "Housing Rights" },
              { to: "/faqs", label: "FAQs" },
            ].map(link => (
              <Link key={link.to} to={link.to} className="text-xs font-semibold text-orange-600 border border-orange-200 px-3 py-1.5 rounded-full hover:bg-orange-50 transition-colors cursor-pointer">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-16 bg-orange-500">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">Ready to Protect Your Housing Rights?</h2>
          <p className="text-orange-100 mb-8">Start your assessment today — results in minutes, letter same day.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-orange-600 font-bold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Get My ESA Letter Now <i className="ri-arrow-right-line"></i>
            </Link>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-700 text-white font-bold text-sm rounded-md hover:bg-orange-800 transition-colors cursor-pointer"
            >
              Get My PSD Letter <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
