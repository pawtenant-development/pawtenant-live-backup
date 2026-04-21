import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import PolicyModal from "./PolicyModal";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

interface QRPaymentTabProps {
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
}

// ─── Processing Overlay ───────────────────────────────────────────────────────

function ProcessingOverlay() {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl px-8 py-10 flex flex-col items-center gap-4 shadow-2xl">
        <div className="w-12 h-12 border-4 border-gray-100 border-t-[#1A5C4F] rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-700">Generating Payment Link...</p>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function QRPaymentTab({
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
}: QRPaymentTabProps) {
  const [loading, setLoading] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ url: string; title: string } | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Generate checkout URL when terms are agreed
  useEffect(() => {
    if (agreed && !checkoutUrl && !loading) {
      generateCheckoutUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreed]);

  const generateCheckoutUrl = async () => {
    setLoading(true);

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
          mode: "qr",
          planType,
          origin: window.location.origin,
          // Pass coupon code for backend discount application
          ...(couponCode ? { couponCode } : {}),
        }),
      });

      const data = await res.json();

      if (data.url) {
        setCheckoutUrl(data.url);
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (err) {
      console.error("QR checkout error:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!confirmationId) return;
    setCheckingStatus(true);
    setStatusError("");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await sb
        .from("orders")
        .select("status, paid_at")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (data && data.paid_at) {
        setPaymentCompleted(true);
        onSuccess?.();
      } else {
        setStatusError("Payment not yet completed. Please finish payment on your mobile device and try again.");
      }
    } catch (err) {
      console.error("Error checking payment status:", err);
      setStatusError("Could not verify payment status. Please try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  const copyLink = async () => {
    if (!checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = checkoutUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        {/* Instruction */}
        <div className="text-center">
          <p className="text-sm font-extrabold text-gray-900 mb-1">Pay with Your Phone</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Scan the QR code with your phone&apos;s camera to pay securely using Apple Pay, Google Pay, or your mobile wallet.
          </p>
        </div>

        {/* Agreement checkbox - must be checked before showing QR */}
        {!agreed ? (
          <label
            className={`flex items-start gap-2.5 cursor-pointer rounded-xl border px-4 py-3.5 hover:border-[#CFE2DC] transition-colors ${
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
              className="mt-0.5 accent-[#1A5C4F] flex-shrink-0 cursor-pointer"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              I agree to the{" "}
              <button
                type="button"
                onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Terms of Use" })}
                className="text-[#1A5C4F] font-semibold hover:underline cursor-pointer"
              >
                Terms of Use
              </button>
              ,{" "}
              <button
                type="button"
                onClick={() => setPolicyModal({ url: "/terms-of-use", title: "Informed Consent" })}
                className="text-[#1A5C4F] font-semibold hover:underline cursor-pointer"
              >
                Informed Consent
              </button>
              , and{" "}
              <button
                type="button"
                onClick={() => setPolicyModal({ url: "/privacy-policy", title: "HIPAA Acknowledgment" })}
                className="text-[#1A5C4F] font-semibold hover:underline cursor-pointer"
              >
                HIPAA Acknowledgment
              </button>
              .
            </span>
          </label>
        ) : null}
        
        {agreedError && (
          <p className="text-xs text-red-500 ml-1">
            Please agree to the terms before continuing.
          </p>
        )}

        {/* QR Code or placeholder */}
        <div className="flex items-center justify-center">
          {agreed && checkoutUrl ? (
            <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm">
              <QRCodeSVG
                value={checkoutUrl}
                size={160}
                level="H"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#1f2937"
                imageSettings={{
                  src: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/6e37e8c9-809c-4d69-8421-96689959e310_Favicon-02.png?v=3e7d245d886406c510e9428eba87315a",
                  x: undefined,
                  y: undefined,
                  height: 32,
                  width: 32,
                  excavate: true,
                }}
              />
            </div>
          ) : (
            <div className="w-44 h-44 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <i className="ri-qr-code-line text-gray-300 text-4xl"></i>
              </div>
              <p className="text-[10px] text-gray-400 font-semibold text-center px-3 leading-relaxed">
                {agreed ? "Generating QR code..." : "Accept terms to generate QR code"}
              </p>
            </div>
          )}
        </div>

        {/* Copy link button */}
        {agreed && checkoutUrl && (
          <button
            type="button"
            onClick={copyLink}
            className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <i className="ri-check-line text-emerald-500"></i>
                Link Copied!
              </>
            ) : (
              <>
                <i className="ri-link"></i>
                Copy Payment Link
              </>
            )}
          </button>
        )}

        {/* Mobile pay options */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex items-center justify-center gap-2 bg-black rounded-xl px-3 py-3">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-apple-fill text-white text-base"></i>
            </div>
            <span className="text-xs font-extrabold text-white">Apple Pay</span>
          </div>
          <div className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-3">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-google-fill text-[#4285f4] text-base"></i>
            </div>
            <span className="text-xs font-extrabold text-gray-800">Google Pay</span>
          </div>
        </div>

        {/* I've completed payment button */}
        {agreed && checkoutUrl && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={checkPaymentStatus}
              disabled={checkingStatus}
              className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-sm font-extrabold rounded-xl transition-colors cursor-pointer"
            >
              {checkingStatus ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Checking...
                </>
              ) : (
                <>
                  <i className="ri-check-double-line"></i>
                  I&apos;ve Completed Payment
                </>
              )}
            </button>
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
            The QR code contains a secure payment link. Scan it with your phone&apos;s camera or any QR reader app to complete payment.
          </p>
        </div>

        {/* Fallback call */}
        <p className="text-[11px] text-center text-gray-400 leading-relaxed">
          Or call us at{" "}
          <a href="tel:+14099655885" className="font-bold text-[#1A5C4F] hover:underline cursor-pointer">
            409-965-5885
          </a>{" "}
          to complete your order over the phone.
        </p>
      </div>
    </>
  );
}