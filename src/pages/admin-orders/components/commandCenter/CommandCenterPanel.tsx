/**
 * CommandCenterPanel — Unified Communications Command Center v2.
 *
 * One no-tab-switching workspace: unified queue (left) + in-place
 * conversation timeline (center) + customer/order/AI context (right).
 * An admin no longer jumps between Chats and AI Support to understand a
 * single conversation.
 *
 * Additive & safe:
 *   - Read-only over existing tables under existing RLS; the ONLY write is
 *     a human chat reply via post_agent_chat_message — the SAME proven RPC
 *     the Chats tab uses for agent replies. No AI auto-reply is broadened,
 *     no safety gate is touched, no SMS/email is sent from here.
 *   - Old tabs (Chats, AI Support, SMS/Calls, Emails, Email Hub) remain
 *     mounted and reachable; this replaces only the "inbox" sub-tab.
 *   - Admin-only markers never reach visitors — the visitor widget reads
 *     the public chat thread RPC and never touches ai_support_* tables.
 *
 * Approved visual direction: navy/slate + emerald + coral, neutral channel
 * chips, color = state/urgency. Typography inherits the admin app's stack.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, getAdminUserToken } from "../../../../lib/supabaseClient";
import { useAdminChat } from "../../../../context/AdminChatContext";
import { getAdminIdentity } from "../../../../lib/adminIdentity";
import { useCurrentAdminRole } from "../../../../hooks/useCurrentAdminRole";
import { isAdminLevel } from "../../../../lib/adminPermissions";
import { useAiSupportPendingCount } from "../../../../hooks/useAiSupportPendingCount";
import { getNotificationPermission } from "../../../../lib/desktopNotify";
import { getSoundPrefs } from "../../../../lib/soundPrefs";
import { useChatAiDecisions } from "../../../../hooks/useChatAiDecisions";
import {
  categoryLabel,
  humanizeGateReason,
  humanizeGuardrailCode,
  type AiAgentMessageTag,
  type AiChatDecision,
} from "../../../../lib/aiSupportPresentation";
import {
  useCommsQueue,
  FILTERS,
  CHANNEL_CHIP,
  type CommRow,
  type FilterKey,
  type QueueChip,
} from "./useCommsQueue";
import BlacklistManager from "./BlacklistManager";

const PAW20_COPY = "You can use code PAW20 for $20 off your order.";

// Canonical links the AI may share, by intent (display-only reference).
const LINK_BY_INTENT: Record<string, { label: string; url: string }> = {
  eligibility_general: { label: "ESA apply", url: "https://pawtenant.com/assessment" },
  psd_general: { label: "PSD apply", url: "https://pawtenant.com/psd-assessment" },
  landlord_verification: { label: "Landlord verification", url: "https://pawtenant.com/how-to-verify-esa-letter" },
  pricing: { label: "Pricing info", url: "https://pawtenant.com/esa-letter-cost" },
};

function fmtRelative(ts: string | null): string {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function Chip({ chip }: { chip: QueueChip }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`} title={chip.title}>
      {chip.icon && <i className={`${chip.icon} text-[11px] leading-none`} />}
      {chip.label}
    </span>
  );
}

export default function CommandCenterPanel() {
  const { rows, counts, loading, refresh } = useCommsQueue();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"queue" | "thread">("queue");
  const [showBlacklist, setShowBlacklist] = useState(false);

  const visible = useMemo(() => rows.filter((r) => r.facets.has(filter)), [rows, filter]);
  const selected = useMemo(
    () => rows.find((r) => r.key === selectedKey) ?? null,
    [rows, selectedKey],
  );

  // Auto-select the first row on desktop once data lands.
  useEffect(() => {
    if (!selectedKey && visible.length > 0 && typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSelectedKey(visible[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  const onSelect = useCallback((key: string) => {
    setSelectedKey(key);
    setMobileView("thread");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <HeaderStrip onRefresh={refresh} onToggleBlacklist={() => setShowBlacklist((v) => !v)} blacklistOpen={showBlacklist} />
      {showBlacklist && <BlacklistManager onChanged={refresh} />}
      {/* Desktop: 3-pane grid. Mobile: single pane toggled queue↔thread. */}
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:gap-3">
        {/* LEFT — queue */}
        <div className={`${mobileView === "thread" ? "hidden lg:flex" : "flex"} flex-col bg-white rounded-xl border border-slate-200 overflow-hidden min-h-0`}>
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const n = counts.get(f.key) ?? 0;
              const active = filter === f.key;
              if (f.key !== "all" && n === 0 && !active) return null;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    active ? "bg-[#1E293B] border-[#1E293B] text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {f.label}
                  <span className={`ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] ${active ? "bg-white/25" : "bg-slate-100 text-slate-600"}`}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[calc(100vh-260px)]">
            {loading ? (
              <p className="text-sm text-slate-400 py-10 text-center">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-slate-400 py-10 text-center">Queue is clear for this filter.</p>
            ) : (
              visible.map((r) => (
                <QueueRow key={r.key} row={r} active={r.key === selectedKey} onSelect={() => onSelect(r.key)} />
              ))
            )}
          </div>
        </div>

        {/* CENTER — conversation / timeline */}
        <div className={`${mobileView === "queue" ? "hidden lg:flex" : "flex"} flex-col bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[420px] mt-3 lg:mt-0`}>
          {selected ? (
            <ConversationPane row={selected} onBack={() => setMobileView("queue")} onChanged={refresh} />
          ) : (
            <EmptyCenter />
          )}
        </div>

        {/* RIGHT — context + AI panel */}
        <div className={`${mobileView === "queue" ? "hidden lg:block" : "block"} bg-white rounded-xl border border-slate-200 overflow-hidden mt-3 lg:mt-0`}>
          {selected ? <ContextPane row={selected} /> : (
            <div className="p-6 text-center text-sm text-slate-400">Select a conversation to see customer &amp; AI context.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Header strip: title + notification status + actionable count ──────────────
function HeaderStrip({ onRefresh, onToggleBlacklist, blacklistOpen }: { onRefresh: () => void; onToggleBlacklist: () => void; blacklistOpen: boolean }) {
  const { count } = useAiSupportPendingCount();
  const [perm, setPerm] = useState(() => getNotificationPermission());
  const [enabled, setEnabled] = useState(() => getSoundPrefs().desktopNotificationsEnabled);
  useEffect(() => {
    const t = window.setInterval(() => {
      setPerm(getNotificationPermission());
      setEnabled(getSoundPrefs().desktopNotificationsEnabled);
    }, 4000);
    return () => window.clearInterval(t);
  }, []);
  const notifState = perm === "denied" ? { label: "Notifications blocked", cls: "bg-orange-100 text-orange-700", icon: "ri-notification-off-line" }
    : enabled && perm === "granted" ? { label: "Notifications on", cls: "bg-emerald-100 text-emerald-700", icon: "ri-notification-3-line" }
    : { label: "Notifications off", cls: "bg-slate-100 text-slate-600", icon: "ri-notification-off-line" };
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest">Communications</p>
        <h2 className="text-base font-bold text-[#0F172A]">Command Center</h2>
        <p className="text-xs text-slate-500 mt-0.5">Every channel, one workspace — the queue, the conversation, and the customer side by side.</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200" title="Actionable AI Support items needing review">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            {count} needs review
          </span>
        )}
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${notifState.cls}`} title="Manage &amp; test browser notifications from the top-bar bell / profile menu">
          <i className={notifState.icon} />
          {notifState.label}
        </span>
        <button type="button" onClick={onToggleBlacklist} aria-pressed={blacklistOpen}
          className={`text-xs px-3 py-1.5 rounded-md border ${blacklistOpen ? "bg-[#1E293B] border-[#1E293B] text-white" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"}`}>
          <i className="ri-forbid-line mr-1" />Blacklist manager
        </button>
        <button type="button" onClick={onRefresh} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
          <i className="ri-refresh-line mr-1" />Refresh
        </button>
      </div>
    </div>
  );
}

