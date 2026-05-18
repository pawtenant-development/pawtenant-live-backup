/**
 * AdminSoundControls — small floating control for operational sound prefs.
 *
 * Scope (deliberately lightweight — see CLAUDE.md non-goals):
 *   - global mute toggle
 *   - volume slider (0..1)
 *   - per-channel enable: chat / visitor / consultation / contact
 *   - preview buttons for each operational tone (not chat — that already
 *     plays naturally when a real chat event arrives)
 *
 * NOT in scope:
 *   - per-user persistence (uses localStorage)
 *   - cross-device sync
 *   - notification center / history
 *   - desktop notifications (chat hook already owns that path)
 *
 * Render contract:
 *   - Self-gates on path: only renders on /admin* routes. Safe to mount
 *     unconditionally at the AdminApp / AdminChatGate level.
 *   - Fixed bottom-left so it does not collide with MiniChatDock
 *     (bottom-right).
 *   - Collapsed state = single icon button. Expanded state = popover.
 *   - Close-on-outside-click + Escape.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getSoundPrefs,
  setSoundPrefs,
  subscribeSoundPrefs,
  type SoundPrefs,
  type SoundType,
} from "../../lib/soundPrefs";
import {
  previewVisitorChime,
  previewOpsBell,
  previewChatFirstMessage,
} from "../../lib/notificationSounds";
import {
  preloadSounds,
  unlockSounds,
  isUnlocked,
  subscribeUnlockState,
} from "../../lib/soundPlayer";

const TYPE_LABELS: Record<SoundType, string> = {
  chat: "Chat messages",
  visitor: "New visitors",
  consultation: "Consultation requests",
  contact: "Contact submissions",
};

const TYPE_ORDER: SoundType[] = ["visitor", "chat", "consultation", "contact"];

function shouldRender(pathname: string): boolean {
  // Admin subdomain has a "/" root that the AdminApp already gates.
  // Inside the public site we only want to show this on /admin* paths.
  if (typeof window === "undefined") return false;
  if (pathname.startsWith("/admin")) return true;
  // Admin subdomain — the host check; AdminApp mounts at "/" too.
  const host = window.location.hostname.toLowerCase();
  return host.startsWith("admin.") || host === "admin.pawtenant.com";
}

export default function AdminSoundControls() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<SoundPrefs>(() => getSoundPrefs());
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());
  const [enabling, setEnabling] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Preload MP3 assets on mount so the first real alert plays instantly
  // (browser cache, not a network fetch). Idempotent — preloadSounds
  // dedupes per URL internally.
  useEffect(() => {
    preloadSounds();
  }, []);

  // Keep local state in sync with external mutations (other tabs, code
  // paths, etc.).
  useEffect(() => {
    const unsub = subscribeSoundPrefs((p) => setPrefs(p));
    return () => unsub();
  }, []);

  // Reflect autoplay-unlock state — flips to true after first user
  // gesture anywhere on the page or after the explicit Enable button.
  useEffect(() => {
    const unsub = subscribeUnlockState((u) => setUnlocked(u));
    return () => unsub();
  }, []);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleMute = useCallback(() => {
    setPrefs(setSoundPrefs({ muted: !prefs.muted }));
  }, [prefs.muted]);

  const onVolume = useCallback((next: number) => {
    setPrefs(setSoundPrefs({ volume: next }));
  }, []);

  const toggleType = useCallback(
    (t: SoundType) => {
      setPrefs(
        setSoundPrefs({
          enabled: { [t]: !prefs.enabled[t] } as Partial<
            Record<SoundType, boolean>
          >,
        }),
      );
    },
    [prefs.enabled],
  );

  // Explicit user-gesture unlock. Plays each preloaded MP3 at zero
  // volume so the browser registers a user-initiated audio context.
  // After this, all subsequent fire-and-forget plays work without a
  // gesture, even on Safari and tightened Chrome autoplay policies.
  const handleEnable = useCallback(async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      await unlockSounds();
    } catch {
      /* unlock is best-effort; UI state already reflects via subscribe */
    } finally {
      setEnabling(false);
    }
  }, [enabling]);

  if (!shouldRender(pathname)) return null;

  const muted = prefs.muted;
  const icon = muted
    ? "ri-volume-mute-line"
    : prefs.volume <= 0.05
      ? "ri-volume-down-line"
      : "ri-notification-3-line";

  return (
    <div
      ref={containerRef}
      className="fixed z-[9998] top-3 right-3 pointer-events-auto flex flex-col items-end gap-2"
      style={{ fontFamily: "inherit" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-10 inline-flex items-center gap-2 pl-3 pr-3.5 rounded-full shadow-md border transition-colors ${
          muted
            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            : unlocked
              ? "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
              : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
        }`}
        aria-label={
          muted
            ? "Sound alerts (muted)"
            : unlocked
              ? "Sound alerts"
              : "Sound alerts (click to enable)"
        }
        title={
          muted
            ? "Sound muted — click to open"
            : unlocked
              ? "Sound alerts"
              : "Click to enable sound alerts"
        }
      >
        <i className={`${icon} text-base`} />
        <span className="text-xs font-medium">
          {muted ? "Sound (muted)" : unlocked ? "Sound" : "Enable sound"}
        </span>
      </button>
      {open && (
        <div className="w-[300px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">
              Sound alerts
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <i className="ri-close-line" />
            </button>
          </div>

          {/* Enable Sounds banner — only when not yet unlocked.
              Modern browsers block audio playback until a user gesture.
              This button issues a clear, explicit gesture and warms up
              every preloaded MP3 so subsequent real alerts play
              instantly without depending on the admin's first random
              click somewhere else. */}
          {!unlocked && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <div className="flex items-start gap-2">
                <i className="ri-volume-up-line text-amber-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-amber-900">
                    Sounds need a gesture
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                    Click once to enable browser audio. Without this,
                    new-visitor / chat / consultation alerts may stay
                    silent until you click anywhere else on the page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleEnable}
                disabled={enabling || muted}
                className="mt-2 w-full text-sm font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enabling ? "Enabling…" : "Enable & test sounds"}
              </button>
            </div>
          )}
          {unlocked && (
            <div className="px-4 py-2 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <i className="ri-checkbox-circle-line text-emerald-600" />
              <span className="text-[11px] text-emerald-800">
                Audio enabled. Use Preview to test individual sounds.
              </span>
            </div>
          )}

          {/* Mute row */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-700">Mute all</span>
            <button
              type="button"
              onClick={toggleMute}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                muted ? "bg-red-500" : "bg-emerald-500"
              }`}
              aria-pressed={muted}
              aria-label="Toggle mute"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  muted ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Volume row */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-gray-700">Volume</span>
              <span className="text-xs text-gray-500 tabular-nums">
                {Math.round(prefs.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              disabled={muted}
              onChange={(e) => onVolume(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 disabled:opacity-40"
              aria-label="Volume"
            />
          </div>

          {/* Per-type toggles */}
          <div className="px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Channels
            </div>
            <ul className="space-y-1.5">
              {TYPE_ORDER.map((t) => {
                const enabled = prefs.enabled[t] !== false;
                return (
                  <li
                    key={t}
                    className="flex items-center justify-between text-sm text-gray-700"
                  >
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={muted}
                        onChange={() => toggleType(t)}
                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 disabled:opacity-40"
                      />
                      <span className={muted ? "opacity-50" : ""}>
                        {TYPE_LABELS[t]}
                      </span>
                    </label>
                    {t === "visitor" && (
                      <button
                        type="button"
                        onClick={previewVisitorChime}
                        disabled={muted || !enabled}
                        className="text-xs text-emerald-700 hover:text-emerald-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Preview new-visitor sound"
                      >
                        Preview
                      </button>
                    )}
                    {t === "chat" && (
                      <button
                        type="button"
                        onClick={previewChatFirstMessage}
                        disabled={muted || !enabled}
                        className="text-xs text-emerald-700 hover:text-emerald-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Preview first-chat-message sound"
                      >
                        Preview
                      </button>
                    )}
                    {(t === "consultation" || t === "contact") && (
                      <button
                        type="button"
                        onClick={previewOpsBell}
                        disabled={muted || !enabled}
                        className="text-xs text-emerald-700 hover:text-emerald-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Preview ops notification sound"
                      >
                        Preview
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-gray-400 mt-3 leading-snug">
              Sounds play when an admin tab is open. Stored on this device.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
