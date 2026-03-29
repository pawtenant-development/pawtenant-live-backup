import { useState, useRef, useEffect } from "react";
import type { Step1Data } from "./Step1Assessment";
import type { Step2Data } from "./Step2PersonalInfo";
import StripePaymentForm from "./StripePaymentForm";
import QRPaymentTab from "./QRPaymentTab";
import KlarnaPaymentTab from "./KlarnaPaymentTab";
import PolicyModal from "./PolicyModal";

export interface Step3Data {
  selectedDoctorId: string;
  plan: PlanType;
  nameOnCard?: string;
  smsConsent?: boolean;
  addonServices?: string[];
}

// ── ESA subscription pricing by pet count (mirrors PSD tiers) ─────────────
function getESASubPrice(petCount: number): number {
  const count = Math.min(petCount, 3);
  if (count >= 3) return 129;
  if (count === 2) return 109;
  return 99;
}

function getESASubLabel(petCount: number): string {
  const count = Math.min(petCount, 3);
  if (count >= 3) return "3 Pets — Annual";
  if (count === 2) return "2 Pets — Annual";
  return "1 Pet — Annual";
}

interface Step3CheckoutProps {
  step1: Step1Data;
  step2: Step2Data;
  data: Step3Data;
  onChange: (data: Step3Data) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  preSelectedDoctorId?: string;
  clientSecret?: string | null;
  paymentError?: string;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onPaymentError: (err: string) => void;
  resolvedPriceCents?: number | null;
  resolvedBasePriceCents?: number | null;
  confirmationId?: string;
  onCouponApplied?: (coupon: { code: string; discount: number } | null) => void;
  appliedCoupon?: { code: string; discount: number } | null;
}

type PlanType = "one-time" | "subscription";
type PaymentTab = "card" | "qr" | "klarna";

const ADDON_OPTIONS = [
  { id: "zoom_call", label: "Private Zoom Call Session with Provider", subLabel: "Scheduled 30-min consultation — provider will reach out to schedule", price: 40, icon: "ri-video-chat-line", popular: true },
  { id: "physical_mail", label: "Physical Letter via Certified Mail", subLabel: "Original signed copy mailed directly to you", price: 50, icon: "ri-mail-send-line", popular: false },
  { id: "landlord_letter", label: "Verification Letter Addressing Landlord", subLabel: "Separate letter directly addressed to your specific landlord", price: 30, icon: "ri-building-line", popular: true },
];

