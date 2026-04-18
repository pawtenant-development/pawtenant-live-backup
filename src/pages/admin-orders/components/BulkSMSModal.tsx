// BulkSMSModal — Send SMS to all Lead (Paid) Unassigned customers at once
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { logAudit } from "../../../lib/auditLogger";
import ApprovalRequestModal from "./ApprovalRequestModal";

interface Order {
  id: string;
  confirmation_id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  state: string | null;
  payment_intent_id: string | null;
  doctor_email: string | null;
  doctor_user_id: string | null;
  doctor_status: string | null;
  created_at: string;
  last_broadcast_sent_at?: string | null;
}

interface BulkSMSModalProps {
  orders: Order[];
  adminName: string;
  adminRole: string | null;
  onClose: () => void;
}

const TEMPLATES = [
  {
    id: "update",
    label: "Status Update",
    text: "Hi {name}, this is PawTenant. Your ESA letter order is currently being reviewed. We\'ll have an update for you very soon. Thank you for your patience!",
  },
  {
    id: "processing",
    label: "Processing",
    text: "Hi {name}! Great news — your ESA application is being processed. Our licensed provider will reach out to complete your evaluation shortly. Questions? Reply to this message.",
  },
  {
    id: "reminder",
    label: "Gentle Reminder",
    text: "Hi {name}, just checking in on your PawTenant ESA letter request. We haven\'t forgotten about you — our team is on it! Need anything? Reply here.",
  },
  {
    id: "custom",
    label: "Custom",
    text: "",
  },
];

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function BulkSMSModal({ orders: rawOrders, adminName, adminRole, onClose }: BulkSMSModalProps) {
  const [message, setMessage]       = useState(TEMPLATES[0].text);
  const [selectedTemplate, setSelectedTemplate] = useState("update");
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState<{ successCount: number; failCount: number } | null>(null);
  const [preview, setPreview]       = useState(false);
  const [showApprovalRequest, setShowApprovalRequest] = useState(false);
  const [exclude24hRecent, setExclude24hRecent] = useState(false);
  const [freshTimestamps, setFreshTimestamps] = useState<Record<string, string | null>>({});
  const fetchedRef = useRef(false);

  // Re-fetch fresh last_broadcast_sent_at on mount so 24h cooldown is accurate
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const ids = rawOrders.map((o) => o.confirmation_id).filter(Boolean);
    if (ids.length === 0) return;
    const CHUNK = 500;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    Promise.all(
      chunks.map((chunk) =>
        supabase.from("orders").select("confirmation_id,last_broadcast_sent_at").in("confirmation_id", chunk)
      )
    ).then((results) => {
      const map: Record<string, string | null> = {};
      for (const { data } of results) {
        if (!data) continue;
        for (const row of data) map[row.confirmation_id] = row.last_broadcast_sent_at ?? null;
      }
      setFreshTimestamps(map);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge fresh timestamps
  const orders = useMemo<Order[]>(() => {
    if (Object.keys(freshTimestamps).length === 0) return rawOrders;
    return rawOrders.map((o) =>
      o.confirmation_id in freshTimestamps
        ? { ...o, last_broadcast_sent_at: freshTimestamps[o.confirmation_id] }
        : o
    );
  }, [rawOrders, freshTimestamps]);

  // Role checks
  const isRestricted = adminRole === "support";
  const isFinanceRole = adminRole === "finance";
  const isReadOnlyRole = adminRole === "read_only";

  // Only orders with phone numbers
  const withPhone    = orders.filter((o) => !!o.phone);
  const withoutPhone = orders.filter((o) => !o.phone);

  // 24h cooldown filter
  const recent24hCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return withPhone.filter((o) => o.last_broadcast_sent_at && new Date(o.last_broadcast_sent_at).getTime() > cutoff).length;
  }, [withPhone]);

  const recipients = useMemo(() => {
    if (!exclude24hRecent) return withPhone;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return withPhone.filter((o) => {
      if (!o.last_broadcast_sent_at) return true;
      return new Date(o.last_broadcast_sent_at).getTime() <= cutoff;
    });
  }, [withPhone, exclude24hRecent]);

  const charCount = message.length;
  const smsCount  = Math.ceil(charCount / 160) || 1;

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl && id !== "custom") setMessage(tmpl.text);
    else if (id === "custom") setMessage("");
  };

  const handleSend = async () => {
    if (!message.trim() || recipients.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const token = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      const targets = recipients.map((o) => ({
        orderId: o.id,
        confirmationId: o.confirmation_id,
        phone: o.phone!,
        name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
      }));
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targets, message: message.trim(), sentBy: adminName }),
      });
      const data = await res.json() as { ok: boolean; successCount: number; failCount: number; error?: string };
      if (data.ok) {
        setResult({ successCount: data.successCount, failCount: data.failCount });

        // ── Audit log: bulk SMS sent ──
        const { data: { session } } = await supabase.auth.getSession();
        await logAudit({
          actor_name: adminName,
          actor_role: adminRole ?? "admin",
          object_type: "system",
          object_id: null,
          action: "bulk_sms_sent",
          description: `Bulk SMS sent to ${data.successCount} recipients (${data.failCount} failed) by ${adminName}`,
          new_values: {
            sent_by: adminName,
            sent_by_user_id: session?.user?.id ?? null,
            recipient_count: data.successCount,
            failed_count: data.failCount,
            template: selectedTemplate,
            message_preview: message.trim().slice(0, 100),
            cooldown_filter_active: exclude24hRecent,
            recipients: recipients.slice(0, 50).map((o) => ({
              confirmation_id: o.confirmation_id,
              email: o.email,
              phone: o.phone,
              name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
            })),
            total_targeted: recipients.length,
            sent_at: new Date().toISOString(),
          },
        });
      } else {
        setResult({ successCount: 0, failCount: withPhone.length });
      }
    } catch {
      setResult({ successCount: 0, failCount: withPhone.length });
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${isRestricted || isFinanceRole || isReadOnlyRole ? "bg-gray-100" : "bg-[#3b6ea5]"}`}>
            <i className={`text-lg ${isRestricted || isFinanceRole || isReadOnlyRole ? "ri-lock-line text-gray-400" : "ri-send-plane-2-line text-white"}`}></i>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-extrabold text-gray-900">Bulk SMS Blast</h2>
            <p className="text-xs text-gray-400">
              {isRestricted
                ? "Restricted — Support role cannot send bulk SMS"
                : isFinanceRole
                  ? "Restricted — Finance role requires approval to send bulk SMS"
                  : isReadOnlyRole
                    ? "Read Only — viewing SMS info only, no send capability"
                    : <>Message all Lead (Paid) · Unassigned customers —&nbsp;
                        <strong className="text-[#3b6ea5]">{withPhone.length}</strong> with phone,&nbsp;
                        <strong className="text-amber-500">{withoutPhone.length}</strong> without
                      </>
              }
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── RESTRICTED SCREEN (support role) ── */}
          {isRestricted ? (
            <div className="py-6 space-y-5">
              {/* Role badge + title */}
              <div className="text-center space-y-3">
                <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto">
                  <i className="ri-lock-line text-gray-400 text-3xl"></i>
                </div>
                <div>
                  <p className="text-base font-extrabold text-gray-900">Bulk SMS Restricted</p>
                  <p className="text-xs text-gray-500 mt-1">Your account doesn&apos;t have permission to send bulk SMS messages</p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-cyan-100 text-cyan-700">
                  Support Role
                </span>
              </div>

              {/* What you CAN do */}
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
                <p className="text-xs font-extrabold text-[#3b6ea5] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <i className="ri-checkbox-circle-line"></i>What you CAN do
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: "ri-message-3-line", text: "Send individual SMS from any order's Communications tab" },
                    { icon: "ri-mail-send-line",  text: "Send individual emails from the order detail panel" },
                    { icon: "ri-phone-line",       text: "Make outbound calls from individual orders" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-start gap-2 text-xs text-[#3b6ea5]">
                      <i className={`${item.icon} flex-shrink-0 mt-0.5`}></i>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What requires higher role */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <i className="ri-shield-keyhole-line"></i>Requires Owner / Admin Manager
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: "ri-send-plane-2-line", text: "Bulk SMS to all unassigned paid orders" },
                    { icon: "ri-broadcast-line",    text: "Broadcast email campaigns to all customers" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-start gap-2 text-xs text-gray-400">
                      <i className={`${item.icon} flex-shrink-0 mt-0.5`}></i>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-center">
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap px-6 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                  Got it — Close
                </button>
              </div>
            </div>

          ) : isFinanceRole ? (
            /* ── FINANCE ROLE: Request Approval screen ── */
            <div className="py-6 space-y-5">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full mx-auto">
                  <i className="ri-lock-line text-amber-600 text-3xl"></i>
                </div>
                <div>
                  <p className="text-base font-extrabold text-gray-900">Approval Required</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Finance users cannot send bulk SMS directly. You can request approval from an Owner or Admin Manager.
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  Finance Role
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-extrabold text-amber-800 flex items-center gap-1.5">
                  <i className="ri-information-line"></i>What happens when approved
                </p>
                <ul className="space-y-1.5">
                  {[
                    "Your request is sent to all Owners and Admin Managers",
                    "They receive an email + in-app notification",
                    "If approved, the bulk SMS will be sent on your behalf",
                    "You'll be notified of the decision via the bell icon",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-amber-700">
                      <i className="ri-arrow-right-s-line flex-shrink-0 mt-0.5"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowApprovalRequest(true)}
                  className="whitespace-nowrap flex items-center justify-center gap-2 px-6 py-3 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors"
                >
                  <i className="ri-send-plane-line"></i>
                  Request Approval to Send Bulk SMS
                </button>
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap px-6 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
              </div>
            </div>

          ) : isReadOnlyRole ? (
            /* ── READ ONLY SCREEN ── */
            <div className="py-6 space-y-5">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto">
                  <i className="ri-eye-line text-gray-400 text-3xl"></i>
                </div>
                <div>
                  <p className="text-base font-extrabold text-gray-900">Read Only View</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Your account can view bulk SMS information but cannot send messages or select recipients.
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                  Read Only Role
                </span>
              </div>

              {/* Stats — view only, no interaction */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="text-center">
                  <p className="text-xl font-extrabold text-gray-700">{withPhone.length}</p>
                  <p className="text-xs text-gray-500">With phone</p>
                </div>
                <div className="text-center border-x border-gray-200">
                  <p className="text-xl font-extrabold text-amber-500">{withoutPhone.length}</p>
                  <p className="text-xs text-gray-500">No phone</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-extrabold text-gray-700">{orders.length}</p>
                  <p className="text-xs text-gray-500">Total orders</p>
                </div>
              </div>

              {/* Recipient list — view only, no checkboxes, no selection */}
              {withPhone.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <i className="ri-eye-line text-gray-400"></i>
                    Recipient List (View Only)
                  </p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 pointer-events-none select-none">
                      {withPhone.map((o) => {
                        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
                        return (
                          <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                            <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                              <i className="ri-user-3-line text-gray-400 text-xs"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-700 truncate">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">{o.phone}</p>
                            </div>
                            <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {o.state ?? "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {withoutPhone.length > 0 && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                          <i className="ri-alert-line text-amber-500"></i>
                          {withoutPhone.length} customer{withoutPhone.length > 1 ? "s" : ""} have no phone on file
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                    <i className="ri-lock-line"></i>
                    Selection and interaction disabled for Read Only accounts
                  </p>
                </div>
              )}

              {/* What you CAN do */}
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
                <p className="text-xs font-extrabold text-[#3b6ea5] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <i className="ri-checkbox-circle-line"></i>What you CAN do
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: "ri-eye-line", text: "View order details and customer information" },
                    { icon: "ri-bar-chart-2-line", text: "View analytics, payments, and earnings" },
                    { icon: "ri-file-list-3-line", text: "View audit logs and system health" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-start gap-2 text-xs text-[#3b6ea5]">
                      <i className={`${item.icon} flex-shrink-0 mt-0.5`}></i>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What requires higher role */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <i className="ri-shield-keyhole-line"></i>Requires Owner / Admin Manager
                </p>
                <ul className="space-y-2">
                  {[
                    { icon: "ri-send-plane-2-line", text: "Send bulk SMS to customers" },
                    { icon: "ri-broadcast-line", text: "Send broadcast email campaigns" },
                    { icon: "ri-user-received-line", text: "Assign providers to orders" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-start gap-2 text-xs text-gray-400">
                      <i className={`${item.icon} flex-shrink-0 mt-0.5`}></i>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-center">
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap px-6 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                  Close
                </button>
              </div>
            </div>

          ) : result ? (
            /* ── Result screen ── */
            <div className="text-center py-10 space-y-4">
              <div className={`w-16 h-16 flex items-center justify-center rounded-full mx-auto ${result.failCount === 0 ? "bg-[#e8f0f9]" : "bg-amber-50"}`}>
                <i className={`text-3xl ${result.failCount === 0 ? "ri-checkbox-circle-fill text-[#3b6ea5]" : "ri-error-warning-fill text-amber-500"}`}></i>
              </div>
              <div>
                <p className="text-xl font-extrabold text-gray-900">
                  {result.successCount} sent{result.failCount > 0 ? `, ${result.failCount} failed` : ""}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {result.failCount === 0
                    ? "All messages delivered successfully"
                    : `${result.failCount} message(s) couldn't be delivered — check Twilio for details`}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={onClose}
                  className="whitespace-nowrap px-5 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-[#2d5a8e]">
                  Done
                </button>
                <button type="button" onClick={() => setResult(null)}
                  className="whitespace-nowrap px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg cursor-pointer hover:bg-gray-50">
                  Send Another
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Template selector */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Message Template</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button key={t.id} type="button"
                      onClick={() => handleTemplateSelect(t.id)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${selectedTemplate === t.id ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message compose */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Message</p>
                  <span className="text-xs text-gray-400">{charCount} chars · {smsCount} SMS credit{smsCount > 1 ? "s" : ""}</span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 640))}
                  rows={5}
                  placeholder="Type your message here... Use {name} to personalise with customer's first name"
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <i className="ri-lightbulb-line text-amber-500"></i>
                  Use <code className="bg-gray-100 px-1 rounded text-[10px]">&lbrace;name&rbrace;</code> to auto-insert each customer's first name
                </p>
              </div>

              {/* Preview toggle */}
              <div>
                <button type="button" onClick={() => setPreview((v) => !v)}
                  className="whitespace-nowrap flex items-center gap-1.5 text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer">
                  <i className={preview ? "ri-eye-off-line" : "ri-eye-line"}></i>
                  {preview ? "Hide" : "Preview"} recipients ({recipients.length})
                </button>
                {preview && (
                  <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                      {recipients.map((o) => {
                        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
                        const first = o.first_name || name.split(" ")[0] || "there";
                        const previewText = message.replace(/\{name\}/gi, first).slice(0, 60) + (message.length > 60 ? "..." : "");
                        return (
                          <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-full flex-shrink-0">
                              <i className="ri-user-3-line text-[#3b6ea5] text-xs"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">{o.phone}</p>
                            </div>
                            <p className="text-xs text-gray-400 truncate max-w-[200px] hidden sm:block italic">&ldquo;{previewText}&rdquo;</p>
                          </div>
                        );
                      })}
                    </div>
                    {withoutPhone.length > 0 && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200">
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                          <i className="ri-alert-line text-amber-500"></i>
                          {withoutPhone.length} customer{withoutPhone.length > 1 ? "s" : ""} will be skipped (no phone on file)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 24h Cooldown Toggle */}
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors cursor-pointer ${exclude24hRecent ? "bg-sky-50 border-sky-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}
                onClick={() => setExclude24hRecent((v) => !v)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${exclude24hRecent ? "bg-sky-100" : "bg-gray-100"}`}>
                    <i className={`ri-time-line text-sm ${exclude24hRecent ? "text-sky-600" : "text-gray-400"}`}></i>
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${exclude24hRecent ? "text-sky-800" : "text-gray-700"}`}>
                      Skip recently contacted (24h cooldown)
                    </p>
                    <p className={`text-xs mt-0.5 ${exclude24hRecent ? "text-sky-600" : "text-gray-400"}`}>
                      {exclude24hRecent
                        ? recent24hCount > 0
                          ? `${recent24hCount} customer${recent24hCount !== 1 ? "s" : ""} will be skipped — received a broadcast in the last 24h`
                          : "No customers received a broadcast in the last 24 hours"
                        : `Exclude contacts texted in the past 24h — ${recent24hCount} in this group`}
                    </p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${exclude24hRecent ? "bg-sky-500" : "bg-gray-300"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${exclude24hRecent ? "translate-x-5" : "translate-x-0.5"}`}></div>
                </div>
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="text-center">
                  <p className="text-xl font-extrabold text-[#3b6ea5]">{recipients.length}</p>
                  <p className="text-xs text-gray-500">Will receive</p>
                </div>
                <div className="text-center border-x border-gray-200">
                  <p className="text-xl font-extrabold text-amber-500">{withoutPhone.length}</p>
                  <p className="text-xs text-gray-500">Skipped (no phone)</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-extrabold text-gray-700">{smsCount}</p>
                  <p className="text-xs text-gray-500">SMS credits each</p>
                </div>
              </div>
              {exclude24hRecent && recent24hCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-xl">
                  <i className="ri-time-line text-sky-500 text-sm flex-shrink-0"></i>
                  <p className="text-xs text-sky-800">
                    <strong>{recent24hCount} customer{recent24hCount !== 1 ? "s" : ""}</strong> skipped — already received a broadcast in the last 24 hours.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — hidden for restricted roles and result screen */}
        {!result && !isRestricted && !isFinanceRole && !isReadOnlyRole && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <button type="button" onClick={onClose}
              className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg cursor-pointer hover:bg-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !message.trim() || recipients.length === 0}
              className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#3b6ea5] text-white text-sm font-extrabold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {sending
                ? <><i className="ri-loader-4-line animate-spin"></i>Sending to {recipients.length} customers...</>
                : <><i className="ri-send-plane-2-line"></i>Send to {recipients.length} customer{recipients.length !== 1 ? "s" : ""}</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Approval Request Modal for Finance role */}
      {showApprovalRequest && (
        <ApprovalRequestModal
          actionType="bulk_sms"
          actionLabel="Bulk SMS Send"
          actionDescription={`Request to send a bulk SMS to ${withPhone.length} unassigned paid order customer${withPhone.length !== 1 ? "s" : ""}. As a Finance user, this requires Owner or Admin Manager approval.`}
          payload={{
            recipientCount: withPhone.length,
            message: message.trim().slice(0, 100),
          }}
          requesterName={adminName}
          requesterRole="finance"
          requesterUserId=""
          onClose={() => setShowApprovalRequest(false)}
        />
      )}
    </div>
  );
}
