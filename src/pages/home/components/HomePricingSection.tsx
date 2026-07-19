// HomePricingSection — the ESA 3-card pricing block on the homepage
// (CLOSEOUT-005 Phase F). Cards + copy come from the shared single source
// src/data/planPricingCards.ts (same matrix the ESA state pages consume, so
// they can never drift); prices come from src/config/pricing.ts. The annual
// card always discloses the renewal price explicitly.
import PlanPricingSection from "../../../components/feature/PlanPricingSection";
import { buildEsaPlanCards, ESA_PLAN_COPY } from "../../../data/planPricingCards";

export default function HomePricingSection() {
  return (
    <PlanPricingSection
      theme="esa"
      id="pricing"
      className="bg-[#fdf8f3] border-t border-orange-100"
      eyebrow={ESA_PLAN_COPY.eyebrow}
      heading={ESA_PLAN_COPY.heading}
      subheading={ESA_PLAN_COPY.subheading}
      cards={buildEsaPlanCards("/assessment")}
      footnote={ESA_PLAN_COPY.footnote}
    />
  );
}
