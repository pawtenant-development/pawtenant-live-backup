// Educational SEO page — /are-esa-letters-still-valid-after-hud-change
//
// Goal: capture confused post-HUD-2026 search traffic and route users honestly.
// Compliance-safe: no guarantees, no "ESAs are no longer legal", no government
// affiliation. Cautious wording grounded in docs/hud-2026-esa-compliance-notes.md.
//
// Branding: PawTenant orange / warm cream / dark navy — a trust/education page,
// not a cold legal memo. Emerald + amber used only as small warm accents.
//
// SEO basics (title/description/canonical) come from CORE_PAGE_META via
// SEOManager + prerender. This file adds richer social/keyword meta + FAQ JSON-LD.
// Icons: only ri-* glyphs already present in the build subset.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { US_STATES } from "../../lib/usStates";

// ── Content ──────────────────────────────────────────────────────────────────
const whatChanged = [
  {
    icon: "ri-government-line",
    title: "Federal enforcement approach changed",
    desc: "In 2026, HUD's Office of Fair Housing and Equal Opportunity (FHEO) updated how it enforces accommodation complaints. Its enforcement now focuses on animals individually trained to perform disability-related work or tasks.",
  },
  {
    icon: "ri-emotion-line",
    title: "Emotional support alone is treated differently",
    desc: "Under the updated federal enforcement approach, comfort or companionship by itself is no longer treated the same as a trained task. That does not make emotional support animals illegal — it changes how federal enforcement handles untrained ESAs.",
  },
];

const whatDidNotChange = [
  {
    icon: "ri-scales-3-line",
    title: "The Fair Housing Act is still law",
    desc: "Disability discrimination in housing is still illegal. Housing providers generally still cannot deny every request automatically and still owe an individualized, good-faith review.",
  },
  {
    icon: "ri-map-pin-line",
    title: "State laws may still matter",
    desc: "Many states have their own fair housing or assistance-animal laws that can provide protections beyond federal enforcement. Your state and your housing type can change the picture.",
  },
  {
    icon: "ri-building-line",
    title: "Section 504 & housing type",
    desc: "Section 504, certain federally-funded housing, and other legal frameworks may apply to your situation independently of the FHEO enforcement update.",
  },
  {
    icon: "ri-bank-line",
    title: "Private legal rights remain",
    desc: "The enforcement update does not remove a person's ability to seek redress privately. For your exact situation, a local fair housing agency or tenant-rights resource can advise you.",
  },
];

const esaVsPsd = [
  {
    label: "Emotional Support Animal (ESA)",
    icon: "ri-heart-3-line",
    points: [
      "Provides comfort or emotional support through its presence.",
      "Is not individually trained to perform a specific task.",
      "Documentation may support a reasonable-accommodation request where clinically and legally appropriate.",
    ],
  },
  {
    label: "Trained assistance animal / Psychiatric Service Dog (PSD)",
    icon: "ri-shield-star-line",
    points: [
      "Is individually trained to perform a specific task directly related to a disability.",
      "A trained task is different from comfort or companionship alone.",
      "PawTenant does not train or certify service animals; a licensed provider may issue documentation only where clinically appropriate and where you report legitimate disability-related task training.",
    ],
  },
];

const weCanHelp = [
  { icon: "ri-stethoscope-line", title: "Licensed telehealth evaluation", desc: "A licensed mental health provider reviews your situation and uses clinical judgment to decide whether documentation is appropriate." },
  { icon: "ri-file-shield-2-line", title: "State-aware documentation", desc: "Documentation prepared with your state and housing type in mind, where clinically and legally appropriate." },
  { icon: "ri-home-heart-line", title: "Landlord request guidance", desc: "Plain-English help on how a reasonable-accommodation request usually works — and honest expectations." },
  { icon: "ri-compass-3-line", title: "Denial support direction", desc: "If you were already denied or challenged, we can point you toward sensible next steps and resources." },
];

