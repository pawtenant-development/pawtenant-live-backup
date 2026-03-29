// CommunicationTab — SMS compose, email compose, call initiation, full comms log per order
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface CommunicationEntry {
  id: string;
  order_id: string | null;
  confirmation_id: string | null;
  type: string;
  direction: string;
  body: string | null;
  phone_from: string | null;
  phone_to: string | null;
  duration_seconds: number | null;
  status: string | null;
  twilio_sid: string | null;
  sent_by: string | null;
  recording_url: string | null;
  created_at: string;
}

interface CommunicationTabProps {
  orderId: string;
  confirmationId: string;
  phone: string | null;
  email: string;
  patientName: string;
  adminName: string;
  emailLog?: { type: string; sentAt: string; to: string; success: boolean }[] | null;
  hasDocuments?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bgColor: string; alignRight?: boolean }> = {
  sms_outbound:  { icon: "ri-message-3-line",      label: "SMS Sent",      color: "text-[#1a5c4f]",  bgColor: "bg-[#f0faf7] border-[#b8ddd5]",  alignRight: true },
  sms_inbound:   { icon: "ri-message-3-fill",       label: "SMS Received",  color: "text-gray-700",   bgColor: "bg-white border-gray-200" },
  call_outbound: { icon: "ri-phone-line",            label: "Call Outbound", color: "text-sky-700",    bgColor: "bg-sky-50 border-sky-200",       alignRight: true },
  call_inbound:  { icon: "ri-phone-incoming-line",   label: "Call Inbound",  color: "text-violet-700", bgColor: "bg-violet-50 border-violet-200" },
  email:         { icon: "ri-mail-line",             label: "Email",         color: "text-gray-500",   bgColor: "bg-gray-50 border-gray-200" },
};

const EMAIL_TYPE_LABEL: Record<string, string> = {
  order_confirmation:   "Order Confirmation Email",
  payment_receipt:      "Payment Receipt Email",
  letter_ready:         "Letter Ready Email",
  refund:               "Refund Email",
  status_under_review:  "Status Update: Under Review",
  status_completed:     "Status Update: Completed",
};

