import { useState, useEffect } from "react";

interface AssessmentSupportWidgetProps {
  currentStep: number;
}

export default function AssessmentSupportWidget({ currentStep }: AssessmentSupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  // Fade in after a short delay so it doesn't compete with the initial render
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Show a pulsing nudge on step 3 (checkout) where drop-off is highest
  const isCheckout = currentStep === 3;

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 right-5 z-50 flex flex-col items-end gap-2">
      {/* Expanded support panel */}
      {open && (
        <div className="w-72 bg-white rounded-2xl border border-gray-200 overflow-hidden mb-1 animate-fade-in"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
          {/* Header */}
          <div className="bg-[#1A5C4F] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-full flex-shrink-0">
                <i className="ri-customer-service-2-line text-white text-base"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-white leading-tight">We're here to help</p>
                <p className="text-xs text-white/80">Usually reply in a few minutes</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-base"></i>
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-2.5">
            {isCheckout && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-1">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <i className="ri-shield-check-line text-amber-500"></i>
                  Having trouble checking out?
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Our team can complete your order over the phone — no card required online.
                </p>
              </div>
            )}

            {/* Phone */}
            <a
              href="tel:+14099655885"
              className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-[#CFE2DC] hover:bg-[#E8F1EE] transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 flex items-center justify-center bg-[#E8F1EE] rounded-full flex-shrink-0 group-hover:bg-[#CFE2DC] transition-colors">
                <i className="ri-phone-line text-[#1A5C4F] text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">Call Us</p>
                <p className="text-sm font-extrabold text-[#1A5C4F]">409-965-5885</p>
                <p className="text-xs text-gray-400">Mon–Sat, 9am–7pm CT</p>
              </div>
              <div className="w-5 h-5 flex items-center justify-center text-gray-300 ml-auto flex-shrink-0">
                <i className="ri-arrow-right-s-line text-base"></i>
              </div>
            </a>

            {/* Email */}
            <a
              href="mailto:support@pawtenant.com"
              className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-[#CFE2DC] hover:bg-[#E8F1EE] transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 flex items-center justify-center bg-[#E8F1EE] rounded-full flex-shrink-0 group-hover:bg-[#CFE2DC] transition-colors">
                <i className="ri-mail-line text-[#1A5C4F] text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">Email Support</p>
                <p className="text-xs text-gray-500">support@pawtenant.com</p>
                <p className="text-xs text-gray-400">We reply within 2 hours</p>
              </div>
              <div className="w-5 h-5 flex items-center justify-center text-gray-300 ml-auto flex-shrink-0">
                <i className="ri-arrow-right-s-line text-base"></i>
              </div>
            </a>

            {/* FAQ link */}
            <a
              href="/faqs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-[#CFE2DC] hover:bg-[#E8F1EE] transition-all cursor-pointer group"
            >
              <div className="w-9 h-9 flex items-center justify-center bg-[#E8F1EE] rounded-full flex-shrink-0 group-hover:bg-[#CFE2DC] transition-colors">
                <i className="ri-question-line text-[#1A5C4F] text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">Browse FAQs</p>
                <p className="text-xs text-gray-400">Quick answers to common questions</p>
              </div>
              <div className="w-5 h-5 flex items-center justify-center text-gray-300 ml-auto flex-shrink-0">
                <i className="ri-external-link-line text-sm"></i>
              </div>
            </a>
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 pt-1">
            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <i className="ri-shield-check-line text-green-400"></i>
              100% Money-Back Guarantee · HIPAA Secure
            </p>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`whitespace-nowrap relative flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm text-white transition-all duration-200 cursor-pointer ${
          open
            ? "bg-gray-700 hover:bg-gray-800"
            : "bg-[#1A5C4F] hover:bg-[#14493E]"
        }`}
        style={{ boxShadow: "0 4px 18px rgba(26,92,79,0.35)" }}
        aria-label="Contact support"
      >
        {/* Pulse ring — only on checkout step when closed */}
        {isCheckout && !open && (
          <span className="absolute inset-0 rounded-full animate-ping bg-[#1A5C4F] opacity-25" />
        )}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 relative z-10">
          <i className={open ? "ri-close-line text-base" : "ri-customer-service-2-line text-base"}></i>
        </div>
        <span className="relative z-10">{open ? "Close" : "Need Help?"}</span>
      </button>
    </div>
  );
}
