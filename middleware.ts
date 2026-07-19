// middleware.ts — Vercel Edge Middleware
//
// AI-SEO-SOFT-404-ROUTE-STATUS-001
//
// Returns a REAL HTTP status for invalid / retired routes instead of the empty
// HTTP-200 SPA app shell (the soft-404 the GSC audit flagged). It ONLY intercepts
// paths the classifier is sure about:
//   - retired WordPress/WooCommerce infrastructure  → 410 Gone (branded body)
//   - unknown paths (not any valid route/slug)       → 404 Not Found (branded body)
// EVERY valid route (public content, dynamic collections, private/app/funnel,
// legacy redirects) calls next() and flows through the existing Vercel pipeline
// (redirects → filesystem → /app rewrite) EXACTLY as before — behavior unchanged.
//
// Fail-open: any error, www host, or static file → next() (never break a route).
// The valid-route data lives in src/generated/routeManifest.ts (generated from
// src/router/config.tsx + src/mocks/*); the classifier is src/lib/routeStatus.ts.

import { next } from "@vercel/edge";
import { classifyRoute, NOT_FOUND_HTML, GONE_HTML } from "./src/lib/routeStatus";

export const config = {
  // Run on everything except Vercel internals and hashed build assets.
  matcher: ["/((?!_vercel/|assets/).*)"],
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex, follow",
  "cache-control": "public, max-age=0, must-revalidate",
};

export default function middleware(request: Request): Response {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Never classify the www host — let the vercel.json 308 www→non-www run first.
    if (url.hostname.startsWith("www.")) return next();

    // Never classify static files (robots.txt, sitemap.xml, llms.txt, favicon,
    // app.html, 404.html, images, chunks). Anything with a file extension is
    // served as-is.
    if (/\.[a-zA-Z0-9]+$/.test(pathname)) return next();

    const status = classifyRoute(pathname);
    if (status === "gone") {
      return new Response(GONE_HTML, { status: 410, headers: HTML_HEADERS });
    }
    if (status === "notfound") {
      return new Response(NOT_FOUND_HTML, { status: 404, headers: HTML_HEADERS });
    }
    return next();
  } catch {
    // Fail OPEN — a middleware error must never break a real route.
    return next();
  }
}
