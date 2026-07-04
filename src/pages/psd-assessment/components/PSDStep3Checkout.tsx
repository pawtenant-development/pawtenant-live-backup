import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../../lib/supabaseClient";
import type { Step2Data } from "../../assessment/components/Step2PersonalInfo";
import type { PSDStep1Data } from "./PSDStep1";
import KlarnaPaymentTab from "../../assessment/components/KlarnaPaymentTab";
import StripePaymentForm from "../../assessment/components/StripePaymentForm";
import StripeCardForm from "../../assessment/components/StripeCardForm";
import { getPsdAnnualTotal, getPsdOneTimeTotal } from "@/config/pricing";
// ── 2026-05-21 PSD-STEP3-ESA-PARITY ─────────────────────────────────────────
// Reuse the polished trust/reassurance helpers ESA Step 3 mounts in its left
// column. These are intentionally pure presentational + brand-agnostic (they
// already render with the same calm-green palette used for trust copy across
// the product), so PSD shares the same emotional reassurance flow rather than
// rebuilding it from scratch in a slightly different visual key.
import CompactWhatHappensNext from "../../assessment/components/step3/CompactWhatHappensNext";
import RefundReassurance from "../../assessment/components/step3/RefundReassurance";
import SupportCard from "../../assessment/components/step3/SupportCard";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const stripePromise = loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

const STRIPE_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    colorPrimary: "#2c5282",
    colorBackground: "#ffffff",
    colorText: "#1f2937",
    colorDanger: "#ef4444",
    fontFamily: "inherit",
    borderRadius: "8px",
  },
};

// ── 2026-05-21 PSD-STEP3-ESA-PARITY ─────────────────────────────────────────
// Visual tokens lifted directly from src/pages/assessment/components/
// Step3Checkout.tsx so PSD Step 3 renders with the same card shell, the same
// brand-green trust accent, and the same action-orange CTA palette as ESA.
// Spacing rhythm, hierarchy, and typography all flow from these tokens.
const BRAND_GREEN = "#1A5C4F";
const BRAND_GREEN_SOFT = "#E8F1EE";
const ACTION_ORANGE = "#F97316";
const ACTION_ORANGE_SOFT = "#FFEDD5";
const ACTION_ORANGE_DARK = "#C2410C";

const CARD_SHELL =
  "bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_0_rgba(15,23,42,0.03),0_8px_28px_-14px_rgba(15,23,42,0.12)] overflow-hidden";

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">
      {children}
    </p>
  );
}

// ── 2026-05-21 PSD-STEP3-ESA-1TO1 ───────────────────────────────────────────
// Anchor id ESA Step 3 uses on its SecurePaymentCard so the mobile sticky
// bottom bar can `scrollIntoView` the customer down to the payment surface.
// Mirrored verbatim for PSD.
const PAYMENT_SECTION_ID = "step3-payment-section";

// PSD is now a SINGLE product (no Priority/Standard speed packages). The
// customer chooses only between a one-time letter and an annual subscription.
// Price depends solely on dog count. Delivery timing is general operational
// text, not a purchasable package — so a single fixed delivery_speed is sent
// to the backend for compatibility (amount is identical regardless).
type PSDPlan = "onetime" | "subscription";
type PayTabType = "card" | "klarna";

const PSD_ONETIME_DELIVERY = "24h";

function getPSDPlanPrice(key: PSDPlan, petCount: number): number {
  // Final structure: 1 dog $129 one-time / $109 annual; 2 or 3 dogs $149
  // one-time / $129 annual — fixed totals. Mirrors getPSDOneTimeAmount /
  // getPSDAnnualAmount in create-payment-intent.
  if (key === "subscription") return getPsdAnnualTotal(petCount);
  return getPsdOneTimeTotal(petCount);
}

const PLANS: {
  key: PSDPlan;
  label: string;
  sublabel: string;
  badge?: string;
  icon: string;
  desc: string;
}[] = [
  {
    key: "onetime",
    label: "PSD Letter — One-Time",
    sublabel: "One letter · no subscription",
    icon: "ri-file-shield-2-line",
    desc: "A one-time PSD letter reviewed by a licensed provider. Price depends only on the number of dogs.",
  },
  {
    key: "subscription",
    label: "Annual Subscription",
    sublabel: "Per year — renews annually",
    icon: "ri-calendar-2-line",
    desc: "Annual coverage — renew your PSD letter each year at a discounted rate.",
  },
];

// ── CouponRow ─────────────────────────────────────────────────────────────────

interface CouponRowProps {
  basePrice: number;
  onDiscountChange: (discount: number, code: string) => void;
}

