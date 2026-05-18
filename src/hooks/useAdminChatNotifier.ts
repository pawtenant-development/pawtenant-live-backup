/**
 * useAdminChatNotifier — single source of truth for the admin-wide chat
 * alert system. Runs once at the AdminApp level (via AdminChatProvider).
 *
 * Responsibilities:
 *   - Poll chat_sessions every POLL_INTERVAL_MS.
 *   - Detect unread deltas (unread_count increments are visitor-only on the
 *     server side, so a delta reliably signals "new visitor message").
 *   - Play one of two sounds per event:
 *       * doorbell   on the first unread in a session (attention-getting)
 *       * soft click on subsequent unreads in a session already alerted
 *   - Surface the event on EXACTLY ONE channel:
 *       * tab visible → in-app toast (pushAlert) only
 *       * tab hidden  → desktop notification only
 *     No duplicates. No "both" state.
 *   - Maintain a title badge "(•)" when tab is hidden and unread is pending.
 *
 * Reliability (the reason this file has more refs than you'd expect):
 *   - `prevUnreadRef` is a high-water mark per session. Without care, once
 *     the admin opens a session (markSeen) and the DB's mark-read RPC is
 *     in flight, a stale poll would hold `prevUnread` at the pre-mark
 *     value, and later real messages (DB unread drops to 0, then
 *     increments to 1) would be silently ≤ the stale mark. That is the
 *     "sounds stop firing after a few messages" regression.
 *
 *     Fix: markSeen resets `prevUnreadRef(id) = 0` AND snapshots the
 *     session's `last_message_at` into `markSeenLastAtRef`. While that
 *     snapshot is present, any poll row whose `last_message_at` is not
 *     strictly newer than the snapshot is treated as a STALE ECHO —
 *     alert is skipped AND `prevUnread` is NOT advanced (so the poison
 *     never takes hold). As soon as a genuinely newer `last_message_at`
 *     arrives, the snapshot is cleared and the session returns to normal
 *     delta-detection. Both sides of the comparison are DB timestamps, so
 *     client clock skew is a non-issue.
 *
 * Provider-agnostic: only reads PawTenant-native columns. No Tawk-specific
 * code, no hardcoded provider branches.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { playDoorbell, playSoftClick, stopChatSound } from "../lib/chatSounds";

export interface ChatSession {
  id: string;
  email: string | null;
  name: string | null;
  /** Visitor-provided name (captured via the PawChat identity prompt). */
  visitor_name: string | null;
  /** Visitor-provided email (captured via the PawChat identity prompt). */
  visitor_email: string | null;
  status: string | null;
  provider: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  last_viewed_at: string | null;
  created_at: string;
  external_metadata: Record<string, unknown> | null;
  /** FK to orders.id when the visitor's email matches a known order. */
  matched_order_id: string | null;
  /**
   * FK-style link to visitor_sessions.session_id, set by the
   * chat_sessions_link_visitor trigger when external_metadata.attribution
   * .session_id is present. Lets the admin UI tie a chat to its visitor
   * session even before chat collected name/email.
   */
  visitor_session_id: string | null;
  /** Assignment (Phase 8). null = unassigned. */
  assigned_admin_id: string | null;
  assigned_admin_email: string | null;
  assigned_admin_name: string | null;
  first_handled_at: string | null;
  last_handled_at: string | null;
  resolved_at: string | null;
  resolved_by_admin_id: string | null;
  resolved_by_admin_name: string | null;
  resolved_by_admin_email: string | null;
  // ── 2026-05-19 CHAT-IDENTITY-NO-DOWNGRADE ──────────────────────────
  // Client-side enrichment: identity resolved from the order linked to
  // this chat session via (a) matched_order_id, or (b) visitor_session_id
  // → orders.session_id. The loader populates these AFTER fetching the
  // chat_sessions rows so the resolver can prefer order identity over
  // chat-collected name/email. Read-only on the client — these fields
  // are NEVER written back to chat_sessions.
  linked_order_first_name: string | null;
  linked_order_last_name: string | null;
  linked_order_email: string | null;
  linked_order_confirmation_id: string | null;
}

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export interface AdminAlert {
  id: string;
  sessionId: string;
  label: string;
  preview: string;
  createdAt: number;
}

