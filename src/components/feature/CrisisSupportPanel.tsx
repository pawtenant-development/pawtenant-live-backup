// Crisis support panel — shown when a customer answers Yes to the safety
// screening question at the start of the ESA / PSD questionnaire. The flow is
// hard-stopped while Yes is selected: no continue button, no checkout, no
// sales copy. Calm, supportive, resource-first.
//
// Shared by:
//   • ESA Step 1 v2 (QuestionRouter) and the legacy long-form Step 1
//   • PSD Step 1 (psd-assessment)

export default function CrisisSupportPanel() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-5 bg-white rounded-2xl border-2 border-rose-200 overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-start gap-3">
        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl flex-shrink-0 ring-1 ring-rose-200">
          <i className="ri-heart-pulse-line text-rose-600 text-lg"></i>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-gray-900 leading-snug">
            Please reach out for support right now
          </h3>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">
            We are not equipped to support emergencies through this online evaluation.
            Free, confidential help is available 24/7.
          </p>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-3">
        <a
          href="tel:988"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 hover:border-rose-300 hover:bg-rose-50/40 transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 flex items-center justify-center bg-rose-100 rounded-lg flex-shrink-0">
            <i className="ri-phone-fill text-rose-600"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">988 Suicide &amp; Crisis Lifeline</p>
            <p className="text-xs text-gray-500 mt-0.5">Call or text 988 — free, confidential, 24/7</p>
          </div>
          <i className="ri-arrow-right-s-line text-gray-400 ml-auto flex-shrink-0"></i>
        </a>

        <a
          href="sms:741741&body=HOME"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 hover:border-rose-300 hover:bg-rose-50/40 transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 flex items-center justify-center bg-rose-100 rounded-lg flex-shrink-0">
            <i className="ri-chat-3-fill text-rose-600"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Crisis Text Line</p>
            <p className="text-xs text-gray-500 mt-0.5">Text HOME to 741741</p>
          </div>
          <i className="ri-arrow-right-s-line text-gray-400 ml-auto flex-shrink-0"></i>
        </a>

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
          <div className="w-9 h-9 flex items-center justify-center bg-rose-100 rounded-lg flex-shrink-0">
            <i className="ri-alarm-warning-fill text-rose-600"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">In immediate danger?</p>
            <p className="text-xs text-gray-500 mt-0.5">Call 911 or go to your nearest emergency room</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed pt-1">
          Selected Yes by mistake? You can change your answer above to continue your evaluation.
          If any part of you is unsure, please talk to someone first — this evaluation will be
          here when you&apos;re ready.
        </p>
      </div>
    </div>
  );
}
