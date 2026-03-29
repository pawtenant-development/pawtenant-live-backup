import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";

interface QRPaymentTabProps {
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

export default function QRPaymentTab({
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
}: QRPaymentTabProps) {
  const navigate = useNavigate();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [paymentDetected, setPaymentDetected] = useState(false);

  const planLabel = plan === "subscription" ? "Annual Subscription" : "One-Time Purchase";

  const fetchCheckoutUrl = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const successUrl = `${window.location.origin}/assessment/thank-you?amount=${amount}&order_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}/assessment`;

      console.log("[QR] successUrl being sent to Stripe:", successUrl);

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
        setFetchError(json.error ?? "Unable to generate payment link.");
      }
    } catch {
      setFetchError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [plan, petCount, deliverySpeed, email, firstName, lastName, additionalDocCount]);

  // Only auto-fetch once terms are agreed
  useEffect(() => {
    if (agreed && !checkoutUrl && !loading) {
      fetchCheckoutUrl();
    }
  }, [agreed, checkoutUrl, loading, fetchCheckoutUrl]);

  const handleAgree = (checked: boolean) => {
    setAgreed(checked);
    if (checked) setAgreedError(false);
  };

  const handleCopyLink = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // silently ignore
    }
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
        console.log("[QR] Payment confirmed via poll — navigating with params:", {
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

  // ── Terms gate ─────────────────────────────────────────────────────────────
  if (!agreed) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-center">
          <div className="w-10 h-10 flex items-center justify-center mx-auto mb-2">
            <i className="ri-file-shield-2-line text-amber-500 text-2xl" />
          </div>
          <p className="text-sm font-bold text-gray-800 mb-1">Agree to Terms First</p>
          <p className="text-xs text-gray-500">
            Please review and accept the Terms &amp; Conditions below to generate your secure QR code.
          </p>
        </div>

        <label className={`flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border transition-colors ${agreedError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50 hover:border-[#1a5c4f]/30"}`}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => handleAgree(e.target.checked)}
            className="mt-0.5 accent-[#1a5c4f] flex-shrink-0"
          />
          <span className={`text-xs leading-relaxed ${agreedError ? "text-red-600" : "text-gray-600"}`}>
            I agree to the PawTenant{" "}
            <Link to="/terms-of-use" className="text-[#1a5c4f] font-semibold hover:underline" target="_blank">Service Terms</Link>
            {", "}
            <a href="#" className="text-[#1a5c4f] font-semibold hover:underline">Informed Consent for Teletherapy</a>
            {", and "}
            <Link to="/privacy-policy" className="text-[#1a5c4f] font-semibold hover:underline" target="_blank">HIPAA</Link>
            . I also confirm that I am at least 18 years of age.
          </span>
        </label>
        {agreedError && (
          <p className="text-xs text-red-500 flex items-center gap-1.5">
            <i className="ri-error-warning-line" />
            Please agree to the terms to generate your QR code.
          </p>
        )}
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-10 h-10 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-[#1a5c4f] text-2xl" />
        </div>
        <p className="text-sm font-semibold text-gray-600">Generating secure QR code…</p>
        <p className="text-xs text-gray-400">This only takes a second</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (fetchError || !checkoutUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
        <div className="w-10 h-10 flex items-center justify-center text-red-400">
          <i className="ri-error-warning-line text-2xl" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Couldn&apos;t generate QR code</p>
          <p className="text-xs text-gray-500 mt-1">{fetchError || "Something went wrong."}</p>
        </div>
        <button
          type="button"
          onClick={fetchCheckoutUrl}
          className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer"
        >
          <i className="ri-refresh-line" />
          Try Again
        </button>
      </div>
    );
  }

  // ── Payment detected ───────────────────────────────────────────────────────
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

  // ── QR ready ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-bold text-gray-800">Scan to Pay</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Open your phone camera and scan the code below to pay securely via Stripe.
        </p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 inline-block">
          <QRCodeSVG
            value={checkoutUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#111827"
            level="M"
            includeMargin={false}
            imageSettings={{
              src: "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png",
              height: 28,
              width: 64,
              excavate: true,
            }}
          />
        </div>

        {/* Amount badge */}
        <div className="flex items-center gap-2 bg-[#1a5c4f] text-white rounded-full px-5 py-2">
          <i className="ri-secure-payment-line text-sm" />
          <span className="text-sm font-extrabold">${amount}.00</span>
          <span className="text-xs opacity-80">· {planLabel}</span>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-gray-50 rounded-xl px-4 py-3.5 space-y-2.5">
        {[
          { icon: "ri-camera-line", step: "1", label: "Open your phone camera" },
          { icon: "ri-qr-scan-2-line", step: "2", label: "Scan the QR code above" },
          { icon: "ri-bank-card-line", step: "3", label: "Complete secure payment on Stripe" },
          { icon: "ri-mail-check-line", step: "4", label: "Confirmation email sent automatically" },
        ].map((s) => (
          <div key={s.step} className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a5c4f]/10 flex-shrink-0">
              <span className="text-[10px] font-extrabold text-[#1a5c4f]">{s.step}</span>
            </div>
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className={`${s.icon} text-gray-400 text-sm`} />
            </div>
            <span className="text-xs text-gray-600">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Copy link fallback */}
      <div>
        <p className="text-xs text-gray-400 text-center mb-2">Can&apos;t scan? Copy the payment link instead:</p>
        <button
          type="button"
          onClick={handleCopyLink}
          className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-600 font-semibold hover:border-[#1a5c4f] hover:text-[#1a5c4f] transition-colors cursor-pointer"
        >
          <i className={copied ? "ri-checkbox-circle-line text-green-500" : "ri-links-line"} />
          {copied ? "Link copied!" : "Copy payment link"}
        </button>
      </div>

      {/* Check payment status */}
      <button
        type="button"
        onClick={handleCheckPayment}
        disabled={checking}
        className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-lg hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-70"
      >
        {checking ? (
          <>
            <i className="ri-loader-4-line animate-spin" />
            Checking payment status...
          </>
        ) : (
          <>
            <i className="ri-checkbox-circle-line" />
            I&apos;ve completed payment{checkCount > 0 ? " — check again" : ""}
          </>
        )}
      </button>

      {checkCount > 0 && !checking && (
        <p className="text-xs text-center text-amber-600 flex items-center justify-center gap-1.5">
          <i className="ri-time-line" />
          Payment not detected yet — please wait 30 seconds and try again.
        </p>
      )}

      {/* Trust note */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <div className="w-4 h-4 flex items-center justify-center">
          <i className="ri-lock-2-line text-gray-400 text-xs" />
        </div>
        <span className="text-xs text-gray-400">Powered by</span>
        <span className="text-xs font-extrabold text-[#635BFF]">stripe</span>
        <span className="text-xs text-gray-300">·</span>
        <span className="text-xs text-gray-400">256-bit SSL encrypted</span>
      </div>
    </div>
  );
}
