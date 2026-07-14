/**
 * AiSupportCenterPanel — Admin → Communications → AI Support.
 *
 * Monitor + control surface for the AI Support Automation system (TEST-first):
 *   - Global control cards (kill switch, AI SMS, auto-send, calls, missed-call SMS)
 *   - Per-category behavior table (auto-send / draft / escalate / block)
 *   - Conversation list with AI status badges + detail drawer
 *   - Pause / Resume / Take Over / Approve Draft / Send Reply / Close
 *   - Notifications feed
 *   - Safe test harness (simulate inbound SMS / missed call — dryRun ALWAYS on here)
 *
 * Safety:
 *   - Settings writes are RLS-gated to owner/admin_manager (is_chat_admin());
 *     the UI also disables toggles for other roles.
 *   - Enabling auto-send or AI calls requires a typed confirmation modal.
 *   - The "Send Reply" path calls ai-send-support-reply, which defaults to
 *     dryRun unless the admin explicitly unchecks "Dry run".
 *
 * Self-contained: own fetches, no new props required by the hub.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, getAdminUserToken } from "../../../lib/supabaseClient";
import BlacklistManager from "./commandCenter/BlacklistManager";
import { useCurrentAdminRole } from "../../../hooks/useCurrentAdminRole";
import {
  AI_ACTIONABLE_NOTIFICATION_TYPES,
  notifyAiSupportNotificationsChanged,
} from "../../../hooks/useAiSupportPendingCount";
import { isAdminLevel } from "../../../lib/adminPermissions";
import {
  deriveConversationAiStatus,
  humanizeGateReason,
  humanizeGuardrailCode,
  nextActionForConversation,
} from "../../../lib/aiSupportPresentation";

// ── Types (mirror ai_support_* tables) ────────────────────────────────────────
interface SettingsMap {
  ai_global_kill_switch: boolean;
  ai_sms_enabled: boolean;
  ai_sms_auto_send_enabled: boolean;
  ai_sms_default_mode: string;
  ai_call_enabled: boolean;
  ai_missed_call_sms_enabled: boolean;
  ai_max_auto_replies_per_conversation_per_day: number;
  ai_confidence_threshold: number;
  ai_category_modes: Record<string, string>;
  ai_chat_auto_reply_enabled: boolean;
  ai_chat_reply_mode: string; // "off" | "draft" | "auto"
  ai_chat_auto_reply_test_sessions: string[];
  ai_chat_auto_reply_cooldown_seconds: number;
  ai_chat_max_auto_replies_per_session_per_day: number;
}

const DEFAULT_SETTINGS: SettingsMap = {
  ai_global_kill_switch: false,
  ai_sms_enabled: true,
  ai_sms_auto_send_enabled: false,
  ai_sms_default_mode: "draft_only",
  ai_call_enabled: false,
  ai_missed_call_sms_enabled: false,
  ai_max_auto_replies_per_conversation_per_day: 3,
  ai_confidence_threshold: 0.78,
  ai_category_modes: {},
  ai_chat_auto_reply_enabled: false,
  ai_chat_reply_mode: "draft",
  ai_chat_auto_reply_test_sessions: [],
  ai_chat_auto_reply_cooldown_seconds: 120,
  ai_chat_max_auto_replies_per_session_per_day: 3,
};

interface ConversationRow {
  id: string;
  channel: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  /** chat_sessions.id for channel=chat (live-chat shadow migration). */
  external_session_id?: string | null;
  order_id: string | null;
  status: string;
  ai_enabled: boolean;
  ai_mode: string;
  ai_paused_reason: string | null;
  human_owner_id: string | null;
  last_inbound_at: string | null;
  last_ai_reply_at: string | null;
  last_human_reply_at: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  direction: string;
  channel: string;
  body: string;
  source: string;
  sent_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface AiEventRow {
  id: string;
  intent: string | null;
  risk_level: string;
  action: string;
  confidence: number | null;
  guardrail_code: string | null;
  model: string | null;
  reply_body: string | null;
  error: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface NotificationRow {
  id: string;
  conversation_id: string | null;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Slim latest-AI-event row per conversation (list chips + next action). */
interface LastEventRow {
  conversation_id: string;
  action: string;
  intent: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function channelChip(channel: string): { label: string; cls: string; icon: string } {
  if (channel === "chat")
    return { label: "Live Chat", cls: "bg-indigo-100 text-indigo-700", icon: "ri-chat-3-line" };
  if (channel === "voice")
    return { label: "Call", cls: "bg-violet-100 text-violet-700", icon: "ri-phone-line" };
  if (channel === "email")
    return { label: "Email", cls: "bg-sky-100 text-sky-700", icon: "ri-mail-line" };
  return { label: "SMS", cls: "bg-teal-100 text-teal-700", icon: "ri-message-3-line" };
}

const CATEGORY_LIST = [
  "order_status", "letter_timing", "landlord_verification", "upload_documents",
  "pricing", "eligibility_general", "psd_general", "technical_issue",
  "provider_review", "refund", "complaint", "legal_eviction", "medical_crisis",
  "fraud", "unknown",
] as const;

/** High-risk categories the backend can never auto-send (mirror of policy.ts NEVER_AUTO_SEND). */
const LOCKED_CATEGORIES = new Set(["refund", "complaint", "legal_eviction", "medical_crisis", "fraud"]);

const MODE_OPTIONS = [
  { value: "auto_send_safe", label: "Auto-send" },
  { value: "draft_only", label: "Draft only" },
  { value: "escalate", label: "Escalate only" },
  { value: "block", label: "Block" },
];

function categoryLabel(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Badges ────────────────────────────────────────────────────────────────────
function AiStatusBadge({ convo }: { convo: ConversationRow }) {
  let label = "AI Active";
  let cls = "bg-emerald-100 text-emerald-700";
  if (convo.status === "closed") { label = "Closed"; cls = "bg-gray-100 text-gray-500"; }
  else if (convo.ai_mode === "human_only") { label = "Human Took Over"; cls = "bg-purple-100 text-purple-700"; }
  else if (convo.ai_mode === "paused" || !convo.ai_enabled) { label = "AI Paused"; cls = "bg-amber-100 text-amber-700"; }
  else if (convo.status === "escalated") { label = "Escalated"; cls = "bg-red-100 text-red-700"; }
  else if (convo.status === "human_replied") { label = "Human Replied"; cls = "bg-blue-100 text-blue-700"; }
  else if (convo.ai_mode === "auto_send_safe") { label = "AI Auto"; cls = "bg-emerald-100 text-emerald-700"; }
  else { label = "AI Draft Mode"; cls = "bg-cyan-100 text-cyan-700"; }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    auto_sent: "bg-emerald-100 text-emerald-700",
    drafted: "bg-cyan-100 text-cyan-700",
    escalated: "bg-red-100 text-red-700",
    blocked: "bg-gray-800 text-white",
    error: "bg-red-100 text-red-700",
    skipped: "bg-gray-100 text-gray-500",
    paused: "bg-amber-100 text-amber-700",
    resumed: "bg-emerald-100 text-emerald-700",
    human_takeover: "bg-purple-100 text-purple-700",
    closed: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${map[action] ?? "bg-gray-100 text-gray-600"}`}>
      {categoryLabel(action)}
    </span>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleCard({
  title, description, value, danger, disabled, onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  danger?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        aria-label={`${title}: ${value ? "on" : "off"}`}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          value ? (danger ? "bg-red-600" : "bg-emerald-600") : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// ── Presentational helpers for the grouped, safety-first control layout ─────────
// Pure display only — no state, no side effects. Every real control below is
// still wired to the existing settings handlers.
function SectionShell({
  icon, iconWrap, title, subtitle, status, children,
}: {
  icon: string;
  iconWrap?: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrap ?? "bg-gray-50 text-gray-500 border border-gray-100"}`}>
            <i className={`${icon} text-lg`} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
            {subtitle && <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {status}
      </div>
      {children}
    </div>
  );
}

/** Semantic status pill — safe(green) / draft(amber) / block(red) / info(indigo) / plan(muted). Never the action accent. */
function StatePill({ tone, children }: { tone: "safe" | "draft" | "block" | "info" | "plan"; children: ReactNode }) {
  const map = {
    safe: "bg-emerald-100 text-emerald-700",
    draft: "bg-amber-100 text-amber-700",
    block: "bg-red-100 text-red-700",
    info: "bg-indigo-100 text-indigo-700",
    plan: "bg-gray-100 text-gray-500",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${map[tone]}`}>
      {children}
    </span>
  );
}

function RuleRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <i className={`${icon} text-[#3b6ea5] text-base mt-0.5 shrink-0`} />
      <p className="text-xs text-gray-600 leading-relaxed">
        <b className="text-gray-800">{title}.</b> {desc}
      </p>
    </div>
  );
}

export default function AiSupportCenterPanel() {
  const { role: adminRole } = useCurrentAdminRole();
  const canManage = isAdminLevel(adminRole ?? null);

  const [settings, setSettings] = useState<SettingsMap>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  // conversation_id → its most recent AI event (list chips + next action).
  const [lastEventByConvo, setLastEventByConvo] = useState<Record<string, LastEventRow>>({});
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  // conversation_id → count of pending actionable notifications (list badges).
  const [pendingByConvo, setPendingByConvo] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Detail drawer
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [events, setEvents] = useState<AiEventRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyDryRun, setReplyDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  // Live chat "Approve & Send" — editable copy of the AI's current draft.
  const [approveChatText, setApproveChatText] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  // Live chat auto-reply session whitelist controls.
  const [whitelistBusy, setWhitelistBusy] = useState(false);

  // Confirmation modal for dangerous toggles
  const [confirmToggle, setConfirmToggle] = useState<null | { key: keyof SettingsMap; title: string }>(null);
  const [confirmChatAuto, setConfirmChatAuto] = useState(false);

  // Test harness
  const [simPhone, setSimPhone] = useState("+15550100999");
  const [simText, setSimText] = useState("Can my landlord verify my letter?");
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  }, []);

  // ── Loads ───────────────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from("ai_support_settings").select("key, value");
    if (data) {
      const next: SettingsMap = { ...DEFAULT_SETTINGS, ai_category_modes: { ...DEFAULT_SETTINGS.ai_category_modes } };
      for (const row of data) {
        if (row.key === "ai_category_modes" && row.value && typeof row.value === "object") {
          next.ai_category_modes = { ...next.ai_category_modes, ...(row.value as Record<string, string>) };
        } else if (row.key in next) {
          (next as unknown as Record<string, unknown>)[row.key] = row.value;
        }
      }
      setSettings(next);
    }
    setSettingsLoaded(true);
  }, []);

  const loadConversations = useCallback(async () => {
    let q = supabase
      .from("ai_support_conversations")
      .select("*")
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (statusFilter === "open") q = q.neq("status", "closed");
    else if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    const rows = (data as ConversationRow[]) ?? [];
    setConversations(rows);

    // Latest AI event per conversation — one batched query, newest first,
    // reduced to the first hit per conversation. Failure keeps the previous
    // map (chips are informational, the list must still render).
    try {
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: evts } = await supabase
          .from("ai_support_ai_events")
          .select("conversation_id, action, intent, created_at, metadata")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(500);
        // Only message-level decisions count as the "last AI action" —
        // state changes (paused/resumed/human_takeover/closed) are visible
        // via the conversation status badge instead.
        const DECISION_ACTIONS = new Set(["auto_sent", "drafted", "escalated", "blocked", "error"]);
        const map: Record<string, LastEventRow> = {};
        for (const e of (evts ?? []) as LastEventRow[]) {
          if (!DECISION_ACTIONS.has(e.action)) continue;
          if (!map[e.conversation_id]) map[e.conversation_id] = e;
        }
        setLastEventByConvo(map);
      } else {
        setLastEventByConvo({});
      }
    } catch {
      /* non-fatal */
    }
  }, [statusFilter]);

  const loadNotifications = useCallback(async () => {
    // Feed (latest 30, any status) + pending-actionable map for the
    // conversation list badges. Same table, one round-trip each.
    const [feed, pending] = await Promise.all([
      supabase
        .from("ai_support_notifications")
        .select("id, conversation_id, type, status, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("ai_support_notifications")
        .select("conversation_id")
        .eq("status", "pending")
        .in("type", [...AI_ACTIONABLE_NOTIFICATION_TYPES])
        .limit(1000),
    ]);
    setNotifications((feed.data as NotificationRow[]) ?? []);
    const map: Record<string, number> = {};
    for (const row of (pending.data as Array<{ conversation_id: string | null }>) ?? []) {
      if (row.conversation_id) map[row.conversation_id] = (map[row.conversation_id] ?? 0) + 1;
    }
    setPendingByConvo(map);
  }, []);

  // Opening a conversation counts as reviewing its pending AI notifications —
  // same convention as Chats clearing unread on open. Rows are NEVER deleted:
  // status flips pending → read with read_at / read_by kept for audit. Only
  // actionable types are touched (exactly what the badge counts).
  const markConversationReviewed = useCallback(async (conversationId: string) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ai_support_notifications")
        .update({
          status: "read",
          read_at: new Date().toISOString(),
          read_by: auth?.user?.id ?? null,
        })
        .eq("conversation_id", conversationId)
        .eq("status", "pending")
        .in("type", [...AI_ACTIONABLE_NOTIFICATION_TYPES]);
      if (!error) {
        setPendingByConvo((prev) => {
          if (!(conversationId in prev)) return prev;
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
        notifyAiSupportNotificationsChanged();
        void loadNotifications();
      }
    } catch {
      /* non-fatal — the badge self-corrects on the next poll */
    }
  }, [loadNotifications]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadSettings(), loadConversations(), loadNotifications()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadSettings, loadConversations, loadNotifications]);

  const openDetail = useCallback(async (convo: ConversationRow) => {
    setSelected(convo);
    setDetailLoading(true);
    setReplyText("");
    const [msgs, evts] = await Promise.all([
      supabase.from("ai_support_messages").select("id, direction, channel, body, source, sent_at, created_at, metadata")
        .eq("conversation_id", convo.id).order("created_at", { ascending: true }).limit(200),
      supabase.from("ai_support_ai_events").select("id, intent, risk_level, action, confidence, guardrail_code, model, reply_body, error, created_at, metadata")
        .eq("conversation_id", convo.id).order("created_at", { ascending: true }).limit(200),
    ]);
    setMessages((msgs.data as MessageRow[]) ?? []);
    setEvents((evts.data as AiEventRow[]) ?? []);
    setDetailLoading(false);
    void markConversationReviewed(convo.id);
  }, [markConversationReviewed]);

  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase.from("ai_support_conversations").select("*").eq("id", selected.id).maybeSingle();
    if (data) {
      setSelected(data as ConversationRow);
      await openDetail(data as ConversationRow);
    }
    await loadConversations();
  }, [selected, openDetail, loadConversations]);

  // ── Settings writes (RLS: owner/admin_manager only) ─────────────────────────
  const saveSetting = useCallback(async (key: string, value: unknown) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ai_support_settings")
      .upsert({ key, value, updated_by: auth?.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      flash("err", `Could not save "${key}" — ${error.message}. (Only Owner/Admin can change AI settings.)`);
    } else {
      flash("ok", `Saved ${categoryLabel(key)}.`);
    }
    await loadSettings();
  }, [flash, loadSettings]);

  // Chat rollout mode (off | draft | auto). "auto" is the only customer-visible
  // state, so it goes through a confirmation. The legacy boolean is kept in
  // sync (auto→true) for older readers.
  const saveChatMode = useCallback(async (mode: "off" | "draft" | "auto") => {
    await saveSetting("ai_chat_reply_mode", mode);
    await saveSetting("ai_chat_auto_reply_enabled", mode === "auto");
  }, [saveSetting]);

  const requestChatMode = useCallback((mode: "off" | "draft" | "auto") => {
    if (mode === "auto") { setConfirmChatAuto(true); return; }
    void saveChatMode(mode);
  }, [saveChatMode]);

  const requestToggle = useCallback((key: keyof SettingsMap, next: boolean, title: string, dangerousWhenOn: boolean) => {
    if (next && dangerousWhenOn) {
      setConfirmToggle({ key, title });
      return;
    }
    void saveSetting(key, next);
  }, [saveSetting]);

  // ── Conversation actions ─────────────────────────────────────────────────────
  const pauseAi = useCallback(async (takeOver: boolean) => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc("ai_support_pause_conversation", {
      p_conversation_id: selected.id,
      p_reason: takeOver ? "human_takeover" : "paused_from_dashboard",
      p_take_over: takeOver,
    });
    setBusy(false);
    if (error) flash("err", error.message);
    else flash("ok", takeOver ? "You took over — AI is stopped for this conversation." : "AI paused for this conversation.");
    await refreshDetail();
  }, [selected, flash, refreshDetail]);

  const resumeAi = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc("ai_support_resume_conversation", { p_conversation_id: selected.id });
    setBusy(false);
    if (error) flash("err", error.message);
    else flash("ok", "AI resumed (draft-only mode).");
    await refreshDetail();
  }, [selected, flash, refreshDetail]);

  const markClosed = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from("ai_support_conversations").update({ status: "closed" }).eq("id", selected.id);
    setBusy(false);
    if (error) flash("err", error.message);
    else flash("ok", "Conversation closed.");
    await refreshDetail();
  }, [selected, flash, refreshDetail]);

  const sendReply = useCallback(async (text: string, approvedDraft: boolean) => {
    if (!selected || !text.trim()) return;
    setBusy(true);
    try {
      const token = await getAdminUserToken();
      if (!token) { flash("err", "No admin session — sign in again."); return; }
      const { data, error } = await supabase.functions.invoke("ai-send-support-reply", {
        body: { conversationId: selected.id, message: text.trim(), approvedDraft, dryRun: replyDryRun },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) flash("err", String(error.message ?? error));
      else if (data?.ok) {
        flash("ok", replyDryRun
          ? "Dry run OK — nothing was sent (logged as internal rehearsal)."
          : data.sent ? "Reply sent." : `Send failed: ${data.send_error ?? "unknown"}`);
        setReplyText("");
      } else flash("err", String(data?.error ?? "Send failed"));
    } finally {
      setBusy(false);
      await refreshDetail();
    }
  }, [selected, replyDryRun, flash, refreshDetail]);

  // Latest AI draft that could be approved
  const latestDraft = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if ((e.action === "drafted" || e.action === "escalated") && e.reply_body) return e;
    }
    return null;
  }, [events]);

  // Live chat approve rules (Phase: human-approved sends only).
  // Approvable ONLY when the AI's MOST RECENT assessment is a plain draft —
  // if the latest event is blocked (fraud/crisis) or escalated, the current
  // visitor message is risky and this one-click path stays hidden; a human
  // handles it personally in Communications → Chats.
  const latestChatEvent = useMemo(
    () => (events.length ? events[events.length - 1] : null),
    [events],
  );
  const chatApprovable =
    selected?.channel === "chat" &&
    selected.status !== "closed" &&
    latestChatEvent?.action === "drafted" &&
    !!latestChatEvent.reply_body;

  // Prefill the editable approve box with the AI's current draft whenever the
  // drawer's event list changes (open/refresh).
  useEffect(() => {
    setApproveChatText(chatApprovable ? (latestChatEvent?.reply_body ?? "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestChatEvent?.id, chatApprovable]);

  // Defensive view of the test-session list: the jsonb value could hold a
  // non-array (manual SQL typo) and would otherwise crash the panel render.
  // Every consumer below MUST use this, never the raw setting.
  const chatTestSessions = useMemo<string[]>(
    () => (Array.isArray(settings.ai_chat_auto_reply_test_sessions)
      ? settings.ai_chat_auto_reply_test_sessions.map((s) => String(s))
      : []),
    [settings.ai_chat_auto_reply_test_sessions],
  );

  // Is the selected chat conversation's session on the auto-reply test list?
  const isSessionWhitelisted = useMemo(() => {
    if (!selected?.external_session_id) return false;
    return chatTestSessions.includes(selected.external_session_id);
  }, [selected?.external_session_id, chatTestSessions]);

  // Add/remove the selected chat session on ai_chat_auto_reply_test_sessions.
  // Read-modify-write against the FRESH DB value (never local state) so other
  // listed sessions are preserved; the write records updated_by/updated_at
  // (same pattern as saveSetting) and an internal timeline note gives a
  // per-conversation audit trail. RLS: settings writes are Owner/Admin only.
  const updateChatWhitelist = useCallback(async (mode: "add" | "remove") => {
    if (!selected || selected.channel !== "chat" || whitelistBusy) return;
    const sessionId = selected.external_session_id;
    if (!sessionId) return;
    setWhitelistBusy(true);
    try {
      // Resolve the actor FIRST so no extra round-trip sits between the list
      // read and the write (narrows the concurrent-edit window).
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;

      const { data: row, error: readErr } = await supabase
        .from("ai_support_settings")
        .select("value")
        .eq("key", "ai_chat_auto_reply_test_sessions")
        .maybeSingle();
      if (readErr) {
        flash("err", `Could not read the auto-reply test list — ${readErr.message}`);
        return;
      }
      const current = Array.isArray(row?.value) ? (row.value as unknown[]).map(String) : [];
      const next = mode === "add"
        ? [...new Set([...current, sessionId])]
        : current.filter((s) => s !== sessionId);

      const { error: writeErr } = await supabase
        .from("ai_support_settings")
        .upsert(
          { key: "ai_chat_auto_reply_test_sessions", value: next, updated_by: uid, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (writeErr) {
        flash("err", `Could not update the auto-reply test list — ${writeErr.message}. (Only Owner/Admin can change AI settings.)`);
        return;
      }

      // VERIFY the final state with a re-read: the whole-array write is
      // last-write-wins, so a concurrent admin edit (other tab/user) could
      // land between our read and write. The banner must report what is
      // actually true in the DB, never assume the write survived.
      const { data: verifyRow } = await supabase
        .from("ai_support_settings")
        .select("value")
        .eq("key", "ai_chat_auto_reply_test_sessions")
        .maybeSingle();
      const finalList = Array.isArray(verifyRow?.value) ? (verifyRow.value as unknown[]).map(String) : [];
      const finallyListed = finalList.includes(sessionId);
      const asIntended = mode === "add" ? finallyListed : !finallyListed;
      if (!asIntended) {
        flash("err", "The list changed while saving (another admin edited it at the same time). Please re-check and try again.");
        await loadSettings();
        await refreshDetail();
        return;
      }

      // Per-conversation audit note (internal — never visitor-visible). The
      // whitelist change above already committed, so an audit failure must be
      // surfaced, not swallowed.
      const { error: auditErr } = await supabase.from("ai_support_messages").insert({
        conversation_id: selected.id,
        direction: "internal",
        channel: "chat",
        source: "human",
        body: mode === "add"
          ? "Session ADDED to the chat auto-reply TEST list by an admin."
          : "Session REMOVED from the chat auto-reply TEST list by an admin.",
        sent_by: uid,
        metadata: {
          action: mode === "add" ? "chat_whitelist_add" : "chat_whitelist_remove",
          chat_session_id: sessionId,
        },
      });

      const okMsg = mode === "add"
        ? "This chat session can now receive AI auto-replies (TEST, safe categories only)."
        : "Session removed — this chat is back to draft-only shadow mode.";
      flash("ok", auditErr ? `${okMsg} (Warning: the audit note could not be recorded — ${auditErr.message})` : okMsg);
      await loadSettings();
      await refreshDetail();
    } catch (e) {
      // Defense in depth — supabase-js normally returns errors rather than
      // throwing, but an unexpected exception must not vanish silently.
      flash("err", `Whitelist update failed unexpectedly — ${e instanceof Error ? e.message : "unknown error"}. Re-open the conversation to see the current state.`);
    } finally {
      setWhitelistBusy(false);
    }
  }, [selected, whitelistBusy, flash, loadSettings, refreshDetail]);

  // Approve & Send to Chat — posts the reviewed draft into the REAL chat
  // thread via the same RPC the Chats tab uses for agent replies
  // (post_agent_chat_message: SECURITY DEFINER, admin/agent-gated, inserts a
  // sender='agent' row that the visitor widget and Chats tab both render).
  // Then mirrors the SMS approve convention into the AI Support audit trail.
  // Failure preserves the draft and shows the error — nothing is marked sent.
  const approveSendToChat = useCallback(async () => {
    if (!selected || selected.channel !== "chat") return;
    const text = approveChatText.trim();
    if (!text || approveBusy) return;
    const sessionId = selected.external_session_id;
    if (!sessionId) { flash("err", "This chat conversation has no linked chat session."); return; }
    setApproveBusy(true);
    try {
      const { data: chatId, error: rpcErr } = await supabase.rpc("post_agent_chat_message", {
        p_session_id: sessionId,
        p_message: text,
      });
      if (rpcErr) { flash("err", `Send failed: ${rpcErr.message}`); return; }

      // Audit (mirrors ai-send-support-reply's convention for SMS approvals).
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const nowIso = new Date().toISOString();
      const edited = text !== (latestChatEvent?.reply_body ?? "");
      await supabase.from("ai_support_messages").insert({
        conversation_id: selected.id,
        direction: "outbound",
        channel: "chat",
        body: text,
        source: "ai",
        sent_by: uid,
        sent_at: nowIso,
        provider_message_id: chatId ? `chat:${chatId}` : null,
        metadata: {
          source: "ai_support_human_approved",
          approved_by: uid,
          approved_at: nowIso,
          sent_to_chat: true,
          approved_event_id: latestChatEvent?.id ?? null,
          edited,
        },
      });
      await supabase.from("ai_support_ai_events").insert({
        conversation_id: selected.id,
        intent: latestChatEvent?.intent ?? null,
        risk_level: "low",
        action: "auto_sent",
        reply_body: text,
        actor_user_id: uid,
        metadata: {
          human_send: true,
          approved_draft: true,
          sent_to_chat: true,
          source: "ai_support_human_approved",
          chat_message_id: chatId ?? null,
          approved_event_id: latestChatEvent?.id ?? null,
          edited,
        },
      });
      await supabase
        .from("ai_support_conversations")
        .update({ last_human_reply_at: nowIso, status: "human_replied", human_owner_id: uid })
        .eq("id", selected.id);

      flash("ok", "Reply approved and sent to the visitor's live chat.");
      await refreshDetail();
    } finally {
      setApproveBusy(false);
    }
  }, [selected, approveChatText, approveBusy, latestChatEvent, flash, refreshDetail]);

  // ── Test harness ─────────────────────────────────────────────────────────────
  const simulate = useCallback(async (kind: "sms" | "missed_call") => {
    setSimBusy(true);
    setSimResult(null);
    try {
      const token = await getAdminUserToken();
      if (!token) { flash("err", "No admin session — sign in again."); return; }
      const fn = kind === "sms" ? "ai-handle-inbound-sms" : "ai-handle-missed-call";
      const body = kind === "sms"
        ? { fromPhone: simPhone, body: simText, dryRun: true }
        : { fromPhone: simPhone, dryRun: true };
      const { data, error } = await supabase.functions.invoke(fn, {
        body,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) flash("err", String(error.message ?? error));
      else setSimResult(data as Record<string, unknown>);
    } finally {
      setSimBusy(false);
      await Promise.all([loadConversations(), loadNotifications()]);
    }
  }, [simPhone, simText, flash, loadConversations, loadNotifications]);

  const aiFullyOff = settings.ai_global_kill_switch || !settings.ai_sms_enabled;
  // Effective chat mode (mirrors the legacy boolean for older readers).
  const chatModeEff: "off" | "draft" | "auto" =
    settings.ai_chat_reply_mode === "off" || settings.ai_chat_reply_mode === "auto"
      ? settings.ai_chat_reply_mode
      : settings.ai_chat_reply_mode === "draft"
      ? "draft"
      : settings.ai_chat_auto_reply_enabled ? "auto" : "off";
  const smsAutoOn = settings.ai_sms_auto_send_enabled;
  // "Nothing customer-facing sends automatically" is true only when every
  // auto-send path is off. Any auto path flips the banner to a warning state.
  const nothingAutoSends =
    !aiFullyOff && !smsAutoOn && chatModeEff !== "auto" && !settings.ai_missed_call_sms_enabled;
  const lastActivityIso = notifications[0]?.created_at ?? conversations[0]?.last_inbound_at ?? null;

  return (
    <div className="flex flex-col gap-5">
      {banner && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${banner.kind === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {banner.text}
        </div>
      )}

      {/* ── 1+2. AI Support overview + Safety status (global banner) ── */}
      <div className={`rounded-lg border px-5 py-4 ${
        aiFullyOff
          ? "border-gray-200 bg-gray-50"
          : nothingAutoSends
          ? "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white"
          : "border-amber-300 bg-gradient-to-b from-amber-50 to-white"
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white ${
              aiFullyOff ? "bg-gray-400" : nothingAutoSends ? "bg-emerald-600" : "bg-amber-500"
            }`}>
              <i className={`text-lg ${aiFullyOff ? "ri-pause-circle-line" : nothingAutoSends ? "ri-shield-check-line" : "ri-alert-line"}`} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">AI Support Center</p>
              <h2 className="text-base font-bold text-gray-900">
                {aiFullyOff
                  ? "AI is fully paused"
                  : nothingAutoSends
                  ? "Nothing customer-facing sends automatically"
                  : "Some AI auto-sending is enabled"}
              </h2>
              <p className="text-xs text-gray-600 mt-0.5 max-w-3xl">
                {aiFullyOff
                  ? "The global kill switch (or the AI SMS master switch) is off — the AI drafts and sends nothing anywhere."
                  : "AI can classify messages, draft replies for staff, and capture calls. A human approves every outbound message. Legal, medical, crisis, fraud, refund and complaint topics are never auto-sent."}
                {lastActivityIso && <> {" · "}Last AI activity {fmtWhen(lastActivityIso)}.</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canManage || !settingsLoaded}
              onClick={() => void saveSetting("ai_global_kill_switch", !settings.ai_global_kill_switch)}
              className={`text-xs font-bold px-3.5 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                settings.ai_global_kill_switch
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
              }`}
            >
              <i className={`mr-1 ${settings.ai_global_kill_switch ? "ri-play-circle-line" : "ri-pause-circle-line"}`} />
              {settings.ai_global_kill_switch ? "Resume all AI" : "Pause all AI"}
            </button>
          </div>
        </div>
      </div>

      {/* ── 10. Current effective-state summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {([
          { label: "Overall mode", value: aiFullyOff ? "Paused" : smsAutoOn ? "Auto-send" : "Draft-first", tone: aiFullyOff ? "plan" : smsAutoOn ? "draft" : "safe" },
          { label: "SMS auto-send", value: smsAutoOn ? "ON" : "Disabled", tone: smsAutoOn ? "block" : "safe" },
          { label: "Chat replies", value: chatModeEff === "auto" ? "Auto" : chatModeEff === "draft" ? "Draft only" : "Off", tone: chatModeEff === "auto" ? "draft" : "safe" },
          { label: "Calls", value: "Capture & log", tone: "info" },
          { label: "Email AI", value: "Planned", tone: "plan" },
        ] as const).map((k) => (
          <div key={k.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{k.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${
              k.tone === "safe" ? "text-emerald-700"
                : k.tone === "block" ? "text-red-600"
                : k.tone === "draft" ? "text-amber-600"
                : k.tone === "info" ? "text-indigo-700"
                : "text-gray-500"
            }`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── 3–6. Channel controls (grouped by channel) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* 3. CHAT */}
        <SectionShell
          icon="ri-chat-3-line"
          iconWrap="bg-indigo-50 text-indigo-600 border border-indigo-100"
          title="Chat AI"
          subtitle="Website visitor live chat"
          status={<StatePill tone={chatModeEff === "off" ? "plan" : "draft"}>{chatModeEff === "auto" ? "Auto (sending)" : chatModeEff === "draft" ? "Draft only" : "Off"}</StatePill>}
        >
          <p className="text-xs text-gray-600">
            {chatModeEff === "auto"
              ? "AI posts replies to website visitors automatically (safe topics only; risky topics stay template + escalate)."
              : chatModeEff === "draft"
              ? "AI writes a suggested reply for staff review. Nothing is sent to the visitor automatically."
              : "AI writes no reply for live chat."}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Reply mode</span>
            <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
              {(["off", "draft", "auto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!canManage || !settingsLoaded}
                  onClick={() => requestChatMode(m)}
                  className={`text-xs px-3 py-1.5 capitalize disabled:opacity-50 ${
                    chatModeEff === m
                      ? m === "auto" ? "bg-amber-500 text-white" : m === "draft" ? "bg-[#3b6ea5] text-white" : "bg-gray-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m === "auto" ? "Auto (send)" : m === "draft" ? "Draft (review)" : "Off"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-gray-50 rounded-md px-2.5 py-1.5"><span className="text-gray-400">Cooldown</span><br /><b className="text-gray-700">{settings.ai_chat_auto_reply_cooldown_seconds}s</b></div>
            <div className="bg-gray-50 rounded-md px-2.5 py-1.5"><span className="text-gray-400">Cap / session / day</span><br /><b className="text-gray-700">{settings.ai_chat_max_auto_replies_per_session_per_day}</b></div>
          </div>
          <p className="text-[11px] text-gray-500"><i className="ri-information-line mr-1" />Per-session controls &amp; silencing are managed inside each conversation (open a chat below) and via the blacklist.</p>
        </SectionShell>

        {/* 4. SMS */}
        <SectionShell
          icon="ri-message-3-line"
          iconWrap={smsAutoOn ? "bg-red-50 text-red-600 border border-red-100" : "bg-teal-50 text-teal-600 border border-teal-100"}
          title="SMS AI"
          subtitle="Text conversations (via GHL)"
          status={<StatePill tone={smsAutoOn ? "block" : "safe"}>{smsAutoOn ? "Auto-send ON" : "Auto-send disabled"}</StatePill>}
        >
          <p className="text-xs text-gray-600">AI drafts SMS replies for approval. It cannot text a customer without a human pressing send.</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-600 font-semibold">AI SMS pipeline (classify + draft)</span>
              <button
                type="button"
                disabled={!canManage || !settingsLoaded}
                onClick={() => void saveSetting("ai_sms_enabled", !settings.ai_sms_enabled)}
                aria-label={`AI SMS pipeline: ${settings.ai_sms_enabled ? "on" : "off"}`}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${settings.ai_sms_enabled ? "bg-emerald-600" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.ai_sms_enabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
            <div className={`flex items-center justify-between gap-2 text-xs rounded-md px-3 py-2 border ${smsAutoOn ? "border-red-300 bg-red-50" : "border-red-100 bg-red-50/40"}`}>
              <span className="text-gray-700 font-semibold"><i className="ri-error-warning-line text-red-500 mr-1" />Auto-send to customers</span>
              <button
                type="button"
                disabled={!canManage || !settingsLoaded}
                onClick={() => requestToggle("ai_sms_auto_send_enabled", !smsAutoOn, "SMS Auto-send", true)}
                aria-label={`SMS auto-send: ${smsAutoOn ? "on" : "off"}`}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${smsAutoOn ? "bg-red-600" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${smsAutoOn ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700 leading-relaxed">
            <b>Keep SMS auto-send OFF unless the owner approves.</b> Enabling it needs a typed confirmation. Tester-guard, STOP/DND/blacklist, the 3-minute delayed send, and human/recent-call suppression all still apply. Crisis, legal, fraud, refund &amp; complaint never auto-send.
          </div>
        </SectionShell>

        {/* 6. CALLS — capture / logging first */}
        <SectionShell
          icon="ri-phone-line"
          iconWrap="bg-[#e8f0f9] text-[#3b6ea5] border border-[#c9dcf0]"
          title="Calls & missed calls"
          subtitle="Capture & log first"
          status={<StatePill tone="info">Capture &amp; log</StatePill>}
        >
          <p className="text-xs text-gray-600">Outbound &amp; missed calls are captured and logged for the team (via GHL). AI does not place or auto-answer calls.</p>
          <ToggleCard
            title="AI voice answering"
            description="No voice provider webhook is configured — stays off until setup."
            value={settings.ai_call_enabled}
            disabled={!canManage || !settingsLoaded}
            onChange={(v) => requestToggle("ai_call_enabled", v, "AI Calls", true)}
          />
          <ToggleCard
            title="Auto missed-call SMS"
            description="Text callers back automatically after a missed call. Capture-first: off by default."
            value={settings.ai_missed_call_sms_enabled}
            danger
            disabled={!canManage || !settingsLoaded}
            onChange={(v) => requestToggle("ai_missed_call_sms_enabled", v, "Missed-call SMS", true)}
          />
        </SectionShell>

        {/* 5. EMAIL — planned, not built */}
        <SectionShell
          icon="ri-mail-line"
          iconWrap="bg-gray-50 text-gray-400 border border-gray-100"
          title="Email AI"
          subtitle="Draft assistance"
          status={<StatePill tone="plan">Planned · not enabled</StatePill>}
        >
          <p className="text-xs text-gray-600">Not built yet — there is no email AI pipeline in this system today.</p>
          <div className="rounded-md bg-gray-50 border border-dashed border-gray-200 px-3 py-3 text-[11px] text-gray-500 flex items-start gap-2">
            <i className="ri-time-line text-gray-400 text-base mt-0.5" />
            <span>When email AI ships it will start <b className="text-gray-600">draft-only</b>, like every other channel — no auto-send. This card is a placeholder; no controls are active.</span>
          </div>
        </SectionShell>
      </div>

      {/* ── 7. Escalation & human-handling rules (read-only reference) ── */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">Escalation &amp; human-handling rules</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">How the AI steps back for a human. These are enforced by the backend — shown here for reference (read only).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
          <RuleRow icon="ri-user-voice-line" title="Human takeover wins" desc="If a human replies or takes over a conversation, the AI stops drafting and sending for it." />
          <RuleRow icon="ri-time-line" title="Recent human reply" desc="A recent human reply suppresses the AI on that thread so it never talks over staff." />
          <RuleRow icon="ri-phone-line" title="Recent call" desc="A recent call to/from the customer suppresses AI SMS for a cooldown window." />
          <RuleRow icon="ri-forbid-line" title="Blacklist / human-only" desc="Blacklisted or human-only contacts never receive an AI reply (managed below)." />
          <RuleRow icon="ri-shield-cross-line" title="Never auto-send topics" desc="Refund, complaint, legal/eviction, medical crisis and fraud always escalate — never auto-send." />
          <RuleRow icon="ri-timer-flash-line" title="Delayed send + re-check" desc="Approved SMS auto-replies hold ~3 minutes and re-check every gate before sending." />
        </div>
        <p className="text-[11px] text-gray-400 mt-3"><i className="ri-information-line mr-1" />The AI is a support assistant — it never acts as a doctor or provider and never makes clinical, legal, or eligibility decisions.</p>
      </div>

      {/* ── 8. Cooldown, caps & confidence ── */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">Cooldown, caps &amp; confidence</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">Rate limits that keep the AI conservative.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-2">
            Confidence threshold
            <input
              type="number" step="0.01" min="0" max="1"
              defaultValue={settings.ai_confidence_threshold}
              disabled={!canManage}
              onBlur={(e) => {
                const v = Math.min(1, Math.max(0, Number(e.target.value) || 0.78));
                if (v !== settings.ai_confidence_threshold) void saveSetting("ai_confidence_threshold", v);
              }}
              className="w-20 border border-gray-200 rounded-md px-2 py-1 text-sm text-right disabled:bg-gray-50"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-2">
            Max auto-replies / conversation / day
            <input
              type="number" step="1" min="0" max="20"
              defaultValue={settings.ai_max_auto_replies_per_conversation_per_day}
              disabled={!canManage}
              onBlur={(e) => {
                const v = Math.min(20, Math.max(0, Math.round(Number(e.target.value) || 3)));
                if (v !== settings.ai_max_auto_replies_per_conversation_per_day) void saveSetting("ai_max_auto_replies_per_conversation_per_day", v);
              }}
              className="w-20 border border-gray-200 rounded-md px-2 py-1 text-sm text-right disabled:bg-gray-50"
            />
          </label>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Live chat cooldown {settings.ai_chat_auto_reply_cooldown_seconds}s · chat cap {settings.ai_chat_max_auto_replies_per_session_per_day}/session/day.</p>
      </div>
      {!canManage && (
        <p className="text-xs text-gray-400 -mt-2">
          Viewing only — AI settings can be changed by Owner / Admin roles. You can still pause conversations and take over.
        </p>
      )}

      {/* ── 9. Category safety rules ── */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">Category safety rules</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          What AI may do per topic. Legal, medical crisis, fraud, refunds and complaints can never auto-send, even if set to Auto-send.
        </p>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 min-w-[280px]">
            {CATEGORY_LIST.map((cat) => {
              const mode = settings.ai_category_modes[cat] ?? "draft_only";
              const locked = LOCKED_CATEGORIES.has(cat);
              return (
                <div key={cat} className="flex items-center justify-between gap-2 border border-gray-100 rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{categoryLabel(cat)}</p>
                    {locked && <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide">Never auto-sends</p>}
                  </div>
                  <select
                    value={mode}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = { ...settings.ai_category_modes, [cat]: e.target.value };
                      void saveSetting("ai_category_modes", next);
                    }}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white disabled:bg-gray-50 shrink-0"
                  >
                    {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Blacklist manager (automation, separate from the work queue) ── */}
      <BlacklistManager onChanged={() => { void loadConversations(); }} />

      {/* ── Conversations ── */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">Conversations</p>
            <p className="text-xs text-gray-500 mt-0.5">Every AI-touched chat / SMS / call thread, newest first, with the last AI action and what to do next.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="escalated">Escalated</option>
              <option value="human_replied">Human replied</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={() => { void loadConversations(); void loadNotifications(); }}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No AI support conversations yet. Use the test harness below to simulate one.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {conversations.map((c) => {
              const lastEvt = lastEventByConvo[c.id] ?? null;
              const aiStatus = deriveConversationAiStatus(c.status, lastEvt);
              const gateReason =
                lastEvt && lastEvt.metadata?.chat_auto_gate_pass === false
                  ? humanizeGateReason(String(lastEvt.metadata?.chat_auto_gate ?? "")) : null;
              const priceObjection = lastEvt?.metadata?.price_objection === true;
              const discountOffered = lastEvt?.metadata?.discount_offered === true;
              const nextAction = nextActionForConversation(c.status, lastEvt);
              const ch = channelChip(c.channel);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void openDetail(c)}
                  className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 py-2.5 px-1 text-left hover:bg-gray-50 rounded-md"
                >
                  <div className="flex items-center gap-2 sm:w-56 shrink-0">
                    <i className={`${ch.icon} text-gray-400`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.customer_name || c.customer_phone || c.customer_email || (c.channel === "chat" ? "Website visitor" : "Unknown")}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{c.order_id ? `Order ${c.order_id}` : "No order linked"}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${ch.cls}`}>
                        <i className={`${ch.icon} text-[12px] leading-none`} />
                        {ch.label}
                      </span>
                      <AiStatusBadge convo={c} />
                      {aiStatus && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${aiStatus.cls}`}
                          title="Latest AI action on this conversation"
                        >
                          <i className={`${aiStatus.icon} text-[12px] leading-none`} />
                          {aiStatus.label}
                        </span>
                      )}
                      {gateReason && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200"
                          title={String(lastEvt?.metadata?.chat_auto_gate ?? "")}
                        >
                          <i className="ri-information-line text-[12px] leading-none" />
                          {gateReason}
                        </span>
                      )}
                      {priceObjection && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[#e8f0f9] text-[#3b6ea5] border border-[#c9dcf0]" title="Customer pushed back on price in the latest message">
                          <i className="ri-price-tag-3-line text-[12px] leading-none" />
                          Price Objection
                        </span>
                      )}
                      {discountOffered && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200" title="The reply/draft includes the PAW20 code">
                          <i className="ri-coupon-3-line text-[12px] leading-none" />
                          Discount Offered · PAW20
                        </span>
                      )}
                      {pendingByConvo[c.id] ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 whitespace-nowrap"
                          title="Pending AI notifications — opening this conversation marks them reviewed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {pendingByConvo[c.id]} pending
                        </span>
                      ) : null}
                      <span className="text-[11px] text-gray-400">{fmtWhen(c.last_inbound_at ?? c.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mr-1">Next:</span>
                      {nextAction}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Notifications feed ── */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">AI notifications</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">What the AI did / flagged, newest first.</p>
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No notifications yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {notifications.map((n) => {
              const needsReview =
                n.status === "pending" &&
                (AI_ACTIONABLE_NOTIFICATION_TYPES as readonly string[]).includes(n.type);
              return (
                <div key={n.id} className="flex items-center gap-3 py-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${needsReview ? "bg-red-500" : "bg-transparent"}`}
                    title={needsReview ? "Needs review — open the conversation to mark reviewed" : undefined}
                  />
                  <ActionBadge action={n.type} />
                  <p className={`text-xs truncate flex-1 ${needsReview ? "text-gray-800 font-medium" : "text-gray-500"}`}>
                    {String((n.payload as Record<string, unknown>)?.preview ?? (n.payload as Record<string, unknown>)?.phone ?? "")}
                  </p>
                  {n.status === "read" && (
                    <span className="text-[10px] text-gray-300 shrink-0" title="Reviewed">
                      <i className="ri-check-double-line" />
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 shrink-0">{fmtWhen(n.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Test harness (always dry-run) ── */}
      <div className="bg-white rounded-lg border border-dashed border-[#3b6ea5]/40 px-5 py-4">
        <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest">Test harness — dry run only</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Simulates an inbound SMS or missed call through the full pipeline (classification, guardrails, decision, notification).
          Nothing is ever sent from here.
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={simPhone}
            onChange={(e) => setSimPhone(e.target.value)}
            placeholder="+1 555 010 0999"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm w-full md:w-44"
          />
          <input
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            placeholder="Customer message…"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm flex-1"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={simBusy || !simPhone || !simText}
              onClick={() => void simulate("sms")}
              className="text-sm px-3 py-2 rounded-md bg-[#1e3a5f] text-white hover:bg-[#173049] disabled:opacity-50 whitespace-nowrap"
            >
              {simBusy ? "Running…" : "Simulate SMS"}
            </button>
            <button
              type="button"
              disabled={simBusy || !simPhone}
              onClick={() => void simulate("missed_call")}
              className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 whitespace-nowrap"
            >
              Simulate missed call
            </button>
          </div>
        </div>
        {simResult && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-xs text-gray-700">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <ActionBadge action={String((simResult as Record<string, Record<string, unknown>>)?.decision?.action ?? simResult.notification ?? "skipped")} />
              {Boolean(simResult.dry_run) && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">DRY RUN — nothing sent</span>}
            </div>
            <pre className="whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(simResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* ── Detail drawer ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div
            className="w-full sm:w-[560px] h-full bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-2 z-10">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {selected.customer_name || selected.customer_phone ||
                    (selected.channel === "chat" ? "Website visitor" : "Conversation")}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {selected.channel === "chat" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-indigo-100 text-indigo-700">
                      Live Chat
                    </span>
                  )}
                  <AiStatusBadge convo={selected} />
                  <span className="text-[11px] text-gray-400">{selected.order_id ? `Order ${selected.order_id}` : "No order linked"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-md hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Close"
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {selected.ai_enabled && selected.ai_mode !== "paused" && selected.ai_mode !== "human_only" ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void pauseAi(false)}
                      className="text-xs px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                      <i className="ri-pause-circle-line mr-1" />Pause AI
                    </button>
                    <button type="button" disabled={busy} onClick={() => void pauseAi(true)}
                      className="text-xs px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
                      <i className="ri-user-voice-line mr-1" />Take Over
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void resumeAi()}
                    className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    <i className="ri-play-circle-line mr-1" />Resume AI (draft-only)
                  </button>
                )}
                {selected.status !== "closed" && (
                  <button type="button" disabled={busy} onClick={() => void markClosed()}
                    className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50">
                    <i className="ri-check-double-line mr-1" />Mark Closed
                  </button>
                )}
              </div>
              {selected.ai_paused_reason && (
                <p className="text-[11px] text-amber-600 -mt-2">Paused: {categoryLabel(selected.ai_paused_reason)}</p>
              )}

              {/* Last AI action + next required action — mirrors the list row
                  so the drawer answers "what happened / what do I do" first. */}
              {(() => {
                const lastEvt = lastEventByConvo[selected.id] ?? null;
                const aiStatus = deriveConversationAiStatus(selected.status, lastEvt);
                const nextAction = nextActionForConversation(selected.status, lastEvt);
                return (
                  <div className="bg-[#f8f7f4] border border-gray-100 rounded-lg px-3 py-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Last AI action</span>
                      {aiStatus ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${aiStatus.cls}`}>
                          <i className={`${aiStatus.icon} text-[12px] leading-none`} />
                          {aiStatus.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No AI decision yet</span>
                      )}
                      {lastEvt?.intent && (
                        <span className="text-[11px] text-gray-500">{categoryLabel(lastEvt.intent)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mr-1">Next:</span>
                      {nextAction}
                    </p>
                  </div>
                );
              })()}

              {/* Timeline */}
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Timeline</p>
                {detailLoading ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === "inbound"
                          ? "bg-gray-100 text-gray-800 self-start"
                          : m.direction === "internal"
                            ? "bg-amber-50 border border-amber-200 text-amber-900 self-end"
                            : "bg-[#1e3a5f] text-white self-end"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-white/60" : "text-gray-400"}`}>
                          {m.source === "ai" ? "AI" : m.source === "human" ? "Team" : m.source === "system" ? "System" : "Customer"}
                          {m.channel === "voice" ? " · call" : m.channel === "chat" ? " · chat" : ""}
                          {(m.metadata as Record<string, unknown>)?.dry_run ? " · dry run" : ""}
                          {" · "}{fmtWhen(m.sent_at ?? m.created_at)}
                        </p>
                      </div>
                    ))}
                    {messages.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No messages.</p>}
                  </div>
                )}
              </div>

              {/* AI decision audit */}
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">AI decisions (audit)</p>
                <div className="flex flex-col gap-1.5">
                  {events.map((e) => {
                    const meta = (e.metadata ?? {}) as Record<string, unknown>;
                    const gateRaw = typeof meta.chat_auto_gate === "string" ? meta.chat_auto_gate : null;
                    const gatePass = meta.chat_auto_gate_pass === true;
                    const gateText = humanizeGateReason(gateRaw);
                    const guardText = humanizeGuardrailCode(e.guardrail_code);
                    return (
                      <div key={e.id} className="border border-gray-100 rounded-md px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ActionBadge action={e.action} />
                          {e.intent && <span className="text-[11px] text-gray-500">{categoryLabel(e.intent)}</span>}
                          {guardText && (
                            <span
                              className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
                              title={e.guardrail_code ?? undefined}
                            >
                              {guardText}
                            </span>
                          )}
                          {typeof e.confidence === "number" && <span className="text-[11px] text-gray-400">conf {Math.round(e.confidence * 100)}%</span>}
                          {e.model && <span className="text-[11px] text-gray-400">{e.model}</span>}
                          <span className="text-[11px] text-gray-400 ml-auto">{fmtWhen(e.created_at)}</span>
                        </div>
                        {gateText && (
                          <p
                            className={`text-[11px] mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                              gatePass
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-800 border border-amber-200"
                            }`}
                            title={gateRaw ?? undefined}
                          >
                            <i className={`${gatePass ? "ri-checkbox-circle-line" : "ri-information-line"} text-[12px] leading-none`} />
                            {gatePass ? "Auto-reply gate passed" : `Not auto-sent: ${gateText}`}
                          </p>
                        )}
                        {meta.decision_reason ? (
                          <p className="text-[11px] text-gray-500 mt-1">{String(meta.decision_reason)}</p>
                        ) : null}
                        {e.reply_body && <p className="text-xs text-gray-700 mt-1 bg-gray-50 rounded px-2 py-1 whitespace-pre-wrap break-words">{e.reply_body}</p>}
                        {e.error && <p className="text-[11px] text-red-600 mt-1">{e.error}</p>}
                      </div>
                    );
                  })}
                  {events.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No AI activity yet.</p>}
                </div>
              </div>

              {/* Live chat: human-approved sending only. The AI never replies on
                  its own — an admin reviews (and may edit) the current draft,
                  then explicitly sends it into the REAL chat thread as a team
                  reply via the same RPC the Chats tab uses. The SMS composer
                  below stays hidden for chat (no phone to text). */}
              {selected.channel === "chat" && (
                <div className="border-t border-gray-100 pt-3 flex flex-col gap-3">
                  {/* Auto-reply session controls (TEST). Session-scoped: the
                      buttons only ever add/remove THIS conversation's chat
                      session id; other listed sessions are untouched. */}
                  <div className="border border-indigo-100 bg-indigo-50/40 rounded-md px-3 py-2.5">
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
                      Chat auto-reply — this session
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
                      <span>Global toggle: <b className={settings.ai_chat_auto_reply_enabled ? "text-amber-700" : "text-gray-700"}>{settings.ai_chat_auto_reply_enabled ? "ON" : "OFF"}</b></span>
                      <span>This session: <b className={isSessionWhitelisted ? "text-emerald-700" : "text-gray-700"}>{isSessionWhitelisted ? "whitelisted" : "not whitelisted"}</b></span>
                      <span>Cooldown: <b>{settings.ai_chat_auto_reply_cooldown_seconds}s</b></span>
                      <span>Daily cap: <b>{settings.ai_chat_max_auto_replies_per_session_per_day}/session</b></span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                      <i className="ri-information-line mr-1" />
                      <b>Policy changed (blacklist-first):</b> chat now answers every visitor by default — this old whitelist no longer gates replies. To silence AI for a session, use <b>Blacklist this chat session</b> in the Communications → Command Center context panel. Risky topics still get a safe holding/refusal reply and escalate.
                    </p>
                    {!selected.external_session_id ? (
                      <p className="text-[11px] text-gray-400 mt-2">
                        This conversation has no linked chat session id (older data), so it cannot be
                        added to the auto-reply test list.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {isSessionWhitelisted ? (
                          <button
                            type="button"
                            disabled={!canManage || whitelistBusy}
                            onClick={() => void updateChatWhitelist("remove")}
                            className="text-xs px-3 py-1.5 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <i className="ri-close-circle-line mr-1" />
                            {whitelistBusy ? "Updating…" : "Remove from AI auto-reply test list"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canManage || whitelistBusy}
                            onClick={() => void updateChatWhitelist("add")}
                            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <i className="ri-flask-line mr-1" />
                            {whitelistBusy ? "Updating…" : "Allow AI auto-replies for this test chat"}
                          </button>
                        )}
                        {!canManage && (
                          <span className="text-[11px] text-gray-400">Owner / Admin roles only.</span>
                        )}
                        {isSessionWhitelisted && !settings.ai_chat_auto_reply_enabled && (
                          <span className="text-[11px] text-gray-500">
                            Global toggle is OFF — nothing auto-sends until “Live Chat Auto-Reply” is enabled above.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {chatApprovable ? (
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">
                        AI draft — review &amp; approve
                      </p>
                      <textarea
                        value={approveChatText}
                        onChange={(e) => setApproveChatText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <p className="text-[11px] text-gray-500">
                          Sends into the visitor&apos;s live chat as a team reply. Nothing is ever sent without this click.
                        </p>
                        <button
                          type="button"
                          disabled={approveBusy || !approveChatText.trim()}
                          onClick={() => void approveSendToChat()}
                          className="text-sm px-4 py-2 rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          <i className="ri-check-double-line mr-1" />
                          {approveBusy ? "Sending…" : "Approve & Send to Chat"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      <i className="ri-eye-line mr-1" />
                      {latestChatEvent?.action === "blocked"
                        ? "The latest visitor message was blocked (fraud/crisis guardrail) — it cannot be approved from here. Handle personally in Communications → Chats."
                        : latestChatEvent?.action === "escalated"
                          ? "The latest visitor message is escalated — handle personally in Communications → Chats."
                          : "Live chat is in shadow mode — the AI drafts for review but never replies to the visitor. To answer this visitor, use Communications → Chats."}
                    </p>
                  )}
                </div>
              )}

              {/* Reply composer (SMS conversations only) */}
              {selected.status !== "closed" && selected.channel !== "chat" && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Reply as team</p>
                  {latestDraft?.reply_body && (
                    <button
                      type="button"
                      onClick={() => setReplyText(latestDraft.reply_body ?? "")}
                      className="mb-2 text-left w-full text-xs bg-cyan-50 border border-cyan-200 rounded-md px-3 py-2 text-cyan-900 hover:bg-cyan-100"
                    >
                      <span className="font-semibold">Use latest AI draft:</span> {latestDraft.reply_body}
                    </button>
                  )}
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    maxLength={640}
                    placeholder="Type a reply…"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input type="checkbox" checked={replyDryRun} onChange={(e) => setReplyDryRun(e.target.checked)} />
                      Dry run (log only, don't send)
                    </label>
                    <button
                      type="button"
                      disabled={busy || !replyText.trim()}
                      onClick={() => void sendReply(replyText, replyText === (latestDraft?.reply_body ?? ""))}
                      className={`text-sm px-4 py-2 rounded-md text-white disabled:opacity-50 ${replyDryRun ? "bg-[#1e3a5f] hover:bg-[#173049]" : "bg-emerald-600 hover:bg-emerald-700"}`}
                    >
                      {replyDryRun ? "Dry-run reply" : "Send SMS"}
                    </button>
                  </div>
                  {!replyDryRun && (
                    <p className="text-[11px] text-red-500 mt-1.5">
                      Live send: this will attempt a real SMS through the configured SMS provider.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dangerous-toggle confirmation modal ── */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmToggle(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full px-6 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i className="ri-alert-line text-lg" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Enable {confirmToggle.title}?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Auto-send should only be enabled after TEST verification. Legal, medical, crisis, fraud,
                  and low-confidence messages remain escalated or blocked regardless of this setting.
                </p>
                {confirmToggle.key === "ai_call_enabled" && (
                  <p className="text-xs text-amber-600 mt-2">
                    Note: no voice provider webhook is configured yet — this switch prepares the flow but no calls will be answered until setup is completed.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmToggle(null)}
                className="text-sm px-4 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveSetting(confirmToggle.key, true);
                  setConfirmToggle(null);
                }}
                className="text-sm px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
              >
                Yes, enable
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmChatAuto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmChatAuto(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full px-6 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i className="ri-alert-line text-lg" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Turn on customer-visible chat replies?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Auto mode makes the AI post replies directly to website visitors. Use Draft mode
                  until TEST verification is complete. Legal, medical, crisis, fraud, refund, and
                  complaint topics stay template-only and escalate regardless of this setting.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmChatAuto(false)}
                className="text-sm px-4 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveChatMode("auto");
                  setConfirmChatAuto(false);
                }}
                className="text-sm px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
              >
                Yes, send to visitors
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
