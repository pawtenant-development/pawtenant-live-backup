/**
 * PetCostSavingsCalculator.tsx
 *
 * LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
 *
 * The ONE complete pet-cost calculator for the public site. Replaces the
 * two-variable PetRentSavingsMini on /esa-letter-cost and /esa-letter-for-landlord
 * so the two pages can never drift apart or disagree on the arithmetic.
 *
 * MODEL — three user-controlled variables, all per-pet where labelled:
 *   pets            1–3      (matches what a multi-pet letter can cover)
 *   monthlyRent     $0–$150  per pet, per month
 *   deposit         $0–$600  per pet, one-time
 *
 *   annualRent  = pets × monthlyRent × 12
 *   deposits    = pets × deposit
 *   firstYear   = annualRent + deposits
 *              === pets × ((monthlyRent × 12) + deposit)   [the required formula]
 *
 * The pet count multiplies BOTH terms — a calculator that ignores pet count on
 * either term is a guard failure, see scripts/check-public-conversion-pages.mjs.
 *
 * COMPLIANCE: estimate-only. A letter never guarantees approval, a fee waiver,
 * or any housing outcome, and not every fee is waivable. That language is part
 * of the component and must not be removed by a caller.
 *
 * No network calls, no business logic, no pricing — this never touches a charge,
 * Stripe, order, refund or payout path.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const MIN_PETS = 1;
const MAX_PETS = 3;
const MAX_MONTHLY = 150;
const MAX_DEPOSIT = 600;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const money = (n: number) => usd.format(Math.round(n));

/** Clamp a raw input to [0, max]; blank / NaN / negative all collapse to 0. */
function clampMoney(raw: string, max: number): number {
  const n = parseFloat(raw);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export interface PetCostSavingsCalculatorProps {
  /** Section heading. Pages differ so the two landlord pages are not duplicates. */
  heading?: string;
  /** Supporting line under the heading. */
  copy?: string;
  /** Where the primary CTA points. */
  ctaHref?: string;
  ctaLabel?: string;
  /** Section background override. */
  className?: string;
  /** Anchor id for in-page links. */
  id?: string;
}

export default function PetCostSavingsCalculator({
  heading = "Estimate what pet rent and pet fees cost you in a year",
  copy = "Adjust the three values below. Pet rent and pet fees vary by building, so use the numbers on your own lease or listing.",
  ctaHref = "/assessment",
  ctaLabel = "Start Your ESA Assessment",
  className,
  id = "pet-cost-calculator",
}: PetCostSavingsCalculatorProps) {
  const { withAttribution } = useAttributionParams();

  const [pets, setPets] = useState(1);
  const [monthlyRaw, setMonthlyRaw] = useState("50");
  const [depositRaw, setDepositRaw] = useState("300");

  const monthly = clampMoney(monthlyRaw, MAX_MONTHLY);
  const deposit = clampMoney(depositRaw, MAX_DEPOSIT);

  const { annualRent, deposits, firstYear } = useMemo(() => {
    const a = pets * monthly * 12;
    const d = pets * deposit;
    return { annualRent: a, deposits: d, firstYear: a + d };
  }, [pets, monthly, deposit]);

  const sliderClass =
    "w-full h-2 rounded-full appearance-none cursor-pointer bg-orange-100 accent-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200";

  return (
    <section id={id} className={`py-12 sm:py-16 ${className || "bg-white"}`}>
      <div className="max-w-5xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-8 sm:mb-10">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3">
            <i className="ri-calculator-line" aria-hidden="true"></i>
            Pet cost estimate
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{heading}</h2>
          <p className="text-gray-500 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">{copy}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_10px_40px_-24px_rgba(15,23,42,0.28)] overflow-hidden">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            {/* ── Controls ─────────────────────────────────────────────── */}
            <div className="p-6 sm:p-8 space-y-7">
              {/* Pets */}
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <label htmlFor="calc-pets" className="text-[13px] font-bold text-gray-900">
                    Number of pets in your household
                  </label>
                  <span className="text-lg font-extrabold text-gray-900 tabular-nums">{pets}</span>
                </div>
                <input
                  id="calc-pets"
                  type="range"
                  min={MIN_PETS}
                  max={MAX_PETS}
                  step={1}
                  value={pets}
                  onChange={(e) => setPets(parseInt(e.target.value, 10) || MIN_PETS)}
                  className={sliderClass}
                  aria-valuetext={`${pets} pet${pets === 1 ? "" : "s"}`}
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1.5 font-medium">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                </div>
              </div>

              {/* Monthly pet rent — per pet */}
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <label htmlFor="calc-monthly" className="text-[13px] font-bold text-gray-900">
                    Monthly pet rent <span className="text-gray-400 font-semibold">(per pet)</span>
                  </label>
                  <div className="relative w-[104px] flex-shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_MONTHLY}
                      value={monthlyRaw}
                      onChange={(e) => setMonthlyRaw(e.target.value)}
                      aria-label="Monthly pet rent per pet, in dollars"
                      className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-[15px] font-bold text-right tabular-nums focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
                    />
                  </div>
                </div>
                <input
                  id="calc-monthly"
                  type="range"
                  min={0}
                  max={MAX_MONTHLY}
                  step={5}
                  value={monthly}
                  onChange={(e) => setMonthlyRaw(e.target.value)}
                  className={sliderClass}
                  aria-valuetext={`${money(monthly)} per pet per month`}
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Not every landlord charges pet rent, and amounts vary widely.
                </p>
              </div>

              {/* Deposit / fee — per pet */}
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <label htmlFor="calc-deposit" className="text-[13px] font-bold text-gray-900">
                    Pet deposit or pet fee{" "}
                    <span className="text-gray-400 font-semibold">(per pet, one-time)</span>
                  </label>
                  <div className="relative w-[104px] flex-shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_DEPOSIT}
                      value={depositRaw}
                      onChange={(e) => setDepositRaw(e.target.value)}
                      aria-label="Pet deposit or pet fee per pet, in dollars"
                      className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-[15px] font-bold text-right tabular-nums focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
                    />
                  </div>
                </div>
                <input
                  id="calc-deposit"
                  type="range"
                  min={0}
                  max={MAX_DEPOSIT}
                  step={25}
                  value={deposit}
                  onChange={(e) => setDepositRaw(e.target.value)}
                  className={sliderClass}
                  aria-valuetext={`${money(deposit)} per pet`}
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Some deposits are refundable; non-refundable pet fees usually are not.
                </p>
              </div>
            </div>

            {/* ── Summary ──────────────────────────────────────────────── */}
            <div className="bg-[#fdf8f3] border-t lg:border-t-0 lg:border-l border-orange-100 p-6 sm:p-8 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-1.5">
                Estimated first-year pet costs
              </p>
              <p
                className="text-[44px] sm:text-5xl font-extrabold text-gray-900 leading-none tabular-nums mb-1"
                aria-live="polite"
              >
                {money(firstYear)}
              </p>
              <p className="text-[12px] text-gray-500 mb-6">
                for {pets} pet{pets === 1 ? "" : "s"} over 12 months
              </p>

              <dl className="space-y-2.5 text-sm border-t border-orange-100 pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-600">
                    Annual pet rent
                    <span className="block text-[11px] text-gray-400">
                      {pets} × {money(monthly)} × 12 months
                    </span>
                  </dt>
                  <dd className="font-bold text-gray-900 tabular-nums">{money(annualRent)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-gray-600">
                    One-time deposits &amp; fees
                    <span className="block text-[11px] text-gray-400">
                      {pets} × {money(deposit)}
                    </span>
                  </dt>
                  <dd className="font-bold text-gray-900 tabular-nums">{money(deposits)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-orange-100 pt-2.5">
                  <dt className="font-bold text-gray-900">Estimated one-year total</dt>
                  <dd className="font-extrabold text-gray-900 tabular-nums">{money(firstYear)}</dd>
                </div>
              </dl>

              <Link
                to={withAttribution(ctaHref)}
                className="mt-6 inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-orange-500 text-white font-bold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-stethoscope-line" aria-hidden="true"></i>
                {ctaLabel}
              </Link>
            </div>
          </div>
        </div>

        {/* Compliance — required, do not remove. */}
        <div className="mt-5 flex items-start gap-2 max-w-3xl mx-auto">
          <i
            className="ri-information-line text-gray-400 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          ></i>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            <strong className="text-gray-600 font-semibold">
              Estimated potential savings — this calculator is informational only.
            </strong>{" "}
            It shows what the amounts you entered would add up to, not a promised refund or credit.
            Housing outcomes and how pet fees are treated depend on the specific facts and the
            applicable law. An ESA letter does not guarantee approval, a fee waiver, or any
            particular housing outcome, and a licensed provider determines clinical eligibility
            after an individual evaluation.
          </p>
        </div>
      </div>
    </section>
  );
}
