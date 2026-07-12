import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * FAQSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Pruned from 18 to 9 questions (removed the stale "Basic vs Premium packages"
 * answer — those packages no longer exist — plus duplicates). Answers reuse the
 * existing approved copy; the cost answer now points to /esa-letter-cost
 * (owner decision: pricing lives on the cost page only) and a new
 * landlord-refusal question names the concrete support deliverables.
 * FAQPage JSON-LD injection pattern preserved (useEffect — avoids React 19
 * double-hoisting / Google "Duplicate FAQPage" error).
 * Includes the calm HUD-2026 strip (replaces the old HudUpdateSection whose
 * primary button exited to a blog post mid-funnel).
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const faqs = [
  {
    q: "Are PawTenant ESA letters valid for housing?",
    a: "Yes. Every PawTenant ESA letter is reviewed and signed by a licensed mental health professional who is credentialed in your state. Each letter includes the provider's full name, license number, state of licensure, signature, and a unique Verification ID so housing providers can confirm authenticity directly with us.",
  },
  {
    q: "Can my landlord reject my ESA letter?",
    a: "Under the Fair Housing Act, housing providers are generally required to consider reasonable accommodation requests for qualifying ESAs — even in no-pet buildings. They may ask for documentation from a licensed professional, which your PawTenant letter provides. Landlords can deny requests in narrow circumstances (e.g., the animal poses a direct threat or causes substantial property damage), but they cannot reject a legitimate ESA letter solely because of a no-pet policy. If your landlord questions the letter, our support team can help you respond.",
  },
  {
    q: "How much does an ESA letter cost?",
    a: "We keep pricing simple and transparent — no subscriptions and no hidden fees, with a full refund if you don't qualify after the licensed provider's review. See the current pricing and what's included on our ESA Letter Cost page. Klarna is also available at checkout, subject to eligibility and Klarna's payment terms.",
  },
  {
    q: "How long does it take to receive my ESA letter?",
    a: "Most clients receive their ESA letter within 24 hours of completing the assessment, once a licensed provider has reviewed it. Five states (California, Arkansas, Iowa, Louisiana and Montana) legally require a 30-day provider relationship before a letter can be issued — we manage that timeline for you, starting from your assessment.",
  },
  {
    q: "Who qualifies for an ESA letter?",
    a: "Anyone diagnosed with a mental or emotional disability by a licensed mental health professional may qualify for an ESA letter. Common qualifying conditions include anxiety disorders, depression, PTSD, phobias, and other mental health conditions. Our assessment helps determine your eligibility.",
  },
  {
    q: "Is the online evaluation a real clinical evaluation?",
    a: "Yes. The evaluation is conducted by a real licensed mental health professional — not a chatbot or automated system. The provider reviews your assessment responses, may follow up with additional questions, and applies clinical judgment to determine whether an ESA is appropriate for your situation. If you do not qualify, the provider will not issue a letter and you'll receive a refund per our money-back guarantee.",
  },
  {
    q: "Can my landlord verify my ESA letter?",
    a: "Yes. Every finalized ESA letter issued through PawTenant includes a unique Verification ID. Landlords can enter this ID at pawtenant.com/verify to instantly confirm the letter's authenticity and the provider's license — without accessing any of your personal health information. Your diagnosis and medical details are never disclosed during verification.",
  },
  {
    q: "What if my landlord refuses my letter?",
    a: "Our team responds directly to your landlord's verification request, and you get a step-by-step accommodation-request guide plus our landlord-denial playbook. Under the Fair Housing Act, landlords must consider reasonable accommodation requests — and your letter carries the license details they check.",
  },
  {
    q: "Do ESA letters work on airplanes?",
    a: "As of 2021, the Department of Transportation allows airlines to treat ESAs as pets, so most airlines no longer accept ESAs in the cabin. Airlines do accept task-trained psychiatric service dogs via a DOT attestation form — a PSD letter documents your need and can support that process, but your dog's task training is what qualifies it. Our housing ESA letters remain fully valid for housing accommodations.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showAllMobile, setShowAllMobile] = useState(false);

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
    <section id="faq" className="py-14 sm:py-20 bg-[#F7F2E9]" aria-label="Frequently Asked Questions">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* HUD 2026 — calm informational strip (text link, never a primary CTA). */}
        <div className="max-w-3xl mx-auto mb-10 bg-white border border-[#EAE3D7] rounded-xl px-5 py-4 flex items-start gap-3">
          <span className="bg-[#F7F2E9] text-[#4A443C] text-[10.5px] font-extrabold rounded-md px-2 py-1 uppercase tracking-wider flex-shrink-0 mt-0.5">
            2026 Update
          </span>
          <p className="text-[13px] text-[#6B6359] leading-relaxed">
            HUD&rsquo;s enforcement approach for support animals changed in 2026 — but your housing
            options didn&rsquo;t disappear. State law, Section 504 and private rights still apply.{" "}
            <Link
              to="/are-esa-letters-still-valid-after-hud-change"
              className="text-[#231F1A] font-extrabold underline hover:text-black"
            >
              Read what changed →
            </Link>
          </p>
        </div>

        <div className="text-center mb-10">
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight"
            style={FONT_DISPLAY}
          >
            Frequently Asked Questions
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-xl border border-[#EAE3D7] overflow-hidden ${
                idx >= 4 && !showAllMobile ? "hidden sm:block" : ""
              }`}
            >
              <button
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer hover:bg-[#FDFBF7] transition-colors"
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                aria-expanded={openIndex === idx}
                aria-controls={`faq-answer-${idx}`}
                id={`faq-question-${idx}`}
              >
                <span className="text-[#231F1A] font-extrabold text-sm pr-4">{faq.q}</span>
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <i
                    className={`text-[#6B6359] text-lg transition-transform duration-200 ${
                      openIndex === idx ? "ri-subtract-line" : "ri-add-line"
                    }`}
                  ></i>
                </div>
              </button>
              {openIndex === idx && (
                <div
                  id={`faq-answer-${idx}`}
                  role="region"
                  aria-labelledby={`faq-question-${idx}`}
                  className="px-5 pb-5 text-[#4A443C] text-sm leading-relaxed border-t border-[#F1EAE0] pt-4"
                >
                  {faq.a}
                  {faq.q === "How much does an ESA letter cost?" && (
                    <>
                      {" "}
                      <Link
                        to="/esa-letter-cost"
                        className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]"
                      >
                        See the ESA Letter Cost page →
                      </Link>
                    </>
                  )}
                  {faq.q === "What if my landlord refuses my letter?" && (
                    <>
                      {" "}
                      <Link
                        to="/landlord-denied-esa-letter"
                        className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]"
                      >
                        Read the landlord-denial playbook →
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {!showAllMobile && faqs.length > 4 && (
            <div className="sm:hidden pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAllMobile(true)}
                className="inline-flex items-center min-h-[44px] gap-2 px-5 py-2.5 bg-white border border-[#DCD2C0] rounded-full text-sm font-bold text-[#4A443C] hover:bg-[#FDFBF7] transition-colors cursor-pointer"
              >
                Show more questions
                <i className="ri-arrow-down-s-line" aria-hidden></i>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
