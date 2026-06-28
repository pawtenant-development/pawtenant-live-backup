import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import MobileStickyApplyCTA from "@/components/feature/MobileStickyApplyCTA";
import EsaVsPsdCard from "@/components/feature/EsaVsPsdCard";
import { ESA_PRICE_LABELS } from "@/config/pricing";
import { useSitePricing } from "@/hooks/useSitePricing";

/*
 * Meta / Facebook Ads paid landing page — /meta-esa-letter
 *
 * 2026-06-06 redesign: rebuilt to mirror the PawTenant homepage — clean
 * dark-cover hero, mobile-first, conversion-focused, NOT a text-heavy SEO
 * page. Optimized for 90+ mobile PageSpeed:
 *   - LCP hero reuses the homepage's responsive WebP <picture>
 *     (mobile variant ≈23 KB) instead of the prior 166 KB eager JPG.
 *   - Eager surface trimmed to hero + light sections; only the hero image
 *     is eager (fetchPriority high). All other imagery is lazy + fixed
 *     aspect to avoid CLS.
 *   - Heavy below-fold imagery (lifestyle JPGs, 251 KB verification PNG)
 *     removed; proof now uses the 7 KB sample-letter SVG + a text/icon
 *     verification card.
 *   - SEO/meta head mutation deferred past LCP via requestIdleCallback.
 *
 * Page stays noindex,nofollow (paid LP, not in sitemap/nav). Attribution,
 * Meta Pixel, marketing scripts, and PawChat are all handled + deferred
 * globally in App.tsx, so plain /assessment links keep tracking intact.
 *
 * Wording rules: no customer-facing "doctor"; use "Licensed Mental Health
 * Provider/Practitioner". No guaranteed-approval / everyone-qualifies
 * claims. Housing-focused; PSD offered as the public-access alternative.
 */

const META_TITLE =
  "ESA Letter Online for Housing | Licensed Practitioner Review | PawTenant";
const META_DESC =
  "Get an ESA letter online from a Licensed Mental Health Practitioner. Housing-focused emotional support animal documentation for Fair Housing Act accommodation.";
const META_OG_IMAGE =
  "https://pawtenant.com/assets/blog/fp-woman-sitting-floor.jpg";

const ASSESSMENT_HREF = "/assessment";
const PSD_ASSESSMENT_HREF = "/psd-assessment";

// Popular states → canonical /esa-letter/<slug> route (same route the state
// pages + Google LP use). Slugs are lowercase, hyphenated.
const STATES: Array<{ name: string; slug: string }> = [
  { name: "California", slug: "california" },
  { name: "Texas", slug: "texas" },
  { name: "Florida", slug: "florida" },
  { name: "New York", slug: "new-york" },
  { name: "Illinois", slug: "illinois" },
  { name: "Pennsylvania", slug: "pennsylvania" },
  { name: "Ohio", slug: "ohio" },
  { name: "Georgia", slug: "georgia" },
  { name: "North Carolina", slug: "north-carolina" },
  { name: "Michigan", slug: "michigan" },
  { name: "New Jersey", slug: "new-jersey" },
  { name: "Virginia", slug: "virginia" },
  { name: "Washington", slug: "washington" },
  { name: "Arizona", slug: "arizona" },
  { name: "Massachusetts", slug: "massachusetts" },
  { name: "Colorado", slug: "colorado" },
];

const HOW_STEPS = [
  {
    n: 1,
    title: "Answer a few questions",
    body: "A short, confidential assessment — about 5 minutes from your phone.",
  },
  {
    n: 2,
    title: "Licensed provider review",
    body: "A Licensed Mental Health Practitioner credentialed in your state reviews your case, typically within 24 hours.",
  },
  {
    n: 3,
    title: "Receive your letter if qualified",
    body: "When clinically appropriate, you receive housing-focused ESA documentation as a secure PDF.",
  },
];

