// HomePricingSection — the ESA 3-card pricing block on the homepage
// (CLOSEOUT-005 Phase F). Prices come from src/config/pricing.ts; the annual
// card always discloses the renewal price explicitly.
import PlanPricingSection, { type PlanCard } from "../../../components/feature/PlanPricingSection";
import { getEsaOneTimeTotal, getEsaAnnualTotal, getEsaRenewalTotal } from "../../../config/pricing";

const CARDS: PlanCard[] = [
  {
    name: "ESA Letter",
    scope: "For 1 pet",
    price: getEsaOneTimeTotal(1),   // $129
    priceSuffix: "one-time",
    features: [
      "Licensed provider evaluation",
      "Signed, FHA-compliant ESA letter",
      "Typically delivered within 24 hours",
      "Unique letter verification ID",
      "Landlord verification support",
      "Full refund if you don't qualify",
    ],
    ctaLabel: "Start Your Evaluation",
    ctaHref: "/assessment",
  },
  {
    name: "ESA Annual Plan",
    scope: "For 1 pet",
    badge: "Most Popular",
    highlight: true,
    price: getEsaAnnualTotal(1),    // $115 first year
    priceSuffix: "first year",
    renewalLine: `Renews at $${getEsaRenewalTotal(1)}/year beginning in year two`, // $100
    features: [
      "Annual evaluation & updated documentation",
      "Renewal reminders before your letter expires",
      "Automatic yearly renewal — cancel anytime",
      "Priority scheduling — no waitlist",
      "Everything in the ESA Letter plan",
    ],
    ctaLabel: "Choose Annual",
    ctaHref: "/assessment",
  },
  {
    name: "Multi-Pet ESA Letter",
    scope: "For 2 or 3 pets",
    price: getEsaOneTimeTotal(2),   // $149 one-time fixed total
    priceSuffix: "one-time · fixed total",
    subNote: `Prefer annual for multiple pets? $${getEsaAnnualTotal(2)} first year, then $${getEsaRenewalTotal(2)}/year.`, // $135 → $115
    features: [
      "One evaluation covering up to 3 animals*",
      "Signed, FHA-compliant ESA letter",
      "Unique letter verification ID",
      "Landlord verification support",
    ],
    ctaLabel: "Start Multi-Pet",
    ctaHref: "/assessment",
  },
];

export default function HomePricingSection() {
  return (
    <PlanPricingSection
      theme="esa"
      id="pricing"
      className="bg-[#fdf8f3] border-t border-orange-100"
      eyebrow="Simple, Transparent Pricing"
      heading="Choose the ESA Letter Plan That Fits You"
      subheading="One-time letters and annual plans — every option includes a licensed professional and our money-back guarantee. No hidden fees."
      cards={CARDS}
      footnote="*Multi-pet letters cover up to three animals on one letter where clinically appropriate. Annual plans renew automatically at the renewal price shown; cancel anytime from your account portal."
    />
  );
}
