// ProviderOnboardingGuide — first-login walkthrough modal for the Provider
// Portal. Shown once to active, non-admin providers (gated by
// doctor_profiles.provider_onboarding_seen_at) and reopenable any time from
// the profile dropdown ("View Portal Guide"). Every dismissal path calls
// onDismiss so the guide never blocks the portal and never re-appears
// automatically. Wording: "Provider" / "Licensed Provider" only.
interface ProviderOnboardingGuideProps {
  providerFirstName: string;
  /** Marks the guide as seen (RPC + localStorage fallback) and closes it. */
  onDismiss: () => void;
}

const STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: "ri-folder-open-line",
    title: "Open Cases",
    body: "Go to My Cases to see orders waiting for your review. New assignments are highlighted and you'll also get an email.",
  },
  {
    icon: "ri-file-list-3-line",
    title: "Review the Assessment",
    body: "Open the case and review the customer's assessment answers, state, letter type (ESA or PSD), and order details.",
  },
  {
    icon: "ri-draft-line",
    title: "Prepare the Letter",
    body: "Use the assessment information and PawTenant requirements to prepare the ESA/PSD documentation when appropriate.",
  },
  {
    icon: "ri-upload-2-line",
    title: "Upload the Letter",
    body: "Upload the completed letter PDF/document inside the case.",
  },
  {
    icon: "ri-send-plane-line",
    title: "Submit",
    body: "Click Submit so the admin and customer flow can continue.",
  },
  {
    icon: "ri-loop-left-line",
    title: "Corrections",
    body: "If admin requests a correction, reopen the case, update the document, and resubmit.",
  },
];

export default function ProviderOnboardingGuide({ providerFirstName, onDismiss }: ProviderOnboardingGuideProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#2c5282] px-6 py-5 flex-shrink-0 relative">
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white/70 hover:text-white cursor-pointer transition-colors"
            title="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 flex items-center justify-center bg-white/15 rounded-xl flex-shrink-0">
              <i className="ri-stethoscope-line text-white text-base"></i>
            </div>
            <span className="text-[10px] font-extrabold text-white/70 uppercase tracking-widest">Licensed Provider Guide</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white leading-snug">
            Welcome to your PawTenant Provider Portal{providerFirstName ? `, ${providerFirstName}` : ""}
          </h2>
          <p className="text-xs sm:text-sm text-white/75 mt-1">
            Here&apos;s how to complete assigned cases quickly and correctly.
          </p>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          <div className="space-y-1">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-start gap-3 py-2.5">
                {/* Number + connector */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-9 h-9 flex items-center justify-center bg-[#e8f0f9] rounded-xl">
                    <i className={`${step.icon} text-[#2c5282] text-base`}></i>
                  </div>
                  {i < STEPS.length - 1 && <div className="w-px flex-1 min-h-[10px] bg-[#b8cce4] mt-1.5"></div>}
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center bg-[#2c5282] text-white text-[9px] font-extrabold rounded-full flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm font-extrabold text-gray-900">{step.title}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mt-1">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 bg-[#f8fdfc] border border-[#b8cce4]/60 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <i className="ri-lightbulb-line text-[#2c5282] text-sm flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-gray-600 leading-relaxed">
              You can reopen this guide any time from your profile menu (top right) → <strong>View Portal Guide</strong>.
            </p>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onDismiss}
            className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2c5282] text-white text-sm font-extrabold rounded-xl hover:bg-[#234a76] cursor-pointer transition-colors"
          >
            <i className="ri-folder-open-line"></i>Start reviewing cases
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 cursor-pointer transition-colors"
          >
            Got it, don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
