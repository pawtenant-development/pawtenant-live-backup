// CustomerOtpStep — email verification gate shown after "Your Information"
// and before checkout. Sends a 6-digit code to the customer's email via
// send-customer-otp, verifies it via verify-customer-otp, and (best-effort)
// establishes a browser session from the returned magic-link token so the
// post-payment portal CTA lands them straight in their account.
//
// No password is required here. On success the parent routes to checkout (or,
// in the legacy flow, the assurance screen). The customer's assessment answers
// are untouched — this is a gate, not a data step.
//
// Privacy: analytics here record only confirmation_id / letter_type / coarse
// category enums / flow_version — NEVER the OTP code or the raw email.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import OtpDigitsInput from "@/components/feature/OtpDigitsInput";
import {
  trackOtpRequested,
  trackOtpVerified,
  trackOtpScreenViewed,
  trackOtpSendSucceeded,
  trackOtpSendFailed,
  trackOtpEntryStarted,
  trackOtpResendRequested,
  trackOtpVerifyFailed,
  type OtpVerifyFailureCategory,
} from "@/lib/trackEvent";
import { flowVersionProp } from "@/config/flowVersion";

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

/** Mask an email for display: "john.doe@gmail.com" → "j•••@gmail.com". Never store this. */
function maskEmail(e: string): string {
  const at = (e || "").indexOf("@");
  if (at <= 0) return e || "";
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const head = user.slice(0, 1);
  const dots = "•".repeat(Math.max(1, Math.min(user.length - 1, 3)));
  return `${head}${dots}@${domain}`;
}

/** Bucket a verify error into a privacy-safe category (the message itself is never stored). */
function classifyVerifyFail(msg: string): OtpVerifyFailureCategory {
  const m = (msg || "").toLowerCase();
  if (!msg) return "network";
  if (m.includes("expire")) return "expired";
  if (m.includes("too many") || m.includes("attempts") || m.includes("rate") || m.includes("locked")) return "rate_limited";
  return "wrong_code";
}

export default function CustomerOtpStep({ email, firstName, confirmationId, letterType, accent = "esa", onVerified, onBack }: Props) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const sentOnceRef = useRef(false);
  const entryStartedRef = useRef(false);

  const masked = maskEmail(email);
  const orange = accent === "psd";
  const primaryBg = orange ? "bg-amber-600 hover:bg-amber-700" : "bg-[#F97316] hover:bg-[#EA580C]";
  const linkColor = orange ? "text-amber-700" : "text-[#1A5C4F]";

  const sendCode = async (isResend = false) => {
    setError("");
    setInfo("");
    setSending(true);
    const fv = flowVersionProp();
    if (isResend) {
      try { trackOtpResendRequested(confirmationId, letterType, { flow_version: fv }); } catch { /* analytics never blocks */ }
    }
    let r: { ok?: boolean; cooldown?: boolean; retryInSeconds?: number; error?: string } = {};
    try {
      r = await post("send-customer-otp", { email, confirmationId, firstName, letterType });
    } catch {
      // Network failure (fetch rejected) — surface + record, never leave the button stuck.
      setSending(false);
      setError("Could not send the code. Please check your connection and try again.");
      try { trackOtpSendFailed(confirmationId, "network", letterType, { flow_version: fv }); } catch { /* ignore */ }
      return;
    }
    setSending(false);
    if (r?.ok) {
      setInfo(r.cooldown ? "A code was just sent — check your inbox." : `We sent a 6-digit code to ${masked}.`);
      setCooldown(r.retryInSeconds ?? 45);
      // Funnel: fire only when the server actually dispatched a NEW code. A
      // within-45s cooldown reply (ok:true, cooldown:true) is not a new send, so
      // it must not count as a fresh otp_requested / otp_send_succeeded. A genuine
      // resend after the cooldown expires does fire again (helpers are repeatable).
      if (!r.cooldown) {
        try {
          trackOtpRequested(confirmationId, letterType, { flow_version: fv });
          trackOtpSendSucceeded(confirmationId, letterType, { flow_version: fv });
        } catch { /* analytics never blocks */ }
      }
    } else {
      setError(r?.error ?? "Could not send the code. Please try again.");
      try { trackOtpSendFailed(confirmationId, r?.error ? "server_error" : "unknown", letterType, { flow_version: fv }); } catch { /* ignore */ }
    }
  };

  // Auto-send once on mount + record that the OTP screen actually rendered.
  useEffect(() => {
    if (sentOnceRef.current) return;
    sentOnceRef.current = true;
    try { trackOtpScreenViewed(confirmationId, letterType, { flow_version: flowVersionProp() }); } catch { /* ignore */ }
    void sendCode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Fire otp_entry_started once, when the customer types the first digit.
  const handleCodeChange = (v: string) => {
    if (!entryStartedRef.current && v.length > 0) {
      entryStartedRef.current = true;
      try { trackOtpEntryStarted(confirmationId, letterType, { flow_version: flowVersionProp() }); } catch { /* ignore */ }
    }
    setCode(v);
  };

  const verify = async (fullCode: string) => {
    setError("");
    setVerifying(true);
    const fv = flowVersionProp();
    let r: { ok?: boolean; verified?: boolean; sessionToken?: string; error?: string } = {};
    try {
      r = await post("verify-customer-otp", { email, code: fullCode, confirmationId });
    } catch {
      setVerifying(false);
      setCode("");
      setError("Could not verify right now. Please try again.");
      try { trackOtpVerifyFailed(confirmationId, "network", letterType, { flow_version: fv }); } catch { /* ignore */ }
      return;
    }
    if (r?.ok && r?.verified) {
      // Funnel: server confirmed the OTP. Fired only on verified:true — the
      // server result is the source of truth. No code value is recorded.
      try { trackOtpVerified(confirmationId, letterType, { flow_version: fv }); } catch { /* analytics never blocks */ }
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
    try { trackOtpVerifyFailed(confirmationId, classifyVerifyFail(r?.error ?? ""), letterType, { flow_version: fv }); } catch { /* ignore */ }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto flex items-center justify-center bg-[#E8F1EE] rounded-xl mb-3">
            <i className="ri-mail-lock-line text-[#1A5C4F] text-xl"></i>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900">Confirm your email</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Enter the 6-digit code we sent to <span className="font-semibold text-gray-700">{masked}</span> so we can
            securely save your assessment and deliver your documents.
          </p>
        </div>

        <OtpDigitsInput
          value={code}
          onChange={handleCodeChange}
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
            onClick={() => sendCode(true)}
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
