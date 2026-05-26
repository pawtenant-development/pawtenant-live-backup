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
 * Bot / crawler / Lighthouse / PageSpeed-probe user-agent allow-list.
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
 *
 * Expanded 2026-05-26: previously PSI was still capturing GeoBlockScreen
 * on https://pawtenant.com/. Newer Google probe UAs (Google-InspectionTool,
 * AdsBot-Google, GoogleOther, Google-Read-Aloud, GoogleWebLight,
 * Mediapartners-Google, FeedFetcher-Google, AppEngine-Google) and the
 * Bingbot Lighthouse variant weren't matching the original short list.
 * All of them are first-party Google / Microsoft probes that legitimately
 * need to render the real public site.
 */
const BOT_UA_PATTERN =
  /(googlebot|google-inspectiontool|google-read-aloud|googleweblight|google\s*page\s*speed|adsbot-google|mediapartners-google|feedfetcher-google|appengine-google|googleother|bingbot|bingpreview|slurp|duckduckbot|baiduspider|yandexbot|sogou|facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|applebot|chrome-lighthouse|lighthouse|pagespeed|pagespeedinsights|gtmetrix|webpagetest|headlesschrome|puppeteer|playwright|phantomjs)/i;

function isBotUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!ua) return false;
  return BOT_UA_PATTERN.test(ua);
}

/**
 * Synchronous "is this request from an allowed bypass context?" check.
 * Runs at hook initialization (useState lazy initializer) BEFORE first
 * paint, so allowed bots never enter the async geo-lookup path and the
 * homepage hero is never replaced by GeoBlockScreen later in the render
 * lifecycle. Real human visitors fall through to the async geo lookup
 * inside useEffect exactly as before.
 *
 * Order:
 *   1. Build-time env + hostname allow-list (TEST / local / preview only).
 *   2. Crawler / Lighthouse / PageSpeed UA pattern.
 *
 * On the LIVE pawtenant.com hostname, only step 2 can match — step 1's
 * allow-list excludes pawtenant.com on purpose. So normal human visitors
 * from blocked regions still see GeoBlockScreen; only crawlers/probes
 * skip the gate.
 */
function shouldBypassGeoBlockSync(): boolean {
  if (isGeoBlockDisabledForEnv()) return true;
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname || "";
  if (EXEMPT_PATHS.some((p) => pathname.startsWith(p))) return true;
  if (isBotUA()) return true;
  return false;
}

/**
 * useGeoBlock
 *
 * @param options.enabled  Default `true`. When `false`, the hook is inert
 *   — no API call is made and the hook returns `"allowed"` permanently.
 *   This is how the route-scoped GeoGate skips the geo lookup entirely
 *   on public marketing / SEO pages: the gate component computes
 *   `enabled = isGeoRestrictedRoute(pathname)` on every navigation, so
 *   the lookup only fires on /assessment, /psd-assessment, /checkout,
 *   /account/checkout, /r/* — the routes where service availability
 *   actually matters. Public pages (/, landing pages, blog, FAQs, state
 *   pages) render the same in every region.
 */
export function useGeoBlock(options?: { enabled?: boolean }): GeoState {
  const enabled = options?.enabled ?? true;

  // Synchronous bypass for crawlers / Lighthouse / PageSpeed / TEST /
  // dev — resolved BEFORE first paint so allowed contexts never enter
  // the async geo-lookup path. This is the key fix for PSI on the LIVE
  // hostname: previously the bot-UA check lived inside useEffect, so
  // even though it matched, the surrounding lifecycle still allowed a
  // late setState("blocked") to mutate the rendered tree by the time
  // PSI snapshotted the page. Resolving synchronously at init means
  // a bypassed request returns "allowed" from the very first render
  // and never re-evaluates.
  const bypass = shouldBypassGeoBlockSync();

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
    // Hook disabled (public route) — never run the geo lookup. State
    // stays at the initial "allowed" and the gate renders children.
    if (!enabled) {
      return;
    }

    // Hard bypass for allowed contexts — never run the geo lookup,
    // never call setState. State stays at the initial "allowed".
    if (bypass) {
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
  }, [bypass, enabled]);

  return state;
}
