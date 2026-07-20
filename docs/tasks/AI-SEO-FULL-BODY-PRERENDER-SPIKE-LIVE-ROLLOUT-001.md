# AI-SEO-FULL-BODY-PRERENDER-SPIKE-LIVE-ROLLOUT-001

**Status:** ✅ **LIVE COMPLETE — FULL-BODY PRERENDER SPIKE VERIFIED (pawtenant.com).**
Owner (Hamza) reviewed and approved the deployed TEST spike and explicitly authorized this surgical LIVE
rollout of the proven spike routes only. TEST unchanged.

## Objective

Mirror the approved TEST real-component prerender architecture to LIVE for the **same 10 priority routes** so
meaningful route-specific body content is present in raw HTML on **pawtenant.com** before JavaScript executes.
Surgical mirror only — no sitewide expansion, no framework migration, no funnel/checkout/pricing/admin change.

## Approved TEST source

- TEST code: `d5b80ff` · TEST final/docs: `8f263ed`
- TEST deployment: `dpl_DviMsd2jJViyP8jSWe374a65fowQ` · alias `https://pawtenant-test.vercel.app`
- Architecture: `src/prerender/entry.tsx`, `scripts/prerender-full-body-spike.mjs`,
  `scripts/check-full-body-prerender.mjs`, build-chain integration in `package.json`.

## Preflight (read-only)

- **LIVE base:** `b63db5e` (matched expected; on `main`, origin==HEAD, 0/0). Clean except 4 untracked orphan
  docs (preserved). Recent LIVE work confirmed present + green after build: soft-404/410 middleware (`050e7da`),
  machine-facts/schema hygiene, state pricing parity + payment logos, package-card presentation, RA order
  chips/filters, Stripe-webhook hardening.
- **TEST:** `8f263ed` — kept **read-only** (not modified).
- **Architecture parity confirmed (verified, not assumed):** LIVE `main.tsx` (createRoot) and `vite.config.ts`
  are **byte-identical** to TEST; same stack (React 19.1 / react-dom 19.1 / react-router-dom 7.14.1 with
  `StaticRouter` / Vite 7 / jiti / react-swc / unplugin-auto-import). LIVE router maps all 10 routes to the
  same page components; all 7 page component files exist. LIVE `index.html` has an empty `<div id="root">`;
  LIVE `prerender-seo.mjs` leaves inner-route `#root` empty + strips homepage schema + keeps its hero (shorter
  than TEST — no `/meta-esa-letter` case, otherwise equivalent). `check-machine-facts.mjs` is byte-identical.
  `src/lib/supabaseClient.ts` has the same module-scope `createClient(import.meta.env.VITE_PUBLIC_SUPABASE_*)`
  (placeholder-env mechanism applies).

## LIVE-specific adaptation

- The 3 spike files were copied **byte-identical** from TEST (component import paths + architecture match).
- The guard's route expectations (titles, H1s, phrases, canonicals) were **verified against LIVE's own
  rendered output** — they matched exactly (TEST↔LIVE content parity on these 10 pages), so **no adaptation
  was needed**. The guard passed on LIVE's genuine content.
- `package.json` build chain: inserted `prerender-full-body-spike` + `check-full-body-prerender` after
  `prerender-seo`, before `check-machine-facts` (LIVE's chain differs slightly — has
  `verify-attribution-hygiene`, lacks `check-sitemap-parity`/`check-refund-writer-parity` — insertion point is
  the same relative position). Added `prerender:full-body` + `check:full-body` aliases.

## Files changed (code commit `4580479`, 4 files, +624/-1)

- `src/prerender/entry.tsx` *(new)* — byte-identical to TEST
- `scripts/prerender-full-body-spike.mjs` *(new)* — byte-identical to TEST
- `scripts/check-full-body-prerender.mjs` *(new)* — byte-identical to TEST
- `package.json` — build chain + 2 aliases

Staged **only** these 4 (`git add` explicit paths); 4 orphan docs preserved. `out/` gitignored;
`auto-imports.d.ts` unchanged.

## Raw-HTML before → after (deployed pawtenant.com, no JS)

| Route | Before body | After body chars | Internal links | H1 in raw HTML |
|---|---:|---:|---:|---|
| `/` (hero, unchanged) | hero | 19,757 | 1 | Get an ESA Letter Online… |
| `/how-to-get-esa-letter` | 0 (empty root) | 28,662 | 63 | How to Get an ESA Letter Online |
| `/esa-letter-cost` | 0 | 25,610 | 67 | Affordable ESA Letter with Money Back Guarantee |
| `/how-to-get-psd-letter` | 0 | 26,443 | 57 | How to Get a Psychiatric Service Dog Letter |
| `/esa-letter/california` | 0 | 25,756 | 64 | Get an ESA Letter in California |
| `/esa-letter/washington` | 0 | 24,751 | 62 | Get an ESA Letter in Washington |
| `/esa-letter/new-york` | 0 | 25,624 | 69 | Get an ESA Letter in New York |
| `/esa-letter-for-apartments` | 0 | 27,160 | 65 | ESA Letter for Apartments |
| `/blog/esa-letter-requirements` | 0 | 38,652 | 64 | ESA Letter Requirements: … 2026 |
| `/explore-esa-letters-all-states` | 0 | 20,012 | 97 | Explore ESA Letter In Your State |

