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
import { useGeoBlock } from "./hooks/useGeoBlock";
import GeoBlockScreen from "./components/feature/GeoBlockScreen";
import { isGeoRestrictedRoute } from "./lib/geoRestrictedRoutes";
import { firePageView } from "@/lib/metaPixel";
import { captureFromUrl } from "@/lib/attributionStore";

// ── PageSpeed Phase 2 lazy imports ─────────────────────────────────────────
// AdminChrome holds AdminChatProvider + 4 floating admin components
// (~3,680 lines of admin-only code + the 973-line useAdminChatNotifier
// hook + supabase realtime channels + audio buffers). Public routes do
// not consume useAdminChat, so loading any of this on a public page is
// pure waste. Lazy-loaded here and only mounted on /admin* paths or on
// the admin subdomain.
const AdminChrome = lazy(() => import("./components/admin/AdminChrome"));

// PawChatLauncher is the TINY public chat bubble. It does NOT import
// the heavy chat panel, thread hook, attachment view, or any Supabase
// RPC code on first paint — the panel chunk and chat thread RPCs only
// load when the visitor clicks the bubble. See PawChatLauncher.tsx +
// PawChatPanel.tsx for the Phase-6 split.
const PawChatLauncher = lazy(
  () => import("./components/feature/PawChatLauncher"),
);

// CookieBanner is small (~140 lines) but its UI is deliberately delayed
// 800 ms after mount before rendering. Lazy-load to keep the module
// itself out of the LCP-window JS parse.
const CookieBanner = lazy(() => import("./components/feature/CookieBanner"));

// FacebookDiscountPopup — warm $30-off welcome popup shown ONLY to
// Facebook/Instagram visitors on PUBLIC content pages (route-excludes
// assessment / checkout / thank-you / auth / admin / provider / portal /
// company-OS). Lazy-loaded so it stays out of the entry bundle. Pure
// presentation + localStorage flags — no checkout/Stripe/attribution
// logic. Mounted in the public shell only (never in AdminApp).
const FacebookDiscountPopup = lazy(
  () => import("./components/feature/FacebookDiscountPopup"),
);

// PageSpeed (mirror of TEST f729ee6): Supabase-backed, non-conversion-critical
// services (visitor session + heartbeat, structured page_view, auth recovery
// subscription) live in this lazy chunk so the Supabase client (~35 KB gzip)
// is code-split OUT of the homepage entry bundle. Conversion-critical work
// (attribution capture, Meta/Google queues, conversion-route load, Meta Pixel
// PageView) stays synchronous below. Mounted a beat after first paint.
const DeferredServices = lazy(
  () => import("./components/feature/DeferredServices"),
);

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
 * DeferredPawChat — mounts the TINY PawChatLauncher only after the
 * page is well past LCP. The launcher itself is lazy-imported here so
 * even its small chunk is not parsed until after window.load + a 6s
 * grace period (or requestIdleCallback after window.load, whichever
 * fires later). The heavy panel + chat thread RPCs only load when the
 * user actually clicks the bubble.
 *
 * Behavior matrix:
 *   - Before window.load: nothing chat-related parses or fetches.
 *   - After window.load + 6s (PageSpeed Phase 6): launcher chunk loads,
 *     bubble renders.
 *   - On bubble click: PawChatPanel chunk loads, usePawChatThread runs,
 *     get_visitor_chat_thread + get_visitor_chat_attachments fire.
 */
function DeferredPawChat() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const MIN_DELAY_AFTER_LOAD_MS = 6000; // PageSpeed Phase 6 — past LCP.
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (typeof w.requestIdleCallback === "function") {
          idleId = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
        } else {
          timeoutId = window.setTimeout(() => setReady(true), 500);
        }
      }, MIN_DELAY_AFTER_LOAD_MS);
    };

    if (document.readyState === "complete") {
      schedule();
    } else {
      const onLoad = () => schedule();
      window.addEventListener("load", onLoad, { once: true });
      return () => {
        window.removeEventListener("load", onLoad);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (idleId !== null && typeof w.cancelIdleCallback === "function") {
          try { w.cancelIdleCallback(idleId); } catch { /* ignore */ }
        }
      };
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof w.cancelIdleCallback === "function") {
        try { w.cancelIdleCallback(idleId); } catch { /* ignore */ }
      }
    };
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <PawChatLauncher />
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
// PageSpeed Phase 8: conversion-critical routes must have gtag.js +
// fbevents.js loaded BEFORE the InitiateCheckout / Purchase Pixel +
// gtag events flush. The index.html bootstrap handles hard loads on
// these paths; this list handles SPA navigation INTO them by calling
// window.__ptLoadMarketing() in UTMCapture. Keep in sync with the
// CONVERSION_PATHS array in index.html.
const CONVERSION_ROUTE_PREFIXES = [
  "/assessment/thank-you",
  "/psd-assessment/thank-you",
  "/account/checkout",
];