// "Why Choose PawTenant" — adapted from /esa-letter-cost (icon + title + short
// desc). Copy kept concise + compliance-safe (no overpromise / guarantee of
// approval). Icons are remix-icon classes (loaded async globally).
const WHY_CHOOSE = [
  {
    icon: "ri-home-heart-line",
    title: "Housing-focused letters",
    desc: "Built to help you keep your pet in rentals, dorms, and no-pet buildings.",
  },
  {
    icon: "ri-scales-3-line",
    title: "Fair Housing aligned",
    desc: "Written to support a reasonable accommodation request under the federal Fair Housing Act.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Licensed provider review",
    desc: "Every letter is reviewed and signed by a Licensed Mental Health Practitioner credentialed in your state.",
  },
  {
    icon: "ri-refund-2-line",
    title: "Refund if you don't qualify",
    desc: "If you don't qualify after review, you're refunded — no risk to start.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Dedicated support",
    desc: "Real help through the process — including if your landlord has questions.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Private & verifiable",
    desc: "Your information stays confidential, and your letter can be verified through proper channels.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Is this legal?",
    a: "Yes. An ESA letter from a Licensed Mental Health Practitioner may support a reasonable accommodation request under the federal Fair Housing Act. Every letter includes the provider's name, license number, and signature, and is issued only after a real clinical review.",
  },
  {
    q: "How fast can I start?",
    a: "You can begin the assessment in about five minutes. Most assessments are reviewed within 24 hours, and documentation is delivered as a PDF when a licensed provider determines it's clinically appropriate.",
  },
  {
    q: "What if my landlord asks questions?",
    a: "Your documentation includes the provider's credentials and license details, which housing providers may verify through proper channels. Most landlords subject to the Fair Housing Act are required to consider reasonable accommodation requests for a qualifying emotional support animal.",
  },
  {
    q: "Is my information private?",
    a: "Yes. Your assessment is confidential and handled in alignment with HIPAA-aligned data standards. Diagnosis and clinical detail are never shared on any verification page or with your landlord.",
  },
];

/**
 * Defer the SEO/meta head mutation past the LCP paint (requestIdleCallback
 * with a setTimeout fallback). Mirrors the homepage's scheduleSeoWork.
 */
function scheduleSeoWork(fn: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn);
    return () => {
      try {
        if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id);
      } catch {
        /* ignore */
      }
    };
  }
  const id = window.setTimeout(fn, 120);
  return () => window.clearTimeout(id);
}

