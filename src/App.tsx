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
import PawChatWidget from "./components/feature/PawChatWidget";
import USResidentsBanner from "./components/feature/USResidentsBanner";
import ErrorBoundary from "./components/feature/ErrorBoundary";
import SEOManager from "./components/feature/SEOManager";
import AdminChatNotifier from "./components/admin/AdminChatNotifier";
import MiniChatDock from "./components/admin/MiniChatDock";
import { AdminChatProvider } from "./context/AdminChatContext";
import { supabase } from "./lib/supabaseClient";
import { useGeoBlock } from "./hooks/useGeoBlock";
import GeoBlockScreen from "./components/feature/GeoBlockScreen";
import { firePageView } from "@/lib/metaPixel";
import { captureFromUrl } from "@/lib/attributionStore";
import { ensureVisitorSession } from "@/lib/visitorSession";

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
 * AdminChatGate — wraps the public router with AdminChatProvider, but only
 * enables polling/alerts on admin pages (/admin-orders, /admin-doctors,
 * /admin-guide, /admin-login, /admin/*). On public pages the provider is
 * mounted with enabled=false so ChatsTab consumers are inert and no
 * session polling occurs.
 */
function AdminChatGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  return (
    <AdminChatProvider enabled={isAdminRoute}>
      {children}
      <AdminChatNotifier />
      <MiniChatDock />
    </AdminChatProvider>
  );
}

/**
 * UTMCapture — delegates all attribution capture/restore/merge logic to
 * attributionStore.captureFromUrl(). Runs on every SPA route change.
 */
function UTMCapture() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    captureFromUrl(search);
    // Record the visitor session once per browser session (fire-and-forget).
    ensureVisitorSession();
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
          <AdminChatProvider enabled>
            <ScrollToTop />
            <UTMCapture />
            <AuthHandler />
            <AdminSubdomainRoutes />
            <ScrollTopButton />
            <AdminChatNotifier />
            <MiniChatDock />
          </AdminChatProvider>
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
        <GeoGate>
          <BrowserRouter basename={__BASE_PATH__}>
            <AdminChatGate>
              <MetaPageView />
              <SEOManager />
              <ScrollToTop />
              <UTMCapture />
              <AuthHandler />
              <AppRoutes />
              <ScrollTopButton />
              <CookieBanner />
              <USResidentsBanner />
              <ConditionalFloatingCTA />
              <MobileChatButton />
              <PawChatWidget />
            </AdminChatGate>
          </BrowserRouter>
        </GeoGate>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default App;