// ── Queue row ────────────────────────────────────────────────────────────────
function QueueRow({ row, active, onSelect }: { row: CommRow; active: boolean; onSelect: () => void }) {
  const urgent = row.facets.has("legal") || row.facets.has("escalated");
  const ch = CHANNEL_CHIP[row.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 flex flex-col gap-1.5 transition-colors ${
        active ? "bg-[#EEF2F7] shadow-[inset_3px_0_0_#1E293B]" : urgent ? "bg-orange-50/50 hover:bg-orange-50" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-[#0F172A] truncate">{row.who}</p>
        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap tabular-nums">{fmtRelative(row.when)}</span>
      </div>
      {row.preview && (
        <p className="text-xs text-slate-600 line-clamp-1 break-words" style={{ overflowWrap: "anywhere" }}>{row.preview}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ch.cls}`}>
          <i className={`${ch.icon} text-[11px] leading-none`} />{ch.label}
        </span>
        {row.chips.map((c, i) => <Chip key={i} chip={c} />)}
      </div>
      <p className="text-[11px] text-slate-500 truncate">
        <span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px] mr-1">Next:</span>{row.next}
      </p>
    </button>
  );
}

function EmptyCenter() {
  return (
    <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
        <i className="ri-inbox-2-line text-slate-300 text-xl" />
      </div>
      <p className="text-sm font-semibold text-slate-500">Select a conversation</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">Pick a row from the queue to see its full timeline and AI decisions here — without leaving this screen.</p>
    </div>
  );
}

// ── Conversation pane (routes by channel) ─────────────────────────────────────
function ConversationPane({ row, onBack, onChanged }: { row: CommRow; onBack: () => void; onChanged: () => void }) {
  const ch = CHANNEL_CHIP[row.kind];
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <button type="button" onClick={onBack} className="lg:hidden text-slate-500 mr-1" aria-label="Back to queue"><i className="ri-arrow-left-line text-lg" /></button>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ch.cls}`}><i className={ch.icon} />{ch.label}</span>
        <span className="text-sm font-bold text-[#0F172A] truncate">{row.who}</span>
        {(row.facets.has("legal") || row.aiConversationStatus === "escalated") && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-600 text-white"><i className="ri-alarm-warning-line" />Escalated</span>
        )}
      </div>
      {row.kind === "chat" && row.chatSession ? (
        <ChatTimeline row={row} onChanged={onChanged} />
      ) : row.kind === "sms" && row.aiConversationId ? (
        <SmsTimeline row={row} onChanged={onChanged} />
      ) : (
        <SummaryTimeline row={row} />
      )}
    </div>
  );
}

// ── Chat timeline (inline, with human reply via post_agent_chat_message) ──────
interface ChatMsg { id: string; sender: string | null; message: string; created_at: string; }

function ChatTimeline({ row, onChanged }: { row: CommRow; onChanged: () => void }) {
  const session = row.chatSession!;
  const ctx = useAdminChat();
  const currentRole = useCurrentAdminRole();
  const decisions = useChatAiDecisions(session.id);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async (sid: string, background = false) => {
    if (!background) setLoading(true);
    try {
      const { data } = await supabase
        .from("chats")
        .select("id, sender, message, created_at")
        .eq("session_id", sid)
        .order("created_at", { ascending: true })
        .limit(500);
      if (!mountedRef.current) return;
      setMessages((data as ChatMsg[]) ?? []);
    } catch { /* silent */ }
    finally { if (mountedRef.current && !background) setLoading(false); }
  }, []);

  useEffect(() => {
    setReply(""); setErr(null);
    void load(session.id);
    // Mark the session read on open — same convention as the Chats tab.
    try {
      ctx.markSeen(session.id);
      void supabase.rpc("mark_chat_session_read", { p_session_id: session.id });
    } catch { /* non-fatal */ }
    const t = window.setInterval(() => { void load(session.id, true); decisions.refresh(); }, 6000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Reply permission — mirrors the Chats tab's post_agent_chat_message guard.
  const isAdmin = isAdminLevel(currentRole.role);
  const resolvedOrClosed = session.status === "resolved" || session.status === "closed";
  const assignedToMe = !!currentRole.user_id && session.assigned_admin_id === currentRole.user_id;
  const unassigned = !session.assigned_admin_id;
  const canReply = isAdmin || (!resolvedOrClosed && (unassigned || assignedToMe));

  const send = useCallback(async () => {
    const text = reply.trim();
    if (!text || sending || !canReply) return;
    setSending(true); setErr(null);
    try {
      const { error } = await supabase.rpc("post_agent_chat_message", { p_session_id: session.id, p_message: text });
      if (error) throw error;
      // Auto-assign on first reply (non-forcing) — same as the Chats tab.
      try {
        if (!session.assigned_admin_id) {
          const admin = await getAdminIdentity();
          if (admin.id) {
            await supabase.rpc("assign_chat_session", {
              p_session_id: session.id, p_admin_id: admin.id,
              p_admin_email: admin.email ?? "", p_admin_name: admin.name ?? "", p_force: false,
            });
          }
        }
      } catch { /* assignment is metadata; reply already succeeded */ }
      if (!mountedRef.current) return;
      setReply("");
      await load(session.id, true);
      onChanged();
    } catch (e) {
      if (mountedRef.current) setErr((e as Error)?.message ?? "Failed to send");
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [reply, sending, canReply, session.id, session.assigned_admin_id, load, onChanged]);

  const useDraft = useCallback(() => {
    if (row.aiReplyBody) setReply(row.aiReplyBody);
  }, [row.aiReplyBody]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#F8FAFC] max-h-[calc(100vh-380px)] min-h-[240px]">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              aiDecision={decisions.byVisitorMessageId[m.id]}
              aiTag={decisions.byAgentMessageId[m.id]}
            />
          ))
        )}
      </div>
      {/* Reply composer — human reply, same safe RPC the Chats tab uses. */}
      <div className="border-t border-slate-100 bg-white p-3">
        {row.aiReplyBody && row.aiAction === "drafted" && (
          <button type="button" onClick={useDraft} className="mb-2 w-full text-left text-xs bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-emerald-800 hover:bg-emerald-100">
            <span className="font-semibold">Use AI draft:</span> {row.aiReplyBody}
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={2}
            maxLength={4000}
            readOnly={!canReply}
            placeholder={canReply ? "Reply to the visitor…" : "This chat is assigned to another agent."}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#059669]"
          />
          <button type="button" disabled={!canReply || !reply.trim() || sending} onClick={() => void send()}
            className="inline-flex items-center gap-1.5 bg-[#059669] text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-[#047857] disabled:opacity-50">
            <i className={sending ? "ri-loader-4-line animate-spin" : "ri-send-plane-2-line"} />{sending ? "Sending" : "Send"}
          </button>
        </div>
        {err && <p className="text-[11px] text-orange-600 mt-1.5">{err}</p>}
        {!canReply && !err && <p className="text-[11px] text-slate-400 mt-1.5">Read-only — assigned to another agent.</p>}
      </div>
    </>
  );
}

function ChatBubble({ message, aiDecision, aiTag }: { message: ChatMsg; aiDecision?: AiChatDecision; aiTag?: AiAgentMessageTag }) {
  const sender = (message.sender ?? "visitor").toLowerCase();
  if (sender === "system") {
    return <div className="flex justify-center"><span className="text-[11px] text-slate-400 bg-white border border-slate-100 rounded-full px-3 py-1">{message.message}</span></div>;
  }
  const isVisitor = sender === "visitor";
  return (
    <div className={`flex ${isVisitor ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] ${isVisitor ? "" : "items-end"} flex flex-col`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isVisitor ? "bg-white text-slate-800 border border-slate-200" : "bg-[#1E293B] text-white"
        } ${!isVisitor && aiTag ? "ring-2 ring-emerald-400/60" : ""}`} style={{ overflowWrap: "anywhere" }}>
          {message.message}
        </div>
        <p className={`mt-1 text-[10px] text-slate-400 ${isVisitor ? "text-left" : "text-right"}`}>
          {sender === "agent" ? "Agent" : sender === "visitor" ? "Visitor" : sender} · {fmtTime(message.created_at)}
        </p>
        {!isVisitor && aiTag && (
          <p className="mt-0.5 text-right">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
              title={aiTag.kind === "auto" ? "AI sent this automatically (admin-only marker)" : "AI-drafted, reviewed and sent by a team member (admin-only)"}>
              <i className="ri-robot-2-line text-[11px]" />
              {aiTag.kind === "auto" ? "AI auto-reply" : "AI draft · approved"}
              {aiTag.intent ? ` · ${categoryLabel(aiTag.intent)}` : ""}
              {typeof aiTag.confidence === "number" ? ` · ${Math.round(aiTag.confidence * 100)}%` : ""}
            </span>
          </p>
        )}
        {isVisitor && aiDecision && <ChatDecisionMarker decision={aiDecision} />}
      </div>
    </div>
  );
}

function ChatDecisionMarker({ decision }: { decision: AiChatDecision }) {
  const gate = humanizeGateReason(decision.gateReason);
  const guard = humanizeGuardrailCode(decision.guardrailCode);
  const mode = decision.responseMode;
  let head: { label: string; cls: string; icon: string };
  let reason: string | null = null;
  if (decision.noReplyReason === "blacklisted") {
    head = { label: "Blacklisted — no AI reply", cls: "bg-gray-800 text-white border-gray-800", icon: "ri-forbid-line" };
  } else if (decision.noReplyReason === "global_disabled") {
    head = { label: "Global AI disabled — no AI reply", cls: "bg-gray-100 text-gray-600 border-gray-300", icon: "ri-robot-2-line" };
  } else if (mode === "crisis") {
    head = { label: "AI sent crisis-safe guidance", cls: "bg-red-50 text-red-700 border-red-200", icon: "ri-alarm-warning-line" }; reason = guard ?? gate;
  } else if (mode === "fraud_refusal") {
    head = { label: "AI safely refused", cls: "bg-slate-900 text-white border-slate-900", icon: "ri-shield-cross-line" }; reason = guard;
  } else if (mode === "clarifying") {
    head = { label: "AI asked a clarifying question", cls: "bg-sky-50 text-sky-700 border-sky-200", icon: "ri-question-answer-line" };
  } else if (decision.action === "escalated") {
    head = { label: decision.replySent ? "AI escalated · safe reply sent" : "AI escalated", cls: "bg-orange-50 text-orange-700 border-orange-200", icon: "ri-alarm-warning-line" }; reason = guard ?? gate;
  } else if (decision.action === "blocked") {
    head = { label: decision.replySent ? "AI blocked · refused safely" : "AI blocked", cls: "bg-slate-900 text-white border-slate-900", icon: "ri-shield-cross-line" }; reason = guard ?? gate;
  } else if (decision.action === "error") {
    head = { label: "AI send failed", cls: "bg-orange-50 text-orange-700 border-orange-200", icon: "ri-error-warning-line" }; reason = gate;
  } else if (decision.action === "auto_sent") {
    head = { label: "AI auto-replied", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "ri-robot-2-line" };
  } else {
    head = { label: "AI drafted — not sent", cls: "bg-slate-800 text-white border-slate-800", icon: "ri-draft-line" }; reason = gate;
  }
  return (
    <div className="mt-1 flex items-center flex-wrap gap-1" title={decision.decisionReason ?? undefined}>
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${head.cls}`}><i className={`${head.icon} text-[11px]`} />{head.label}</span>
      {decision.intent && <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{categoryLabel(decision.intent)}</span>}
      {typeof decision.confidence === "number" && <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">conf {Math.round(decision.confidence * 100)}%</span>}
      {reason && decision.action !== "auto_sent" && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200"><i className="ri-information-line text-[11px]" />{reason}</span>
      )}
    </div>
  );
}

// ── SMS timeline (read-only inline; send stays in AI Support this pass) ───────
interface SmsMsg { id: string; direction: string; body: string; source: string | null; sent_at: string | null; created_at: string; metadata: Record<string, unknown> | null; }
interface SmsEvent { id: string; message_id: string | null; intent: string | null; action: string; confidence: number | null; guardrail_code: string | null; reply_body: string | null; created_at: string; metadata: Record<string, unknown> | null; }

function SmsTimeline({ row, onChanged }: { row: CommRow; onChanged: () => void }) {
  const convoId = row.aiConversationId!;
  const [messages, setMessages] = useState<SmsMsg[]>([]);
  const [events, setEvents] = useState<SmsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const loadThread = useCallback(async () => {
    try {
      const [msgRes, evtRes] = await Promise.all([
        supabase.from("ai_support_messages").select("id, direction, body, source, sent_at, created_at, metadata")
          .eq("conversation_id", convoId).order("created_at", { ascending: true }).limit(200),
        supabase.from("ai_support_ai_events").select("id, message_id, intent, action, confidence, guardrail_code, reply_body, created_at, metadata")
          .eq("conversation_id", convoId).order("created_at", { ascending: true }).limit(200),
      ]);
      if (!mountedRef.current) return;
      setMessages((msgRes.data as SmsMsg[]) ?? []);
      setEvents((evtRes.data as SmsEvent[]) ?? []);
    } catch { /* silent */ }
  }, [convoId]);

  useEffect(() => {
    setLoading(true);
    void loadThread().finally(() => { if (mountedRef.current) setLoading(false); });
  }, [loadThread]);

  // Latest AI draft/reply body for this conversation (most recent event).
  const latestDraft = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].reply_body) return events[i].reply_body as string;
    }
    return row.aiReplyBody ?? "";
  }, [events, row.aiReplyBody]);

  const eventByMsg = useMemo(() => {
    const m = new Map<string, SmsEvent>();
    for (const e of events) if (e.message_id && !m.has(e.message_id)) m.set(e.message_id, e);
    return m;
  }, [events]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#F8FAFC] max-h-[calc(100vh-360px)] min-h-[240px]">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No messages.</p>
        ) : (
          messages.map((m) => {
            if (m.direction === "internal") return null;
            const inbound = m.direction === "inbound";
            const evt = inbound ? eventByMsg.get(m.id) : undefined;
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[80%] flex flex-col">
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${inbound ? "bg-white text-slate-800 border border-slate-200" : "bg-[#1E293B] text-white"}`} style={{ overflowWrap: "anywhere" }}>{m.body}</div>
                    <p className={`mt-1 text-[10px] text-slate-400 ${inbound ? "text-left" : "text-right"}`}>
                      {m.source === "ai" ? "AI" : m.source === "human" ? "Team" : inbound ? "Customer" : "Outbound"} · {fmtTime(m.sent_at ?? m.created_at)}
                    </p>
                  </div>
                </div>
                {evt && <SmsDecisionCard evt={evt} />}
              </div>
            );
          })
        )}
      </div>
      <SmsActionPanel row={row} latestDraft={latestDraft} onChanged={() => { void loadThread(); onChanged(); }} />
    </>
  );
}

// ── SMS admin action panel — approve / edit / send / pause / resume / handled ──
// Sends go through the secure ai-send-support-reply function (admin JWT, logs
// the outbound + audit + conversation state). STOP/opt-out and confirmed GHL
// DND blocks are enforced server-side and can never be overridden here.
function SmsActionPanel({ row, latestDraft, onChanged }: { row: CommRow; latestDraft: string; onChanged: () => void }) {
  const { role } = useCurrentAdminRole();
  const canManage = isAdminLevel(role ?? null);
  const convoId = row.aiConversationId!;
  const mode = row.aiConversationMode ?? null;
  const paused = mode === "paused" || mode === "disabled" || mode === "human_only";

  const [text, setText] = useState<string>(latestDraft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "send" | "rehearse" | "pause" | "resume" | "handled">(null);
  const [gate, setGate] = useState<null | { status: string; code: string; detail: string; overridable?: boolean }>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  // Keep the box in sync with the latest AI draft until the admin edits it.
  useEffect(() => { if (!dirty) setText(latestDraft); }, [latestDraft, dirty]);

  const invokeSend = useCallback(async (opts: { dryRun: boolean; acknowledgeRisk?: boolean; acknowledgeBlacklist?: boolean }) => {
    const body = text.trim();
    if (!body || !canManage) return;
    setBusy(opts.dryRun ? "rehearse" : "send"); setMsg(null);
    try {
      const token = await getAdminUserToken();
      if (!token) { setMsg({ kind: "err", text: "No admin session — sign in again." }); return; }
      const { data, error } = await supabase.functions.invoke("ai-send-support-reply", {
        body: {
          conversationId: convoId,
          message: body,
          approvedDraft: body === (latestDraft ?? "").trim(),
          dryRun: opts.dryRun,
          acknowledgeRisk: opts.acknowledgeRisk ?? false,
          acknowledgeBlacklist: opts.acknowledgeBlacklist ?? false,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = (data ?? {}) as Record<string, unknown>;
      if (error || res.ok === false) {
        const g = res.gate as typeof gate;
        if (g) setGate(g);
        setMsg({ kind: "err", text: String((res.error as string) ?? error?.message ?? "Send failed") });
        return;
      }
      const g = res.gate as typeof gate;
      setGate(g ?? null);
      if (opts.dryRun) {
        setMsg({ kind: "info", text: g && g.status !== "clear" ? `Rehearsal — blocked: ${g.detail}` : "Rehearsal OK — gates clear. Nothing was sent." });
      } else if (res.sent) {
        setMsg({ kind: "ok", text: "SMS sent. Conversation marked human-replied." });
        setDirty(false);
        onChanged();
      } else {
        setMsg({ kind: "err", text: String((res.send_error as string) ?? "Not sent.") });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Send failed" });
    } finally { setBusy(null); }
  }, [text, canManage, convoId, latestDraft, onChanged]);

  // Direct conversation-state writes (admin RLS) + audit event.
  const convoAction = useCallback(async (action: "pause" | "resume" | "handled") => {
    if (!canManage) return;
    setBusy(action); setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> =
        action === "pause"
          ? { ai_enabled: false, ai_mode: "paused", ai_paused_at: nowIso, ai_paused_reason: "admin_paused" }
          : action === "resume"
          ? { ai_enabled: true, ai_mode: "draft_only", ai_paused_at: null, ai_paused_reason: null }
          : { status: "human_replied", human_owner_id: uid };
      const { error } = await supabase.from("ai_support_conversations").update(patch).eq("id", convoId);
      if (error) { setMsg({ kind: "err", text: `Could not update — ${error.message}` }); return; }
      await supabase.from("ai_support_ai_events").insert({
        conversation_id: convoId,
        intent: null,
        risk_level: "low",
        action: action === "handled" ? "human_handled" : action === "pause" ? "ai_paused" : "ai_resumed",
        actor_user_id: uid,
        metadata: { admin_action: action, source: "command_center" },
      });
      setMsg({ kind: "ok", text: action === "pause" ? "AI paused for this number." : action === "resume" ? "AI resumed (draft-only)." : "Marked handled." });
      onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Action failed" });
    } finally { setBusy(null); }
  }, [canManage, convoId, onChanged]);

  const hardBlocked = gate?.status === "block" && !gate?.overridable;
  const needsAck = gate?.status === "needs_ack";

  return (
    <div className="border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest">SMS controls</p>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${paused ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
          <i className={paused ? "ri-pause-circle-line" : "ri-robot-2-line"} />
          {paused ? `AI ${mode}` : "AI active"}
        </span>
      </div>

      <label className="text-[11px] text-slate-500 font-semibold">Reply (edit the AI draft, then approve &amp; send)</label>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        rows={3}
        maxLength={640}
        readOnly={!canManage}
        placeholder={latestDraft ? undefined : "No AI draft yet — type a reply."}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#059669]"
      />

      {gate && gate.status !== "clear" && (
        <div className={`text-[11px] rounded-md px-2.5 py-2 border ${hardBlocked ? "bg-red-50 border-red-200 text-red-700" : "bg-orange-50 border-orange-200 text-orange-700"}`}>
          <i className={`${hardBlocked ? "ri-shield-cross-line" : "ri-error-warning-line"} mr-1`} />{gate.detail}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={!canManage || !!busy || !text.trim() || hardBlocked}
          onClick={() => void invokeSend({ dryRun: false })}
          className="inline-flex items-center gap-1.5 bg-[#059669] text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#047857] disabled:opacity-50">
          <i className={busy === "send" ? "ri-loader-4-line animate-spin" : "ri-send-plane-2-line"} />
          {busy === "send" ? "Sending" : "Approve & Send"}
        </button>
        <button type="button" disabled={!canManage || !!busy || !text.trim()}
          onClick={() => void invokeSend({ dryRun: true })}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          <i className={busy === "rehearse" ? "ri-loader-4-line animate-spin" : "ri-test-tube-line"} />
          Rehearse (dry run)
        </button>
        {needsAck && (
          <button type="button" disabled={!!busy}
            onClick={() => void invokeSend({ dryRun: false, acknowledgeRisk: gate?.code === "dnd_unverifiable", acknowledgeBlacklist: gate?.code === "blacklisted" })}
            className="inline-flex items-center gap-1.5 bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50">
            <i className="ri-alert-line" />Send anyway
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-2.5">
        {paused ? (
          <button type="button" disabled={!canManage || !!busy} onClick={() => void convoAction("resume")}
            className="text-xs px-3 py-1.5 rounded-md border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 disabled:opacity-50">
            <i className="ri-play-circle-line mr-1" />{busy === "resume" ? "Resuming…" : "Resume AI"}
          </button>
        ) : (
          <button type="button" disabled={!canManage || !!busy} onClick={() => void convoAction("pause")}
            className="text-xs px-3 py-1.5 rounded-md border border-violet-200 bg-white hover:bg-violet-50 text-violet-700 disabled:opacity-50">
            <i className="ri-pause-circle-line mr-1" />{busy === "pause" ? "Pausing…" : "Pause AI for this number"}
          </button>
        )}
        <button type="button" disabled={!canManage || !!busy} onClick={() => void convoAction("handled")}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50">
          <i className="ri-check-double-line mr-1" />{busy === "handled" ? "Saving…" : "Mark handled"}
        </button>
      </div>

      {msg && (
        <p className={`text-[11px] ${msg.kind === "ok" ? "text-emerald-700" : msg.kind === "err" ? "text-red-600" : "text-slate-500"}`}>{msg.text}</p>
      )}
      <p className="text-[10.5px] text-slate-400">
        <i className="ri-shield-check-line mr-1" />STOP / opt-out and confirmed DND blocks are enforced at send and can’t be overridden. Blacklist &amp; number pause are in the context panel →.
      </p>
      {!canManage && <p className="text-[10.5px] text-slate-400">Owner / Admin roles only.</p>}
    </div>
  );
}

function SmsDecisionCard({ evt }: { evt: SmsEvent }) {
  const meta = (evt.metadata ?? {}) as Record<string, unknown>;
  const reason = typeof meta.decision_reason === "string" ? meta.decision_reason : null;
  const guard = humanizeGuardrailCode(evt.guardrail_code);
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    auto_sent: { label: "AI auto-sent", cls: "border-l-emerald-500 bg-emerald-50/40", icon: "ri-robot-2-line" },
    drafted: { label: "AI drafted — not sent", cls: "border-l-slate-700 bg-slate-50", icon: "ri-draft-line" },
    escalated: { label: "AI escalated", cls: "border-l-orange-500 bg-orange-50", icon: "ri-alarm-warning-line" },
    blocked: { label: "AI blocked", cls: "border-l-slate-900 bg-slate-100", icon: "ri-shield-cross-line" },
    error: { label: "AI send failed", cls: "border-l-orange-500 bg-orange-50", icon: "ri-error-warning-line" },
  };
  const head = map[evt.action] ?? { label: categoryLabel(evt.action), cls: "border-l-slate-300 bg-slate-50", icon: "ri-information-line" };
  return (
    <div className={`self-stretch border border-slate-200 border-l-[3px] rounded-lg px-3 py-2 ${head.cls}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700"><i className={head.icon} />{head.label}</span>
        {evt.intent && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200">{categoryLabel(evt.intent)}</span>}
        {guard && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">{guard}</span>}
        {typeof evt.confidence === "number" && <span className="text-[10px] text-slate-400">conf {Math.round(evt.confidence * 100)}%</span>}
      </div>
      {reason && <p className="text-[11px] text-slate-500 mt-1">{reason}</p>}
    </div>
  );
}

// ── Summary timeline (call / email / order) ───────────────────────────────────
function SummaryTimeline({ row }: { row: CommRow }) {
  const navigate = useNavigate();
  const location = useLocation();
  const goSub = (sub: string) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", "communications"); params.set("sub", sub);
    navigate(`/admin-orders?${params.toString()}`);
  };
  const cfg = row.kind === "call"
    ? { icon: "ri-phone-line", title: "Call", body: "Inbound call event. Call transcripts/recordings and full call history live in the SMS / Calls tab.", action: () => goSub("sms"), actionLabel: "Open SMS / Calls" }
    : row.kind === "email"
    ? { icon: "ri-mail-line", title: "Email", body: "New contact-form message awaiting a reply. Open the Emails tab to read the full message and respond.", action: () => goSub("emails"), actionLabel: "Open Emails" }
    : { icon: "ri-shopping-bag-3-line", title: "Order", body: "Recently paid order. Full order detail, payment, provider assignment, and timeline live on the Orders tab.", action: () => navigate("/admin-orders?tab=orders"), actionLabel: "Open Orders" };
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8FAFC]">
      <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-3"><i className={`${cfg.icon} text-slate-400 text-xl`} /></div>
      <p className="text-sm font-bold text-[#0F172A]">{cfg.title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">{cfg.body}</p>
      <p className="text-xs text-slate-600 mt-3 bg-white border border-slate-200 rounded-lg px-3 py-2 max-w-sm">{row.preview}</p>
      <p className="text-[11px] text-slate-500 mt-3"><span className="font-semibold uppercase tracking-wide text-[10px] mr-1">Next:</span>{row.next}</p>
      <button type="button" onClick={cfg.action} className="mt-4 text-xs font-bold px-4 py-2 rounded-md bg-[#1E293B] text-white hover:bg-[#0F172A]">{cfg.actionLabel}</button>
    </div>
  );
}

// ── Right context + AI panel ──────────────────────────────────────────────────
function ContextPane({ row }: { row: CommRow }) {
  const navigate = useNavigate();
  const location = useLocation();
  const goSub = (sub: string) => {
    const params = new URLSearchParams(location.search);
    params.set("tab", "communications"); params.set("sub", sub);
    navigate(`/admin-orders?${params.toString()}`);
  };
  const c = row.context;
  const link = row.aiIntent ? LINK_BY_INTENT[row.aiIntent] : undefined;
  const aiStatusLabel = row.aiAction ? ({
    auto_sent: "Auto-sent", drafted: "Drafted (not sent)", escalated: "Escalated", blocked: "Blocked", error: "Send failed",
  } as Record<string, string>)[row.aiAction] ?? categoryLabel(row.aiAction) : null;

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-220px)]">
      <section>
        <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Customer</p>
        <dl className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2 text-[12.5px]">
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Name</dt><dd className="font-semibold text-slate-700 break-words">{c.name}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Email</dt><dd className="font-semibold text-slate-700 break-words">{c.email ?? "—"}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Phone</dt><dd className="font-semibold text-slate-700 tabular-nums">{c.phone ?? "—"}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">State</dt><dd className="font-semibold text-slate-700">{c.state ?? "—"}</dd>
          {c.source && (<><dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Source</dt><dd className="font-semibold text-slate-700 capitalize">{c.source}</dd></>)}
        </dl>
      </section>

      <section className="border-t border-slate-100 pt-3">
        <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Order</p>
        <dl className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2 text-[12.5px]">
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Order ID</dt><dd className="font-semibold text-slate-700 tabular-nums">{c.orderId ?? "No order linked"}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Product</dt><dd className="font-semibold text-slate-700">{c.product ?? "—"}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Payment</dt><dd className="font-semibold text-slate-700">{c.paymentStatus ?? "—"}</dd>
          <dt className="text-slate-400 text-[11px] font-semibold pt-0.5">Provider</dt><dd className="font-semibold text-slate-700">{c.provider ?? "—"}</dd>
        </dl>
      </section>

      {c.tags.length > 0 && (
        <section className="border-t border-slate-100 pt-3">
          <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Tags &amp; risk</p>
          <div className="flex gap-1.5 flex-wrap">{c.tags.map((t, i) => <Chip key={i} chip={t} />)}</div>
        </section>
      )}

      {/* AI action panel */}
      {(row.aiAction || row.aiIntent) && (
        <section className="border-t border-slate-100 pt-3">
          <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">AI decision</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {aiStatusLabel && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">{aiStatusLabel}</span>}
              {row.aiIntent && <span className="text-[11px] text-slate-500">{categoryLabel(row.aiIntent)}</span>}
              {typeof row.aiConfidence === "number" && <span className="text-[11px] text-slate-400">conf {Math.round(row.aiConfidence * 100)}%</span>}
            </div>
            {row.aiReason && <p className="text-[11px] text-slate-500">{row.aiReason}</p>}
            <p className="text-[11px] text-slate-700"><span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px] mr-1">Next:</span>{row.next}</p>
            {row.aiReplyBody && (
              <div className="text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2 whitespace-pre-wrap break-words">{row.aiReplyBody}</div>
            )}
          </div>
        </section>
      )}

      {/* PAW20 discount state */}
      {(row.priceObjection || row.discountOffered) && (
        <section className="border-t border-slate-100 pt-3">
          <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Discount</p>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {row.priceObjection && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300"><i className="ri-price-tag-3-line" />Price Objection</span>}
            {row.discountOffered && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white"><i className="ri-coupon-3-line" />Discount Offered</span>}
          </div>
          {row.discountOffered && <p className="text-[12px] text-slate-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-2">“{PAW20_COPY}”</p>}
          <p className="text-[10.5px] text-slate-400 mt-1.5">One code only · once per conversation · never on an existing paid order / payment issue.</p>
        </section>
      )}

      {/* Suggested canonical link */}
      {link && (
        <section className="border-t border-slate-100 pt-3">
          <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Suggested link</p>
          <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#059669] hover:underline break-all">
            <i className="ri-link" />{link.label}: {link.url}
          </a>
        </section>
      )}

      {/* AI eligibility + blacklist controls (chat sessions & SMS numbers) */}
      {(row.kind === "chat" && row.externalSessionId) && (
        <BlacklistControls kind="chat" id={row.externalSessionId} conversationMode={row.aiConversationMode ?? null} />
      )}
      {(row.kind === "sms" && row.smsPhone) && (
        <BlacklistControls kind="sms" id={row.smsPhone} conversationMode={row.aiConversationMode ?? null} />
      )}

      {/* Quick actions — navigation escape hatches to the full detail tabs */}
      <section className="border-t border-slate-100 pt-3">
        <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">Quick actions</p>
        <div className="flex gap-1.5 flex-wrap">
          {row.kind === "chat" && <button type="button" onClick={() => goSub("chats")} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">Open in Chats</button>}
          {(row.kind === "chat" || row.kind === "sms") && <button type="button" onClick={() => goSub("ai")} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">Open in AI Support</button>}
          {row.kind === "sms" && <button type="button" onClick={() => goSub("sms")} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">SMS / Calls</button>}
          {row.orderId && <button type="button" onClick={() => navigate("/admin-orders?tab=orders")} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">Open order</button>}
        </div>
      </section>
    </div>
  );
}

// ── Blacklist + AI eligibility controls (chat session / SMS number) ───────────
// Blacklist-first model: everyone is eligible by default; blacklisting silences
// the AI for one session/number. Admin-only; never customer-visible.
function BlacklistControls({ kind, id, conversationMode }: { kind: "chat" | "sms"; id: string; conversationMode: string | null }) {
  const { role } = useCurrentAdminRole();
  const canManage = isAdminLevel(role ?? null);
  const setKey = kind === "chat" ? "ai_chat_auto_reply_blacklisted_sessions" : "ai_sms_auto_reply_blacklisted_numbers";
  const [list, setList] = useState<string[] | null>(null);
  const [globalOn, setGlobalOn] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const norm = useCallback((v: string) => {
    if (kind !== "sms") return v;
    let p = (v || "").replace(/\D/g, "");
    if (p.length === 10) p = "1" + p;
    return p ? "+" + p : v;
  }, [kind]);
  const target = norm(id);

  const load = useCallback(async () => {
    try {
      const globalKey = kind === "chat" ? "ai_chat_auto_reply_enabled" : "ai_sms_auto_send_enabled";
      const { data } = await supabase.from("ai_support_settings").select("key, value").in("key", [setKey, globalKey]);
      const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
      const blRow = rows.find((r) => r.key === setKey);
      const gRow = rows.find((r) => r.key === globalKey);
      setList(Array.isArray(blRow?.value) ? (blRow!.value as unknown[]).map((x) => norm(String(x))) : []);
      setGlobalOn(gRow ? gRow.value === true : true);
    } catch { setList([]); }
  }, [kind, setKey, norm]);

  useEffect(() => { void load(); }, [load]);

  const isBlacklisted = list?.includes(target) ?? false;
  const humanOwned = conversationMode === "human_only" || conversationMode === "paused" || conversationMode === "disabled";
  const eligible = globalOn && !isBlacklisted && !(kind === "chat" && humanOwned);
  const reason = !globalOn ? (kind === "chat" ? "Chat AI globally off" : "SMS auto-reply off")
    : isBlacklisted ? "Blacklisted"
    : (kind === "chat" && humanOwned) ? "A human owns this conversation"
    : null;

  const toggle = useCallback(async () => {
    if (!canManage || busy || list === null) return;
    setBusy(true); setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data: row } = await supabase.from("ai_support_settings").select("value").eq("key", setKey).maybeSingle();
      const current = Array.isArray(row?.value) ? (row!.value as unknown[]).map((x) => norm(String(x))) : [];
      const next = isBlacklisted ? current.filter((x) => x !== target) : [...new Set([...current, target])];
      const { error } = await supabase.from("ai_support_settings")
        .upsert({ key: setKey, value: next, updated_by: auth?.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) { setMsg(`Could not update — ${error.message}`); return; }
      setList(next);
      setMsg(isBlacklisted ? "Removed from blacklist — AI can reply again." : "Blacklisted — AI will not reply here.");
    } catch (e) {
      setMsg(`Failed — ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusy(false); }
  }, [canManage, busy, list, isBlacklisted, target, setKey, norm]);

  return (
    <section className="border-t border-slate-100 pt-3">
      <p className="text-[10px] text-[#059669] font-bold uppercase tracking-widest mb-2">AI eligibility</p>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${eligible ? "bg-emerald-100 text-emerald-700" : "bg-gray-800 text-white"}`}>
          <i className={eligible ? "ri-robot-2-line" : "ri-forbid-line"} />
          AI eligible: {eligible ? "Yes" : "No"}
        </span>
        {reason && <span className="text-[11px] text-slate-500">{reason}</span>}
      </div>
      {list === null ? (
        <p className="text-[11px] text-slate-400">Loading…</p>
      ) : (
        <button type="button" disabled={!canManage || busy} onClick={() => void toggle()}
          className={`text-xs px-3 py-1.5 rounded-md border disabled:opacity-50 ${isBlacklisted ? "border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700" : "border-red-200 bg-white hover:bg-red-50 text-red-600"}`}>
          <i className={`${isBlacklisted ? "ri-check-line" : "ri-forbid-line"} mr-1`} />
          {busy ? "Updating…" : isBlacklisted ? (kind === "chat" ? "Remove chat session from blacklist" : "Remove number from blacklist") : (kind === "chat" ? "Blacklist this chat session" : "Blacklist this SMS number")}
        </button>
      )}
      {!canManage && <p className="text-[10.5px] text-slate-400 mt-1">Owner / Admin roles only.</p>}
      {kind === "sms" && <p className="text-[10.5px] text-slate-400 mt-1">DND / STOP / human takeover still apply at send time.</p>}
      {msg && <p className="text-[11px] text-slate-600 mt-1.5">{msg}</p>}
    </section>
  );
}
