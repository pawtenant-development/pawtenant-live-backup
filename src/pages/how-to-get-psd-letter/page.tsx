import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const steps = [
  {
    number: "01",
    icon: "ri-file-text-line",
    title: "Complete Your Free Assessment",
    desc: "Answer a short questionnaire about your mental health condition, symptoms, and how they impact your daily life. This takes about 5 minutes and is completely confidential.",
  },
  {
    number: "02",
    icon: "ri-stethoscope-line",
    title: "Consult with a Licensed Mental Health Professional",
    desc: "A board-licensed psychologist, psychiatrist, or therapist reviews your answers and schedules a brief telehealth consultation to evaluate your psychiatric service dog needs.",
  },
  {
    number: "03",
    icon: "ri-shield-check-line",
    title: "Receive Your PSD Letter",
    desc: "If you qualify, your licensed professional issues a signed psychiatric service dog letter on official letterhead — delivered digitally within 24–48 hours, ready to use.",
  },
];

const qualifyingConditions = [
  { icon: "ri-mental-health-line", label: "PTSD" },
  { icon: "ri-heart-pulse-line", label: "Anxiety Disorders" },
  { icon: "ri-cloudy-line", label: "Depression" },
  { icon: "ri-brain-line", label: "Bipolar Disorder" },
  { icon: "ri-focus-3-line", label: "ADHD" },
  { icon: "ri-user-unfollow-line", label: "Schizophrenia" },
  { icon: "ri-alarm-warning-line", label: "Panic Disorder" },
  { icon: "ri-group-line", label: "Social Anxiety" },
  { icon: "ri-contrast-drop-line", label: "OCD" },
  { icon: "ri-emotion-unhappy-line", label: "Phobias" },
];

const comparisonRows = [
  { category: "Legal Basis", psd: "Americans with Disabilities Act (ADA) + FHA", esa: "Fair Housing Act (FHA) Only" },
  { category: "Public Access Rights", psd: "Yes — restaurants, stores, hotels, flights", esa: "No — housing only" },
  { category: "Task Training Required", psd: "Yes — must perform specific psychiatric tasks", esa: "No training required" },
  { category: "Housing Protection", psd: "Full protection under FHA", esa: "Full protection under FHA" },
  { category: "Airline Travel", psd: "Yes — allowed in cabin under ACAA rules", esa: "No longer required after 2021 DOT rule" },
  { category: "Letter Required", psd: "PSD letter from licensed mental health professional", esa: "ESA letter from licensed mental health professional" },
  { category: "Cost", psd: "Similar to ESA letter evaluation", esa: "Typically $100–$200" },
];

const psdTasks = [
  { icon: "ri-alarm-line", title: "Medication Reminders", desc: "Nudging or alerting their handler to take prescribed psychiatric medications on schedule." },
  { icon: "ri-shield-line", title: "Grounding During Dissociation", desc: "Applying deep pressure therapy or tactile stimulation to bring the handler back to the present moment." },
  { icon: "ri-alarm-warning-line", title: "Interrupting Harmful Behaviors", desc: "Intervening when a handler begins self-harming behaviors such as skin-picking or scratching." },
  { icon: "ri-eye-line", title: "Room Checks", desc: "Checking rooms before entry for handlers with PTSD who experience hypervigilance or paranoia." },
  { icon: "ri-group-line", title: "Creating Personal Space", desc: "Providing a physical barrier between the handler and others in crowded environments to reduce anxiety." },
  { icon: "ri-heart-pulse-line", title: "Panic Attack Response", desc: "Responding to signs of a panic attack with learned calming behaviors to reduce episode severity." },
];

