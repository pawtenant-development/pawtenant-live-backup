import { useState, useEffect } from "react";

const faqs = [
  {
    q: "What is an Emotional Support Animal (ESA)?",
    a: "An Emotional Support Animal (ESA) is a companion animal that provides therapeutic emotional support to individuals with mental health conditions. Unlike service animals, ESAs do not require special training. Their presence alone provides comfort and support for conditions like anxiety, depression, PTSD, and more.",
  },
  {
    q: "Who qualifies for an ESA letter?",
    a: "Anyone diagnosed with a mental or emotional disability by a licensed mental health professional may qualify for an ESA letter. Common qualifying conditions include anxiety disorders, depression, PTSD, phobias, and other mental health conditions. Our assessment helps determine your eligibility.",
  },
  {
    q: "How long does it take to receive my ESA letter?",
    a: "Most clients receive their ESA letter within 24 hours of completing the assessment. Premium package customers receive priority processing and often get their letters the same day.",
  },
  {
    q: "Can my ESA letter be used for housing?",
    a: "Yes! Our ESA letters are fully compliant with the Fair Housing Act (FHA). This means landlords are required to make reasonable accommodations for you and your emotional support animal, even in no-pet buildings. They cannot charge you pet deposits or monthly pet fees.",
  },
  {
    q: "Do ESA letters work on airplanes?",
    a: "As of 2021, the Department of Transportation (DOT) updated its rules, allowing airlines to treat ESAs as pets rather than service animals. Most airlines no longer accommodate ESAs in the cabin as service animals. However, our housing ESA letters remain fully valid for housing accommodations.",
  },
  {
    q: "Can my ESA be any type of animal?",
    a: "Yes, ESAs can be any domesticated animal, including dogs, cats, rabbits, birds, and more. The key requirement is that your mental health professional determines the animal provides therapeutic benefit to you.",
  },
  {
    q: "Are PawTenant ESA letters legitimate?",
    a: "Absolutely. All our ESA letters are issued by licensed mental health professionals who are properly credentialed and authorized to prescribe ESA letters in your state. Each letter includes the professional's license number, signature, and contact information for verification.",
  },
  {
    q: "Is it safe to get a legit ESA letter online?",
    a: "Yes — getting a legitimate ESA letter online through PawTenant is completely safe and legal. Our process mirrors a traditional in-person evaluation: a licensed mental health professional reviews your assessment, conducts a clinical evaluation, and issues a signed ESA letter if you qualify. The entire process is HIPAA-compliant and your data is fully protected. Thousands of pet owners have received their legit ESA letter online through our platform.",
  },
  {
    q: "How do I know if an ESA letter online is legit?",
    a: "A legitimate ESA letter online must be signed by a licensed mental health professional (LMHP) — such as a licensed therapist, psychologist, or clinical social worker — who is licensed in your state. It should include their license number, state of licensure, signature, and contact information. PawTenant letters also include a unique Verification ID so landlords can confirm authenticity instantly. Avoid any service that issues letters without a real clinical evaluation.",
  },
  {
    q: "What is the difference between Basic and Premium packages?",
    a: "Both packages include a legitimate ESA letter from a licensed professional. The Premium Package adds priority same-day processing and a discounted annual renewal. If you need your letter urgently or want renewal savings, the Premium Package is the better value.",
  },
  {
    q: "Can my landlord verify my ESA letter?",
    a: "Yes. Every finalized ESA letter issued through PawTenant includes a unique Verification ID. Landlords can enter this ID at pawtenant.com/verify to instantly confirm the letter's authenticity and the provider's license — without accessing any of your personal health information. Your diagnosis and medical details are never disclosed during verification.",
  },
  {
    q: "Does landlord verification expose my private health information?",
    a: "No. The verification system is designed to be privacy-safe. It only confirms that the letter is genuine and was issued by a licensed mental health professional. Your diagnosis, treatment history, and any other health details remain completely confidential and are protected under HIPAA.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // ── Inject FAQPage schema via useEffect to avoid React 19 double-hoisting
  // React 19 automatically hoists inline <script> tags from JSX to <head> AND
  // keeps the original in the component output — causing Google's "Duplicate FAQPage" error.
  useEffect(() => {
    const id = "homepage-faq-schema";
    if (!document.getElementById(id)) {
      const script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((faq) => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": { "@type": "Answer", "text": faq.a },
        })),
      });
      document.head.appendChild(script);
    }
    return () => {
      const s = document.getElementById(id);
      if (s) s.remove();
    };
  }, []);

  return (
    <section id="faq" className="py-20 bg-[#FFF7ED]" aria-label="Frequently Asked Questions">
      {/* Schema is now injected via useEffect above — no inline script tag */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-orange-600 text-sm font-semibold tracking-widest uppercase mb-2">FAQ</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Frequently Asked <span className="text-orange-500">Questions</span>
          </h2>
          <p className="text-gray-600 mt-3 max-w-xl mx-auto text-sm">
            Everything you need to know about getting a <strong>legit ESA letter online</strong>, the process, and your housing rights.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                aria-expanded={openIndex === idx}
                aria-controls={`faq-answer-${idx}`}
                id={`faq-question-${idx}`}
              >
                <span className="text-gray-900 font-semibold text-sm pr-4">{faq.q}</span>
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <i className={`text-orange-500 text-lg transition-transform duration-200 ${openIndex === idx ? "ri-subtract-line" : "ri-add-line"}`}></i>
                </div>
              </button>
              {openIndex === idx && (
                <div
                  id={`faq-answer-${idx}`}
                  role="region"
                  aria-labelledby={`faq-question-${idx}`}
                  className="px-5 pb-5 text-gray-700 text-sm leading-relaxed border-t border-gray-100 pt-4"
                >
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
