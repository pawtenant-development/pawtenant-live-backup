import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const faqCategories = [
  {
    id: "general",
    label: "General ESA Questions",
    icon: "ri-questionnaire-line",
    faqs: [
      { q: "What is an Emotional Support Animal (ESA)?", a: "An Emotional Support Animal is a pet — most commonly a dog or cat — that provides therapeutic benefit to someone with a mental or emotional disability through companionship and affection. Unlike service animals, ESAs don't need to be trained to perform specific tasks. The comfort and support they provide through the human-animal bond is itself the therapeutic benefit." },
      { q: "What is the difference between an ESA and a service animal?", a: "Service animals are specifically trained to perform tasks for individuals with disabilities and have broad public access rights under the ADA (restaurants, stores, airlines, etc.). ESAs provide emotional comfort without task training and are protected specifically in housing situations under the Fair Housing Act. ESAs do not have general public access rights." },
      { q: "What mental health conditions qualify for an ESA?", a: "Any DSM-recognized mental health condition that substantially limits a major life activity may qualify. Common qualifying conditions include anxiety disorders, major depressive disorder, PTSD, bipolar disorder, OCD, ADHD, panic disorder, eating disorders, and phobias. A licensed mental health professional will evaluate your specific situation." },
      { q: "Can any type of animal be an ESA?", a: "While dogs and cats are most common, virtually any type of domestic animal can serve as an ESA. The Fair Housing Act does not restrict species for ESA accommodations, though landlords may consider whether the animal poses a threat or is appropriate for the housing type. More unusual animals may face additional scrutiny." },
      { q: "Does my ESA need to be trained?", a: "No! Unlike service animals, ESAs do not need any specific task training. The therapeutic benefit of an ESA comes from the companionship and emotional bond between you and your animal. However, your ESA should be well-behaved and not pose a threat to others." }
    ]
  },
  {
    id: "letter",
    label: "ESA Letter Questions",
    icon: "ri-file-text-line",
    faqs: [
      { q: "What is an ESA letter and what should it include?", a: "An ESA letter is a formal document written by a licensed mental health professional (LMHP) that recommends an ESA as part of your treatment. A valid letter should include: the professional's name, license type, license number, and state; your diagnosis (in general terms); confirmation that an ESA is part of your treatment plan; the professional's signature; and the date. It should be on official letterhead." },
      { q: "Who can write a legitimate ESA letter?", a: "Only licensed mental health professionals can write valid ESA letters. This includes licensed psychologists (PhD/PsyD), licensed clinical social workers (LCSW), licensed professional counselors (LPC), licensed marriage and family therapists (LMFT), and psychiatrists (MD). The professional must be licensed in the state where they practice." },
      { q: "How long is an ESA letter valid?", a: "Most ESA letters are valid for 12 months (1 year). Many landlords, property managers, and universities require annual renewal with updated documentation. PawTenant makes renewal quick and affordable." },
      { q: "Can I get an ESA letter online?", a: "Yes — as long as it comes from a legitimate licensed professional who conducts a real assessment. PawTenant connects you with licensed mental health professionals via secure video consultation. Beware of services that generate letters automatically without a real assessment, as these are not legally valid." },
      { q: "How much does an ESA letter cost?", a: "PawTenant's ESA letter is $110 as a one-time purchase (delivered within 24 hours) or $99/year with our Annual Subscription, which auto-renews so you never lose housing protection. All plans include a consultation with a licensed mental health professional and a fully compliant ESA letter with a 100% money-back guarantee." },
      { q: "What if my landlord doesn't accept my ESA letter?", a: "If your ESA letter meets all legal requirements and your landlord still refuses, this may be a Fair Housing Act violation. PawTenant offers guidance in these situations and you may also file a complaint with HUD (Department of Housing and Urban Development) or your state's fair housing office. PawTenant's money-back guarantee covers situations where our letter is legitimately rejected." }
    ]
  },
  {
    id: "psd",
    label: "PSD Letter Questions",
    icon: "ri-mental-health-line",
    faqs: [
      { q: "What is a Psychiatric Service Dog (PSD) letter?", a: "A psychiatric service dog letter is an official document issued by a licensed mental health professional — psychologist, psychiatrist, therapist, or LCSW — confirming that you have a qualifying psychiatric disability and that a trained service dog performing specific tasks is medically necessary. Unlike an ESA letter, a PSD letter combined with task training gives your dog full public access rights under the Americans with Disabilities Act (ADA)." },
      { q: "How is a PSD letter different from an ESA letter?", a: "An ESA letter only covers housing protections under the Fair Housing Act. A PSD letter, combined with proper task training, grants your dog full public access rights under the ADA — restaurants, stores, hotels, flights, and beyond. PSDs must be trained to perform specific tasks (like interrupting panic attacks or providing grounding during dissociation), while ESAs require no task training." },
      { q: "What tasks must a psychiatric service dog perform?", a: "Your dog must be trained to perform at least one specific task that directly mitigates your psychiatric disability. Common PSD tasks include: interrupting panic attacks with trained calming behaviors, performing room checks for PTSD hypervigilance, medication reminders, grounding during dissociation episodes, creating personal space in crowds, and responding to nightmares or night terrors. Comfort alone does not qualify a dog as a PSD — there must be a trained, disability-specific behavior." },
      { q: "What mental health conditions qualify for a PSD letter?", a: "Any DSM-5 recognized psychiatric condition may qualify, including PTSD, generalized anxiety disorder, major depression, bipolar disorder, schizophrenia, ADHD, OCD, panic disorder, and social anxiety. The key requirements are: (1) your condition substantially limits one or more major life activities, and (2) a trained dog performs tasks that directly mitigate those limitations." },
      { q: "Does my dog need to be professionally certified for a PSD letter?", a: "No. The ADA does not require service dogs to be certified, registered, or professionally trained. Owner-trained psychiatric service dogs are fully legal. What matters is that your dog is trained to reliably perform specific tasks related to your disability. The PSD letter documents your medical need; your dog's task training establishes their service dog status." },
      { q: "How much does a PSD letter cost at PawTenant?", a: "PawTenant's PSD letter evaluations are priced as follows: Standard (2-3 business days) — $100 for 1 dog, $120 for 2 dogs, $135 for 3 dogs. Priority (within 24 hours) — $120 for 1 dog, $140 for 2 dogs, $155 for 3 dogs. Annual Subscription — $99/year for 1 dog, $109/year for 2 dogs, $129/year for 3 dogs. All plans include a consultation with a licensed professional." },
      { q: "Can a landlord refuse a psychiatric service dog?", a: "No. Under the Fair Housing Act, landlords must provide reasonable accommodation for psychiatric service dogs regardless of no-pet policies, breed restrictions, or weight limits. Landlords may only ask two questions: (1) Is this a service dog required because of a disability? (2) What task has the dog been trained to perform? They cannot request medical records, require certification, or charge pet fees." },
      { q: "Is a PSD letter valid for air travel?", a: "Most U.S. airlines now allow psychiatric service dogs in-cabin under the same rules as other service dogs, following the 2021 DOT rule change. Your PSD letter from a licensed professional is key documentation, though individual airlines may have their own forms and advance-notice requirements. ESAs, by contrast, are treated as pets on most airlines since 2021." }
    ]
  },
  {
    id: "housing",
    label: "Housing Rights",
    icon: "ri-home-line",
    faqs: [
      { q: "Can my landlord refuse to allow my ESA?", a: "Landlords must provide reasonable accommodations for ESAs under the Fair Housing Act. They can only legally deny an ESA request if: the animal poses a direct threat to the health or safety of others, its presence would cause substantial damage to property, the accommodation would fundamentally alter the nature of the housing, or the documentation is insufficient. A blanket no-pets policy is not sufficient legal grounds." },
      { q: "Can my landlord charge a pet deposit for my ESA?", a: "No! Under the Fair Housing Act, landlords cannot charge a pet deposit or pet fee for an approved ESA. You may still be held responsible for any actual damage your ESA causes to the property, but no pre-emptive fees are allowed." },
      { q: "Does the Fair Housing Act apply to all housing?", a: "The FHA applies to most housing in the United States, including apartments, condominiums, HOA communities, university housing, and single-family homes rented with a real estate agent. Exceptions are limited to owner-occupied buildings with 4 or fewer units and single-family homes sold/rented without a broker (and some private clubs)." },
      { q: "What information can my landlord ask for?", a: "Landlords may ask: whether you have a disability-related need for an ESA, what accommodation you need, and reasonable documentation (your ESA letter). They cannot ask about the specifics of your diagnosis, require medical records, or demand your complete mental health history." },
      { q: "Can my HOA deny my ESA?", a: "HOAs are subject to the Fair Housing Act and must accommodate ESA requests through reasonable accommodation requests. Denying a legitimate ESA request with proper documentation may constitute housing discrimination." }
    ]
  },
  {
    id: "college",
    label: "College & University",
    icon: "ri-graduation-cap-line",
    faqs: [
      { q: "Can I have an ESA in a college dorm?", a: "Yes! Federal law — including the Fair Housing Act and Section 504 of the Rehabilitation Act — requires colleges that offer housing programs to accommodate ESAs for students with qualifying mental health conditions. Contact your university's Disability or Accessibility Services office to begin the accommodation request process." },
      { q: "Does my university need to accept my ESA letter from PawTenant?", a: "If your letter meets federal requirements and is issued by a properly licensed professional with an established relationship with you, universities must engage in the accommodation process. PawTenant letters are written by licensed professionals and backed by a 100% money-back guarantee." },
      { q: "How do I request an ESA accommodation at my university?", a: "Contact your university's Disability Services, Accessibility Services, or Student Access office. They will provide specific forms and requirements. Submit your ESA letter and any required university forms. The process typically takes 5-10 business days." },
      { q: "Do I need to renew my ESA accommodation each semester?", a: "Most universities require annual renewal, though some may ask at the start of each academic year. Keep your ESA letter current (within the past 12 months) and be prepared to resubmit documentation." }
    ]
  },
  {
    id: "travel",
    label: "Travel with ESA",
    icon: "ri-plane-line",
    faqs: [
      { q: "Can I fly with my ESA for free?", a: "No — not as of 2021. The U.S. Department of Transportation updated its rules in January 2021, allowing airlines to treat ESAs as regular pets. Most major airlines now charge standard pet fees for ESAs in the cabin. Psychiatric Service Dogs (PSDs) still retain in-cabin access rights." },
      { q: "What is the difference between an ESA and a Psychiatric Service Dog for flying?", a: "PSDs are trained to perform specific tasks related to a mental health disability and retain in-cabin airline access rights under the Air Carrier Access Act. ESAs provide emotional comfort without task training and are now treated as pets for air travel purposes." },
      { q: "Can I take my ESA on Amtrak?", a: "Amtrak's pet policy allows small dogs and cats in some train cars for a fee. Check Amtrak's current pet policy directly, as rules vary by train type and route." }
    ]
  },
  {
    id: "verification",
    label: "Landlord Verification",
    icon: "ri-qr-code-line",
    faqs: [
      { q: "What is PawTenant's Landlord Verification feature?", a: "Every ESA and PSD letter issued by PawTenant includes a unique Verification ID and QR code. Landlords can visit pawtenant.com/ESA-letter-verification, enter the ID or scan the QR code, and instantly confirm that your letter is authentic and valid — without ever seeing your personal health information. This is PawTenant's exclusive feature that sets our letters apart from every other ESA provider." },
      { q: "How does a landlord verify my ESA letter?", a: "It's simple: your landlord visits pawtenant.com/ESA-letter-verification and enters the Verification ID printed on your letter, or scans the QR code. The system instantly confirms whether the letter is valid, who issued it, and when it was issued. The entire process takes under 30 seconds and requires no account or login from the landlord." },
      { q: "What information does the landlord see when they verify my letter?", a: "Landlords only see that your letter is valid — nothing else. Your diagnosis, mental health history, therapy notes, and personal health information are never disclosed. This is fully HIPAA-compliant. The verification system is designed to confirm authenticity without revealing any protected health information." },
      { q: "Does every PawTenant letter include a Verification ID?", a: "Yes. Every ESA and PSD letter issued through PawTenant automatically includes a unique Verification ID and QR code embedded in the document. There is no extra charge for this feature — it is included with every letter as part of our commitment to providing the most credible, landlord-accepted documentation available." },
      { q: "Can a landlord reject my letter even after verifying it?", a: "If a landlord verifies your letter and it shows as valid, they have confirmed the letter is authentic and issued by a licensed professional. Rejecting a verified, legitimate ESA letter after confirmation is a potential Fair Housing Act violation. PawTenant's money-back guarantee covers situations where a landlord illegally refuses a verified letter." },
      { q: "What if my landlord doesn't know about the verification feature?", a: "You can direct them to pawtenant.com/ESA-letter-verification and show them the QR code on your letter. Many landlords are unfamiliar with verification systems because most ESA providers don't offer them — this is a PawTenant-exclusive feature. The verification page is designed to be self-explanatory for landlords who have never used it before." },
      { q: "Is the Verification ID the same as an ESA registration?", a: "No — they are completely different. ESA registries and online databases have no legal standing under federal law. PawTenant's Verification ID is not a registry — it is a cryptographic proof of authenticity tied to a specific letter issued by a specific licensed professional. It verifies the letter itself, not a database entry. This distinction matters: landlords who are familiar with fair housing law will recognize the difference." }
    ]
  },
  {
    id: "process",
    label: "PawTenant Process",
    icon: "ri-shield-check-line",
    faqs: [
      { q: "How does PawTenant's process work?", a: "It's simple: (1) Complete our mental health questionnaire, (2) Schedule a secure video or phone consultation with a licensed mental health professional in your state, (3) If the professional determines an ESA is appropriate, they write and sign your letter, typically delivered within 24 hours. Our 100% money-back guarantee means you're protected." },
      { q: "Are PawTenant's professionals actually licensed?", a: "Absolutely. Every mental health professional in our network is a licensed clinical psychologist, LCSW, LPC, LMFT, or psychiatrist, verified by our credentialing team. We only work with licensed professionals — no coaches, life coaches, or unlicensed counselors." },
      { q: "What is PawTenant's money-back guarantee?", a: "If your ESA letter is not accepted by your landlord or university for a legitimate reason (not due to animal-specific issues), we will refund your payment in full. No questions asked. See our No Risk Guarantee page for full details." },
      { q: "How quickly will I receive my ESA letter?", a: "Most clients receive their ESA letter within 24 hours of completing their consultation. Rush processing is available for urgent situations — contact our support team at hello@pawtenant.com." },
      { q: "What states does PawTenant serve?", a: "PawTenant serves all 50 states. Our licensed professionals are credentialed in each state, ensuring your ESA letter meets state-specific requirements." }
    ]
  }
];

