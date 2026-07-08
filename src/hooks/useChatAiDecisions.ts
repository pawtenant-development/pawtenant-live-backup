/**
 * useChatAiDecisions — admin-only AI decision overlay for a live-chat thread.
 *
 * For the selected chat session, loads the AI Support audit trail and keys
 * it by PUBLIC chat message id (chats.id) so ChatsTab can render an AI
 * marker directly under the visitor message it belongs to, and tag agent
 * bubbles the AI produced.
 *
 * Linkage (written by ai-handle-inbound-chat / the Approve&Send path):
 *   - ai_support_conversations.external_session_id = chat_sessions.id
 *   - inbound  ai_support_messages.provider_message_id = "chat:<chats.id>"
 *   - ai_support_ai_events.message_id → that inbound ai_support_messages row
 *   - auto-sent replies: event.metadata.chat_message_id = <chats.id>
 *   - human-approved sends: outbound ai_support_messages with
 *     metadata.source = "ai_support_human_approved" and
 *     provider_message_id = "chat:<chats.id>"
 *
 * READ-ONLY. All tables are RLS-gated to admin staff, so non-admin sessions
 * simply get empty results and no markers render. Nothing here writes to
 * the public chat tables, so the visitor widget can never see any of it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { AiAgentMessageTag, AiChatDecision } from "../lib/aiSupportPresentation";

export interface ChatAiDecisions {
  /** chats.id (visitor message) → the AI decision for that message. */
  byVisitorMessageId: Record<string, AiChatDecision>;
  /** chats.id (agent message) → AI origin tag (auto-sent / human-approved). */
  byAgentMessageId: Record<string, AiAgentMessageTag>;
  loaded: boolean;
  refresh: () => void;
}

const POLL_MS = 10_000;

const EMPTY_DECISIONS: Record<string, AiChatDecision> = {};
const EMPTY_TAGS: Record<string, AiAgentMessageTag> = {};

function stripChatPrefix(pmid: string | null | undefined): string | null {
  if (!pmid || !pmid.startsWith("chat:")) return null;
  const id = pmid.slice(5).trim();
  return id || null;
}