const faqs = [
  {
    q: "What qualifies as a psychiatric service dog letter?",
    a: "A psychiatric service dog letter (PSD letter) is an official document written and signed by a licensed mental health professional — such as a psychologist, psychiatrist, therapist, or licensed clinical social worker — that states you have a qualifying psychiatric or mental health condition and that a psychiatric service dog is medically necessary to help manage your symptoms.",
  },
  {
    q: "How is a PSD letter different from an ESA letter?",
    a: "An ESA letter covers emotional support animals that provide comfort through companionship — these are protected in housing only. A psychiatric service dog letter covers a dog trained to perform specific tasks that mitigate symptoms of a mental health condition, granting the dog full public access rights under the ADA in addition to housing protections under the FHA.",
  },
  {
    q: "Can I get a PSD letter online?",
    a: "Yes. Telehealth evaluations with licensed mental health professionals are legally valid for PSD letters in all 50 states. The process is the same as an in-person evaluation — the licensed professional assesses your condition, verifies it meets DSM-5 criteria, and issues the letter if you qualify. PawTenant connects you with licensed professionals who specialize in these evaluations.",
  },
  {
    q: "Does my dog need to be certified to get a PSD letter?",
    a: "No — the ADA does not require service dogs to be certified or registered. Your dog must be trained to perform at least one specific task that directly mitigates your psychiatric disability, but there is no official government certification requirement. The PSD letter documents your medical need; your dog's task training demonstrates their service dog status.",
  },
  {
    q: "How long does it take to get a psychiatric service dog letter?",
    a: "Most evaluations through PawTenant are completed within 24–48 hours. After completing your free assessment and telehealth consultation with a licensed professional, your letter is typically delivered digitally the same or next business day if you qualify.",
  },
  {
    q: "Can a landlord reject a psychiatric service dog?",
    a: "No. Under the Fair Housing Act, landlords must provide reasonable accommodation for psychiatric service dogs regardless of no-pet policies or breed/weight restrictions. Landlords may ask two questions: (1) Is this a service dog required because of a disability? (2) What task has the dog been trained to perform? They cannot ask for medical records or require certification.",
  },
  {
    q: "Which mental health conditions qualify for a PSD letter?",
    a: "Any DSM-5 recognized psychiatric condition may qualify, including PTSD, generalized anxiety disorder, major depression, bipolar disorder, schizophrenia, ADHD, OCD, panic disorder, social anxiety disorder, and phobias. The key requirement is that your condition substantially limits one or more major life activities and that a psychiatric service dog would perform tasks to directly mitigate those limitations.",
  },
  {
    q: "Is a PSD letter valid for air travel?",
    a: "For domestic flights, most U.S. airlines now treat psychiatric service dogs under the same rules as other service dogs following the 2021 DOT rule change. Each airline has its own forms and notice requirements. Your PSD letter from a licensed professional is a key document for airline accommodation requests, though airlines may also require their own documentation forms.",
  },
];

