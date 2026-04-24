/**
 * Shared admin chat alert sounds.
 *
 * Two acoustically distinct tones so an admin can tell alerts apart
 * without looking:
 *   - playDoorbell()  — first unread in a session (new conversation).
 *                       Two-tone "ding-dong" triangle bell, ~1.2s, loud.
 *   - playSoftClick() — subsequent messages in a session already alerted.
 *                       Very short high square-wave tick, ~30ms.
 *
 * Reliability contract (the reason this file exists as a wrapper around
 * raw Web Audio):
 *
 *   1. Every call to playDoorbell/playSoftClick results in a sound —
 *      either immediately, or queued until the AudioContext can resume.
 *      No silent drops. The previous `if (!unlocked) return;` gate was
 *      the primary source of missed sounds: an admin who hadn't yet
 *      clicked/keyed anywhere on the page would never hear the first
 *      few messages. That gate is gone.
 *
 *   2. AudioContext state is re-checked on every play. Suspended /
 *      interrupted contexts are resumed; closed contexts are recreated.
 *      Browsers (Chrome after backgrounding, Safari during interrupts)
 *      can move the context out of "running" at any time.
 *
 *   3. If a play cannot run right now (no user gesture yet, resume
 *      rejected, state didn't reach "running"), it is queued. The queue
 *      holds at most one entry — doorbell wins over click, because a
 *      "first message in a session" beat is more important than a
 *      follow-up tick. The queue is flushed on the next user gesture,
 *      visibilitychange → visible, or window focus.
 *
 *   4. Never throws. Never rejects. All error paths fall through to
 *      either an immediate retry path or the pending queue.
 */

let audioCtx: AudioContext | null = null;
let listenersInstalled = false;

type PendingSound = "doorbell" | "click";
let pending: PendingSound | null = null;

function queuePending(kind: PendingSound): void {
  // Doorbell always wins — "new conversation" is the higher-priority cue.
  if (kind === "doorbell") pending = "doorbell";
  else if (pending !== "doorbell") pending = "click";
}

function flushPending(): void {
  const k = pending;
  pending = null;
  if (k === "doorbell") scheduleDoorbell();
  else if (k === "click") scheduleClick();
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  // A closed context cannot be resumed — only replaced.
  if (!audioCtx || audioCtx.state === "closed") {
    try {
      audioCtx = new Ctx();
    } catch {
      audioCtx = null;
      return null;
    }
  }
  return audioCtx;
}

/**
 * Run `schedule` against a running AudioContext. If the context is not
 * running, resume it first; if resume fails or the state doesn't reach
 * "running", queue the sound so it can play on the next user gesture,
 * visibility change, or focus event.
 */
function withRunningCtx(
  schedule: (ctx: AudioContext) => void,
  kind: PendingSound,
): void {
  const ctx = getCtx();
  if (!ctx) {
    queuePending(kind);
    return;
  }
  if (ctx.state === "running") {
    try { schedule(ctx); } catch { /* ignore */ }
    return;
  }
  // suspended | interrupted | anything else — try to resume.
  let p: Promise<void> | null = null;
  try { p = ctx.resume(); } catch { p = null; }
  if (!p) {
    queuePending(kind);
    return;
  }
  p.then(
    () => {
      if (ctx.state === "running") {
        try { schedule(ctx); } catch { /* ignore */ }
      } else {
        queuePending(kind);
      }
    },
    () => {
      queuePending(kind);
    },
  );
}

function scheduleDoorbell(): void {
  withRunningCtx((ctx) => {
    const t0 = ctx.currentTime + 0.01;

    const ring = (startAt: number, freq: number, dur: number): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, startAt);
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.exponentialRampToValueAtTime(0.26, startAt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
      o.connect(g).connect(ctx.destination);
      o.start(startAt);
      o.stop(startAt + dur + 0.06);
    };

    ring(t0, 880, 0.55);
    ring(t0 + 0.38, 659, 0.8);
  }, "doorbell");
}

function scheduleClick(): void {
  withRunningCtx((ctx) => {
    const t0 = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2400, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + 0.05);
  }, "click");
}

/**
 * Install all the "something changed, maybe audio can run now" hooks.
 * Listeners stay on for the life of the page — they're cheap, capture
 * phase, and idempotent (resume() on a running context is a no-op).
 */
function installListeners(): void {
  if (listenersInstalled) return;
  if (typeof window === "undefined") return;
  listenersInstalled = true;

  const tryResumeAndFlush = (): void => {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "running") {
      flushPending();
      return;
    }
    try {
      ctx.resume().then(
        () => {
          if (ctx.state === "running") flushPending();
        },
        () => { /* ignore — will retry on next event */ },
      );
    } catch {
      // ignore
    }
  };

  const gestureEvents = [
    "click",
    "keydown",
    "touchstart",
    "pointerdown",
  ] as const;
  for (const evt of gestureEvents) {
    window.addEventListener(evt, tryResumeAndFlush, true);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tryResumeAndFlush();
    });
  }
  window.addEventListener("focus", tryResumeAndFlush);
}

installListeners();

export function isAudioUnlocked(): boolean {
  return !!audioCtx && audioCtx.state === "running";
}

/**
 * Doorbell — classic two-tone "ding-dong" chime.
 *
 * Triangle wave for warm bell-like harmonics. Two sustained notes
 * (A5 880 Hz → E5 659 Hz) with long exponential decay. Loud and
 * clearly distinct from the soft click in pitch, duration, AND timbre.
 */
export function playDoorbell(): void {
  scheduleDoorbell();
}

/**
 * Soft click — a very short, bright square-wave tick.
 *
 * Square wave (very different timbre from the triangle doorbell),
 * high pitch (2400 Hz), ~30 ms, just loud enough to be reliably
 * audible without being annoying.
 */
export function playSoftClick(): void {
  scheduleClick();
}
