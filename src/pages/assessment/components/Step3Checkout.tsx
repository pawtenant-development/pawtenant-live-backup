// Step3Checkout — Payment orchestration (Card / Klarna tabs)
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { AnimatePresence, motion } from "framer-motion";
import type { Step1Data } from "./Step1Assessment";
import type { Step2Data } from "./Step2PersonalInfo";
import PolicyModal from "./PolicyModal";
import StripePaymentForm from "./StripePaymentForm";
import StripeCardForm from "./StripeCardForm";
import type { SubscriptionParams } from "./StripeCardForm";
import KlarnaPaymentTab from "./KlarnaPaymentTab";
import StateComplianceBanner, { isComplianceState } from "./StateComplianceBanner";
import { getEsaOneTimeTotal, getEsaAnnualTotal, getBundleOneTimeTotal, getBundleAnnualTotal, isRaBundle } from "@/config/pricing";
import Hud2026UpdateBanner from "../../../components/feature/Hud2026UpdateBanner";
import { Link } from "react-router-dom";
import CompactWhatHappensNext from "./step3/CompactWhatHappensNext";
import RefundReassurance from "./step3/RefundReassurance";
import SupportCard from "./step3/SupportCard";
import { US_STATES } from "../../../lib/usStates";

// ─── Module-level Stripe constants ───────────────────────────────────────────
const stripePromise = loadStripe(
  import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

// ─── Color System ────────────────────────────────────────────────────────────
// BRAND_GREEN (#1A5C4F) — calm, deep, used for trust signals (HIPAA chip,
// shield icons, "Reviewed by Licensed" card, etc.). Does NOT pop, by design.
const BRAND_GREEN = "#1A5C4F";
const BRAND_GREEN_SOFT = "#E8F1EE";
const BRAND_GREEN_BORDER = "#CFE2DC";

// ACTION_GREEN (emerald-600) — the single, consistent primary-CTA color for
// Step 3 checkout. Chosen over a harsh orange so the Pay buttons read as
// "secure transaction confirmation" (Apple Pay / Stripe success hue) rather
// than alert/urgency. Distinct from BRAND_GREEN (deeper teal) so it still
// pops against trust chips.
const ACTION_GREEN = "#059669";       // emerald-600
const ACTION_GREEN_DARK = "#047857";  // emerald-700 (hover/active)
const ACTION_GREEN_SOFT = "#ECFDF5";  // emerald-50
const ACTION_GREEN_BORDER = "#A7F3D0"; // emerald-200

// Orange retained ONLY for non-CTA value-prop accents — the "Save $X/yr"
// chip and the orange-tinted "Annual Subscription" notice. All primary
// actions use ACTION_GREEN now.
const ACTION_ORANGE = "#F97316";
const ACTION_ORANGE_DARK = "#EA580C";
const ACTION_ORANGE_SOFT = "#FFF7ED";
const ACTION_ORANGE_BORDER = "#FED7AA";

// Stronger card separation than the previous slate-200 border. Goal: cards
// should read as defined surfaces on mobile, with shadow giving subtle
// elevation without looking heavy.
const CARD_SHELL =
  "bg-white rounded-2xl border border-slate-300/90 shadow-[0_1px_0_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.18)] overflow-hidden";

const PAYMENT_SECTION_ID = "step3-payment-section";

const STRIPE_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    // Match the calm emerald action color so card-input focus rings and
    // selected radio states read as secure/grounded across the form.
    colorPrimary: ACTION_GREEN,
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    colorDanger: "#dc2626",
    fontFamily: "inherit",
    borderRadius: "10px",
  },
};

function getOneTimePrice(petCount: number): number {
  return getEsaOneTimeTotal(petCount);
}

function getAnnualSubPrice(petCount: number): number {
  return getEsaAnnualTotal(petCount);
}

// ─── Card brand marks (inline SVGs) ──────────────────────────────────────────

function VisaMark() {
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" fill="none" aria-label="Visa">
      <text x="0" y="9" fontFamily="Inter, Arial, sans-serif" fontWeight={900} fontStyle="italic" fontSize="11" letterSpacing="0.5" fill="#1A1F71">
        VISA
      </text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg width="30" height="18" viewBox="0 0 30 18" fill="none" aria-label="Mastercard">
      <circle cx="11" cy="9" r="7" fill="#EB001B" />
      <circle cx="19" cy="9" r="7" fill="#F79E1B" fillOpacity="0.92" />
      <path d="M15 4.2a6.98 6.98 0 0 1 0 9.6 6.98 6.98 0 0 1 0-9.6Z" fill="#FF5F00" />
    </svg>
  );
}

function AmexMark() {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-label="American Express">
      <rect x="0" y="0" width="34" height="14" rx="2" fill="#1F72CD" />
      <text x="17" y="10" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight={800} fontSize="8" letterSpacing="0.8" fill="#FFFFFF">
        AMEX
      </text>
    </svg>
  );
}