export default function HowToGetPSDLetterPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main>
      <title>Get a PSD Letter | Psychiatric Service Dog Documentation</title>
      <meta name="description" content="Qualify for a Psychiatric Service Dog (PSD) letter through a professional clinical evaluation. Licensed US providers and HIPAA-compliant process." />
      <meta name="keywords" content="get psd letter, psychiatric service dog letter, psd documentation, service dog evaluation" />
      <link rel="canonical" href="https://www.pawtenant.com/how-to-get-psd-letter/" />
      <meta property="og:title" content="Get a PSD Letter | Psychiatric Service Dog Documentation" />
      <meta property="og:description" content="Qualify for a Psychiatric Service Dog (PSD) letter through a professional clinical evaluation. Licensed US providers and HIPAA-compliant process." />
      <meta property="og:url" content="https://www.pawtenant.com/how-to-get-psd-letter/" />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="How to Get a PSD Letter (Psychiatric Service Dog) 2026 | PawTenant" />
      <meta name="twitter:description" content="Step-by-step guide to getting a psychiatric service dog letter online. Licensed professionals, 24–48 hour delivery, valid in all 50 states." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(faq => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": { "@type": "Answer", "text": faq.a }
        }))
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-24">
        <div className="absolute inset-0">
          <img
            src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/925edf71-8f53-4f8f-8180-12a475777e58_How-to-Get-a-Psychiatric-Service-Dog-Letter.jpg?v=d622f9279132e3d201c18ec9bc2a95ab"
            alt="How to get a psychiatric service dog PSD letter from a licensed mental health professional online"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/25"></div>
        </div>
        <div className="relative w-full max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-400 mb-4">
              Psychiatric Service Dog Letter
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              How to Get a Psychiatric Service Dog Letter
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              A psychiatric service dog letter (PSD letter) grants your trained dog full public access rights under the ADA — not just housing protections. Learn exactly how to qualify, what tasks your dog must perform, and how to get your PSD letter online in as little as 24 hours.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-stethoscope-line"></i>
                Start Free Assessment
              </Link>
              <a
                href="#how-it-works"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-white/15 border border-white/30 text-white font-semibold rounded-md hover:bg-white/25 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-down-line"></i>
                See How It Works
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-6 mt-8">
              <div className="flex items-center gap-2 text-white/75 text-xs">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-check-line text-orange-400"></i></div>
                Licensed mental health professionals
              </div>
              <div className="flex items-center gap-2 text-white/75 text-xs">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-check-line text-orange-400"></i></div>
                Valid in all 50 states
              </div>
              <div className="flex items-center gap-2 text-white/75 text-xs">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-check-line text-orange-400"></i></div>
                Delivered in 24–48 hours
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Is a PSD Letter */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-stretch">
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">What Is It?</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">What Is a Psychiatric Service Dog Letter?</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                A <strong>psychiatric service dog letter</strong> is an official document issued by a licensed mental health professional — a psychologist, psychiatrist, therapist, or licensed clinical social worker — confirming that you have a qualifying psychiatric disability and that a trained service dog is a medically necessary part of your treatment plan.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Unlike an ESA letter (which only covers housing), a psychiatric service dog letter combined with proper task training gives your dog full public access rights under the Americans with Disabilities Act. Your PSD can go with you to restaurants, grocery stores, hotels, workplaces, and on most flights.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                The key distinction: your dog must be trained to perform at least one specific task that directly mitigates your psychiatric symptoms. Providing comfort alone is not enough for PSD status — that&apos;s ESA territory. Tasks like interrupting panic attacks, performing room checks for PTSD, or reminding you to take medication are what elevate a dog to service dog status.
              </p>
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-information-line text-orange-500 text-lg"></i>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  <strong className="text-gray-900">Good to know:</strong> Your dog does not need to be professionally trained or certified to qualify. Owner-trained psychiatric service dogs are fully recognized under the ADA — the letter documents your medical need, and your dog&apos;s task training demonstrates their service dog status.
                </p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/626a4b1c-6e1e-4903-b4bd-b67a5b1e37f7_What-is-a-PSD-Letter.jpg?v=8af77abe89f837f83927117fef15ce63"
                alt="What is a psychiatric service dog PSD letter — official documentation for housing and travel rights"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Who Qualifies */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Qualifying Conditions</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Who Qualifies for a PSD Letter?</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              Any DSM-5 recognized psychiatric condition that substantially limits one or more major life activities may qualify. These are the most common conditions our licensed professionals evaluate:
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
            Don&apos;t see your condition listed? <Link to="/psd-assessment" className="text-orange-500 font-semibold hover:underline cursor-pointer">Start your free assessment</Link> — many other qualifying conditions exist under DSM-5 criteria.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">The Process</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How to Get Your Psychiatric Service Dog Letter</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">Three straightforward steps — the entire process can be completed online, from home, in as little as 24 hours.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-orange-100"></div>
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center text-center relative">
                <div className="relative mb-6">
                  <div className="w-20 h-20 flex items-center justify-center rounded-full bg-orange-500">
                    <i className={`${step.icon} text-white text-2xl`}></i>
                  </div>
                  <span className="absolute -top-2 -right-2 bg-white border border-orange-200 text-orange-500 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{step.number}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-arrow-right-line"></i>
              Begin Your Free Assessment
            </Link>
          </div>
        </div>
      </section>

      {/* PSD Tasks */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-stretch">
            <div className="flex flex-col">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Task Training</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">What Tasks Must a Psychiatric Service Dog Perform?</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-5">
                To qualify as a psychiatric service dog — rather than an emotional support animal — your dog must be trained to perform at least one specific task that directly mitigates the effects of your psychiatric disability. The ADA requires the task to be directly related to the disability.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                The good news: tasks don&apos;t need to be complicated. What matters is that the behavior is trained (not natural instinct) and that it specifically addresses your disability&apos;s symptoms. Here are examples of recognized psychiatric service dog tasks:
              </p>
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-stethoscope-line"></i>
                See If You Qualify
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {psdTasks.map((task) => (
                <div key={task.title} className="bg-white rounded-xl p-5 border border-orange-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-orange-50">
                      <i className={`${task.icon} text-orange-500`}></i>
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">{task.title}</h3>
                  </div>
                  <p className="text-gray-500 text-xs leading-relaxed">{task.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PSD vs ESA Comparison */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Know the Difference</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">PSD Letter vs. ESA Letter: Full Comparison</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Understanding the difference between a psychiatric service dog letter and an ESA letter is crucial — the legal protections are significantly different.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-gray-100">
            <table className="w-full">
              <thead>
                <tr className="bg-orange-500">
                  <th className="text-left text-white text-xs font-semibold px-6 py-4">Category</th>
                  <th className="text-left text-white text-xs font-semibold px-6 py-4">Psychiatric Service Dog (PSD)</th>
                  <th className="text-left text-white text-xs font-semibold px-6 py-4">Emotional Support Animal (ESA)</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.category} className={i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-700">{row.category}</td>
                    <td className="px-6 py-4 text-xs text-gray-600">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                          <i className="ri-check-line text-orange-500 text-sm"></i>
                        </div>
                        {row.psd}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{row.esa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm mb-5">Not sure which letter you need? Our licensed professionals will help determine the best option during your evaluation.</p>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-stethoscope-line"></i>
              Get Evaluated Today
            </Link>
          </div>
        </div>
      </section>

      {/* Why PawTenant */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-stretch">
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0"
                alt="Licensed mental health professional conducting telehealth PSD letter consultation for psychiatric service dog"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Why PawTenant</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Why Get Your PSD Letter Through PawTenant?</h2>
              <div className="space-y-5">
                {[
                  { icon: "ri-user-star-line", title: "Board-Licensed Professionals Only", desc: "Every evaluation is conducted by a licensed psychologist, psychiatrist, therapist, or LCSW — never an algorithm or non-licensed staff." },
                  { icon: "ri-shield-check-line", title: "HIPAA-Compliant & Confidential", desc: "All consultations and records are fully HIPAA compliant. Your mental health information is never shared or sold." },
                  { icon: "ri-time-line", title: "24–48 Hour Turnaround", desc: "Most PSD letter evaluations are completed and letters delivered within one to two business days of your consultation." },
                  { icon: "ri-refresh-line", title: "No-Risk Guarantee", desc: "If your letter is ever questioned, our licensed professionals will provide supporting documentation at no additional charge." },
                  { icon: "ri-map-pin-2-line", title: "Valid in All 50 States", desc: "Our network of licensed professionals covers every state, so your psychiatric service dog letter is valid nationwide." },
                ].map((point) => (
                  <div key={point.title} className="flex items-start gap-4">
                    <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-50 flex-shrink-0">
                      <i className={`${point.icon} text-orange-500`}></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{point.title}</h3>
                      <p className="text-gray-500 text-xs leading-relaxed">{point.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PSD Pricing */}
      <section className="py-16 bg-white" id="pricing">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Transparent Pricing</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">PSD Letter Pricing</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Choose the delivery speed that works for you. All packages include a licensed professional consultation and a fully compliant PSD letter — valid in all 50 states.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: "Standard",
                speed: "2–3 Business Days",
                price: "$100",
                popular: false,
                features: [
                  "Official PSD Letter from Licensed LMHP",
                  "ADA & FHA Compliant",
                  "Licensed Professional Signature & NPI",
                  "PDF Delivery via Email",
                  "Valid for 1 Year",
                  "Landlord & Airline Verification Support",
                ],
              },
              {
                name: "Priority",
                speed: "Within 24 Hours",
                price: "$120",
                popular: true,
                features: [
                  "Official PSD Letter from Licensed LMHP",
                  "ADA & FHA Compliant",
                  "Licensed Professional Signature & NPI",
                  "PDF Delivery via Email",
                  "Valid for 1 Year",
                  "Landlord & Airline Verification Support",
                  "Same-Day Priority Processing",
                ],
              },
              {
                name: "Annual Subscription",
                speed: "Per Year — Auto-Renews",
                price: "$99/yr",
                popular: false,
                features: [
                  "Official PSD Letter from Licensed LMHP",
                  "ADA & FHA Compliant",
                  "Licensed Professional Signature & NPI",
                  "PDF Delivery via Email",
                  "Annual Renewal — Renews Automatically",
                  "Landlord & Airline Verification Support",
                ],
              },
            ].map((plan) => (
              <div key={plan.name} className={`relative bg-white rounded-2xl border-2 p-8 flex flex-col ${plan.popular ? "border-orange-500" : "border-gray-200"}`}>
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">Most Popular</span>
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="text-gray-900 font-bold text-base mb-1">{plan.name}</h3>
                  <p className="text-gray-400 text-xs mb-4">{plan.speed}</p>
                  <div className="flex items-end gap-1">
                    <p className="text-4xl font-extrabold text-gray-900">{plan.price}</p>
                    <p className="text-sm text-gray-400 mb-1">/ 1 dog</p>
                  </div>
                </div>
                <ul className="space-y-2 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500 text-base"></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/psd-assessment"
                  className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${plan.popular ? "bg-orange-500 text-white hover:bg-orange-600" : "border-2 border-orange-500 text-orange-500 hover:bg-orange-50"}`}
                >
                  Start Free Assessment
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <i className="ri-shield-check-line text-orange-500 text-lg"></i>
              <strong>100% Money-Back Guarantee</strong> — If you don&apos;t qualify, you pay nothing.
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-20 bg-orange-500 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://readdy.ai/api/search-image?query=abstract%20warm%20pattern%20texture%20subtle%20organic%20shapes%20soft%20warm%20orange%20tones%20minimal%20background%20design&width=1440&height=400&seq=psdletter-cta01&orientation=landscape"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative w-full max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Get Your Psychiatric Service Dog Letter?</h2>
          <p className="text-white/85 text-sm leading-relaxed mb-8 max-w-xl mx-auto">
            Start with a free 5-minute assessment. A licensed mental health professional will review your answers and reach out to complete your PSD letter evaluation — all online, all confidential.
          </p>
          <Link
            to="/psd-assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-white text-orange-500 font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <i className="ri-stethoscope-line"></i>
            Start Free Assessment
          </Link>
          <p className="text-white/60 text-xs mt-4">No commitment · Confidential · Results in 24–48 hours</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Common Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions About PSD Letters</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
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

      {/* Related Links */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h4 className="text-sm font-bold text-gray-900 mb-6"><a id="related-resources" href="#related-resources">Related Resources</a></h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { to: "/all-about-service-dogs", icon: "ri-service-line", title: "All About Service Dogs", desc: "Breeds, training, ADA rights, and certification explained." },
              { to: "/how-to-get-esa-letter", icon: "ri-heart-line", title: "How to Get an ESA Letter", desc: "Step-by-step guide to qualifying for an ESA letter." },
              { to: "/service-animal-vs-esa", icon: "ri-scales-line", title: "Service Animal vs. ESA", desc: "Full breakdown of legal differences and rights." },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", title: "Housing Rights & ESA", desc: "What landlords can and cannot ask under the FHA." },
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
