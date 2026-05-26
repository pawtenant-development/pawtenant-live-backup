import { useState, useEffect } from "react";

type GeoState = "loading" | "allowed" | "blocked";

const ALLOWED_COUNTRIES = ["US", "PK"];

// Admin/portal paths are always allowed regardless of country.
const EXEMPT_PATHS = ["/admin", "/provider-portal", "/provider-login"];

/**
 * TEST + local-dev geo-block bypass.
 *
 * Production LIVE (pawtenant.com) must continue to enforce regional
 * availability so the service is only offered where it's licensed. TEST,
 * local dev, and Vercel preview deployments need to render the full
 * public site so PageSpeed / Lighthouse audits, QA, and code reviewers
 * see real content rather than the GeoBlockScreen.
 *
 * Order of checks:
 *   1. Explicit env override: VITE_DISABLE_GEO_BLOCK=true (set in Vercel
 *      TEST project env, or a local .env.development.local for dev).
 *   2. Hostname allow-list: localhost / 127.0.0.1, the canonical TEST
 *      Vercel domain (pawtenant-test.vercel.app), and any preview-URL
 *      hostname starting with "pawtenant-test" on *.vercel.app.
 *
 * pawtenant.com / www.pawtenant.com / live preview URLs DO NOT match
 * any of these, so LIVE continues to enforce the geo block exactly as
 * before. This file can be mirrored to LIVE safely — the bypass is gated.
 */
function isGeoBlockDisabledForEnv(): boolean {
  // 1. Build-time env override. Vite inlines VITE_* vars at build time.
  try {
    const flag = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_DISABLE_GEO_BLOCK;
    if (flag === "true" || flag === "1") return true;
  } catch {
    /* import.meta.env unavailable in some test contexts — fall through */
  }

  // 2. Hostname allow-list — runtime fallback so a Vercel TEST deploy
  //    works even if the env var is missing.
  if (typeof window === "undefined") return false;
  const host = window.location.hostname || "";
  if (!host) return false;

  // Local dev
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;

  // Vercel TEST deployments. Canonical TEST domain plus any preview URL
  // that Vercel auto-generates from the pawtenant-test project. Vercel
  // preview hostnames follow the shape:
  //   pawtenant-test-<hash>-<team>.vercel.app
  //   pawtenant-test-git-<branch>-<team>.vercel.app
  // so any *.vercel.app host whose first label starts with "pawtenant-test"
  // is a TEST deployment.
  if (host === "pawtenant-test.vercel.app") return true;
  if (host.endsWith(".vercel.app") && host.startsWith("pawtenant-test")) return true;

  return false;
}

/**
 * Bot / crawler / lighthouse-probe user-agent allow-list.
 *
 * Why: search-engine crawlers and PageSpeed/Lighthouse probes may run from
 * non-US PoPs. Without this check, api.country.is returns a non-US/PK
 * country code → the homepage gets replaced by GeoBlockScreen, which
 *   (a) Google then risks indexing as the canonical homepage, and
 *   (b) drags PageSpeed scores down because the "LCP" is no longer the
 *       actual homepage hero — it's the geo-block screen rendering AFTER
 *       a slow third-party fetch.
 *
 * Real-user behaviour is unchanged: only requests where the UA matches a
 * known crawler / probe pattern skip the geo gate.
 */
const BOT_UA_PATTERN =
  /(googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|applebot|chrome-lighthouse|lighthouse|pagespeed|gtmetrix|headlesschrome|puppeteer|playwright|phantomjs)/i;

function isBotUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!ua) return false;
  return BOT_UA_PATTERN.test(ua);
}

export function useGeoBlock(): GeoState {
  // Default to "allowed" so the public homepage paints immediately —
  // no blank loading spinner becoming the LCP candidate while the geo
  // lookup is in flight. The hook flips to "blocked" only AFTER an
  // explicit out-of-region confirmation from api.country.is. For the
  // small minority of out-of-region visitors this means a brief paint
  // of the real homepage before the block screen replaces it; for
  // US/PK visitors (the overwhelming majority) and for PageSpeed /
  // Lighthouse probes it eliminates the previous loading-spinner LCP
  // and the "Service Not Available" screenshot that PSI was capturing.
  const [state, setState] = useState<GeoState>("allowed");

  useEffect(() => {
    // TEST / local-dev / Vercel-preview bypass. See
    // isGeoBlockDisabledForEnv() above for the matching rules. Production
    // LIVE (pawtenant.com) is not on the allow-list so it continues to
    // enforce regional availability.
    if (isGeoBlockDisabledForEnv()) {
      return;
    }

    const pathname = window.location.pathname;
    const isExempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    if (isExempt) {
      return;
    }

    // Skip the geo gate entirely for known bots / Lighthouse probes /
    // headless Chrome. They get the real homepage so PageSpeed audits
    // and search-engine indexing reflect the actual site rather than the
    // regional fallback.
    if (isBotUA()) {
      return;
    }

    // Check cache first to avoid repeated API calls.
    const cached = sessionStorage.getItem("geo_country");
    if (cached) {
      setState(ALLOWED_COUNTRIES.includes(cached) ? "allowed" : "blocked");
      return;
    }

    const controller = new AbortController();
    // Shortened from 5000 ms → 1500 ms. On timeout we already fail-open
    // (set "allowed"), so a tight ceiling improves LCP for the unlucky
    // tail of slow networks without changing real-region behaviour.
    const timeout = setTimeout(() => controller.abort(), 1500);

    fetch("https://api.country.is/", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { country?: string }) => {
        clearTimeout(timeout);
        const country = data?.country ?? "";
        sessionStorage.setItem("geo_country", country);
        setState(ALLOWED_COUNTRIES.includes(country) ? "allowed" : "blocked");
      })
      .catch(() => {
        clearTimeout(timeout);
        // On error / timeout, allow through (don't punish legit users due to API issues).
        setState("allowed");
      });

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return state;
}
