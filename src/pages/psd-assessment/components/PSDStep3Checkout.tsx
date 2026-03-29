import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import StripePaymentForm from "../../assessment/components/StripePaymentForm";
import { supabase } from "../../../lib/supabaseClient";
import type { Step2Data } from "../../assessment/components/Step2PersonalInfo";
import type { PSDStep1Data } from "./PSDStep1";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

type PSDPlan = "standard" | "priority" | "subscription";

// ── PSD pricing matrix ────────────────────────────────────────────────────────
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
  // priority
  if (count >= 3) return 155;
  if (count === 2) return 140;
  return 120;
}

// ── Subscription pricing label by dog count (for display in plan card + summary) ──
function getSubscriptionLabel(petCount: number): string {
  const count = Math.min(petCount, 3);
  if (count >= 3) return "3 Dogs — Annual";
  if (count === 2) return "2 Dogs — Annual";
  return "1 Dog — Annual";
}

// ── Add-on services ───────────────────────────────────────────────────────────
const ADDON_OPTIONS = [
  {
    id: "zoom_call",
    label: "Private Zoom Call Session with Provider",
    subLabel: "Scheduled 30-min consultation — provider will reach out to schedule",
    price: 40,
    icon: "ri-video-chat-line",
    popular: true,
  },
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
  const [agreed, setAgreed] = useState(false);
  const [agreedError, setAgreedError] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  // ── Subscription cleanup refs ─────────────────────────────────────────────
  const subscriptionIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const addonTotal = ADDON_OPTIONS.filter((a) => selectedAddons.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const handleSaveProgress = async (currentPrice: number) => {
    if (!confirmationId || !step2.email) return;
    setSaveStatus("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          confirmationId,
          email: step2.email,
          firstName: step2.firstName,
          price: currentPrice,
          letterType: "psd",
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      setSaveStatus(json.ok ? "sent" : "error");
    } catch {
      setSaveStatus("error");
    }
  };

  // ── Coupon state ─────────────────────────────────────────────────────────
  const [couponCode, setCouponCode] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);

  const couponDiscount = appliedCoupon?.discount ?? 0;

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponValidating(true);
    setCouponError("");
    setCouponApplied(false);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-coupon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json() as { valid: boolean; discount?: number; code?: string; error?: string };
      if (json.valid && json.discount != null) {
        setCouponApplied(true);
        setCouponError("");
        setAppliedCoupon({ code: json.code ?? code, discount: json.discount });
      } else {
        setCouponError(json.error ?? "Invalid coupon code.");
        setCouponApplied(false);
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
      setCouponApplied(false);
    } finally {
      setCouponValidating(false);
    }
  };

  // Initialize payment intent whenever plan/addons change
  useEffect(() => {
    setClientSecret(null);
    setInitError("");
    setResolvedPrice(null);
    setResolvedBasePriceCents(null);

    let cancelled = false;
    const prevSubscriptionId = subscriptionIdRef.current;

    const init = async () => {
      try {
        const plan = selectedPlan === "subscription" ? "subscription" : "one-time";
        const deliverySpeed = selectedPlan === "standard" ? "2-3days" : "24h";

        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            plan,
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
              planType: plan,
              deliverySpeed,
              letterType: "psd",
              petCount: String(step2.pets.length),
            },
          }),
        });

        const json = await res.json() as {
          clientSecret?: string;
          amount?: number;
          basePriceAmount?: number;
          subscriptionId?: string;
          error?: string;
        };
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

    // Debounce 350ms — prevents rapid plan toggles from creating multiple incomplete subscriptions
    const timer = setTimeout(() => { init(); }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, confirmationId, JSON.stringify(selectedAddons)]);

  // ── Cancel orphaned subscription on unmount (if payment never completed) ──
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

  const planBasePrice = getPSDPlanPrice(selectedPlan, step2.pets.length);
  const displayBasePriceDollars = resolvedBasePriceCents != null
    ? Math.round(resolvedBasePriceCents / 100)
    : planBasePrice;
  const displayPrice = resolvedPrice != null
    ? Math.max(0, resolvedPrice - couponDiscount)
    : Math.max(0, displayBasePriceDollars + addonTotal - couponDiscount);

  const triggerSheetsSync = () => {
    setTimeout(() => {
      fetch(`${SUPABASE_URL}/functions/v1/sync-to-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }).catch(() => {});
    }, 2000);
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    paymentCompletedRef.current = true; // prevent unmount cleanup from cancelling active subscription
    const plan = selectedPlan === "subscription" ? "subscription" : "one-time";
    const deliverySpeed = selectedPlan === "standard" ? "2-3days" : "24h";
    triggerSheetsSync();

    try {
      await fetch(`${SUPABASE_URL}/functions/v1/get-resume-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
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
          assessmentAnswers: {
            ...step1,
            pets: step2.pets,
            dob: step2.dob,
            letterType: "psd",
          },
        }),
      });
    } catch {
      // silent — Stripe webhook will also update the order
    }

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
        assessment_answers: {
          ...step1,
          pets: step2.pets,
          dob: step2.dob,
          letterType: "psd",
        },
      }, { onConflict: "confirmation_id", ignoreDuplicates: false });
    } catch {
      // Silently fail
    }

    sessionStorage.setItem("esa_payment_success", "true");
    navigate(`/psd-assessment/thank-you?amount=${displayPrice}&order_id=${paymentIntentId}`);
  };

  const handleBeforeSubmit = () => {
    if (!agreed) { setAgreedError(true); return false; }
    setAgreedError(false);
    return true;
  };

  // ── Coupon slot (passed into StripePaymentForm) ───────────────────────────
  const couponSlot = (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
      <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
        <i className="ri-coupon-3-line text-orange-500" />
        Have a coupon code?
      </label>
      <div className="space-y-2">
        <input
          type="text"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
          placeholder="Enter coupon code"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a5c4f] focus:ring-1 focus:ring-[#1a5c4f]/20 bg-white transition-all"
        />
        <button
          type="button"
          onClick={handleApplyCoupon}
          disabled={couponValidating || !couponCode.trim()}
          className="whitespace-nowrap w-full py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors"
        >
          {couponValidating
            ? <><i className="ri-loader-4-line animate-spin" /> Validating...</>
            : <><i className="ri-check-line" /> Apply Coupon</>}
        </button>
      </div>
      {couponApplied && (
        <div className="mt-2 flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
          <i className="ri-checkbox-circle-fill text-green-500 text-sm flex-shrink-0" />
          <p className="text-xs text-green-700 font-semibold">
            Coupon applied{couponDiscount > 0 ? ` — $${couponDiscount} off` : ""}
          </p>
        </div>
      )}
      {couponError && (
        <div className="mt-2 flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <i className="ri-error-warning-line text-red-400 text-sm flex-shrink-0" />
          <p className="text-xs text-red-600">{couponError}</p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Choose Your Plan</h2>
        <p className="text-gray-500 text-sm mt-2">
          Select how quickly you need your PSD letter, then complete payment.
        </p>
      </div>

      {/* ── Main grid: 50/50 split for wider payment panel ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left — Plan selector + order summary */}
        <div className="space-y-4">
          {/* Plan cards */}
          <div className="space-y-3">
            {step2.pets.length > 1 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-800">
                  <span className="font-bold">{step2.pets.length} dogs detected —</span> prices below reflect the multi-dog rate.
                  {step2.pets.length === 2 ? " (Up to 2 dogs)" : " (Up to 3 dogs)"}
                </p>
              </div>
            )}

            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.key;
              const planPrice = getPSDPlanPrice(plan.key, step2.pets.length);
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                    isSelected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/40"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-2.5 left-4 inline-flex items-center px-2.5 py-0.5 bg-orange-500 text-white text-[10px] font-extrabold rounded-full">
                      {plan.badge}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "border-orange-500 bg-orange-500" : "border-gray-300"}`}>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-white block" />}
                      </div>
                      <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                        <i className={`${plan.icon} text-amber-600 text-sm`}></i>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{plan.label}</p>
                        <p className="text-xs text-gray-500">{plan.desc}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {plan.key === "subscription" ? (
                        <>
                          <p className="text-xl font-extrabold text-amber-600">${planPrice}</p>
                          <p className="text-[10px] text-amber-600 font-semibold">{getSubscriptionLabel(step2.pets.length)}</p>
                          <p className="text-[9px] text-gray-400">billed annually</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-extrabold text-amber-600">${planPrice}</p>
                          <p className="text-xs text-gray-400">{plan.sublabel}</p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Order Summary */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-xs font-extrabold text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <i className="ri-file-list-3-line"></i>Order Summary
            </p>
            <div className="space-y-2">
              <div className="flex items-start justify-between text-sm gap-3">
                <span className="text-gray-700 font-medium leading-snug">
                  PSD Letter — {PLANS.find((p) => p.key === selectedPlan)?.label}
                  {selectedPlan === "subscription" && (
                    <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                      {getSubscriptionLabel(step2.pets.length)} · renews automatically each year
                    </span>
                  )}
                </span>
                <span className="font-bold text-gray-900 flex-shrink-0">${displayBasePriceDollars}</span>
              </div>

              {/* Subscription per-dog breakdown */}
              {selectedPlan === "subscription" && (
                <div className="bg-amber-100/60 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                    <i className="ri-calendar-check-line"></i> Subscription Details
                  </p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {[
                      { dogs: "1 Dog", id: "1 dog/yr" },
                      { dogs: "2 Dogs", id: "2 dogs/yr" },
                      { dogs: "3 Dogs", id: "3 dogs/yr" },
                    ].map((row) => (
                      <div key={row.dogs} className={`flex items-center justify-between text-[10px] col-span-2 ${
                        (step2.pets.length === 1 && row.dogs === "1 Dog") ||
                        (step2.pets.length === 2 && row.dogs === "2 Dogs") ||
                        (step2.pets.length >= 3 && row.dogs === "3 Dogs")
                          ? "font-bold text-amber-900"
                          : "text-amber-700"
                      }`}>
                        <span className="flex items-center gap-1">
                          {(
                            (step2.pets.length === 1 && row.dogs === "1 Dog") ||
                            (step2.pets.length === 2 && row.dogs === "2 Dogs") ||
                            (step2.pets.length >= 3 && row.dogs === "3 Dogs")
                          ) && <i className="ri-arrow-right-s-line text-orange-500"></i>}
                          {row.dogs}
                        </span>
                        <span className="font-mono">{row.id}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-amber-600 mt-1 leading-relaxed">
                    Your subscription covers {step2.pets.length} dog{step2.pets.length > 1 ? "s" : ""} and renews automatically every year. Cancel anytime.
                  </p>
                </div>
              )}

              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-sm text-green-700">
                  <span className="flex items-center gap-1 font-medium">
                    <i className="ri-coupon-3-line text-green-500" />
                    Coupon ({appliedCoupon?.code})
                  </span>
                  <span className="font-bold">-${couponDiscount}.00</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Order ID</span>
                <span className="font-mono font-semibold text-gray-700">{confirmationId}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Patient</span>
                <span className="font-semibold text-gray-700">{step2.firstName} {step2.lastName}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>State</span>
                <span className="font-semibold text-gray-700">{step2.state}</span>
              </div>
              {step2.pets[0]?.name && (
                <div className="flex items-start justify-between text-xs text-gray-500">
                  <span>{step2.pets.length > 1 ? `Dogs (${step2.pets.length})` : "Dog"}</span>
                  <span className="font-semibold text-gray-700 text-right max-w-[55%]">
                    {step2.pets.map((p) => `${p.name}${p.breed ? ` (${p.breed})` : ""}`).join(", ")}
                  </span>
                </div>
              )}

              {/* Add-on Services */}
              <div className="border-t border-amber-200 pt-3 mt-1">
                <p className="text-xs font-extrabold text-amber-800 mb-2 flex items-center gap-1.5">
                  <i className="ri-star-line text-amber-600"></i>Recommended Add-ons
                  <span className="font-normal text-amber-600 normal-case tracking-normal">(optional)</span>
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
                          isAddonSelected
                            ? "border-amber-400 bg-amber-100"
                            : "border-amber-100 bg-white hover:border-amber-300 hover:bg-amber-50/60"
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

              {addonTotal > 0 && (
                <div className="flex items-center justify-between text-sm text-amber-700 border-t border-amber-200 pt-2">
                  <span className="flex items-center gap-1 font-semibold">
                    <i className="ri-star-fill text-amber-500 text-sm"></i>
                    Add-ons ({selectedAddons.length})
                  </span>
                  <span className="font-bold">+${addonTotal}.00</span>
                </div>
              )}

              <div className="border-t border-amber-200 pt-2 mt-1 flex items-center justify-between">
                <span className="text-sm font-extrabold text-amber-800">Total Due</span>
                <span className="text-lg font-extrabold text-amber-700">${displayPrice}.00</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="whitespace-nowrap w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-2.5 border-2 border-gray-200 text-gray-600 font-semibold text-sm rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-line"></i>Back
          </button>
        </div>

        {/* Right — Payment form (wider now with lg:grid-cols-2) */}
        <div>
          {/* ── Sticky payment card ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 flex items-center justify-center bg-[#1a5c4f] rounded-lg flex-shrink-0">
                  <i className="ri-bank-card-line text-white"></i>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-gray-900">Secure Payment</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <i className="ri-lock-2-line text-gray-400 text-[10px]"></i>
                    256-bit SSL encrypted
                  </p>
                </div>
              </div>
              {/* Live amount pill */}
              <div className="bg-[#1a5c4f]/8 border border-[#1a5c4f]/20 rounded-lg px-3 py-1.5 text-right">
                <p className="text-[10px] text-gray-500 font-medium">Amount Due</p>
                <p className="text-base font-extrabold text-[#1a5c4f] leading-tight">${displayPrice}.00</p>
              </div>
            </div>

            <div className="border-t border-gray-100 my-4"></div>

            {initError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 mb-4 flex items-start gap-2">
                <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                {initError}
                <button
                  type="button"
                  onClick={() => setSelectedPlan((p) => p)}
                  className="ml-auto underline text-red-600 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {paymentError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 mb-4 flex items-start gap-2">
                <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>
                {paymentError}
              </div>
            )}

            <StripePaymentForm
              clientSecret={clientSecret}
              amount={displayPrice}
              returnUrl={`${window.location.origin}/psd-assessment/thank-you?amount=${displayPrice}&order_id=${confirmationId}`}
              onSuccess={handlePaymentSuccess}
              onError={setPaymentError}
              onBeforeSubmit={handleBeforeSubmit}
              agreed={agreed}
              setAgreed={setAgreed}
              agreedError={agreedError}
              setAgreedError={setAgreedError}
              couponSlot={couponSlot}
            />
          </div>

          {/* ── Trust badges — below the payment card ── */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: "ri-shield-check-line", label: "HIPAA Compliant", sub: "Protected" },
              { icon: "ri-award-line", label: "Licensed Providers", sub: "Verified" },
              { icon: "ri-refund-2-line", label: "Satisfaction", sub: "Guaranteed" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl py-3">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className={`${b.icon} text-[#1a5c4f] text-base`}></i>
                </div>
                <span className="text-[10px] font-bold text-gray-700 text-center leading-tight">{b.label}</span>
                <span className="text-[9px] text-gray-400">{b.sub}</span>
              </div>
            ))}
          </div>

          {/* Powered by Stripe note */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            <i className="ri-lock-fill text-[10px]"></i>
            <span>Payments secured by Stripe</span>
          </div>

          {/* ADA notice */}
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <i className="ri-information-line text-gray-400 text-sm flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong>PSD letters comply with the Americans with Disabilities Act (ADA)</strong> — not the Fair Housing Act. Your dog must perform specific trained tasks. Our licensed providers will review your assessment to confirm eligibility.
            </p>
          </div>

          {/* Save Progress / Not ready to pay yet */}
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
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
        </div>
      </div>
    </div>
  );
}
