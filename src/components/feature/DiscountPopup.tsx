import { useState, useEffect, useRef, useCallback } from "react";

const POPUP_KEY = "pt_discount_popup_shown";
const POPUP_LAST_SHOWN_KEY = "pt_discount_popup_last_shown";
const POPUP_SESSION_ID_KEY = "pt_discount_popup_session_id";
const MIN_MINUTES_BETWEEN_SHOWS = 5;
const MAX_MINUTES_BETWEEN_SHOWS = 15;
const COUNTDOWN_SECONDS = 10 * 60;

function getRandomMinutes(): number {
  return Math.floor(Math.random() * (MAX_MINUTES_BETWEEN_SHOWS - MIN_MINUTES_BETWEEN_SHOWS + 1)) + MIN_MINUTES_BETWEEN_SHOWS;
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(POPUP_SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(POPUP_SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

interface DiscountPopupProps {
  delayMs?: number;
}

export default function DiscountPopup({ delayMs = 7000 }: DiscountPopupProps) {
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shown = useRef(false);
  const reShowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldShow = useCallback((): boolean => {
    const sessionId = getSessionId();
    const storedSessionId = sessionStorage.getItem(POPUP_SESSION_ID_KEY + "_shown_in");
    const lastShown = parseInt(sessionStorage.getItem(POPUP_LAST_SHOWN_KEY) ?? "0", 10);
    const now = Date.now();

    // If this is a new session (different session ID), allow showing
    if (storedSessionId !== sessionId) {
      return true;
    }

    // Check if enough time has passed (5-15 minutes)
    const minutesSinceLastShow = (now - lastShown) / (1000 * 60);
    return minutesSinceLastShow >= MIN_MINUTES_BETWEEN_SHOWS;
  }, []);

  const scheduleReShow = useCallback(() => {
    if (reShowTimeoutRef.current) {
      clearTimeout(reShowTimeoutRef.current);
    }
    const randomMinutes = getRandomMinutes();
    reShowTimeoutRef.current = setTimeout(() => {
      shown.current = false;
      showPopup();
    }, randomMinutes * 60 * 1000);
  }, []);

  const showPopup = useCallback(() => {
    if (shown.current || !shouldShow()) {
      // If we can't show now, schedule for later
      if (!shouldShow()) {
        scheduleReShow();
      }
      return;
    }
    shown.current = true;
    const sessionId = getSessionId();
    sessionStorage.setItem(POPUP_SESSION_ID_KEY + "_shown_in", sessionId);
    sessionStorage.setItem(POPUP_LAST_SHOWN_KEY, String(Date.now()));
    setVisible(true);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [shouldShow, scheduleReShow]);

  useEffect(() => {
    const timeout = setTimeout(showPopup, delayMs);
    return () => {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
      if (reShowTimeoutRef.current) clearTimeout(reShowTimeoutRef.current);
    };
  }, [delayMs, showPopup]);

  const handleDismiss = () => {
    setVisible(false);
    if (timerRef.current) clearInterval(timerRef.current);
    // Schedule re-show after random 5-15 minutes
    scheduleReShow();
  };

  const handleReveal = () => {
    setRevealed(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("20PAW").then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setVisible(false);
      }, 1800);
    });
  };

  if (!visible) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
      onClick={handleDismiss}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card — stacks vertically on mobile, side-by-side on sm+ */}
      <div
        className="relative bg-white rounded-2xl overflow-hidden max-w-2xl w-full flex flex-col sm:flex-row animate-[fadeInUp_0.35s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="whitespace-nowrap absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-gray-100 cursor-pointer z-20 transition-colors shadow-sm"
        >
          <i className="ri-close-line text-gray-600 text-lg"></i>
        </button>

        {/* LEFT — Dog image (hidden on mobile, visible on sm+) */}
        <div className="relative hidden sm:block sm:w-[44%] flex-shrink-0 min-h-[360px]">
          <img
            src="https://readdy.ai/api/search-image?query=happy%20golden%20retriever%20dog%20sitting%20outdoors%20with%20bright%20smile%20tongue%20out%20warm%20golden%20sunlight%20bokeh%20background%20beautiful%20fluffy%20coat%20cheerful%20joyful%20expression%20natural%20outdoor%20setting%20green%20blurred%20background&width=480&height=540&seq=disc-popup-dog-landscape-2&orientation=portrait"
            alt="Happy dog"
            className="w-full h-full object-cover object-center absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/30" />
          <div className="absolute top-4 left-4">
            <span className="bg-orange-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-widest shadow">
              Exclusive Offer
            </span>
          </div>
        </div>

        {/* RIGHT — Content */}
        <div className="flex-1 px-5 pt-5 pb-6 sm:px-7 sm:py-7 flex flex-col justify-center">
          {/* Mobile-only badge */}
          <div className="sm:hidden mb-3">
            <span className="bg-orange-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-widest shadow">
              Exclusive Offer
            </span>
          </div>

          <div className="mb-4 pr-6">
            <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight mb-1">
              Get <span className="text-orange-500">$20 Off</span><br />Your ESA Letter
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              A special discount just for you. Click below to reveal your exclusive promo code.
            </p>
          </div>

          {/* Code reveal area */}
          <div className="mb-4">
            {!revealed ? (
              <button
                type="button"
                onClick={handleReveal}
                className="whitespace-nowrap w-full py-3.5 rounded-xl font-extrabold text-sm bg-orange-500 hover:bg-orange-600 text-white transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-gift-2-line"></i>
                </div>
                Tap to Reveal Your Code
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-orange-50 border-2 border-dashed border-orange-300 rounded-xl px-5 py-3.5 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Your Promo Code</p>
                  <p className="text-3xl font-extrabold text-orange-600 tracking-[0.25em]">20PAW</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`whitespace-nowrap w-full py-3 rounded-xl font-extrabold text-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-orange-500 hover:bg-orange-600 text-white"
                  }`}
                >
                  {copied ? (
                    <>
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-checkbox-circle-fill"></i>
                      </div>
                      Copied — Apply at Checkout!
                    </>
                  ) : (
                    <>
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-clipboard-line"></i>
                      </div>
                      Copy Code &amp; Save $20
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className="ri-timer-2-line text-orange-500 text-sm"></i>
            </div>
            <span className="text-xs text-gray-500 font-medium">Offer expires in</span>
            <div className="flex items-center gap-1">
              <span className="bg-gray-900 text-white text-sm font-extrabold px-2.5 py-1 rounded-md font-mono">
                {pad(minutes)}
              </span>
              <span className="text-gray-500 font-bold text-sm">:</span>
              <span className="bg-gray-900 text-white text-sm font-extrabold px-2.5 py-1 rounded-md font-mono">
                {pad(seconds)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors text-left"
          >
            No thanks, I&apos;ll pay full price
          </button>
        </div>
      </div>
    </div>
  );
}
