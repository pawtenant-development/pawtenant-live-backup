/**
 * notificationSounds — operational alert sounds for the admin portal.
 *
 * Sibling of chatSounds.ts. The public API (playVisitorLand, playOpsAlert,
 * previewVisitorChime, previewOpsBell) is unchanged from the original
 * synthesized-tone implementation — callers in LiveVisitorsPanel,
 * ConsultationRequestsPanel, ContactRequestsTab continue to work without
 * edits.
 *
 * Migration note (2026-05-18):
 *   Real MP3 assets at /sounds/ replace the previous Web Audio
 *   oscillator tones. All playback now routes through soundPlayer.playMp3.
 *
 * Sound mapping:
 *   - playVisitorLand(sessionId)         → /sounds/door_bell_new_visitor.mp3
 *   - playOpsAlert("consultation", id)   → /sounds/new_message_notification.mp3
 *   - playOpsAlert("contact", id)        → /sounds/new_message_notification.mp3
 *   - playOpsAlert("sms" | "generic", k) → /sounds/new_message_notification.mp3
 *
 * Preserved behavior:
 *   - Per-channel prefs gate (visitor / consultation / contact toggles).
 *   - Mute / volume from soundPrefs.
 *   - TTL dedupe cache (visitor 90s, ops 24h).
 *   - Pending queue cap, autoplay unlock, and visibility/focus flushing
 *     are owned by soundPlayer.
 *
 * Never throws. Play failures are silent.
 */

import {
  isSoundEnabled,
  type SoundType,
} from "./soundPrefs";
import { playMp3, SOUND_URLS } from "./soundPlayer";

// ── Dedupe layer ────────────────────────────────────────────────────────

/**
 * Keyed cache. Each entry stores the expiry timestamp (epoch ms).
 * `Number.MAX_SAFE_INTEGER` ≈ lifetime-of-page-session.
 */
const dedupeCache = new Map<string, number>();

function canFire(key: string, ttlMs: number): boolean {
  const now = Date.now();
  // Light prune. O(n) where n is small (a few hundred at most).
  if (dedupeCache.size > 0 && Math.random() < 0.05) {
    for (const [k, exp] of dedupeCache.entries()) {
      if (exp < now) dedupeCache.delete(k);
    }
  }
  const existing = dedupeCache.get(key);
  if (existing !== undefined && existing > now) return false;
  const exp =
    ttlMs >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : now + ttlMs;
  dedupeCache.set(key, exp);
  return true;
}

// Per-session visitor ding dedupe. Bumped from 90s (which equalled the
// get_live_visitors activity window) to 30 min so a visitor whose
// background-tab heartbeat briefly drops them out of the activity window
// and then returns does not re-fire the chime. User spec (ADMIN-SOUND-
// DEDUP-SESSION): ding once per genuinely new session, allow re-ding
// only after a long inactivity, never while still active.
const VISITOR_DEDUPE_MS = 30 * 60 * 1000;
const OPS_DEDUPE_MS = 24 * 60 * 60 * 1000;

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Fire the "new visitor landed" chime.
 * Deduped per session_id for 90 seconds.
 * Safe to call on every poll — only the first new appearance plays.
 */
export function playVisitorLand(sessionId: string): void {
  if (!sessionId) return;
  if (!isSoundEnabled("visitor")) return;
  if (!canFire(`visitor:${sessionId}`, VISITOR_DEDUPE_MS)) return;
  try {
    playMp3(SOUND_URLS.visitorLand);
  } catch {
    /* sound is best-effort — must never break the host panel */
  }
}

/**
 * Fire the operational-alert bell for consultation / contact / SMS / etc.
 *
 * `type` controls which user-pref toggle gates the sound. `key` is the
 * dedupe key (typically the row id). Deduped for 24h per (type, key).
 *
 * Supported types:
 *   - "consultation" — consultation_requests INSERT
 *   - "contact"      — contact_submissions INSERT
 *   - "sms"          — inbound SMS (gated on consultation pref for now;
 *                      future toggle if SMS volume grows)
 *   - "generic"      — fallback (gated on consultation pref)
 */
export function playOpsAlert(
  type: "consultation" | "contact" | "sms" | "generic",
  key: string,
): void {
  if (!key) return;
  const prefKey: SoundType = type === "contact" ? "contact" : "consultation";
  if (!isSoundEnabled(prefKey)) return;
  if (!canFire(`ops:${type}:${key}`, OPS_DEDUPE_MS)) return;
  try {
    playMp3(SOUND_URLS.messageNotification);
  } catch {
    /* sound is best-effort */
  }
}

/** For QA / settings preview — fires once, ignores dedupe. */
export function previewVisitorChime(): void {
  if (!isSoundEnabled("visitor")) return;
  try {
    playMp3(SOUND_URLS.visitorLand);
  } catch {
    /* ignore */
  }
}

/** For QA / settings preview — fires once, ignores dedupe. */
export function previewOpsBell(): void {
  if (!isSoundEnabled("consultation") && !isSoundEnabled("contact")) return;
  try {
    playMp3(SOUND_URLS.messageNotification);
  } catch {
    /* ignore */
  }
}

/** For QA / settings preview — plays the chat-first-message sound. */
export function previewChatFirstMessage(): void {
  if (!isSoundEnabled("chat")) return;
  try {
    playMp3(SOUND_URLS.chatFirstMessage);
  } catch {
    /* ignore */
  }
}