const weCannotPromise = [
  "Guaranteed landlord approval — every request is decided individually by your housing provider.",
  "A fake certification or registration — there is no official ESA registry, and we don't sell one.",
  "A guaranteed pet-fee waiver or any specific legal outcome.",
  "That documentation alone turns any animal into a service animal.",
];

const heroAtAGlance = [
  { icon: "ri-checkbox-circle-line", text: "ESA letters were never a government registration", tone: "ok" },
  { icon: "ri-government-line", text: "HUD changed its federal enforcement approach", tone: "note" },
  { icon: "ri-map-pin-line", text: "State law, housing type & your facts may still matter", tone: "note" },
  { icon: "ri-information-line", text: "Approval is not guaranteed — honest expectations", tone: "warn" },
];

const faqs = [
  {
    q: "Are ESA letters still valid after the 2026 HUD change?",
    a: "An ESA letter is documentation from a licensed provider — it was never a government registration, and the 2026 change did not make ESAs illegal. What changed is how HUD's federal enforcement approach treats untrained emotional support animals. The Fair Housing Act remains law, state laws may still apply, and documentation may still support a reasonable-accommodation request where clinically and legally appropriate. Approval is not guaranteed.",
  },
  {
    q: "What exactly did HUD change in 2026?",
    a: "HUD's Office of Fair Housing and Equal Opportunity updated its enforcement approach so that it focuses on animals individually trained to perform disability-related work or tasks. Emotional support or companionship by itself is treated differently under this enforcement approach. This is an enforcement-posture change at the federal agency level, not a repeal of the Fair Housing Act.",
  },
  {
    q: "Does this mean my landlord can now deny my ESA automatically?",
    a: "Not automatically. The Fair Housing Act is still law and disability discrimination in housing is still illegal. State fair housing laws, Section 504, your housing type, and your individual facts may still matter. Each request is reviewed individually, and a housing provider generally still cannot apply a blanket denial.",
  },
  {
    q: "What's the difference between an ESA and a trained assistance animal or PSD?",
    a: "An emotional support animal provides comfort through its presence and is not trained to perform a specific task. A trained assistance animal or psychiatric service dog is individually trained to perform a task directly related to a disability. PawTenant does not train or certify service animals; a licensed provider may issue documentation only where clinically appropriate.",
  },
  {
    q: "Can PawTenant guarantee my housing request will be approved?",
    a: "No. No legitimate service can guarantee approval, a fee waiver, or any legal outcome. PawTenant connects you with a licensed provider who evaluates whether documentation is clinically appropriate. A valid letter may support your request, but your housing provider, state law, housing type, and individual facts determine the result.",
  },
];

