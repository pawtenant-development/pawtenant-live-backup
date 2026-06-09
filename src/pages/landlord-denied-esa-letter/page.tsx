import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import { VeteransSupportSection } from "../../components/feature/SeoKit";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  ESA_LANDLORD_DENIAL_LAWS,
  getLandlordDenialLawBySlug,
} from "../../data/esaLandlordDenialLaws";

// ── Static content ───────────────────────────────────────────────────────────
const actionSteps = [
  {
    icon: "ri-search-eye-line",
    title: "Review why it was denied",
    desc: "Ask for the reason in writing. Many denials come from a misunderstanding — a no-pets policy, a pet-fee assumption, or confusion between an ESA and a service animal.",
  },
  {
    icon: "ri-file-check-line",
    title: "Confirm your documentation is complete",
    desc: "A valid request is supported by a letter from a licensed mental health provider who actually evaluated you, on letterhead with their license details.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Respond calmly in writing",
    desc: "Keep it short, factual, and polite. Reference the Fair Housing Act and your reasonable-accommodation request. Keep a dated copy for your records.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Provide reliable documentation when appropriate",
    desc: "If your need isn't obvious, the housing provider may ask for documentation of a disability and the disability-related need. You don't have to share a diagnosis or medical records.",
  },
  {
    icon: "ri-government-line",
    title: "Get local fair housing help if needed",
    desc: "If a valid request is still denied, you can contact HUD or a local fair housing agency. For serious conflicts, a tenant-rights attorney or legal-aid office can advise you.",
  },
];

const denialReasons = [
  {
    claim: "“We have a no-pets policy.”",
    response:
      "An assistance animal is not an ordinary pet. Under the Fair Housing Act, a no-pets policy by itself is generally not enough to deny a valid reasonable-accommodation request for an ESA.",
  },
  {
    claim: "“You need to pay pet rent or a pet deposit.”",
    response:
      "Pet fees, pet deposits, and pet rent generally do not apply to assistance animals. You do, however, remain responsible for any actual damage your animal causes.",
  },
  {
    claim: "“We only accept service animals.”",
    response:
      "Service animals (ADA) and emotional support animals (Fair Housing Act) are different. For housing specifically, ESAs are covered as assistance animals — a property cannot limit housing accommodations to ADA service animals only.",
  },
  {
    claim: "“Your letter must come from our own portal or vendor.”",
    response:
      "A housing provider can verify that your letter is genuine and from a licensed provider, but generally cannot require you to buy documentation from a specific company or internal portal.",
  },
  {
    claim: "“We have breed or weight restrictions.”",
    response:
      "Breed, size, and weight limits that exist for ordinary pets generally do not apply to assistance animals. A denial usually needs a specific, individualized reason — not a blanket rule.",
  },
  {
    claim: "“Online ESA letters are never valid.”",
    response:
      "What matters is a real evaluation by a licensed provider, not whether it happened in person or online. A letter from a licensed mental health professional who genuinely assessed you supports your request; instant, no-evaluation “registrations” are the real red flag.",
  },
];

const validRequestParts = [
  {
    icon: "ri-user-voice-line",
    title: "A clear request from you",
    desc: "A written reasonable-accommodation request asking to keep your assistance animal in your home.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Reliable provider documentation",
    desc: "A letter from a licensed mental health provider who evaluated you, with their name, license type, number, and state.",
  },
  {
    icon: "ri-heart-pulse-line",
    title: "A disability-related need",
    desc: "Documentation that you have a disability and that the animal helps with a symptom or effect of that disability.",
  },
  {
    icon: "ri-bear-smile-line",
    title: "Basic animal information",
    desc: "Where appropriate, simple details about the animal so the housing provider can process the request.",
  },
];

const landlordCanStill = [
  {
    icon: "ri-file-list-3-line",
    title: "Request reliable documentation",
    desc: "When your disability or need is not obvious, they may ask for documentation that reasonably supports it.",
  },
  {
    icon: "ri-alert-line",
    title: "Weigh genuine safety or damage concerns",
    desc: "In limited cases, a request can be denied if the specific animal would be a direct threat to others' health or safety, or would cause substantial physical damage — when supported by facts, not stereotypes.",
  },
  {
    icon: "ri-scales-3-line",
    title: "Consider undue burden",
    desc: "A request may be denied if it would impose an undue financial or administrative burden, or fundamentally alter the provider's operations.",
  },
  {
    icon: "ri-home-gear-line",
    title: "Enforce neutral rules",
    desc: "You can be held to reasonable, evenly-applied rules — responsibility for damage, leash/clean-up norms, and lawful housing procedures.",
  },
];

