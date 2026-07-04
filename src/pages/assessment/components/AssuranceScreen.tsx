// AssuranceScreen — short trust transition shown after email verification and
// before checkout. Reassures the customer without overpromising: no guaranteed
// approval, no registry/certification claims. Just what to expect + privacy.

interface Props {
  accent?: "esa" | "psd";
  letterType: "esa" | "psd";
  onContinue: () => void;
  onBack: () => void;
}

export default function AssuranceScreen({ accent = "esa", letterType, onContinue, onBack }: Props) {
  const orange = accent === "psd";
  const primaryBg = orange ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800" : "bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C]";
  const letter = letterType === "psd" ? "PSD letter" : "ESA letter";

  const points = [
    {
      icon: "ri-user-heart-line",
      title: "Reviewed by a licensed provider",
      body: `Your answers are saved and will be reviewed by a licensed provider. Approval is not automatic — your ${letter} is only issued if clinically appropriate.`,
    },
    {
      icon: "ri-lock-2-line",
      title: "Private &amp; secure",
      body: "Your information is encrypted and confidential. It's used only for your evaluation and never sold.",
    },
    {
      icon: "ri-refund-2-line",
      title: "Refund if you're not approved",
      body: "If a licensed provider determines you don't qualify after review, you're refunded — you're not charged for a letter you can't use.",
    },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto flex items-center justify-center bg-[#E8F1EE] rounded-xl mb-3">
            <i className="ri-shield-check-line text-[#1A5C4F] text-xl"></i>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900">Your evaluation is ready for secure checkout</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Here's what happens after you pay — no surprises.
          </p>
        </div>

        <div className="space-y-3">
          {points.map((p) => (
            <div key={p.title} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3.5">
              <div className="w-9 h-9 flex items-center justify-center bg-white rounded-lg ring-1 ring-gray-200 flex-shrink-0">
                <i className={`${p.icon} text-[#1A5C4F]`}></i>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900" dangerouslySetInnerHTML={{ __html: p.title }} />
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-4 text-white font-bold text-base rounded-xl transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)] ${primaryBg}`}
        >
          Continue to Secure Checkout
          <i className="ri-arrow-right-line"></i>
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full text-xs font-semibold text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1 cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i> Back
        </button>
      </div>
    </div>
  );
}
