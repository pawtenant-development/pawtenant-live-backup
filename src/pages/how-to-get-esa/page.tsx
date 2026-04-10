import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";
import { useState } from "react";

const steps = [
  {
    num: "01",
    title: "Complete Your Assessment",
    desc: "Fill out our simple online form about your situation and ESA requirements. It only takes a few minutes and helps us understand your needs so we can assist you in discovering if your favorite emotional support animal qualifies.",
    icon: "ri-file-list-3-line",
  },
  {
    num: "02",
    title: "Consult with a Licensed Physician",
    desc: "After filling in all necessary documents or forms, you will be connected with a licensed and qualified medical doctor to speak with you one-on-one and evaluate you regarding your potential to qualify for an ESA.",
    icon: "ri-stethoscope-line",
  },
  {
    num: "03",
    title: "Receive Your ESA Letter",
    desc: "Our licensed medical professional will validate your letter and you will receive your ESA letter in as little as 24 hours. The letter is certified by an LHCF which includes legal weight just for you.",
    icon: "ri-mail-check-line",
  },
];

const stats = [
  { value: "23%", label: "of Americans suffer from some form of mental illness" },
  { value: "60%", label: "claimed that having a therapy pet helped their mental health" },
  { value: "80%+", label: "pet owners don't know they can qualify for an ESA letter" },
];

const esaTips = [
  {
    icon: "ri-file-text-line",
    color: "orange",
    title: "Verify Your Letter Contains Key Information",
    tips: [
      "License number, issue date, state, and the license type must be clearly stated",
      "Your name plus a statement confirming a recognized mental/emotional disability",
      "A clear declaration that the animal is necessary for your treatment or recovery",
      "Provider's signature in ink and on official letterhead",
    ],
  },
  {
    icon: "ri-home-heart-line",
    color: "teal",
    title: "Know Your Housing Rights",
    tips: [
      "Under the Fair Housing Act, landlords must make reasonable accommodations for ESA owners",
      "You cannot be charged a pet deposit or pet fee for your ESA",
      "Your landlord may request documentation but cannot demand medical records",
      "If denied, you have the right to file a complaint with HUD",
    ],
  },
  {
    icon: "ri-refresh-line",
    color: "amber",
    title: "Keep Your Letter Current",
    tips: [
      "ESA letters are typically valid for 12 months — renew annually",
      "Some landlords and airlines may require a letter dated within the past year",
      "Keep a digital copy saved securely and a printed backup at home",
      "Notify your provider promptly if your situation or animal changes",
    ],
  },
  {
    icon: "ri-shield-check-line",
    color: "green",
    title: "Protect Yourself from Scams",
    tips: [
      "Never purchase from sites that skip the mental health evaluation entirely",
      "Legitimate letters require a real consultation with a licensed professional",
      "Avoid any service that guarantees approval without an assessment",
      "Always verify the license number of the signing professional",
    ],
  },
  {
    icon: "ri-user-heart-line",
    color: "rose",
    title: "Communicate Effectively with Your Landlord",
    tips: [
      "Submit your ESA request in writing and keep a copy for your records",
      "Provide your ESA letter promptly when requested — don't delay",
      "Introduce your animal calmly and demonstrate responsible ownership",
      "If issues arise, contact a housing advocacy group for guidance",
    ],
  },
  {
    icon: "ri-heart-pulse-line",
    color: "violet",
    title: "Maximize Your ESA's Benefits",
    tips: [
      "Establish a consistent daily routine with your ESA to maximize emotional benefits",
      "Pair your ESA support with ongoing therapy or counseling for best results",
      "Ensure your animal is properly trained, socialized, and well cared for",
      "Talk to your mental health professional about integrating your ESA into your treatment plan",
    ],
  },
];

