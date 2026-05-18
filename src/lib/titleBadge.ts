/**
 * titleBadge — manages a "(N) " prefix on document.title for unseen
 * admin events. Visual fallback for admins whose browser is throttling
 * audio (background tab autoplay policies, OS Do Not Disturb, etc.).
 *
 * Behavior:
 *   - incrementBadge() bumps the counter and updates the title.
 *   - clearBadge() resets the counter back to the captured base title.
 *   - The counter auto-clears on visibilitychange → visible.
 *   - Capped at 99 so the title never explodes.
 *
 * Caveats:
 *   - Pure module. Safe on SSR (`typeof document` guard).
 *   - Never throws. Title is best-effort UI sugar.
 *   - Idempotent re-init via `installed` flag.
 */

let unseenCount = 0;
let installed = false;
let baseTitle = "PawTenant Admin";
let baseCaptured = false;

function captureBase(): void {
  if (typeof document === "undefined") return;
  if (baseCaptured) return;
  // Strip any pre-existing (N) prefix in case of HMR or re-entry.
  const stripped = document.title.replace(/^\(\d+\)\s+/, "");
  if (stripped) baseTitle = stripped;
  baseCaptured = true;
}

function render(): void {
  if (typeof document === "undefined") return;
  captureBase();
  document.title = unseenCount > 0 ? `(${unseenCount}) ${baseTitle}` : baseTitle;
}

function install(): void {
  if (installed) return;
  if (typeof document === "undefined") return;
  installed = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      clearBadge();
    }
  });
}

install();

/** Increment the unseen counter (capped at 99) and update the title. */
export function incrementBadge(): void {
  unseenCount = Math.min(unseenCount + 1, 99);
  render();
}

/** Set the unseen counter to zero and restore the base title. */
export function clearBadge(): void {
  if (unseenCount === 0) return;
  unseenCount = 0;
  render();
}

/** Current unseen count. Mostly useful for tests / diagnostics. */
export function getBadgeCount(): number {
  return unseenCount;
}
