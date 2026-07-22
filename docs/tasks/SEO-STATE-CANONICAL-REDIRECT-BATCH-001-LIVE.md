# SEO-STATE-CANONICAL-REDIRECT-BATCH-001 — LIVE rollout

**Status:** ✅ LIVE COMPLETE — state canonicals and PSD legacy redirects verified on `https://pawtenant.com`.

**Scope:** routing + canonicalization only. Surgical mirror of the TEST-verified
implementation. No state-page body copy, design, pricing, checkout, assessment,
DB, migration, edge-function, provider/refund/RA, Google Ads, or
`/esa-letter-housing` change. `/blog/state/*` deliberately NOT added to the XML
sitemap (indexation = future content task).

---

## Provenance
- **TEST source:** code `d9995e9` / docs `956dc45` (task SEO-STATE-CANONICAL-REDIRECT-BATCH-001).
- **LIVE starting SHA:** `c4ccf48` (clean, ahead/behind 0/0, no concurrent writer).
- **LIVE code commit:** `79df96e` — *fix: align state canonicals and PSD legacy redirects*.
- **LIVE docs commit:** this commit — *docs: record live state canonical and redirect rollout*.

## Two root causes (identical to TEST; both = pre-hydration raw HTML only)
1. **`/blog/state/<state>` (51)** were valid but **fileless** → crawlers received
   `out/app.html`, whose canonical is the homepage (`https://pawtenant.com/`).
   Runtime `SEOManager` self-canonicalized only after hydration.
2. **flat `/psd-letter-<state>` (10)** were in `EXACT_PATHS` → middleware `valid`
   → SPA shell (homepage canonical) + client `<Navigate>`. Flat ESA had server
   308s; flat PSD had none.

## LIVE parity findings (read-only audit before porting)
| Surface | LIVE vs TEST | Action |
|---|---|---|
| `stateBlogMap.ts` | **byte-identical data** (51 states, same slugs/descriptors) | add `buildStateBlogSEO` (identical) |
| `src/generated/routeManifest.ts` | differs only by TEST-only `/psd-consultation` | none (regenerated → no drift) |
| `generate-route-manifest.mjs`, `routeStatus.ts`, `middleware.ts`, HTML sitemap | **identical** | none |
| `vercel.json` | flat-ESA present, **0 flat-PSD**, has LIVE-only assets `headers` block | add 20 flat-PSD 308s; **preserve headers block** |
| `prerender-seo.mjs` | identical import block + `writeRoute` sig; **NO meta-LP section** | add jiti import; insert `/blog/state` loop **between section 4 and section 5** (not after 4b) |
| `blog-state/page.tsx` | LIVE has plain H1, **no `HeroPriceLine`/`pt-hero-display`** (TEST-only design) | port **SEO meta only** |
| `package.json` | LIVE chain (`verify-attribution-hygiene`, no `check-sitemap-parity`) | insert guard after `check-route-status`; add 2 scripts; **preserve LIVE chain** |
| `check-state-canonical-redirects.mjs` | missing | add (repo-agnostic, byte-identical) |
| `seoConfig.ts` | content divergence; `BASE_URL=https://pawtenant.com` ✓ | none |

No newer LIVE implementation already fixed this (0 flat-PSD redirects, no `/blog/state` prerender pre-change).

## Files changed (6)
| File | Change |
|---|---|
| `vercel.json` | +20: 10 flat-PSD 308 redirects (× trailing-slash); `headers` block preserved |
| `scripts/prerender-seo.mjs` | +jiti `stateBlogMap` import + `/blog/state/<slug>` loop (section 4b, LIVE position) |
| `src/mocks/stateBlogMap.ts` | +`buildStateBlogSEO()` (single source of truth) |
| `src/pages/blog-state/page.tsx` | SEO title/description via `buildStateBlogSEO()` (meta only; LIVE H1/layout preserved) |
| `scripts/check-state-canonical-redirects.mjs` | new guard + `--self-test` |
| `package.json` | guard wired after `check-route-status`; `check:state-canonical` / `test:state-canonical` scripts |

`routeManifest.ts` byte-identical after `gen:routes` — no drift. No DB / migration / Supabase function.

