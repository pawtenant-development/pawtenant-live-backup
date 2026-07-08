/**
 * useCommsQueue — shared unified-queue data layer for the Communications
 * Command Center v2 (and any future consumer).
 *
 * Read-only over existing tables under existing RLS. Merges:
 *   - live-chat sessions (from AdminChatProvider poll) joined to their AI
 *     Support conversation + latest AI decision event
 *   - AI Support SMS conversations
 *   - inbound / missed calls (communications)
 *   - new contact-form emails (contact_submissions status=new)
 *   - recently paid orders (paid_at set)
 *
 * Returns SELECTION-friendly rows: each row carries the identifiers the
 * center timeline needs (chat session, AI conversation id, phone, order id)
 * rather than a deep-link closure — so the Command Center can render the
 * conversation in-place instead of navigating away. Nothing here writes,
 * sends, or exposes anything to visitors.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useAdminChat, type ChatSession } from "../../../../context/AdminChatContext";
import {
  deriveConversationAiStatus,
  humanizeGateReason,
  nextActionForConversation,
} from "../../../../lib/aiSupportPresentation";

export type ChannelKind = "chat" | "sms" | "email" | "call" | "order";

export type FilterKey =
  | "all" | "needs_reply" | "ai_draft" | "escalated" | "blocked" | "legal"
  | "chat" | "sms" | "email" | "calls" | "orders" | "unassigned" | "mine";

export interface QueueChip {
  label: string;
  cls: string;
  icon?: string;
  title?: string;
}

/** Order-first customer/order context snapshot for the right pane. */
export interface RowContext {
  name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  orderId: string | null;
  product: string | null;
  paymentStatus: string | null;
  provider: string | null;
  source: string | null;
  tags: QueueChip[];
}

export interface CommRow {
  key: string;
  kind: ChannelKind;
  who: string;
  preview: string;
  when: string; // ISO
  chips: QueueChip[];
  next: string;
  facets: Set<FilterKey>;
  // ── selection payload (what the center timeline loads) ──
  chatSession?: ChatSession;
  aiConversationId?: string | null;
  aiConversationStatus?: string | null;
  aiConversationMode?: string | null;
  smsPhone?: string | null;
  callId?: string;
  emailId?: string;
  orderId?: string | null;
  externalSessionId?: string | null;
  // ── latest AI decision snapshot (right pane) ──
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiAction?: string | null;
  aiReason?: string | null;
  aiGateReason?: string | null;
  aiReplyBody?: string | null;
  priceObjection?: boolean;
  discountOffered?: boolean;
  context: RowContext;
}

interface AiConvoRow {
  id: string;
  channel: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_name: string | null;
  external_session_id: string | null;
  order_id: string | null;
  status: string;
  ai_mode: string;
  last_inbound_at: string | null;
  created_at: string;
}
interface LastEventRow {
  conversation_id: string;
  action: string;
  intent: string | null;
  confidence: number | string | null;
  guardrail_code: string | null;
  reply_body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const POLL_MS = 30_000;
const MISSED_STATUSES = new Set(["missed", "no_answer", "no-answer", "busy", "no answer"]);
const DECISION_ACTIONS = new Set(["auto_sent", "drafted", "escalated", "blocked", "error"]);

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "ai_draft", label: "AI Draft Pending" },
  { key: "escalated", label: "Escalated" },
  { key: "blocked", label: "Blocked / Fraud" },
  { key: "legal", label: "Legal / Urgent" },
  { key: "chat", label: "Chat" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "calls", label: "Calls" },
  { key: "orders", label: "New Orders" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
];

export const CHANNEL_CHIP: Record<ChannelKind, { label: string; cls: string; icon: string }> = {
  chat:  { label: "Chat",  cls: "bg-slate-100 text-slate-700 border border-slate-200", icon: "ri-chat-3-line" },
  sms:   { label: "SMS",   cls: "bg-slate-100 text-slate-700 border border-slate-200", icon: "ri-message-3-line" },
  email: { label: "Email", cls: "bg-slate-100 text-slate-700 border border-slate-200", icon: "ri-mail-line" },
  call:  { label: "Call",  cls: "bg-slate-100 text-slate-700 border border-slate-200", icon: "ri-phone-line" },
  order: { label: "Order", cls: "bg-slate-100 text-slate-700 border border-slate-200", icon: "ri-shopping-bag-3-line" },
};

