/**
 * liveVisitorsPoll — shared poller + Realtime channel for the live
 * visitor list.
 *
 * Why a singleton:
 *   - Before this module, every component that wanted visitor data
 *     polled get_live_visitors on its own setInterval. That made
 *     LiveVisitorsPanel the only surface that fired the visitor chime —
 *     so admins on Orders / Analytics / Chats / etc. never heard a
 *     landing alert.
 *   - It also meant two simultaneous polls when the admin had Live
 *     Visitors open while a background sound monitor was running.
 *
 * Design contract:
 *   - One setInterval for the whole app, regardless of subscriber count.
 *   - One Realtime channel (postgres_changes INSERT on
 *     public.visitor_sessions) for the whole app, also lifecycle-bound
 *     to the same subscriber refcount as the poller. WebSocket
 *     connections are NOT background-tab throttled by Chrome, so the
 *     Realtime path is the primary mechanism that fires the new-visitor
 *     chime when the admin is on another tab. The 5s poll is fallback
 *     for cold start + reconciliation.
 *   - Reference counted: starts polling + Realtime on the first
 *     subscriber, stops both on the last unsubscribe.
 *   - Pauses timer-driven fetches while the tab is hidden; Realtime
 *     INSERT events still trigger an immediate fetchOnce() so background
 *     subscribers still see new visitor data without waiting to refocus.
 *   - On visibilitychange → visible, also fires an immediate fetch.
 *   - New subscribers receive the most-recent cached snapshot synchronously
 *     so admin UI does not flicker empty while waiting for the next tick.
 *   - refreshNow() lets the manual Refresh button force-fetch ahead of
 *     the timer.
 *   - Never throws. RPC and Realtime errors are surfaced through the
 *     callback as `error` and via the cached snapshot. Realtime failure
 *     never blocks polling.
 *
 * Scope: read-only. No mutation, no writes. Realtime is INSERT-only on
 * visitor_sessions for the new-visitor push. Updates flow through the
 * 5s poll snapshot as before.
 */

import { supabase } from "./supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface LiveVisitor {
  session_id: string;
  current_page: string | null;
  last_seen_at: string;
  first_seen_at: string;
  page_count: number;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  ref: string | null;
  landing_url: string | null;
  referrer: string | null;
  device: string | null;
  geo: { country?: string } | null;
  chat_opened_at: string | null;
  first_message_at: string | null;
  assessment_started_at: string | null;
  paid_at: string | null;
  // ── 2026-05-19 identity join ─────────────────────────────────────────
  // Populated by the LEFT JOIN orders inside get_live_visitors when a
  // non-archived/non-refunded/non-cancelled order row exists with
  // matching session_id. Lets the Live Visitors panel render the
  // customer's real name + email + confirmation_id + status instead of
  // an anonymous "Visitor · #<id>" once assessment Step 2 has saved.
  // All fields are null when no linked order exists yet.
  // ── 2026-05-19 ATTR-RESUME-SESSION-IDENTITY-SYNC ──────────────────
  // Order LATERAL now matches by session_id OR confirmation_id so
  // resume / recovery visitors (whose session_id is not on orders)
  // also surface the customer's name + email. order_id and
  // order_payment_intent_id let the panel render the order chip
  // directly from the RPC — no separate fetch needed.
  order_id: string | null;
  order_confirmation_id: string | null;
  order_first_name: string | null;
  order_last_name: string | null;
  order_email: string | null;
  order_status: string | null;
  order_paid_at: string | null;
  order_doctor_status: string | null;
  order_payment_intent_id: string | null;
  // ── 2026-05-19 CHAT-IDENTITY-NO-DOWNGRADE ──────────────────────────
  // Populated by the LEFT JOIN chat_sessions inside get_live_visitors
  // when a chat session exists for the same visitor_session_id with at
  // least one of (visitor_name, visitor_email) set. Lets the panel
  // resolver fall back to chat identity priority (3, 4) when no
  // linked order identity exists (priority 1, 2).
  chat_visitor_name: string | null;
  chat_visitor_email: string | null;
}

export interface LiveVisitorsSnapshot {
  visitors: LiveVisitor[];
  error: string | null;
  fetchedAt: number;
}

type Listener = (snap: LiveVisitorsSnapshot) => void;

const POLL_MS = 5_000;
const WINDOW_SECONDS = 90;

