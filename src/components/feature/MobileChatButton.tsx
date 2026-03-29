import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

const PORTAL_ROUTES = ["/admin", "/provider-portal", "/provider-login", "/my-orders", "/customer-login"];

// Height of the sticky CTA bar (px) — enough for button + safe area
const STICKY_BAR_HEIGHT = 72;
const BUTTON_SIZE = 52;

// Selectors for the Readdy AI widget floating button — hide it on mobile
// so it doesn't clash with this custom Tawk chat button
const READDY_SELECTORS = [
  '[id*="readdy"]',
  '[class*="readdy"]',
  '[id*="vapi"]',
  '[class*="vapi"]',
  'iframe[src*="readdy.ai"]',
  'script[src*="readdy.ai"]',
];

function hideReaddyWidget() {
  READDY_SELECTORS.forEach((sel) => {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
    });
  });
}

export default function MobileChatButton() {
  const { pathname } = useLocation();
  const isPortal = PORTAL_ROUTES.some((r) => pathname.startsWith(r));

  // Default: anchored at bottom-right, above the sticky bar
  const defaultBottom = STICKY_BAR_HEIGHT + 12;
  const defaultRight = 12;

  // dragging offset from the default anchor
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });

  // Hide the Readdy AI widget on mobile so only this button shows
  useEffect(() => {
    // Run immediately and after staggered delays (widget loads async)
    hideReaddyWidget();
    const timers = [200, 500, 1000, 2000, 3500].map((d) =>
      window.setTimeout(hideReaddyWidget, d)
    );

    // Watch for new elements added by the widget script
    const observer = new MutationObserver(hideReaddyWidget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }, [offset]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  }, []);

  const onTouchEnd = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const openChat = useCallback(() => {
    if (Math.abs(offset.x - dragRef.current.ox) > 6 || Math.abs(offset.y - dragRef.current.oy) > 6) return; // was a drag, not a tap
    const api = (window as unknown as { Tawk_API?: { maximize?: () => void; toggle?: () => void } }).Tawk_API;
    if (api?.maximize) api.maximize();
    else if (api?.toggle) api.toggle();
  }, [offset]);

  if (isPortal) return null;

  // Clamp so the button doesn't fly off screen
  const right = Math.max(4, defaultRight - offset.x);
  const bottom = Math.max(STICKY_BAR_HEIGHT + 6, defaultBottom - offset.y);

  return (
    <div
      className="md:hidden fixed z-[9998] touch-none select-none"
      style={{ right, bottom, width: BUTTON_SIZE, height: BUTTON_SIZE }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={openChat}
    >
      <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <i className="ri-chat-1-fill text-white text-xl"></i>
        </div>
      </div>
    </div>
  );
}
