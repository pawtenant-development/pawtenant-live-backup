// Step3Checkout — Payment orchestration (Card / Klarna / QR tabs)
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import type { Step1Data } from "./Step1Assessment";
import type { Step2Data } from "./Step2PersonalInfo";
import PolicyModal from "./PolicyModal";
import StripePaymentForm from "./StripePaymentForm";
import StripeCardForm from "./StripeCardForm";
import type { SubscriptionParams } from "./StripeCardForm";
import KlarnaPaymentTab from "./KlarnaPaymentTab";
import { Link } from "react-router-dom";

// ─── Module-level Stripe constants ───────────────────────────────────────────
const stripePromise = loadStripe(
  import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const STRIPE_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    colorPrimary: "#F97316",
    colorBackground: "#ffffff",
    colorText: "#1f2937",
    colorDanger: "#ef4444",
    fontFamily: "inherit",
    borderRadius: "8px",
  },
};

function getOneTimePrice(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return 110 + (n - 1) * 25;
}

// ─── CouponPopup (LIVE only — once-per-session) ──────────────────────────────
const COUPON_POPUP_SESSION_KEY = "esa_step3_coupon_popup_shown";
const COUPON_POPUP_CODE = "PAW20";

function CouponDogIllustration() {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
    >
      <ellipse cx="16" cy="20" rx="7" ry="11" fill="#b45309" transform="rotate(-24 16 20)" />
      <ellipse cx="48" cy="20" rx="7" ry="11" fill="#b45309" transform="rotate(24 48 20)" />
      <circle cx="32" cy="34" r="18" fill="#f59e0b" />
      <ellipse cx="32" cy="42" rx="9" ry="7" fill="#fde68a" />
      <circle cx="25" cy="30" r="2.2" fill="#1f2937" />
      <circle cx="39" cy="30" r="2.2" fill="#1f2937" />
      <ellipse cx="32" cy="38" rx="2.6" ry="2" fill="#1f2937" />
      <path d="M28 44 Q32 47 36 44" stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CouponPopup({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_POPUP_CODE);
    } catch {
      // ignore clipboard errors — dismiss anyway
    }
    setCopied(true);
    setTimeout(onDismiss, 600);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <i className="ri-close-line text-lg"></i>
        </button>

        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-3 mx-auto">
          <div className="w-12 h-12">
            <CouponDogIllustration />
          </div>
        </div>
        <h3 className="text-lg font-extrabold text-gray-900 mb-1 text-center">
          Wait — don&apos;t leave empty-pawed!
        </h3>
        <p className="text-sm text-gray-600 mb-4 text-center">
          Copy this code and paste it in the discount field below.
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-between border-2 border-dashed border-orange-400 rounded-xl px-4 py-3 bg-orange-50 hover:bg-orange-100 transition"
        >
          <span className="font-bold tracking-widest text-orange-600 text-base">
            {COUPON_POPUP_CODE}
          </span>
          <span className="text-xs font-semibold text-orange-600 flex items-center gap-1">
            <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
            {copied ? "Copied!" : "Copy"}
          </span>
        </button>

        <p className="text-[11px] text-gray-400 mt-3 text-center">
          Tap anywhere outside to dismiss.
        </p>
      </div>
    </div>
  );
}

function getAnnualSubPrice(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return 99 + (n - 1) * 20;
}

export interface Step3Data {
  selectedDoctorId: string;
  plan: PlanType;
  nameOnCard?: string;
  smsConsent?: boolean;
  addonServices?: string[];
}

type PlanType = "one-time" | "subscription";

interface Step3CheckoutProps {
  step1: Step1Data;
  step2: Step2Data;
  data: Step3Data;
  onChange: (data: Step3Data) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  preSelectedDoctorId?: string;
  confirmationId?: string;
  onCouponApplied?: (coupon: { code: string; discount: number } | null) => void;
  appliedCoupon?: { code: string; discount: number } | null;
  stripeClientSecret?: string;
  stripeSecretLoading?: boolean;
  stripeSecretError?: string;
  onRetryClientSecret?: () => void;
  onPaymentSuccess?: (paymentIntentId: string) => void;
  petCount?: number;
  onBeforeRedirect?: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

// ─── CouponRow ────────────────────────────────────────────────────────────────

interface CouponRowProps {
  basePrice: number;
  appliedCoupon: { code: string; discount: number } | null;
  onDiscountChange: (discount: number, code: string) => void;
  busy?: boolean;
}

function CouponRow({
  basePrice,
  appliedCoupon,
  onDiscountChange,
  busy = false,
}: CouponRowProps) {
  const [code, setCode] = useState(appliedCoupon?.code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCode(appliedCoupon?.code ?? "");
    setError("");
  }, [appliedCoupon?.code]);

