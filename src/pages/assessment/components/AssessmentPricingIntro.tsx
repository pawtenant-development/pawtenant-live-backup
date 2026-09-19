import { buildEsaPlanCards, buildPsdPlanCards } from "@/data/planPricingCards";
import type { PlanCard } from "@/components/feature/PlanPricingSection";

interface AssessmentPricingIntroProps {
  letterType: "esa" | "psd";
  onContinue: () => void;
}

/**
 * Keep shared benefits in one predictable reading order across all cards.
 * Product-specific annual benefits retain their wording, while exact matches
 * such as evaluation, coverage, signed letter and planner never jump around.
 */
const FEATURE_SEQUENCE: RegExp[] = [
  /Licensed provider evaluation/i,
  /Annual evaluation/i,
  /Covers up to|One evaluation covering/i,
  /Signed, (?:FHA-compliant ESA|ADA-informed PSD) letter/i,
  /Typically delivered within 24 hours|Priority scheduling/i,
  /Verification ID/i,
  /Landlord verification support|Housing & travel verification support/i,
  /Full refund if you don't qualify/i,
  /Renewal reminders/i,
  /Automatic yearly renewal/i,
  /Pet Care Planner|PSD Training Workbook/i,
];

function sortFeaturesByCanonicalSequence(features: string[]): string[] {
  return features
    .map((feature, index) => ({
      feature,
      index,
      rank: FEATURE_SEQUENCE.findIndex((pattern) => pattern.test(feature)),
    }))
    .sort((a, b) => {
      const aRank = a.rank < 0 ? FEATURE_SEQUENCE.length : a.rank;
      const bRank = b.rank < 0 ? FEATURE_SEQUENCE.length : b.rank;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ feature }) => feature);
}

/**
 * Keep every card equally scannable without changing the canonical plan data.
 * Annual and multi-pet cards keep their own benefits, then borrow missing
 * standard benefits until every card has the same visible row count.
 */
function alignVisibleFeatures(cards: PlanCard[]): PlanCard[] {
  const standardFeatures = cards[0]?.features ?? [];
  // This screen is a lightweight pricing introduction, not the full package
  // comparison. Keep the essential benefits visible without making desktop
  // visitors scroll through three oversized cards before the questionnaire.
  const targetCount = Math.min(6, standardFeatures.length);

  return cards.map((card) => {
    const directFeatures = card.features.filter(
      (feature) => !/^Everything in the .+ plan$/i.test(feature),
    );
    const supplementalFeatures = standardFeatures.filter(
      (feature) => !directFeatures.includes(feature),
    );

    const resourceBenefit = [...directFeatures, ...standardFeatures].find(
      (feature) => /Pet Care Planner|PSD Training Workbook/i.test(feature),
    );
    const visibleFeatures = sortFeaturesByCanonicalSequence([
      ...directFeatures,
      ...supplementalFeatures,
    ]).slice(0, targetCount);

    // The free downloadable resource is included with every package. Preserve
    // that entitlement in this compact summary even when lower-ranked benefits
    // are trimmed from the full canonical list.
    if (resourceBenefit && !visibleFeatures.includes(resourceBenefit)) {
      visibleFeatures[visibleFeatures.length - 1] = resourceBenefit;
    }

    return {
      ...card,
      features: sortFeaturesByCanonicalSequence(visibleFeatures),
    };
  });
}

/**
 * Presentation-only pricing gate for fresh assessment visits.
 *
 * Every card runs the same callback. No package identifier, price, or plan is
 * written to assessment state, storage, the URL, analytics, or checkout.
 */
