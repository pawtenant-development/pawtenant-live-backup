import { useState } from "react";
import { createPortal } from "react-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Link } from "react-router-dom";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ── Cache stripePromise at module level — never re-created ─────────────────
const stripePromiseCache: Record<string, ReturnType<typeof loadStripe>> = {};
function getStripePromise(key: string) {
  if (!stripePromiseCache[key]) stripePromiseCache[key] = loadStripe(key);
  return stripePromiseCache[key];
}

const CARD_STYLE = {
  style: {
    base: {
      fontSize: "14px",
      color: "#111827",
      fontFamily: "inherit",
      "::placeholder": { color: "#9ca3af" },
    },
    invalid: { color: "#ef4444" },
  },
};

// ── Processing Overlay ────────────────────────────────────────────────────────
function ProcessingOverlay() {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-xs w-full mx-4">
        {/* Animated ring spinner */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-[#1a5c4f]/15" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#1a5c4f] animate-spin" />
          <div className="absolute inset-3 rounded-full bg-[#1a5c4f]/8 flex items-center justify-center">
            <i className="ri-bank-card-2-line text-[#1a5c4f] text-xl" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-1.5">
          <p className="text-gray-900 font-bold text-base">Processing Payment</p>
          <p className="text-gray-500 text-sm leading-relaxed">
            Please wait while we securely confirm your payment...
          </p>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#1a5c4f] animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-[#1a5c4f] animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-[#1a5c4f] animate-bounce [animation-delay:300ms]" />
        </div>

        {/* Security note */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <i className="ri-lock-2-line" />
          <span>256-bit SSL encrypted</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Inner form (has access to stripe + elements context) ─────────────────────
function CardFormInner({
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
}: Omit<StripePaymentFormProps, "returnUrl"> & { returnUrl?: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState("");

  const canPay = !!stripe && !!clientSecret && !processing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    if (onBeforeSubmit && !onBeforeSubmit()) return;

    setProcessing(true);
    setCardError("");

    const cardElement = elements.getElement(CardNumberElement);
    if (!cardElement) {
      setCardError("Card element not found. Please refresh and try again.");
      setProcessing(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (result.error) {
      const msg = result.error.message ?? "Payment failed. Please try again.";
      setCardError(msg);
      onError(msg);
      setProcessing(false);
    } else if (result.paymentIntent?.status === "succeeded") {
      onSuccess(result.paymentIntent.id);
    }
  };

  return (
    <>
      {processing && <ProcessingOverlay />}

      <form onSubmit={handleSubmit} className="space-y-3">
        {cardError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
            <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
            {cardError}
          </div>
        )}

        {/* Card Number */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Card number</label>
          <div className="flex items-center border border-gray-300 rounded-lg px-3 py-3 bg-white gap-3 focus-within:border-[#1a5c4f] focus-within:ring-1 focus-within:ring-[#1a5c4f]/20 transition-all">
            <div className="flex-1 min-w-0">
              <CardNumberElement options={{ ...CARD_STYLE, showIcon: true }} />
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="h-5 w-8 bg-[#1A1F71] rounded-sm flex items-center justify-center">
                <span className="text-white font-extrabold text-[7px] tracking-tight">VISA</span>
              </div>
              <div className="h-5 w-8 flex items-center justify-center">
                <div className="flex">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#EB001B] opacity-90" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#F79E1B] -ml-2 opacity-90" />
                </div>
              </div>
              <div className="h-5 w-8 bg-[#2E77BC] rounded-sm flex items-center justify-center">
                <span className="text-white font-extrabold text-[6px]">AMEX</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expiry + CVC */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Expiration date</label>
            <div className="border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:border-[#1a5c4f] focus-within:ring-1 focus-within:ring-[#1a5c4f]/20 transition-all">
              <CardExpiryElement options={CARD_STYLE} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Security code</label>
            <div className="border border-gray-300 rounded-lg px-3 py-3 bg-white focus-within:border-[#1a5c4f] focus-within:ring-1 focus-within:ring-[#1a5c4f]/20 transition-all">
              <CardCvcElement options={CARD_STYLE} />
            </div>
          </div>
        </div>

        {/* Coupon slot — renders right above I agree checkbox */}
        {couponSlot}

        {/* Terms checkbox — above pay button */}
        <label className={`flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border transition-colors ${agreedError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 hover:border-[#1a5c4f]/30"}`}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setAgreedError(false);
            }}
            className="mt-0.5 accent-[#1a5c4f] flex-shrink-0"
          />
          <span className={`text-xs leading-relaxed ${agreedError ? "text-red-600" : "text-gray-600"}`}>
            I agree to the PawTenant{" "}
            <Link to="/terms-of-use" className="text-[#1a5c4f] font-semibold hover:underline" target="_blank">Service Terms</Link>
            {", "}
            <a href="#" className="text-[#1a5c4f] font-semibold hover:underline">Informed Consent</a>
            {", and "}
            <Link to="/privacy-policy" className="text-[#1a5c4f] font-semibold hover:underline" target="_blank">HIPAA</Link>
            . I confirm I am at least 18 years of age.
          </span>
        </label>
        {agreedError && (
          <p className="text-xs text-red-500 -mt-2 flex items-center gap-1.5">
            <i className="ri-error-warning-line" />
            Please agree to the terms to continue.
          </p>
        )}

        {/* Pay button */}
        <button
          type="submit"
          disabled={!canPay}
          className="whitespace-nowrap w-full py-3.5 bg-[#1a5c4f] text-white font-extrabold text-sm rounded-lg hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {!clientSecret ? (
            <><i className="ri-loader-4-line animate-spin" /> Preparing payment...</>
          ) : (
            <><i className="ri-lock-2-line" /> Pay ${amount}.00</>
          )}
        </button>
      </form>
    </>
  );
}

// ── Public wrapper ────────────────────────────────────────────────────────────
export interface StripePaymentFormProps {
  /** null = clientSecret still loading in background */
  clientSecret: string | null;
  amount: number;
  returnUrl: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  onBeforeSubmit?: () => boolean;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  agreedError: boolean;
  setAgreedError: (v: boolean) => void;
  /** Optional slot rendered right above the I agree checkbox */
  couponSlot?: React.ReactNode;
}

export default function StripePaymentForm(props: StripePaymentFormProps) {
  const publishableKey = import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY as string;

  if (!publishableKey) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
        <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
        <span>
          Stripe publishable key is missing. Add{" "}
          <code className="font-mono bg-red-100 px-1 rounded">VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
          to your environment.
        </span>
      </div>
    );
  }

  const stripePromise = getStripePromise(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#1a5c4f",
            colorText: "#111827",
            colorDanger: "#ef4444",
            fontFamily: "inherit",
            borderRadius: "8px",
          },
        },
      }}
    >
      <CardFormInner {...props} />
    </Elements>
  );
}
