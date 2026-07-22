# SEO-PSD-ESA-CONDITION-CLUSTER — LIVE rollout (Phase B of ROLLOUT-001)

**Status:** LIVE deployed + verified.
**Date:** 2026-07-22
**Starting LIVE SHA:** `061c6e0` (Phase A breadcrumb). **Source commit (TEST, verified):** `624c972`.
**Phase B rollback target:** the Phase A breadcrumb-only deployment (`dpl_DMEL3Frod4kBWiufWRXGjueYUFqK`
/ `g70z4owlb`, served `061c6e0`). Pre-task rollback: `pawtenant-production-jkclrz8qs`.

## Parity audit (TEST `624c972` → current LIVE)
15 files. **5 new** ported verbatim (byte-identical to `624c972`): the 3 article pages,
`PsdTaskInfographic.tsx`, `check-psd-esa-condition-cluster.mjs`. **10 modified** ported as surgical
hunks (LIVE diverges — TEST files NOT copied):
| File | Action | LIVE divergence handled |
|---|---|---|
| `router/config.tsx` | add 3 lazy imports + 3 routes before `/blog/:slug` | anchored on Texas-cluster import/route (present in LIVE) |
| `config/seoConfig.ts` | add 3 CORE_PAGE_META entries | anchored on psychiatric-service-dog-housing-rights entry |
| `mocks/blogPostsVerification.ts` | append 3 index cards | **LIVE's last entry is Texas (not housing-rights)** — appended after it |
| `public/sitemap.xml` | add 3 `<url>` | **LIVE ordering differs** — anchored on the unique housing-rights `<loc>` only |
| `src/pages/sitemap/page.tsx` | add 3 HTML-sitemap links | anchored on "All Blog Articles" |
| `public/llms.txt` | add 3 bullets | anchored on the how-to-train-PSD bullet |
| `package.json` | wire cluster guard into build (after the Phase-A breadcrumb guard) + `check:/test:psd-esa-cluster` | **LIVE build chain differs** (has verify-attribution-hygiene; no sitemap-parity/refund-writer) — TEST package.json NOT copied |
| `blog-2026-hud-esa-guidelines/page.tsx` | reciprocal-link hunk | anchor present; applied identically |
| `blog-emotional-support-animal-travel-anxiety/page.tsx` | 2 reciprocal-link hunks | anchors present; applied identically |
| `generated/routeManifest.ts` | **regenerated** via `npm run gen:routes` (NOT copied) | +6 lines only (3 EXACT_PATHS + 3 BLOG_SLUGS), no drift |

All 3 hero/OG image assets already present in LIVE. Flat aliases NOT created (remain 404).

## Content / YMYL
Content is byte-identical to verified `624c972`. Freshness check: ADA (ada.gov), DOT
(transportation.gov), and the May 22, 2026 HUD/FHEO guidance were verified earlier the same day and
are unchanged; no new official source conflicts. Preserved corrections: task-training (not a letter)
creates ADA status; ADA two-questions; ESA ≠ public access; individualized professional assessment;
no qualification/approval guarantee; airlines may treat ESA as pet; PSD documentation ≠ service-dog
status; May-2026 HUD = FHEO enforcement posture (FHA statute intact, private litigation + state law
unaffected). No placeholder domain/author/reviewer; broken PNG not shipped.

## Schema / discovery
Each article: one `@graph` = BlogPosting + BreadcrumbList + FAQPage (matches visible FAQ); non-www
self-canonical; index/follow. Blog index (3 cards), XML sitemap (3), HTML sitemap (3), llms.txt (3).
Reciprocal links live on the 2 existing articles.

## Validation
- Cluster guard self-test: 30/30 negative controls. Breadcrumb guard self-test: 15/15. Both pass.
- Full `npm run build`: PASS — cluster guard "consistent and integrated"; breadcrumb guard PASS
  (29 source files now incl. the 3 new articles); provider-entity "BreadcrumbList once"; route-status
  OK (245 sitemap URLs, no manifest drift); all LIVE guards green.
- `tsc --noEmit`: 0 errors. ESLint (changed cluster files): 0 warnings. `git diff --check`: clean.
  Secrets/PII: clean. Changed set = exactly the 15 cluster files (no ESA Housing, no surprises).
- Built `out/` (3 articles): unique title, non-www self-canonical, index robots.

## Commits / deployment
- Code: `feat: publish PSD and ESA condition content cluster` — `12a9fdb`.
- Docs: `docs: record live PSD and ESA condition cluster rollout` (this commit).
- Deployment + served SHA recorded in the session final report; verified on `pawtenant.com`.

## Production verification (pawtenant.com)
3 routes: HTTP 200, non-www self-canonical, index/follow, one BlogPosting + one BreadcrumbList (with
`item` on every crumb) + FAQPage, no duplicate schema. Flat aliases → 404. Non-regression:
`/esa-letter-housing`, providers (breadcrumb still fixed), state canonicals/redirects, blog, both
existing articles — all healthy. IndexNow submitted for exactly the 3 new URLs.

## Safety
No migration, no Edge Function, no DB write, no customer side-effect. No change to
`/esa-letter-housing`, homepage, pricing, checkout, assessment, Stripe, provider assignment/earnings,
Google Ads, or canonical strategy. No ESA Housing Revision 3 work. TEST working tree not touched.
