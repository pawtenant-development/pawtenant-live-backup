/**
 * soundPlayer — HTMLAudioElement playback for admin notification sounds.
 *
 * Replaces the previous Web Audio synthesized tones with real MP3
 * playback. Owner-provided assets live in public/sounds/ and are
 * preloaded on admin shell mount so first-fire latency is browser-cache
 * speed, not network fetch.
 *
 * Public API:
 *   - SOUND_URLS, ALL_SOUND_URLS — single source of truth for filenames.
 *   - preloadSounds(urls)        — warm the browser audio cache.
 *   - playMp3(url, volOverride?) — fire-and-forget play. Volume comes
 *                                  from soundPrefs by default.
 *   - unlockSounds(urls)         — explicit gesture-bound unlock (button).
 *   - isUnlocked()               — current unlock status.
 *   - subscribeUnlockState(cb)   — for UI to reflect unlock changes.
 *
 * Reliability contract:
 *   1. Every accepted call either plays immediately or queues until the
 *      next user gesture / visibility / focus event. Pending queue is
 *      capped at 3 to prevent storms on focus return.
 *   2. Each play uses a fresh Audio node cloned off the preloaded source
 *      element, so overlapping calls do not cut each other off.
 *   3. Never throws. All play failures are silent (best-effort sound).
 *   4. Safe on SSR (`typeof window` guard).
 */

import { getVolumeScale } from "./soundPrefs";

export const SOUND_URLS = {
  /** New visitor lands on the site. */
  visitorLand: "/sounds/door_bell_new_visitor.mp3",
  /** First chat message in a session (new chat starts). */
  chatFirstMessage: "/sounds/new_chat_first_message.mp3",
  /**
   * Follow-up chat messages, consultation requests, contact submissions,
   * inbound SMS, generic operational alerts.
   */
  messageNotification: "/sounds/new_message_notification.mp3",
} as const;

export const ALL_SOUND_URLS: readonly string[] = [
  SOUND_URLS.visitorLand,
  SOUND_URLS.chatFirstMessage,
  SOUND_URLS.messageNotification,
];

// Preloaded source elements per URL. Used to (a) warm the HTTP cache,
// (b) serve as the .src template for cloned playback nodes.
const sources = new Map<string, HTMLAudioElement>();

// Tagged in-flight audio nodes. Keyed by tag string. Used so callers
// can stop a still-playing sound (e.g. stop the chat-first MP3 when
// the admin replies). Nodes self-deregister on `ended`.
const taggedNodes = new Map<string, Set<HTMLAudioElement>>();

// Pending plays queued while autoplay is locked. Only queued on a VISIBLE
// tab where the next user gesture will flush them — never on a hidden tab
// (queueing in a hidden tab caused "stale ding" replays when the admin
// switched back to the admin tab minutes later).
type Pending = { url: string; vol: number; tag?: string };
let pending: Pending[] = [];
const PENDING_CAP = 3;

const IS_DEV =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

function shortName(url: string): string {
  const i = url.lastIndexOf("/");
  return i >= 0 ? url.slice(i + 1) : url;
}

function isHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "visible";
}

// Unlock state — flips to true once any successful .play() resolves OR
// the user clicks the Enable Sounds button.
let unlocked = false;
let listenersInstalled = false;
const unlockListeners = new Set<(u: boolean) => void>();

function notifyUnlock(): void {
  for (const cb of unlockListeners) {
    try {
      cb(unlocked);
    } catch {
      /* listener bug — must not block others */
    }
  }
}

function ensureSource(url: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  const existing = sources.get(url);
  if (existing) return existing;
  try {
    const el = new Audio(url);
    el.preload = "auto";
    // Best-effort load. Browsers may defer until first play() but the
    // hint keeps subsequent plays snappy.
    try {
      el.load();
    } catch {
      /* ignore */
    }
    sources.set(url, el);
    return el;
  } catch {
    return null;
  }
}

