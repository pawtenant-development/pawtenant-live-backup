// AISupportAssistant — Phase 1 (rules scaffold). ADMIN-ONLY, DRAFT-ONLY.
//
// Shows AI-style suggested SMS replies + call-support summaries inside the per-order
// Communications tab. Generates suggestions ON DEMAND from a pure rules engine
// (src/lib/aiSupportSuggestions.ts). It NEVER sends anything and NEVER writes to the DB.
// "Use as draft" simply drops text into the existing SMS composer for the admin to review.
import { useMemo, useState } from "react";
import {
  buildSmsSuggestion,
  buildCallSummary,
  type SmsSuggestion,
  type CallSummary,
  type CallRowLite,
  type Urgency,
} from "../../../lib/aiSupportSuggestions";
import { getAdminToken } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

// Structured response from the ai-suggest-sms-reply edge function (OpenAI path).
interface OpenAiSuggestion {
  reply: string;
  intent: string;
  confidence: number;
  safe_to_send: boolean;
  needs_admin_review: boolean;
  reason: string;
  blocked_reason: string | null;
  suggested_internal_note: string;
  source: "guardrail" | "openai" | "fallback";
}

// Loose shape of the unified comm rows passed from CommunicationTab.
interface CommLogLite {
  rawType: string;
  direction?: string | null;
  body?: string | null;
  sentAt: string;
  success?: boolean;
  duration?: number | null;
}

interface Props {
  commLogs: CommLogLite[];
  firstName: string;
  state?: string | null;
  letterType?: string | null;
  price?: number | null;
  orderId?: string | null;
  confirmationId?: string | null;
  status?: string | null;
  /** Drops the given text into the SMS composer (admin still reviews + sends). */
  onUseDraft: (text: string) => void;
}

const URGENCY_STYLE: Record<Urgency, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