export function useChatAiDecisions(chatSessionId: string | null): ChatAiDecisions {
  const [byVisitorMessageId, setByVisitorMessageId] =
    useState<Record<string, AiChatDecision>>(EMPTY_DECISIONS);
  const [byAgentMessageId, setByAgentMessageId] =
    useState<Record<string, AiAgentMessageTag>>(EMPTY_TAGS);
  const [loaded, setLoaded] = useState(false);

  const reqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (sessionId: string) => {
    const myId = ++reqRef.current;
    const isLatest = () => myId === reqRef.current && mountedRef.current;
    try {
      const { data: convos, error: convoErr } = await supabase
        .from("ai_support_conversations")
        .select("id")
        .eq("channel", "chat")
        .eq("external_session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!isLatest()) return;
      // Non-admin (RLS) or no AI activity → clear + mark loaded so the UI
      // simply renders nothing.
      if (convoErr || !convos || convos.length === 0) {
        setByVisitorMessageId(EMPTY_DECISIONS);
        setByAgentMessageId(EMPTY_TAGS);
        setLoaded(true);
        return;
      }
      const convoIds = convos.map((c: { id: string }) => c.id);

      const [evtRes, msgRes] = await Promise.all([
        supabase
          .from("ai_support_ai_events")
          .select("id, message_id, intent, action, confidence, guardrail_code, reply_body, created_at, metadata")
          .in("conversation_id", convoIds)
          .order("created_at", { ascending: true })
          .limit(300),
        supabase
          .from("ai_support_messages")
          .select("id, direction, source, provider_message_id, metadata")
          .in("conversation_id", convoIds)
          .limit(400),
      ]);
      if (!isLatest()) return;

      interface EvtRow {
        id: string;
        message_id: string | null;
        intent: string | null;
        action: string;
        confidence: number | string | null;
        guardrail_code: string | null;
        reply_body: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }
      interface MsgRow {
        id: string;
        direction: string;
        source: string | null;
        provider_message_id: string | null;
        metadata: Record<string, unknown> | null;
      }
      const events = (evtRes.data ?? []) as EvtRow[];
      const msgs = (msgRes.data ?? []) as MsgRow[];

      // inbound ai_support_messages id → public chats.id
      const inboundToChatId = new Map<string, string>();
      const agentTags: Record<string, AiAgentMessageTag> = {};
      for (const m of msgs) {
        const chatId = stripChatPrefix(m.provider_message_id);
        if (!chatId) continue;
        if (m.direction === "inbound") {
          inboundToChatId.set(m.id, chatId);
        } else if (m.direction === "outbound" && m.source === "ai") {
          const src = String(m.metadata?.source ?? "");
          if (src === "ai_support_human_approved") {
            agentTags[chatId] = { kind: "approved", intent: null, confidence: null };
          } else if (src === "ai_support_chat_auto_reply") {
            agentTags[chatId] = { kind: "auto", intent: null, confidence: null };
          }
        }
      }

      const decisions: Record<string, AiChatDecision> = {};
      for (const e of events) {
        const meta = e.metadata ?? {};
        // Skip pure state-change / human-send audit events — they have no
        // inbound source message to anchor to.
        const visitorChatId = e.message_id ? inboundToChatId.get(e.message_id) : undefined;
        const conf = e.confidence === null || e.confidence === undefined ? null : Number(e.confidence);
        const autoSentChatMessageId =
          typeof meta.chat_message_id === "string" && meta.chat_message_id ? meta.chat_message_id : null;

        if (visitorChatId && ["auto_sent", "drafted", "escalated", "blocked", "error"].includes(e.action)) {
          decisions[visitorChatId] = {
            eventId: e.id,
            action: e.action,
            intent: e.intent,
            confidence: Number.isFinite(conf as number) ? (conf as number) : null,
            guardrailCode: e.guardrail_code,
            gateReason: typeof meta.chat_auto_gate === "string" ? meta.chat_auto_gate : null,
            gatePass: meta.chat_auto_gate_pass === true,
            decisionReason: typeof meta.decision_reason === "string" ? meta.decision_reason : null,
            replyBody: e.reply_body,
            autoSentChatMessageId,
            createdAt: e.created_at,
            responseMode: typeof meta.chat_response_mode === "string" ? meta.chat_response_mode : null,
            replySent: meta.reply_sent_to_chat === true,
            noReplyReason: typeof meta.no_reply_reason === "string" ? meta.no_reply_reason : null,
          };
        }
        // Enrich the agent bubble tag with intent/confidence from its event.
        if (autoSentChatMessageId) {
          agentTags[autoSentChatMessageId] = {
            kind: meta.human_send === true ? "approved" : "auto",
            intent: e.intent,
            confidence: Number.isFinite(conf as number) ? (conf as number) : null,
          };
        }
      }

      setByVisitorMessageId(decisions);
      setByAgentMessageId(agentTags);
      setLoaded(true);
    } catch {
      // Silent — markers are an overlay; the chat thread must never break
      // because the audit fetch failed.
      if (isLatest()) setLoaded(true);
    }
  }, []);

  const refresh = useCallback(() => {
    if (chatSessionId) void load(chatSessionId);
  }, [chatSessionId, load]);

  useEffect(() => {
    setByVisitorMessageId(EMPTY_DECISIONS);
    setByAgentMessageId(EMPTY_TAGS);
    setLoaded(false);
    if (!chatSessionId) return;
    void load(chatSessionId);
    const timer = window.setInterval(() => {
      if (!mountedRef.current) return;
      void load(chatSessionId);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [chatSessionId, load]);

  return { byVisitorMessageId, byAgentMessageId, loaded, refresh };
}
