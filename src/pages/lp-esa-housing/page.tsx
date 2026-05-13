import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import AssessmentVideoPreview from "@/components/feature/AssessmentVideoPreview";

const LP_TITLE = "Get an ESA Letter for Housing — Reviewed by Licensed Providers | PawTenant";
const LP_DESC = "Verified with a unique ID your landlord can confirm in seconds. Reviewed by licensed mental health providers. Refund if you don't qualify.";

const ASSESSMENT_HREF = "/assessment";
const PSD_ASSESSMENT_HREF = "/psd-assessment";

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

// FAQ list expanded for Google Ads keyword coverage. Each entry naturally
// surfaces a high-intent query (legitimacy, online evaluations, dog
// breeds, doctor/practitioner review, landlord verification, housing
// laws, how letters work, PSD vs ESA, qualification). Wording stays
// human and compliance-safe — no overclaim, no keyword stuffing.
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
    a: "PawTenant's housing ESA letter is $110 for one pet, valid for one year, with additional pets at $25 each (up to three per document). The fee covers the full clinical assessment and licensed provider review. If you do not qualify after review, your payment is refunded — there is no charge for an evaluation that does not lead to a letter. Flexible payment options including Klarna may be available at checkout where eligible.",
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
    a: "Every document carries a unique Verification ID (format PT-YYYY-XXXXXX). Your landlord enters the ID at pawtenant.com/verify and the page confirms the document is authentic and the provider is actively licensed — without showing any diagnosis or clinical detail. The provider's license can also be independently confirmed on the public NPPES NPI registry.",
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