All: HTTP **200**, non-www `https://pawtenant.com/<route>` canonical, `robots: index`.

## Schema / canonical

Homepage raw HTML: **4 JSON-LD** (Organization + WebSite + homepage WebPage + homepage Service). Inner routes
raw HTML: **2 JSON-LD** (global Organization + WebSite only) — no homepage WebPage/Service/$129 leakage, no
`#root` JSON-LD. After client mount the page's own schema appears **once** (verified `/esa-letter/california`:
DOM = Organization + WebSite + `@graph[FAQPage, BreadcrumbList]` = 3, no duplication). `check-machine-facts`
**green** on LIVE.

## Client-mount behavior (createRoot preserved — no hydration API)

Verified on pawtenant.com (`/esa-letter-cost` + `/esa-letter/california`): **1 `<h1>`, 1 `<nav>`, 1 `<main>`**
(no duplicate page); desktop 1280 no horizontal overflow (scrollW=clientW=1265); mobile 375 no overflow
(375=375); client mounts the full app (cookie banner + runtime schema present); **runtime schema injected once**
(2→3); mobile hamburger menu opens on a real click (interactions live); state CTA
`/assessment?state=CA&ref=state-page`; geo-block bypassed for crawler-class UA (content renders, not the
GeoBlockScreen); **0 console errors**. The client bundle is unchanged (entry.tsx is build-only, not imported by
`main.tsx`). (Browser-pane note: screenshots and 0-width auto-viewport were unreliable in-session; all checks
above used direct DOM queries + explicit viewport sizing + one real `computer` click. The deployed LIVE code is
byte-identical to the TEST build that was fully browser-verified, incl. mobile-menu interaction.)

## Guard + negative controls

`check-full-body-prerender.mjs` (blocking, in `npm run build`) passed on LIVE with route-specific assertions.
§14 negative controls **A–J all proven** on LIVE — each mutation made the guard exit non-zero; each file
restored **byte-for-byte** (sha256 match); guard green again after all restores; none committed.

## Validation

- Full `npm run build` exit **0**, deterministic: `vite build` → `prerender-seo` 242 files →
  `prerender-full-body` 9/9 → `check-full-body` PASS → `check-machine-facts` PASS → `check-route-status` OK
  (232 sitemap URLs, 128 redirects, 175 exact paths) → attribution/hygiene/refund-consumer/pricing/package-card
  /state-pricing guards green → order-package **52/0**.
- Type-check: **8 pre-existing errors** (LIVE baseline, unrelated); **0** from this task (`entry.tsx` clean).
- ESLint: `src/prerender/entry.tsx` **clean**. `git diff --check` + secret scan clean.

## Route-status regression (pawtenant.com)

`/qa-prerender-live-unknown` → **404**; `/feed/`, `/category/anything` → **410**;
`/college-pet-policy/not-a-real-college` → **404** (all `x-robots-tag: noindex, follow`); `/admin-orders` +
`/company` (private) → **200**; `/esa-letter/california` (valid) → **200**; `www.pawtenant.com/esa-letter-cost`
→ **308** one-hop → `https://pawtenant.com/esa-letter-cost`. Middleware unchanged.

## SHAs / deployment

- **TEST:** code `d5b80ff` / final `8f263ed` — unchanged. TEST deploy `dpl_DviMsd2jJViyP8jSWe374a65fowQ`.
- **LIVE base:** `b63db5e`. **LIVE code:** `4580479`. **LIVE docs:** this commit.
- **Deployment (explicit `vercel --prod`):** `dpl_CHegSPtMzzeVQM4jUBnsCTnAzGT3` —
  `pawtenant-production-7bbco5xws`, READY, production, aliased **pawtenant.com** (superseded the push-triggered
  auto-deploy). Build ~45s. **Rollback:** prior Ready `pawtenant-production-f4bfc27oz` (b63db5e).

## Safety confirmation

No migration. No Supabase Edge Function. No database write. No Stripe / payment / order / PaymentIntent / OTP /
customer comms. No ad-conversion. No middleware/404/410 change. No checkout / pricing / assessment / customer
portal / admin / Ads-tracking change. Frozen mega-files untouched. Placeholder Supabase env is build-time
module-init only (no Supabase call during prerender). TEST repository not modified. No assessment submitted, no
order/PaymentIntent created, no OTP sent during QA.

## Remaining work (separate tasks)

- Selected-template expansion of full-body prerender (state + informational/blog).
- Pet-rent savings calculator upgrade.
- State-URL canonical consolidation.
