/**
 * AdminChatNotifier — renders the floating toast stack for new visitor
 * messages, so alerts are visible from any admin page (Dashboard, Orders,
 * Providers, Chats tab, etc.).
 *
 * Rules:
 *   - Hidden on unauthenticated routes (/admin-login, /reset-password,
 *     /provider-login) so pre-login pages stay clean.
 *   - Active admin pages ALWAYS render the toast when the tab is visible.
 *   - Main body click → opens the mini chat dock for that session so the
 *     admin does not have to leave their current page. If another dock is
 *     already open, it is replaced (single-slot dock behavior).
 *   - Secondary "Full view" link → routes to /admin-orders?tab=chats for
 *     admins who still want the full Chats tab experience.
 *   - Desktop notification click still routes to the Chats tab (unchanged).
 *   - Toast stack is lifted above the mini dock when a session is docked,
 *     so they do not visually collide in the bottom-right.
 *
 * Sound + desktop notifications happen inside useAdminChatNotifier. This
 * component is pure presentation + the dock-action wiring.
 */

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAdminChat } from "../../context/AdminChatContext";

const CHAT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

const HIDDEN_ROUTE_PREFIXES = [
  "/admin-login",
  "/reset-password",
  "/provider-login",
];

const CHATS_TAB_URL = "/admin-orders?tab=chats";

/** Lift offset when a session is docked so toasts do not sit on top of it. */
const DOCK_LIFT_PX = 552;

/**
 * Always route to the chats tab — even if the admin is already on
 * /admin-orders but on a different tab (payments, refunds, etc.).
 * React Router no-ops same-URL navigation, so it's safe to call always.
 */
function openChatsTab(
  navigate: (to: string) => void,
  sessionId: string,
  setSelectedSessionId: (id: string | null) => void,
): void {
  setSelectedSessionId(sessionId);
  try {
    navigate(CHATS_TAB_URL);
  } catch {
    // ignore
  }
}

export default function AdminChatNotifier() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    alerts,
    dismissAlert,
    setSelectedSessionId,
    dockedSessionId,
    openDock,
    available,
  } = useAdminChat();

  // Desktop notification click handler: broadcast event → open session in Chats tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { sessionId?: string }
        | undefined;
      if (!detail?.sessionId) return;
      openChatsTab(navigate, detail.sessionId, setSelectedSessionId);
    }
    window.addEventListener("pt:admin-chat-open", onOpen as EventListener);
    return () => {
      window.removeEventListener(
        "pt:admin-chat-open",
        onOpen as EventListener,
      );
    };
  }, [navigate, setSelectedSessionId]);

  if (!available) return null;
  if (HIDDEN_ROUTE_PREFIXES.some((r) => pathname.startsWith(r))) return null;
  if (alerts.length === 0) return null;

  const bottom = dockedSessionId ? DOCK_LIFT_PX : 16;

  return (
    <>
      <style>{`
        @keyframes pt-admin-toast-in {
          from { transform: translate(0, 12px); opacity: 0; }
          to   { transform: translate(0, 0);    opacity: 1; }
        }
      `}</style>
      <div
        className="fixed z-50 flex flex-col gap-2 pointer-events-none"
        style={{
          right: 16,
          bottom,
          width: "min(360px, calc(100vw - 32px))",
        }}
        aria-live="polite"
        aria-atomic="false"
      >
        {alerts.map((a) => (
          <div
            key={a.id}
            role="alert"
            onClick={() => {
              openDock(a.sessionId);
              dismissAlert(a.id);
            }}
            className="pointer-events-auto cursor-pointer bg-white rounded-xl shadow-xl flex items-start gap-3 px-4 py-3 hover:shadow-2xl transition-shadow"
            style={{
              border: "1px solid #e5e7eb",
              borderLeftWidth: 4,
              borderLeftColor: "#3b6ea5",
              animation: "pt-admin-toast-in 0.22s ease-out",
            }}
          >
            <div className="w-8 h-8 rounded-full bg-[#e8f0f9] flex items-center justify-center flex-shrink-0">
              <i className="ri-chat-3-line text-[#3b6ea5] text-base"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#3b6ea5] mb-0.5">
                New visitor message
              </p>
              <p
                className="text-sm font-bold text-gray-900 truncate"
                style={{ fontFamily: CHAT_FONT }}
              >
                {a.label}
              </p>
              <p
                className="text-xs text-gray-600 line-clamp-2 mt-0.5"
                style={{
                  fontFamily: CHAT_FONT,
                  overflowWrap: "anywhere",
                }}
              >
                {a.preview}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-medium">
                  Click to open mini dock
                </span>
                <span className="text-[10px] text-gray-300">·</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openChatsTab(navigate, a.sessionId, setSelectedSessionId);
                    dismissAlert(a.id);
                  }}
                  title="Open the full Chats tab"
                  className="text-[10px] font-bold text-[#3b6ea5] hover:text-[#2e5a87] underline-offset-2 hover:underline cursor-pointer"
                >
                  Full view
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissAlert(a.id);
              }}
              title="Dismiss"
              className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0 leading-none text-lg cursor-pointer"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
