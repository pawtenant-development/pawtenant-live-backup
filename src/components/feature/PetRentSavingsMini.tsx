/**
 * PetRentSavingsMini.tsx — compact, conversion-focused teaser for the full
 * Pet Rent Savings Calculator (/pet-rent-savings-calculator).
 *
 * Lightweight: pure React useState + Tailwind + remixicon (ri-*). No new deps,
 * no network calls, no business logic. Mirrors the math of the standalone
 * calculator's first horizon (1-year pet rent total) so the teaser and the
 * full tool agree.
 *
 * Compliance: estimate-only language. A letter does NOT guarantee approval,
 * fee waiver, or any specific housing outcome — the disclaimer is baked in and
 * must not be removed. ESA-focused; no PSD-specific claims.
 *
 * Used surgically on high-intent housing/cost pages (NOT homepage, assessment,
 * checkout, thank-you, or PSD-heavy pages).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CALCULATOR_PATH = "/pet-rent-savings-calculator";

/** Safe parse — blank / invalid / negative input becomes 0. */
function toNum(v: string): number {
  const n = parseFloat(v);
  return !isFinite(n) || n < 0 ? 0 : n;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function money(n: number): string {
  return usd.format(Math.round(n));
}

export interface PetRentSavingsMiniProps {
  /** Section heading. */
  heading?: string;
  /** Short supporting line under the heading. */
  copy?: string;
  /** Show the secondary "Start ESA Assessment" button. Defaults to true. */
  showAssessmentCta?: boolean;
  /** Section background override (e.g. "bg-white border-t border-gray-100"). */
  className?: string;
}

export default function PetRentSavingsMini({
  heading = "See how monthly pet rent adds up",
  copy = "Enter a typical monthly pet-rent amount and estimate what it could cost over one year.",
  showAssessmentCta = true,
  className,
}: PetRentSavingsMiniProps) {
  const { withAttribution } = useAttributionParams();

  const [monthly, setMonthly] = useState("50");
  const [pets, setPets] = useState(1);

  const monthlyTotal = toNum(monthly) * pets;
  const oneYearTotal = monthlyTotal * 12;

  return (
    <section className={`py-12 sm:py-14 ${className || "bg-white"}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 p-6 sm:p-8 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)]">
          {/* Eyebrow + heading */}
          <div className="flex items-center gap-2 mb-2.5">
            <i className="ri-calculator-line text-orange-500"></i>
            <span className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
              Pet rent estimate
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug mb-1.5">
            {heading}
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-xl">{copy}</p>

          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 items-center">
            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-gray-900 mb-1.5">
                  Monthly pet rent
                </label>
                <div className="relative max-w-[220px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                    placeholder="50"
                    className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-[15px] font-semibold focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-900 mb-1.5">
                  Number of pets
                </label>
                <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    aria-label="Decrease number of pets"
                    onClick={() => setPets((p) => Math.max(1, p - 1))}
                    disabled={pets <= 1}
                    className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                  >
                    <i className="ri-subtract-line"></i>
                  </button>
                  <span className="w-10 text-center text-[15px] font-bold text-gray-900 select-none">
                    {pets}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase number of pets"
                    onClick={() => setPets((p) => Math.min(5, p + 1))}
                    disabled={pets >= 5}
                    className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                  >
                    <i className="ri-add-line"></i>
                  </button>
                </div>
              </div>
            </div>

            {/* Live result */}
            <div className="rounded-xl bg-white border border-orange-100 p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Estimated 1-year pet rent total
              </p>
              <p className="text-4xl font-bold text-gray-900 leading-none mb-2">
                {money(oneYearTotal)}
              </p>
              <p className="text-[12px] text-gray-500 leading-relaxed">
                That does not include one-time pet fees or deposits.
              </p>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-6">
            <Link
              to={CALCULATOR_PATH}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
            >
              <i className="ri-calculator-line"></i>
              Open full savings calculator
            </Link>
            {showAssessmentCta && (
              <Link
                to={withAttribution("/assessment")}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-stethoscope-line"></i>
                Start ESA Assessment
              </Link>
            )}
          </div>

          {/* Compliance note */}
          <p className="text-[12px] text-gray-500 leading-relaxed mt-4 flex items-start gap-1.5">
            <i className="ri-shield-check-line text-gray-400 mt-0.5 flex-shrink-0"></i>
            <span>
              This is an estimate only. A letter does not guarantee approval, fee waiver, or any
              specific housing outcome.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
