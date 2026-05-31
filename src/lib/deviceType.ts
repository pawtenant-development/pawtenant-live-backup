import { useEffect, useState } from "react";

/**
 * Device-type helper (COS-049 Phase 2 frontend guard).
 *
 * Used by the /company Time-In / Time-Out card to gate attendance actions
 * behind a desktop/laptop browser. Mobile and tablet users may still view
 * the company portal — they just cannot clock in/out from there.
 *
 * This is a UX-level guard only. Backend / RPC-level enforcement is
 * COS-050 (deferred).
 *
 * Detection combines two signals:
 *   1. navigator.userAgent — primary block for phones / tablets. UA
 *      patterns: iPhone, iPad, Android (with `Mobile` → phone, without
 *      → tablet), Windows Phone, Mobile Safari. UA is checked FIRST
 *      so an iPad in desktop-mode UA still blocks via the explicit
 *      `\bipad\b` rule.
 *   2. matchMedia("(pointer: fine), (any-pointer: fine)") — desktop
 *      classifier for non-phone/tablet UAs. Pointer-fine covers any
 *      mouse / trackpad / pen, so a real laptop or desktop is
 *      classified correctly even at narrow / split-screen widths.
 *      Viewport width is intentionally NOT gated — a developer at
 *      800 px split-screen on a real laptop is still a desktop.
 *
 * SSR-safe: every access to `window` and `navigator` is guarded by
 * `typeof window !== "undefined"`. Returns the strict default of
 * "desktop" when neither signal is available, so server-rendered
 * markup is not gated.
 */

export type DeviceType = "desktop" | "mobile" | "tablet";

// Comma in a media query is OR; matches when EITHER the primary pointer
// is fine, OR any available pointer is fine (catches 2-in-1s / tablets
// with a mouse attached). No width gate — viewport size shouldn't block
// a real laptop user in a narrow window.
const DESKTOP_MEDIA_QUERY = "(pointer: fine), (any-pointer: fine)";

function classifyByUserAgent(ua: string): DeviceType | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();

  // iPad — explicit match. iPadOS 13+ may report a desktop UA, in which
  // case this branch won't fire and we fall through to matchMedia logic.
  if (/\bipad\b/.test(lower)) return "tablet";

  // iPhone / iPod → mobile.
  if (/\b(iphone|ipod)\b/.test(lower)) return "mobile";

  // Windows Phone → mobile.
  if (/windows phone/.test(lower)) return "mobile";

  // Android: presence of "Mobile" substring distinguishes phone from tablet.
  if (/android/.test(lower)) {
    return /mobile/.test(lower) ? "mobile" : "tablet";
  }

  // Generic mobile-safari hint without iPhone/iPad keyword.
  if (/mobile safari/.test(lower)) return "mobile";

  return null;
}

/**
 * One-shot synchronous classification. Safe to call from a render path
 * — pure read of `window` / `navigator`, no side effects.
 */
export function detectDeviceType(): DeviceType {
  if (typeof window === "undefined") return "desktop";

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const uaClass = classifyByUserAgent(ua);

  let matchesDesktop = false;
  try {
    if (typeof window.matchMedia === "function") {
      matchesDesktop = window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    }
  } catch {
    // matchMedia not supported — treat as non-desktop only if UA says so.
    matchesDesktop = false;
  }

  // If the UA explicitly identifies a phone or tablet, trust it. This
  // catches the iPadOS desktop-mode case (UA looks like macOS but the
  // explicit \bipad\b match in classifyByUserAgent already returned
  // "tablet").
  if (uaClass === "mobile" || uaClass === "tablet") return uaClass;

  // Otherwise fall back to the pointer-fine media query. Viewport width
  // is intentionally not part of this gate — a real laptop in a narrow
  // window or split-screen still has a fine pointer.
  if (matchesDesktop) return "desktop";

  // No desktop signal and no specific mobile UA → conservative "mobile".
  return "mobile";
}

/**
 * React hook wrapper around `detectDeviceType`. Re-evaluates on
 * `resize` and `orientationchange` so 2-in-1 laptops that detach a
 * keyboard, or a phone rotating into landscape, update immediately.
 */
export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(() => detectDeviceType());

  useEffect(() => {
    if (typeof window === "undefined") return;

    function update() {
      setDevice(detectDeviceType());
    }

    let mql: MediaQueryList | null = null;
    try {
      if (typeof window.matchMedia === "function") {
        mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
        if (typeof mql.addEventListener === "function") {
          mql.addEventListener("change", update);
        } else if (typeof mql.addListener === "function") {
          // Safari < 14 fallback.
          mql.addListener(update);
        }
      }
    } catch {
      mql = null;
    }

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    // Catch any classification drift between SSR/initial-render and the
    // first client effect.
    update();

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (mql) {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", update);
        } else if (typeof mql.removeListener === "function") {
          mql.removeListener(update);
        }
      }
    };
  }, []);

  return device;
}

/**
 * Single source of truth for the COS-049 policy: only desktop/laptop
 * browsers may submit Time In / Time Out actions. Mobile and tablet
 * are explicitly disallowed.
 */
export function isClockInAllowed(device: DeviceType): boolean {
  return device === "desktop";
}
