// ProviderRecruitmentTab (v2) — PAWTENANT-PROVIDER-RECRUITMENT-V2
//
// Admin-side outreach: email potential licensed mental health providers in ANY
// U.S. state. Renders the editable Communications Template Hub template
// `provider_recruitment_outreach` for the saved default, while allowing an
// operator-written message to replace that default for a single send. CTA
// points to /join-our-network. Mounted inside Providers (DoctorsTab sub-tab).
//
// Sending is gated to owner / admin_manager (canAccessBroadcast).

import { useEffect, useMemo, useState } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import { canAccessBroadcast } from "../../../lib/adminPermissions";
import { US_STATES } from "../../../lib/usStates";
import type { DoctorProfile } from "../types";

const DEFAULT_SUBJECT = "Partner with PawTenant — Licensed Provider Network";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CUSTOM_MESSAGE = 4_000;
const STATE_NAMES = US_STATES.map((s) => s.name);

interface OutreachRow {
  id: string;
  recipient_email: string;
  target_states: string[] | null;
  status: string;
  is_test: boolean | null;
  sent_by_name: string | null;
  created_at: string;
}

interface SendResult { email: string; ok: boolean; messageId: string | null; error: string | null }

function statesSentence(states: string[]): string {
  if (states.length === 0) return "U.S. markets where we need additional coverage";
  if (states.length === 1) return states[0];
  if (states.length === 2) return `${states[0]} and ${states[1]}`;
  return `${states.slice(0, -1).join(", ")}, and ${states[states.length - 1]}`;
}

function plainTextToHtml(value: string): string {
  return value.trim().split(/\n{2,}/).map((paragraph) =>
    `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`,
  ).join("");
}

