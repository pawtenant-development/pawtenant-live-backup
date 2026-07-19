# AI-SEO-SOFT-404-ROUTE-STATUS-LIVE-ROLLOUT-001

**Date:** 2026-07-20
**Scope:** LIVE (`pawtenant-live-backup` → `pawtenant-production` / pawtenant.com)
**Status:** ✅ **LIVE COMPLETE — SOFT-404 AND ROUTE-STATUS BEHAVIOR VERIFIED**
**Owner approval:** Hamza reviewed the deployed TEST behavior and explicitly authorized this LIVE rollout of
`AI-SEO-SOFT-404-ROUTE-STATUS-001`.

## Plain-language verdict
pawtenant.com now returns a **real HTTP status** for bad URLs instead of the empty HTTP-200 SPA app shell: unknown
URLs → branded **404** (noindex), retired WordPress/WooCommerce paths → **410**, and every valid page (public,
private/app, dynamic, legacy redirect) behaves exactly as before. This is the surgical LIVE mirror of the verified
TEST middleware — a Vercel Edge Middleware that classifies each request and calls `next()` for valid routes so the
existing redirect/filesystem/`/app` pipeline serves them unchanged. Frontend/edge only. No checkout / Stripe /
Supabase / migration / edge-function / DB / customer change.

## Preflight
- TEST source (approved): code `037fb64`, docs/final `ee31147`; TEST deploy `dpl_93gHYRFWthhuM3CJih3KMSwZQMMe`
  (`pawtenant-test.vercel.app`), READY, served `037fb64` — no runtime errors in the recent window.
- LIVE starting SHA: `49293ea` (= origin/main, ahead/behind 0/0, clean tracked tree; 4 untracked orphan docs
  preserved: PAWTENANT_CLAUDE_OPERATING_RULES.md, 3 google-ads trackers).
- Rollback anchor (production deployment serving pawtenant.com pre-change): `dpl_3EQy5VeRDXvWNXACKoQPxjdbRtF2`
  (`pawtenant-production-p37xng3t8`, source `49293ea`), READY.
- Divergence check (TEST vs LIVE, §4.13): `config.tsx`, `seoConfig.ts`, `colleges.ts`, `blogPostsExtended.ts`,
  `blogPostsVerification.ts`, `vercel.json`, `sitemap.xml`, `404.html`, `package.json` all DIFFER between repos —
  so the manifest was **regenerated from LIVE's own registry**, and `package.json`/sitemap were edited surgically.
  LIVE's `vercel.json` catch-all rewrite `/((?!wp…).*) → /app` and 128 redirects are IDENTICAL to TEST (same
  soft-404 mechanism). LIVE has the same 8 dynamic collections + catch-all. Recent LIVE work confirmed present
  (machine-facts, package-card, state-pricing, attribution, order-package guards all still in the build and green).

## Mirrored architecture
Vercel Edge Middleware `middleware.ts` (`@vercel/edge@1.3.1`) runs first: retired-WP → 410, unknown → 404, valid →
`next()` (existing pipeline unchanged). Fail-open on www host / static file (extension) / any error. `vercel.json`
is UNCHANGED. Valid routes = generated `src/generated/routeManifest.ts` (from LIVE's `src/router/config.tsx` +
`src/mocks/*` via `scripts/generate-route-manifest.mjs`); `/doctors/:id`, `/verify/:letterId`, `/r/:stage` are
Supabase/tracking pass-through prefixes. Pure classifier `src/lib/routeStatus.ts` (+ branded noindex 404/410 bodies,
no homepage canonical / Service-WebPage schema) shared by middleware and guard.

## Files changed (LIVE)
NEW: `middleware.ts`, `src/lib/routeStatus.ts`, `src/generated/routeManifest.ts` (regenerated from LIVE),
`scripts/generate-route-manifest.mjs`, `scripts/check-route-status.mjs`.
MODIFIED: `package.json` (+`@vercel/edge@1.3.1`; `gen:routes`/`check:routes`; `check-route-status.mjs` inserted
after `check-machine-facts` in `build`; LIVE-only guards preserved), `package-lock.json`, `public/sitemap.xml`
(11 non-existent `/college-pet-policy/*` URLs → the 12 real `colleges.ts` pages).
NOT CHANGED: `public/404.html` (LIVE's existing branded 404 already passes the guard; the served 404 body comes from
the middleware). `vercel.json` unchanged.

## Route inventory summary
Generated LIVE manifest: 175 exact paths, 51 ESA states, 51 PSD states, 86 blog, 51 blog-state, 12 college.
- KEEP_INDEXABLE_200: public pages, ESA/PSD states, blogs, blog-state, colleges, states guides.
- KEEP_NOINDEX_200: assessment/psd-assessment(+thank-you), consultation, customer/account, admin-*, provider-*,
  company, go-live, reset-password, verify(+/:letterId), paid LPs, doctors, /r/:stage (robots.txt Disallow +
  per-page meta, unchanged).
- REDIRECT_308: all 128 existing `vercel.json` permanent redirects (unchanged).
- GONE_410: retired WP/Woo infra segments.
- NOT_FOUND_404: unknown paths + unknown dynamic slugs + removed college slugs.
- Deferred: legacy-content restoration review (`AI-SEO-LEGACY-CONTENT-RESTORATION-REVIEW-001`); state-URL
  canonical consolidation (`SEO-STATE-URL-CANONICAL-CONSOLIDATION-001`, incl. thin `/psd-letter/<state>` kept 200).

