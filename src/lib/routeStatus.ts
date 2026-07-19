// src/lib/routeStatus.ts
//
// AI-SEO-SOFT-404-ROUTE-STATUS-001
//
// Pure, dependency-free route classifier + branded 404/410 response bodies.
// Consumed by:
//   - middleware.ts                    (Vercel Edge Middleware — real HTTP status)
//   - scripts/check-route-status.mjs   (blocking guard, via jiti)
//
// It reads ONLY src/generated/routeManifest.ts (generated from the router +
// mocks). No React / DOM / Node APIs, so it runs unchanged in the edge runtime
// and in Node. `classifyRoute` never throws.

import {
  EXACT_PATHS,
  ESA_STATES,
  PSD_STATES,
  BLOG_SLUGS,
  BLOG_STATE_SLUGS,
  COLLEGE_SLUGS,
  PASS_THROUGH_PREFIXES,
  GONE_SEGMENTS,
} from "../generated/routeManifest";

const EXACT = new Set(EXACT_PATHS);
const ESA = new Set(ESA_STATES);
const PSD = new Set(PSD_STATES);
const BLOG = new Set(BLOG_SLUGS);
const BLOG_STATE = new Set(BLOG_STATE_SLUGS);
const COLLEGE = new Set(COLLEGE_SLUGS);
const GONE = new Set(GONE_SEGMENTS);

export type RouteStatus = "valid" | "gone" | "notfound";

/**
 * Normalize a pathname for matching: strip the query/hash (caller should pass
 * pathname only), drop a trailing slash (except root), and lower-case so we
 * match React Router's default case-insensitive behavior. Never throws.
 */
export function normalizePath(pathname: string): string {
  try {
    let p = (pathname || "/").split("?")[0].split("#")[0];
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return (p === "" ? "/" : p).toLowerCase();
  } catch {
    return "/";
  }
}

function firstSegment(p: string): string {
  const seg = p.split("/")[1] || "";
  return seg.replace(/\.php$/, "");
}

/** Retired WordPress / WooCommerce infrastructure paths → HTTP 410 Gone. */
function isGone(p: string): boolean {
  if (p === "/") return false;
  const seg = firstSegment(p);
  return GONE.has(seg) || seg.startsWith("wp-");
}

/**
 * Classify a request path. `valid` → let the normal SPA pipeline serve it
 * (unchanged). `gone` → 410. `notfound` → 404. Never throws — any surprise
 * input resolves to `valid` (fail-open: never break a real route).
 */
export function classifyRoute(pathname: string): RouteStatus {
  try {
    const p = normalizePath(pathname);
    if (p === "/") return "valid";
    if (isGone(p)) return "gone";
    if (EXACT.has(p)) return "valid";

    for (const prefix of PASS_THROUGH_PREFIXES) {
      if (p.startsWith(prefix)) return "valid";
    }

    const segs = p.split("/").filter(Boolean);
    if (segs[0] === "esa-letter" && segs.length === 2 && ESA.has(segs[1]))
      return "valid";
    if (segs[0] === "psd-letter" && segs.length === 2 && PSD.has(segs[1]))
      return "valid";
    if (
      segs[0] === "blog" &&
      segs[1] === "state" &&
      segs.length === 3 &&
      BLOG_STATE.has(segs[2])
    )
      return "valid";
    if (segs[0] === "blog" && segs.length === 2 && BLOG.has(segs[1]))
      return "valid";
    if (
      segs[0] === "college-pet-policy" &&
      segs.length === 2 &&
      COLLEGE.has(segs[1])
    )
      return "valid";

    return "notfound";
  } catch {
    return "valid";
  }
}

// ── Branded response bodies (self-contained, noindex, no homepage canonical, no
//    homepage Service schema). Kept visually in sync with public/404.html. ─────
const SHARED_HEAD = (title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, follow" />
    <title>${title} | PawTenant</title>
    <style>
      :root { --orange:#f97316; --ink:#1f2937; --muted:#6b7280; --cream:#fdf8f3; }
      *{box-sizing:border-box} html,body{margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        background:var(--cream);color:var(--ink);min-height:100vh;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;padding:24px;overflow-x:hidden}
      .logo{height:44px;width:auto;margin-bottom:28px}
      .code{font-size:84px;font-weight:900;color:#fde7d3;line-height:1;margin:0}
      h1{font-size:24px;font-weight:800;margin:8px 0 10px}
      p{color:var(--muted);font-size:15px;line-height:1.6;max-width:30rem;margin:0 auto 8px}
      .links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:28px 0 8px;max-width:34rem}
      .links a{text-decoration:none;font-size:14px;font-weight:600;color:var(--ink);background:#fff;
        border:1px solid #eee;border-radius:10px;padding:10px 14px}
      .links a:hover{border-color:#fcd9b6;color:var(--orange)}
      .cta{display:inline-block;margin-top:18px;text-decoration:none;background:var(--orange);color:#fff;
        font-weight:700;font-size:15px;border-radius:8px;padding:13px 26px}
      .cta:hover{background:#ea670c}
    </style>
  </head>`;

const LINKS = `<div class="links">
      <a href="/how-to-get-esa-letter">How to Get an ESA Letter</a>
      <a href="/esa-letter-cost">ESA Letter Cost</a>
      <a href="/how-to-get-psd-letter">PSD Letter</a>
      <a href="/housing-rights-esa">Housing Rights</a>
      <a href="/faqs">FAQs</a>
      <a href="/contact-us">Contact Support</a>
    </div>`;

export const NOT_FOUND_HTML = `${SHARED_HEAD("Page Not Found")}
  <body>
    <img class="logo" src="/assets/brand/pawtenant-logo-black-02.png" alt="PawTenant" width="400" height="160" />
    <p class="code">404</p>
    <h1>Page Not Found</h1>
    <p>This page doesn&rsquo;t exist or has moved. If you followed an old link, it may have been part of our previous website.</p>
    ${LINKS}
    <a class="cta" href="/">Back to Homepage</a>
  </body>
</html>`;

export const GONE_HTML = `${SHARED_HEAD("Page No Longer Available")}
  <body>
    <img class="logo" src="/assets/brand/pawtenant-logo-black-02.png" alt="PawTenant" width="400" height="160" />
    <p class="code">410</p>
    <h1>This Page Is No Longer Available</h1>
    <p>This page was part of our previous website and has been permanently retired. Explore our current ESA and PSD resources below.</p>
    ${LINKS}
    <a class="cta" href="/">Back to Homepage</a>
  </body>
</html>`;