export default function MetaEsaLetterPage() {
  // Admin-managed display prices (hydrates at runtime; falls back to config).
  const { price: getPrice } = useSitePricing();
  // Defer rendering the below-the-fold tree until AFTER the first paint so the
  // first React commit only mounts the hero (the LCP element) — keeping the
  // skeleton→React hero swap fast and LCP low on throttled mobile. Mirrors the
  // homepage's lazy below-fold strategy without code-splitting this one file.
  // requestAnimationFrame ×2 fires right after the hero paints; a setTimeout
  // fallback guarantees the content renders even if rAF is throttled.
  const [showBelow, setShowBelow] = useState(false);
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const timer = window.setTimeout(() => setShowBelow(true), 250);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShowBelow(true));
    });
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const prevTitle = document.title;

    // ensureMeta supports both name= (standard) and property= (Open Graph).
    // Returns a restore fn so cleanup walks the head back to its prior state.
    const restores: Array<() => void> = [];
    const ensureMeta = (key: string, content: string, useProperty = false) => {
      const attr = useProperty ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      restores.push(() => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      });
    };

    const cancel = scheduleSeoWork(() => {
      document.title = META_TITLE;
      // Paid LP — stays out of the organic index.
      ensureMeta("robots", "noindex, nofollow");
      ensureMeta("description", META_DESC);
      ensureMeta("og:title", META_TITLE, true);
      ensureMeta("og:description", META_DESC, true);
      ensureMeta("og:type", "website", true);
      ensureMeta("og:image", META_OG_IMAGE, true);
      ensureMeta("twitter:card", "summary_large_image");
      ensureMeta("twitter:title", META_TITLE);
      ensureMeta("twitter:description", META_DESC);
      ensureMeta("twitter:image", META_OG_IMAGE);
    });

    return () => {
      cancel();
      document.title = prevTitle;
      restores.forEach((r) => r());
    };
  }, []);

  return (
    <main className="bg-white text-slate-900 antialiased">
      <SharedNavbar />

      {/* ─────────── 1. HERO — homepage-style dark cover ─────────── */}
      <section className="relative min-h-[100svh] flex items-center overflow-hidden">
        {/* LCP image — reuses the homepage responsive WebP hero (mobile
            variant ≈23 KB). Only eager image on the page. */}
        <div className="absolute inset-0">
          <picture>
            <source
              media="(max-width: 768px)"
              srcSet="/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp"
              type="image/webp"
            />
            <source
              media="(min-width: 769px)"
              srcSet="/assets/blog/fp-woman-sitting-floor-desktop.webp"
              type="image/webp"
            />
            <img
              src="/assets/blog/fp-woman-sitting-floor.jpg"
              alt="Pet owner at home with their dog, applying for an ESA letter online"
              className="w-full h-full object-cover object-center opacity-80"
              fetchPriority="high"
              loading="eager"
              decoding="async"
              width={1920}
              height={1280}
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/65 to-gray-900/25" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-900/70 to-transparent md:hidden" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 py-20 sm:py-28 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              <i className="ri-shield-check-line" />
              HIPAA-Compliant · Licensed Provider Review
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-5">
              Keep Your <span className="text-orange-400">Pet at Home</span> With a
              <br className="hidden sm:block" />
              {" "}Legitimate ESA Letter
            </h1>

            <p className="text-gray-200 text-base sm:text-lg mb-7 leading-relaxed">
              Get your <strong className="text-white font-semibold">ESA letter online</strong> from a Licensed Mental Health Practitioner — housing-focused documentation for Fair Housing Act accommodation, when clinically appropriate.
            </p>

            <Link
              to={ASSESSMENT_HREF}
              className="w-full sm:w-auto px-8 py-4 sm:py-3.5 bg-orange-400 text-white font-bold text-base sm:text-sm rounded-md hover:bg-orange-500 transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-400/25"
            >
              Start Your ESA Evaluation
              <i className="ri-arrow-right-line" />
            </Link>

            {/* Trust badges */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/90">
              <span className="inline-flex items-center gap-1.5">
                <HeroCheck /> HIPAA-compliant
              </span>
              <span className="text-white/30">•</span>
              <span className="inline-flex items-center gap-1.5">
                <HeroCheck /> Licensed provider review
              </span>
              <span className="text-white/30">•</span>
              <span className="inline-flex items-center gap-1.5">
                <HeroCheck /> Secure checkout
              </span>
            </div>

            {/* Mobile refund line */}
            <p className="sm:hidden text-white/85 text-[13px] leading-snug mt-5 text-center">
              <i className="ri-shield-check-line text-orange-300 mr-1.5" />
              <strong className="font-bold text-white">Full refund</strong> if you don&rsquo;t qualify
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── 2. HOW IT WORKS — 3 simple steps ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              How it works
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Three simple steps.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Supportive, private, and clinically reviewed from start to finish.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 md:gap-5">
            {HOW_STEPS.map((s) => (
              <div key={s.n} className="bg-slate-50 border border-slate-200 rounded-xl p-5 md:p-6">
                <div className="w-10 h-10 rounded-full bg-[#0E2A47] text-white flex items-center justify-center text-[15px] font-semibold mb-4">
                  {s.n}
                </div>
                <div className="text-[15px] font-semibold text-slate-900 mb-1 leading-snug">{s.title}</div>
                <p className="text-[13px] text-slate-600 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-7 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start Your ESA Evaluation
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Below-the-fold tree — deferred to a post-paint commit (see showBelow)
          so the hero LCP stays fast. The min-height keeps the scrollbar/layout
          stable until it mounts (a beat after first paint). */}
      {!showBelow && <div aria-hidden className="min-h-[40vh]" />}
      {showBelow && (
        <>
      {/* ─────────── EMOTIONAL 1 — stay together at home (image left) ─────────── */}
      <section className="bg-[#FFFBF5] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center">
            <div className="md:col-span-6 order-2 md:order-1">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_8px_28px_rgba(15,23,42,0.10)]">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="Pet owner relaxing at home with their dog after moving into a new apartment"
                  width={1200}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
                />
              </div>
            </div>
            <div className="md:col-span-6 order-1 md:order-2 text-center md:text-left">
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Home comfort
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
                Stay together at home with the pet who supports you.
              </h2>
              <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-xl mx-auto md:mx-0 mb-6">
                For many renters, a pet is part of how they cope day to day. A housing-focused ESA letter helps you request a reasonable accommodation so you and your animal can stay together — even in no-pet buildings.
              </p>
              <Link
                to={ASSESSMENT_HREF}
                className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-7 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Start Your ESA Evaluation
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 3. PROOF — sample letter + verification ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-[#0E2A47]/5 border border-[#0E2A47]/15 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E2A47]" />
              What you actually receive
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              A real letter from a licensed provider.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Your documentation includes provider credentials and housing-focused language — not a generic certificate.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Sample letter — /esa-letter-cost card style (orange accent + Sample pill). */}
            <div className="relative w-full">
              <div className="relative rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-white shadow-[0_4px_0_0_#f97316,0_12px_28px_-8px_rgba(122,78,45,0.18),0_4px_12px_-4px_rgba(0,0,0,0.08)] sm:shadow-[0_4px_0_0_#f97316,0_24px_64px_-8px_rgba(122,78,45,0.22),0_8px_24px_-4px_rgba(0,0,0,0.10)]">
                <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-sm border border-orange-200 text-orange-600 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                  Sample
                </div>
                <img
                  src="/images/checkout/esa-sample-letter.svg"
                  alt="Sample PawTenant ESA letter showing the licensed provider signature, license number, and housing-accommodation language. Names and details are placeholders."
                  width={800}
                  height={1035}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-top block"
                />
              </div>
              <p className="text-center text-[11px] text-slate-400 mt-3 leading-relaxed">
                Sample ESA letter — your letter will include your name, pet, and licensed provider details.
              </p>
            </div>

            {/* Four trust boxes (2×2 on desktop) — fills the space beside the letter. */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Housing-focused letter details */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <span className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center mb-3">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
                    </svg>
                  </span>
                  <div className="text-[14px] font-semibold text-slate-900 mb-1 leading-snug">Housing-focused letter details</div>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Provider credentials, license number, issue date, and clear recommendation language written for a Fair Housing Act accommodation request.
                  </p>
                </div>

                {/* Secure delivery + support */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <span className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="m9 15 2 2 4-4" />
                    </svg>
                  </span>
                  <div className="text-[14px] font-semibold text-slate-900 mb-1 leading-snug">Secure delivery + support</div>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Delivered as a secure PDF, typically within 24 hours. If your landlord has questions, our support team can help.
                  </p>
                </div>

                {/* Verifiable */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <span className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                  <div className="text-[14px] font-semibold text-slate-900 mb-1 leading-snug">Verifiable when your landlord asks</div>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Each letter can be verified through proper channels — verification confirms authenticity only, never your medical details.
                  </p>
                </div>

                {/* Private by design */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <span className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <div className="text-[14px] font-semibold text-slate-900 mb-1 leading-snug">Private by design</div>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Your assessment is confidential and handled in alignment with HIPAA-aligned data standards — no diagnosis is shown to your landlord.
                  </p>
                </div>
              </div>

              {/* Clinical-review reassurance banner */}
              <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-emerald-900 leading-snug mb-0.5">A real clinical review, every time</div>
                  <div className="text-[12.5px] text-emerald-800/85 leading-relaxed">
                    Every letter is reviewed and signed by a Licensed Mental Health Practitioner credentialed in your state — no shortcuts.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── EMOTIONAL 2 — provider review + support (image right) ─────────── */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center">
            <div className="md:col-span-6 text-center md:text-left">
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Licensed provider review
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
                Reviewed by a licensed provider — with support if your landlord asks.
              </h2>
              <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-xl mx-auto md:mx-0 mb-6">
                A Licensed Mental Health Practitioner credentialed in your state reviews your assessment — never an algorithm. And if your landlord has questions about your documentation, our support team is here to help.
              </p>
              <ul className="grid gap-2 text-[13.5px] md:text-[14px] text-slate-600 max-w-xl mx-auto md:mx-0 text-left">
                <li className="flex items-start gap-2 justify-center md:justify-start">
                  <span className="mt-0.5"><HeroCheck /></span>
                  <span className="leading-relaxed">Real clinical review by a licensed provider in your state.</span>
                </li>
                <li className="flex items-start gap-2 justify-center md:justify-start">
                  <span className="mt-0.5"><HeroCheck /></span>
                  <span className="leading-relaxed">Verifiable documentation, with landlord-question support.</span>
                </li>
                <li className="flex items-start gap-2 justify-center md:justify-start">
                  <span className="mt-0.5"><HeroCheck /></span>
                  <span className="leading-relaxed">Refund if you don't qualify after review.</span>
                </li>
              </ul>
            </div>
            <div className="md:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_8px_28px_rgba(15,23,42,0.10)]">
                <img
                  src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
                  alt="Pet owner at home with their dog during an online consultation with a licensed provider"
                  width={1200}
                  height={900}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 4. WHY CHOOSE PAWTENANT — adapted from /esa-letter-cost ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Why Choose PawTenant
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Trusted, licensed, and built around keeping you and your pet together.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {WHY_CHOOSE.map((item) => (
              <div key={item.title} className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 hover:border-orange-200 transition">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`} />
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5 text-[14.5px] leading-snug">{item.title}</h3>
                <p className="text-slate-600 text-[13px] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-9 md:mt-11">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-7 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start Your ESA Evaluation
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 5. PRICING + PAYMENT — ESA (one-time + annual) & PSD ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Refund if you don't qualify
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 leading-[1.18] mb-3">
              Simple, honest pricing.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Both reviewed by a Licensed Mental Health Practitioner. If you don't qualify after review, your payment is refunded.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            {/* ESA card — recommended for housing; shows BOTH plans */}
            <div className="relative bg-white border-2 border-[#0E2A47] rounded-2xl p-7 md:p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                Recommended for housing
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-3">ESA Letter</div>

              {/* Two plans: one-time + annual — stack on mobile to avoid overflow */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-3xl font-bold tracking-tight text-slate-900">{getPrice("esa_single_pet", ESA_PRICE_LABELS.oneTime)}</div>
                  <div className="text-[12px] font-semibold text-slate-700 mt-1">One-time</div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">valid 1 year</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-3xl font-bold tracking-tight text-slate-900">{getPrice("esa_subscription_annual", ESA_PRICE_LABELS.subscription)}<span className="text-base font-semibold text-slate-500">{ESA_PRICE_LABELS.subscriptionSuffix}</span></div>
                  <div className="text-[12px] font-semibold text-slate-700 mt-1">Annual</div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">renews yearly</div>
                </div>
              </div>

              {/* Klarna — established payment option, display-only */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60 self-start">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Available at checkout</span>
              </div>

              <ul className="grid gap-2.5 mb-7 border-t border-slate-100 pt-5">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Housing-focused ESA documentation when clinically appropriate",
                  "Provider's credentials and license details on the document",
                  "Secure PDF delivery — typically within 24 hours",
                  "Refund if you do not qualify after review",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Start Your ESA Evaluation →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For renters seeking housing accommodation under the Fair Housing Act. Approval is not guaranteed.
              </div>
            </div>

            {/* PSD card — alternative for trained psychiatric service dogs */}
            <div className="relative bg-white border border-slate-200 rounded-2xl p-7 md:p-8 shadow-[0_2px_8px_rgba(15,23,42,0.05)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-[#4A8472] text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                For trained service dogs
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-3">PSD Letter</div>

              {/* Two plans: one-time + annual — stack on mobile to avoid overflow */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-3xl font-bold tracking-tight text-slate-900">From&nbsp;$120</div>
                  <div className="text-[12px] font-semibold text-slate-700 mt-1">One-time</div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">for a trained dog</div>
                </div>
                <div className="rounded-xl border border-[#4A8472]/30 bg-[#4A8472]/10 p-4">
                  <div className="text-3xl font-bold tracking-tight text-slate-900">From&nbsp;$99<span className="text-base font-semibold text-slate-500">/year</span></div>
                  <div className="text-[12px] font-semibold text-slate-700 mt-1">Annual</div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">renews yearly</div>
                </div>
              </div>

              {/* Klarna — established payment option, display-only */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60 self-start">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Available at checkout</span>
              </div>

              <ul className="grid gap-2.5 mb-7 border-t border-slate-100 pt-5">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Psychiatric Service Dog letter for trained service dogs",
                  "Supports housing accommodation under the Fair Housing Act",
                  "Eligible for air-travel documentation (DOT Service Animal form)",
                  "Refund if you do not qualify after review",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-[#4A8472] font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={PSD_ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-[#0E2A47] hover:bg-[#091B30] text-white font-semibold text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(14,42,71,0.25)]"
              >
                Start Your PSD Evaluation →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For handlers of trained psychiatric service dogs. Approval is not guaranteed.
              </div>
            </div>
          </div>

          <p className="text-center text-[12px] text-slate-500 mt-7 max-w-xl mx-auto leading-relaxed">
            Final price may vary by delivery speed and selected plan. If you don't qualify after review, your payment is refunded.
          </p>
          <p className="text-center text-[11.5px] text-slate-400 mt-2 max-w-xl mx-auto leading-relaxed">
            Klarna available at checkout. Subject to eligibility and{" "}
            <a
              href="https://www.klarna.com/us/terms-of-use/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              Klarna payment terms
            </a>
            .
          </p>
        </div>
      </section>

      {/* ─────────── 6. ESA vs PSD — reusable comparison ─────────── */}
      <EsaVsPsdCard className="bg-white border-b border-slate-200" />

      {/* ─────────── 7. AVAILABLE NATIONWIDE — state links ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-9 md:mb-11">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Available in all 50 states
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Licensed providers across the country.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              ESA housing rights are federally protected under the Fair Housing Act. See guidance for your state:
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-3xl mx-auto mb-7">
            {STATES.map((s) => (
              <Link
                key={s.slug}
                to={`/esa-letter/${s.slug}`}
                className="group flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] font-medium hover:border-emerald-400 hover:bg-emerald-50 hover:text-[#0E2A47] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 group-hover:text-emerald-700" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{s.name}</span>
              </Link>
            ))}
          </div>

          <div className="text-center">
            <Link
              to="/explore-esa-letters-all-states"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0E2A47] hover:text-[#091B30] underline-offset-2 hover:underline"
            >
              View all 50 states
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 6. FAQ — short ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-14 md:py-20">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-8 text-center leading-[1.18]">
            Common questions.
          </h2>
          <div className="space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={item.q}
                open={i === 0}
                className="group rounded-lg px-4 py-3 border border-slate-200 bg-white"
              >
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                  <span className="text-[13.5px] font-semibold text-slate-900 leading-snug">{item.q}</span>
                  <span aria-hidden className="text-[18px] leading-none flex-shrink-0 transition-transform duration-200 text-[#0E2A47] group-open:rotate-45 group-open:text-emerald-600">+</span>
                </summary>
                <div className="text-[12.5px] text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 7. FINAL CTA ─────────── */}
      <section className="relative bg-gradient-to-b from-[#0E2A47] to-[#091B30] text-white overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ background: "radial-gradient(circle at 50% 0%, #ffffff 0%, transparent 60%)" }}
        />
        <div className="relative max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
          <h2 className="text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-3">
            See If You Qualify Today
          </h2>
          <p className="text-[14px] text-slate-300 leading-relaxed mb-6 max-w-xl mx-auto">
            Reviewed by a Licensed Mental Health Practitioner in your state. ESA documentation issued only when clinically appropriate. Refund if you don&rsquo;t qualify.
          </p>
          <Link
            to={ASSESSMENT_HREF}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] md:text-[16px] px-8 py-4 rounded-md transition w-full sm:w-auto shadow-[0_4px_16px_rgba(249,115,22,0.35)]"
          >
            Start Your ESA Evaluation
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <SharedFooter />
        </>
      )}

      {/* Mobile sticky CTA — appears after the hero scrolls out. Reuses the
          homepage component (label "Get Your ESA Letter — From $99"). */}
      <MobileStickyApplyCTA showAfterPx={500} />
    </main>
  );
}

function HeroCheck() {
  return (
    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
