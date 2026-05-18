/**
 * visitorMonitor — admin-wide new-visitor alert singleton.
 *
 * Why this module exists:
 *   The previous design (VisitorSoundMonitor.tsx) kept its dedupe state
 *   in React refs and bound the subscription lifecycle to a useEffect
 *   gated by [active]. That made the monitor fragile under any condition
 *   that remounted the component (StrictMode double-invoke, parent
 *   re-mount, the GeoGate spinner toggling on slow geo lookups, etc.),
 *   and it tied "is the realtime + polling pipeline actually running"
 *   to React render cycles. Symptom: the chime appeared to start firing
 *   only after the admin opened Live Visitors — because that's the
 *   second subscriber to the shared liveVisitorsPoll engine and its
 *   mount forced a fresh snapshot delivery to every listener.
 *
 * Fix:
 *   Lift the entire monitor state out of React into a pure JS module
 *   singleton. `startVisitorMonitor()` and `stopVisitorMonitor()` are
 *   idempotent — call them as many times as you like. State is at
 *   module scope, so even if every React tree remounts, the singleton
 *   keeps its dedupe set, baseline flag, and active subscription.
 *
 *   The React layer (VisitorSoundMonitor.tsx) becomes a thin bootstrap:
 *   "we are on an admin route → ensure the monitor is started." It
 *   never owns the data. The Communications → Live Visitors panel is
 *   now purely a display surface — the monitor runs regardless of
 *   whether that panel has ever been mounted.
 *
 * Side effects on call:
 *   - Subscribes to liveVisitorsPoll (which in turn opens the Supabase
 *     Realtime channel + the 5 s polling loop on first subscriber).
 *   - On each snapshot, diffs the visible session_id list against the
 *     last seen set and fires playVisitorLand() + title-badge bump +
 *     opt-in desktop notify for any genuinely new session.
 *   - Baselines pre-existing sessions on first snapshot (only fires for
 *     visitors whose first_seen_at is within RECENT_WINDOW_MS).
 *   - notificationSounds.playVisitorLand() has its own 90 s per-session
 *     dedupe cache, so repeated calls for the same id are safe.
 *
 * Never throws. Safe on SSR (window guards).
 */

import {
  subscribeLiveVisitors,
  type LiveVisitorsSnapshot,
} from "./liveVisitorsPoll";
import { playVisitorLand } from "./notificationSounds";
import { incrementBadge } from "./titleBadge";
import { notify } from "./desktopNotify";
import { getSoundPrefs, isSoundEnabled } from "./soundPrefs";

const RECENT_WINDOW_MS = 30_000;

// ── 2026-05-19 ADMIN-SOUND-DEDUP-SESSION ────────────────────────────────
// Previously `seenSessions` was a Set rebuilt from each snapshot. When a
// visitor briefly dropped out of the 90s activity window (background tab
// heartbeat pause) and reappeared, the Set was empty for that session_id
// → the visitor looked "new" → ding fired again.
//
// New design: a Map<session_id, lastSeenMs> kept in module memory for
// SESSION_RETENTION_MS (= 30 min). Sessions ARE remembered across
// activity-window drops, so brief disappearances don't re-fire the ding.
// Entries older than retention are evicted on each snapshot, which means
// genuinely returning visitors (after a long absence) WILL get a fresh
// "returned visitor" ding — matching the user spec for BUG 4.
const SESSION_RETENTION_MS = 30 * 60 * 1000;

const IS_DEV =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

let started = false;
let unsubscribe: (() => void) | null = null;
let seenSessions = new Map<string, number>();
let baselineSet = false;
let startedAtMs = 0;

function isDocHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "visible";
}

/**
 * Visual + opt-in OS notification path. Audio is already handled by the
 * caller via playVisitorLand() (with its own 90 s dedupe). These two
 * paths only fire when the document is hidden — when the admin is
 * actively looking at the page, the live UI already conveys the event.
 */
function fireFallbacks(sessionId: string): void {
  const channelOn = isSoundEnabled("visitor");
  const hidden = isDocHidden();
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[visitorMonitor] fallback check", {
      sessionId,
      channelOn,
      hidden,
    });
  }
  if (!channelOn) return;
  if (!hidden) return;
  incrementBadge();
  const desktopOn = getSoundPrefs().desktopNotificationsEnabled;
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[visitorMonitor] badge incremented", {
      sessionId,
      desktopNotificationsEnabled: desktopOn,
    });
  }
  if (desktopOn) {
    notify("New visitor on PawTenant", {
      body: "A visitor just landed. Open the admin tab to view details.",
      tag: `visitor-${sessionId}`,
    });
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.debug("[visitorMonitor] desktop notify fired", { sessionId });
    }
  }
}

