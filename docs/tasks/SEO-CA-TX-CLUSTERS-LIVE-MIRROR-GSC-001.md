# Task: SEO-CA-TX-CLUSTERS-LIVE-MIRROR-GSC-001 — LIVE mirror of CA + TX SEO clusters + GSC

**Owner:** Claude session (2026-07-08) — **owner-approved LIVE mirror** for this named task.
**Repo:** LIVE (`pawtenant-live-backup`).
**Started from LIVE commit:** `794d71d`
**Source (TEST):** CA cluster feat `addf0d6`; TX cluster feat `57f497b`.

## Goal
Mirror the two already-verified TEST SEO clusters (California + Texas ESA/PSD) to
LIVE, deploy to pawtenant.com, then request indexing in Google Search Console.

## Pages mirrored (7 new routes)
CA cluster:
- /states/california-esa-psd-guide
- /states/los-angeles-esa-landlord-guide
- /states/san-francisco-hoa-psd-guide
- /states/san-diego-telehealth-guide
- /blog/how-to-train-psychiatric-service-dog-tasks
TX cluster:
- /states/texas-esa-psd-guide
- /blog/texas-service-animal-laws-penalties

## How the mirror was done (surgical, not blind copy)
- 7 new page components copied verbatim from TEST (self-contained; they already
  contain the CA→Texas and PSD→Texas reciprocal links). LIVE had all required
  infra (SharedNavbar/Footer, useAttributionParams, assets) — verified present.
- Wiring ported surgically into the LIVE versions (which diverge from TEST):
  - `src/router/config.tsx`: 7 lazy imports + 7 routes (blog routes above `/blog/:slug`).
  - `src/config/seoConfig.ts`: 7 `CORE_PAGE_META` entries (drive prerender + canonical).
  - `public/sitemap.xml`: 7 `<url>` entries.
  - `public/llms.txt`: Texas + California cluster subsections + PSD-training entry.
  - `src/mocks/blogPostsVerification.ts`: 2 listing cards (PSD-training + Texas penalties)
    appended to the LIVE array (LIVE mock diverges — fewer cards than TEST).
- Reciprocal edit to the one pre-existing page: `src/pages/blog-2026-hud-esa-guidelines/page.tsx`
  → added the Texas-guide link (LIVE HUD page was byte-identical to TEST at the anchor).

## Compliance (unchanged from TEST, re-verified)
No "legitimate" in any heading/meta/FAQ question. PSD supports housing AND travel;
a letter never creates service-dog status. No guaranteed-approval / registry /
certification / vest / ID claims.

## Verification (LIVE repo, 2026-07-08)
- `type-check`: 0 errors in task files. Pre-existing unrelated errors remain and were
  NOT touched: `AIAssistantTrustCard.tsx` (JSX namespace), `AnalyticsTab.tsx` (frozen —
  AcquisitionLabel record), `EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`.
- `npm run build`: PASS. `[prerender-seo] wrote 242 files (0 errors)`;
  `[check-attribution-parity] OK`. (LIVE has no sitemap-parity script — sitemap verified
  manually: all 7 URLs present.)
- All 7 URLs present in router + seoConfig + sitemap + llms (grep-confirmed 1 each).
- Broken-link check: every internal `to=` target in the 7 pages resolves to a LIVE route
  (incl. dynamic `/esa-letter/:state`, `/psd-letter/:state`). No broken links.
- Local preview (vite preview :4174): TX + CA guides load, correct title/H1/canonical
  (non-www), FAQPage JSON-LD present, CA guide shows Texas + 3 regional links, no console
  errors, no "legitimate" in headings.

## Production deploy — ✅ LIVE
- LIVE commit `2fe42a3` pushed to `pawtenant-development/pawtenant-live-backup` main
  (`794d71d..2fe42a3`, in sync `0 0`).
