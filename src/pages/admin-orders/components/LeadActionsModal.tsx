import { useState, useCallback } from "react";
import { supabase as _supabase } from "../../../lib/supabaseClient";
import { getAdminToken } from "../../../lib/supabaseClient";

interface LeadOrder {
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  phone: string | null;
  created_at: string;
  delivery_speed: string | null;
  price: number | null;
  letter_type?: string | null;
  email_log?: { type: string; sentAt: string; success: boolean }[] | null;
  sent_followup_at?: string | null;
}

function isPSDLead(lead: Pick<LeadOrder, "letter_type" | "confirmation_id">): boolean {
  return lead.letter_type === "psd" || lead.confirmation_id.includes("-PSD");
}

interface LeadActionsModalProps {
  leads: LeadOrder[];
  onClose: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

function getFollowupSubject(isPSD: boolean): string {
  return isPSD
    ? "Complete Your PSD Letter \u2014 PawTenant"
    : "Complete Your ESA Letter \u2014 PawTenant";
}

function buildFollowupBody(isPSD: boolean): string {
  if (isPSD) {
    return [
      "Hi there,",
      "",
      "We noticed you started your Psychiatric Service Dog (PSD) assessment with PawTenant but haven\u2019t completed the process yet.",
      "",
      "Your PSD Letter provides ADA-compliant documentation confirming your dog\u2019s trained tasks and your qualifying disability \u2014 required for housing access and public accommodation.",
      "",
      "\u2713 Licensed Healthcare Providers in your state",
      "\u2713 Delivered within 24 hours (or 2\u20133 days at a reduced rate)",
      "\u2713 ADA-compliant — valid nationwide",
      "",
      "Complete your assessment here:",
      "https://www.pawtenant.com/psd-assessment",
      "",
      "If you have any questions, feel free to reply to this email or call us at (409) 965-5885.",
      "",
      "Warm regards,",
      "The PawTenant Team",
      "hello@pawtenant.com | pawtenant.com",
    ].join("\n");
  }
  return [
    "Hi there,",
    "",
    "We noticed you started your ESA assessment with PawTenant but haven\u2019t completed the process yet.",
    "",
    "Your ESA Letter helps protect your right to keep your emotional support animal in housing that would otherwise restrict pets \u2014 and it\u2019s backed by the Fair Housing Act.",
    "",
    "\u2713 Licensed Medical Providers in your state",
    "\u2713 Delivered within 24 hours (or 2\u20133 days at a reduced rate)",
    "\u2713 Legally enforced for rentals, vacation homes, and college dorms",
    "",
    "Complete your assessment here:",
    "https://www.pawtenant.com/assessment",
    "",
    "If you have any questions, feel free to reply to this email or call us at (409) 965-5885.",
    "",
    "Warm regards,",
    "The PawTenant Team",
    "hello@pawtenant.com | pawtenant.com",
  ].join("\n");
}

export default function LeadActionsModal({ leads, onClose }: LeadActionsModalProps) {
  const [tab, setTab] = useState<"export" | "followup" | "payment-link">("export");

  // Payment link state
  const [sendingAll, setSendingAll] = useState(false);
  const [sendResults, setSendResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [sendingSingle, setSendingSingle] = useState<string | null>(null);
  const [bulkSendMsg, setBulkSendMsg] = useState("");

  // Follow-up email state
  const [followupSendingAll, setFollowupSendingAll] = useState(false);
  const [followupResults, setFollowupResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [followupSendingSingle, setFollowupSendingSingle] = useState<string | null>(null);
  const [followupBulkMsg, setFollowupBulkMsg] = useState("");
  const [templateCopied, setTemplateCopied] = useState(false);

  // Detect if majority of leads are PSD for preview template
  const previewIsPSD = leads.length > 0 && isPSDLead(leads[0]);

  const handleCopyTemplate = async () => {
    try {
      const subject = getFollowupSubject(previewIsPSD);
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${buildFollowupBody(previewIsPSD)}`);
      setTemplateCopied(true);
      setTimeout(() => setTemplateCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const handleExportCSV = useCallback(() => {
    const headers = ["Name", "Email", "Phone", "State", "Delivery Speed", "Order ID", "Created"];
    const rows = leads.map((o) => [
      `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || o.email,
      o.email,
      o.phone ?? "",
      o.state ?? "",
      o.delivery_speed ?? "",
      o.confirmation_id,
      new Date(o.created_at).toLocaleDateString("en-US"),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pawtenant-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [leads]);

  // ── Payment link sending ──
  const sendPaymentLink = async (lead: LeadOrder) => {
    setSendingSingle(lead.confirmation_id);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirmationId: lead.confirmation_id,
          email: lead.email,
          firstName: lead.first_name ?? "",
          price: lead.price,
          letterType: isPSDLead(lead) ? "psd" : "esa",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      setSendResults((prev) => ({
        ...prev,
        [lead.confirmation_id]: {
          ok: result.ok,
          msg: result.ok ? "Payment link sent!" : (result.error ?? "Send failed"),
        },
      }));
    } catch {
      setSendResults((prev) => ({
        ...prev,
        [lead.confirmation_id]: { ok: false, msg: "Network error" },
      }));
    }
    setSendingSingle(null);
  };

  const sendAllPaymentLinks = async () => {
    setSendingAll(true);
    setBulkSendMsg("");
    const token = await getAdminToken();
    let successCount = 0;
    let failCount = 0;
    for (const lead of leads) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-checkout-recovery`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            confirmationId: lead.confirmation_id,
            email: lead.email,
            firstName: lead.first_name ?? "",
            price: lead.price,
            letterType: isPSDLead(lead) ? "psd" : "esa",
          }),
        });
        const result = await res.json() as { ok: boolean };
        if (result.ok) successCount++;
        else failCount++;
        setSendResults((prev) => ({
          ...prev,
          [lead.confirmation_id]: { ok: result.ok, msg: result.ok ? "Sent!" : "Failed" },
        }));
      } catch {
        failCount++;
      }
    }
    setSendingAll(false);
    setBulkSendMsg(
      failCount === 0
        ? `Payment links sent to all ${successCount} lead${successCount !== 1 ? "s" : ""}`
        : `${successCount} sent, ${failCount} failed`
    );
    setTimeout(() => setBulkSendMsg(""), 8000);
  };

  // ── Follow-up email sending ──
  const sendFollowupEmail = async (lead: LeadOrder) => {
    setFollowupSendingSingle(lead.confirmation_id);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-followup-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: lead.email,
          first_name: lead.first_name,
          confirmation_id: lead.confirmation_id,
          letter_type: isPSDLead(lead) ? "psd" : "esa",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      setFollowupResults((prev) => ({
        ...prev,
        [lead.confirmation_id]: {
          ok: result.ok,
          msg: result.ok ? "Email sent!" : (result.error ?? "Send failed"),
        },
      }));
    } catch {
      setFollowupResults((prev) => ({
        ...prev,
        [lead.confirmation_id]: { ok: false, msg: "Network error" },
      }));
    }
    setFollowupSendingSingle(null);
  };

  const sendAllFollowupEmails = async () => {
    setFollowupSendingAll(true);
    setFollowupBulkMsg("");
    const token = await getAdminToken();
    let successCount = 0;
    let failCount = 0;
    for (const lead of leads) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-followup-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: lead.email,
            first_name: lead.first_name,
            confirmation_id: lead.confirmation_id,
            letter_type: isPSDLead(lead) ? "psd" : "esa",
          }),
        });
        const result = await res.json() as { ok: boolean };
        if (result.ok) successCount++;
        else failCount++;
        setFollowupResults((prev) => ({
          ...prev,
          [lead.confirmation_id]: { ok: result.ok, msg: result.ok ? "Sent!" : "Failed" },
        }));
      } catch {
        failCount++;
      }
    }
    setFollowupSendingAll(false);
    setFollowupBulkMsg(
      failCount === 0
        ? `Follow-up emails sent to all ${successCount} lead${successCount !== 1 ? "s" : ""}`
        : `${successCount} sent, ${failCount} failed`
    );
    setTimeout(() => setFollowupBulkMsg(""), 8000);
  };

  const hasRecoveryEmail = (lead: LeadOrder) =>
    (lead.email_log ?? []).some((e) => e.type === "checkout_recovery" && e.success);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">Lead Actions</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {leads.length} unpaid lead{leads.length !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 pb-0">
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 w-fit">
            {[
              { key: "export" as const, label: "Export CSV", icon: "ri-download-2-line" },
              { key: "followup" as const, label: "Follow-up Email", icon: "ri-mail-send-line" },
              { key: "payment-link" as const, label: "Send Payment Link", icon: "ri-secure-payment-line" },
            ].map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold transition-all cursor-pointer ${tab === t.key ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                <i className={t.icon}></i>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── EXPORT TAB ── */}
          {tab === "export" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                The exported CSV will include: <strong>Name, Email, Phone, State, Delivery Speed, Order ID, Date</strong>.
              </p>
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-3 px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">
                  <span>Name / Email</span><span>State / Speed</span><span>Order ID</span><span>Date</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-[280px] overflow-y-auto">
                  {leads.map((lead) => (
                    <div key={lead.confirmation_id} className="px-4 py-2.5 grid grid-cols-[2fr_2fr_1fr_1fr] gap-3 items-center">
                      <div>
                        <p className="text-xs font-semibold text-gray-900 truncate">
                          {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "—"}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{lead.state ?? "—"}</span>
                        {lead.delivery_speed && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{lead.delivery_speed}</span>}
                      </div>
                      <p className="text-xs font-mono text-gray-500 truncate">{lead.confirmation_id}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FOLLOW-UP EMAIL TAB ── */}
          {tab === "followup" && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f]/10 rounded-lg flex-shrink-0">
                  <i className="ri-mail-send-line text-[#1a5c4f] text-base"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1a5c4f] mb-1">Sent from hello@pawtenant.com via Resend</p>
                  <p className="text-xs text-[#2d6b5e] leading-relaxed">
                    Sends a branded follow-up email reminding leads to complete their{" "}
                    <strong>{previewIsPSD ? "PSD" : "ESA"} assessment</strong>. PSD leads get an ADA-branded email with a PSD resume link. Logged to Audit Log for HIPAA tracking.
                  </p>
                </div>
              </div>
              {/* PSD badge if mixed or all PSD */}
              {leads.some((l) => isPSDLead(l)) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                  <i className="ri-service-line text-amber-600"></i>
                  {leads.filter((l) => isPSDLead(l)).length} PSD lead{leads.filter((l) => isPSDLead(l)).length !== 1 ? "s" : ""} — will receive PSD-branded email with PSD resume link
                </div>
              )}

              {/* Bulk send message */}
              {followupBulkMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${followupBulkMsg.includes("failed") ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f]"}`}>
                  <i className={followupBulkMsg.includes("failed") ? "ri-error-warning-line" : "ri-checkbox-circle-fill"}></i>
                  {followupBulkMsg}
                </div>
              )}

              {/* Per-lead list */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">
                  <span>Lead</span><span>Status</span><span>Action</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                  {leads.map((lead) => {
                    const result = followupResults[lead.confirmation_id];
                    const isSending = followupSendingSingle === lead.confirmation_id;
                    return (
                      <div key={lead.confirmation_id} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                        <div>
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "—"}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                        </div>
                        <div>
                          {result ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${result.ok ? "bg-[#e8f5f1] text-[#1a5c4f]" : "bg-red-50 text-red-600"}`}>
                              <i className={result.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-line"}></i>
                              {result.msg}
                            </span>
                          ) : lead.sent_followup_at ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700">
                              <i className="ri-mail-check-line"></i>
                              {(() => {
                                const d = Math.floor((Date.now() - new Date(lead.sent_followup_at!).getTime()) / 86400000);
                                return d === 0 ? "Sent today" : d === 1 ? "Sent 1d ago" : `Sent ${d}d ago`;
                              })()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
                              <i className="ri-mail-line"></i>Not sent
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => sendFollowupEmail(lead)}
                          disabled={isSending || followupSendingAll}
                          className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {isSending
                            ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                            : <><i className="ri-send-plane-line"></i>Send</>
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Template preview (collapsible hint) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Email Preview</p>
                  <button type="button" onClick={handleCopyTemplate}
                    className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
                    <i className={templateCopied ? "ri-checkbox-circle-fill text-green-500" : "ri-file-copy-line"}></i>
                    {templateCopied ? "Copied!" : "Copy template"}
                  </button>
                </div>
                <div className={`border rounded-xl p-4 space-y-2.5 ${previewIsPSD ? "bg-amber-50 border-amber-200" : "bg-[#f0faf7] border-[#b8ddd5]"}`}>
                  <div className={`flex items-start gap-2 pb-2 border-b ${previewIsPSD ? "border-amber-200" : "border-[#b8ddd5]"}`}>
                    <span className={`text-xs font-bold w-14 flex-shrink-0 ${previewIsPSD ? "text-amber-800" : "text-[#1a5c4f]"}`}>From:</span>
                    <span className="text-xs text-gray-600">hello@pawtenant.com</span>
                  </div>
                  <div className={`flex items-start gap-2 pb-2 border-b ${previewIsPSD ? "border-amber-200" : "border-[#b8ddd5]"}`}>
                    <span className={`text-xs font-bold w-14 flex-shrink-0 ${previewIsPSD ? "text-amber-800" : "text-[#1a5c4f]"}`}>Subject:</span>
                    <span className="text-xs text-gray-800 font-semibold">{getFollowupSubject(previewIsPSD)}</span>
                  </div>
                  <div className="text-xs text-gray-700 leading-relaxed space-y-1.5">
                    <p>Hi there,</p>
                    {previewIsPSD ? (
                      <p>We noticed you started your <strong>PSD assessment</strong> with PawTenant but haven&apos;t completed the process yet.</p>
                    ) : (
                      <p>We noticed you started your ESA assessment with PawTenant but haven&apos;t completed the process yet.</p>
                    )}
                    <div className="flex flex-col gap-0.5 my-1">
                      {previewIsPSD
                        ? ["Licensed Healthcare Providers in your state", "Delivered within 24 hours", "ADA-compliant — valid nationwide"].map((t) => (
                          <p key={t} className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-amber-600 flex-shrink-0 mt-0.5" style={{ fontSize: "11px" }}></i>{t}
                          </p>
                        ))
                        : ["Licensed Medical Providers in your state", "Delivered within 24 hours", "Legally enforced for rentals & dorms"].map((t) => (
                          <p key={t} className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#1a5c4f] flex-shrink-0 mt-0.5" style={{ fontSize: "11px" }}></i>{t}
                          </p>
                        ))
                      }
                    </div>
                    <p className={`font-bold ${previewIsPSD ? "text-amber-700" : "text-[#1a5c4f]"}`}>
                      <i className="ri-arrow-right-line"></i>{" "}
                      Complete: pawtenant.com/{previewIsPSD ? "psd-assessment" : "assessment"}
                    </p>
                    <p className={`text-[11px] pt-1 border-t mt-2 ${previewIsPSD ? "text-amber-700/70 border-amber-200" : "text-gray-500 border-[#b8ddd5]"}`}>
                      Warm regards, The PawTenant Team · (409) 965-5885
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PAYMENT LINK TAB ── */}
          {tab === "payment-link" && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                  <i className="ri-mail-send-line text-orange-600 text-base"></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-orange-800 mb-1">Automated Recovery Email</p>
                  <p className="text-xs text-orange-700 leading-relaxed">
                    Sends a branded recovery email with a <strong>direct payment link</strong> that pre-fills their saved assessment — they click once and go straight to checkout.
                  </p>
                </div>
              </div>

              {bulkSendMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold ${bulkSendMsg.includes("failed") ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f]"}`}>
                  <i className={bulkSendMsg.includes("failed") ? "ri-error-warning-line" : "ri-checkbox-circle-fill"}></i>
                  {bulkSendMsg}
                </div>
              )}

              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">
                  <span>Lead</span><span>Recovery Email</span><span>Action</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                  {leads.map((lead) => {
                    const alreadySent = hasRecoveryEmail(lead);
                    const result = sendResults[lead.confirmation_id];
                    const isSending = sendingSingle === lead.confirmation_id;
                    const resumeUrl = isPSDLead(lead)
                      ? `https://www.pawtenant.com/psd-assessment?resume=${lead.confirmation_id}`
                      : `https://www.pawtenant.com/assessment?resume=${lead.confirmation_id}`;
                    return (
                      <div key={lead.confirmation_id} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                        <div>
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "—"}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                          <p className="text-xs font-mono text-gray-400">{lead.confirmation_id}</p>
                        </div>
                        <div>
                          {result ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${result.ok ? "bg-[#e8f5f1] text-[#1a5c4f]" : "bg-red-50 text-red-600"}`}>
                              <i className={result.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-line"}></i>
                              {result.msg}
                            </span>
                          ) : alreadySent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                              <i className="ri-mail-check-line"></i>Sent before
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
                              <i className="ri-mail-line"></i>Not sent
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <a href={resumeUrl} target="_blank" rel="noopener noreferrer"
                            className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer transition-colors">
                            <i className="ri-external-link-line text-sm"></i>
                          </a>
                          <button type="button" onClick={() => sendPaymentLink(lead)} disabled={isSending || sendingAll}
                            className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 cursor-pointer transition-colors">
                            {isSending
                              ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                              : <><i className="ri-send-plane-line"></i>Send</>
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose}
            className="whitespace-nowrap px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 cursor-pointer">
            Close
          </button>
          {tab === "export" && (
            <button type="button" onClick={handleExportCSV}
              className="whitespace-nowrap flex items-center gap-2 px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-lg hover:bg-[#17504a] cursor-pointer">
              <i className="ri-download-2-line"></i>Download {leads.length} Leads as CSV
            </button>
          )}
          {tab === "followup" && (
            <button
              type="button"
              onClick={sendAllFollowupEmails}
              disabled={followupSendingAll}
              className="whitespace-nowrap flex items-center gap-2 px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {followupSendingAll
                ? <><i className="ri-loader-4-line animate-spin"></i>Sending all...</>
                : <><i className="ri-send-plane-2-line"></i>Send Follow-up to All {leads.length}</>
              }
            </button>
          )}
          {tab === "payment-link" && (
            <button type="button" onClick={sendAllPaymentLinks} disabled={sendingAll}
              className="whitespace-nowrap flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-extrabold rounded-lg hover:bg-orange-600 disabled:opacity-50 cursor-pointer transition-colors">
              {sendingAll
                ? <><i className="ri-loader-4-line animate-spin"></i>Sending all...</>
                : <><i className="ri-send-plane-2-line"></i>Send Payment Link to All {leads.length}</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
