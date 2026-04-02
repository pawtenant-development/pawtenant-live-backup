import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { supabase } from "../../../lib/supabaseClient";
import type { Step2Data } from "../../assessment/components/Step2PersonalInfo";
import type { PSDStep1Data } from "./PSDStep1";
import KlarnaPaymentTab from "../../assessment/components/KlarnaPaymentTab";
import QRPaymentTab from "../../assessment/components/QRPaymentTab";
import StripePaymentForm from "../../assessment/components/StripePaymentForm";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const stripePromise = loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

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

type PSDPlan = "standard" | "priority" | "subscription";
type PayTabType = "card" | "klarna" | "qr";

function getPSDPlanPrice(key: PSDPlan, petCount: number): number {
  const count = Math.min(petCount, 3);
  if (key === "subscription") {
    if (count >= 3) return 129;
    if (count === 2) return 109;
    return 99;
  }
  if (key === "standard") {
    if (count >= 3) return 135;
    if (count === 2) return 120;
    return 100;
  }
  if (count >= 3) return 155;
  if (count === 2) return 140;
  return 120;
}

function getSubscriptionLabel(petCount: number): string {
  const count = Math.min(petCount, 3);
  if (count >= 3) return "3 Dogs — Annual";
  if (count === 2) return "2 Dogs — Annual";
  return "1 Dog — Annual";
}

const ADDON_OPTIONS = [
  {
    id: "physical_mail",
    label: "Physical Letter via Certified Mail",
    subLabel: "Original signed copy mailed directly to you",
    price: 50,
    icon: "ri-mail-send-line",
    popular: false,
  },
  {
    id: "landlord_letter",
    label: "Verification Letter Addressing Landlord",
    subLabel: "Separate letter directly addressed to your specific landlord",
    price: 30,
    icon: "ri-building-line",
    popular: true,
  },
];