  const handleApply = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || loading || busy) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-coupon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          code: normalizedCode,
          amount: basePrice,
        }),
      });

      const data = (await res.json()) as {
        valid?: boolean;
        discount?: number;
        error?: string;
      };

      if (data.valid && data.discount != null) {
        onDiscountChange(data.discount, normalizedCode);
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
    if (loading || busy) return;
    setError("");
    setCode("");
    onDiscountChange(0, "");
  };

  if (appliedCoupon) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
            <i className="ri-coupon-3-line text-emerald-600 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-emerald-800 truncate">
              {appliedCoupon.code} applied!
            </p>
            <p className="text-[10px] text-emerald-600">
              Saving ${appliedCoupon.discount.toFixed(2)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy || loading}
          className="whitespace-nowrap text-[10px] font-bold text-emerald-700 hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-close-line text-sm"></i>
          Remove
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
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
            placeholder="Discount code (optional)"
            disabled={loading || busy}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-orange-400 transition-colors placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || busy || !code.trim()}
          className={`whitespace-nowrap px-4 py-2.5 text-xs font-extrabold rounded-xl transition-colors flex-shrink-0 ${loading || busy || !code.trim()
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
            }`}
        >
          {loading ? <i className="ri-loader-4-line animate-spin"></i> : "Apply"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-500 ml-1 flex items-center gap-1">
          <i className="ri-error-warning-line"></i>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── SecurePaymentCard ────────────────────────────────────────────────────────

type PayTabType = "card" | "klarna";

interface SecurePaymentCardProps {
  totalPrice: number;
  stripeClientSecret?: string;
  stripeSecretLoading?: boolean;
  stripeSecretError?: string;
  onRetryClientSecret?: () => void;
  onPaymentSuccess?: (paymentIntentId: string) => void;
  petCount: number;
  email: string;
  firstName: string;
  lastName: string;
  state: string;
  deliverySpeed: string;
  confirmationId: string;
  onBeforeRedirect?: () => void;
  plan: PlanType;
  priceBeforeDiscount: number;
  appliedCoupon: { code: string; discount: number } | null;
  onDiscountChange: (discount: number, code: string) => void;
  subscriptionParams?: SubscriptionParams;
}

function SecurePaymentCard({
  totalPrice,
  stripeClientSecret,
  stripeSecretLoading,
  stripeSecretError,
  onRetryClientSecret,
  onPaymentSuccess,
  petCount,
  email,
  firstName,
  lastName,
  state,
  deliverySpeed,
  confirmationId,
  onBeforeRedirect,
  plan,
  priceBeforeDiscount,
  appliedCoupon,
  onDiscountChange,
  subscriptionParams,
}: SecurePaymentCardProps) {
  const isSubscription = plan === "subscription";
  const [activeTab, setActiveTab] = useState<PayTabType>("card");
  const [cardAgreed, setCardAgreed] = useState(false);
  const [cardAgreedError, setCardAgreedError] = useState(false);
  const [klarnaAgreed, setKlarnaAgreed] = useState(false);
  const [klarnaAgreedError, setKlarnaAgreedError] = useState(false);

  const appliedCouponCode = appliedCoupon?.code ?? "";

  const [elementsOptions, setElementsOptions] =
    useState<StripeElementsOptions | null>(
      isSubscription ? { appearance: STRIPE_APPEARANCE } : null
    );

  useEffect(() => {
    if (isSubscription) {
      setElementsOptions({ appearance: STRIPE_APPEARANCE });
      return;
    }

    if (stripeClientSecret) {
      setElementsOptions({
        clientSecret: stripeClientSecret,
        appearance: STRIPE_APPEARANCE,
      });
    } else {
      setElementsOptions(null);
    }
  }, [isSubscription, stripeClientSecret]);

  const couponSlot = (
    <CouponRow
      basePrice={priceBeforeDiscount}
      appliedCoupon={appliedCoupon}
      onDiscountChange={onDiscountChange}
      busy={!!stripeSecretLoading}
    />
  );

  const handlePaymentSuccess = (paymentIntentId: string) =>
    onPaymentSuccess?.(paymentIntentId);

  const handlePaymentError = (message: string) =>
    console.error("Payment error:", message);

  const handleBeforeSubmit = () => {
    onBeforeRedirect?.();
    return true;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-[#1A5C4F] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 flex items-center justify-center bg-white/15 rounded-xl flex-shrink-0">
            <i className="ri-lock-2-line text-white text-sm"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold text-white tracking-tight">
              Secure Checkout
            </p>
            <p className="text-[9px] text-white/60 mt-0.5">256-bit SSL Encrypted</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div
            className="h-6 px-1.5 flex items-center justify-center bg-white rounded"
            style={{ minWidth: "32px" }}
          >
            <span
              style={{
                color: "#1a1f71",
                fontSize: "10px",
                fontWeight: 900,
                fontStyle: "italic",
              }}
            >
              VISA
            </span>
          </div>
          <div
            className="h-6 flex items-center justify-center bg-white rounded relative overflow-hidden"
            style={{ width: "38px" }}
          >
            <div
              style={{
                position: "absolute",
                left: "4px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#eb001b",
              }}
            ></div>
            <div
              style={{
                position: "absolute",
                left: "16px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#f79e1b",
                opacity: 0.9,
              }}
            ></div>
          </div>
          <div
            className="h-6 px-1.5 flex items-center justify-center rounded"
            style={{ background: "#006fcf", minWidth: "32px" }}
          >
            <span
              style={{
                color: "white",
                fontSize: "8px",
                fontWeight: 800,
                letterSpacing: "0.06em",
              }}
            >
              AMEX
            </span>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-100 bg-gray-50/50">
        <button
          type="button"
          onClick={() => setActiveTab("card")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeTab === "card"
              ? "text-orange-500 border-b-2 border-orange-500 bg-white"
              : "text-gray-400 hover:text-gray-600"
            }`}
        >
          <i className="ri-bank-card-line text-sm"></i>
          Card
        </button>

        {!isSubscription && (
          <button
            type="button"
            onClick={() => setActiveTab("klarna")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${activeTab === "klarna"
                ? "text-[#ff679a] border-b-2 border-[#ff679a] bg-white"
                : "text-gray-400 hover:text-gray-600"
              }`}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#ffb3c7] text-[9px] font-extrabold text-[#17120e]">
              K
            </span>
            Klarna
          </button>
        )}

      </div>

      {/* Card tab */}
      {activeTab === "card" && (
        <>
          {isSubscription && (
            <div className="mx-4 sm:mx-5 mt-4 mb-1 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                <i className="ri-refresh-line text-emerald-600 text-sm"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-emerald-900 leading-snug">
                  Annual Subscription
                </p>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  Billed yearly · Cancel anytime from your portal
                </p>
              </div>
            </div>
          )}

          {isSubscription ? (
            <Elements stripe={stripePromise} options={{ appearance: STRIPE_APPEARANCE }}>
              <StripeCardForm
                totalPrice={totalPrice}
                isSubscription={true}
                subscriptionParams={subscriptionParams}
                priceBeforeDiscount={priceBeforeDiscount}
                onDiscountChange={onDiscountChange}
                onPaymentSuccess={handlePaymentSuccess}
              />
            </Elements>
          ) : stripeSecretLoading || !elementsOptions ? (
            <div className="mx-4 sm:mx-5 my-5 space-y-3">
              {couponSlot}

              <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
                {stripeSecretError && !stripeSecretLoading ? (
                  <>
                    <div className="w-12 h-12 flex items-center justify-center bg-red-50 border border-red-200 rounded-2xl">
                      <i className="ri-error-warning-line text-red-500 text-xl"></i>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-700">
                        Payment setup failed
                      </p>
                      <p className="text-xs text-red-500 mt-1 leading-relaxed max-w-xs">
                        {stripeSecretError}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onRetryClientSecret}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                    >
                      <i className="ri-refresh-line"></i>
                      Try Again
                    </button>
                    <p className="text-xs text-gray-400">
                      Still having trouble?{" "}
                      <a
                        href="tel:+14099655885"
                        className="font-semibold text-orange-500 hover:underline"
                      >
                        Call 409-965-5885
                      </a>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 flex items-center justify-center bg-white border border-gray-200 rounded-2xl">
                      <i className="ri-loader-4-line animate-spin text-orange-500 text-xl"></i>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-600">
                        Loading Secure Checkout
                      </p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Setting up your encrypted payment form...
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mx-4 sm:mx-5 mt-4 mb-3">{couponSlot}</div>

              <Elements
                key={stripeClientSecret ?? "no-client-secret"}
                stripe={stripePromise}
                options={elementsOptions}
              >
                <StripePaymentForm
                  clientSecret={stripeClientSecret}
                  amount={totalPrice}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  onBeforeSubmit={handleBeforeSubmit}
                  agreed={cardAgreed}
                  setAgreed={setCardAgreed}
                  agreedError={cardAgreedError}
                  setAgreedError={setCardAgreedError}
                />
              </Elements>
            </>
          )}
        </>
      )}

      {/* Klarna tab */}
      {activeTab === "klarna" && !isSubscription && (
        <>
          <div className="mx-4 sm:mx-5 mt-4 mb-3">{couponSlot}</div>
          <KlarnaPaymentTab
            amount={totalPrice}
            plan={plan}
            petCount={petCount}
            deliverySpeed={deliverySpeed}
            email={email}
            firstName={firstName}
            lastName={lastName}
            state={state}
            agreed={klarnaAgreed}
            setAgreed={setKlarnaAgreed}
            agreedError={klarnaAgreedError}
            setAgreedError={setKlarnaAgreedError}
            confirmationId={confirmationId}
            onSuccess={() => onPaymentSuccess?.("klarna-success")}
            couponCode={appliedCouponCode}
          />
        </>
      )}

      {/* Footer */}
      <div className="bg-[#eef2f9] border-t border-[#b8cce4] px-4 sm:px-5 py-3 flex items-center gap-2">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <i className="ri-phone-line text-[#1A5C4F] text-sm"></i>
        </div>
        <p className="text-xs text-gray-600">
          Prefer to call?{" "}
          <a
            href="tel:+14099655885"
            className="font-bold underline cursor-pointer hover:text-[#1A5C4F]"
          >
            409-965-5885
          </a>{" "}
          — complete by phone.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Step3Checkout({
  step2,
  data,
  onChange,
  onBack,
  stripeClientSecret,
  stripeSecretLoading,
  stripeSecretError,
  onRetryClientSecret,
  onPaymentSuccess,
  confirmationId = "",
  petCount,
  onBeforeRedirect,
  onCouponApplied,
  appliedCoupon,
}: Step3CheckoutProps) {
  const [policyModal, setPolicyModal] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const [localCoupon, setLocalCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(appliedCoupon ?? null);

  useEffect(() => {
    setLocalCoupon(appliedCoupon ?? null);
  }, [appliedCoupon]);

  // ── Coupon popup: show once per session on Step 3, only on first tab switch ──
  const [showCouponPopup, setShowCouponPopup] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(COUPON_POPUP_SESSION_KEY) === "1") return;
    } catch {
      return;
    }
    const onVisibility = () => {
      if (!document.hidden) return;
      try {
        sessionStorage.setItem(COUPON_POPUP_SESSION_KEY, "1");
      } catch {
        // ignore
      }
      setShowCouponPopup(true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const dismissCouponPopup = () => {
    try {
      sessionStorage.setItem(COUPON_POPUP_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setShowCouponPopup(false);
  };

  const resolvedPetCount = petCount ?? step2.pets?.length ?? 1;
  const basePrice = getOneTimePrice(resolvedPetCount);
  const subPrice = getAnnualSubPrice(resolvedPetCount);
  const selectedPlan = data.plan ?? "one-time";
  const priceBeforeDiscount =
    selectedPlan === "subscription" ? subPrice : basePrice;
  const couponDiscount = localCoupon?.discount ?? 0;
  const totalPrice = Math.max(0, priceBeforeDiscount - couponDiscount);

  const openPolicy = (path: string, title: string) =>
    setPolicyModal({ url: path, title });
  void openPolicy;

  const handleCouponChange = (discount: number, code: string) => {
    const nextCoupon =
      discount > 0 && code
        ? {
          code,
          discount,
        }
        : null;

    setLocalCoupon(nextCoupon);
    onCouponApplied?.(nextCoupon);
  };

  const subscriptionParams: SubscriptionParams = {
    petCount: resolvedPetCount,
    deliverySpeed: "",
    email: step2.email,
    firstName: step2.firstName,
    lastName: step2.lastName,
    state: step2.state,
    confirmationId,
    letterType: "esa",
  };

  const paymentCardProps: SecurePaymentCardProps = {
    totalPrice,
    stripeClientSecret,
    stripeSecretLoading,
    stripeSecretError,
    onRetryClientSecret,
    onPaymentSuccess,
    petCount: resolvedPetCount,
    email: step2.email,
    firstName: step2.firstName,
    lastName: step2.lastName,
    state: step2.state,
    deliverySpeed: "",
    confirmationId,
    onBeforeRedirect,
    plan: selectedPlan,
    priceBeforeDiscount,
    appliedCoupon: localCoupon,
    onDiscountChange: handleCouponChange,
    subscriptionParams,
  };

  return (
    <div>
      {showCouponPopup && <CouponPopup onDismiss={dismissCouponPopup} />}

      {policyModal && (
        <PolicyModal
          url={policyModal.url}
          title={policyModal.title}
          onClose={() => setPolicyModal(null)}
        />
      )}

      {/* ── Mobile-only compact order summary banner ── */}
      <div className="lg:hidden mb-4 bg-[#1A5C4F] rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-xl flex-shrink-0">
            <i className="ri-file-text-line text-white text-base"></i>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider">
              ESA Letter Package
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          {couponDiscount > 0 && (
            <p className="text-[10px] text-white/60 line-through">
              ${priceBeforeDiscount}.00
            </p>
          )}
          <p className="text-xl font-extrabold text-white">${totalPrice}.00</p>
          <p className="text-[10px] text-white/60">
            {selectedPlan === "subscription" ? "per year" : "one-time"}
          </p>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-4 lg:gap-8">
        {/* ════ RIGHT COLUMN (payment) — order-1 = first on mobile ════ */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2">
          <div className="lg:sticky lg:top-28 space-y-3 lg:space-y-4">
            {/* ── Desktop-only order summary (full detail) — TOP of right column ── */}
            <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-[#1A5C4F] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider mb-0.5">
                      Order Summary
                    </p>
                    <p className="text-sm font-extrabold text-white leading-snug">
                      Clinical Evaluation + ESA Documentation
                    </p>
                  </div>
                  <div className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl flex-shrink-0">
                    <i className="ri-file-text-line text-white text-lg"></i>
                  </div>
                </div>
              </div>
              <div className="px-5 pt-4 pb-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-xl flex-shrink-0 mt-0.5">
                      <i className="ri-file-text-line text-orange-500 text-base"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-gray-800 leading-snug">
                        ESA Letter Package
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-extrabold text-gray-900">
                      ${priceBeforeDiscount}.00
                    </span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-gray-400 line-through">
                        ${basePrice}.00
                      </span>
                    )}
                  </div>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className="ri-coupon-3-line text-emerald-500 text-sm"></i>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">
                        Discount applied
                      </span>
                    </div>
                    <span className="text-sm font-extrabold text-emerald-600">
                      -${couponDiscount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2.5">
                    What&apos;s Included
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line", text: "Official ESA letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-home-heart-line", text: "Fair Housing Act" },
                    ].map((item) => (
                      <div
                        key={item.text}
                        className="flex items-center gap-1.5 min-w-0"
                      >
                        <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                          <i
                            className={`${item.icon} text-orange-500 text-xs`}
                          ></i>
                        </div>
                        <span className="text-xs text-gray-700 font-bold truncate">
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
              <div className="bg-[#1A5C4F] px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider">
                    Amount Due Today
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {selectedPlan === "subscription"
                      ? "Annual renewal · cancel anytime"
                      : "One-time · no recurring charges"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-2xl font-extrabold text-white">
                    ${totalPrice}.00
                  </span>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-white/60 mt-0.5">per year</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Plan Toggle ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Choose Your Plan
                </p>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Save ${basePrice - subPrice}/yr
                </span>
              </div>
              <div className="p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...data, plan: "subscription" })}
                  className={`w-full text-left rounded-xl border-2 px-3 py-3 transition-all cursor-pointer ${selectedPlan === "subscription"
                      ? "border-orange-400 bg-[#FFF7ED]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPlan === "subscription"
                            ? "border-orange-500"
                            : "border-gray-300"
                          }`}
                      >
                        {selectedPlan === "subscription" && (
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-extrabold text-gray-800 block">
                          Subscribe &amp; Save
                        </span>
                        <span className="text-xs text-gray-500">
                          Auto-renews yearly · Cancel anytime
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full block mb-0.5 whitespace-nowrap">
                        BEST VALUE
                      </span>
                      <span className="text-sm font-extrabold text-orange-500">
                        ${subPrice}.00
                      </span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange({ ...data, plan: "one-time" })}
                  className={`w-full text-left rounded-xl border-2 px-3 py-3 transition-all cursor-pointer ${selectedPlan === "one-time"
                      ? "border-orange-400 bg-[#FFF7ED]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPlan === "one-time"
                            ? "border-orange-500"
                            : "border-gray-300"
                          }`}
                      >
                        {selectedPlan === "one-time" && (
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-extrabold text-gray-800 block">
                          One-time Purchase
                        </span>
                        <span className="text-xs text-gray-500">
                          Single payment · Klarna available
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-sm font-extrabold text-gray-900">
                        ${basePrice}.00
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <SecurePaymentCard {...paymentCardProps} />

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-2.5 flex-wrap px-2">
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <i className="ri-lock-2-fill text-gray-300 text-xs"></i>
                256-bit SSL
              </span>
              <span className="text-gray-200 text-xs">·</span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <i className="ri-shield-check-line text-gray-300 text-xs"></i>
                HIPAA Compliant
              </span>
              <span className="text-gray-200 text-xs">·</span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <i className="ri-user-star-line text-gray-300 text-xs"></i>
                State-Licensed
              </span>
            </div>
          </div>
        </div>

        {/* ════ LEFT COLUMN (trust/content) ════ */}
        <div className="order-2 lg:order-1 lg:col-start-1 lg:col-span-3 flex flex-col gap-4 lg:gap-5">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-[#1A5C4F] px-4 sm:px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-xl flex-shrink-0">
                  <i className="ri-shield-check-fill text-white text-lg"></i>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-white leading-snug">
                    You Only Pay for a Valid ESA Letter — Guaranteed
                  </h3>
                  <p className="text-[11px] text-white/70 mt-0.5">
                    100% money-back if you don&apos;t qualify
                  </p>
                </div>
              </div>
            </div>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <i className="ri-verified-badge-line text-orange-500 text-sm"></i>
                Landlord Verification Included
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { icon: "ri-qr-code-line", text: "Unique Verification ID in every letter" },
                  { icon: "ri-eye-off-line", text: "Landlords verify — no health info disclosed" },
                  { icon: "ri-user-star-line", text: "Issued by state-licensed professionals" },
                  { icon: "ri-home-heart-line", text: "Accepted under the Fair Housing Act" },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex items-center gap-2.5 min-w-0"
                  >
                    <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                      <i className={`${item.icon} text-orange-500 text-xs`}></i>
                    </div>
                    <span className="text-xs text-gray-700 font-medium leading-snug">
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Link
                  to="/ESA-letter-verification"
                  className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-bold text-orange-500 hover:underline cursor-pointer"
                >
                  <i className="ri-external-link-line text-xs"></i>
                  How verification works
                </Link>
              </div>
            </div>
            <div className="bg-[#eef2f9] border-t border-[#b8cce4] px-4 sm:px-5 py-3 flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className="ri-phone-line text-[#1A5C4F] text-sm"></i>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Prefer to call?{" "}
                <a
                  href="tel:+14099655885"
                  className="font-bold underline cursor-pointer hover:text-[#1A5C4F]"
                >
                  409-965-5885
                </a>{" "}
                — complete your evaluation by phone.
              </p>
            </div>
          </div>

          <div className="block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <i className="ri-award-line text-xs"></i>
                  What You&apos;ll Receive
                </p>
                <p className="text-sm font-extrabold text-gray-900">
                  Your Official ESA Letter
                </p>
              </div>
              <span className="flex-shrink-0 text-[9px] font-extrabold tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 uppercase">
                Sample
              </span>
            </div>
            <div className="w-full bg-gradient-to-b from-gray-100 to-gray-50 border-b border-gray-100 px-4 sm:px-8 py-5 sm:py-6">
              <div className="rounded-lg overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.10)] ring-1 ring-amber-100 bg-white mx-auto max-w-[520px]">
                <img
                  src="/images/checkout/esa-sample-letter.svg"
                  alt="Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature"
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <i key={i} className="ri-star-fill text-amber-400 text-xs"></i>
                  ))}
                </div>
                <p className="text-xs text-gray-500 font-medium">
                  4.9/5 · 2,400+ verified reviews
                </p>
              </div>
            </div>
          </div>

          <div className="sm:hidden bg-white rounded-2xl border border-gray-200 px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <i key={i} className="ri-star-fill text-amber-400 text-sm"></i>
                ))}
              </div>
              <p className="text-sm font-bold text-gray-800">4.9/5</p>
              <p className="text-xs text-gray-400">· 2,400+ verified reviews</p>
            </div>
            <div className="space-y-2.5">
              {[
                {
                  name: "Sarah M.",
                  state: "CA",
                  text: "Got my letter in under 24 hours. My landlord accepted it immediately!",
                },
                {
                  name: "James T.",
                  state: "TX",
                  text: "Super easy process. The provider was professional and thorough.",
                },
                {
                  name: "Maria L.",
                  state: "FL",
                  text: "Finally found a service I can trust. Completely changed my housing situation.",
                },
              ].map((r) => (
                <div key={r.name} className="bg-orange-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <i
                          key={i}
                          className="ri-star-fill text-amber-400 text-[10px]"
                        ></i>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-gray-700">
                      {r.name}
                    </span>
                    <span className="text-[10px] text-gray-400">{r.state}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── What Happens Next ── */}
      <div className="mt-8 sm:mt-14">
        <div className="text-center mb-6 sm:mb-8">
          <SectionLabel>After Checkout</SectionLabel>
          <h3 className="text-lg sm:text-xl font-extrabold text-gray-900">
            What Happens Next
          </h3>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed px-4">
            Here&apos;s exactly what happens from submission to your door.
          </p>
        </div>
        <div className="relative">
          <div className="hidden lg:block absolute top-[38px] left-[calc(12.5%-18px)] right-[calc(12.5%-18px)] h-px bg-gray-200 z-0" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-4">
            {[
              {
                num: "01",
                icon: "ri-file-check-line",
                color: "bg-amber-500",
                title: "Assessment Submitted",
                desc: "Your evaluation answers are immediately available to a licensed provider in your state.",
              },
              {
                num: "02",
                icon: "ri-stethoscope-line",
                color: "bg-orange-500",
                title: "Licensed Provider Review",
                desc: "A board-licensed mental health professional evaluates your case within your chosen delivery window.",
              },
              {
                num: "03",
                icon: "ri-mail-check-line",
                color: "bg-orange-500",
                title: "ESA Letter Delivered",
                desc: "Your signed, official ESA letter is emailed as a professional PDF document — ready to use.",
              },
              {
                num: "04",
                icon: "ri-home-heart-line",
                color: "bg-emerald-500",
                title: "Use for Housing",
                desc: "Present your letter with full Fair Housing Act protection for rentals, vacation homes, or college housing.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="flex lg:flex-col items-start lg:items-center gap-3 lg:gap-0 relative z-10"
              >
                <div
                  className={`w-12 h-12 flex-shrink-0 flex items-center justify-center ${step.color} rounded-2xl lg:mb-4`}
                >
                  <i className={`${step.icon} text-white text-lg`}></i>
                </div>
                <div className="lg:text-center min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 lg:justify-center flex-wrap">
                    <span className="text-[10px] font-extrabold text-gray-300">
                      {step.num}
                    </span>
                    <p className="text-sm font-bold text-gray-900">{step.title}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="mt-8 sm:mt-10">
        <button
          type="button"
          onClick={onBack}
          className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-orange-50 border border-orange-200 text-orange-600 font-bold text-sm rounded-lg hover:bg-orange-100 hover:border-orange-300 transition-colors cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>
          Back to Step 2
        </button>
      </div>
    </div>
  );
}