export default function FAQsPage() {
  const [activeCategory, setActiveCategory] = useState("general");
  const activeData = faqCategories.find((c) => c.id === activeCategory)!;

  const faqSchema = faqCategories.flatMap((cat) =>
    cat.faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": { "@type": "Answer", "text": faq.a }
    }))
  );

  return (
    <main>
      <title>ESA FAQs 2026: Emotional Support Animal Questions Answered | PawTenant</title>
      <meta name="description" content="Answers to every ESA question — letters, housing rights, college dorms, airline travel, and more. Expert guidance from PawTenant's licensed mental health professionals." />
      <meta name="keywords" content="ESA FAQs, emotional support animal questions, ESA letter questions, ESA housing rights FAQ, ESA college dorm FAQ" />
      <link rel="canonical" href="https://www.pawtenant.com/faqs" />
      <meta property="og:title" content="ESA FAQs 2026 | PawTenant" />
      <meta property="og:description" content="Every ESA question answered: letters, housing rights, college dorms, airline travel, landlord rights, and more from PawTenant." />
      <meta property="og:url" content="https://www.pawtenant.com/faqs" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ESA FAQs 2026: Every Emotional Support Animal Question Answered | PawTenant" />
      <meta name="twitter:description" content="Answers to every ESA question — letters, housing rights, college dorms, airline travel, landlord obligations, and the PawTenant process." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqSchema }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="bg-[#fdf8f3] pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
            Help Center
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h1>
          <p className="text-gray-500 text-base max-w-xl mx-auto leading-relaxed">
            Everything you need to know about ESA letters, your housing rights, and how PawTenant can help. Can&apos;t find your answer? Contact us directly.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a href="mailto:hello@pawtenant.com" className="whitespace-nowrap px-5 py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer">
              Email Us
            </a>
            <a href="tel:+14099655885" className="whitespace-nowrap px-5 py-2.5 border border-orange-300 text-orange-600 font-semibold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer">
              Call Us
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
            {/* Categories Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 px-3">Categories</p>
                {faqCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer text-left whitespace-nowrap ${
                      activeCategory === cat.id
                        ? "bg-orange-50 text-orange-600"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <i className={`${cat.icon} ${activeCategory === cat.id ? "text-orange-500" : "text-gray-400"}`}></i>
                    </div>
                    {cat.label}
                  </button>
                ))}
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="bg-orange-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-900 mb-1">Still have questions?</p>
                    <p className="text-xs text-gray-500 mb-3">Our team is happy to help.</p>
                    <a href="mailto:hello@pawtenant.com" className="whitespace-nowrap block text-center py-2 bg-orange-500 text-white font-semibold text-xs rounded-md hover:bg-orange-600 transition-colors cursor-pointer">
                      Contact Us
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ Accordion */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg">
                  <i className={`${activeData.icon} text-orange-500`}></i>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{activeData.label}</h2>
                <span className="ml-auto text-xs text-gray-400">{activeData.faqs.length} questions</span>
              </div>
              <div className="space-y-3">
                {activeData.faqs.map((faq, i) => (
                  <details key={i} className="bg-[#fdf8f3] rounded-xl border border-orange-100/70 group">
                    <summary className="flex items-start justify-between p-5 cursor-pointer list-none">
                      <span className="text-sm font-semibold text-gray-800 pr-4">{faq.q}</span>
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-add-line text-orange-500 group-open:hidden"></i>
                        <i className="ri-subtract-line text-orange-500 hidden group-open:block"></i>
                      </div>
                    </summary>
                    <div className="px-5 pb-5">
                      <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-[#fdf8f3]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to Get Your Letter?</h2>
          <p className="text-gray-500 text-sm mb-7 leading-relaxed">
            Join 12,000+ families who have protected their rights with a PawTenant letter. Fast, affordable, and backed by our 100% money-back guarantee.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-heart-line"></i>Get My ESA Letter — from $99
            </Link>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gray-900 text-white font-semibold text-sm rounded-md hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <i className="ri-mental-health-line"></i>Get My PSD Letter — from $120
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
