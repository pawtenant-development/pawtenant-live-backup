// PsdPricingSection — the PSD 3-card pricing block for the main PSD landing page
// (CLOSEOUT-005 Phase F2). Cards + copy come from the shared single source
// src/data/planPricingCards.ts (same matrix the PSD state pages consume, so they
// can never drift); prices come from src/config/pricing.ts. The annual card
// always discloses the renewal price explicitly. No $79 consultation, no RA card.
import PlanPricingSection from "./PlanPricingSection";
import { buildPsdPlanCards, PSD_PLAN_COPY } from "../../data/planPricingCards";

export default function PsdPricingSection({ className = "" }: { className?: string }) {
  return (
    <PlanPricingSection
      theme="psd"
      id="psd-pricing"
      className={className}
      eyebrow={PSD_PLAN_COPY.eyebrow}
      heading={PSD_PLAN_COPY.heading}
      subheading={PSD_PLAN_COPY.subheading}
      cards={buildPsdPlanCards("/psd-assessment")}
      footnote={PSD_PLAN_COPY.footnote}
    />
  );
}
