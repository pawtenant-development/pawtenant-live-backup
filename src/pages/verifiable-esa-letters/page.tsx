import { useEffect } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/pages/home/components/Footer";

const faqItems = [
  { q: "What is the Verification ID and QR code on my letter?", a: "Every PawTenant ESA letter includes a unique Verification ID and QR code that allows any landlord to instantly confirm your letter's authenticity. The ID is a short alphanumeric code that is cryptographically unique and cannot be duplicated or forged. The QR code encodes the same information and can be scanned with any smartphone camera for instant verification at pawtenant.com/ESA-letter-verification." },
  { q: "How do landlords verify my letter?", a: "Landlords can verify your letter in under 30 seconds by visiting pawtenant.com/ESA-letter-verification and either scanning the QR code with their phone or entering the Verification ID manually. The system instantly displays confirmation that the letter is valid, when it was issued, and the type of letter (ESA or PSD). No account or login is required." },
  { q: "What information do landlords see when they verify my letter?", a: "Landlords see only: confirmation that the letter is valid, the date it was issued, the type of letter (ESA or PSD), and that it was issued by a licensed professional through PawTenant. They do NOT see your name, diagnosis, treatment history, provider name, or any other health information. The verification confirms authenticity while protecting your privacy." },
  { q: "Why is a verifiable letter better than a regular ESA letter?", a: "A verifiable letter eliminates landlord skepticism by giving them an objective way to confirm authenticity instantly. Without verification, landlords often delay processing while they investigate whether your letter is legitimate — or reject it outright if they have encountered fraudulent letters before. PawTenant's verification system shifts the conversation from 'is this real?' to 'your accommodation is approved.'" },
  { q: "Is there an extra charge for the verification feature?", a: "No. Every ESA and PSD letter issued through PawTenant automatically includes the Verification ID and QR code at no additional cost. This is a core feature of our service, not an add-on. We believe every ESA owner deserves documentation that landlords can verify with confidence." },
  { q: "What if a landlord still refuses my verified letter?", a: "A landlord who denies your accommodation after verifying that your letter is legitimate has a much harder time justifying that denial. This strengthens your position in any fair housing complaint. PawTenant's 100% money-back guarantee applies: if a housing provider unlawfully refuses to honor your verified letter, we will refund your fee in full." },
];

const faqSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqItems.map((item) => ({
    "@type": "Question",
    "name": item.q,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.a,
    },
  })),
});