const tipColorMap: Record<string, { bg: string; icon: string; badge: string; dot: string }> = {
  orange: { bg: "bg-orange-50 border-orange-100", icon: "text-orange-500 bg-orange-100", badge: "bg-orange-500 text-white", dot: "text-orange-500" },
  teal: { bg: "bg-teal-50 border-teal-100", icon: "text-teal-600 bg-teal-100", badge: "bg-teal-500 text-white", dot: "text-teal-500" },
  amber: { bg: "bg-amber-50 border-amber-100", icon: "text-amber-600 bg-amber-100", badge: "bg-amber-500 text-white", dot: "text-amber-500" },
  green: { bg: "bg-green-50 border-green-100", icon: "text-green-600 bg-green-100", badge: "bg-green-600 text-white", dot: "text-green-500" },
  rose: { bg: "bg-rose-50 border-rose-100", icon: "text-rose-500 bg-rose-100", badge: "bg-rose-500 text-white", dot: "text-rose-500" },
  violet: { bg: "bg-violet-50 border-violet-100", icon: "text-violet-600 bg-violet-100", badge: "bg-violet-600 text-white", dot: "text-violet-500" },
};

const whyItems = [
  {
    title: "Experienced Professionals You Can Trust",
    desc: "Our licensed team knows the laws in every state and has years of experience providing ESA letters that meet all legal standards.",
    icon: "ri-shield-check-line",
  },
  {
    title: "A Support Team That Cares",
    desc: "We are here to help you every step of the way — from setting up your appointment to making sure your ESA letter is legally valid.",
    icon: "ri-heart-line",
  },
  {
    title: "Available Across the State",
    desc: "No matter where you are, we have licensed professionals ready to assist in your area.",
    icon: "ri-map-pin-line",
  },
  {
    title: "Honest and Lawful Process",
    desc: "All evaluations follow all legal rules. We only issue ESA letters after a proper mental health review — no shortcuts.",
    icon: "ri-scales-line",
  },
  {
    title: "Quick and Safe Delivery",
    desc: "Once your letter is approved, we will send it to you digitally. It is fast, secure, and ready to use right away.",
    icon: "ri-send-plane-line",
  },
  {
    title: "100% Money-Back Guarantee",
    desc: "Your satisfaction is guaranteed. If your legitimate ESA letter doesn't work for any reason, we will give you a full refund.",
    icon: "ri-refund-2-line",
  },
];

const faqs = [
  { q: "What is an Emotional Support Animal?", a: "An ESA is a companion animal that provides emotional support to individuals with mental or emotional disabilities. Unlike service animals, ESAs do not require specific training, but they do require a valid ESA letter from a licensed mental health professional." },
  { q: "Who qualifies for an ESA letter?", a: "Anyone experiencing a mental or emotional health condition recognized by the DSM-5 may qualify, including anxiety, depression, PTSD, bipolar disorder, phobias, and many others. Our licensed professionals will conduct a proper evaluation to determine eligibility." },
  { q: "How long does the process take?", a: "The online assessment takes about 5–10 minutes. Once connected with our licensed professional and your evaluation is complete, you'll receive your ESA letter digitally within 24 hours." },
  { q: "Is an online ESA evaluation legitimate?", a: "Yes — telehealth consultations are fully legal and accepted. What matters is that your evaluation is conducted by a licensed mental health professional who follows proper protocols." },
  { q: "How long is an ESA letter valid?", a: "ESA letters are typically valid for one year. We recommend annual renewal to ensure your letter remains current and compliant with your landlord's requirements." },
  { q: "Can my landlord refuse my ESA?", a: "Under the Fair Housing Act, landlords must make reasonable accommodations for tenants with ESAs. They can only refuse if the animal poses a direct safety threat or would cause undue hardship to the property." },
];

