/**
 * VisitorSoundMonitor — admin-wide invisible monitor that fires the
 * new-visitor chime regardless of which admin tab is mounted.
 *
 * Why this exists:
 *   - Previously the visitor chime lived inside LiveVisitorsPanel's
 *     poll loop. The chime only fired when the admin was on the
 *     /admin-orders?tab=communications&sub=live tab. On every other
 *     admin page (Orders, Analytics, Chats, Emails, Contact, etc.)
 *     visitor landings were silent — defeating the operational purpose.
 *
 * What it does:
 *   - Subscribes to the shared liveVisitorsPoll engine. Only one
 *     get_live_visitors poll runs in the whole app, regardless of how
 *     many subscribers are attached.
 *   - On each snapshot, detects newly-arrived session_ids and calls
 *     playVisitorLand(session_id). notificationSounds enforces the 90s
 *     per-session dedupe so this is safe to call on every tick.
 *   - First snapshot is treated specially: it fires for visitors whose
 *     first_seen_at is within RECENT_ARRIVAL_WINDOW_MS of monitor mount,
 *     so a visitor who landed seconds before the admin opened the page
 *     still pings.
 *
 * What it does NOT do:
 *   - Render anything (returns null).
 *   - Mutate visitor data.
 *   - Override the AdminSoundControls visitor toggle — playVisitorLand
 *     respects isSoundEnabled("visitor") + mute + volume internally.
 *
 * Mount: once in AdminApp and once in AdminChatGate (App.tsx). Self-
 * gates on /admin* pathname so the public site never instantiates the
 * monitor's polling.
 *
 * Duplicate-sound safety:
 *   - The 90s per-session dedupe inside notificationSounds.playVisitorLand
 *     is the authoritative guard. Even if a future component also fires
 *     playVisitorLand for the same session_id, only the first wins.
 *   - LiveVisitorsPanel no longer fires its own visitor chime (the sound
 *     responsibility was moved here — single source of truth).
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  subscribeLiveVisitors,
  type LiveVisitorsSnapshot,
} from "../../lib/liveVisitorsPoll";
import { playVisitorLand } from "../../lib/notificationSounds";

const RECENT_ARRIVAL_WINDOW_MS = 30_000;

function shouldRun(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (pathname.startsWith("/admin")) return true;
  // Admin subdomain — AdminApp mounts at "/" too.
  const host = window.location.hostname.toLowerCase();
  return host.startsWith("admin.") || host === "admin.pawtenant.com";
}

export default function VisitorSoundMonitor() {
  const { pathname } = useLocation();
  const active = shouldRun(pathname);

  // Refs kept across snapshots so we never re-fire for a known visitor.
  const seenSessionsRef = useRef<Set<string>>(new Set());
  const baselineSetRef = useRef<boolean>(false);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) return;
    // Reset on every (re)activation so a navigation OUT of admin and back
    // doesn't replay alerts for visitors who were already on the site
    // before the admin returned.
    seenSessionsRef.current = new Set();
    baselineSetRef.current = false;
    mountedAtRef.current = Date.now();

    const handle = (snap: LiveVisitorsSnapshot): void => {
      try {
        const visitors = snap.visitors;
        const currentIds = new Set<string>();
        for (const v of visitors) {
          if (typeof v.session_id === "string" && v.session_id.length > 0) {
            currentIds.add(v.session_id);
          }
        }

        if (!baselineSetRef.current) {
          // First snapshot after activation: fire only for visitors who
          // landed in the recent-arrival window. Pre-existing visitors
          // are silently baselined.
          const threshold = mountedAtRef.current - RECENT_ARRIVAL_WINDOW_MS;
          for (const v of visitors) {
            if (!v.session_id) continue;
            const firstSeenMs = v.first_seen_at
              ? Date.parse(v.first_seen_at)
              : NaN;
            if (Number.isFinite(firstSeenMs) && firstSeenMs >= threshold) {
              playVisitorLand(v.session_id);
            }
          }
          seenSessionsRef.current = currentIds;
          baselineSetRef.current = true;
          return;
        }

        // Subsequent snapshots: fire for any session_id we haven't
        // seen yet in this monitor session. notificationSounds dedupes
        // for 90s per session_id, so re-runs after navigation away and
        // back are also safe.
        const seen = seenSessionsRef.current;
        for (const id of currentIds) {
          if (!seen.has(id)) {
            playVisitorLand(id);
          }
        }
        seenSessionsRef.current = currentIds;
      } catch {
        // Sound is best-effort. A failure here must never break the
        // host shell.
      }
    };

    const unsubscribe = subscribeLiveVisitors(handle);
    return () => {
      unsubscribe();
    };
  }, [active]);

  return null;
}
