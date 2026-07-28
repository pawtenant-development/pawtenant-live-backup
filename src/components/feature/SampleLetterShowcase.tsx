/**
 * SampleLetterShowcase.tsx
 *
 * LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
 *
 * Large, readable presentation of the canonical sample letter, replacing the
 * tiny thumbnails previously rendered on /esa-letter-for-landlord and
 * /esa-letter-verification.
 *
 * The asset itself was never the problem: /images/checkout/esa-sample-letter.svg
 * is vector (800x1035) and scales losslessly to any size. The defect was that
 * callers rendered it inside a narrow column. This component gives it a real
 * column, a caption explaining which fields to expect, and click-to-enlarge.
 *
 * It wraps SampleLetterCard rather than re-implementing it, so there is still
 * exactly one sample-letter asset reference on the marketing site.
 *
 * COMPLIANCE: the artwork is a redacted specimen with placeholder names. No
 * provider credential, license number, NPI or verification ID shown anywhere in
 * this component is presented as belonging to a real person or a real letter.
 */

import { useEffect, useState } from "react";
import SampleLetterCard from "./SampleLetterCard";

/** Fields a real PawTenant letter carries. Descriptive, not a guarantee. */
const DEFAULT_FIELDS: string[] = [
  "Issuing provider's name, credential and license state",
  "The provider's signature and the date of issue",
  "A unique letter verification ID a landlord can check",
  "A statement of the need for the animal — never your diagnosis",
];

export interface SampleLetterShowcaseProps {
  heading?: string;
  copy?: string;
  /** Bullet list under the caption. Pass [] to hide. */
  fields?: string[];
  /** Section background override. */
  className?: string;
  id?: string;
}

export default function SampleLetterShowcase({
  heading = "What your letter looks like",
  copy = "This is a redacted specimen — every name and detail on it is a placeholder. Your letter follows the same format.",
  fields = DEFAULT_FIELDS,
  className,
  id = "sample-letter",
}: SampleLetterShowcaseProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape and lock background scroll while the lightbox is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <section id={id} className={`py-12 sm:py-16 ${className || "bg-[#FAFAF9]"}`}>
      <div className="max-w-5xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-8 sm:mb-10">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3">
            <i className="ri-file-text-line" aria-hidden="true"></i>
            Sample document
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{heading}</h2>
          <p className="text-gray-500 text-sm mt-3 max-w-2xl mx-auto leading-relaxed">{copy}</p>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-8 md:gap-10 items-start">
          {/* The letter — real column width, click to enlarge. */}
          <div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Enlarge the sample ESA letter"
              className="group relative block w-full max-w-[520px] mx-auto cursor-zoom-in rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
            >
              <SampleLetterCard />
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 shadow-sm opacity-90 group-hover:opacity-100 transition-opacity">
                <i className="ri-zoom-in-line" aria-hidden="true"></i>
                Click to enlarge
              </span>
            </button>
          </div>

          {/* Caption / field guide. */}
          <div className="md:pt-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">What to expect on the document</h3>
            <ul className="space-y-3">
              {fields.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-gray-700 leading-relaxed">
                  <i
                    className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"
                    aria-hidden="true"
                  ></i>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-gray-500 leading-relaxed mt-5">
              Sample shown for illustration. The names, dates and identifiers on it are placeholders
              and do not correspond to a real person, provider or issued letter.
            </p>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sample ESA letter, enlarged"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-8 overflow-y-auto"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close enlarged sample letter"
            className="fixed top-4 right-4 z-10 w-10 h-10 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl" aria-hidden="true"></i>
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[820px] my-auto"
          >
            <SampleLetterCard eager showSampleBadge={false} />
          </div>
        </div>
      )}
    </section>
  );
}
