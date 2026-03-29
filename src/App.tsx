import { useEffect } from "react";
import { BrowserRouter, useNavigate, useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ScrollToTop from "./components/feature/ScrollToTop";
import ScrollTopButton from "./components/feature/ScrollTopButton";
import CookieBanner from "./components/feature/CookieBanner";
import FloatingCTA from "./components/feature/FloatingCTA";
import MobileChatButton from "./components/feature/MobileChatButton";
import USResidentsBanner from "./components/feature/USResidentsBanner";
import { supabase } from "./lib/supabaseClient";
import { useGeoBlock } from "./hooks/useGeoBlock";
import GeoBlockScreen from "./components/feature/GeoBlockScreen";

const PORTAL_ROUTES = [
  "/admin",
  "/provider-portal",
  "/provider-login",
  "/my-orders",
  "/customer-login",
];

function ConditionalFloatingCTA() {
  const { pathname } = useLocation();
  const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));
  if (isPortal) return null;
  return <FloatingCTA />;
}

function UTMCapture() {
  useEffect(() => {
    if (sessionStorage.getItem("utm_captured")) return;
    const params = new URLSearchParams(window.location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
    keys.forEach((k) => {
      const v = params.get(k);
      if (v) sessionStorage.setItem(k, v);
    });
    sessionStorage.setItem("landing_url", window.location.href);
    sessionStorage.setItem("referrer", document.referrer || "");
    sessionStorage.setItem("utm_captured", "1");
  }, []);
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

function TawkVisibility() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));

    // cancelled flag prevents stale polling loops from a previous route
    // from overriding the visibility set by the current route's loop.
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const applyVisibility = (attempts = 0) => {
      if (cancelled) return;

      const api = (window as unknown as Record<string, unknown>).Tawk_API as {
        hideWidget?: () => void;
        showWidget?: () => void;
      } | undefined;

      if (api?.hideWidget && api?.showWidget) {
        if (isPortal) {
          api.hideWidget();
        } else {
          api.showWidget();
        }
      } else if (attempts < 50) {
        // Poll up to ~15 s to handle slow Tawk script loads
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

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <GeoGate>
        <BrowserRouter basename={__BASE_PATH__}>
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
  );
}

export default App;