## Validation
- `test:state-canonical` self-test → **PASS** (8/8 negative controls fire; baseline clean).
- `gen:routes` → EXACT_PATHS=177, BLOG_STATE_SLUGS=51 — **no routeManifest drift**.
- `check-route-status` → OK (242 sitemap URLs, 152 redirects, 177 exact paths).
- `npm run build` → **PASS** end-to-end. `prerender-seo` wrote 303 files (0 errors, incl. 51 `/blog/state`); full-body 18/18; new guard **153/153** state self-canonicals; machine-facts, refund, provider-entity, attribution-hygiene, RA-earnings, order-package all green.
- type-check: changed files clean. Pre-existing UNRELATED errors remain in
  `AIAssistantTrustCard.tsx`, `AnalyticsTab.tsx` (frozen — untouched),
  `EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`. SWC build unaffected.
- ESLint changed files → clean. `git diff --check` clean. No secrets/PII in diff.

## Local generated-HTML verification
`out/blog/state/{california,wyoming,washington-dc}/index.html` → one self-canonical
(`https://pawtenant.com/blog/state/<slug>`), correct title, `robots=index,follow…`,
empty `#root`. `out/app.html` canonical still `https://pawtenant.com/` (unchanged).

## Deployment
- **Production deployment ID:** `pawtenant-production-8tiqstbgf` (Ready, 46s build — Vercel ran the new guard).
- **Served commit:** `79df96e` (confirmed live: `/blog/state/*` self-canonicalize, exists only in the new build).
- **Production alias:** `https://pawtenant.com`.
- **Previous Ready / rollback deployment:** `pawtenant-production-mo4p1cj73`.

## Production verification (https://pawtenant.com)
**Redirects (issue 2):** `/psd-letter-{california,texas,new-york,ohio,…}` → **308**,
`location=/psd-letter/<state>`, **1 hop**, final **200**, target self-canonical.
Flat ESA `/esa-letter-<state>` → 308 (unchanged).

**Canonicals (issue 1):** `/blog/state/{california,wyoming,washington-dc}` → **200**,
raw HTML canonical = self, non-www, exactly one tag. Hydrated DOM canonical matches
raw (no drift). Homepage → homepage canonical; `/esa-letter/california` → self.

**Structured data:** blog/state raw HTML — 1 canonical, **no homepage WebPage leak,
no $129 leak**; `CollectionPage`/`BreadcrumbList` injected at runtime with the self
URL (documented head-only prerender + runtime-body distinction).

**Invalid:** `/psd-letter/notastate`, `/blog/state/notastate`, `/esa-letter/notastate`,
unknown → **404**, no homepage redirect.

**Non-regression (all 200):** `/`, `/esa-letter-housing` (unchanged), `/esa-letter/california`,
`/psd-letter/california`, `/refund-policy`, `/our-providers`, `/doctors/robert-staaf`,
`/how-to-get-psd-letter`, `/psychiatric-service-dog-letter-online`, `/assessment`,
`/psd-assessment`, `/sitemap`.

**Browser (desktop + 375px mobile):** page renders (navbar, breadcrumb, H1, article
cards, CTAs); 1 self-canonical both viewports; `docScrollW=375` (no horizontal
overflow); no first-party console errors.

## Rollback
Not triggered — all 16 rollback conditions evaluated clean. Rollback target if needed:
`pawtenant-production-mo4p1cj73`.

## Remaining deferred work (NOT started)
POPULAR-STATES-IMPLEMENTATION-001 · SEO-PSD-STATE-CONTENT-QUALITY-001 ·
SEO-STATE-CONTENT-UPGRADE-BATCH-001 · AI-SEO-FULL-BODY-PRERENDER-SELECTED-TEMPLATES-001.
Open follow-ups: `/blog/state/*` sitemap indexation; 34/51 thin PSD nested pages.

## Safety confirmation
No DB write, no migration, no Supabase function, no Stripe/email/SMS/chat, no order or
customer side effect. No Google Ads change. `/esa-letter-housing` untouched. Frozen
mega-files (`OrderDetailModal.tsx`, `AnalyticsTab.tsx`) untouched. Unrelated untracked
docs preserved. LIVE-only work (assets `headers` block, `verify-attribution-hygiene`,
blog-state H1 styling) preserved.