function UTMCapture() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    captureFromUrl(search);
    // PageSpeed Phase 8: when SPA navigates INTO a conversion-critical
    // route, force the deferred marketing scripts to attach now so
    // Purchase / InitiateCheckout Pixel + Google Ads conversion events
    // fire against a fully-loaded SDK (not just the queue stubs).
    // Hard loads onto these routes already bypass the delay via the
    // conversion-path block in index.html — this covers the SPA-nav
    // case. No-op if scripts are already loaded (the loader is
    // idempotent).
    try {
      const isConversionRoute = CONVERSION_ROUTE_PREFIXES.some((p) =>
        pathname.startsWith(p),
      );
      if (isConversionRoute) {
        const w = window as unknown as { __ptLoadMarketing?: () => void };
        if (typeof w.__ptLoadMarketing === "function") w.__ptLoadMarketing();
      }
    } catch { /* swallow — analytics must never break navigation */ }
    // PageSpeed (mirror of TEST f729ee6): the Supabase-backed visitor session +
    // per-route pulse + 30s heartbeat + structured page_view (record_event)
    // moved to <DeferredServices> (lazy) so the Supabase client is code-split
    // out of the homepage entry bundle. They still fire on every route change —
    // just from the deferred chunk, a beat after first paint. Attribution
    // capture (captureFromUrl), the conversion-route marketing-script load
    // above, the gtag/fbq queue stubs (index.html), and Meta Pixel PageView
    // (MetaPageView) all remain synchronous and conversion-critical.
  }, [pathname, search]);

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

    // The async onAuthStateChange(PASSWORD_RECOVERY) subscription moved to
    // <DeferredServices> (lazy) — it needs the Supabase client, which is now
    // code-split out of the entry bundle. The synchronous recovery-hash / ?code
    // redirect above stays here so a recovery landing redirects immediately.
  }, [navigate]);

  return null;
}

/**
 * DeferredServicesGate — mounts <DeferredServices> a beat AFTER the first paint
 * (rAF×2, 200ms setTimeout fallback) so the Supabase chunk it pulls downloads
 * after the hero/LCP window rather than competing with it. Must live inside the
 * Router (DeferredServices uses useLocation/useNavigate).
 */
function DeferredServicesGate() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const t = window.setTimeout(() => setReady(true), 200);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <DeferredServices />
    </Suspense>
  );
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
 * AdminDensity — toggles the `pt-admin-dense` class on <html> while the user is
 * on an admin PORTAL route (admin-orders / admin-doctors / admin-live /
 * admin-guide). That class (see index.css) scales the root font on lg+ screens
 * so the rem-based admin UI reads denser at 100% browser zoom. Excludes
 * /admin-login, the public site, and /company, which keep the default 16px
 * root. Pure presentation — no business logic, no auth, no data.
 */
const ADMIN_DENSE_PREFIXES = ["/admin-orders", "/admin-doctors", "/admin-live", "/admin-guide"];
function AdminDensity() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isDense = ADMIN_DENSE_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    const el = document.documentElement;
    el.classList.toggle("pt-admin-dense", isDense);
    return () => { el.classList.remove("pt-admin-dense"); };
  }, [pathname]);
  return null;
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
              <AdminDensity />
              <UTMCapture />
              <AuthHandler />
              <DeferredServicesGate />
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
            <AdminDensity />
            <UTMCapture />
            <AuthHandler />
            <DeferredServicesGate />
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
            {/* Facebook/Instagram visitor $30-off popup — public content
                pages only; route-excludes sensitive flows internally. */}
            <Suspense fallback={null}>
              <FacebookDiscountPopup />
            </Suspense>
            {/* Phase 1 mobile-first cleanup (2026-05-19):
                - Removed USResidentsBanner (intrusive bottom black "USA only" banner).
                - Removed ConditionalFloatingCTA (intrusive vertical 988 crisis side banner / mobile pill).
                Component files kept on disk in case a calm inline safety
                section is added later in the footer or FAQ. */}
            <MobileChatButton />
            {/* PawChatLauncher mounted via DeferredPawChat — tiny
                launcher chunk loads only after window.load + 6s; the
                heavy panel + chat thread RPCs only load on click.
                See PawChatLauncher.tsx + PawChatPanel.tsx (Phase 6). */}
            <DeferredPawChat />
          </AdminChatGate>
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;
