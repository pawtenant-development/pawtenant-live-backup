import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

interface KlarnaPaymentTabProps {
  amount: number;
  plan: "one-time" | "subscription";
  petCount: number;
  deliverySpeed: string;
  email: string;
  firstName: string;
  lastName: string;
  additionalDocCount: number;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  agreedError: boolean;
  setAgreedError: (v: boolean) => void;
  // ── Order-level metadata (required for webhook matching) ────────────────
  confirmationId: string;
  phone: string;
  state: string;
  selectedProvider: string;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

export default function KlarnaPaymentTab({
  amount,
  plan,
  petCount,
  deliverySpeed,
  email,
  firstName,
  lastName,
  additionalDocCount,
  agreed,
  setAgreed,
  agreedError,
  setAgreedError,
  confirmationId,
  phone,
  state,
  selectedProvider,
}: KlarnaPaymentTabProps) {
  const navigate = useNavigate();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [paymentDetected, setPaymentDetected] = useState(false);

  const installmentAmount = (amount / 4).toFixed(2);

  const fetchCheckoutUrl = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const successUrl = `${window.location.origin}/assessment/thank-you?amount=${amount}&order_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/assessment`;

      console.log("[Klarna] successUrl being sent to Stripe:", successUrl);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          plan,
          petCount,
          deliverySpeed,
          email,
          customerName: `${firstName} ${lastName}`.trim(),
          additionalDocCount,
          successUrl,
          cancelUrl,
          paymentMethods: ["card", "klarna"],
          metadata: {
            confirmationId,
            firstName,
            lastName,
            email,
            phone,
            state,
            selectedProvider,
            planType: plan,
            deliverySpeed,
            petCount: String(petCount),
            additionalDocCount: String(additionalDocCount),
          },
        }),
      });

      const json = await res.json() as { url?: string; sessionId?: string; error?: string };

      if (json.url) {
        setCheckoutUrl(json.url);
        setSessionId(json.sessionId ?? null);
      } else {
        setFetchError(json.error ?? "Unable to generate Klarna payment link.");
      }
    } catch {
      setFetchError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [plan, petCount, deliverySpeed, email, firstName, lastName, additionalDocCount]);

  useEffect(() => {
    fetchCheckoutUrl();
  }, [fetchCheckoutUrl]);

  const handleOpenKlarna = () => {
    if (!checkoutUrl) return;
    if (!agreed) {
      setAgreedError(true);
      return;
    }
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  const handleCheckPayment = async () => {
    if (!sessionId) {
      setCheckCount((c) => c + 1);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-payment-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json() as { paid?: boolean; error?: string };
      if (data.paid) {
        setPaymentDetected(true);
        console.log("[Klarna] Payment confirmed via poll — navigating with params:", {
          amount,
          order_id: sessionId ?? confirmationId,
          note: "sessionId used when available; falls back to confirmationId",
        });
        setTimeout(() => navigate(`/assessment/thank-you?amount=${amount}&order_id=${sessionId ?? confirmationId}`), 1200);
      } else {
        setCheckCount((c) => c + 1);
      }
    } catch {
      setCheckCount((c) => c + 1);
    } finally {
      setChecking(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-10 h-10 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-[#FF6A8A] text-2xl" />
        </div>
        <p className="text-sm font-semibold text-gray-600">Preparing Klarna checkout…</p>
        <p className="text-xs text-gray-400">Just a moment</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (fetchError || !checkoutUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
        <div className="w-10 h-10 flex items-center justify-center text-red-400">
          <i className="ri-error-warning-line text-2xl" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Couldn&apos;t load Klarna</p>
          <p className="text-xs text-gray-500 mt-1">{fetchError || "Something went wrong."}</p>
        </div>
        <button
          type="button"
          onClick={fetchCheckoutUrl}
          className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 bg-[#FF6A8A] text-white text-xs font-bold rounded-lg hover:bg-[#e55a7a] cursor-pointer"
        >
          <i className="ri-refresh-line" />
          Try Again
        </button>
      </div>
    );
  }

  // ── Payment confirmed ──────────────────────────────────────────────────────
  if (paymentDetected) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-green-100">
          <i className="ri-checkbox-circle-fill text-green-600 text-3xl" />
        </div>
        <p className="text-base font-extrabold text-gray-900">Payment confirmed!</p>
        <p className="text-sm text-gray-500">Redirecting you now…</p>
        <div className="w-8 h-8 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-[#1a5c4f] text-xl" />
        </div>
      </div>
    );
  }

  // ── Klarna ready ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Klarna branding header */}
      <div className="bg-[#FFF0F5] rounded-xl px-5 py-4 text-center border border-[#FFD6E5]">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="bg-[#FFB3C7] rounded-md px-3 py-1.5 inline-flex items-center">
            <span className="text-sm font-extrabold text-[#17120E] tracking-tight">Klarna.</span>
          </div>
          <span className="text-xs font-semibold text-[#FF6A8A]">Pay Later</span>
        </div>
        <p className="text-base font-extrabold text-gray-900">
          4 payments of <span className="text-[#FF6A8A]">${installmentAmount}</span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          No interest · No fees · Split your ${amount}.00 into 4 easy payments
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-xl px-4 py-3.5 space-y-2.5">
        {[
          { icon: "ri-arrow-right-circle-line", step: "1", label: `Pay $${installmentAmount} today` },
          { icon: "ri-calendar-line", step: "2", label: `$${installmentAmount} in 2 weeks` },
          { icon: "ri-calendar-line", step: "3", label: `$${installmentAmount} in 4 weeks` },
          { icon: "ri-calendar-line", step: "4", label: `$${installmentAmount} in 6 weeks` },
        ].map((s) => (
          <div key={s.step} className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#FF6A8A]/10 flex-shrink-0">
              <span className="text-[10px] font-extrabold text-[#FF6A8A]">{s.step}</span>
            </div>
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className={`${s.icon} text-gray-400 text-sm`} />
            </div>
            <span className="text-xs text-gray-600">{s.label}</span>
          </div>
        ))}
      </div>

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
        type="button"
        onClick={handleOpenKlarna}
        className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3.5 bg-[#FFB3C7] text-[#17120E] text-sm font-extrabold rounded-lg hover:bg-[#ffa0b8] transition-colors cursor-pointer"
      >
        <i className="ri-external-link-line" />
        Continue with Klarna
      </button>

      {/* Already paid check */}
      {opened && (
        <div className="space-y-3">
          <p className="text-xs text-center text-gray-500">
            Already completed your Klarna payment? Click below to confirm:
          </p>
          <button
            type="button"
            onClick={handleCheckPayment}
            disabled={checking}
            className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-2.5 border-2 border-[#1a5c4f] text-[#1a5c4f] text-sm font-bold rounded-lg hover:bg-[#f0faf7] transition-colors cursor-pointer disabled:opacity-70"
          >
            {checking ? (
              <>
                <i className="ri-loader-4-line animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <i className="ri-checkbox-circle-line" />
                I&apos;ve completed payment{checkCount > 0 ? " — try again" : ""}
              </>
            )}
          </button>
          {checkCount > 0 && !checking && (
            <p className="text-xs text-center text-amber-600 flex items-center justify-center gap-1.5">
              <i className="ri-time-line" />
              Payment not detected yet — wait 30 seconds and try again.
            </p>
          )}
        </div>
      )}

      {/* Fine print */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <div className="w-4 h-4 flex items-center justify-center">
          <i className="ri-shield-check-line text-gray-400 text-xs" />
        </div>
        <span className="text-xs text-gray-400">
          No credit check · Available to US customers ·{" "}
          <a
            href="https://www.klarna.com/us/pay-in-4/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6A8A] hover:underline cursor-pointer"
          >
            Learn more
          </a>
        </span>
      </div>
    </div>
  );
}
