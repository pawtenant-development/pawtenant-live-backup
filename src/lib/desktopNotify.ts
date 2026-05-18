/**
 * desktopNotify — thin wrapper around the Web Notifications API.
 *
 * Browser notifications fire an OS-level toast even when the page tab
 * is in the background, so they're the reliable visual+audible fallback
 * when in-page audio gets throttled or blocked.
 *
 * Privacy / consent contract:
 *   - We NEVER call Notification.requestPermission() implicitly. The
 *     admin must click the toggle in AdminSoundControls first.
 *   - notify() is a no-op until the user has both opted-in in soundPrefs
 *     AND granted browser permission.
 *
 * Pure module. SSR-safe. Never throws.
 */

export type NotifPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/** Returns the current browser-level permission status. */
export function getNotificationPermission(): NotifPermission {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return Notification.permission as NotifPermission;
  } catch {
    return "unsupported";
  }
}

/**
 * Prompt the user for browser-notification permission. MUST be called
 * from inside a user gesture (click/keydown) — modern browsers reject
 * programmatic requests outside one.
 */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return (result as NotifPermission) ?? "default";
  } catch {
    return "denied";
  }
}

/**
 * Fire-and-forget OS notification. No-op if the browser doesn't support
 * notifications or permission isn't granted. Caller is responsible for
 * checking soundPrefs.desktopNotificationsEnabled before invoking.
 *
 * `tag` lets the OS coalesce repeated notifications for the same key
 * (e.g. multiple visitor landings → one updated toast).
 *
 * Auto-dismisses after 8 s so the notification tray doesn't pile up.
 */
export function notify(
  title: string,
  options?: { body?: string; tag?: string; icon?: string },
): void {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: options?.icon ?? "/favicon-32x32.png",
      silent: false,
    });
    window.setTimeout(() => {
      try {
        n.close();
      } catch {
        /* ignore */
      }
    }, 8000);
    // Click the notification → focus this tab.
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* notification API can throw in odd browser states — swallow */
  }
}
