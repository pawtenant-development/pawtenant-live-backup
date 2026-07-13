// AssuranceScreen — short trust transition shown after email verification and
// before checkout. Reassures the customer without overpromising: no guaranteed
// approval, no registry/certification claims. Just what to expect + privacy.
//
// Layout (RA-LATE-UPLOAD-...): compact so BOTH actions — "Continue Booking" and
// "View My Customer Portal" — are visible without scrolling at small viewports.
// Desktop only, two warm decorative pet photos fill the empty side gutters.

interface Props {
  accent?: "esa" | "psd";
  letterType: "esa" | "psd";
  onContinue: () => void;
  onBack: () => void;
  /** Secondary action → the customer's authenticated portal for this saved order.
   *  When omitted, only the primary "Continue Booking" action is shown. */
  onViewPortal?: () => void;
}

export default function AssuranceScreen({ accent = "esa", letterType, onContinue, onBack, onViewPortal }: Props) {
  const orange = accent === "psd";
  const primaryBg = orange ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800" : "bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C]";
  const letter = letterType === "psd" ? "PSD letter" : "ESA letter";

  const points = [
    {
      icon: "ri-user-heart-line",
      title: "Reviewed by a licensed provider",
      body: `Your answers are saved and reviewed by a licensed provider. Approval is not automatic — your ${letter} is only issued if clinically appropriate.`,
    },
    {
      icon: "ri-lock-2-line",
      title: "Private &amp; secure",
      body: "Your information is encrypted and confidential — used only for your evaluation and never sold.",
    },
    {
      icon: "ri-refund-2-line",
      title: "Refund if you're not approved",
      body: "If a licensed provider determines you don't qualify, you're refunded — never charged for a letter you can't use.",
    },
  ];

  return (
    <div className="relative max-w-lg lg:max-w-[976px] mx-auto">
      {/* Desktop-only decorative pets in the side gutters (hidden on mobile/tablet). */}
      <div aria-hidden="true" className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-[clamp(200px,15vw,208px)] pointer-events-none select-none">
        <picture>
          <source srcSet="/assets/lifestyle/esa-cat-relaxing-home-tall.webp" type="image/webp" />
          <img src="/assets/lifestyle/esa-cat-relaxing-home.jpg" alt="" width={900} height={1200} loading="lazy" decoding="async"
            className="w-[clamp(200px,15vw,208px)] h-[clamp(335px,25vw,348px)] object-cover object-top rounded-2xl shadow-sm border border-gray-100 opacity-95" />
        </picture>
      </div>
      <div aria-hidden="true" className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[clamp(200px,15vw,208px)] pointer-events-none select-none">
        <picture>
          <source srcSet="/assets/lifestyle/esa-owner-hugging-dog-home.webp" type="image/webp" />
          <img src="/assets/lifestyle/esa-owner-hugging-dog-home.jpg" alt="" width={1200} height={800} loading="lazy" decoding="async"
            className="w-[clamp(200px,15vw,208px)] h-[clamp(335px,25vw,348px)] object-cover object-center rounded-2xl shadow-sm border border-gray-100 opacity-95" />
        </picture>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-7">
          <div className="text-center mb-4">
            <div className="w-11 h-11 mx-auto flex items-center justify-center bg-[#E8F1EE] rounded-xl mb-2">
              <i className="ri-shield-check-line text-[#1A5C4F] text-xl"></i>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900">Your evaluation is ready for secure checkout</h2>
            <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">Here&apos;s what happens after you pay — no surprises.</p>
          </div>

          <div className="space-y-2 sm:space-y-2.5">
            {points.map((p) => (
              <div key={p.title} className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg ring-1 ring-gray-200 flex-shrink-0">
                  <i className={`${p.icon} text-[#1A5C4F]`}></i>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-900" dangerouslySetInnerHTML={{ __html: p.title }} />
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Both choices grouped tightly so they stay above the fold on short
              screens: primary booking action, then the saved-order portal. */}
          <button
            type="button"
            onClick={onContinue}
            className={`mt-4 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-white font-bold text-base rounded-xl transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)] ${primaryBg}`}
          >
            Continue Booking
            <i className="ri-arrow-right-line"></i>
          </button>

          {onViewPortal && (
            <>
              <div className="my-2.5 flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100"></div>
                <span className="text-[11px] text-gray-400 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-100"></div>
              </div>
              <button
                type="button"
                onClick={onViewPortal}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 font-bold text-sm rounded-xl border border-[#e2e8f0] bg-white text-[#1e3a5f] hover:bg-[#f8fafc] transition-colors cursor-pointer"
              >
                <i className="ri-dashboard-3-line"></i>View My Customer Portal
              </button>
            </>
          )}

          <p className="text-[11px] text-gray-400 text-center mt-2">
            Your assessment is saved — choose your package now or return from your portal anytime.
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-3 w-full text-xs font-semibold text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1 cursor-pointer"
          >
            <i className="ri-arrow-left-line"></i> Back
          </button>
        </div>
      </div>
    </div>
  );
}