const POLL_INTERVAL_MS   = 5000;
const FLASH_DURATION_MS  = 4000;
/**
 * Phase 1C (2026-05-18): bumped from 1500ms to 30000ms.
 * Soft-click follow-up sounds are now also rate-limited inside
 * chatSounds.playSoftClick (FOLLOWUP_COOLDOWN_MS = 45s per session).
 * This top-level guard is a coarser second line of defense: even if
 * many sessions flash in the same tick, no more than one ping every
 * 30s for the same session at this layer.
 */
const PING_COOLDOWN_MS   = 30000;
const NOTIF_COOLDOWN_MS  = 2000;
const ALERT_DURATION_MS  = 6000;
const MAX_VISIBLE_ALERTS = 4;
/**
 * Urgent ring (Phase 1C, 2026-05-18):
 * Previous implementation re-fired the doorbell every 2.5s for 30s
 * (= 12 plays of the new ~441KB chat-first MP3). With overlapping
 * cloned audio nodes this produced a wall of noise that did not stop
 * when the admin replied within a second.
 *
 * New rule: fire the doorbell ONCE on the first message. If the admin
 * still hasn't engaged after RING_REMINDER_MS, fire ONE soft click as
 * a reminder. No more. The persistent visual flash + toast +
 * NotificationsBell unread badge carry the rest of the signal.
 *
 * The in-flight first-message audio element is now tagged with the
 * session id and stopped via chatSounds.stopChatSound(sessionId) the
 * instant the admin engages (markSeen → stopRingingSession).
 */
const RING_REMINDER_MS   = 15000;

export interface UseAdminChatNotifierOptions {
  /** Overall kill-switch — false disables polling and alerts entirely. */
  enabled: boolean;
  /**
   * Legacy flag. Retained in the API for call-site compatibility
   * (AdminChatContext still wires it up) but no longer gates the toast:
   * active admin pages ALWAYS surface the in-app toast when the tab is
   * visible. The previous gate was the source of the "toast missing on
   * Chats tab" regression.
   */
  suppressToast: boolean;
  /** The session id currently visible to the admin (selected in ChatsTab). */
  selectedSessionId: string | null;
}

export interface UseAdminChatNotifierResult {
  sessions: ChatSession[];
  refreshing: boolean;
  error: string | null;
  refreshSessions: () => void;
  mutateSession: (id: string, patch: Partial<ChatSession>) => void;
  flashIds: Set<string>;
  /** Called when admin has "seen" a session — clears flash, resets first-seen gate, closes notif. */
  markSeen: (sessionId: string) => void;
  alerts: AdminAlert[];
  dismissAlert: (id: string) => void;
  notifPermission: NotifPermission;
  requestDesktopAlerts: () => Promise<void>;
}

function displayNameForSession(s: ChatSession): string {
  // CHAT-IDENTITY-NO-DOWNGRADE — linked-order identity wins over any
  // chat-collected name/email so opening chat never downgrades a row
  // that already has a known customer.
  const ofn = (s.linked_order_first_name ?? "").trim();
  const oln = (s.linked_order_last_name ?? "").trim();
  if (ofn || oln) return [ofn, oln].filter(Boolean).join(" ");
  const oemail = (s.linked_order_email ?? "").trim();
  if (oemail) return oemail;
  if (s.visitor_name && s.visitor_name.trim()) return s.visitor_name.trim();
  if (s.name && s.name.trim()) return s.name.trim();
  if (s.visitor_email && s.visitor_email.trim()) return s.visitor_email.trim();
  if (s.email && s.email.trim()) return s.email.trim();
  return "Anonymous visitor";
}

function sessionsChanged(prev: ChatSession[], next: ChatSession[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (
      prev[i].id !== next[i].id ||
      prev[i].last_message_at !== next[i].last_message_at ||
      prev[i].unread_count !== next[i].unread_count ||
      prev[i].status !== next[i].status ||
      prev[i].last_viewed_at !== next[i].last_viewed_at ||
      // Assignment changes must trigger a re-render even if nothing else
      // changed — otherwise admin reassignment doesn't update other agents'
      // UIs until the next message arrives.
      prev[i].assigned_admin_id !== next[i].assigned_admin_id ||
      prev[i].resolved_by_admin_id !== next[i].resolved_by_admin_id
    ) {
      return true;
    }
  }
  return false;
}