function CouponRow({ basePrice, onDiscountChange }: CouponRowProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
              : "bg-[#2c5282] text-white hover:bg-[#164d42] cursor-pointer"
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

// ── SecurePaymentCard ─────────────────────────────────────────────────────────

interface SecurePaymentCardProps {
  totalPrice: number;
  clientSecret: string | null;
  onPaymentSuccess: (paymentIntentId: string) => void;
  selectedPlan: PSDPlan;
  petCount: number;
  email: string;
  firstName: string;
  lastName: string;
  state: string;
  confirmationId: string;
  priceBeforeDiscount: number;
  onDiscountChange: (discount: number, code: string) => void;
}

function SecurePaymentCard({
  totalPrice,
  clientSecret,
  onPaymentSuccess,
  selectedPlan,
  petCount,
  email,
  firstName,
  lastName,
  state,
  confirmationId,
  priceBeforeDiscount,
  onDiscountChange,
}: SecurePaymentCardProps) {
  const isSubscription = selectedPlan === "subscription";
  const [activeTab, setActiveTab] = useState<PayTabType>("card");
  const [elementsOptions, setElementsOptions] = useState<StripeElementsOptions | null>(
    isSubscription ? { appearance: STRIPE_APPEARANCE } : null
  );

  const [cardAgreed, setCardAgreed] = useState(false);
  const [cardAgreedError, setCardAgreedError] = useState(false);
  const [klarnaAgreed, setKlarnaAgreed] = useState(false);
  const [klarnaAgreedError, setKlarnaAgreedError] = useState(false);
  // ── 2026-05-21 PSD-NO-QR-TAB ────────────────────────────────────────────
  // PSD checkout intentionally offers only Card + Klarna (the QR / mobile-
  // wallet hosted-session was dropped per product spec). QRPaymentTab + its
  // agreed/error state are removed from this file accordingly.
  // Track applied coupon code to pass to Klarna tab and subscription backend
  const [appliedCouponCode, setAppliedCouponCode] = useState("");

  useEffect(() => {
    if (!isSubscription && clientSecret && !elementsOptions) {
      setElementsOptions({ clientSecret, appearance: STRIPE_APPEARANCE });
    }
  }, [clientSecret, elementsOptions, isSubscription]);

  useEffect(() => {
    setElementsOptions(isSubscription ? { appearance: STRIPE_APPEARANCE } : null);
    setActiveTab("card");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  // Wrap onDiscountChange to also capture the coupon code
  const handleDiscountChange = (discount: number, code: string) => {
    setAppliedCouponCode(discount > 0 ? code : "");
    onDiscountChange(discount, code);
  };

  const couponSlot = useMemo(() => (
    <CouponRow basePrice={priceBeforeDiscount} onDiscountChange={handleDiscountChange} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [priceBeforeDiscount]);

  const deliverySpeed = PSD_ONETIME_DELIVERY;

  // Subscription params for StripeCardForm lazy flow
  const subscriptionParams = {
    petCount,
    deliverySpeed,
    email,
    firstName,
    lastName,
    state,
    confirmationId,
    letterType: "psd" as const,
  };

  return (
    <div id={PAYMENT_SECTION_ID} className={CARD_SHELL}>
      {/* Header — ESA Step 3 SecurePaymentCard parity. w-9 h-9 icon, tighter
          card-brand chips (only 2 visible on narrow widths), leading-none on
          the title so the narrow right-column card never word-wraps. */}
      <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ backgroundColor: BRAND_GREEN_SOFT }}
          >
            <i className="ri-lock-2-line text-base" style={{ color: BRAND_GREEN }}></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 tracking-tight leading-none whitespace-nowrap">
              Secure Payment
            </p>
            <p className="text-[11px] text-slate-500 mt-1 whitespace-nowrap">
              256-bit SSL &middot; Powered by Stripe
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="h-6 px-1.5 flex items-center justify-center bg-white rounded ring-1 ring-slate-200" style={{ minWidth: "30px" }}>
            <span style={{ color: "#1a1f71", fontSize: "10px", fontWeight: 900, fontStyle: "italic", letterSpacing: "-0.5px" }}>VISA</span>
          </div>
          <div className="hidden sm:flex h-6 items-center justify-center bg-white rounded relative overflow-hidden ring-1 ring-slate-200" style={{ width: "36px" }}>
            <div style={{ position: "absolute", left: "5px", width: "16px", height: "16px", borderRadius: "50%", background: "#eb001b" }}></div>
            <div style={{ position: "absolute", left: "15px", width: "16px", height: "16px", borderRadius: "50%", background: "#f79e1b", opacity: 0.9 }}></div>
          </div>
          <div className="hidden sm:flex h-6 px-1.5 items-center justify-center rounded ring-1 ring-slate-200" style={{ background: "#006fcf", minWidth: "30px" }}>
            <span style={{ color: "white", fontSize: "8px", fontWeight: 800, letterSpacing: "0.06em" }}>AMEX</span>
          </div>
        </div>
      </div>

      {/* Tab switcher — 2-tab parity with ESA (Card + Klarna). PSD does not
          offer the QR / mobile-wallet hosted session. */}
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
                ? "text-[#ff679a] border-b-2 border-[#ff679a] bg-white"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#ffb3c7] text-[9px] font-extrabold text-[#17120e]">K</span>
            Klarna
          </button>
        )}
      </div>

      {/* CARD TAB */}
      {activeTab === "card" && (
        <>
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

          {/* ── SUBSCRIPTION: use StripeCardForm with lazy backend call ── */}
          {isSubscription ? (
            <Elements stripe={stripePromise} options={{ appearance: STRIPE_APPEARANCE }}>
              <StripeCardForm
                totalPrice={totalPrice}
                isSubscription={true}
                subscriptionParams={subscriptionParams}
                priceBeforeDiscount={priceBeforeDiscount}
                onDiscountChange={handleDiscountChange}
                onPaymentSuccess={onPaymentSuccess}
              />
            </Elements>
          ) : (
            /* ── ONE-TIME: wait for clientSecret, then use StripePaymentForm ── */
            !elementsOptions ? (
              <div className="mx-4 sm:mx-5 my-5 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center bg-white border border-gray-200 rounded-2xl">
                  <i className="ri-loader-4-line animate-spin text-[#2c5282] text-xl"></i>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-600">Loading Secure Checkout</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">Setting up your encrypted payment form...</p>
                </div>
              </div>
            ) : (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <StripePaymentForm
                  clientSecret={clientSecret ?? undefined}
                  amount={totalPrice}
                  onSuccess={onPaymentSuccess}
                  onError={() => {}}
                  agreed={cardAgreed}
                  setAgreed={setCardAgreed}
                  agreedError={cardAgreedError}
                  setAgreedError={setCardAgreedError}
                  couponSlot={couponSlot}
                />
              </Elements>
            )
          )}
        </>
      )}

      {/* KLARNA TAB */}
      {activeTab === "klarna" && !isSubscription && (
        <>
          <div className="px-4 sm:px-5 pt-4">{couponSlot}</div>
          <KlarnaPaymentTab
            amount={totalPrice}
            plan="one-time"
            letterType="psd"
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
            onSuccess={() => onPaymentSuccess("klarna-success")}
            couponCode={appliedCouponCode}
          />
        </>
      )}

      {/* QR / mobile-wallet tab intentionally removed for PSD per product
          spec — Card + Klarna only. */}

      {/* Call to order footer — calm slate footer matches ESA Step 3 phone strip */}
      <div className="bg-slate-50/70 border-t border-slate-100 px-5 py-3 flex items-center gap-2">
        <i className="ri-phone-line text-sm" style={{ color: BRAND_GREEN }}></i>
        <p className="text-xs text-slate-600 leading-relaxed">
          Prefer to call?{" "}
          <a href="tel:+14099655885" className="font-semibold underline cursor-pointer" style={{ color: BRAND_GREEN }}>
            409-965-5885
          </a>{" "}
          &mdash; complete your evaluation by phone.
        </p>
      </div>
    </div>
  );
}