const EMAIL_OPTIONS = [
  { value: "order_confirmation", label: "📧 Resend Order Confirmation", desc: "Resends the initial order confirmation + payment receipt email" },
  { value: "under-review",  label: "📋 Under Review Update",    desc: "Lets the customer know their case is being reviewed" },
  { value: "completed",     label: "✅ Completed Update",       desc: "Notifies the customer their order is done" },
  { value: "letter_ready",  label: "📄 Resend Documents Email", desc: "Re-sends the letter/documents email to the customer" },
];

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

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function CommunicationTab({
  orderId,
  confirmationId,
  phone,
  email,
  patientName,
  adminName,
  emailLog,
  hasDocuments = false,
}: CommunicationTabProps) {
  const [comms, setComms]               = useState<CommunicationEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [smsText, setSmsText]           = useState("");
  const [sending, setSending]           = useState(false);
  const [sendMsg, setSendMsg]           = useState("");
  const [calling, setCalling]           = useState(false);
  const [callMsg, setCallMsg]           = useState("");
  const [activeTab, setActiveTab]       = useState<"all" | "sms" | "calls">("all");
  const [showTemplates, setShowTemplates] = useState(false);

  // Email state
  const [emailType, setEmailType]       = useState("under-review");
  const [doctorNote, setDoctorNote]     = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg]         = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  const firstName = patientName.split(" ")[0] || "there";

  // ── Load communications ────────────────────────────────────────────────
  const loadComms = useCallback(async () => {
    const { data } = await supabase
      .from("communications")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setComms((data as CommunicationEntry[]) ?? []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { loadComms(); }, [loadComms]);

  // ── Real-time subscription ─────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`comms-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "communications", filter: `order_id=eq.${orderId}` },
        (payload) => {
          setComms((prev) => {
            const entry = payload.new as CommunicationEntry;
            if (prev.some((c) => c.id === entry.id)) return prev;
            return [...prev, entry];
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comms]);

  // ── Merge email_log into timeline ──────────────────────────────────────
  const emailEntries: CommunicationEntry[] = (emailLog ?? []).map((e, idx) => ({
    id: `email-${idx}`,
    order_id: orderId,
    confirmation_id: confirmationId,
    type: "email",
    direction: "outbound",
    body: EMAIL_TYPE_LABEL[e.type] ?? e.type,
    phone_from: null,
    phone_to: e.to,
    duration_seconds: null,
    status: e.success ? "sent" : "failed",
    twilio_sid: null,
    sent_by: "System",
    created_at: e.sentAt,
  }));

  const allEntries = [...comms, ...emailEntries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const filtered = allEntries.filter((e) => {
    if (activeTab === "sms")   return e.type === "sms_outbound" || e.type === "sms_inbound";
    if (activeTab === "calls") return e.type === "call_outbound" || e.type === "call_inbound";
    return true;
  });

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
  const handleCall = async () => {
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
      if (result.ok) { setCallMsg("Call initiated — connecting now..."); loadComms(); }
      else { setCallMsg(result.error ?? "Call failed"); }
    } catch { setCallMsg("Network error"); }
    setCalling(false);
    setTimeout(() => setCallMsg(""), 6000);
  };

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
      } else {
        endpoint = "notify-order-status";
        payload.newStatus = emailType;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { ok?: boolean; emailSent?: boolean; error?: string; skipped?: boolean; reason?: string; to?: string };

      if (result.ok && result.skipped) {
        setEmailMsg(`Skipped: ${result.reason ?? "already sent"}`);
      } else if (result.ok && (result.emailSent || emailType === "order_confirmation")) {
        setEmailMsg(emailType === "order_confirmation"
          ? `Confirmation email resent to ${result.to ?? "customer"}!`
          : "Email sent!");
        setDoctorNote("");
      } else if (result.ok && result.emailSent === false) {
        setEmailMsg("Sent (SMTP not configured — check secrets)");
      } else {
        setEmailMsg(result.error ?? "Failed to send");
      }
    } catch { setEmailMsg("Network error"); }
    setSendingEmail(false);
    setTimeout(() => setEmailMsg(""), 5000);
  };

  const smsCount  = allEntries.filter((e) => e.type === "sms_outbound" || e.type === "sms_inbound").length;
  const callCount = allEntries.filter((e) => e.type === "call_outbound" || e.type === "call_inbound").length;

  const selectedEmailOption = EMAIL_OPTIONS.find((o) => o.value === emailType);

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

          {/* Template toggle */}
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className="whitespace-nowrap w-full flex items-center justify-between px-3 py-2 bg-white border border-[#b8ddd5] rounded-lg text-xs font-semibold text-[#1a5c4f] hover:bg-[#eaf6f2] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <i className="ri-layout-grid-line text-sm"></i>
              Quick Templates
            </span>
            <i className={`ri-arrow-${showTemplates ? "up" : "down"}-s-line text-sm transition-transform`}></i>
          </button>

          {/* Template chips */}
          {showTemplates && (
            <div className="grid grid-cols-2 gap-1.5">
              {SMS_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  disabled={!phone}
                  onClick={() => {
                    setSmsText(tpl.getMessage(firstName, confirmationId));
                    setShowTemplates(false);
                  }}
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

          {/* Email type selector */}
          <div className="space-y-1.5">
            {EMAIL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${emailType === opt.value ? "bg-white border-amber-400" : "bg-amber-50/50 border-transparent hover:border-amber-200"} ${opt.value === "letter_ready" && !hasDocuments ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="emailType"
                  value={opt.value}
                  checked={emailType === opt.value}
                  onChange={() => setEmailType(opt.value)}
                  disabled={opt.value === "letter_ready" && !hasDocuments}
                  className="mt-0.5 accent-amber-500 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold text-gray-700 leading-none mb-0.5">{opt.label}</p>
                  <p className="text-xs text-gray-400 leading-snug">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Optional note for letter resend */}
          {emailType === "letter_ready" && (
            <textarea
              value={doctorNote}
              onChange={(e) => setDoctorNote(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="Optional personal note from provider..."
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:border-amber-400 resize-none"
            />
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
        </div>
      </div>

      {/* ── Timeline filters ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { key: "all",   label: `All (${allEntries.length})` },
            { key: "sms",   label: `SMS (${smsCount})` },
            { key: "calls", label: `Calls (${callCount})` },
          ].map((tab) => (
            <button key={tab.key} type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === tab.key ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={loadComms} className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 cursor-pointer">
          <i className="ri-refresh-line"></i>Refresh
        </button>
      </div>

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
              <i className="ri-chat-history-line text-gray-400 text-xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-600">No communication history yet</p>
            <p className="text-xs text-gray-400 mt-1">Send an SMS, email, or make a call above to get started</p>
          </div>
        ) : (
          filtered.map((entry) => {
            const cfg   = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.email;
            const right = cfg.alignRight;

            const isCallEntry = entry.type === "call_outbound" || entry.type === "call_inbound";

            return (
              <div key={entry.id} className={`flex ${right ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl border px-4 py-3 space-y-2 ${cfg.bgColor}`}>
                  <div className={`flex items-center gap-1.5 ${right ? "flex-row-reverse" : ""}`}>
                    <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                    <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                    {entry.status === "failed" && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                        <i className="ri-close-circle-line" style={{ fontSize: "9px" }}></i>Failed
                      </span>
                    )}
                    {entry.status === "delivered" && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                        <i className="ri-check-double-line" style={{ fontSize: "10px" }}></i>
                      </span>
                    )}
                    {isCallEntry && entry.recording_url && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        <i className="ri-record-circle-line" style={{ fontSize: "9px" }}></i>Recorded
                      </span>
                    )}
                    {isCallEntry && !entry.recording_url && entry.status !== "in_progress" && entry.status !== "initiated" && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full text-xs">
                        <i className="ri-mic-off-line" style={{ fontSize: "9px" }}></i>No recording
                      </span>
                    )}
                  </div>
                  {entry.body && <p className="text-sm text-gray-800 leading-relaxed">{entry.body}</p>}
                  {/* ── Recording audio player ── */}
                  {isCallEntry && entry.recording_url && (
                    <div className="mt-1">
                      <audio
                        controls
                        preload="none"
                        className="w-full h-9 rounded-lg"
                        style={{ minWidth: "240px" }}
                      >
                        <source src={entry.recording_url} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                      <a
                        href={entry.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs text-sky-600 hover:underline cursor-pointer"
                      >
                        <i className="ri-download-line"></i>Download recording
                      </a>
                    </div>
                  )}
                  <div className={`flex items-center gap-2 text-xs text-gray-400 ${right ? "flex-row-reverse" : ""}`}>
                    <span>{fmtTime(entry.created_at)}</span>
                    {entry.sent_by && <span>· {entry.sent_by}</span>}
                    {entry.duration_seconds != null && entry.duration_seconds > 0 && (
                      <span className="flex items-center gap-0.5">
                        <i className="ri-time-line" style={{ fontSize: "10px" }}></i>
                        {fmtDuration(entry.duration_seconds)}
                      </span>
                    )}
                    {entry.phone_to && entry.type !== "email" && (
                      <span className="font-mono text-gray-300">{entry.phone_to}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
