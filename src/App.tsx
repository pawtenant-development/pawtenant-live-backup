import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter, useNavigate, useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import { AdminSubdomainRoutes } from "./router/adminRoutes";
import { isAdminSubdomain } from "./lib/subdomainConfig";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ScrollToTop from "./components/feature/ScrollToTop";
import ScrollTopButton from "./components/feature/ScrollTopButton";
import MobileChatButton from "./components/feature/MobileChatButton";
import ErrorBoundary from "./components/feature/ErrorBoundary";
import SEOManager from "./components/feature/SEOManager";
import { supabase } from "./lib/supabaseClient";
import { useGeoBlock } from "./hooks/useGeoBlock";
import GeoBlockScreen from "./components/feature/GeoBlockScreen";
import { isGeoRestrictedRoute } from "./lib/geoRestrictedRoutes";
import { firePageView } from "@/lib/metaPixel";
import { captureFromUrl } from "@/lib/attributionStore";
import { ensureVisitorSession, pulseVisitorSession, isInternalAdminPath } from "@/lib/visitorSession";
import { trackPageView } from "@/lib/trackEvent";

// ── PageSpeed Phase 2 lazy imports ─────────────────────────────────────────
// AdminChrome holds AdminChatProvider + 4 floating admin components
// (~3,680 lines of admin-only code + the 973-line useAdminChatNotifier
// hook + supabase realtime channels + audio buffers). Public routes do
// not consume useAdminChat, so loading any of this on a public page is
// pure waste. Lazy-loaded here and only mounted on /admin* paths or on
// the admin subdomain.
const AdminChrome = lazy(() => import("./components/admin/AdminChrome"));

// PawChatWidget (~692 lines) is the public visitor chat bubble. It is
// not LCP-critical and never visible above the fold on first paint, so
// we defer its module fetch behind requestIdleCallback to keep it out
// of the homepage initial JS chunk. Once interactive, the bubble shows
// up exactly as before.
const PawChatWidget = lazy(() => import("./components/feature/PawChatWidget"));

// CookieBanner is small (~140 lines) but its UI is deliberately delayed
// 800 ms after mount before rendering. Lazy-load to keep the module
// itself out of the LCP-window JS parse.
const CookieBanner = lazy(() => import("./components/feature/CookieBanner"));

/**
 * AdminChatGate — only loads the admin operational chrome on /admin*
 * routes. Public pages render children directly with no provider, no
 * polling hook, and no admin component JS in the initial bundle. All
 * consumers of useAdminChat() live inside admin / admin-orders code
 * which is itself lazy-loaded via the router, so the no-provider
 * fallback in AdminChatContext is never reached from a public page.
 *
 * On admin routes the entire chrome (provider + 4 floating components)
 * streams in as a single async chunk via React.lazy(AdminChrome). The
 * Suspense fallback continues to render the admin page itself so the
 * UI is never blocked while the chrome resolves.
 */
function AdminChatGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  if (!isAdminRoute) return <>{children}</>;
  return (
    <Suspense fallback={<>{children}</>}>
      <AdminChrome>{children}</AdminChrome>
    </Suspense>
  );
}

/**
 * DeferredPawChat — mounts PawChatWidget only after the page is idle.
 * Keeps ~692 lines of chat code (plus its supabase RPC bindings and
 * polling thread) out of the LCP-window JS parse. On idle, the lazy
 * chunk is fetched and the bubble renders exactly as before.
 */
function DeferredPawChat() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => {
        try {
          if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id);
        } catch {
          /* ignore */
        }
      };
    }
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <PawChatWidget />
    </Suspense>
  );
}

/**
 * UTMCapture — delegates all attribution capture/restore/merge logic to
 * attributionStore.captureFromUrl(). Runs on every SPA route change.
 *
 * Also owns the visitor-intelligence heartbeat (Phase 1): a single 30s
 * interval that calls bump_visitor_pulse while the tab is visible, plus
 * an immediate pulse on every route change so current_page lands fast.
 * Pauses on visibilitychange to keep write volume low.
 */
function UTMCapture() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    captureFromUrl(search);
    // Record the visitor session once per browser session (fire-and-forget).
    ensureVisitorSession();
    // Visitor heartbeat — bump last_seen_at + current_page immediately on
    // route change so the live list reflects the new path right away. The
    // 30s interval below handles idle dwell on the same page.
    try { pulseVisitorSession(pathname); } catch { /* swallow */ }
    // Structured page_view event for the admin Attribution/Journey tab. The
    // existing `firePageView()` in MetaPageView only sends to Meta Pixel —
    // it does NOT write to public.events. Without this row, the order's
    // Page Journey list stays at 0 events even when the visitor traversed
    // multiple landing pages before checkout. Skipped for admin / portal
    // routes via isInternalAdminPath so admin navigation never pollutes
    // the public funnel table. captureFromUrl above runs first and is
    // synchronous, so getSessionId() inside trackPageView resolves.
    try {
      if (!isInternalAdminPath(pathname)) {
        trackPageView({ pathname });
      }
    } catch { /* swallow */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  // ── 30s visitor heartbeat. Visible-only. Single timer per browser tab. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const HEARTBEAT_MS = 30_000;
    let timerId: number | null = null;

    const tick = () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        pulseVisitorSession(window.location.pathname);
      } catch { /* swallow */ }
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
        // Immediate pulse on return so the row resurrects in the live list
        // before the next 30s tick.
        try { pulseVisitorSession(window.location.pathname); } catch { /* swallow */ }
        start();
      } else {
        stop();
      }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
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

  return null;
}