function DiscoverMark() {
  return (
    <svg width="46" height="12" viewBox="0 0 46 12" fill="none" aria-label="Discover">
      <text x="0" y="10" fontFamily="Inter, Arial, sans-serif" fontWeight={800} fontSize="9" letterSpacing="0.4" fill="#0F172A">
        DISCOVER
      </text>
      <circle cx="43" cy="6" r="3" fill="#F97316" />
    </svg>
  );
}

function CardBrandRow() {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="h-7 px-2 flex items-center justify-center bg-white rounded-md ring-1 ring-slate-200">
        <VisaMark />
      </div>
      <div className="h-7 px-1.5 flex items-center justify-center bg-white rounded-md ring-1 ring-slate-200">
        <MastercardMark />
      </div>
      <div className="h-7 px-1.5 flex items-center justify-center bg-white rounded-md ring-1 ring-slate-200">
        <AmexMark />
      </div>
      <div className="hidden sm:flex h-7 px-2 items-center justify-center bg-white rounded-md ring-1 ring-slate-200">
        <DiscoverMark />
      </div>
    </div>
  );
}

// ─── CouponPopup ─────────────────────────────────────────────────────────────
const COUPON_POPUP_SESSION_KEY = "esa_step3_coupon_popup_shown";
const COUPON_POPUP_CODE = "PAW20";

function CouponPopup({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_POPUP_CODE);
    } catch {
      // ignore clipboard errors — dismiss anyway
    }
    setCopied(true);
    setTimeout(onDismiss, 700);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] px-4"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <i className="ri-close-line text-lg"></i>
        </button>

        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: ACTION_ORANGE_SOFT }}
        >
          <i className="ri-price-tag-3-line text-xl" style={{ color: ACTION_ORANGE }}></i>
        </div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
          A Small Thank You
        </p>
        <h3 className="text-lg font-bold text-slate-900 mb-1.5 leading-snug">
          Your discount is ready
        </h3>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          Copy the code below and paste it into the discount field on this page.
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <span className="font-semibold tracking-[0.2em] text-slate-900 text-base">
            {COUPON_POPUP_CODE}
          </span>
          <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: ACTION_ORANGE_DARK }}>
            <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
            {copied ? "Copied" : "Copy code"}
          </span>
        </button>

        <p className="text-[11px] text-slate-400 mt-3">
          Tap anywhere outside to dismiss.
        </p>
      </motion.div>
    </motion.div>
  );
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
  /** Selected package (PACKAGE-RA-LETTER-BUNDLE-001): esa_standard | esa_ra_bundle. */
  packageKey?: string;
  onPackageChange?: (packageKey: string) => void;
  /** Return to the dedicated package-selection step (package is chosen there now). */
  onChangePackage?: () => void;
  onBeforeRedirect?: () => void;
  /**
   * Legacy-resume price lock (dollars). When set (>0), overrides the current
   * one-time base price for DISPLAY so a resumed order shows its original
   * quoted amount instead of the recalculated current price. The server
   * (create-payment-intent) is authoritative for the actual charge; this only
   * keeps the UI in sync. Ignored for the subscription plan (annual uses
   * current recurring Stripe prices).
   */
  quotedBasePrice?: number;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em] mb-2">
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

