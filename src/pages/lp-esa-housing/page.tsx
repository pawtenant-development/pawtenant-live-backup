import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";

const LP_TITLE = "Get a Legit ESA Letter for Housing — Reviewed by Licensed Providers | PawTenant";
const LP_DESC = "Verified with a unique ID your landlord can confirm in seconds. Reviewed by licensed mental health providers. Refund if you don't qualify.";

const ASSESSMENT_HREF = "/assessment";

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

const FAQ_ITEMS = [
  {
    q: "Will my landlord accept this documentation?",
    a: "Most landlords subject to the Fair Housing Act are required to consider reasonable accommodation requests. Our documentation is written to align with FHA standards and includes the provider's license details for verification.",
  },
  {
    q: "How does landlord verification work?",
    a: "Every document carries a unique Verification ID. Your landlord enters the ID at pawtenant.com/verify and the page confirms the document is authentic and the provider is actively licensed — without showing any diagnosis or clinical detail.",
  },
  {
    q: "How fast is the process?",
    a: "Most assessments are reviewed within 24 hours. After a licensed provider in your state confirms eligibility, your documentation is delivered as a PDF.",
  },
  {
    q: "What if I don't qualify after review?",
    a: "If a licensed provider does not approve documentation after reviewing your assessment, your payment is refunded.",
  },
  {
    q: "What credentials does the provider have?",
    a: "Every reviewing provider is an actively licensed mental health professional in the state where you live. Provider credentials, license number, and NPI are printed on every document and verifiable via the NPPES NPI registry.",
  },
  {
    q: "Is the documentation legally valid?",
    a: "We are not a law firm and don't provide legal advice. Our documentation is housing-related ESA documentation issued by a licensed mental health provider, written to align with FHA reasonable accommodation standards.",
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
        {/* Mobile: same image, full width, lower portion as photo "frame" — same transparency */}
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "url('/assets/lifestyle/woman-telehealth-with-dog.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            opacity: 0.55,
          }}
        />
        {/* Desktop right-edge fade */}
        <div
          aria-hidden
          className="hidden md:block pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: "75%",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.20) 30%, rgba(255,255,255,0.55) 65%, #FFFFFF 100%)",
          }}
        />
        {/* Mobile vertical white wash — light enough to keep photo visible, strong enough for text legibility */}
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.40) 35%, rgba(255,255,255,0.55) 70%, #FFFFFF 100%)",
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

        <div className="relative max-w-6xl mx-auto px-5 pt-16 md:pt-24 pb-12 md:pb-20 grid md:grid-cols-12 gap-10 md:gap-14 items-start">
          <div className="md:col-span-7 lg:col-span-7">
            <span className="inline-block text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-slate-100 px-2.5 py-1 rounded-full mb-5">
              Housing-related ESA documentation
            </span>
            <h1 className="text-[28px] sm:text-[32px] md:text-[40px] lg:text-[44px] leading-[1.12] font-medium tracking-tight text-slate-900 mb-4">
              Get a Legit ESA Letter for Housing — Reviewed by Licensed Providers
            </h1>
            <p className="text-[16px] md:text-[17px] leading-relaxed text-slate-600 mb-7 max-w-xl">
              Verified with a unique ID your landlord can confirm in seconds.
            </p>

            {/* Trust bullets — all green for consistency */}
            <ul className="grid gap-3.5 mb-8 max-w-xl">
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

            <Link
              to={ASSESSMENT_HREF}
              className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] md:text-[16px] px-7 py-4 rounded-md transition w-full sm:w-auto shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              Start the assessment
              <span aria-hidden>→</span>
            </Link>
            <div className="text-[12.5px] text-slate-500 mt-3 flex items-center gap-2">
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
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-slate-900 mb-3 leading-[1.18]">
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

      {/* ─────────── 4. VERIFICATION (subtle blue-gray for trust theme) ─────────── */}
      <section className="bg-[#EEF2F7] border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <div className="max-w-2xl mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Landlord verification
            </span>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-slate-900 mb-3 leading-[1.18]">
              Your landlord can verify the documentation in under 60 seconds.
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Every document includes a unique Verification ID. Your landlord enters the ID at <span className="font-mono text-[#0E2A47]">pawtenant.com/verify</span> — without seeing your diagnosis or any clinical detail.
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

          {/* Bottom legal/trust strip */}
          <div className="mt-12 pt-8 border-t border-slate-200 grid sm:grid-cols-3 gap-4">
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

          {/* Popular state grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 max-w-4xl mx-auto mb-7">
            {[
              { name: "California", slug: "california" },
              { name: "Texas", slug: "texas" },
              { name: "Florida", slug: "florida" },
              { name: "New York", slug: "new-york" },
              { name: "Illinois", slug: "illinois" },
              { name: "Pennsylvania", slug: "pennsylvania" },
            ].map((s) => (
              <Link
                key={s.slug}
                to={`/esa-letter/${s.slug}`}
                className="group flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-[#0E2A47] transition text-[13px] font-medium"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
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
              Check your eligibility
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────── 5. PROVIDER REVIEW ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <span className="inline-block text-[11px] tracking-[0.08em] uppercase text-[#0E2A47] bg-slate-100 px-2.5 py-1 rounded-full mb-3">
            Licensed professional review
          </span>
          <h2 className="text-xl md:text-2xl font-medium tracking-tight text-slate-900 mb-3 leading-tight max-w-2xl">
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
              src="/assets/lifestyle/senior-with-pet-home.jpg"
              alt="Tenant living comfortably at home with their emotional support animal after receiving documentation"
              loading="lazy"
              width={1600}
              height={1067}
              className="w-full h-auto object-cover"
            />
          </div>

          <div className="md:col-span-6 md:order-1">
            <h2 className="text-xl md:text-2xl font-medium tracking-tight text-slate-900 mb-6 md:mb-8 leading-tight">
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

      {/* ─────────── 7. PRICING (light gray) ─────────── */}
      <section className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-5 py-16 md:py-24">
          <div className="text-center mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Refund if you don't qualify
            </span>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-slate-900 leading-[1.18]">
              One simple price. No upsells.
            </h2>
          </div>

          {/* Featured one-time card — narrower, taller */}
          <div className="relative max-w-md mx-auto bg-white border-2 border-[#0E2A47] rounded-2xl p-7 md:p-9 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            {/* Floating Recommended ribbon */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Recommended
            </span>

            <div className="text-[11px] tracking-wider uppercase text-slate-500 mb-2">Documentation — one-time</div>
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-4xl md:text-5xl font-medium tracking-tight text-slate-900">$110</div>
              <div className="text-xs text-slate-500">for 1 pet · valid 1 year</div>
            </div>
            <div className="text-xs text-slate-500 mb-6">
              Add additional pets at <span className="text-slate-900 font-medium">+$25 each</span> (up to 3 pets per documentation)
            </div>

            <ul className="grid gap-3 mb-7 border-t border-slate-100 pt-5">
              <PriceFeat>Reviewed by a licensed provider in your state</PriceFeat>
              <PriceFeat>FHA-aligned housing-related documentation</PriceFeat>
              <PriceFeat>Provider's credentials, license #, and NPI on document</PriceFeat>
              <PriceFeat>Unique Verification ID for landlord verification</PriceFeat>
              <PriceFeat>PDF delivery, typically within 24 hours</PriceFeat>
              <PriceFeat>Landlord verification support if questions arise</PriceFeat>
            </ul>

            <Link
              to={ASSESSMENT_HREF}
              className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-medium text-[15px] px-5 py-3.5 rounded-md transition"
            >
              Start the assessment →
            </Link>
            <div className="text-center text-[11px] text-slate-500 mt-3">
              If you don't qualify after review, your payment is refunded.
            </div>

            {/* Balanced approval note */}
            <div className="mt-5 pt-4 border-t border-slate-100 text-[11.5px] text-slate-600 leading-relaxed">
              Most customers who complete the assessment and provide accurate information are successfully reviewed for housing-related documentation when clinically appropriate.
            </div>
          </div>

          {/* Subscription secondary — highlighted but lower priority */}
          <div className="max-w-md mx-auto mt-5 bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-5 flex items-start gap-4 shadow-[0_2px_6px_rgba(15,23,42,0.04)]">
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
          </div>
        </div>
      </section>

      {/* ─────────── 8. QUALIFICATION (white — breaks up slate run) ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <h2 className="text-xl md:text-2xl font-medium tracking-tight text-slate-900 mb-2 leading-tight text-center">
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

          {/* Comparison table — card feel */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-4">Feature</th>
                  <th className="text-center text-[11px] uppercase tracking-wider text-[#0E2A47] font-semibold px-5 py-4">PawTenant</th>
                  <th className="text-center text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-5 py-4">Typical online services</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow feature="Unique Verification ID landlords can confirm" us done them="Rare or absent" />
                <CompareRow feature="Real provider names + license # + NPI on letter" us done them="Often hidden" />
                <CompareRow feature="Reviewed by clinician licensed in your state" us done them="Sometimes" />
                <CompareRow feature="Refund if you don't qualify after review" us done them="Sometimes" />
                <CompareRow feature="Auto-approval / 24-hour 'guaranteed'" us={false} usText="No — clinical review only" them="Common" />
                <CompareRow feature="Housing-specific documentation language" us done them="Generic templates" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─────────── 10. FAQ (white) ─────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
          <h2 className="text-xl md:text-2xl font-medium tracking-tight text-slate-900 mb-6 leading-tight text-center">
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
          <h2 className="text-2xl md:text-[28px] font-medium tracking-tight leading-tight mb-3">
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
          src="/assets/documents/esa-sample-letter.svg"
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
  const ringClasses =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-[#0E2A47]/5 border-[#0E2A47]/20 text-[#0E2A47]";

  return (
    <div className="flex items-start gap-3">
      <span className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${ringClasses}`}>
        {icon === "shield" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )}
        {icon === "badge" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="6" />
            <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
          </svg>
        )}
        {icon === "refund" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-900">{label}</div>
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
  const dot = tone === "green" ? "bg-emerald-600" : "bg-[#0E2A47]";
  const ring = tone === "green" ? "border-emerald-200 bg-emerald-50" : "bg-white border-slate-300";
  return (
    <div className="flex items-start gap-2.5">
      <span className={`w-5 h-5 rounded-md ${ring} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      </span>
      <div className="text-[12px] text-slate-600 leading-snug">
        <span className="text-slate-900 font-medium">{label}</span> {detail}
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
  const usIsYes = done === true || us === true || us === undefined;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition">
      <td className="px-5 py-4 text-[13.5px] text-slate-700 font-medium">{feature}</td>
      <td className="px-5 py-4 text-center">
        {usIsYes ? (
          <span className="inline-flex items-center gap-2 text-emerald-700 text-[13.5px] font-medium">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            {usText ?? "Yes"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-slate-700 text-[13.5px]">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            {usText ?? "No"}
          </span>
        )}
      </td>
      <td className="px-5 py-4 text-center text-[13px] text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
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
