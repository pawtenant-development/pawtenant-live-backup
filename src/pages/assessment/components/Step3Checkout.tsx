// Step3Checkout — Payment orchestration (Card / Klarna / QR tabs)
import { useState, useEffect, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import type { Step1Data } from "./Step1Assessment";
import type { Step2Data } from "./Step2PersonalInfo";
import PolicyModal from "./PolicyModal";
import StripePaymentForm from "./StripePaymentForm";
import KlarnaPaymentTab from "./KlarnaPaymentTab";
import QRPaymentTab from "./QRPaymentTab";

// ─── Module-level Stripe constants ───────────────────────────────────────────
const stripePromise = loadStripe(
  import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const STRIPE_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    colorPrimary: "#1a5c4f",
    colorBackground: "#ffffff",
    colorText: "#1f2937",
    colorDanger: "#ef4444",
    fontFamily: "inherit",
    borderRadius: "8px",
  },
};

/** One-time price — scales with pet count + delivery speed */
function getOneTimePrice(petCount: number, deliverySpeed: string): number {
  const tier   = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isFast = deliverySpeed !== "2-3days";
  if (tier === 1) return isFast ? 115 : 100;
  if (tier === 2) return isFast ? 130 : 115;
  return               isFast ? 145 : 130;
}

/** Annual subscription price — scales with pet count + delivery speed */
function getAnnualSubPrice(petCount: number, deliverySpeed: string): number {
  const tier   = petCount >= 3 ? 3 : petCount === 2 ? 2 : 1;
  const isFast = deliverySpeed !== "2-3days";
  if (tier === 1) return isFast ? 105 : 90;
  if (tier === 2) return isFast ? 120 : 105;
  return               isFast ? 135 : 120;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  onPaymentSuccess?: (paymentIntentId: string) => void;
  petCount?: number;
  onBeforeRedirect?: () => void;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

// ─── CouponRow Component ──────────────────────────────────────────────────────

interface CouponRowProps {
  basePrice: number;
  onDiscountChange: (discount: number, code: string) => void;
}

function CouponRow({ basePrice, onDiscountChange }: CouponRowProps) {
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);

  const handleApply = async () => {
    if (!code.trim()) return;
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
        body: JSON.stringify({ code: code.trim().toUpperCase(), amount: basePrice }),
      });
      const data = await res.json() as {
        valid?: boolean;
        discount?: number;
        error?: string;
      };
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
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#1a5c4f] transition-colors placeholder-gray-400"
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className={`whitespace-nowrap px-4 py-2.5 text-xs font-extrabold rounded-xl transition-colors flex-shrink-0 ${
            loading || !code.trim()
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-[#1a5c4f] text-white hover:bg-[#164d42] cursor-pointer"
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

// ─── SecurePaymentCard — Card / Klarna / QR tabs ──────────────────────────────

type PayTabType = "card" | "klarna" | "qr";

interface SecurePaymentCardProps {
  totalPrice: number;
  stripeClientSecret?: string;
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
  onDiscountChange: (discount: number, code: string) => void;
}

function SecurePaymentCard({
  totalPrice,
  stripeClientSecret,
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
  onDiscountChange,
}: SecurePaymentCardProps) {
  const isSubscription = plan === "subscription";
  const [activeTab, setActiveTab] = useState<PayTabType>("card");

  // Agreement state for each tab
  const [cardAgreed, setCardAgreed] = useState(false);
  const [cardAgreedError, setCardAgreedError] = useState(false);
  const [klarnaAgreed, setKlarnaAgreed] = useState(false);
  const [klarnaAgreedError, setKlarnaAgreedError] = useState(false);
  const [qrAgreed, setQrAgreed] = useState(false);
  const [qrAgreedError, setQrAgreedError] = useState(false);

  const [elementsOptions, setElementsOptions] = useState<StripeElementsOptions | null>(
    isSubscription ? { appearance: STRIPE_APPEARANCE } : null
  );

  // Wire parent clientSecret for one-time payments
  useEffect(() => {
    if (!isSubscription && stripeClientSecret && !elementsOptions) {
      setElementsOptions({ clientSecret: stripeClientSecret, appearance: STRIPE_APPEARANCE });
    }
  }, [stripeClientSecret, elementsOptions, isSubscription]);

  // Reset when plan changes
  useEffect(() => {
    setElementsOptions(isSubscription ? { appearance: STRIPE_APPEARANCE } : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // Coupon slot to pass to payment forms
  const couponSlot = useMemo(() => (
    <CouponRow basePrice={priceBeforeDiscount} onDiscountChange={onDiscountChange} />
  ), [priceBeforeDiscount, onDiscountChange]);

  const installment = (totalPrice / 4).toFixed(2);

  // Handle successful payment
  const handlePaymentSuccess = (paymentIntentId: string) => {
    onPaymentSuccess?.(paymentIntentId);
  };

  const handlePaymentError = (message: string) => {
    console.error("Payment error:", message);
    // Error is shown within the payment component
  };

  const handleBeforeSubmit = () => {
    onBeforeRedirect?.();
    return true;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-orange-400 to-orange-300 px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center bg-black/10 border border-black/10 rounded-xl flex-shrink-0">
            <i className="ri-lock-2-line text-black/70 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-black tracking-tight">Secure Payment</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex items-center gap-1.5 bg-white/90 rounded-md px-2 py-0.5">
                <span className="text-[10px] font-bold text-[#635BFF]">256-bit SSL</span>
                <span className="text-[10px] text-gray-400">·</span>
                <span className="text-[10px] font-bold text-[#635BFF]">Powered by Stripe</span>
              </div>
            </div>
          </div>
        </div>
        {/* Card brand icons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Visa */}
          <div
            className="h-7 px-2 flex items-center justify-center bg-white rounded"
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.18)", minWidth: "36px" }}
          >
            <span style={{ color: "#1a1f71", fontSize: "11px", fontWeight: 900, fontStyle: "italic", letterSpacing: "-0.5px" }}>
              VISA
            </span>
          </div>
          {/* Mastercard */}
          <div
            className="h-7 flex items-center justify-center bg-white rounded relative overflow-hidden"
            style={{ width: "42px", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }}
          >
            <div style={{ position: "absolute", left: "5px", width: "20px", height: "20px", borderRadius: "50%", background: "#eb001b" }}></div>
            <div style={{ position: "absolute", left: "17px", width: "20px", height: "20px", borderRadius: "50%", background: "#f79e1b", opacity: 0.9 }}></div>
          </div>
          {/* Amex */}
          <div
            className="h-7 px-2 flex items-center justify-center rounded"
            style={{ background: "#006fcf", boxShadow: "0 1px 4px rgba(0,0,0,0.18)", minWidth: "36px" }}
          >
            <span style={{ color: "white", fontSize: "9px", fontWeight: 800, letterSpacing: "0.06em" }}>
              AMEX
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex border-b border-gray-100 bg-gray-50/50">
        {/* Card tab */}
        <button
          type="button"
          onClick={() => setActiveTab("card")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "card"
              ? "text-orange-400 border-b-2 border-orange-400 bg-white"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <i className="ri-bank-card-line text-sm"></i>Card
        </button>
        {/* Klarna tab - only for one-time */}
        {!isSubscription && (
          <button
            type="button"
            onClick={() => setActiveTab("klarna")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "klarna"
                ? "text-[#ff679a] border-b-2 border-[#ff679a] bg-white"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#ffb3c7] text-[9px] font-extrabold text-[#17120e]">K</span>
            Klarna
          </button>
        )}
        {/* QR tab */}
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "qr"
              ? "text-orange-400 border-b-2 border-orange-400 bg-white"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <i className="ri-qr-code-line text-sm"></i>QR / Mobile
        </button>
      </div>

      {/* ══════════ CARD TAB ══════════ */}
      {activeTab === "card" && (
        <>
          {/* Subscription hint */}
          {isSubscription && (
            <div className="mx-4 sm:mx-5 mt-4 mb-1 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                <i className="ri-refresh-line text-emerald-600 text-sm"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-emerald-900 leading-snug">Annual Subscription</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">Billed yearly · Cancel anytime from your portal</p>
              </div>
            </div>
          )}

          {/* Card form */}
          {!elementsOptions ? (
            <div className="mx-4 sm:mx-5 my-5 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center bg-white border border-gray-200 rounded-2xl">
                <i className="ri-loader-4-line animate-spin text-[#1a5c4f] text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-600">Loading Secure Checkout</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">Setting up your encrypted payment form...</p>
              </div>
            </div>
          ) : (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <StripePaymentForm
                clientSecret={isSubscription ? undefined : stripeClientSecret}
                amount={totalPrice}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                onBeforeSubmit={handleBeforeSubmit}
                agreed={cardAgreed}
                setAgreed={setCardAgreed}
                agreedError={cardAgreedError}
                setAgreedError={setCardAgreedError}
                couponSlot={couponSlot}
              />
            </Elements>
          )}
        </>
      )}

      {/* ══════════ KLARNA TAB ══════════ */}
      {activeTab === "klarna" && !isSubscription && (
        <>
          {couponSlot}
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
          />
        </>
      )}

      {/* ══════════ QR / MOBILE TAB ══════════ */}
      {activeTab === "qr" && (
        <>
          {couponSlot}
          <QRPaymentTab
            amount={totalPrice}
            plan={plan}
            petCount={petCount}
            deliverySpeed={deliverySpeed}
            email={email}
            firstName={firstName}
            lastName={lastName}
            state={state}
            agreed={qrAgreed}
            setAgreed={setQrAgreed}
            agreedError={qrAgreedError}
            setAgreedError={setQrAgreedError}
            confirmationId={confirmationId}
            onSuccess={() => onPaymentSuccess?.("qr-success")}
          />
        </>
      )}

      {/* ── Call to order footer ── */}
      <div className="bg-amber-50 border-t border-amber-200 px-4 sm:px-5 py-3 flex items-start gap-2">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-phone-line text-amber-500 text-sm"></i>
        </div>
        <p className="text-xs text-amber-800 leading-relaxed">
          Prefer to call?{" "}
          <a href="tel:+14099655885" className="font-bold underline cursor-pointer hover:text-amber-900">
            409-965-5885
          </a>{" "}
          — complete your evaluation by phone.
        </p>
      </div>
    </div>
  );
}

// ─── YouTubeShort ─────────────────────────────────────────────────────────────

function YouTubeShort() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <SectionLabel>Customer Stories</SectionLabel>
        <h3 className="text-sm font-extrabold text-gray-900">Hear From Real Pet Parents</h3>
      </div>
      {/* Responsive 9:16 short embed container */}
      <div className="mx-5 mb-5 rounded-xl overflow-hidden bg-[#0f1e1a]" style={{ aspectRatio: "9/16", maxHeight: 420 }}>
        <iframe
          src="https://www.youtube.com/embed?listType=user_uploads&list=pawtenant&rel=0&modestbranding=1&playsinline=1"
          title="PawTenant Customer Stories"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          style={{ border: "none" }}
        />
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <i key={i} className="ri-star-fill text-amber-400 text-xs"></i>
            ))}
          </div>
          <p className="text-xs text-gray-500 font-medium">4.9/5 · 2,400+ verified reviews</p>
        </div>
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
  onPaymentSuccess,
  confirmationId = "",
  petCount,
  onBeforeRedirect,
}: Step3CheckoutProps) {
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  const resolvedPetCount    = petCount ?? step2.pets?.length ?? 1;
  const resolvedDelivery    = step2.deliverySpeed ?? "2-3days";
  const is2to3Days          = resolvedDelivery === "2-3days";
  const basePrice           = getOneTimePrice(resolvedPetCount, resolvedDelivery);
  const subPrice            = getAnnualSubPrice(resolvedPetCount, resolvedDelivery);
  const selectedPlan        = data.plan ?? "one-time";
  const priceBeforeDiscount = selectedPlan === "subscription" ? subPrice : basePrice;
  const totalPrice          = Math.max(0, priceBeforeDiscount - couponDiscount);

  const deliveryLabel = is2to3Days ? "Standard — 2–3 day delivery" : "Priority — 24-hour delivery";
  const deliveryBadge = is2to3Days ? "2–3 Business Days" : "Within 24 Hours";
  const customerName  = [step2.firstName, step2.lastName].filter(Boolean).join(" ") || "—";

  const openPolicy = (path: string, title: string) => setPolicyModal({ url: path, title });
  void openPolicy;

  const paymentCardProps: SecurePaymentCardProps = {
    totalPrice,
    stripeClientSecret,
    onPaymentSuccess,
    petCount: resolvedPetCount,
    email:         step2.email,
    firstName:     step2.firstName,
    lastName:      step2.lastName,
    state:         step2.state,
    deliverySpeed: step2.deliverySpeed,
    confirmationId,
    onBeforeRedirect,
    plan: selectedPlan,
    priceBeforeDiscount,
    onDiscountChange: (discount) => setCouponDiscount(discount),
  };

  return (
    <div>
      {policyModal && (
        <PolicyModal url={policyModal.url} title={policyModal.title} onClose={() => setPolicyModal(null)} />
      )}

      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-[#e8f5f1] border border-[#b8ddd5] rounded-full px-4 py-2 mb-4">
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-shield-check-line text-[#1a5c4f] text-sm"></i>
          </div>
          <span className="text-xs font-bold text-[#1a5c4f] uppercase tracking-wider">
            Secure Evaluation Checkout
          </span>
        </div>
        <p className="text-sm text-gray-500 max-w-xl mx-auto leading-relaxed px-4">
          Based on your responses, you are eligible for an ESA letter. A licensed provider
          will review your case immediately after checkout.
        </p>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-6 lg:gap-8">

        {/* ════ RIGHT COLUMN (payment) — first on mobile ════ */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2">
          <div className="lg:sticky top-28 space-y-4">

            {/* ── Order Summary ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-400 to-orange-300 px-4 sm:px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-black/50 font-bold uppercase tracking-wider mb-0.5">Order Summary</p>
                    <p className="text-sm font-extrabold text-black leading-snug">
                      Clinical Evaluation + ESA Documentation
                    </p>
                  </div>
                  <div className="w-10 h-10 flex items-center justify-center bg-black/10 rounded-xl flex-shrink-0">
                    <i className="ri-file-text-line text-black/70 text-lg"></i>
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-5 pt-4 pb-4 space-y-4">
                {/* Product row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0 mt-0.5">
                      <i className="ri-file-text-line text-[#1a5c4f] text-base"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-gray-800 leading-snug">ESA Letter Package</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <i className="ri-time-line text-xs flex-shrink-0"></i>
                        <span>{deliveryLabel}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-extrabold text-gray-900">${priceBeforeDiscount}.00</span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-gray-400 line-through">${basePrice}.00</span>
                    )}
                  </div>
                </div>

                {/* Discount row */}
                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className="ri-coupon-3-line text-emerald-500 text-sm"></i>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">Discount applied</span>
                    </div>
                    <span className="text-sm font-extrabold text-emerald-600">-${couponDiscount.toFixed(2)}</span>
                  </div>
                )}

                {/* Delivery badge */}
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    <i className="ri-timer-flash-line text-amber-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Delivery Time</p>
                    <p className="text-xs font-semibold text-amber-700 mt-0.5">{deliveryBadge}</p>
                  </div>
                </div>

                {/* Included */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2.5">What&apos;s Included</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line",   text: "Official ESA letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-home-heart-line",   text: "Fair Housing Act" },
                    ].map((item) => (
                      <div key={item.text} className="flex items-center gap-1.5 min-w-0">
                        <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                          <i className={`${item.icon} text-[#1a5c4f] text-xs`}></i>
                        </div>
                        <span className="text-xs text-gray-700 font-bold truncate">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Total bar */}
              <div className="bg-gradient-to-r from-orange-400 to-orange-300 px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-black/60 font-bold uppercase tracking-wider">Amount Due Today</p>
                  <p className="text-[10px] text-black/50 mt-0.5 leading-snug">
                    {selectedPlan === "subscription" ? "Annual renewal · cancel anytime" : "One-time · no recurring charges"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-2xl font-extrabold text-black">${totalPrice}.00</span>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-black/60 mt-0.5">per year</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Klarna info badge ── */}
            <div className="bg-[#fff0f5] border border-[#f9c6d8] rounded-2xl px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-16 h-8 flex items-center justify-center bg-[#ffb3c7] rounded-lg text-sm font-extrabold text-[#17120e] tracking-tight flex-shrink-0">
                  Klarna
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800">
                    4 interest-free payments of ${(totalPrice / 4).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">No credit impact · Instant approval</p>
                </div>
              </div>
            </div>

            {/* ── Plan Toggle ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Price Options</p>
              </div>
              <div className="px-3 sm:px-4 py-4 space-y-2.5">
                {/* Subscription */}
                <button
                  type="button"
                  onClick={() => onChange({ ...data, plan: "subscription" })}
                  className={`w-full text-left rounded-xl border-2 px-3 sm:px-4 py-3.5 transition-all cursor-pointer ${
                    selectedPlan === "subscription"
                      ? "border-[#1a5c4f] bg-[#f0faf7]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPlan === "subscription" ? "border-[#1a5c4f]" : "border-gray-300"
                      }`}>
                        {selectedPlan === "subscription" && (
                          <div className="w-2 h-2 rounded-full bg-[#1a5c4f]"></div>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-gray-800">Subscribe &amp; Save</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                        BEST VALUE
                      </span>
                      <span className="text-sm font-extrabold text-[#1a5c4f] whitespace-nowrap">${subPrice}.00</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 ml-6 leading-relaxed">
                    Never lose ESA status · Auto-renews annually · Cancel anytime
                  </p>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-emerald-600 font-semibold mt-1.5 ml-6 flex items-center gap-1">
                      <i className="ri-checkbox-circle-fill"></i>
                      Saving ${basePrice - subPrice}.00 per year
                    </p>
                  )}
                </button>

                {/* One-time */}
                <button
                  type="button"
                  onClick={() => onChange({ ...data, plan: "one-time" })}
                  className={`w-full text-left rounded-xl border-2 px-3 sm:px-4 py-3.5 transition-all cursor-pointer ${
                    selectedPlan === "one-time"
                      ? "border-[#1a5c4f] bg-[#f0faf7]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPlan === "one-time" ? "border-[#1a5c4f]" : "border-gray-300"
                      }`}>
                        {selectedPlan === "one-time" && (
                          <div className="w-2 h-2 rounded-full bg-[#1a5c4f]"></div>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-gray-800">One-time Purchase</span>
                    </div>
                    <span className="text-sm font-extrabold text-gray-700 whitespace-nowrap">${basePrice}.00</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6 leading-relaxed">
                    Single payment · 4 interest-free payments via Klarna
                  </p>
                </button>
              </div>
            </div>

            {/* ── Secure Payment (card/Klarna/QR tabs) ── */}
            <SecurePaymentCard {...paymentCardProps} />

            {/* ── SMS Consent ── */}
            <label className="flex items-start gap-2.5 cursor-pointer bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:border-gray-200 transition-colors">
              <input
                type="checkbox"
                checked={data.smsConsent ?? false}
                onChange={(e) => onChange({ ...data, smsConsent: e.target.checked })}
                className="mt-0.5 accent-[#1a5c4f] flex-shrink-0 cursor-pointer"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-700">(Optional)</span> I consent to receive
                automated text messages from PawTenant. Reply <strong>STOP</strong> to unsubscribe.{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">
                  Privacy Policy
                </a>{" "}
                &amp;{" "}
                <a href="/terms-of-use" target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">
                  Terms
                </a>.
              </span>
            </label>
          </div>
        </div>
        {/* ══ end RIGHT ══ */}

        {/* ════ LEFT COLUMN — second on mobile ════ */}
        <div className="order-2 lg:order-1 lg:col-start-1 lg:col-span-3 flex flex-col gap-5">

          {/* 1 ── Guarantee Banner ── */}
          <div className="bg-gradient-to-br from-[#e8f5f1] to-[#f5fbf9] border-2 border-[#b8ddd5] rounded-2xl p-5 sm:p-6">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-11 h-11 flex items-center justify-center bg-[#1a5c4f] rounded-xl flex-shrink-0">
                <i className="ri-shield-check-fill text-white text-xl"></i>
              </div>
              <div className="pt-1 min-w-0">
                <h3 className="text-sm font-extrabold text-[#1a5c4f] leading-snug">
                  You Only Pay for a Valid ESA Letter — Guaranteed
                </h3>
              </div>
            </div>
            <p className="text-sm text-[#1a5c4f]/80 mb-5 leading-relaxed">
              If you are not clinically eligible or your letter is not accepted for valid
              housing-related use, you&apos;ll receive a full refund according to our refund policy.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "ri-stethoscope-line", text: "Licensed provider review" },
                { icon: "ri-refund-2-line",     text: "Full refund protection" },
                { icon: "ri-shield-check-line", text: "HIPAA-secure information" },
                { icon: "ri-timer-flash-line",  text: "Fast delivery after approval" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 flex items-center justify-center bg-[#1a5c4f] rounded-full flex-shrink-0">
                    <i className={`${item.icon} text-white text-xs`}></i>
                  </div>
                  <span className="text-xs font-semibold text-[#1a5c4f] leading-snug">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2 ── Evaluation Profile ── */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 flex items-center justify-center bg-[#f0faf7] rounded-lg flex-shrink-0">
                  <i className="ri-user-line text-[#1a5c4f] text-sm"></i>
                </div>
                <p className="text-sm font-extrabold text-gray-900">Your Evaluation Profile</p>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="whitespace-nowrap flex items-center gap-1 text-xs font-semibold text-[#1a5c4f] hover:underline cursor-pointer flex-shrink-0"
              >
                <i className="ri-edit-line text-xs"></i>Edit info
              </button>
            </div>
            <div className="px-4 sm:px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Email",  value: step2.email || "—",            icon: "ri-mail-line" },
                  { label: "State",  value: step2.state || "—",            icon: "ri-map-pin-line" },
                  { label: "Phone",  value: step2.phone || "Not provided", icon: "ri-phone-line" },
                  { label: "Name",   value: customerName,                  icon: "ri-user-line" },
                ].map((field) => (
                  <div key={field.label} className="flex items-start gap-2.5 min-w-0">
                    <div className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0 mt-0.5">
                      <i className={`${field.icon} text-gray-400 text-sm`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{field.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 sm:px-5 pb-4">
              <div className="bg-[#f0faf7] rounded-xl px-3 py-2 flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-check-line text-[#1a5c4f] text-xs"></i>
                </div>
                <p className="text-xs text-[#1a5c4f]/80 leading-relaxed">
                  Your information is securely saved — no need to re-enter details.
                </p>
              </div>
            </div>
          </div>

          {/* 3 ── YouTube Short ── */}
          <YouTubeShort />
        </div>
        {/* ══ end LEFT ══ */}

      </div>

      {/* ════ BOTTOM — What Happens Next ════ */}
      <div className="mt-10 sm:mt-14">
        <div className="text-center mb-8">
          <SectionLabel>After Checkout</SectionLabel>
          <h3 className="text-xl font-extrabold text-gray-900">What Happens Next</h3>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed px-4">
            Here&apos;s exactly what happens from submission to your door.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-[38px] left-[calc(12.5%-18px)] right-[calc(12.5%-18px)] h-px bg-gray-200 z-0" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
            {[
              { num: "01", icon: "ri-file-check-line", color: "bg-amber-500",
                title: "Assessment Submitted",
                desc: "Your evaluation answers are immediately available to a licensed provider in your state." },
              { num: "02", icon: "ri-stethoscope-line", color: "bg-[#1a5c4f]",
                title: "Licensed Provider Review",
                desc: "A board-licensed mental health professional evaluates your case within your chosen delivery window." },
              { num: "03", icon: "ri-mail-check-line", color: "bg-[#1a5c4f]",
                title: "ESA Letter Delivered",
                desc: "Your signed, official ESA letter is emailed as a professional PDF document — ready to use." },
              { num: "04", icon: "ri-home-heart-line", color: "bg-emerald-500",
                title: "Use for Housing",
                desc: "Present your letter with full Fair Housing Act protection for rentals, vacation homes, or college housing." },
            ].map((step) => (
              <div key={step.num} className="flex lg:flex-col items-start lg:items-center gap-4 lg:gap-0 relative z-10">
                <div className={`w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center ${step.color} rounded-2xl lg:mb-4`}>
                  <i className={`${step.icon} text-white text-xl`}></i>
                </div>
                <div className="lg:text-center min-w-0">
                  <div className="flex items-center gap-2 mb-1 lg:justify-center flex-wrap">
                    <span className="text-[10px] font-extrabold text-gray-300">{step.num}</span>
                    <p className="text-sm font-bold text-gray-900">{step.title}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f]/10 border border-[#1a5c4f]/30 text-[#1a5c4f] font-bold text-sm rounded-lg hover:bg-[#1a5c4f]/15 hover:border-[#1a5c4f]/40 transition-colors cursor-pointer"
        >
          <i className="ri-arrow-left-line"></i>Back to Step 2
        </button>
      </div>
    </div>
  );
}