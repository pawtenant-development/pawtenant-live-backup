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

## Production deploy
(filled after deploy — commit hash, Vercel deployment id/URL, READY status)

## Production verification
(filled after deploy — 7 new URLs + HUD edited URL: HTTP 200, canonical, FAQPage)

## GSC
(filled after deploy — sitemap resubmit + URL Inspection / Request Indexing per URL, or blocker)

## Exclusions confirmed
No Supabase/functions/migrations/cron; no ads/payments/checkout/providers/refunds/order/AI/GHL/
tracking changes; no frozen mega-file edits (AnalyticsTab/OrderDetailModal untouched); only the
exact reciprocal HUD edit from TEST. Unrelated LIVE dirty files preserved (untracked google-ads
docs + operating-rules doc).

## Next action
Commit → push → deploy Vercel prod → production browser verify → GSC indexing requests.