/**
 * "Tab visible" = the admin tab is the foreground tab on its window.
 * document.hasFocus() is intentionally NOT required — DevTools, another
 * app on top, etc. should not flip us into "desktop notif" territory
 * when the admin is clearly still looking at the admin page.
 */
function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function safeSlice(s: string, n: number): string {
  if (!s) return "";
  const arr = [...s];
  if (arr.length <= n) return s;
  return arr.slice(0, n - 1).join("") + "…";
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

/** Strict newer-than comparison on DB timestamp strings (handles null). */
function isNewerTs(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a) return false;
  if (!b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return ta > tb;
}

export function useAdminChatNotifier(
  opts: UseAdminChatNotifierOptions,
): UseAdminChatNotifierResult {
  const { enabled, selectedSessionId } = opts;

  const [sessions, setSessions]       = useState<ChatSession[]>([]);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [flashIds, setFlashIds]       = useState<Set<string>>(new Set());
  const [alerts, setAlerts]           = useState<AdminAlert[]>([]);
  const [notifPermission, setNotifPermission] =
    useState<NotifPermission>("unsupported");

  const sessionsReqRef      = useRef(0);
  const mountedRef          = useRef(true);
  const initialLoadedRef    = useRef(false);

  const prevUnreadRef       = useRef<Map<string, number>>(new Map());
  const firstSeenRef        = useRef<Map<string, boolean>>(new Map());
  const lastPingAtRef       = useRef<Map<string, number>>(new Map());
  const lastNotifAtRef      = useRef<Map<string, number>>(new Map());
  const activeNotifsRef     = useRef<Map<string, Notification>>(new Map());
  const alertTimersRef      = useRef<Map<string, number>>(new Map());
  /**
   * Per-session urgent-ring timers. Each entry holds the interval that
   * re-plays the doorbell every RING_INTERVAL_MS, and the timeout that
   * stops the ring after RING_DURATION_MS. Both are cleared on markSeen
   * (agent opened / replied / session seen) and on unmount.
   */
  const ringTimersRef       = useRef<Map<string, { intervalId: number; timeoutId: number }>>(new Map());
  /**
   * Set by markSeen → holds the session's last_message_at at that moment.
   * Cleared automatically the first time a poll sees a strictly newer
   * last_message_at for that session (that's the genuine "next message"
   * event). While present, stale-echo polls from a not-yet-committed
   * mark-read RPC are ignored and do not advance the unread tracker.
   */
  const markSeenLastAtRef   = useRef<Map<string, string | null>>(new Map());
  const sessionsRef         = useRef<ChatSession[]>([]);
  const notifPermissionRef  = useRef<NotifPermission>("unsupported");
  const selectedIdRef       = useRef<string | null>(null);
  const originalTitleRef    = useRef("");

  useEffect(() => { selectedIdRef.current    = selectedSessionId; }, [selectedSessionId]);
  useEffect(() => { notifPermissionRef.current = notifPermission; }, [notifPermission]);

  // Mount / unmount wiring.
  useEffect(() => {
    mountedRef.current = true;
    if (typeof document !== "undefined") {
      originalTitleRef.current = document.title;
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        setNotifPermission(Notification.permission as NotifPermission);
      } catch {
        setNotifPermission("unsupported");
      }
    } else {
      setNotifPermission("unsupported");
    }
    const timers = alertTimersRef.current;
    const notifs = activeNotifsRef.current;
    const rings  = ringTimersRef.current;
    return () => {
      mountedRef.current = false;
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      for (const n of notifs.values()) {
        try { n.close(); } catch { /* ignore */ }
      }
      notifs.clear();
      for (const r of rings.values()) {
        window.clearInterval(r.intervalId);
        window.clearTimeout(r.timeoutId);
      }
      rings.clear();
      if (typeof document !== "undefined" && originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
  }, []);

  /**
   * Stop the urgent ring for a session (idempotent, no-op if not ringing).
   * Called on markSeen and on unmount. Phase 1C: also kills the in-flight
   * first-message MP3 element so admin replies stop the audio instantly,
   * not after the file plays out.
   */
  const stopRingingSession = useCallback((sessionId: string) => {
    const t = ringTimersRef.current.get(sessionId);
    if (t) {
      window.clearTimeout(t.timeoutId);
      // intervalId is retained for backwards-compatible struct shape but
      // no longer driven by setInterval (see startRingingSession below).
      // Clearing it is still safe and idempotent.
      window.clearTimeout(t.intervalId);
      ringTimersRef.current.delete(sessionId);
    }
    // Always stop the in-flight MP3 — even if the timer struct was
    // already cleaned up (e.g. ring window expired naturally).
    try {
      stopChatSound(sessionId);
    } catch {
      /* sound is best-effort */
    }
  }, []);

  /**
   * Start the urgent ring for a session — Phase 1C semantics:
   *   - Fire the doorbell ONCE.
   *   - If still unhandled after RING_REMINDER_MS, fire ONE soft click.
   *   - No further audio. The flash + toast + unread badge keep
   *     surface state visible.
   *
   * The in-flight first-message MP3 is tagged with the session id by
   * playDoorbell(sessionId); stopRingingSession halts it the instant
   * the admin replies / opens the chat / marks seen.
   *
   * If a ring is somehow already active for this session, the previous
   * scheduled reminder is cancelled and the in-flight audio is stopped
   * before starting fresh (e.g. session re-opened after being closed).
   */
  const startRingingSession = useCallback((sessionId: string) => {
    const existing = ringTimersRef.current.get(sessionId);
    if (existing) {
      window.clearTimeout(existing.intervalId);
      window.clearTimeout(existing.timeoutId);
      ringTimersRef.current.delete(sessionId);
      try {
        stopChatSound(sessionId);
      } catch {
        /* ignore */
      }
    }
    playDoorbell(sessionId);
    // Soft reminder if still unhandled. Uses setTimeout (single-shot),
    // not setInterval (which previously produced ~12 plays in 30s).
    const reminderId = window.setTimeout(() => {
      if (!mountedRef.current) return;
      // Guard: if markSeen already ran, the timer struct will have
      // been removed — skip the reminder.
      if (!ringTimersRef.current.has(sessionId)) return;
      try {
        playSoftClick(sessionId);
      } catch {
        /* ignore */
      }
    }, RING_REMINDER_MS);
    // Self-cleanup timer — drop the struct after the reminder fires (or
    // would have fired) so future first messages start fresh.
    const cleanupId = window.setTimeout(() => {
      ringTimersRef.current.delete(sessionId);
    }, RING_REMINDER_MS + 500);
    ringTimersRef.current.set(sessionId, {
      intervalId: reminderId,
      timeoutId: cleanupId,
    });
  }, []);

  // Flash a row briefly when a new message arrives.
  const scheduleFlash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFlashIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    for (const id of ids) {
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setFlashIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // NOTE: flash expiry does NOT reset firstSeenRef.
        // Only an explicit markSeen() (admin opened the session) does that.
      }, FLASH_DURATION_MS);
    }
  }, []);

  const pushAlert = useCallback((session: ChatSession) => {
    const label = displayNameForSession(session);
    const preview =
      (session.last_message_preview ?? "").trim() || "New visitor message";
    const id = genTempId();
    const next: AdminAlert = {
      id,
      sessionId: session.id,
      label,
      preview,
      createdAt: Date.now(),
    };
    setAlerts((prev) => {
      const stale = prev.find((a) => a.sessionId === session.id);
      if (stale) {
        const t = alertTimersRef.current.get(stale.id);
        if (t) {
          window.clearTimeout(t);
          alertTimersRef.current.delete(stale.id);
        }
      }
      const without = prev.filter((a) => a.sessionId !== session.id);
      return [next, ...without].slice(0, MAX_VISIBLE_ALERTS);
    });
    const timer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      alertTimersRef.current.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, ALERT_DURATION_MS);
    alertTimersRef.current.set(id, timer);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    const t = alertTimersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      alertTimersRef.current.delete(id);
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /**
   * Desktop notification — fired only when the tab is hidden.
   * Caller must have already verified !isTabVisible() — we do not re-check
   * here, so the single-surface routing in loadSessions stays authoritative.
   */
  const fireDesktopAlert = useCallback((session: ChatSession) => {
    if (notifPermissionRef.current !== "granted") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const now = Date.now();
    const last = lastNotifAtRef.current.get(session.id) ?? 0;
    if (now - last < NOTIF_COOLDOWN_MS) return;
    lastNotifAtRef.current.set(session.id, now);

    const label = displayNameForSession(session);
    const preview =
      (session.last_message_preview ?? "").trim() || "New visitor message";

    try {
      const prev = activeNotifsRef.current.get(session.id);
      if (prev) {
        try { prev.close(); } catch { /* ignore */ }
        activeNotifsRef.current.delete(session.id);
      }

      const n = new Notification(label, {
        body: safeSlice(preview, 160),
        tag: `pt-chat-${session.id}`,
        renotify: true,
      } as NotificationOptions);

      activeNotifsRef.current.set(session.id, n);

      n.onclick = () => {
        try { window.focus(); } catch { /* ignore */ }
        try { n.close(); } catch { /* ignore */ }
        activeNotifsRef.current.delete(session.id);
        // Broadcast to any UI that wants to open this session (ChatsTab,
        // future mini dock, etc.). Decoupled — notifier doesn't know about
        // routing.
        try {
          window.dispatchEvent(
            new CustomEvent("pt:admin-chat-open", {
              detail: { sessionId: session.id },
            }),
          );
        } catch {
          // ignore
        }
      };
      n.onclose = () => {
        const curr = activeNotifsRef.current.get(session.id);
        if (curr === n) activeNotifsRef.current.delete(session.id);
      };
    } catch {
      // Some Android browsers expose Notification but require a SW.
      // Silent fallback — row flash + title badge still surface the event.
    }
  }, []);

  const loadSessions = useCallback(
    async (background = false) => {
      if (!enabled) return;
      const myId = ++sessionsReqRef.current;
      const isLatest = () =>
        myId === sessionsReqRef.current && mountedRef.current;

      if (!background) {
        setRefreshing(true);
        setError(null);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const { data, error: qErr } = await supabase
          .from("chat_sessions")
          .select(
            "id, email, name, visitor_name, visitor_email, status, provider, last_message_at, last_message_preview, unread_count, last_viewed_at, created_at, external_metadata, matched_order_id, visitor_session_id, assigned_admin_id, assigned_admin_email, assigned_admin_name, first_handled_at, last_handled_at, resolved_at, resolved_by_admin_id, resolved_by_admin_name, resolved_by_admin_email",
          )
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(300)
          .abortSignal(controller.signal);

        if (!isLatest()) return;
        if (qErr) {
          if (!background) setError(qErr.message);
          return;
        }

        const rawRows = (data ?? []) as ChatSession[];
        // CHAT-IDENTITY-NO-DOWNGRADE (2026-05-19): enrich each chat
        // session with linked-order identity so the resolver can prefer
        // the customer's real name over chat-collected anonymous values.
        // Two parallel batched lookups — no N+1.
        //   • matched_order_id → orders.id   (direct FK, set on email match)
        //   • visitor_session_id → orders.session_id  (trigger-derived bridge)
        // Failures degrade silently: rows still render with chat-only
        // identity, the resolver just stays at the lower-priority value.
        const moIds = Array.from(
          new Set(rawRows.map((r) => r.matched_order_id).filter((v): v is string => !!v)),
        );
        const vsIds = Array.from(
          new Set(rawRows.map((r) => r.visitor_session_id).filter((v): v is string => !!v)),
        );

        const byMatched      = new Map<string, { fn: string | null; ln: string | null; em: string | null; cid: string | null }>();
        const byVisitor      = new Map<string, { fn: string | null; ln: string | null; em: string | null; cid: string | null }>();
        // CHAT-RESUME-ORDER-IDENTITY-SYNC (2026-05-19): third lookup
        // path keyed by visitor_session_id → visitor_sessions.confirmation_id
        // → orders.confirmation_id. Required for resume / recovery
        // sessions where orders.session_id is sticky-pinned to the
        // ORIGINAL Session 1 id but visitor_sessions.confirmation_id
        // on Session 2 carries the link.
        const byConfirmation = new Map<string, { fn: string | null; ln: string | null; em: string | null; cid: string | null }>();

        try {
          if (moIds.length > 0) {
            const { data: ordersByMo } = await supabase
              .from("orders")
              .select("id, first_name, last_name, email, confirmation_id")
              .in("id", moIds);
            for (const o of (ordersByMo ?? []) as Array<{
              id: string;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
              confirmation_id: string | null;
            }>) {
              byMatched.set(o.id, {
                fn: o.first_name,
                ln: o.last_name,
                em: o.email,
                cid: o.confirmation_id,
              });
            }
          }
        } catch {
          /* silent — chat list still renders */
        }

        // Fetch visitor_sessions for all chat visitor_session_ids so we
        // can resolve identity via both session_id (orders.session_id)
        // AND confirmation_id (orders.confirmation_id). Single batched
        // round-trip.
        const vsConfMap = new Map<string, string>(); // visitor_session_id → confirmation_id
        try {
          if (vsIds.length > 0) {
            const { data: vsRows } = await supabase
              .from("visitor_sessions")
              .select("session_id, confirmation_id")
              .in("session_id", vsIds);
            for (const row of (vsRows ?? []) as Array<{ session_id: string | null; confirmation_id: string | null }>) {
              if (row.session_id && row.confirmation_id) {
                vsConfMap.set(row.session_id, row.confirmation_id);
              }
            }
          }
        } catch {
          /* silent */
        }

        try {
          if (vsIds.length > 0) {
            const { data: ordersByVs } = await supabase
              .from("orders")
              .select("session_id, first_name, last_name, email, confirmation_id, paid_at, created_at, status")
              .in("session_id", vsIds)
              .not("status", "in", `("archived","refunded","cancelled")`);
            // Prefer paid > most-recent when multiple orders share a session.
            for (const o of (ordersByVs ?? []) as Array<{
              session_id: string | null;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
              confirmation_id: string | null;
              paid_at: string | null;
              created_at: string;
              status: string | null;
            }>) {
              if (!o.session_id) continue;
              const existing = byVisitor.get(o.session_id);
              if (!existing) {
                byVisitor.set(o.session_id, {
                  fn: o.first_name,
                  ln: o.last_name,
                  em: o.email,
                  cid: o.confirmation_id,
                });
                continue;
              }
              if (o.paid_at && !existing.em) {
                byVisitor.set(o.session_id, {
                  fn: o.first_name,
                  ln: o.last_name,
                  em: o.email,
                  cid: o.confirmation_id,
                });
              }
            }
          }
        } catch {
          /* silent */
        }

        // Third lookup: confirmation_id → order, keyed back to the
        // chat's visitor_session_id for merge convenience.
        try {
          const confIds = Array.from(new Set([...vsConfMap.values()]));
          if (confIds.length > 0) {
            const { data: ordersByCid } = await supabase
              .from("orders")
              .select("confirmation_id, first_name, last_name, email, paid_at, status")
              .in("confirmation_id", confIds)
              .not("status", "in", `("archived","refunded","cancelled")`);
            const cidToOrder = new Map<string, { fn: string | null; ln: string | null; em: string | null; cid: string | null; paid: string | null }>();
            for (const o of (ordersByCid ?? []) as Array<{
              confirmation_id: string | null;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
              paid_at: string | null;
              status: string | null;
            }>) {
              if (!o.confirmation_id) continue;
              const existing = cidToOrder.get(o.confirmation_id);
              const incoming = { fn: o.first_name, ln: o.last_name, em: o.email, cid: o.confirmation_id, paid: o.paid_at };
              if (!existing) {
                cidToOrder.set(o.confirmation_id, incoming);
              } else if (incoming.paid && !existing.paid) {
                cidToOrder.set(o.confirmation_id, incoming);
              }
            }
            for (const [vsid, cid] of vsConfMap.entries()) {
              const order = cidToOrder.get(cid);
              if (order) {
                byConfirmation.set(vsid, {
                  fn: order.fn, ln: order.ln, em: order.em, cid: order.cid,
                });
              }
            }
          }
        } catch {
          /* silent */
        }

        // Merge linked-order identity onto each row. Priority order:
        //   1. matched_order_id (direct FK, set by email match)
        //   2. visitor_session_id → orders.session_id (Session 1)
        //   3. visitor_session_id → vs.confirmation_id → orders (Session 2 resume)
        // Never mutate base chat_sessions columns — only populate the
        // read-only linked_order_* fields the resolver checks first.
        const rows: ChatSession[] = rawRows.map((r) => {
          const moHit  = r.matched_order_id   ? byMatched.get(r.matched_order_id)         : undefined;
          const vsHit  = r.visitor_session_id ? byVisitor.get(r.visitor_session_id)       : undefined;
          const cidHit = r.visitor_session_id ? byConfirmation.get(r.visitor_session_id)  : undefined;
          const pick = moHit ?? vsHit ?? cidHit;
          if (!pick) {
            return {
              ...r,
              linked_order_first_name: null,
              linked_order_last_name: null,
              linked_order_email: null,
              linked_order_confirmation_id: null,
            };
          }
          return {
            ...r,
            linked_order_first_name: pick.fn,
            linked_order_last_name: pick.ln,
            linked_order_email: pick.em,
            linked_order_confirmation_id: pick.cid,
          };
        });
        const initial = !initialLoadedRef.current;

        // Sessions whose poll row is a stale echo of a just-marked-seen
        // state. They get skipped for alerts AND keep their old (low)
        // prevUnread — do NOT let a stale DB snapshot poison the tracker.
        const staleEchoed = new Set<string>();

        if (!initial) {
          const tabVisible = isTabVisible();
          const alertRows: ChatSession[] = [];
          const now = Date.now();
          const ringStartIds: string[] = [];
          let playSubsequent = false;

          for (const r of rows) {
            const prevUnread = prevUnreadRef.current.get(r.id) ?? 0;
            if (r.unread_count <= prevUnread) continue;

            // Stale-echo gate: if we just markSeen'd this session, a poll
            // may still return the pre-RPC unread. Ignore it until a
            // strictly newer last_message_at shows up.
            if (markSeenLastAtRef.current.has(r.id)) {
              const markedLastAt =
                markSeenLastAtRef.current.get(r.id) ?? null;
              if (!isNewerTs(r.last_message_at, markedLastAt)) {
                staleEchoed.add(r.id);
                continue;
              }
              // Genuinely newer message arrived — leave protection window.
              markSeenLastAtRef.current.delete(r.id);
            }

            // Only mute when the admin is literally looking at THIS
            // session right now (tab visible + this id selected).
            // All other active-admin-page cases must surface the toast.
            const isVisibleSelected =
              tabVisible && selectedIdRef.current === r.id;
            if (isVisibleSelected) continue;

            alertRows.push(r);
            const lastPing = lastPingAtRef.current.get(r.id) ?? 0;
            if (now - lastPing > PING_COOLDOWN_MS) {
              const seen = firstSeenRef.current.get(r.id) === true;
              if (!seen) {
                // First visitor message in a (currently) unanswered
                // session → start the urgent 30s ring. firstSeenRef is
                // cleared by markSeen, so after the admin handles the
                // session, the NEXT first message can ring again.
                firstSeenRef.current.set(r.id, true);
                ringStartIds.push(r.id);
              } else {
                // Subsequent message in a session that already alerted
                // — soft click only. An existing 30s ring (if still
                // within its window) keeps running; we do NOT extend it.
                playSubsequent = true;
              }
              lastPingAtRef.current.set(r.id, now);
            }
          }

          // Kick off per-session urgent rings. If none started but a
          // subsequent message fired, play the soft click — gated by
          // chatSounds' per-session 45s cooldown so a chatty visitor
          // does not produce a ping every poll.
          if (ringStartIds.length > 0) {
            for (const sid of ringStartIds) startRingingSession(sid);
          } else if (playSubsequent) {
            // Pass the most-recently-alerting session id so cooldown is
            // keyed correctly. If multiple sessions pinged in the same
            // tick, the first one wins the audio; visual flash still
            // surfaces them all.
            const sid = alertRows[0]?.id;
            playSoftClick(sid ?? null);
          }

          if (alertRows.length > 0) {
            scheduleFlash(alertRows.map((r) => r.id));
            // ── SINGLE-SURFACE ROUTING ─────────────────────────────────
            // Tab visible → in-app toast. Tab hidden → desktop notif.
            // The toast is NEVER suppressed on active admin pages; the
            // previous suppressToast gate caused the regression where
            // toasts disappeared on the Chats tab.
            for (const r of alertRows) {
              if (tabVisible) {
                pushAlert(r);
              } else {
                fireDesktopAlert(r);
              }
            }
          }
        }

        // Build the next prevUnread map. Stale-echoed sessions preserve
        // their OLD low value so a subsequent real delta still fires.
        const prevMap = prevUnreadRef.current;
        const nextMap = new Map<string, number>();
        for (const r of rows) {
          if (staleEchoed.has(r.id)) {
            nextMap.set(r.id, prevMap.get(r.id) ?? 0);
          } else {
            nextMap.set(r.id, r.unread_count);
          }
        }
        prevUnreadRef.current = nextMap;
        sessionsRef.current = rows;

        setSessions((prev) => (sessionsChanged(prev, rows) ? rows : prev));
        initialLoadedRef.current = true;
        if (background) setError(null);
      } catch (e) {
        if (isLatest() && !background) {
          const aborted = controller.signal.aborted;
          setError(
            aborted
              ? "Request timed out — please try again."
              : (e as Error)?.message ?? "Failed to load sessions",
          );
        }
      } finally {
        clearTimeout(timeoutId);
        if (isLatest() && !background) setRefreshing(false);
      }
    },
    [enabled, pushAlert, scheduleFlash, fireDesktopAlert, startRingingSession],
  );

  const refreshSessions = useCallback(() => {
    void loadSessions(false);
  }, [loadSessions]);

  const mutateSession = useCallback(
    (id: string, patch: Partial<ChatSession>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? ({ ...s, ...patch } as ChatSession) : s)),
      );
    },
    [],
  );

  const markSeen = useCallback((sessionId: string) => {
    setFlashIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    firstSeenRef.current.delete(sessionId);
    lastPingAtRef.current.delete(sessionId);

    // Reset the delta tracker. Without this, the pre-mark high-water
    // value persists and swallows every subsequent alert until a message
    // exceeds it — the "sounds stop firing after N messages" regression.
    prevUnreadRef.current.set(sessionId, 0);

    // Snapshot current last_message_at so poll rows whose last_message_at
    // is not strictly newer than this snapshot (i.e. stale echoes from a
    // not-yet-committed mark-read RPC) can be identified and ignored.
    const snap = sessionsRef.current.find((s) => s.id === sessionId);
    markSeenLastAtRef.current.set(sessionId, snap?.last_message_at ?? null);

    // Kill the urgent ring immediately — this is the single choke point
    // for stop conditions a/b/c (agent opens, agent replies via
    // post_agent_chat_message, session marked read). The 30s natural
    // expiry path is the fourth and does not route through here.
    stopRingingSession(sessionId);

    const n = activeNotifsRef.current.get(sessionId);
    if (n) {
      try { n.close(); } catch { /* ignore */ }
      activeNotifsRef.current.delete(sessionId);
    }
  }, [stopRingingSession]);

  // Poll loop.
  useEffect(() => {
    if (!enabled) return;
    void loadSessions(false);
    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      void loadSessions(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, loadSessions]);

  // Title badge.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const compute = () => {
      const pending = sessions.some(
        (s) => s.unread_count > 0 && s.id !== selectedIdRef.current,
      );
      const hidden = document.visibilityState !== "visible";
      const base = originalTitleRef.current || document.title;
      document.title = pending && hidden ? `(•) ${base}` : base;
    };
    compute();
    const onVis = () => compute();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("blur", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, [sessions]);

  const requestDesktopAlerts = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const res = await Notification.requestPermission();
      if (mountedRef.current) setNotifPermission(res as NotifPermission);
    } catch {
      // ignore
    }
  }, []);

  return {
    sessions,
    refreshing,
    error,
    refreshSessions,
    mutateSession,
    flashIds,
    markSeen,
    alerts,
    dismissAlert,
    notifPermission,
    requestDesktopAlerts,
  };
}
