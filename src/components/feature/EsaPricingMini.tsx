import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICE_LABELS } from "@/config/pricing";

interface Props {
  /** Optional section bg override. Default: white. */
  className?: string;
}

/**
 * EsaPricingMini — compact mobile-friendly pricing card for use on
 * trust / education pages (/how-to-get-esa-letter, /housing-rights-esa,
 * state pages via state-esa template).
 *
 * Pricing values come from src/config/pricing.ts — single source of
 * truth. No hard-coded numbers in this component. The CTA routes to
 * /assessment with attribution preserved via useAttributionParams.
 *
 * Includes a small PSD educational note below the pricing — surfaces
 * PawTenant's PSD support without rewriting the host page around PSD.
 */
export default function EsaPricingMini({ className }: Props) {
  const { withAttribution } = useAttributionParams();
  return (
    <section className={`py-12 sm:py-16 ${className || "bg-white"}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-6 sm:mb-8">
          <p className="text-orange-500 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
            Simple pricing
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Clear, upfront <span className="text-orange-500">ESA Letter</span> pricing
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 max-w-2xl mx-auto items-stretch">
          {/* One-Time card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 flex flex-col">
            <p className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-1">
              One-time
            </p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-none">
                {ESA_PRICE_LABELS.oneTime}
              </span>
              <span className="text-xs text-gray-400">
                {ESA_PRICE_LABELS.oneTimeSuffix}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-snug mb-4">
              Valid for 1 year. Pay once, no auto-renewal.
            </p>
            <Link
              to={withAttribution("/assessment")}
              className="mt-auto whitespace-nowrap w-full py-2.5 text-sm font-bold rounded-md text-center block border-2 border-orange-500 text-orange-500 hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Start with one-time
            </Link>
          </div>

          {/* Annual card (highlighted) */}
          <div className="bg-white rounded-2xl border-2 border-orange-500 p-5 sm:p-6 flex flex-col relative">
            <span className="absolute -top-3 right-4 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Best value
            </span>
            <p className="text-[11px] font-bold tracking-widest uppercase text-orange-500 mb-1">
              Annual
            </p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-none">
                {ESA_PRICE_LABELS.subscription}
              </span>
              <span className="text-xs text-gray-400">
                {ESA_PRICE_LABELS.subscriptionSuffix}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-snug mb-4">
              Renews automatically. Save vs. one-time every year.
            </p>
            <Link
              to={withAttribution("/assessment")}
              className="mt-auto whitespace-nowrap w-full py-2.5 bg-orange-500 text-white text-sm font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-center block"
            >
              Start with annual
            </Link>
          </div>
        </div>

        {/* Trust strip */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-5 text-[11px] text-gray-500 font-medium">
          <span className="inline-flex items-center gap-1">
            <i className="ri-shield-check-line text-orange-500"></i> Money-back if not approved
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="ri-bank-card-line text-orange-500"></i> Klarna pay-later where eligible
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="ri-stethoscope-line text-orange-500"></i> Licensed clinician review
          </span>
        </div>

        {/* PSD note — surfaces PSD support without rewriting host page */}
        <p className="text-center text-[11px] text-gray-400 mt-4 max-w-md mx-auto leading-relaxed">
          PawTenant also supports{" "}
          <strong className="text-gray-600">PSD (Psychiatric Service Dog)</strong>{" "}
          evaluations for qualifying individuals where clinically appropriate. PSD
          documentation requires disability-related task training and is different
          from ESA documentation.
        </p>
      </div>
    </section>
  );
}
