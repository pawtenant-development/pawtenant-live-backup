import { useEffect, useRef } from "react";
import { BrowserRouter, useNavigate, useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import { AdminSubdomainRoutes } from "./router/adminRoutes";
import { isAdminSubdomain } from "./lib/subdomainConfig";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ScrollToTop from "./components/feature/ScrollToTop";
import ScrollTopButton from "./components/feature/ScrollTopButton";
import CookieBanner from "./components/feature/CookieBanner";
import FloatingCTA from "./components/feature/FloatingCTA";
import MobileChatButton from "./components/feature/MobileChatButton";
import USResidentsBanner from "./components/feature/USResidentsBanner";
import ErrorBoundary from "./components/feature/ErrorBoundary";
import SEOManager from "./components/feature/SEOManager";
import { supabase } from "./lib/supabaseClient";
import { useGeoBlock } from "./hooks/useGeoBlock";
import GeoBlockScreen from "./components/feature/GeoBlockScreen";
import { firePageView } from "@/lib/metaPixel";
import { captureFromUrl } from "@/lib/attributionStore";

const PORTAL_ROUTES = [
  "/admin",
  "/provider-portal",
  "/provider-login",
  "/my-orders",
  "/customer-login",
  "/reset-password",
  "/admin-login",
  "/account/checkout",
];

function ConditionalFloatingCTA() {
  const { pathname } = useLocation();
  const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));
  if (isPortal) return null;
  return <FloatingCTA />;
}

/**
 * UTMCapture — captures all traffic attribution params on every page load.
 *
 * ── FBCLID PERSISTENCE CONTRACT ───────────────────────────────────────────────
 * fbclid is captured on EVERY route change (not just the first page load).
 * This is critical because:
 *   1. A user may land on /home without fbclid, then click an ad link to /assessment?fbclid=xxx
 *   2. The fbclid must survive Step 1 → Step 2 → Checkout → Order creation
 *   3. It must be stored in orders.fbclid for Meta CAPI deduplication
 *
 * Strategy:
 *   - fbclid: always overwrite if present in URL (never skip)
 *   - UTMs / gclid: only capture once (first landing) — they don't change mid-session
 *   - landing_url: only set once (first page the user arrived on)
 *   - referrer: only set once (document.referrer is empty after SPA navigation)
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * UTMCapture — delegates all attribution capture/restore/merge logic to
 * attributionStore.captureFromUrl(). Runs on every SPA route change.
 *
 * The store handles:
 *   - fbclid/gclid/utm_* capture from URL
 *   - fbclid restore from localStorage when missing from URL
 *   - session_id generation (once per session)
 *   - first_seen_at timestamp (once per session)
 *   - landing_url + referrer (once per session)
 *   - Dev logging of all captured/restored/skipped values
 */
function UTMCapture() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    captureFromUrl(search);
  // Re-run on every route change so fbclid is captured wherever it appears
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  return null;
}

/** Fires Meta Pixel PageView on every SPA route change (including initial render). */
function MetaPageView() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      // On initial hard load, fbq('init') already ran in index.html.
      // Fire PageView now so React covers the initial render too.
      isFirstRender.current = false;
    }
    firePageView();
  }, [pathname]);

  return null;
}

function AuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // ── Step 1: Check URL hash for Supabase tokens ────────────────────────
    // Supabase puts recovery, invite, and signup confirmation tokens in the
    // URL hash as:  #access_token=...&type=recovery  (or type=invite, signup)
    // If the user lands anywhere OTHER than /reset-password (e.g. homepage),
    // we immediately forward them there with the hash intact so the
    // reset-password page can exchange the token.
    const hash = window.location.hash;
    const tokenTypes = ["type=recovery", "type=invite", "type=signup"];
    const hasAuthHash = tokenTypes.some((t) => hash.includes(t));

    if (hasAuthHash && !window.location.pathname.includes("/reset-password")) {
      navigate("/reset-password" + hash, { replace: true });
      return;
    }

    // ── Step 2: Check for PKCE flow — Supabase v2 sends ?code=xxx ────────
    // In PKCE mode Supabase appends ?code=xxx&type=recovery (or invite) as
    // query params instead of a hash fragment.
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    if (code && (type === "recovery" || type === "invite" || type === "signup")) {
      if (!window.location.pathname.includes("/reset-password")) {
        navigate(`/reset-password?code=${code}&type=${type}`, { replace: true });
        return;
      }
    }

    // ── Step 3: Listen for PASSWORD_RECOVERY event fired by Supabase SDK ─
    // This fires when the SDK processes a recovery token anywhere in the app.
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

// Injects / removes a <style> tag that hard-hides the Tawk iframe on portal pages.
// This is a belt-and-suspenders fallback for when the JS API isn't ready yet.
const TAWK_HIDE_STYLE_ID = "tawk-portal-hide";

