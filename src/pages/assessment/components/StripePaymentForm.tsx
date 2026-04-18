import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  StripeCardNumberElementChangeEvent,
  StripeCardExpiryElementChangeEvent,
  StripeCardCvcElementChangeEvent,
} from "@stripe/stripe-js";
import PolicyModal from "./PolicyModal";

// ─── Card element style ───────────────────────────────────────────────────────
const CARD_INPUT_OPTIONS = {
  style: {
    base: {
      fontSize: "14px",
      fontFamily: "inherit",
      color: "#1f2937",
      "::placeholder": { color: "#9ca3af" },
      lineHeight: "1.5",
    },
    invalid: { color: "#ef4444" },
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripePaymentFormProps {
  clientSecret?: string;
  amount: number;
  returnUrl?: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  onBeforeSubmit?: () => boolean;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  agreedError: boolean;
  setAgreedError: (v: boolean) => void;
  couponSlot?: React.ReactNode;
}

// ─── Processing Overlay ───────────────────────────────────────────────────────

function ProcessingOverlay() {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center gap-4 shadow-2xl">
        <div className="w-12 h-12 border-4 border-gray-100 border-t-orange-400 rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-700">Processing Payment...</p>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
  onBeforeSubmit,
  agreed,
  setAgreed,
  agreedError,
  setAgreedError,
  couponSlot,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  // Per-field state: error message + complete flag
  const [fieldState, setFieldState] = useState({
    number:  { error: "",  complete: false, touched: false },
    expiry:  { error: "",  complete: false, touched: false },
    cvc:     { error: "",  complete: false, touched: false },
  });

  // Top-level payment error (from stripe.confirmCardPayment)
  const [paymentError, setPaymentError] = useState("");

  const [processing, setProcessing] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);

  // Ref to scroll error into view
  const errorRef = useRef<HTMLDivElement>(null);

  // ── Field change handlers ─────────────────────────────────────────────────

  const handleNumberChange = (e: StripeCardNumberElementChangeEvent) => {
    setCardBrand(e.brand || null);
    setPaymentError(""); // clear top-level error on any change
    setFieldState((prev) => ({
      ...prev,
      number: {
        error: e.error?.message ?? "",
        complete: e.complete,
        touched: true,
      },
    }));
  };

  const handleExpiryChange = (e: StripeCardExpiryElementChangeEvent) => {
    setPaymentError("");
    setFieldState((prev) => ({
      ...prev,
      expiry: {
        error: e.error?.message ?? "",
        complete: e.complete,
        touched: true,
      },
    }));
  };

  const handleCvcChange = (e: StripeCardCvcElementChangeEvent) => {
    setPaymentError("");
    setFieldState((prev) => ({
      ...prev,
      cvc: {
        error: e.error?.message ?? "",
        complete: e.complete,
        touched: true,
      },
    }));
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handlePay = async () => {
    setSubmitAttempted(true);
    setPaymentError("");

    // Validate terms agreement
    if (!agreed) {
      setAgreedError(true);
    }

    // Validate all card fields are complete
    const allComplete =
      fieldState.number.complete &&
      fieldState.expiry.complete &&
      fieldState.cvc.complete;

    if (!allComplete || !agreed) {
      // Scroll to error area
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }

    if (onBeforeSubmit && !onBeforeSubmit()) return;

    if (!stripe || !elements) {
      setPaymentError("Payment system not ready — please refresh and try again.");
      return;
    }

    if (!clientSecret) {
      setPaymentError("Payment session not ready — please wait a moment and try again.");
      return;
    }

    setProcessing(true);

    const cardElement = elements.getElement(CardNumberElement);
    if (!cardElement) {
      setPaymentError("Card form not ready — please refresh and try again.");
      setProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      const msg = error.message ?? "Payment failed — please try again.";
      setPaymentError(msg);
      onError(msg);
      setProcessing(false);
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess(paymentIntent.id);
    } else if (paymentIntent?.status === "requires_action") {
      const { error: authError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(clientSecret);
      if (authError) {
        const msg = authError.message ?? "Authentication failed — please try again.";
        setPaymentError(msg);
        onError(msg);
        setProcessing(false);
      } else if (confirmedIntent?.status === "succeeded") {
        onSuccess(confirmedIntent.id);
      } else {
        setPaymentError("Payment not completed — please try again.");
        onError("Payment not completed.");
        setProcessing(false);
      }
    } else {
      setPaymentError("Payment not completed — please try again.");
      onError("Payment not completed.");
      setProcessing(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getFieldBorderClass = (key: "number" | "expiry" | "cvc") => {
    const f = fieldState[key];
    const hasError = (submitAttempted && !f.complete) || !!f.error;
    return hasError
      ? "border-red-400 focus-within:border-red-400 bg-red-50/30"
      : "border-gray-200 focus-within:border-orange-400 bg-white";
  };

  const getFieldErrorMsg = (key: "number" | "expiry" | "cvc") => {
    const f = fieldState[key];
    if (f.error) return f.error;
    if (submitAttempted && !f.complete) {
      if (key === "number") return "Card number is required.";
      if (key === "expiry") return "Expiry date is required.";
      if (key === "cvc")    return "CVC is required.";
    }
    return "";
  };

  const renderCardBrandIcon = () => {
    if (!cardBrand || cardBrand === "unknown") return null;
    const base = "w-8 h-5 flex items-center justify-center rounded text-[10px] font-bold";
    if (cardBrand === "visa")
      return <div className={`${base} bg-[#1A1F71] text-white`}>VISA</div>;
    if (cardBrand === "mastercard")
      return (
        <div className={`${base} bg-white relative overflow-hidden`} style={{ minWidth: 32 }}>
          <div className="absolute left-1 w-4 h-4 rounded-full bg-[#eb001b]" />
          <div className="absolute left-3 w-4 h-4 rounded-full bg-[#f79e1b] opacity-90" />
        </div>
      );
    if (cardBrand === "amex")
      return <div className={`${base} bg-[#2E77BC] text-white`}>AMEX</div>;
    return null;
  };

  const canSubmit = !processing && !!stripe;

  return (
    <>
      {processing && <ProcessingOverlay />}

      {policyModal && (
        <PolicyModal
          url={policyModal.url}
          title={policyModal.title}
          onClose={() => setPolicyModal(null)}
        />
      )}

      {/* ── Card fields ── */}
      <div className="mx-4 sm:mx-5 my-5 space-y-3" ref={errorRef}>

        {/* Card Number */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Card Number
          </label>
          <div className={`border rounded-lg px-3 py-3 transition-colors flex items-center gap-2 ${getFieldBorderClass("number")}`}>
            <div className="flex-1">
              <CardNumberElement options={CARD_INPUT_OPTIONS} onChange={handleNumberChange} />
            </div>
            {renderCardBrandIcon()}
          </div>
          {getFieldErrorMsg("number") && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
              <i className="ri-error-warning-line flex-shrink-0"></i>
              {getFieldErrorMsg("number")}
            </p>
          )}
        </div>

        {/* Expiry + CVC */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Expiry Date
            </label>
            <div className={`border rounded-lg px-3 py-3 transition-colors ${getFieldBorderClass("expiry")}`}>
              <CardExpiryElement options={CARD_INPUT_OPTIONS} onChange={handleExpiryChange} />
            </div>
            {getFieldErrorMsg("expiry") && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <i className="ri-error-warning-line flex-shrink-0"></i>
                {getFieldErrorMsg("expiry")}
              </p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              CVC
            </label>
            <div className={`border rounded-lg px-3 py-3 transition-colors ${getFieldBorderClass("cvc")}`}>
              <CardCvcElement options={CARD_INPUT_OPTIONS} onChange={handleCvcChange} />
            </div>
            {getFieldErrorMsg("cvc") && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <i className="ri-error-warning-line flex-shrink-0"></i>
                {getFieldErrorMsg("cvc")}
              </p>
            )}
          </div>
        </div>

        {/* Top-level payment error (from Stripe confirmCardPayment) */}
        {paymentError && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-300 rounded-lg px-3.5 py-3">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-error-warning-fill text-red-500 text-base"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-red-700 leading-snug">Payment failed</p>
              <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{paymentError}</p>
            </div>
          </div>
        )}

        {/* Incomplete fields summary (on submit attempt) */}
        {submitAttempted && !(fieldState.number.complete && fieldState.expiry.complete && fieldState.cvc.complete) && !paymentError && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-lg px-3.5 py-3">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-alert-line text-amber-500 text-base"></i>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              Please complete all card fields above to continue.
            </p>
          </div>
        )}
      </div>

      {/* ── Coupon slot ── */}
      {couponSlot && <div className="px-4 sm:px-5 pb-4">{couponSlot}</div>}

      {/* ── Agreement checkbox ── */}
      <div className="px-4 sm:px-5 pb-4">
        <label
          className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-4 py-3.5 hover:border-orange-200 transition-colors ${
            agreedError ? "border-red-300 bg-red-50" : "bg-gray-50 border-gray-200"
          }`}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setAgreedError(false);
            }}
            className="mt-0.5 accent-orange-400 flex-shrink-0 cursor-pointer"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            I agree to the{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Terms of Use" })}
              className="text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              Terms of Use
            </button>
            ,{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Informed Consent" })}
              className="text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              Informed Consent
            </button>
            , and{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/privacy-policy", title: "HIPAA Acknowledgment" })}
              className="text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              HIPAA Acknowledgment
            </button>
            .
          </span>
        </label>
        {agreedError && (
          <p className="text-xs text-red-500 mt-1.5 ml-1 flex items-center gap-1">
            <i className="ri-error-warning-line flex-shrink-0"></i>
            Please agree to the terms before continuing.
          </p>
        )}
      </div>

      {/* ── Pay CTA ── */}
      <div className="px-4 sm:px-5 pb-5">
        <button
          type="button"
          onClick={handlePay}
          disabled={!canSubmit}
          className={`whitespace-nowrap w-full py-4 text-sm font-extrabold rounded-xl flex items-center justify-center gap-2.5 transition-colors ${
            canSubmit
              ? "bg-orange-400 text-black hover:bg-orange-500 cursor-pointer"
              : "bg-orange-50 border-2 border-dashed border-orange-200 text-orange-300 cursor-not-allowed select-none"
          }`}
        >
          {processing ? (
            <>
              <i className="ri-loader-4-line animate-spin text-base"></i>
              Processing Payment...
            </>
          ) : (
            <>
              <i className="ri-lock-2-line text-base"></i>
              Complete Secure Evaluation — ${amount}.00
            </>
          )}
        </button>
        {paymentError ? (
          <p className="text-[11px] text-center text-gray-400 mt-2.5 leading-relaxed px-2">
            Please correct the issue above and try again.
          </p>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-2.5">
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-md px-2.5 py-1">
              <i className="ri-shield-check-line text-xs" style={{ color: "#6390FC" }}></i>
              <span className="text-[10px] font-bold" style={{ color: "#6390FC" }}>256-bit SSL</span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[10px] font-bold" style={{ color: "#6390FC" }}>Powered by</span>
              {/* Stripe wordmark — official colors */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: "1px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#6390FC", letterSpacing: "-0.3px", fontFamily: "system-ui, sans-serif" }}>stripe</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