function PriceOption({ plan, selected, onSelect, baseOneTime, baseSub, subLabel }: { plan: PlanType; selected: boolean; onSelect: () => void; baseOneTime: number; baseSub: number; subLabel?: string }) {
  const isSubscription = plan === "subscription";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-150 cursor-pointer ${selected ? "border-[#1a5c4f] bg-[#f0faf7]" : "border-gray-200 bg-white hover:border-gray-300"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${selected ? "border-[#1a5c4f] bg-[#1a5c4f]" : "border-gray-300"}`}>
            {selected && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
          </div>
          <div>
            {isSubscription ? (
              <>
                <p className="text-sm font-semibold text-gray-900 leading-snug">Subscribe &amp; Save: Never Lose ESA Status</p>
                <p className="text-xs text-gray-500 mt-0.5">${baseSub}.00/yr · {subLabel}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">One-time Purchase</p>
                  <span className="whitespace-nowrap text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">4 interest-free payments available</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">${baseOneTime}.00</p>
              </>
            )}
          </div>
        </div>
        {selected && <div className="w-5 h-5 flex items-center justify-center text-[#1a5c4f] flex-shrink-0"><i className="ri-checkbox-circle-fill text-lg" /></div>}
      </div>
    </button>
  );
}

export default function Step3Checkout({
  step2, data, onChange, onSubmit, onBack, submitting, preSelectedDoctorId,
  clientSecret, paymentError, onPaymentSuccess, onPaymentError, resolvedPriceCents,
  resolvedBasePriceCents, confirmationId, onCouponApplied, appliedCoupon,
}: Step3CheckoutProps) {
  const [agreed, setAgreed] = useState(false);
  const [agreedError, setAgreedError] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [paymentTab, setPaymentTab] = useState<PaymentTab>("card");
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const topRef = useRef<HTMLDivElement>(null);

  const selectedAddons = data.addonServices ?? [];
  const toggleAddon = (id: string) => {
    const current = data.addonServices ?? [];
    const updated = current.includes(id) ? current.filter((a) => a !== id) : [...current, id];
    onChange({ ...data, addonServices: updated });
  };
  const addonTotal = ADDON_OPTIONS.filter((a) => selectedAddons.includes(a.id)).reduce((sum, a) => sum + a.price, 0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("esa_pending_order");
      if (stored) {
        const obj = JSON.parse(stored) as Record<string, unknown>;
        obj.paymentMethod = paymentTab;
        sessionStorage.setItem("esa_pending_order", JSON.stringify(obj));
      }
    } catch { /* ignore */ }
  }, [paymentTab]);

  const plan = data.plan ?? "one-time";
  const setPlan = (p: PlanType) => {
    onChange({ ...data, plan: p });
    if (p === "subscription" && paymentTab === "klarna") setPaymentTab("card");
  };

  const petCount = step2.pets.length;
  const is2to3Days = step2.deliverySpeed === "2-3days";
  const additionalDocTypes = (step2.additionalDocs?.types ?? []).filter((t) => t !== "ESA Letter");
  const additionalDocCount = additionalDocTypes.length;
  const additionalDocFee = additionalDocCount * 30;
  // Per-pet ESA subscription pricing
  const esaSubPrice = getESASubPrice(petCount);
  const esaSubLabel = getESASubLabel(petCount);
  // Real base prices from Stripe (fetched via edge function)
  const baseOneTimeFallback = is2to3Days ? 100 : 115;
  const baseSubFallback = esaSubPrice;
  const baseFallback = plan === "one-time" ? baseOneTimeFallback : baseSubFallback;
  const basePrice = resolvedBasePriceCents != null ? Math.round(resolvedBasePriceCents / 100) : baseFallback;
  const resolvedTotal = resolvedPriceCents != null ? Math.round(resolvedPriceCents / 100) : null;
  const couponDiscountAmount = appliedCoupon?.discount ?? 0;
  const totalPrice = resolvedTotal ?? Math.max(0, basePrice + additionalDocFee + addonTotal - couponDiscountAmount);
  const turnaround = is2to3Days ? "Within 2-3 days" : "Within 24 hours";
  const klarnaPerPayment = (totalPrice / 4).toFixed(2);
  const returnUrl = `${window.location.origin}/assessment/thank-you?amount=${totalPrice}&order_id=${confirmationId ?? ""}`;

  // Log once the Stripe-confirmed price is resolved so we can verify the
  // redirect URL baked into the card payment's 3DS / redirect flow
  useEffect(() => {
    if (resolvedPriceCents == null) return; // wait for real price — skip fallback renders
    console.log("[ESA Checkout] returnUrl (3DS / card redirect fallback):", {
      returnUrl,
      totalPrice,
      confirmationId,
      resolvedPriceCents,
      resolvedTotal,
      couponDiscountAmount,
      note: "order_id here is confirmationId (not paymentIntentId) — Stripe appends ?payment_intent= automatically on redirect",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPrice, confirmationId, resolvedPriceCents]);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponValidating(true);
    setCouponError("");
    setCouponApplied(false);
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ code }),
      });
      const json = await res.json() as { valid: boolean; discount?: number; code?: string; error?: string };
      if (json.valid && json.discount != null) {
        setCouponApplied(true);
        setCouponError("");
        onCouponApplied?.({ code: json.code ?? code, discount: json.discount });
        try { sessionStorage.setItem("esa_applied_coupon", JSON.stringify({ code: json.code ?? code, discount: json.discount })); } catch { /* ignore */ }
      } else {
        setCouponError(json.error ?? "Invalid coupon code.");
        setCouponApplied(false);
        onCouponApplied?.(null);
        try { sessionStorage.removeItem("esa_applied_coupon"); } catch { /* ignore */ }
      }
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
      setCouponApplied(false);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!confirmationId || !step2.email) return;
    setSaveStatus("sending");
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ confirmationId, email: step2.email, firstName: step2.firstName, price: totalPrice }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      setSaveStatus(json.ok ? "sent" : "error");
    } catch {
      setSaveStatus("error");
    }
  };

  const validateBeforePayment = (): boolean => {
    const errors: string[] = [];
    if (!agreed) {
      setAgreedError(true);
      errors.push("Please agree to the Terms, Informed Consent, and HIPAA to continue.");
    }
    if (errors.length > 0) {
      setValidationErrors(errors);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    setValidationErrors([]);
    return true;
  };

  const openPolicy = (path: string, title: string) => setPolicyModal({ url: path, title });

  const couponSlot = (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 mb-3">
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
        <i className="ri-coupon-3-line text-orange-500" />Have a coupon code?
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
          placeholder="Enter coupon code"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a5c4f] bg-white"
        />
        <button
          type="button"
          onClick={handleApplyCoupon}
          disabled={couponValidating}
          className="whitespace-nowrap px-3 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer disabled:opacity-60 disabled:cursor-wait flex items-center gap-1"
        >
          {couponValidating ? <><i className="ri-loader-4-line animate-spin" />Checking...</> : "Apply"}
        </button>
      </div>
      {couponApplied && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <i className="ri-checkbox-circle-fill" /> Coupon applied!{couponDiscountAmount > 0 ? ` $${couponDiscountAmount} off` : ""} — discount reflected in your total.
        </p>
      )}
      {couponError && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><i className="ri-error-warning-line" /> {couponError}</p>
      )}
    </div>
  );

  return (
    <div ref={topRef}>
      {policyModal && <PolicyModal url={policyModal.url} title={policyModal.title} onClose={() => setPolicyModal(null)} />}

      {/* Validation Error Summary */}
      {validationErrors.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-300 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-error-warning-fill text-red-500 text-lg" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800 mb-1.5">Please fix the following before submitting:</p>
              <ul className="space-y-1">
                {validationErrors.map((err) => (
                  <li key={err} className="flex items-start gap-2 text-sm text-red-700">
                    <i className="ri-arrow-right-s-line flex-shrink-0 mt-0.5" />{err}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Complete Your Payment</h2>
        <p className="text-gray-500 text-sm mt-2">Secure checkout — your ESA letter is minutes away.</p>
      </div>

      {/* ── Main layout: flex-col on mobile, 5-col grid on desktop ── */}
      {/*
        Mobile order:  1 = RIGHT col (Order Summary + Payment)
                       2 = LEFT col  (What's Included + Trust + Video)
        Desktop order: LEFT (col 1-3) | RIGHT (col 4-5)
      */}
      <div className="flex flex-col lg:grid lg:grid-cols-5 lg:items-start gap-6">

        {/* ── RIGHT column ── order-1 on mobile → appears before left content */}
        <div className="order-1 lg:order-2 lg:col-start-4 lg:col-span-2 lg:row-start-1">
          <div className="space-y-4 lg:sticky top-24">

            {/* Order Summary */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-white px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-extrabold text-gray-900">Order Summary</p>
              </div>
              <div className="bg-white divide-y divide-gray-100">
                <div className="flex justify-between items-center gap-3 px-5 py-3">
                  <span className="text-sm text-gray-700 flex-1 min-w-0">ESA Letter + {turnaround} Delivery</span>
                  <span className="text-sm font-bold flex-shrink-0 whitespace-nowrap text-gray-800">${basePrice}.00</span>
                </div>
                {additionalDocCount > 0 && (
                  <div className="flex justify-between items-center px-5 py-2.5 bg-amber-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className="ri-file-add-line text-amber-600 text-sm flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm text-amber-800 font-semibold">Additional Docs ({additionalDocCount})</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {additionalDocTypes.map((t) => <span key={t} className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{t}</span>)}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-700 ml-4 whitespace-nowrap">+${additionalDocFee}.00</span>
                  </div>
                )}
              </div>

              {/* Add-ons */}
              <div className="bg-white border-t border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                    <i className="ri-star-line text-orange-500 text-sm" />
                  </div>
                  <p className="text-xs font-extrabold text-gray-800 uppercase tracking-wide">Recommended Add-ons</p>
                  <span className="text-xs text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
                </div>
                <div className="space-y-2">
                  {ADDON_OPTIONS.map((addon) => {
                    const isSelected = selectedAddons.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => toggleAddon(addon.id)}
                        className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${isSelected ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-gray-50 hover:border-orange-200 hover:bg-orange-50/40"}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isSelected ? "border-orange-500 bg-orange-500" : "border-gray-300 bg-white"}`}>
                          {isSelected && <i className="ri-check-line text-white" style={{ fontSize: "10px" }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                              <i className={`${addon.icon} text-orange-500 text-sm`} />
                            </div>
                            <p className={`text-xs font-bold leading-snug ${isSelected ? "text-orange-800" : "text-gray-800"}`}>{addon.label}</p>
                            {addon.popular && <span className="text-[9px] font-extrabold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">Popular</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{addon.subLabel}</p>
                        </div>
                        <span className={`text-xs font-extrabold whitespace-nowrap flex-shrink-0 mt-0.5 ${isSelected ? "text-orange-600" : "text-gray-600"}`}>+${addon.price}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedAddons.length > 0 && (
                <div className="flex justify-between items-center px-5 py-2.5 bg-orange-50 border-t border-orange-100">
                  <div className="flex items-center gap-2">
                    <i className="ri-star-fill text-orange-500 text-sm" />
                    <span className="text-sm text-orange-700 font-semibold">Add-on Services ({selectedAddons.length})</span>
                  </div>
                  <span className="text-sm font-bold text-orange-600 ml-4 whitespace-nowrap">+${addonTotal}.00</span>
                </div>
              )}

              {couponDiscountAmount > 0 && (
                <div className="flex justify-between items-center px-5 py-2.5 bg-green-50 border-t border-green-100">
                  <div className="flex items-center gap-2">
                    <i className="ri-coupon-3-line text-green-600 text-sm" />
                    <span className="text-sm text-green-700 font-semibold">Coupon ({appliedCoupon?.code})</span>
                  </div>
                  <span className="text-sm font-bold text-green-600 ml-4 whitespace-nowrap">-${couponDiscountAmount}.00</span>
                </div>
              )}

              <div className="flex justify-between items-center px-5 py-3.5 bg-[#1a5c4f]">
                <span className="text-sm font-extrabold text-white">Total Cost:</span>
                <span className="text-xl font-extrabold text-white">${totalPrice}.00</span>
              </div>
            </div>

            {/* Klarna badge */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 flex items-center gap-3 flex-wrap">
              <div className="flex-shrink-0 bg-[#FFB3C7] rounded-md px-2.5 py-1.5 flex items-center">
                <span className="text-xs font-extrabold text-[#17120E] tracking-tight">Klarna.</span>
              </div>
              <p className="text-sm text-gray-700 min-w-0">
                4 interest-free payments of <strong className="text-gray-900">${klarnaPerPayment}</strong>{" "}
                <a href="https://www.klarna.com/us/pay-in-4/" target="_blank" rel="noopener noreferrer" className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">Learn more</a>
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
              <div className="flex items-center border border-gray-300 rounded-lg px-3 py-2.5 bg-white gap-2">
                <span className="text-sm text-gray-700 flex-1 truncate">{step2.email || "your@email.com"}</span>
                <i className="ri-user-line text-gray-400 text-sm flex-shrink-0" />
              </div>
            </div>

            {/* Price Options */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Price Options</label>
              {petCount > 1 && (
                <div className="mb-2 bg-[#f0faf7] border border-[#b8ddd5] rounded-lg px-3 py-2 flex items-center gap-2">
                  <i className="ri-information-line text-[#1a5c4f] text-sm flex-shrink-0"></i>
                  <p className="text-xs text-[#1a5c4f]">
                    <span className="font-bold">{petCount} pets detected —</span> subscription price reflects the multi-pet rate.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <PriceOption plan="subscription" selected={plan === "subscription"} onSelect={() => setPlan("subscription")} baseOneTime={baseOneTimeFallback} baseSub={esaSubPrice} subLabel={esaSubLabel} />
                <PriceOption plan="one-time" selected={plan === "one-time"} onSelect={() => setPlan("one-time")} baseOneTime={plan === "one-time" ? basePrice : baseOneTimeFallback} baseSub={esaSubPrice} subLabel={esaSubLabel} />
              </div>
              {/* Subscription breakdown */}
              {plan === "subscription" && (
                <div className="mt-2 bg-[#f0faf7] border border-[#b8ddd5] rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-[10px] font-extrabold text-[#1a5c4f] uppercase tracking-wide flex items-center gap-1">
                    <i className="ri-calendar-check-line"></i> Subscription Pricing by Pet Count
                  </p>
                  {[
                    { pets: "1 Pet", price: 99 },
                    { pets: "2 Pets", price: 109 },
                    { pets: "3 Pets", price: 129 },
                  ].map((row) => {
                    const isActive = (petCount === 1 && row.pets === "1 Pet") || (petCount === 2 && row.pets === "2 Pets") || (petCount >= 3 && row.pets === "3 Pets");
                    return (
                      <div key={row.pets} className={`flex items-center justify-between text-[10px] ${isActive ? "font-bold text-[#1a5c4f]" : "text-[#1a5c4f]/70"}`}>
                        <span className="flex items-center gap-1">
                          {isActive && <i className="ri-arrow-right-s-line text-orange-500"></i>}
                          {row.pets}
                        </span>
                        <span className="font-mono">${row.price}/yr</span>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-[#1a5c4f]/70 mt-1 leading-relaxed">Renews automatically each year. Cancel anytime.</p>
                </div>
              )}
            </div>

            {/* Payment Form */}
            <div className="space-y-3">
              {paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 flex items-start gap-2">
                  <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>{paymentError}
                </div>
              )}
              {/* Payment tabs */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button type="button" onClick={() => setPaymentTab("card")} className={`whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${paymentTab === "card" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                  <i className="ri-bank-card-line text-sm flex-shrink-0" /><span className="hidden sm:inline">Card</span>
                </button>
                {plan === "one-time" && (
                  <button type="button" onClick={() => setPaymentTab("klarna")} className={`whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${paymentTab === "klarna" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                    <span className="text-[10px] font-extrabold tracking-tight text-[#FF6A8A]">Klarna</span>
                  </button>
                )}
                <button type="button" onClick={() => setPaymentTab("qr")} className={`whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${paymentTab === "qr" ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                  <i className="ri-qr-code-line text-sm flex-shrink-0" /><span className="hidden sm:inline">QR</span>
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Card header — PSD-style */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f] rounded-lg flex-shrink-0">
                      <i className="ri-bank-card-line text-white text-sm"></i>
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-gray-900">Secure Payment</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        <i className="ri-lock-2-line text-[10px]"></i>256-bit SSL encrypted
                      </p>
                    </div>
                  </div>
                  <div className="bg-[#1a5c4f]/8 border border-[#1a5c4f]/20 rounded-lg px-2.5 py-1.5 text-right">
                    <p className="text-[9px] text-gray-500 font-medium">Amount Due</p>
                    <p className="text-sm font-extrabold text-[#1a5c4f] leading-tight">${totalPrice}.00</p>
                  </div>
                </div>
                <div className="p-4">
                  {paymentTab === "card" && (
                    <StripePaymentForm
                      clientSecret={clientSecret ?? null}
                      amount={totalPrice}
                      returnUrl={returnUrl}
                      onSuccess={onPaymentSuccess}
                      onError={onPaymentError}
                      onBeforeSubmit={validateBeforePayment}
                      agreed={agreed}
                      setAgreed={setAgreed}
                      agreedError={agreedError}
                      setAgreedError={setAgreedError}
                      couponSlot={couponSlot}
                    />
                  )}
                  {paymentTab === "klarna" && (
                    <>
                      {couponSlot}
                      <KlarnaPaymentTab
                        amount={totalPrice} plan={plan} petCount={step2.pets.length} deliverySpeed={step2.deliverySpeed}
                        email={step2.email} firstName={step2.firstName} lastName={step2.lastName}
                        additionalDocCount={additionalDocCount} agreed={agreed} setAgreed={setAgreed}
                        agreedError={agreedError} setAgreedError={setAgreedError} confirmationId={confirmationId ?? ""}
                        phone={step2.phone} state={step2.state}
                        selectedProvider=""
                      />
                    </>
                  )}
                  {paymentTab === "qr" && (
                    <>
                      {couponSlot}
                      <QRPaymentTab
                        amount={totalPrice} plan={plan} petCount={step2.pets.length} deliverySpeed={step2.deliverySpeed}
                        email={step2.email} firstName={step2.firstName} lastName={step2.lastName}
                        additionalDocCount={additionalDocCount} agreed={agreed} setAgreed={setAgreed}
                        agreedError={agreedError} setAgreedError={setAgreedError} confirmationId={confirmationId ?? ""}
                        phone={step2.phone} state={step2.state}
                        selectedProvider=""
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Trust Badge Strip */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { icon: "ri-shield-check-line", label: "HIPAA Compliant", color: "text-green-500" },
                { icon: "ri-lock-2-line", label: "SSL Encrypted", color: "text-green-500" },
                { icon: "ri-refund-2-line", label: "Money-Back", color: "text-orange-500" },
              ].map((badge) => (
                <div key={badge.label} className="flex flex-col items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl py-3 px-1 sm:px-2 text-center">
                  <div className="w-6 h-6 flex items-center justify-center"><i className={`${badge.icon} ${badge.color} text-base`}></i></div>
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-600 leading-tight">{badge.label}</span>
                </div>
              ))}
            </div>

            {/* Save Progress */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                  <i className="ri-bookmark-3-line text-amber-600 text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-900">Not ready to pay yet?</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Save your progress and we&apos;ll email you a link to pick up right where you left off.</p>
                  {saveStatus === "sent" ? (
                    <div className="mt-2 flex items-center gap-1.5 text-green-700"><i className="ri-checkbox-circle-fill text-green-500 text-sm"></i><span className="text-xs font-semibold">Link sent to {step2.email}</span></div>
                  ) : saveStatus === "error" ? (
                    <div className="mt-2 flex items-center gap-1.5 text-red-600"><i className="ri-error-warning-line text-sm"></i><span className="text-xs font-semibold">Couldn&apos;t send — please try again.</span></div>
                  ) : (
                    <button type="button" onClick={handleSaveProgress} disabled={saveStatus === "sending"} className="whitespace-nowrap mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-60">
                      {saveStatus === "sending" ? <><i className="ri-loader-4-line animate-spin text-sm"></i>Sending...</> : <><i className="ri-mail-send-line text-sm"></i>Email Me My Progress Link</>}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SMS Consent */}
            <label className="flex items-start gap-2.5 cursor-pointer text-gray-600">
              <input type="checkbox" checked={data.smsConsent ?? false} onChange={(e) => onChange({ ...data, smsConsent: e.target.checked })} className="mt-0.5 accent-[#1a5c4f] flex-shrink-0" />
              <span className="text-xs leading-relaxed">
                <span className="font-semibold text-gray-700">(Optional)</span> By checking this box, I consent to receive automated marketing text messages (SMS/MMS) from PawTenant at the phone number provided. Message &amp; data rates may apply. Consent is not a condition of purchase.{" "}
                <span className="text-gray-500">Reply <strong>STOP</strong> to unsubscribe. Reply <strong>HELP</strong> for help.</span>{" "}
                <button type="button" onClick={() => openPolicy("/privacy-policy", "Privacy Policy")} className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">Privacy Policy</button>
                {" & "}
                <button type="button" onClick={() => openPolicy("/terms-of-use", "Terms of Use")} className="text-[#1a5c4f] font-semibold hover:underline cursor-pointer">Terms</button>.
              </span>
            </label>

            {/* Trust footer */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400 flex items-center gap-1"><i className="ri-shield-check-line text-green-500" />Safe &amp; Secure Checkout</span>
              <div className="border border-gray-300 rounded-md px-2.5 py-1 flex items-center gap-1.5">
                <i className="ri-lock-2-line text-gray-400 text-xs" />
                <span className="text-xs font-bold text-gray-500">Powered by</span>
                <span className="text-xs font-extrabold text-[#635BFF]">stripe</span>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400 pb-2">
              <button type="button" onClick={() => openPolicy("/privacy-policy", "Privacy Policy")} className="text-orange-500 font-semibold hover:underline cursor-pointer">Privacy Policy</button>
              {" · "}
              <button type="button" onClick={() => openPolicy("/terms-of-use", "Terms of Use")} className="text-orange-500 font-semibold hover:underline cursor-pointer">Terms of Use</button>
            </p>
          </div>
        </div>

        {/* ── LEFT column ── order-2 on mobile → appears after payment section */}
        <div className="order-2 lg:order-1 lg:col-start-1 lg:col-span-3 lg:row-start-1 space-y-5">
          {/* What's included */}
          <div className="bg-[#f2f8f5] rounded-xl border border-green-200 p-6">
            <p className="text-sm font-extrabold text-gray-900 mb-1">ESA Letter + {turnaround} Delivery Included</p>
            <p className="text-xs font-semibold text-gray-600 mb-3">Included with your ESA Letter:</p>
            {[
              "Legally enforced for rentals, vacation homes, and college dorms.",
              "Compliant with the Fair Housing Act for housing.",
              "Evaluated by a licensed Medical Provider in your state.",
            ].map((t) => (
              <div key={t} className="flex items-start gap-2 mb-2">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"><i className="ri-checkbox-circle-fill text-green-600 text-base" /></div>
                <p className="text-xs text-gray-700">{t}</p>
              </div>
            ))}
          </div>

          {/* Trust items */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Why thousands trust PawTenant</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "ri-shield-check-line", color: "text-green-500", label: "HIPAA Compliant", desc: "Your info is fully protected" },
                { icon: "ri-award-line", color: "text-orange-500", label: "Licensed Providers", desc: "State-verified professionals" },
                { icon: "ri-time-line", color: "text-blue-500", label: "Fast Turnaround", desc: "Letter in 24\u201372 hrs" },
                { icon: "ri-refund-2-line", color: "text-orange-500", label: "Money-Back Guarantee", desc: "100% if you don't qualify" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0"><i className={`${item.icon} ${item.color} text-base`} /></div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Video */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-extrabold text-gray-900 mb-4">Hear what our happy pet parents say!</h3>
            <div className="relative bg-gray-100 rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 flex items-center justify-center bg-red-600 rounded-full">
                  <i className="ri-play-fill text-white text-3xl ml-1" />
                </div>
                <p className="text-sm text-gray-500 font-medium">Video testimonial coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="mt-6">
        <button
          type="button"
          onClick={onBack}
          className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-7 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold text-sm rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer w-full sm:w-auto"
        >
          <i className="ri-arrow-left-line" />Back
        </button>
      </div>
    </div>
  );
}
