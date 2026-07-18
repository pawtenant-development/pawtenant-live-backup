// PlanPricingSection — the canonical 3-card public pricing section for ESA and
// PSD (CLOSEOUT-005 Phase F / F2). Themed (orange = ESA, amber = PSD), mobile
// friendly, with a PaymentTrustStrip directly below the cards.
//
// Prices are passed in by the caller from src/config/pricing.ts (the single
// source of truth) — this component never hardcodes an amount. It ALWAYS shows
// the renewal price explicitly on subscription cards: "$X first year, then
// $Y/year beginning in year two" — never a flat number, never a tooltip.
import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import PaymentTrustStrip from "./PaymentTrustStrip";

export interface PlanCard {
  name: string;
  /** Small sub-label under the name, e.g. "For 1 pet". */
  scope?: string;
  /** Ribbon label, e.g. "Most Popular". */
  badge?: string;
  /** Whole-dollar amount charged today (one-time total, or first-year total). */
  price: number;
  /** e.g. "one-time" or "first year". */
  priceSuffix: string;
  /** Explicit renewal disclosure for subscription cards. Rendered verbatim. */
  renewalLine?: string;
  /** Extra muted note, e.g. multi-pet subscription pricing. */
  subNote?: string;
  features: string[];
  ctaLabel: string;
  /** Plain internal path; attribution params are appended automatically. */
  ctaHref: string;
  highlight?: boolean;
}

type Theme = "esa" | "psd";

const THEME: Record<Theme, {
  eyebrow: string; ring: string; badge: string; ctaSolid: string; ctaOutline: string;
  check: string; renew: string;
}> = {
  esa: {
    eyebrow: "text-orange-500",
    ring: "border-orange-500",
    badge: "bg-orange-500",
    ctaSolid: "bg-orange-500 text-white hover:bg-orange-600",
    ctaOutline: "border-2 border-orange-500 text-orange-600 hover:bg-orange-50",
    check: "text-orange-500",
    renew: "text-orange-600 bg-orange-50 border-orange-100",
  },
  psd: {
    eyebrow: "text-amber-600",
    ring: "border-amber-500",
    badge: "bg-amber-500",
    ctaSolid: "bg-amber-500 text-white hover:bg-amber-600",
    ctaOutline: "border-2 border-amber-500 text-amber-600 hover:bg-amber-50",
    check: "text-amber-500",
    renew: "text-amber-700 bg-amber-50 border-amber-100",
  },
};

interface Props {
  theme: Theme;
  eyebrow: string;
  heading: string;
  subheading?: string;
  cards: PlanCard[];
  footnote?: string;
  className?: string;
  id?: string;
}

export default function PlanPricingSection({ theme, eyebrow, heading, subheading, cards, footnote, className = "", id }: Props) {
  const { withAttribution } = useAttributionParams();
  const t = THEME[theme];

  return (
    <section id={id} className={`py-14 sm:py-16 ${className}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-9 sm:mb-11">
          <span className={`inline-block text-xs font-bold uppercase tracking-widest ${t.eyebrow} mb-3`}>{eyebrow}</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{heading}</h2>
          {subheading && <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto leading-relaxed">{subheading}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {cards.map((c) => (
            <div
              key={c.name}
              className={`relative bg-white rounded-2xl border-2 p-6 sm:p-7 flex flex-col ${c.highlight ? `${t.ring} shadow-md` : "border-gray-200"}`}
            >
              {c.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className={`${t.badge} text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-sm`}>{c.badge}</span>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-gray-900 font-bold text-base">{c.name}</h3>
                {c.scope && <p className="text-gray-400 text-xs mt-0.5">{c.scope}</p>}
                <div className="flex items-end gap-1.5 mt-3">
                  <span className="text-4xl font-extrabold text-gray-900">${c.price}</span>
                  <span className="text-gray-400 text-sm mb-1.5">{c.priceSuffix}</span>
                </div>
                {c.renewalLine && (
                  <div className={`mt-2.5 inline-flex items-start gap-1.5 text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 leading-snug ${t.renew}`}>
                    <i className="ri-loop-right-line mt-0.5 flex-shrink-0" aria-hidden="true"></i>
                    <span>{c.renewalLine}</span>
                  </div>
                )}
                {c.subNote && <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{c.subNote}</p>}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {c.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className={`ri-checkbox-circle-fill ${t.check} text-base`} aria-hidden="true"></i>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={withAttribution(c.ctaHref)}
                className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-lg transition-colors cursor-pointer text-center block ${c.highlight ? t.ctaSolid : t.ctaOutline}`}
              >
                {c.ctaLabel}
              </Link>
            </div>
          ))}
        </div>

        {footnote && <p className="text-center text-xs text-gray-400 mt-6 max-w-2xl mx-auto leading-relaxed">{footnote}</p>}

        <PaymentTrustStrip className="mt-8" />
      </div>
    </section>
  );
}
