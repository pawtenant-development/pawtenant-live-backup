/**
 * ReassuranceStrip — Phase 2 calm reassurance section.
 *
 * Sits directly below the homepage hero. Four short pillars that absorb the
 * questions a hesitant landing-page visitor asks before they tap the CTA:
 *
 *   1. What if I don't qualify? → Full Refund
 *   2. Who's reviewing my case?  → Licensed clinician
 *   3. Is the letter legitimate? → FHA-aligned documentation
 *   4. Is my info safe?          → Secure & private intake
 *
 * Compliance guardrails:
 *   - No "guaranteed approval", "guaranteed letter", or "legal advice".
 *   - "FHA standards in mind" — not "FHA-guaranteed-compliant".
 *   - No medical claims. No outcome promises.
 *
 * Mobile: 2x2 grid of compact pillars (so the section finishes in roughly
 * one extra scroll past the hero). Desktop: single 4-up row. No icons in
 * heavy boxes — small inline tint circles keep the look calm and scannable.
 */

const PILLARS = [
  {
    icon: "ri-shield-check-line",
    title: "Full Refund",
    body: "If you don't qualify after review, your payment is refunded.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Clinician Review",
    body: "Every case is reviewed by a Licensed Mental Health Practitioner in your state.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Built for Housing",
    body: "Documentation prepared with Fair Housing Act standards in mind.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Secure & Private",
    body: "Your intake is encrypted in transit and kept confidential.",
  },
];

export default function ReassuranceStrip() {
  return (
    <section
      aria-label="Reassurance"
      className="bg-[#f8fafc] border-b border-slate-200"
    >
      <div className="max-w-6xl mx-auto px-5 py-10 sm:py-12">
        <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4 sm:gap-7">
          {PILLARS.map((p) => (
            <li key={p.title} className="flex flex-col items-start">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span
                  aria-hidden
                  className="w-7 h-7 rounded-full bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0"
                >
                  <i className={`${p.icon} text-base`} />
                </span>
                <h3 className="text-[13.5px] sm:text-sm font-bold text-slate-900 leading-tight">
                  {p.title}
                </h3>
              </div>
              <p className="text-[12.5px] sm:text-[13px] text-slate-600 leading-snug">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
