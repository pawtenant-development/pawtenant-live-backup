import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICING } from "@/config/pricing";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
  PsdCrossLink,
  JsonLd,
} from "../../components/feature/SeoKit";
import {
  graph,
  organizationSchema,
  serviceSchema,
  webPageSchema,
  faqSchema,
  breadcrumbSchema,
  type FaqItem,
} from "@/lib/seoSchema";

const PATH = "/pet-rent-savings-calculator";
const TITLE = "Pet Rent Savings Calculator | Estimate ESA Housing Savings";
const DESC =
  "Estimate how monthly pet rent and one-time pet fees can add up over 1, 2, and 5 years. See potential savings if your ESA housing accommodation request is approved.";
const UPDATED_HUMAN = "June 19, 2026";
const UPDATED_ISO = "2026-06-19";

const heroBadges = [
  { icon: "ri-calculator-line", label: "Free estimate" },
  { icon: "ri-shield-check-line", label: "No guarantee — estimate only" },
  { icon: "ri-user-star-line", label: "Licensed provider eval" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const faqs: FaqItem[] = [
  {
    q: "Does an ESA letter always remove pet rent?",
    a: "No. A housing provider must review the request, the documentation, and the applicable rules before deciding. This calculator shows potential savings, not a guarantee. A letter supports a reasonable-accommodation request — it does not guarantee approval, a fee waiver, or any specific housing outcome.",
  },
  {
    q: "Can a landlord charge pet rent for an approved ESA?",
    a: "In many housing situations, approved assistance animals are not treated the same as pets, so pet rent, pet deposits, and pet fees may not apply. But outcomes depend on the request, the documentation, the housing context, and applicable law. Each request is reviewed individually by the housing provider.",
  },
  {
    q: "Does this calculator apply to PSD documentation?",
    a: "It can estimate housing-related pet-fee savings, but PSD documentation is different from ESA documentation. A Psychiatric Service Dog involves disability-related task training and does not replace that training or create public-access rights. The savings shown here are about housing pet fees only.",
  },
  {
    q: "What should I enter for monthly pet rent?",
    a: "Enter the monthly pet rent your housing provider charges, or the amount they quoted, for your animal. Many renters are charged monthly pet rent in addition to regular rent — use that figure.",
  },
  {
    q: "What if I have more than one pet?",
    a: "If your housing provider charges per animal, use the number-of-pets field to estimate the combined monthly charge. If they charge a single flat pet rent regardless of how many animals you have, leave it at 1.",
  },
  {
    q: "Is this legal or financial advice?",
    a: "No. It is an estimate for informational purposes only. Actual savings depend on your housing provider, lease terms, applicable law, and whether your ESA or PSD-related accommodation request is approved.",
  },
];

/* ── Safe number parsing — handles blank / invalid input gracefully ─────────── */
function toNum(v: string, opts?: { min?: number; max?: number }): number {
  const n = parseFloat(v);
  let r = !isFinite(n) || n < 0 ? 0 : n;
  if (opts?.min != null) r = Math.max(opts.min, r);
  if (opts?.max != null) r = Math.min(opts.max, r);
  return r;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function money(n: number): string {
  return usd.format(Math.round(n));
}

interface InputFieldProps {
  label: string;
  helper: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  placeholder?: string;
}

function InputField({ label, helper, value, onChange, prefix, placeholder }: InputFieldProps) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-900 mb-1.5">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${prefix ? "pl-7" : "pl-3.5"} pr-3.5 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-[15px] font-semibold focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition`}
        />
      </div>
      <p className="text-[12px] text-gray-500 leading-relaxed mt-1.5">{helper}</p>
    </div>
  );
}

export default function PetRentSavingsCalculatorPage() {
  const { withAttribution } = useAttributionParams();

  const [monthly, setMonthly] = useState("50");
  const [oneTime, setOneTime] = useState("300");
  const [pets, setPets] = useState(1);
  const [docCost, setDocCost] = useState(String(ESA_PRICING.subscription));

  const monthlyVal = toNum(monthly);
  const oneTimeVal = toNum(oneTime);
  const docCostVal = toNum(docCost);

  const monthlyTotal = monthlyVal * pets;
  const annual = monthlyTotal * 12;

  const grossFor = (years: number) => annual * years + oneTimeVal;
  const netFor = (years: number) => grossFor(years) - docCostVal;

  const breakEvenMonths = monthlyTotal > 0 ? Math.ceil(docCostVal / monthlyTotal) : null;

  const horizons = [
    { years: 1, label: "1-Year Potential Savings" },
    { years: 2, label: "2-Year Potential Savings" },
    { years: 5, label: "5-Year Potential Savings" },
  ];

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Pet Rent Savings Calculator", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="pet rent savings calculator, ESA pet rent calculator, emotional support animal pet rent, pet fee savings, ESA housing savings, pet deposit calculator, how much pet rent can I save"
      />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO */}
      <section className="relative pt-24 sm:pt-28 pb-10 sm:pb-14 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 text-center">
          <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
            <i className="ri-calculator-line"></i>
            Pet rent savings
          </span>
          <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
            Pet Rent Savings Calculator
          </h1>
          <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-2xl mx-auto">
            Estimate how much monthly pet rent could add up over time — and what you may save if your
            housing accommodation request is approved.
          </p>
          <div className="flex justify-center mb-6">
            <TrustBadgeRow badges={heroBadges} mobileCount={2} />
          </div>
          <a
            href="#calculator"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
          >
            <i className="ri-arrow-down-line"></i>
            Estimate My Savings
          </a>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How much can you save on pet rent with an approved ESA?">
            <p>
              Monthly pet rent and one-time pet fees add up fast. At <strong>$50/month</strong> in pet
              rent, that's <strong>$600 a year</strong> — plus any one-time pet deposit. Over five
              years it can reach into the <strong>thousands</strong>.
            </p>
            <p>
              If your <strong>ESA or PSD-related housing accommodation request is approved</strong>,
              approved assistance animals are often not charged pet rent, pet deposits, or pet fees —
              so those costs may no longer apply. This is a potential saving, <strong>not a
              guarantee</strong>: each request is reviewed individually, and a letter does not
              guarantee approval or any specific outcome.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* CALCULATOR */}
      <section id="calculator" className="scroll-mt-24 py-12 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Estimate your savings
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Calculate your potential pet rent savings
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Adjust the numbers to match your situation. Everything updates instantly — nothing is
              saved or sent.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
            {/* INPUT PANEL */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)] p-6 sm:p-7">
              <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                <i className="ri-edit-2-line text-orange-500"></i>
                Your pet costs
              </h3>
              <div className="space-y-5">
                <InputField
                  label="Monthly pet rent"
                  helper="Many renters are charged monthly pet rent in addition to regular rent."
                  value={monthly}
                  onChange={setMonthly}
                  prefix="$"
                  placeholder="50"
                />
                <InputField
                  label="One-time pet fee or pet deposit"
                  helper="Some properties charge a one-time pet fee or deposit. Rules vary by housing provider and state."
                  value={oneTime}
                  onChange={setOneTime}
                  prefix="$"
                  placeholder="300"
                />

                {/* Number of pets — stepper */}
                <div>
                  <label className="block text-sm font-bold text-gray-900 mb-1.5">
                    Number of pets
                  </label>
                  <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      aria-label="Decrease number of pets"
                      onClick={() => setPets((p) => Math.max(1, p - 1))}
                      disabled={pets <= 1}
                      className="w-11 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                    >
                      <i className="ri-subtract-line text-lg"></i>
                    </button>
                    <span className="w-12 text-center text-[15px] font-bold text-gray-900 select-none">
                      {pets}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase number of pets"
                      onClick={() => setPets((p) => Math.min(5, p + 1))}
                      disabled={pets >= 5}
                      className="w-11 h-11 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                    >
                      <i className="ri-add-line text-lg"></i>
                    </button>
                  </div>
                  <p className="text-[12px] text-gray-500 leading-relaxed mt-1.5">
                    Use this if your housing provider charges pet rent per animal.
                  </p>
                </div>

                <InputField
                  label="Estimated documentation cost"
                  helper="Used only to estimate net savings after documentation cost."
                  value={docCost}
                  onChange={setDocCost}
                  prefix="$"
                  placeholder={String(ESA_PRICING.subscription)}
                />
              </div>
            </div>

            {/* RESULTS PANEL */}
            <div className="space-y-4">
              {horizons.map((h, i) => {
                const gross = grossFor(h.years);
                const net = netFor(h.years);
                return (
                  <div
                    key={h.years}
                    className={`rounded-2xl border p-6 ${
                      i === 2
                        ? "border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-[0_8px_30px_-18px_rgba(249,115,22,0.35)]"
                        : "border-gray-100 bg-white shadow-[0_8px_30px_-18px_rgba(15,23,42,0.15)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900">{h.label}</h3>
                      {i === 2 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                          Biggest impact
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
                          Gross potential savings
                        </p>
                        <p className="text-3xl font-bold text-gray-900 leading-none">
                          {money(gross)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
                          Est. net after documentation
                        </p>
                        <p className="text-2xl font-bold text-orange-600 leading-none">
                          {money(net)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed mt-4 pt-3 border-t border-gray-100">
                      Before any approved accommodation, this is what pet rent/fees could cost you.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BREAKDOWN */}
          <div className="mt-6 lg:mt-8 bg-white rounded-2xl border border-gray-100 p-6 sm:p-7">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-bar-chart-box-line text-orange-500"></i>
              Savings breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "Monthly pet rent total", value: money(monthlyTotal), icon: "ri-calendar-line" },
                { label: "Yearly pet rent total", value: money(annual), icon: "ri-calendar-2-line" },
                { label: "One-time pet fee / deposit", value: money(oneTimeVal), icon: "ri-coins-line" },
                { label: "Est. documentation cost", value: money(docCostVal), icon: "ri-file-text-line" },
                {
                  label: "Estimated break-even",
                  value: breakEvenMonths != null ? `${breakEvenMonths} mo` : "—",
                  icon: "ri-time-line",
                },
              ].map((row) => (
                <div key={row.label} className="rounded-xl bg-[#fafafa] border border-gray-100 p-4">
                  <div className="w-8 h-8 flex items-center justify-center bg-orange-50 rounded-lg mb-2.5">
                    <i className={`${row.icon} text-orange-500`}></i>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-500 leading-snug mb-1">
                    {row.label}
                  </p>
                  <p className="text-lg font-bold text-gray-900 leading-none">{row.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed mt-4">
              {breakEvenMonths != null ? (
                <>
                  <i className="ri-information-line text-gray-400 mr-1"></i>
                  At <strong>{money(monthlyTotal)}</strong>/month in pet rent, your documentation cost
                  is roughly covered after <strong>{breakEvenMonths} month
                  {breakEvenMonths === 1 ? "" : "s"}</strong> — if your accommodation request is
                  approved and pet rent no longer applies.
                </>
              ) : (
                <>
                  <i className="ri-information-line text-gray-400 mr-1"></i>
                  No monthly break-even — only one-time fees entered.
                </>
              )}
            </p>
          </div>

          {/* HOW WE CALCULATE */}
          <div className="mt-6 max-w-3xl mx-auto rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              How we calculate
            </p>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              Simple, transparent math:{" "}
              <strong>monthly pet rent × number of pets × 12 = yearly pet rent</strong>. Multiply by
              the number of years and add any one-time pet fee for the gross potential savings.
              Estimated net savings subtract your documentation cost. No fees, no hidden assumptions.
            </p>
          </div>

          {/* COMPLIANCE NOTE */}
          <div className="mt-6 max-w-3xl mx-auto rounded-2xl border border-orange-100 bg-[#fdf6ee] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <i className="ri-shield-check-line text-orange-500 text-lg mt-0.5 flex-shrink-0"></i>
              <div className="text-[13px] text-gray-600 leading-relaxed space-y-2">
                <p>
                  <strong className="text-gray-800">Potential savings if your housing
                  accommodation request is approved.</strong>{" "}
                  This calculator is for estimation only. Actual savings depend on your housing
                  provider, lease terms, applicable law, and whether your ESA or PSD-related
                  accommodation request is approved.
                </p>
                <p>
                  A letter does not guarantee approval, fee waiver, or any specific housing outcome.
                  ESA and PSD documentation are different — PSD documentation does not replace task
                  training or create public-access rights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            See if an ESA could fit your situation
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter — with a refund if you don't qualify. Approval and any fee
            waiver are always decided individually.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
            Start ESA Assessment
          </Link>
          <div className="mt-4">
            <Link
              to="/esa-letter-for-apartments"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 hover:underline"
            >
              Learn about ESA housing documentation
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
          <div className="mt-5">
            <LastUpdated date={UPDATED_HUMAN} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Pet rent savings: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* RELATED */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When apartment pet fees and deposits may not apply to an approved ESA." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "How ESA housing requests work for apartment renters." },
              { to: "/esa-letter-vs-pet-policy", title: "ESA letter vs pet policy", desc: "Why a no-pet policy and pet fees generally don't apply to an approved ESA." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your documentation fee includes." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to letter." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK */}
      <section className="py-10 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <PsdCrossLink />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" icon="ri-stethoscope-line" />
    </main>
  );
}