// State/urgency chips carry the color; channels stay neutral (approved
// direction: color means state, not channel).
const CH = {
  autoSent:  { label: "Auto Sent",       cls: "bg-emerald-100 text-emerald-700", icon: "ri-robot-2-line" },
  draft:     { label: "Draft Pending",   cls: "bg-slate-800 text-white",         icon: "ri-draft-line" },
  cooldown:  { label: "Cooldown Held",   cls: "bg-orange-100 text-orange-700",   icon: "ri-time-line" },
  escalated: { label: "Escalated",       cls: "bg-orange-600 text-white",        icon: "ri-alarm-warning-line" },
  blocked:   { label: "Blocked",         cls: "bg-slate-900 text-white",         icon: "ri-shield-cross-line" },
  human:     { label: "Human Replied",   cls: "bg-slate-100 text-slate-600",     icon: "ri-user-voice-line" },
  needs:     { label: "Needs Reply",     cls: "bg-orange-100 text-orange-700",   icon: "ri-reply-line" },
  legal:     { label: "Legal / Urgent",  cls: "bg-orange-600 text-white",        icon: "ri-scales-3-line" },
  missed:    { label: "Missed Call",     cls: "bg-orange-600 text-white",        icon: "ri-phone-lock-line" },
  paid:      { label: "New Paid Order",  cls: "bg-emerald-100 text-emerald-700", icon: "ri-checkbox-circle-line" },
  takeover:  { label: "Human takeover",  cls: "bg-violet-100 text-violet-700",   icon: "ri-user-voice-line" },
  resolved:  { label: "Resolved",        cls: "bg-emerald-50 text-emerald-700",  icon: "ri-check-double-line" },
  priceObj:  { label: "Price Objection", cls: "bg-slate-100 text-slate-700 border border-slate-300", icon: "ri-price-tag-3-line" },
  discount:  { label: "Discount Offered",cls: "bg-emerald-600 text-white",       icon: "ri-coupon-3-line" },
} as const;

export interface UseCommsQueueResult {
  rows: CommRow[];
  counts: Map<FilterKey, number>;
  loading: boolean;
  refresh: () => void;
}