// ── PSDSampleLetterCard ───────────────────────────────────────────────────────
//
// Replaces the previous YouTubeShort embed which used a `listType=user_uploads`
// playlist URL that frequently rendered as "This video is unavailable" — bad
// last impression right before checkout. Now mirrors the ESA Step 3 sample
// letter card (`src/pages/assessment/components/Step3Checkout.tsx` ~line 1512)
// but with the PSD sample SVG, PSD wording, and a PSD-prefixed verification ID
// (PSD-XX-XXXXXX). Trust strip below replaces the rating row from the old card.

function PSDSampleLetterCard({ state }: { state?: string }) {
  // State-aware PSD verification ID example: PSD-{STATE}-XXXXXX. Falls back
  // to PSD-NY-XXXXXX so the layout is identical regardless of whether
  // step2.state has been filled in.
  const stateCode = (state ?? "").toUpperCase().trim().slice(0, 2);
  const exampleVerificationId = `PSD-${stateCode.length === 2 ? stateCode : "NY"}-XXXXXX`;

  return (
    <div className={CARD_SHELL}>
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
        <div className="min-w-0">
          <SectionLabel>What You&apos;ll Receive</SectionLabel>
          <p className="text-sm font-bold text-slate-900 tracking-tight">
            Your Official Psychiatric Service Dog Letter
          </p>
        </div>
        <span className="flex-shrink-0 text-[9px] font-semibold tracking-[0.18em] text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5 uppercase">
          Sample
        </span>
      </div>

      {/* Verification-ID example chip — prominent so customers see the PSD-
          prefixed format before they even open the PDF. The actual letter ID
          is generated post-submission; this is purely the format preview. */}
      <div className="px-5 pt-3 pb-1 flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: BRAND_GREEN_SOFT }}
        >
          <i className="ri-shield-check-line text-xs" style={{ color: BRAND_GREEN }}></i>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: BRAND_GREEN }}>
            Verification ID format
          </span>
        </span>
        <span className="text-xs font-mono font-bold text-slate-800 tracking-wider">{exampleVerificationId}</span>
      </div>

      {/* Sample image area: on mobile the SVG fills the card; on desktop it's
          capped + centered so the portrait letter doesn't dominate the 3-col
          left rail — same lg:max-w-sm cap ESA Step 3 implicitly carries via
          its left-column width. */}
      <div className="relative w-full bg-slate-50 px-4 sm:px-8 py-5 sm:py-6">
        <div className="rounded-lg overflow-hidden shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 bg-white relative w-full lg:max-w-sm lg:mx-auto">
          <img
            src="/images/checkout/psd-sample-letter.svg"
            alt="Sample PawTenant Psychiatric Service Dog (PSD) letter showing verification ID, handler info, trained-task description, and licensed provider signature"
            className="w-full h-auto block max-w-full"
            loading="lazy"
          />
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
            Sample
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-slate-100">
        <p className="text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
          <i className="ri-service-line text-sm flex-shrink-0 mt-0.5" style={{ color: BRAND_GREEN }}></i>
          <span>
            A <strong>Psychiatric Service Dog</strong> performs specific disability-related tasks under the
            ADA &mdash; distinct from an Emotional Support Animal. Each letter includes a
            unique <span className="font-mono font-semibold text-slate-700">PSD-XX-XXXXXX</span> ID
            so businesses and public-access venues can confirm authenticity. No health information is disclosed.
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface PSDStep3CheckoutProps {
  step1: PSDStep1Data;
  step2: Step2Data;
  confirmationId: string;
  onBack: () => void;
}