/** Fires Meta Pixel PageView on every SPA route change (including initial render). */
function MetaPageView() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
    firePageView();
  }, [pathname]);

  return null;
}

function AuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const tokenTypes = ["type=recovery", "type=invite", "type=signup"];
    const hasAuthHash = tokenTypes.some((t) => hash.includes(t));

    if (hasAuthHash && !window.location.pathname.includes("/reset-password")) {
      navigate("/reset-password" + hash, { replace: true });
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    if (code && (type === "recovery" || type === "invite" || type === "signup")) {
      if (!window.location.pathname.includes("/reset-password")) {
        navigate(`/reset-password?code=${code}&type=${type}`, { replace: true });
        return;
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        if (!window.location.pathname.includes("/reset-password")) {
          navigate("/reset-password" + window.location.hash, { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}

/**
 * GeoGate — route-scoped geo enforcement.
 *
 * Pre-2026-05-26 this wrapped the entire public site at the App-root
 * level. That meant ANY route — homepage, paid landing pages, SEO
 * pages, blog, FAQs, contact — could render the GeoBlockScreen if the
 * visitor's IP looked non-US/PK to api.country.is. PageSpeed runs on
 * https://pawtenant.com/ kept capturing the GeoBlockScreen, dragging
 * the LCP screenshot and the mobile performance score down to ~63.
 *
 * New behaviour (this commit):
 *   • On every navigation, read the current pathname.
 *   • If pathname is a public marketing / SEO / informational route,
 *     render children directly. useGeoBlock is called with
 *     `enabled: false` so it never even fires the api.country.is
 *     lookup — no wasted network, no late setState("blocked").
 *   • If pathname is a service-availability route (/assessment,
 *     /psd-assessment, /checkout*, /account/checkout*, /r/*),
 *     enforce the geo gate exactly as before. Blocked users see the
 *     GeoBlockScreen on those routes only.
 *
 * Must be rendered INSIDE BrowserRouter so useLocation() works.
 */
function GeoGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isRestricted = isGeoRestrictedRoute(pathname);
  const status = useGeoBlock({ enabled: isRestricted });

  if (!isRestricted) return <>{children}</>;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "blocked") {
    return <GeoBlockScreen />;
  }

  return <>{children}</>;
}

/**
 * AdminApp — rendered only on admin.pawtenant.com (when feature flag is on).
 * Strips public-site chrome (Tawk, FloatingCTA, GeoBlock, banners, etc.).
 *
 * Phase 2: the four admin floating components plus AdminChatProvider are
 * now reached through the lazy <AdminChrome> bundle so public-site
 * builds never even fetch this admin code. Admin-subdomain users still
 * receive identical chrome — just streamed as a Suspense chunk.
 */
function AdminApp() {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter basename={__BASE_PATH__}>
          <Suspense fallback={null}>
            <AdminChrome>
              <ScrollToTop />
              <UTMCapture />
              <AuthHandler />
              <AdminSubdomainRoutes />
              <ScrollTopButton />
            </AdminChrome>
          </Suspense>
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

function App() {
  // ── Subdomain gate ────────────────────────────────────────────────────────
  if (isAdminSubdomain()) {
    return <AdminApp />;
  }

  // ── Public site (pawtenant.com) ───────────────────────────────────────────
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter basename={__BASE_PATH__}>
          <AdminChatGate>
            <MetaPageView />
            <SEOManager />
            <ScrollToTop />
            <UTMCapture />
            <AuthHandler />
            {/* GeoGate is now INSIDE the router and route-aware. Public
                marketing / SEO / informational pages render globally; the
                gate only enforces on service-availability routes
                (/assessment, /psd-assessment, /checkout*, /account/checkout*,
                /r/*). See src/lib/geoRestrictedRoutes.ts for the list. */}
            <GeoGate>
              <AppRoutes />
            </GeoGate>
            <ScrollTopButton />
            <Suspense fallback={null}>
              <CookieBanner />
            </Suspense>
            {/* Phase 1 mobile-first cleanup (2026-05-19):
                - Removed USResidentsBanner (intrusive bottom black "USA only" banner).
                - Removed ConditionalFloatingCTA (intrusive vertical 988 crisis side banner / mobile pill).
                Component files kept on disk in case a calm inline safety
                section is added later in the footer or FAQ. */}
            <MobileChatButton />
            {/* PawChatWidget mounted via DeferredPawChat — lazy module
                fetch + requestIdleCallback so ~692 lines of chat code
                stay out of the LCP-window JS parse. Bubble still shows
                up after first idle just like before. */}
            <DeferredPawChat />
          </AdminChatGate>
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;
