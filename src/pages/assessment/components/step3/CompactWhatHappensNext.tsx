// Calm 4-step "what happens after payment" summary.
//
// Mounted near the payment area in Step 3 (right column, after the Stripe
// payment surface) so users see the post-pay journey before deciding.
// No icons fire any action; this is purely informational JSX. Tone:
// licensed-provider language, no urgency, no fake urgency markers.

const BRAND_GREEN = "#1A5C4F";
const BRAND_GREEN_SOFT = "#E8F1EE";

const STEPS = [
  {
    icon: "ri-stethoscope-line",
    title: "Licensed provider reviews your assessment",
  },
  {
    icon: "ri-file-check-line",
    title: "Your evaluation is completed",
  },
  {
    icon: "ri-mail-check-line",
    title: "Your letter is issued if you qualify",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Support is available if your landlord has questions",
  },
];

export default function CompactWhatHappensNext() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03),0_8px_28px_-14px_rgba(15,23,42,0.12)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <div
          className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: BRAND_GREEN_SOFT }}
        >
          <i className="ri-route-line text-sm" style={{ color: BRAND_GREEN }}></i>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 leading-none">
            After Payment
          </p>
          <p className="text-sm font-bold text-slate-900 tracking-tight mt-1 leading-none">
            What Happens Next
          </p>
        </div>
      </div>
      <ol className="px-5 py-4 space-y-2.5">
        {STEPS.map((step, idx) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center mt-0.5"
              style={{ backgroundColor: BRAND_GREEN_SOFT, color: BRAND_GREEN }}
            >
              {idx + 1}
            </span>
            <div className="flex items-start gap-2 min-w-0">
              <i
                className={`${step.icon} text-sm flex-shrink-0 mt-0.5`}
                style={{ color: BRAND_GREEN }}
              ></i>
              <span className="text-xs text-slate-700 leading-relaxed">
                {step.title}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