const PLANS: {
  key: PSDPlan;
  label: string;
  sublabel: string;
  badge?: string;
  icon: string;
  desc: string;
}[] = [
  {
    key: "priority",
    label: "Priority — 24 Hours",
    sublabel: "Within 24 hrs",
    badge: "Most Popular",
    icon: "ri-rocket-2-line",
    desc: "Your PSD letter reviewed and delivered within 24 hours of submission.",
  },
  {
    key: "standard",
    label: "Standard — 2-3 Days",
    sublabel: "2-3 business days",
    icon: "ri-time-line",
    desc: "Standard review and delivery within 2-3 business days.",
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
  const [qrAgreed, setQrAgreed] = useState(false);
  const [qrAgreedError, setQrAgreedError] = useState(false);

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

  const couponSlot = useMemo(() => (
    <CouponRow basePrice={priceBeforeDiscount} onDiscountChange={onDiscountChange} />
  ), [priceBeforeDiscount, onDiscountChange]);

  const deliverySpeed = selectedPlan === "standard" ? "2-3days" : "24h";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-400 to-orange-300 px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center bg-black/10 border border-black/10 rounded-xl flex-shrink-0">
            <i className="ri-lock-2-line text-black/70 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-black tracking-tight">Secure Payment</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <i className="ri-shield-check-line text-black/50 text-[10px]"></i>
              <p className="text-[10px] text-black/50">256-bit SSL · Powered by Stripe</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="h-7 px-2 flex items-center justify-center bg-white rounded" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.18)", minWidth: "36px" }}>
            <span style={{ color: "#1a1f71", fontSize: "11px", fontWeight: 900, fontStyle: "italic", letterSpacing: "-0.5px" }}>VISA</span>
          </div>
          <div className="h-7 flex items-center justify-center bg-white rounded relative overflow-hidden" style={{ width: "42px", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }}>
            <div style={{ position: "absolute", left: "5px", width: "20px", height: "20px", borderRadius: "50%", background: "#eb001b" }}></div>
            <div style={{ position: "absolute", left: "17px", width: "20px", height: "20px", borderRadius: "50%", background: "#f79e1b", opacity: 0.9 }}></div>
          </div>
          <div className="h-7 px-2 flex items-center justify-center rounded" style={{ background: "#006fcf", boxShadow: "0 1px 4px rgba(0,0,0,0.18)", minWidth: "36px" }}>
            <span style={{ color: "white", fontSize: "9px", fontWeight: 800, letterSpacing: "0.06em" }}>AMEX</span>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-100 bg-gray-50/50">
        <button
          type="button"
          onClick={() => setActiveTab("card")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "card" ? "text-orange-400 border-b-2 border-orange-400 bg-white" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <i className="ri-bank-card-line text-sm"></i>Card
        </button>
        {!isSubscription && (
          <button
            type="button"
            onClick={() => setActiveTab("klarna")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "klarna" ? "text-[#ff679a] border-b-2 border-[#ff679a] bg-white" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#ffb3c7] text-[9px] font-extrabold text-[#17120e]">K</span>
            Klarna
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "qr" ? "text-orange-400 border-b-2 border-orange-400 bg-white" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <i className="ri-qr-code-line text-sm"></i>QR / Mobile
        </button>
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
                clientSecret={isSubscription ? undefined : (clientSecret ?? undefined)}
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
          />
        </>
      )}

      {/* QR TAB */}
      {activeTab === "qr" && (
        <>
          <div className="px-4 sm:px-5 pt-4">{couponSlot}</div>
          <QRPaymentTab
            amount={totalPrice}
            plan={isSubscription ? "subscription" : "one-time"}
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
            onSuccess={() => onPaymentSuccess("qr-success")}
          />
        </>
      )}

      {/* Call to order footer */}
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

// ── YouTubeShort ──────────────────────────────────────────────────────────────

function YouTubeShort() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Customer Stories</p>
        <h3 className="text-sm font-extrabold text-gray-900">Hear From Real Pet Parents</h3>
      </div>
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

// ── Main Component ────────────────────────────────────────────────────────────

interface PSDStep3CheckoutProps {
  step1: PSDStep1Data;
  step2: Step2Data;
  confirmationId: string;
  onBack: () => void;
}

export default function PSDStep3Checkout({ step1, step2, confirmationId, onBack }: PSDStep3CheckoutProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<PSDPlan>("priority");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [resolvedPrice, setResolvedPrice] = useState<number | null>(null);
  const [resolvedBasePriceCents, setResolvedBasePriceCents] = useState<number | null>(null);
  const [initError, setInitError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [couponDiscount, setCouponDiscount] = useState(0);

  const subscriptionIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const addonTotal = ADDON_OPTIONS.filter((a) => selectedAddons.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const planBasePrice = getPSDPlanPrice(selectedPlan, step2.pets.length);
  const displayBasePriceDollars = resolvedBasePriceCents != null
    ? Math.round(resolvedBasePriceCents / 100)
    : planBasePrice;
  const priceBeforeDiscount = displayBasePriceDollars + addonTotal;
  const displayPrice = Math.max(0, priceBeforeDiscount - couponDiscount);

  const deliveryLabel = selectedPlan === "standard" ? "Standard — 2–3 day delivery" : selectedPlan === "subscription" ? "Annual Subscription" : "Priority — 24-hour delivery";
  const deliveryBadge = selectedPlan === "standard" ? "2–3 Business Days" : selectedPlan === "subscription" ? "Annual Coverage" : "Within 24 Hours";
  const customerName = [step2.firstName, step2.lastName].filter(Boolean).join(" ") || "—";

  const handleSaveProgress = async (currentPrice: number) => {
    if (!confirmationId || !step2.email) return;
    setSaveStatus("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ confirmationId, email: step2.email, firstName: step2.firstName, price: currentPrice, letterType: "psd" }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      setSaveStatus(json.ok ? "sent" : "error");
    } catch {
      setSaveStatus("error");
    }
  };

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
        const deliverySpeed = selectedPlan === "standard" ? "2-3days" : "24h";
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
            additionalDocCount: 0,
            addonServices: selectedAddons,
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
  }, [selectedPlan, confirmationId, JSON.stringify(selectedAddons)]);

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
    const deliverySpeed = selectedPlan === "standard" ? "2-3days" : "24h";
    triggerSheetsSync();

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
          planType: plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
          letterType: "psd",
          status: "processing",
          assessmentAnswers: { ...step1, pets: step2.pets, dob: step2.dob, letterType: "psd" },
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
        assessment_answers: { ...step1, pets: step2.pets, dob: step2.dob, letterType: "psd" },
      }, { onConflict: "confirmation_id", ignoreDuplicates: false });
    } catch { /* silent */ }

    sessionStorage.setItem("esa_payment_success", "true");
    navigate(`/psd-assessment/thank-you?amount=${displayPrice}&order_id=${paymentIntentId}`);
  };

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-2 mb-4">
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-shield-check-line text-amber-600 text-sm"></i>
          </div>
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            Secure PSD Evaluation Checkout
          </span>
        </div>
        <p className="text-sm text-gray-500 max-w-xl mx-auto leading-relaxed px-4">
          Based on your responses, you may be eligible for a Psychiatric Service Dog letter. A licensed provider
          will review your case immediately after checkout.
        </p>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-6 lg:gap-8">

        {/* ════ RIGHT COLUMN (payment) — first on mobile ════ */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2">
          <div className="lg:sticky top-28 space-y-4">

            {/* ── Order Summary Card ── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-400 to-orange-300 px-4 sm:px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-black/50 font-bold uppercase tracking-wider mb-0.5">Order Summary</p>
                    <p className="text-sm font-extrabold text-black leading-snug">
                      Clinical Evaluation + PSD Documentation
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
                    <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-xl flex-shrink-0 mt-0.5">
                      <i className="ri-file-text-line text-amber-600 text-base"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-gray-800 leading-snug">PSD Letter Package</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <i className="ri-time-line text-xs flex-shrink-0"></i>
                        <span>{deliveryLabel}</span>
                      </p>
                      {step2.pets.length > 1 && (
                        <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                          {step2.pets.length} dogs · multi-dog rate applied
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 mt-0.5">
                    <span className="text-sm font-extrabold text-gray-900">${displayBasePriceDollars}.00</span>
                    {selectedPlan === "subscription" && (
                      <span className="text-[10px] text-gray-400">per year</span>
                    )}
                  </div>
                </div>

                {/* Add-ons in summary */}
                {selectedAddons.length > 0 && (
                  <div className="space-y-1.5">
                    {ADDON_OPTIONS.filter((a) => selectedAddons.includes(a.id)).map((addon) => (
                      <div key={addon.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                            <i className={`${addon.icon} text-amber-500 text-xs`}></i>
                          </div>
                          <span className="text-gray-600 truncate">{addon.label}</span>
                        </div>
                        <span className="font-bold text-gray-700 flex-shrink-0 ml-2">+${addon.price}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Coupon discount */}
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

                {/* What's included */}
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2.5">What&apos;s Included</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      { icon: "ri-stethoscope-line", text: "Provider evaluation" },
                      { icon: "ri-file-text-line", text: "Official PSD letter PDF" },
                      { icon: "ri-shield-check-line", text: "HIPAA-compliant" },
                      { icon: "ri-service-line", text: "ADA compliant" },
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

                {/* Plan selector (subscription toggle) */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Speed</p>
                  </div>
                  <div className="px-3 py-3 space-y-2">
                    {PLANS.map((plan) => {
                      const isSelected = selectedPlan === plan.key;
                      const planPrice = getPSDPlanPrice(plan.key, step2.pets.length);
                      return (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => setSelectedPlan(plan.key)}
                          className={`w-full text-left px-3 py-3 rounded-xl border-2 transition-all cursor-pointer relative ${
                            isSelected ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/30"
                          }`}
                        >
                          {plan.badge && (
                            <span className="absolute -top-2 left-3 inline-flex items-center px-2 py-0.5 bg-orange-500 text-white text-[9px] font-extrabold rounded-full">
                              {plan.badge}
                            </span>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "border-orange-500 bg-orange-500" : "border-gray-300"}`}>
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-900">{plan.label}</p>
                                <p className="text-[10px] text-gray-500">{plan.sublabel}</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-extrabold text-amber-600">${planPrice}</p>
                              {plan.key === "subscription" && (
                                <p className="text-[9px] text-gray-400">per year</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add-ons */}
                <div>
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <i className="ri-star-line text-amber-500"></i>Optional Add-ons
                  </p>
                  <div className="space-y-2">
                    {ADDON_OPTIONS.map((addon) => {
                      const isAddonSelected = selectedAddons.includes(addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => toggleAddon(addon.id)}
                          className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                            isAddonSelected ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                            isAddonSelected ? "border-amber-600 bg-amber-600" : "border-gray-300 bg-white"
                          }`}>
                            {isAddonSelected && <i className="ri-check-line text-white" style={{ fontSize: "9px" }}></i>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                                <i className={`${addon.icon} text-amber-600 text-xs`}></i>
                              </div>
                              <p className={`text-xs font-bold leading-snug ${isAddonSelected ? "text-amber-900" : "text-gray-800"}`}>
                                {addon.label}
                              </p>
                              {addon.popular && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">Popular</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{addon.subLabel}</p>
                          </div>
                          <span className={`text-xs font-extrabold whitespace-nowrap flex-shrink-0 mt-0.5 ${isAddonSelected ? "text-amber-700" : "text-gray-600"}`}>
                            +${addon.price}
                          </span>
                        </button>
                      );
                    })}
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
                  <span className="text-2xl font-extrabold text-black">${displayPrice}.00</span>
                  {selectedPlan === "subscription" && (
                    <p className="text-[10px] text-black/60 mt-0.5">per year</p>
                  )}
                </div>
              </div>
            </div>

            {/* Klarna info badge */}
            {selectedPlan !== "subscription" && (
              <div className="bg-[#fff0f5] border border-[#f9c6d8] rounded-2xl px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-16 h-8 flex items-center justify-center bg-[#ffb3c7] rounded-lg text-sm font-extrabold text-[#17120e] tracking-tight flex-shrink-0">
                    Klarna
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800">
                      4 interest-free payments of ${(displayPrice / 4).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">No credit impact · Instant approval</p>
                  </div>
                </div>
              </div>
            )}

            {/* Secure Payment Card */}
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
              onDiscountChange={(discount) => setCouponDiscount(discount)}
            />

            {/* SMS Consent */}
            <label className="flex items-start gap-2.5 cursor-pointer bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:border-gray-200 transition-colors">
              <input type="checkbox" className="mt-0.5 accent-[#1a5c4f] flex-shrink-0 cursor-pointer" />
              <span className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-700">(Optional)</span> I consent to receive
                automated text messages from PawTenant. Reply <strong>STOP</strong> to unsubscribe.{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">Privacy Policy</a>{" "}
                &amp;{" "}
                <a href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">Terms</a>.
              </span>
            </label>
          </div>
        </div>

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
                  You Only Pay for a Valid PSD Letter — Guaranteed
                </h3>
              </div>
            </div>
            <p className="text-sm text-[#1a5c4f]/80 mb-5 leading-relaxed">
              If you are not clinically eligible or your letter is not accepted for valid
              ADA-related use, you&apos;ll receive a full refund according to our refund policy.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "ri-stethoscope-line", text: "Licensed provider review" },
                { icon: "ri-refund-2-line", text: "Full refund protection" },
                { icon: "ri-shield-check-line", text: "HIPAA-secure information" },
                { icon: "ri-timer-flash-line", text: "Fast delivery after approval" },
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
                  { label: "Email", value: step2.email || "—", icon: "ri-mail-line" },
                  { label: "State", value: step2.state || "—", icon: "ri-map-pin-line" },
                  { label: "Phone", value: step2.phone || "Not provided", icon: "ri-phone-line" },
                  { label: "Name", value: customerName, icon: "ri-user-line" },
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
              {step2.pets[0]?.name && (
                <div className="mt-4 bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-100">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                    {step2.pets.length > 1 ? `Dogs (${step2.pets.length})` : "Dog"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {step2.pets.map((p, i) => (
                      <span key={i} className="text-xs bg-white border border-amber-200 text-amber-800 font-semibold px-2.5 py-1 rounded-full">
                        {p.name}{p.breed ? ` · ${p.breed}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

          {/* 3 ── ADA Notice ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-xl flex-shrink-0">
                <i className="ri-information-line text-amber-600 text-base"></i>
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-800 mb-1">About PSD Letters &amp; the ADA</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  <strong>PSD letters comply with the Americans with Disabilities Act (ADA)</strong> — not the Fair Housing Act. Your dog must perform specific trained tasks related to your disability. Our licensed providers will review your assessment to confirm eligibility before issuing your letter.
                </p>
              </div>
            </div>
          </div>

          {/* 4 ── Save Progress ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                <i className="ri-bookmark-3-line text-amber-600 text-sm"></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-900">Not ready to pay yet?</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Save your progress and we&apos;ll email you a link to pick up right where you left off — your PSD assessment answers will be restored automatically.
                </p>
                {saveStatus === "sent" ? (
                  <div className="mt-2 flex items-center gap-1.5 text-green-700">
                    <i className="ri-checkbox-circle-fill text-green-500 text-sm"></i>
                    <span className="text-xs font-semibold">Resume link sent to {step2.email}</span>
                  </div>
                ) : saveStatus === "error" ? (
                  <div className="mt-2 flex items-center gap-1.5 text-red-600">
                    <i className="ri-error-warning-line text-sm"></i>
                    <span className="text-xs font-semibold">Couldn&apos;t send — please try again.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSaveProgress(displayPrice)}
                    disabled={saveStatus === "sending"}
                    className="whitespace-nowrap mt-2.5 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {saveStatus === "sending" ? (
                      <><i className="ri-loader-4-line animate-spin text-sm"></i>Sending...</>
                    ) : (
                      <><i className="ri-mail-send-line text-sm"></i>Email Me My Resume Link</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 5 ── YouTube Short ── */}
          <YouTubeShort />
        </div>
      </div>

      {/* ════ BOTTOM — What Happens Next ════ */}
      <div className="mt-10 sm:mt-14">
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">After Checkout</p>
          <h3 className="text-xl font-extrabold text-gray-900">What Happens Next</h3>
          <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed px-4">
            Here&apos;s exactly what happens from submission to your PSD letter.
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
                title: "PSD Letter Delivered",
                desc: "Your signed, official PSD letter is emailed as a professional PDF document — ready to use." },
              { num: "04", icon: "ri-service-line", color: "bg-emerald-500",
                title: "ADA-Compliant Access",
                desc: "Present your letter with full ADA protection for public access rights with your trained service dog." },
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