## Redirect table
Unchanged from LIVE `vercel.json` (128 entries). Guard-verified: all `permanent:true`, non-www target, one-hop,
valid target. Deployed on pawtenant.com: `/affordable-esa-letter`→`/esa-letter-cost`, `/esa-letter-florida`→
`/esa-letter/florida`, `/apply-now`→`/assessment` — all 308→200; `www.pawtenant.com`→`https://pawtenant.com` 308.

## 404 / 410 table
Unknown → 404, `text/html`, `x-robots-tag: noindex, follow`, "Page Not Found | PawTenant", branded links, homepage
CTA, no canonical, no Service/WebPage schema, no SPA boot. Retired-WP → 410, `text/html`, noindex, "Page No Longer
Available | PawTenant".

## Tests, guards, negative controls
- `scripts/check-route-status.mjs` (blocking, in LIVE `build`): manifest no-drift, 232 sitemap URLs reachable, 128
  redirects one-hop/non-www/permanent/valid-target, 404/410 branded+noindex+no canonical/Service schema. PASS.
- §16 negative controls: in-memory counterfactuals A–I + 1 live (removed a real slug from the committed manifest →
  guard failed on drift + sitemap-unreachable → `gen:routes` restored it byte-for-byte, sha256 `b4654b10…`
  identical → green). No repo files left mutated.

## Validation
- `gen:routes` deterministic (no drift). `check:routes` PASS. My new files ESLint-clean; **0 new** type errors
  (LIVE pre-existing baseline, unrelated: AIAssistantTrustCard JSX namespace, AnalyticsTab AcquisitionLabel,
  EmployeeHrDirectory, ProviderInternalRecords). `npm run build` **exit 0** — vite + prerender + machine-facts +
  route-status + attribution + pricing/package/state-pricing guards + order-package (52/0) all green.
  `check-machine-facts` green standalone (post-build). `git diff --check` clean. No secrets in task files.
- No Supabase migration. No Supabase Edge Function. No Stripe/DB/customer change. TEST untouched.

## Production raw-response matrix (https://pawtenant.com)
- Valid → 200: `/`, `/esa-letter-cost`, `/how-to-get-esa-letter`, `/how-to-get-psd-letter`, `/esa-letter/california`,
  `/psd-letter/california`, `/college-pet-policy/nyu`, `/assessment`, `/company`, `/doctors/robert-staaf`.
- Unknown → **404** (+`x-robots-tag: noindex, follow`): `/qa-live-final-check-xyz`, `/random/deep/…`,
  `/esa-letter/atlantis`, `/college-pet-policy/mit` (removed), `/blog/not-a-real-post-live`.
- Retired WP → **410** (+noindex): `/feed/`, `/author/user/`, `/category/esa`, `/2021/05/old-post`.
- Redirect → 308→200 one-hop: `/affordable-esa-letter`, `/esa-letter-florida`, `/apply-now`; `www`→non-www 308.
- Static → 200: `/robots.txt`, `/sitemap.xml`, `/llms.txt`.
Valid `/esa-letter-cost` keeps non-www canonical + `robots: index,follow`.

## Browser / mobile
Branded 404 renders as a static page (no React root, no SPA/homepage boot), 0 console errors, no 375px overflow,
noindex. Valid `/esa-letter-cost` boots the SPA and renders full content. Did NOT submit assessment / create account
/ order / PaymentIntent / payment / email / SMS / provider assignment / document upload.

## Vercel observability
Deployment READY, no errors. The correct 404/410/200 responses (no 5xx, no fail-open-200 on unknowns) confirm the
Edge Middleware runs without exception.

## Commit / deploy / rollback
- LIVE code commit: `050e7da` (base `49293ea`) — pushed `origin/main`.
- LIVE docs commit: separate (`docs: record soft-404 route-status LIVE rollout`).
- Explicit deploy: `dpl_2LDwFS7sLhQL9Cb8irRNkcTLYLw3` (`pawtenant-production-ehn4xqga1`) READY, target production,
  **serving pawtenant.com** (confirmed via `vercel inspect pawtenant.com`), served SHA `050e7da`.
- Rollback: promote `dpl_3EQy5VeRDXvWNXACKoQPxjdbRtF2` (`pawtenant-production-p37xng3t8`, `49293ea`).

## Safety confirmation
No payment, no order, no database write, no customer communication, no indexing request, no GSC change, no Stripe
change, **no TEST change**, no unrelated LIVE change. Frozen mega-files (`OrderDetailModal.tsx`, `AnalyticsTab.tsx`)
untouched.

## Remaining work
Legacy-content restoration review (`AI-SEO-LEGACY-CONTENT-RESTORATION-REVIEW-001`); state-URL canonical
consolidation (`SEO-STATE-URL-CANONICAL-CONSOLIDATION-001`); full-body prerender spike
(`AI-SEO-FULL-BODY-PRERENDER-SPIKE-001`). GSC read-only re-measure 2026-08-02 / 2026-08-16.
