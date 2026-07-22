import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import Hud2026UpdateBanner from "@/components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "@/components/feature/MobileStickyApplyCTA";
import PlanPricingSection from "@/components/feature/PlanPricingSection";
import TestimonialsSection from "@/pages/home/components/TestimonialsSection";
import { ESA_PLAN_COPY, buildEsaPlanCards } from "@/data/planPricingCards";
import { useAttributionParams } from "@/hooks/useAttributionParams";

// ============================================================================
// /esa-letter-housing — Revision 3 challenger
// (ESA-HOUSING-LANDING-PAGE-REVISION-3-TEST-IMPLEMENTATION-001)
//
// Paid-search landing page. Kept noindex,nofollow (unchanged). Homepage visual
// system: warm cream grounds, Source Serif headings, orange CTA, green trust
// accent. Pricing is ESA-only and reuses the shared PlanPricingSection +
// buildEsaPlanCards (src/config/pricing.ts single source of truth) so it can
// never drift from the homepage — NO PSD price on this page. Reviews reuse the
// homepage TestimonialsSection (real 4.9 / 15,000+ / 50-states + 3 reviews).
// Verification is a NON-networked native sample-data preview (no /verify API
// call, no customer data). Verification ID format matches the real product
// (ESA-XX-XXXXXXX); the previous stale letter-ID format in the FAQ copy is
// corrected here to match src/pages/verify.
// ============================================================================

const LP_TITLE = "Get an ESA Letter for Housing — Reviewed by Licensed Providers | PawTenant";
const LP_DESC =
  "Verified with a unique ID your landlord can confirm in seconds. Reviewed by licensed mental health providers. Refund if you don't qualify.";

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' } as const;
const WRAP = "max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";

// Curated public providers shown on this page (names + public credential +
// approved marketing headshot only — no private email / NPI / internal id).
const PROVIDERS = [
  {
    name: "Stephanie White",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-stephanie-white.jpg",
    bio: "Outpatient mental health practice. Anxiety, mood, and life-transition care.",
  },
  {
    name: "Robert Staaf",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-robert-staaf.jpg",
    bio: "Years of clinical experience supporting tenants with documented housing needs.",
  },
  {
    name: "Lytara Garcia",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-lytara-garcia.jpg",
    bio: "Clinical evaluations focused on emotional support animal accommodation context.",
  },
];

const COVERAGE_STATES = [
  "California", "Texas", "Florida", "New York", "Illinois", "Pennsylvania",
  "Virginia", "North Carolina", "Georgia", "Arizona", "Ohio", "Michigan",
  "Washington", "Massachusetts", "Colorado",
];

// Non-networked sample fixture for the verification preview. Synthetic only —
// matches the site's own sample-letter placeholder identity. NO real customer
// or provider private data. Format matches the real product (ESA-XX-XXXXXXX).
const VERIFY_SAMPLE = {
  id: "ESA-CA-8F3K92",
  type: "Emotional Support Animal (ESA)",
  state: "California",
  issued: "April 10, 2026",
  expires: "April 10, 2027",
  provider: "Dr. Amelia Hart, LPC-S",
  npi: "1234567890",
  license: "LPC-204817-CA",
} as const;