export default function HowToGetESAPage() {
  return (
    <main>
      <title>How to Get an ESA Letter | Fast 3-Step Online Process</title>
      <meta name="description" content="Start your ESA evaluation today. Complete our quick assessment, consult with a licensed professional, and receive your legal housing letter. HIPAA-compliant." />
      <meta name="keywords" content="how to get an ESA letter, ESA assessment, online ESA evaluation, get ESA letter fast" />
      <link rel="canonical" href="https://www.pawtenant.com/how-to-get-esa-letter" />
      <meta property="og:title" content="How to Get an ESA Letter | Fast 3-Step Online Process" />
      <meta property="og:description" content="Start your ESA evaluation today. Complete our quick assessment, consult with a licensed professional, and receive your legal housing letter. HIPAA-compliant." />
      <meta property="og:url" content="https://www.pawtenant.com/how-to-get-esa-letter" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=warm%20cozy%20home%20interior%20with%20a%20person%20sitting%20comfortably%20on%20a%20sofa%20with%20their%20dog%20a%20golden%20retriever%20soft%20natural%20light%20streaming%20through%20windows%20calming%20and%20peaceful%20atmosphere%20warm%20tones%20beige%20and%20cream%20home%20setting&width=1440&height=600&seq=howesa01&orientation=landscape"
            alt="Get an ESA Letter"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">
              Simple 3-Step Process
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              How to Get an ESA Letter
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              Get your ESA letter smoothly through PawTenant. Our licensed mental health professionals make the process easy, legal, and stress-free.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line"></i>
                Find Out If You Qualify
              </Link>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <i className="ri-refresh-line text-orange-400"></i>
                100% Money-Back Guarantee
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 bg-orange-500">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {stats.map((s) => (
              <div key={s.value} className="text-center">
                <p className="text-5xl font-black text-white mb-2">{s.value}</p>
                <p className="text-orange-100 text-sm leading-relaxed max-w-xs mx-auto">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro Text */}
      <section className="py-14 bg-[#fdf6ee]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Our Mission</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">We Make Getting Your ESA Letter Simple</h2>
          <p className="text-gray-600 text-base leading-relaxed">
            Get your ESA letter swiftly through PawTenant. Your feedback is precious to us. Feel free to ask your queries, or share any concern. We are here to help you in every case — dedicated to offering the finest customer service so you can easily get your ESA letter.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Quick & Easy</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Explore Quick and Easy Way to Obtain Your Legitimate ESA Letter With PawTenant
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="relative bg-[#fdf6ee] rounded-2xl p-8 border border-orange-100">
                <div className="absolute -top-4 left-8">
                  <span className="inline-block px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">
                    Step {step.num}
                  </span>
                </div>
                <div className="w-12 h-12 flex items-center justify-center bg-orange-500 rounded-xl mb-5 mt-3">
                  <i className={`${step.icon} text-white text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-search-line"></i>
              Find Out If You Qualify
            </Link>
          </div>
        </div>
      </section>

      {/* What Is ESA */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Understanding ESAs</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">What Is an Emotional Support Animal?</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                An ESA is a supportive companion for people who have emotional and mental disabilities. These animals provide invaluable comfort and assistance, which improves mental wellbeing of people.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                As the body of knowledge about mental health matters grows, it is more likely a physician has to diagnose conditions he or she may have recognized before. Frequently, an ESA is part of someone's path to recovery.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Although ESAs are not service animals trained to do specific tasks, they have a noticeable impact on a person's life. ESAs give people a sense of calming comfort that can help them get through their mental health challenges.
              </p>
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-file-text-line"></i>
                Get an ESA Letter Now
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="https://readdy.ai/api/search-image?query=person%20hugging%20their%20dog%20a%20labrador%20indoors%20warm%20natural%20light%20close%20emotional%20bond%20between%20human%20and%20pet%20cozy%20home%20background%20soft%20tones%20beige%20and%20warm%20white%20emotional%20support%20calming%20portrait&width=700&height=500&seq=howesa02&orientation=landscape"
                alt="Emotional Support Animal"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why Do I Need */}
      <section className="py-16 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="https://readdy.ai/api/search-image?query=woman%20sitting%20peacefully%20in%20a%20bright%20living%20room%20with%20her%20cat%20on%20her%20lap%20looking%20calm%20and%20relaxed%20warm%20sunlight%20plants%20in%20background%20cozy%20home%20environment%20natural%20tones%20mental%20wellness&width=700&height=500&seq=howesa03&orientation=landscape"
                alt="Why need an ESA letter"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-200 mb-3">Why It Matters</span>
              <h2 className="text-3xl font-bold text-white mb-8">Why Do I Need an ESA Letter?</h2>
              {[
                { title: "Your Emotional Support", desc: "Having an emotional support animal gives a therapeutic effect on your life. A valid ESA letter confirms that an emotional support animal can help you improve your mental health. Healthcare professionals also recommend ESAs for depression, anxiety, and PTSD patients." },
                { title: "Your Mental Health", desc: "Your letter will be reviewed by a qualified mental health professional before they offer an ESA letter. They shall conduct a thorough assessment of your mental health and then conclude if an ESA should be a suitable treatment for you." },
                { title: "Your Right to Quality of Life", desc: "Discuss your symptoms, challenges, and reasons why you think an emotional support animal would improve your quality of life with your therapist. If the professional agrees, they will write a legally accepted ESA letter." },
              ].map((item) => (
                <div key={item.title} className="mb-6 bg-white/10 rounded-xl px-5 py-4">
                  <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-orange-100 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-white text-orange-600 font-semibold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-sm mt-2"
              >
                <i className="ri-search-line"></i>
                Find Out If You Qualify
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Tips for ESA Letter Holder — Enhanced */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Expert Advice</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Tips for an ESA Letter Holder</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto leading-relaxed">
              Once you receive your ESA letter, knowing how to use it properly is just as important. Here is everything you need to know to protect your rights and get the most out of your ESA.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {esaTips.map((tip, i) => {
              const colors = tipColorMap[tip.color];
              return (
                <div key={i} className={`rounded-2xl p-6 border ${colors.bg}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${colors.icon}`}>
                      <i className={`${tip.icon} text-lg`}></i>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 leading-snug">{tip.title}</h3>
                  </div>
                  <ul className="space-y-3">
                    {tip.tips.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className={`ri-checkbox-circle-fill text-sm ${colors.dot}`}></i>
                        </div>
                        <p className="text-gray-600 text-xs leading-relaxed">{item}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-file-text-line"></i>
              Get Your ESA Letter Now
            </Link>
          </div>
        </div>
      </section>

      {/* What to Avoid */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-red-500 mb-3">Stay Protected</span>
            <h2 className="text-2xl font-bold text-gray-900">What to Avoid When Getting an ESA Letter</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-white border border-red-100 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center bg-red-50 rounded-lg">
                  <i className="ri-close-circle-line text-red-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm">Don&apos;t Fake ESA Letters</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Don&apos;t get ESA Letters from websites offering them without any assessment by a licensed professional. An authentic ESA letter involves consultation with a mental health professional.
              </p>
            </div>
            <div className="bg-white border border-red-100 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center bg-red-50 rounded-lg">
                  <i className="ri-alert-line text-red-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm">Be Wary of Online Scams</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Some websites guarantee your ESA letter without proper assessment. Deal only with trusted services like PawTenant which offer your ESA letter after a licensed professional&apos;s consultation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Why PawTenant</span>
            <h2 className="text-3xl font-bold text-gray-900">Why Choose Us?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyItems.map((item, i) => (
              <div key={i} className="bg-[#fdf6ee] rounded-xl p-6 border border-orange-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-500 rounded-lg mb-4">
                  <i className={`${item.icon} text-white text-lg`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <FAQAccordion faqs={faqs} />
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-orange-100 mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-white text-orange-600 font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      <SharedFooter />

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))]">
        <Link
          to="/assessment"
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
        >
          <i className="ri-file-text-line"></i>
          Get Your ESA Letter — From $99
        </Link>
      </div>
    </main>
  );
}

function FAQAccordion({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className={`text-sm font-semibold ${open === i ? "text-orange-500" : "text-gray-900"}`}>
              {faq.q}
            </span>
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
              <i className={`${open === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
            </div>
          </button>
          {open === i && (
            <div className="px-6 pb-4">
              <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