const faqs = [
  {
    q: "Can a landlord deny an ESA because of a no-pets policy?",
    a: "Usually not on that basis alone. An assistance animal is treated differently from a pet, so a no-pets policy by itself is generally not enough to deny a valid reasonable-accommodation request under the Fair Housing Act. Each request is still reviewed individually.",
  },
  {
    q: "Can a landlord charge pet rent or a pet deposit for an ESA?",
    a: "Generally no. Pet fees, pet deposits, and pet rent typically do not apply to assistance animals. You do remain responsible for any actual damage the animal causes to the property.",
  },
  {
    q: "Can a landlord ask for documentation?",
    a: "Yes, when your disability or your need for the animal is not obvious or already known. They may ask for reliable documentation of the disability and the disability-related need. They should not demand your specific diagnosis or full medical records.",
  },
  {
    q: "What if my landlord says online ESA letters are fake?",
    a: "What matters is whether a licensed provider actually evaluated you — not whether the visit was online or in person. A genuine letter from a licensed mental health professional supports your request. Instant, no-evaluation “registrations” or “certificates” are the real warning sign.",
  },
  {
    q: "What if my landlord ignores my request?",
    a: "Keep a dated written record of your request and any follow-ups. Undue delay can itself be a problem. If a valid request goes unanswered or is denied, you can contact HUD or a local fair housing agency, and consider a tenant-rights attorney or legal-aid office for serious conflicts.",
  },
  {
    q: "Does PawTenant guarantee my landlord will approve it?",
    a: "No. No legitimate service can guarantee approval. PawTenant connects you with a licensed mental health provider who decides whether you qualify after a real evaluation. A valid letter supports your housing request, but every accommodation is reviewed individually by your housing provider.",
  },
];

export default function LandlordDeniedESALetterPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [selectedSlug, setSelectedSlug] = useState<string>("california");

  const selected = getLandlordDenialLawBySlug(selectedSlug);

  return (
    <main>
      {/* SEO basics (title/description/canonical) come from CORE_PAGE_META via
          SEOManager + prerender. These add richer social + keyword metadata. */}
      <meta
        name="keywords"
        content="landlord denied ESA, ESA letter denied, landlord denied emotional support animal, ESA housing rights by state, Fair Housing Act ESA, reasonable accommodation ESA, can a landlord deny an ESA, ESA no pets policy, ESA pet fee"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Landlord Denied Your ESA? Your Fair Housing Rights by State | PawTenant" />
      <meta
        property="og:description"
        content="What to do if your landlord denies an emotional support animal request. Fair Housing Act basics, state-by-state guidance, and practical next steps."
      />
      <meta property="og:url" content="https://pawtenant.com/landlord-denied-esa-letter" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="Landlord Denied Your ESA? Know Your Housing Rights | PawTenant" />
      <meta
        name="twitter:description"
        content="Fair Housing Act basics, state-by-state guidance, and calm, practical next steps if your landlord pushed back on your ESA."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <SharedNavbar />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-white to-white pt-28 pb-16">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white border border-orange-200 rounded-full px-4 py-1.5 mb-6 shadow-sm">
              <i className="ri-home-heart-line text-orange-500 text-sm"></i>
              <span className="text-xs font-semibold tracking-wide uppercase text-orange-600">
                ESA Housing Rights
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Landlord Denied Your ESA Letter?
              <br />
              <span className="text-orange-500">Know Your Housing Rights</span>
            </h1>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
              A denial is not always the end of the conversation. Learn what the Fair Housing
              Act actually says, what landlords can and cannot do, and the calm, practical
              steps to respond — plus state-by-state guidance.
            </p>
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mb-5">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm shadow-sm"
              >
                <i className="ri-stethoscope-line"></i> Start ESA Evaluation
              </Link>
              <a
                href="#state-rules"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-map-pin-line"></i> Check My State Rules
              </a>
            </div>
            <p className="text-xs text-gray-400 max-w-xl mx-auto lg:mx-0">
              Educational information only — not legal advice. A licensed provider must review your
              request, and no service can guarantee landlord approval.
            </p>
          </div>

          {/* Right — hero visual */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] ring-1 ring-black/5 aspect-[4/3] bg-orange-100">
              <img
                src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                alt="Tenant settling into a new apartment with her emotional support dog"
                width={1000}
                height={750}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent"></div>
            </div>
            {/* Floating trust chip — FHA */}
            <div className="absolute -bottom-4 left-4 sm:left-6 bg-white rounded-2xl shadow-lg ring-1 ring-gray-100 px-4 py-3 flex items-center gap-3 max-w-[15rem]">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <i className="ri-scales-3-line text-emerald-600"></i>
              </div>
              <div>
                <p className="text-xs font-extrabold text-gray-900 leading-tight">Fair Housing Act</p>
                <p className="text-[11px] text-gray-500 leading-tight">Protects assistance animals in housing</p>
              </div>
            </div>
            {/* Floating chip — review, top right */}
            <div className="absolute -top-3 right-4 sm:right-6 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 hidden sm:flex items-center gap-2">
              <i className="ri-checkbox-circle-fill text-orange-500"></i>
              <span className="text-[11px] font-bold text-gray-700">Accommodation request</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== QUICK ACTION STEPS ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              If your ESA request was denied, start here
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
              Five calm steps that keep the conversation constructive and your documentation strong.
            </p>
          </div>
          <div className="relative">
            {/* Connecting process track (desktop only) */}
            <div
              aria-hidden="true"
              className="hidden lg:block absolute left-[10%] right-[10%] top-[44px] h-0.5 bg-gradient-to-r from-orange-200 via-orange-300 to-orange-200 rounded-full"
            ></div>
            <div className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-5">
              {actionSteps.map((s, i) => (
                <div
                  key={s.title}
                  className="relative bg-orange-50/60 border border-orange-100 rounded-2xl p-5 flex flex-col"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border-2 border-orange-200 flex items-center justify-center mb-4 shadow-sm">
                    <i className={`${s.icon} text-orange-500 text-lg`}></i>
                  </div>
                  <span className="absolute top-4 right-4 text-xs font-bold text-orange-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATE SELECTOR + RULES ===== */}
      <section id="state-rules" className="py-16 bg-gradient-to-b from-white to-orange-50/40 scroll-mt-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              ESA housing rules by state
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
              The federal Fair Housing Act is the baseline everywhere. Some states add their own
              documentation rules. Pick your state to see a practical summary.
            </p>
          </div>

          {/* Selector + snapshot */}
          <div className="max-w-3xl mx-auto mb-8 grid md:grid-cols-2 gap-5 items-center">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <label htmlFor="state-select" className="block text-xs font-semibold text-gray-500 mb-2">
                Select your state
              </label>
              <div className="relative">
                <select
                  id="state-select"
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-orange-400 cursor-pointer"
                >
                  {ESA_LANDLORD_DENIAL_LAWS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.stateName}
                    </option>
                  ))}
                </select>
                <i className="ri-arrow-down-s-line text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-lg"></i>
              </div>
              <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                <i className="ri-map-pin-line"></i> {ESA_LANDLORD_DENIAL_LAWS.length} states &amp; DC covered
              </p>
            </div>

            {/* State Rules Snapshot — the federal baseline that applies everywhere */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <i className="ri-shield-check-line"></i> Federal baseline snapshot
              </p>
              <ul className="space-y-2">
                {[
                  "No-pets policy alone isn't usually enough to deny",
                  "No pet fees, deposits, or pet rent for an ESA",
                  "Breed / size / weight limits generally don't apply",
                ].map((t) => (
                  <li key={t} className="text-xs text-gray-700 flex items-start gap-2">
                    <i className="ri-checkbox-circle-fill text-emerald-500 mt-0.5 flex-shrink-0"></i>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Rules card */}
          {selected && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 to-orange-400 px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                    <i className="ri-map-pin-2-line"></i> {selected.stateName}
                  </h3>
                  <p className="text-xs text-orange-50/90 mt-0.5">{selected.stateLawName}</p>
                </div>
                {selected.detailLevel === "baseline" && (
                  <span className="text-[11px] font-semibold bg-white/20 text-white rounded-full px-3 py-1">
                    Federal FHA baseline
                  </span>
                )}
              </div>

              <p className="px-6 pt-5 text-sm text-gray-700 leading-relaxed">
                {selected.shortSummary}
              </p>

              <div className="p-6 grid gap-px bg-gray-100 rounded-xl m-6 overflow-hidden border border-gray-100">
                <Row label="Law / framework" value={selected.stateLawName} />
                <Row label="Enforcement agency" value={selected.enforcementAgency} />
                <Row label="No-pets policy alone" value={selected.blanketNoPetsDenial} />
                <Row label="Pet fees / deposits / rent" value={selected.petFeePetRentRule} />
                <RowList label="A landlord may ask for" items={selected.landlordCanAskFor} tone="neutral" />
                <RowList label="A landlord generally cannot" items={selected.landlordCannotDo} tone="warn" />
                <Row label="Practical next step" value={selected.practicalNextStep} />
              </div>

              <div className="px-6 pb-6 flex flex-wrap items-center gap-3">
                <Link
                  to={selected.stateGuidePath}
                  className="inline-flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700"
                >
                  <i className="ri-book-open-line"></i> Read the full {selected.stateName} ESA guide
                </Link>
                <span className="text-gray-300">•</span>
                <Link
                  to={withAttribution("/assessment")}
                  className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-orange-600"
                >
                  <i className="ri-arrow-right-line"></i> Start your ESA evaluation
                </Link>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center mt-5 max-w-2xl mx-auto">
            State summaries are general and may change. They are not legal advice. For your exact
            situation, check your state agency or speak with a local fair housing resource.
          </p>
        </div>
      </section>

      {/* ===== COMMON DENIAL REASONS ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              Common landlord pushback — explained
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
              Most denials come from a handful of misunderstandings. Here is what each one usually means.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {denialReasons.map((r) => (
              <div key={r.claim} className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                <p className="text-sm font-bold text-gray-900 mb-2 flex items-start gap-2">
                  <i className="ri-chat-quote-line text-orange-400 mt-0.5"></i>
                  {r.claim}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed pl-6">{r.response}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== VALID REQUEST (checklist + sample document) ===== */}
      <section className="py-16 bg-orange-50/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid gap-10 lg:gap-12 lg:grid-cols-2 items-center">
            {/* Left — checklist */}
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-2 flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-emerald-500"></i>
                What a valid ESA request usually includes
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                A strong request is simple, honest, and backed by a real evaluation.
              </p>
              <div className="space-y-3">
                {validRequestParts.map((p) => (
                  <div key={p.title} className="bg-white border border-gray-100 rounded-xl p-4 flex gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <i className={`${p.icon} text-emerald-600`}></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{p.title}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — sample document visual (reuses the canonical SampleLetterCard) */}
            <div className="mx-auto w-full max-w-sm">
              <SampleLetterCard
                size="default"
                alt="Example emotional support animal accommodation letter from a licensed provider. Names and details are placeholders."
              />
              <p className="text-[11px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1.5">
                <i className="ri-information-line"></i>
                Example only — not a legal letter. Names and details are placeholders.
              </p>
            </div>
          </div>

          {/* What landlords can still do — full-width row */}
          <div className="mt-14">
            <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-2 flex items-center gap-2">
              <i className="ri-information-line text-gray-400"></i>
              What landlords can still do
            </h2>
            <p className="text-sm text-gray-600 mb-6 max-w-2xl">
              Your rights are real — and so are a housing provider's. Being clear about both keeps
              the conversation fair.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {landlordCanStill.map((p) => (
                <div key={p.title} className="bg-white border border-gray-100 rounded-xl p-4 flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <i className={`${p.icon} text-gray-500`}></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{p.title}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== EXAMPLE RESPONSE FRAMEWORK ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              A calm response framework you can adapt
            </h2>
            <p className="text-gray-600 text-sm md:text-base max-w-2xl mx-auto">
              This is a plain-English outline — not a legal letter. Adapt it to your own situation,
              keep it polite, and never use threatening language.
            </p>
          </div>
          <div className="grid lg:grid-cols-5 gap-8 items-center">
          {/* Visual — calm written response */}
          <div className="lg:col-span-2 order-first lg:order-last">
            <div className="relative rounded-2xl overflow-hidden shadow-[0_16px_40px_-20px_rgba(15,23,42,0.3)] ring-1 ring-gray-100 aspect-[4/3] bg-gray-100">
              <img
                src="/assets/housing/hands-typing-paperwork.jpg"
                alt="Tenant calmly writing a reasonable-accommodation response on a laptop beside their pet"
                width={800}
                height={600}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-3">
              Keep it written, calm, and dated — and save a copy for your records.
            </p>
          </div>
          <div className="lg:col-span-3 bg-gray-50 border border-gray-200 rounded-2xl p-6 md:p-8">
            <ol className="space-y-4">
              {[
                ["Open politely and reference your request", "Thank them, and note that you are following up on your reasonable-accommodation request for an emotional support animal."],
                ["State the basis simply", "Mention that the Fair Housing Act asks housing providers to consider reasonable accommodations for assistance animals, and that an ESA is treated differently from a pet."],
                ["Confirm your documentation", "Note that you have a letter from a licensed mental health provider who evaluated you, and offer to share appropriate documentation of the disability-related need."],
                ["Ask for reconsideration", "Politely ask them to reconsider, and ask for any specific concern in writing so you can address it."],
                ["Offer a path forward", "Express willingness to follow reasonable, evenly-applied rules and to discuss any genuine concern."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{t}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 pt-5 border-t border-gray-200 text-xs text-gray-500 flex items-start gap-2">
              <i className="ri-scales-3-line text-gray-400 mt-0.5"></i>
              For a serious or ongoing conflict, consider contacting HUD, a local fair housing
              agency, or a tenant-rights / legal-aid office. PawTenant does not provide legal
              representation.
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ===== CTA BLOCK ===== */}
      <section className="py-16 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              Need updated ESA documentation?
            </h2>
            <p className="text-orange-50 text-sm md:text-base mb-7 max-w-xl mx-auto lg:mx-0">
              Connect with a licensed mental health provider for a real evaluation. If you qualify,
              you'll receive a valid ESA letter that supports your housing request — reviewed
              individually, with no guarantee of landlord approval.
            </p>
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
              >
                <i className="ri-stethoscope-line"></i> Start My ESA Evaluation
              </Link>
              <Link
                to="/esa-letter-for-landlord"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
              >
                <i className="ri-home-heart-line"></i> Using an ESA letter with a landlord
              </Link>
            </div>
          </div>
          {/* Visual — warm home + pet */}
          <div className="hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] ring-1 ring-white/20 aspect-[5/4] bg-orange-300">
              <img
                src="/assets/housing/family-with-dog-home.jpg"
                alt="Renter relaxed at home with their emotional support dog"
                width={1000}
                height={800}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING / KLARNA — reusable cost section ===== */}
      <EsaPricingMini className="bg-[#fafafa] border-t border-gray-100" />

      {/* ===== VETERANS SUPPORT — emotional-first, savings secondary (SeoKit) ===== */}
      <VeteransSupportSection
        className="bg-[#f7f6f3] border-t border-gray-100"
        image="/assets/veterans/man-with-puppy-portrait.jpg"
        alt="A veteran sharing a quiet, supportive moment with his puppy"
        assessmentHref={withAttribution("/assessment")}
      />

      {/* ===== FAQ ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span className="text-sm font-bold text-gray-900">{f.q}</span>
                  <i
                    className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  ></i>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LEGAL DISCLAIMER ===== */}
      <section className="py-10 bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Educational information, not legal advice.</strong>{" "}
              PawTenant provides documentation from licensed mental health professionals. We do not
              provide legal advice. If you face housing discrimination, we recommend consulting a
              tenant rights attorney or contacting HUD. Fair Housing Act protections may apply, but
              facts vary by situation, and a valid ESA letter supports — but does not guarantee — a
              landlord's approval.
            </p>
          </div>
        </div>
      </section>

      <Hud2026UpdateBanner state={selected?.stateName} className="border-t border-gray-100" />

      <SharedFooter />
    </main>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3 sm:flex sm:gap-4">
      <p className="text-xs font-semibold text-gray-400 sm:w-44 sm:flex-shrink-0 mb-1 sm:mb-0 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}

function RowList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "neutral" | "warn";
}) {
  const dot = tone === "warn" ? "ri-close-circle-line text-red-400" : "ri-checkbox-circle-line text-emerald-500";
  return (
    <div className="bg-white px-4 py-3 sm:flex sm:gap-4">
      <p className="text-xs font-semibold text-gray-400 sm:w-44 sm:flex-shrink-0 mb-1 sm:mb-0 uppercase tracking-wide">
        {label}
      </p>
      <ul className="space-y-1.5 flex-1">
        {items.map((it) => (
          <li key={it} className="text-sm text-gray-700 leading-relaxed flex items-start gap-2">
            <i className={`${dot} mt-0.5 flex-shrink-0`}></i>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