// FAQ list expanded for Google Ads keyword coverage. Wording stays human and
// compliance-safe. Verification-ID format corrected to the real ESA-XX-XXXXXXX.
const FAQ_ITEMS = [
  {
    q: "Are online ESA letters legit?",
    a: "Yes — when issued by a Licensed Mental Health Practitioner after a real clinical review. PawTenant ESA letters are reviewed by providers licensed in your state, and every letter prints the provider's name, license number, and NPI. The unique Verification ID on each letter lets your landlord confirm authenticity at pawtenant.com/verify. Auto-approval services that issue letters without a real review are not legitimate.",
  },
  {
    q: "I need an ESA letter for my dog — how does it work?",
    a: "You complete a short clinical assessment (about 5 minutes). A Licensed Mental Health Practitioner in your state reviews it, typically within 24 hours. If you qualify, you receive a housing-focused ESA letter as a secure PDF that names your dog (or other ESA) and includes the provider's credentials. If you do not qualify after review, your payment is refunded.",
  },
  {
    q: "How do I get an ESA letter from a doctor or licensed practitioner?",
    a: "ESA letters are issued by a Licensed Mental Health Practitioner — therapist, psychologist, LCSW, LPC, or LMHP — not a general-practice doctor. PawTenant matches your assessment with a practitioner credentialed in your state, who reviews your case and signs the letter when an ESA is clinically appropriate.",
  },
  {
    q: "Which dog breeds qualify as emotional support animals?",
    a: "Any well-behaved dog can be an emotional support animal — qualification depends on the handler's clinical need, not the dog's breed, size, or weight. Under the Fair Housing Act, landlords generally cannot use breed restrictions, weight limits, or breed-based pet policies as a reason to deny a reasonable accommodation request for a qualifying ESA. Cats and other domesticated animals may also qualify.",
  },
  {
    q: "How much does an ESA letter cost?",
    a: "PawTenant's housing ESA letter is $129 for one pet, valid for one year; 2 or 3 pets are covered at a fixed $149 total (up to three per document). The fee covers the full clinical assessment and licensed provider review. If you do not qualify after review, your payment is refunded — there is no charge for an evaluation that does not lead to a letter. Klarna is also available at checkout, subject to eligibility and Klarna's payment terms.",
  },
  {
    q: "How do I know if an online ESA letter provider is legitimate?",
    a: "A legitimate online ESA letter provider connects you with a Licensed Mental Health Practitioner credentialed in your state, who reviews your case and signs the letter when an ESA is clinically appropriate. The letter should print the provider's full name, license number, and NPI — and ideally include a unique Verification ID landlords can confirm directly. Avoid services that promise instant approval, guaranteed letters, or skip the clinical review.",
  },
  {
    q: "Will my landlord accept this documentation?",
    a: "Most landlords subject to the federal Fair Housing Act must consider reasonable accommodation requests for tenants with a qualifying ESA. PawTenant documentation is written to align with FHA standards and includes the provider's credentials, license number, and NPI — plus a unique Verification ID your landlord can confirm in seconds.",
  },
  {
    q: "How does landlord verification work?",
    a: "Every document carries a unique Verification ID (format ESA-XX-XXXXXXX). Your landlord enters the ID at pawtenant.com/verify and the page confirms the document is authentic and the provider is actively licensed — without showing any diagnosis or clinical detail. The provider's license can also be independently confirmed on the public NPPES NPI registry.",
  },
  {
    q: "How fast is the process?",
    a: "The clinical assessment takes about 5 minutes. Most assessments are reviewed by a Licensed Mental Health Practitioner within 24 hours. If you qualify, your documentation is delivered as a secure PDF the same day.",
  },
  {
    q: "Do I qualify for an emotional support animal letter?",
    a: "You may qualify if you have a mental or emotional condition (such as anxiety, depression, PTSD, or a related diagnosis) and a Licensed Mental Health Practitioner determines that an ESA supports your wellbeing. Eligibility is determined by the practitioner after clinical review — never by an algorithm. If you do not qualify, your payment is refunded.",
  },
  {
    q: "What if I don't qualify after review?",
    a: "If a Licensed Mental Health Practitioner does not approve ESA documentation after reviewing your assessment, your payment is refunded in full. The provider will typically include a note on what additional context might support a future request.",
  },
  {
    q: "What credentials does the provider have?",
    a: "Every reviewing provider is an actively licensed mental health practitioner (LMHP, LCSW, LPC, psychologist, or therapist) credentialed in the state where you live. Provider name, license number, and NPI are printed on every document and independently verifiable on the public NPPES NPI registry.",
  },
  {
    q: "What's the difference between an ESA letter and a PSD letter?",
    a: "An ESA (Emotional Support Animal) letter supports a housing accommodation request under the Fair Housing Act — it does not require trained tasks and is not for public access or airline travel. A Psychiatric Service Dog (PSD) letter is for a trained service dog and supports both housing and air-travel documentation (DOT Service Animal form). PawTenant offers both.",
  },
  {
    q: "Can my landlord deny an ESA accommodation request?",
    a: "A landlord subject to the FHA may only deny a reasonable accommodation request in narrow circumstances (e.g., the animal poses a direct threat that cannot be mitigated, or causes substantial property damage). Generic no-pet policies, breed restrictions, weight limits, and pet rent are not, on their own, valid reasons to deny a qualifying ESA.",
  },
  {
    q: "Is the documentation legally valid?",
    a: "We are not a law firm and don't provide legal advice. PawTenant documentation is housing-related ESA documentation issued by a Licensed Mental Health Practitioner, written to align with FHA reasonable accommodation standards. The legal force of any individual accommodation request depends on the property type, applicable law, and the landlord's review.",
  },
];

