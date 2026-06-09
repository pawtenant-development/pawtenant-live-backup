import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  ensureVisitorSession,
  pulseVisitorSession,
  isInternalAdminPath,
} from "@/lib/visitorSession";
import { trackPageView } from "@/lib/trackEvent";

/**
 * DeferredServices — PageSpeed Phase 4 (2026-06-09).
 *
 * Holds the Supabase-backed, NON-conversion-critical app services that used to
 * run synchronously inside the App shell (UTMCapture + AuthHandler). Moving them
 * into this lazy component code-splits the Supabase client (~35 KB gzip:
 * auth-js/realtime-js/postgrest/storage) OUT of the homepage entry bundle, so
 * the entry is smaller → React mounts sooner → the hero (LCP = the H1 text)
 * paints sooner. App.tsx mounts this a beat AFTER first paint, so the Supabase
 * chunk also downloads after the LCP window.
 *
 * What STAYS synchronous in App.tsx (NOT here) — conversion-critical, and none
 * of it needs the Supabase client:
 *   • attribution capture (captureFromUrl → sessionStorage)
 *   • conversion-route marketing-script force-load (window.__ptLoadMarketing)
 *   • Meta Pixel PageView (firePageView)
 *   • the gtag()/fbq() queue stubs (live in index.html)
 *
 * What lives HERE (Supabase-backed, non-conversion, safe to start a beat late):
 *   • visitor session record + per-route pulse + 30s visible-only heartbeat
 *   • structured page_view (record_event) per route, idle-deferred
 *   • auth onAuthStateChange (PASSWORD_RECOVERY) redirect subscription
 *     (the SYNCHRONOUS recovery-hash/code redirect stays in App's AuthHandler)
 */
export default function DeferredServices() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // ── Visitor session record + per-route pulse + structured page_view ──────
  useEffect(() => {
    // Record the visitor session once per browser session (fire-and-forget).
    ensureVisitorSession();
    // Visitor heartbeat — bump last_seen_at + current_page immediately on
    // route change so the live list reflects the new path right away.
    try {
      pulseVisitorSession(pathname);
    } catch {
      /* swallow */
    }
    // Structured page_view event for the admin Attribution/Journey tab. Pushed
    // behind requestIdleCallback (setTimeout fallback). Skipped for admin /
    // portal routes via isInternalAdminPath.
    try {
      if (!isInternalAdminPath(pathname)) {
        const firePV = () => {
          try {
            trackPageView({ pathname });
          } catch {
            /* swallow */
          }
        };
        const w = window as unknown as {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout?: number },
          ) => number;
        };
        if (typeof w.requestIdleCallback === "function") {
          w.requestIdleCallback(firePV, { timeout: 2000 });
        } else {
          window.setTimeout(firePV, 1500);
        }
      }
    } catch {
      /* swallow */
    }
  }, [pathname]);

  // ── 30s visitor heartbeat. Visible-only. Single timer per browser tab. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const HEARTBEAT_MS = 30_000;
    let timerId: number | null = null;

    const tick = () => {
      try {
        if (
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        )
          return;
        pulseVisitorSession(window.location.pathname);
      } catch {
        /* swallow */
      }
    };

    const start = () => {
      if (timerId !== null) return;
      timerId = window.setInterval(tick, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        try {
          pulseVisitorSession(window.location.pathname);
        } catch {
          /* swallow */
        }
        start();
      } else {
        stop();
      }
    };

    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, []);

  // ── Auth onAuthStateChange (PASSWORD_RECOVERY) subscription ──────────────
  // The synchronous recovery-hash / ?code redirect stays in App's AuthHandler;
  // this is the async event-driven backup.
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        if (!window.location.pathname.includes("/reset-password")) {
          navRef.current("/reset-password" + window.location.hash, {
            replace: true,
          });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
