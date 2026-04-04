// TrustpilotReviewPanel — Send Trustpilot review request via Email or SMS
// Only rendered for completed orders (doctor_status === "patient_notified")
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const TRUSTPILOT_REVIEW_URL = "https://www.trustpilot.com/review/pawtenant.com";

const PAWTENANT_GREEN = "#1a5c4f";
const PAWTENANT_LIGHT = "#f0faf7";
const PAWTENANT_BORDER = "#b8ddd5";

interface TrustpilotReviewPanelProps {
  orderId: string;
  confirmationId: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  supabaseUrl: string;
  anonKey: string;
}

function buildEmailHTML(firstName: string): string {
  const name = firstName || "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Share Your Experience — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;">

      <!-- Header -->
      <tr>
        <td style="background:${PAWTENANT_GREEN};padding:32px 40px;text-align:center;">
          <img src="https://pawtenant.com/logo-white.png" alt="PawTenant" height="40" style="height:40px;display:block;margin:0 auto 12px;" onerror="this.style.display='none'"/>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">Your ESA Letter is Ready!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Thank you for choosing PawTenant</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
            We hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.
          </p>
          <p style="margin:0 0 28px;color:#444;font-size:15px;line-height:1.7;">
            If you had a positive experience, we'd love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.
          </p>

          <!-- Star graphic -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td align="center" style="background:${PAWTENANT_LIGHT};border:1px solid ${PAWTENANT_BORDER};border-radius:12px;padding:24px 20px;">
                <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
                <p style="margin:0 0 4px;color:${PAWTENANT_GREEN};font-size:15px;font-weight:700;">Leave us a 5-star review on Trustpilot</p>
                <p style="margin:0;color:#666;font-size:13px;">Takes less than 60 seconds</p>
              </td>
            </tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center">
                <a href="${TRUSTPILOT_REVIEW_URL}"
                   style="display:inline-block;background:${PAWTENANT_GREEN};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                  &#9733; Write My Review
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            Or copy this link into your browser:<br/>
            <a href="${TRUSTPILOT_REVIEW_URL}" style="color:${PAWTENANT_GREEN};word-break:break-all;">${TRUSTPILOT_REVIEW_URL}</a>
          </p>
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>

      <!-- Footer -->
      <tr>
        <td style="padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;color:#aaa;font-size:12px;">PawTenant &bull; Secure ESA Consultation Support</p>
          <p style="margin:0;color:#ccc;font-size:11px;">
            <a href="https://pawtenant.com" style="color:#aaa;text-decoration:none;">pawtenant.com</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildSMSText(firstName: string): string {
  const name = firstName || "there";
  return `Hi ${name}! Your ESA letter from PawTenant is complete. If you had a great experience, we'd love a quick Trustpilot review — it really helps! ⭐ ${TRUSTPILOT_REVIEW_URL}`;
}

export default function TrustpilotReviewPanel({
  orderId,
  confirmationId,
  email,
  phone,
  firstName,
  supabaseUrl,
  anonKey,
}: TrustpilotReviewPanelProps) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailOk, setEmailOk] = useState<boolean | null>(null);

  const [sendingSMS, setSendingSMS] = useState(false);
  const [smsMsg, setSmsMsg] = useState("");
  const [smsOk, setSmsOk] = useState<boolean | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"email" | "sms">("email");

  const name = firstName || "";
  const emailHTML = buildEmailHTML(name);
  const smsText = buildSMSText(name);

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setEmailMsg("");
    setEmailOk(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-review-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId,
          email,
          firstName: name,
          channel: "email",
          reviewUrl: TRUSTPILOT_REVIEW_URL,
        }),
      });

      const result = await res.json() as { ok?: boolean; error?: string };
      if (result.ok) {
        setEmailMsg(`Review request sent to ${email}`);
        setEmailOk(true);
        // Log to audit
        try {
          await supabase.from("audit_logs").insert({
            action: "trustpilot_review_email_sent",
            object_type: "order",
            object_id: orderId,
            description: `Trustpilot review email sent to ${email} for order ${confirmationId}`,
            metadata: { confirmationId, to: email, channel: "email" },
          });
        } catch { /* non-critical */ }
      } else {
        setEmailMsg(result.error ?? "Send failed — check edge function logs");
        setEmailOk(false);
      }
    } catch {
      setEmailMsg("Network error — please try again");
      setEmailOk(false);
    }
    setSendingEmail(false);
    setTimeout(() => { setEmailMsg(""); setEmailOk(null); }, 7000);
  };

  const handleSendSMS = async () => {
    if (!phone) return;
    setSendingSMS(true);
    setSmsMsg("");
    setSmsOk(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-review-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId,
          phone,
          firstName: name,
          channel: "sms",
          reviewUrl: TRUSTPILOT_REVIEW_URL,
          smsBody: smsText,
        }),
      });

      const result = await res.json() as { ok?: boolean; error?: string };
      if (result.ok) {
        setSmsMsg(`SMS sent to ${phone}`);
        setSmsOk(true);
        try {
          await supabase.from("audit_logs").insert({
            action: "trustpilot_review_sms_sent",
            object_type: "order",
            object_id: orderId,
            description: `Trustpilot review SMS sent to ${phone} for order ${confirmationId}`,
            metadata: { confirmationId, to: phone, channel: "sms" },
          });
        } catch { /* non-critical */ }
      } else {
        setSmsMsg(result.error ?? "SMS failed — check Twilio config");
        setSmsOk(false);
      }
    } catch {
      setSmsMsg("Network error — please try again");
      setSmsOk(false);
    }
    setSendingSMS(false);
    setTimeout(() => { setSmsMsg(""); setSmsOk(null); }, 7000);
  };

  return (
    <div className="bg-white rounded-xl border border-[#b8ddd5] p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 flex items-center justify-center bg-[#e8f5f1] rounded-xl flex-shrink-0">
          <i className="ri-star-smile-line text-[#1a5c4f] text-base"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-gray-800 uppercase tracking-widest">Request Trustpilot Review</p>
          <p className="text-xs text-gray-400 mt-0.5">Send a personalised review request to the customer</p>
        </div>
        {/* Trustpilot logo badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00b67a]/10 border border-[#00b67a]/30 rounded-lg flex-shrink-0">
          <span className="text-[#00b67a] font-extrabold text-xs">★</span>
          <span className="text-[#00b67a] font-extrabold text-xs">Trustpilot</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {/* Email */}
        <button
          type="button"
          onClick={handleSendEmail}
          disabled={sendingEmail}
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {sendingEmail
            ? <><i className="ri-loader-4-line animate-spin"></i>Sending Email...</>
            : <><i className="ri-mail-send-line"></i>Send Review Email</>
          }
        </button>

        {/* SMS */}
        <button
          type="button"
          onClick={handleSendSMS}
          disabled={sendingSMS || !phone}
          title={!phone ? "No phone number on file for this customer" : undefined}
          className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors ${
            phone
              ? "border border-[#b8ddd5] text-[#1a5c4f] hover:bg-[#f0faf7] cursor-pointer disabled:opacity-50"
              : "border border-gray-200 text-gray-300 cursor-not-allowed"
          }`}
        >
          {sendingSMS
            ? <><i className="ri-loader-4-line animate-spin"></i>Sending SMS...</>
            : <>
                <i className="ri-message-3-line"></i>
                Send Review SMS
                {!phone && <i className="ri-lock-2-line text-xs ml-1"></i>}
              </>
          }
        </button>
      </div>

      {/* Feedback messages */}
      {emailMsg && (
        <p className={`text-xs flex items-center gap-1.5 font-semibold mb-2 ${emailOk ? "text-[#1a5c4f]" : "text-red-600"}`}>
          <i className={emailOk ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {emailMsg}
        </p>
      )}
      {smsMsg && (
        <p className={`text-xs flex items-center gap-1.5 font-semibold mb-2 ${smsOk ? "text-[#1a5c4f]" : "text-red-600"}`}>
          <i className={smsOk ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {smsMsg}
        </p>
      )}

      {/* Preview toggle */}
      <div className="border-t border-gray-100 pt-3 mt-1">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="whitespace-nowrap flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#1a5c4f] font-semibold cursor-pointer transition-colors"
        >
          <i className={showPreview ? "ri-eye-off-line" : "ri-eye-line"}></i>
          {showPreview ? "Hide Preview" : "Preview Templates"}
        </button>

        {showPreview && (
          <div className="mt-3 space-y-3">
            {/* Tab switcher */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {(["email", "sms"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    previewMode === mode ? "bg-white text-[#1a5c4f]" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <i className={mode === "email" ? "ri-mail-line" : "ri-message-3-line"}></i>
                  {mode === "email" ? "Email" : "SMS"}
                </button>
              ))}
            </div>

            {previewMode === "email" ? (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
                  <i className="ri-mail-line text-gray-400 text-sm"></i>
                  <span className="text-xs font-semibold text-gray-600">Email Preview</span>
                  <span className="ml-auto text-xs text-gray-400">To: {email}</span>
                </div>
                <iframe
                  srcDoc={emailHTML}
                  title="Email Preview"
                  className="w-full border-0"
                  style={{ height: 480 }}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-message-3-line text-gray-400 text-sm"></i>
                  <span className="text-xs font-semibold text-gray-600">SMS Preview</span>
                  {phone && <span className="ml-auto text-xs text-gray-400">To: {phone}</span>}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 max-w-xs">
                  <div className="bg-[#1a5c4f] text-white text-sm rounded-2xl rounded-bl-sm px-4 py-3 leading-relaxed">
                    {smsText}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-right">{smsText.length} chars</p>
                </div>
                {!phone && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <i className="ri-information-line"></i>
                    No phone number on file — SMS unavailable for this order
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