export default function VerifiableESALettersPage() {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = faqSchema;
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <SharedNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#1c1917] pt-28 pb-20">
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "url('https://readdy.ai/api/search-image?query=abstract%20warm%20orange%20amber%20organic%20shapes%20soft%20botanical%20pattern%20minimal%20clean%20background%20texture&width=1440&height=600&seq=verifiable-hero-bg-warm&orientation=landscape')", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/40 via-transparent to-amber-900/30" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 border border-white/25 rounded-full text-white text-xs font-bold uppercase tracking-widest mb-6">
            <i className="ri-shield-check-fill text-sm"></i>
            Industry-First Feature
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">
            Verifiable ESA Letters<br />
            <span className="text-orange-300">Landlords Can Instantly Confirm</span>
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto leading-relaxed mb-8">
            Every ESA letter from PawTenant includes a unique Verification ID and QR code. Landlords can verify authenticity in seconds — no phone calls, no delays, no privacy violations.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 bg-orange-500 text-white font-extrabold text-sm rounded-xl hover:bg-orange-600 transition-colors cursor-pointer">
              <i className="ri-file-text-line"></i>Get My Verifiable ESA Letter
            </Link>
            <Link to="/ESA-letter-verification"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-4 border-2 border-white/40 text-white font-bold text-sm rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
              <i className="ri-search-eye-line"></i>See Verification Portal
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2">How It Works</p>
          <h2 className="text-3xl font-extrabold text-gray-900">Verification in 3 Simple Steps</h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">Our landlord verification system protects your privacy while giving landlords the confidence they need.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { num: "01", icon: "ri-file-text-line", color: "bg-orange-500", title: "You Get Your Letter", desc: "Your signed ESA letter includes a unique Verification ID and QR code stamped directly on the document by your licensed provider." },
            { num: "02", icon: "ri-qr-code-line", color: "bg-amber-500", title: "Landlord Scans or Visits", desc: "Your landlord scans the QR code or visits pawtenant.com/verify/[ID] — no account needed, completely free." },
            { num: "03", icon: "ri-shield-check-line", color: "bg-emerald-500", title: "Instant Confirmation", desc: "They see: letter is valid, issued by a licensed professional, and active. Zero health information is ever disclosed." },
          ].map((step) => (
            <div key={step.num} className="text-center">
              <div className={`w-14 h-14 flex items-center justify-center ${step.color} rounded-2xl mx-auto mb-4`}>
                <i className={`${step.icon} text-white text-2xl`}></i>
              </div>
              <span className="text-xs font-extrabold text-gray-300">{step.num}</span>
              <h3 className="text-base font-extrabold text-gray-900 mt-1 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why It Matters */}
      <section className="py-20 bg-[#f8fffe] px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest mb-2">Why It Matters</p>
            <h2 className="text-3xl font-extrabold text-gray-900">The Problem With Unverifiable ESA Letters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: "ri-close-circle-line", color: "text-red-500 bg-red-50", title: "Landlords Doubt Authenticity", desc: "Without verification, landlords often reject ESA letters or demand additional proof — causing delays and stress for tenants." },
              { icon: "ri-close-circle-line", color: "text-red-500 bg-red-50", title: "Fake Letters Are Common", desc: "The ESA letter industry is flooded with fraudulent documents. Landlords have learned to be skeptical of any letter they receive." },
              { icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f] bg-[#f0faf7]", title: "PawTenant Letters Are Verifiable", desc: "Every letter we issue has a unique ID tied to a real licensed professional. Landlords can verify in seconds — no calls needed." },
              { icon: "ri-checkbox-circle-line", color: "text-[#1a5c4f] bg-[#f0faf7]", title: "Your Privacy Is Protected", desc: "Verification only confirms the letter is valid. No diagnosis, no health details, no personal information is ever shared with landlords." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 p-5">
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${item.color.split(" ")[1]}`}>
                  <i className={`${item.icon} ${item.color.split(" ")[0]} text-lg`}></i>
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Landlords See */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-3">Landlord View</p>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-5">What Your Landlord Sees</h2>
            <p className="text-gray-500 leading-relaxed mb-6">When a landlord visits the verification portal, they see a clean confirmation page showing the letter is valid — nothing more. Your diagnosis, treatment history, and personal health information remain completely private.</p>
            <div className="space-y-3">
              {[
                { icon: "ri-checkbox-circle-fill", text: "Letter status: Valid / Active", color: "text-emerald-600" },
                { icon: "ri-checkbox-circle-fill", text: "Issued by a licensed professional", color: "text-emerald-600" },
                { icon: "ri-checkbox-circle-fill", text: "Issue date and expiry date", color: "text-emerald-600" },
                { icon: "ri-close-circle-fill", text: "No diagnosis or health information", color: "text-red-400" },
                { icon: "ri-close-circle-fill", text: "No personal medical records", color: "text-red-400" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`${item.icon} ${item.color} text-base`}></i>
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#FFF7ED] border border-orange-200 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-500 rounded-xl">
                <i className="ri-shield-check-fill text-white text-lg"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-orange-600">PawTenant Verification Portal</p>
                <p className="text-xs text-orange-400">pawtenant.com/verify/[ID]</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-orange-200 p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider">Letter Verified — Valid</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Status", value: "Active" },
                  { label: "Issued By", value: "Licensed LMHC" },
                  { label: "Issue Date", value: "Jan 15, 2025" },
                  { label: "Valid Until", value: "Jan 15, 2026" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-400">{row.label}</span>
                    <span className="text-xs font-bold text-gray-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-orange-400 text-center">No health information is disclosed to landlords</p>
          </div>
        </div>
      </section>

      {/* How Verification Works FAQ */}
      <section className="py-20 bg-gray-50 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2">FAQ</p>
            <h2 className="text-3xl font-extrabold text-gray-900">How ESA Letter Verification Works</h2>
            <p className="text-gray-500 mt-3">Everything you need to know about PawTenant&apos;s unique landlord verification feature</p>
          </div>
          <div className="space-y-4">
            {faqItems.map((faq, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-extrabold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Why PawTenant Is the #1 Verifiable ESA Letter Service</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: "ri-award-line", label: "Licensed Professionals", sub: "State-licensed LMHC/LCSW" },
              { icon: "ri-shield-check-line", label: "HIPAA Compliant", sub: "Your data is protected" },
              { icon: "ri-home-heart-line", label: "Fair Housing Act", sub: "Legally recognized letters" },
              { icon: "ri-verified-badge-line", label: "Instant Verification", sub: "QR code on every letter" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-5 text-center">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-xl mx-auto mb-3">
                  <i className={`${item.icon} text-orange-500 text-lg`}></i>
                </div>
                <p className="text-xs font-extrabold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-400 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#FFF7ED] border-t border-orange-100">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-orange-500 rounded-2xl mx-auto mb-6">
            <i className="ri-shield-check-fill text-white text-2xl"></i>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Get Your Verifiable ESA Letter Today</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">Join thousands of pet owners who trust PawTenant for legitimate, landlord-verifiable ESA letters issued by licensed mental health professionals.</p>
          <Link to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-extrabold text-base rounded-xl hover:bg-orange-600 transition-colors cursor-pointer">
            <i className="ri-file-text-line"></i>Start My Assessment — Takes 5 Minutes
          </Link>
          <p className="text-gray-400 text-xs mt-4">100% money-back guarantee if you don&apos;t qualify</p>
        </div>
      </section>

      <SharedFooter />
    </div>
  );
}
