# AI-SEO-MACHINE-FACTS-SCHEMA-HYGIENE-LIVE-ROLLOUT-001

**Status:** ✅ **LIVE COMPLETE — AI SEO MACHINE FACTS AND SCHEMA HYGIENE VERIFIED.**
No migration. No edge function. No TEST change. No payment / DB write / customer comms.

Owner-authorized LIVE mirror of the approved TEST task
`AI-SEO-MACHINE-FACTS-SCHEMA-HYGIENE-001`. Applied **surgically** onto LIVE's
divergent SEO files (LIVE had drifted from TEST's pre-fix baseline), not a blind copy.

## Owner authorization

Hamza authorized the LIVE mirror of the completed + verified TEST task.

## SHAs

| | |
|---|---|
| **TEST source** | code `7c5fb5b` + docs `da69f84` (TEST final `f394135`). |
| **LIVE start** | `48466bb`. |
| **LIVE code commit** | `5dd3060` — `fix: align AI-facing facts and page schema` (7 files). |
| **LIVE docs commit** | this record. |

## Deployment (LIVE)

| | |
|---|---|
| **Deploy ID** | `dpl_7YWEYEHHRAKfozL4svdRrknJfMLQ` (READY, production) — explicit `vercel deploy --prod`. |
| **Deploy hostname** | `pawtenant-production-ggce5keql-pawtenant-3686s-projects.vercel.app`. |
| **Alias** | `https://pawtenant.com` (canonical non-www; served source `5dd3060`). |
| **Git auto-deploy** | `pawtenant-production-blry3ondm` also built from `5dd3060` (push-triggered). |
| **Rollback target** | prior Ready prod `pawtenant-production-i29d8w1f4` (pre-AI-SEO, `48466bb`). |

## Files changed (exactly 7)

1. `public/llms.txt` — pricing facts (surgical; LIVE's richer directory preserved).
2. `index.html` — static `<head>` meta/OG/Twitter + JSON-LD hygiene.
3. `scripts/prerender-seo.mjs` — new `stripHomepageOnlySchema()`.
4. `scripts/check-machine-facts.mjs` — NEW blocking guard (byte-identical to TEST).
5. `src/pages/esa-letter-cost/page.tsx` — remove hardcoded `<title>`.
6. `src/pages/state-esa/page.tsx` — fix broken sentence.
7. `package.json` — wire the guard into `npm run build` (after prerender) + a
   `check:machine-facts` script. LIVE's other build steps untouched.

### Divergence handled (why this was surgical, not a copy)

LIVE differed from TEST's pre-fix baseline: `llms.txt` +36 lines (LIVE has a far
larger page directory), `index.html` +18 lines, `prerender-seo.mjs` **+192 lines**,
`state-esa` +6. `esa-letter-cost` was identical. Key adaptation: LIVE's `writeRoute`
has a `routePath === "/"` branch (TEST's does not), so the schema strip is guarded on
`routePath !== "/"` — the homepage (written by `writeHomeRoute`) is never stripped.
Only the AI-SEO delta was applied; every LIVE-only difference was preserved.

## llms.txt before → after

**Before:** `Pricing: ESA letter $99/year (annual subscription) or $110 one-time`
(no approved tiers; no qualification / delivery / canonical lines).

**After:** three approved pricing lines — 1 animal `$129` one-time / `$115` first
year / `$100` renewal; 2–3 animals `$149` / `$135` / `$115`; combo `$179` / `$159`
(flat renewal) — plus qualification (provider-evaluated, not guaranteed), conditional
24h delivery, and `Canonical site: https://pawtenant.com (non-www)`. Zero stale prices.

## Schema architecture before → after

**Before:** the built `index.html` `<head>` carried Organization + WebSite + a
homepage WebPage (`#1 Legitimate ESA Letter Service`) + a homepage Service ($129
Offer), and the prerender copied all four verbatim onto **every** route — so inner
pages (PSD / blog / legal / verification) advertised the homepage identity + a $129
ESA offer, and `#1 Legitimate` / `same-day delivery` appeared site-wide.

**After:** Organization + WebSite stay global. The homepage retains its own
**corrected** WebPage + Service + accurate $129 Offer. `stripHomepageOnlySchema()`
removes the WebPage + Service JSON-LD from every inner-route generated file and
`out/app.html`. `#1 Legitimate` and `same-day delivery` removed from all static head
copy (conditional 24h + "refund if you don't qualify" wording instead).

## Route verification (production pawtenant.com)

### A. Raw network HTML (curl) — all HTTP 200

| Route | WebPage | Service | $129 | #1 Legit | same-day | stale | Org | WebSite |
|---|---|---|---|---|---|---|---|---|
| `/` | 1 | 1 | 1 | 0 | 0 | 0 | ✓ | ✓ |
| `/esa-letter-cost` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |
| `/faqs` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |
| `/no-risk-guarantee` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |
| `/esa-letter/california` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |
| `/psd-letter/california` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |
| `/blog/what-is-an-esa-letter` | 0 | 0 | 0 | 0 | 0 | 0 | ✓ | ✓ |

Homepage title clean; `/esa-letter-cost` raw title = the seoConfig title (no
"Legitimate & Fast"); `/psd-letter/california` keeps its PSD identity.

### B. Rendered browser DOM

- **Homepage**: title `ESA Letter Online | Licensed Provider Evaluation | PawTenant`
  (clean); H1 renders; schema = Org + WebSite + **1** WebPage + **1** Service +
  runtime FAQPage (no duplicate WebPage/Service); no `#1`/`same-day` in head.
- **`/esa-letter-cost`**: rendered title == raw title (no drift, no "Legitimate &
  Fast"); schema = Org + WebSite + FAQPage; no homepage WebPage/Service.
- **`/esa-letter/california`**: renders "knows the laws in every state"; no
  `knows state and has years`; no `{state}` placeholder; no inherited Service/$129;
  schema = Org + WebSite + FAQPage + BreadcrumbList.
- **`/faqs`**: FAQ content renders; FAQPage runtime schema present; no homepage
  WebPage/Service.
- **Console**: 0 errors on the routes checked.

### Mobile 375px (the two visibly-changed pages)

- `/esa-letter-cost` — docScrollWidth 375, no horizontal overflow, title + H1 + body render.
- `/esa-letter/california` — docScrollWidth 375, no overflow, H1 + corrected sentence render.

## Build + guard evidence

`npm run build` exit 0: vite build, prerender wrote 242 files, **check-machine-facts
PASSED** (homepage retains Org+WebSite+WebPage+Service; all 7 inner routes +
`out/app.html` = Organization + WebSite only), verify-attribution-hygiene 29/0,
check-pricing-parity OK, check-pricing-guards OK, check-package-card-offer OK
(prior LIVE rollout intact), order-package 52/0. type-check 8 pre-existing errors
(unrelated files), **0 in changed files** (delta 0). ESLint 0 warnings on the two
`.tsx`. `git diff --check` clean. No secrets/logs.

## Negative control

Appended `ESA letter $99/year` to `public/llms.txt` → `check-machine-facts.mjs`
reported `✗ llms.txt contains stale price "$99/year"` and `FAILED — 1 violation(s)`
(exit 1). Restored from backup; `sha256` matches pre-control byte-for-byte
(`53accaa5…`).

## Safety

No migration. No edge function. No TEST change. No payment, no database write, no
customer communication. No routing / robots / redirect / domain / sitemap change. No
full-body prerender, no SSR, no soft-404/410 handling. Only the 7 approved AI-SEO
files changed; orphan documents preserved.

## Remaining work (deferred, separate tasks)

- Soft-404 → real 404/410 handling.
- Full-body prerender spike (raw HTML body content for crawlers).
