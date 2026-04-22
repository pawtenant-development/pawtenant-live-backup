// CommunicationTab — WhatsApp-style chat history + collapsible compose panels
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { getAdminToken } from "../../../lib/supabaseClient";

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

// ── SMS Templates ─────────────────────────────────────────────────────────
// Loaded from email_templates table (channel='sms'). DB is the single source of truth.
type SmsTemplateEntry = { label: string; icon: string; color: string; bg: string; getMessage: (fn: string, id: string) => string };

function groupStyleForSms(group: string): { icon: string; color: string; bg: string } {
  if (group === "Lead Recovery") return { icon: "ri-mail-send-line", color: "text-orange-600", bg: "bg-orange-50 border-orange-200 hover:border-orange-400" };
  if (group === "General") return { icon: "ri-chat-check-line", color: "text-gray-600", bg: "bg-gray-50 border-gray-200 hover:border-gray-400" };
  return { icon: "ri-message-3-line", color: "text-[#3b6ea5]", bg: "bg-[#e8f0f9] border-[#b8cce4] hover:border-[#3b6ea5]" };
}

// ── Email templates ────────────────────────────────────────────────────────
// Loaded entirely from email_templates (channel='email'). DB is the single source of truth.
// Each row's `slug` is the value, `group` becomes the section heading.
interface EmailTemplate { slug: string; label: string; group: string; subject: string; }

function groupIconFor(group: string): string {
  const g = group.toLowerCase();
  if (g.includes("recovery") || g.includes("lead")) return "ri-user-follow-line";
  if (g.includes("sequence")) return "ri-time-line";
  if (g.includes("transactional") || g.includes("status")) return "ri-file-list-3-line";
  return "ri-database-2-line";
}

// ── Unified log entry ──────────────────────────────────────────────────────
interface UnifiedLogEntry {
  type: string;
  sentAt: string;
  to: string;
  success: boolean;
  source: "email_log" | "communications";
  body?: string | null;
  subject?: string | null;
  slug?: string | null;
  direction?: string | null;
  duration?: number | null;
}

