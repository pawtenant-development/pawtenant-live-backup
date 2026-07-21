// src/prerender/entry.tsx
//
// AI-SEO-FULL-BODY-PRERENDER-SPIKE-001
//
// Build-time SSR entry for the full-body prerender spike. It renders the REAL
// existing route page components to a static HTML string so the deployed raw
// HTML for the approved spike routes carries meaningful, route-specific body
// content (H1, intro copy, CTA, internal links, visible FAQ) BEFORE the React
// bundle executes — instead of an empty <div id="root">.
//
// This module is loaded ONLY at build time by scripts/prerender-full-body-spike.mjs
// (through Vite's SSR pipeline, so unplugin-auto-import + the "@/" alias + the
// react-swc transform all apply). It is NOT part of the client bundle and
// main.tsx never imports it, so the shipped app is byte-identical.
//
// Design contract (see the task card):
//   - Renders the SAME components the client renders (single source of truth —
//     no hand-authored SEO copy). The client still uses createRoot(), which
//     clears #root and re-renders on mount, so this markup is an SSR-only first
//     paint that React replaces with an identical tree.
//   - Renders each route under a StaticRouter so Link / useParams / useLocation
//     resolve without a browser. No I18nextProvider is needed — none of the
//     spike pages use react-i18next (verified).
//   - Effects (useEffect) do NOT run under renderToStaticMarkup, so the per-page
//     document.head SEO/JSON-LD injection never runs here; the <head> is owned
//     by scripts/prerender-seo.mjs. Any JSON-LD a page emits directly in JSX is
//     stripped by the generator so schema stays emitted exactly once.
//   - The homepage ("/") is intentionally NOT rendered here: it keeps its tuned
//     static-hero / lazy-section architecture in prerender-seo.mjs.

import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { Routes, Route } from "react-router-dom";

import HowToGetESAPage from "@/pages/how-to-get-esa/page";
import ESALetterCostPage from "@/pages/esa-letter-cost/page";
import HowToGetPSDLetterPage from "@/pages/how-to-get-psd-letter/page";
import StateESAPage from "@/pages/state-esa/page";
import ESALetterForApartmentsPage from "@/pages/esa-letter-for-apartments/page";
import BlogEsaLetterRequirementsPage from "@/pages/blog-esa-letter-requirements/page";
import ExploreStatesPage from "@/pages/explore-states/page";
import DoctorProfilePage from "@/pages/doctor-profile/page";
import OurProvidersPage from "@/pages/our-providers/page";
import { PUBLIC_PROVIDERS, getPublicProvider } from "@/data/publicProviders";
import { buildProviderJsonLd, buildOurProvidersJsonLd, stringifyJsonLd } from "@/lib/providerJsonLd";

// Route pattern → component. Patterns mirror src/router/config.tsx exactly so a
// StaticRouter at each approved location matches the same component (and, for
// /esa-letter/:state, resolves the :state param the page reads via useParams).
const ROUTE_ELEMENTS: { path: string; element: React.ReactNode }[] = [
  { path: "/how-to-get-esa-letter", element: <HowToGetESAPage /> },
  { path: "/esa-letter-cost", element: <ESALetterCostPage /> },
  { path: "/how-to-get-psd-letter", element: <HowToGetPSDLetterPage /> },
  { path: "/esa-letter/:state", element: <StateESAPage /> },
  { path: "/esa-letter-for-apartments", element: <ESALetterForApartmentsPage /> },
  { path: "/blog/esa-letter-requirements", element: <BlogEsaLetterRequirementsPage /> },
  { path: "/explore-esa-letters-all-states", element: <ExploreStatesPage /> },
  { path: "/our-providers", element: <OurProvidersPage /> },
  { path: "/doctors/:id", element: <DoctorProfilePage /> },
];

