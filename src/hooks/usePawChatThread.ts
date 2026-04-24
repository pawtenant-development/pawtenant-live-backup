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
 *   - Poll: 4s while panel is open, 15s while closed.
 *
 * Write path:
 *   - sendChatMessage() → /functions/v1/capture-chat (already live).
 *
 * Intentionally NO realtime subscribe / typing indicators / attachments.
 * V1 must stay tiny.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { sendChatMessage } from "../lib/captureChat";
import { buildChannel, getAttribution } from "../lib/attributionStore";

export interface VisitorChatMessage {
  id: string;
  session_id: string | null;
  sender: string | null;
  message: string;
  created_at: string;
}

const PROVIDER        = "pawtenant";
const POLL_OPEN_MS    = 4000;
const POLL_CLOSED_MS  = 15000;
const SESSION_KEY     = "__pt_chat_session_id";
const SIGNATURE_KEY   = "__pt_chat_attribution_sig";
const LAST_SEEN_KEY   = "__pt_chat_last_seen_agent_ts";
const MAX_LEN         = 2000;

// URL params that represent a "fresh campaign touch" — their presence is
// the gate for rotating the chat session. Plain page navigation never
// contains any of these unless a new ad/campaign link was clicked.
const CAMPAIGN_TOUCH_PARAMS = ["utm_source", "gclid", "fbclid", "gbraid", "wbraid"] as const;

// ── sessionStorage helpers (swallow all errors — must never break chat) ──────
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

/**
 * Lightweight attribution signature used to detect campaign-touch changes.
 * Uses URL-first values (so the signature reflects the CURRENT touch even
 * if captureFromUrl hasn't yet written it to storage), falling back to
 * stored attribution for values not present in the URL.
 */
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

/**
 * Returns the provider_session_id that matches the CURRENT attribution.
 *
 * Rotates (mints new id + clears last-seen) only when ALL are true:
 *   1. there is an existing session in sessionStorage
 *   2. the stored attribution signature differs from the current one
 *   3. the current URL carries a fresh campaign touch
 *
 * Otherwise keeps the existing session (or creates the first one).
 * Back-fills the signature for sessions that pre-date this feature.
 */
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

  // Back-fill signature for sessions that existed before this feature shipped.
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
  sending: boolean;
  error: string | null;
  hasUnread: boolean;
  sendReply: (text: string) => Promise<void>;
  markSeen: () => void;
  maxLen: number;
}

export function usePawChatThread(isOpen: boolean): UsePawChatThreadResult {
  const location = useLocation();
  const [sessionId, setSessionId] = useState<string>(() => ensureSessionForCurrentAttribution());
  const [messages, setMessages] = useState<VisitorChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Re-evaluate session on URL change. Only rotates when the attribution
  // signature changed AND a fresh campaign touch is present in the URL.
  useEffect(() => {
    const nextId = ensureSessionForCurrentAttribution();
    if (nextId !== sessionId) {
      setSessionId(nextId);
      setMessages([]);
      setHasUnread(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const load = useCallback(async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_visitor_chat_thread",
        {
          p_provider: PROVIDER,
          p_provider_session_id: sessionId,
        },
      );
      if (!mountedRef.current) return;
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      const rows = (data ?? []) as VisitorChatMessage[];
      setMessages((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(rows);
        return prevJson === nextJson ? prev : rows;
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
    const interval = isOpen ? POLL_OPEN_MS : POLL_CLOSED_MS;
    const id = window.setInterval(() => void load(), interval);
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
        // Poll shortly after so the server row replaces the optimistic temp row.
        window.setTimeout(() => void load(), 900);
      } catch (e) {
        setError((e as Error)?.message ?? "Send failed");
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [sessionId, sending, load],
  );

  return {
    sessionId,
    messages,
    sending,
    error,
    hasUnread,
    sendReply,
    markSeen,
    maxLen: MAX_LEN,
  };
}