function CouponRow({ basePrice, appliedCoupon, onDiscountChange, busy = false }: CouponRowProps) {
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
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg flex-shrink-0 ring-1 ring-emerald-200">
            <i className="ri-check-line text-emerald-600 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-800 truncate">
              {appliedCoupon.code} applied
            </p>
            <p className="text-[11px] text-emerald-700/80">
              You save ${appliedCoupon.discount.toFixed(2)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy || loading}
          className="whitespace-nowrap text-[11px] font-semibold text-emerald-700 hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-close-line text-sm"></i>
          Remove
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative min-w-0">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center pointer-events-none">
            <i className="ri-price-tag-3-line text-slate-400 text-sm"></i>
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
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-slate-400 transition-colors placeholder-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || busy || !code.trim()}
          className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold rounded-xl transition-colors flex-shrink-0 ${
            loading || busy || !code.trim()
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
          }`}
        >
          {loading ? <i className="ri-loader-4-line animate-spin"></i> : "Apply"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-600 ml-1 flex items-center gap-1">
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
  /** Selected package key (PACKAGE-RA-LETTER-BUNDLE-001) — forwarded to Klarna. */
  packageKey?: string;
  /**
   * When true, pay buttons render disabled regardless of card/terms state.
   * Driven by state-specific compliance acknowledgment on ESA (AR/CA/IA/LA/MT).
   */
  complianceBlocked?: boolean;
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
  packageKey,
  complianceBlocked = false,
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
    <div
      id={PAYMENT_SECTION_ID}
      className={`${CARD_SHELL} ring-1 ring-emerald-200/70`}
      style={{ boxShadow: `0 1px 0 rgba(15,23,42,0.04), 0 14px 36px -16px rgba(5,150,105,0.18)` }}
    >
      {/* Header — emerald-tinted band so the Secure Payment surface reads as
          the primary, bank-secure section of Step 3. The SSL / PCI-DSS info
          lives directly under the Pay button so it isn't repeated here.
          flex-wrap + gap-y lets the card-brand row drop onto a second line
          on narrow desktop sidebars instead of squeezing the title. */}
      <div
        className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b"
        style={{ backgroundColor: ACTION_GREEN_SOFT, borderColor: ACTION_GREEN_BORDER }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ring-1 ring-emerald-200 bg-white"
          >
            <i className="ri-shield-keyhole-line text-lg" style={{ color: ACTION_GREEN_DARK }}></i>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 tracking-tight leading-tight">
              Secure Payment · ${totalPrice}
            </p>
          </div>
        </div>

        <CardBrandRow />
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={() => setActiveTab("card")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "card"
              ? "text-slate-900 border-b-2 border-slate-900 bg-white"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <i className="ri-bank-card-line text-sm"></i>
          Credit or Debit
        </button>

        {!isSubscription && (
          <button
            type="button"
            onClick={() => setActiveTab("klarna")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "klarna"
                ? "text-slate-900 border-b-2 border-slate-900 bg-white"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#ffb3c7] text-[9px] font-bold text-[#17120e]">
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
            <div
              className="mx-4 sm:mx-5 mt-4 mb-1 rounded-xl px-4 py-3 flex items-center gap-3 border"
              style={{
                backgroundColor: ACTION_ORANGE_SOFT,
                borderColor: ACTION_ORANGE_BORDER,
              }}
            >
              <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg flex-shrink-0 ring-1 ring-orange-200">
                <i className="ri-refresh-line text-sm" style={{ color: ACTION_ORANGE_DARK }}></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-snug" style={{ color: ACTION_ORANGE_DARK }}>
                  Annual Subscription
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
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
                appliedFromParent={appliedCoupon ?? null}
                onPaymentSuccess={handlePaymentSuccess}
                complianceBlocked={complianceBlocked}
              />
            </Elements>
          ) : stripeSecretLoading || !elementsOptions ? (
            <div className="mx-4 sm:mx-5 my-5 space-y-3">
              {couponSlot}

              <div className="border border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
                {stripeSecretError && !stripeSecretLoading ? (
                  <>
                    <div className="w-12 h-12 flex items-center justify-center bg-red-50 ring-1 ring-red-200 rounded-2xl">
                      <i className="ri-error-warning-line text-red-500 text-xl"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-700">
                        Payment setup failed
                      </p>
                      <p className="text-xs text-red-500 mt-1 leading-relaxed max-w-xs">
                        {stripeSecretError}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onRetryClientSecret}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <i className="ri-refresh-line"></i>
                      Try Again
                    </button>
                    <p className="text-xs text-slate-500">
                      Still having trouble?{" "}
                      <a href="tel:+14099655885" className="font-semibold hover:underline" style={{ color: BRAND_GREEN }}>
                        Call 409-965-5885
                      </a>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 flex items-center justify-center bg-white ring-1 ring-emerald-200 rounded-2xl">
                      <i className="ri-loader-4-line animate-spin text-xl" style={{ color: ACTION_GREEN }}></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Loading Secure Checkout
                      </p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
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
                  complianceBlocked={complianceBlocked}
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
            packageKey={packageKey}
            onSuccess={() => onPaymentSuccess?.("klarna-success")}
            couponCode={appliedCouponCode}
            complianceBlocked={complianceBlocked}
          />
        </>
      )}

      {/* Footer — green phone = trust/support */}
      <div className="bg-slate-50/70 border-t border-slate-100 px-4 sm:px-5 py-3 flex items-center gap-2">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <i className="ri-phone-line text-sm" style={{ color: BRAND_GREEN }}></i>
        </div>
        <p className="text-xs text-slate-600">
          Prefer to call?{" "}
          <a href="tel:+14099655885" className="font-semibold underline cursor-pointer" style={{ color: BRAND_GREEN }}>
            409-965-5885
          </a>{" "}
          — complete by phone.
        </p>
      </div>
    </div>
  );
}

// ─── MobileSummarySheet — slide-up order summary on mobile ───────────────────

interface MobileSummarySheetProps {
  open: boolean;
  onClose: () => void;
  priceBeforeDiscount: number;
  totalPrice: number;
  couponDiscount: number;
  selectedPlan: PlanType;
  basePrice: number;
  onCTA: () => void;
}

function MobileSummarySheet({
  open,
  onClose,
  priceBeforeDiscount,
  totalPrice,
  couponDiscount,
  selectedPlan,
  basePrice,
  onCTA,
}: MobileSummarySheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white pt-2.5 pb-1 flex items-center justify-center">
              <span className="w-10 h-1 rounded-full bg-slate-200"></span>
            </div>

            <div className="px-5 pt-2 pb-4 flex items-center justify-between border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em]">
                  Order Summary
                </p>
                <p className="text-base font-bold text-slate-900 tracking-tight mt-0.5">
                  Clinical Evaluation + ESA Letter
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0"
              >
                <i className="ri-close-line text-base"></i>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-file-text-line text-base" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                      ESA Letter Package
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Licensed provider review
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-slate-900">
                    ${priceBeforeDiscount}.00
                  </span>
                  {selectedPlan === "subscription" && (
                    <span className="text-[10px] text-slate-400 line-through">
                      ${basePrice}.00
                    </span>
                  )}
                </div>
              </div>

              {couponDiscount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="ri-price-tag-3-line text-emerald-600 text-sm"></i>
                    <span className="text-xs font-semibold text-emerald-700">
                      Discount applied
                    </span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">
                    -${couponDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-3">
                  What&apos;s Included
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {[
                    { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                    { icon: "ri-file-text-line", text: "Official ESA letter PDF" },
                    { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                    { icon: "ri-home-heart-line", text: "Fair Housing Act" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-1.5 min-w-0">
                      <i
                        className={`${item.icon} text-xs flex-shrink-0`}
                        style={{ color: BRAND_GREEN }}
                      ></i>
                      <span className="text-xs text-slate-700 font-medium truncate">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="rounded-2xl border bg-gradient-to-br from-slate-50 to-slate-100/80 px-4 py-4 flex items-center justify-between gap-3"
                style={{ borderColor: BRAND_GREEN_BORDER }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-[0.2em]">
                    Amount Due Today
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {selectedPlan === "subscription"
                      ? "Annual renewal · cancel anytime"
                      : "One-time · no recurring charges"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {couponDiscount > 0 && (
                    <span className="text-xs text-slate-400 line-through block leading-none mb-0.5">
                      ${priceBeforeDiscount}.00
                    </span>
                  )}
                  <span className="text-[26px] leading-none font-extrabold text-slate-900 tracking-tight">
                    ${totalPrice}
                    <span className="text-base font-bold">.00</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCTA();
                }}
                className="w-full py-3.5 text-sm font-extrabold rounded-xl flex items-center justify-center gap-1.5 text-white shadow-[0_8px_22px_-10px_rgba(5,150,105,0.45)]"
                style={{ backgroundColor: ACTION_GREEN }}
              >
                <i className="ri-arrow-down-line text-base"></i>
                Continue to Payment
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  packageKey = "esa_standard",
  onPackageChange,
  onChangePackage,
  onBeforeRedirect,
  onCouponApplied,
  appliedCoupon,
  quotedBasePrice,
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

  // ── Coupon popup: show once per session on Step 3 ──
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
    setShowCouponPopup(false);
  };

  const [showMobileSummary, setShowMobileSummary] = useState(false);

  // ── Sticky-CTA visibility ──
  // The sticky mobile bottom CTA acts as a scroll-helper to the payment form,
  // not as a second pay button. While the payment surface (card form / Klarna)
  // is itself on screen we hide the sticky bar so the user only sees ONE
  // primary payment button at a time — removes the "two buttons, which is
  // real?" trust-killer reported on mobile screenshots.
  const [paymentVisible, setPaymentVisible] = useState(false);
  useEffect(() => {
    const el = document.getElementById(PAYMENT_SECTION_ID);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Show the sticky helper only when the payment surface is mostly off
        // screen. 25% threshold gives a soft handoff so the bar doesn't
        // flicker as the user scrolls past it.
        setPaymentVisible(entry.intersectionRatio > 0.25);
      },
      { threshold: [0, 0.15, 0.25, 0.4, 0.6] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── State-law compliance acknowledgment (AR/CA/IA/LA/MT) ────────────────
  // The acknowledgment now happens at state selection in Step 2 (modal) and
  // arrives here as step2.stateAcknowledgment — valid only for the exact
  // state it was given for. The local checkbox remains ONLY as a fallback
  // for resumed orders that predate the early acknowledgment.
  const requiresCompliance = isComplianceState(step2.state);
  const earlyStateAck =
    step2.stateAcknowledgment &&
    step2.stateAcknowledgment.state === (step2.state ?? "").toUpperCase()
      ? step2.stateAcknowledgment
      : null;
  const [complianceAck, setComplianceAck] = useState(false);
  const [complianceAckError, setComplianceAckError] = useState(false);
  const complianceBlocked = requiresCompliance && !earlyStateAck && !complianceAck;

  const resolvedPetCount = petCount ?? step2.pets?.length ?? 1;
  // Legacy-resume lock: when the server provides a quoted base (resumed order),
  // use it for the ONE-TIME display so the shown price matches the actual
  // charge. Subscriptions always use current recurring pricing.
  const hasQuotedBase = typeof quotedBasePrice === "number" && quotedBasePrice > 0;
  // RA bundle = flat $179 one-time / $159 annual (1–3 pets). Legacy-quote lock
  // never applies to bundles, so ignore quotedBasePrice when a bundle is chosen.
  const isBundle = isRaBundle(packageKey);
  const basePrice = isBundle
    ? getBundleOneTimeTotal()
    : hasQuotedBase ? (quotedBasePrice as number) : getOneTimePrice(resolvedPetCount);
  const subPrice = isBundle ? getBundleAnnualTotal() : getAnnualSubPrice(resolvedPetCount);
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

  const scrollToPayment = () => {
    const el = document.getElementById(PAYMENT_SECTION_ID);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    packageKey,
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
    packageKey,
    complianceBlocked,
  };

  const cardClass = CARD_SHELL;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white pb-28 lg:pb-0"
    >
      <AnimatePresence>
        {showCouponPopup && <CouponPopup onDismiss={dismissCouponPopup} />}
      </AnimatePresence>

      {policyModal && (
        <PolicyModal
          url={policyModal.url}
          title={policyModal.title}
          onClose={() => setPolicyModal(null)}
        />
      )}

      {/* ── Mobile-only compact order summary banner — tap to expand ── */}
      <div className={`lg:hidden mb-4 ${cardClass}`}>
        <button
          type="button"
          onClick={() => setShowMobileSummary(true)}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: BRAND_GREEN_SOFT }}
            >
              <i className="ri-file-text-line text-base" style={{ color: BRAND_GREEN }}></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight tracking-tight">
                ESA Letter + Provider Review
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <i className="ri-eye-line text-[10px]"></i>
                View what&apos;s included
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            {couponDiscount > 0 && (
              <p className="text-[10px] text-slate-400 line-through leading-none">
                ${priceBeforeDiscount}.00
              </p>
            )}
            <p className="text-xl font-extrabold text-slate-900 tracking-tight leading-none mt-0.5">
              ${totalPrice}<span className="text-sm font-bold">.00</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {selectedPlan === "subscription" ? "per year · total" : "one-time · total"}
            </p>
          </div>
        </button>
      </div>

      {/* ── 2026 HUD support-animal housing expectation notice (state-aware) ──
          Concise, non-scary. Sets honest expectations before payment without a
          large scary block. Reuses the shared Hud2026UpdateBanner (compact). */}
      <Hud2026UpdateBanner state={step2.state} variant="compact" className="mb-4" />

      {/* The mobile-only state-aware reassurance chip has been moved into the
          right column AFTER the SecurePaymentCard so the top of mobile
          checkout stays focused on the order summary + payment surface. */}

      {/* ── Main grid ── */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-5 lg:gap-8">
        {/* ════ RIGHT COLUMN (payment) ════ */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2">
          <div className="lg:sticky lg:top-28 space-y-4 lg:space-y-5">
            {/* ── Desktop-only order summary ── */}
            <div className={`hidden lg:block ${cardClass}`}>
              <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50">
                <div className="min-w-0">
                  <SectionLabel>Order Summary</SectionLabel>
                  <p className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                    Clinical Evaluation + ESA Documentation
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: BRAND_GREEN_SOFT,
                    color: BRAND_GREEN,
                  }}
                >
                  <i className="ri-shield-check-line text-[11px]"></i>
                  Secure
                </span>
              </div>

              <div className="px-5 pt-4 pb-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: BRAND_GREEN_SOFT }}
                    >
                      <i className="ri-file-text-line text-base" style={{ color: BRAND_GREEN }}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 leading-snug">
                        ESA Letter Package
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Licensed provider review
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-slate-900">
                      ${priceBeforeDiscount}.00
                    </span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-slate-400 line-through">
                        ${basePrice}.00
                      </span>
                    )}
                  </div>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-price-tag-3-line text-emerald-600 text-sm"></i>
                      <span className="text-xs font-semibold text-emerald-700">
                        Discount applied
                      </span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      -${couponDiscount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-3">
                    What&apos;s Included
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line", text: "Official ESA letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-home-heart-line", text: "Fair Housing Act" },
                    ].map((item) => (
                      <div key={item.text} className="flex items-center gap-1.5 min-w-0">
                        <i
                          className={`${item.icon} text-xs flex-shrink-0`}
                          style={{ color: BRAND_GREEN }}
                        ></i>
                        <span className="text-xs text-slate-700 font-medium truncate">
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 border-t border-slate-200/70 px-5 py-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-[0.2em]">
                    Amount Due Today
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {selectedPlan === "subscription"
                      ? "Annual renewal · cancel anytime"
                      : "One-time · no recurring charges"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {couponDiscount > 0 && (
                    <span className="text-xs text-slate-400 line-through block leading-none mb-0.5">
                      ${priceBeforeDiscount}.00
                    </span>
                  )}
                  <span className="text-[30px] leading-none font-extrabold text-slate-900 tracking-tight">
                    ${totalPrice}
                    <span className="text-lg font-bold">.00</span>
                  </span>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-slate-500 mt-1.5">per year</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Selected package summary (chosen on the dedicated package step) ── */}
            <div className={`${cardClass} mb-3`}>
              <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <SectionLabel>Your Package</SectionLabel>
                  <p className="text-sm font-bold text-slate-900 leading-tight">
                    {isBundle ? "ESA + Reasonable Accommodation Letter" : "Standard ESA Letter"}
                  </p>
                  {isBundle && (
                    <span
                      className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: ACTION_ORANGE_SOFT, color: ACTION_ORANGE_DARK }}
                    >
                      Reasonable Accommodation bundle · landlord-ready
                    </span>
                  )}
                </div>
                {onChangePackage && (
                  <button
                    type="button"
                    onClick={onChangePackage}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold cursor-pointer whitespace-nowrap"
                    style={{ color: ACTION_GREEN_DARK }}
                  >
                    <i className="ri-arrow-left-right-line"></i> Change
                  </button>
                )}
              </div>
            </div>

            {/* ── Plan Toggle ── */}
            <div className={cardClass}>
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <SectionLabel>Choose Your Plan</SectionLabel>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    backgroundColor: ACTION_ORANGE_SOFT,
                    color: ACTION_ORANGE_DARK,
                  }}
                >
                  Save ${basePrice - subPrice}/yr
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.992 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => onChange({ ...data, plan: "subscription" })}
                  className={`relative w-full text-left rounded-xl px-4 py-3.5 transition-all cursor-pointer border-2 ${
                    selectedPlan === "subscription"
                      ? ""
                      : "bg-white hover:border-slate-300 border-slate-200 hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.18)]"
                  }`}
                  style={
                    selectedPlan === "subscription"
                      ? {
                          borderColor: ACTION_GREEN,
                          boxShadow: `0 0 0 4px ${ACTION_GREEN_SOFT}, 0 10px 24px -14px rgba(5,150,105,0.28)`,
                          backgroundColor: "#F6FCF9",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          borderColor:
                            selectedPlan === "subscription" ? ACTION_GREEN : "#CBD5E1",
                          backgroundColor:
                            selectedPlan === "subscription" ? ACTION_GREEN : "transparent",
                        }}
                      >
                        {selectedPlan === "subscription" && (
                          <i className="ri-check-line text-white text-[11px] font-bold"></i>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[15px] font-bold text-slate-900 block leading-tight">
                          Subscribe &amp; Save
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                          Auto-renews yearly · Cancel anytime
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full block mb-1 whitespace-nowrap uppercase tracking-wider"
                        style={{
                          backgroundColor: ACTION_GREEN,
                          color: "white",
                        }}
                      >
                        Recommended
                      </span>
                      <span className="text-base font-extrabold text-slate-900">
                        ${subPrice}
                        <span className="text-xs font-bold">.00</span>
                      </span>
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.992 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => onChange({ ...data, plan: "one-time" })}
                  className={`relative w-full text-left rounded-xl px-4 py-3.5 transition-all cursor-pointer border-2 ${
                    selectedPlan === "one-time"
                      ? ""
                      : "bg-white hover:border-slate-300 border-slate-200 hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.18)]"
                  }`}
                  style={
                    selectedPlan === "one-time"
                      ? {
                          borderColor: ACTION_GREEN,
                          boxShadow: `0 0 0 4px ${ACTION_GREEN_SOFT}, 0 10px 24px -14px rgba(5,150,105,0.28)`,
                          backgroundColor: "#F6FCF9",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          borderColor:
                            selectedPlan === "one-time" ? ACTION_GREEN : "#CBD5E1",
                          backgroundColor:
                            selectedPlan === "one-time" ? ACTION_GREEN : "transparent",
                        }}
                      >
                        {selectedPlan === "one-time" && (
                          <i className="ri-check-line text-white text-[11px] font-bold"></i>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[15px] font-bold text-slate-900 block leading-tight">
                          One-time Purchase
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                          Single payment · Klarna available
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-base font-extrabold text-slate-900">
                        ${basePrice}
                        <span className="text-xs font-bold">.00</span>
                      </span>
                    </div>
                  </div>
                </motion.button>
              </div>
            </div>

            {/* Klarna availability note — neutral payment-method mention */}
            {selectedPlan === "one-time" && (
              <div className="mt-3 sm:mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#ffb3c7] text-[10px] font-bold text-[#17120e] flex-shrink-0">
                  K
                </span>
                <p className="text-[12px] sm:text-xs text-slate-700 leading-snug min-w-0">
                  <span className="font-semibold text-slate-900">Klarna available at checkout.</span>
                  <span className="text-slate-500"> Subject to eligibility and </span>
                  <a
                    href="https://www.klarna.com/us/terms-of-use/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 underline hover:text-slate-700"
                  >
                    Klarna payment terms
                  </a>
                  <span className="text-slate-500">.</span>
                </p>
              </div>
            )}

            {/* ── State law compliance notice + required acknowledgment ── */}
            {requiresCompliance && earlyStateAck && (
              <div className="space-y-3">
                <StateComplianceBanner state={step2.state} />
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5">
                  <i className="ri-checkbox-circle-fill text-emerald-600 flex-shrink-0 mt-0.5"></i>
                  <span className="text-xs text-emerald-900 leading-relaxed">
                    <span className="font-bold">State notice acknowledged</span> — you confirmed the{" "}
                    {step2.state.toUpperCase()} waiting-period rules when you selected your state.
                    Your evaluation begins today; letter timing follows your state&apos;s rules.
                  </span>
                </div>
              </div>
            )}
            {requiresCompliance && !earlyStateAck && (
              <div className="space-y-3">
                <StateComplianceBanner state={step2.state} />
                <label
                  className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-4 py-3.5 transition-colors ${
                    complianceAckError
                      ? "border-red-300 bg-red-50"
                      : complianceAck
                        ? "bg-amber-50/60 border-amber-200"
                        : "bg-white border-slate-200 hover:border-amber-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={complianceAck}
                    onChange={(e) => {
                      setComplianceAck(e.target.checked);
                      if (e.target.checked) setComplianceAckError(false);
                    }}
                    className="mt-0.5 accent-amber-600 flex-shrink-0 cursor-pointer"
                    aria-required="true"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    I understand my selected state may require a waiting/client-provider
                    relationship period before my ESA documentation can be issued, and that
                    my final ESA letter may not be issued immediately.
                  </span>
                </label>
                {complianceAckError && (
                  <p className="text-xs text-red-600 ml-1 flex items-center gap-1">
                    <i className="ri-error-warning-line flex-shrink-0"></i>
                    Please acknowledge the state law notice before continuing.
                  </p>
                )}
              </div>
            )}

            <SecurePaymentCard {...paymentCardProps} />

            {/* Mobile-only state-aware reassurance chip — sits directly under
                the payment card so the state trust signal anchors the section
                that just charged the customer. Hidden on desktop where the
                left trust column already covers regional reassurance. */}
            {step2.state && (
              <div className="lg:hidden flex items-center gap-2.5 rounded-xl border border-[#CFE2DC] bg-[#E8F1EE]/60 px-3.5 py-2.5">
                <div
                  className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ backgroundColor: "#ffffff" }}
                >
                  <i className="ri-map-pin-line text-sm" style={{ color: BRAND_GREEN }}></i>
                </div>
                <p className="text-[11px] text-slate-700 leading-snug min-w-0">
                  <span className="font-bold text-slate-900">
                    {US_STATES.find((s) => s.code === step2.state.toUpperCase())?.name ?? step2.state}
                  </span>{" "}
                  <span className="text-slate-600">
                    housing documentation reviewed by a state-licensed provider where clinically appropriate.
                  </span>
                </p>
              </div>
            )}

            {/* Sample letter — MOBILE-ONLY position. Placed above the "what
                happens next" timeline so the customer sees what they're
                paying for first. On desktop the sample stays in the left
                trust column (rendered separately below). */}
            <div className={`${cardClass} lg:hidden`}>
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50">
                <div className="min-w-0">
                  <SectionLabel>What You&apos;ll Receive</SectionLabel>
                  <p className="text-sm font-bold text-slate-900 tracking-tight">
                    Your Official ESA Letter
                  </p>
                </div>
                <span className="flex-shrink-0 text-[9px] font-semibold tracking-[0.18em] text-slate-500 bg-white ring-1 ring-slate-200 rounded-full px-2 py-0.5 uppercase">
                  Sample
                </span>
              </div>
              <div className="relative w-full bg-slate-50 px-4 sm:px-8 py-5 sm:py-6">
                <div className="rounded-lg overflow-hidden shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 bg-white relative">
                  <img
                    src="/images/checkout/esa-sample-letter.svg"
                    alt="Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature"
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
                    Sample
                  </div>
                </div>
              </div>
              <div className="px-5 py-3.5 border-t border-slate-100 flex items-start gap-2.5">
                <i
                  className="ri-shield-check-line text-sm flex-shrink-0 mt-0.5"
                  style={{ color: BRAND_GREEN }}
                ></i>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Each letter includes a unique verification ID. Landlords can confirm authenticity directly — no health information is disclosed.
                </p>
              </div>
            </div>

            {/* Compact post-payment timeline — calm reassurance after the
                sample letter so the customer knows what happens after Pay. */}
            <CompactWhatHappensNext />

            {/* Trust indicators — GREEN */}
            <div className={`${cardClass} px-3 py-3.5`}>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-lock-2-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">
                    256-bit SSL
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 border-x border-slate-100">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-shield-check-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">
                    HIPAA-Compliant
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-user-star-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">
                    State-Licensed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ LEFT COLUMN (trust/content) ════ */}
        <div className="order-2 lg:order-1 lg:col-start-1 lg:col-span-3 flex flex-col gap-5 lg:gap-6">
          {/* Trust card — GREEN */}
          <div className={`${cardClass} relative`}>
            <div className="px-5 pt-5 pb-4 flex items-start gap-3.5">
              <div
                className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ backgroundColor: BRAND_GREEN_SOFT }}
              >
                <i className="ri-stethoscope-line text-xl" style={{ color: BRAND_GREEN }}></i>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                  Reviewed by Licensed Mental Health Professionals
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Every evaluation is completed by a board-licensed provider in your state
                  and issued in accordance with Fair Housing guidelines.
                </p>
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="h-px bg-slate-100 mb-4" />
              <SectionLabel>Landlord Verification Included</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { icon: "ri-shield-check-line", text: "Unique Verification ID on every letter" },
                  { icon: "ri-eye-off-line", text: "Landlords verify — no health info disclosed" },
                  { icon: "ri-user-star-line", text: "Signed by a state-licensed provider" },
                  { icon: "ri-home-heart-line", text: "Compliant with the Fair Housing Act" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{ backgroundColor: BRAND_GREEN_SOFT }}
                    >
                      <i className={`${item.icon} text-xs`} style={{ color: BRAND_GREEN }}></i>
                    </div>
                    <span className="text-xs text-slate-700 font-medium leading-snug">
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Link
                  to="/esa-letter-verification"
                  className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer"
                  style={{ color: BRAND_GREEN }}
                >
                  <i className="ri-external-link-line text-xs"></i>
                  How verification works
                </Link>
              </div>
            </div>
          </div>

          {/* Sample letter — DESKTOP-ONLY position. On desktop the sample
              sits in the left trust column at its original spot. Mobile has
              its own copy rendered in the right column above so the post-
              payment flow reads payment → what happens next → sample. */}
          <div className={`${cardClass} hidden lg:block`}>
            <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
              <div className="min-w-0">
                <SectionLabel>What You&apos;ll Receive</SectionLabel>
                <p className="text-sm font-bold text-slate-900 tracking-tight">
                  Your Official ESA Letter
                </p>
              </div>
              <span className="flex-shrink-0 text-[9px] font-semibold tracking-[0.18em] text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5 uppercase">
                Sample
              </span>
            </div>
            <div className="relative w-full bg-slate-50 px-4 sm:px-8 py-5 sm:py-6">
              <div className="rounded-lg overflow-hidden shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 bg-white relative">
                <img
                  src="/images/checkout/esa-sample-letter.svg"
                  alt="Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature"
                  className="w-full h-auto block"
                  loading="lazy"
                />
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
                  Sample
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-start gap-2.5">
              <i
                className="ri-shield-check-line text-sm flex-shrink-0 mt-0.5"
                style={{ color: BRAND_GREEN }}
              ></i>
              <p className="text-xs text-slate-600 leading-relaxed">
                Each letter includes a unique verification ID. Landlords can confirm authenticity directly — no health information is disclosed.
              </p>
            </div>
          </div>

          {/* Money-back protection — calm refund reassurance */}
          <RefundReassurance />

          {/* Support / contact card — calm, no chatbot */}
          <SupportCard />
        </div>
      </div>

      {/* Lower full "What Happens Next" timeline removed — superseded by the
          compact CompactWhatHappensNext card mounted near the payment area. */}

      {/* Back button */}
      <div className="mt-10">
        <button
          type="button"
          onClick={onBack}
          className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>
          Back to Step 2
        </button>
      </div>

      {/* ── Mobile slide-up order summary sheet ── */}
      <MobileSummarySheet
        open={showMobileSummary}
        onClose={() => setShowMobileSummary(false)}
        priceBeforeDiscount={priceBeforeDiscount}
        totalPrice={totalPrice}
        couponDiscount={couponDiscount}
        selectedPlan={selectedPlan}
        basePrice={basePrice}
        onCTA={scrollToPayment}
      />

      {/* ── STICKY MOBILE BOTTOM BAR ── scroll-helper, NOT a second pay button ──
          Hides while the real payment surface (card form / Klarna) is on
          screen so the user never sees two competing CTAs. Slides back in
          when the user scrolls away. The button still calls scrollToPayment
          — it never duplicates payment logic. */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-slate-200 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] transition-transform duration-200 ${
          paymentVisible ? "translate-y-full pointer-events-none" : "translate-y-0"
        }`}
        aria-hidden={paymentVisible}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMobileSummary(true)}
            className="flex-shrink-0 text-left cursor-pointer active:opacity-70 transition-opacity"
            aria-label="View order summary"
          >
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] leading-none">
              Total
            </p>
            <p className="flex items-baseline gap-1 mt-1 leading-none">
              {couponDiscount > 0 && (
                <span className="text-[11px] text-slate-400 line-through">
                  ${priceBeforeDiscount}
                </span>
              )}
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                ${totalPrice}
              </span>
              <i className="ri-arrow-up-s-line text-slate-400 text-sm"></i>
            </p>
          </button>

          <button
            type="button"
            onClick={scrollToPayment}
            className="flex-1 min-w-0 py-3.5 text-sm font-extrabold rounded-xl flex items-center justify-center gap-1.5 text-white tracking-tight transition-all active:scale-[0.98]"
            style={{
              backgroundColor: ACTION_GREEN,
              boxShadow: "0 8px 22px -10px rgba(5,150,105,0.45), 0 2px 6px -2px rgba(5,150,105,0.22)",
            }}
            aria-label="Jump to payment"
          >
            <i className="ri-arrow-down-line text-base flex-shrink-0"></i>
            <span className="truncate">Continue to Payment</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
