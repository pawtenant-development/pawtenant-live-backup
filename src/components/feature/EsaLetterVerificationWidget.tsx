/**
 * EsaLetterVerificationWidget.tsx
 *
 * LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
 *
 * The ONE reusable letter-verification entry point for public marketing pages.
 *
 * It does NOT verify anything itself and it NEVER renders a result. It collects
 * a Verification ID, applies the same normalisation as the canonical /verify
 * entry page (trim, uppercase, strip internal whitespace), and hands off to
 * /verify/<id> — the existing, approved result screen that performs the real
 * lookup. There is exactly one verification implementation on the site and this
 * component is a door to it, not a second copy of it.
 *
 * Consequences of that design, all deliberate:
 *   - no fabricated / optimistic / cached success states
 *   - no privacy surface: this component never receives letter or patient data
 *   - the result screen's existing privacy rules apply unchanged
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

export interface EsaLetterVerificationWidgetProps {
  heading?: string;
  copy?: string;
  /** Section background override. */
  className?: string;
  /** "section" = full band; "card" = bare card for embedding in a grid. */
  variant?: "section" | "card";
  id?: string;
}

/** Same normalisation the canonical /verify entry page applies. */
function normalizeId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export default function EsaLetterVerificationWidget({
  heading = "Verify an ESA letter",
  copy = "Landlords, property managers and tenants can confirm a PawTenant letter is genuine. Enter the Verification ID printed on the document.",
  className,
  variant = "section",
  id = "verify-letter",
}: EsaLetterVerificationWidgetProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeId(input);
    if (!cleaned) {
      setError("Please enter a Verification ID.");
      return;
    }
    setError("");
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  const form = (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-xl mx-auto">
      <label htmlFor="pt-verify-id" className="sr-only">
        Letter Verification ID
      </label>
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <i
            className="ri-shield-check-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          ></i>
          <input
            id="pt-verify-id"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError("");
            }}
            placeholder="e.g. PT-XXXXXXXX"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "pt-verify-error" : undefined}
            className="w-full pl-10 pr-3.5 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-[15px] font-semibold tracking-wide uppercase placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
          />
        </div>
        <button
          type="submit"
          className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold text-sm rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
        >
          Verify Letter
          <i className="ri-arrow-right-line" aria-hidden="true"></i>
        </button>
      </div>

      {error && (
        <p id="pt-verify-error" role="alert" className="text-red-600 text-[13px] font-semibold mt-2.5">
          {error}
        </p>
      )}

      <p className="text-[12px] text-gray-500 leading-relaxed mt-3">
        Verification confirms only that the document is genuine and who issued it. No diagnosis or
        health information is ever shown.
      </p>
    </form>
  );

  if (variant === "card") {
    return (
      <div id={id} className={`rounded-2xl border border-gray-200 bg-white p-6 ${className || ""}`}>
        <h3 className="text-lg font-bold text-gray-900 mb-1.5 text-center">{heading}</h3>
        <p className="text-gray-500 text-[13px] leading-relaxed mb-5 text-center max-w-xl mx-auto">
          {copy}
        </p>
        {form}
      </div>
    );
  }

  return (
    <section id={id} className={`py-12 sm:py-16 ${className || "bg-[#FFF7ED]"}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6 text-center">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3">
          <i className="ri-verified-badge-line" aria-hidden="true"></i>
          Letter verification
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">{heading}</h2>
        <p className="text-gray-600 text-sm leading-relaxed max-w-xl mx-auto mb-7">{copy}</p>
        {form}
      </div>
    </section>
  );
}
