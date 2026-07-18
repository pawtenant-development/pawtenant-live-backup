// PsdPricingSection — the PSD 3-card pricing block for the main PSD landing page
// (CLOSEOUT-005 Phase F2). Prices come from src/config/pricing.ts; the annual
// card always discloses the renewal price explicitly. No $79 consultation.
import PlanPricingSection, { type PlanCard } from "./PlanPricingSection";
import { getPsdOneTimeTotal, getPsdAnnualTotal, getPsdRenewalTotal } from "../../config/pricing";

const CARDS: PlanCard[] = [
  {
    name: "PSD Letter",
    scope: "For 1 dog",
    price: getPsdOneTimeTotal(1),   // $129
    priceSuffix: "one-time",
    features: [
      "Licensed provider evaluation",
      "Signed PSD documentation letter",
      "Typically delivered within 24 hours",
      "Unique letter verification ID",
      "Housing & travel documentation support",
      "Full refund if you don't qualify",
    ],
    ctaLabel: "Start Your Evaluation",
    ctaHref: "/psd-assessment",
  },
  {
    name: "PSD Annual Plan",
    scope: "For 1 dog",
    badge: "Most Popular",
    highlight: true,
    price: getPsdAnnualTotal(1),    // $115 first year
    priceSuffix: "first year",
    renewalLine: `Renews at $${getPsdRenewalTotal(1)}/year beginning in year two`, // $100
    features: [
      "Annual evaluation & updated documentation",
      "Renewal reminders before your letter expires",
      "Automatic yearly renewal — cancel anytime",
      "Priority scheduling — no waitlist",
      "Everything in the PSD Letter plan",
    ],
    ctaLabel: "Choose Annual",
    ctaHref: "/psd-assessment",
  },
  {
    name: "Multi-Dog PSD Letter",
    scope: "For 2 or 3 dogs",
    price: getPsdOneTimeTotal(2),   // $149 one-time fixed total
    priceSuffix: "one-time · fixed total",
    subNote: `Prefer annual for multiple dogs? $${getPsdAnnualTotal(2)} first year, then $${getPsdRenewalTotal(2)}/year.`, // $135 → $115
    features: [
      "One evaluation covering up to 3 dogs*",
      "Signed PSD documentation letter",
      "Unique letter verification ID",
      "Housing & travel documentation support",
    ],
    ctaLabel: "Start Multi-Dog",
    ctaHref: "/psd-assessment",
  },
];

export default function PsdPricingSection({ className = "" }: { className?: string }) {
  return (
    <PlanPricingSection
      theme="psd"
      id="psd-pricing"
      className={className}
      eyebrow="Simple, Transparent PSD Pricing"
      heading="Choose Your Psychiatric Service Dog Letter Plan"
      subheading="One-time letters and annual plans — each includes a licensed professional and our money-back guarantee. No hidden fees."
      cards={CARDS}
      footnote="*Multi-dog letters cover up to three dogs on one letter where clinically appropriate. Annual plans renew automatically at the renewal price shown; cancel anytime from your account portal."
    />
  );
}