export function useCommsQueue(): UseCommsQueueResult {
  const chatCtx = useAdminChat();

  const [aiConvos, setAiConvos] = useState<AiConvoRow[]>([]);
  const [lastEvents, setLastEvents] = useState<Record<string, LastEventRow>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [calls, setCalls] = useState<Array<{ id: string; phone_from: string | null; status: string | null; created_at: string; body: string | null }>>([]);
  const [emails, setEmails] = useState<Array<{ id: string; name: string | null; email: string | null; message: string | null; created_at: string }>>([]);
  const [paidOrders, setPaidOrders] = useState<Array<{ id: string; confirmation_id: string; first_name: string | null; last_name: string | null; email: string; phone: string | null; state: string | null; price: number | null; created_at: string; letter_type: string | null; doctor_name: string | null; paid_at: string | null }>>([]);
  const [myAdminId, setMyAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (mountedRef.current) setMyAdminId(data?.user?.id ?? null);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const [convoRes, callRes, emailRes, orderRes] = await Promise.all([
        supabase
          .from("ai_support_conversations")
          .select("id, channel, customer_phone, customer_email, customer_name, external_session_id, order_id, status, ai_mode, last_inbound_at, created_at")
          .order("last_inbound_at", { ascending: false, nullsFirst: false })
          .limit(80),
        supabase
          .from("communications")
          .select("id, phone_from, status, created_at, body")
          .eq("type", "call_inbound")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("contact_submissions")
          .select("id, name, email, message, created_at")
          .eq("status", "new")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("orders")
          .select("id, confirmation_id, first_name, last_name, email, phone, state, price, created_at, letter_type, doctor_name, paid_at")
          .not("paid_at", "is", null)
          .order("paid_at", { ascending: false })
          .limit(10),
      ]);
      if (!mountedRef.current) return;
      const convos = (convoRes.data as AiConvoRow[]) ?? [];
      setAiConvos(convos);
      setCalls((callRes.data as typeof calls) ?? []);
      setEmails((emailRes.data as typeof emails) ?? []);
      setPaidOrders((orderRes.data as typeof paidOrders) ?? []);

      const ids = convos.map((c) => c.id);
      if (ids.length > 0) {
        const [evtRes, msgRes] = await Promise.all([
          supabase
            .from("ai_support_ai_events")
            .select("conversation_id, action, intent, confidence, guardrail_code, reply_body, metadata, created_at")
            .in("conversation_id", ids)
            .order("created_at", { ascending: false })
            .limit(400),
          supabase
            .from("ai_support_messages")
            .select("conversation_id, body, created_at")
            .in("conversation_id", ids)
            .eq("direction", "inbound")
            .order("created_at", { ascending: false })
            .limit(400),
        ]);
        if (!mountedRef.current) return;
        const evtMap: Record<string, LastEventRow> = {};
        for (const e of (evtRes.data ?? []) as LastEventRow[]) {
          if (!DECISION_ACTIONS.has(e.action)) continue;
          if (!evtMap[e.conversation_id]) evtMap[e.conversation_id] = e;
        }
        setLastEvents(evtMap);
        const prevMap: Record<string, string> = {};
        for (const m of (msgRes.data ?? []) as Array<{ conversation_id: string; body: string | null }>) {
          if (!prevMap[m.conversation_id]) prevMap[m.conversation_id] = m.body ?? "";
        }
        setPreviews(prevMap);
      } else {
        setLastEvents({});
        setPreviews({});
      }
    } catch {
      /* read-only — keep last known state, poll self-corrects */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = useMemo<CommRow[]>(() => {
    const out: CommRow[] = [];
    const aiChatBySession = new Map<string, AiConvoRow>();
    for (const c of aiConvos) {
      if (c.channel === "chat" && c.external_session_id) aiChatBySession.set(c.external_session_id, c);
    }

    const decisionSnapshot = (evt: LastEventRow | null) => {
      const meta = (evt?.metadata ?? {}) as Record<string, unknown>;
      const conf = evt && evt.confidence !== null && evt.confidence !== undefined ? Number(evt.confidence) : null;
      return {
        aiIntent: evt?.intent ?? null,
        aiConfidence: Number.isFinite(conf as number) ? (conf as number) : null,
        aiAction: evt?.action ?? null,
        aiReason: typeof meta.decision_reason === "string" ? meta.decision_reason : null,
        aiGateReason: typeof meta.chat_auto_gate === "string" ? meta.chat_auto_gate : null,
        aiReplyBody: evt?.reply_body ?? null,
        priceObjection: meta.price_objection === true,
        discountOffered: meta.discount_offered === true,
      };
    };

    // ── Chat sessions (merged with their AI conversation when present) ──
    for (const s of chatCtx.sessions.slice(0, 60)) {
      const ai = aiChatBySession.get(s.id) ?? null;
      const evt = ai ? lastEvents[ai.id] ?? null : null;
      const chips: QueueChip[] = [];
      const facets = new Set<FilterKey>(["all", "chat"]);
      const aiStatus = ai ? deriveConversationAiStatus(ai.status, evt) : null;
      const resolved = s.status === "resolved" || s.status === "closed";
      const snap = decisionSnapshot(evt);

      if (aiStatus) {
        chips.push({ label: aiStatus.label, cls: aiStatus.cls, icon: aiStatus.icon, title: "Latest AI action" });
        addStatusFacets(facets, aiStatus.label, false);
      }
      if (evt?.intent === "legal_eviction" || evt?.intent === "medical_crisis") {
        chips.push(CH.legal); facets.add("legal");
      }
      if (evt?.intent === "fraud") facets.add("blocked");
      if (snap.priceObjection) chips.push(CH.priceObj);
      if (snap.discountOffered) chips.push({ ...CH.discount, title: "PAW20 in reply/draft" });
      if (!resolved && s.unread_count > 0) { chips.push(CH.needs); facets.add("needs_reply"); }
      if (resolved) chips.push(CH.resolved);
      if (!s.assigned_admin_id && !resolved) facets.add("unassigned");
      if (s.assigned_admin_id && myAdminId && s.assigned_admin_id === myAdminId) facets.add("mine");

      const gate = evt && evt.metadata?.chat_auto_gate_pass === false
        ? humanizeGateReason(String(evt.metadata?.chat_auto_gate ?? "")) : null;
      if (gate) chips.push({ label: gate, cls: "bg-orange-50 text-orange-700 border border-orange-200", icon: "ri-information-line" });

      const next = ai
        ? nextActionForConversation(ai.status, evt)
        : resolved ? "None — resolved" : s.unread_count > 0 ? "Reply to the visitor" : "Waiting for customer";
      const who =
        [s.linked_order_first_name, s.linked_order_last_name].filter(Boolean).join(" ") ||
        s.linked_order_email || s.visitor_name || s.name || s.visitor_email || s.email || "Anonymous visitor";

      out.push({
        key: `chat:${s.id}`,
        kind: "chat",
        who,
        preview: s.last_message_preview ?? "",
        when: s.last_message_at ?? s.created_at,
        chips, next, facets,
        chatSession: s,
        aiConversationId: ai?.id ?? null,
        aiConversationStatus: ai?.status ?? s.status,
        aiConversationMode: ai?.ai_mode ?? null,
        externalSessionId: s.id,
        orderId: s.linked_order_confirmation_id ?? ai?.order_id ?? null,
        ...snap,
        context: {
          name: who,
          email: s.linked_order_email || s.visitor_email || s.email || null,
          phone: s.linked_order_phone || null,
          state: s.linked_order_state || null,
          orderId: s.linked_order_confirmation_id || ai?.order_id || null,
          product: null,
          paymentStatus: s.linked_order_confirmation_id ? "Linked order" : null,
          provider: s.linked_order_provider || null,
          source: getChatSource(s),
          tags: chatTags(s),
        },
      });
    }

    // ── AI SMS conversations ──
    for (const c of aiConvos) {
      if (c.channel !== "sms") continue;
      const evt = lastEvents[c.id] ?? null;
      const chips: QueueChip[] = [];
      const facets = new Set<FilterKey>(["all", "sms"]);
      const aiStatus = deriveConversationAiStatus(c.status, evt);
      const snap = decisionSnapshot(evt);
      if (aiStatus) {
        chips.push({ label: aiStatus.label, cls: aiStatus.cls, icon: aiStatus.icon, title: "Latest AI action" });
        addStatusFacets(facets, aiStatus.label, true);
      }
      if (evt?.intent === "legal_eviction" || evt?.intent === "medical_crisis") { chips.push(CH.legal); facets.add("legal"); }
      if (evt?.intent === "fraud") facets.add("blocked");
      if (snap.priceObjection) chips.push(CH.priceObj);
      if (snap.discountOffered) chips.push({ ...CH.discount, title: "PAW20 in reply/draft" });
      if (c.ai_mode === "human_only") chips.push(CH.takeover);

      out.push({
        key: `sms:${c.id}`,
        kind: "sms",
        who: c.customer_name || c.customer_phone || c.customer_email || "Unknown",
        preview: previews[c.id] ?? "",
        when: c.last_inbound_at ?? c.created_at,
        chips,
        next: nextActionForConversation(c.status, evt),
        facets,
        aiConversationId: c.id,
        aiConversationStatus: c.status,
        aiConversationMode: c.ai_mode,
        smsPhone: c.customer_phone,
        orderId: c.order_id,
        ...snap,
        context: {
          name: c.customer_name || c.customer_phone || "Unknown",
          email: c.customer_email,
          phone: c.customer_phone,
          state: null,
          orderId: c.order_id,
          product: null,
          paymentStatus: c.order_id ? "Linked order" : null,
          provider: null,
          source: "SMS",
          tags: c.ai_mode === "human_only" ? [CH.takeover] : [],
        },
      });
    }

    // ── Inbound / missed calls ──
    for (const call of calls) {
      const missed = MISSED_STATUSES.has((call.status ?? "").toLowerCase());
      const facets = new Set<FilterKey>(["all", "calls"]);
      const chips: QueueChip[] = [];
      if (missed) { chips.push(CH.missed); chips.push(CH.needs); facets.add("needs_reply"); }
      else chips.push({ label: "Inbound Call", cls: "bg-violet-100 text-violet-700", icon: "ri-phone-line" });
      out.push({
        key: `call:${call.id}`,
        kind: "call",
        who: call.phone_from || "Unknown caller",
        preview: call.body || (missed ? "Missed while unavailable" : "Inbound call"),
        when: call.created_at,
        chips,
        next: missed ? "Call back or text — missed call" : "Review call log",
        facets,
        callId: call.id,
        smsPhone: call.phone_from,
        context: {
          name: call.phone_from || "Unknown caller", email: null, phone: call.phone_from,
          state: null, orderId: null, product: null, paymentStatus: null, provider: null,
          source: "Inbound call", tags: missed ? [CH.missed] : [],
        },
      });
    }

    // ── New contact-form emails ──
    for (const e of emails) {
      out.push({
        key: `email:${e.id}`,
        kind: "email",
        who: e.name || e.email || "Unknown sender",
        preview: e.message ?? "",
        when: e.created_at,
        chips: [CH.needs],
        next: "Reply from Emails",
        facets: new Set<FilterKey>(["all", "email", "needs_reply"]),
        emailId: e.id,
        context: {
          name: e.name || e.email || "Unknown sender", email: e.email, phone: null,
          state: null, orderId: null, product: null, paymentStatus: null, provider: null,
          source: "Contact form", tags: [],
        },
      });
    }

    // ── Recent paid orders ──
    for (const o of paidOrders) {
      const product = o.letter_type === "psd" ? "PSD" : "ESA";
      out.push({
        key: `order:${o.id}`,
        kind: "order",
        who: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
        preview: `${o.confirmation_id} · ${product}${o.price ? ` · $${o.price}` : ""} · paid`,
        when: o.paid_at ?? o.created_at,
        chips: [CH.paid],
        next: "None — provider review queue picks this up",
        facets: new Set<FilterKey>(["all", "orders"]),
        orderId: o.confirmation_id,
        context: {
          name: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
          email: o.email, phone: o.phone, state: o.state,
          orderId: o.confirmation_id, product: `${product} letter`,
          paymentStatus: o.price ? `Paid · $${o.price}` : "Paid",
          provider: o.doctor_name, source: null, tags: [CH.paid],
        },
      });
    }

    out.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
    return out.slice(0, 200);
  }, [aiConvos, lastEvents, previews, calls, emails, paidOrders, chatCtx.sessions, myAdminId]);

  const counts = useMemo(() => {
    const m = new Map<FilterKey, number>();
    for (const f of FILTERS) m.set(f.key, 0);
    for (const r of rows) for (const f of r.facets) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [rows]);

  return { rows, counts, loading, refresh: () => void load() };
}

// Map a status-chip label to queue facets. Label-prefix based so the
// Always-Answer variants ("Escalation Reply Sent", "Blocked / Refused
// Safely", "Clarifying Reply Sent") still land in the right filters.
function addStatusFacets(facets: Set<FilterKey>, label: string, sms: boolean): void {
  if (label.includes("Draft") || label.includes("Cooldown")) {
    facets.add("ai_draft");
    if (sms) facets.add("needs_reply");
  }
  if (label.includes("Escalat") || label.includes("Crisis")) {
    facets.add("escalated");
    facets.add("needs_reply");
  }
  if (label === "Blocked" || label.includes("Refused")) facets.add("blocked");
}

// ── small helpers (chat attribution/tags from external_metadata) ──
function getChatSource(s: ChatSession): string | null {
  const md = s.external_metadata as Record<string, unknown> | null;
  const attr = md && typeof md === "object" ? (md.attribution as Record<string, unknown> | undefined) : undefined;
  const channel = attr && typeof attr.channel === "string" ? attr.channel : null;
  return channel ? channel.replace(/_/g, " ") : "Live chat";
}
function chatTags(s: ChatSession): QueueChip[] {
  const tags: QueueChip[] = [];
  const identified = !!(s.email || s.visitor_email || s.linked_order_email || s.linked_order_first_name);
  tags.push(identified
    ? { label: "Identified", cls: "bg-slate-100 text-slate-600", icon: "ri-user-check-line" }
    : { label: "Anonymous", cls: "bg-slate-100 text-slate-500", icon: "ri-user-unfollow-line" });
  if (s.linked_order_confirmation_id) tags.push({ label: "Matched Order", cls: "bg-emerald-50 text-emerald-700", icon: "ri-shopping-bag-3-line" });
  return tags;
}
