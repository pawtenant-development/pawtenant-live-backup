import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PolicyModal from "./PolicyModal";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

interface KlarnaPaymentTabProps {
  amount: number;
  plan: "one-time" | "subscription";
  petCount: number;
  deliverySpeed: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  state: string;
  additionalDocCount?: number;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  agreedError: boolean;
  setAgreedError: (v: boolean) => void;
  confirmationId: string;
  selectedProvider?: string;
  letterType?: "esa" | "psd";
  onSuccess?: () => void;
  /** Applied coupon code to pass to backend for discount */
  couponCode?: string;
  /**
   * When true, disables the Continue button and short-circuits handleContinue.
   * Used by state-law compliance flow (AR/CA/IA/LA/MT) to require the user to
   * acknowledge the state-law notice before starting Klarna checkout.
   */
  complianceBlocked?: boolean;
}

// ─── Processing Overlay ───────────────────────────────────────────────────────

function ProcessingOverlay() {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center gap-4 shadow-2xl">
        <div className="w-12 h-12 border-4 border-gray-100 border-t-[#ff679a] rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-700">Preparing Klarna Checkout...</p>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KlarnaPaymentTab({
  amount,
  plan,
  petCount,
  deliverySpeed,
  email,
  firstName,
  lastName,
  phone,
  state,
  additionalDocCount = 0,
  agreed,
  setAgreed,
  agreedError,
  setAgreedError,
  confirmationId,
  selectedProvider,
  letterType = "esa",
  onSuccess,
  couponCode,
  complianceBlocked = false,
}: KlarnaPaymentTabProps) {
  const [loading, setLoading] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  // Distinct error state for checkout-session creation / fetch / redirect failures.
  // Kept separate from `agreedError` so the "Please agree to the terms" copy is
  // only shown when the agreement checkbox is actually missing.
  const [submitError, setSubmitError] = useState("");

  // Ref used to gently scroll the popup-blocked fallback CTA into view so the
  // user notices it when the browser silently blocks `window.open(...)`.
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!checkoutUrl) return;
    // Defer one tick so the new fallback DOM is mounted before scrolling.
    const t = window.setTimeout(() => {
      try {
        fallbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // scrollIntoView options not supported — silently ignore.
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [checkoutUrl]);

  const installment = (amount / 4).toFixed(2);

  const handleContinue = async () => {
    // Compliance gate (AR/CA/IA/LA/MT): button is also disabled, but we hard-stop
    // here in case the click arrives mid-state-update.
    if (complianceBlocked) return;
    if (!agreed) {
      setAgreedError(true);
      return;
    }

    setLoading(true);
    setAgreedError(false);
    setSubmitError("");

    try {
      const planType = plan === "subscription" ? "subscription" : "one-time";

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          letterType,
          petCount,
          deliverySpeed,
          email,
          firstName,
          lastName,
          state,
          confirmationId,
          mode: "klarna",
          planType,
          origin: window.location.origin,
          // Pass coupon code for backend discount application
          ...(couponCode ? { couponCode } : {}),
        }),
      });

      const data = await res.json();

      if (data.url) {
        setCheckoutUrl(data.url);
        window.open(data.url, "_blank");
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (err) {
      console.error("Klarna checkout error:", err);
      // ── 2026-05-20 PSD-KLARNA-START-FAIL-VISIBILITY ────────────────────
      // Surface the actual Stripe / create-checkout-session error so
      // PSD Klarna failures are debuggable from the UI. The previous
      // generic "Unable to start Klarna checkout" copy hid the cause
      // (invalid Price ID, Klarna not activated for the product, etc.)
      // and forced a server-log dive on every failure. ESA card flow
      // and PSD card flow are unaffected — only Klarna error copy
      // changes.
      const detail = err instanceof Error ? err.message.trim() : "";
      setSubmitError(
        detail && detail !== "Failed to create checkout session"
          ? `Unable to start Klarna checkout: ${detail}. Please try again or use card payment.`
          : "Unable to start Klarna checkout. Please try again or use card payment.",
      );
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!confirmationId) return;
    setCheckingStatus(true);
    setStatusError("");
    try {
      // ── 2026-05-20 KLARNA-RECONCILIATION-SELF-HEAL ───────────────────
      // Previously this query read orders.paid_at directly. That worked
      // only when the Stripe webhook had already fired
      // `checkout.session.async_payment_succeeded` and written paid_at.
      // For Klarna sessions where the webhook is missing / not
      // subscribed / delayed, the customer would see "Payment not yet
      // completed" forever even though Stripe had charged them.
      //
      // The check-payment-status edge function now accepts a
      // confirmationId, asks Stripe directly via stripe.checkout.sessions
      // .retrieve, and writes paid_at + payment_intent_id + status back
      // to the orders row when Stripe confirms the session is paid.
      // Self-healing fallback for any future webhook outage.
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/check-payment-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ confirmationId }),
        },
      );
      const data = await res.json() as {
        paid?: boolean;
        reconciled?: boolean;
        paymentStatus?: string;
        error?: string;
      };

      if (data.paid === true) {
        setPaymentCompleted(true);
        onSuccess?.();
        return;
      }

      if (data.error) {
        console.error("[checkPaymentStatus] reconciler error:", data.error);
      }
      setStatusError(
        "Payment not yet completed. Please finish payment in the Klarna window and try again.",
      );
    } catch (err) {
      console.error("Error checking payment status:", err);
      setStatusError("Could not verify payment status. Please try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  if (paymentCompleted) {
    return (
      <div className="mx-4 sm:mx-5 my-5 space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <div className="w-12 h-12 flex items-center justify-center bg-emerald-100 rounded-full mx-auto mb-3">
            <i className="ri-check-line text-emerald-600 text-xl"></i>
          </div>
          <h3 className="text-sm font-extrabold text-emerald-800 mb-1">Payment Completed!</h3>
          <p className="text-xs text-emerald-600">Your order has been confirmed. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {loading && <ProcessingOverlay />}
      
      {policyModal && (
        <PolicyModal
          url={policyModal.url}
          title={policyModal.title}
          onClose={() => setPolicyModal(null)}
        />
      )}

      <div className="mx-4 sm:mx-5 my-5 space-y-4">
        {/* Klarna branding */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-8 flex items-center justify-center bg-[#ffb3c7] rounded-lg text-sm font-extrabold text-[#17120e] tracking-tight flex-shrink-0">
            Klarna
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-gray-900">4 Interest-Free Payments</p>
            <p className="text-xs text-gray-500">No hidden fees · No credit impact</p>
          </div>
        </div>

        {/* Installment breakdown */}
        <div className="bg-[#fff0f5] border border-[#f9c6d8] rounded-xl p-4 space-y-2.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 ${n === 1 ? "bg-[#ff679a] text-white" : "bg-[#ffb3c7]/50 text-[#17120e]"}`}>
                  {n}
                </div>
                <span className="text-xs text-gray-700 font-semibold">
                  {n === 1 ? "Today" : `In ${(n - 1) * 2} weeks`}
                </span>
              </div>
              <span className={`text-sm font-extrabold flex-shrink-0 ${n === 1 ? "text-[#ff679a]" : "text-gray-700"}`}>
                ${installment}
              </span>
            </div>
          ))}
          <div className="border-t border-[#f9c6d8] pt-2 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Total</span>
            <span className="text-sm font-extrabold text-gray-900">${amount}.00</span>
          </div>
        </div>

        {/* Agreement checkbox */}
        <label
          className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-4 py-3.5 hover:border-[#ff679a]/30 transition-colors ${
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
            className="mt-0.5 accent-[#ff679a] flex-shrink-0 cursor-pointer"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            I agree to the{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Terms of Use" })}
              className="text-[#ff679a] font-semibold hover:underline cursor-pointer"
            >
              Terms of Use
            </button>
            ,{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Informed Consent" })}
              className="text-[#ff679a] font-semibold hover:underline cursor-pointer"
            >
              Informed Consent
            </button>
            , and{" "}
            <button
              type="button"
              onClick={() => setPolicyModal({ url: "/privacy-policy", title: "HIPAA Acknowledgment" })}
              className="text-[#ff679a] font-semibold hover:underline cursor-pointer"
            >
              HIPAA Acknowledgment
            </button>
            .
          </span>
        </label>
        {agreedError && (
          <p className="text-xs text-red-500 ml-1">
            Please agree to the terms before continuing.
          </p>
        )}

        {/* Continue button */}
        {!checkoutUrl ? (
          <>
            <button
              type="button"
              onClick={handleContinue}
              disabled={loading || complianceBlocked}
              className={`whitespace-nowrap w-full flex items-center justify-center gap-2 py-4 text-sm font-extrabold rounded-xl transition-colors ${
                loading || complianceBlocked
                  ? "bg-gray-300 text-white cursor-not-allowed"
                  : "bg-[#ff679a] hover:bg-[#e85a8c] text-white cursor-pointer shadow-[0_8px_22px_-10px_rgba(255,103,154,0.55)]"
              }`}
              aria-describedby={complianceBlocked ? "klarna-compliance-hint" : undefined}
            >
              <div className="w-14 h-5 flex items-center justify-center bg-white/20 rounded text-[9px] font-extrabold">
                Klarna
              </div>
              Pay 4× ${installment} — Continue
            </button>

            {/* Compliance-blocked helper — explains why the button is greyed out
                when the state-law acknowledgment above is unchecked. */}
            {complianceBlocked && (
              <p
                id="klarna-compliance-hint"
                className="text-xs text-slate-600 leading-relaxed flex items-start gap-1.5 mt-2"
                role="note"
              >
                <i className="ri-information-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                <span>
                  Please acknowledge the state law notice above before continuing with Klarna.
                </span>
              </p>
            )}

            {/* Submit / fetch / redirect failure — distinct from agreement error. */}
            {submitError && (
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-800 leading-relaxed">{submitError}</p>
              </div>
            )}
          </>
        ) : (
          <div ref={fallbackRef} className="space-y-3">
            {/* Calm, clear post-redirect guidance. Many users return to this tab
                after finishing Klarna and need an obvious "I'm done" path.
                Two clearly numbered steps reduce confusion on mobile. */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 flex items-start gap-2.5">
              <div className="w-6 h-6 flex items-center justify-center bg-white rounded-full flex-shrink-0 ring-1 ring-emerald-200 mt-0.5">
                <i className="ri-check-line text-emerald-600 text-sm"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-800 leading-snug">
                  Your assessment is saved
                </p>
                <p className="text-[11px] text-emerald-700/90 leading-relaxed mt-0.5">
                  Finish payment in the Klarna tab, then return here and tap <span className="font-semibold">&quot;I&apos;ve Completed Payment&quot;</span> below to issue your letter.
                </p>
              </div>
            </div>

            {/* Primary action — make "I've Completed Payment" the dominant CTA.
                Most returning users have finished Klarna; only popup-blocked users
                need the reopen path. */}
            <button
              type="button"
              onClick={checkPaymentStatus}
              disabled={checkingStatus}
              className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-base font-extrabold rounded-xl transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(16,185,129,0.55)] ring-2 ring-emerald-200/40"
            >
              {checkingStatus ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-lg"></i>
                  Confirming Payment...
                </>
              ) : (
                <>
                  <i className="ri-check-double-line text-lg"></i>
                  I&apos;ve Completed Payment
                </>
              )}
            </button>

            {/* Secondary path for popup-blocked browsers */}
            <button
              type="button"
              onClick={() => window.open(checkoutUrl, "_blank")}
              className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-[#fff0f5] border border-[#f9c6d8] text-[#17120e] text-sm font-bold rounded-xl transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line text-[#ff679a]"></i>
              Reopen Klarna checkout
            </button>

            <p className="text-[11px] text-center text-slate-500 leading-relaxed">
              Pop-up blocked? Tap &quot;Reopen Klarna checkout&quot; above.
            </p>

            {statusError && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-amber-700 leading-relaxed">{statusError}</p>
              </div>
            )}
          </div>
        )}

        {/* Info note */}
        <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-information-line text-gray-400 text-sm"></i>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            You&apos;ll be redirected to Klarna&apos;s secure checkout to complete your installment plan. Your ESA letter process begins immediately after approval.
          </p>
        </div>

        <p className="text-[10px] text-center text-gray-400">
          Available for one-time purchases · Subject to Klarna eligibility
        </p>
      </div>
    </>
  );
}