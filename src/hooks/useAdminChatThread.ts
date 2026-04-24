/**
 * useAdminChatThread — shared hook for loading/polling a single chat
 * session's thread and posting agent replies.
 *
 * Mirrors live ChatsTab behavior (same RPC, same 5s poll, same optimistic
 * append, same mark-read contract) so the mini dock stays behaviorally
 * identical to the full Chats tab.
 *
 * ChatsTab is intentionally left unchanged this phase to reduce risk; a
 * future phase may migrate it onto this hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAdminChat, type ChatSession } from "../context/AdminChatContext";

export interface ChatMessage {
  id: string;
  session_id: string | null;
  sender: string | null;
  email: string | null;
  name: string | null;
  message: string;
  created_at: string;
  provider: string | null;
  source: string | null;
}

const POLL_INTERVAL_MS = 5000;
const MAX_REPLY_LENGTH = 4000;

export interface UseAdminChatThreadResult {
  session: ChatSession | null;
  messages: ChatMessage[];
  displayedMessages: ChatMessage[];
  loading: boolean;
  error: string | null;
  replyInput: string;
  setReplyInput: (v: string) => void;
  sendReply: () => Promise<void>;
  sending: boolean;
  replyError: string | null;
  maxReplyLength: number;
}

function genTempId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `temp-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useAdminChatThread(
  sessionId: string | null,
): UseAdminChatThreadResult {
  const ctx = useAdminChat();

  const session = useMemo(
    () => ctx.sessions.find((s) => s.id === sessionId) ?? null,
    [ctx.sessions, sessionId],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [pendingReplies, setPendingReplies] = useState<ChatMessage[]>([]);

  const messagesReqRef = useRef(0);
  const mountedRef = useRef(true);
  const markedReadRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMessages = useCallback(
    async (sid: string, background = false) => {
      const myId = ++messagesReqRef.current;
      const isLatest = () =>
        myId === messagesReqRef.current && mountedRef.current;

      if (!background) {
        setLoading(true);
        setError(null);
        setMessages([]);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const { data, error: qErr } = await supabase
          .from("chats")
          .select(
            "id, session_id, sender, email, name, message, created_at, provider, source",
          )
          .eq("session_id", sid)
          .order("created_at", { ascending: true })
          .limit(500)
          .abortSignal(controller.signal);

        if (!isLatest()) return;
        if (qErr) {
          if (!background) setError(qErr.message);
          return;
        }
        const next = (data ?? []) as ChatMessage[];
        setMessages((prev) => {
          const prevJson = JSON.stringify(prev);
          const nextJson = JSON.stringify(next);
          return prevJson === nextJson ? prev : next;
        });
        if (background) setError(null);
      } catch (e) {
        if (isLatest() && !background) {
          const aborted = controller.signal.aborted;
          setError(
            aborted
              ? "Thread request timed out — please try again."
              : (e as Error)?.message ?? "Failed to load thread",
          );
        }
      } finally {
        clearTimeout(timeoutId);
        if (isLatest() && !background) setLoading(false);
      }
    },
    [],
  );

  const markRead = useCallback(
    async (s: ChatSession) => {
      const needsUpdate =
        s.unread_count > 0 ||
        s.last_viewed_at == null ||
        (s.last_message_at != null &&
          new Date(s.last_viewed_at).getTime() <
            new Date(s.last_message_at).getTime());
      if (!needsUpdate) return;

      const nowIso = new Date().toISOString();
      ctx.mutateSession(s.id, { unread_count: 0, last_viewed_at: nowIso });
      ctx.markSeen(s.id);

      try {
        await supabase.rpc("mark_chat_session_read", { p_session_id: s.id });
      } catch {
        // silent
      }
    },
    [ctx],
  );

  // Load thread + reset reply state on session change.
  useEffect(() => {
    markedReadRef.current = null;
    setReplyInput("");
    setSending(false);
    setReplyError(null);
    setPendingReplies([]);
    if (!sessionId) {
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }
    void loadMessages(sessionId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Mark read once — when session first becomes available for this sid.
  useEffect(() => {
    if (!sessionId || !session) return;
    if (markedReadRef.current === sessionId) return;
    markedReadRef.current = sessionId;
    void markRead(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.id]);

  // Thread poll.
  useEffect(() => {
    if (!sessionId) return;
    const sid = sessionId;
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      void loadMessages(sid, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionId, loadMessages]);

  const sendReply = useCallback(async () => {
    if (!sessionId) return;
    const snapshot = replyInput;
    const text = snapshot.trim();
    if (!text || sending) return;
    if (text.length > MAX_REPLY_LENGTH) {
      setReplyError(`Message too long (max ${MAX_REPLY_LENGTH} characters)`);
      return;
    }

    const tempId = genTempId();
    const sid = sessionId;
    const nowIso = new Date().toISOString();
    const tempMsg: ChatMessage = {
      id: tempId,
      session_id: sid,
      sender: "agent",
      email: null,
      name: null,
      message: text,
      created_at: nowIso,
      provider: null,
      source: "admin_reply",
    };

    setPendingReplies((p) => [...p, tempMsg]);
    setSending(true);
    setReplyError(null);

    try {
      const { error: rpcErr } = await supabase.rpc("post_agent_chat_message", {
        p_session_id: sid,
        p_message: text,
      });
      if (rpcErr) throw rpcErr;

      if (!mountedRef.current) return;
      setReplyInput((current) => (current === snapshot ? "" : current));
      await loadMessages(sid, true);
      if (!mountedRef.current) return;
      setPendingReplies((p) => p.filter((m) => m.id !== tempId));
    } catch (e) {
      if (!mountedRef.current) return;
      setPendingReplies((p) => p.filter((m) => m.id !== tempId));
      setReplyError((e as Error)?.message ?? "Failed to send message");
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [sessionId, replyInput, sending, loadMessages]);

  const displayedMessages = useMemo(() => {
    if (pendingReplies.length === 0) return messages;
    const relevant = pendingReplies.filter((m) => m.session_id === sessionId);
    if (relevant.length === 0) return messages;
    const all = [...messages, ...relevant];
    all.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return all;
  }, [messages, pendingReplies, sessionId]);

  return {
    session,
    messages,
    displayedMessages,
    loading,
    error,
    replyInput,
    setReplyInput,
    sendReply,
    sending,
    replyError,
    maxReplyLength: MAX_REPLY_LENGTH,
  };
}
