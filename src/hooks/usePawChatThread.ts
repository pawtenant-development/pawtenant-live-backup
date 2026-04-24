/**
 * usePawChatThread — minimal visitor-side chat thread hook.
 *
 * Session id:
 *   - Stored in sessionStorage under __pt_chat_session_id (stable per tab).
 *   - An attribution signature (channel + utm_source + utm_campaign + gclid
 *     + fbclid) is stored alongside under __pt_chat_attribution_sig.
 *   - A FRESH campaign touch in the current URL (utm_source / gclid /
 *     fbclid / gbraid / wbraid) combined with a CHANGED signature rotates
 *     the chat session id so each campaign gets its own chat thread.
 *   - Plain internal navigation (no campaign params) keeps the existing
 *     session intact — we never reset on page-url changes alone.
 *
 * Read path:
 *   - supabase.rpc('get_visitor_chat_thread', { p_provider, p_provider_session_id })
 *   - supabase.rpc('get_visitor_chat_attachments', ...) for attachment rows.
 *   - Poll: 4s while panel is open; no background polling while closed
 *     (2026-04-25 hotfix — closed-state polling was saturating the
 *     PostgREST pool and blocking admin queries). A one-shot load()
 *     still runs on mount + every isOpen flip so the unread badge
 *     hydrates correctly.
 *
 * Write path:
 *   - sendChatMessage() → /functions/v1/capture-chat (already live).
 *   - sendAttachment()  → /functions/v1/chat-attachment-upload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { sendChatMessage } from "../lib/captureChat";
import { buildChannel, getAttribution } from "../lib/attributionStore";
import {
  fetchVisitorAttachments,
  uploadChatAttachment,
  type VisitorAttachment,
} from "../lib/chatAttachments";

export interface VisitorChatMessage {
  id: string;
  session_id: string | null;
  sender: string | null;
  message: string;
  created_at: string;
}

const PROVIDER        = "pawtenant";
const POLL_OPEN_MS    = 4000;
const SESSION_KEY     = "__pt_chat_session_id";
const SIGNATURE_KEY   = "__pt_chat_attribution_sig";
const LAST_SEEN_KEY   = "__pt_chat_last_seen_agent_ts";
const MAX_LEN         = 2000;

const CAMPAIGN_TOUCH_PARAMS = ["utm_source", "gclid", "fbclid", "gbraid", "wbraid"] as const;

function safeSSGet(key: string): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSSSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function safeSSDel(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function urlHasFreshCampaignTouch(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return CAMPAIGN_TOUCH_PARAMS.some((k) => !!p.get(k));
  } catch {
    return false;
  }
}

function buildAttributionSignature(): string {
  try {
    const a = getAttribution();
    const p = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    const sig = {
      channel:      buildChannel(),
      utm_source:   p.get("utm_source")   || a.utm_source   || null,
      utm_campaign: p.get("utm_campaign") || a.utm_campaign || null,
      gclid:        p.get("gclid")        || a.gclid        || null,
      fbclid:       p.get("fbclid")       || a.fbclid       || null,
    };
    return JSON.stringify(sig);
  } catch {
    return "";
  }
}

function ensureSessionForCurrentAttribution(): string {
  const existing   = safeSSGet(SESSION_KEY);
  const currentSig = buildAttributionSignature();
  const storedSig  = safeSSGet(SIGNATURE_KEY) || "";

  if (!existing) {
    const id = newUuid();
    safeSSSet(SESSION_KEY, id);
    if (currentSig) safeSSSet(SIGNATURE_KEY, currentSig);
    return id;
  }

  const sigChanged = !!currentSig && !!storedSig && currentSig !== storedSig;
  const freshTouch = urlHasFreshCampaignTouch();

  if (sigChanged && freshTouch) {
    const id = newUuid();
    safeSSSet(SESSION_KEY, id);
    safeSSSet(SIGNATURE_KEY, currentSig);
    safeSSDel(LAST_SEEN_KEY);
    return id;
  }

  if (currentSig && !storedSig) {
    safeSSSet(SIGNATURE_KEY, currentSig);
  }
  return existing;
}

function readLastSeen(): string {
  return safeSSGet(LAST_SEEN_KEY) || "";
}

function writeLastSeen(ts: string): void {
  safeSSSet(LAST_SEEN_KEY, ts);
}

export interface UsePawChatThreadResult {
  sessionId: string;
  messages: VisitorChatMessage[];
  attachmentsByMessage: Record<string, VisitorAttachment[]>;
  sending: boolean;
  uploading: boolean;
  error: string | null;
  hasUnread: boolean;
  sendReply: (text: string) => Promise<void>;
  sendAttachment: (file: File, identity?: { email?: string | null; name?: string | null }) => Promise<void>;
  markSeen: () => void;
  maxLen: number;
}

export function usePawChatThread(isOpen: boolean): UsePawChatThreadResult {
  const location = useLocation();
  const [sessionId, setSessionId] = useState<string>(() => ensureSessionForCurrentAttribution());
  const [messages, setMessages] = useState<VisitorChatMessage[]>([]);
  const [attachments, setAttachments] = useState<VisitorAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextId = ensureSessionForCurrentAttribution();
    if (nextId !== sessionId) {
      setSessionId(nextId);
      setMessages([]);
      setAttachments([]);
      setHasUnread(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const load = useCallback(async () => {
    try {
      const [threadRes, attachRes] = await Promise.all([
        supabase.rpc("get_visitor_chat_thread", {
          p_provider: PROVIDER,
          p_provider_session_id: sessionId,
        }),
        fetchVisitorAttachments(PROVIDER, sessionId).catch(() => []),
      ]);
      if (!mountedRef.current) return;
      if (threadRes.error) {
        setError(threadRes.error.message);
        return;
      }
      const rows = (threadRes.data ?? []) as VisitorChatMessage[];
      setMessages((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
      });
      const atts = (attachRes as VisitorAttachment[]) ?? [];
      setAttachments((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(atts);
        return prevJson === nextJson ? prev : atts;
      });
      const lastSeen = readLastSeen();
      const lastAgent = [...rows].reverse().find((m) => m.sender === "agent");
      if (lastAgent && lastAgent.created_at > lastSeen) {
        setHasUnread(true);
      }
      setError(null);
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error)?.message ?? "Thread load failed");
      }
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    // HOTFIX 2026-04-25: only poll while the chat panel is open.
    // Closed-state polling was saturating the PostgREST pool — admin tabs
    // (orders / doctor_profiles) would hang waiting behind visitor chat
    // polls returning HTTP 522 from Cloudflare. A one-shot load() still
    // runs on mount + on every isOpen flip, so the unread badge hydrates
    // correctly without a background timer.
    if (!isOpen) return;
    const id = window.setInterval(() => void load(), POLL_OPEN_MS);
    return () => window.clearInterval(id);
  }, [isOpen, load]);

  const markSeen = useCallback(() => {
    const lastAgent = [...messages].reverse().find((m) => m.sender === "agent");
    if (lastAgent) writeLastSeen(lastAgent.created_at);
    setHasUnread(false);
  }, [messages]);

  const sendReply = useCallback(
    async (raw: string) => {
      const text = (raw ?? "").trim();
      if (!text || sending) return;
      if (text.length > MAX_LEN) {
        setError(`Message too long (max ${MAX_LEN} characters)`);
        return;
      }
      setSending(true);
      setError(null);

      const nowIso = new Date().toISOString();
      const temp: VisitorChatMessage = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        session_id: null,
        sender: "visitor",
        message: text,
        created_at: nowIso,
      };
      setMessages((prev) => [...prev, temp]);

      try {
        sendChatMessage({
          message: text,
          sender: "visitor",
          provider: PROVIDER,
          provider_session_id: sessionId,
        });
        window.setTimeout(() => void load(), 900);
      } catch (e) {
        setError((e as Error)?.message ?? "Send failed");
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [sessionId, sending, load],
  );

  const sendAttachment = useCallback(
    async (
      file: File,
      identity?: { email?: string | null; name?: string | null },
    ) => {
      if (uploading) return;
      setUploading(true);
      setError(null);
      try {
        await uploadChatAttachment({
          file,
          provider: PROVIDER,
          providerSessionId: sessionId,
          email: identity?.email ?? null,
          name: identity?.name ?? null,
          sender: "visitor",
        });
        await load();
      } catch (e) {
        setError((e as Error)?.message ?? "Upload failed");
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    },
    [sessionId, uploading, load],
  );

  const attachmentsByMessage = attachments.reduce<Record<string, VisitorAttachment[]>>(
    (acc, a) => {
      const key = a.chat_message_id ?? "";
      if (!key) return acc;
      (acc[key] ??= []).push(a);
      return acc;
    },
    {},
  );

  return {
    sessionId,
    messages,
    attachmentsByMessage,
    sending,
    uploading,
    error,
    hasUnread,
    sendReply,
    sendAttachment,
    markSeen,
    maxLen: MAX_LEN,
  };
}