// Strip HTML tags + collapse whitespace for a readable preview snippet.
function toPreview(raw: string | null | undefined, max = 140): string {
  if (!raw) return "";
  const text = String(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ── Chat bubble config ─────────────────────────────────────────────────────
function getChatConfig(entry: UnifiedLogEntry): {
  isOutbound: boolean;
  channel: "email" | "sms" | "call";
  label: string;
  icon: string;
  bubbleClass: string;
  headerClass: string;
} {
  const t = entry.type;
  const dir = entry.direction;

  // Calls
  if (t === "call" || t === "call_inbound") {
    const isOut = t === "call" || dir === "outbound";
    return {
      isOutbound: isOut,
      channel: "call",
      label: isOut ? "Outbound Call" : "Inbound Call",
      icon: isOut ? "ri-phone-line" : "ri-phone-fill",
      bubbleClass: isOut ? "bg-sky-50 border border-sky-200 text-sky-800" : "bg-violet-50 border border-violet-200 text-violet-800",
      headerClass: isOut ? "text-sky-700" : "text-violet-700",
    };
  }

  // SMS
  if (t === "sms" || t === "sms_inbound" || (entry.source === "communications" && (dir === "inbound" || dir === "outbound") && t !== "email")) {
    const isOut = t === "sms" || dir === "outbound";
    return {
      isOutbound: isOut,
      channel: "sms",
      label: isOut ? "SMS" : "SMS Reply",
      icon: isOut ? "ri-message-3-line" : "ri-message-2-line",
      bubbleClass: isOut ? "bg-[#3b6ea5] text-white" : "bg-white border border-gray-200 text-gray-800",
      headerClass: isOut ? "text-white/80" : "text-gray-500",
    };
  }

  // Emails — all outbound from PawTenant
  const EMAIL_LABELS: Record<string, string> = {
    order_confirmation: "Order Confirmation",
    payment_receipt: "Payment Receipt",
    letter_ready: "Documents Ready",
    status_under_review: "Status: Under Review",
    "under-review": "Status: Under Review",
    status_completed: "Status: Completed",
    completed: "Status: Completed",
    refund: "Refund Confirmation",
    cancelled: "Cancellation Notice",
    checkout_recovery: "Abandoned Checkout Recovery",
    followup_lead: "Lead Follow-up",
    consultation_booking: "Consultation Booking",
    seq_30min: "Auto-Sequence: 30-Min",
    seq_24h: "Auto-Sequence: 24-Hour",
    seq_3day: "Auto-Sequence: 3-Day",
    provider_assigned_customer: "Provider Assigned",
    provider_assigned_provider: "Provider Assignment Notice",
    thirty_day_reminder: "30-Day Reissue Reminder",
    internal_notification: "Internal Notification",
  };

  return {
    isOutbound: true,
    channel: "email",
    label: EMAIL_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: "ri-mail-send-line",
    bubbleClass: "bg-amber-50 border border-amber-200 text-gray-800",
    headerClass: "text-amber-700",
  };
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isToday) return timeStr;
  if (isYesterday) return `Yesterday ${timeStr}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${timeStr}`;
}

function fmtDateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ── Compose Panel ──────────────────────────────────────────────────────────
type PanelType = "sms" | "email" | "call" | null;

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
}: CommunicationTabProps) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [smsText, setSmsText] = useState("");
  const [dbSmsTemplates, setDbSmsTemplates] = useState<SmsTemplateEntry[] | null>(null);
  const [dbEmailTemplates, setDbEmailTemplates] = useState<EmailTemplate[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [emailType, setEmailType] = useState<string>("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [commLogs, setCommLogs] = useState<UnifiedLogEntry[]>([]);
  const [loadingComms, setLoadingComms] = useState(false);
  const [commError, setCommError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load SMS templates from DB on mount; fallback to hardcoded if empty
  useEffect(() => {
    supabase
      .from("email_templates")
      .select("id, label, group, body")
      .eq("channel", "sms")
      .order("created_at")
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          const mapped: SmsTemplateEntry[] = data.map((r) => {
            const style = groupStyleForSms(r.group as string);
            const body = r.body as string;
            return {
              label: r.label as string,
              ...style,
              getMessage: (fn: string, id: string) =>
                body.replace(/\{name\}/g, fn).replace(/\{order_id\}/g, id),
            };
          });
          setDbSmsTemplates(mapped);
        }
      });
  }, []);

  const SMS_TEMPLATES = dbSmsTemplates ?? [];

  // Load ALL email templates from DB (single source of truth — no hardcoded options)
  useEffect(() => {
    supabase
      .from("email_templates")
      .select("slug, label, group, subject, archived, channel")
      .eq("channel", "email")
      .order("group")
      .order("created_at")
      .then(({ data, error }) => {
        if (error || !data) { setDbEmailTemplates([]); return; }
        const templates: EmailTemplate[] = data
          .filter((r) => r.slug && !r.archived)
          .map((r) => ({
            slug: r.slug as string,
            label: (r.label as string) || (r.slug as string),
            group: (r.group as string) || "Custom",
            subject: (r.subject as string) || "",
          }));
        setDbEmailTemplates(templates);
        if (templates.length > 0) {
          setEmailType((cur) => cur || templates[0].slug);
        }
      });
  }, []);

  const firstName = patientName.split(" ")[0] || "there";
  const isPsd = letterType === "psd" || confirmationId.includes("-PSD");
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://www.pawtenant.com";
  const resumeUrl = `${siteOrigin}/${isPsd ? "psd-assessment" : "assessment"}?resume=${encodeURIComponent(confirmationId)}`;

  // Group email templates dynamically by their `group` column
  const emailGroups: { group: string; icon: string; options: EmailTemplate[] }[] = (() => {
    const tpls = dbEmailTemplates ?? [];
    const map = new Map<string, EmailTemplate[]>();
    tpls.forEach((t) => {
      const arr = map.get(t.group) ?? [];
      arr.push(t);
      map.set(t.group, arr);
    });
    return Array.from(map.entries()).map(([group, options]) => ({
      group, icon: groupIconFor(group), options,
    }));
  })();

  const selectedTemplate = (dbEmailTemplates ?? []).find((t) => t.slug === emailType) ?? null;
  const isRecoveryType = selectedTemplate?.group?.toLowerCase().includes("recovery") ?? false;

  // ── Fetch communications (PRIMARY source of truth — email + sms + calls) ─
  // Match rows by order_id OR confirmation_id — some legacy rows only carry
  // confirmation_id (older auto-sequence runs wrote confirmation_id but not
  // order_id). Errors are surfaced to the UI, not swallowed.
  const loadCommLogs = useCallback(async () => {
    if (!orderId && !confirmationId) return;
    setLoadingComms(true);
    setCommError(null);
    try {
      const filters: string[] = [];
      if (orderId)        filters.push(`order_id.eq.${orderId}`);
      if (confirmationId) filters.push(`confirmation_id.eq.${confirmationId}`);
      const { data, error } = await supabase
        .from("communications")
        .select("type, direction, body, phone_to, phone_from, email_to, email_from, subject, slug, template_source, status, created_at, duration_seconds")
        .or(filters.join(","))
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[CommunicationTab] loadCommLogs error:", error);
        setCommError(error.message || "Failed to load communications");
        setCommLogs([]);
        setLoadingComms(false);
        return;
      }
      const entries: UnifiedLogEntry[] = (data ?? []).map((row) => {
        const isEmail = (row.type as string) === "email";
        // For emails, prefer slug as the type (so chat bubble label resolves correctly).
        const resolvedType = isEmail ? ((row.slug as string) || "email") : (row.type as string);
        // Recipient fallback: email_to → phone_to (legacy rows) → prop email.
        const emailAddr = (row.email_to as string) || (row.phone_to as string) || email;
        return {
          type: resolvedType,
          sentAt: row.created_at as string,
          to: isEmail ? emailAddr : ((row.phone_to as string) ?? email),
          success: (row.status as string) !== "failed",
          source: "communications" as const,
          body: row.body as string | null,
          subject: row.subject as string | null,
          slug: row.slug as string | null,
          direction: row.direction as string | null,
          duration: row.duration_seconds as number | null,
        };
      });
      setCommLogs(entries);
    } catch (err) {
      console.error("[CommunicationTab] loadCommLogs exception:", err);
      setCommError(err instanceof Error ? err.message : "Network error");
      setCommLogs([]);
    }
    setLoadingComms(false);
  }, [orderId, confirmationId, email]);

  useEffect(() => { loadCommLogs(); }, [loadCommLogs]);

  // ── Build unified timeline sorted oldest → newest (for chat layout) ────
  // communications is primary; email_log entries are kept ONLY if not already
  // represented in communications (same type + same minute).
  const commsKey = new Set(
    commLogs
      .filter((c) => c.source === "communications")
      .map((c) => `${c.type}|${new Date(c.sentAt).toISOString().slice(0, 16)}`)
  );
  const emailLogEntries: UnifiedLogEntry[] = (emailLog ?? [])
    .filter((e) => !commsKey.has(`${e.type}|${new Date(e.sentAt).toISOString().slice(0, 16)}`))
    .map((e) => ({
      type: e.type, sentAt: e.sentAt, to: e.to, success: e.success, source: "email_log" as const,
    }));
  const allLogs: UnifiedLogEntry[] = [...emailLogEntries, ...commLogs].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );

  // Scroll to bottom when logs load
  useEffect(() => {
    if (allLogs.length > 0) {
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [allLogs.length]);

  // ── Group by date ──────────────────────────────────────────────────────
  const grouped: { dateLabel: string; entries: UnifiedLogEntry[] }[] = [];
  allLogs.forEach((entry) => {
    const label = fmtDateLabel(entry.sentAt);
    const last = grouped[grouped.length - 1];
    if (last && last.dateLabel === label) { last.entries.push(entry); }
    else { grouped.push({ dateLabel: label, entries: [entry] }); }
  });

  // ── Send SMS ───────────────────────────────────────────────────────────
  const handleSendSMS = async () => {
    if (!phone || !smsText.trim()) return;
    setSending(true); setSendMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ghl-send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, confirmationId, toPhone: phone, message: smsText.trim(), sentBy: adminName }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { setSmsText(""); setSendMsg("Sent!"); loadCommLogs(); }
      else { setSendMsg(result.error ?? "Failed to send"); }
    } catch { setSendMsg("Network error"); }
    setSending(false);
    setTimeout(() => setSendMsg(""), 4000);
  };

  // ── Outbound call ──────────────────────────────────────────────────────
  const handleCall = useCallback(async () => {
    if (!phone) { setCallMsg("No phone number on this order"); return; }
    setCalling(true); setCallMsg("");
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/make-outbound-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, confirmationId, toPhone: phone, sentBy: adminName }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) { setCallMsg("Call initiated — connecting now..."); loadCommLogs(); }
      else { setCallMsg(result.error ?? "Call failed"); }
    } catch { setCallMsg("Network error"); }
    setCalling(false);
    setTimeout(() => setCallMsg(""), 6000);
  }, [orderId, confirmationId, phone, adminName, loadCommLogs]);

  // ── Send Email ─────────────────────────────────────────────────────────
  // Uniform path: every send routes through `send-templated-email` with the
  // chosen DB slug. The edge fn renders the template + master layout, sends via
  // Resend, and logs to `communications` (primary) + `orders.email_log` (backup).
  const handleSendEmail = async () => {
    if (!emailType) { setEmailMsg("Pick a template"); return; }
    setSendingEmail(true); setEmailMsg("");
    try {
      const token = await getAdminToken();
      const isPsdLocal = letterType === "psd" || confirmationId.includes("-PSD");
      const payload = {
        slug: emailType,
        to: email,
        confirmationId,
        vars: {
          name: firstName,
          first_name: firstName,
          order_id: confirmationId,
          confirmation_id: confirmationId,
          letter_type: isPsdLocal ? "PSD Letter" : "ESA Letter",
          resume_url: resumeUrl,
          resume_url_with_promo: resumeUrl,
          review_url: "https://www.trustpilot.com/review/pawtenant.com",
          price: price != null ? `$${Number(price).toFixed(2)}` : "",
        },
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-templated-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { ok?: boolean; error?: string; skipped?: boolean; reason?: string; message?: string };
      if (result.ok && result.skipped) { setEmailMsg(`Skipped: ${result.reason ?? "already sent"}`); }
      else if (result.ok) { setEmailMsg("Email sent!"); loadCommLogs(); }
      else { setEmailMsg(result.error ?? result.message ?? "Failed to send"); }
    } catch { setEmailMsg("Network error"); }
    setSendingEmail(false);
    setTimeout(() => setEmailMsg(""), 5000);
  };

  const togglePanel = (p: PanelType) => setActivePanel((v) => v === p ? null : p);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>

      {/* ── Compose action bar (3 collapsible cards) ── */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 space-y-2 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {/* SMS toggle */}
          <button
            type="button"
            onClick={() => togglePanel("sms")}
            className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${activePanel === "sms" ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "bg-[#e8f0f9] text-[#3b6ea5] border-[#b8cce4] hover:border-[#3b6ea5]"}`}
          >
            <i className="ri-message-3-line text-sm"></i>
            Send SMS
            <i className={`text-sm ${activePanel === "sms" ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
          </button>
          {/* Email toggle */}
          <button
            type="button"
            onClick={() => togglePanel("email")}
            className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${activePanel === "email" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400"}`}
          >
            <i className="ri-mail-send-line text-sm"></i>
            Send Email
            <i className={`text-sm ${activePanel === "email" ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
          </button>
          {/* Call toggle */}
          <button
            type="button"
            onClick={() => togglePanel("call")}
            className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${activePanel === "call" ? "bg-sky-600 text-white border-sky-600" : "bg-sky-50 text-sky-700 border-sky-200 hover:border-sky-400"}`}
          >
            <i className="ri-phone-line text-sm"></i>
            Call
            <i className={`text-sm ${activePanel === "call" ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
          </button>
        </div>

        {/* ── SMS Panel ── */}
        {activePanel === "sms" && (
          <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4 space-y-3">
            {!phone && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <i className="ri-alert-line text-amber-500 text-sm flex-shrink-0"></i>
                <p className="text-xs text-amber-700 font-semibold">No phone number — add one to enable SMS</p>
              </div>
            )}
            {phone && <p className="text-xs text-[#3b6ea5]/70 font-mono">{phone}</p>}
            <button type="button" onClick={() => setShowTemplates((v) => !v)}
              className="whitespace-nowrap w-full flex items-center justify-between px-3 py-2 bg-white border border-[#b8cce4] rounded-lg text-xs font-semibold text-[#3b6ea5] hover:bg-[#eaf6f2] transition-colors cursor-pointer">
              <span className="flex items-center gap-1.5"><i className="ri-layout-grid-line text-sm"></i>Quick Templates</span>
              <i className={showTemplates ? "ri-arrow-up-s-line text-sm" : "ri-arrow-down-s-line text-sm"}></i>
            </button>
            {showTemplates && (
              dbSmsTemplates === null ? (
                <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                  <i className="ri-loader-4-line animate-spin mr-1.5"></i>Loading templates...
                </div>
              ) : SMS_TEMPLATES.length === 0 ? (
                <div className="px-3 py-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-500 text-center">
                  No SMS templates yet — add them in <strong>Settings → Communications</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {SMS_TEMPLATES.map((tpl) => (
                    <button key={tpl.label} type="button" disabled={!phone}
                      onClick={() => { setSmsText(tpl.getMessage(firstName, confirmationId)); setShowTemplates(false); }}
                      className={`whitespace-nowrap flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${tpl.bg} ${tpl.color}`}>
                      <i className={`${tpl.icon} text-sm flex-shrink-0`}></i>
                      <span className="truncate">{tpl.label}</span>
                    </button>
                  ))}
                </div>
              )
            )}
            <textarea value={smsText} onChange={(e) => setSmsText(e.target.value.slice(0, 320))} rows={3}
              placeholder={`Message to ${firstName}...`} disabled={!phone}
              className="w-full px-3 py-2.5 border border-[#b8cce4] rounded-lg text-sm bg-white focus:outline-none focus:border-[#3b6ea5] resize-none disabled:opacity-50" />
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleSendSMS} disabled={sending || !phone || !smsText.trim()}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                {sending ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-send-plane-line"></i>Send SMS</>}
              </button>
              <span className="text-xs text-gray-400">{smsText.length}/320</span>
            </div>
            {sendMsg && (
              <p className={`text-xs font-semibold flex items-center gap-1 ${sendMsg === "Sent!" ? "text-[#3b6ea5]" : "text-red-500"}`}>
                <i className={sendMsg === "Sent!" ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{sendMsg}
              </p>
            )}
          </div>
        )}

        {/* ── Email Panel (DB-driven — single source of truth: email_templates) ── */}
        {activePanel === "email" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-xs text-amber-600/70 font-mono truncate">{email}</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {dbEmailTemplates === null ? (
                <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                  <i className="ri-loader-4-line animate-spin mr-1.5"></i>Loading templates...
                </div>
              ) : emailGroups.length === 0 ? (
                <div className="px-3 py-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-500 text-center">
                  No email templates yet — add them in <strong>Settings → Communications</strong>.
                </div>
              ) : (
                emailGroups.map((group) => (
                  <div key={group.group}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mb-1 px-0.5">
                      <i className={`${group.icon} text-xs`}></i>{group.group}
                    </p>
                    {group.options.map((opt) => {
                      const isDisabled = opt.slug === "letter_ready" && !hasDocuments;
                      return (
                        <label key={opt.slug}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors mb-1 ${emailType === opt.slug ? "bg-white border-amber-400" : "bg-amber-50/50 border-transparent hover:border-amber-200"} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                          <input type="radio" name="emailType" value={opt.slug} checked={emailType === opt.slug}
                            onChange={() => setEmailType(opt.slug)} disabled={isDisabled}
                            className="mt-0.5 accent-amber-500 cursor-pointer flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700 leading-none">{opt.label}</p>
                            {opt.subject && <p className="text-xs text-gray-400 leading-snug mt-0.5 truncate">{opt.subject}</p>}
                            <p className="text-[10px] text-gray-300 mt-0.5 font-mono">slug: {opt.slug}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            {isRecoveryType && (
              <div className="flex items-start gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <i className="ri-cursor-line text-orange-500 text-sm flex-shrink-0 mt-0.5"></i>
                <p className="text-xs text-orange-700 leading-relaxed">
                  Recovery emails resolve <code>{`{resume_url}`}</code> to: <span className="font-mono text-[10px] break-all">{resumeUrl}</span>
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSendEmail}
                disabled={sendingEmail || !emailType || (emailType === "letter_ready" && !hasDocuments)}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 cursor-pointer transition-colors">
                {sendingEmail ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-mail-send-line"></i>Send Email</>}
              </button>
              {selectedTemplate && <p className="text-xs text-gray-400 italic">→ {email}</p>}
            </div>
            {emailMsg && (
              <p className={`text-xs font-semibold flex items-center gap-1 ${emailMsg.includes("sent") || emailMsg.includes("Sent") ? "text-amber-700" : emailMsg.includes("Skipped") ? "text-gray-500" : "text-red-500"}`}>
                <i className={emailMsg.includes("sent") || emailMsg.includes("Sent") ? "ri-checkbox-circle-fill" : emailMsg.includes("Skipped") ? "ri-information-line" : "ri-error-warning-line"}></i>
                {emailMsg}
              </p>
            )}
          </div>
        )}

        {/* ── Call Panel ── */}
        {activePanel === "call" && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                {phone
                  ? <><p className="text-sm font-bold text-gray-800 font-mono">{phone}</p><p className="text-xs text-gray-500">{patientName}</p></>
                  : <p className="text-xs text-amber-600 font-semibold">No phone number on file</p>
                }
              </div>
              {price != null && (
                <div className="text-right">
                  <p className="text-[10px] text-gray-400">Amount</p>
                  <p className="text-sm font-bold text-gray-700">${price}</p>
                </div>
              )}
            </div>
            <button type="button" onClick={handleCall} disabled={calling || !phone}
              className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-sky-600 text-white text-sm font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50 cursor-pointer transition-colors">
              {calling ? <><i className="ri-loader-4-line animate-spin"></i>Calling...</> : <><i className="ri-phone-line"></i>Call {firstName} Now</>}
            </button>
            {callMsg && (
              <p className={`text-xs font-semibold flex items-center gap-1 ${callMsg.includes("connecting") ? "text-sky-600" : "text-red-500"}`}>
                <i className={callMsg.includes("connecting") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{callMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Chat History ── */}
      <div className="flex-1 overflow-y-auto bg-[#f5f5f0]" style={{ minHeight: 0 }}>
        {loadingComms && allLogs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
          </div>
        ) : commError && allLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 flex items-center justify-center bg-red-50 rounded-full border border-red-200 mb-3">
              <i className="ri-error-warning-line text-red-400 text-2xl"></i>
            </div>
            <p className="text-sm font-bold text-red-600">Failed to load communications</p>
            <p className="text-xs text-red-500 mt-1 font-mono break-all max-w-sm">{commError}</p>
            <button type="button" onClick={loadCommLogs}
              className="mt-4 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-xs font-semibold text-red-600 rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
              <i className="ri-refresh-line text-xs"></i>Retry
            </button>
          </div>
        ) : allLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 flex items-center justify-center bg-white rounded-full border border-gray-200 mb-3">
              <i className="ri-chat-3-line text-gray-300 text-2xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-500">No communications yet</p>
            <p className="text-xs text-gray-400 mt-1">All emails, SMS, calls and sequence messages will appear here as a chat history</p>
          </div>
        ) : (
          <div className="px-4 py-5 space-y-1">
            {grouped.map((group) => (
              <div key={group.dateLabel}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-300/50"></div>
                  <span className="text-[10px] font-bold text-gray-400 bg-[#e8e8e2] px-3 py-1 rounded-full uppercase tracking-wider">{group.dateLabel}</span>
                  <div className="flex-1 h-px bg-gray-300/50"></div>
                </div>

                {group.entries.map((entry, idx) => {
                  const cfg = getChatConfig(entry);

                  // ── CALL bubble (centered notification) ──────────────────
                  if (cfg.channel === "call") {
                    const dur = entry.duration;
                    const durStr = dur && dur > 0 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : null;
                    const isAnswered = dur != null && dur > 0;
                    const isMissed = !isAnswered && !entry.success;
                    return (
                      <div key={idx} className="flex justify-center my-3">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border ${isMissed ? "bg-red-50 border-red-200 text-red-600" : cfg.isOutbound ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-violet-50 border-violet-200 text-violet-700"}`}>
                          <i className={`${isMissed ? "ri-spam-line" : cfg.isOutbound ? "ri-phone-line" : "ri-phone-fill"} text-sm`}></i>
                          <span>
                            {isMissed ? "Missed Call" : cfg.isOutbound ? "Outbound Call" : "Inbound Call"}
                            {durStr && <span className="ml-1 opacity-70">· {durStr}</span>}
                          </span>
                          <span className="opacity-50">·</span>
                          <span className="opacity-60">{fmtTime(entry.sentAt)}</span>
                        </div>
                      </div>
                    );
                  }

                  // ── SMS bubble ───────────────────────────────────────────
                  if (cfg.channel === "sms") {
                    const isOut = cfg.isOutbound;
                    return (
                      <div key={idx} className={`flex mb-2 ${isOut ? "justify-end" : "justify-start"}`}>
                        {!isOut && (
                          <div className="w-7 h-7 flex items-center justify-center bg-gray-300 rounded-full flex-shrink-0 mr-2 mt-auto mb-1 text-xs font-bold text-gray-600">
                            {patientName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className={`max-w-[72%] ${isOut ? "items-end" : "items-start"} flex flex-col`}>
                          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isOut ? "bg-[#3b6ea5] text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                            {/* Header */}
                            <div className={`flex items-center gap-1.5 mb-1 ${isOut ? "text-white/60" : "text-gray-400"}`}>
                              <i className="ri-message-3-line text-xs"></i>
                              <span className="text-[10px] font-bold uppercase tracking-wider">SMS</span>
                              {!entry.success && <span className="text-[10px] font-bold text-red-400 ml-1">· Failed</span>}
                            </div>
                            <p className="whitespace-pre-wrap">{entry.body ?? "(no content)"}</p>
                          </div>
                          <span className={`text-[10px] mt-1 px-1 ${isOut ? "text-gray-400 text-right" : "text-gray-400"}`}>
                            {isOut ? "PawTenant" : patientName} · {fmtTime(entry.sentAt)}
                            {isOut && entry.success && <i className="ri-check-double-line ml-1 text-[#3b6ea5]"></i>}
                          </span>
                        </div>
                        {isOut && (
                          <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5] rounded-full flex-shrink-0 ml-2 mt-auto mb-1">
                            <i className="ri-customer-service-2-line text-white text-xs"></i>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── Email bubble (always outbound from PawTenant) ─────────
                  const isPrePayment = entry.type === "checkout_recovery" || entry.type.startsWith("seq_") || entry.type === "followup_lead";
                  const fallbackBlurb =
                    entry.type === "order_confirmation" ? "Order confirmation + payment receipt sent to customer." :
                    (entry.type === "under-review" || entry.type === "status_under_review") ? "Customer notified their case is under review by a licensed provider." :
                    (entry.type === "completed" || entry.type === "status_completed") ? "Customer notified their order is complete." :
                    entry.type === "letter_ready" ? "Documents ready email sent — customer can now download their letter." :
                    entry.type === "checkout_recovery" ? "Abandoned checkout recovery email with resume link sent." :
                    entry.type === "followup_lead" ? "Lead follow-up nudge email sent." :
                    entry.type === "consultation_booking" ? "Consultation booking confirmation email sent." :
                    entry.type === "seq_30min" ? "Automated 30-minute follow-up sequence email sent." :
                    entry.type === "seq_24h" ? "Automated 24-hour follow-up sequence email sent." :
                    entry.type === "seq_3day" ? "Automated 3-day follow-up sequence email sent." :
                    entry.type === "refund" ? "Refund confirmation email sent to customer." :
                    entry.type === "cancelled" ? "Cancellation notice sent to customer." :
                    entry.type === "provider_assigned_customer" ? "Customer notified that a provider has been assigned." :
                    entry.type === "provider_assigned_provider" ? "Provider notified of new case assignment." :
                    "Email sent to customer.";
                  const preview = toPreview(entry.body, 160);
                  const subjectLine = (entry.subject ?? "").trim();
                  const primaryLine = subjectLine || cfg.label;
                  const secondaryLine = preview || fallbackBlurb;
                  return (
                    <div key={idx} className="flex justify-end mb-2">
                      <div className="max-w-[78%] flex flex-col items-end">
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-br-sm overflow-hidden w-full">
                          {/* Email header bar */}
                          <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-100/60 border-b border-amber-200">
                            <i className="ri-mail-send-line text-amber-600 text-sm flex-shrink-0"></i>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Email</span>
                              <span className="text-[10px] text-amber-600/70 ml-2 truncate">→ {entry.to}</span>
                            </div>
                            {isPrePayment && (
                              <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Pre-payment</span>
                            )}
                            {!entry.success && (
                              <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <i className="ri-close-circle-fill"></i>Failed
                              </span>
                            )}
                          </div>
                          {/* Email body */}
                          <div className="px-3.5 py-2.5">
                            <p className="text-xs font-bold text-gray-800 leading-snug">{primaryLine}</p>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">
                              {secondaryLine}
                            </p>
                            {subjectLine && (
                              <p className="text-[10px] text-amber-700/70 mt-1.5 font-semibold uppercase tracking-wider">
                                {cfg.label}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] mt-1 px-1 text-gray-400 text-right">
                          PawTenant · {fmtTime(entry.sentAt)}
                          {entry.success && <i className="ri-check-double-line ml-1 text-amber-500"></i>}
                        </span>
                      </div>
                      <div className="w-7 h-7 flex items-center justify-center bg-amber-500 rounded-full flex-shrink-0 ml-2 mt-auto mb-1">
                        <i className="ri-mail-send-line text-white text-xs"></i>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={chatBottomRef}></div>
          </div>
        )}
      </div>

      {/* ── Chat footer: count + refresh ── */}
      {allLogs.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-white flex-shrink-0">
          <p className="text-[10px] text-gray-400 font-semibold">{allLogs.length} communication{allLogs.length !== 1 ? "s" : ""} logged</p>
          <button type="button" onClick={loadCommLogs}
            className="whitespace-nowrap flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#3b6ea5] cursor-pointer transition-colors">
            <i className="ri-refresh-line text-xs"></i>Refresh
          </button>
        </div>
      )}
    </div>
  );
}
