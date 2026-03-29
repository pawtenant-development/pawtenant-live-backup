import { useEffect, useState, useCallback, useRef } from "react";

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

const STEP3_DISCOUNT_CODE = "20PAW";
const STEP3_DISCOUNT_MINS = 10;

function useCountdown(startMins: number, active: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(startMins * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) return;
    setSecondsLeft(startMins * 60);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, startMins]);

  const mins = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const secs = (secondsLeft % 60).toString().padStart(2, "0");
  return { mins, secs, expired: secondsLeft === 0 };
}

export default function ExitIntentOverlay({
  progressPercent,
  currentStep,
  onStay,
  letterType = "esa",
}: ExitIntentOverlayProps) {
  const BENEFITS = letterType === "psd" ? PSD_BENEFITS : ESA_BENEFITS;
  const [visible, setVisible] = useState(false);
  const [hasShown, setHasShown] = useState(() => sessionStorage.getItem("exit_intent_shown") === "true");
  const [leaving, setLeaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const isStep3 = currentStep === 3;
  const { mins, secs, expired } = useCountdown(STEP3_DISCOUNT_MINS, visible && isStep3);

  const show = useCallback(() => {
    if (hasShown) return;
    sessionStorage.setItem("exit_intent_shown", "true");
    setVisible(true);
    setHasShown(true);
  }, [hasShown]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) show();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [show]);

  const handleStay = () => {
    setVisible(false);
    onStay();
  };

  const handleLeave = () => {
    setLeaving(true);
    setTimeout(() => setVisible(false), 300);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(STEP3_DISCOUNT_CODE);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      setCodeCopied(false);
    }
  };

  if (!visible) return null;

  const safeProgress = Math.max(progressPercent, currentStep === 1 ? 5 : progressPercent);

  // ── Step 3 special offer popup ──────────────────────────────────────────────
  if (isStep3) {
    return (
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
        style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      >
        <div className={`bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all duration-300 ${leaving ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}>
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-r from-orange-400 via-red-400 to-orange-500" />

          {/* Urgency header */}
          <div className="bg-gradient-to-br from-orange-500 to-red-500 px-6 py-5 text-center">
            <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 mb-3">
              <i className="ri-alarm-warning-line text-white text-xs animate-pulse"></i>
              <span className="text-xs font-bold text-white tracking-wide uppercase">Exclusive checkout offer</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-1">Hold on! Don&apos;t leave empty-handed</h2>
            <p className="text-sm text-orange-100 leading-relaxed">
              You&apos;re seconds away from getting your {letterType === "psd" ? "PSD letter" : "ESA letter"}. Here&apos;s <strong className="text-white">$20 off</strong> to complete your order right now.
            </p>
          </div>

          <div className="px-6 py-5">
            {/* Countdown timer */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                {expired ? "Offer expired" : "Offer expires in"}
              </p>
              {expired ? (
                <p className="text-sm text-red-500 font-bold">This offer has expired. Start your order to get a new one.</p>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-extrabold text-gray-900 tabular-nums">{mins}</span>
                    <span className="text-xs text-gray-400 font-medium">min</span>
                  </div>
                  <span className="text-2xl font-extrabold text-orange-500 mb-2">:</span>
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-extrabold text-gray-900 tabular-nums">{secs}</span>
                    <span className="text-xs text-gray-400 font-medium">sec</span>
                  </div>
                </div>
              )}
            </div>

            {/* Discount code */}
            {!expired && (
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">Your discount code</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-orange-50 border-2 border-dashed border-orange-300 rounded-xl py-3 px-4 text-center">
                    <span className="text-xl font-extrabold text-orange-600 tracking-widest">{STEP3_DISCOUNT_CODE}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${codeCopied ? "bg-green-500 text-white" : "bg-gray-900 text-white hover:bg-gray-800"}`}
                  >
                    {codeCopied ? (
                      <><i className="ri-checkbox-circle-fill text-sm"></i>Copied!</>
                    ) : (
                      <><i className="ri-file-copy-line text-sm"></i>Copy</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-1.5">Paste this code in the coupon box on checkout — saves you $20</p>
              </div>
            )}

            {/* What you get */}
            <div className="bg-[#f0faf7] border border-green-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <i className="ri-checkbox-circle-fill text-green-600 text-base flex-shrink-0 mt-0.5"></i>
              <p className="text-xs text-gray-700 leading-relaxed">
                Your provider selection and personal details are <strong>saved</strong>. Just paste the code and hit pay — takes under 1 minute.
              </p>
            </div>

            {/* CTAs */}
            <button
              type="button"
              onClick={handleStay}
              className="whitespace-nowrap w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm rounded-xl transition-colors cursor-pointer mb-2.5 flex items-center justify-center gap-2"
            >
              <i className="ri-coupon-3-line text-base"></i>
              Apply Code &amp; Complete My Order →
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="whitespace-nowrap w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              No thanks, I&apos;ll pay full price later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Default exit intent (Steps 1 & 2) ──────────────────────────────────────
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
