/**
 * PawChatLauncher — TINY public chat bubble.
 *
 * PageSpeed Phase 6 (2026-05-26): the heavy panel + thread hook +
 * attachment view + Supabase RPC code used to live in PawChatWidget,
 * which fired get_visitor_chat_thread + get_visitor_chat_attachments
 * the moment the widget mounted (before any user click). All of that
 * is now in PawChatPanel and only loaded when the visitor clicks the
 * bubble.
 *
 * What this file ships in the launcher chunk:
 *   - React core (already in the public bundle)
 *   - react-router-dom useLocation (already in the public bundle)
 *
 * What this file deliberately does NOT import on first paint:
 *   - usePawChatThread        → no get_visitor_chat_thread RPC
 *   - chatAttachments / view  → no ChatAttachments chunk
 *   - supabase client         → no RPC client wiring at all
 *
 * The launcher does not display an unread badge — the previous badge
 * required polling the visitor thread on mount, which is exactly what
 * Phase 6 is eliminating. If the visitor leaves and returns to a tab
 * with an unread agent reply, they will see it on next click.
 *
 * Live visitor presence (bump_visitor_pulse) and record_event for
 * page_view are owned by App.tsx and visitorSession.ts — unrelated to
 * this launcher and unchanged.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Heavy panel — only fetched on the first bubble click.
const PawChatPanel = lazy(() => import("./PawChatPanel"));

const HIDDEN_ROUTE_PREFIXES = [
  "/admin",
  "/admin-login",
  "/admin-orders",
  "/admin-doctors",
  "/admin-guide",
  "/provider-portal",
  "/provider-login",
  "/my-orders",
  "/customer-login",
  "/reset-password",
  "/account/checkout",
  // Company OS employee portal — internal, must not show the customer chat bubble.
  "/company",
];

const BRAND_PRIMARY = "#FF6A2B";
const BRAND_PRIMARY_DK = "#e85a1e";
const IS_DEV = import.meta.env.DEV;

export default function PawChatLauncher() {
  const { pathname } = useLocation();
  const isHidden = HIDDEN_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  const [open, setOpen] = useState(false);

  // Scroll-gate the launcher FAB on mobile so the orange chat bubble
  // does not compete with the hero CTA in the first viewport. Desktop
  // launcher behavior is unchanged (always visible). Both default to
  // false so the first paint never flashes the bubble at the top.
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  // Hide while the Step 3 payment surface is on screen so chat does
  // not compete with the secure payment area.
  const [paymentInView, setPaymentInView] = useState(false);

  useEffect(() => {
    const SCROLL_THRESHOLD_PX = 500;
    const mql = window.matchMedia("(max-width: 767px)");
    const updateMobile = () => setIsMobileViewport(mql.matches);
    updateMobile();
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      setScrolledPastHero(y > SCROLL_THRESHOLD_PX);

      const payEl = document.getElementById("step3-payment-section");
      if (payEl) {
        const rect = payEl.getBoundingClientRect();
        const vh = window.innerHeight;
        setPaymentInView(rect.top < vh && rect.bottom > 0);
      } else {
        setPaymentInView(false);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (mql.addEventListener) mql.addEventListener("change", updateMobile);
    else mql.addListener(updateMobile);
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (mql.removeEventListener) mql.removeEventListener("change", updateMobile);
      else mql.removeListener(updateMobile);
    };
  }, []);

  useEffect(() => {
    if (IS_DEV) console.debug("[PawChat] launcher mounted (panel not yet loaded)");
  }, []);

  const launcherVisible = (!isMobileViewport || scrolledPastHero) && !paymentInView;

  if (isHidden) return null;

  function handleOpen() {
    setOpen(true);
    if (IS_DEV) console.debug("[PawChat] panel opened — chat thread RPC will fire");
    // Fire the visitor milestone via a dynamic import so the launcher
    // chunk does not statically link to visitorSession (which pulls in
    // supabaseClient + attributionStore). The event is fire-and-forget.
    void import("../../lib/visitorSession").then((m) => {
      try { m.markChatOpened(); } catch { /* swallow */ }
    });
  }

  return (
    <>
      {!open && launcherVisible && (
        <button
          type="button"
          aria-label="Open live chat"
          onClick={handleOpen}
          className="fixed right-4 bottom-[90px] md:bottom-5 z-50 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center cursor-pointer"
          style={{
            backgroundColor: BRAND_PRIMARY,
            transition: "opacity 200ms ease-out, transform 200ms ease-out, background-color 150ms ease-out",
            opacity: 1,
            transform: "translateY(0)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = BRAND_PRIMARY_DK)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = BRAND_PRIMARY)
          }
        >
          <i className="ri-chat-3-line text-2xl" />
        </button>
      )}

      {open && (
        <Suspense fallback={null}>
          <PawChatPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
