/**
 * liveVisitorsPoll — single shared poller for the get_live_visitors RPC.
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
 *   - Reference counted: starts polling on the first subscriber, stops
 *     on the last unsubscribe.
 *   - Pauses fetches while the tab is hidden; resumes (with an immediate
 *     fetch) on visibilitychange → visible.
 *   - New subscribers receive the most-recent cached snapshot synchronously
 *     so admin UI does not flicker empty while waiting for the next tick.
 *   - refreshNow() lets the manual Refresh button force-fetch ahead of
 *     the timer.
 *   - Never throws. RPC errors are surfaced through the callback as
 *     `error` and via the cached snapshot.
 *
 * Scope: read-only. No mutation, no writes, no realtime channels. This
 * is a polling consolidator only.
 */

import { supabase } from "./supabaseClient";

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

function ensureRunning(): void {
  if (typeof window === "undefined") return;
  installVisibilityHook();
  if (timerId !== null) return;
  // Kick off immediately so first subscriber sees data fast.
  void fetchOnce();
  timerId = window.setInterval(tick, POLL_MS);
}

function ensureStopped(): void {
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
