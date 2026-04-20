import { useEffect, useState, useCallback, useRef } from "react";

const EXIT_INTENT_KEY = "exit_intent_shown";

interface ExitIntentOverlayProps {
  progressPercent: number;
  currentStep: number;
  onStay: () => void;
  letterType?: "esa" | "psd";
}

const STEP_LABELS: Record<number, string> = {
  1: "your health assessment",
  2: "your personal information",
  3: "your checkout",
};

const ESA_BENEFITS = [
  { icon: "ri-shield-check-line", text: "Licensed, HIPAA-compliant ESA letter" },
  { icon: "ri-home-heart-line", text: "Legally protects your right to live with your pet" },
  { icon: "ri-timer-flash-line", text: "Delivered in as little as 24 hours" },
  { icon: "ri-refund-2-line", text: "100% money-back guarantee" },
];

const PSD_BENEFITS = [
  { icon: "ri-shield-check-line", text: "Licensed, HIPAA-compliant PSD letter" },
  { icon: "ri-service-line", text: "ADA-compliant — works with airlines & public access" },
  { icon: "ri-timer-flash-line", text: "Delivered in as little as 24 hours" },
  { icon: "ri-refund-2-line", text: "100% money-back guarantee" },
];

export default function ExitIntentOverlay({
  progressPercent,
  currentStep,
  onStay,
  letterType = "esa",
}: ExitIntentOverlayProps) {
  const BENEFITS = letterType === "psd" ? PSD_BENEFITS : ESA_BENEFITS;
  const [visible, setVisible] = useState(false);
  const hasShownRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  const show = useCallback(() => {
    if (hasShownRef.current) return;
    if (sessionStorage.getItem(EXIT_INTENT_KEY) === "true") return;
    hasShownRef.current = true;
    sessionStorage.setItem(EXIT_INTENT_KEY, "true");
    setVisible(true);
  }, []);

  useEffect(() => {
    // Only arm on Step 1 and Step 2 — Step 3 has its own coupon popup
    if (currentStep >= 3) return;

    const handleHidden = () => {
      if (document.hidden) show();
    };

    document.addEventListener("visibilitychange", handleHidden);
    return () => {
      document.removeEventListener("visibilitychange", handleHidden);
    };
  }, [show, currentStep]);

  const handleStay = () => {
    setVisible(false);
    hasShownRef.current = false;
    onStay();
  };

  const handleLeave = () => {
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      hasShownRef.current = false;
    }, 300);
  };

  if (!visible) return null;

  const safeProgress = Math.max(progressPercent, currentStep === 1 ? 5 : progressPercent);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all duration-300 ${leaving ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}>
        <div className="h-1.5 bg-gradient-to-r from-orange-400 to-amber-400" />

        <div className="bg-gradient-to-br from-orange-50 to-amber-50 px-6 py-6 text-center border-b border-orange-100">
          <div className="relative w-24 h-24 mx-auto mb-4">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="#fed7aa" strokeWidth="8" />
              <circle
                cx="48" cy="48" r="40" fill="none" stroke="#f97316" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - safeProgress / 100)}`}
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-orange-500">{safeProgress}%</span>
              <span className="text-xs text-gray-500 font-medium">done</span>
            </div>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-1">Wait — you&apos;re {safeProgress}% done!</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            You&apos;ve already completed {STEP_LABELS[currentStep] ?? "part of the process"}.
            {currentStep < 3 && " Just a couple more minutes to go."}
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Don&apos;t lose your progress — you were about to get:
          </p>
          <div className="grid grid-cols-1 gap-2.5 mb-5">
            {BENEFITS.map((b) => (
              <div key={b.text} className="flex items-center gap-3">
                <div className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 flex-shrink-0">
                  <i className={`${b.icon} text-orange-500 text-sm`}></i>
                </div>
                <span className="text-sm text-gray-700">{b.text}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-5">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-time-line text-amber-500 text-sm"></i>
            </div>
            <p className="text-xs text-amber-700 font-medium">Your answers are saved — you won&apos;t have to start over.</p>
          </div>
          <button
            type="button"
            onClick={handleStay}
            className="whitespace-nowrap w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm rounded-xl transition-colors cursor-pointer mb-2.5"
          >
            Continue My Application →
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="whitespace-nowrap w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            No thanks, I&apos;ll come back later
          </button>
        </div>
      </div>
    </div>
  );
}