export default function PSDStep3Checkout({ step1, step2, confirmationId, onBack }: PSDStep3CheckoutProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<PSDPlan>("onetime");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [resolvedPrice, setResolvedPrice] = useState<number | null>(null);
  const [resolvedBasePriceCents, setResolvedBasePriceCents] = useState<number | null>(null);
  const [initError, setInitError] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  // ── 2026-06-18 PSD-COUPON-PARITY ──────────────────────────────────────────
  // Track the applied coupon CODE (not just the discount amount) at the parent
  // level so we can (a) send it to create-payment-intent — so Stripe actually
  // charges the discounted amount, exactly like ESA — and (b) persist it on the
  // order so the admin Order Detail shows the discount code for PSD too.
  const [couponCode, setCouponCode] = useState("");
  // ── 2026-05-21 PSD-STEP3-ESA-1TO1 ─────────────────────────────────────────
  // Mobile-only slide-up summary sheet state — same pattern as ESA Step 3.
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  const subscriptionIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);

  // Mirror of ESA Step 3's scrollToPayment — used by the sticky mobile bottom
  // bar to jump the customer to the payment surface.
  const scrollToPayment = () => {
    const el = document.getElementById(PAYMENT_SECTION_ID);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const planBasePrice = getPSDPlanPrice(selectedPlan, step2.pets.length);
  const displayBasePriceDollars = resolvedBasePriceCents != null
    ? Math.round(resolvedBasePriceCents / 100)
    : planBasePrice;
  const priceBeforeDiscount = displayBasePriceDollars;
  const displayPrice = Math.max(0, priceBeforeDiscount - couponDiscount);

  const deliveryLabel = selectedPlan === "subscription"
    ? "Annual Subscription"
    : "One-Time PSD Letter";

  // Initialize payment intent
  useEffect(() => {
    setClientSecret(null);
    setInitError("");
    setResolvedPrice(null);
    setResolvedBasePriceCents(null);

    let cancelled = false;
    const prevSubscriptionId = subscriptionIdRef.current;

    const init = async () => {
      if (selectedPlan === "subscription") return;
      if (!step2.email || !confirmationId) return;
      try {
        const deliverySpeed = PSD_ONETIME_DELIVERY;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({
            plan: "one-time",
            petCount: step2.pets.length,
            deliverySpeed,
            letterType: "psd",
            email: step2.email,
            customerName: `${step2.firstName} ${step2.lastName}`,
            // ── PSD-COUPON-PARITY: send the coupon so Stripe charges the
            // discounted amount and stamps coupon_code into the PI metadata
            // (the stripe-webhook reads it and persists it on the order). ──
            couponCode,
            cancelSubscriptionId: prevSubscriptionId,
            metadata: {
              confirmationId,
              firstName: step2.firstName,
              lastName: step2.lastName,
              email: step2.email,
              phone: step2.phone,
              state: step2.state,
              planType: "one-time",
              deliverySpeed,
              letterType: "psd",
              petCount: String(step2.pets.length),
            },
          }),
        });
        const json = await res.json() as { clientSecret?: string; amount?: number; basePriceAmount?: number; subscriptionId?: string; error?: string };
        if (!cancelled) {
          if (json.clientSecret) {
            setClientSecret(json.clientSecret);
            subscriptionIdRef.current = json.subscriptionId ?? null;
            if (json.amount) setResolvedPrice(Math.round(json.amount / 100));
            if (json.basePriceAmount) setResolvedBasePriceCents(json.basePriceAmount);
          } else {
            setInitError(json.error ?? "Failed to initialize payment. Please try again.");
          }
        }
      } catch {
        if (!cancelled) setInitError("Network error — please refresh and try again.");
      }
    };

    const timer = setTimeout(() => { init(); }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, confirmationId, couponCode]);

  useEffect(() => {
    return () => {
      if (subscriptionIdRef.current && !paymentCompletedRef.current) {
        const subId = subscriptionIdRef.current;
        subscriptionIdRef.current = null;
        fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ action: "cancel_subscription", cancelSubscriptionId: subId }),
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerSheetsSync = () => {
    setTimeout(() => {
      fetch(`${SUPABASE_URL}/functions/v1/sync-to-sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }).catch(() => {});
    }, 2000);
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    paymentCompletedRef.current = true;
    const plan = selectedPlan === "subscription" ? "subscription" : "one-time";
    const deliverySpeed = PSD_ONETIME_DELIVERY;
    const paidAt = new Date().toISOString();
    triggerSheetsSync();

    // ── Read full attribution from sessionStorage at payment time ──────────
    const gclidVal       = sessionStorage.getItem("gclid") ?? null;
    // fbclid: prefer sessionStorage (current-session), fall back to localStorage (durable)
    const fbclidVal      = sessionStorage.getItem("fbclid") ?? localStorage.getItem("fbclid") ?? null;
    const utmSourceVal   = sessionStorage.getItem("utm_source") ?? null;
    const utmMediumVal   = sessionStorage.getItem("utm_medium") ?? null;
    const utmCampaignVal = sessionStorage.getItem("utm_campaign") ?? null;
    const utmTermVal     = sessionStorage.getItem("utm_term") ?? null;
    const utmContentVal  = sessionStorage.getItem("utm_content") ?? null;
    const landingUrlVal  = sessionStorage.getItem("landing_url") ?? null;
    const referrerVal    = sessionStorage.getItem("referrer") ?? null;

    // fbclid_ts: millisecond timestamp when fbclid was first captured (for fbc generation in CAPI)
    const fbclidTsVal = localStorage.getItem("fbclid_ts") ?? null;

    const attributionJsonVal = {
      gclid:          gclidVal,
      fbclid:         fbclidVal,
      fbclid_ts:      fbclidTsVal,
      utm_source:     utmSourceVal,
      utm_medium:     utmMediumVal,
      utm_campaign:   utmCampaignVal,
      utm_term:       utmTermVal,
      utm_content:    utmContentVal,
      referrer:       referrerVal,
      landing_url:    landingUrlVal,
      captured_at:    paidAt,
      captured_stage: "payment_success",
    };

    try {
      await fetch(`${SUPABASE_URL}/functions/v1/get-resume-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({
          action: "upsert",
          confirmationId,
          email: step2.email,
          firstName: step2.firstName,
          lastName: step2.lastName,
          phone: step2.phone,
          state: step2.state,
          deliverySpeed,
          price: displayPrice,
          paymentIntentId,
          paidAt,
          planType: plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
          letterType: "psd",
          status: "processing",
          assessmentAnswers: { ...step1, pets: step2.pets, dob: step2.dob, letterType: "psd" },
          // ── Full attribution at payment time ──
          gclid:        gclidVal,
          fbclid:       fbclidVal,
          utm_source:    utmSourceVal,
          utm_medium:    utmMediumVal,
          utm_campaign:  utmCampaignVal,
          utm_term:      utmTermVal,
          utm_content:   utmContentVal,
          landing_url:   landingUrlVal,
          attribution_json: attributionJsonVal,
        }),
      });
    } catch { /* silent */ }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("orders").upsert({
        user_id: user?.id ?? null,
        confirmation_id: confirmationId,
        email: step2.email,
        first_name: step2.firstName,
        last_name: step2.lastName,
        state: step2.state,
        phone: step2.phone,
        delivery_speed: deliverySpeed,
        price: displayPrice,
        payment_intent_id: paymentIntentId,
        payment_method: "card",
        plan_type: plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
        letter_type: "psd",
        status: "processing",
        paid_at: paidAt,
        // ── PSD-COUPON-PARITY: persist the discount code on the order so the
        // admin Order Detail shows it for PSD, same as ESA. Only written when a
        // coupon was actually applied so no-coupon orders stay blank. ──
        ...(couponCode && couponDiscount > 0 ? { coupon_code: couponCode, coupon_discount: couponDiscount } : {}),
        assessment_answers: { ...step1, pets: step2.pets, dob: step2.dob, letterType: "psd" },
        // ── Attribution columns — written at payment time ──
        gclid:           gclidVal,
        fbclid:          fbclidVal,
        utm_source:      utmSourceVal,
        utm_medium:      utmMediumVal,
        utm_campaign:    utmCampaignVal,
        utm_term:        utmTermVal,
        utm_content:     utmContentVal,
        landing_url:     landingUrlVal,
        attribution_json: attributionJsonVal,
      }, { onConflict: "confirmation_id", ignoreDuplicates: false });
    } catch { /* silent */ }

    // ── 2026-06-18 PSD-ORDER-ID-FIX ───────────────────────────────────────
    // Pass the internal confirmation_id (PT-…) as order_id — NOT the Stripe
    // payment_intent id. The thank-you page looks up the canonical order by
    // this value (via check-payment-status) and renders it as the Order ID,
    // so passing the pi_… id showed a wrong, un-lookup-able ID. Matches ESA.
    sessionStorage.setItem("esa_payment_success", "true");
    navigate(`/psd-assessment/thank-you?amount=${displayPrice}&order_id=${confirmationId}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white pb-28 lg:pb-0"
    >
      {/* ── Mobile-only compact order summary banner — tap to expand ──
          Identical structure to ESA Step 3's mobile banner. */}
      <div className={`lg:hidden mb-5 ${CARD_SHELL}`}>
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
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-[0.18em]">
                PSD Letter Package
              </p>
              <p className="text-xs text-slate-700 font-medium mt-0.5 flex items-center gap-1">
                Tap to view details
                <i className="ri-arrow-right-s-line text-sm text-slate-400"></i>
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            {couponDiscount > 0 && (
              <p className="text-[10px] text-slate-400 line-through">
                ${priceBeforeDiscount}.00
              </p>
            )}
            <p className="text-xl font-bold text-slate-900 tracking-tight">
              ${displayPrice}.00
            </p>
            <p className="text-[10px] text-slate-500">
              {selectedPlan === "subscription" ? "per year" : "one-time"}
            </p>
          </div>
        </button>
      </div>

      {/* ── 2026-05-21 PSD-STEP3-ESA-WRAPPER ────────────────────────────────
          Internal "Secure PSD Evaluation Checkout" pill header removed — ESA
          Step3Checkout has no equivalent intro inside the component (its
          title is rendered by the parent page in the max-w-6xl wrapper).
          Removing this brings PSD's outer structure to 1:1 parity with ESA
          and stops the duplicate vertical-space drift above the grid. */}

      {/* Main grid — gap tokens lifted verbatim from ESA Step 3 so PSD inherits
          the same column rhythm and breathing room on desktop and mobile. */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-5 lg:gap-8">

        {/* ════ RIGHT COLUMN (payment) — first on mobile ════ */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2">
          <div className="lg:sticky lg:top-28 space-y-4 lg:space-y-5">

            {/* ── Desktop-only Order Summary card — ESA Step 3 parity: clean
                white header, slate gradient footer with the Amount Due.
                On mobile the compact summary banner at the top of the page
                handles the same role. */}
            <div className={`hidden lg:block ${CARD_SHELL}`}>
              <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
                <div className="min-w-0">
                  <SectionLabel>Order Summary</SectionLabel>
                  <p className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                    Clinical Evaluation + PSD Documentation
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ backgroundColor: BRAND_GREEN_SOFT, color: BRAND_GREEN }}
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
                        PSD Letter Package
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <i className="ri-time-line text-[11px] flex-shrink-0"></i>
                        <span>{deliveryLabel}</span>
                      </p>
                      {step2.pets.length > 1 && (
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                          {step2.pets.length} dogs &middot; multi-dog rate applied
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-slate-900">${displayBasePriceDollars}.00</span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-slate-400">per year</span>
                    )}
                  </div>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-price-tag-3-line text-emerald-600 text-sm"></i>
                      <span className="text-xs font-semibold text-emerald-700">Discount applied</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">-${couponDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-3">
                    What&apos;s Included
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line", text: "Official PSD letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-service-line", text: "ADA-compliant" },
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

              {/* Amount Due footer — slate gradient identical to ESA's */}
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
                    ${displayPrice}
                    <span className="text-lg font-bold">.00</span>
                  </span>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-slate-500 mt-1.5">per year</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Plan Toggle — ESA Step 3 parity: motion buttons with orange
                accent on the selected state. PSD has 3 plans where ESA has 2,
                so we just iterate the PLANS array. */}
            <div className={CARD_SHELL}>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <SectionLabel>Choose Your Plan</SectionLabel>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ backgroundColor: ACTION_ORANGE_SOFT, color: ACTION_ORANGE_DARK }}
                >
                  Best value: Annual
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                {PLANS.map((plan) => {
                  const isSelected = selectedPlan === plan.key;
                  const planPrice = getPSDPlanPrice(plan.key, step2.pets.length);
                  return (
                    <motion.button
                      key={plan.key}
                      type="button"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.992 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      onClick={() => setSelectedPlan(plan.key)}
                      className={`relative w-full text-left rounded-xl px-4 py-3.5 transition-all cursor-pointer border-2 ${
                        isSelected
                          ? ""
                          : "bg-white hover:border-slate-300 border-slate-200 hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.18)]"
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: ACTION_ORANGE,
                              boxShadow: `0 0 0 4px ${ACTION_ORANGE_SOFT}, 0 10px 24px -14px rgba(249,115,22,0.35)`,
                              backgroundColor: "#FFFBF5",
                            }
                          : undefined
                      }
                    >
                      {plan.badge && (
                        <span
                          className="absolute -top-2 left-3 inline-flex items-center px-2 py-0.5 text-[9px] font-extrabold rounded-full uppercase tracking-wider"
                          style={{ backgroundColor: ACTION_ORANGE, color: "white" }}
                        >
                          {plan.badge}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              borderColor: isSelected ? ACTION_ORANGE : "#CBD5E1",
                              backgroundColor: isSelected ? ACTION_ORANGE : "transparent",
                            }}
                          >
                            {isSelected && (
                              <i className="ri-check-line text-white text-[11px] font-bold"></i>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[15px] font-bold text-slate-900 block leading-tight">
                              {plan.label}
                            </span>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">
                              {plan.sublabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="text-base font-extrabold text-slate-900">
                            ${planPrice}
                            <span className="text-xs font-bold">.00</span>
                          </span>
                          {plan.key === "subscription" && (
                            <p className="text-[10px] text-slate-400 mt-0.5">per year</p>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* General operational timing note — NOT a purchasable speed
                package. PSD is one product; timing is informational only. */}
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <i className="ri-time-line text-slate-400 text-sm flex-shrink-0 mt-0.5"></i>
              <p className="text-[12px] sm:text-xs text-slate-600 leading-snug min-w-0">
                Typical review timing depends on provider availability and any state requirements.
                We work to complete most letters as quickly as possible after your assessment is submitted.
              </p>
            </div>

            {/* Klarna availability note — same calm slate row ESA uses */}
            {selectedPlan !== "subscription" && (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
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

            {/* ── 2026-05-21 PSD-STATE-COMPLIANCE-BANNER ───────────────────
                ESA Step 3 mounts <StateComplianceBanner /> with ESA wording.
                PSD needs the same callout for AR/CA/IA/LA/MT, but with PSD/
                ADA wording instead. California in particular requires a
                30-day client-provider relationship before any psychiatric
                documentation can be issued, which materially affects when
                a PSD letter can be delivered. This is rendered inline so
                the canonical ESA banner stays unchanged. */}
            {(() => {
              const stateUpper = (step2.state ?? "").toUpperCase();
              const psdComplianceStates = ["AR", "CA", "IA", "LA", "MT"] as const;
              if (!psdComplianceStates.includes(stateUpper as typeof psdComplianceStates[number])) {
                return null;
              }
              return (
                <div
                  role="note"
                  aria-label="State law notice"
                  className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5 ring-1 ring-amber-200">
                    <i className="ri-shield-star-line text-amber-700 text-base"></i>
                  </div>
                  <div className="min-w-0 text-amber-900">
                    <p className="text-sm font-bold leading-snug">Important State Law Notice</p>
                    <p className="text-xs mt-1.5 leading-relaxed text-amber-900/90">
                      Your selected state requires a{" "}
                      <strong>client-provider relationship period</strong> before psychiatric
                      documentation &mdash; including PSD letters &mdash; can be issued. Your
                      licensed provider may need to complete the legally required relationship
                      / evaluation period before issuing your final PSD letter.
                    </p>
                    {stateUpper === "CA" ? (
                      <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
                        For <strong>California residents</strong>, state law requires at least a{" "}
                        <strong>30-day client-provider relationship</strong> before PSD
                        documentation can be issued.
                      </p>
                    ) : (
                      <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
                        Your selected state may require a{" "}
                        <strong>client-provider relationship</strong> or{" "}
                        <strong>waiting period</strong> before PSD documentation can be issued.
                      </p>
                    )}
                    <p className="text-xs mt-2 leading-relaxed text-amber-900/90">
                      By continuing, you understand that your final PSD documentation may not be
                      issued immediately and will only be provided if legally permitted and
                      clinically appropriate.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* PI init error (rare race-condition surface) */}
            {initError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 flex items-start gap-2">
                <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                {initError}
                <button type="button" onClick={() => setSelectedPlan((p) => p)} className="ml-auto underline text-red-600 font-semibold whitespace-nowrap cursor-pointer">Retry</button>
              </div>
            )}

            <SecurePaymentCard
              totalPrice={displayPrice}
              clientSecret={clientSecret}
              onPaymentSuccess={handlePaymentSuccess}
              selectedPlan={selectedPlan}
              petCount={step2.pets.length}
              email={step2.email}
              firstName={step2.firstName}
              lastName={step2.lastName}
              state={step2.state}
              confirmationId={confirmationId}
              priceBeforeDiscount={priceBeforeDiscount}
              onDiscountChange={(discount, code) => { setCouponDiscount(discount); setCouponCode(discount > 0 ? code : ""); }}
            />

            {/* Compact post-payment timeline — calm reassurance below Pay */}
            <CompactWhatHappensNext />

            {/* Trust indicators row — same 3-up grid ESA Step 3 uses */}
            <div className={`${CARD_SHELL} px-3 py-3.5`}>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-lock-2-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">256-bit SSL</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 border-x border-slate-100">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-shield-check-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">HIPAA-Compliant</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: BRAND_GREEN_SOFT }}
                  >
                    <i className="ri-service-line text-sm" style={{ color: BRAND_GREEN }}></i>
                  </div>
                  <span className="text-[10px] text-slate-700 font-semibold">ADA-Compliant</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ LEFT COLUMN — second on mobile ════
            Card sequence mirrors ESA Step 3: Trust card → Sample letter →
            Money-back protection → Support card. Same gaps, same shells. */}
        <div className="order-2 lg:order-1 lg:col-start-1 lg:col-span-3 flex flex-col gap-5 lg:gap-6">

          {/* 1 ── Trust card — "Reviewed by Licensed Providers" with ADA
                  verification subsection + phone strip footer. Same shape as
                  ESA Step 3's MHP trust card. */}
          <div className={`${CARD_SHELL} relative`}>
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
                  Every Psychiatric Service Dog evaluation is completed by a board-licensed provider in your
                  state and issued in accordance with ADA guidance for disability-related task training.
                </p>
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="h-px bg-slate-100 mb-4" />
              <SectionLabel>Public-Access Verification Included</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { icon: "ri-qr-code-line", text: "Unique PSD verification ID on every letter" },
                  { icon: "ri-eye-off-line", text: "Businesses verify — no health info disclosed" },
                  { icon: "ri-user-star-line", text: "Signed by a state-licensed provider" },
                  { icon: "ri-service-line", text: "Documents ADA-recognized task training" },
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
                  to="/service-animal-vs-esa"
                  className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer"
                  style={{ color: BRAND_GREEN }}
                >
                  <i className="ri-external-link-line text-xs"></i>
                  PSD vs ESA &mdash; how each is verified
                </Link>
              </div>
            </div>

            <div className="bg-slate-50/70 border-t border-slate-100 px-5 py-3 flex items-center gap-2">
              <i className="ri-phone-line text-sm" style={{ color: BRAND_GREEN }}></i>
              <p className="text-xs text-slate-600 leading-relaxed">
                Prefer to call?{" "}
                <a
                  href="tel:+14099655885"
                  className="font-semibold underline cursor-pointer"
                  style={{ color: BRAND_GREEN }}
                >
                  409-965-5885
                </a>{" "}
                &mdash; complete your evaluation by phone.
              </p>
            </div>
          </div>

          {/* 2 ── PSD Sample Letter card ── */}
          <PSDSampleLetterCard state={step2.state} />

          {/* 3 ── ADA notice — kept as a smaller card because it's a real legal
                  distinction unique to PSD that ESA doesn't have. Styled as a
                  CARD_SHELL with calm slate body so it stops feeling like an
                  alert and reads as documentation. */}
          <div className={`${CARD_SHELL} p-5`}>
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ backgroundColor: BRAND_GREEN_SOFT }}
              >
                <i className="ri-information-line text-base" style={{ color: BRAND_GREEN }}></i>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 mb-1 leading-snug tracking-tight">
                  About PSD Letters &amp; the ADA
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>PSD letters comply with the Americans with Disabilities Act (ADA)</strong>{" "}
                  &mdash; not the Fair Housing Act. Your dog must perform specific trained tasks related
                  to your disability. Our licensed providers review your assessment to confirm eligibility
                  before issuing your letter.
                </p>
              </div>
            </div>
          </div>

          {/* 4 ── Money-back protection — reused ESA helper ── */}
          <RefundReassurance />

          {/* 5 ── Support / contact card — reused ESA helper ── */}
          <SupportCard />
        </div>
      </div>

      {/* The full bottom "What Happens Next" timeline that used to live here
          has been removed — CompactWhatHappensNext now mounts in the right
          payment column (same placement as ESA Step 3), so duplicating it
          full-width below the grid only inflated scroll length. */}

      {/* Back button — matches ESA Step 3's calm slate back button */}
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

      {/* ── 2026-05-21 PSD-STEP3-ESA-1TO1 ───────────────────────────────────
          Mobile slide-up order summary sheet — same animation curve, same
          backdrop, same internals as ESA Step 3's MobileSummarySheet. */}
      <AnimatePresence>
        {showMobileSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] lg:hidden bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setShowMobileSummary(false)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">Order Summary</p>
                <button
                  type="button"
                  onClick={() => setShowMobileSummary(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>

              <div className="px-4 py-4 space-y-4">
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
                        PSD Letter Package
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{deliveryLabel}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-slate-900">${priceBeforeDiscount}.00</span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-slate-400">per year</span>
                    )}
                  </div>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-price-tag-3-line text-emerald-600 text-sm"></i>
                      <span className="text-xs font-semibold text-emerald-700">Discount applied</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">-${couponDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-3">
                    What&apos;s Included
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line", text: "Official PSD letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-service-line", text: "ADA-compliant" },
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
                  style={{ borderColor: BRAND_GREEN }}
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
                      ${displayPrice}
                      <span className="text-base font-bold">.00</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSummary(false);
                    scrollToPayment();
                  }}
                  className="w-full py-3.5 text-sm font-extrabold rounded-xl flex items-center justify-center gap-2 text-white shadow-[0_10px_24px_-10px_rgba(249,115,22,0.55)]"
                  style={{ backgroundColor: ACTION_ORANGE }}
                >
                  <i className="ri-lock-2-line text-base"></i>
                  Complete Secure Evaluation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STICKY MOBILE BOTTOM BAR ── matches ESA Step 3 exactly ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-slate-200 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)]"
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
                ${displayPrice}
              </span>
              <i className="ri-arrow-up-s-line text-slate-400 text-sm"></i>
            </p>
          </button>

          <button
            type="button"
            onClick={scrollToPayment}
            className="flex-1 min-w-0 py-3.5 text-sm font-extrabold rounded-xl flex items-center justify-center gap-2 text-white tracking-tight transition-all active:scale-[0.98]"
            style={{
              backgroundColor: ACTION_ORANGE,
              boxShadow: "0 10px 24px -10px rgba(249,115,22,0.55), 0 2px 6px -2px rgba(249,115,22,0.3)",
            }}
          >
            <i className="ri-lock-2-line text-base"></i>
            <span className="truncate">Complete Secure Evaluation</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