function clampVol(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function queuePending(p: Pending): void {
  pending.push(p);
  if (pending.length > PENDING_CAP) {
    pending = pending.slice(-PENDING_CAP);
  }
}

function flushPending(): void {
  if (pending.length === 0) return;
  const q = pending;
  pending = [];
  for (const p of q) {
    fireOnce(p.url, p.vol, p.tag);
  }
}

function registerTagged(tag: string, node: HTMLAudioElement): void {
  let set = taggedNodes.get(tag);
  if (!set) {
    set = new Set<HTMLAudioElement>();
    taggedNodes.set(tag, set);
  }
  set.add(node);
  const cleanup = (): void => {
    const s = taggedNodes.get(tag);
    if (!s) return;
    s.delete(node);
    if (s.size === 0) taggedNodes.delete(tag);
  };
  node.addEventListener("ended", cleanup, { once: true });
  node.addEventListener("pause", cleanup, { once: true });
}

function fireOnce(url: string, vol: number, tag?: string): void {
  if (typeof window === "undefined") return;
  if (vol <= 0) return;
  const src = ensureSource(url);
  if (!src) return;
  const hidden = isHidden();
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[soundPlayer] play attempt", {
      url: shortName(url),
      vol,
      hidden,
      unlocked,
    });
  }
  // Clone via new Audio() so two rapid calls don't clip each other.
  // The cloned node uses the same URL → browser HTTP cache serves it
  // instantly from memory after the first load.
  let node: HTMLAudioElement;
  try {
    node = new Audio(src.src || url);
  } catch (err) {
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.debug("[soundPlayer] new Audio() threw — dropping", {
        url: shortName(url),
        hidden,
        err: String(err),
      });
    }
    return;
  }
  try {
    node.preload = "auto";
    node.volume = clampVol(vol);
    if (tag) registerTagged(tag, node);
    const p = node.play();
    if (p && typeof p.then === "function") {
      p.then(
        () => {
          if (IS_DEV) {
            // eslint-disable-next-line no-console
            console.debug("[soundPlayer] play resolved", {
              url: shortName(url),
              hidden,
            });
          }
          if (!unlocked) {
            unlocked = true;
            notifyUnlock();
            flushPending();
          }
        },
        (err) => {
          if (IS_DEV) {
            // eslint-disable-next-line no-console
            console.debug("[soundPlayer] play rejected", {
              url: shortName(url),
              hidden,
              unlocked,
              err: String(err),
            });
          }
          // Only queue when the tab is VISIBLE. The legitimate case here
          // is "page just loaded, user hasn't clicked anywhere yet" —
          // the next gesture will unlock + flush.
          //
          // When the tab is HIDDEN we drop the play silently. The visitor
          // monitor has already fired its visual fallbacks (title badge +
          // opt-in desktop notification) before this point, so the event
          // is already surfaced. Queueing here would just replay a stale
          // ding minutes later when the admin switches back to the admin
          // tab — exactly the bug this change fixes.
          if (!hidden) {
            queuePending({ url, vol, tag });
          }
        },
      );
    } else {
      // Older browsers — assume success.
      if (!unlocked) {
        unlocked = true;
        notifyUnlock();
        flushPending();
      }
    }
  } catch (err) {
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.debug("[soundPlayer] play threw", {
        url: shortName(url),
        hidden,
        err: String(err),
      });
    }
    if (!hidden) {
      queuePending({ url, vol, tag });
    }
  }
}

function installListeners(): void {
  if (listenersInstalled) return;
  if (typeof window === "undefined") return;
  listenersInstalled = true;

  const onGesture = (): void => {
    // Any genuine user gesture is sufficient to unlock <audio> playback
    // in modern browsers. Flush whatever is queued so the admin hears
    // the most recent (capped) batch. This is the ONLY flush path —
    // we deliberately do NOT auto-flush on visibilitychange/focus,
    // because the only reason pending would contain anything is "page
    // just loaded, no gesture yet" and the next click/keypress flushes
    // it naturally. Auto-flushing on tab focus replayed stale visitor
    // dings minutes after the event, which is the bug this section
    // fixes — see the symmetric drop in fireOnce().
    if (!unlocked) {
      unlocked = true;
      notifyUnlock();
    }
    flushPending();
  };

  const gestureEvents = [
    "click",
    "keydown",
    "touchstart",
    "pointerdown",
  ] as const;
  for (const evt of gestureEvents) {
    window.addEventListener(evt, onGesture, true);
  }
}

