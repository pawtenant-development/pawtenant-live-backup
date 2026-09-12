// planPricingCards — the SINGLE source for the public ESA / PSD 3-card pricing
// content (STATE-PAGE-PRICING-HOMEPAGE-PARITY-TRUST-STRIP-001).
//
// One matrix, consumed by every public pricing surface so the homepage, the PSD
// landing page, and the ESA/PSD state pages can never drift:
//   - HomePricingSection  → buildEsaPlanCards("/assessment")
//   - PsdPricingSection   → buildPsdPlanCards("/psd-assessment")
//   - ESA state pages     → buildEsaPlanCards("/assessment?state=<ABBR>&ref=state-page")
//   - PSD state pages     → buildPsdPlanCards("/psd-assessment")
//
// Prices come from src/config/pricing.ts (the ONE source of truth) — this file
// hardcodes no amount. The annual card always discloses the renewal price
// explicitly. There is intentionally NO Reasonable Accommodation / $179 bundle
// card here: the RA bundle belongs only in the assessment package-selection
// step, never on the informational homepage / state-page pricing sections.
//
// PRESENTATION-ONLY: these values must never reach a charge / Stripe / order /
// refund / payout path. Only the public pricing sections import this module.
import { type PlanCard } from "../components/feature/PlanPricingSection";
import {
  getEsaOneTimeTotal,
  getEsaAnnualTotal,
  getEsaRenewalTotal,
  getPsdOneTimeTotal,
  getPsdAnnualTotal,
  getPsdRenewalTotal,
} from "../config/pricing";
// ESA-PSD-PLANNERS-MARKETING-LIVE-001 — each family lists ONLY its own free
// resource: the Pet Care Planner on ESA cards, the PSD Training Workbook on PSD cards.
import { ESA_PLANNER_BENEFIT_LINE, PSD_PLANNER_BENEFIT_LINE } from "./plannerBenefit";

export interface PlanSectionCopy {
  eyebrow: string;
  heading: string;
  subheading: string;
  footnote: string;
}

export const ESA_PLAN_COPY: PlanSectionCopy = {
  eyebrow: "Simple, Transparent Pricing",
  heading: "Choose the ESA Letter Plan That Fits You",
  subheading:
    "One-time letters and annual plans — every option includes a licensed professional and our money-back guarantee. No hidden fees.",
  footnote:
    "*Multi-pet letters cover up to three animals on one letter where clinically appropriate. Annual plans renew automatically at the renewal price shown; cancel anytime from your account portal.",
};

export const PSD_PLAN_COPY: PlanSectionCopy = {
  eyebrow: "Simple, Transparent PSD Pricing",
  heading: "Choose Your Psychiatric Service Dog Letter Plan",
  subheading:
    "One-time letters and annual plans — each includes a licensed professional and our money-back guarantee. No hidden fees.",
  footnote:
    "*Multi-dog letters cover up to three dogs on one letter where clinically appropriate. Annual plans renew automatically at the renewal price shown; cancel anytime from your account portal.",
};

/** ESA 3-card plan set (1–2 pets · annual · 3 pets). `ctaHref` routes every card
 *  to the ESA assessment; callers append a state/ref source where relevant. */
export function buildEsaPlanCards(ctaHref = "/assessment"): PlanCard[] {
  return [
    {
      name: "ESA Letter",
      scope: "For up to 2 pets",
      price: getEsaOneTimeTotal(1), // $129 — covers 1 OR 2 pets
      priceSuffix: "one-time",
      features: [
        "Licensed provider evaluation",
        "Covers up to 2 animals on one letter",
        "Signed, FHA-compliant ESA letter",
        "Typically delivered within 24 hours",
        "Verification ID in your customer portal",
        "Landlord verification support",
        "Full refund if you don't qualify",
        ESA_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Start Your Evaluation",
      ctaHref,
    },
    {
      name: "ESA Annual Plan",
      scope: "For 1 pet",
      badge: "Most Popular",
      highlight: true,
      price: getEsaAnnualTotal(1), // $115 first year
      priceSuffix: "first year",
      renewalLine: `Renews at $${getEsaRenewalTotal(1)}/year beginning in year two`, // $100
      features: [
        "Annual evaluation & updated documentation",
        "Renewal reminders before your letter expires",
        "Automatic yearly renewal — cancel anytime",
        "Priority scheduling — no waitlist",
        "Everything in the ESA Letter plan",
        ESA_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Choose Annual",
      ctaHref,
    },
    {
      name: "Three-Pet ESA Letter",
      scope: "For 3 pets",
      price: getEsaOneTimeTotal(3), // $149 one-time fixed total (exactly 3 pets)
      priceSuffix: "one-time · fixed total",
      subNote: `Prefer annual for multiple pets? $${getEsaAnnualTotal(3)} first year, then $${getEsaRenewalTotal(3)}/year.`, // $135 → $115
      // Superset of the single-pet ESA Letter card (all six of its benefits) PLUS
      // the multi-pet coverage line, so the higher tier visibly offers MORE.
      features: [
        "Licensed provider evaluation",
        "Covers up to 3 animals on one letter*",
        "Signed, FHA-compliant ESA letter",
        "Typically delivered within 24 hours",
        "Verification ID in your customer portal",
        "Landlord verification support",
        "Full refund if you don't qualify",
        ESA_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Start Three-Pet",
      ctaHref,
    },
  ];
}

/** PSD 3-card plan set (up to 2 dogs · annual · exactly 3 dogs). `ctaHref` routes every card
 *  to the PSD assessment. PSD/dog terminology only — never ESA/animal. */
export function buildPsdPlanCards(ctaHref = "/psd-assessment"): PlanCard[] {
  return [
    {
      name: "PSD Letter",
      scope: "For up to 2 dogs",
      price: getPsdOneTimeTotal(1), // $129 (same for 2 dogs)
      priceSuffix: "one-time",
      features: [
        "Licensed provider evaluation",
        "Signed PSD documentation letter",
        "Typically delivered within 24 hours",
        "Verification ID in your customer portal",
        "Housing & travel documentation support",
        "Full refund if you don't qualify",
        PSD_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Start Your Evaluation",
      ctaHref,
    },
    {
      name: "PSD Annual Plan",
      scope: "For 1 dog",
      badge: "Most Popular",
      highlight: true,
      price: getPsdAnnualTotal(1), // $115 first year
      priceSuffix: "first year",
      renewalLine: `Renews at $${getPsdRenewalTotal(1)}/year beginning in year two`, // $100
      features: [
        "Annual evaluation & updated documentation",
        "Renewal reminders before your letter expires",
        "Automatic yearly renewal — cancel anytime",
        "Priority scheduling — no waitlist",
        "Everything in the PSD Letter plan",
        PSD_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Choose Annual",
      ctaHref,
    },
    {
      name: "Three-Dog PSD Letter",
      scope: "For exactly 3 dogs",
      price: getPsdOneTimeTotal(3), // $149 one-time fixed total
      priceSuffix: "one-time · fixed total",
      subNote: `Prefer annual for 3 dogs? $${getPsdAnnualTotal(3)} first year, then $${getPsdRenewalTotal(3)}/year.`, // $135 → $115
      features: [
        "One evaluation covering 3 dogs*",
        "Signed PSD documentation letter",
        "Verification ID in your customer portal",
        "Housing & travel documentation support",
        PSD_PLANNER_BENEFIT_LINE,
      ],
      ctaLabel: "Start Multi-Dog",
      ctaHref,
    },
  ];
}
