/**
 * soundPrefs — single source of truth for admin notification-sound
 * preferences. Persists to localStorage. Pure module, zero side effects
 * outside the prefs key.
 *
 * Used by:
 *   - chatSounds.ts (chat doorbell + soft-click gates)
 *   - notificationSounds.ts (visitor chime + ops bell gates)
 *   - AdminSoundControls.tsx (UI surface)
 *
 * Design:
 *   - In-memory cache so hot-path play paths don't hit JSON.parse every time.
 *   - Pubsub so the AdminSoundControls UI reflects external mutations
 *     (e.g. another tab toggles mute) without forcing a poll.
 *   - Safe on SSR (`typeof window` guard).
 *   - Never throws.
 */

const STORAGE_KEY = "pt_admin_sound_prefs_v1";

export type SoundType = "chat" | "visitor" | "consultation" | "contact";
export const ALL_SOUND_TYPES: SoundType[] = ["chat", "visitor", "consultation", "contact"];

export interface SoundPrefs {
  /** Global kill-switch. When true, every play path returns early. */
  muted: boolean;
  /** 0..1 multiplier applied to oscillator gain. */
  volume: number;
  /** Per-channel enable/disable. Default true. */
  enabled: Record<SoundType, boolean>;
  /**
   * Whether the admin has opted in to OS-level browser notifications.
   * Used as a visual + audible fallback for tabs in the background where
   * in-page audio may be throttled. Defaults to false — the admin must
   * explicitly enable the toggle, which then triggers
   * Notification.requestPermission().
   */
  desktopNotificationsEnabled: boolean;
}

const DEFAULTS: SoundPrefs = {
  muted: false,
  volume: 0.8,
  enabled: { chat: true, visitor: true, consultation: true, contact: true },
  desktopNotificationsEnabled: false,
};

let cache: SoundPrefs | null = null;
const listeners = new Set<(p: SoundPrefs) => void>();

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.volume;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function read(): SoundPrefs {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = { ...DEFAULTS, enabled: { ...DEFAULTS.enabled } };
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULTS, enabled: { ...DEFAULTS.enabled } };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    cache = {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULTS.muted,
      volume:
        typeof parsed.volume === "number"
          ? clamp01(parsed.volume)
          : DEFAULTS.volume,
      enabled: { ...DEFAULTS.enabled, ...(parsed.enabled ?? {}) },
      desktopNotificationsEnabled:
        typeof parsed.desktopNotificationsEnabled === "boolean"
          ? parsed.desktopNotificationsEnabled
          : DEFAULTS.desktopNotificationsEnabled,
    };
    return cache;
  } catch {
    cache = { ...DEFAULTS, enabled: { ...DEFAULTS.enabled } };
    return cache;
  }
}

function writeAndNotify(next: SoundPrefs): void {
  cache = next;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* localStorage full / blocked — keep in-memory cache, swallow error */
  }
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      /* listener bug — must not block others */
    }
  }
}

/** Returns a shallow copy so external callers can't mutate the cache. */
export function getSoundPrefs(): SoundPrefs {
  const p = read();
  return {
    muted: p.muted,
    volume: p.volume,
    enabled: { ...p.enabled },
    desktopNotificationsEnabled: p.desktopNotificationsEnabled,
  };
}

/** Patch update. Unknown keys are ignored. Returns the new snapshot. */
export function setSoundPrefs(
  patch: Partial<Omit<SoundPrefs, "enabled">> & {
    enabled?: Partial<Record<SoundType, boolean>>;
  },
): SoundPrefs {
  const cur = read();
  const next: SoundPrefs = {
    muted: typeof patch.muted === "boolean" ? patch.muted : cur.muted,
    volume:
      typeof patch.volume === "number" ? clamp01(patch.volume) : cur.volume,
    enabled: { ...cur.enabled, ...(patch.enabled ?? {}) },
    desktopNotificationsEnabled:
      typeof patch.desktopNotificationsEnabled === "boolean"
        ? patch.desktopNotificationsEnabled
        : cur.desktopNotificationsEnabled,
  };
  writeAndNotify(next);
  return next;
}

/** Subscribe to prefs changes. Returns an unsubscribe fn. */
export function subscribeSoundPrefs(cb: (p: SoundPrefs) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Hot-path checks used by the sound modules. Defined as small functions
 * so play paths can do `if (!isSoundEnabled('visitor')) return;` cheaply.
 */
export function isSoundEnabled(t: SoundType): boolean {
  const p = read();
  if (p.muted) return false;
  return p.enabled[t] !== false;
}

export function getVolumeScale(): number {
  const p = read();
  if (p.muted) return 0;
  return p.volume;
}
