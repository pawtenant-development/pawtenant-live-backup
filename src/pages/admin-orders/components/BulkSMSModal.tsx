// BulkSMSModal — Send SMS to all Lead (Paid) Unassigned customers at once
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

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
}

interface BulkSMSModalProps {
  orders: Order[];
  adminName: string;
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

export default function BulkSMSModal({ orders, adminName, onClose }: BulkSMSModalProps) {
  const [message, setMessage]       = useState(TEMPLATES[0].text);
  const [selectedTemplate, setSelectedTemplate] = useState("update");
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState<{ successCount: number; failCount: number } | null>(null);
  const [preview, setPreview]       = useState(false);

  // Only orders with phone numbers
  const withPhone    = orders.filter((o) => !!o.phone);
  const withoutPhone = orders.filter((o) => !o.phone);

  const charCount = message.length;
  const smsCount  = Math.ceil(charCount / 160) || 1;

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl && id !== "custom") setMessage(tmpl.text);
    else if (id === "custom") setMessage("");
  };

  const handleSend = async () => {
    if (!message.trim() || withPhone.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const token = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      const targets = withPhone.map((o) => ({
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
          <div className="w-10 h-10 flex items-center justify-center bg-[#1a5c4f] rounded-xl flex-shrink-0">
            <i className="ri-send-plane-2-line text-white text-lg"></i>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-extrabold text-gray-900">Bulk SMS Blast</h2>
            <p className="text-xs text-gray-400">
              Message all Lead (Paid) · Unassigned customers —&nbsp;
              <strong className="text-[#1a5c4f]">{withPhone.length}</strong> with phone,&nbsp;
              <strong className="text-amber-500">{withoutPhone.length}</strong> without
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {result ? (
            /* ── Result screen ── */
            <div className="text-center py-10 space-y-4">
              <div className={`w-16 h-16 flex items-center justify-center rounded-full mx-auto ${result.failCount === 0 ? "bg-[#f0faf7]" : "bg-amber-50"}`}>
                <i className={`text-3xl ${result.failCount === 0 ? "ri-checkbox-circle-fill text-[#1a5c4f]" : "ri-error-warning-fill text-amber-500"}`}></i>
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
                  className="whitespace-nowrap px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-[#17504a]">
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
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${selectedTemplate === t.id ? "bg-[#1a5c4f] text-white border-[#1a5c4f]" : "border-gray-200 text-gray-600 hover:border-[#1a5c4f] hover:text-[#1a5c4f]"}`}>
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
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a5c4f] resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <i className="ri-lightbulb-line text-amber-500"></i>
                  Use <code className="bg-gray-100 px-1 rounded text-[10px]">&lbrace;name&rbrace;</code> to auto-insert each customer's first name
                </p>
              </div>

              {/* Preview toggle */}
              <div>
                <button type="button" onClick={() => setPreview((v) => !v)}
                  className="whitespace-nowrap flex items-center gap-1.5 text-xs font-bold text-[#1a5c4f] hover:underline cursor-pointer">
                  <i className={preview ? "ri-eye-off-line" : "ri-eye-line"}></i>
                  {preview ? "Hide" : "Preview"} recipients ({withPhone.length})
                </button>
                {preview && (
                  <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                      {withPhone.map((o) => {
                        const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email;
                        const first = o.first_name || name.split(" ")[0] || "there";
                        const preview = message.replace(/\{name\}/gi, first).slice(0, 60) + (message.length > 60 ? "..." : "");
                        return (
                          <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="w-7 h-7 flex items-center justify-center bg-[#f0faf7] rounded-full flex-shrink-0">
                              <i className="ri-user-3-line text-[#1a5c4f] text-xs"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{name}</p>
                              <p className="text-xs text-gray-400 font-mono">{o.phone}</p>
                            </div>
                            <p className="text-xs text-gray-400 truncate max-w-[200px] hidden sm:block italic">&ldquo;{preview}&rdquo;</p>
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

              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <div className="text-center">
                  <p className="text-xl font-extrabold text-[#1a5c4f]">{withPhone.length}</p>
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
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <button type="button" onClick={onClose}
              className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg cursor-pointer hover:bg-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !message.trim() || withPhone.length === 0}
              className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {sending
                ? <><i className="ri-loader-4-line animate-spin"></i>Sending to {withPhone.length} customers...</>
                : <><i className="ri-send-plane-2-line"></i>Send to {withPhone.length} customer{withPhone.length !== 1 ? "s" : ""}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