// ── small presentational helpers ────────────────────────────────────────────
function Check({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function Dash({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[13px] font-extrabold tracking-[0.07em] uppercase text-[#3F7061] mb-3">
      {children}
    </span>
  );
}

export default function LpEsaHousingPage() {
  // Mobile-only: show first 4 FAQs initially, rest behind "Show more questions".
  const [showAllMobile, setShowAllMobile] = useState(false);
  // Verification preview: result is visible by default (design review) and the
  // "Verify" button re-affirms it with a brief highlight — no network call.
  const [verifyPulse, setVerifyPulse] = useState(false);
  const { withAttribution } = useAttributionParams();
  const CTA_HREF = withAttribution("/assessment");

  // Set <title>, meta description, and noindex per page-load. Restore on unmount.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = LP_TITLE;

    const ensureMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      };
    };

    const restoreRobots = ensureMeta("robots", "noindex, nofollow");
    const restoreDesc = ensureMeta("description", LP_DESC);

    return () => {
      document.title = prevTitle;
      restoreRobots();
      restoreDesc();
    };
  }, []);

  return (
    <main className="bg-[#FDFBF7] text-[#4A443C] antialiased">
      <SharedNavbar />

      {/* ─────────── 1. HERO — full-bleed image, centered content ───────────
          Mobile (≤768px) mirrors the homepage hero verbatim: same Pomeranian LCP
          image (already preloaded in index.html → used, not a stale preload, and
          no 2nd fetch), same 55%/35% focal, same gray-900 vertical scrim + bottom
          band, full 100svh box. Desktop (≥769px) keeps the approved ESA housing
          hero image, brand-ink scrim, 62%/42% focal and 648px box — unchanged.
          One media-gated <picture> so only the matching variant downloads. */}
      <section className="relative min-h-[100svh] md:min-h-[648px] flex items-center overflow-hidden isolate">
        <picture>
          {/* Mobile ≤768px — homepage hero image (visual parity with "/") */}
          <source media="(max-width: 768px)" srcSet="/assets/blog/pawtenant-mobile-hero-pomeranian-sm.webp" type="image/webp" />
          {/* Desktop ≥769px — approved ESA housing hero image (unchanged) */}
          <source media="(min-width: 769px)" srcSet="/assets/lifestyle/esa-housing-hero-owner-dog.webp" type="image/webp" />
          <img
            src="/assets/lifestyle/esa-housing-hero-owner-dog.jpg"
            alt="Renter relaxing at home with her emotional support dog in a bright apartment"
            className="absolute inset-0 -z-20 w-full h-full object-cover object-[55%_35%] md:object-[62%_42%] opacity-80 md:opacity-100"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width={1600}
            height={900}
          />
        </picture>
        {/* Mobile scrim — homepage treatment (symmetric gray-900 gradient + bottom band) */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-gray-900/70 via-gray-900/60 to-gray-900/75 md:hidden" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-gray-900/70 to-transparent md:hidden" />
        {/* Desktop scrim — approved ESA brand-ink gradient (unchanged) */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 hidden md:block"
          style={{ background: "linear-gradient(180deg, rgba(28,24,20,0.72) 0%, rgba(28,24,20,0.58) 45%, rgba(28,24,20,0.74) 100%)" }}
        />
        <div className={`${WRAP} py-14 md:py-16 w-full`}>
          <div className="max-w-[600px] mx-auto text-center text-white">
            {/* Only "ESA Letter" wears the homepage hero orange (text-orange-400); the
                rest of the headline stays white. Exactly one H1, wording unchanged. */}
            <h1 className="text-white text-[32px] leading-[1.14] sm:text-[40px] lg:text-[46px] lg:leading-[1.12] font-semibold mb-4" style={FONT_DISPLAY}>
              Get an <span className="text-orange-400">ESA Letter</span> for Housing — Reviewed by Licensed Providers
            </h1>
            <p className="text-white/90 text-[16.5px] md:text-lg leading-relaxed mx-auto mb-5 md:mb-7 max-w-[48ch]">
              Complete a confidential 5-minute assessment. A licensed provider in your state reviews it.<span className="hidden md:inline"> Your documentation carries a unique ID your landlord can confirm in seconds.</span>
            </p>
            {/* Mobile-only price teaser — homepage installment anchor style. The full
                Klarna/payment detail stays in the pricing section + the desktop line. */}
            <p className="md:hidden text-gray-100 text-[17px] sm:text-lg mb-7">
              Start for as low as{" "}
              <strong className="text-white font-bold text-[21px] sm:text-[23px]" style={FONT_DISPLAY}>$32.25</strong>
            </p>
            <div className="flex flex-col items-center gap-3.5">
              <a
                href={CTA_HREF}
                className="w-full max-w-[340px] sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[17px] px-9 py-4 rounded-md shadow-lg shadow-orange-500/30 transition-colors"
              >
                Check If You Qualify
              </a>
              {/* Desktop-only: verification link (mobile keeps a single dominant CTA) */}
              <a href="#verification" className="hidden md:inline-flex text-white/90 hover:text-white text-[14.5px] font-bold underline underline-offset-[3px]">
                See how landlord verification works →
              </a>
            </div>
            <div className="mt-6 flex flex-col items-center gap-2.5">
              {/* Refund reassurance — mobile uses the homepage emerald status icon
                  (ri-checkbox-circle-fill / text-emerald-300); desktop keeps its
                  existing sage check so the approved desktop hero is unchanged. */}
              <span className="inline-flex items-center gap-1.5 md:gap-2 text-[14px] font-medium text-white/90">
                <i className="ri-checkbox-circle-fill text-emerald-300 md:hidden" aria-hidden></i>
                <Check className="hidden md:inline-block w-4 h-4 text-[#8FBCAB]" />
                Full refund if you don't qualify after review.
              </span>
              {/* Desktop-only: Klarna belongs with pricing/payment, not the mobile hero */}
              <span className="hidden md:inline-flex items-center gap-2 text-[14px] font-medium text-white/90">
                <span aria-hidden className="inline-flex items-center justify-center w-[21px] h-[21px] rounded-[5px] bg-[#FFB3C7] text-[#17120F] font-extrabold text-[11.5px]">K.</span>
                Start for as low as $32.25 with Klarna
              </span>
            </div>
            {/* Mobile-only coverage pill — homepage style. Compact reassurance inside
                the hero; the four-item trust strip stays below the hero, unchanged. */}
            <div className="md:hidden inline-flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-2.5 rounded-full mt-7">
              <i className="ri-map-2-line text-orange-400" aria-hidden></i>
              <span className="text-white text-xs font-semibold whitespace-nowrap">Serving all 50 US states</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 2. TRUST STRIP (below hero) ─────────── */}
      {/* Rating/count mirror the homepage TestimonialsSection stats (approved,
          already-published: 4.9 · 15,000+ · 50 states). */}
      <div className="bg-[#F7F2E9] border-b border-[#EAE3D7]">
        <div className={`${WRAP} grid grid-cols-2 gap-x-3.5 gap-y-0 py-5 lg:grid-cols-4 lg:gap-0 lg:py-[22px]`}>
          {[
            { icon: <StarSolid />, b: "4.9 rating", s: "15,000+ pet owners" },
            { icon: <ShieldStroke />, b: "Licensed clinicians", s: "Reviewed in your state" },
            { icon: <RefundStroke />, b: "Refund if not qualified", s: "Full refund if you don't qualify after review" },
            { icon: <BadgeStroke />, b: "Verification ID", s: "On every letter issued" },
          ].map((t) => (
            <div key={t.b} className="flex items-center gap-3 px-1.5 py-3 lg:justify-center lg:px-2.5 lg:py-1.5">
              <span className="flex-none w-[42px] h-[42px] rounded-xl bg-white border border-[#EAE3D7] flex items-center justify-center text-[#3F7061]">
                {t.icon}
              </span>
              <span>
                <span className="block text-[14.5px] font-bold text-[#231F1A] leading-tight">{t.b}</span>
                <span className="block text-[12.5px] text-[#6E675C] leading-snug mt-0.5">{t.s}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── 3. HOUSING PROBLEMS + FHA RIGHTS ─────────── */}
      <section className="bg-[#FDFBF7] py-14 md:py-20">
        <div className={`${WRAP} grid grid-cols-1 md:grid-cols-[1.05fr_.95fr] gap-8 md:gap-14 items-stretch`}>
          <div className="flex flex-col">
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] leading-[1.16] font-semibold" style={FONT_DISPLAY}>
              No-pet buildings. Pet rent. Breed restrictions.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed mt-3.5">
              The Fair Housing Act may protect your right to live with an Emotional Support Animal — even in buildings with strict pet policies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8 mt-6">
              {[
                { t: "No-pet buildings", d: "Many leases ban pets. A reasonable accommodation request changes that conversation.", icon: <HomeStroke /> },
                { t: "Pet rent and deposits", d: "Tenants with qualifying ESA documentation are typically not charged pet deposits or monthly pet fees.", icon: <CoinStroke /> },
                { t: "Breed and weight rules", d: "Generally don't apply to qualified Emotional Support Animals under FHA accommodations.", icon: <PawStroke className="w-[19px] h-[19px]" /> },
                { t: "Lease violation risk", d: "An unauthorized pet can trigger eviction. Documentation gives you a lawful, documented accommodation.", icon: <AlertStroke /> },
              ].map((f) => (
                <div key={f.t} className="flex gap-3.5 py-4 border-t border-[#EAE3D7]">
                  <span className="flex-none w-10 h-10 rounded-[10px] bg-[#FFF4EB] text-[#EA580C] flex items-center justify-center">
                    {f.icon}
                  </span>
                  <div>
                    <div className="text-[15.5px] font-bold text-[#231F1A] mb-1">{f.t}</div>
                    <p className="text-[14px] leading-snug text-[#4A443C]">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-r-xl border-l-[3px] border-[#3F7061] bg-[#EDF3F0] px-5 py-5">
              <div className="text-[15px] font-bold text-[#15433C] mb-2.5">Your rights under the federal Fair Housing Act</div>
              <ul className="grid gap-2">
                {[
                  "Landlords covered by the FHA must consider reasonable accommodation requests — including in no-pet buildings.",
                  "A qualifying ESA is not treated as a pet, so pet rent, pet deposits, and breed-based fees typically don't apply.",
                  "A landlord may ask for the ESA letter itself — but cannot demand a diagnosis or your medical history.",
                ].map((r) => (
                  <li key={r} className="flex gap-2.5 text-[14px] leading-snug text-[#4A443C]">
                    <Check className="w-3.5 h-3.5 mt-1 flex-none text-[#3F7061]" /> <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              <a href={CTA_HREF} className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[16px] px-7 py-4 rounded-md shadow-lg shadow-orange-500/25 transition-colors">
                Check If You Qualify
              </a>
              <span className="text-[13.5px] text-[#4A443C] inline-flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#3F7061]" /> About 5 minutes · refund if you don't qualify
              </span>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="relative rounded-2xl overflow-hidden border border-[#EAE3D7] min-h-[280px] md:h-full md:min-h-0 grow">
              <picture>
                <source srcSet="/assets/lifestyle/esa-housing-couple-moving-in.webp" type="image/webp" />
                <img
                  src="/assets/lifestyle/esa-housing-couple-moving-in.jpg"
                  alt="A couple moving into a bright new apartment, greeting their dog among moving boxes"
                  className="w-full h-full object-cover aspect-[4/3] md:aspect-auto"
                  loading="lazy"
                  decoding="async"
                  width={928}
                  height={1152}
                />
              </picture>
            </div>
            <p className="flex items-center gap-2.5 text-[13px] font-semibold text-[#4A443C] pt-3">
              <HomeStroke className="w-[17px] h-[17px] text-[#3F7061]" /> Move in together — with documentation your landlord can check.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── 4. PROCESS (centered) ─────────── */}
      <section className="bg-[#F7F2E9] py-14 md:py-20">
        <div className={`${WRAP} text-center`}>
          <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold" style={FONT_DISPLAY}>
            A simple, three-step process.
          </h2>
          <div className="relative mt-9 mx-auto max-w-[340px] md:max-w-none flex flex-col items-center md:grid md:grid-cols-3 md:gap-6">
            {/* DESKTOP-ONLY horizontal connector, drawn through the circle centers
                (top:22px) between the first and last circle. On mobile the
                connector is an in-flow segment rendered after each step's text
                (below) so the line never crosses any title/description. */}
            <span aria-hidden className="hidden md:block absolute z-0 bg-[#DCD2C0] left-[16.66%] right-[16.66%] top-[22px] h-0.5" />
            {[
              { n: 1, t: "Complete the assessment", d: "A confidential clinical questionnaire. About 5 minutes." },
              { n: 2, t: "Licensed professional review", d: "A provider licensed in your state reviews and evaluates. Typically within 24 hours." },
              { n: 3, t: "Documentation issued", d: "If you qualify, you receive housing-related documentation. If not, your payment is refunded." },
            ].map((s, i) => (
              <div key={s.n} className="relative z-10 flex flex-col items-center w-full px-2 pt-2.5 md:py-2.5">
                <span className="flex-none w-11 h-11 rounded-full bg-[#231F1A] text-white text-[17px] font-bold flex items-center justify-center ring-[6px] ring-[#F7F2E9] md:mb-4">
                  {s.n}
                </span>
                <h3 className="text-[18px] font-semibold text-[#231F1A] mt-3.5 md:mt-0 mb-1.5" style={FONT_DISPLAY}>{s.t}</h3>
                <p className="text-[14.5px] leading-snug text-[#4A443C] max-w-[30ch]">{s.d}</p>
                {/* mobile-only connector: sits in normal flow, in the empty space
                    below the text and above the next circle — never behind text */}
                {i < 2 && <span aria-hidden className="md:hidden w-0.5 h-7 bg-[#DCD2C0] mt-4" />}
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center gap-3">
            <a href={CTA_HREF} className="w-full max-w-[340px] sm:w-auto inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[16px] px-7 py-4 rounded-md shadow-lg shadow-orange-500/25 transition-colors">
              Check If You Qualify
            </a>
            <span className="text-[13.5px] text-[#6E675C]">Secure PDF delivery — typically within 24 hours of review</span>
          </div>
        </div>
      </section>

      {/* ─────────── 5. WHAT YOU RECEIVE (centered, balanced) ─────────── */}
      <section className="bg-[#FDFBF7] py-14 md:py-20">
        <div className={WRAP}>
          <div className="max-w-[680px] mx-auto text-center mb-10">
            <Eyebrow>What's included</Eyebrow>
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold mb-3" style={FONT_DISPLAY}>
              Everything your housing request needs.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed">
              If a licensed provider approves your assessment, your documentation arrives ready to hand to your landlord.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:gap-x-9 lg:gap-x-10">
            {[
              { b: "Licensed provider evaluation", d: "Reviewed by a Licensed Mental Health Practitioner in your state — never auto-approved." },
              { b: "Signed, FHA-compliant ESA letter", d: "Housing-focused language written for reasonable accommodation requests." },
              { b: "Credentials printed on the letter", d: "Provider name, license number, and NPI — independently checkable on NPPES." },
              { b: "Unique letter verification ID", d: "Your landlord confirms it at pawtenant.com/verify in seconds." },
              { b: "Secure PDF delivery", d: "Typically within 24 hours of provider review." },
              { b: "Full refund if you don't qualify", d: "If a provider doesn't approve after clinical review, your payment is refunded." },
            ].map((r) => (
              <div key={r.b} className="flex gap-3 py-4 border-t border-[#EAE3D7]">
                <Check className="w-[17px] h-[17px] mt-0.5 flex-none text-[#3F7061]" />
                <div>
                  <div className="text-[15px] font-bold text-[#231F1A] mb-0.5">{r.b}</div>
                  <p className="text-[13.5px] leading-snug text-[#4A443C]">{r.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 6. SAMPLE LETTER — what the Verification ID is + where it appears ─────────── */}
      <section className="bg-[#F7F2E9] py-14 md:py-20">
        <div className={`${WRAP} grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center`}>
          <div className="rounded-2xl border border-[#EAE3D7] p-7 sm:p-10 flex justify-center" style={{ background: "linear-gradient(165deg,#F7F2E9,#EFE7D8)" }}>
            <figure className="m-0 w-[min(400px,100%)] bg-white border border-[#EFE9DD] rounded-lg shadow-[0_14px_40px_rgba(35,31,26,0.13)] p-3.5">
              <img
                src="/images/checkout/esa-sample-letter.svg"
                alt="Sample PawTenant ESA letter showing the verification ID, provider credentials, and housing-accommodation language. Names and details are placeholders."
                className="w-full"
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
          <div>
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold" style={FONT_DISPLAY}>
              Every letter carries a Verification ID.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed mt-3.5 mb-6">
              The reviewing provider's full credentials — name, license number, NPI — are printed on the document and independently checkable through the public NPPES NPI registry.
            </p>
            <ul className="grid gap-2.5 mb-6">
              {[
                "Unique Verification ID printed in the letter header",
                "Provider name, license number, and NPI on the document",
                "Housing-accommodation language aligned with FHA standards",
                "Your privacy protected — authenticity is confirmed, never diagnosis",
              ].map((x) => (
                <li key={x} className="flex gap-2.5 text-[15px] leading-snug text-[#4A443C]"><Check className="w-4 h-4 mt-0.5 flex-none text-[#3F7061]" /> <span>{x}</span></li>
              ))}
            </ul>
            <p className="text-[12.5px] text-[#6E675C] mb-6">Sample template · placeholder names · individual letters vary based on the provider's clinical review.</p>
            <a href={CTA_HREF} className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[16px] px-7 py-4 rounded-md shadow-lg shadow-orange-500/25 transition-colors">
              Check If You Qualify
            </a>
          </div>
        </div>
      </section>

      {/* ─────────── 7. VERIFICATION (input + result — native, sample data) ─────────── */}
      <section id="verification" className="bg-[#FDFBF7] py-14 md:py-20 scroll-mt-20">
        <div className={WRAP}>
          <div className="max-w-[680px] mx-auto text-center mb-5">
            <Eyebrow>Landlord verification</Eyebrow>
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold mb-3" style={FONT_DISPLAY}>
              Your landlord can verify the letter in under 60 seconds.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed">
              Every letter carries a unique Verification ID. Your landlord enters it at pawtenant.com/verify — here's the exact experience they see, from entry to verified result.
            </p>
          </div>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 text-[11.5px] font-bold tracking-[0.05em] uppercase text-[#6E675C] bg-white border border-[#EAE3D7] rounded-full px-3.5 py-1.5 mb-6">
              Interactive preview · sample data only
            </span>
          </div>
          <div className="max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7 items-start">
            {/* INPUT */}
            <div>
              <p className="flex items-center justify-center gap-2 text-[11.5px] font-bold tracking-[0.06em] uppercase text-[#6E675C] mb-3">
                <span className="w-5 h-5 rounded-full bg-[#231F1A] text-white text-[11px] font-bold flex items-center justify-center">1</span>
                Landlord enters the ID
              </p>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 sm:p-7 shadow-[0_6px_22px_rgba(35,31,26,0.06)]">
                <h3 className="font-sans text-[18px] font-extrabold text-[#111827] mb-2">Letter Verification</h3>
                <p className="text-[13px] leading-snug text-[#6B7280] mb-[18px]">
                  This page verifies the authenticity and status of a Pawtenant-issued verification ID. Enter the ID exactly as it appears on the letter.
                </p>
                <label htmlFor="lp-verify-id" className="block text-[11px] font-bold tracking-[0.1em] uppercase text-[#9CA3AF] mb-2">Verification ID</label>
                <input
                  id="lp-verify-id"
                  type="text"
                  defaultValue={VERIFY_SAMPLE.id}
                  spellCheck={false}
                  autoComplete="off"
                  readOnly
                  aria-describedby="lp-verify-help"
                  className="w-full font-mono text-[16px] tracking-[0.8px] uppercase text-[#111827] bg-white border border-[#E5E7EB] rounded-xl px-4 py-3.5"
                />
                <p id="lp-verify-help" className="text-[12px] text-[#9CA3AF] mt-2 mb-[18px]">Format: ESA-XX-XXXXXXX or PSD-XX-XXXXXXX</p>
                <button
                  type="button"
                  onClick={() => {
                    setVerifyPulse(true);
                    window.setTimeout(() => setVerifyPulse(false), 1400);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-[14px] rounded-xl px-6 py-3.5 transition-colors"
                >
                  Verify Letter ID
                </button>
                <p className="flex gap-1.5 text-[11.5px] leading-snug text-[#9CA3AF] mt-[18px]">
                  <LockStroke className="w-[13px] h-[13px] mt-0.5 flex-none" />
                  This verification confirms the authenticity of the letter ID only. No patient health information, diagnosis, or personal details are displayed on this page.
                </p>
              </div>
            </div>
            {/* RESULT */}
            <div>
              <p className="flex items-center justify-center gap-2 text-[11.5px] font-bold tracking-[0.06em] uppercase text-[#6E675C] mb-3">
                <span className="w-5 h-5 rounded-full bg-[#231F1A] text-white text-[11px] font-bold flex items-center justify-center">2</span>
                The verified result appears <span className="normal-case tracking-normal font-semibold text-[#6E675C]">— sample data</span>
              </p>
              <div
                className={`bg-white border border-[#A7F3D0] rounded-2xl overflow-hidden shadow-[0_6px_22px_rgba(5,150,105,0.09)] transition-shadow ${verifyPulse ? "ring-4 ring-emerald-500/20" : ""}`}
                aria-live="polite"
              >
                <div className="text-center px-6 pt-[22px] pb-1.5">
                  <span className="w-[52px] h-[52px] rounded-[15px] bg-[#D1FAE5] text-[#059669] flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck />
                  </span>
                  <h3 className="font-sans text-[20px] font-extrabold text-[#111827] mb-1.5">Letter Verified</h3>
                  <p className="text-[13px] text-[#6B7280]">This Pawtenant-issued letter ID is authentic and currently valid.</p>
                </div>
                <div className="bg-[#ECFDF5] border-y border-[#D1FAE5] mt-4 px-[22px] py-3 flex items-center justify-between gap-2.5">
                  <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-[#047857]">
                    <FileCheck /> Verification Result
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-bold bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0]">
                    <ShieldCheck className="w-[13px] h-[13px]" /> Valid
                  </span>
                </div>
                <div className="px-[22px] py-[18px] grid gap-3.5">
                  <Field label="Verification ID" value={VERIFY_SAMPLE.id} mono />
                  <div className="grid grid-cols-2 gap-3.5">
                    <Field label="Letter Type" value={VERIFY_SAMPLE.type} />
                    <Field label="State" value={VERIFY_SAMPLE.state} />
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <Field label="Issue Date" value={VERIFY_SAMPLE.issued} />
                    <Field label="Expiration Date" value={VERIFY_SAMPLE.expires} />
                  </div>
                  <Field label="Issuing Provider" value={VERIFY_SAMPLE.provider} />
                  <div className="grid grid-cols-2 gap-3.5">
                    <Field label="NPI Number" value={VERIFY_SAMPLE.npi} mono />
                    <Field label="State License (CA)" value={VERIFY_SAMPLE.license} mono />
                  </div>
                </div>
                <div className="border-t border-[#F3F4F6] bg-[#F9FAFB] px-[22px] py-3">
                  <p className="flex gap-1.5 text-[11.5px] leading-snug text-[#9CA3AF]">
                    <LockStroke className="w-[13px] h-[13px] mt-0.5 flex-none" />
                    This verification confirms the authenticity of the letter ID only. No patient health information is displayed.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* what can be verified / what stays private */}
          <div className="max-w-[1000px] mx-auto mt-9 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12">
            <div>
              <div className="flex items-center gap-2.5 text-[14.5px] font-bold text-[#231F1A] mb-2.5">
                <Check className="w-4 h-4 text-[#3F7061]" /> What landlords can verify
              </div>
              <ul className="grid gap-2">
                {[
                  "The Verification ID is real and active",
                  "The provider holds an active mental health license in your state",
                  "Provider name, license number, and NPI shown",
                  "Letter type, state, issue and expiration dates",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5 text-[13.5px] leading-snug text-[#4A443C]"><Check className="w-3.5 h-3.5 mt-0.5 flex-none text-[#3F7061]" /> <span>{x}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2.5 text-[14.5px] font-bold text-[#231F1A] mb-2.5">
                <LockStroke className="w-4 h-4 text-[#3F7061]" /> What stays private
              </div>
              <ul className="grid gap-2">
                {[
                  "Your diagnosis or any clinical detail",
                  "Your assessment responses or treatment history",
                  "Provider notes or recommendations",
                  "Anything beyond what's needed to confirm authenticity",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5 text-[13.5px] leading-snug text-[#4A443C]"><Dash className="w-3.5 h-3.5 mt-0.5 flex-none text-[#6E675C]" /> <span>{x}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <p className="max-w-[820px] mx-auto mt-6 text-center text-[13px] text-[#6E675C]">
            Provider licenses are also independently verifiable on the public NPPES NPI registry · HIPAA-aligned data handling
          </p>
        </div>
      </section>

      {/* ─────────── 8. ESA PRICING (shared source — no PSD price) ─────────── */}
      <PlanPricingSection
        theme="esa"
        id="pricing"
        className="bg-[#FDF8F3]"
        eyebrow={ESA_PLAN_COPY.eyebrow}
        heading={ESA_PLAN_COPY.heading}
        subheading={ESA_PLAN_COPY.subheading}
        footnote={ESA_PLAN_COPY.footnote}
        cards={buildEsaPlanCards("/assessment")}
      />

      {/* ─────────── 9. PROVIDERS + COVERAGE ─────────── */}
      <section className="bg-[#FDFBF7] py-14 md:py-20">
        <div className={WRAP}>
          <div className="max-w-[680px] mx-auto text-center mb-8">
            <Eyebrow>Licensed professional review</Eyebrow>
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold mb-3" style={FONT_DISPLAY}>
              Reviewed by a licensed mental health provider in your state.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed">
              Each assessment is reviewed by an actively licensed mental health professional in the state where you live. We do not auto-approve.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="flex gap-4 bg-white border border-[#EAE3D7] rounded-2xl p-[22px]">
                <img src={p.photo} alt={`${p.name}, ${p.credential}`} loading="lazy" decoding="async" width={58} height={58} className="flex-none w-[58px] h-[58px] rounded-full object-cover ring-1 ring-[#EAE3D7]" />
                <div>
                  <div className="text-[15.5px] font-bold text-[#231F1A] leading-tight">{p.name}</div>
                  <div className="text-[12.5px] font-medium text-[#6E675C] mt-0.5 mb-2">{p.credential}</div>
                  <p className="text-[13.5px] leading-snug text-[#4A443C] mb-2.5">{p.bio}</p>
                  <div className="flex flex-wrap gap-3.5 text-[12px] font-bold text-[#15433C]">
                    <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> NPI verifiable</span>
                    <span>Active license</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[13.5px] text-[#6E675C] mt-6">
            Provider availability depends on the states where each clinician is currently licensed. Provider matching happens during assessment.{" "}
            <Link to="/our-providers" className="font-bold text-[#3F7061] hover:underline">See all our providers →</Link>
          </p>

          <div className="mt-11 pt-9 border-t border-[#EAE3D7] text-center">
            <h3 className="text-[20px] font-semibold text-[#231F1A] mb-2" style={FONT_DISPLAY}>ESA Letter Support Across All 50 States</h3>
            <p className="max-w-[64ch] mx-auto text-[14px] text-[#4A443C] mb-[18px]">
              Our licensed providers can evaluate your situation and provide ESA documentation when clinically appropriate — in compliance with Fair Housing guidelines. Requirements may vary slightly by state, but ESA housing rights are federally protected under the Fair Housing Act.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[820px] mx-auto">
              {COVERAGE_STATES.map((s) => (
                <span key={s} className="text-[13px] text-[#4A443C] bg-white border border-[#EAE3D7] rounded-full px-3 py-2">{s}</span>
              ))}
              <span className="text-[13px] font-bold text-[#15433C] bg-[#EDF3F0] border border-[#CFE0D8] rounded-full px-3 py-2">+ 35 more states</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 10. QUALIFICATION (text + provider image) ─────────── */}
      <section className="bg-[#F7F2E9] py-14 md:py-20">
        <div className={`${WRAP} grid grid-cols-1 md:grid-cols-[1.05fr_.95fr] gap-8 md:gap-14 items-stretch`}>
          <div className="flex flex-col">
            <h2 className="text-[#231F1A] text-[27px] md:text-[34px] leading-[1.16] font-semibold" style={FONT_DISPLAY}>
              Not everyone qualifies — and that's the point.
            </h2>
            <p className="text-[#4A443C] text-[16px] md:text-[18px] leading-relaxed mt-3.5">
              An ESA letter is clinical documentation, not a product. Issuing one without justification undermines the system — and gets letters rejected by landlords.
            </p>
            <p className="text-[14px] leading-relaxed text-[#4A443C] mt-4">
              Our process is designed to be compliant, not automatic — which helps landlords take the documentation seriously. A licensed provider decides whether an Emotional Support Animal is clinically appropriate for you.
            </p>
            <ul className="grid grid-cols-1 mt-[22px]">
              {[
                { b: "What providers evaluate", d: "Current symptoms, life impact, treatment context, and whether an Emotional Support Animal supports your wellbeing." },
                { b: "Common reasons people don't qualify", d: "Symptoms don't meet clinical thresholds, or the assessment indicates a different course of care." },
                { b: "What happens if you don't qualify", d: "Full refund, plus the provider's note on what additional context might support a future request." },
              ].map((q) => (
                <li key={q.b} className="flex gap-3.5 py-4 border-t border-[#EAE3D7]">
                  <Check className="w-[17px] h-[17px] mt-0.5 flex-none text-[#3F7061]" />
                  <div>
                    <div className="text-[15px] font-bold text-[#231F1A] mb-0.5">{q.b}</div>
                    <p className="text-[13.5px] leading-snug text-[#4A443C]">{q.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-[#EAE3D7] min-h-[300px] md:h-full md:min-h-0 order-first md:order-none">
            <picture>
              <source srcSet="/assets/lifestyle/esa-housing-provider-review.webp" type="image/webp" />
              <img
                src="/assets/lifestyle/esa-housing-provider-review.jpg"
                alt="A licensed mental health professional reviewing an assessment on a laptop in a calm home office"
                className="w-full h-full object-cover aspect-[4/3] md:aspect-auto"
                loading="lazy"
                decoding="async"
                width={900}
                height={1117}
              />
            </picture>
          </div>
        </div>
      </section>

      {/* ─────────── 11. REVIEWS (reused homepage source) ─────────── */}
      <TestimonialsSection />

      {/* ─────────── 12. PSD INFORMATIONAL (no price) ─────────── */}
      <section className="bg-[#F7F2E9] py-12">
        <div className={WRAP}>
          <div className="bg-white border border-[#EAE3D7] rounded-2xl px-6 py-7 sm:px-9 sm:py-8 grid gap-5 text-center md:grid-cols-[auto_1fr_auto] md:items-center md:gap-7 md:text-left">
            <span className="w-[52px] h-[52px] rounded-2xl bg-[#EDF3F0] text-[#3F7061] flex items-center justify-center mx-auto">
              <PawStroke />
            </span>
            <div>
              <h3 className="text-[19px] font-semibold text-[#231F1A] mb-1.5" style={FONT_DISPLAY}>Do you have a trained Psychiatric Service Dog instead?</h3>
              <p className="text-[14.5px] leading-relaxed text-[#4A443C] max-w-[60ch] mx-auto md:mx-0">
                A PSD is a dog individually trained to perform specific tasks for a psychiatric disability — a different documentation path from an ESA letter. If that's your situation, the PSD route also supports air-travel documentation.
              </p>
            </div>
            <Link to="/how-to-get-psd-letter" className="inline-flex items-center justify-center gap-2 font-bold text-[15px] text-[#231F1A] border border-[#EAE3D7] rounded-md px-6 py-3.5 hover:border-[#3F7061] hover:text-[#3F7061] transition-colors">
              Explore the PSD path →
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 13. FAQ ─────────── */}
      <section className="bg-[#FDFBF7] py-14 md:py-20">
        <div className={WRAP}>
          <h2 className="text-[#231F1A] text-[27px] md:text-[34px] font-semibold text-center mb-9" style={FONT_DISPLAY}>
            Common questions.
          </h2>
          <div className="max-w-[800px] mx-auto">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={item.q}
                open={i === 0}
                className={`border-b border-[#EAE3D7] ${i === 0 ? "border-t" : ""} ${i >= 4 && !showAllMobile ? "hidden sm:block" : ""}`}
              >
                <summary className="list-none cursor-pointer flex justify-between gap-4 items-center text-[15.5px] font-bold text-[#231F1A] py-[18px] min-h-[44px] [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span aria-hidden className="flex-none w-[26px] h-[26px] rounded-full border border-[#EAE3D7] bg-white flex items-center justify-center text-[#4A443C] text-[15px]">＋</span>
                </summary>
                <div className="text-[14.5px] leading-relaxed text-[#4A443C] max-w-[70ch] pb-5 pr-8">{item.a}</div>
              </details>
            ))}
          </div>
          {!showAllMobile && FAQ_ITEMS.length > 4 && (
            <div className="sm:hidden text-center mt-5">
              <button
                type="button"
                onClick={() => setShowAllMobile(true)}
                className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#3F7061] border border-[#EAE3D7] rounded-full px-5 py-2.5"
              >
                Show more questions
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ─────────── 14. FINAL CTA ─────────── */}
      <section className="bg-[#231F1A] text-[#D8D2C8]">
        <div className={`${WRAP} max-w-[720px] text-center py-16 md:py-20`}>
          <h2 className="text-white text-[27px] md:text-[34px] font-semibold mb-3.5" style={FONT_DISPLAY}>
            Start your assessment in about five minutes.
          </h2>
          <p className="max-w-[52ch] mx-auto text-[16px] leading-relaxed mb-7">
            Reviewed by a licensed mental health provider in your state. Documentation issued only if you qualify. Unique Verification ID on every document.
          </p>
          <a href={CTA_HREF} className="w-full max-w-[340px] sm:w-auto inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[17px] px-9 py-4 rounded-md shadow-lg shadow-orange-500/30 transition-colors">
            Check If You Qualify
          </a>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2.5 mt-6 text-[13px] font-medium text-[#B4AC9F]">
            {["Refund if you don't qualify after review", "Verification ID on every document", "License # and NPI on every document"].map((x) => (
              <span key={x} className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#8FBCAB]" /> {x}</span>
            ))}
          </div>
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />
      <SharedFooter />

      {/* Mobile-only sticky Apply CTA — homepage parity. Fades in after the hero
          scrolls out (md:hidden bottom bar); attribution-safe href. */}
      <MobileStickyApplyCTA
        showAfterPx={500}
        to={CTA_HREF}
        label="Check If You Qualify"
        icon="ri-checkbox-circle-line"
      />
    </main>
  );
}

// ── verification field ──────────────────────────────────────────────────────
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11.5px] font-medium text-[#9CA3AF] mb-1">{label}</p>
      <p className={`text-[13.5px] font-bold text-[#111827] leading-snug ${mono ? "font-mono tracking-[0.04em]" : ""}`}>{value}</p>
    </div>
  );
}

// ── inline SVG icons (always render — no icon-font subset dependency) ─────────
function StarSolid() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="#FBBF24" aria-hidden><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z" /></svg>;
}
function ShieldStroke() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
function RefundStroke() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 5v4h4" /><path d="M12 7v5l3 2" /></svg>;
}
function BadgeStroke() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M7 11h10" /></svg>;
}
function HomeStroke({ className = "w-[19px] h-[19px]" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>;
}
function CoinStroke({ className = "w-[19px] h-[19px]" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5" /></svg>;
}
function AlertStroke({ className = "w-[19px] h-[19px]" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
}
function LockStroke({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}
function ShieldCheck({ className = "w-6 h-6" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
}
function FileCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>;
}
function PawStroke({ className }: { className?: string }) {
  return <svg className={className} width={className ? undefined : 24} height={className ? undefined : 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 5.1a4 4 0 0 1 2 0M7.7 7.6c-1.1 1.1-1.4 3.6-3 4.4-1.3.7-1.9 2-1.4 3.2.7 1.6 3 1.8 4.6 1.2M16.3 7.6c1.1 1.1 1.4 3.6 3 4.4 1.3.7 1.9 2 1.4 3.2-.7 1.6-3 1.8-4.6 1.2M12 10c-2.6 0-5 3.2-5 6 0 1.9 1.3 3 3 3 .9 0 1.4-.4 2-.4s1.1.4 2 .4c1.7 0 3-1.1 3-3 0-2.8-2.4-6-5-6z" /></svg>;
}