const listeners = new Set<Listener>();
let timerId: number | null = null;
let lastSnapshot: LiveVisitorsSnapshot | null = null;
let inflight: Promise<void> | null = null;
let visibilityHooked = false;
let realtimeChannel: RealtimeChannel | null = null;

function isVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

async function fetchOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  // Coalesce concurrent calls (e.g. refreshNow() during a timer tick).
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_live_visitors", {
        p_window_seconds: WINDOW_SECONDS,
        p_limit: 200,
      });
      const next: LiveVisitorsSnapshot = {
        visitors: error ? lastSnapshot?.visitors ?? [] : ((data ?? []) as LiveVisitor[]),
        error: error ? error.message : null,
        fetchedAt: Date.now(),
      };
      lastSnapshot = next;
      for (const cb of listeners) {
        try {
          cb(next);
        } catch {
          /* listener bug — must not block others */
        }
      }
    } catch (e) {
      const next: LiveVisitorsSnapshot = {
        visitors: lastSnapshot?.visitors ?? [],
        error: (e as Error)?.message ?? "Failed to load",
        fetchedAt: Date.now(),
      };
      lastSnapshot = next;
      for (const cb of listeners) {
        try {
          cb(next);
        } catch {
          /* ignore */
        }
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function installVisibilityHook(): void {
  if (visibilityHooked) return;
  if (typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (listeners.size === 0) return;
    // Tab returned to visible — immediate fetch so admin sees current
    // state without waiting for the next tick.
    void fetchOnce();
  });
}

function tick(): void {
  if (!isVisible()) return; // Skip — visibility hook will resume on return.
  void fetchOnce();
}

function ensureRealtime(): void {
  if (typeof window === "undefined") return;
  if (realtimeChannel) return;
  try {
    realtimeChannel = supabase
      .channel("admin:live-visitors")
      .on(
        // supabase-js type narrowing for postgres_changes payloads has been
        // relaxed in recent versions; the runtime contract is stable.
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_sessions" },
        () => {
          // INSERT just landed in postgres. The new row's full shape
          // includes columns (geo, channel, etc.) that the cached
          // snapshot uses, so the simplest reliable path is to refetch
          // get_live_visitors. fetchOnce() is coalesced via `inflight`
          // so back-to-back INSERTs don't stack RPC calls.
          void fetchOnce();
        },
      )
      .subscribe();
  } catch {
    // Realtime is best-effort. Polling fallback still runs.
    realtimeChannel = null;
  }
}

function teardownRealtime(): void {
  if (!realtimeChannel) return;
  try {
    void supabase.removeChannel(realtimeChannel);
  } catch {
    /* ignore — channel may already be torn down */
  }
  realtimeChannel = null;
}

function ensureRunning(): void {
  if (typeof window === "undefined") return;
  installVisibilityHook();
  ensureRealtime();
  if (timerId !== null) return;
  // Kick off immediately so first subscriber sees data fast.
  void fetchOnce();
  timerId = window.setInterval(tick, POLL_MS);
}

function ensureStopped(): void {
  teardownRealtime();
  if (timerId === null) return;
  if (typeof window !== "undefined") window.clearInterval(timerId);
  timerId = null;
}

/**
 * Subscribe to live-visitor poll snapshots. Returns an unsubscribe fn.
 * If a cached snapshot exists, it is delivered synchronously before
 * returning so consumers don't render an empty frame.
 */
export function subscribeLiveVisitors(cb: Listener): () => void {
  listeners.add(cb);
  if (lastSnapshot) {
    try {
      cb(lastSnapshot);
    } catch {
      /* ignore */
    }
  }
  ensureRunning();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) ensureStopped();
  };
}

/**
 * Force-refresh ahead of the next timer tick. Used by the manual
 * Refresh button in LiveVisitorsPanel. Coalesced — if a fetch is
 * already in flight, returns that promise instead of stacking calls.
 */
export function refreshNow(): Promise<void> {
  return fetchOnce();
}

/** Read the most recent snapshot synchronously. May be null on cold start. */
export function getLastSnapshot(): LiveVisitorsSnapshot | null {
  return lastSnapshot;
}

export const LIVE_VISITORS_POLL_MS = POLL_MS;
export const LIVE_VISITORS_WINDOW_SECONDS = WINDOW_SECONDS;
