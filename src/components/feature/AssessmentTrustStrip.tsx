// Assessment trust strip — ASSESSMENT-PRESENTATION-TRUST-001.
//
// Three truthful, verifiable PawTenant claims, kept deliberately quiet so they
// reassure without competing with the question on screen:
//
//   • HIPAA-Compliant Privacy
//   • State-Licensed Professionals
//   • Money-Back Guarantee
//
// The guarantee is the one that can mislead, so it is not a bare badge: it
// expands to PawTenant's ACTUAL terms and links to /no-risk-guarantee. The
// wording mirrors that page exactly —
//   full refund when a licensed provider determines you don't qualify, and
//   housing-denial claims REVIEWED under the Refund Policy, never automatic.
//
// Forbidden here (and enforced by scripts/check-assessment-presentation.mjs and
// scripts/check-refund-guarantee-parity.mjs): "no questions asked", "every penny
// back", any claim that all landlord denials qualify for a refund, guaranteed or
// instant approval, or "landlords cannot deny".

import { useId, useState } from "react";

const ITEMS = [
  {
    icon: "ri-lock-2-line",
    label: "HIPAA-Compliant Privacy",
    detail: "Your answers are protected health information and are shared only with your assigned licensed provider.",
  },
  {
    icon: "ri-shield-user-line",
    label: "State-Licensed Professionals",
    detail: "Your evaluation is completed by a professional licensed in your state.",
  },
] as const;

interface Props {
  className?: string;
}

export default function AssessmentTrustStrip({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      <ul className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 px-4 py-3">
            <i className={`${item.icon} text-[15px] text-[#1A5C4F] flex-shrink-0`} aria-hidden="true"></i>
            <span className="text-[12px] font-bold leading-tight text-slate-700">{item.label}</span>
          </li>
        ))}
        <li className="px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-2.5 text-left cursor-pointer group"
          >
            <i className="ri-refund-2-line text-[15px] text-[#1A5C4F] flex-shrink-0" aria-hidden="true"></i>
            <span className="text-[12px] font-bold leading-tight text-slate-700 group-hover:text-slate-900">
              Money-Back Guarantee
            </span>
            <i
              className={`ri-arrow-down-s-line ml-auto text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            ></i>
          </button>
        </li>
      </ul>

      {open && (
        <div id={panelId} className="border-t border-slate-100 px-4 py-3.5">
          <p className="text-[12px] leading-relaxed text-slate-600">
            If a licensed professional determines you don&rsquo;t qualify after your evaluation, you
            receive a full refund. If a housing provider denies your letter, you can request a review
            under our Refund Policy — a denial does not automatically qualify for a refund, and
            PawTenant reviews only whether its own guarantee applies.
          </p>
          <a
            href="/no-risk-guarantee"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-[#1A5C4F] hover:underline cursor-pointer"
          >
            Read the full guarantee terms
            <i className="ri-external-link-line text-[11px]" aria-hidden="true"></i>
          </a>
        </div>
      )}
    </div>
  );
}