function injectTawkHideStyle() {
  const existing = document.getElementById(TAWK_HIDE_STYLE_ID);
  if (existing) return;
  const style = document.createElement("style");
  style.id = TAWK_HIDE_STYLE_ID;
  // Cover every possible Tawk selector — iframes, containers, bubbles, dynamic classes
  style.textContent = `
    iframe[title*="chat"],
    iframe[title*="Chat"],
    iframe[src*="tawk.to"],
    iframe[src*="embed.tawk"],
    #tawkchat-container,
    #tawkchat-minified-container,
    .tawk-min-container,
    .tawk-bubble-container,
    .tawk-custom-color,
    [id^="tawk-"],
    [class^="tawk-"],
    div[style*="tawk"],
    #tawk-bubble-container {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removeTawkHideStyle() {
  const el = document.getElementById(TAWK_HIDE_STYLE_ID);
  if (el) el.remove();
}

// ── Tawk.to API type ──────────────────────────────────────────────────────────
interface TawkAPI {
  hideWidget?: () => void;
  showWidget?: () => void;
  isChatHidden?: () => boolean;
  minimize?: () => void;
  endChat?: () => void;
  /** Set visitor attributes — used to pass current page to agents */
  setAttributes?: (attrs: Record<string, string>, callback?: () => void) => void;
  /** Fire a custom event visible in the Tawk dashboard */
  addEvent?: (name: string, meta: Record<string, string>, callback?: () => void) => void;
  onLoad?: () => void;
}

function getTawkAPI(): TawkAPI | undefined {
  return (window as unknown as Record<string, unknown>).Tawk_API as TawkAPI | undefined;
}

/**
 * Aggressively silences Tawk on portal pages:
 * - Hides the widget
 * - Minimizes any open chat window
 * - Ends any active chat session (stops ringing)
 * - Mutes the onLoad handler so it can't re-show itself
 */
function silenceTawkForPortal(): void {
  try {
    const api = getTawkAPI();
    if (!api) return;
    if (typeof api.hideWidget === "function") api.hideWidget();
    if (typeof api.minimize === "function") api.minimize();
    if (typeof api.endChat === "function") api.endChat();
    // Override onLoad so if Tawk finishes loading after navigation it stays hidden
    api.onLoad = function () {
      const a = getTawkAPI();
      if (a?.hideWidget) a.hideWidget();
      if (a?.minimize) a.minimize();
    };
  } catch {
    // Never throw
  }
}

/**
 * Sends the current SPA route to Tawk.to so agents can see which page
 * the visitor is on when they start a chat — not just the initial landing page.
 *
 * Uses two Tawk APIs:
 *  - setAttributes: updates the visitor card in the agent dashboard
 *  - addEvent: logs a "page-view" event in the conversation timeline
 *
 * Both calls are fire-and-forget with empty callbacks — never throws.
 */
function sendTawkPageView(pathname: string): void {
  const api = getTawkAPI();
  if (!api) return;

  const pageLabel = pathname === "/" ? "Home" : pathname;
  const fullUrl = window.location.href;

  try {
    if (typeof api.setAttributes === "function") {
      api.setAttributes(
        {
          "current-page": pageLabel,
          "current-url": fullUrl,
        },
        () => {},
      );
    }
  } catch {
    // Never throw — Tawk API can be finicky
  }

  try {
    if (typeof api.addEvent === "function") {
      api.addEvent(
        "page-view",
        {
          page: pageLabel,
          url: fullUrl,
        },
        () => {},
      );
    }
  } catch {
    // Never throw
  }
}

function TawkVisibility() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));

    // ── Portal pages: kill Tawk with zero tolerance ───────────────────────
    if (isPortal) {
      // 1. Inject CSS hide immediately — blocks any flash before JS runs
      injectTawkHideStyle();
      // 2. Kill via API synchronously
      silenceTawkForPortal();

      // 3. MutationObserver: nuke any Tawk node the moment it appears in the DOM
      const observer = new MutationObserver(() => {
        silenceTawkForPortal();
        // Also forcibly hide any tawk iframes that sneak in
        document.querySelectorAll<HTMLElement>(
          'iframe[src*="tawk.to"], iframe[src*="embed.tawk"], [id^="tawk-"], [class^="tawk-"]'
        ).forEach((el) => {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("opacity", "0", "important");
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // 4. Short polling as belt-and-suspenders (3s max)
      let cancelled = false;
      let attempts = 0;
      const poll = setInterval(() => {
        if (cancelled) { clearInterval(poll); return; }
        silenceTawkForPortal();
        attempts++;
        if (attempts >= 30) clearInterval(poll);
      }, 100);

      return () => {
        cancelled = true;
        clearInterval(poll);
        observer.disconnect();
      };
    }

    // ── Public pages: remove CSS hide, show widget ────────────────────────
    removeTawkHideStyle();
    // Also remove the preemptive hide injected by index.html (if navigating from portal → public)
    const preemptive = document.getElementById("tawk-portal-preemptive-hide");
    if (preemptive) preemptive.remove();

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const applyVisibility = (attempts = 0) => {
      if (cancelled) return;

      const api = getTawkAPI();

      if (api?.hideWidget && api?.showWidget) {
        if (window.innerWidth >= 768) {
          api.showWidget();
        }
        // ── SPA page tracking: notify Tawk of the current route ──────────
        try {
          sendTawkPageView(pathname);
        } catch {
          // silent
        }
      } else if (attempts < 60) {
        timerId = setTimeout(() => applyVisibility(attempts + 1), 300);
      }
    };

    applyVisibility();

    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [pathname]);

  return null;
}

function GeoGate({ children }: { children: React.ReactNode }) {
  const status = useGeoBlock();

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
 */
function AdminApp() {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter basename={__BASE_PATH__}>
          <ScrollToTop />
          <UTMCapture />
          <AuthHandler />
          <AdminSubdomainRoutes />
          <ScrollTopButton />
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

function App() {
  // ── Subdomain gate ────────────────────────────────────────────────────────
  // When ADMIN_SUBDOMAIN_ENABLED=true and hostname=admin.pawtenant.com,
  // serve only the admin portal. Zero public marketing pages exposed.
  if (isAdminSubdomain()) {
    return <AdminApp />;
  }

  // ── Public site (pawtenant.com) ───────────────────────────────────────────
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <GeoGate>
          <BrowserRouter basename={__BASE_PATH__}>
            <MetaPageView />
            <SEOManager />
            <ScrollToTop />
            <UTMCapture />
            <AuthHandler />
            <TawkVisibility />
            <AppRoutes />
            <ScrollTopButton />
            <CookieBanner />
            <USResidentsBanner />
            <ConditionalFloatingCTA />
            <MobileChatButton />
          </BrowserRouter>
        </GeoGate>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;
