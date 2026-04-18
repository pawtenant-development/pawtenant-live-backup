import { useState } from "react";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import PolicyModal from "./PolicyModal";

// ─── CouponRow (inline in payment form) ──────────────────────────────────────

const SUPABASE_URL_LOCAL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY_LOCAL = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface CouponRowProps {
  basePrice: number;
  onDiscountChange: (discount: number, code: string) => void;
}

function CouponRow({ basePrice, onDiscountChange }: CouponRowProps) {
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`${SUPABASE_URL_LOCAL}/functions/v1/validate-coupon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY_LOCAL,
          Authorization: `Bearer ${SUPABASE_KEY_LOCAL}`,
        },
        body: JSON.stringify({ code: code.trim().toUpperCase(), amount: basePrice }),
      });
      const data = await res.json() as { valid?: boolean; discount?: number; error?: string };
      if (data.valid && data.discount != null) {
        const discount = data.discount;
        setApplied({ code: code.trim().toUpperCase(), discount });
        onDiscountChange(discount, code.trim().toUpperCase());
      } else {
        setError(data.error ?? "Invalid or expired coupon code.");
      }
    } catch {
      setError("Could not validate coupon. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setApplied(null);
    setCode("");
    setError("");
    onDiscountChange(0, "");
  };

  if (applied) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
            <i className="ri-coupon-3-line text-emerald-600 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-emerald-800 truncate">{applied.code} applied!</p>
            <p className="text-[10px] text-emerald-600">Saving ${applied.discount.toFixed(2)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="whitespace-nowrap text-[10px] font-bold text-emerald-700 hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
        >
          <i className="ri-close-line text-sm"></i>Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative min-w-0">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center pointer-events-none">
            <i className="ri-coupon-3-line text-gray-400 text-sm"></i>
          </div>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
            placeholder="Discount code (optional)"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#2c5282] transition-colors placeholder-gray-400"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className={`whitespace-nowrap px-4 py-2.5 text-xs font-extrabold rounded-xl transition-colors flex-shrink-0 ${
            loading || !code.trim()
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-[#2c5282] text-white hover:bg-[#1e3a5f] cursor-pointer"
          }`}
        >
          {loading ? <i className="ri-loader-4-line animate-spin"></i> : "Apply"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 ml-1 flex items-center gap-1">
          <i className="ri-error-warning-line"></i>{error}
        </p>
      )}
    </div>
  );
}

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

export interface SubscriptionParams {
  petCount: number;
  deliverySpeed: string;
  email: string;
  firstName: string;
  lastName: string;
  state: string;
  confirmationId: string;
  letterType?: string;
}

interface StripeCardFormProps {
  totalPrice: number;
  /** Required for one-time payments. Not needed for subscriptions (handled lazily). */
  clientSecret?: string;
  onPaymentSuccess: (paymentIntentId: string) => void;
  /** When true, the backend call happens on submit — no pre-fetch needed. */
  isSubscription?: boolean;
  subscriptionParams?: SubscriptionParams;
  /** Price before any coupon discount — used to validate coupon against correct amount */
  priceBeforeDiscount?: number;
  /** Callback when a coupon is applied or removed */
  onDiscountChange?: (discount: number, code: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StripeCardForm({
  totalPrice,
  clientSecret,
  onPaymentSuccess,
  isSubscription = false,
  subscriptionParams,
  priceBeforeDiscount,
  onDiscountChange,
}: StripeCardFormProps) {
  const stripe   = useStripe();
  const elements = useElements();

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError,    setTermsError]    = useState(false);
  const [cardError,     setCardError]     = useState("");
  const [processing,    setProcessing]    = useState(false);
  const [fieldsDone, setFieldsDone] = useState({ number: false, expiry: false, cvc: false });
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  // Track applied coupon code so it can be sent to backend for subscription discount
  const [appliedCouponCode, setAppliedCouponCode] = useState("");

  const allFieldsComplete = fieldsDone.number && fieldsDone.expiry && fieldsDone.cvc;
  const canSubmit = !processing && !!stripe && !!elements;

  // Wrap onDiscountChange to also capture the coupon code
  const handleDiscountChange = (discount: number, code: string) => {
    setAppliedCouponCode(discount > 0 ? code : "");
    onDiscountChange?.(discount, code);
  };

  // ── Subscription lazy flow ────────────────────────────────────────────────
  const handleSubscriptionPay = async () => {
    if (!stripe || !elements || !subscriptionParams) return;

    const cardElement = elements.getElement(CardNumberElement);
    if (!cardElement) {
      setCardError("Card form not ready — please refresh and try again.");
      setProcessing(false);
      return;
    }

    // Step 1: tokenise card (no backend call needed yet)
    const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
      billing_details: {
        name: `${subscriptionParams.firstName} ${subscriptionParams.lastName}`.trim() || undefined,
        email: subscriptionParams.email || undefined,
      },
    });

    if (pmError || !paymentMethod) {
      setCardError(pmError?.message ?? "Card error — please check your details.");
      setProcessing(false);
      return;
    }

    // Step 2: create subscription on backend — pass couponCode if one was applied
    let subClientSecret: string;
    try {
      const res = await fetch(`${SUPABASE_URL_LOCAL}/functions/v1/create-payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY_LOCAL,
          Authorization: `Bearer ${SUPABASE_KEY_LOCAL}`,
        },
        body: JSON.stringify({
          plan: "subscription",
          paymentMethodId: paymentMethod.id,
          petCount: subscriptionParams.petCount,
          deliverySpeed: subscriptionParams.deliverySpeed,
          email: subscriptionParams.email,
          customerName: `${subscriptionParams.firstName} ${subscriptionParams.lastName}`.trim(),
          firstName: subscriptionParams.firstName,
          lastName: subscriptionParams.lastName,
          state: subscriptionParams.state,
          confirmationId: subscriptionParams.confirmationId,
          letterType: subscriptionParams.letterType ?? "esa",
          // Pass coupon code so backend can apply Stripe discount
          couponCode: appliedCouponCode || undefined,
          metadata: {
            confirmationId: subscriptionParams.confirmationId,
            firstName: subscriptionParams.firstName,
            lastName: subscriptionParams.lastName,
            email: subscriptionParams.email,
            state: subscriptionParams.state,
            planType: "subscription",
            deliverySpeed: subscriptionParams.deliverySpeed,
            petCount: String(subscriptionParams.petCount),
          },
        }),
      });

      const data = await res.json() as { clientSecret?: string; error?: string };
      if (!data.clientSecret) {
        setCardError(data.error ?? "Could not create subscription — please try again.");
        setProcessing(false);
        return;
      }
      subClientSecret = data.clientSecret;
    } catch {
      setCardError("Network error — please try again.");
      setProcessing(false);
      return;
    }

    // Step 3: confirm payment (handles 3DS automatically if required)
    const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
      subClientSecret,
      { payment_method: paymentMethod.id },
    );

    if (confirmError) {
      setCardError(confirmError.message ?? "Payment failed — please try again.");
      setProcessing(false);
    } else if (paymentIntent?.status === "succeeded") {
      onPaymentSuccess(paymentIntent.id);
    } else {
      setCardError("Payment not completed — please try again.");
      setProcessing(false);
    }
  };

  // ── One-time payment flow ─────────────────────────────────────────────────
  const handleOneTimePay = async () => {
    if (!stripe || !elements) return;
    if (!clientSecret) {
      setCardError("Payment is still loading — please wait a moment and try again.");
      setProcessing(false);
      return;
    }

    const cardElement = elements.getElement(CardNumberElement);
    if (!cardElement) {
      setCardError("Card form not ready — please refresh and try again.");
      setProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      setCardError(error.message ?? "Payment failed — please try again.");
      setProcessing(false);
    } else if (paymentIntent?.status === "succeeded") {
      onPaymentSuccess(paymentIntent.id);
    } else {
      setCardError("Payment not completed — please try again.");
      setProcessing(false);
    }
  };

  // ── Main submit handler ───────────────────────────────────────────────────
  const handlePay = async () => {
    if (!agreedToTerms) { setTermsError(true); return; }
    if (!stripe || !elements) return;
    setCardError("");
    setTermsError(false);
    setProcessing(true);

    if (isSubscription) {
      await handleSubscriptionPay();
    } else {
      await handleOneTimePay();
    }
  };

  return (
    <>
      {policyModal && (
        <PolicyModal
          url={policyModal.url}
          title={policyModal.title}
          onClose={() => setPolicyModal(null)}
        />
      )}

      {/* ── Card fields ── */}
      <div className="mx-5 my-5 space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Card Number
          </label>
          <div className="border border-gray-200 rounded-lg bg-white px-3 py-3 focus-within:border-orange-400 transition-colors">
            <CardNumberElement
              options={CARD_INPUT_OPTIONS}
              onChange={(e) => {
                setFieldsDone((f) => ({ ...f, number: e.complete }));
                if (e.error) setCardError(e.error.message);
                else setCardError("");
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Expiry Date
            </label>
            <div className="border border-gray-200 rounded-lg bg-white px-3 py-3 focus-within:border-orange-400 transition-colors">
              <CardExpiryElement
                options={CARD_INPUT_OPTIONS}
                onChange={(e) => setFieldsDone((f) => ({ ...f, expiry: e.complete }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              CVC
            </label>
            <div className="border border-gray-200 rounded-lg bg-white px-3 py-3 focus-within:border-orange-400 transition-colors">
              <CardCvcElement
                options={CARD_INPUT_OPTIONS}
                onChange={(e) => setFieldsDone((f) => ({ ...f, cvc: e.complete }))}
              />
            </div>
          </div>
        </div>

        {cardError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className="ri-error-warning-line text-red-500 text-sm"></i>
            </div>
            <p className="text-xs text-red-600 leading-relaxed">{cardError}</p>
          </div>
        )}
      </div>

      {/* ── Discount code ── */}
      {onDiscountChange && (
        <div className="px-5 pb-4">
          <CouponRow
            basePrice={priceBeforeDiscount ?? totalPrice}
            onDiscountChange={handleDiscountChange}
          />
        </div>
      )}

      {/* ── Agreement checkbox ── */}
      <div className="px-5 pb-4">
        <label
          className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-4 py-3.5 hover:border-orange-200 transition-colors ${
            termsError ? "border-red-300 bg-red-50" : "bg-gray-50 border-gray-200"
          }`}
        >
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => {
              setAgreedToTerms(e.target.checked);
              if (e.target.checked) setTermsError(false);
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
        {termsError && (
          <p className="text-xs text-red-500 mt-1.5 ml-1">
            Please agree to the terms before continuing.
          </p>
        )}
      </div>

      {/* ── Pay CTA ── */}
      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={handlePay}
          disabled={!canSubmit}
          className={`whitespace-nowrap w-full py-4 text-sm font-extrabold rounded-xl flex items-center justify-center gap-2.5 transition-colors ${
            canSubmit
              ? "bg-orange-400 text-white hover:bg-orange-500 cursor-pointer"
              : "bg-orange-50 border-2 border-dashed border-orange-200 text-orange-300 cursor-not-allowed select-none"
          }`}
        >
          {processing ? (
            <>
              <i className="ri-loader-4-line animate-spin text-base"></i>
              {isSubscription ? "Setting up subscription..." : "Processing Payment..."}
            </>
          ) : (
            <>
              <i className="ri-lock-2-line text-base"></i>
              Complete Secure Evaluation — ${totalPrice}.00
            </>
          )}
        </button>
        <p className="text-[11px] text-center text-gray-400 mt-2.5 leading-relaxed px-2">
          {allFieldsComplete
            ? isSubscription
              ? "Your subscription begins immediately after payment. Cancel anytime."
              : "Your licensed provider begins reviewing your case immediately after payment."
            : "Enter your card details above to complete your order."}
        </p>
      </div>
    </>
  );
}