// The exact set of routes this entry can render (state routes expand to the 3
// approved slugs). The generator imports this so the two never drift.
export const SPIKE_ROUTES: string[] = [
  "/how-to-get-esa-letter",
  "/esa-letter-cost",
  "/how-to-get-psd-letter",
  "/esa-letter/california",
  "/esa-letter/washington",
  "/esa-letter/new-york",
  "/esa-letter-for-apartments",
  "/blog/esa-letter-requirements",
  "/explore-esa-letters-all-states",
  "/our-providers",
  "/doctors/robert-staaf",
  "/doctors/michelle-lafferty",
  "/doctors/lytara-garcia",
  "/doctors/stephanie-white",
  "/doctors/eve-rosno",
  "/doctors/henry-smith",
  "/doctors/chad-cunningham",
  "/doctors/karla-delgado",
];

// Route → the page.tsx source key in the Vite manifest, so the generator can
// resolve each route's lazily-loaded client chunk and inject a
// <link rel="modulepreload"> for it (same technique prerender-seo.mjs uses for
// the homepage). This makes the lazy route chunk ready by the time createRoot()
// mounts, so the client re-render is immediate — no spinner gap between the
// SSR'd first paint and the client render.
export const ROUTE_SOURCE: Record<string, string> = {
  "/how-to-get-esa-letter": "src/pages/how-to-get-esa/page.tsx",
  "/esa-letter-cost": "src/pages/esa-letter-cost/page.tsx",
  "/how-to-get-psd-letter": "src/pages/how-to-get-psd-letter/page.tsx",
  "/esa-letter/california": "src/pages/state-esa/page.tsx",
  "/esa-letter/washington": "src/pages/state-esa/page.tsx",
  "/esa-letter/new-york": "src/pages/state-esa/page.tsx",
  "/esa-letter-for-apartments": "src/pages/esa-letter-for-apartments/page.tsx",
  "/blog/esa-letter-requirements": "src/pages/blog-esa-letter-requirements/page.tsx",
  "/explore-esa-letters-all-states": "src/pages/explore-states/page.tsx",
  "/our-providers": "src/pages/our-providers/page.tsx",
  "/doctors/robert-staaf": "src/pages/doctor-profile/page.tsx",
  "/doctors/michelle-lafferty": "src/pages/doctor-profile/page.tsx",
  "/doctors/lytara-garcia": "src/pages/doctor-profile/page.tsx",
  "/doctors/stephanie-white": "src/pages/doctor-profile/page.tsx",
  "/doctors/eve-rosno": "src/pages/doctor-profile/page.tsx",
  "/doctors/henry-smith": "src/pages/doctor-profile/page.tsx",
  "/doctors/chad-cunningham": "src/pages/doctor-profile/page.tsx",
  "/doctors/karla-delgado": "src/pages/doctor-profile/page.tsx",
};

/**
 * Render one approved spike route to a static HTML string (the innerHTML that
 * will be injected into <div id="root">). Throws if the route does not match a
 * spike pattern so the generator fails loudly rather than writing an empty body.
 */
export function renderRoute(routePath: string): string {
  return renderToStaticMarkup(
    <StaticRouter location={routePath}>
      <Routes>
        {ROUTE_ELEMENTS.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </StaticRouter>,
  );
}

/**
 * Build the <head> JSON-LD <script> string for a provider route so the raw HTML
 * carries provider schema exactly once. Effects never run under
 * renderToStaticMarkup and the body's JSON-LD is stripped by the generator, so
 * scripts/prerender-full-body-spike.mjs injects this into <head> instead.
 * Returns null for any non-provider route. `<` is escaped so the JSON can never
 * terminate the surrounding <script>. AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001.
 */
export function getRouteHeadJsonLd(routePath: string): string | null {
  const wrap = (graph: Record<string, unknown>) =>
    `<script type="application/ld+json">${stringifyJsonLd(graph).replace(/</g, "\\u003c")}</script>`;
  if (routePath === "/our-providers") return wrap(buildOurProvidersJsonLd(PUBLIC_PROVIDERS));
  const m = routePath.match(/^\/doctors\/([a-z0-9-]+)$/);
  if (m) {
    const provider = getPublicProvider(m[1]);
    if (provider) return wrap(buildProviderJsonLd(provider));
  }
  return null;
}
