// CommunicationTab — SMS compose, email compose, call initiation, email delivery log per order
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface CommunicationTabProps {
  orderId: string;
  confirmationId: string;
  phone: string | null;
  email: string;
  patientName: string;
  adminName: string;
  emailLog?: { type: string; sentAt: string; to: string; success: boolean }[] | null;
  hasDocuments?: boolean;
  price?: number | null;
  letterType?: string | null;
  state?: string | null;
  doctorEmail?: string | null;
  doctorName?: string | null;
  onResendProviderEmail?: () => void;
  resendingProvider?: boolean;
  resendProviderMsg?: string;
  onLoadEmailLog?: () => void;
  emailLogLoading?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

// ── Email template groups ──────────────────────────────────────────────────
interface EmailOption {
  value: string;
  label: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
}

const EMAIL_OPTION_GROUPS: { group: string; icon: string; options: EmailOption[] }[] = [
  {
    group: "Order Updates",
    icon: "ri-file-list-3-line",
    options: [
      { value: "order_confirmation", label: "Resend Order Confirmation", desc: "Resends the initial order confirmation + payment receipt email", badge: "Transactional", badgeColor: "bg-[#f0faf7] text-[#1a5c4f]" },
      { value: "under-review",       label: "Under Review Update",       desc: "Lets the customer know their case is being reviewed", badge: "Status", badgeColor: "bg-sky-50 text-sky-700" },
      { value: "completed",          label: "Completed Update",          desc: "Notifies the customer their order is done", badge: "Status", badgeColor: "bg-emerald-50 text-emerald-700" },
      { value: "letter_ready",       label: "Resend Documents Email",    desc: "Re-sends the letter/documents email to the customer", badge: "Documents", badgeColor: "bg-amber-50 text-amber-700" },
    ],
  },
  {
    group: "Lead Recovery",
    icon: "ri-user-follow-line",
    options: [
      { value: "checkout_recovery",    label: "Abandoned Checkout Recovery", desc: "Remind them to complete their ESA/PSD assessment payment — CTA takes them back to checkout", badge: "Recovery", badgeColor: "bg-orange-50 text-orange-600" },
      { value: "followup_lead",        label: "Lead Follow-up",              desc: "Still thinking? Nudge them to get their ESA letter today", badge: "Follow-up", badgeColor: "bg-amber-50 text-amber-700" },
      { value: "consultation_booking", label: "Confirm Provider Consultation", desc: "Confirm their upcoming consultation booking with a licensed provider — CTA links to checkout", badge: "Booking", badgeColor: "bg-violet-50 text-violet-700" },
    ],
  },
];

const ALL_EMAIL_OPTIONS: EmailOption[] = EMAIL_OPTION_GROUPS.flatMap((g) => g.options);

// ── SMS Templates ──────────────────────────────────────────────────────────
const SMS_TEMPLATES = [
  {
    label: "Order Confirmed",
    icon: "ri-checkbox-circle-line",
    color: "text-[#1a5c4f]",
    bg: "bg-[#f0faf7] border-[#b8ddd5] hover:border-[#1a5c4f]",
    getMessage: (firstName: string, orderId: string) =>
      `Hi ${firstName}, your ESA consultation with PawTenant is confirmed! Your Order ID is ${orderId}. Track your order anytime at pawtenant.com/my-orders`,
  },
  {
    label: "Documents Ready",
    icon: "ri-file-check-line",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200 hover:border-amber-400",
    getMessage: (firstName: string, _orderId: string) =>
      `Hi ${firstName}, great news! Your ESA letter is ready. Log in to download your documents at pawtenant.com/my-orders`,
  },
  {
    label: "Under Review",
    icon: "ri-search-eye-line",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200 hover:border-sky-400",
    getMessage: (firstName: string, _orderId: string) =>
      `Hi ${firstName}, your ESA assessment is under review by our licensed provider. We'll notify you as soon as it's complete, usually within 24 hours.`,
  },
  {
    label: "Finish Your ESA Letter",
    icon: "ri-mail-send-line",
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200 hover:border-orange-400",
    getMessage: (firstName: string, orderId: string) =>
      `Hi ${firstName}, you're one step away from your ESA letter! Complete your order here: pawtenant.com/assessment?resume=${orderId} — Reply STOP to opt out.`,
  },
  {
    label: "Still Thinking?",
    icon: "ri-lightbulb-line",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200 hover:border-amber-400",
    getMessage: (firstName: string, orderId: string) =>
      `Hi ${firstName}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment?resume=${orderId} — Reply STOP to opt out.`,
  },
  {
    label: "Consultation Booked",
    icon: "ri-calendar-check-line",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200 hover:border-violet-400",
    getMessage: (firstName: string, orderId: string) =>
      `Hi ${firstName}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment?resume=${orderId}`,
  },
  {
    label: "Need More Info",
    icon: "ri-information-line",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200 hover:border-violet-400",
    getMessage: (firstName: string, _orderId: string) =>
      `Hi ${firstName}, we need a bit more information to complete your ESA assessment. Please reply here or call us and we'll get you sorted quickly!`,
  },
  {
    label: "Follow Up",
    icon: "ri-chat-check-line",
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-200 hover:border-gray-400",
    getMessage: (firstName: string, _orderId: string) =>
      `Hi ${firstName}, just checking in on your ESA order. Is there anything we can help you with?`,
  },
  {
    label: "Refund Processed",
    icon: "ri-refund-line",
    color: "text-red-600",
    bg: "bg-red-50 border-red-200 hover:border-red-400",
    getMessage: (firstName: string, _orderId: string) =>
      `Hi ${firstName}, your refund has been processed and should appear in your account within 3-5 business days. Thank you for your patience.`,
  },
];

const EMAIL_CONTENT_MAP: Record<string, { subject: string; bodyHtml: (name: string, orderId: string, email: string) => string }> = {
  order_confirmation: {
    subject: "Your PawTenant Order is Confirmed!",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a5c4f;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Order Confirmed</h2>
          <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">Thank you for choosing PawTenant</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Your ESA consultation order has been confirmed. A licensed mental health professional will review your assessment and prepare your ESA letter.</p>
          <div style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 4px;font-size:12px;color:#666;">Order ID</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#1a5c4f;font-family:monospace;">${orderId}</p>
          </div>
          <p style="color:#444;font-size:14px;">Track your order at <a href="https://pawtenant.com/my-orders" style="color:#1a5c4f;font-weight:600;">pawtenant.com/my-orders</a></p>
        </div>
      </div>`,
  },
  payment_receipt: {
    subject: "Payment Receipt — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a5c4f;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Payment Received</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">We've received your payment for your ESA letter consultation. Your order <strong>${orderId}</strong> is now being processed.</p>
          <p style="color:#444;font-size:14px;">You'll receive your ESA letter via email once your provider completes the evaluation.</p>
        </div>
      </div>`,
  },
  letter_ready: {
    subject: "Your ESA Letter is Ready — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a5c4f;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Your ESA Letter is Ready!</h2>
          <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">Download your documents now</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Great news! Your ESA letter has been signed and is ready to download. Log in to your portal to access your documents.</p>
          <div style="text-align:center;margin:20px 0;">
            <a href="https://pawtenant.com/my-orders" style="display:inline-block;background:#1a5c4f;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">Download My ESA Letter</a>
          </div>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  status_under_review: {
    subject: "Your ESA Order is Under Review — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#0369a1;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Order Under Review</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Your ESA assessment is currently being reviewed by a licensed mental health professional. We'll notify you as soon as your letter is ready.</p>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  status_completed: {
    subject: "Your ESA Order is Complete — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#059669;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Order Completed</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Your ESA order is complete! Your letter is available in your portal. Thank you for choosing PawTenant.</p>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  refund: {
    subject: "Refund Processed — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#dc2626;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Refund Processed</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Your refund has been processed and should appear in your account within 3–5 business days.</p>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  provider_assigned_customer: {
    subject: "A Provider Has Been Assigned to Your Case — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a5c4f;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Provider Assigned</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">A licensed mental health professional has been assigned to your case and will begin reviewing your assessment shortly.</p>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  provider_assigned_provider: {
    subject: "New Case Assigned — PawTenant Provider Portal",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a5c4f;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">New Case Assigned</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">A new ESA case has been assigned to you. Please log in to your provider portal to review the patient's assessment and prepare their letter.</p>
          <p style="color:#444;font-size:14px;"><a href="https://pawtenant.com/provider-portal" style="color:#1a5c4f;font-weight:600;">Log in to Provider Portal →</a></p>
          <p style="color:#888;font-size:12px;">Order ID: ${orderId}</p>
        </div>
      </div>`,
  },
  internal_notification: {
    subject: "Internal Notification — PawTenant Admin",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px 32px;">
        <p style="color:#374151;font-size:14px;"><strong>Internal notification</strong> for order <span style="font-family:monospace;color:#1a5c4f;">${orderId}</span></p>
        <p style="color:#6b7280;font-size:13px;">This is an admin-only notification. Customer: ${name}</p>
      </div>`,
  },
  thirty_day_reminder: {
    subject: "30-Day Period Complete — Official Letter Required",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#d97706;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">30-Day Reissue Required</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">The 30-day evaluation period for order <strong>${orderId}</strong> is complete. Please log in to issue the official letter for this patient.</p>
        </div>
      </div>`,
  },
  cancelled: {
    subject: "Your Order Has Been Cancelled — PawTenant",
    bodyHtml: (name, orderId) => `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#dc2626;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">Order Cancelled</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:15px;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;font-size:14px;line-height:1.6;">Your order <strong>${orderId}</strong> has been cancelled. If you have any questions, please contact our support team.</p>
        </div>
      </div>`,
  },
};

const EMAIL_TYPE_CONFIG_LOCAL: Record<string, { label: string; icon: string; color: string; failColor: string }> = {
  order_confirmation: { label: "Order Confirmation", icon: "ri-mail-check-line", color: "text-[#1a5c4f] bg-[#e8f5f1] border-[#b8ddd5]", failColor: "text-red-600 bg-red-50 border-red-200" },
  payment_receipt: { label: "Payment Receipt", icon: "ri-file-text-line", color: "text-emerald-700 bg-emerald-50 border-emerald-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  letter_ready: { label: "Letter Ready", icon: "ri-file-check-line", color: "text-violet-700 bg-violet-50 border-violet-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  refund: { label: "Refund Confirmation", icon: "ri-refund-line", color: "text-orange-700 bg-orange-50 border-orange-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  status_under_review: { label: "Status: Under Review", icon: "ri-eye-line", color: "text-sky-700 bg-sky-50 border-sky-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  status_completed: { label: "Status: Completed", icon: "ri-checkbox-circle-line", color: "text-emerald-700 bg-emerald-50 border-emerald-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  internal_notification: { label: "Internal Notification", icon: "ri-notification-3-line", color: "text-gray-600 bg-gray-50 border-gray-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  provider_assigned_provider: { label: "Provider Assignment Notice", icon: "ri-user-received-line", color: "text-[#1a5c4f] bg-[#f0faf7] border-[#b8ddd5]", failColor: "text-red-600 bg-red-50 border-red-200" },
  provider_assigned_customer: { label: "Provider Assigned (Patient)", icon: "ri-user-star-line", color: "text-sky-700 bg-sky-50 border-sky-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  thirty_day_reminder: { label: "30-Day Reissue Reminder", icon: "ri-time-fill", color: "text-orange-700 bg-orange-50 border-orange-200", failColor: "text-red-600 bg-red-50 border-red-200" },
  cancelled: { label: "Cancellation Notice", icon: "ri-close-circle-line", color: "text-red-700 bg-red-50 border-red-200", failColor: "text-red-600 bg-red-50 border-red-200" },
};

export default function CommunicationTab({
  orderId,
  confirmationId,
  phone,
  email,
  patientName,
  adminName,
  emailLog,
  hasDocuments = false,
  price,
  letterType,
  doctorEmail: _doctorEmail,
  doctorName: _doctorName,
  onResendProviderEmail: _onResendProviderEmail,
  resendingProvider: _resendingProvider,
  resendProviderMsg: _resendProviderMsg,
  onLoadEmailLog: _onLoadEmailLog,
  emailLogLoading: _emailLogLoading,
}: CommunicationTabProps) {
  const [smsText, setSmsText]           = useState("");
  const [sending, setSending]           = useState(false);
  const [sendMsg, setSendMsg]           = useState("");
  const [calling, setCalling]           = useState(false);
  const [callMsg, setCallMsg]           = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [expandedEmailIdx, setExpandedEmailIdx] = useState<number | null>(null);

  // Email state
  const [emailType, setEmailType]       = useState("under-review");
  const [doctorNote, setDoctorNote]     = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg]         = useState("");

  const firstName = patientName.split(" ")[0] || "there";
  const isPsd = letterType === "psd" || confirmationId.includes("-PSD");
  const resumeUrl = `https://www.pawtenant.com/${isPsd ? "psd-assessment" : "assessment"}?resume=${encodeURIComponent(confirmationId)}`;

  const selectedEmailOption = ALL_EMAIL_OPTIONS.find((o) => o.value === emailType);
  const isRecoveryType = ["checkout_recovery", "followup_lead", "consultation_booking"].includes(emailType);

  // ── Send SMS ───────────────────────────────────────────────────────────
  const handleSendSMS = async () => {
    if (!phone) { setSendMsg("No phone number on this order"); return; }
    if (!smsText.trim()) return;
    setSending(true);
    setSendMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ghl-send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, confirmationId, toPhone: phone, message: smsText.trim(), sentBy: adminName }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { setSmsText(""); setSendMsg("Sent!"); }
      else { setSendMsg(result.error ?? "Failed to send"); }
    } catch { setSendMsg("Network error"); }
    setSending(false);
    setTimeout(() => setSendMsg(""), 4000);
  };

  // ── Outbound call ──────────────────────────────────────────────────────
  const handleCall = useCallback(async () => {
    if (!phone) { setCallMsg("No phone number on this order"); return; }
    setCalling(true);
    setCallMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/make-outbound-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, confirmationId, toPhone: phone, sentBy: adminName }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { setCallMsg("Call initiated — connecting now..."); }
      else { setCallMsg(result.error ?? "Call failed"); }
    } catch { setCallMsg("Network error"); }
    setCalling(false);
    setTimeout(() => setCallMsg(""), 6000);
  }, [orderId, confirmationId, phone, adminName]);

  // ── Send Email ─────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    setSendingEmail(true);
    setEmailMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      let endpoint = "";
      let payload: Record<string, unknown> = { confirmationId };
      if (emailType === "order_confirmation") {
        endpoint = "resend-confirmation-email";
      } else if (emailType === "letter_ready") {
        endpoint = "notify-patient-letter";
        if (doctorNote.trim()) payload.doctorMessage = doctorNote.trim();
      } else if (emailType === "checkout_recovery") {
        endpoint = "send-checkout-recovery";
        payload = { confirmationId };
      } else if (emailType === "followup_lead") {
        endpoint = "send-followup-email";
        payload = { confirmationId };
      } else if (emailType === "consultation_booking") {
        endpoint = "send-checkout-recovery";
        payload = {
          confirmationId,
          customMessage: `Your consultation with a licensed ${isPsd ? "PSD" : "ESA"} provider has been confirmed! Please complete your payment to lock in your appointment.`,
        };
      } else {
        endpoint = "notify-order-status";
        payload.newStatus = emailType;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { ok?: boolean; emailSent?: boolean; error?: string; skipped?: boolean; reason?: string; to?: string; message?: string };
      if (result.ok && result.skipped) {
        setEmailMsg(`Skipped: ${result.reason ?? "already sent"}`);
      } else if (result.ok) {
        const successMsg =
          emailType === "order_confirmation" ? `Confirmation email resent to ${result.to ?? "customer"}!` :
          emailType === "checkout_recovery"  ? `Abandoned checkout recovery email sent to ${email}!` :
          emailType === "followup_lead"      ? `Follow-up email sent to ${email}!` :
          emailType === "consultation_booking" ? `Consultation booking email sent to ${email}!` :
          "Email sent!";
        setEmailMsg(successMsg);
        setDoctorNote("");
      } else {
        setEmailMsg(result.error ?? result.message ?? "Failed to send");
      }
    } catch { setEmailMsg("Network error"); }
    setSendingEmail(false);
    setTimeout(() => setEmailMsg(""), 5000);
  };

  return (
    <div className="p-6 space-y-5 h-full flex flex-col">

      {/* ── Quick action bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* SMS compose */}
        <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-[#1a5c4f] rounded-full flex-shrink-0">
              <i className="ri-message-3-line text-white text-sm"></i>
            </div>
            <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-widest">Send SMS</p>
            {phone && <span className="text-xs text-[#1a5c4f]/60 font-mono">{phone}</span>}
          </div>
          {!phone && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <i className="ri-alert-line text-amber-500 text-sm flex-shrink-0"></i>
              <p className="text-xs text-amber-700 font-semibold">No phone number — add one to enable SMS</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className="whitespace-nowrap w-full flex items-center justify-between px-3 py-2 bg-white border border-[#b8ddd5] rounded-lg text-xs font-semibold text-[#1a5c4f] hover:bg-[#eaf6f2] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <i className="ri-layout-grid-line text-sm"></i>
              Quick Templates
            </span>
            <i className={showTemplates ? "ri-arrow-up-s-line text-sm" : "ri-arrow-down-s-line text-sm"}></i>
          </button>
          {showTemplates && (
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {SMS_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  disabled={!phone}
                  onClick={() => { setSmsText(tpl.getMessage(firstName, confirmationId)); setShowTemplates(false); }}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${tpl.bg} ${tpl.color}`}
                >
                  <i className={`${tpl.icon} text-sm flex-shrink-0`}></i>
                  <span className="truncate">{tpl.label}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            value={smsText}
            onChange={(e) => setSmsText(e.target.value.slice(0, 320))}
            rows={3}
            placeholder={`Message to ${firstName}...`}
            disabled={!phone}
            className="w-full px-3 py-2.5 border border-[#b8ddd5] rounded-lg text-sm bg-white focus:outline-none focus:border-[#1a5c4f] resize-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleSendSMS}
              disabled={sending || !phone || !smsText.trim()}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {sending ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-send-plane-line"></i>Send SMS</>}
            </button>
            <span className="text-xs text-gray-400">{smsText.length}/320</span>
          </div>
          {sendMsg && (
            <p className={`text-xs font-semibold flex items-center gap-1 ${sendMsg === "Sent!" ? "text-[#1a5c4f]" : "text-red-500"}`}>
              <i className={sendMsg === "Sent!" ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
              {sendMsg}
            </p>
          )}
        </div>

        {/* Email compose */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-amber-500 rounded-full flex-shrink-0">
              <i className="ri-mail-send-line text-white text-sm"></i>
            </div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Send Email</p>
            <span className="text-xs text-amber-600/60 font-mono truncate max-w-[90px]">{email}</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {EMAIL_OPTION_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mb-1 px-0.5">
                  <i className={`${group.icon} text-xs`}></i>{group.group}
                </p>
                {group.options.map((opt) => {
                  const isDisabled = opt.value === "letter_ready" && !hasDocuments;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors mb-1 ${emailType === opt.value ? "bg-white border-amber-400" : "bg-amber-50/50 border-transparent hover:border-amber-200"} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="radio"
                        name="emailType"
                        value={opt.value}
                        checked={emailType === opt.value}
                        onChange={() => setEmailType(opt.value)}
                        disabled={isDisabled}
                        className="mt-0.5 accent-amber-500 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-gray-700 leading-none">{opt.label}</p>
                          {opt.badge && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${opt.badgeColor}`}>
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-snug mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {emailType === "letter_ready" && (
            <textarea
              value={doctorNote}
              onChange={(e) => setDoctorNote(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="Optional personal note from provider..."
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:border-amber-400 resize-none"
            />
          )}
          {isRecoveryType && (
            <div className="flex items-start gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <i className="ri-cursor-line text-orange-500 text-sm flex-shrink-0 mt-0.5"></i>
              <p className="text-xs text-orange-700 leading-relaxed">
                Email includes a <strong>CTA button</strong> that takes the customer directly to their checkout page at{" "}
                <span className="font-mono text-[10px] break-all">{resumeUrl}</span>
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={sendingEmail || (emailType === "letter_ready" && !hasDocuments)}
            className="whitespace-nowrap w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {sendingEmail
              ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
              : <><i className="ri-mail-send-line"></i>Send Email</>
            }
          </button>
          {emailMsg && (
            <p className={`text-xs font-semibold flex items-center gap-1 ${emailMsg.includes("sent") || emailMsg.includes("Sent") ? "text-amber-700" : emailMsg.includes("Skipped") ? "text-gray-500" : "text-red-500"}`}>
              <i className={emailMsg.includes("sent") || emailMsg.includes("Sent") ? "ri-checkbox-circle-fill" : emailMsg.includes("Skipped") ? "ri-information-line" : "ri-error-warning-line"}></i>
              {emailMsg}
            </p>
          )}
          {emailType === "letter_ready" && !hasDocuments && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <i className="ri-information-line"></i>
              Documents email requires a signed letter to be uploaded first
            </p>
          )}
          {selectedEmailOption && (
            <p className="text-xs text-gray-400 italic">Will send to: {email}</p>
          )}
        </div>

        {/* Call panel */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-sky-100 rounded-full flex-shrink-0">
              <i className="ri-phone-line text-sky-600 text-sm"></i>
            </div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Call</p>
          </div>
          <div className="text-xs text-gray-400 leading-relaxed">
            {phone
              ? <><span className="font-mono font-semibold text-gray-700">{phone}</span><br />{patientName}</>
              : <span className="text-amber-500 font-semibold">No phone on file</span>
            }
          </div>
          <button
            type="button"
            onClick={handleCall}
            disabled={calling || !phone}
            className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-sky-600 text-white text-sm font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {calling ? <><i className="ri-loader-4-line animate-spin"></i>Calling...</> : <><i className="ri-phone-line"></i>Call Now</>}
          </button>
          {callMsg && (
            <p className={`text-xs font-semibold flex items-center gap-1 ${callMsg.includes("connecting") ? "text-sky-600" : "text-red-500"}`}>
              <i className={callMsg.includes("connecting") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
              {callMsg}
            </p>
          )}
          <div className="pt-2 border-t border-gray-100 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order Info</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Type</span>
              <span className={`text-xs font-bold ${isPsd ? "text-amber-700" : "text-[#1a5c4f]"}`}>{isPsd ? "PSD Letter" : "ESA Letter"}</span>
            </div>
            {price != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Amount</span>
                <span className="text-xs font-bold text-gray-700">${price}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Email Delivery Log ── */}
      <div className="flex-1 overflow-y-auto">
        {(emailLog ?? []).length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <i className="ri-mail-line text-sm"></i>
                Email Delivery Log ({(emailLog ?? []).length} emails)
              </p>
              <p className="text-[10px] text-gray-400">Click any email to preview its content</p>
            </div>
            {(emailLog ?? []).map((entry, idx) => {
              const cfg = EMAIL_TYPE_CONFIG_LOCAL[entry.type] ?? {
                label: entry.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                icon: "ri-mail-line",
                color: "text-gray-600 bg-gray-50 border-gray-200",
                failColor: "text-red-600 bg-red-50 border-red-200",
              };
              const colorClass = entry.success ? cfg.color : cfg.failColor;
              const isExpanded = expandedEmailIdx === idx;
              const contentTemplate = EMAIL_CONTENT_MAP[entry.type];
              const fName = patientName.split(" ")[0] || "there";

              return (
                <div key={idx} className="rounded-xl border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedEmailIdx(isExpanded ? null : idx)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer hover:opacity-90 ${colorClass}`}
                  >
                    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <i className={`${entry.success ? cfg.icon : "ri-mail-close-line"} text-base`}></i>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold leading-tight">{cfg.label}</p>
                      <p className="text-xs opacity-70 leading-tight truncate">
                        To: {entry.to} &middot; {new Date(entry.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-white/60">
                        {entry.success
                          ? <><i className="ri-checkbox-circle-fill"></i>Sent</>
                          : <><i className="ri-close-circle-fill"></i>Failed</>}
                      </span>
                      <i className={isExpanded ? "ri-arrow-up-s-line text-sm opacity-60" : "ri-arrow-down-s-line text-sm opacity-60"}></i>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-current/10 bg-white">
                      {contentTemplate ? (
                        <div>
                          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                            <i className="ri-mail-line text-gray-400 text-sm flex-shrink-0"></i>
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Subject: </span>
                              <span className="text-xs font-semibold text-gray-700">{contentTemplate.subject}</span>
                            </div>
                            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-gray-400">To: {entry.to}</span>
                            </div>
                          </div>
                          <div className="p-3">
                            <div
                              className="rounded-lg overflow-hidden border border-gray-100"
                              style={{ maxHeight: 320, overflowY: "auto" }}
                              dangerouslySetInnerHTML={{
                                __html: contentTemplate.bodyHtml(fName, confirmationId, email),
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-4 flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                            <i className="ri-mail-line text-gray-400 text-sm"></i>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-700">{cfg.label}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Sent to <span className="font-mono">{entry.to}</span> on {new Date(entry.sentAt).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 italic">Full email content preview not available for this type.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full mb-2">
              <i className="ri-mail-line text-gray-300 text-lg"></i>
            </div>
            <p className="text-sm font-bold text-gray-500">No emails logged yet</p>
            <p className="text-xs text-gray-400 mt-1">Email activity will appear here once emails are sent for this order</p>
          </div>
        )}
      </div>

    </div>
  );
}