export default function LpEsaHousingPage() {
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
    <main className="bg-[#FAFAFA] text-slate-900 antialiased">
      {/* ─────────── 0. Site-wide navbar (matches main site) ─────────── */}
      <SharedNavbar />

      {/* ─────────── 1. HERO (visible warm photo on LEFT half) ─────────── */}
      <section className="relative bg-white border-b border-slate-200 overflow-hidden">
        {/* Lifestyle photo — desktop: left 60%; mobile: full width behind the stacked content */}
        {/* Desktop: left 60% bg */}
        <div
          aria-hidden
          className="hidden md:block pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: "60%",
            backgroundImage: "url('/assets/lifestyle/woman-telehealth-with-dog.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 35%",
            opacity: 0.55,
          }}
        />
        {/* Mobile: different image where the subject (woman + dog) is
            center-framed so it survives the narrow portrait crop. The
            previous desktop composition put both subjects at the left/right
            edges and only the white wall showed through on mobile. Same
            opacity (0.55) and same white-wash gradient overlay below keep
            the visual treatment + contrast consistent with desktop. */}
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "url('/assets/blog/fp-woman-dog-floor.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
            opacity: 0.55,
          }}
        />
        {/* Desktop right-edge fade — wash strength reduced so the left-half
            image reads more confidently while the right column stays clean
            white behind the letter preview card. */}
        <div
          aria-hidden
          className="hidden md:block pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: "75%",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.40) 65%, #FFFFFF 100%)",
          }}
        />
        {/* Mobile vertical white wash — wash strength reduced at the top
            and middle so the woman + dog photo reads more confidently
            behind the hero text; bottom keeps a strong fade so the letter
            preview card sits on a clean white background. */}
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0.45) 70%, #FFFFFF 100%)",
          }}
        />
        {/* Soft top + bottom fade to white so the section blends with adjacent sections */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-12"
          style={{ background: "linear-gradient(180deg, #FFFFFF 0%, transparent 100%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
          style={{ background: "linear-gradient(0deg, #FFFFFF 0%, transparent 100%)" }}
        />

        {/* SharedNavbar is fixed top-0 with h-16 (64px) on mobile and
            sm:h-20 (80px) on tablet+. Hero top padding clears the navbar
            plus ~32px breathing room so the green pill never sits under
            the navbar. (Previous pt-16 md:pt-24 = exactly navbar height,
            so the pill was visually touching the navbar bottom.) */}
        <div className="relative max-w-6xl mx-auto px-5 pt-24 md:pt-28 pb-12 md:pb-20 grid md:grid-cols-12 gap-10 md:gap-14 items-start">
          <div className="md:col-span-7 lg:col-span-7">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full mb-5 shadow-[0_1px_3px_rgba(16,185,129,0.10)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Housing-related ESA documentation
            </span>
            <h1 className="text-[28px] sm:text-[32px] md:text-[40px] lg:text-[44px] leading-[1.12] font-bold tracking-tight text-slate-900 mb-4">
              Get an ESA Letter for Housing — Reviewed by Licensed Providers
            </h1>
            <p className="text-[16px] md:text-[17px] leading-relaxed text-slate-600 mb-7 max-w-xl">
              Verified with a unique ID your landlord can confirm in seconds.
            </p>

            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] md:text-[16px] px-7 py-4 rounded-md transition w-full sm:w-auto shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>

            {/* Klarna 'Pay in 4' badge — sits directly under the CTA so the
                affordability signal occupies the highest-hierarchy slot.
                Trust bullets row follows beneath, then the refund line.
                Matches the Meta LP hero order: CTA → Klarna → trust → refund.
                Uses `flex w-fit` (block-level, content-width) instead of
                `inline-flex` so the badge always wraps to a new line below
                the CTA on desktop — `inline-flex` would let it sit beside
                the CTA when the text column has horizontal room. */}
            <div className="mt-3 flex w-fit items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#FFA8CD] shadow-[0_2px_8px_rgba(255,168,205,0.30)]">
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#FFA8CD] text-[#1A0A12] font-extrabold text-[11px] leading-none tracking-tight flex-shrink-0"
              >
                K.
              </span>
              <div className="text-left leading-tight">
                <div className="text-[11.5px] font-semibold text-slate-900">
                  Pay in 4 interest-free with{" "}
                  <span className="text-[#7A3F5F]">Klarna</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Where eligible at checkout · approval not guaranteed
                </div>
              </div>
            </div>

            {/* Trust bullets — moved below Klarna to match Meta LP hero
                structure. All green checkmarks for visual consistency. */}
            <ul className="grid gap-3 mt-5 max-w-xl">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-[14px] text-slate-700">
                  <span className="font-medium text-slate-900">Reviewed by licensed clinicians</span>
                  <span className="text-slate-500"> — LMHP, LCSW, LPC licensed in your state</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-[14px] text-slate-700">
                  <span className="font-medium text-slate-900">Built for housing requests</span>
                  <span className="text-slate-500"> — aligned with Fair Housing Act standards</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-[14px] text-slate-700">
                  <span className="font-medium text-slate-900">Unique Verification ID on every document</span>
                  <span className="text-slate-500"> — landlords confirm authenticity in seconds</span>
                </span>
              </li>
            </ul>

            {/* Refund trust line — sits below the trust bullets as the
                final reassurance under the CTA stack. */}
            <div className="text-[12.5px] text-slate-500 mt-4 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]" aria-hidden>✓</span>
              If you don't qualify after review, your payment is refunded.
            </div>

          </div>

          {/* Letter preview card */}
          <div className="md:col-span-5 lg:col-span-5">
            <LetterPreviewCard />
          </div>
        </div>
      </section>

      {/* ─────────── 2. TRUST STRIP ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-7 md:py-8 grid sm:grid-cols-3 gap-5 sm:gap-8">
          <TrustChip
            label="Licensed providers"
            detail="Reviewed by clinicians licensed in your state"
            tone="green"
            icon="shield"
          />
          <TrustChip
            label="NPI verifiable"
            detail="Provider license confirmable on NPPES"
            tone="green"
            icon="badge"
          />
          <TrustChip
            label="Refund if not qualified"
            detail="No charge if a provider doesn't approve"
            tone="green"
            icon="refund"
          />
        </div>
      </section>

      {/* ─────────── 3. LANDLORD PROBLEM ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          {/* Top: heading + intro (centered, narrow) */}
          <div className="max-w-2xl mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              No-pet buildings. Pet rent. Breed restrictions.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              The Fair Housing Act may protect your right to live with an Emotional Support Animal — even in buildings with strict pet policies.
            </p>
          </div>

          {/* Equal-height grid: image col + 4-card col */}
          <div className="grid md:grid-cols-12 gap-6 md:gap-8 items-stretch">
            <div className="md:col-span-5 overflow-hidden rounded-2xl border border-slate-200 min-h-[320px] md:min-h-0">
              <img
                src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                alt="Tenant moving into a new apartment with an emotional support dog"
                loading="lazy"
                width={1600}
                height={1067}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="md:col-span-7 grid sm:grid-cols-2 gap-4 content-stretch">
              <ProblemCard
                title="No-pet buildings"
                body="Many leases ban pets. A reasonable accommodation request changes that conversation."
              />
              <ProblemCard
                title="Pet rent and deposits"
                body="Tenants with qualifying ESA documentation are typically not charged pet deposits or monthly pet fees."
              />
              <ProblemCard
                title="Breed and weight rules"
                body="Generally don't apply to qualified Emotional Support Animals under FHA accommodations."
              />
              <ProblemCard
                title="Lease violation risk"
                body="An unauthorized pet can trigger eviction. Documentation gives you a lawful, documented accommodation."
              />
            </div>
          </div>

          {/* Centered CTA at end of Landlord Problem section */}
          <div className="mt-10 md:mt-12 flex justify-center">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] md:text-[15px] px-6 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 3b. ESA HOUSING RIGHTS — FHA-protected rights with a
          warm emotional image alongside the section header. Image on the
          right on desktop, stacks below text on mobile. Image chosen for
          emotional resonance (person hugging their dog, big smile, real
          not AI) — paired with the legally framed copy so the section
          reads as "here's the law AND here's why it matters". 4-card grid
          below spans the full width. */}
      <section className="bg-[#FFFBF5] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center mb-10 md:mb-12">
            <div className="md:col-span-6 text-center md:text-left">
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                Fair Housing Act protections
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
                ESA housing rights you can rely on.
              </h2>
              <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-xl mx-auto md:mx-0">
                When clinically appropriate, ESA documentation supports your right to request a reasonable accommodation under the federal Fair Housing Act — even in no-pet buildings. This is about keeping the bond with the animal who supports you, in the home you choose.
              </p>
            </div>
            <div className="md:col-span-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <img
                  src="/assets/blog/fp-curly-woman-fun-dog.jpg"
                  alt="Person at home embracing their emotional support dog — warm housing scene"
                  width={1200}
                  height={800}
                  loading="lazy"
                  className="w-full h-auto block aspect-[4/3] md:aspect-[5/4] object-cover object-center"
                />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Federal Fair Housing Act protection",
                body: "Landlords subject to the federal Fair Housing Act must consider reasonable accommodation requests for tenants with a qualifying emotional support animal — applying to apartments, condos, and many HOA communities.",
              },
              {
                title: "Even in no-pet buildings",
                body: "A qualifying ESA is not treated as a pet under FHA, so a no-pets clause is not, on its own, a valid reason to deny housing. Reasonable accommodation may apply even in strict no-pet apartments.",
              },
              {
                title: "No pet rent or pet deposits",
                body: "Tenants with valid ESA documentation are typically not charged pet rent, pet deposits, or breed-based fees on covered rental units. Protections are about equal access — not extra costs.",
              },
              {
                title: "Documentation, not medical records",
                body: "A landlord may ask for the ESA letter itself, but cannot demand a specific diagnosis or your full medical history. PawTenant ESA documentation protects your medical privacy.",
              },
            ].map((c) => (
              <div key={c.title} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-300 transition">
                <span className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-3 shadow-[0_2px_6px_rgba(16,185,129,0.25)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
                  </svg>
                </span>
                <div className="text-[14.5px] md:text-[15px] font-bold text-slate-900 mb-2 leading-snug">{c.title}</div>
                <p className="text-[13px] text-slate-600 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 4. VERIFICATION (subtle blue-gray for trust theme) ─────────── */}
      <section className="bg-[#EEF2F7] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <div className="max-w-3xl mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Landlord verification
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Your landlord can verify the documentation in under 60 seconds.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed mb-4">
              Every document carries a unique <span className="font-medium text-slate-900">Verification ID</span> that confirms authenticity without exposing any clinical detail. Your landlord enters the ID at <span className="font-mono text-[#0E2A47]">pawtenant.com/verify</span> and the verification page returns the result instantly.
            </p>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Landlord verification is one of the strongest trust signals a housing accommodation request can carry. The reviewing provider's full credentials — name, license number, NPI — are printed on the document and independently checkable through the public NPPES NPI registry. Your privacy is protected: only authenticity is confirmed, never diagnosis or treatment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Steps */}
            <div className="space-y-5">
              <VerifyStep n={1} title="Landlord enters the Verification ID" tone="navy">
                Format <span className="font-mono text-[#0E2A47]">PT-YYYY-XXXXXX</span>, printed on every document.
              </VerifyStep>
              <VerifyStep n={2} title="Verification page returns the result" tone="green">
                Confirms the document is authentic and the provider is actively licensed.
              </VerifyStep>
              <VerifyStep n={3} title="Privacy-safe by design" tone="navy">
                No diagnosis, no treatment history, no clinical detail disclosed.
              </VerifyStep>
            </div>

            {/* Verify mock — cropped real screenshot */}
            <VerifyMock />
          </div>

          {/* Inline CTA below verification card */}
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="text-[13.5px] text-slate-600 leading-relaxed">
              Ready to start? Get your verifiable ESA documentation in about five minutes.
            </div>
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[13.5px] px-5 py-2.5 rounded-md transition flex-shrink-0 shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Privacy-split callout — answers two specific landlord-facing
              questions: "what does verification confirm?" vs "what stays
              private?". Designed to neutralize fake-letter concerns AND
              reassure tenants that their clinical detail is never exposed
              during the verification flow. Two-column at md+, stacks on
              mobile. */}
          <div className="mt-12 pt-10 border-t border-slate-200 grid md:grid-cols-2 gap-5">
            <div className="bg-white border border-emerald-200 rounded-xl p-5 md:p-6 shadow-[0_2px_8px_rgba(16,185,129,0.06)]">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(16,185,129,0.30)]">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div className="text-[14px] font-bold text-slate-900">What landlords can verify</div>
              </div>
              <ul className="space-y-2 text-[12.5px] text-slate-600 leading-relaxed">
                <li className="flex items-start gap-2"><span className="text-emerald-600 font-bold flex-shrink-0">✓</span><span>The Verification ID is real and active</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 font-bold flex-shrink-0">✓</span><span>The provider holds an active mental health license in your state</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 font-bold flex-shrink-0">✓</span><span>Provider name, license number, and NPI shown</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 font-bold flex-shrink-0">✓</span><span>Letter type, state, issue and expiration dates</span></li>
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-full bg-[#0E2A47] text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(14,42,71,0.25)]">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <div className="text-[14px] font-bold text-slate-900">What stays private</div>
              </div>
              <ul className="space-y-2 text-[12.5px] text-slate-600 leading-relaxed">
                <li className="flex items-start gap-2"><span className="text-slate-400 font-bold flex-shrink-0">—</span><span>Your diagnosis or any clinical detail</span></li>
                <li className="flex items-start gap-2"><span className="text-slate-400 font-bold flex-shrink-0">—</span><span>Your assessment responses or treatment history</span></li>
                <li className="flex items-start gap-2"><span className="text-slate-400 font-bold flex-shrink-0">—</span><span>Provider notes or recommendations</span></li>
                <li className="flex items-start gap-2"><span className="text-slate-400 font-bold flex-shrink-0">—</span><span>Anything beyond what's needed to confirm authenticity</span></li>
              </ul>
            </div>
          </div>

          {/* Bottom legal/trust strip */}
          <div className="mt-8 pt-6 border-t border-slate-200 grid sm:grid-cols-3 gap-4">
            <SmallTrust label="License verifiable" detail="on NPPES NPI registry" tone="green" />
            <SmallTrust label="License # printed" detail="on every document" tone="green" />
            <SmallTrust label="HIPAA-aligned" detail="data handling" tone="green" />
          </div>
        </div>
      </section>

      {/* ─────────── 4b. STATE RELEVANCE — "Valid in all 50 states" ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Nationwide coverage
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              ESA Letter Support Across All 50 States
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Our licensed providers can evaluate your situation and provide ESA documentation when clinically appropriate — in compliance with Fair Housing guidelines.
            </p>
          </div>

          {/* Expanded state grid — 15 highest-intent states for Google Ads
              targeting. Includes all 10 user-specified examples plus Ohio,
              Michigan, Washington, Massachusetts, Colorado for stronger
              national-coverage perception without showing all 50. Stronger
              hover treatment + focus-visible ring for keyboard nav. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-w-4xl mx-auto mb-7">
            {[
              { name: "California", slug: "california" },
              { name: "Texas", slug: "texas" },
              { name: "Florida", slug: "florida" },
              { name: "New York", slug: "new-york" },
              { name: "Illinois", slug: "illinois" },
              { name: "Pennsylvania", slug: "pennsylvania" },
              { name: "Virginia", slug: "virginia" },
              { name: "North Carolina", slug: "north-carolina" },
              { name: "Georgia", slug: "georgia" },
              { name: "Arizona", slug: "arizona" },
              { name: "Ohio", slug: "ohio" },
              { name: "Michigan", slug: "michigan" },
              { name: "Washington", slug: "washington" },
              { name: "Massachusetts", slug: "massachusetts" },
              { name: "Colorado", slug: "colorado" },
            ].map((s) => (
              <Link
                key={s.slug}
                to={`/esa-letter/${s.slug}`}
                className="group flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 hover:text-[#0E2A47] hover:shadow-[0_4px_12px_rgba(16,185,129,0.15)] transition text-[13.5px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_1px_3px_rgba(16,185,129,0.35)] transition group-hover:scale-110">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>{s.name}</span>
              </Link>
            ))}
          </div>

          <p className="text-center text-[12.5px] text-slate-500 leading-relaxed max-w-xl mx-auto mb-8">
            Requirements may vary slightly by state, but ESA housing rights are federally protected under the Fair Housing Act.
          </p>

          <div className="flex justify-center">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] md:text-[15px] px-6 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Section 4c removed — its 4 trust booster cards duplicated the
          main Verification section (4), the new privacy-split callout, and
          the Why-PawTenant comparison table. The strongest unique points
          (Licensed providers, License printed, Verification ID, HIPAA-
          aligned) already appear in section 2 (Trust Strip) and the
          privacy-split panel inside section 4. */}

      {/* ─────────── 5. PROVIDER REVIEW ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <span className="inline-block text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-slate-100 px-2.5 py-1 rounded-full mb-3">
            Licensed professional review
          </span>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18] max-w-2xl">
            Reviewed by a licensed mental health provider in your state.
          </h2>
          <p className="text-[14px] text-slate-600 leading-relaxed mb-7 max-w-2xl">
            Each assessment is reviewed by an actively licensed mental health professional in the state where you live. We do not auto-approve.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS.map((p) => (
              <ProviderCard key={p.name} {...p} />
            ))}
          </div>

          <div className="mt-6 text-[12px] text-slate-500 italic">
            Provider availability depends on the states where each clinician is currently licensed. Provider matching happens during assessment.
          </div>
        </div>
      </section>

      {/* ─────────── 6. HOW IT WORKS ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24 grid md:grid-cols-12 gap-8 md:gap-10 items-center">
          <div className="md:col-span-6 md:order-2 overflow-hidden rounded-xl border border-slate-200">
            <img
              src="/assets/lifestyle/owner-with-dog-laptop.jpg"
              alt="Person at home with their dog, completing the ESA assessment on a laptop — calm, professional, work-from-home scene"
              loading="lazy"
              width={1280}
              height={960}
              className="w-full h-auto object-cover aspect-[4/3] object-center"
            />
          </div>

          <div className="md:col-span-6 md:order-1">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-6 md:mb-8 leading-[1.18]">
              A simple, three-step process.
            </h2>

            <ol className="space-y-5">
              <Step n={1} title="Complete the assessment">
                A confidential clinical questionnaire. About 5 minutes.
              </Step>
              <Step n={2} title="Licensed professional review">
                A provider licensed in your state reviews and evaluates. Typically within 24 hours.
              </Step>
              <Step n={3} title="Documentation issued">
                If you qualify, you receive housing-related documentation. If not, your payment is refunded.
              </Step>
            </ol>

            {/* Step CTA */}
            <div className="mt-8">
              <Link
                to={ASSESSMENT_HREF}
                className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] md:text-[15px] px-6 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Start the assessment
                <span aria-hidden>→</span>
              </Link>
              <div className="text-[12px] text-slate-500 mt-2.5">
                About 5 minutes · Refund if you don't qualify after review.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 6b. ASSESSMENT UI PREVIEW — desktop only.
          Short, lazy-loaded mobile-UI clips of the actual assessment flow.
          Skipped on mobile (md:hidden wrapper) because mobile users will
          encounter the real UI moments after they tap the CTA — adding a
          UI preview on mobile adds vertical weight without conversion lift.
          On desktop it gives skeptical Google traffic a peek of the real
          product before committing. */}
      <div className="hidden md:block">
        <AssessmentVideoPreview
          eyebrow="See the assessment"
          heading="A short look at the real PawTenant assessment."
          subheading="Real screens from the clinical questionnaire. About five minutes from start to provider review."
          showCTA
          compact
        />
      </div>

      {/* ─────────── 7. PRICING — ESA + PSD side-by-side, Klarna chips.
          ESA Letter is recommended for the Google Ads housing audience.
          PSD Letter is the alternative for users with trained psychiatric
          service dogs. Both reviewed by a Licensed Mental Health
          Practitioner. Klarna brand pink (#FFA8CD) used inside each card +
          a branded Klarna trust panel below. */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Refund if you don't qualify
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 leading-[1.18] mb-3">
              Pick the right letter for you.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Both options reviewed by a Licensed Mental Health Practitioner. If you do not qualify after review, your payment is refunded.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-6">
            {/* ESA Letter card — recommended for the housing-focused Google audience */}
            <div className="relative bg-white border-2 border-[#0E2A47] rounded-2xl p-7 md:p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                Recommended for housing
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">ESA Letter — one-time</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-4xl md:text-5xl font-medium tracking-tight text-slate-900">$110</div>
                <div className="text-xs text-slate-500">for 1 pet · valid 1 year</div>
              </div>
              <div className="text-xs text-slate-500 mb-3">
                Add additional pets at <span className="text-slate-900 font-medium">+$25 each</span> · up to 3 pets per document
              </div>

              {/* Klarna chip — Klarna brand pink */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Pay later — where eligible</span>
              </div>

              <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
                <PriceFeat>Reviewed by a Licensed Mental Health Practitioner in your state</PriceFeat>
                <PriceFeat>FHA-aligned housing-related ESA documentation</PriceFeat>
                <PriceFeat>Provider's credentials, license #, and NPI printed on the document</PriceFeat>
                <PriceFeat>Unique Verification ID with landlord verification support</PriceFeat>
                <PriceFeat>Secure PDF delivery — typically within 24 hours</PriceFeat>
                <PriceFeat>Refund if you do not qualify after clinical review</PriceFeat>
                <PriceFeat>Additional pets at +$25 each (up to 3)</PriceFeat>
                <PriceFeat>Flexible payment options including Klarna where eligible</PriceFeat>
              </ul>

              <Link
                to={ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Start the ESA assessment →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For renters seeking housing accommodation under the Fair Housing Act.
              </div>
            </div>

            {/* PSD Letter card — alternative for trained psychiatric service dogs */}
            <div className="relative bg-white border border-slate-200 rounded-2xl p-7 md:p-8 shadow-[0_2px_8px_rgba(15,23,42,0.05)] flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-slate-700 text-white px-3 py-1 rounded-full shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                For trained service dogs
              </span>

              <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">PSD Letter — one-time</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-4xl md:text-5xl font-medium tracking-tight text-slate-900">From $120</div>
              </div>
              <div className="text-xs text-slate-500 mb-3">
                For 1 trained psychiatric service dog · <span className="text-slate-900 font-medium">+$20 per extra dog</span>
              </div>

              {/* Klarna chip — Klarna brand pink */}
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                <span className="text-[10px] text-slate-700">Pay later — where eligible</span>
              </div>

              <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
                <PriceFeat>Reviewed by a Licensed Mental Health Practitioner</PriceFeat>
                <PriceFeat>Psychiatric Service Dog (PSD) letter for trained service dogs</PriceFeat>
                <PriceFeat>Supports housing accommodation requests under FHA</PriceFeat>
                <PriceFeat>Eligible for air-travel documentation (DOT Service Animal form)</PriceFeat>
                <PriceFeat>Provider's credentials, license #, and NPI printed on the document</PriceFeat>
                <PriceFeat>Secure PDF delivery — typically within 24 hours</PriceFeat>
                <PriceFeat>Refund if you do not qualify after clinical review</PriceFeat>
                <PriceFeat>Flexible payment options including Klarna where eligible</PriceFeat>
              </ul>

              <Link
                to={PSD_ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-[#0E2A47] hover:bg-[#091B30] text-white font-medium text-[15px] px-5 py-3.5 rounded-md transition shadow-[0_2px_6px_rgba(14,42,71,0.25)]"
              >
                Start the PSD assessment →
              </Link>
              <div className="text-center text-[11px] text-slate-500 mt-3">
                For handlers of trained psychiatric service dogs.
              </div>
            </div>
          </div>

          {/* Klarna trust panel — Klarna brand pink */}
          <div className="mt-2 max-w-2xl mx-auto bg-gradient-to-br from-[#FFF5FA] to-[#FFE9F1] border border-[#FFA8CD] rounded-xl p-5 flex items-start gap-3 shadow-[0_2px_12px_rgba(255,168,205,0.20)]">
            <span
              aria-hidden
              className="w-10 h-10 rounded-lg bg-[#FFA8CD] text-[#1A0A12] flex items-center justify-center flex-shrink-0 font-black text-lg leading-none tracking-tight shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            >
              K.
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-slate-900 leading-snug mb-1">
                Pay later with <span className="text-[#B8527F]">Klarna</span> — interest-free at checkout.
              </div>
              <div className="text-[12.5px] text-slate-600 leading-relaxed">
                Split your payment into installments where eligible. Eligibility is shown at checkout and is determined by Klarna — approval is not guaranteed.
              </div>
            </div>
          </div>

          {/* Subscription teaser — now a clickable Link to the assessment
              flow (was a static div, didn't navigate). Whole card is the
              tap target; arrow affordance on the right hints at the action. */}
          <Link
            to={`${ASSESSMENT_HREF}?plan=subscription`}
            className="group mt-6 max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4 shadow-[0_2px_6px_rgba(15,23,42,0.04)] hover:border-[#0E2A47]/40 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] transition cursor-pointer"
          >
            <span className="w-10 h-10 rounded-full bg-[#0E2A47]/5 border border-[#0E2A47]/20 text-[#0E2A47] flex items-center justify-center flex-shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[13.5px] font-medium text-slate-900">Prefer annual renewal?</div>
                <span className="text-[9.5px] uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">Optional</span>
              </div>
              <div className="text-[12px] text-slate-600 leading-relaxed">
                <span className="font-medium text-slate-900">$99/year</span> for 1 pet · <span className="font-medium text-slate-900">+$20/year</span> per additional pet · cancel anytime
              </div>
            </div>
            <span
              aria-hidden
              className="self-center text-[#0E2A47] text-[18px] leading-none group-hover:translate-x-0.5 transition-transform flex-shrink-0"
            >
              →
            </span>
          </Link>
        </div>
      </section>

      {/* ─────────── 7b. ESA vs PSD — quick comparison so users pick the
          right path (especially after seeing both pricing cards above).
          Two-column comparison on desktop, stacks on mobile. Each column
          lists 4 distinguishing features. Each column also has a "Best for"
          line + a CTA to the right assessment flow. No keyword stuffing —
          targets the high-intent 'ESA vs PSD' Google query naturally. */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              ESA vs PSD
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              ESA Letter vs Psychiatric Service Dog Letter — which fits?
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Both are issued by a Licensed Mental Health Practitioner. The difference is whether your animal has been trained to perform specific tasks for a psychiatric disability — and what protections you actually need.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            {/* ESA column */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-[0_2px_6px_rgba(16,185,129,0.25)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
                  </svg>
                </span>
                <div>
                  <div className="text-[10px] tracking-[0.14em] uppercase text-emerald-700 font-bold mb-0.5">For housing</div>
                  <div className="text-[18px] font-bold text-slate-900 leading-tight">ESA Letter</div>
                </div>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                <span className="font-medium text-slate-900">Best for:</span> renters who need a housing accommodation under the Fair Housing Act. No specialized training required — comfort and presence is the role.
              </p>
              <ul className="space-y-2.5 mb-6 border-t border-slate-200 pt-4">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Housing-focused (Fair Housing Act reasonable accommodation)",
                  "No specialized task training required",
                  "Does NOT grant ADA public access or airline travel",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] px-5 py-3 rounded-md transition shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                Start the ESA assessment →
              </Link>
            </div>

            {/* PSD column */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-11 h-11 rounded-xl bg-[#0E2A47] text-white flex items-center justify-center shadow-[0_2px_6px_rgba(14,42,71,0.25)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <div>
                  <div className="text-[10px] tracking-[0.14em] uppercase text-[#0E2A47] font-bold mb-0.5">For housing + travel</div>
                  <div className="text-[18px] font-bold text-slate-900 leading-tight">PSD Letter</div>
                </div>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                <span className="font-medium text-slate-900">Best for:</span> handlers of a dog trained to perform specific psychiatric tasks. Supports both housing accommodation AND airline travel (DOT Service Animal form).
              </p>
              <ul className="space-y-2.5 mb-6 border-t border-slate-200 pt-4">
                {[
                  "Reviewed by a Licensed Mental Health Practitioner",
                  "Supports housing accommodation requests under FHA",
                  "Eligible for air travel (DOT Service Animal form)",
                  "Requires a trained psychiatric service dog (specific tasks)",
                ].map((feat) => (
                  <li key={feat} className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
                    <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={PSD_ASSESSMENT_HREF}
                className="mt-auto block w-full text-center bg-[#0E2A47] hover:bg-[#091B30] text-white font-medium text-[14px] px-5 py-3 rounded-md transition shadow-[0_2px_6px_rgba(14,42,71,0.25)]"
              >
                Start the PSD assessment →
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-[12.5px] text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Not sure which fits? An ESA letter covers most housing situations. PSD documentation only applies when you have a trained service dog AND need public access or airline support.
          </p>
        </div>
      </section>

      {/* ─────────── 8. QUALIFICATION (white — breaks up slate run) ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-2 leading-[1.18] text-center">
            Not everyone qualifies — and that's the point.
          </h2>
          <p className="text-[14px] text-slate-600 leading-relaxed mb-7 text-center max-w-2xl mx-auto">
            An ESA letter is clinical documentation, not a product. Issuing one without justification undermines the system — and gets letters rejected by landlords.
          </p>

          <div className="grid md:grid-cols-3 gap-3">
            <ProblemCard
              title="What providers evaluate"
              body="Current symptoms, life impact, treatment context, and whether an Emotional Support Animal supports your wellbeing."
            />
            <ProblemCard
              title="Common reasons people don't qualify"
              body="Symptoms don't meet clinical thresholds, or the assessment indicates a different course of care."
            />
            <ProblemCard
              title="What happens if you don't qualify"
              body="Full refund, plus the provider's note on what additional context might support a future request."
            />
          </div>

          {/* Balanced reassurance — keeps clinical integrity but doesn't demotivate */}
          <div className="mt-8 max-w-3xl mx-auto bg-white border border-emerald-200 rounded-xl p-5 md:p-6 flex items-start gap-4">
            <span className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-slate-900 mb-1">
                Most customers complete the process successfully.
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Most customers who complete the assessment and provide accurate information are successfully reviewed for housing-related documentation when clinically appropriate. Our process is designed to be compliant, not automatic — which helps landlords take the documentation seriously.
              </p>
            </div>
          </div>

          {/* Strong CTA — high-intent section */}
          <div className="mt-10 max-w-3xl mx-auto text-center">
            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] md:text-[16px] px-8 py-4 rounded-md transition shadow-[0_4px_12px_rgba(249,115,22,0.3)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
            <div className="text-[12.5px] text-slate-500 mt-3 flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]" aria-hidden>✓</span>
              If you don't qualify after review, your payment is refunded.
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 9. WHY PAWTENANT (key differentiator — strengthened) ─────────── */}
      <section className="bg-gradient-to-b from-slate-50 to-[#EEF2F7] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-20 md:py-28">
          <div className="text-center mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Key differentiators
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              What sets PawTenant apart.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed max-w-2xl mx-auto">
              How we compare to typical online ESA letter services.
            </p>
          </div>

          {(() => {
            const rows: Array<{
              feature: string;
              us?: boolean;
              usText?: string;
              them: string;
              done?: true;
            }> = [
              { feature: "Unique Verification ID landlords can confirm", us: true, done: true, them: "Rare or absent" },
              { feature: "Real provider names + license # + NPI on letter", us: true, done: true, them: "Often hidden" },
              { feature: "Reviewed by clinician licensed in your state", us: true, done: true, them: "Sometimes" },
              { feature: "Refund if you don't qualify after review", us: true, done: true, them: "Sometimes" },
              { feature: "Auto-approval / 24-hour 'guaranteed'", us: false, usText: "No — clinical review only", them: "Common" },
              { feature: "Housing-specific documentation language", us: true, done: true, them: "Generic templates" },
            ];
            return (
              <>
                {/* Desktop / tablet — comparison table */}
                <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-4">Feature</th>
                        <th className="text-center text-[11px] uppercase tracking-wider text-[#0E2A47] font-semibold px-5 py-4">PawTenant</th>
                        <th className="text-center text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-4">Typical online services</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <CompareRow
                          key={r.feature}
                          feature={r.feature}
                          us={r.us}
                          usText={r.usText}
                          them={r.them}
                          done={r.done}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile — stacked comparison cards. PawTenant side always
                    renders as green check (rows are framed as positives for
                    us by design). Competitor side always renders as red X. */}
                <div className="md:hidden space-y-4">
                  {rows.map((r) => {
                    const usIsYes = r.done === true || r.us === true;
                    return (
                      <div
                        key={r.feature}
                        className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.05)] overflow-hidden"
                      >
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                          <p className="text-[13px] font-semibold text-slate-900 leading-snug">{r.feature}</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                          <div className="flex items-start gap-3 px-5 py-3">
                            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#0E2A47] w-[88px] flex-shrink-0 pt-1">
                              PawTenant
                            </span>
                            <span className="flex items-start gap-2 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(16,185,129,0.40)] ring-2 ring-emerald-50">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="text-[13px] leading-snug text-emerald-700 font-semibold mt-0.5">
                                {r.usText ?? (usIsYes ? "Yes" : "No")}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-start gap-3 px-5 py-3">
                            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-slate-500 w-[88px] flex-shrink-0 pt-1">
                              Typical
                            </span>
                            <span className="flex items-start gap-2 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(244,63,94,0.40)] ring-2 ring-rose-50">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                </svg>
                              </span>
                              <span className="text-[13px] text-slate-600 leading-snug mt-0.5">{r.them}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* ─────────── 10. FAQ (white) ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-6 leading-[1.18] text-center">
            Common questions.
          </h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={item.q} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── 11. FINAL CTA (dark navy, premium) ─────────── */}
      <section className="relative bg-gradient-to-b from-[#0E2A47] to-[#091B30] text-white overflow-hidden">
        {/* Subtle decorative radial light */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, #ffffff 0%, transparent 60%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
          <h2 className="text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-3">
            Start your assessment in about five minutes.
          </h2>
          <p className="text-[14px] text-slate-300 leading-relaxed mb-6 max-w-xl mx-auto">
            Reviewed by a licensed mental health provider in your state. Documentation issued only if you qualify. Unique Verification ID on every document.
          </p>
          <Link
            to={ASSESSMENT_HREF}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] md:text-[16px] px-8 py-4 rounded-md transition w-full sm:w-auto shadow-[0_4px_16px_rgba(249,115,22,0.35)]"
          >
            Start the assessment
            <span aria-hidden>→</span>
          </Link>
          <div className="mt-9 grid sm:grid-cols-3 gap-4 text-left max-w-xl mx-auto">
            <FinalTrust>Refund if you don't qualify after review</FinalTrust>
            <FinalTrust>Verification ID on every document</FinalTrust>
            <FinalTrust>License # and NPI on every document</FinalTrust>
          </div>
        </div>
      </section>

      {/* Site-wide footer (matches main site) */}
      <SharedFooter />
    </main>
  );
}

/* ────────────────────────── Sub-components (file-local) ────────────────────────── */

function LetterPreviewCard() {
  // Real letter preview: PawTenant ESA sample (SVG) inside a browser-chrome card.
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-[0_2px_8px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
        <div className="font-mono text-[10px] text-slate-500">esa-letter-sample.pdf</div>
        <div className="w-8" />
      </div>

      {/* SVG sample letter */}
      <div className="bg-white p-3 md:p-4">
        <img
          src="/images/checkout/esa-sample-letter.svg"
          alt="Sample PawTenant ESA letter showing the verification ID, provider credentials, and housing-accommodation language. Names and details are placeholders."
          width={800}
          height={1035}
          className="w-full h-auto block"
          loading="eager"
        />
      </div>

      {/* Verification badge under preview — reinforces ID concept */}
      <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-3 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-emerald-900 leading-tight">Every letter carries a Verification ID</div>
          <div className="text-[11px] text-emerald-800/80 leading-snug font-mono">pawtenant.com/verify · landlords confirm in seconds</div>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-400 py-2 px-3 bg-white border-t border-slate-100">
        Sample template · placeholder names · housing-accommodation language only.
      </div>
    </div>
  );
}

function TrustChip({
  label,
  detail,
  tone = "navy",
  icon = "shield",
}: {
  label: string;
  detail: string;
  tone?: "navy" | "green";
  icon?: "shield" | "badge" | "refund";
}) {
  // Bolder filled iconography — emerald or navy fill with white glyph, soft
  // brand-tinted shadow. Reads as "verified trust" rather than the prior
  // outlined chip, without taking more vertical space.
  const fillClasses =
    tone === "green"
      ? "bg-emerald-600 text-white shadow-[0_2px_6px_rgba(16,185,129,0.30)]"
      : "bg-[#0E2A47] text-white shadow-[0_2px_6px_rgba(14,42,71,0.30)]";

  return (
    <div className="flex items-start gap-3">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${fillClasses}`}>
        {icon === "shield" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )}
        {icon === "badge" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="6" />
            <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
          </svg>
        )}
        {icon === "refund" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-slate-900">{label}</div>
        <div className="text-[12px] text-slate-500 leading-snug">{detail}</div>
      </div>
    </div>
  );
}

function ProblemCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-[14px] font-medium text-slate-900 mb-1">{title}</div>
      <div className="text-[12px] text-slate-500 leading-relaxed">{body}</div>
    </div>
  );
}

function VerifyStep({
  n,
  title,
  children,
  tone = "navy",
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  tone?: "navy" | "green";
}) {
  const bubble = tone === "green" ? "bg-emerald-600" : "bg-[#0E2A47]";
  return (
    <div className="flex gap-3.5 items-start">
      <div className={`w-9 h-9 rounded-full ${bubble} text-white flex items-center justify-center text-[14px] font-medium flex-shrink-0`}>{n}</div>
      <div>
        <div className="text-[14.5px] font-medium text-slate-900 mb-1">{title}</div>
        <div className="text-[13px] text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function VerifyMock() {
  // Cropped real /verify result screen. Privacy-safe: no diagnosis or clinical info is shown.
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
        <div className="font-mono text-[10px] text-slate-500">pawtenant.com/verify</div>
        <div className="w-6" />
      </div>

      <img
        src="/assets/ui/verification-cropped.png"
        alt="PawTenant verification result confirming a letter ID is authentic. Shows letter type, state, issue and expiration dates, issuing provider, NPI, and license. No patient health information is displayed."
        width={820}
        height={1110}
        loading="lazy"
        className="w-full h-auto block"
      />

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-start gap-2.5">
        <span className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <div className="text-[11.5px] text-slate-600 leading-relaxed">
          Verification confirms <span className="text-slate-900 font-medium">authenticity only</span>. No patient health information is displayed.
        </div>
      </div>
    </div>
  );
}

function SmallTrust({
  label,
  detail,
  tone = "navy",
}: {
  label: string;
  detail: string;
  tone?: "navy" | "green";
}) {
  // Upgraded from a dot-in-box to a filled emerald (or navy) badge with a
  // white check glyph and a soft brand-tinted shadow — matches the bolder
  // TrustChip visual system used in the section 2 trust strip, so the
  // bottom verification strip reads with the same confidence.
  const fill =
    tone === "green"
      ? "bg-emerald-600 text-white shadow-[0_2px_4px_rgba(16,185,129,0.30)]"
      : "bg-[#0E2A47] text-white shadow-[0_2px_4px_rgba(14,42,71,0.25)]";

  return (
    <div className="flex items-start gap-2.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${fill}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <div className="text-[12.5px] text-slate-600 leading-snug">
        <span className="text-slate-900 font-semibold">{label}</span> <span className="text-slate-500">{detail}</span>
      </div>
    </div>
  );
}

function ProviderCard({ name, credential, photo, bio }: { name: string; credential: string; photo: string; bio: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        {imgFailed ? (
          <div className="w-14 h-14 rounded-full bg-slate-100 text-[#0E2A47] flex items-center justify-center text-[15px] font-medium tracking-wide flex-shrink-0">
            {initials}
          </div>
        ) : (
          <img
            src={photo}
            alt={`${name}, ${credential}`}
            loading="lazy"
            width={56}
            height={56}
            onError={() => setImgFailed(true)}
            className="w-14 h-14 rounded-full object-cover flex-shrink-0 bg-slate-100"
          />
        )}
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-slate-900 leading-tight">{name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{credential}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-slate-300 bg-white rounded-full text-[10px] text-[#0E2A47] font-medium">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0E2A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          NPI verifiable
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] text-emerald-800 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Active license
        </span>
      </div>

      <div className="text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{bio}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <div className="w-9 h-9 rounded-full bg-[#0E2A47] text-white flex items-center justify-center text-[14px] font-medium flex-shrink-0">{n}</div>
      <div>
        <div className="text-[14px] font-medium text-slate-900 mb-1">{title}</div>
        <div className="text-[13px] text-slate-500 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function PriceFeat({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 items-start text-[12.5px] text-slate-700 leading-relaxed">
      <span className="text-emerald-600 font-medium flex-shrink-0">✓</span>
      <span>{children}</span>
    </li>
  );
}

function CompareRow({
  feature,
  us,
  usText,
  them,
  done,
}: {
  feature: string;
  us?: boolean;
  usText?: string;
  them: string;
  done?: true;
}) {
  // PawTenant side ALWAYS reads as positive (green check) because every row
  // is framed as a thing-we-do-well — even rows where the literal answer is
  // "No" (e.g., "Auto-approval / 24-hour guaranteed") are positives because
  // we INTENTIONALLY don't do them. Competitor side ALWAYS reads as
  // negative (red X) for the same reason — competitor anti-patterns.
  // Badges sized up (w-7 h-7) + bolder shadow for clearer scan at a glance.
  const usIsYes = done === true || us === true || us === undefined;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition">
      <td className="px-5 py-4 text-[13.5px] text-slate-800 font-semibold">{feature}</td>
      <td className="px-5 py-4 text-center">
        <span className="inline-flex items-center gap-2.5 text-emerald-700 text-[13.5px] font-semibold">
          <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(16,185,129,0.40)] ring-2 ring-emerald-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          {usText ?? (usIsYes ? "Yes" : "No")}
        </span>
      </td>
      <td className="px-5 py-4 text-center text-[13px] text-slate-600">
        <span className="inline-flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_2px_6px_rgba(244,63,94,0.40)] ring-2 ring-rose-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </span>
          {them}
        </span>
      </td>
    </tr>
  );
}

function FAQItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  // First-open FAQ gets a soft trust accent (slate-100 navy tint when open).
  const accent = defaultOpen
    ? open
      ? "bg-[#0E2A47]/[0.03] border-[#0E2A47]/30"
      : "bg-white border-[#0E2A47]/30"
    : "bg-white border-slate-200";
  const iconColor = open ? "text-emerald-600" : "text-[#0E2A47]";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={`group rounded-lg px-4 py-3 border transition-colors ${accent}`}
    >
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
        <span className="text-[13px] font-medium text-slate-900 leading-snug">{q}</span>
        <span
          aria-hidden
          className={`text-[18px] leading-none flex-shrink-0 transition-transform duration-200 ${iconColor} ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </summary>
      <div className="text-[12.5px] text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">{a}</div>
    </details>
  );
}

function FinalTrust({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px] text-slate-300 leading-relaxed">
      <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}
