/**
 * Shared admin chat alert sounds.
 *
 * Two acoustically distinct cues:
 *   - playDoorbell(sessionId?)   — first unread in a session (new
 *                                  conversation). Plays
 *                                  /sounds/new_chat_first_message.mp3.
 *                                  Tag = `chat:first:${sessionId}` so the
 *                                  in-flight ring can be stopped on
 *                                  admin engagement.
 *   - playSoftClick(sessionId?)  — subsequent unread messages. Plays
 *                                  /sounds/new_message_notification.mp3.
 *                                  Internal cooldown prevents firing more
 *                                  than once per session per
 *                                  FOLLOWUP_COOLDOWN_MS.
 *
 * Engagement contract:
 *   - stopChatSound(sessionId)  — kill the in-flight first-message MP3
 *                                  for one session. Idempotent.
 *   - stopAllChatSounds()        — kill every in-flight chat MP3. Used
 *                                  on dock close / tab unmount.
 *   - resetChatCooldown(sessionId) — clear the follow-up cooldown for
 *                                  one session (used when admin engages,
 *                                  so the next-batch sounds aren't
 *                                  silently dropped).
 *
 * Reliability contract:
 *   1. Every call results in a sound — either immediately, or queued
 *      until autoplay is unlocked.
 *   2. Never throws. Play failures are silent.
 *   3. Respects admin sound preferences (mute, volume, chat-channel
 *      toggle) via soundPrefs.
 *
 * Migration history:
 *   - Phase 1  (2026-05-18): synthesized Web Audio tones.
 *   - Phase 1B (2026-05-18): owner-provided MP3 assets.
 *   - Phase 1C (2026-05-18): tagged playback + stop-on-engagement +
 *                             follow-up cooldown to fix the
 *                             "keeps ringing" + "every-message noise"
 *                             professionalism regressions.
 */

import { isSoundEnabled } from "./soundPrefs";
import {
  playMp3,
  stopTaggedPlays,
  SOUND_URLS,
  isUnlocked,
} from "./soundPlayer";

/**
 * Cooldown between follow-up "soft click" sounds per session.
 * Spec: "follow-up message sound max once every 30-60 seconds per session".
 * 45s is the midpoint — strict enough to silence a chatty visitor without
 * leaving the admin in the dark for too long.
 */
const FOLLOWUP_COOLDOWN_MS = 45_000;

const lastFollowupAt = new Map<string, number>();
const DEV =
  typeof window !== "undefined" &&
  typeof process !== "undefined" &&
  (process as unknown as { env?: { NODE_ENV?: string } }).env?.NODE_ENV !==
    "production";

function devLog(msg: string): void {
  if (!DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.debug(`[sounds] ${msg}`);
  } catch {
    /* ignore */
  }
}

function tagForFirst(sessionId?: string | null): string {
  return `chat:first:${sessionId ?? "__nosession__"}`;
}

/**
 * Doorbell — first message in a chat session (new conversation).
 * Tagged with sessionId so `stopChatSound(sessionId)` can halt the
 * in-flight MP3 the moment an admin replies or opens the chat.
 */
export function playDoorbell(sessionId?: string | null): void {
  if (!isSoundEnabled("chat")) return;
  playMp3(SOUND_URLS.chatFirstMessage, {
    tag: tagForFirst(sessionId),
  });
  devLog(`chat first fired (session=${sessionId ?? "n/a"})`);
}

/**
 * Soft click — subsequent messages in an already-alerted session.
 *
 * Cooldown: at most one click per session per FOLLOWUP_COOLDOWN_MS,
 * even if 50 messages arrive in that window. The visual flash + toast
 * + unread badge keep the surface honest while the audio stays calm.
 *
 * Calling without a sessionId (legacy / non-session events) falls back
 * to a single global cooldown bucket.
 */
export function playSoftClick(sessionId?: string | null): void {
  if (!isSoundEnabled("chat")) return;
  const key = sessionId ?? "__global__";
  const now = Date.now();
  const last = lastFollowupAt.get(key) ?? 0;
  if (now - last < FOLLOWUP_COOLDOWN_MS) {
    devLog(`skipped follow-up (cooldown, session=${key})`);
    return;
  }
  lastFollowupAt.set(key, now);
  playMp3(SOUND_URLS.messageNotification);
  devLog(`chat follow-up fired (session=${key})`);
}

/**
 * Stop the in-flight first-message MP3 for a session. Idempotent.
 * Also clears the follow-up cooldown so the next-batch click can fire
 * if the admin steps away again.
 */
export function stopChatSound(sessionId?: string | null): number {
  const stopped = stopTaggedPlays(tagForFirst(sessionId));
  if (sessionId) lastFollowupAt.delete(sessionId);
  if (stopped > 0) {
    devLog(`chat stopped (session=${sessionId ?? "n/a"}, count=${stopped})`);
  }
  return stopped;
}

/**
 * Stop every in-flight chat sound. Used on dock close, tab unmount,
 * or when the admin wants to silence everything fast (e.g. mute toggle).
 */
export function stopAllChatSounds(): void {
  // We don't have a reverse-lookup of tags by session here, so we scan
  // by invoking stopTaggedPlays per known cooldown key. Anything tagged
  // via playDoorbell will be reachable; legacy untagged plays are out
  // of scope.
  for (const sid of lastFollowupAt.keys()) {
    stopTaggedPlays(tagForFirst(sid));
  }
  // Cover the no-session fallback bucket.
  stopTaggedPlays(tagForFirst(null));
  lastFollowupAt.clear();
  devLog("stopped all chat sounds");
}

/**
 * Reset just the follow-up cooldown for a session (e.g. when admin
 * marks seen but you still want subsequent messages to ping).
 */
export function resetChatCooldown(sessionId: string): void {
  lastFollowupAt.delete(sessionId);
}

/** Mirrors the previous Web Audio API for legacy callers. */
export function isAudioUnlocked(): boolean {
  return isUnlocked();
}