function clip(s: string | null | undefined, n = 160): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function AISupportAssistant({
  commLogs,
  firstName,
  state,
  letterType,
  price,
  orderId,
  confirmationId,
  status,
  onUseDraft,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sms, setSms] = useState<SmsSuggestion | null>(null);
  const [call, setCall] = useState<CallSummary | null>(null);
  const [usedNote, setUsedNote] = useState<string>("");
  const [openai, setOpenai] = useState<OpenAiSuggestion | null>(null);
  const [openaiLoading, setOpenaiLoading] = useState(false);
  const [openaiError, setOpenaiError] = useState<string>("");

  const ctx = useMemo(() => ({ firstName, state, letterType, price }), [firstName, state, letterType, price]);

  // Call the server-side edge function (OpenAI key stays on the server).
  // Local guardrails + budget + safety are enforced inside the function.
  const generateWithOpenAI = async () => {
    setOpenaiLoading(true);
    setOpenaiError("");
    setOpenai(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-suggest-sms-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: orderId ?? null,
          confirmationId: confirmationId ?? null,
          inboundText: lastInbound,
          context: { firstName, state, letterType, status: status ?? null },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.suggestion) {
        setOpenaiError(data?.error || `Request failed (HTTP ${res.status}).`);
        return;
      }
      setOpenai(data.suggestion as OpenAiSuggestion);
    } catch (_e) {
      setOpenaiError("Could not reach the AI service.");
    } finally {
      setOpenaiLoading(false);
    }
  };

  // Latest inbound SMS body (most recent first).
  const lastInbound = useMemo(() => {
    for (let i = commLogs.length - 1; i >= 0; i--) {
      if (commLogs[i].rawType === "sms_inbound") return commLogs[i].body || "";
    }
    return "";
  }, [commLogs]);

  // Call rows → metadata-only shape for the summary engine.
  const callRows: CallRowLite[] = useMemo(
    () =>
      commLogs
        .filter((r) => r.rawType === "call_inbound" || r.rawType === "call_outbound")
        .map((r) => {
          const inbound = r.rawType === "call_inbound";
          const dur = r.duration || 0;
          // No explicit call status in the unified log — approximate from duration/success.
          const status = r.success === false ? "failed" : inbound && dur === 0 ? "missed" : "answered";
          return { direction: inbound ? "inbound" : "outbound", status, durationSeconds: dur, note: r.body, at: r.sentAt };
        }),
    [commLogs],
  );

  const hasCalls = callRows.length > 0;

  const handleUse = (text: string, what: string) => {
    if (!text) return;
    onUseDraft(text);
    setUsedNote(`${what} added to the composer below — review before sending.`);
    window.setTimeout(() => setUsedNote(""), 4000);
  };

  const copy = (text: string) => {
    if (text && navigator?.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="border-t border-b border-violet-100 bg-violet-50/40">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-violet-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold text-violet-700 uppercase tracking-wider">
          <i className="ri-sparkling-2-line text-sm"></i>
          AI Support Assistant
          <span className="normal-case font-semibold text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
            Draft only · Admin must review
          </span>
        </span>
        <i className={`ri-arrow-down-s-line text-violet-500 transition-transform ${open ? "rotate-180" : ""}`}></i>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-3">
          {usedNote && (
            <p className="text-[11px] font-semibold text-violet-700 flex items-center gap-1">
              <i className="ri-arrow-down-circle-line"></i>
              {usedNote}
            </p>
          )}

          {/* ── Suggested SMS Reply ─────────────────────────────────────── */}
          <div className="rounded-xl border border-violet-100 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                <i className="ri-message-2-line text-violet-500"></i>Suggested SMS Reply
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSms(buildSmsSuggestion(lastInbound, ctx))}
                  title="Deterministic rules-based draft (no AI cost)"
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 cursor-pointer flex items-center gap-1"
                >
                  <i className="ri-magic-line"></i>
                  {sms ? "Regenerate rules" : "Generate (rules)"}
                </button>
                <button
                  type="button"
                  onClick={generateWithOpenAI}
                  disabled={openaiLoading}
                  title="OpenAI-generated draft (server-side, draft only)"
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <i className={openaiLoading ? "ri-loader-4-line animate-spin" : "ri-sparkling-2-line"}></i>
                  {openaiLoading ? "Generating…" : openai ? "Regenerate (OpenAI)" : "Generate with OpenAI"}
                </button>
              </div>
            </div>

            {lastInbound ? (
              <p className="text-[11px] text-gray-400 mb-2 italic">
                Latest inbound: “{clip(lastInbound)}”
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mb-2 italic">
                No inbound SMS yet — will draft a warm general reply.
              </p>
            )}

            {sms && (
              <div className="space-y-2">
                {/* Compliance warning — shown for SMS opt-out / STOP */}
                {sms.warning && (
                  <div className="rounded-lg bg-red-50 border border-red-300 p-2.5 text-[12px] text-red-800 flex items-start gap-1.5">
                    <i className="ri-forbid-2-line text-red-600 mt-0.5"></i>
                    <span className="font-semibold">{sms.warning}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sms.sendable ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-red-100 text-red-700 border-red-300"}`}>
                    {sms.intentLabel}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${URGENCY_STYLE[sms.urgency]}`}>
                    {sms.urgency.toUpperCase()} urgency
                  </span>
                  {sms.escalate && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 flex items-center gap-1">
                      <i className="ri-alarm-warning-line"></i>Needs admin review
                    </span>
                  )}
                </div>

                {/* For opt-out the text is an ADMIN NOTE (not a sendable reply). */}
                {!sms.sendable && (
                  <span className="block text-[10px] font-bold text-red-600 uppercase tracking-wide">Admin note — not sendable</span>
                )}
                <div className={`rounded-lg p-2.5 text-[13px] text-gray-800 whitespace-pre-wrap border ${sms.sendable ? "bg-violet-50 border-violet-100" : "bg-red-50/60 border-red-200"}`}>
                  {sms.draft}
                </div>

                <p className="text-[10px] text-gray-400 leading-snug">
                  <i className="ri-information-line"></i> {sms.rationale}
                </p>

                {sms.sendable ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUse(sms.draft, "Suggested reply")}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#3b6ea5] text-white hover:bg-[#2d5a8e] cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-arrow-down-line"></i>Use as draft
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(sms.draft)}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-400 cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-file-copy-line"></i>Copy
                    </button>
                  </div>
                ) : (
                  // Opt-out: NO "Use as draft". Recommended actions + copy-note only.
                  <div className="space-y-1.5">
                    <ul className="text-[11px] text-gray-600 list-disc pl-4 space-y-0.5">
                      <li>Verify SMS opt-out status in GHL / the phone system.</li>
                      <li>If follow-up is needed, use email or an internal note — not SMS.</li>
                      <li>Do not manually override the SMS opt-out.</li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => copy(sms.draft)}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-400 cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-file-copy-line"></i>Copy admin note
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── OpenAI draft (server-side, draft only) ─────────────────── */}
            {openaiError && (
              <p className="mt-2 text-[11px] font-semibold text-red-600 flex items-center gap-1">
                <i className="ri-error-warning-line"></i>{openaiError}
              </p>
            )}
            {openai && (
              <div className="mt-3 pt-3 border-t border-dashed border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                    <i className="ri-sparkling-2-line"></i>
                    OpenAI draft
                    <span className="ml-1 normal-case font-semibold text-emerald-600/80">· Draft only · Admin must review</span>
                  </span>
                  <span className="text-[10px] text-gray-400">{Math.round((openai.confidence || 0) * 100)}% confidence</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    {openai.intent}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${openai.safe_to_send ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-300"}`}>
                    {openai.safe_to_send ? "safe to send" : "NOT safe to send"}
                  </span>
                  {openai.needs_admin_review && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 flex items-center gap-1">
                      <i className="ri-alarm-warning-line"></i>Needs admin review
                    </span>
                  )}
                  {openai.blocked_reason && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {openai.blocked_reason}
                    </span>
                  )}
                </div>

                {openai.reply ? (
                  <div className={`rounded-lg p-2.5 text-[13px] text-gray-800 whitespace-pre-wrap border ${openai.safe_to_send ? "bg-emerald-50/60 border-emerald-100" : "bg-red-50/50 border-red-200"}`}>
                    {openai.reply}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-500 italic">No sendable reply generated — admin handling required.</p>
                )}

                {openai.reason && (
                  <p className="text-[10px] text-gray-400 leading-snug"><i className="ri-information-line"></i> {openai.reason}</p>
                )}
                {openai.suggested_internal_note && (
                  <p className="text-[10px] text-gray-500 leading-snug"><span className="font-bold">Internal note:</span> {openai.suggested_internal_note}</p>
                )}

                <div className="flex items-center gap-2">
                  {/* "Use as draft" only when the model output is explicitly safe to send. */}
                  {openai.safe_to_send && openai.reply ? (
                    <button
                      type="button"
                      onClick={() => handleUse(openai.reply, "OpenAI reply")}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#3b6ea5] text-white hover:bg-[#2d5a8e] cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-arrow-down-line"></i>Use as draft
                    </button>
                  ) : (
                    <span className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                      <i className="ri-lock-line"></i>"Use as draft" disabled — not safe to send
                    </span>
                  )}
                  {(openai.reply || openai.suggested_internal_note) && (
                    <button
                      type="button"
                      onClick={() => copy(openai.reply || openai.suggested_internal_note)}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-400 cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-file-copy-line"></i>Copy
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Call Support ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-violet-100 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                <i className="ri-phone-line text-violet-500"></i>Call Support Summary
              </span>
              {hasCalls && (
                <button
                  type="button"
                  onClick={() => setCall(buildCallSummary(callRows, ctx))}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 cursor-pointer flex items-center gap-1"
                >
                  <i className="ri-magic-line"></i>
                  {call ? "Regenerate" : "Summarize calls"}
                </button>
              )}
            </div>

            {!hasCalls ? (
              <p className="text-[11px] text-gray-400 italic">No calls on this order yet.</p>
            ) : (
              call && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${URGENCY_STYLE[call.urgency]}`}>
                      {call.urgency.toUpperCase()} urgency
                    </span>
                    {call.escalate && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300 flex items-center gap-1">
                        <i className="ri-alarm-warning-line"></i>Needs admin review
                      </span>
                    )}
                  </div>

                  <dl className="text-[12px] text-gray-700 space-y-1.5">
                    <div>
                      <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Summary</dt>
                      <dd>{call.summary}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Customer intent</dt>
                      <dd>{call.intent}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Recommended action</dt>
                      <dd>{call.recommendedAction}</dd>
                    </div>
                  </dl>

                  {call.followUpSms && (
                    <>
                      <div className="rounded-lg bg-violet-50 border border-violet-100 p-2.5 text-[13px] text-gray-800 whitespace-pre-wrap">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Suggested follow-up SMS</span>
                        {call.followUpSms}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUse(call.followUpSms, "Follow-up SMS")}
                          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#3b6ea5] text-white hover:bg-[#2d5a8e] cursor-pointer flex items-center gap-1"
                        >
                          <i className="ri-arrow-down-line"></i>Use as draft
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(call.followUpSms)}
                          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-400 cursor-pointer flex items-center gap-1"
                        >
                          <i className="ri-file-copy-line"></i>Copy
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            )}
          </div>

          <p className="text-[10px] text-gray-400 text-center leading-snug">
            <i className="ri-shield-check-line"></i> Suggestions are generated locally and are not sent or saved. Nothing leaves this screen until you send it through the normal flow.
          </p>
        </div>
      )}
    </div>
  );
}