export default function AreEsaLettersStillValidAfterHudChangePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [stateCode, setStateCode] = useState("");

  const selectedState = US_STATES.find((s) => s.code === stateCode) ?? null;
  const stateSlug = selectedState
    ? selectedState.code === "DC"
      ? "washington-dc"
      : selectedState.name.toLowerCase().replace(/\s+/g, "-")
    : "";

  return (
    <main>
      <meta
        name="keywords"
        content="are ESA letters still valid, HUD ESA change 2026, HUD emotional support animal rule change, ESA letter after HUD 2026, are ESA letters still legal, emotional support animal housing 2026, ESA vs PSD, support animal housing documentation"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Are ESA Letters Still Valid After the 2026 HUD Change? | PawTenant" />
      <meta
        property="og:description"
        content="The 2026 HUD enforcement change explained honestly: what changed, what didn't, ESA vs trained PSD, and how a licensed, state-aware evaluation can help."
      />
      <meta property="og:url" content="https://pawtenant.com/are-esa-letters-still-valid-after-hud-change" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="Are ESA Letters Still Valid After the 2026 HUD Change?" />
      <meta
        name="twitter:description"
        content="What the 2026 HUD enforcement change means for emotional support animals in housing — explained without hype."
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
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-[#fffaf4] to-white pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white border border-orange-200 rounded-full px-4 py-1.5 mb-6 shadow-sm">
              <i className="ri-government-line text-orange-500 text-sm"></i>
              <span className="text-xs font-semibold tracking-wide uppercase text-orange-600">
                2026 HUD Update
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Are ESA Letters Still Valid
              <br />
              <span className="text-orange-500">After the 2026 HUD Change?</span>
            </h1>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8">
              Short answer: an ESA letter was never a government registration, and the 2026 change did
              not make emotional support animals illegal. What changed is how HUD's federal
              enforcement approach treats untrained ESAs. Here's an honest look at what changed, what
              didn't, and how to understand your options.
            </p>
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mb-5">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
              >
                <i className="ri-stethoscope-line"></i> Start ESA Assessment
              </Link>
              <Link
                to="/contact-us"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-customer-service-2-line"></i> Ask Support About Your State
              </Link>
            </div>
            <p className="text-xs text-gray-400 max-w-xl mx-auto lg:mx-0">
              Educational information only — not legal advice. Approval is not guaranteed and depends
              on your housing provider, state law, housing type, and individual facts.
            </p>
          </div>

          {/* Right — "at a glance" branded summary card (no image weight) */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="rounded-3xl bg-white border border-orange-100 shadow-[0_24px_60px_-28px_rgba(122,78,45,0.35)] p-6 sm:p-7">
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-4 flex items-center gap-2">
                <i className="ri-flashlight-line"></i> The 2026 change at a glance
              </p>
              <ul className="space-y-3.5">
                {heroAtAGlance.map((row) => {
                  const toneClass =
                    row.tone === "ok"
                      ? "bg-emerald-50 text-emerald-600"
                      : row.tone === "warn"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-orange-50 text-orange-500";
                  return (
                    <li key={row.text} className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${toneClass}`}>
                        <i className={`${row.icon} text-lg`}></i>
                      </div>
                      <span className="text-[13px] text-gray-700 leading-relaxed pt-1.5">{row.text}</span>
                    </li>
                  );
                })}
              </ul>
              <Link
                to="#what-changed"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("what-changed")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-orange-700"
              >
                See the full breakdown <i className="ri-arrow-down-line"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHAT CHANGED ===== */}
      <section id="what-changed" className="py-16 bg-white scroll-mt-24">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 text-center">
            What changed
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base text-center mb-10">
            The update is about <strong>federal enforcement</strong>, not about whether emotional
            support animals can exist.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            {whatChanged.map((c) => (
              <div key={c.title} className="bg-[#fdf6ee] border border-orange-100 rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-white border border-orange-200 flex items-center justify-center mb-4 shadow-sm">
                  <i className={`${c.icon} text-orange-500 text-lg`}></i>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">{c.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHAT DID NOT CHANGE ===== */}
      <section className="py-16 bg-gradient-to-b from-white to-emerald-50/40">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 text-center">
            What did <span className="text-emerald-600">not</span> change
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base text-center mb-10">
            Several protections and legal frameworks still apply. Your individual facts matter.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {whatDidNotChange.map((c) => (
              <div key={c.title} className="bg-white border border-gray-100 rounded-xl p-5 flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <i className={`${c.icon} text-emerald-600`}></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{c.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ESA vs PSD ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 text-center">
            ESA vs trained assistance animal / PSD
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base text-center mb-10">
            The 2026 enforcement update turns on whether an animal performs an individually
            <strong> trained task</strong>. Here's the difference.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            {esaVsPsd.map((col) => (
              <div key={col.label} className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-[#fdf6ee] px-5 py-4 flex items-center gap-2.5 border-b border-orange-100">
                  <i className={`${col.icon} text-orange-500 text-lg`}></i>
                  <h3 className="text-sm font-bold text-gray-900">{col.label}</h3>
                </div>
                <ul className="p-5 space-y-3">
                  {col.points.map((p) => (
                    <li key={p} className="text-xs text-gray-600 leading-relaxed flex items-start gap-2">
                      <i className="ri-checkbox-circle-line text-orange-400 mt-0.5 flex-shrink-0"></i>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center mt-5 max-w-2xl mx-auto">
            PawTenant does not train or certify service animals. A psychiatric service dog letter
            alone does not make an animal a service animal.
          </p>
        </div>
      </section>

      {/* ===== STATE-AWARE ROUTING ===== */}
      <section className="py-16 bg-gradient-to-b from-white to-orange-50/50">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
            Rules can vary by state
          </h2>
          <p className="text-gray-600 text-sm md:text-base mb-8">
            Federal enforcement is the baseline, but your state and housing type may still matter.
            Pick your state to see its ESA guide.
          </p>
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <label htmlFor="hud-state-select" className="block text-xs font-semibold text-gray-500 mb-2 text-left">
              Select your state
            </label>
            <div className="relative">
              <select
                id="hud-state-select"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-orange-400 cursor-pointer"
              >
                <option value="">Choose a state…</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <i className="ri-arrow-down-s-line text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-lg"></i>
            </div>
            {selectedState ? (
              <Link
                to={`/esa-letter/${stateSlug}`}
                className="mt-4 inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors"
              >
                <i className="ri-book-open-line"></i> Read the {selectedState.name} ESA guide
              </Link>
            ) : (
              <Link
                to="/esa-laws"
                className="mt-4 inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                <i className="ri-scales-3-line"></i> ESA laws explained
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ===== HOW PAWTENANT CAN HELP ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 text-center">
            How PawTenant can help
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base text-center mb-10">
            A licensed telehealth clinic for state-aware support animal housing documentation —
            with honest expectations.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {weCanHelp.map((c) => (
              <div key={c.title} className="bg-[#fafafa] border border-gray-100 rounded-xl p-5 flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <i className={`${c.icon} text-orange-500`}></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{c.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* What we cannot promise */}
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
            <h3 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
              <i className="ri-information-line"></i> What PawTenant cannot promise
            </h3>
            <ul className="space-y-2">
              {weCannotPromise.map((t) => (
                <li key={t} className="text-xs text-amber-900/90 leading-relaxed flex items-start gap-2">
                  <i className="ri-close-circle-line text-amber-500 mt-0.5 flex-shrink-0"></i>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== DENIAL SUPPORT CTA ===== */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Already denied or challenged by your landlord?
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            PawTenant can help you understand possible next steps and documentation options. Each
            situation is individual — there is no guaranteed outcome, but you don't have to navigate
            it alone.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/landlord-denied-esa-letter"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-home-heart-line"></i> Landlord denial next steps
            </Link>
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-stethoscope-line"></i> Start ESA Assessment
            </Link>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <EsaPricingMini className="bg-[#fafafa] border-t border-gray-100" />

      {/* ===== FAQ (kept at the bottom) ===== */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
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

      {/* ===== RELATED RESOURCES ===== */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">
            Keep reading
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: "/esa-laws", icon: "ri-scales-3-line", label: "ESA laws explained" },
              { to: "/landlord-denied-esa-letter", icon: "ri-home-heart-line", label: "Landlord denied your ESA?" },
              { to: "/esa-letter-cost", icon: "ri-price-tag-3-line", label: "ESA letter cost" },
              { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
              { to: "/esa-letter-for-landlord", icon: "ri-mail-send-line", label: "ESA letter for your landlord" },
              { to: "/explore-esa-letters-all-states", icon: "ri-map-pin-line", label: "ESA letters by state" },
            ].map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all"
              >
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LEGAL DISCLAIMER ===== */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Educational information, not legal advice.</strong>{" "}
              PawTenant connects you with licensed mental health providers and does not certify or
              train service animals, claim any government affiliation, or guarantee landlord
              approval, fee waivers, or legal outcomes. HUD's federal enforcement approach for
              untrained emotional support animals changed in 2026; the Fair Housing Act remains law,
              and state law, Section 504, housing type, private legal rights, and individual facts
              may still matter. For your specific situation, contact your state fair housing agency
              or a tenant-rights resource.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
