// CustomerOtpStep — email verification gate shown after "Your Information"
// and before checkout. Sends a 6-digit code to the customer's email via
// send-customer-otp, verifies it via verify-customer-otp, and (best-effort)
// establishes a browser session from the returned magic-link token so the
// post-payment portal CTA lands them straight in their account.
//
// No password is required here. On success the parent advances to the
// assurance screen, then checkout. The customer's assessment answers are
// untouched — this is a gate, not a data step.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import OtpDigitsInput from "@/components/feature/OtpDigitsInput";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface Props {
  email: string;
  firstName?: string;
  confirmationId: string;
  letterType: "esa" | "psd";
  accent?: "esa" | "psd";
  onVerified: () => void;
  onBack: () => void;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

export default function CustomerOtpStep({ email, firstName, confirmationId, letterType, accent = "esa", onVerified, onBack }: Props) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const sentOnceRef = useRef(false);

  const orange = accent === "psd";
  const primaryBg = orange ? "bg-amber-600 hover:bg-amber-700" : "bg-[#F97316] hover:bg-[#EA580C]";
  const linkColor = orange ? "text-amber-700" : "text-[#1A5C4F]";

  const sendCode = async () => {
    setError("");
    setInfo("");
    setSending(true);
    const r = await post("send-customer-otp", { email, confirmationId, firstName, letterType });
    setSending(false);
    if (r?.ok) {
      setInfo(r.cooldown ? "A code was just sent — check your inbox." : `We sent a 6-digit code to ${email}.`);
      setCooldown(r.retryInSeconds ?? 45);
    } else {
      setError(r?.error ?? "Could not send the code. Please try again.");
    }
  };

  // Auto-send once on mount.
  useEffect(() => {
    if (sentOnceRef.current) return;
    sentOnceRef.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (fullCode: string) => {
    setError("");
    setVerifying(true);
    const r = await post("verify-customer-otp", { email, code: fullCode, confirmationId });
    if (r?.ok && r?.verified) {
      // Best-effort: establish a browser session so the portal CTA works
      // seamlessly after payment. Never blocks the flow.
      if (r.sessionToken) {
        try {
          await supabase.auth.verifyOtp({ token_hash: r.sessionToken, type: "magiclink" });
        } catch { /* non-fatal */ }
      }
      setVerifying(false);
      onVerified();
      return;
    }
    setVerifying(false);
    setCode("");
    setError(r?.error ?? "That code didn't match. Please try again.");
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto flex items-center justify-center bg-[#E8F1EE] rounded-xl mb-3">
            <i className="ri-mail-lock-line text-[#1A5C4F] text-xl"></i>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900">Verify your email</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Enter the 6-digit code we sent to <span className="font-semibold text-gray-700">{email}</span> to
            secure your order and continue to checkout.
          </p>
        </div>

        <OtpDigitsInput
          value={code}
          onChange={setCode}
          onComplete={(v) => verify(v)}
          disabled={verifying}
          error={!!error}
          autoFocus
        />

        {error && (
          <p className="text-xs text-red-600 mt-3 text-center flex items-center justify-center gap-1">
            <i className="ri-error-warning-line"></i>{error}
          </p>
        )}
        {!error && info && (
          <p className="text-xs text-gray-400 mt-3 text-center">{info}</p>
        )}

        <button
          type="button"
          onClick={() => verify(code)}
          disabled={verifying || code.length !== 6}
          className={`mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-white font-bold text-sm rounded-xl transition-colors ${
            verifying || code.length !== 6 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : `${primaryBg} cursor-pointer`
          }`}
        >
          {verifying ? (<><i className="ri-loader-4-line animate-spin"></i> Verifying…</>) : (<>Verify &amp; Continue <i className="ri-arrow-right-line"></i></>)}
        </button>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-xs font-semibold text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 cursor-pointer">
            <i className="ri-arrow-left-line"></i> Back
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={sending || cooldown > 0}
            className={`text-xs font-semibold ${sending || cooldown > 0 ? "text-gray-300 cursor-not-allowed" : `${linkColor} hover:underline cursor-pointer`}`}
          >
            {sending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
        We verify your email so your letter and order updates reach you — and so you can access your secure
        customer portal after checkout. No password is required to pay.
      </p>
    </div>
  );
}