installListeners();

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Warm the browser audio cache by allocating preloaded source elements
 * for each URL. Call once on admin shell mount.
 */
export function preloadSounds(urls: readonly string[] = ALL_SOUND_URLS): void {
  for (const u of urls) ensureSource(u);
}

/**
 * Fire a sound. Volume defaults to the prefs-derived scale (0..1, with
 * mute = 0). Optional `tag` lets the caller later stop the in-flight
 * audio via `stopTaggedPlays(tag)` — used by the chat module to halt
 * the first-message ring when an admin replies.
 *
 * Never throws.
 */
export function playMp3(
  url: string,
  optsOrVolume?: number | { volumeOverride?: number; tag?: string },
): void {
  let vol: number;
  let tag: string | undefined;
  if (typeof optsOrVolume === "number") {
    vol = clampVol(optsOrVolume);
  } else if (optsOrVolume && typeof optsOrVolume === "object") {
    vol =
      typeof optsOrVolume.volumeOverride === "number"
        ? clampVol(optsOrVolume.volumeOverride)
        : getVolumeScale();
    tag = optsOrVolume.tag;
  } else {
    vol = getVolumeScale();
  }
  fireOnce(url, vol, tag);
}

/**
 * Stop every currently-playing audio node registered under `tag`.
 * Idempotent — no-op if nothing is playing for that tag.
 * Also drops any pending (autoplay-blocked) entries for that tag so a
 * delayed unlock doesn't re-fire a sound the admin already handled.
 */
export function stopTaggedPlays(tag: string): number {
  let stopped = 0;
  const set = taggedNodes.get(tag);
  if (set) {
    for (const node of set) {
      try {
        node.pause();
        node.currentTime = 0;
      } catch {
        /* ignore */
      }
      stopped++;
    }
    taggedNodes.delete(tag);
  }
  if (pending.length > 0) {
    pending = pending.filter((p) => p.tag !== tag);
  }
  return stopped;
}

/** Convenience — stop every in-flight tagged sound. */
export function stopAllTaggedPlays(): void {
  const tags = Array.from(taggedNodes.keys());
  for (const t of tags) stopTaggedPlays(t);
}

/**
 * Explicit user-gesture unlock. Plays each preloaded sound at zero
 * volume so the browser registers them as user-initiated. After this,
 * subsequent playMp3 calls work even without further user gestures.
 *
 * Returns true if at least one element was successfully unlocked.
 */
export async function unlockSounds(
  urls: readonly string[] = ALL_SOUND_URLS,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let anyOk = false;
  for (const u of urls) {
    const src = ensureSource(u);
    if (!src) continue;
    try {
      const node = new Audio(src.src || u);
      node.preload = "auto";
      node.volume = 0;
      const p = node.play();
      if (p && typeof p.then === "function") {
        try {
          await p;
          anyOk = true;
        } catch {
          /* this URL failed to unlock — keep trying the rest */
        }
      } else {
        anyOk = true;
      }
      try {
        node.pause();
        node.currentTime = 0;
      } catch {
        /* ignore */
      }
    } catch {
      /* try next URL */
    }
  }
  if (anyOk && !unlocked) {
    unlocked = true;
    notifyUnlock();
  }
  flushPending();
  return anyOk;
}

export function isUnlocked(): boolean {
  return unlocked;
}

/** Subscribe to unlock-state changes. Returns an unsubscribe fn. */
export function subscribeUnlockState(cb: (u: boolean) => void): () => void {
  unlockListeners.add(cb);
  return () => {
    unlockListeners.delete(cb);
  };
}