function onSnapshot(snap: LiveVisitorsSnapshot): void {
  try {
    const visitors = snap.visitors;
    const nowMs = Date.now();

    // Evict sessions we have NOT seen within the retention window. This
    // is what allows a genuinely returning visitor (gone for >30 min) to
    // re-fire as "new" without flooding the admin while a single
    // visitor is still actively browsing.
    for (const [id, lastMs] of seenSessions) {
      if (nowMs - lastMs > SESSION_RETENTION_MS) {
        seenSessions.delete(id);
      }
    }

    const currentIds: string[] = [];
    for (const v of visitors) {
      if (typeof v.session_id === "string" && v.session_id.length > 0) {
        currentIds.push(v.session_id);
      }
    }

    if (!baselineSet) {
      // First snapshot since start. Fire ONLY for visitors whose
      // first_seen_at is within RECENT_WINDOW_MS of the start time.
      // Older pre-existing sessions are silently baselined.
      const threshold = startedAtMs - RECENT_WINDOW_MS;
      for (const v of visitors) {
        if (!v.session_id) continue;
        const firstSeenMs = v.first_seen_at
          ? Date.parse(v.first_seen_at)
          : NaN;
        if (Number.isFinite(firstSeenMs) && firstSeenMs >= threshold) {
          playVisitorLand(v.session_id);
          fireFallbacks(v.session_id);
        }
        seenSessions.set(v.session_id, nowMs);
      }
      baselineSet = true;
      return;
    }

    // Subsequent snapshots — fire for any session we have NOT seen
    // within the retention window. notificationSounds.playVisitorLand
    // also dedupes per session_id for VISITOR_DEDUPE_MS as a secondary
    // guard against rapid re-detection if the window logic ever drifts.
    for (const id of currentIds) {
      if (!seenSessions.has(id)) {
        if (IS_DEV) {
          // eslint-disable-next-line no-console
          console.debug("[visitorMonitor] new visitor", {
            sessionId: id,
            hidden: isDocHidden(),
          });
        }
        playVisitorLand(id);
        fireFallbacks(id);
      }
      // Refresh the last-seen timestamp on every appearance — keeps the
      // session alive in the map even if it briefly drops out of the
      // activity window on the next snapshot.
      seenSessions.set(id, nowMs);
    }
  } catch {
    // Sound is best-effort. A failure here must never break callers.
  }
}

/**
 * Boot the monitor. Idempotent — safe to call from React useEffects,
 * route change handlers, or auth state listeners. Returns true on the
 * call that actually started the singleton, false on subsequent calls.
 *
 * The subscription persists across React re-mounts. To tear it down,
 * call stopVisitorMonitor() — typically only when the admin navigates
 * away from any admin route entirely (e.g. follows a link to the
 * public homepage from inside the admin shell).
 */
export function startVisitorMonitor(): boolean {
  if (typeof window === "undefined") return false;
  if (started) return false;
  started = true;
  seenSessions = new Map();
  baselineSet = false;
  startedAtMs = Date.now();
  try {
    unsubscribe = subscribeLiveVisitors(onSnapshot);
  } catch {
    // subscribeLiveVisitors is non-throwing today, but defensively
    // unwind state so a future change doesn't leave us half-started.
    started = false;
    unsubscribe = null;
    return false;
  }
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[visitorMonitor] started");
  }
  return true;
}

/**
 * Tear down the singleton. Idempotent. Drops the liveVisitorsPoll
 * subscription; if this monitor was the only subscriber, that engine
 * also stops its poll timer + Realtime channel via its own refcount.
 */
export function stopVisitorMonitor(): void {
  if (!started) return;
  started = false;
  baselineSet = false;
  seenSessions = new Map();
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch {
      /* ignore */
    }
    unsubscribe = null;
  }
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[visitorMonitor] stopped");
  }
}

/** True when the singleton is actively subscribed. */
export function isVisitorMonitorRunning(): boolean {
  return started;
}