export default function AssessmentPricingIntro({
  letterType,
  onContinue,
}: AssessmentPricingIntroProps) {
  const isPsd = letterType === "psd";
  const cards = alignVisibleFeatures(
    isPsd ? buildPsdPlanCards() : buildEsaPlanCards(),
  );
  const subject = isPsd ? "dogs" : "pets";
  const accent = isPsd ? "amber" : "emerald";
  const trustSignals = [
    { icon: "ri-shield-check-line", label: "HIPAA Secure" },
    { icon: "ri-award-line", label: "Licensed Professionals" },
    { icon: "ri-time-line", label: "24-Hour Delivery" },
    { icon: "ri-refund-2-line", label: "Money-Back Guarantee" },
  ];

  return (
    <section
      aria-labelledby="assessment-pricing-heading"
      className="mx-auto max-w-6xl lg:relative lg:left-1/2 lg:w-[min(1120px,calc(100vw-3rem))] lg:-translate-x-1/2"
    >
      <div className="mb-6 text-center sm:mb-8">
        <p
          className={`mb-2 text-xs font-extrabold uppercase tracking-[0.22em] ${
            isPsd ? "text-amber-700" : "text-[#1A5C4F]"
          }`}
        >
          Simple, transparent pricing
        </p>
        <h1
          id="assessment-pricing-heading"
          className="text-2xl font-black leading-tight text-gray-950 sm:text-3xl"
        >
          See pricing before you begin
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-gray-600 sm:text-base">
          Tap any card to start your assessment. You will add your {subject} in
          the next steps, and your final price will be calculated from that
          number.
        </p>
      </div>

      <div
        aria-label="Service assurances"
        className="mx-auto mb-6 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        {trustSignals.map((signal) => (
          <span
            key={signal.label}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-center shadow-sm"
          >
            <i
              aria-hidden="true"
              className={`${signal.icon} text-lg ${
                isPsd ? "text-amber-600" : "text-emerald-600"
              }`}
            ></i>
            <span className="text-xs font-extrabold leading-4 text-gray-700">
              {signal.label}
            </span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3 lg:gap-5">
        {cards.map((card) => (
          <button
            key={card.name}
            type="button"
            onClick={onContinue}
            aria-label={`Start assessment after viewing ${card.name} pricing`}
            className={`group relative flex w-full cursor-pointer flex-col rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 sm:p-6 lg:h-full ${
              card.highlight
                ? isPsd
                  ? "border-amber-500 focus-visible:ring-amber-200"
                  : "border-[#1A5C4F] focus-visible:ring-emerald-200"
                : "border-gray-200 hover:border-gray-300 focus-visible:ring-gray-200"
            }`}
          >
            <span className={`mb-3 items-center ${card.badge ? "flex" : "hidden lg:flex lg:h-7"}`}>
              <span
                className={`w-fit rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white ${
                  isPsd ? "bg-amber-600" : "bg-[#1A5C4F]"
                } ${card.badge ? "" : "invisible"}`}
              >
                {card.badge ?? "Most Popular"}
              </span>
            </span>

            <span className="flex flex-col lg:min-h-16">
              <span className="text-lg font-black text-gray-950">{card.name}</span>
              <span className="mt-1 text-sm font-semibold text-gray-500">{card.scope}</span>
            </span>

            <span className="mt-3 flex flex-col lg:min-h-[6.5rem]">
              <span className="flex items-end gap-2">
              <span className="text-4xl font-black tracking-tight text-gray-950">
                ${card.price}
              </span>
              <span className="pb-1 text-xs font-bold text-gray-500">
                {card.priceSuffix}
              </span>
              </span>

            {card.renewalLine && (
              <span className="mt-2 text-xs font-semibold leading-5 text-gray-600">
                {card.renewalLine}
              </span>
            )}
            {card.subNote && (
              <span className="mt-2 text-xs font-semibold leading-5 text-gray-600">
                {card.subNote}
              </span>
            )}
            </span>

            <span className="mt-1 flex flex-col gap-2.5 pb-4 lg:flex-1 lg:pb-5">
              {card.features.map((feature) => (
                <span key={feature} className="flex items-start gap-2 text-sm leading-5 text-gray-700">
                  <i
                    aria-hidden="true"
                    className={`ri-checkbox-circle-fill mt-0.5 flex-shrink-0 ${
                      isPsd ? "text-amber-500" : "text-emerald-600"
                    }`}
                  ></i>
                  <span>{feature}</span>
                </span>
              ))}
            </span>

            <span
              className={`mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition group-hover:brightness-95 ${
                accent === "amber" ? "bg-amber-600" : "bg-[#1A5C4F]"
              }`}
            >
              Start Assessment
              <i aria-hidden="true" className="ri-arrow-right-line text-lg"></i>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-5 text-center text-xs font-semibold leading-5 text-gray-500">
        Pricing shown for reference. Your selection is made later based on the
        number of {subject} you add.
      </p>
    </section>
  );
}