- Deploy flow = **git-connected Vercel auto-deploy on main**. The production Vercel
  project serving pawtenant.com is under a Vercel account NOT visible to this session's
  Vercel MCP connection (the only visible project was `zeek-engines`, a Next.js app on
  *.vercel.app — not pawtenant.com), so I could NOT read the Vercel dashboard/deployment
  id. Deployment READY was instead confirmed directly from production (below): all new
  routes serve their correct prerendered `<title>`/canonical, which only happens after a
  successful build+deploy of this commit.
- Aliases: `https://pawtenant.com` serves (200); `https://www.pawtenant.com/...` → **308**
  → non-www (verified on a new page). Canonical is non-www on every page.

## Production verification (2026-07-08) — all 8 URLs ✅
curl (HTTP + head) + real-browser DOM (Chrome) checks:
- All 7 new URLs + the edited HUD URL: **HTTP 200**, correct `<title>`, **non-www
  canonical** (`www=0`), meta description present, `<meta robots>` = `index, follow`
  (identical to existing indexed pages; the lone "noindex" substring is a benign
  site-wide Meta-Pixel noscript comment, present on the homepage too).
- Browser DOM (JS-rendered) confirmed FAQPage JSON-LD renders + matches the visible FAQ:
  Texas guide 6==6, Texas penalties 4==4, CA guide + HUD FAQPage intact. No "legitimate"
  in any heading/FAQ. No console errors. No mobile/desktop overflow.
- Reciprocal links live: CA guide → 3 regionals + PSD-training + HUD + Texas; Texas guide
  → penalties + PSD-training + HUD; penalties → Texas main + PSD-training; HUD → Texas
  guide ("Texas ESA & PSD guide"). No broken links.

## GSC — property `sc-domain:pawtenant.com` (Domain property), account **info@pawtenant.com** (authuser=1)
- Note: the browser's default Google account (hamzaengr94@gmail.com) does NOT have access
  to the property ("Oops, you don't have access"); the property is owned by
  info@pawtenant.com, reached via `authuser=1`. Access confirmed.
- **Sitemap:** `https://pawtenant.com/sitemap.xml` re-submitted; Status **Success** (225
  pages last read Jul 7; the live sitemap now contains all 7 new URLs — deployed).
- **URL Inspection → Request Indexing** (each ran the live test → "Indexing requested,
  URL added to a priority crawl queue"; NO quota hit on any):
  1. /states/california-esa-psd-guide — was "URL is not on Google" → **Indexing requested** ✅
  2. /states/los-angeles-esa-landlord-guide → **Indexing requested** ✅
  3. /states/san-francisco-hoa-psd-guide → **Indexing requested** ✅
  4. /states/san-diego-telehealth-guide → **Indexing requested** ✅
  5. /blog/how-to-train-psychiatric-service-dog-tasks → **Indexing requested** ✅
  6. /states/texas-esa-psd-guide → **Indexing requested** ✅
  7. /blog/texas-service-animal-laws-penalties → **Indexing requested** ✅
  8. /blog/2026-hud-esa-guidelines (edited) — was "URL is on Google" → **recrawl requested** ✅
- Indexing is requested, NOT guaranteed — Google decides if/when to index. New pages
  showed "Discovery: No referring sitemaps detected" at inspection time because Google
  hadn't re-read the sitemap since today's deploy; the sitemap resubmit + per-URL requests
  address this.

## Exclusions confirmed
No Supabase/functions/migrations/cron; no ads/payments/checkout/providers/refunds/order/AI/GHL/
tracking changes; no frozen mega-file edits (AnalyticsTab/OrderDetailModal untouched); only the
exact reciprocal HUD edit from TEST. Unrelated LIVE dirty files preserved (untracked google-ads
docs + operating-rules doc).

## Status: ✅ COMPLETED — mirrored, deployed, verified, indexing requested for all 8 URLs.

## Next action (updated)
Commit → push → deploy Vercel prod → production browser verify → GSC indexing requests.