function fallbackEmail(vars: Record<string, string>, customMessageHtml = ""): string {
  const bodyHtml = customMessageHtml ||
    `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">PawTenant is expanding its licensed mental health provider network in <strong>${vars.states}</strong>. Providers review structured client intake, apply their own clinical judgment, and approve only when clinically appropriate.</p>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center;">
<img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
<h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">Partner with PawTenant</h1></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi <strong>${vars.name}</strong>,</p>
${bodyHtml}
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
<a href="${vars.join_url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Join Our Provider Network &rarr;</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reply to this email.<br/><br/>Warm regards,<br/><strong>The PawTenant Provider Partnerships Team</strong><br/>${SUPPORT_EMAIL}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function parseEmails(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean).map((e) => e.toLowerCase()),
  ));
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export default function ProviderRecruitmentTab({ adminProfile }: { adminProfile: DoctorProfile | null }) {
  const role = adminProfile?.role ?? null;
  const canSend = canAccessBroadcast(role);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join-our-network` : "https://pawtenant.com/join-our-network";

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [stateQuery, setStateQuery] = useState("");
  const [emailsRaw, setEmailsRaw] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const [tplBody, setTplBody] = useState<string | null>(null);
  const [log, setLog] = useState<OutreachRow[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  const emails = useMemo(() => parseEmails(emailsRaw), [emailsRaw]);
  const invalidEmails = useMemo(() => emails.filter((e) => !EMAIL_RE.test(e)), [emails]);
  const validEmails = useMemo(() => emails.filter((e) => EMAIL_RE.test(e)), [emails]);
  const filteredStates = useMemo(
    () => STATE_NAMES.filter((s) => s.toLowerCase().includes(stateQuery.trim().toLowerCase())),
    [stateQuery],
  );

  // Load editable template (subject + body) for preview/subject default.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("email_templates")
        .select("subject, body, archived")
        .eq("slug", "provider_recruitment_outreach").eq("channel", "email").maybeSingle();
      if (data && !data.archived) {
        if (data.subject) setSubject(data.subject as string);
        if (data.body) setTplBody(data.body as string);
      }
    })();
  }, []);

  const loadLog = async () => {
    setLogLoading(true);
    const { data, error } = await supabase
      .from("provider_recruitment_outreach")
      .select("id, recipient_email, target_states, status, is_test, sent_by_name, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (!error && data) setLog(data as OutreachRow[]);
    setLogLoading(false);
  };
  useEffect(() => { void loadLog(); }, []);

  const previewHtml = useMemo(() => {
    const vars = {
      name: "there",
      states: escapeHtml(statesSentence(selectedStates)),
      join_url: joinUrl,
      custom_intro: "",
      company_name: "PawTenant",
      sender_name: escapeHtml(adminProfile?.full_name ?? "PawTenant Team"),
    };
    if (customMessage.trim()) return fallbackEmail(vars, plainTextToHtml(customMessage));
    return tplBody ? substitute(tplBody, vars) : fallbackEmail(vars);
  }, [tplBody, customMessage, selectedStates, joinUrl, adminProfile]);

  async function callSend(opts: { sendTest: boolean; recipientList: string[] }) {
    const token = await getAdminToken();
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-provider-recruitment-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipients: opts.recipientList.map((e) => ({ email: e })),
        targetStates: selectedStates,
        subject: subject.trim() || DEFAULT_SUBJECT,
        customMessage: customMessage.trim() || undefined,
        sendTest: opts.sendTest,
        joinUrl,
      }),
    });
    return res.json().catch(() => ({ ok: false, error: "Invalid response" })) as Promise<{
      ok: boolean; error?: string; sentCount?: number; failedCount?: number; results?: SendResult[];
    }>;
  }

  const validate = (): string | null => {
    if (validEmails.length === 0) return "Add at least one recipient email.";
    if (invalidEmails.length > 0) return `Fix invalid email(s): ${invalidEmails.slice(0, 3).join(", ")}`;
    return null;
  };

  const handleSendTest = async () => {
    setMsg(null); setResults(null);
    const v = validate();
    if (v) { setMsg({ kind: "err", text: v }); return; }
    setTesting(true);
    try {
      const data = await callSend({ sendTest: true, recipientList: [validEmails[0]] });
      if (data.ok) { setMsg({ kind: "ok", text: `Test email sent to ${validEmails[0]}.` }); setResults(data.results ?? null); }
      else setMsg({ kind: "err", text: `Test failed: ${data.error ?? "unknown error"}` });
      await loadLog();
    } catch (err) { setMsg({ kind: "err", text: `Test failed: ${err instanceof Error ? err.message : "network error"}` }); }
    setTesting(false);
  };

  const handleSendOutreach = async () => {
    setShowConfirm(false); setMsg(null); setResults(null);
    const v = validate();
    if (v) { setMsg({ kind: "err", text: v }); return; }
    setSending(true);
    try {
      const data = await callSend({ sendTest: false, recipientList: validEmails });
      if (data.ok) setMsg({ kind: "ok", text: `Outreach sent: ${data.sentCount ?? 0} delivered${data.failedCount ? `, ${data.failedCount} failed` : ""}.` });
      else setMsg({ kind: "err", text: `Send failed: ${data.error ?? "unknown error"}` });
      setResults(data.results ?? null);
      await loadLog();
    } catch (err) { setMsg({ kind: "err", text: `Send failed: ${err instanceof Error ? err.message : "network error"}` }); }
    setSending(false);
  };

  const toggleState = (s: string) =>
    setSelectedStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const busy = sending || testing;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-extrabold text-gray-900">Provider Recruitment</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Email potential licensed mental health providers in states you&rsquo;re expanding into. Branded, logged, admin-only.
          The email template is editable in <span className="font-semibold">Communications → Templates → Provider Recruitment</span>.
        </p>
      </div>

      {!canSend && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <i className="ri-lock-2-line text-amber-600 mt-0.5"></i>
          <p className="text-xs text-amber-800">Sending is restricted to Owner / Admin Manager. You can review the outreach log below.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Compose ── */}
        {canSend && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          {/* States */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Target State(s) <span className="text-gray-400 font-normal">— optional context only</span>
            </label>
            {selectedStates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedStates.map((s) => (
                  <button key={s} type="button" onClick={() => toggleState(s)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#3b6ea5] text-white cursor-pointer hover:bg-[#2d5a8e]">
                    {s}<i className="ri-close-line"></i>
                  </button>
                ))}
              </div>
            )}
            <input
              type="text" value={stateQuery} onChange={(e) => setStateQuery(e.target.value)}
              placeholder="Search states (e.g. Texas, North Carolina)…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] mb-2"
            />
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1">
              {filteredStates.map((s) => {
                const active = selectedStates.includes(s);
                return (
                  <label key={s} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={active} onChange={() => toggleState(s)} className="w-3.5 h-3.5 rounded border-gray-300 cursor-pointer" />
                    <span className="text-xs text-gray-700">{s}</span>
                  </label>
                );
              })}
              {filteredStates.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No match.</p>}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Recipient Emails <span className="text-gray-400 font-normal">(one per line or comma-separated)</span>
            </label>
            <textarea value={emailsRaw} onChange={(e) => setEmailsRaw(e.target.value)} rows={4}
              placeholder={"provider1@example.com\nprovider2@example.com"}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none font-mono" />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-400">{validEmails.length} valid recipient{validEmails.length !== 1 ? "s" : ""}</p>
              {invalidEmails.length > 0 && <p className="text-xs text-red-500">{invalidEmails.length} invalid</p>}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
          </div>

          {/* Per-send message override */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Email Message <span className="text-gray-400 font-normal">(optional — replaces the standard message for this send)</span>
            </label>
            <textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value.slice(0, MAX_CUSTOM_MESSAGE))} rows={7}
              placeholder="Write the complete message you want these providers to receive. Leave blank to use the saved standard message."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none" />
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-xs text-gray-400">Plain text only. Branding, greeting, CTA and signature remain consistent.</p>
              <p className="text-xs text-gray-400">{customMessage.length}/{MAX_CUSTOM_MESSAGE}</p>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <i className="ri-links-line"></i>CTA links to <span className="font-mono">{joinUrl}</span>
          </p>

          {msg && (
            <p className={`text-xs flex items-center gap-1 font-semibold ${msg.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              <i className={msg.kind === "ok" ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>{msg.text}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleSendTest}
              disabled={busy || validEmails.length === 0}
              title="Send a single [TEST] email to the first recipient"
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 border border-[#3b6ea5] text-[#3b6ea5] hover:bg-[#e8f0f9] rounded-lg text-sm font-bold cursor-pointer transition-colors disabled:opacity-50">
              {testing ? <><i className="ri-loader-4-line animate-spin"></i>Sending test…</> : <><i className="ri-mail-check-line"></i>Send Test</>}
            </button>
            <button type="button"
              onClick={() => { setMsg(null); const v = validate(); if (v) { setMsg({ kind: "err", text: v }); return; } setShowConfirm(true); }}
              disabled={busy || validEmails.length === 0}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white hover:bg-[#2d5a8e] rounded-lg text-sm font-bold cursor-pointer transition-colors disabled:opacity-50">
              {sending ? <><i className="ri-loader-4-line animate-spin"></i>Sending…</> : <><i className="ri-send-plane-fill"></i>Send Outreach</>}
            </button>
          </div>
        </div>
        )}

        {/* ── Preview (rendered from the editable template) ── */}
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${!canSend ? "lg:col-span-2" : ""}`}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
            <i className="ri-eye-line"></i>Email Preview
          </p>
          <iframe title="Recruitment email preview" srcDoc={previewHtml}
            className="w-full rounded-lg border border-gray-200 bg-white" style={{ height: 520 }} />
          <p className="text-[11px] text-gray-400 mt-2">
            {customMessage.trim() ? "Preview reflects your complete per-send message." : "Preview reflects the saved standard message (or the safe built-in fallback)."}
          </p>
        </div>
      </div>

      {/* ── Results ── */}
      {results && results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Send Results</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-semibold">Recipient</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2 font-semibold">Detail</th>
              </tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.email} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-mono text-xs text-gray-700">{r.email}</td>
                    <td className="py-2 pr-3"><span className={`inline-flex items-center gap-1 text-xs font-bold ${r.ok ? "text-emerald-600" : "text-red-600"}`}><i className={r.ok ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"}></i>{r.ok ? "Sent" : "Failed"}</span></td>
                    <td className="py-2 text-xs text-gray-500">{r.ok ? (r.messageId ?? "") : (r.error ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent outreach log ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Outreach Log</p>
          <button type="button" onClick={() => void loadLog()} className="text-xs text-[#3b6ea5] font-semibold hover:underline cursor-pointer flex items-center gap-1"><i className="ri-refresh-line"></i>Refresh</button>
        </div>
        {logLoading ? (
          <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
        ) : log.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No outreach sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-semibold">Recipient</th><th className="py-2 pr-3 font-semibold">States</th>
                <th className="py-2 pr-3 font-semibold">Status</th><th className="py-2 pr-3 font-semibold">Sent By</th><th className="py-2 font-semibold">When</th>
              </tr></thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-mono text-xs text-gray-700">
                      {r.recipient_email}
                      {r.is_test && <span className="ml-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">TEST</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600">{(r.target_states ?? []).join(", ")}</td>
                    <td className="py-2 pr-3"><span className={`inline-flex items-center gap-1 text-xs font-bold ${r.status === "sent" ? "text-emerald-600" : "text-red-600"}`}><i className={r.status === "sent" ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"}></i>{r.status}</span></td>
                    <td className="py-2 pr-3 text-xs text-gray-600">{r.sent_by_name ?? "—"}</td>
                    <td className="py-2 text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0"><i className="ri-send-plane-fill text-[#3b6ea5] text-lg"></i></div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Send provider recruitment email?</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This will email <strong>{validEmails.length}</strong> recipient{validEmails.length !== 1 ? "s" : ""}. State context: <strong>{statesSentence(selectedStates)}</strong>. Recipients cannot see each other.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSendOutreach}
                className="whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors">
                <i className="ri-send-plane-fill"></i>Yes, Send to {validEmails.length}
              </button>
              <button type="button" onClick={() => setShowConfirm(false)}
                className="whitespace-nowrap flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
